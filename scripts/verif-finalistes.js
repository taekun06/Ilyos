/* Position extraite de l'autopsie d'une partie (graine 910, tour 4).
   Quatre variantes de POSE occupaient toutes les places de riposte : le
   porteur avançait jusqu'en (7,5), alors que l'arrêt en (6,6), déjà trouvé,
   résistait mieux à la même recherche adverse. Aucun poids n'est ajusté.
   node scripts/verif-finalistes.js — serveur de développement port 8123. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';
const spec = {
  seed: 914, aiPlayer: 1, turn: 4, islandPlacedThisTurn: false,
  hands: { 0: [], 1: ['MOVE', 'MOVE', 'MAGIC', 'MOVE', 'PUSH'] },
  stash: { 0: { MOVE: 0, PUSH: 1, MAGIC: 0 }, 1: { MOVE: 2, PUSH: 1, MAGIC: 0 } },
  islands: [
    { shapeKey: 't4', owner: 0, cells: [[8,4],[7,4],[6,4],[7,5]], fromSetup: false },
    { shapeKey: 'square', owner: 1, cells: [[6,6],[6,7],[7,6],[7,7]], fromSetup: false },
    { shapeKey: 'square', owner: 0, cells: [[3,6],[3,7],[4,6],[4,7]], fromSetup: false }
  ],
  characters: [{ id: 'char-102', player: 0, r: 6, c: 6 }],
  crowns: [{ r: 5, c: 6, carrierId: null, active: true },
           { r: 5, c: 5, carrierId: 'char-102', active: true }]
};
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(ORIGINE);
    await page.waitForFunction(() => !!window.ILYOS_BENCH);
    await page.evaluate(() => ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 1 }));
    await page.waitForFunction(() => ILYOS_TEST.autoplay?.active === true);
    await page.evaluate(() => { ILYOS_TEST.stopAutoplay(); ILYOS_BENCH.reinitialiser(); });
    await page.waitForTimeout(3000);
    await page.evaluate(() => ILYOS_BENCH.reinitialiser());
    for (let i = 0; i < 3; i++) {
      // Garder la limite d'états ; éviter que la charge de la machine coupe
      // l'arbre principal avant les plans qui reproduisent le défaut.
      const rapport = await page.evaluate(s => ILYOS_BENCH.plan(s, { tempsMaxMs: 5000 }), spec);
      assert.equal(rapport.anticipation.examines, 4, 'le nombre de ripostes doit rester inchangé');
      assert.ok(new Set(rapport.finalistes.slice(0, 4).map(f => f.plan.join(','))).size > 1,
        'les variantes de pose masquent encore les autres continuations');
      const dernierMove = rapport.detail.filter(a => a.type === 'MOVE').at(-1);
      assert.deepEqual([dernierMove?.r, dernierMove?.c], [6, 6],
        'le porteur poursuit la ligne plus exposée plutôt que le plan déjà trouvé');
      console.log(`Passage ${i + 1}: OK — ${rapport.plan.join(' → ')}, quatre ripostes`);
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
