/* Cabinet d'énigmes — la solution de référence de chaque puzzle est l'oracle.

   Une énigme n'est pas testable « à l'œil » : son intérêt tient à ce qu'un
   chemin très précis, et lui seul, tienne dans le budget de cartes. Le moteur
   embarque donc `ILYOS_PUZZLE.verify(i)`, qui rejoue la solution déclarée sur
   un plateau neuf en refusant tout ce qu'un joueur ne pourrait pas produire :
   un déplacement inexistant au sens de shortestMovementPath, une force de
   poussée supérieure aux cartes PUSH disponibles. Il vérifie ensuite que
   l'objectif tombe ET que le coût vaut exactement `par`.

   Ce fichier ne fait qu'exécuter cet oracle dans un vrai navigateur, plus deux
   vérifications que l'oracle ne peut pas faire : que le bouton du menu ouvre
   bien la liste, et qu'une énigme se lance sans erreur de page. */

const { test, expect } = require('@playwright/test');

/* Attend que l'animation en cours rende la main. */
async function attendreLaMain(page) {
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().inputLocked === false,
    null, { timeout: 15000 });
}

async function ouvrirJeu(page) {
  const erreurs = [];
  page.on('pageerror', error => erreurs.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_PUZZLE?.verifyAll === 'function');
  return erreurs;
}

test('les dix-sept Sanctuaires se résolvent exactement par leur solution de référence', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  const liste = await page.evaluate(() => window.ILYOS_PUZZLE.list());
  expect(liste.length).toBe(17);

  const resultats = await page.evaluate(() => window.ILYOS_PUZZLE.verifyAll());

  /* Un rapport lisible AVANT l'assertion : quand une énigme casse, on veut
     savoir laquelle et à quel coup, pas seulement que « ça a échoué ». */
  for (const resultat of resultats) {
    // eslint-disable-next-line no-console
    console.log(
      `${resultat.ok ? 'OK ' : 'KO '} ${String(resultat.id).padEnd(22)}`
      + ` objectif=${resultat.atteint} dépensé=${resultat.depense}/${resultat.par}`
      + ` restant=${resultat.restant}${resultat.raison ? ' — ' + resultat.raison : ''}`
    );
  }

  const casses = resultats.filter(resultat => !resultat.ok);
  expect(casses, casses.map(r => `${r.id} : ${r.raison}`).join(' | ')).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('le bouton PUZZLES du menu ouvre la liste, et la première énigme se lance', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-action="puzzle"]').first().click();
  await page.waitForSelector('#puzzleMenu', { timeout: 10000 });

  /* Déblocage linéaire : seule la première carte est cliquable au premier
     lancement, les dix autres restent verrouillées. */
  const cartes = page.locator('#puzzleMenu .pz-card');
  await expect(cartes).toHaveCount(17);
  await expect(cartes.nth(0)).toBeEnabled();
  await expect(cartes.nth(1)).toBeDisabled();

  await cartes.nth(0).click();
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().active === true);
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));

  const etat = await page.evaluate(() => window.ILYOS_PUZZLE._debug());
  expect(etat.id).toBe('p01-seuil');
  expect(etat.budget).toBe(6);
  expect(etat.restant).toBe(6);
  expect(etat.goal).toBe(false);
  expect(etat.fail).toBe(false);
  // La pose d'île est neutralisée : le sélecteur de formes est masqué.
  await expect(page.locator('#gameScreen')).toHaveClass(/puzzle-no-place/);
  /* La vue tactique 2D n'affiche pas les chutes hors plateau : ni le bouton ni
     la touche T ne doivent pouvoir y faire basculer pendant une énigme. */
  await expect(page.locator('#plateauTactiqueBtn')).toBeHidden();
  await page.keyboard.press('t');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.ILYOS_PLATEAU_2D?.actif())).toBe(false);

  expect(erreurs).toEqual([]);
});

/* Les deux tests ci-dessus vérifient les RÈGLES et le câblage. Celui-ci vérifie
   qu'une énigme se joue vraiment à la souris : sélectionner une poussée dans le
   HUD, désigner sa destination, déplacer un Gardien, puis faire pivoter une île.
   C'est le seul chemin que l'oracle ne peut pas couvrir, puisqu'il applique les
   actions directement au noyau de règles. */
