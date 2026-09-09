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

test('les vingt-deux Sanctuaires se résolvent exactement par leur solution de référence', async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  const liste = await page.evaluate(() => window.ILYOS_PUZZLE.list());
  expect(liste.length).toBe(22);

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
     lancement, les vingt et une autres restent verrouillées.

     SAUF pendant le chantier des transitions, où tout est ouvert (drapeau
     PUZZLE_TOUT_OUVERT dans js/game/puzzle.js). On lit l'état réel plutôt que
     de relâcher l'assertion : les deux comportements restent vérifiés, et
     remettre le verrou fait automatiquement repasser le test à l'exigence
     d'origine. */
  const cartes = page.locator('#puzzleMenu .pz-card');
  await expect(cartes).toHaveCount(22);
  await expect(cartes.nth(0)).toBeEnabled();
  const toutOuvert = await page.evaluate(() => window.ILYOS_PUZZLE._debug().toutOuvert === true);
  if (toutOuvert) {
    await expect(cartes.nth(1)).toBeEnabled();
    await expect(cartes.nth(21)).toBeEnabled();
  } else {
    await expect(cartes.nth(1)).toBeDisabled();
  }

  await cartes.nth(0).click();
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().active === true);
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));

  const etat = await page.evaluate(() => window.ILYOS_PUZZLE._debug());
  expect(etat.id).toBe('p01-seuil');
  expect(etat.budget).toBe(25);
  expect(etat.restant).toBe(25);
  expect(etat.goal).toBe(false);
  expect(etat.fail).toBe(false);
  // La pose d'île est neutralisée : le sélecteur de formes est masqué.
  await expect(page.locator('#gameScreen')).toHaveClass(/puzzle-no-place/);
  /* La vue tactique 2D est de nouveau ACCESSIBLE pendant une énigme. Elle
     était interdite parce qu'elle écartait les destinations hors grille : une
     poussée qui éjecte par le bord n'y avait aucun repère cliquable, et c'est
     le coup gagnant de six énigmes. Elle sait maintenant les dessiner dans sa
     marge — voir le test dédié plus bas. */
  await expect(page.locator('#plateauTactiqueBtn')).toBeVisible();
  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.ILYOS_PLATEAU_2D?.actif())).toBe(true);
  await page.keyboard.press('t');
  await page.waitForTimeout(400);
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

  // Tour 1 : cinq cartes, cinq cases, droit vers le Sanctuaire — c'est
  // justement la ligne qui perd, mais elle suffit à ce que le test observe.
  await page.locator('#ov2Move').click({ force: true });
  await clic(8, 0);
  await clic(3, 0);
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 0 && ch.r === 3 && ch.c === 0),
    null, { timeout: 8000 });
  await attendreLaMain(page);
  expect((await page.evaluate(() => window.ILYOS_PUZZLE._debug())).depense).toBe(5);

  // Fin de tour : le Veilleur monte en (1,2), comme annoncé.
  await page.locator('#ov2End').click({ force: true });
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 1 && ch.r === 1 && ch.c === 2),
    null, { timeout: 15000 });
  await page.waitForFunction(() => {
    const d = window.ILYOS_PUZZLE._debug();
    return d.currentPlayer === 0 && !d.replying;
  }, null, { timeout: 15000 });

  const apres = await page.evaluate(() => window.ILYOS_PUZZLE._debug());
  expect(apres.rivalTurn).toBe(1);
  // La main du tour 2 est celle que le paquet annonce — quatre cartes ici,
  // pas cinq : une énigme scriptée distribue ce qu'elle a écrit. Le budget
  // déjà dépensé, lui, ne bouge pas.
  expect(apres.hand.length).toBe(4);
  expect(apres.depense).toBe(5);
  // La ligne jouée s'éteint, la suivante s'allume.
  await expect(page.locator('#puzzleLayer .pz-plan-line').first()).toHaveClass(/done/);
  await expect(page.locator('#puzzleLayer .pz-plan-line').nth(1)).toHaveClass(/next/);

  expect(erreurs).toEqual([]);
});

/* Régression : le sol du sanctuaire survivait à la partie précédente.

   Bâti une seule fois par session et jamais retiré, il réapparaissait au
   milieu d'une énigme — qui n'en a pourtant aucun, toutes déclarant
   `sanctuary: false`. Signalé en jeu en enchaînant une partie solo puis les
   énigmes. Même famille que le château fantôme : un cache construit une fois,
   avec ses positions monde. */
