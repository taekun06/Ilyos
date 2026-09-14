const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const hook = `window.TEST_CROWN = (spec, mode) => {
 state = state || {};
 benchPoserPosition(spec); plannerNiveau = 0;
 if (mode === 'rules') {
  const root = strategicStateFingerprint();
  const resources = plannerTotalRessources(0);
  const result = withSimulatedState(cloneStateForSimulation(),()=>{
   const invalid = [[6,6],[6,4],[7,6]].every(([r,c])=>!applyFreeDropCore('carrier',r,c));
   const drop = applyFreeDropCore('carrier',6,5);
   const loose = strategicStateFingerprint();
   const pickup = applyFreePickupCore('carrier','crown-1');
   const cycle = strategicStateFingerprint() === root;
   const free = resources === plannerTotalRessources(0) && plannerActionGratuite({type:'DEPOT'});
   state.characters.push({id:'adjacent',player:0,r:6,c:5});
   const handoff = plannerTransitionsGratuites(0).find(a=>a.type==='TRANSMISSION' && a.versId==='adjacent');
   const passed = handoff && plannerAppliquerAction(handoff) && artifactCarriedBy('adjacent');
   return {invalid,drop:!!drop,pickup:!!pickup,cycle,free,different:loose!==root,passed:!!passed};
  });
  return {...result,intact:root===strategicStateFingerprint()};
 }
 if (mode === 'plan') {
  const r = plannerChercherPlan(0);
  const fingerprints = [strategicStateFingerprint()];
  for (const a of r.plan) {
   if (!plannerAppliquerAction(a)) throw Error('Plan inexécutable');
   fingerprints.push(strategicStateFingerprint());
  }
  return {plan:r.plan, states:r.etatsExplores, ms:r.dureeMs, note:r.noteArrivee,
   noCycle:new Set(fingerprints).size===fingerprints.length,
   finalists:r.finalistes.map(n=>n.plan.map(a=>a.type))};
 }
 const before = strategicStateFingerprint();
 const candidates = plannerReleverCandidats(0);
 const rotation = {type:'MAGIC',islandId:1,pivot:[6,3],direction:-1,turns:1};
 const manual = withSimulatedState(cloneStateForSimulation(),()=>{
  const ok=plannerAppliquerAction(rotation);
  return {ok:!!ok,crown:[state.artifact.r,state.artifact.c],score:evaluateStrategicState(0)};
 });
 return {candidates,magicMs:candidates.chronos.magic,manual,intact:before===strategicStateFingerprint(),
  villages:aiValidationTargetsForPlayer(state.players[0]),free:plannerTransitionsGratuites(0)};
}; window.ILYOS_BENCH = {`;
const spec = {seed:913,boardSize:11,islandPlacedThisTurn:true,hands:[['MAGIC'],[]],
 islands:[{cells:[[6,3],[6,4],[6,5]]},{cells:[[6,6]]},{cells:[[3,3]]},{owner:1,cells:[[2,8]]}],
 characters:[{id:'carrier',player:0,r:6,c:6},{id:'receiver',player:0,r:3,c:3},{id:'enemy',player:1,r:2,c:8}],
 crowns:[{r:6,c:5,carrierId:null,active:true},{r:2,c:8,carrierId:'enemy',active:true}]};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 const page=await browser.newPage();
 await page.route('**/js/game.js*',route=>{
  const source=fs.readFileSync(process.env.ILYOS_SOURCE || path.join(__dirname,'../js/game.js'),'utf8');
  return route.fulfill({contentType:'application/javascript',body:source.replace('window.ILYOS_BENCH = {',hook)});
 });
 await page.goto(process.env.ILYOS_BENCH_URL || 'http://localhost:8135/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.TEST_CROWN);
 const output={};
 for(const carried of [false,true]) {
  const position=structuredClone(spec);
  if(carried) position.crowns[0]={r:6,c:6,carrierId:'carrier',active:true};
  output[carried?'carried':'loose']={diagnostic:await page.evaluate(s=>TEST_CROWN(s,'diagnostic'),position),
   runs:[]};
  for(let i=0;i<5;i++) output[carried?'carried':'loose'].runs.push(await page.evaluate(s=>TEST_CROWN(s,'plan'),position));
 }
 const ordinary=structuredClone(spec);
 ordinary.hands=[['MOVE','MOVE','PUSH'],[]];
 ordinary.crowns[0]={r:6,c:6,carrierId:'carrier',active:true};
 output.ordinary={runs:[]};
 for(let i=0;i<5;i++) output.ordinary.runs.push(await page.evaluate(s=>TEST_CROWN(s,'plan'),ordinary));
 const target=a=>a.type==='MAGIC' && a.action.islandId===1 && a.action.pivot.join(',')==='6,3'
  && a.action.direction===-1 && a.action.turns===1;
 assert.ok(output.loose.diagnostic.manual.ok);
 assert.deepEqual(output.loose.diagnostic.manual.crown,[4,3]);
 assert.ok(output.loose.diagnostic.intact);
 if(process.env.ILYOS_SOURCE) {
  assert.ok(!output.carried.diagnostic.free.some(a=>a.type==='DEPOT'));
  assert.ok(!output.loose.diagnostic.candidates.some(a=>target(a)&&a.retenu));
 } else {
  assert.ok(output.carried.diagnostic.free.some(a=>a.type==='DEPOT'&&a.r===6&&a.c===5));
  assert.ok(output.loose.diagnostic.candidates.some(a=>target(a)&&a.retenu&&a.action.indice===0));
  for(const r of output.carried.runs) {
   assert.ok(r.states<30,'relais gratuits bornés sur ce petit scénario');
   assert.ok(r.plan.some((a,i)=>a.type==='DEPOT'&&r.plan[i+1]?.type==='MAGIC'));
   assert.ok(r.finalists.some(p=>p.join(',')==='DEPOT,MAGIC,RAMASSAGE'));
  }
  for(const kind of Object.values(output)) for(const r of kind.runs) {
   assert.ok(r.noCycle,'pas de retour à un état identique');
   assert.ok(r.states<=1201,'budget global respecté');
  }
  output.rules=await page.evaluate(s=>TEST_CROWN(s,'rules'),ordinary);
  for(const [name,ok] of Object.entries(output.rules)) assert.ok(ok,name);
 }
 console.log(JSON.stringify(output,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


