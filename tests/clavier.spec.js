/* Raccourcis clavier d'une partie (js/game/clavier.js).

   Joués sur une énigme : des gardiens sont posés dès l'ouverture, et le
   dock y est complet. Tout est lu dans le DOM ou ILYOS_PUZZLE._debug(). */

const { test, expect } = require('@playwright/test');

async function ouvrirEnigme(page) {
  const erreurs = [];
  page.on('pageerror', error => erreurs.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_PUZZLE?.startById === 'function');
  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p09-fardeau'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p09-fardeau');
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().inputLocked === false, null, { timeout: 15000 });
  await page.locator('body').focus();
  return erreurs;
}

const gardienPris = page => page.evaluate(() => {
  const cell = document.querySelector('.cell.selected-character');
  return cell ? `${cell.dataset.r},${cell.dataset.c}` : null;
});

test('2, 3, Tab, Retour et M pilotent une énigme sans souris', async ({ page }) => {
  const erreurs = await ouvrirEnigme(page);

  // 3 = Pousser : les destinations de poussée sont proposées.
  await page.keyboard.press('3');
  await expect.poll(async () => (await page.evaluate(() => window.ILYOS_PUZZLE._debug())).pushOptions.length).toBeGreaterThan(0);
  // Retour annule la sélection.
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await page.evaluate(() => window.ILYOS_PUZZLE._debug())).pushOptions.length).toBe(0);

  // 2 = Déplacer, puis Tab parcourt les gardiens proposés.
  await page.keyboard.press('2');
  const offerts = await page.evaluate(() => document.querySelectorAll('.cell .character.selectable').length);
  expect(offerts).toBeGreaterThan(1);
  await page.keyboard.press('Tab');
  const premier = await gardienPris(page);
  expect(premier).not.toBeNull();
  if (offerts > 1) {
    await page.keyboard.press('Tab');
    await expect.poll(() => gardienPris(page)).not.toBe(premier);
    expect(await gardienPris(page)).not.toBeNull();
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => gardienPris(page)).toBe(premier);
  }
  await page.keyboard.press('Escape');

  // M ouvre le menu ; Échap le referme.
  await page.keyboard.press('m');
  await expect(page.locator('#hudV2GearPopover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hudV2GearPopover')).toBeHidden();

  expect(erreurs).toEqual([]);
});
