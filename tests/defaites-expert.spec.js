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
  expect(dossier.analyse.resume).toContain('Défaite Expert');
  expect(dossier.analyse.signales.length, 'au moins la dernière décision').toBeGreaterThanOrEqual(1);
  await expect(page.locator('#victoryModal .defaite-ia-resume')).toContainText('Défaite Expert');

  // Bibliothèque : la partie y est, et se rejoue depuis son début.
  await page.locator('#victoryModal .defaite-ia-biblio').click();
  const ligne = page.locator('.defaites-biblio .defaites-ligne');
  await expect(ligne).toHaveCount(1);
  await ligne.locator('[data-action="rejouer"]').click();
  await expect(page.locator('.defaites-biblio')).toHaveCount(0);
  await expect(page.locator('#victoryModal')).toBeHidden();
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
