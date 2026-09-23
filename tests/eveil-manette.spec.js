const { test, expect } = require('@playwright/test');

/* PARITE MANETTE — verifiee, pas supposee.

   gamepad.js interroge navigator.getGamepads() a chaque image. On lui presente
   donc une manette synthetique, pilotable depuis le test : axes 0/1 = stick
   gauche (navigation), axes 2/3 = stick droit (camera), boutons standard.

   Ce harnais ne rejoue pas les seize etapes au pad — il prouve que le tutoriel
   VOIT les gestes de la manette : tourner le monde, choisir un Gardien. Les
   actions passent ensuite par dispatchKayKitClick et button.click(), c'est-a-
   dire exactement le chemin deja couvert par tests/eveil.spec.js. */
test.setTimeout(180000);

const BOUTON = { A: 0, B: 1, X: 2, Y: 3 };

async function brancherManette(page) {
  await page.addInitScript(() => {
    window.__pad = {
      connected: true, id: 'ILYOS test pad', index: 0, mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      timestamp: 0
    };
    navigator.getGamepads = () => [window.__pad, null, null, null];
  });
}

// Maintient un etat de manette pendant quelques images.
async function tenir(page, { axes = null, bouton = null }, images = 6) {
  await page.evaluate(({ axes, bouton }) => {
    if (axes) window.__pad.axes = axes;
    if (bouton !== null) window.__pad.buttons[bouton] = { pressed: true, value: 1 };
    window.__pad.timestamp = performance.now();
  }, { axes, bouton });
  await page.waitForTimeout(images * 20);
  await page.evaluate(b => {
    window.__pad.axes = [0, 0, 0, 0];
    if (b !== null) window.__pad.buttons[b] = { pressed: false, value: 0 };
    window.__pad.timestamp = performance.now();
  }, bouton);
  await page.waitForTimeout(80);
}

test('le tutoriel voit la manette', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await brancherManette(page);

  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="tutorial"]').first().click();
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?._debug()?.pret, null, { timeout: 30000 });

  expect(await page.evaluate(() => window.ILYOS_TUTORIAL._debug()?.id)).toBe('eveil');

  // ETAPE 1 — tourner le monde, au stick droit.
  for (let i = 0; i < 12; i++) {
    await tenir(page, { axes: [0, 0, 0.9, 0.2] }, 8);
    if (await page.evaluate(() => window.ILYOS_TUTORIAL._debug()?.id !== 'eveil')) break;
  }
  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'nom' && !d.souffle;
  }, null, { timeout: 30000 });
  await page.screenshot({ path: 'test-results/manette/1-monde-tourne.png' });

  // ETAPE 2 — choisir son Gardien : haut/bas parcourt les allies, A valide.
  await tenir(page, { axes: [0, -0.9, 0, 0] }, 8);
  await tenir(page, { bouton: BOUTON.A }, 6);

  await page.waitForFunction(() => {
    const d = window.ILYOS_TUTORIAL._debug();
    return d?.id === 'premier-pas' || !!d?.selectedCharId;
  }, null, { timeout: 20000 });

  const d = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  console.log('APRES MANETTE', JSON.stringify({ id: d.id, selection: d.selectedCharId }));
  await page.screenshot({ path: 'test-results/manette/2-gardien-choisi.png' });
  expect(errs).toEqual([]);
});
