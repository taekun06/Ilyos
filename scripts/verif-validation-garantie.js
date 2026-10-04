/* VALIDATION GARANTIE et BLOCAGE SUBI — ce que l'évaluateur en dit.

     npm start   puis   node scripts/verif-validation-garantie.js

   1. Un porteur prêt à valider sur la case du village, que l'adversaire ne
      peut ni éjecter, ni voler, ni bloquer, ni faire pivoter, vaut la
      validation PLEINE (validationPrete). Témoin positif.
   2. Le même porteur, quand un gardien adverse peut rejoindre une autre case
      du village (blocage), vaut MOINS.
   3. Un porteur sur une case d'île, adversaire avec une MAGIE en réserve
      (pivot), vaut MOINS que sur la case du village.
   4. Un gardien adverse posté sur une case de mon village me COÛTE
      (blocageSubi), et exactement ce qu'il rapporte à son camp
      (blocageValidation vu de lui) : la note reste à somme nulle.

   Partie du 03/10 (graine 7) : mon porteur au coin (10,10) était un point
   acquis, noté comme un point contestable ; mes gardiens ont tenu ses deux
   villages pendant des tours sans que l'IA cherche à les en chasser.

   Repères (plateau 11×11) : village J0 en (0,0), cases (0,0) (1,0) (0,1). */

const { chromium } = require('playwright');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

// Le coin (0,0) entouré de terre : aucune case vide où poser une île contre
// le village, donc aucun gardien apparu pour le bloquer.
const COIN = [
  { shapeKey: "square", owner: 0, cells: [[0, 1], [1, 0], [1, 1], [0, 2]] },
  { shapeKey: "square", owner: 0, cells: [[2, 0], [2, 1], [1, 2], [2, 2]] }
];
const SANS_CARTES = { pioches: { 0: [], 1: [] }, hands: { 0: [], 1: [] } };

const position = (extra) => Object.assign({ seed: 1, islandPlacedThisTurn: true, islands: COIN }, SANS_CARTES, extra);

const CAS = {
  garanti: position({
    characters: [{ id: "porteur", player: 0, r: 0, c: 0 }, { id: "loin", player: 1, r: 8, c: 8 }],
    crowns: [{ r: 0, c: 0, active: true, carrierId: "porteur" }]
  }),
  blocable: position({
    characters: [{ id: "porteur", player: 0, r: 0, c: 0 }, { id: "marcheur", player: 1, r: 2, c: 2 }],
    crowns: [{ r: 0, c: 0, active: true, carrierId: "porteur" }],
    stash: { 1: { MOVE: 3 } }
  }),
  pivotable: position({
    characters: [{ id: "porteur", player: 0, r: 1, c: 0 }, { id: "loin", player: 1, r: 8, c: 8 }],
    crowns: [{ r: 1, c: 0, active: true, carrierId: "porteur" }],
    stash: { 1: { MAGIC: 1 } }
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

  const garanti = await evaluer(CAS.garanti);
  const blocable = await evaluer(CAS.blocable);
  const pivotable = await evaluer(CAS.pivotable);
  const bloqueMoi = await evaluer(CAS.bloque, 0);
  const bloqueLui = await evaluer(CAS.bloque, 1);

  const v = r => terme(r, 'validationPrete');
  const controles = [
    ['Porteur garanti : validation pleine', v(garanti) === 1000, `validationPrete ${v(garanti)}`],
    ['Village blocable : validation escomptée', v(blocable) > 0 && v(blocable) < v(garanti),
      `validationPrete ${v(blocable)} contre ${v(garanti)}`],
    ['Porteur sur île pivotable : validation escomptée', v(pivotable) > 0 && v(pivotable) < v(garanti),
      `validationPrete ${v(pivotable)} contre ${v(garanti)}`],
    ['Bloqueur dans mon village : il me coûte', terme(bloqueMoi, 'blocageSubi') < 0,
      `blocageSubi ${terme(bloqueMoi, 'blocageSubi')}`],
    ['Somme nulle : mon coût = son gain', terme(bloqueMoi, 'blocageSubi') === -terme(bloqueLui, 'blocageValidation'),
      `${terme(bloqueMoi, 'blocageSubi')} contre ${terme(bloqueLui, 'blocageValidation')}`]
  ];

  console.log('\nVALIDATION GARANTIE ET BLOCAGE SUBI');
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
