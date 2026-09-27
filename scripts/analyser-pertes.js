/* D'où viennent les gardiens perdus par l'Expert ? Classement en self-play.

     npm start   puis   node scripts/analyser-pertes.js [graines] [parallèle]

   graines : liste séparée par des virgules (défaut 9200..9205).
   ILYOS_POIDS='{"clé":valeur}' : poids des DEUX camps (Expert contre Expert).

   À la fin de chaque tour, on note pour chaque gardien du camp qui vient de
   jouer ce que le planner en pensait (gravité d'expulsion, ILYOS_SELFPLAY.
   exposes). S'il disparaît pendant le tour adverse — hors sortie après une
   validation —, la perte est classée :
     vu-accepté          gravité > 0 : risque vu, pris quand même ;
     invisible-poussée   gravité 0, mais un seul gardien adverse pouvait le
                         pousser dans le vide avec les VRAIES cartes adverses ;
     apparition-poussée  un gardien adverse apparu ce tour-ci se tient à côté ;
     magie               une île existante a tourné ce tour-ci ;
     autre               combinaisons (plusieurs pièces, poussée puis
                         déplacement, apparition puis déplacement…).
   « (porteur) » : le gardien portait une couronne.                          */

const { chromium } = require('playwright');

const GRAINES = (process.argv[2] || '9200,9201,9202,9203,9204,9205').split(',').map(Number);
const PARALLELE = Math.max(1, Number(process.argv[3]) || 3);
const POIDS = process.env.ILYOS_POIDS ? JSON.parse(process.env.ILYOS_POIDS) : null;
const URL = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';
const TOURS_MAX = 70;

async function ouvrir(navigateur) {
  const page = await navigateur.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.error('[page]', e.message));
  await page.goto(URL, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.ILYOS_SELFPLAY?.exposes === 'function', null, { timeout: 60000 });
  // Une partie doit exister : `state` sert de support à la simulation.
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

function classer(v, avant, apres, moteur) {
  if (v.graviteVue > 0) return 'vu-accepté';
  if (v.forceReelle > 0) return 'invisible-poussée';
  const idsAvant = new Set(avant.characters.map(c => c.id));
  const apparus = apres.characters.filter(c => !idsAvant.has(c.id) && c.player !== moteur);
  if (apparus.some(n => Math.abs(n.r - v.r) + Math.abs(n.c - v.c) === 1)) return 'apparition-poussée';
  const iles = new Map(avant.islands.map(i => [i.id, JSON.stringify(i.cells)]));
  if (apres.islands.some(i => iles.has(i.id) && iles.get(i.id) !== JSON.stringify(i.cells))) return 'magie';
  return 'autre';
}

async function travailleur(navigateur, file, bilan) {
  const page = await ouvrir(navigateur);
  while (file.length) {
    const graine = file.shift();
    let etat = await page.evaluate(g => window.ILYOS_SELFPLAY.departMelange(g), graine);
    let suivis = null, moteur = null, scoreAvant = 0;
    for (let t = 0; t < TOURS_MAX; t++) {
      const joueur = JSON.parse(etat).currentPlayer;
      const r = await page.evaluate(([j, g, p]) => window.ILYOS_SELFPLAY.tour(j, { graine: g, poids: p }),
        [etat, graine * 100 + t, POIDS]);
      const apres = JSON.parse(r.etat);
      if (suivis) {
        const vivants = new Set(apres.characters.map(c => c.id));
        const avant = JSON.parse(etat);
        const marque = (apres.players[moteur].score || 0) > scoreAvant;
        for (const v of suivis) {
          if (vivants.has(v.id) || (v.porteur && marque)) continue;
          const cle = classer(v, avant, apres, moteur) + (v.porteur ? ' (porteur)' : '');
          bilan[cle] = (bilan[cle] || 0) + 1;
        }
      }
      if (r.fin) break;
      etat = r.etat;
      moteur = joueur;
      scoreAvant = apres.players[joueur].score || 0;
      suivis = await page.evaluate(([j, m, p]) => window.ILYOS_SELFPLAY.exposes(j, m, p), [etat, joueur, POIDS]);
    }
    console.log(`graine ${graine} terminée`);
  }
}

(async () => {
  const navigateur = await chromium.launch({ headless: true });
  try {
    const bilan = {};
    const file = [...GRAINES];
    await Promise.all(Array.from({ length: Math.min(PARALLELE, file.length) }, () => travailleur(navigateur, file, bilan)));
    const total = Object.values(bilan).reduce((a, b) => a + b, 0);
    console.log(`\nGardiens perdus par l'Expert sur ${GRAINES.length} parties : ${total}`);
    for (const [cle, n] of Object.entries(bilan).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cle.padEnd(32)} ${String(n).padStart(3)}  (${(100 * n / total).toFixed(0)} %)`);
    }
  } finally {
    await navigateur.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
