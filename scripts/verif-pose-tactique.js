const {chromium}=require('playwright');
const fs=require('fs'); const path=require('path'); const assert=require('node:assert/strict');
const hook=`window.TEST_POSE=(spec,mode)=>{
 state=state||{}; benchPoserPosition(spec); plannerNiveau=0;
 if(mode==='adjacency') {
  const random=gameRandom; gameRandom=()=>0.5;
  try {
  const signature=p=>p.cells.map(([r,c])=>key(r,c)).sort().join('|')+p.shapeKey;
  const first=new Map(findAutomaticIslandPlacement(0,PLAN_POSE_ENUM_MAX).map(p=>[signature(p),p.score]));
  state.islands.push({id:999,owner:1,shapeKey:'line3',cells:[[2,2],[2,3],[2,4]]});
  const second=findAutomaticIslandPlacement(0,PLAN_POSE_ENUM_MAX).filter(p=>first.has(signature(p)));
  return {common:second.length,unchanged:second.every(p=>Math.abs(first.get(signature(p))-p.score)<1e-9)};
  } finally {gameRandom=random;}
 }
 if(mode==='plan') {const r=plannerChercherPlan(0); return {states:r.etatsExplores,ms:r.dureeMs,plan:r.plan.map(a=>a.type),detail:r.plan};}
 const all=findAutomaticIslandPlacement(0,PLAN_POSE_ENUM_MAX,plannerMenaceValidationAdverse(0));
 const intentions=plannerIntentionsPose(0);
 const start=performance.now(); const report=plannerReleverCandidats(0);
 const poses=report.filter(a=>a.type==='POSE');
 plannerNiveau=1; const deep=plannerCandidatsPose(0); plannerNiveau=0;
 const describe=entry=>withSimulatedState(cloneStateForSimulation(),()=>{
  const p=entry.action; const before=state.characters.filter(g=>g.player===0).map(g=>g.id);
  const result=plannerAppliquerAction(p); const id=result.gardienId;
  const actions=[...plannerTransitionsGratuites(0),...plannerCandidatsPush(0)];
  const push=actions.find(a=>a.pusherId===id&&a.r===3&&a.c===7);
  const pushed=push && withSimulatedState(cloneStateForSimulation(),()=>{
   const ok=plannerAppliquerAction(push);const e=characterById('enemy');
   return {ok:!!ok,position:e?[e.r,e.c]:null};
  });
  const movement=before.some(g=>{
   const after=movementRange(characterById(g),availableActionCount('MOVE',state.players[0]));
   return [...after].some(k=>allTerrain.has(k)&&!oldRanges.get(g).has(k));
  });
  return {retained:entry.retenu,note:entry.note,spawn:p.spawn,cells:p.cells,but:p.but,pushed,movement,
   adjacent:p.cells.some(([r,c])=>allTerrain.has(key(r-1,c))||allTerrain.has(key(r+1,c))||allTerrain.has(key(r,c-1))||allTerrain.has(key(r,c+1))),
   actions:actions.filter(a=>a.pusherId===id||a.charId===id||a.versId===id).map(a=>({type:a.type,r:a.r,c:a.c})),
   newGuardian:!!id};
 });
 const allTerrain=new Set(state.islands.flatMap(i=>i.cells.map(([r,c])=>key(r,c))));
 const oldRanges=new Map(state.characters.filter(g=>g.player===0).map(g=>[g.id,movementRange(g,availableActionCount('MOVE',state.players[0]))]));
 return {legal:all.length,humanRank:all.findIndex(p=>p.cells.some(([r,c])=>r===3&&c===6)),
  intentions,poses:poses.map(describe),deep:deep.map(a=>({but:a.but,spawn:a.spawn})),generationMs:report.chronos.pose,ms:performance.now()-start};
}; window.ILYOS_BENCH = {`;
const A={seed:720,islandPlacedThisTurn:false,hands:[['PUSH'],[]],
 islands:[{cells:[[3,7],[3,8],[2,7],[4,7]],owner:1},{cells:[[9,1],[9,2],[9,3]],owner:0}],
 characters:[{id:'own',player:0,r:9,c:2},{id:'enemy',player:1,r:3,c:7}],
 crowns:[{r:9,c:2,carrierId:'own',active:true},null]};
