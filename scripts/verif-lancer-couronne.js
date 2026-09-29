/* Lancer de couronne : déposer, pousser, faire apparaître un gardien à côté de
   l'arrivée, ramasser — sur une position humaine (capture du 29/09).

     npm start   puis   node scripts/verif-lancer-couronne.js   (port 8123)

   Violet (joueur 1) porte les deux couronnes au centre, avec 6 déplacements,
   3 poussées, 1 magie, pose non faite. Villages violets : coins haut-droite
   et bas-gauche. Étape par étape, la recherche n'examinait jamais ce coup :
   déposer puis pousser fait chuter la note avant que la pose et le ramassage
   ne la relèvent (1 970 → 758 → 4 457). Proposé en un seul coup
   (plannerCandidatsLancer), il est trouvé et départagé par la riposte.
   Depuis le vol de couronne (29/09), la riposte jaune peut voler : le plan
   retenu peut être plus prudent, mais le lancer doit rester examiné.       */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const TERRE = [[2,5],[2,6],[3,3],[3,4],[3,5],[3,7],[4,2],[4,3],[4,4],[4,6],[4,7],[4,8],[5,3],[5,7],
  [6,3],[6,4],[6,6],[6,7],[6,8],[7,0],[7,1],[7,2],[7,3],[7,4],[7,5],[7,6],[7,7],[7,8],[7,9],[7,10],
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,6],[9,3],[9,4],[9,5]];
const MAIN = ['MOVE', 'MOVE', 'MOVE', 'MOVE', 'MOVE', 'MOVE', 'PUSH', 'PUSH', 'PUSH', 'MAGIC'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/game.js*', async route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
      const hook = `window.TEST_LANCER = (terre, main, lancer) => {
        state = state || {};
        benchPoserPosition({ seed: 3, islandPlacedThisTurn: false, aiPlayer: 1,
          islands: terre.map(cell => ({ owner: 0, cells: [cell] })),
          characters: [{ id: 'jaune', player: 0, r: 4, c: 3 }, { id: 'v1', player: 1, r: 5, c: 5 },
            { id: 'v2', player: 1, r: 6, c: 6 }],
          crowns: [{ r: 5, c: 5, carrierId: 'v1', active: true }, { r: 6, c: 6, carrierId: 'v2', active: true }],
          hands: [[], main] });
        state.currentPlayer = 1;
        const memoire = PLAN_POIDS.lancerCouronne;
        PLAN_POIDS.lancerCouronne = lancer;
        try {
          const rapport = plannerChercherPlanRobuste(1);
          return { plan: rapport.plan.map(a => ({ ...a })),
            examines: (rapport.anticipation?.plansExamines || []).map(p => p.plan.map(a => ({ ...a }))),
            lisible: autopsieDecrirePlan(rapport.plan, snapshotState()) };
        } finally { PLAN_POIDS.lancerCouronne = memoire; }
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_LANCER === 'function', null, { timeout: 60000 });

    const lance = plan => plan.some((a, i) => a.type === 'DEPOT'
      && plan.slice(i + 1).some(p => p.type === 'PUSH' && p.r === a.r && p.c === a.c)
      && plan.some(p => p.type === 'RAMASSAGE' && !['v1', 'v2', 'jaune'].includes(p.charId)
        && p.artifactId === a.artifactId));

    const sans = await page.evaluate(a => window.TEST_LANCER(...a), [TERRE, MAIN, 0]);
    console.log(`sans lancer : ${sans.lisible}`);
    const avec = await page.evaluate(a => window.TEST_LANCER(...a), [TERRE, MAIN, 1]);
    console.log(`avec lancer : ${avec.lisible}`);
    /* Le choix final dépend ensuite de la réplique adverse (qui peut voler) :
       ce banc garantit que la combinaison n'est plus élaguée au creux et
       arrive jusqu'aux plans départagés par la riposte. */
    assert.ok(lance(avec.plan) || avec.examines.some(lance),
      'une couronne déposée, poussée puis ramassée par un gardien apparu doit figurer parmi les plans examinés');
    assert.ok(!lance(sans.plan) && !sans.examines.some(lance), 'témoin : sans le générateur, la combinaison n’apparaît pas');
    console.log('verif-lancer-couronne : 1/1');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
