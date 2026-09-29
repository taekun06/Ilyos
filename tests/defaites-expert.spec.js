/* Bibliothèque des défaites de l'IA Expert (js/game/defaites.js), de bout en
   bout, dans une vraie partie solo lancée par le menu.

   Ce que le joueur doit pouvoir faire sans rien activer : jouer contre
   l'Expert, gagner, cliquer sur « Analyser cette défaite de l'IA » et obtenir
   un dossier complet ; retrouver la partie dans la bibliothèque ; la rejouer
   depuis un tour.

   Les tours humains sont terminés comme par le minuteur (pose automatique) et
   la victoire est obtenue par le vrai chemin de validation
   (ILYOS_TEST.marquer) : le test porte sur l'enregistrement et l'export, pas
   sur la façon de battre l'IA. */

const { test, expect } = require('@playwright/test');

async function demarrerPartieExpert(page) {
  /* Le lanceur recopie la difficulté du menu dans le sélecteur natif ; on fixe
     sa lecture à « expert », comme le fait le test du mode personnalisé. */
  await page.addInitScript(() => {
    const descripteur = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
      configurable: true,
      get() { return this.id === 'aiDifficultySelect' ? 'expert' : descripteur.get.call(this); },
      set(v) { descripteur.set.call(this, v); }
    });
  });
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.ILYOS_TEST?.joueurCourant?.(), null, { timeout: 60000 });
}

/* Laisse jouer l'IA et termine les tours humains jusqu'à `decisions` décisions Expert. */
async function jouerJusqua(page, decisions) {
  const limite = Date.now() + 8 * 60 * 1000;
  while (Date.now() < limite) {
    const etat = await page.evaluate(() => {
      const j = window.ILYOS_DEFAITES.journal();
      return {
        decisions: j && j.tours ? j.tours.filter(t => t.decision).length : 0,
        courant: window.ILYOS_TEST.joueurCourant()
      };
    });
    if (etat.decisions >= decisions) return etat.decisions;
    if (etat.courant && !etat.courant.ia) {
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
    }
    await page.waitForTimeout(1000);
  }
  throw new Error('la partie n’a pas atteint le nombre de décisions attendu');
}

