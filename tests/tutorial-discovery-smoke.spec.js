const { test, expect } = require('@playwright/test');

async function startTutorial(page, method = 'start') {
  await page.goto('/');
  await page.waitForFunction(m => typeof window.ILYOS_TUTORIAL?.[m] === 'function', method);
  await page.evaluate(m => window.ILYOS_TUTORIAL[m](), method);
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));
}

test('le bouton tutoriel pointe vers la découverte et laisse la caméra libre', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await startTutorial(page, 'start');
  await page.waitForFunction(() => window.ILYOS_TUTORIAL.mode() === 'discovery');
  await page.waitForTimeout(2200);

  const snapshot = await page.evaluate(() => ({
    mode: window.ILYOS_TUTORIAL.mode(),
    debug: window.ILYOS_TUTORIAL._debug(),
    free: window.kaykit3D?.cameraMode,
    rotate: window.kaykit3D?.orbit?.enableRotate,
    pan: window.kaykit3D?.orbit?.enablePan,
    zoom: window.kaykit3D?.orbit?.enableZoom,
    discoveryClass: document.getElementById('gameScreen')?.classList.contains('tutorial-discovery')
  }));

  expect(snapshot.mode).toBe('discovery');
  expect(snapshot.debug?.id).toBe('regarder');
  expect(snapshot.free).toBe('free');
  expect(snapshot.rotate).toBe(true);
  expect(snapshot.pan).toBe(true);
  expect(snapshot.zoom).toBe(true);
  expect(snapshot.discoveryClass).toBe(true);
  expect(errors).toEqual([]);
});

test('La Première Ascension reste disponible séparément', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await startTutorial(page, 'startAscension');
  await page.waitForFunction(() => window.ILYOS_TUTORIAL.mode() === 'ascension');

  const snapshot = await page.evaluate(() => ({
    mode: window.ILYOS_TUTORIAL.mode(),
    debug: window.ILYOS_TUTORIAL._debug(),
    discoveryClass: document.getElementById('gameScreen')?.classList.contains('tutorial-discovery')
  }));

  expect(snapshot.mode).toBe('ascension');
  expect(snapshot.discoveryClass).toBe(false);
  expect(snapshot.debug?.legacy).toBeTruthy();
  expect(errors).toEqual([]);
});
