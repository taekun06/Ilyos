/* BLOCAGE SUBI — ce que l'évaluateur en dit.

     npm start   puis   node scripts/verif-blocage-subi.js

   1. Témoin : sans gardien adverse dans mon village, aucun blocage subi.
   2. Un gardien adverse posté sur une case de mon village me COÛTE
      (blocageSubi)…
   3. …exactement ce qu'il rapporte à son camp (blocageValidation vu de lui) :
      la note reste à somme nulle.

   Partie du 03/10 (graine 7) : mes gardiens ont tenu ses deux villages pendant
   des tours sans que l'IA cherche à les en chasser — le terme manquait.

   (L'escompte de la validation prête par les parades blocage et pivot,
   validationRisques, est coupé : mesuré nuisible, voir planner.js.)

   Repères (plateau 11×11) : village J0 en (0,0), cases (0,0) (1,0) (0,1). */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

// Le coin (0,0) entouré de terre.
const COIN = [
  { shapeKey: "square", owner: 0, cells: [[0, 1], [1, 0], [1, 1], [0, 2]] },
  { shapeKey: "square", owner: 0, cells: [[2, 0], [2, 1], [1, 2], [2, 2]] }
];
const SANS_CARTES = { pioches: { 0: [], 1: [] }, hands: { 0: [], 1: [] } };

const position = (extra) => Object.assign({ seed: 1, islandPlacedThisTurn: true, islands: COIN }, SANS_CARTES, extra);

const CAS = {
  libre: position({
    characters: [{ id: "mien", player: 0, r: 2, c: 2 }, { id: "loin", player: 1, r: 8, c: 8 }],
    crowns: [{ r: 2, c: 1, active: true }]
  }),
  bloque: position({
    characters: [{ id: "mien", player: 0, r: 2, c: 2 }, { id: "bloqueur", player: 1, r: 0, c: 1 }],
    crowns: [{ r: 2, c: 1, active: true }]
  })
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const incidents = [];
  page.on('pageerror', e => incidents.push('exception: ' + e.message));

  await page.goto(ORIGINE);
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 45000 });
  await page.evaluate(() => window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
  await page.waitForFunction(() => window.ILYOS_TEST.autoplay?.active === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.ILYOS_TEST.stopAutoplay?.());
  await page.evaluate(() => window.ILYOS_BENCH.reinitialiser());
  await page.waitForTimeout(1500);

  const evaluer = (spec, joueur = 0) => page.evaluate(([s, j]) =>
    window.ILYOS_BENCH.evaluation(Object.assign({}, s, { aiPlayer: j })), [spec, joueur]);
  const terme = (r, t) => r.termes[t] || 0;

  const libre = await evaluer(CAS.libre);
  const bloqueMoi = await evaluer(CAS.bloque, 0);
  const bloqueLui = await evaluer(CAS.bloque, 1);

  const controles = [
    ['Témoin : village libre, aucun blocage subi', terme(libre, 'blocageSubi') === 0,
      `blocageSubi ${terme(libre, 'blocageSubi')}`],
    ['Bloqueur dans mon village : il me coûte', terme(bloqueMoi, 'blocageSubi') < 0,
      `blocageSubi ${terme(bloqueMoi, 'blocageSubi')}`],
    ['Somme nulle : mon coût = son gain', terme(bloqueMoi, 'blocageSubi') === -terme(bloqueLui, 'blocageValidation'),
      `${terme(bloqueMoi, 'blocageSubi')} contre ${terme(bloqueLui, 'blocageValidation')}`]
  ];

  console.log('\nBLOCAGE SUBI');
  console.log('='.repeat(72));
  let reussis = 0;
  for (const [nom, ok, detail] of controles) {
    console.log(`${nom.padEnd(56, '.')} ${ok ? 'OK' : 'ÉCHEC'}`);
    console.log(`      ${detail}`);
    if (ok) reussis++;
  }
  console.log('='.repeat(72));
  console.log(`${reussis} / ${controles.length} contrôles conformes`);
  console.log(`Incidents console : ${incidents.length ? incidents.join(' | ') : 'aucun'}`);
  await browser.close();
  process.exitCode = reussis === controles.length && !incidents.length ? 0 : 1;
}

main();
