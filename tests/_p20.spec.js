const { test } = require('@playwright/test');
test('trace : optimum', async ({ page }) => {
  test.setTimeout(1800000);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_PUZZLE?.startById === 'function');
  await page.evaluate(() => window.ILYOS_PUZZLE.unlockAll());
  const i = await page.evaluate(() => window.ILYOS_PUZZLE.list().findIndex(p => p.id === 'p20-la-plus-courte-trace'));
  const s = await page.evaluate(k => window.ILYOS_PUZZLE.solve(k, 6, 900, 3000000), [i][0]);
  console.log(`>>> cout=${s.cout} noeuds=${s.noeuds} ${s.error || ''} ${JSON.stringify(s.chemin || [])}`);
});
