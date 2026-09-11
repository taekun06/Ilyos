/* Couche manette (js/game/gamepad.js) (js/game/gamepad.js).
   Une vraie manette n'existe pas en headless : on injecte un objet Gamepad
   factice avant le chargement, ce que la Gamepad API permet de simuler
   puisque la couche ne lit que navigator.getGamepads(). */

const { test, expect } = require('@playwright/test');

const FAUSSE_MANETTE = () => {
  window.__pad = {
    id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  };
  navigator.getGamepads = () => [window.__pad];
};

async function appuyer(page, index, duree = 120) {
  await page.evaluate(i => { window.__pad.buttons[i].pressed = true; }, index);
  await page.waitForTimeout(duree);
  await page.evaluate(i => { window.__pad.buttons[i].pressed = false; }, index);
  await page.waitForTimeout(180);
}

test('la manette pilote le curseur, le survol et les boutons du HUD', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  /* Le serveur de developpement local lache parfois une connexion sur un
     asset (ERR_CONNECTION_RESET) : c'est du bruit de transport, sans rapport
     avec la manette, et le retenir rendait ce test instable environ une fois
     sur cinq. On ne garde que ce qui revele un vrai defaut de code. */
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const texte = message.text();
    if (/Failed to load resource|net::ERR_/.test(texte)) return;
    incidents.push(texte);
  });

  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');

  // La couche s'installe dès le parsing du bundle, avant toute partie.
  expect(await page.locator('#ilyosGamepadStyle').count()).toBe(1);

  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.kaykit3D?.orbit, null, { timeout: 60000 });
  await page.waitForTimeout(6000);

  const survol = () => page.evaluate(() => {
    const cellule = window.kaykit3D?.hoverCell;
    return cellule && !cellule.special ? `${cellule.r},${cellule.c}` : null;
  });

  // Croix directionnelle : première pression = curseur au centre du plateau.
  await appuyer(page, 15);
  const premier = await survol();
  expect(premier, 'le premier appui doit poser le curseur sur une case').not.toBeNull();

  await appuyer(page, 15);
  const second = await survol();
  expect(second, 'le curseur doit avoir changé de case').not.toBe(premier);

  // RB : anneau de focus sur un contrôle réellement visible du HUD.
  await appuyer(page, 5);
  const focus = await page.evaluate(() => {
    const element = document.querySelector('.ilyos-gamepad-focus');
    return element ? (element.id || element.className) : null;
  });
  expect(focus, 'RB doit sélectionner un bouton visible').not.toBeNull();

  // A sur ce contrôle, puis B pour annuler : aucun des deux ne doit lever d'erreur.
  await appuyer(page, 0);
  await appuyer(page, 1);

  // Stick droit : rotation caméra.
  const azimut = () => page.evaluate(() => {
    const k = window.kaykit3D;
    const ecart = k.camera.position.clone().sub(k.orbit.target);
    return +Math.atan2(ecart.x, ecart.z).toFixed(3);
  });
  const avant = await azimut();
  await page.evaluate(() => { window.__pad.axes[2] = 1; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__pad.axes[2] = 0; });
  await page.waitForTimeout(300);
  expect(await azimut(), 'le stick droit doit tourner la caméra').not.toBe(avant);

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});