test("une énigme lancée après une partie n'hérite pas de son sanctuaire", async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 60000 });
  await page.waitForFunction(() => !!window.kaykit3D?.orbit, null, { timeout: 60000 });
  // La croix du sanctuaire n'est posée qu'à la première synchronisation.
  await page.waitForFunction(() => !!window.kaykit3D?.crownCrossGroup, null, { timeout: 30000 });

  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p10-escalier'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p10-escalier');
  await page.waitForTimeout(3000);

  const reste = await page.evaluate(() => {
    let trouves = 0;
    window.kaykit3D.scene.traverse(o => { if (o.userData?.crownCross) trouves++; });
    return { groupe: !!window.kaykit3D.crownCrossGroup, dansLaScene: trouves };
  });
  expect(reste).toEqual({ groupe: false, dansLaScene: 0 });

  expect(erreurs).toEqual([]);
});

/* Régression : cliquer la case du château ne faisait rien.

   Le raccourci « clic direct » — on désigne la destination, le jeu envoie le
   Gardien le plus proche — était réservé au sanctuaire. Il a été élargi aux
   trois cases d'un village, mais seulement dans le PRÉDICAT : son point
   d'appel filtrait toujours sur isSanctuary, si bien que la fonction acceptait
   ces cases sans jamais être appelée pour elles. Signalé deux fois en jeu.

   Le test ne vérifie pas qu'un Gardien arrive — dans cette énigme aucun ne le
   peut — mais que le jeu RÉPOND. C'est exactement ce qui manquait : le clic
   tombait dans le vide, sans mouvement et sans message. */
test("cliquer la case du village déclenche le raccourci de déplacement", async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p01-seuil'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p01-seuil');
  await page.waitForFunction(() => !window.ILYOS_PUZZLE._debug().inputLocked, null, { timeout: 15000 });

  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.textContent = ''; });
  await page.locator('.cell[data-r="0"][data-c="0"]').dispatchEvent('click');

  await page.waitForFunction(
    () => (document.getElementById('toast')?.textContent || '').trim().length > 0
      || window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 0 && ch.r === 0 && ch.c === 0),
    null, { timeout: 8000 });

  expect(erreurs).toEqual([]);
});

/* Régression : le clic droit annulait partout SAUF dans les énigmes.

   Échap et le clic droit y étaient verrouillés parce qu'ils déclenchent
   l'annulation du dernier coup, laquelle cassait le décompte de cartes. Ce
   n'est plus vrai depuis que restoreUndoSnapshot recalcule la dépense : le
   verrou ne protégeait plus rien et privait le joueur des deux gestes les plus
   naturels pour défaire un coup, dans le mode où l'on se trompe le plus. */
test("dans une énigme, le clic droit annule le dernier coup et rend la carte", async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p20-la-plus-courte-trace'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p20-la-plus-courte-trace');
  await attendreLaMain(page);

  const clic = (r, c) => page.locator(`.cell[data-r="${r}"][data-c="${c}"]`).dispatchEvent('click');
  await page.locator('#ov2Move').click({ force: true });
  await clic(9, 2);
  await clic(9, 1);
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 0 && ch.r === 9 && ch.c === 1),
    null, { timeout: 8000 });
  await attendreLaMain(page);
  expect((await page.evaluate(() => window.ILYOS_PUZZLE._debug())).depense).toBe(1);

  // Le geste du jeu : clic droit SEC sur le canevas 3D.
  await page.locator('#kaykitCanvas').dispatchEvent('contextmenu');
  await page.waitForFunction(() =>
    window.ILYOS_PUZZLE._debug().chars.some(ch => ch.p === 0 && ch.r === 9 && ch.c === 2),
    null, { timeout: 8000 });
  // La carte revient au joueur : sans cette égalité, l'annulation ment.
  expect((await page.evaluate(() => window.ILYOS_PUZZLE._debug())).depense).toBe(0);

  expect(erreurs).toEqual([]);
});

/* Régression : le menu ⚙ était injoignable pendant une énigme.

   Le chrome de jeu est masqué en mode énigme, et la roue partait avec — ce qui
   privait le joueur des Règles, du Son et du réglage de Ciel pendant tout le
   mode où l'on passe le plus de temps sur la même position.

   Le bouton à viser est `#ov2Gear`, celui du HUD organique. L'ancienne roue
   `#hudV2GearBtn` reste dans le DOM — c'est elle qui porte la logique du
   popover — mais js/hud-organique-v2.js la neutralise avec un style EN LIGNE
   (opacity 0, pointer-events none) et lui relaie le clic. Un test qui viserait
   l'ancienne attendrait indéfiniment qu'elle devienne cliquable. */
