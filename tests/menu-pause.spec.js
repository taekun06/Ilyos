/* Le menu de jeu met la partie en pause : le minuteur du tour est gelé, et
   l'IA attend la fermeture du menu pour jouer. Échap ne l'ouvre pas. */
const { test, expect } = require('@playwright/test');

async function partieSolo(page) {
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  const minuteur = menu.locator('.selector-field[data-key="timer"]');
  for (let i = 0; i < 6 && (await minuteur.locator('.value-text').textContent()).trim() !== '1 MINUTE'; i++) {
    await minuteur.locator('[data-step="1"]').click();
  }
  const difficulte = menu.locator('[data-key="difficulty"] [data-step="-1"]').first();
  for (let i = 0; i < 4; i++) await difficulte.click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => window.ILYOS_TEST?.joueurCourant?.(), null, { timeout: 30000 });
}

const courant = page => page.evaluate(() => window.ILYOS_TEST.joueurCourant());
const menuOuvert = page => page.evaluate(() => document.body.classList.contains('mj-menu-ouvert'));

test('le menu met la partie en pause, Échap ne l’ouvre pas', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await partieSolo(page);

  // Attendre la main du joueur humain.
  await expect.poll(async () => !(await courant(page)).ia, { timeout: 60000 }).toBe(true);
  await page.waitForTimeout(1500);

  // Échap n'ouvre pas le menu.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  expect(await menuOuvert(page)).toBe(false);

  // Minuteur gelé tant que le menu est ouvert.
  await page.locator('#ov2Gear').click({ force: true });
  await expect.poll(() => menuOuvert(page)).toBe(true);
  const avant = await page.locator('#turnTimer').textContent();
  await page.waitForTimeout(3000);
  expect(await page.locator('#turnTimer').textContent()).toBe(avant);
  await page.locator('#hudV2GearPopover .mj-reprendre').click();
  await expect.poll(() => menuOuvert(page)).toBe(false);
  await expect.poll(() => page.locator('#turnTimer').textContent(), { timeout: 5000 }).not.toBe(avant);

  // L'IA attend : on passe la main, on ouvre le menu aussitôt.
  const tour = (await courant(page)).tour;
  await page.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
  await page.locator('#ov2Gear').click({ force: true });
  await expect.poll(() => menuOuvert(page)).toBe(true);
  await page.waitForTimeout(6000);
  const pendant = await courant(page);
  expect(pendant.ia, 'toujours au tour de l’IA').toBe(true);
  expect(pendant.tour).toBe(tour + 1);
  await page.locator('#hudV2GearPopover .mj-reprendre').click();
  await expect.poll(async () => (await courant(page)).ia, { timeout: 60000 }).toBe(false);
  expect(erreurs).toEqual([]);
});
