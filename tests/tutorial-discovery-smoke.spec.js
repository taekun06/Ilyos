const { test, expect } = require('@playwright/test');

async function startTutorial(page, method = 'start') {
  await page.goto('/');
  await page.waitForFunction(m => typeof window.ILYOS_TUTORIAL?.[m] === 'function', method);
  await page.evaluate(m => window.ILYOS_TUTORIAL[m](), method);
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));
}

async function startTutorialFromMenu(page) {
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="tutorial"]').first().click();
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?.mode() === 'discovery');
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));
}

async function waitForDiscoveryStep(page, id) {
  await page.waitForFunction(expected => window.ILYOS_TUTORIAL?._debug()?.id === expected, id, {
    timeout: 20000
  });
}

async function clickCell(page, r, c) {
  await page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');
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

test('Découverte se joue du bouton Tutoriel jusqu’à la validation', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await startTutorialFromMenu(page);
  page.setDefaultTimeout(25000);
  await waitForDiscoveryStep(page, 'regarder');

  const canvas = page.locator('#kaykitCanvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.56, { steps: 8 });
  await page.mouse.up();

  await waitForDiscoveryStep(page, 'gardien');
  let debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  await clickCell(page, debug.chars[0].r, debug.chars[0].c);

  await waitForDiscoveryStep(page, 'marcher');
  await page.locator('#ov2Move').click({ force: true });
  await clickCell(page, 5, 2);
  await clickCell(page, 5, 3);

  await waitForDiscoveryStep(page, 'vide');
  await clickCell(page, 6, 3);

  await waitForDiscoveryStep(page, 'ile');
  await page.locator('#ov2Island').click({ force: true });
  await page.locator('.island-choice').first().click({ force: true });
  await clickCell(page, 6, 3);
  await clickCell(page, 6, 3);

  await waitForDiscoveryStep(page, 'couronne');
  debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  const crown = debug.crown;
  const guardian = debug.chars.find(ch => ch.p === 0 && Math.abs(ch.r - crown.r) + Math.abs(ch.c - crown.c) === 1);
  expect(guardian).toBeTruthy();
  await page.locator('#ov2Move').click({ force: true });
  await clickCell(page, guardian.r, guardian.c);
  await clickCell(page, crown.r, crown.c);

  await page.waitForFunction(() => !!window.ILYOS_TUTORIAL?._debug()?.crown?.carrierId);
  debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  expect(debug.secondCrown?.active).toBe(false);

  await waitForDiscoveryStep(page, 'transmission');
  debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  const firstCarrierId = debug.crown.carrierId;
  let firstCarrier = debug.chars.find(ch => ch.id === firstCarrierId);
  const otherGuardian = debug.chars.find(ch => ch.p === 0 && ch.id !== firstCarrierId);
  if (Math.abs(firstCarrier.r - otherGuardian.r) + Math.abs(firstCarrier.c - otherGuardian.c) !== 1) {
    const adjacent = { r: firstCarrier.r, c: otherGuardian.c };
    await page.locator('#ov2Move').click({ force: true });
    await clickCell(page, firstCarrier.r, firstCarrier.c);
    await clickCell(page, adjacent.r, adjacent.c);
    await page.waitForFunction(expected => {
      const debug = window.ILYOS_TUTORIAL?._debug();
      const carrier = debug?.chars?.find(ch => ch.id === debug.crown?.carrierId);
      return carrier?.r === expected.r && carrier?.c === expected.c;
    }, adjacent, { timeout: 5000 });
    firstCarrier = adjacent;
  }
  await page.locator('.carrier-crown').waitFor({ state: 'attached', timeout: 5000 });
  await page.locator('.carrier-crown').dispatchEvent('click');
  await clickCell(page, otherGuardian.r, otherGuardian.c);
  await page.waitForFunction(previous => {
    const crown = window.ILYOS_TUTORIAL?._debug()?.crown;
    return crown?.carrierId && crown.carrierId !== previous;
  }, firstCarrierId, { timeout: 5000 });

  await waitForDiscoveryStep(page, 'rival');
  debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  const carrier = debug.chars.find(ch => ch.id === debug.crown.carrierId);
  await page.locator('#ov2Move').click({ force: true });
  await clickCell(page, carrier.r, carrier.c);
  await clickCell(page, 1, 0);
  await page.waitForTimeout(800);
  debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  expect(debug.chars.find(ch => ch.id === debug.crown.carrierId)).toMatchObject({ r: 1, c: 0 });
  await page.waitForFunction(() => !window.ILYOS_TUTORIAL?._debug()?.inputLocked, null, { timeout: 15000 });

  await page.locator('#ov2Move').click({ force: true });
  await clickCell(page, 1, 0);
  await clickCell(page, 0, 0);
  await page.waitForFunction(() => {
    const debug = window.ILYOS_TUTORIAL?._debug();
    const carrier = debug?.chars?.find(ch => ch.id === debug.crown?.carrierId);
    return carrier?.r === 0 && carrier?.c === 0;
  }, null, { timeout: 5000 });
  await page.waitForFunction(() => !window.ILYOS_TUTORIAL?._debug()?.inputLocked, null, { timeout: 15000 });

  await page.locator('#ov2Push').click({ force: true });
  await clickCell(page, 0, 2);
  await page.waitForFunction(() => window.ILYOS_TUTORIAL?._debug()?.chars
    ?.some(ch => ch.p === 1 && ch.r === 0 && ch.c === 2), null, { timeout: 5000 });

  await waitForDiscoveryStep(page, 'tenir');
  await page.waitForFunction(() => {
    const debug = window.ILYOS_TUTORIAL?._debug();
    return debug?.validationRunning && debug.currentPlayer === 1;
  }, null, { timeout: 25000 });
  debug = await page.evaluate(() => window.ILYOS_TUTORIAL._debug());
  expect(debug.score).toBe(0);
  await page.waitForFunction(() => {
    const debug = window.ILYOS_TUTORIAL?._debug();
    return debug?.currentPlayer === 0 && debug.score >= 1;
  }, null, { timeout: 25000 });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
