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

test('Z, E, Tab, Retour et M pilotent une énigme sans souris', async ({ page }) => {
  const erreurs = await ouvrirEnigme(page);

  // E = Pousser : les destinations de poussée sont proposées.
  await page.keyboard.press('e');
  await expect.poll(async () => (await page.evaluate(() => window.ILYOS_PUZZLE._debug())).pushOptions.length).toBeGreaterThan(0);
  // Retour annule la sélection.
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await page.evaluate(() => window.ILYOS_PUZZLE._debug())).pushOptions.length).toBe(0);

  // Z = Déplacer, puis Tab parcourt les gardiens proposés.
  await page.keyboard.press('z');
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
  // Sans sélection en cours, Échap ouvre aussi le menu.
  await page.keyboard.press('Escape');
  await expect(page.locator('#hudV2GearPopover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hudV2GearPopover')).toBeHidden();

  expect(erreurs).toEqual([]);
});

/* Les indices de touches suivent l'entrée utilisée : clavier par défaut,
   manette dès qu'un bouton est pressé, clavier de nouveau à la frappe. */
test('les indices passent du clavier à la manette et reviennent', async ({ page }) => {
  await page.addInitScript(() => {
    window.__pad = {
      id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
    };
    navigator.getGamepads = () => [window.__pad];
  });
  const erreurs = await ouvrirEnigme(page);
  const indice = id => page.locator(`#${id} > .ilyos-touche`);

  await expect(indice('ov2Push')).toHaveText('E');
  await expect(indice('ov2Island')).toHaveText('A');

  // Un appui sur R3 suffit à basculer (il recadre seulement la vue).
  await page.evaluate(() => { window.__pad.buttons[11].pressed = true; });
  /* Maintenu jusqu'à ce que la boucle de la manette l'ait lu : sans GPU, les
     images sont rares et un appui bref passait entre deux lectures. */
  await page.waitForFunction(() => document.body.dataset.entree === 'manette', null, { timeout: 15000 });
  await page.evaluate(() => { window.__pad.buttons[11].pressed = false; });
  await expect(indice('ov2Push')).toHaveText('X');
  await expect(indice('ov2Magic')).toHaveText('RT');

  await page.keyboard.press('Shift');
  await expect(indice('ov2Push')).toHaveText('E');
  expect(erreurs).toEqual([]);
});
