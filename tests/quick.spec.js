/* Quick, la partie guidée : le tour en cours se reprend à son début sans
   toucher aux tours précédents, et la poussée ratée (une seule carte) fait
   reprendre le tour d'elle-même, faute de cartes pour aboutir. */

const { test, expect } = require('@playwright/test');

const etat = page => page.evaluate(() => JSON.parse(window.ILYOS_BENCH.etatComplet()));

test('reprendre le tour remet la position du début du tour', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', error => erreurs.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_QUICK?.aller === 'function' && !!window.kaykit3D?.hitMeshes?.length);
  await page.evaluate(() => window.ILYOS_QUICK.aller(2));
  const avant = await etat(page);

  // Le joueur reprend la couronne : la position change.
  await page.locator('.cell[data-r="5"][data-c="4"]').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.ILYOS_QUICK.etat().etape)).toBe(1);
  expect((await etat(page)).artifact.carrierId).not.toBe(avant.artifact.carrierId);

  await page.locator('#qk-layer .qk-reprendre').click();
  const apres = await etat(page);
  expect(apres.artifact.carrierId).toBe(avant.artifact.carrierId);
  expect(apres.characters.map(c => `${c.player}@${c.r},${c.c}`)).toEqual(avant.characters.map(c => `${c.player}@${c.r},${c.c}`));
  expect(await page.evaluate(() => window.ILYOS_QUICK.etat().etape)).toBe(0);
  expect(erreurs).toEqual([]);
});

async function cliquer(page, r, c) {
  const { x, y } = await page.evaluate(([r, c]) => {
    const k = window.kaykit3D, rect = k.canvas.getBoundingClientRect();
    const hit = k.hitMeshes.find(m => m.userData.r === r && m.userData.c === c);
    const v = hit.getWorldPosition(new window.THREE.Vector3()).project(k.camera);
    return { x: rect.left + (v.x * .5 + .5) * rect.width, y: rect.top + (-v.y * .5 + .5) * rect.height };
  }, [r, c]);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

test('une poussée trop courte fait reprendre le tour', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_QUICK?.aller === 'function' && !!window.kaykit3D?.hitMeshes?.length);
  await page.evaluate(() => window.ILYOS_QUICK.aller(2));
  const avant = await etat(page);
  await page.locator('.cell[data-r="5"][data-c="4"]').dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.ILYOS_QUICK.etat().etape)).toBe(1);
  await page.waitForTimeout(1500);

  // Une seule case de poussée au lieu de deux : il ne reste qu'une carte
  // Pousser, la file ne peut plus tomber, le tour repart de son début.
  await cliquer(page, 5, 5);
  await expect.poll(async () => (await etat(page)).phase).toBe('SMART_CHAR');
  await cliquer(page, 5, 4);
  await expect.poll(async () => (await etat(page)).phase).toBe('ACTION');
  await page.waitForTimeout(1500);
  await cliquer(page, 5, 3);
  await expect.poll(async () => (await etat(page)).characters.filter(c => c.player === 1).map(c => `${c.r},${c.c}`).join(' ')).toBe('5,3 5,2');
  await expect.poll(() => page.evaluate(() => window.ILYOS_QUICK.etat().etape), { timeout: 8000 }).toBe(0);
  const apres = await etat(page);
  expect(apres.characters.map(c => `${c.player}@${c.r},${c.c}`)).toEqual(avant.characters.map(c => `${c.player}@${c.r},${c.c}`));
});
