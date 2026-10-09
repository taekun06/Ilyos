/* 2 contre 2 avec l'IA : le menu règle les places tenues par l'ordinateur et
   les villages d'équipe (diagonale partagée J1+J3, J2+J4) ; la partie démarre
   avec ces réglages et les tours de l'IA passent sans erreur. En diagonale
   d'équipe, les coéquipiers partagent aussi gardiens et couronnes. */
const { test, expect } = require('@playwright/test');

async function regler(menu, cle, valeur) {
  const champ = menu.locator(`.selector-field[data-key="${cle}"]`);
  for (let i = 0; i < 6; i++) {
    if ((await champ.locator('.value-text').textContent()).trim() === valeur) return;
    await champ.locator('[data-step="1"]').click();
  }
  throw new Error(`${cle} : valeur ${valeur} introuvable`);
}

test("2 contre 2 : deux humains contre deux IA, villages d'équipe", async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="team"]').first().click();
  await regler(menu, 'seats', 'J2 + J4 (2 CONTRE IA)');
  await regler(menu, 'difficulty', 'EXPERT');
  await regler(menu, 'villages', 'DIAGONALE D’ÉQUIPE');
  await expect(menu.locator('.duelist-violet b')).toHaveText('IA + IA');
  if (process.env.ILYOS_CAPTURE) await page.screenshot({ path: process.env.ILYOS_CAPTURE });
  await menu.locator('text=LANCER LE 2 CONTRE 2').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });

  const joueurs = await page.evaluate(() => window.ILYOS_TEST.joueurs());
  expect(joueurs.map(j => j.ia)).toEqual([false, true, false, true]);
  expect(joueurs[1].difficulte).toBe('expert');
  const diagonale = j => j.villages.map(v => v.join(',')).sort().join(' ');
  expect(joueurs[0].villages).toHaveLength(2);
  expect(diagonale(joueurs[0])).toBe(diagonale(joueurs[2]));
  expect(diagonale(joueurs[1])).toBe(diagonale(joueurs[3]));
  expect(diagonale(joueurs[0])).not.toBe(diagonale(joueurs[1]));

  /* Faire tourner la table : les humains finissent leur tour (pose
     automatique), l'IA joue les siens, jusqu'à ce que chacun ait joué. */
  const tourDepart = (await page.evaluate(() => window.ILYOS_TEST.joueurCourant())).tour;
  await expect.poll(async () => {
    const courant = await page.evaluate(() => window.ILYOS_TEST.joueurCourant());
    if (courant && !courant.ia) await page.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
    return courant ? courant.tour - tourDepart : 0;
  }, { timeout: 90000, intervals: [1000] }).toBeGreaterThanOrEqual(4);

  /* Gardiens communs : au trait, le joueur commande tous les gardiens de son
     équipe (J1+J3 ou J2+J4), et aucun de l'équipe adverse. */
  expect(await page.evaluate(() => window.ILYOS_TEST.gardiensPartages())).toBe(true);
  const { courant, gardiens } = await page.evaluate(() => ({
    courant: window.ILYOS_TEST.joueurCourant(), gardiens: window.ILYOS_TEST.gardiens()
  }));
  expect(gardiens.length).toBeGreaterThan(0);
  for (const g of gardiens) {
    if (g.camp % 2 === courant.id % 2) expect(g.joueur).toBe(courant.id);
    else expect(g.joueur % 2).not.toBe(courant.id % 2);
  }

  /* Couronnes communes : J1 marque, J3 marque avec lui. */
  await page.evaluate(() => window.ILYOS_TEST.marquer(0));
  const scores = (await page.evaluate(() => window.ILYOS_TEST.joueurs())).map(j => j.score);
  expect(scores[2]).toBe(scores[0]);
  expect(scores[0]).toBeGreaterThan(scores[1]);
  expect(incidents).toEqual([]);
});
