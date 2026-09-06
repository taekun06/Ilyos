/* Contrat de la caméra, vérifié dans une vraie partie solo.

   Ce que ce test protège tient en une phrase : la caméra assistée possède le
   SUJET, le joueur possède le POINT DE VUE. Tourner, incliner et zoomer ne font
   donc plus sortir du mode AUTO — seul le pan, qui revendique le même point visé
   que l'AUTO, rend la main.

   Il verrouille aussi le cadrage canonique de la vue de face. Il y avait trois
   sources de distance dans le moteur (le preset à 17, kaykitFitDistance à 11,85,
   et kaykitPositionForView qui gonflait la demande de 4,2 %) : selon laquelle
   parlait en dernier, la partie s'ouvrait sur un cadrage et ESPACE en rendait un
   autre. Une seule fait foi désormais, et ce test le constate des deux côtés.

   Il passe par le menu, comme un joueur : voir tests/README.md pour le détail du
   démarrage solo (l'écran de configuration vit dans l'iframe du menu). */

const { test, expect } = require('@playwright/test');

/* État de la caméra vu du monde, pas du moteur : angles depuis le zénith et
   l'axe des Z, comme OrbitControls les compte. */
const LIRE_CAMERA = `(() => {
  const k = window.kaykit3D;
  if (!k?.orbit) return null;
  const ecart = k.camera.position.clone().sub(k.orbit.target);
  return {
    polaire: +(Math.acos(ecart.y / ecart.length()) * 180 / Math.PI).toFixed(1),
    azimut: +(Math.atan2(ecart.x, ecart.z) * 180 / Math.PI).toFixed(1),
    distance: +ecart.length().toFixed(2),
    cible: [+k.orbit.target.x.toFixed(2), +k.orbit.target.z.toFixed(2)],
    mode: k.cameraMode,
    zoomPrefere: +(k.zoomPrefere || 0).toFixed(2)
  };
})()`;

const camera = page => page.evaluate(LIRE_CAMERA);

async function demarrerPartieSolo(page) {
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.kaykit3D?.orbit, null, { timeout: 60000 });
  // La scène doit être posée : le preset de cadrage s'applique après le chargement.
  await page.waitForTimeout(6000);
}

/* Un vrai glissé sur le canvas. Le bouton du milieu déclenche le pan
   d'OrbitControls, le gauche la rotation — c'est la distinction que le moteur
   utilise pour décider s'il faut quitter l'AUTO. */
async function glisser(page, dx, dy, bouton) {
  const cadre = await page.locator('#kaykitCanvas').boundingBox();
  const x = cadre.x + cadre.width / 2;
  const y = cadre.y + cadre.height * 0.28;
  await page.mouse.move(x, y);
  await page.mouse.down(bouton ? { button: bouton } : undefined);
  for (let pas = 1; pas <= 20; pas++) {
    await page.mouse.move(x + dx * pas / 20, y + dy * pas / 20);
  }
  await page.mouse.up(bouton ? { button: bouton } : undefined);
  await page.waitForTimeout(900);
}

test("la caméra assistée ne confisque plus le point de vue", async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await demarrerPartieSolo(page);

  const etapes = {};
  etapes.ouverture = await camera(page);

  await glisser(page, 380, 110);
  etapes.rotationGlissee = await camera(page);

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(900);
  etapes.vueDeDessus = await camera(page);

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(900);
  etapes.inclinaisonDeBase = await camera(page);

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  etapes.rotationClavier = await camera(page);

  const cadre = await page.locator('#kaykitCanvas').boundingBox();
  await page.mouse.move(cadre.x + cadre.width / 2, cadre.y + cadre.height * 0.28);
  for (let cran = 0; cran < 5; cran++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
  etapes.molette = await camera(page);

  /* Changement de format : la distance se réajuste, l'angle choisi doit tenir.
     Le viewport lui-même n'est pas redimensionnable ici (le jeu passe en plein
     écran), on rétrécit donc le conteneur du plateau — c'est le ResizeObserver
     du moteur qui réagit, exactement comme lors d'une rotation d'écran. */
  const avantFormat = await camera(page);
  await page.evaluate(() => {
    const enveloppe = document.querySelector('.board-wrap') || document.getElementById('boardWrap');
    if (enveloppe) {
      enveloppe.dataset.largeurOrigine = enveloppe.style.width || '';
      enveloppe.style.width = '55%';
    }
  });
  await page.waitForTimeout(2000);
  etapes.changementDeFormat = await camera(page);
  await page.evaluate(() => {
    const enveloppe = document.querySelector('.board-wrap') || document.getElementById('boardWrap');
    if (enveloppe) enveloppe.style.width = enveloppe.dataset.largeurOrigine || '';
  });
  await page.waitForTimeout(1500);

  await glisser(page, 240, 0, 'middle');
  etapes.pan = await camera(page);

  await page.keyboard.press(' ');
  await page.waitForTimeout(1400);
  etapes.espace = await camera(page);

  const detail = JSON.stringify(etapes, null, 1);

  // Le cadrage d'ouverture est celui du preset canonique.
  expect(etapes.ouverture.distance, detail).toBe(17);
  expect(etapes.ouverture.azimut, detail).toBe(0);
  expect(etapes.ouverture.mode, detail).toBe('auto');

  // Choisir son point de vue ne fait jamais perdre la caméra assistée.
  ['rotationGlissee', 'vueDeDessus', 'inclinaisonDeBase', 'rotationClavier', 'molette', 'changementDeFormat']
    .forEach(etape => expect(etapes[etape].mode, `${etape} — ${detail}`).toBe('auto'));

  // Les flèches font bien ce qu'elles annoncent.
  expect(etapes.vueDeDessus.polaire, detail).toBeLessThan(10);
  expect(etapes.inclinaisonDeBase.polaire, detail).toBeGreaterThan(45);
  expect(Math.abs(etapes.rotationClavier.azimut - etapes.inclinaisonDeBase.azimut), detail)
    .toBeGreaterThan(40);

  // La molette est une préférence de distance, pas un renoncement.
  expect(etapes.molette.zoomPrefere, detail).toBeGreaterThan(0);
  expect(etapes.molette.distance, detail).toBeLessThan(17);

  // Un changement de format ajuste la distance, jamais l'angle.
  expect(Math.abs(etapes.changementDeFormat.azimut - avantFormat.azimut), detail).toBeLessThan(3);

  // Le pan revendique le point visé : lui seul rend la main.
  expect(etapes.pan.mode, detail).toBe('free');

  // ESPACE rend exactement le cadrage d'ouverture, et l'assistance avec.
  expect(etapes.espace.mode, detail).toBe('auto');
  expect(etapes.espace.distance, detail).toBe(etapes.ouverture.distance);
  expect(etapes.espace.azimut, detail).toBe(etapes.ouverture.azimut);
  expect(etapes.espace.cible, detail).toEqual(etapes.ouverture.cible);
  expect(etapes.espace.zoomPrefere, detail).toBe(0);

  expect(incidents).toEqual([]);
});
