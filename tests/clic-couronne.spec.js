/* Gardien sélectionné, puis clic sur la couronne voisine : la couronne est
   ramassée par CE gardien (geste gratuit), qu'on ait une carte POUSSER ou non.
   Signalé le 01/10 : le clic ne faisait rien — la couronne voisine n'était
   proposée qu'à la poussée, et sans carte POUSSER à rien du tout. */
const { test, expect } = require('@playwright/test');

async function poserPosition(page, mains) {
  await page.evaluate(m => {
    window.ILYOS_BENCH.evaluation({
      seed: 3, aiPlayer: 0, islandPlacedThisTurn: true, hands: m,
      islands: [{ owner: 0, cells: [[2, 2], [2, 3], [2, 4]], fromSetup: false },
                { owner: 1, cells: [[8, 8], [8, 7]], fromSetup: false }],
      characters: [{ id: 'a', player: 0, r: 2, c: 2 }, { id: 'b', player: 1, r: 8, c: 8 }],
      crowns: [{ r: 2, c: 3 }, null]
    });
    window.ILYOS_BENCH.mainAuJoueur(0);
  }, mains);
}

const porteur = page => page.evaluate(() => {
  const etat = JSON.parse(window.ILYOS_BENCH.etatComplet());
  return etat.artifact.carrierId;
});

for (const [nom, mains] of [['sans carte POUSSER', [['MOVE'], []]], ['avec une carte POUSSER', [['PUSH', 'MOVE'], []]]]) {
  test(`clic gardien puis couronne voisine : ramassage (${nom})`, async ({ page }) => {
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(e.message));
    await page.goto('/');
    const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
    await menu.locator('[data-mode="duel"]').first().click();
    await menu.locator('text=LANCER LE DUEL').first().click();
    await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
    await page.waitForFunction(() => typeof window.ILYOS_BENCH?.evaluation === 'function');
    await poserPosition(page, mains);

    await page.locator('.cell[data-r="2"][data-c="2"]').dispatchEvent('click');
    await page.locator('.cell[data-r="2"][data-c="3"]').dispatchEvent('click');
    await expect.poll(() => porteur(page)).toBe('a');
    expect(erreurs).toEqual([]);
  });
}
