/* Vol de couronne : un gardien à côté d'un porteur ADVERSE lui prend sa
   couronne gratuitement (règle de l'interface, ui.js beginCrownRecovery).

     npm start   puis   node scripts/verif-vol-couronne.js   (port 8123)

   Jusqu'au 29/09, l'IA l'ignorait : elle ne volait jamais, et sa riposte
   simulée ne volait pas ses porteurs. Trois contrôles :
     1. la règle (adjacence, adversaire, une prise au sanctuaire par tour) ;
     2. le danger : un porteur qu'un gardien adverse peut rejoindre est
        « volable » (terme porteurVolable) ;
     3. la position de la capture du 29/09, côté jaune (6 MOVE, 3 PUSH,
        1 MAGIC) : l'IA vole au moins une couronne.                          */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const TERRE = [[2,5],[2,6],[3,3],[3,4],[3,5],[3,7],[4,2],[4,3],[4,4],[4,6],[4,7],[4,8],[5,3],[5,7],
  [6,3],[6,4],[6,6],[6,7],[6,8],[7,0],[7,1],[7,2],[7,3],[7,4],[7,5],[7,6],[7,7],[7,8],[7,9],[7,10],
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,6],[9,3],[9,4],[9,5]];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/game.js*', async route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
      const hook = `window.TEST_VOL = (terre, jaune, main) => {
        state = state || {};
        benchPoserPosition({ seed: 3, islandPlacedThisTurn: false, aiPlayer: 0,
          islands: terre.map(cell => ({ owner: 0, cells: [cell] })),
          characters: [{ id: 'jaune', player: 0, r: jaune[0], c: jaune[1] },
            { id: 'v1', player: 1, r: 5, c: 5 }, { id: 'v2', player: 1, r: 6, c: 6 }],
          crowns: [{ r: 5, c: 5, carrierId: 'v1', active: true }, { r: 6, c: 6, carrierId: 'v2', active: true }],
          hands: [main, ['MOVE','MOVE','MOVE','PUSH','PUSH']] });
        state.currentPlayer = 0;
        const regle = withSimulatedState(cloneStateForSimulation(), () => {
          const transitions = plannerTransitionsGratuites(0).filter(t => t.type === 'VOL').length;
          const loin = !applyFreeStealCore('jaune', 'crown-2');
          const voleAuSanctuaire = !!(jaune[0] === 4 && jaune[1] === 5 && applyFreeStealCore('jaune', 'crown-1'));
          return { transitions, loin, voleAuSanctuaire };
        });
        // Le danger se lit du point de vue violet, jaune ayant le trait ensuite.
        const danger = withSimulatedState(cloneStateForSimulation(), () => {
          state.currentPlayer = 1;
          return evaluerAvecDetail(1).termes.filter(t => t.terme === 'porteurVolable')
            .reduce((s, t) => s + t.montant, 0);
        });
        const rapport = main.length ? plannerChercherPlanRobuste(0) : null;
        return { regle, danger, plan: rapport ? rapport.plan.map(a => ({ ...a })) : [],
          lisible: rapport ? autopsieDecrirePlan(rapport.plan, snapshotState()) : '' };
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_VOL === 'function', null, { timeout: 60000 });
    const t = (jaune, main) => page.evaluate(a => window.TEST_VOL(...a), [TERRE, jaune, main]);

    // 1. Règle : jaune collé au porteur du sanctuaire (5,5), loin de (6,6).
    const colle = await t([4, 5], []);
    assert.ok(colle.regle.loin, 'pas de vol sans adjacence');
    assert.ok(colle.regle.voleAuSanctuaire, 'vol du porteur adjacent');
    assert.equal(colle.regle.transitions, 1, 'une transition VOL proposée');
    console.log('ok  règle du vol (adjacence, adversaire)');

    // 2. Danger : jaune collé à (5,5) → porteur violet volable ; jaune loin → rien.
    assert.ok(colle.danger < 0, `porteur volable attendu (${colle.danger})`);
    const loin = await t([0, 0], []);
    assert.equal(loin.danger, 0, `aucun danger de vol attendu loin des porteurs (${loin.danger})`);
    console.log(`ok  porteur volable : ${Math.round(colle.danger)} collé, 0 hors d'atteinte`);

    // 3. Position de la capture, côté jaune.
    const partie = await t([4, 3], ['MOVE','MOVE','MOVE','MOVE','MOVE','MOVE','PUSH','PUSH','PUSH','MAGIC']);
    console.log(`plan jaune : ${partie.lisible}`);
    assert.ok(partie.plan.some(a => a.type === 'VOL'), 'l’IA doit voler une couronne');
    console.log('verif-vol-couronne : 3/3');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
