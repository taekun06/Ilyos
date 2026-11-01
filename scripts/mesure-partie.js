/* Enregistreur de partie RÉELLE : trouver ce qui fait ralentir ou chauffer
   le jeu pendant qu'on joue normalement, sur sa propre machine.

     node scripts/mesure-partie.js [url] [minutes]

   url : par défaut la production (https://batbat.netlify.app/).
   Ouvre Chrome installé (sinon Edge, sinon le Chromium de Playwright) dans
   une vraie fenêtre. On joue comme d'habitude ; l'enregistrement s'arrête à
   la fermeture de la fenêtre ou après [minutes] (10 par défaut).

   Toutes les 2 s : images/s, pire image, temps de calcul de la page et du
   processus graphique, dessins par image, shaders compilés, écran courant
   (menu, partie 3D, vue 2D), qualité et densité de rendu, et, si nvidia-smi
   existe, charge et puissance de la carte graphique. En continu : profil du
   processeur (fonctions qui coûtent le plus, en tout et pendant les
   secondes « chaudes »), et chaque image de plus de 50 ms avec ce qui
   l'accompagnait.

   Ne modifie rien. Écrit mesure-partie-<date>.json et affiche un résumé. */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function chargerPlaywright() {
  for (const nom of ['playwright', 'playwright-core', '@playwright/test']) {
    try { const m = require(nom); return m.chromium || m.default?.chromium; } catch (_) { /* suivant */ }
  }
  throw new Error('Playwright introuvable : lancer « npm install » dans le dépôt.');
}

const URL_JEU = process.argv[2] || 'https://batbat.netlify.app/';
const DUREE_MS = (Number(process.argv[3]) || 10) * 60000;
const PAS_MS = 2000;

function sondePage() {
  const M = window.__PARTIE = { images: 0, pire: 0, derniere: 0, dessins: 0, liens: 0, lentes: [], longues: 0, longuesMs: 0, dessinsImage: 0, liensImage: 0, texImage: 0 };
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) { M.longues++; M.longuesMs += e.duration; } })
      .observe({ type: 'longtask', buffered: true });
  } catch (_) { /* non supporté */ }
  const ecran = () => {
    const jeu = document.getElementById('gameScreen');
    if (!jeu || jeu.classList.contains('hidden')) return 'menu';
    if (document.body.dataset.plateauTactique === 'on') return 'vue2d';
    return document.body.classList.contains('puzzle-mode') ? 'enigme' : 'partie3d';
  };
  M.ecran = ecran;
  const boucle = t => {
    if (M.derniere) {
      const ecart = t - M.derniere;
      M.pire = Math.max(M.pire, ecart);
      if (ecart > 50 && M.lentes.length < 400) {
        const k = window.kaykit3D;
        M.lentes.push({
          a: Math.round(performance.now() / 100) / 10, ms: Math.round(ecart), ecran: ecran(),
          dessins: M.dessinsImage, shaders: M.liensImage, textures: M.texImage,
          ia: !!document.querySelector('#gameScreen.ai-turn, body.ai-turn, .ai-thinking'),
          anim: k ? (k.pendingActionAnimations?.size || 0) + (k.visualSequences?.length || 0) + (k.fxTweens?.length || 0) : 0
        });
      }
    }
    M.derniere = t; M.images++; M.dessinsImage = 0; M.liensImage = 0; M.texImage = 0;
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const lien = C.prototype.linkProgram;
    C.prototype.linkProgram = function (p) { M.liens++; M.liensImage++; return lien.call(this, p); };
    const tex = C.prototype.texImage2D;
    C.prototype.texImage2D = function (...a) { M.texImage++; return tex.apply(this, a); };
    for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = C.prototype[f];
      if (o) C.prototype[f] = function (...a) { M.dessins++; M.dessinsImage++; return o.apply(this, a); };
    }
  }
}

