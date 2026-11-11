/* Lancer de couronne élargi : l'île posée DANS LE VIDE pour recevoir une
   couronne poussée, quand le CPU a déjà tous ses gardiens.

     npm start   puis   node scripts/verif-lancer-elargi.js   (port 8123)

   Violet (joueur 1) a tous ses gardiens. Une couronne est au sol à côté de
   l'un d'eux ; deux cases de vide la séparent d'un autre gardien violet, plus
   près du village. Le bon coup : poser une île sur le vide, pousser la
   couronne de deux cases, la ramasser avec le gardien déjà sur place.
   Le banc juge ce que le CPU sait jouer (le choix final dépend du barème) :
   parmi ses lancers, l'un finit avec la couronne portée de l'autre côté.                                */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/game.js*', async route => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
      const hook = `window.TEST_LANCER_ELARGI = (elargi) => {
        state = state || {};
        const poser = miroir => {
          const m = c => miroir ? 10 - c : c;
          const terre = [[2,1],[2,2],[2,3],[1,6],[7,9],[9,0],[9,1],[9,2],[9,3],[9,4],[9,5],[9,6],[9,7],[9,8]];
          const autres = [];
          for (let i = 0; autres.length < MAX_GUARDIANS_PER_PLAYER - 2; i++) autres.push({ id: 'v' + (i + 3), player: 1, r: 9, c: m(i * 2) });
          benchPoserPosition({ seed: 3, islandPlacedThisTurn: false, aiPlayer: 1,
            islands: terre.map(([r, c]) => ({ owner: 0, cells: [[r, m(c)]] })),
            characters: [{ id: 'jaune', player: 0, r: 7, c: m(9) }, { id: 'v1', player: 1, r: 2, c: m(2) },
              { id: 'v2', player: 1, r: 1, c: m(6) }, ...autres],
            crowns: [{ r: 2, c: m(3), carrierId: null, active: true }],
            hands: [[], ['MOVE', 'MOVE', 'PUSH', 'PUSH', 'PUSH']] });
          state.currentPlayer = 1;
        };
        poser(false);
        const cases = crownValidationCellsForPlayer(state.players[1]);
        const vers = (r, c) => Math.min(...cases.map(([vr, vc]) => Math.abs(r - vr) + Math.abs(c - vc)));
        const miroir = vers(1, 6) >= vers(2, 3);
        if (miroir) poser(true);
        const memoire = PLAN_POIDS.lancerElargi;
        PLAN_POIDS.lancerElargi = elargi;
        try {
          // Le banc juge ce que le CPU SAIT jouer : parmi ses lancers, l'un
          // finit-il avec la couronne portée de l'autre côté du vide ?
          const options = plannerCandidatsLancer(1);
          const arrivees = options.map(option => withSimulatedState(cloneStateForSimulation(), () => {
            for (const action of option.actions) if (!plannerAppliquerAction(action)) return null;
            const a = activeArtifacts()[0];
            const g = a && a.carrierId ? characterById(a.carrierId) : null;
            return g ? { joueur: g.player, c: miroir ? 10 - g.c : g.c, vide: option.actions.some(x => x.type === 'POSE') } : null;
          }));
          return { complet: canCreateGuardian(1) === false, options: options.length,
            traverse: arrivees.some(x => x && x.joueur === 1 && x.c >= 5 && x.vide) };
        } finally { PLAN_POIDS.lancerElargi = memoire; }
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_LANCER_ELARGI === 'function', null, { timeout: 60000 });

    const sans = await page.evaluate(() => window.TEST_LANCER_ELARGI(0));
    const avec = await page.evaluate(() => window.TEST_LANCER_ELARGI(1));
    console.log(`sans élargi : ${sans.options} lancer(s) ; élargi : ${avec.options} lancer(s), traversée ${avec.traverse}`);
    assert.ok(avec.complet, 'la position doit avoir tous les gardiens violets');
    assert.ok(!sans.traverse, 'témoin : sans élargi, ce lancer est inconnu');
    assert.ok(avec.traverse, 'élargi : poser une île au vide et y lancer la couronne vers un gardien déjà sur place');
    console.log('verif-lancer-elargi : 1/1');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
