const { test } = require('@playwright/test');
test('charniere : optimum apres le verrou', async ({ page }) => {
  test.setTimeout(2400000);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_PUZZLE?.startById === 'function');
  await page.evaluate(() => window.ILYOS_PUZZLE.unlockAll());
  const i = await page.evaluate(() => window.ILYOS_PUZZLE.list().findIndex(p => p.id === 'p16-charniere'));
  const s = await page.evaluate(k => window.ILYOS_PUZZLE.solve(k, 7, 1500, 5000000), i);
  console.log(`>>> cout=${s.cout} noeuds=${s.noeuds} ${s.error || ''} ${JSON.stringify(s.chemin || [])}`);
});
