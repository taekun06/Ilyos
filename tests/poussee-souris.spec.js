/* Une poussée jouée À LA SOURIS dans la scène 3D : clic sur son gardien, clic
   sur le rival, clic sur la case d'arrivée.

   Signalé le 20/10 : « quelquefois les poussées ne fonctionnent pas du premier
   coup ». Les zones cliquables des destinations disparaissaient de l'index de
   la scène dès qu'une synchronisation passait sans redessiner l'aperçu : les
   anneaux restaient visibles mais muets, et le clic retombait sur la case,
   souvent masquée par un gardien. Joué au tour 3 de la partie guidée Quick :
   reprendre la couronne, puis pousser la file de deux rivaux de deux cases. */

const { test, expect } = require('@playwright/test');

async function pointEcran(page, r, c) {
  return page.evaluate(([r, c]) => {
    const k = window.kaykit3D, rect = k.canvas.getBoundingClientRect();
    const hit = k.hitMeshes.find(m => m.userData.r === r && m.userData.c === c);
    const v = hit.getWorldPosition(new window.THREE.Vector3()).project(k.camera);
    return { x: rect.left + (v.x * .5 + .5) * rect.width, y: rect.top + (-v.y * .5 + .5) * rect.height };
  }, [r, c]);
}

async function cliquer(page, { x, y }) {
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

test('les destinations de poussée restent cliquables après le choix du rival', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', error => erreurs.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_QUICK?.aller === 'function' && !!window.kaykit3D?.hitMeshes?.length);
  await page.evaluate(() => window.ILYOS_QUICK.aller(2));
  await page.waitForTimeout(1500);

  // Un clic sur le porteur rival reprend la couronne (étape « voler »).
  await cliquer(page, await pointEcran(page, 5, 4));
  await expect.poll(() => page.evaluate(() => window.ILYOS_QUICK.etat().etape)).toBe(1);
  await page.waitForTimeout(1500);

  await cliquer(page, await pointEcran(page, 5, 5));
  await expect.poll(() => page.evaluate(() => JSON.parse(window.ILYOS_BENCH.etatComplet()).phase)).toBe('SMART_CHAR');
  await cliquer(page, await pointEcran(page, 5, 4));
  await expect.poll(() => page.evaluate(() => JSON.parse(window.ILYOS_BENCH.etatComplet()).phase)).toBe('ACTION');
  await page.waitForTimeout(1500);

  // Chaque zone dessinée est aussi indexée pour le lancer de rayon.
  const zones = await page.evaluate(() => {
    const k = window.kaykit3D;
    return {
      dessinees: k.actionPreviewGroup.children.filter(m => m.userData.ilyosInteraction).length,
      indexees: k.interactiveMeshes.filter(m => m.userData.ilyosInteraction).length
    };
  });
  expect(zones.dessinees).toBe(2);
  expect(zones.indexees).toBe(zones.dessinees);

  // Un seul clic sur la case la plus lointaine pousse la file de deux cases :
  // le premier rival atterrit au bord, le second tombe dans le vide.
  await cliquer(page, await pointEcran(page, 5, 2));
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(window.ILYOS_BENCH.etatComplet()).characters.filter(c => c.player === 1).map(c => `${c.r},${c.c}`).join(' '))).toBe('5,2');
  await expect.poll(() => page.evaluate(() => window.ILYOS_QUICK.etat().etape)).toBe(2);
  expect(erreurs).toEqual([]);
});
