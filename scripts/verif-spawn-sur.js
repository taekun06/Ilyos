// Tester le départage des apparitions avec les noyaux et règles du jeu.
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
      const hook = `window.TEST_SPAWN = (taille, plafond) => {
        state = state || {};
        benchPoserPosition({ boardSize: taille, seed: 921, islandPlacedThisTurn: false,
          rules: { shapeLimitPerOwner: 1 },
          islands: [{ owner: 1, cells: [[5,7],[6,8],[7,7]] }],
          characters: [{id:'ennemi',player:1,r:7,c:7}],
          crowns: [{r:7,c:7,carrierId:'ennemi',active:true},null] });
        if (plafond) for (let i=0; canCreateGuardian(0); i++)
          state.characters.push({id:'ami-'+i,player:0,r:1,c:i});
        const avant = strategicStateFingerprint();
        const pose = {shapeKey:'l3',cells:[[7,6],[6,6],[6,7]],
          anchor:{r:6,c:6},relCells:[[1,0],[0,0],[0,1]]};
        const intention = {cibles:[[7,7]],contact:1};
        const resultat = plannerSpawnMoinsExpose(0,pose,intention,[7,6]);
        const menaces = [[7,6],[6,7]].map(spawn => withSimulatedState(cloneStateForSimulation(), () => {
          applyIslandPlacementCore(pose.shapeKey,pose.cells,0,pose.relCells,pose.anchor,spawn);
          return plannerMenaceExpulsion(0,spawn[0],spawn[1]);
        }));
        return {resultat,menaces,intact:avant===strategicStateFingerprint()};
      }; window.ILYOS_BENCH = {`;
      await route.fulfill({contentType:'application/javascript',body:source.replace('window.ILYOS_BENCH = {',hook)});
    });
    await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8123/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => !!window.TEST_SPAWN);
    for (const taille of [11,13]) {
      const r = await page.evaluate(t => TEST_SPAWN(t,false), taille);
      assert.deepEqual(r.menaces,[true,false]);
      assert.deepEqual(r.resultat,[6,7]);
      assert.ok(r.intact,'la simulation doit préserver la partie');
      console.log(`Plateau ${taille}, stock limité : apparition moins exposée OK`);
    }
    const limite = await page.evaluate(() => TEST_SPAWN(11,true));
    assert.deepEqual(limite.resultat,[7,6]);
    assert.ok(limite.intact);
    console.log('Plafond de gardiens : choix inchangé, état préservé OK');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
