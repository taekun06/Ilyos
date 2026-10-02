const { test, expect } = require('@playwright/test');
const path = require('node:path');

test('prototype opt-in, fichier absent, import GLB et bascule réversible', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#knight-ab-launch')).toHaveCount(0);
  await page.goto('/?knightAB=1');
  await page.waitForFunction(() => !!window.ILYOS_TUTORIAL?.startDiscovery);
  await page.evaluate(() => window.ILYOS_TUTORIAL.startDiscovery());
  await page.waitForFunction(() => window.ILYOS_TUTORIAL._debug()?.pret, null, { timeout: 30000 });
  await page.waitForFunction(() => [...(window.kaykit3D?.characterVisuals.values() || [])].some(v => v.assetKey === 'hero0' && v.wrapper.visible));
  await page.evaluate(() => {
    const OriginalRenderer = THREE.WebGLRenderer;
    THREE.WebGLRenderer = function(...args) {
      const instance = new OriginalRenderer(...args);
      const render = instance.render;
      instance.render = function(scene, camera) {
      const result = render.call(this, scene, camera);
      const a = scene.getObjectByName('knight-ab-a');
      const b = scene.getObjectByName('knight-ab-b');
      if (a && b) {
        const boxA = new THREE.Box3().setFromObject(a);
        const boxB = new THREE.Box3().setFromObject(b);
        const lights = [];
        scene.traverse(n => { if (n.isLight) lights.push([n.type, n.color.getHex(), n.intensity, ...n.position.toArray()]); });
        window.abMeasurement = {
          camera: [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements], lights,
          heightA: boxA.max.y - boxA.min.y, heightB: boxB.max.y - boxB.min.y,
          floorA: boxA.min.y, floorB: boxB.min.y,
          centerA: boxA.getCenter(new THREE.Vector3()).toArray(),
          centerB: boxB.getCenter(new THREE.Vector3()).toArray(),
          sameAnchor: a.parent === b.parent,
          quaternionA: a.quaternion.toArray(), quaternionB: b.quaternion.toArray()
        };
      }
      return result;
      };
      return instance;
    };
  });
  await page.locator('#knight-ab-launch').click();
  const dialog = page.locator('#knight-ab-dialog');
  await expect(dialog.locator('[data-status]')).toContainText('Knight_Sentinel.glb');
  await expect(dialog.locator('[data-b]')).toBeDisabled();
  await page.screenshot({ path: 'test-results/knight-ab-missing.png' });
  await dialog.locator('[data-close]').click();
  await expect(dialog).toHaveCount(0);
  // Fixture seulement : le vrai Sentinel n'est pas disponible. Aucun asset copié.
  await page.route('**/assets/prototypes/knight-sentinel/Knight_Sentinel.glb', route => route.fulfill({
    path: path.resolve(__dirname, '../assets/kaykit/characters/Knight.glb'), contentType: 'model/gltf-binary'
  }));
  await page.locator('#knight-ab-launch').click();
  await expect(dialog.locator('[data-b]')).toBeEnabled();
  await expect(dialog.locator('[data-status]')).toContainText('Meshy chargé');
  const before = await page.evaluate(() => window.abMeasurement);
  expect(before.sameAnchor).toBe(true);
  expect(before.heightB).toBeCloseTo(before.heightA, 5);
  expect(before.floorB).toBeCloseTo(before.floorA, 5);
  before.centerA.forEach((v, i) => expect(before.centerB[i]).toBeCloseTo(v, 5));
  expect(before.quaternionB).toEqual(before.quaternionA);
  await dialog.locator('[data-b]').click();
  const after = await page.evaluate(() => window.abMeasurement);
  expect(after.camera).toEqual(before.camera);
  expect(after.lights).toEqual(before.lights);
  await expect(dialog.locator('[data-b]')).toHaveAttribute('aria-pressed', 'true');
  await dialog.locator('[data-yaw]').selectOption('180');
  await dialog.locator('[data-a]').click();
  await expect(dialog.locator('[data-a]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/knight-ab-loaded-fixture.png' });
  console.log(await dialog.locator('[data-stats]').textContent());
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
