/* « Créer son duel » (mise en place en miroir du Personnalisé) : le joueur 1
   compose le plateau de départ, chaque île et chaque gardien posés sont
   reflétés chez le joueur 2 (axe vertical), puis la partie démarre
   normalement. Le Personnalisé peut aussi partir d'un setup du duel
   symétrique, avec un placement libre des gardiens. */
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

/* Les réglages du Personnalisé sont des rangées de boutons construites à
   partir des listes cachées : on clique le bouton de la valeur voulue. */
async function choisir(page, liste, valeur) {
  await page.locator(`${liste} + div button[data-valeur="${valeur}"]`).click();
  await expect(page.locator(liste)).toHaveValue(valeur);
}

test('Créer son duel : la pose du joueur 1 se reflète chez le joueur 2', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="duel"]').first().click();
  await regler(menu, 'board', 'PERSONNALISÉ');
  await menu.locator('text=LANCER LE DUEL').first().click();
  await page.waitForSelector('#symmetricSetupOverlay.visible', { timeout: 40000 });

  await expect(page.locator('#customMirrorRow')).toBeVisible();
  await choisir(page, '#customMirrorSelect', 'miroir');
  await choisir(page, '#customIslandCountSelect', '2');
  await choisir(page, '#customGuardianCountSelect', '1');
  await expect(page.locator('#confirmSymmetricSetupBtn')).toHaveText('Commencer la mise en place');
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

test('Personnalisé : terrain de setup et placement libre des gardiens', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="duel"]').first().click();
  await regler(menu, 'board', 'PERSONNALISÉ');
  await menu.locator('text=LANCER LE DUEL').first().click();
  await page.waitForSelector('#symmetricSetupOverlay.visible', { timeout: 40000 });

  /* Terrain : le menu du duel s'ouvre, on y choisit Avant-postes. */
  await page.locator('.perso-terrain-choix[data-terrain="setup"]').click();
  await expect(page.locator('#symmetricSetupOverlay .symmetric-board-card')).toHaveAttribute('data-menu', 'terrain');
  await page.locator('.duel-vignette[data-value="avantPostes"]').first().click();
  await page.locator('#confirmSymmetricSetupBtn').click();
  await expect(page.locator('#symmetricSetupOverlay .symmetric-board-card')).toHaveAttribute('data-menu', 'perso');
  await expect(page.locator('.perso-terrain-choix[data-terrain="setup"]')).toHaveAttribute('aria-pressed', 'true');

  await choisir(page, '#customIslandCountSelect', '0');
  await choisir(page, '#customGuardianCountSelect', '1');
  await choisir(page, '#customGuardianPlacementSelect', 'libre');
  await page.locator('#confirmSymmetricSetupBtn').click();

  let etat = await plateau(page);
  expect(etat.miseEnPlace).toMatchObject({ miroir: false, total: 2 });
  expect(etat.iles).toHaveLength(12);
  expect(etat.gardiens.filter(g => g.joueur === 0)).toHaveLength(4);

  /* Le joueur au trait peut poser sur une île adverse, jamais sur le sanctuaire. */
  const trait = etat.trait;
  const n = etat.taille, centre = (n - 1) / 2;
  const occupee = (r, c) => etat.gardiens.some(g => g.r === r && g.c === c);
  const adverse = etat.iles.filter(i => i.proprietaire !== trait).flatMap(i => i.cases)
    .find(([r, c]) => !occupee(r, c) && Math.abs(r - centre) + Math.abs(c - centre) > 1);
  expect(adverse).toBeTruthy();
  await expect(page.locator(`#board .cell[data-r="${adverse[0]}"][data-c="${adverse[1]}"]`)).toHaveClass(/spawn-choice/);
  await expect(page.locator(`#board .cell[data-r="${centre}"][data-c="${centre}"]`)).not.toHaveClass(/spawn-choice/);
  await page.locator(`#board .cell[data-r="${adverse[0]}"][data-c="${adverse[1]}"]`).dispatchEvent('click');

  etat = await plateau(page);
  expect(etat.gardiens.some(g => g.joueur === trait && g.r === adverse[0] && g.c === adverse[1])).toBe(true);
  expect(incidents).toEqual([]);
});