test("une défaite de l'Expert s'enregistre, s'exporte d'un clic et se rejoue", async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  // Bibliothèque vide au départ, mais conservée aux rechargements suivants.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('defaites-test')) {
      sessionStorage.setItem('defaites-test', '1');
      indexedDB.deleteDatabase('ilyos-defaites');
    }
  });
  await demarrerPartieExpert(page);

  const journal = await page.evaluate(() => {
    const j = window.ILYOS_DEFAITES.journal();
    return j ? { joueurs: j.joueurs, tours: j.tours.length } : null;
  });
  expect(journal, 'journal ouvert sans rien activer').not.toBeNull();
  expect(journal.joueurs.some(j => j.ia && j.difficulte === 'expert')).toBe(true);

  await jouerJusqua(page, 3);

  // Victoire humaine par le vrai chemin de validation.
  const humain = await page.evaluate(() =>
    window.ILYOS_DEFAITES.journal().joueurs.find(j => !j.ia).id);
  await page.evaluate(id => { for (let i = 0; i < 3; i++) window.ILYOS_TEST.marquer(id); }, humain);

  const bouton = page.locator('#victoryModal .defaite-ia-analyser');
  await expect(bouton).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#victoryModal .defaite-ia-etat')).toContainText('Enregistrée', { timeout: 20000 });

  const [telechargement] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^ilyos-defaite-.*\.json$/);
  const dossier = JSON.parse(require('fs').readFileSync(await telechargement.path(), 'utf8'));

  expect(dossier.type).toBe('defaite-expert');
  expect(dossier.humain).toBe(humain);
  expect(dossier.fin.scores[humain]).toBe(3);
  expect(dossier.cadre, 'état complet de reprise').toBeTruthy();
  expect(dossier.regles && dossier.regles.grille).toBeTruthy();
  const decisions = dossier.tours.filter(t => t.decision);
  expect(decisions.length).toBeGreaterThanOrEqual(3);
  // Chaque décision est rejouable et porte le plan et les notes du planner.
  for (const t of decisions) {
    expect(typeof t.etat).toBe('string');
    expect(JSON.parse(t.etat).currentPlayer).toBe(dossier.ia);
    expect(Number.isFinite(t.decision.noteDepart)).toBe(true);
  }
  // Les tours humains ont aussi leur position de départ.
  expect(dossier.tours.some(t => !t.ia && t.etat)).toBe(true);
  // Chaque action jouée est consignée avec le plateau qui en résulte.
  const actions = dossier.tours.flatMap(t => t.actions || []);
  expect(actions.length, 'actions consignées une par une').toBeGreaterThanOrEqual(3);
  expect(actions.every(a => a.texte && a.plateau && Array.isArray(a.plateau.characters))).toBe(true);
  expect(dossier.analyse.resume).toContain('Défaite Expert');
  expect(dossier.analyse.signales.length, 'au moins la dernière décision').toBeGreaterThanOrEqual(1);
  await expect(page.locator('#victoryModal .defaite-ia-resume')).toContainText('Défaite Expert');

  // Bibliothèque : la partie y est, et s'ouvre dans la visionneuse.
  await page.locator('#victoryModal .defaite-ia-biblio').click();
  const ligne = page.locator('.defaites-biblio .defaites-ligne');
  await expect(ligne).toHaveCount(1);
  await ligne.locator('[data-action="voir"]').click();
  await expect(page.locator('.defaites-biblio')).toHaveCount(0);
  await expect(page.locator('#victoryModal')).toBeHidden();
  const vue = page.locator('.defaites-vue');
  await expect(vue).toBeVisible();
  await expect(vue.locator('.dv-courbe circle').first()).toBeVisible();

  // Un tour de l'IA : navigation action par action, et sa réflexion.
  const indexIA = dossier.tours.findIndex(t => t.decision && t.etat && (t.actions || []).length);
  expect(indexIA, 'un tour IA avec ses actions').toBeGreaterThanOrEqual(0);
  await vue.locator(`[data-vue-index="${indexIA}"]`).dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => window.ILYOS_DEFAITES.vue().index)).toBe(indexIA);
  await expect(vue).toContainText('Ce que l’IA a pensé');
  // Le coup joué est tracé sur le plateau (flèches, cases, numéros).
  expect(await page.evaluate(() => window.ILYOS_DEFAITES.vue().traces), 'coup joué tracé').toBeGreaterThan(0);
  await vue.locator('[data-vue="etape+"]').click();
  await expect(vue.locator('.dv-etape-texte')).toBeVisible();
  expect(await page.evaluate(() => window.ILYOS_DEFAITES.vue().etape)).toBe(1);

  // Lecture seule : « Fin du tour » ne fait pas avancer la partie archivée.
  const avant = await page.evaluate(() => window.ILYOS_DEFAITES.vue());
  await page.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
  expect(await page.evaluate(() => window.ILYOS_DEFAITES.vue())).toEqual(avant);

  // Annotation, gardée dans la bibliothèque.
  await vue.locator('[data-vue-etiquette="erreur-ia"]').check();
  await vue.locator('[data-vue-annotation]').fill('elle laisse son gardien au bord');
  await vue.locator('[data-vue="annoter"]').click();
  await expect.poll(async () => (await page.evaluate(id => window.ILYOS_DEFAITES.lire(id), dossier.id)).annotations?.[indexIA]?.texte)
    .toBe('elle laisse son gardien au bord');

  // Proposer un meilleur coup : bac à sable, puis évaluation et enregistrement.
  await vue.locator('[data-vue="proposer"]').click();
  await expect.poll(() => page.evaluate(() => window.ILYOS_DEFAITES.vue().sandbox)).toBe(true);
  await vue.locator('[data-vue-pourquoi]').fill('je ne bouge pas');
  await vue.locator('[data-vue="valider"]').click();
  await expect.poll(() => page.evaluate(() => window.ILYOS_DEFAITES.vue().propositions), { timeout: 30000 }).toBe(1);
  await expect(vue).toContainText('Coups proposés pour ce tour');
  const enregistre = await page.evaluate(id => window.ILYOS_DEFAITES.lire(id), dossier.id);
  expect(enregistre.propositions).toHaveLength(1);
  expect(enregistre.propositions[0].pourquoi).toBe('je ne bouge pas');
  expect(Number.isFinite(enregistre.propositions[0].vous.fin)).toBe(true);
  expect(Number.isFinite(enregistre.propositions[0].joue.fin)).toBe(true);

  // « Reprendre la partie ici » : l'ancien « Rejouer », depuis la visionneuse.
  await vue.locator('[data-vue="reprendre"]').click();
  await expect(page.locator('.defaites-vue')).toHaveCount(0);
  await page.waitForFunction(() => window.ILYOS_DEFAITES.journal()?.origine?.defaite, null, { timeout: 20000 });
  const reprise = await page.evaluate(() => ({
    origine: window.ILYOS_DEFAITES.journal().origine,
    courant: window.ILYOS_TEST.joueurCourant()
  }));
  expect(reprise.origine.defaite).toBe(dossier.id);
  expect(reprise.courant).not.toBeNull();

  // Hors partie : le bouton flottant ouvre la bibliothèque par-dessus le menu.
  await page.reload();
  const acces = page.locator('#defaitesAccesBtn');
  await expect(acces).toBeVisible({ timeout: 30000 });
  await expect(acces).toContainText('(1)');
  await acces.click();
  await expect(page.locator('.defaites-biblio .defaites-ligne')).toHaveCount(1);
  await expect(page.locator('.defaites-biblio [data-action="exporter"]')).toBeVisible();
  // Visible pour de bon : au-dessus de l'iframe du menu, pas seulement présente.
  const dessus = await page.evaluate(() => {
    const bouton = document.querySelector('.defaites-biblio [data-action="exporter"]');
    const r = bouton.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === bouton;
  });
  expect(dessus, 'la bibliothèque passe au-dessus du menu').toBe(true);

  expect(incidents, incidents.join('\n')).toEqual([]);
});

