/* Progression du joueur (js/game/progression.js) : XP et niveau.

   1. Le moteur pur : courbe de niveau, gain d'une partie selon le résultat,
      la difficulté, la durée et la première victoire du jour, bascule du jour
      à 4 h. Interrogé dans la page, jamais recopié ici.
   2. De bout en bout : une vraie partie solo lancée par le menu, gagnée par
      le vrai chemin de validation (ILYOS_TEST.marquer). Le gain s'affiche
      sous le bilan, le profil est enregistré, et le badge du menu montre le
      niveau après rechargement. */

const { test, expect } = require('@playwright/test');

test('moteur de progression : courbe, gains et journée', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.ILYOS_PROGRESSION, null, { timeout: 45000 });
  const r = await page.evaluate(() => {
    const P = window.ILYOS_PROGRESSION;
    const gain = (bilan, deja) => P.calculerGainPartie(bilan, deja).total;
    return {
      pas1: P.xpPourPasser(1),
      pas10: P.xpPourPasser(10),
      pas40: P.xpPourPasser(40),
      n0: P.niveauDepuisXp(0),
      n199: P.niveauDepuisXp(199).niveau,
      n200: P.niveauDepuisXp(200),
      defaite: gain({ resultat: 'defaite', difficulte: 'normal', manches: 8 }, true),
      nul: gain({ resultat: 'nul', difficulte: null, manches: 8 }, true),
      victoire: gain({ resultat: 'victoire', difficulte: 'normal', manches: 8 }, true),
      premiere: gain({ resultat: 'victoire', difficulte: 'normal', manches: 8 }, false),
      expert: gain({ resultat: 'victoire', difficulte: 'expert', manches: 8 }, true),
      facile: gain({ resultat: 'defaite', difficulte: 'easy', manches: 8 }, true),
      courte: gain({ resultat: 'victoire', difficulte: 'normal', manches: 2 }, true),
      jour0359: P.jour('2026-10-02T03:59:00'),
      jour0400: P.jour('2026-10-02T04:00:00')
    };
  });
  expect(r.pas1).toBe(200);
  expect(r.pas10).toBe(650);
  expect(r.pas40).toBe(1000);
  expect(r.n0).toEqual({ niveau: 1, xpDansNiveau: 0, xpPourSuivant: 200 });
  expect(r.n199).toBe(1);
  expect(r.n200).toEqual({ niveau: 2, xpDansNiveau: 0, xpPourSuivant: 250 });
  // Jouer est récompensé, même perdu.
  expect(r.defaite).toBe(50);
  expect(r.nul).toBe(75);
  expect(r.victoire).toBe(100);
  expect(r.premiere).toBe(200);
  expect(r.expert).toBe(150);
  expect(r.facile).toBe(40);
  expect(r.courte).toBe(50);
  expect(r.jour0359).toBe('2026-10-01');
  expect(r.jour0400).toBe('2026-10-02');
});

test('quêtes : trois par jour, rien ne se perd, avancement sur les compteurs', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.ILYOS_PROGRESSION, null, { timeout: 45000 });
  const r = await page.evaluate(() => {
    const P = window.ILYOS_PROGRESSION;
    const profil = P.profilVide();
    P.renouvelerQuetes(profil, '2026-10-01');
    const types = profil.quetes.actives.map(q => q.type);
    // Jamais de quête dans un mode jamais essayé.
    const sansModeInconnu = !types.includes('cpuFort') && !types.includes('ensemble');
    profil.quetes.actives[0] = { type: 'poussees', fait: 0, finie: false };
    profil.quetes.actives[1] = { type: 'parties', fait: 0, finie: false };
    const finies = P.avancerQuetes(profil, { partie: true, resultat: 'defaite', stats: { poussees: 7, couronnes: 0, chutes: 1 } });
    // Le lendemain : la quête finie part, celle en cours reste.
    P.renouvelerQuetes(profil, '2026-10-02');
    return {
      nombre: types.length, sansModeInconnu,
      finies: finies.filter(q => !q.semaine).map(q => q.texte),
      parties: profil.quetes.actives.find(q => q.type === 'parties'),
      apres: profil.quetes.actives.length,
      semaine: P.semaine('2026-10-01')
    };
  });
  expect(r.nombre).toBe(3);
  expect(r.sansModeInconnu).toBe(true);
  expect(r.finies).toEqual(['Pousser 6 fois']);
  expect(r.parties).toEqual({ type: 'parties', fait: 1, finie: false });
  expect(r.apres).toBe(3);
  expect(r.semaine).toBe('2026-09-28');
});

test('une partie solo gagnée rapporte de l’XP, affichée et enregistrée', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('progression-test')) {
      sessionStorage.setItem('progression-test', '1');
      localStorage.removeItem('ilyos-profil-v1');
    }
  });
  await page.goto('/');
  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await expect(menu.locator('#profilBadge')).toHaveText(/NIVEAU/, { timeout: 45000 });

  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.ILYOS_TEST?.joueurCourant?.(), null, { timeout: 60000 });

  const humain = await page.evaluate(() => window.ILYOS_TEST.joueurs().find(j => !j.ia).id);
  await page.evaluate(id => { for (let i = 0; i < 3; i++) window.ILYOS_TEST.marquer(id); }, humain);

  const bloc = page.locator('#victoryModal .progression-gain');
  await expect(bloc).toBeVisible({ timeout: 20000 });
  // Partie de moins de 4 manches : (50 + 50) × 0,5, puis +100 pour la
  // première victoire du jour, au CPU Normal par défaut.
  await expect(bloc.locator('.progression-lignes li')).toHaveCount(4);
  await expect(bloc.locator('.progression-quetes li')).toHaveCount(4);
  await expect(bloc.locator('.progression-titre')).toHaveText(/Niveau \d/);

  const profil = await page.evaluate(() => window.ILYOS_PROGRESSION.profil());
  // 150 XP de partie, plus les quêtes que cette victoire a pu accomplir.
  expect(profil.xp).toBeGreaterThanOrEqual(150);
  expect(profil.parties).toBe(1);
  expect(profil.victoires).toBe(1);

  // Le badge du menu relit le profil enregistré.
  await page.reload();
  await expect(page.frameLocator('iframe[src*="menu/frame.html"]').locator('#profilBadge'))
    .toHaveAttribute('title', /XP vers le niveau/, { timeout: 45000 });

  expect(incidents).toEqual([]);
});
