/* RÉGLER LE BARÈME SANS REJOUER DE PARTIES (méthode « Texel »).

     node scripts/regler-bareme.js positions-*.jsonl

   Entrée : les positions enregistrées par scripts/selfplay-node.js avec
   ILYOS_POSITIONS (note du joueur qui vient de jouer, terme par terme, et
   issue de la partie pour lui : 1, 0,5 ou 0).

   Une bonne note doit PRÉDIRE l'issue. On cherche donc, pour chaque terme du
   barème, un facteur f (1 = poids actuel) tel que
       P(victoire) = sigmoïde(K · Σ f_terme · montant_terme)
   colle au mieux aux issues réelles. Les points déjà marqués servent d'étalon
   (f = 1) ; un léger rappel vers 1 évite d'écouter le bruit des termes rares.

   Les parties sont partagées en deux : on règle sur 4/5, on juge sur 1/5
   qu'on n'a pas vu. Un facteur n'est proposé que s'il est stable d'un
   tirage à l'autre (rééchantillonnage des parties) ET que la prédiction
   s'améliore sur les parties mises de côté. La proposition se vérifie ensuite
   par UNE série de self-play, au lieu d'une série par poids essayé. */

const fs = require('node:fs');

const ETALONS = new Set(['pointsMarques', 'pointsAdverses']);
const EXCLUS = new Set(['victoire', 'matchNul']);
const ECHELLE = 1000;

function lire(fichiers) {
  const positions = [];
  for (const f of fichiers) {
    for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!ligne.trim()) continue;
      const p = JSON.parse(ligne);
      if (Object.keys(p.termes).some(t => EXCLUS.has(t))) continue;
      positions.push(p);
    }
  }
  return positions;
}

function preparer(positions, termes) {
  // Dernière colonne : une constante. Le barème n'est pas symétrique (des
  // termes comptent ce que JE possède sans le retrancher à l'adversaire) ;
  // sans elle, un terme présent dans toutes les positions passerait pour un
  // mauvais prédicteur alors qu'il ne fait que décaler toutes les notes.
  return positions.map(p => ({
    partie: `${p.graine}-${p.campA}`,
    y: p.resultat,
    x: [...termes.map(t => (p.termes[t] || 0) / ECHELLE), 1]
  }));
}

/* Descente de gradient (Adam) sur l'entropie croisée + rappel vers 1. */
function ajuster(donnees, termes, { iterations = 2500, rappel = 0.02 } = {}) {
  const n = termes.length + 1;
  const f = new Array(n).fill(1);
  f[n - 1] = 0;
  let logK = Math.log(0.5);
  const m = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const pas = 0.02;
  const libre = [...termes.map(t => !ETALONS.has(t)), true];
  const rappele = [...termes.map(() => true), false];
  for (let it = 1; it <= iterations; it++) {
    const g = new Array(n + 1).fill(0);
    const K = Math.exp(logK);
    for (const d of donnees) {
      let z = 0;
      for (let i = 0; i < n; i++) z += f[i] * d.x[i];
      const p = 1 / (1 + Math.exp(-K * z));
      const e = p - d.y;
      for (let i = 0; i < n; i++) if (libre[i]) g[i] += e * K * d.x[i];
      g[n] += e * K * z;
    }
    for (let i = 0; i <= n; i++) g[i] /= donnees.length;
    for (let i = 0; i < n; i++) if (libre[i] && rappele[i]) g[i] += rappel * (f[i] - 1);
    for (let i = 0; i <= n; i++) {
      m[i] = 0.9 * m[i] + 0.1 * g[i];
      v[i] = 0.999 * v[i] + 0.001 * g[i] * g[i];
      const dm = m[i] / (1 - 0.9 ** it);
      const dv = v[i] / (1 - 0.999 ** it);
      const delta = pas * dm / (Math.sqrt(dv) + 1e-8);
      if (i === n) logK -= delta;
      else if (libre[i]) f[i] = rappele[i] ? Math.max(0, f[i] - delta) : f[i] - delta;
    }
  }
  return { f, K: Math.exp(logK) };
}

