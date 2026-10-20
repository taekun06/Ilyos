/* Fin de partie quand le joueur qui prend la main ne peut plus poser d'île :
   le plus de couronnes l'emporte ; à égalité, la couronne la plus proche de
   son village départage, sinon match nul (finParPoseImpossible, vainqueurAuxCouronnes).

     npm start   puis   node scripts/verif-fin-pose.js   (port 8123)

   Jusqu'au 30/09, seule la saturation du plateau entier arrêtait la partie ;
   pour un seul joueur bloqué, la pose devenait facultative et la partie
   continuait. Contrôlé sur la transition de la simulation (planner), qui
   suit la même règle que le jeu (turns.js) et le self-play (diagnostics.js). */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/js/game.js*', async route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
      const hook = `window.TEST_FIN_POSE = (limite, scores, crowns = [null, null]) => {
        state = state || {};
        benchPoserPosition({ seed: 11, islandPlacedThisTurn: true, aiPlayer: 0, scores,
          rules: { islandLimitPerPlayer: limite },
          islands: [{ owner: 0, cells: [[2,2],[2,3]], fromSetup: false },
                    { owner: 1, cells: [[8,8],[8,7]], fromSetup: false }],
          characters: [{ id: 'a', player: 0, r: 2, c: 2 }, { id: 'b', player: 1, r: 8, c: 8 }],
          crowns });
        state.currentPlayer = 0;
        const bloque = finParPoseImpossible(1);
        const transition = applyTurnTransitionCore();
        return { bloque, vainqueur: transition ? transition.vainqueur : 'aucune', nul: MATCH_NUL };
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_FIN_POSE === 'function', null, { timeout: 60000 });
    const t = (limite, scores, crowns) => page.evaluate(a => window.TEST_FIN_POSE(...a), [limite, scores, crowns]);

    const libre = await t(0, [1, 2]);
    assert.equal(libre.bloque, false, 'de la place et du stock : la partie continue');
    assert.equal(libre.vainqueur, null);
    console.log('ok  le joueur peut poser : la partie continue');

    const mene = await t(1, [2, 1]);
    assert.equal(mene.bloque, true, 'limite d’îles atteinte : le joueur ne peut plus poser');
    assert.equal(mene.vainqueur, 0, 'le plus de couronnes l’emporte');
    console.log('ok  limite atteinte : fin au décompte, 2-1 → joueur 0');

    const egal = await t(1, [1, 1]);
    assert.equal(egal.vainqueur, egal.nul, 'égalité sans couronne en jeu : match nul');
    console.log('ok  limite atteinte à égalité, sans couronne en jeu : match nul');

    /* Départage (18-19/10) : à égalité, la couronne en jeu (portée ou au sol) la
       plus proche du village d'un joueur le fait gagner. 'a' (J1) est à 3 cases de son village, 'b'
       (J2) bien plus loin des siens. */
    const procheA = await t(1, [1, 1], [{ carrierId: 'a', r: 2, c: 2 }, { carrierId: 'b', r: 8, c: 8 }]);
    assert.equal(procheA.vainqueur, 0, 'égalité : le porteur le plus proche de son village gagne');
    console.log('ok  égalité, deux porteurs : le plus proche de son village (J1) gagne');

    const porteeParB = await t(1, [1, 1], [{ carrierId: 'b', r: 8, c: 8 }, null]);
    assert.equal(porteeParB.vainqueur, 0, 'peu importe qui porte : la distance au village décide');
    console.log('ok  égalité, couronne portée par J2 mais plus proche du village de J1 : J1 gagne');

    const sans = await t(1, [1, 1], [null, null]);
    assert.equal(sans.vainqueur, sans.nul, 'sans couronne en jeu : nul');

    const sol = await t(1, [1, 1], [{ r: 1, c: 1 }, null]);
    assert.equal(sol.vainqueur, 0, 'une couronne au sol compte aussi (19/10)');
    console.log('ok  égalité, couronne au sol près du village de J1 : J1 gagne');

    const devant = await t(1, [2, 1], [null, { carrierId: 'b', r: 8, c: 8 }]);
    assert.equal(devant.vainqueur, 0, 'le départage ne sert qu’à égalité');
    console.log('ok  2-1 : le départage ne joue pas');
    console.log('verif-fin-pose : 8/8');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