test("dans une énigme, la roue ouvre le menu", async ({ page }) => {
  const erreurs = await ouvrirJeu(page);

  await page.evaluate(() => { window.ILYOS_PUZZLE.unlockAll(); window.ILYOS_PUZZLE.startById('p01-seuil'); });
  await page.waitForFunction(() => window.ILYOS_PUZZLE._debug().id === 'p01-seuil');
  await page.waitForFunction(() => !window.ILYOS_PUZZLE._debug().inputLocked, null, { timeout: 15000 });

  await expect(page.locator('#ov2Gear')).toBeVisible();
  await page.locator('#ov2Gear').click();
  await expect(page.locator('#hudV2GearPopover')).not.toHaveClass(/hidden/);
  await expect(page.locator('#rulesBtn')).toBeVisible();
  await expect(page.locator('#soundBtn')).toBeVisible();

  /* Deux entrées restent interdites : « Nouvelle partie », qui n'a aucun sens
     ici, et la bascule 2D, qui casse six énigmes — le plateau tactique écarte
     les destinations hors grille, et une poussée qui éjecte par le BORD n'y a
     aucun repère cliquable. */
  await expect(page.locator('#newGameBtn')).toBeHidden();
  await expect(page.locator('.hud-v2-popover-render-grid')).toBeHidden();

  expect(erreurs).toEqual([]);
});

/* Régression : la vue 2D ne savait pas éjecter par le BORD du plateau.

   Elle écartait toute destination hors grille, si bien qu'une poussée qui
   sort la victime du plateau n'y avait aucun repère cliquable — et c'est le
   coup gagnant de six énigmes. La vue 2D était pour cette raison interdite
   pendant les énigmes.

   Elle dessine désormais ces éjections dans sa marge et les exécute par
   `ILYOS_BENCH.poussee(id)`, seul chemin possible : aucune case du plateau
   d'origine ne peut recevoir ce clic. Le test fournit l'option à la vue plutôt
   que de la provoquer en jeu — la situation demande une position tardive, et
   ce qu'on vérifie ici est le DESSIN et la CAPTURE du clic, pas la règle. */
test("en vue 2D, une éjection par le bord du plateau est dessinée et cliquable", async ({ page }) => {
  const erreurs = await ouvrirJeu(page);
  await page.evaluate(() => window.ILYOS_PUZZLE.unlockAll());
  await page.evaluate(() => window.ILYOS_PUZZLE.startById('p18-relais-des-mains'));
  await page.waitForFunction(() => !window.ILYOS_PUZZLE._debug().inputLocked, null, { timeout: 15000 });

  // Le Veilleur de p18 est en [0,1], sur le bord nord. On fabrique l'option
  // qui l'en chasse vers le haut : arrivee [-1,1], hors grille.
  const info = await page.evaluate(() => {
    const brut = window.ILYOS_BENCH.etatComplet();
    const e = JSON.parse(brut);
    const rival = e.characters.find(c => c.player === 1);
    const mien = e.characters.find(c => c.player === 0);
    e.pushOptions = [{
      id: 'test:ejection', pusherId: mien.id, targetId: rival.id, targetType: 'character',
      force: 1, fell: true, r: null, c: null, dr: -1, dc: 0,
      lastLandR: rival.r, lastLandC: rival.c
    }];
    const original = window.ILYOS_BENCH.etatComplet;
    window.ILYOS_BENCH.etatComplet = () => JSON.stringify(e);
    window.__rendreOriginal = () => { window.ILYOS_BENCH.etatComplet = original; };
    return { rival: [rival.r, rival.c] };
  });
  expect(info.rival).toEqual([0, 1]);

  await page.evaluate(() => window.ILYOS_PLATEAU_2D.activer(true));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.ILYOS_PLATEAU_2D.repeindre());
  await page.waitForTimeout(600);

  const ej = await page.evaluate(() => window.ILYOS_PLATEAU_2D._ejections());
  expect(ej.length).toBe(1);
  expect(ej[0].id).toBe('test:ejection');

  // Le repere doit tomber DANS le canevas, au-dessus du plateau.
  const dims = await page.evaluate(() => { const c = document.getElementById('plateauTactique'); return { w: c.width, h: c.height }; });
  expect(ej[0].y).toBeGreaterThan(0);
  expect(ej[0].y).toBeLessThan(dims.h);

  // Le clic sur le repere doit appeler le pont moteur avec le bon identifiant.
  await page.evaluate(() => {
    window.__appels = [];
    window.ILYOS_BENCH.poussee = id => { window.__appels.push(id); return true; };
  });
  const cv = await page.locator('#plateauTactique').boundingBox();
  await page.mouse.click(cv.x + ej[0].x * (cv.width / dims.w), cv.y + ej[0].y * (cv.height / dims.h));
  await page.waitForTimeout(500);
  const appels = await page.evaluate(() => window.__appels);
  expect(appels).toEqual(['test:ejection']);

  expect(erreurs).toEqual([]);
});