/* « Rejouer » à la fin d'une partie gagnée : la nouvelle partie doit repartir
   contre l'Expert et entrer au journal. La difficulté est choisie ici par le
   VRAI menu, sans forcer le sélecteur natif : c'est lui que renderSetupFields
   remettait à « Normal » après le lancement, et « Rejouer » relançait alors
   contre l'IA Normale, hors journal. */
test("« Rejouer » relance contre l'Expert et la nouvelle partie entre au journal", async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('defaites-rejouer')) {
      sessionStorage.setItem('defaites-rejouer', '1');
      indexedDB.deleteDatabase('ilyos-defaites');
    }
  });
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  for (let i = 0; i < 4; i++) {
    if (/EXPERT/.test(await menu.locator('.difficulty-selector b').first().textContent())) break;
    await menu.locator('.difficulty-selector button[data-step="1"]').first().click();
  }
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.ILYOS_DEFAITES?.journal?.(), null, { timeout: 60000 });

  const gagner = async () => {
    const humain = await page.evaluate(() => window.ILYOS_DEFAITES.journal().joueurs.find(j => !j.ia).id);
    await page.evaluate(id => { for (let i = 0; i < 3; i++) window.ILYOS_TEST.marquer(id); }, humain);
    await expect(page.locator('#victoryModal')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => page.evaluate(() => window.ILYOS_DEFAITES.derniere()?.id || null)).not.toBeNull();
    return page.evaluate(() => window.ILYOS_DEFAITES.derniere().id);
  };

  const premiere = await gagner();
  await page.click('#replayBtn');
  await page.waitForFunction(id => {
    const j = window.ILYOS_DEFAITES.journal();
    return j && j.id !== id && j.etatRef !== null;
  }, premiere, { timeout: 30000 }).catch(() => {});
  const journal = await page.evaluate(() => {
    const j = window.ILYOS_DEFAITES.journal();
    return j ? { id: j.id, expert: j.joueurs.some(x => x.ia && x.difficulte === 'expert') } : null;
  });
  expect(journal, 'la partie rejouée a un journal').not.toBeNull();
  expect(journal.id).not.toBe(premiere);
  expect(journal.expert, 'la partie rejouée est contre l’Expert').toBe(true);

  const seconde = await gagner();
  expect(seconde).not.toBe(premiere);
  await expect.poll(() => page.evaluate(async () => (await window.ILYOS_DEFAITES.lister()).length)).toBe(2);
  expect(incidents, incidents.join('\n')).toEqual([]);
});

/* Revue IA contre IA : la même visionneuse, ouverte sur la partie en cours
   mise en pause ; fermer rend la partie telle quelle, « Reprendre » relance
   les IA. */
