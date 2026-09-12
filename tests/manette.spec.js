/* Couche manette (js/game/gamepad.js).

   Une vraie manette n'existe pas en headless : on injecte un objet Gamepad
   factice avant le chargement, ce que la Gamepad API permet de simuler
   puisque la couche ne lit que navigator.getGamepads().

   Tout ce qui est vérifié ici l'est par le DOM ou par kaykit3D, jamais par un
   accès privilégié à l'état : le bundle n'expose pas `state`, et ajouter un
   crochet de test au code de production pour ce seul besoin serait payer le
   confort du test avec de la dette dans le jeu. */

const { test, expect } = require('@playwright/test');

const FAUSSE_MANETTE = () => {
  window.__pad = {
    id: 'fake', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  };
  navigator.getGamepads = () => [window.__pad];
};

/* Disposition « standard » de la Gamepad API, la même que lit la couche. */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

async function appuyer(page, index, duree = 120) {
  await page.evaluate(i => { window.__pad.buttons[i].pressed = true; }, index);
  await page.waitForTimeout(duree);
  await page.evaluate(i => { window.__pad.buttons[i].pressed = false; }, index);
  await page.waitForTimeout(220);
}

/* Le stick, et non la croix : c'est lui qui doit suffire à tout piloter. */
async function incliner(page, axe, valeur, duree = 220) {
  await page.evaluate(([a, v]) => { window.__pad.axes[a] = v; }, [axe, valeur]);
  await page.waitForTimeout(duree);
  await page.evaluate(a => { window.__pad.axes[a] = 0; }, axe);
  await page.waitForTimeout(220);
}

const surligne = page => page.evaluate(() => {
  const element = document.querySelector('.ilyos-gamepad-focus');
  return element ? (element.id || element.className) : null;
});

const survol = page => page.evaluate(() => {
  const cellule = window.kaykit3D?.hoverCell;
  return cellule && !cellule.special ? `${cellule.r},${cellule.c}` : null;
});

/* Le bandeau #ov2Instruction n'affiche que la ligne d'aide, sans l'angle.
   Celui-ci vit dans le contexte de tour rempli par renderTurnContext — tantot
   dans le titre (« Rotation : 90° »), tantot dans la ligne suivante pendant la
   mise en place (« Rotation 90° — Q/E pour tourner »), ou le titre compte les
   iles restantes. On lit donc les deux. */
const contexteDePhase = page => page.evaluate(() => {
  const titre = document.getElementById('turnContextTitle')?.textContent?.trim() || '';
  const suite = document.getElementById('turnContextNext')?.textContent?.trim() || '';
  return `${titre} | ${suite}`;
});

const tour = page => page.evaluate(
  () => document.getElementById('ov2Turn')?.textContent?.trim() || ''
);

/* Empreinte au sol de l'ile en cours de pose, lue dans la scene : le HUD V2
   n'affiche l'angle nulle part (#turnContext* reste vide, et le bandeau ne
   reprend que la ligne d'aide), donc c'est le seul temoin observable d'une
   rotation. Positions MONDE : les positions locales des meshes valent toutes
   zero, la forme etant portee par la geometrie. */
const empreinteDeLIle = page => page.evaluate(() => {
  const racine = window.kaykit3D?.dynamicGroup;
  if (!racine) return null;
  let bloc = null;
  racine.traverse(objet => { if (objet.userData?.islandId === 'placement-preview') bloc = objet; });
  if (!bloc) return null;
  const points = [];
  bloc.traverse(objet => {
    if (!objet.isMesh) return;
    const monde = objet.getWorldPosition(new window.THREE.Vector3());
    points.push(`${monde.x.toFixed(2)},${monde.z.toFixed(2)}`);
  });
  return points.sort().join('|') || null;
});

