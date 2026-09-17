/* PALIERS DE QUALITÉ — ce qu'un ordinateur modeste cesse de payer.

   Mesure en partie solo à 1280 × 800, sur la machine de mesure : le ciel est
   le poste le plus lourd de la scène, et de loin. Le masquer enlève 36 à 41 %
   du temps par image. Ce ne sont ni les triangles (48 000 en tout) ni le
   nombre d'objets : ce sont des coques plein écran superposées, repeintes à
   chaque pixel. Coque par coque : dôme 11 %, nappe de nuages haute 12 %,
   nappe d'horizon 6 %, archipel lointain 6 %, bande de ciel 2 %. À côté, les
   ombres pèsent 8 % et le bloom 9 %.

   Le palier « performance » ne touchait pourtant qu'à la densité de rendu et à
   la TAILLE de la carte d'ombres : les trois postes réellement chers
   tournaient encore sur les machines qui en avaient le moins les moyens.

   Ce banc verrouille le contrat des paliers. Il ne mesure pas des images par
   seconde — un navigateur sans accélération matérielle n'en donnerait rien de
   transposable — il vérifie ce qui est réellement éteint, ce qui reste allumé,
   et que le retour en arrière est complet. */

const { test, expect } = require('@playwright/test');

async function demarrerPartieSolo(page) {
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => !!window.kaykit3D?.appliquerQualite, null, { timeout: 90000 });
  await page.waitForTimeout(6000);
  /* Le moniteur d'images redescendrait de palier sous nos pieds : en veille, il
     se fige et cesse d'arbitrer. */
  await page.evaluate(() => { window.ILYOS_PERF.enabled = false; });
  await page.waitForTimeout(1000);
}

const releve = page => page.evaluate(() => {
  const k = window.kaykit3D;
  const soleil = k.scene.getObjectByProperty('isDirectionalLight', true);
  let decorVisible = 0, decorMasque = 0, cielVisible = 0;
  k.scene.traverse(objet => {
    if (objet.userData?.decorFacultatif) (objet.visible ? decorVisible++ : decorMasque++);
  });
  const ciel = k.scene.getObjectByName('ilyos-sky');
  ciel?.traverse(objet => { if (objet.isMesh && objet.visible) cielVisible++; });
  return {
    palier: k.qualityMode,
    ombres: k.renderer.shadowMap.enabled && !!soleil?.castShadow,
    densite: k.renderer.getPixelRatio(),
    decorVisible, decorMasque, cielVisible
  };
});

test('le palier « performance » éteint vraiment les postes coûteux', async ({ page }) => {
  await demarrerPartieSolo(page);

  await page.evaluate(() => window.kaykit3D.appliquerQualite('high'));
  await page.waitForTimeout(1200);
  const eleve = await releve(page);
  expect(eleve.ombres, 'au palier élevé, les ombres sont rendues').toBe(true);
  expect(eleve.decorMasque, 'et tout le décor lointain est là').toBe(0);
  expect(eleve.decorVisible, 'ce Sanctuaire doit porter du décor facultatif').toBeGreaterThan(0);

  await page.evaluate(() => window.kaykit3D.appliquerQualite('performance'));
  await page.waitForTimeout(1200);
  const econome = await releve(page);
  expect(econome.ombres, 'au palier performance, la passe d’ombres ne tourne plus').toBe(false);
  expect(econome.decorMasque, 'et le décor lointain s’efface').toBe(eleve.decorVisible);
  expect(econome.densite, 'la densité ne remonte jamais au-dessus du plafond du palier')
    .toBeLessThanOrEqual(.95);

  /* CE QUI RESTE COMPTE AUTANT : le ciel n'est pas supprimé, seulement allégé.
     Le dôme et la nappe qui portent la lecture « îles ↓ vide ↓ nuages »
     doivent survivre, sinon le jeu perd son sol visuel. */
  expect(econome.cielVisible, 'le ciel reste, allégé — il n’est jamais supprimé')
    .toBeGreaterThanOrEqual(eleve.cielVisible - econome.decorMasque);
  expect(econome.cielVisible, 'le dôme et la nappe haute restent en place').toBeGreaterThan(1);

  // Le retour en arrière est complet : rien ne reste éteint par inadvertance.
  await page.evaluate(() => window.kaykit3D.appliquerQualite('high'));
  await page.waitForTimeout(1200);
  const retour = await releve(page);
  expect(retour.ombres, 'remonter de palier rallume les ombres').toBe(true);
  expect(retour.decorMasque, 'et rend tout le décor').toBe(0);
  expect(retour.cielVisible, 'le ciel retrouve toutes ses couches').toBe(eleve.cielVisible);
});
