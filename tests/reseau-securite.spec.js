/* Sécurité du jeu en ligne (js/game/core.js, applyOnlineState et voisines).

   Un pair malhonnête parle directement au protocole, sans passer par le
   formulaire du menu. Deux onglets reliés par le faux PeerJS jouent une vraie
   partie ; un troisième émetteur glisse des messages forgés sur le même canal.

   1. La partie normale continue : l'hôte passe la main, l'invité la rend.
   2. Un nom qui ressemble à du HTML reste du texte dans la fiche de l'unité,
      aucun gestionnaire HTML ne s'exécute.
   3. L'invité refuse un état mal formé (couleur, score), sans révision ou
      plus ancien que le sien.
   4. L'hôte refuse un état de l'invité pendant son propre tour et un état à
      révision égale.
   5. Une seconde connexion au salon est refusée ; celle de l'invité reste. */

const { test, expect } = require('@playwright/test');
const { fauxPeer } = require('./faux-peer');

const HOTE = 'ilyos-sec7-host:h';
const INVITE = 'invite:c';

/* Garde le dernier état reçu par chaque onglet : le point de départ des
   messages forgés est une vraie partie, pas un état recopié à la main. */
function espion() {
  const canal = new BroadcastChannel('ilyos-faux-peer');
  canal.addEventListener('message', ({ data: m }) => {
    if (m.k !== 'data') return;
    const message = JSON.parse(m.d);
    if (message.type === 'state') {
      (window.__etatsRecus = window.__etatsRecus || {})[m.to] = message;
    }
  });
}

/* Envoie un message comme s'il venait du pair. */
async function forger(page, destinataire, message) {
  await page.evaluate(({ destinataire, message }) => {
    new BroadcastChannel('ilyos-faux-peer').postMessage({ to: destinataire, k: 'data', d: JSON.stringify(message) });
  }, { destinataire, message });
  await page.waitForTimeout(400);
}

test('en ligne : les messages forgés ne passent pas', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const contexte = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  await contexte.addInitScript(fauxPeer);
  await contexte.addInitScript(espion);
  const pages = {};
  const erreurs = [];
  for (const role of ['host', 'guest']) {
    const page = await contexte.newPage();
    page.on('pageerror', e => erreurs.push(`${role} : ${e.message}`));
    await page.goto('/');
    await page.waitForFunction(() => !!window.ILYOS_TEST, null, { timeout: 45000 });
    await page.evaluate(r => {
      const choix = document.getElementById('playerCount');
      choix.value = 'online';
      choix.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('onlineRoleSelect').value = r;
      document.getElementById('onlineRoomInput').value = 'SEC7';
      document.getElementById('startBtn').click();
    }, role);
    pages[role] = page;
  }
  const { host, guest } = pages;
  for (const page of [host, guest]) {
    await page.waitForFunction(() => window.ILYOS_TEST?.joueurs?.()?.length === 2, null, { timeout: 45000 });
  }
  const trait = page => page.evaluate(() => window.ILYOS_TEST.joueurCourant().id);
  const scores = page => page.evaluate(() => window.ILYOS_TEST.joueurs().map(j => j.score));

  // 1. Partie normale : la main fait l'aller-retour.
  await host.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
  await guest.waitForFunction(() => window.ILYOS_TEST.joueurCourant().id === 1, null, { timeout: 10000 });
  await guest.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
  await host.waitForFunction(() => window.ILYOS_TEST.joueurCourant().id === 0, null, { timeout: 10000 });
  await guest.waitForFunction(() => window.ILYOS_TEST.joueurCourant().id === 0, null, { timeout: 10000 });

  const reference = await guest.evaluate(i => window.__etatsRecus[i], INVITE);
  expect(reference?.state?.players?.length).toBe(2);
  const copie = () => JSON.parse(JSON.stringify(reference));

  // 2. Nom piégé : accepté comme texte, la fiche ne crée aucun élément.
  {
    // Même révision que l'hôte : l'invité l'accepte (renvoi de l'hôte).
    const m = copie();
    m.state.players[0].name = '<img src=x onerror="window.__pirate=1">';
    m.state.players[0].icon = '<img src=x onerror="window.__pirate=2">';
    m.state.players[0].titre = '<b onmouseover="window.__pirate=3">';
    m.state.characters = [{ id: 'char-test', player: 0, r: m.state.players[0].village.r, c: m.state.players[0].village.c }];
    m.state.selectedCharId = 'char-test';
    await forger(host, INVITE, m);
    const fiche = await guest.evaluate(() => ({
      pirate: window.__pirate ?? null,
      images: document.querySelectorAll('#unitCard img, #unitCard [onerror]').length,
      texte: document.getElementById('unitCard').textContent,
      nom: window.ILYOS_TEST.joueurs()[0].nom
    }));
    expect(fiche.pirate).toBeNull();
    expect(fiche.images).toBe(0);
    expect(fiche.nom).not.toMatch(/[<>"]/);
    expect(fiche.texte).toContain(`Gardien de ${fiche.nom}`);
  }

  // 3. Invité : forme invalide, révision absente ou dépassée.
  const scoreInvite = await scores(guest);
  for (const piege of [
    m => { m.revision += 20; m.state.players[1].color = 'red;background:url(//x)'; },
    m => { m.revision += 20; m.state.players[1].score = 999; },
    m => { m.revision += 20; m.state.islands = 'rien'; },
    m => { m.revision += 20; m.state.log = ['<svg onload="window.__pirate=4">']; m.state.players[1].score = 2; },
    m => { delete m.revision; m.state.players[1].score = 2; },
    m => { m.revision = 1; m.state.players[1].score = 2; }
  ]) {
    const m = copie();
    piege(m);
    await forger(host, INVITE, m);
  }
  expect(await scores(guest)).toEqual(scoreInvite);
  expect(await guest.evaluate(() => window.__pirate ?? null)).toBeNull();

  // 4. Hôte : c'est son tour, l'invité ne peut rien imposer.
  {
    expect(await trait(host)).toBe(0);
    const m = copie();
    m.revision += 100;
    m.state.players[1].score = 2;
    m.state.currentPlayer = 1;
    await forger(guest, HOTE, m);
    expect(await scores(host)).toEqual([0, 0]);
    expect(await trait(host)).toBe(0);

    // Révision égale à celle de l'hôte, pendant le tour de l'invité.
    await host.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
    await guest.waitForFunction(() => window.ILYOS_TEST.joueurCourant().id === 1, null, { timeout: 10000 });
    const tourInvite = await guest.evaluate(i => window.__etatsRecus[i], INVITE);
    const egal = JSON.parse(JSON.stringify(tourInvite));
    egal.state.players[1].score = 2;
    await forger(guest, HOTE, egal);
    expect(await scores(host)).toEqual([0, 0]);
  }

  // 5. Un intrus se présente au salon : il est refusé, l'invité garde sa place.
  await host.evaluate(() => {
    window.__fauxPeerFermetures = [];
    new BroadcastChannel('ilyos-faux-peer').postMessage({ k: 'connect', to: 'ilyos-sec7-host', from: 'intrus:c' });
  });
  await host.waitForTimeout(400);
  expect(await host.evaluate(() => window.__fauxPeerFermetures)).toEqual(['intrus:c']);
  await guest.evaluate(() => window.ILYOS_TEST.terminerTourHumain());
  await host.waitForFunction(() => window.ILYOS_TEST.joueurCourant().id === 0, null, { timeout: 10000 });

  expect(erreurs).toEqual([]);
  await contexte.close();
});