test('la neuvième énigme se résout entièrement à la souris', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p09-fardeau'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p09-fardeau');
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));

  const clic = (r, c) => page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');

  /* 1. La couronne du bas survole le gouffre. Deux forces mènent à (9,5) — 2 et
        3 — et l'interface retient la moins chère, donc cliquer la case suffit. */
  await page.locator('#ov2Push').click({ force: true });
  const options = await page.evaluate(() => window.ILYOS_PUZZLE._debug().pushOptions);
  expect(options.some(o => o.force === 2 && o.r === 9 && o.c === 5)).toBe(true);
  await clic(9, 5);
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().crowns.some(k => k.r === 9 && k.c === 5 && !k.carrierId),
    null, { timeout: 8000 });
  expect((await page.evaluate(() => window.ILYOS_PUZZLE._debug())).depense).toBe(2);
  /* La règle s'applique tout de suite, l'animation qui la raconte non : sans
     cette attente le geste suivant est avalé par le verrou d'entrée. */
  await attendreLaMain(page);

  /* 2. Le Gardien voisin vient la ramasser. */
  await page.locator('#ov2Move').click({ force: true });
  await clic(9, 6);
  await clic(9, 5);
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().crowns.some(k => k.r === 9 && k.c === 5 && !!k.carrierId),
    null, { timeout: 8000 });

  /* 3. La barre du haut pivote autour de son extrémité et emporte la couronne
        posée dessus — la règle que l'énigme veut faire découvrir. */
  await attendreLaMain(page);
  await page.locator('#ov2Magic').click({ force: true });
  await clic(3, 5);
  /* Les boutons de rotation réellement affichés sont ceux du HUD consolidé V12
     (#hudV2MagicRotate*) ; #rotateRightBtn n'est plus qu'un relais de taille
     nulle. Cliquer les vrais boutons est la seule façon de prouver que le
     masquage du panneau d'îles propre aux énigmes ne coupe pas la Magie. */
  await page.locator('#hudV2MagicRotateRight').click();
  await page.locator('#hudV2MagicRotateRight').click();
  await clic(3, 5);

  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().goal === true, null, { timeout: 10000 });
  const fin = await page.evaluate(() => window.ILYOS_PUZZLE._debug());
  expect(fin.depense).toBe(4);
  await expect(page.locator('#puzzleLayer .pz-end')).toBeVisible();
  await expect(page.locator('#puzzleLayer .pz-stars')).toHaveText('★★★');

  expect(erreurs).toEqual([]);
});

/* Les énigmes 12 à 14 durent plusieurs tours : la pioche est écrite d'avance et
   distribuée par le vrai drawCards(), le rival joue des coups annoncés, et la
   couronne ne compte qu'au début du tour suivant. Ce test vérifie que cette
   boucle tourne pour de bon — c'est-à-dire que le rival AGIT, et qu'il agit
   comme le panneau l'a promis au joueur. */
test('dans une énigme multi-tours, le rival joue le coup annoncé', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p14-course'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p14-course');
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));

  // Le plan du rival est public dès le départ : deux lignes, la première à venir.
  await expect(page.locator('#puzzleLayer .pz-plan-line')).toHaveCount(2);
  await expect(page.locator('#puzzleLayer .pz-plan-line').first()).toHaveClass(/next/);
  // Une énigme multi-tours rend le bouton de fin de tour au joueur.
  await expect(page.locator('#gameScreen')).not.toHaveClass(/puzzle-one-turn/);

  const clic = (r, c) => page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');

  // Tour 1 : cinq cartes, cinq cases. Le Gardien s'arrête à hauteur du rival.
  await page.locator('#ov2Move').click({ force: true });
  await clic(8, 0);
  await clic(3, 0);
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 0 && ch.r === 3 && ch.c === 0),
    null, { timeout: 8000 });
  await attendreLaMain(page);
  expect((await page.evaluate(() => window.ILYOS_PUZZLE._debug())).depense).toBe(5);

  // Fin de tour : le rival descend en (2,1), comme annoncé.
  await page.locator('#ov2End').click({ force: true });
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 1 && ch.r === 2 && ch.c === 1),
    null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const d = window.ILYOS_PUZZLE._debug();
    return d.currentPlayer === 0 && !d.replying;
  }, null, { timeout: 15000 });

  const apres = await page.evaluate(() => window.ILYOS_PUZZLE._debug());
  expect(apres.rivalTurn).toBe(1);
  // Cinq cartes fraîches au tour 2, sans que le budget dépensé bouge.
  expect(apres.hand.length).toBe(5);
  expect(apres.depense).toBe(5);
  // La ligne jouée s'éteint, la suivante s'allume.
  await expect(page.locator('#puzzleLayer .pz-plan-line').first()).toHaveClass(/done/);
  await expect(page.locator('#puzzleLayer .pz-plan-line').nth(1)).toHaveClass(/next/);

  expect(erreurs).toEqual([]);
});
