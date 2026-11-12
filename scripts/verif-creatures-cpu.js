/* Le CPU et les créatures (mode Rotation, couche Créatures).

     npm start   puis   node scripts/verif-creatures-cpu.js   (port 8123)

   Les phases des créatures n'ont pas lieu dans les simulations du planner.
   Deux cas, jugés sur le résultat, chacun avec un témoin sans la correction :
   1. Abattre : un loup au bord du vide, collé à mon gardien, une carte
      Pousser en main. Le CPU le fait tomber (une créature abattue rapporte).
   2. Prévoir : un loup à deux cases de mon gardien, lui-même au bord du
      vide. La fin de tour simulée par le CPU (avant de chercher la riposte)
      doit faire avancer puis bondir le loup : le gardien tombe.           */

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
      const hook = `window.TEST_CREATURES_CPU = (scene, corrige) => {
        state = state || {};
        const ile = [];
        for (let c = 1; c <= 8; c++) ile.push([5, c]);
        const loup = scene === 'abattre' ? { r: 5, c: 1 } : { r: 5, c: 3 };
        const moi = scene === 'abattre' ? { r: 5, c: 2 } : { r: 5, c: 1 };
        benchPoserPosition({ seed: 5, islandPlacedThisTurn: true, aiPlayer: 0,
          islands: [{ owner: 0, cells: ile }],
          characters: [{ id: 'A', player: 0, ...moi }, { id: 'B', player: 0, r: 5, c: 8 }, { id: 'J', player: 1, r: 5, c: 7 }],
          crowns: [scene === 'abattre' ? { r: 5, c: 6, carrierId: null, active: true } : { ...moi, carrierId: 'A', active: true }],
          hands: [scene === 'abattre' ? ['PUSH', 'MOVE'] : ['MOVE'], []] });
        state.currentPlayer = 0;
        state.rotation = { couches: { creatures: true }, creatures: { espece: 'loup', oeufs: [], prochainId: 2, butins: {} } };
        state.characters.push({ id: 'creature-1', player: -1, creature: 'loup', ...loup });
        const memoire = { ...CREATURES_POIDS };
        if (!corrige) { CREATURES_POIDS.abattue = 0; creaturesEvaluationEnCours = true; }
        try {
          if (scene === 'prevoir') {
            return withSimulatedState(cloneStateForSimulation(), () => {
              applyTurnTransitionCore();
              return { plan: 'fin de tour', loupAbattu: false, gardienEnJeu: !!characterById('A') };
            });
          }
          const rapport = plannerChercherPlanRobuste(0);
          return withSimulatedState(cloneStateForSimulation(), () => {
            for (const action of rapport.plan) plannerAppliquerAction(action);
            const loupAbattu = !characterById('creature-1');
            if (!loupAbattu) loupsSimuler();
            return { plan: rapport.plan.map(a => a.type + (a.r ?? '') + (a.c ?? '') + (a.to ? a.to.join('') : '')).join('>'), loupAbattu, gardienEnJeu: !!characterById('A') };
          });
        } finally {
          Object.assign(CREATURES_POIDS, memoire);
          creaturesEvaluationEnCours = false;
          state.characters = state.characters.filter(c => !c.creature);
          state.rotation = null;
        }
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({ contentType: 'application/javascript', body: source.replace('window.ILYOS_BENCH = {', hook) });
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.TEST_CREATURES_CPU === 'function', null, { timeout: 60000 });

    let ok = 0;
    for (const [scene, juger] of [['abattre', r => r.loupAbattu], ['prevoir', r => !r.gardienEnJeu]]) {
      const temoin = await page.evaluate(s => window.TEST_CREATURES_CPU(s, false), scene);
      const corrige = await page.evaluate(s => window.TEST_CREATURES_CPU(s, true), scene);
      console.log(`${scene} : témoin ${temoin.plan || '(rien)'} → ${juger(temoin) ? 'réussi' : 'raté'} ; corrigé ${corrige.plan || '(rien)'} → ${juger(corrige) ? 'réussi' : 'raté'}`);
      assert.ok(!juger(temoin), `${scene} : le témoin doit échouer, sinon le banc ne prouve rien`);
      assert.ok(juger(corrige), `${scene} : le CPU doit tenir compte de la créature`);
      ok++;
    }
    console.log(`verif-creatures-cpu : ${ok}/2`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