function lirePage() {
  const M = window.__PARTIE;
  const k = window.kaykit3D, r = k && k.renderer;
  // Images réellement DESSINÉES (la boucle en saute, voir kaykitImageSautee) :
  // comptées là où le jeu les rend.
  const perf = window.ILYOS_PERF;
  if (perf && !perf.__partie) {
    const original = perf.recordFrame.bind(perf);
    perf.recordFrame = (...a) => { M.rendus = (M.rendus || 0) + 1; return original(...a); };
    perf.__partie = true;
  }
  const s = {
    rendus: M.rendus || 0,
    ecran: M.ecran(), images: M.images, pire: Math.round(M.pire), shaders: M.liens,
    dessins: M.images ? Math.round(M.dessins / M.images) : 0, longuesMs: Math.round(M.longuesMs),
    qualite: k ? k.qualityMode || null : null, densite: r ? Math.round(r.getPixelRatio() * 100) / 100 : null,
    pixels: r ? r.domElement.width * r.domElement.height : null,
    geometries: r ? r.info.memory.geometries : null, textures: r ? r.info.memory.textures : null,
    tasMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    animationsCss: document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running').length : null,
    masque: document.hidden, lentes: M.lentes.splice(0)
  };
  M.images = 0; M.rendus = 0; M.pire = 0; M.liens = 0; M.dessins = 0; M.longuesMs = 0;
  return s;
}

function nvidia() {
  return new Promise(res => execFile('nvidia-smi', ['--query-gpu=utilization.gpu,power.draw,temperature.gpu', '--format=csv,noheader,nounits'],
    { timeout: 1500 }, (e, out) => {
      if (e || !out) return res(null);
      const [charge, watts, temp] = out.trim().split('\n')[0].split(',').map(v => Number(v.trim()));
      res({ charge, watts, temp });
    }));
}

async function lancer(chromium) {
  // HEADLESS=1 : essai de l'outil sans écran (rendu logiciel, chiffres non représentatifs).
  const sansEcran = !!process.env.HEADLESS;
  const options = { headless: sansEcran, args: ['--start-maximized'].concat(sansEcran ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []) };
  for (const channel of sansEcran ? [undefined] : ['chrome', 'msedge', undefined]) {
    try { return { navigateur: await chromium.launch({ ...options, channel }), channel: channel || 'chromium' }; }
    catch (_) { /* suivant */ }
  }
  throw new Error('Aucun navigateur Chromium disponible.');
}

function resumerProfil(profile, fenetres) {
  const noeuds = new Map(profile.nodes.map(n => [n.id, n]));
  const cle = n => {
    const cf = n.callFrame;
    const fichier = cf.url ? cf.url.split('/').pop().split('?')[0] : '';
    return fichier ? `${cf.functionName || '(anonyme)'} · ${fichier}:${cf.lineNumber + 1}` : `(${cf.functionName})`;
  };
  const total = {}, chaud = {};
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i] || 0;
    const n = noeuds.get(profile.samples[i]);
    const k = cle(n);
    if (/^\(\((idle|program|root)\)\)$/.test(k)) continue;
    const d = (profile.timeDeltas[i] || 0) / 1000;
    total[k] = (total[k] || 0) + d;
    if (fenetres.some(([a, b]) => t >= a && t <= b)) chaud[k] = (chaud[k] || 0) + d;
  }
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, ms]) => ({ fonction: k, ms: Math.round(ms) }));
  return { total: top(total), secondesChaudes: top(chaud) };
}

