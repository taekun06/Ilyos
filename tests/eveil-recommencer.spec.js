const { test, expect } = require('@playwright/test');

/* Le parcours retient l'etape atteinte et y reprend. « Recommencer » doit donc
   faire deux choses : oublier cette progression, et rejouer depuis le noir. */
test.setTimeout(180000);

const dbg = page => page.evaluate(() => window.ILYOS_TUTORIAL._debug());

test('Recommencer reprend L\'Eveil depuis le premier souffle', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="tutorial"]').first().click();
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?._debug()?.pret, null, { timeout: 30000 });

  // On avance de deux etapes : le monde et la progression changent.
  const box = await page.locator('#kaykitCanvas').boundingBox();
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .72, box.y + box.height * .58, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'nom' && !d.souffle;
  }, null, { timeout: 30000 });

  const avance = await dbg(page);
  expect(avance.id).toBe('nom');
  expect(await page.evaluate(() => localStorage.getItem('ilyos.tutorial.eveil.etape'))).toBe('1');

  // Le bouton existe, et il est discret.
  const bouton = page.locator('#tutorialLayer .eveil-refaire');
  await expect(bouton).toHaveCount(1);
  await bouton.click({ force: true });

  // On repasse par le sas d'ouverture : pret redevient faux, puis vrai.
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.pret === false, null, { timeout: 20000 });
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.pret === true, null, { timeout: 40000 });

  const repris = await dbg(page);
  console.log('APRES RECOMMENCER', JSON.stringify({ id: repris.id, chars: repris.chars, trace: repris.trace.length }));
  expect(repris.id).toBe('eveil');
  expect(repris.trace).toEqual([]);               // la trace repart de zero
  expect(repris.chars.filter(c => c.p === 0).length).toBe(1);   // un seul Gardien, comme au premier matin
  expect(repris.verbesVisibles).toEqual([]);      // aucun pouvoir acquis
  expect(errs).toEqual([]);
});
