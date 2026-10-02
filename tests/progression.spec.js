/* Progression du joueur (js/game/progression.js) : XP et niveau.

   1. Le moteur pur : courbe de niveau, gain d'une partie selon le résultat,
      la difficulté, la durée et la première victoire du jour, bascule du jour
      à 4 h. Interrogé dans la page, jamais recopié ici.
   2. De bout en bout : une vraie partie solo lancée par le menu, gagnée par
      le vrai chemin de validation (ILYOS_TEST.marquer). Le gain s'affiche
      sous le bilan, le profil est enregistré, et le badge du menu montre le
      niveau après rechargement.
   3. La collection : déblocage par niveau, équipement refusé pour un objet
      verrouillé, puis couleur et gardien portés dans une vraie partie solo.
   4. La saison : l'XP fait avancer la piste pendant la saison seulement, les
      paliers donnent leur récompense une fois, le coffre ne compte pas pour
      la saison.
   5. En ligne : l'apparence de chaque joueur voyage avec la connexion. Un
      faux PeerJS relie deux onglets par BroadcastChannel ; l'hôte et
      l'invité voient la même couleur, le même gardien et le même titre.
   6. Le journal : bilan des 7 jours, graphe des 14 jours et rythme de saison
      calculés sur une liste donnée. */

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
    // La troisième, tirée au hasard, pourrait doubler l'une des deux.
    profil.quetes.actives[2] = { type: 'grand', fait: 0, finie: false };
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
      localStorage.removeItem('ilyos-journal-v1');
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

  // La partie est notée au journal, avec son gain et son mode.
  const journal = await page.evaluate(() => window.ILYOS_PROGRESSION.journal());
  expect(journal.total).toBe(1);
  expect(journal.dernieres[0]).toMatchObject({ type: 'partie', mode: 'solo', resultat: 'victoire', difficulte: 'normal' });
  expect(journal.dernieres[0].xp).toBe(profil.xp);
  expect(journal.bilan).toMatchObject({ parties: 1, victoires: 1, joursJoues: 1 });

  // Le badge du menu relit le profil enregistré.
  await page.reload();
  await expect(page.frameLocator('iframe[src*="menu/frame.html"]').locator('#profilBadge'))
    .toHaveAttribute('title', /XP vers le niveau/, { timeout: 45000 });

  expect(incidents).toEqual([]);
});

test('collection : déblocage par niveau, équipement porté en partie', async ({ page }) => {
  const incidents = [];
  page.on('pageerror', erreur => incidents.push(erreur.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('collection-test')) {
      sessionStorage.setItem('collection-test', '1');
      // 3 000 XP : niveau 9.
      localStorage.setItem('ilyos-profil-v1', JSON.stringify({ version: 1, xp: 3000 }));
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.ILYOS_PROGRESSION, null, { timeout: 45000 });
  const r = await page.evaluate(() => {
    const P = window.ILYOS_PROGRESSION;
    const objet = (cat, id) => P.collection().find(c => c.cle === cat).objets.find(o => o.id === id);
    return {
      niveau: P.etat().niveau,
      corail: objet('couleur', 'corail').debloque,
      braise: objet('couleur', 'braise'),
      refuse: P.equiper('couleur', 'braise'),
      couleur: P.equiper('couleur', 'corail'),
      heros: P.equiper('heros', 'capuche'),
      equipe: objet('heros', 'capuche').equipe
    };
  });
  expect(r.niveau).toBe(9);
  expect(r.corail).toBe(true);
  expect(r.braise).toMatchObject({ debloque: false, texte: 'Niveau 10' });
  expect(r.refuse).toBe(false);
  expect(r.couleur).toBe(true);
  expect(r.heros).toBe(true);
  expect(r.equipe).toBe(true);

  const menu = page.frameLocator('iframe[src*="menu/frame.html"]');
  await menu.locator('[data-mode="solo"]').first().click();
  await menu.locator('text=AFFRONTER LE CPU').first().click();
  await page.waitForSelector('#gameScreen:not(.hidden)', { timeout: 40000 });
  await page.waitForFunction(() => !!window.ILYOS_TEST?.joueurCourant?.(), null, { timeout: 60000 });
  const joueurs = await page.evaluate(() => window.ILYOS_TEST.joueurs());
  expect(joueurs.find(j => !j.ia)).toMatchObject({ couleur: '#f2865e', heros: 'hero2Hooded' });
  // L'adversaire garde son apparence d'origine.
  expect(joueurs.find(j => j.ia)).toMatchObject({ heros: null });
  expect(incidents).toEqual([]);
});

test('saison : paliers, récompenses et dates', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.ILYOS_PROGRESSION, null, { timeout: 45000 });
  const r = await page.evaluate(() => {
    const P = window.ILYOS_PROGRESSION;
    const s1 = P.saisons.find(s => s.id === 's1');
    const pendant = s1.debut;
    const profil = P.profilVide();
    const a = P.ajouterXp(profil, 1100, pendant);
    const apresDeux = { xp: profil.saisons.s1.xp, paye: profil.saisons.s1.paye, vent: profil.offrande.vent };
    // Palier 4 : coffre de 150 XP, compté pour le niveau seulement.
    const b = P.ajouterXp(profil, 900, pendant);
    const avantSaison = P.profilVide();
    P.ajouterXp(avantSaison, 5000, '2026-09-01');
    const apresSaison = P.profilVide();
    P.ajouterXp(apresSaison, 5000, s1.fin);
    return {
      paliers: s1.paliers.length,
      a: a.paliers.map(p => p.palier), apresDeux,
      b: b.paliers.map(p => p.texte), xpTotal: profil.xp, saisonXp: profil.saisons.s1.xp,
      horsSaison: [avantSaison.saisons.s1 || null, apresSaison.saisons.s1 || null]
    };
  });
  expect(r.paliers).toBe(30);
  expect(r.a).toEqual([1, 2]);
  expect(r.apresDeux).toEqual({ xp: 1100, paye: 2, vent: 1 });
  expect(r.b).toEqual(['Rose d\'aube', 'Coffre de 150 XP']);
  expect(r.xpTotal).toBe(2000 + 150);
  expect(r.saisonXp).toBe(2000);
  expect(r.horsSaison).toEqual([null, null]);
});

