/* Self-play du mode Balises, sans rendu (serveur `npm start`, port 8123).

     node scripts/selfplay-balises.js [parties] [graine] [parallèle]

   Terrain : classique par défaut ; ILYOS_SETUP=open (duel symétrique 11×11)
   ou ILYOS_PERSO="6,4" (mise en place draft : îles, gardiens par joueur).

   Sans ILYOS_URL_B : le même build joue les deux camps, et le banc mesure
   l'avantage du joueur qui commence (J0 commence toujours).
   Avec ILYOS_URL_B (ex. worktree d'un commit servi sur 8125) : A contre B,
   chaque graine jouée deux fois camps inversés ; le banc mesure A.
   Avec ILYOS_PERSO et ILYOS_DRAFT_B (poids de PLAN_POIDS, ex.
   '{"draftBalises":0}') : A contre B pour la seule MISE EN PLACE, même build
   ensuite ; ILYOS_DRAFT_A donne les poids de A (défaut : aucun). */

const { chromium } = require('playwright');

const URL_A = process.env.ILYOS_URL_A || 'http://localhost:8123/';
const URL_B = process.env.ILYOS_URL_B || null;
const N = Number(process.argv[2]) || 10;
const GRAINE = Number(process.argv[3]) || 9000;
const PARALLELE = Math.max(1, Number(process.argv[4]) || 3);
const SETUP = process.env.ILYOS_SETUP || null;
const PERSO = process.env.ILYOS_PERSO ? process.env.ILYOS_PERSO.split(',').map(Number) : null;
const DRAFT_A = process.env.ILYOS_DRAFT_A ? JSON.parse(process.env.ILYOS_DRAFT_A) : null;
const DRAFT_B = process.env.ILYOS_DRAFT_B ? JSON.parse(process.env.ILYOS_DRAFT_B) : null;
const AB = !!URL_B || (!!PERSO && !!DRAFT_B);
const TOURS_MAX = Number(process.env.ILYOS_TOURS_MAX) || 160;

async function ouvrir(navigateur, url) {
  const page = await navigateur.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.error(`[${url}] ${e.message}`));
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.tour === 'function', null, { timeout: 60000 });
  await page.evaluate(() => {
    window.ILYOS_BENCH.vitesse(0.05);
    window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 });
  });
  await page.waitForFunction(() => window.ILYOS_BENCH.observe(0) && window.ILYOS_TEST.autoplay?.active === true,
    null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    window.ILYOS_TEST.stopAutoplay?.();
    window.ILYOS_BENCH.reinitialiser();
    window.requestAnimationFrame = () => 0;
  });
  return page;
}

function depart(page, graine, campA) {
  if (PERSO) {
    const poids = DRAFT_B ? (campA === 0 ? [DRAFT_A, DRAFT_B] : [DRAFT_B, DRAFT_A]) : [null, null];
    return page.evaluate(([g, iles, gardiens, p]) =>
      window.ILYOS_SELFPLAY.departPerso(g, { iles, gardiens, poids: p, rotation: { but: 'balises' } }),
      [graine, PERSO[0], PERSO[1], poids]);
  }
  return page.evaluate(([g, setup]) =>
    window.ILYOS_ROTATION.departBalises(window.ILYOS_SELFPLAY.departMelange(g), { setup }), [graine, SETUP]);
}

/* pages[j] joue le joueur j. */
async function partie(pages, etat, graine) {
  let r = null;
  for (let i = 0; i < TOURS_MAX; i++) {
    const joueur = JSON.parse(etat).currentPlayer;
    r = await pages[joueur].evaluate(([e, s]) => window.ILYOS_SELFPLAY.tour(e, { graine: s }), [etat, graine * 1000 + i]);
    etat = r.etat;
    if (r.fin || (r.vainqueur !== null && r.vainqueur !== undefined)) break;
  }
  const scores = JSON.parse(etat).players.map(p => p.score || 0);
  let v = r.vainqueur;
  if (typeof v !== 'number' || v < 0) v = scores[0] === scores[1] ? null : (scores[0] > scores[1] ? 0 : 1);
  return { v, scores, tour: r.tour };
}

(async () => {
  const navigateur = await chromium.launch({ headless: true });
  const file = Array.from({ length: AB ? Math.ceil(N / 2) : N }, (_, i) => GRAINE + i);
  const b = { premier: 0, second: 0, A: 0, B: 0, nul: 0, a10: 0, tours: [] };
  await Promise.all(Array.from({ length: PARALLELE }, async () => {
    const pageA = await ouvrir(navigateur, URL_A);
    const pageB = URL_B ? await ouvrir(navigateur, URL_B) : pageA;
    while (file.length) {
      const g = file.shift();
      for (const campA of AB ? [0, 1] : [0]) {
        const debut = await depart(pageA, g, campA);
        const pages = campA === 0 ? [pageA, pageB] : [pageB, pageA];
        const t0 = Date.now();
        const x = await partie(pages, debut, g);
        if (x.v === 0) b.premier++; else if (x.v === 1) b.second++; else b.nul++;
        if (x.v === campA) b.A++; else if (x.v !== null) b.B++;
        if (Math.max(...x.scores) >= 10) b.a10++;
        b.tours.push(x.tour);
        const issue = x.v === null ? 'nul' : (x.v === 0 ? 'PREMIER' : 'second') + (AB ? (x.v === campA ? ' (A)' : ' (B)') : '');
        console.log(`graine ${g}${AB ? ` A=J${campA}` : ''} : ${issue} ${x.scores.join('-')} tour ${x.tour} (${Math.round((Date.now() - t0) / 1000)} s)`);
      }
    }
  }));
  const n = b.premier + b.second + b.nul;
  const taux = (k) => { const p = (k + b.nul / 2) / n; return `${(100 * p).toFixed(1)} % ± ${(100 * Math.sqrt(p * (1 - p) / n)).toFixed(1)}`; };
  const terrain = PERSO ? `draft ${PERSO.join('/')}` : (SETUP ? `setup ${SETUP}` : 'classique');
  console.log(`\nBALISES ${terrain} : ${n} parties, premier ${b.premier}, second ${b.second}, nuls ${b.nul}`);
  console.log(`premier joueur ${taux(b.premier)} ; ${b.a10} parties à 10 points ; tours moyens ${Math.round(b.tours.reduce((a, c) => a + c, 0) / n)}`);
  if (AB) console.log(`A ${URL_B ? `${URL_A} contre B ${URL_B}` : `draft ${JSON.stringify(DRAFT_A)} contre ${JSON.stringify(DRAFT_B)}`} : A ${b.A}, B ${b.B}, nuls ${b.nul} -> A ${taux(b.A)}`);
  await navigateur.close();
})();
