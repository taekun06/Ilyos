// 2 contre 2, tour d'équipe simultané (js/game/equipe-simul.js) : les deux
// coéquipiers jouent le même tour, la main passe de l'un à l'autre, le tour
// ne passe à l'équipe adverse qu'au second « Prêt », et l'équipe CPU joue
// ses deux mains avant de rendre la main.
const { test, expect } = require('@playwright/test');

test('tour d’équipe simultané contre le CPU', async ({ page }) => {
  test.setTimeout(150000);
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.ILYOS_TEST, null, { timeout: 60000 });
  await expect.poll(() => !!page.frames().find(f => f.url().includes('menu/frame')), { timeout: 30000 }).toBe(true);
  const menu = page.frames().find(f => f.url().includes('menu/frame'));
  await page.waitForTimeout(1000);
  await menu.evaluate(() => parent.postMessage({ source: 'ilyos-menu', type: 'play', detail: { mode: 'team', values: { seats: 'ai24', villages: 'teamSimul', difficulty: 'easy', size: '11' } } }, location.origin));

  const mainHumaine = () => page.waitForFunction(() => window.ILYOS_EQUIPE?.etat()
    && !ILYOS_TEST.joueurCourant().ia && !document.getElementById('gameScreen').classList.contains('ai-turn'), null, { timeout: 90000 });
  await mainHumaine();
  const depart = await page.evaluate(() => ({ e: ILYOS_EQUIPE.etat(), tour: ILYOS_TEST.joueurCourant().tour }));
  expect(depart.e.membres.sort()).toEqual([0, 2]);
  await expect(page.locator('#endTurnBtn')).toHaveText('Prêt');

  // La main passe au coéquipier et revient, sans changer de tour.
  const [premier, second] = await page.evaluate(() => [ILYOS_TEST.joueurCourant().id, ILYOS_EQUIPE.etat().membres.find(m => m !== ILYOS_TEST.joueurCourant().id)]);
  await page.click(`#equipeRelais [data-membre="${second}"]`);
  expect(await page.evaluate(() => ILYOS_TEST.joueurCourant().id)).toBe(second);
  expect(await page.evaluate(() => ILYOS_EQUIPE.donnerLaMain(ILYOS_EQUIPE.etat().membres.find(m => m !== ILYOS_TEST.joueurCourant().id)))).toBe(true);
  expect(await page.evaluate(() => ILYOS_TEST.joueurCourant().id)).toBe(premier);

  // Premier « Prêt » : la main passe, le tour reste le même ; on ne revient
  // pas vers un coéquipier prêt.
  await page.evaluate(() => ILYOS_TEST.terminerTourHumain());
  await page.waitForFunction(p => ILYOS_TEST.joueurCourant().id !== p, premier);
  const apres = await page.evaluate(() => ({ cp: ILYOS_TEST.joueurCourant(), e: ILYOS_EQUIPE.etat() }));
  expect(apres.cp.tour).toBe(depart.tour);
  expect(apres.e.prets[premier]).toBe(true);
  expect(await page.evaluate(p => ILYOS_EQUIPE.donnerLaMain(p), premier)).toBe(false);
  await expect(page.locator('#endTurnBtn')).toHaveText('Fin du tour');

  // Second « Prêt » : l'équipe CPU joue ses deux mains, puis la main revient.
  await page.evaluate(() => ILYOS_TEST.terminerTourHumain());
  await page.waitForFunction(t => ILYOS_TEST.joueurCourant().tour === t + 1 && ILYOS_TEST.joueurCourant().ia, depart.tour, { timeout: 15000 });
  await page.waitForFunction(t => ILYOS_TEST.joueurCourant().tour === t + 2, depart.tour, { timeout: 90000 });
  await mainHumaine();
  expect(erreurs).toEqual([]);
});
