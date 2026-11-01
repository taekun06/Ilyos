/* Mode Boucles — la solution de référence de chaque sanctuaire est l'oracle.

   `ILYOS_BOUCLES.verifier()` rejoue chaque solution sur le noyau de règles pur
   et contrôle qu'elle gagne avec exactement le nombre de boucles annoncé, en
   respectant la main de chaque Gardien. Ce fichier l'exécute dans un vrai
   navigateur, puis vérifie que le bouton du menu ouvre le mode et que le
   premier sanctuaire se gagne par les vraies entrées, animations comprises. */

const { test, expect } = require('@playwright/test');

async function ouvrirJeu(page) {
  const erreurs = [];
  page.on('pageerror', error => erreurs.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_BOUCLES?.verifier === 'function');
  return erreurs;
}

test('chaque sanctuaire se gagne par sa solution, avec le nombre de boucles annoncé', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);
  const resultats = await page.evaluate(() => window.ILYOS_BOUCLES.verifier());
  expect(resultats.length).toBeGreaterThanOrEqual(3);
  for (const r of resultats) {
    expect(r, r.id).toMatchObject({ gagne: true, mains: true });
    expect(r.boucles, r.id).toBe(r.attendu);
  }
  expect(erreurs).toEqual([]);
});

test('le bouton BOUCLES ouvre le mode, et le Relais se gagne en jeu', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-groupe="defis"]').click();
  await menu.locator('[data-action="boucles"]').first().click();
  await page.waitForFunction(() => window.ILYOS_BOUCLES.etat().actif === true, null, { timeout: 10000 });
  await expect(page.locator('#bouclesCalque')).toBeVisible();

  await page.evaluate(() => window.ILYOS_BOUCLES.lancer(0));
  for (const boucle of ['E PE ·', '· S PE']) {
    for (const ordre of boucle.split(' ')) {
      await page.waitForFunction(() => !window.ILYOS_BOUCLES.etat().occupe, null, { timeout: 15000 });
      await page.evaluate(o => window.ILYOS_BOUCLES.agir(o), ordre);
    }
  }
  await page.waitForFunction(() => window.ILYOS_BOUCLES.etat().phase === 'gagne', null, { timeout: 20000 });
  expect(erreurs).toEqual([]);
});
