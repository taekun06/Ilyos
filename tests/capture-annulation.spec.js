/* Coup proposé (visionneuse des défaites) : une action ANNULÉE ne doit pas
   rester dans la liste des actions enregistrées. Dossier du 07/10 : un
   ramassage en double au tour 4, deux poses au tour 16 pour une seule île —
   l'évaluation, faite sur la position réelle, était juste ; le texte non. */
const { test, expect } = require('@playwright/test');

test('une action annulée sort de la liste du coup proposé', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="duel"]').first().click();
  await menu.locator('text=LANCER LE DUEL').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => typeof window.ILYOS_BENCH?.evaluation === 'function');
  await page.evaluate(() => {
    window.ILYOS_BENCH.evaluation({
      seed: 3, aiPlayer: 0, islandPlacedThisTurn: true, hands: [['MOVE'], []],
      islands: [{ owner: 0, cells: [[2, 2], [2, 3], [2, 4]], fromSetup: false },
                { owner: 1, cells: [[8, 8], [8, 7]], fromSetup: false }],
      characters: [{ id: 'a', player: 0, r: 2, c: 2 }, { id: 'b', player: 1, r: 8, c: 8 }],
      crowns: [{ r: 2, c: 3 }, null]
    });
    window.ILYOS_BENCH.mainAuJoueur(0);
    window.ILYOS_AUTOPSIE.capture(true);
  });
  const capture = () => page.evaluate(() => window.ILYOS_AUTOPSIE.capture());
  const ramasser = async () => {
    await page.locator('.cell[data-r="2"][data-c="2"]').dispatchEvent('click');
    await page.locator('.cell[data-r="2"][data-c="3"]').dispatchEvent('click');
  };

  await ramasser();
  await expect.poll(capture).toEqual(['RAMASSAGE par (2,2)']);

  // Annulation : la couronne retombe, et le ramassage sort de la liste.
  await page.locator('#cancelCardBtn').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => JSON.parse(window.ILYOS_BENCH.etatComplet()).artifact.carrierId)).toBeNull();
  await expect.poll(capture).toEqual([]);

  // Rejoué : une seule fois dans la liste.
  await ramasser();
  await expect.poll(capture).toEqual(['RAMASSAGE par (2,2)']);

  await page.evaluate(() => window.ILYOS_AUTOPSIE.capture(false));
  expect(erreurs).toEqual([]);
});