const actionsDisponibles = page => page.evaluate(
  () => ['ov2Island', 'ov2Move', 'ov2Push', 'ov2Magic', 'ov2End', 'ov2Undo'].filter(id => {
    const bouton = document.getElementById(id);
    if (!bouton || bouton.disabled) return false;
    if (bouton.getAttribute('aria-disabled') === 'true') return false;
    if (bouton.classList.contains('disabled')) return false;
    return bouton.getBoundingClientRect().width > 0;
  })
);

/* La decouverte pose des gardiens des l'ouverture, la ou une partie normale
   commence par une phase de pose d'iles sans aucun pion sur le plateau : c'est
   donc le seul terrain ou la navigation entre gardiens peut etre observee sans
   jouer plusieurs tours. */
async function demarrerTutoriel(page) {
  await page.waitForFunction(() => typeof window.ILYOS_TUTORIAL?.start === 'function');
  await page.evaluate(() => window.ILYOS_TUTORIAL.start());
  await page.waitForFunction(() => !document.getElementById('gameScreen')?.classList.contains('hidden'));
  await page.waitForFunction(() => {
    const debug = window.ILYOS_TUTORIAL?._debug();
    return !!debug?.pret && !debug.souffle;
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.cell .character').length > 0, null, { timeout: 20000 });
}

async function demarrerPartieSolo(page) {
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.kaykit3D?.orbit, null, { timeout: 60000 });
  await page.waitForTimeout(6000);
}

function collecterIncidents(page) {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  /* Le serveur de developpement local lache parfois une connexion sur un
     asset (ERR_CONNECTION_RESET) : c'est du bruit de transport, sans rapport
     avec la manette, et le retenir rendait ce test instable environ une fois
     sur cinq. On ne garde que ce qui revele un vrai defaut de code. */
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const texte = message.text();
    if (/Failed to load resource|net::ERR_/.test(texte)) return;
    incidents.push(texte);
  });
  return incidents;
}