test("la revue IA contre IA s'ouvre dans la visionneuse et rend la partie", async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.ILYOS_TEST?.playAIvsAI === 'function', null, { timeout: 60000 });
  await page.evaluate(() => { window.ILYOS_BENCH.vitesse(0.15); window.ILYOS_TEST.playAIvsAI({ difficulty: 'expert', maxTurns: 40 }); });
  await page.waitForFunction(() => window.ILYOS_AUTOPSIE?.active?.()
    && window.ILYOS_AUTOPSIE.journal().filter(e => e.instantane).length >= 3, null, { timeout: 240000 });
  const barre = page.locator('.revue-barre');
  await expect(barre).toContainText('Pause et analyser');
  await barre.locator('[data-revue="analyser"]').click();
  await page.waitForFunction(() => window.ILYOS_DEFAITES.vue()?.direct, null, { timeout: 60000 });
  const vue = page.locator('.defaites-vue');
  await expect(vue).toBeVisible();
  await expect(barre).toBeHidden();
  const ouverte = await page.evaluate(() => window.ILYOS_DEFAITES.vue());
  expect(ouverte.tours, 'décisions relevées + position actuelle').toBeGreaterThanOrEqual(4);

  // Un tour d'IA : sa réflexion, et un plan qu'elle a comparé, tracé.
  await vue.locator('[data-vue="premier"]').click();
  await expect(vue).toContainText('a pensé');
  await vue.locator('details.dv-envisages summary').first().click();
  await vue.locator('[data-vue="tracer-envisage"]').first().click();
  await expect.poll(() => page.evaluate(() => window.ILYOS_DEFAITES.vue().trace)).toBe('envisage');
  expect(await page.evaluate(() => window.ILYOS_DEFAITES.vue().traces)).toBeGreaterThan(0);

  // L'annotation rejoint le journal de la revue (résumé, export).
  await vue.locator('[data-vue-annotation]').fill('devait bloquer le village');
  await vue.locator('[data-vue="annoter"]').click();
  await expect.poll(() => page.evaluate(() =>
    window.ILYOS_AUTOPSIE.journal().filter(e => e.annotation).map(e => e.annotation.coupAttendu)))
    .toEqual(['devait bloquer le village']);

  // Fermer : la partie revient telle qu'à la pause, en pause.
  await vue.locator('[data-vue="fermer"]').click();
  await expect(page.locator('.defaites-vue')).toHaveCount(0);
  await expect(barre).toContainText('partie en pause');
  const avant = await page.evaluate(() => window.ILYOS_AUTOPSIE.journal().length);
  await barre.locator('[data-revue="reprendre"]').click();
  await page.waitForFunction(n => window.ILYOS_AUTOPSIE.journal().length > n, avant, { timeout: 180000 });
  expect(incidents, incidents.join('\n')).toEqual([]);
});

test("partie solo : la revue IA s'ouvre depuis le menu ⚙ et rend la partie contre la même IA", async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await demarrerPartieExpert(page);
  await jouerJusqua(page, 2);
  // À mon tour, IA au repos.
  await page.waitForFunction(() => {
    const c = window.ILYOS_TEST.joueurCourant();
    return c && !c.ia && !document.querySelector('#gameScreen.ai-turn');
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const avant = await page.evaluate(() => ({ tours: window.ILYOS_DEFAITES.journal().tours.length }));

  // La roue visible est celle du HUD organique ; elle relaie le clic à #hudV2GearBtn.
  await page.locator('#ov2Gear').click();
  const bouton = page.locator('#revueIaBtn');
  await expect(bouton).toBeVisible();
  await bouton.click();
  await page.waitForFunction(() => window.ILYOS_DEFAITES.vue()?.direct, null, { timeout: 60000 });
  const vue = page.locator('.defaites-vue');
  await expect(vue).toBeVisible();
  await expect(vue).toContainText('Revue IA — partie en cours');
  await expect(vue).toContainText('a pensé');
  await expect(vue.locator('[data-vue="continuer-proposition"]')).toHaveCount(0);

  // Reprendre : même partie, adversaire toujours IA, journal sur le même fil.
  await vue.locator('[data-vue="reprendre"]').click();
  await expect(page.locator('.defaites-vue')).toHaveCount(0);
  const apres = await page.evaluate(() => ({
    tours: window.ILYOS_DEFAITES.journal() ? window.ILYOS_DEFAITES.journal().tours.length : -1
  }));
  expect(apres.tours, 'le journal reprend le même fil').toBe(avant.tours);
  // Mon tour terminé, l'IA rejoue : sa décision rejoint le même journal.
  await page.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
  await page.waitForFunction(n => window.ILYOS_DEFAITES.journal().tours.filter(t => t.decision).length > n,
    await page.evaluate(() => window.ILYOS_DEFAITES.journal().tours.filter(t => t.decision).length),
    { timeout: 120000 });
  expect(incidents, incidents.join('\n')).toEqual([]);
});
