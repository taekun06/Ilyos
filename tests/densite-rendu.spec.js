/* BUDGET DE PIXELS — la densité de rendu suit la taille de la fenêtre.

   Ce que ce banc protège : un plafond de densité est un MULTIPLICATEUR, pas une
   mesure de travail. Le même plafond de 1,5 demandait 0,7 million de pixels par
   image sur un téléphone, 3,2 sur une fenêtre de portable et 8,3 sur un écran
   externe — pour exactement la même scène. C'est ce grand écart qui rendait le
   jeu plus lourd sur ordinateur que sur mobile.

   Trois invariants, et le premier est le plus important : sur un écran modeste,
   RIEN NE CHANGE. Le budget ne sert qu'à empêcher les très grandes surfaces de
   réclamer un travail sans rapport avec ce qu'elles montrent, et il ne descend
   jamais sous la résolution native de la fenêtre. */

const { test, expect } = require('@playwright/test');

async function ouvrirPartie(page, largeur, hauteur, densiteEcran) {
  await page.setViewportSize({ width: largeur, height: hauteur });
  await page.addInitScript(densite => {
    Object.defineProperty(window, 'devicePixelRatio', { get: () => densite });
  }, densiteEcran);
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => !!window.kaykit3D?.densiteRendu, null, { timeout: 90000 });
  await page.waitForTimeout(2500);
}

/* On interroge la RÈGLE au plafond « élevé », pas la valeur en vigueur : le
   moniteur d'images redescend d'un palier en une seconde sur une machine sans
   accélération, ce qui masquerait exactement ce qu'on veut lire. */
const densiteAuPlafondHaut = page => page.evaluate(() => {
  const boite = document.getElementById('kaykitCanvas').getBoundingClientRect();
  return {
    densite: window.kaykit3D.densiteRendu(1.5),
    surfaceCss: boite.width * boite.height
  };
});

test('sur un écran de téléphone, la densité ne change pas', async ({ page }) => {
  await ouvrirPartie(page, 390, 844, 3);
  const { densite } = await densiteAuPlafondHaut(page);
  expect(densite, 'le budget ne doit jamais toucher une petite fenêtre').toBe(1.5);
});

test('sur une fenêtre de portable, le rendu reste au-dessus de la résolution native', async ({ page }) => {
  await ouvrirPartie(page, 1512, 950, 2);
  const { densite, surfaceCss } = await densiteAuPlafondHaut(page);
  expect(densite, 'la densité doit descendre sous le plafond').toBeLessThan(1.5);
  expect(densite, 'mais jamais sous un pixel rendu par pixel CSS').toBeGreaterThanOrEqual(1);
  expect(surfaceCss * densite * densite,
    'le travail demandé doit tenir dans le budget').toBeLessThanOrEqual(2600000 * 1.02);
});

test('sur un grand écran, le travail demandé cesse de croître avec la surface', async ({ page }) => {
  await ouvrirPartie(page, 2560, 1440, 2);
  const { densite, surfaceCss } = await densiteAuPlafondHaut(page);
  expect(densite, 'la résolution native reste le plancher').toBe(1);
  // Ancienne règle : 1,5 quelle que soit la surface.
  const avant = surfaceCss * 1.5 * 1.5;
  expect(surfaceCss * densite * densite,
    'un écran 27 pouces ne doit plus réclamer le double du budget').toBeLessThan(avant / 2);
});
