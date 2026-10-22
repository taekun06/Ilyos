/* Mesure de fluidité et de chauffe sur une VRAIE machine (vraie carte
   graphique), pour comprendre pourquoi le jeu chauffe ou ralentit parfois.

     node scripts/mesure-pc.js [url] [secondes par phase]

   url : par défaut la production (https://batbat.netlify.app/).
   Ouvre Chrome installé (sinon Edge, sinon Chromium de Playwright) dans une
   vraie fenêtre, puis enchaîne quatre phases :
     1. menu au repos ;
     2. partie solo contre le CPU, souris qui survole le plateau ;
     3. même partie, plateau immobile, aucune entrée ;
     4. Expert contre Expert (l'IA réfléchit et joue).
   Toutes les 5 s : images/s, pire image, temps de calcul de la page et du
   processus graphique, programmes de shader créés, dessins par image,
   géométries et textures en mémoire, animations CSS actives.

   Ne modifie rien. Écrit mesure-pc-<date>.json et affiche un résumé. */

const fs = require('fs');
const path = require('path');

function chargerPlaywright() {
  for (const nom of ['playwright', 'playwright-core', '@playwright/test']) {
    try { const m = require(nom); return m.chromium || m._chromium || m.default?.chromium; } catch (_) { /* suivant */ }
  }
  throw new Error('Playwright introuvable : lancer « npm install » dans le dépôt.');
}

const URL_JEU = process.argv[2] || 'https://batbat.netlify.app/';
const PHASE_MS = (Number(process.argv[3]) || 60) * 1000;
const PAS_MS = 5000;

async function lancer(chromium) {
  const options = { headless: !!process.env.HEADLESS, args: ['--start-maximized'].concat(process.env.HEADLESS ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []) };
  for (const channel of process.env.HEADLESS ? [undefined] : ['chrome', 'msedge', undefined]) {
    try { return { navigateur: await chromium.launch({ ...options, channel, executablePath: !channel && process.env.CHROMIUM ? process.env.CHROMIUM : undefined }), channel: channel || 'chromium' }; }
    catch (_) { /* suivant */ }
  }
  throw new Error('Aucun navigateur Chromium disponible.');
}

function sondePage() {
  const M = window.__MESURE = { dessinsTotal: 0, liens: 0, images: 0, pire: 0, derniere: 0, longues: 0, longuesMs: 0 };
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) { M.longues++; M.longuesMs += e.duration; } })
      .observe({ type: 'longtask', buffered: true });
  } catch (_) { /* non supporté */ }
  const boucle = t => {
    if (M.derniere) M.pire = Math.max(M.pire, t - M.derniere);
    M.derniere = t; M.images++;
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const lien = C.prototype.linkProgram;
    C.prototype.linkProgram = function (p) { M.liens++; return lien.call(this, p); };
    for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = C.prototype[f];
      if (o) C.prototype[f] = function (...a) { M.dessinsTotal++; return o.apply(this, a); };
    }
  }
}

function lireEtLeverPage() {
  const M = window.__MESURE;
  const k = window.kaykit3D;
  const r = k && k.renderer;
  const info = r ? r.info : null;
  const sortie = {
    images: M.images, pire: Math.round(M.pire), liens: M.liens, longues: M.longues, longuesMs: Math.round(M.longuesMs),
    programmes: info ? info.programs.length : null,
    dessins: M.images ? Math.round(M.dessinsTotal / M.images) : 0,
    triangles: info ? info.render.triangles : null,
    geometries: info ? info.memory.geometries : null,
    textures: info ? info.memory.textures : null,
    animationsCss: [document, ...[...document.querySelectorAll('iframe')].map(f => { try { return f.contentDocument; } catch (_) { return null; } })]
      .reduce((n, d) => n + (d && d.getAnimations ? d.getAnimations().length : 0), 0),
    tasJsMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    pixels: r ? r.domElement.width * r.domElement.height : null,
    qualite: k ? k.qualityMode || null : null,
    masque: document.hidden
  };
  M.images = 0; M.dessinsTotal = 0; M.pire = 0; M.liens = 0; M.longues = 0; M.longuesMs = 0;
  return sortie;
}

function infoMachine() {
  const c = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
  const ext = c && c.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    dpr: devicePixelRatio, ecran: `${screen.width}x${screen.height}`, fenetre: `${innerWidth}x${innerHeight}`,
    coeurs: navigator.hardwareConcurrency, userAgent: navigator.userAgent,
    economie: (() => { try { return localStorage.getItem('ilyosEconomie'); } catch (_) { return null; } })()
  };
}

