// Contrôle de la politique, indépendamment des scores stratégiques.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../js/game/planner.js'), 'utf8');
const debut = source.indexOf('function plannerPrioriteDefense(');
const fin = source.indexOf('function plannerChercherPlan(', debut);
const contexte = {
  state: { winner: null, players: [{id:0}, {id:1}], characters: [] },
  couronnes: [],
  activeArtifacts() { return contexte.couronnes; },
  characterById(id) { return contexte.state.characters.find(g => g.id === id); },
  characterAt(r,c) { return contexte.state.characters.find(g => g.r === r && g.c === c); },
  isCrownValidationCell(joueur,r,c) { return joueur.id === 1 && r === 0 && c >= 9; },
  validationBloqueeParAdversaire() { return !!contexte.characterAt(0,9) && contexte.characterAt(0,9).player === 0; }
};
vm.createContext(contexte);
vm.runInContext(source.slice(debut, fin), contexte);
const menace = { couronneId:'couronne', porteurId:'adverse', village:[[0,9],[0,10]], imminente:true };
const adverse = {id:'adverse',player:1,r:0,c:10};
const ami = {id:'ami',player:0,r:0,c:9};
function noter(gardiens, couronnes) {
  contexte.state.characters = gardiens;
  contexte.couronnes = couronnes;
  return contexte.plannerPrioriteDefense(0, [menace]);
}
const chute = noter([ami], [{id:'couronne',carrierId:null,r:0,c:10}]);
const recuperation = noter([ami,adverse], [{id:'couronne',carrierId:'ami'}]);
const blocage = noter([ami,adverse], [{id:'couronne',carrierId:'adverse'}]);
assert.ok(chute > recuperation && recuperation > blocage && blocage > 0,
  'ordre attendu : chute > récupération > blocage > point concédé');
assert.equal(noter([adverse], [{id:'couronne',carrierId:'adverse'}]), 0);
assert.equal(noter([{id:'autre',player:1,r:0,c:10}], [
  {id:'couronne',carrierId:null}, {id:'seconde',carrierId:'autre'}]), 0,
  'faire chuter un porteur ne doit pas masquer un autre point immédiat');
contexte.state.winner = 0;
assert.ok(noter([], []) > chute, 'une victoire acquise prime');
console.log('Priorité chute > récupération > blocage : OK');
console.log('Point adverse restant et victoire acquise : OK');