/* Faux PeerJS : même interface que le SDK pour ce qu'utilise core.js, deux
   onglets du même contexte reliés par BroadcastChannel. Le profil est rangé
   par onglet (sessionStorage), sinon les deux joueurs partageraient le leur. */
function fauxPeer() {
  const lire = Storage.prototype.getItem, ecrire = Storage.prototype.setItem;
  Storage.prototype.getItem = function (k) { return lire.call(k === 'ilyos-profil-v1' && this === localStorage ? sessionStorage : this, k); };
  Storage.prototype.setItem = function (k, v) { return ecrire.call(k === 'ilyos-profil-v1' && this === localStorage ? sessionStorage : this, k, v); };
  class Emetteur {
    constructor() { this.h = {}; }
    on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
    emit(e, ...a) { (this.h[e] || []).forEach(f => f(...a)); }
  }
  const canal = new BroadcastChannel('ilyos-faux-peer');
  class Connexion extends Emetteur {
    constructor(moi, autre) {
      super(); this.moi = moi; this.autre = autre; this.open = false;
      canal.addEventListener('message', ({ data: m }) => {
        if (m.to !== this.moi) return;
        if (m.k === 'open' && !this.open) { this.open = true; setTimeout(() => this.emit('open'), 20); }
        if (m.k === 'data') this.emit('data', JSON.parse(m.d));
      });
    }
    send(d) { canal.postMessage({ to: this.autre, k: 'data', d: JSON.stringify(d) }); }
    close() { }
  }
  class Peer extends Emetteur {
    constructor(id) {
      super(); this.id = id || 'invite';
      setTimeout(() => this.emit('open', this.id), 50);
      canal.addEventListener('message', ({ data: m }) => {
        if (m.k !== 'connect' || m.to !== this.id) return;
        const c = new Connexion(`${this.id}:h`, m.from);
        this.emit('connection', c);
        setTimeout(() => { canal.postMessage({ to: m.from, k: 'open' }); c.open = true; c.emit('open'); }, 30);
      });
    }
    connect(hote) { const c = new Connexion('invite:c', `${hote}:h`); canal.postMessage({ k: 'connect', to: hote, from: 'invite:c' }); return c; }
    reconnect() { }
    destroy() { }
  }
  Object.defineProperty(window, 'Peer', { value: Peer, writable: false, configurable: false });
}

