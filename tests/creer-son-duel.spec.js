/* Duel symétrique, « Créer son duel » : le joueur 1 compose le plateau de
   départ, chaque île et chaque gardien posés sont reflétés chez le joueur 2
   (axe vertical), puis la partie démarre normalement. */
const { test, expect } = require('@playwright/test');

async function regler(menu, cle, valeur) {
  const champ = menu.locator(`.selector-field[data-key="${cle}"]`);
  for (let i = 0; i < 6; i++) {
    if ((await champ.locator('.value-text').textContent()).trim() === valeur) return;
    await champ.locator('[data-step="1"]').click();
  }
  throw new Error(`${cle} : valeur ${valeur} introuvable`);
}

const plateau = page => page.evaluate(() => window.ILYOS_TEST.plateau());

test('Créer son duel : la pose du joueur 1 se reflète chez le joueur 2', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="duel"]').first().click();
  await regler(menu, 'board', 'DUEL SYMÉTRIQUE');
  await menu.locator('text=LANCER LE DUEL').first().click();
  await page.waitForSelector('#symmetricSetupOverlay.visible', { timeout: 40000 });

  await page.locator('.v64-setup-card[data-value="creer"]').click();
  await expect(page.locator('#customSetupControls')).toBeVisible();
  await expect(page.locator('#confirmSymmetricSetupBtn')).toHaveText('Créer mon duel');
  await page.selectOption('#customIslandCountSelect', '2');
  await page.selectOption('#customGuardianCountSelect', '1');
  await page.locator('#confirmSymmetricSetupBtn').click();

  let etat = await plateau(page);
  expect(etat.miseEnPlace).toMatchObject({ miroir: true, total: 3 });
  expect(etat.iles).toHaveLength(0);
  const n = etat.taille;
  const miroir = ([r, c]) => `${r},${n - 1 - c}`;

  /* Deux îles : la première forme du tiroir, posée sur la première case de
     la moitié gauche où elle tient (reflet compris). */
  for (let pose = 1; pose <= 2; pose++) {
    await page.locator('#islandSelector button').first().dispatchEvent('click');
    let posee = false;
    for (let r = 1; r < n - 1 && !posee; r++) {
      for (let c = 1; c < Math.floor(n / 2) - 1 && !posee; c++) {
        await page.locator(`#board .cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');
        posee = (await plateau(page)).iles.length === pose * 2;
        if (!posee && (await plateau(page)).phase !== 'PLACE_ISLAND') {
          await page.locator('#islandSelector button').first().dispatchEvent('click');
        }
      }
    }
    expect(posee).toBe(true);
  }

  /* Un gardien sur une case proposée. */
  await page.locator('#board .cell.spawn-choice').first().dispatchEvent('click');

  etat = await plateau(page);
  expect(etat.miseEnPlace).toBeNull();
  expect(etat.phase).not.toBe('PLACE_SPAWN');
  const casesDe = j => etat.iles.filter(i => i.proprietaire === j).flatMap(i => i.cases).map(([r, c]) => `${r},${c}`).sort();
  expect(casesDe(1)).toEqual(etat.iles.filter(i => i.proprietaire === 0).flatMap(i => i.cases).map(miroir).sort());
  const gardiensDe = j => etat.gardiens.filter(g => g.joueur === j);
  expect(gardiensDe(0)).toHaveLength(1);
  expect(gardiensDe(1)).toHaveLength(1);
  expect(`${gardiensDe(1)[0].r},${gardiensDe(1)[0].c}`).toBe(miroir([gardiensDe(0)[0].r, gardiensDe(0)[0].c]));
  expect(incidents).toEqual([]);
});

test('Personnalisé : la mise en place peut se faire en duel symétrique', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="duel"]').first().click();
  await regler(menu, 'board', 'PERSONNALISÉ');
  await menu.locator('text=LANCER LE DUEL').first().click();
  await page.waitForSelector('#symmetricSetupOverlay.visible', { timeout: 40000 });

  await expect(page.locator('#customMirrorRow')).toBeVisible();
  await page.selectOption('#customMirrorSelect', 'miroir');
  await page.selectOption('#customIslandCountSelect', '2');
  await page.selectOption('#customGuardianCountSelect', '1');
  await page.locator('#confirmSymmetricSetupBtn').click();

  const etat = await plateau(page);
  expect(etat.miseEnPlace).toMatchObject({ miroir: true, total: 3 });
  expect(incidents).toEqual([]);
});