(async () => {
  const chromium = chargerPlaywright();
  const { navigateur, channel } = await lancer(chromium);
  const contexte = await navigateur.newContext({ viewport: null });
  const page = await contexte.newPage();
  await page.addInitScript(sondePage);
  const cdpNavigateur = await navigateur.newBrowserCDPSession();
  const cdp = await contexte.newCDPSession(page);
  await page.goto(URL_JEU);
  const machine = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = c && c.getExtension('WEBGL_debug_renderer_info');
    return { gpu: ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, ecran: `${screen.width}x${screen.height}`, fenetre: `${innerWidth}x${innerHeight}`, coeurs: navigator.hardwareConcurrency };
  });
  machine.navigateur = channel;
  console.log('Machine :', JSON.stringify(machine));
  console.log('Joue normalement. Ferme la fenêtre pour terminer (ou attends la fin du délai).');

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const debutProfil = Date.now();

  let ferme = false;
  page.on('close', () => { ferme = true; });
  navigateur.on('disconnected', () => { ferme = true; });

  const echantillons = [];
  let avant = null;
  const fin = Date.now() + DUREE_MS;
  while (!ferme && Date.now() < fin) {
    await new Promise(r => setTimeout(r, PAS_MS));
    if (ferme) break;
    let e;
    try { e = await page.evaluate(lirePage); } catch (_) { break; }
    try {
      const { processInfo } = await cdpNavigateur.send('SystemInfo.getProcessInfo');
      const parType = {};
      for (const p of processInfo) parType[p.type] = (parType[p.type] || 0) + p.cpuTime;
      if (avant) {
        e.cpuPage = Math.round(100 * ((parType.renderer || 0) - (avant.renderer || 0)) / (PAS_MS / 1000));
        e.cpuGraphique = Math.round(100 * ((parType.GPU || 0) - (avant.GPU || 0)) / (PAS_MS / 1000));
      }
      avant = parType;
    } catch (_) { /* navigateur fermé */ }
    e.carte = await nvidia();
    e.t = Math.round((Date.now() - debutProfil) / 1000);
    e.ips = Math.round(e.images / (PAS_MS / 1000));
    e.dessinees = Math.round(e.rendus / (PAS_MS / 1000));
    echantillons.push(e);
    console.log(`${String(e.t).padStart(4)} s · ${e.ecran.padEnd(8)} · ${String(e.ips).padStart(3)} i/s (dessinées ${String(e.dessinees).padStart(3)}) · pire ${String(e.pire).padStart(4)} ms · dessins ${String(e.dessins).padStart(3)}`
      + ` · CPU page ${e.cpuPage ?? '?'} % graphique ${e.cpuGraphique ?? '?'} %` + (e.shaders ? ` · +${e.shaders} shaders` : '')
      + (e.carte ? ` · carte ${e.carte.charge} % ${e.carte.watts} W ${e.carte.temp} °C` : '') + (e.lentes.length ? ` · ${e.lentes.length} images lentes` : ''));
  }

  let profil = null;
  try {
    const { profile } = await cdp.send('Profiler.stop');
    // Secondes « chaudes » : processeur de la page au-dessus de 60 %.
    const chaudes = echantillons.filter(e => (e.cpuPage || 0) > 60)
      .map(e => [profile.startTime + (e.t - PAS_MS / 1000) * 1e6, profile.startTime + e.t * 1e6]);
    profil = resumerProfil(profile, chaudes);
  } catch (_) { /* fenêtre déjà fermée : pas de profil */ }
  try { await navigateur.close(); } catch (_) { /* déjà fermé */ }

  const lentes = echantillons.flatMap(e => e.lentes);
  const parEcran = {};
  for (const e of echantillons) {
    const p = parEcran[e.ecran] || (parEcran[e.ecran] = { n: 0, ips: 0, dessinees: 0, cpuPage: 0, cpuGraphique: 0, dessins: 0, watts: 0 });
    p.n++; p.ips += e.ips; p.dessinees += e.dessinees; p.cpuPage += e.cpuPage || 0; p.cpuGraphique += e.cpuGraphique || 0; p.dessins += e.dessins; p.watts += e.carte?.watts || 0;
  }
  for (const p of Object.values(parEcran)) for (const k of ['ips', 'dessinees', 'cpuPage', 'cpuGraphique', 'dessins', 'watts']) p[k] = Math.round(p[k] / p.n);
  const fichier = path.resolve(`mesure-partie-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(fichier, JSON.stringify({ url: URL_JEU, machine, parEcran, lentes, profil, echantillons }, null, 1));

  console.log('\n=== Résumé par écran (moyennes, n = échantillons de 2 s)');
  console.log(JSON.stringify(parEcran, null, 1));
  console.log(`\nImages de plus de 50 ms : ${lentes.length} ; avec compilation de shaders : ${lentes.filter(l => l.shaders).length} ; pendant le tour de l'IA : ${lentes.filter(l => l.ia).length}`);
  console.log('Les 10 plus longues :', JSON.stringify(lentes.sort((a, b) => b.ms - a.ms).slice(0, 10)));
  if (profil) {
    console.log('\nFonctions les plus coûteuses (ms, toute la session) :');
    profil.total.slice(0, 15).forEach(f => console.log(`  ${String(f.ms).padStart(6)}  ${f.fonction}`));
    console.log('\nPendant les secondes chaudes :');
    profil.secondesChaudes.slice(0, 15).forEach(f => console.log(`  ${String(f.ms).padStart(6)}  ${f.fonction}`));
  }
  console.log(`\nDétail : ${fichier}`);
})().catch(e => { console.error(e); process.exit(1); });