const B={...structuredClone(A),crowns:[{r:3,c:8,active:true},null]};
const C={...structuredClone(A),hands:[[],[]]};
const D={seed:721,islandPlacedThisTurn:false,hands:[['MOVE'],[]],islands:[{cells:[[9,1],[9,2],[9,3]]}],characters:[{id:'own',player:0,r:9,c:2},{id:'enemy',player:1,r:0,c:10}],crowns:[{r:0,c:10,carrierId:'enemy',active:true},null]};
const E={...structuredClone(A),hands:[[],[]],characters:[],crowns:[{r:5,c:5,active:false},null]};
const dense=structuredClone(A); dense.hands=[['PUSH','MOVE','MOVE'],[]]; for(const r of [1,5,7]) for(const c of [1,8]) dense.islands.push({cells:[[r,c],[r,c+1],[r+1,c]],owner:1});
const F={seed:722,islandPlacedThisTurn:false,hands:[['MOVE','MOVE','MOVE'],[]],islands:[{cells:[[3,2]]},{cells:[[3,5]]}],characters:[{id:'own',player:0,r:3,c:2}],crowns:[{r:3,c:5,active:true},null]};
(async()=>{const browser=await chromium.launch({headless:true}); try{
 const page=await browser.newPage(); await page.route('**/js/game.js*',route=>{
 const source=fs.readFileSync(process.env.ILYOS_SOURCE||path.join(__dirname,'../js/game.js'),'utf8');
 return route.fulfill({contentType:'application/javascript',body:source.replace('window.ILYOS_BENCH = {',hook)});});
 await page.goto(process.env.ILYOS_BENCH_URL||'http://localhost:8136/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.TEST_POSE);
 const output={}; for(const [name,spec] of Object.entries({A,B,C,D,E,F,dense})) {
  output[name]={diagnostic:await page.evaluate(s=>TEST_POSE(s,'diagnostic'),spec),runs:[]};
  for(let i=0;i<3;i++) output[name].runs.push(await page.evaluate(s=>TEST_POSE(s,'plan'),spec));
 }
 const retained=n=>output[n].diagnostic.poses.filter(p=>p.retained);
 const pushes=n=>retained(n).filter(p=>p.pushed?.ok);
 assert.ok(output.A.diagnostic.humanRank>=0,'pose humaine légalement énumérée');
 assert.ok(retained('B').some(p=>p.actions.some(a=>a.type==='RAMASSAGE')));
 assert.ok(retained('C').some(p=>p.actions.some(a=>a.type==='TRANSMISSION')));
 assert.ok(retained('D').some(p=>p.but==='blocage'&&!p.adjacent));
 for(const r of output.D.runs) {
  const first=r.detail.find(a=>a.type==='POSE');
  assert.ok(first&&retained('D').some(p=>!p.adjacent&&JSON.stringify(p.cells)===JSON.stringify(first.cells)));
 }
 for(const entry of Object.values(output)) {
  assert.ok(entry.diagnostic.poses.filter(p=>p.retained).length<=20);
  assert.ok(entry.diagnostic.deep.length<=8);
  for(const r of entry.runs) assert.ok(r.states<=1201);
 }
 if(process.env.ILYOS_SOURCE) assert.equal(pushes('A').length,0);
 else {
  assert.ok(pushes('A').length>0); assert.ok(pushes('dense').length>0);
  assert.ok(pushes('A').every(p=>p.adjacent&&JSON.stringify(p.pushed.position)==='[3,8]'),'poussée sans chute immédiate');
  assert.ok(output.A.diagnostic.deep.some(p=>p.but==='poussee'&&p.spawn.join(',')==='3,6'));
  assert.ok(retained('F').some(p=>p.but==='mobilite'&&p.movement));
  assert.ok(!retained('E').some(p=>p.but==='mobilite'||p.but==='poussee'));
 }
 output.adjacency=await page.evaluate(s=>TEST_POSE(s,'adjacency'),E);
 assert.ok(output.adjacency.common>0&&output.adjacency.unchanged,'aucun bonus de contact');
 console.log(JSON.stringify(output,null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});





