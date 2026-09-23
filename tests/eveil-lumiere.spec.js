const { test, expect } = require('@playwright/test');

/* LA PENOMBRE, et son reglage.

   Le parcours se joue dans un monde eteint : ses propres lumieres — balise,
   fil, rune, compagnon — deviennent alors les seules choses qui brillent. La
   nuit se leve d'un acte a l'autre.

   Ce harnais verifie les trois choses qui peuvent casser : le reglage par
   defaut (Number(null) vaut 0, ce qui donnait le noir absolu), la reponse
   immediate au reglage, et surtout la RESTITUTION — le jeu normal ne doit
   garder aucune trace de l'obscurite du tutoriel. */
test.setTimeout(180000);

test('le monde est eteint pendant le parcours, et rendu apres', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="tutorial"]').first().click();
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?._debug()?.pret, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const defaut = await page.evaluate(() => window.ILYOS_TUTORIAL.lumiere());
  expect(defaut.reglage).toBe(1);
  console.log('ACTE I', JSON.stringify(await page.evaluate(() => window.ILYOS_TUTORIAL.lumiere())));
  await page.screenshot({ path: 'test-results/lumiere/1-acte-I.png' });

  for (const v of [0.4, 1.6]) {
    await page.evaluate(x => window.ILYOS_TUTORIAL.lumiere(x), v);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'test-results/lumiere/reglage-' + v + '.png' });
    console.log('REGLAGE', v, JSON.stringify(await page.evaluate(() => window.ILYOS_TUTORIAL.lumiere())));
  }
  await page.evaluate(() => window.ILYOS_TUTORIAL.lumiere(1));

  // La lumiere doit etre RENDUE en sortant : le jeu normal ne garde rien.
  const avant = await page.evaluate(() => window.kaykit3D.renderer.toneMappingExposure);
  await page.evaluate(() => window.ILYOS_TUTORIAL.exit());
  await page.waitForTimeout(800);
  const apres = await page.evaluate(() => window.kaykit3D?.renderer?.toneMappingExposure ?? null);
  console.log('EXPOSITION pendant', avant, '-> apres sortie', apres);
  expect(avant).toBeLessThan(apres);          // il faisait bien plus sombre
  expect(apres).toBeCloseTo(0.96, 2);         // et tout est rendu
  expect(await page.evaluate(() =>
    !!document.querySelector('#tutorialLayer .eveil-nuit'))).toBe(false);
  expect(errs).toEqual([]);
});