function perte(donnees, f, K) {
  let somme = 0;
  let justes = 0;
  let decides = 0;
  for (const d of donnees) {
    let z = 0;
    for (let i = 0; i < f.length; i++) z += f[i] * d.x[i];
    const p = Math.min(1 - 1e-9, Math.max(1e-9, 1 / (1 + Math.exp(-K * z))));
    somme -= d.y * Math.log(p) + (1 - d.y) * Math.log(1 - p);
    if (d.y !== 0.5) { decides++; if ((p > 0.5) === (d.y === 1)) justes++; }
  }
  return { perte: somme / donnees.length, justes: decides ? justes / decides : 0 };
}

function main() {
  const fichiers = process.argv.slice(2);
  if (!fichiers.length) throw new Error('Usage : node scripts/regler-bareme.js positions.jsonl…');
  const positions = lire(fichiers);
  const compte = new Map();
  for (const p of positions) for (const t of Object.keys(p.termes)) compte.set(t, (compte.get(t) || 0) + 1);
  const termes = [...compte.keys()].filter(t => compte.get(t) >= positions.length * 0.01).sort();
  const donnees = preparer(positions, termes);
  const parties = [...new Set(donnees.map(d => d.partie))];
  const cote = new Set(parties.filter((_, i) => i % 5 === 4));
  const entrainement = donnees.filter(d => !cote.has(d.partie));
  const controle = donnees.filter(d => cote.has(d.partie));

  // Étalon : le barème actuel, avec sa meilleure échelle K.
  const base = (() => {
    let meilleur = null;
    for (let K = 0.05; K <= 3; K *= 1.1) {
      const r = perte(entrainement, [...termes.map(() => 1), 0], K);
      if (!meilleur || r.perte < meilleur.r.perte) meilleur = { K, r };
    }
    return meilleur;
  })();
  const regle = ajuster(entrainement, termes);

  // Stabilité : rééchantillonnage des parties d'entraînement.
  const partiesEnt = parties.filter(p => !cote.has(p));
  const parPartie = new Map(partiesEnt.map(p => [p, entrainement.filter(d => d.partie === p)]));
  let graine = 12345;
  const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
  const tirages = [];
  for (let b = 0; b < 12; b++) {
    const echantillon = [];
    for (let i = 0; i < partiesEnt.length; i++) echantillon.push(...parPartie.get(partiesEnt[Math.floor(hasard() * partiesEnt.length)]));
    tirages.push(ajuster(echantillon, termes, { iterations: 1200 }).f);
  }

  if (!controle.length) throw new Error('Trop peu de parties : il en faut au moins 5 pour en mettre de côté.');
  const avant = perte(controle, [...termes.map(() => 1), 0], base.K);
  const apres = perte(controle, regle.f, regle.K);
  console.log(`positions ${positions.length} (parties ${parties.length}, ${controle.length} mises de côté)`);
  console.log(`perte sur parties mises de côté : barème actuel ${avant.perte.toFixed(4)} (issue devinée ${(100 * avant.justes).toFixed(1)} %) → réglé ${apres.perte.toFixed(4)} (${(100 * apres.justes).toFixed(1)} %)`);
  console.log('');
  console.log('terme                          présence  |montant| moy   facteur  ± (tirages)  proposition');
  const lignes = termes.map((t, i) => {
    const valeurs = tirages.map(f => f[i]);
    const moy = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    const ecart = Math.sqrt(valeurs.reduce((a, b) => a + (b - moy) ** 2, 0) / valeurs.length);
    const montant = positions.reduce((a, p) => a + Math.abs(p.termes[t] || 0), 0) / Math.max(1, compte.get(t));
    const fiable = !ETALONS.has(t) && Math.abs(regle.f[i] - 1) > Math.max(0.15, 2 * ecart);
    return { t, presence: compte.get(t) / positions.length, montant, f: regle.f[i], ecart, fiable };
  }).sort((a, b) => Math.abs(b.f - 1) - Math.abs(a.f - 1));
  for (const l of lignes) {
    console.log(`${l.t.padEnd(30)} ${(100 * l.presence).toFixed(0).padStart(6)} %  ${String(Math.round(l.montant)).padStart(12)}   ${l.f.toFixed(2).padStart(6)}   ±${l.ecart.toFixed(2)}       ${ETALONS.has(l.t) ? 'étalon' : (l.fiable ? '×' + l.f.toFixed(2) : '—')}`);
  }
  const propositions = Object.fromEntries(lignes.filter(l => l.fiable).map(l => [l.t, Number(l.f.toFixed(2))]));
  console.log('');
  console.log(`PROPOSITION ${JSON.stringify(propositions)}`);
}

main();