async function tempsProcessus(cdpNavigateur) {
  try {
    const { processInfo } = await cdpNavigateur.send('SystemInfo.getProcessInfo');
    const parType = {};
    for (const p of processInfo) parType[p.type] = (parType[p.type] || 0) + p.cpuTime;
    return parType;
  } catch (_) { return null; }
}

async function phase(nom, page, cdpNavigateur, action) {
  console.log(`\n▶ ${nom}`);
  const echantillons = [];
  await page.evaluate(lireEtLeverPage);
  let avant = await tempsProcessus(cdpNavigateur);
  const fin = Date.now() + PHASE_MS;
  let arret = false;
  const agir = (async () => { while (!arret && action) await action(); })();
  while (Date.now() < fin) {
    await page.waitForTimeout(PAS_MS);
    const e = await page.evaluate(lireEtLeverPage);
    const apres = await tempsProcessus(cdpNavigateur);
    if (avant && apres) {
      e.cpu = {};
      for (const type of Object.keys(apres)) e.cpu[type] = Math.round(100 * ((apres[type] - (avant[type] || 0)) / (PAS_MS / 1000)));
    }
    avant = apres;
    e.ips = Math.round(e.images / (PAS_MS / 1000));
    echantillons.push(e);
    console.log(`  ${String(e.ips).padStart(3)} i/s · pire image ${e.pire} ms · dessins ${e.dessins} · programmes ${e.programmes} (+${e.liens})`
      + ` · tâches longues ${e.longues} (${e.longuesMs} ms) · anim. CSS ${e.animationsCss}`
      + (e.cpu ? ` · CPU % ${Object.entries(e.cpu).map(([t, v]) => `${t} ${v}`).join(', ')}` : ''));
  }
  arret = true;
  await agir;
  return { nom, echantillons };
}

(async () => {
  const chromium = chargerPlaywright();
  const { navigateur, channel } = await lancer(chromium);
  const contexte = await navigateur.newContext({ viewport: null });
  const page = await contexte.newPage();
  await page.addInitScript(sondePage);
  const cdpNavigateur = await navigateur.newBrowserCDPSession();
  await page.goto(URL_JEU);
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 120000 });
  const machine = await page.evaluate(infoMachine);
  machine.navigateur = channel;
  console.log('Machine :', JSON.stringify(machine));

  const phases = [];
  phases.push(await phase('1. Menu au repos', page, cdpNavigateur, null));

  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await page.waitForTimeout(1500);
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => !!window.kaykit3D?.renderer, null, { timeout: 60000 });
  await page.waitForTimeout(8000);

  const cadre = await page.locator('#kaykitCanvas').boundingBox();
  let pas = 0;
  phases.push(await phase('2. Partie solo, survol du plateau', page, cdpNavigateur, async () => {
    pas++;
    const x = cadre.x + cadre.width * (0.3 + 0.4 * ((pas * 7) % 23) / 23);
    const y = cadre.y + cadre.height * (0.3 + 0.4 * ((pas * 5) % 17) / 17);
    await page.mouse.move(x, y, { steps: 4 });
    await page.waitForTimeout(250);
  }));
  phases.push(await phase('3. Partie solo, plateau immobile', page, cdpNavigateur, null));

  await page.goto(URL_JEU);
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 120000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 80 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay.active === true, null, { timeout: 90000 });
  phases.push(await phase('4. Expert contre Expert', page, cdpNavigateur, null));

  await navigateur.close();
  const fichier = path.resolve(`mesure-pc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(fichier, JSON.stringify({ url: URL_JEU, machine, phases }, null, 1));

  console.log('\n=== Résumé');
  for (const p of phases) {
    const s = p.echantillons;
    const moy = cle => Math.round(s.reduce((a, e) => a + (e[cle] || 0), 0) / Math.max(1, s.length));
    const cpu = type => Math.round(s.reduce((a, e) => a + ((e.cpu && e.cpu[type]) || 0), 0) / Math.max(1, s.length));
    console.log(`${p.nom} : ${moy('ips')} i/s, pire image ${Math.max(...s.map(e => e.pire))} ms, `
      + `nouveaux programmes ${s.reduce((a, e) => a + e.liens, 0)}, tâches longues ${s.reduce((a, e) => a + e.longuesMs, 0)} ms, `
      + `CPU page ${cpu('renderer')} %, CPU graphique ${cpu('GPU')} %, dessins ${moy('dessins')}`);
  }
  console.log(`\nDétail : ${fichier}`);
})().catch(e => { console.error(e); process.exit(1); });
