const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const ORIGINE = process.env.ILYOS_BENCH_URL || 'http://localhost:8123/';

// Même horizon payé que la riposte (3), mais ramassage + relais gratuits.
const relais = {
  seed: 910, islandPlacedThisTurn: false,
  hands: { 0: ['MOVE', 'MOVE'], 1: [] },
  islands: [{ owner: 0, shapeKey: 'line3', cells: [[0,1],[0,2],[0,3],[0,4]] }],
  characters: [{ id: 'porteur', player: 0, r: 0, c: 3 },
               { id: 'relais', player: 0, r: 0, c: 2 }],
  crowns: [{ r: 0, c: 4, active: true }, null]
};
const ramassage = {
  ...relais, islandPlacedThisTurn: true,
  characters: [{ id: 'porteur', player: 0, r: 0, c: 2 }],
  crowns: [{ r: 0, c: 3, active: true }, null],
  hands: { 0: ['MOVE'], 1: [] }
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
    await page.evaluate(() => { ILYOS_BENCH.reinitialiser(); ILYOS_BENCH.anticipation(0, false); });

    for (const [nom, spec, decisionsMax] of [
      ['ramassage puis déplacement', ramassage, 1],
      ['ramassage après épuisement du budget payé', ramassage, 0],
      ['pose et relais dans un horizon de riposte', relais, 3]
    ]) {
      const rapport = await page.evaluate(({spec, decisionsMax}) =>
        ILYOS_BENCH.plan(spec, { decisionsMax }), {spec, decisionsMax});
      const actions = rapport.detail;
      const payantes = actions.filter(a => !['RAMASSAGE', 'TRANSMISSION'].includes(a.type));
      assert.ok(payantes.length <= decisionsMax, nom + ' : plafond payé dépassé');
      assert.ok(actions.some(a => a.type === 'RAMASSAGE'), nom + ' : couronne ignorée');
      if (decisionsMax > 0) {
        // Suivre les cases et la couronne sans réutiliser l'évaluateur.
        const positions = new Map(spec.characters.map(g => [g.id, [g.r,g.c]]));
        let porteur = null;
        for (const a of actions) {
          if (a.type === 'MOVE') positions.set(a.charId, [a.r,a.c]);
          if (a.type === 'RAMASSAGE') porteur = a.charId;
          if (a.type === 'TRANSMISSION' && porteur === a.deId) porteur = a.versId;
        }
        assert.ok([[0,0],[0,1],[1,0]].some(c => String(c) === String(positions.get(porteur))),
          nom + ' : couronne hors validation');
      }
      if (!spec.islandPlacedThisTurn) assert.ok(actions.some(a => a.type === 'POSE'), 'pose obligatoire oubliée');
      console.log(`${nom}: OK (${rapport.plan.join(' → ')}, ${rapport.dureeMs} ms)`);
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