test('au repos, le stick parcourt le HUD et rejoint les gardiens', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');

  // La couche s'installe dès le parsing du bundle, avant toute partie.
  expect(await page.locator('#ilyosGamepadStyle').count()).toBe(1);

  await demarrerPartieSolo(page);

  /* Droite : une action du dock se surligne, sans rien viser sur le plateau.

     On ne compare PAS à une liste lue ici : le dock change d'un instant à
     l'autre — le bouton ÎLE passe en « ov2-off » quand son tiroir s'ouvre — et
     la couche lit le sien au moment de la poussée. Comparer deux photos prises
     à des instants différents faisait échouer le test sans qu'aucun défaut ne
     soit en cause. Ce qui doit être vrai, c'est qu'une action du dock est
     désignée, et qu'une seconde poussée n'éteint pas le surlignage. */
  const DOCK = ['ov2Island', 'ov2Move', 'ov2Push', 'ov2Magic', 'ov2End', 'ov2Undo'];

  /* Le jeu peut encore verrouiller les entrées juste après l'ouverture : on
     répète la poussée jusqu'à ce qu'il rende la main, plutôt que de mesurer un
     instant où rien ne pouvait répondre. */
  let premiere = null;
  for (let essai = 0; essai < 6 && !premiere; essai++) {
    await incliner(page, 0, 1);
    premiere = await surligne(page);
  }
  expect(DOCK, 'le stick vers la droite doit surligner une action du dock').toContain(premiere);

  await incliner(page, 0, 1);
  expect(DOCK, 'une seconde poussée doit rester dans le dock').toContain(await surligne(page));

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('haut et bas sautent de gardien en gardien', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');
  await demarrerTutoriel(page);

  // Haut : le curseur saute sur un gardien, sans traverser le plateau case à case.
  await incliner(page, 1, -1);
  const cellule = await survol(page);
  expect(cellule, 'haut doit poser le curseur sur une case').not.toBeNull();

  const gardienSurLaCase = await page.evaluate(cible => {
    const [r, c] = cible.split(',').map(Number);
    return !!document.querySelector(`.cell[data-r="${r}"][data-c="${c}"] .character`);
  }, cellule);
  expect(gardienSurLaCase, 'haut doit viser un gardien, pas une case quelconque').toBe(true);

  // Le surlignage du dock doit avoir cédé la place au plateau.
  expect(await surligne(page), 'naviguer vers les gardiens doit relâcher le dock').toBeNull();

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('le tiroir d’îles se parcourt et l’île se tourne aux gâchettes', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');
  await demarrerPartieSolo(page);

  /* Le tiroir s'ouvre par l'action ÎLE du dock — Y porte desormais la couronne.
     Au premier tour, poser une ile est obligatoire : ÎLE est la seule action
     offerte, donc une poussee du stick suffit a la designer. Le tiroir peut
     deja etre ouvert ; valider alors le refermerait. */
  const tiroirOuvert = () => page.evaluate(
    () => !document.getElementById('hudV2IslandDrawer')?.classList.contains('hidden')
  );
  /* Le tiroir s'ouvre aussi tout seul au debut du tour : selon l'instant, la
     poussee du stick tombe avant ou apres. On repete donc le geste jusqu'a ce
     que le tiroir soit ouvert, sans rien relacher sur l'exigence — il doit
     s'ouvrir A LA MANETTE. */
  for (let essai = 0; essai < 4 && !(await tiroirOuvert()); essai++) {
    await incliner(page, 0, 1);
    if ((await surligne(page)) === 'ov2Island') await appuyer(page, B.A);
  }
  expect(await tiroirOuvert(), 'le tiroir doit s’ouvrir à la manette').toBe(true);

  /* RB surligne une ile. On cherche une forme RETOURNABLE : le badge « ⇄ » ne
     figure que sur les iles asymetriques, les seules dont une rotation change
     reellement l'empreinte. La premiere du tiroir est symetrique — la tourner
     ne prouverait rien. */
  let trouvee = false;
  for (let essai = 0; essai < 9 && !trouvee; essai++) {
    await appuyer(page, B.RB);
    trouvee = await page.evaluate(
      () => !!document.querySelector('.ilyos-gamepad-focus .island-choice-flip')
    );
  }
  expect(trouvee, 'RB doit pouvoir atteindre une île retournable').toBe(true);
  expect(await surligne(page), 'RB doit surligner une île du tiroir').toContain('island-choice');

  // A la choisit : la pose commence et l'aperçu apparaît sous le curseur.
  await appuyer(page, B.A);
  await page.waitForFunction(() => {
    const racine = window.kaykit3D?.dynamicGroup;
    if (!racine) return false;
    let trouve = false;
    racine.traverse(objet => { if (objet.userData?.islandId === 'placement-preview') trouve = true; });
    return trouve;
  }, null, { timeout: 8000 });

  // LT / RT : rotation d'un quart de tour, exactement comme Q/E au clavier.
  const avant = await empreinteDeLIle(page);
  expect(avant, 'l’aperçu de pose doit être visible').not.toBeNull();

  /* La scène se reconstruit de façon asynchrone après une rotation : lire
     l'empreinte une seule fois attrapait parfois l'état d'avant. On attend le
     changement plutôt que de le supposer instantané. */
  await appuyer(page, B.RT);
  await expect.poll(() => empreinteDeLIle(page), {
    message: 'RT doit tourner l’île d’un quart de tour', timeout: 8000
  }).not.toBe(avant);
  const apresRT = await empreinteDeLIle(page);

  /* On ne demande PAS a LT de redonner exactement l'empreinte de depart :
     rotateSelectedIsland recentre la forme apres chaque quart de tour, donc la
     rotation n'est pas involutive en coordonnees absolues. C'est une propriete
     du moteur, pas de la manette. On verifie seulement que la gachette gauche
     agit elle aussi. */
  await appuyer(page, B.LT);
  await expect.poll(() => empreinteDeLIle(page), {
    message: 'LT doit tourner l’île à son tour', timeout: 8000
  }).not.toBe(apresRT);

  // Select pendant un placement : refusé, pas de fin de tour accidentelle.
  const tourAvant = await tour(page);
  await appuyer(page, B.SELECT);
  expect(await tour(page), 'Select ne doit pas terminer le tour pendant une pose').toBe(tourAvant);
  expect(await empreinteDeLIle(page), 'la pose doit toujours être en cours').not.toBeNull();

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('le stick droit tourne et zoome, R3 ramène la vue de face', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');
  await demarrerPartieSolo(page);

  const azimut = () => page.evaluate(() => {
    const k = window.kaykit3D;
    const ecart = k.camera.position.clone().sub(k.orbit.target);
    return +Math.atan2(ecart.x, ecart.z).toFixed(3);
  });
  const distance = () => page.evaluate(() => +(window.kaykit3D?.zoomDistance ?? 0).toFixed(2));

  const azimutDepart = await azimut();
  await incliner(page, 2, 1, 500);
  const azimutTourne = await azimut();
  expect(azimutTourne, 'le stick droit doit tourner la caméra').not.toBe(azimutDepart);

  const distanceAvant = await distance();
  await incliner(page, 3, 1, 400);
  expect(await distance(), 'le stick droit vertical doit zoomer').not.toBe(distanceAvant);

  // R3 : même geste qu'ESPACE au clavier — la vue revient de face.
  await appuyer(page, B.R3, 150);
  await page.waitForTimeout(1200);
  expect(await azimut(), 'R3 doit abandonner l’angle choisi à la main').not.toBe(azimutTourne);

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

/* L'iframe du menu possede son propre `window.__pad` : addInitScript s'applique
   a chaque cadre, mais chacun a sa copie. Piloter celui du haut ne bouge donc
   rien dans le menu — il faut s'adresser au cadre lui-meme. */
const cadreDuMenu = page => page.frames().find(cadre => cadre.url().includes('menu/frame.html'));

async function inclinerDansLeMenu(page, axe, valeur, duree = 240) {
  const cadre = cadreDuMenu(page);
  await cadre.evaluate(([a, v]) => { window.__pad.axes[a] = v; }, [axe, valeur]);
  await page.waitForTimeout(duree);
  await cadre.evaluate(a => { window.__pad.axes[a] = 0; }, axe);
  await page.waitForTimeout(240);
}

async function appuyerDansLeMenu(page, index, duree = 120) {
  const cadre = cadreDuMenu(page);
  await cadre.evaluate(i => { window.__pad.buttons[i].pressed = true; }, index);
  await page.waitForTimeout(duree);
  await cadre.evaluate(i => { window.__pad.buttons[i].pressed = false; }, index);
  await page.waitForTimeout(240);
}

test('le menu suit la grammaire console : modes, réglages, valeurs', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');

  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);

  const vise = () => cadreDuMenu(page).evaluate(() => {
    const element = document.querySelector('.ilyos-pad-vise');
    if (!element) return null;
    return element.getAttribute('data-mode')
      || element.getAttribute('data-key')
      || element.getAttribute('data-action')
      || element.id
      || element.tagName;
  });

  // Règle 1 : un nouvel écran choisit lui-même son meilleur point de départ.
  expect(await vise(), 'l’accueil doit démarrer sur le mode Solo').toBe('solo');

  /* Navigation SPATIALE : droite désigne la carte réellement située à droite,
     pas la suivante dans le document. Les cartes sont en grille. */
  await inclinerDansLeMenu(page, 0, 1);
  const aDroite = await vise();
  expect(aDroite, 'droite doit changer de mode').not.toBe('solo');

  await inclinerDansLeMenu(page, 0, -1);
  expect(await vise(), 'gauche doit revenir au mode précédent').toBe('solo');

  // A entre dans le mode.
  await appuyerDansLeMenu(page, B.A);
  await menu.locator('text=AFFRONTER LE CPU').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);

  const premierReglage = await vise();
  expect(premierReglage, 'la configuration doit désigner un réglage d’emblée').not.toBeNull();

  const estReglage = () => cadreDuMenu(page).evaluate(() => {
    const element = document.querySelector('.ilyos-pad-vise');
    return !!element && element.matches('.field[data-key], .difficulty-zone[data-key]');
  });
  expect(await estReglage(), 'le point de départ doit être un réglage, pas un bouton').toBe(true);

  /* LE POINT CENTRAL : gauche/droite change la VALEUR du réglage visé, sans
     jamais désigner séparément les petites flèches. Un mouvement par
     changement, au lieu de trois. */
  const valeur = () => cadreDuMenu(page).evaluate(clef => {
    const ligne = document.querySelector(`[data-key="${clef}"]`);
    return ligne ? ligne.textContent.replace(/\s+/g, ' ').trim() : null;
  }, premierReglage);

  const avant = await valeur();
  await inclinerDansLeMenu(page, 0, 1);
  expect(await valeur(), 'droite doit changer la valeur du réglage').not.toBe(avant);
  expect(await vise(), 'et le focus doit rester sur ce même réglage').toBe(premierReglage);

  /* Le focus est retenu par identité : render() refait tout le DOM du panneau à
     chaque changement de valeur, donc une référence n'aurait pas survécu. */
  await inclinerDansLeMenu(page, 0, 1);
  expect(await vise(), 'le focus doit survivre à la reconstruction du panneau').toBe(premierReglage);

  // Haut/bas passe d'un réglage au suivant, sans jamais viser une flèche.
  await inclinerDansLeMenu(page, 1, 1);
  expect(await vise(), 'bas doit passer au réglage suivant').not.toBe(premierReglage);

  // B revient à l'accueil.
  await appuyerDansLeMenu(page, B.B);
  await page.waitForTimeout(900);
  expect(await vise(), 'B doit ramener à l’accueil').toBe('solo');

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('l’île se pose à la manette même après un choix à la souris', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');
  await demarrerPartieSolo(page);

  /* Chemin mixte, celui d'un joueur réel : la forme est choisie à la souris —
     le tiroir RESTE alors ouvert — puis tout le reste se fait à la manette.
     La branche « tiroir ouvert » passait avant les autres et confisquait le
     stick : le curseur du plateau ne bougeait plus et l'île devenait
     impossible à poser. */
  const tiroirOuvert = () => page.evaluate(
    () => !document.getElementById('hudV2IslandDrawer')?.classList.contains('hidden')
  );
  /* dispatchEvent plutôt qu'un vrai clic : le bouton ÎLE passe brièvement en
     « ov2-off » quand le tiroir s'ouvre de lui-même, et un clic réel exige une
     boîte visible — la préparation du test échouait alors, pas la manette. */
  if (!(await tiroirOuvert())) {
    await page.locator('#ov2Island').dispatchEvent('click');
    await page.waitForTimeout(500);
  }
  await page.locator('#islandSelector .island-choice:not([disabled])').first().dispatchEvent('click');

  await page.waitForFunction(() => {
    const racine = window.kaykit3D?.dynamicGroup;
    if (!racine) return false;
    let trouve = false;
    racine.traverse(objet => { if (objet.userData?.islandId === 'placement-preview') trouve = true; });
    return trouve;
  }, null, { timeout: 8000 });

  expect(await tiroirOuvert(), 'le tiroir reste ouvert après le choix — c’est le cas piégeux').toBe(true);

  // Le stick doit déplacer l'aperçu sur le plateau, tiroir ouvert ou non.
  const cellule = () => survol(page);
  const depart = await cellule();
  await incliner(page, 0, 1);
  const apres = await cellule();
  expect(apres, 'le stick doit déplacer le curseur sur le plateau').not.toBeNull();
  expect(apres, 'le curseur doit avoir changé de case malgré le tiroir ouvert').not.toBe(depart);

  /* Et A doit réellement poser l'île : l'aperçu cède la place à une vraie île.
     Toutes les cases n'accueillent pas une île — le curseur peut tomber sur une
     position refusée — donc on essaie quelques emplacements, comme un joueur.
     Ce qui est vérifié ici, c'est que la pose ABOUTIT à la manette. */
  const encoreEnApercu = () => page.evaluate(() => {
    const racine = window.kaykit3D?.dynamicGroup;
    if (!racine) return false;
    let apercu = false;
    racine.traverse(objet => { if (objet.userData?.islandId === 'placement-preview') apercu = true; });
    return apercu;
  });

  /* On balaie les quatre directions plutôt qu'une diagonale : selon la case de
     départ, dix essais dans deux sens seulement pouvaient s'éloigner du plateau
     sans jamais rencontrer une position acceptée. */
  const balayage = [[0, 1], [1, 1], [0, -1], [1, -1]];
  let posee = false;
  for (let essai = 0; essai < 24 && !posee; essai++) {
    await appuyer(page, B.A);
    posee = !(await encoreEnApercu());
    if (!posee) {
      const [axe, sens] = balayage[essai % balayage.length];
      await incliner(page, axe, sens, 140);
    }
  }
  expect(posee, 'A doit finir par poser l’île à la manette').toBe(true);

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('LT ouvre l’île, X pousse, RT lance la magie — sans passer par le dock', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');
  await demarrerPartieSolo(page);

  const tiroirOuvert = () => page.evaluate(
    () => !document.getElementById('hudV2IslandDrawer')?.classList.contains('hidden')
  );

  /* LT au repos = ÎLE. Le tiroir peut déjà être ouvert au premier tour : on le
     referme d'abord pour que le test mesure bien l'effet de la gâchette. */
  if (await tiroirOuvert()) {
    await page.locator('#ov2Island').dispatchEvent('click');
  }
  /* Attendre que la bascule soit finie : le bouton ÎLE passe brièvement en
     « ov2-off » pendant l'animation, et la gâchette refuse alors d'agir sur un
     contrôle indisponible — la préparation du test échouait, pas la manette. */
  await page.waitForFunction(() => {
    const tiroir = document.getElementById('hudV2IslandDrawer');
    const bouton = document.getElementById('ov2Island');
    if (!tiroir || !bouton) return false;
    if (!tiroir.classList.contains('hidden')) return false;
    return bouton.getBoundingClientRect().width > 0 && !bouton.disabled;
  }, null, { timeout: 8000 });

  await appuyer(page, B.LT);
  await page.waitForFunction(
    () => !document.getElementById('hudV2IslandDrawer')?.classList.contains('hidden'),
    null, { timeout: 5000 }
  );

  /* Une fois une île en cours de pose, LT reprend son sens de rotation : le
     changement de mode est visible à l'écran, donc sans ambiguïté. */
  await page.locator('#islandSelector .island-choice:not([disabled])').first().dispatchEvent('click');
  await page.waitForFunction(() => {
    const racine = window.kaykit3D?.dynamicGroup;
    if (!racine) return false;
    let trouve = false;
    racine.traverse(objet => { if (objet.userData?.islandId === 'placement-preview') trouve = true; });
    return trouve;
  }, null, { timeout: 8000 });

  const avant = await empreinteDeLIle(page);
  await appuyer(page, B.LT);
  await expect.poll(() => empreinteDeLIle(page), {
    message: 'pendant une pose, LT doit tourner l’île et non rouvrir le tiroir',
    timeout: 8000
  }).not.toBe(avant);

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('l’annulation remonte jusqu’au début du tour, jamais au-delà', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');
  await demarrerPartieSolo(page);

  const iles = () => page.evaluate(
    () => document.querySelectorAll('.cell.placed-island-cell').length
  );
  const tiroirOuvert = () => page.evaluate(
    () => !document.getElementById('hudV2IslandDrawer')?.classList.contains('hidden')
  );

  const ilesAvant = await iles();

  // Poser une île à la manette : c'est le geste qui ouvre le tour.
  if (!(await tiroirOuvert())) {
    await page.locator('#ov2Island').dispatchEvent('click');
    await page.waitForTimeout(400);
  }
  await page.locator('#islandSelector .island-choice:not([disabled])').first().dispatchEvent('click');
  await page.waitForFunction(() => {
    const racine = window.kaykit3D?.dynamicGroup;
    if (!racine) return false;
    let trouve = false;
    racine.traverse(objet => { if (objet.userData?.islandId === 'placement-preview') trouve = true; });
    return trouve;
  }, null, { timeout: 8000 });

  const balayage = [[0, 1], [1, 1], [0, -1], [1, -1]];
  let posee = false;
  for (let essai = 0; essai < 24 && !posee; essai++) {
    await appuyer(page, B.A);
    posee = (await iles()) > ilesAvant;
    if (!posee) {
      const [axe, sens] = balayage[essai % balayage.length];
      await incliner(page, axe, sens, 140);
    }
  }
  expect(posee, 'préparation : l’île doit être posée').toBe(true);

  /* B COURT NE TOUCHE JAMAIS À L'HISTORIQUE. C'est toute la raison d'être de
     la distinction : fermer un panneau et défaire un coup ne doivent pas
     partager le même geste. */
  await appuyer(page, B.B, 150);
  await appuyer(page, B.B, 150);
  expect(await iles(), 'un appui court ne doit pas défaire la pose').toBeGreaterThan(ilesAvant);

  // B LONG : première annulation, explicitement demandée.
  await appuyer(page, B.B, 800);
  await page.waitForTimeout(600);
  expect(await iles(), 'un appui long doit défaire la pose d’île').toBe(ilesAvant);

  /* FRONTIÈRE DU TOUR. L'historique est vidé à chaque changement de tour, donc
     remonter encore ne doit plus rien défaire — le tour précédent est hors
     d'atteinte par construction. */
  await appuyer(page, B.B, 800);
  await page.waitForTimeout(400);
  await appuyer(page, B.B, 150);
  await page.waitForTimeout(400);
  expect(await iles(), 'on ne doit pas pouvoir remonter avant le début du tour').toBe(ilesAvant);

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});

test('le cabinet d’énigmes se parcourt à la manette', async ({ page }) => {
  const incidents = collecterIncidents(page);
  await page.addInitScript(FAUSSE_MANETTE);
  await page.goto('/');

  /* Le cabinet vit au-dessus du plateau et n'a rien à voir avec le dock : le
     stick n'y trouvait aucune cible et « LES VOIES D'ILYOS » restait injouable
     à la manette. */
  await page.waitForFunction(() => typeof window.ILYOS_PUZZLE?.open === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.ILYOS_PUZZLE.open());
  await page.waitForSelector('#puzzleMenu .pz-card', { timeout: 15000 });
  await page.waitForTimeout(600);

  const vise = () => page.evaluate(() => {
    const element = document.querySelector('#puzzleMenu .ilyos-gamepad-focus');
    if (!element) return null;
    return element.getAttribute('data-index') ?? element.className;
  });

  // Un panneau ouvert désigne lui-même son point de départ.
  expect(await vise(), 'le cabinet doit désigner une carte d’emblée').not.toBeNull();

  const depart = await vise();
  await incliner(page, 0, 1);
  const apres = await vise();
  expect(apres, 'le stick doit changer de sanctuaire').not.toBe(depart);

  // RB fait la même chose, pour qui préfère les gâchettes.
  await appuyer(page, B.RB);
  expect(await vise(), 'RB doit aussi changer de sanctuaire').not.toBeNull();

  // A ouvre le sanctuaire visé : le menu cède la place.
  await appuyer(page, B.A);
  await page.waitForFunction(
    () => !document.querySelector('#puzzleMenu .pz-card'),
    null, { timeout: 15000 }
  );

  expect(incidents, `erreurs relevées : ${incidents.join(' | ')}`).toEqual([]);
});