test('en ligne : couleur, gardien et titre vus des deux côtés', async ({ browser }, testInfo) => {
  test.setTimeout(150000);
  const contexte = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  await contexte.addInitScript(fauxPeer);
  const profils = {
    host: { version: 1, xp: 20000, equipement: { couleur: 'lagon', heros: 'barbare', titre: 'gardien' } },
    guest: { version: 1, xp: 0, saisons: { s1: { xp: 15000, paye: 30 } }, equipement: { couleur: 'rubis', heros: 'squelette-mage', titre: 'phenix' } }
  };
  const pages = {};
  const erreurs = [];
  for (const role of ['host', 'guest']) {
    const page = await contexte.newPage();
    page.on('pageerror', e => erreurs.push(`${role} : ${e.message}`));
    await page.goto('/');
    await page.waitForFunction(() => !!window.ILYOS_PROGRESSION, null, { timeout: 45000 });
    await page.evaluate(profil => localStorage.setItem('ilyos-profil-v1', JSON.stringify(profil)), profils[role]);
    await page.evaluate(r => {
      const choix = document.getElementById('playerCount');
      choix.value = 'online';
      choix.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('onlineRoleSelect').value = r;
      document.getElementById('onlineRoomInput').value = 'TEST7';
      document.getElementById('startBtn').click();
    }, role);
    pages[role] = page;
  }
  for (const role of ['host', 'guest']) {
    const page = pages[role];
    await page.waitForFunction(() => window.ILYOS_TEST?.joueurs?.()?.length === 2, null, { timeout: 45000 });
    const joueurs = await page.evaluate(() => window.ILYOS_TEST.joueurs().map(j => ({ couleur: j.couleur, heros: j.heros })));
    expect(joueurs, role).toEqual([
      { couleur: '#38c6cf', heros: 'hero3' },
      { couleur: '#c72d6b', heros: 'heroSkeletonMage' }
    ]);
    await expect(page.locator('#ilyosHudOrganicV2 .ov2-left .ov2-ptitre')).toHaveText('Gardien de l\'aube');
    await expect(page.locator('#ilyosHudOrganicV2 .ov2-right .ov2-ptitre')).toHaveText('Phénix d\'Ilyos');
  }
  expect(erreurs).toEqual([]);
  await contexte.close();
});

test('journal : bilan de la semaine et rythme de saison', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.ILYOS_PROGRESSION, null, { timeout: 45000 });
  const r = await page.evaluate(() => {
    const P = window.ILYOS_PROGRESSION;
    const partie = (jour, resultat, xp, duree) => ({ t: 0, jour, type: 'partie', mode: 'solo', resultat, xp, duree });
    const liste = [
      partie('2026-09-20', 'victoire', 999, 600), // hors des 14 jours
      partie('2026-09-28', 'defaite', 60, 300), // dans les 14 jours, hors des 7
      partie('2026-10-08', 'victoire', 200, 600),
      partie('2026-10-08', 'defaite', 60, 900),
      { t: 0, jour: '2026-10-09', type: 'bonus', libelle: 'Offrande', xp: 40 },
      partie('2026-10-10', 'nul', 90, null)
    ];
    const profil = P.profilVide();
    profil.saisons = { s1: { xp: 2000, paye: 4 } };
    const v = P.vueJournal(liste, '2026-10-10T12:00:00', profil);
    return { jours: v.jours.length, premier: v.jours[0].jour, dernier: v.jours[13], xp28: v.jours.find(j => j.jour === '2026-09-28').xp,
      bilan: v.bilan, total: v.total, dernieres: v.dernieres.map(e => e.jour), rythme: v.rythme };
  });
  expect(r.jours).toBe(14);
  expect(r.premier).toBe('2026-09-27');
  expect(r.dernier).toEqual({ jour: '2026-10-10', xp: 90, parties: 1 });
  expect(r.xp28).toBe(60);
  // 7 jours : 3 parties, 1 victoire, 350 XP de partie + 40 d'offrande.
  expect(r.bilan).toEqual({ parties: 3, victoires: 1, xpParPartie: 117, dureeMoyenne: 750, joursJoues: 3, xpParJour: 56 });
  expect(r.total).toBe(5);
  expect(r.dernieres).toEqual(['2026-10-10', '2026-10-08', '2026-10-08', '2026-09-28', '2026-09-20']);
  // Saison 1 : palier 4 sur 30, 13 000 XP restants à 56 XP par jour : la
  // piste ne serait pas finie à temps.
  expect(r.rythme).toMatchObject({ reste: 13000, total: 30, aTemps: false });
  expect(r.rythme.palierFinal).toBeGreaterThanOrEqual(4);
  expect(r.rythme.palierFinal).toBeLessThan(30);
});
