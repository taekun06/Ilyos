/* SELF-PLAY SANS NAVIGATEUR — Expert contre Expert sous Node.

     node scripts/selfplay-node.js [parties] [graineDeDépart] [parallèle]

   Même protocole que scripts/selfplay-rapide.js (chaque graine jouée deux
   fois, camps inversés, mêmes tirages), mais sans Chromium ni serveur : le
   jeu tourne par scripts/moteur-sans-ecran.js. Les deux camps sont deux
   BUNDLES, donc deux fichiers :

     ILYOS_BUNDLE_A   build candidat   (défaut : js/game.js du dépôt)
     ILYOS_BUNDLE_B   build de référence (défaut : le même)
       ex. git show origin/main:js/game.js > /tmp/reference.js

   Réglages par camp, comme le banc navigateur :
     ILYOS_POIDS_A / _B    JSON de PLAN_POIDS
     ILYOS_BUDGET_A / _B   JSON de budget de recherche

   Un moteur par processus : chaque partie en cours emploie deux processus
   enfants (un par bundle), dont un seul réfléchit à la fois. `parallèle`
   compte donc les parties simultanées = les cœurs occupés. L'IA a des
   filets de temps : au-delà du nombre de cœurs libres, des tours sont coupés
   et la mesure ne vaut plus rien — sauf avec ILYOS_SANS_COUPURE=1.

   ILYOS_POSITIONS=fichier : enregistre, à la fin de chaque tour, la note du
   joueur qui vient de jouer, terme par terme (vue par le camp A), avec
   l'issue de la partie pour ce joueur. Une ligne JSON par position ; sert à
   régler le barème sans rejouer de parties (scripts/regler-bareme.js).

   Non repris pour l'instant : le mode personnalisé (ILYOS_PERSO). */

const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');

/* ------------------------------------------------------------- ouvrier */
if (process.argv[2] === '--ouvrier') {
  const { charger } = require('./moteur-sans-ecran');
  const { selfplay } = charger({ bundle: process.argv[3] });
  process.on('message', ({ id, methode, args }) => {
    try {
      process.send({ id, resultat: selfplay[methode](...args) });
    } catch (erreur) {
      process.send({ id, erreur: String(erreur && erreur.stack || erreur) });
    }
  });
  process.send({ pret: true });
  return;
}

/* -------------------------------------------------------------- parent */
const depot = path.resolve(__dirname, '..');
const BUNDLES = {
  A: path.resolve(process.env.ILYOS_BUNDLE_A || path.join(depot, 'js', 'game.js')),
  B: path.resolve(process.env.ILYOS_BUNDLE_B || path.join(depot, 'js', 'game.js'))
};
const PAIRES = Math.max(1, Math.ceil((Number(process.argv[2]) || 20) / 2));
const GRAINE = Number(process.argv[3]) || 5000;
const PARALLELE = Math.max(1, Number(process.argv[4]) || 2);
const TOURS_MAX = Number(process.env.ILYOS_TOURS_MAX) || 120;
const POSITIONS = process.env.ILYOS_POSITIONS || '';
const lireJson = nom => (process.env[nom] ? JSON.parse(process.env[nom]) : undefined);
const POIDS = { A: lireJson('ILYOS_POIDS_A') || null, B: lireJson('ILYOS_POIDS_B') || null };
const BUDGETS = { A: lireJson('ILYOS_BUDGET_A'), B: lireJson('ILYOS_BUDGET_B') };
/* ILYOS_SANS_COUPURE=1 : écarte les filets de temps de l'IA (securiteFacteur).
   Les décisions ne dépendent plus de la charge de la machine : on peut alors
   occuper tous les cœurs, et rejouer une série donne les mêmes parties. À
   employer pour comparer deux RÉGLAGES ; pas pour mesurer un gain de vitesse,
   qui se voit justement aux tours coupés. */
if (process.env.ILYOS_SANS_COUPURE === '1') {
  for (const camp of ['A', 'B']) POIDS[camp] = { ...(POIDS[camp] || {}), securiteFacteur: 20 };
}

function ouvrir(bundle) {
  return new Promise((resolve, reject) => {
    const enfant = fork(__filename, ['--ouvrier', bundle]);
    const attentes = new Map();
    let suivant = 0;
    enfant.on('message', message => {
      if (message.pret) {
        resolve({
          appeler: (methode, ...args) => new Promise((ok, ko) => {
            const id = ++suivant;
            attentes.set(id, { ok, ko });
            enfant.send({ id, methode, args });
          }),
          fermer: () => enfant.kill()
        });
        return;
      }
      const attente = attentes.get(message.id);
      if (!attente) return;
      attentes.delete(message.id);
      if (message.erreur) attente.ko(new Error(message.erreur));
      else attente.ok(message.resultat);
    });
    enfant.on('error', reject);
    enfant.on('exit', code => {
      const erreur = new Error(`Ouvrier ${bundle} arrêté (code ${code}).`);
      reject(erreur);
      attentes.forEach(a => a.ko(erreur));
    });
  });
}

async function jouerPartie(camps, depart, campA, graine) {
  let etat = depart;
  let vainqueur = null;
  let tour = 0;
  const temps = { A: [], B: [] };
  const coupes = { A: 0, B: 0 };
  const positions = [];
  for (let i = 0; i < TOURS_MAX; i++) {
    const qui = JSON.parse(etat).currentPlayer === campA ? 'A' : 'B';
    const r = await camps[qui].appeler('tour', etat, { graine: graine * 1000 + i, budget: BUDGETS[qui], poids: POIDS[qui] });
    temps[qui].push(r.dureeMs);
    if (r.coupures && (r.coupures.principale || r.coupures.ripostes || r.coupures.magie)) coupes[qui]++;
    etat = r.etat;
    tour = r.tour;
    vainqueur = r.vainqueur;
    if (POSITIONS && !r.fin && (vainqueur === null || vainqueur === undefined)) {
      // La position que le planner note à la fin de SON tour : l'adversaire au trait.
      const joueur = qui === 'A' ? campA : 1 - campA;
      const detail = await camps.A.appeler('evaluer', etat, joueur, { poids: POIDS.A });
      const termes = {};
      for (const t of detail.termes) termes[t.terme] = t.montant;
      positions.push({ joueur, tour, note: detail.note, termes });
    }
    if (r.fin || (vainqueur !== null && vainqueur !== undefined)) break;
  }
  const scores = JSON.parse(etat).players.map(p => p.score || 0);
  // Partie coupée ou plateau saturé : départage aux couronnes, comme le banc navigateur.
  if (vainqueur === null || vainqueur === undefined || vainqueur === -1 || typeof vainqueur !== 'number') {
    vainqueur = scores[0] === scores[1] ? null : (scores[0] > scores[1] ? 0 : 1);
  }
  if (POSITIONS) {
    const lignes = positions.map(p => JSON.stringify({
      graine, campA, ...p,
      resultat: vainqueur === null ? 0.5 : (vainqueur === p.joueur ? 1 : 0)
    }));
    if (lignes.length) fs.appendFileSync(POSITIONS, lignes.join('\n') + '\n');
  }
  return { vainqueur, tour, scores, temps, coupes };
}

async function travailleur(file, bilan) {
  const camps = { A: await ouvrir(BUNDLES.A), B: await ouvrir(BUNDLES.B) };
  try {
    while (file.length) {
      const graine = file.shift();
      // Toujours le camp A pour le départ : toutes les paires partent du même plateau.
      const depart = await camps.A.appeler('departMelange', graine);
      for (const campA of [0, 1]) {
        const r = await jouerPartie(camps, depart, campA, graine);
        const couronnesA = r.scores[campA];
        const couronnesB = r.scores[1 - campA];
        bilan.couronnesA += couronnesA;
        bilan.couronnesB += couronnesB;
        let issue = 'nul';
        if (r.vainqueur === campA) { bilan.A++; issue = 'A'; }
        else if (r.vainqueur !== null) { bilan.B++; issue = 'B'; }
        else bilan.nul++;
        bilan.tours.push(r.tour);
        bilan.coupesA += r.coupes.A;
        bilan.coupesB += r.coupes.B;
        bilan.msA.push(...r.temps.A);
        bilan.msB.push(...r.temps.B);
        const moy = t => (t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0);
        console.log(`graine ${graine} A=J${campA} : ${issue} ${couronnesA}-${couronnesB} `
          + `(tour ${r.tour}, ms/tour A ${moy(r.temps.A)} B ${moy(r.temps.B)}, coupés A ${r.coupes.A} B ${r.coupes.B})`);
      }
    }
  } finally {
    camps.A.fermer();
    camps.B.fermer();
  }
}

async function main() {
  const debut = Date.now();
  const file = Array.from({ length: PAIRES }, (_, i) => GRAINE + i);
  const bilan = { A: 0, B: 0, nul: 0, couronnesA: 0, couronnesB: 0, coupesA: 0, coupesB: 0, tours: [], msA: [], msB: [] };
  await Promise.all(Array.from({ length: Math.min(PARALLELE, PAIRES) }, () => travailleur(file, bilan)));

  const n = bilan.A + bilan.B + bilan.nul;
  const p = n ? (bilan.A + bilan.nul / 2) / n : 0;
  const ecart = n ? Math.sqrt(p * (1 - p) / n) : 0;
  const moy = t => (t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0);
  const p95 = t => { const s = [...t].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.95)] : 0; };
  console.log('');
  console.log(`SELF-PLAY NODE — A ${path.relative(depot, BUNDLES.A)} contre B ${path.relative(depot, BUNDLES.B)}`);
  console.log(`parties ${n} : A ${bilan.A}, B ${bilan.B}, nuls ${bilan.nul}`);
  console.log(`score A ${(100 * p).toFixed(1)} % ± ${(100 * ecart).toFixed(1)} (1σ)`);
  console.log(`couronnes A ${bilan.couronnesA}, B ${bilan.couronnesB}`);
  console.log(`tours coupés par le temps : A ${bilan.coupesA}/${bilan.msA.length}, B ${bilan.coupesB}/${bilan.msB.length}`);
  console.log(`tours moyens ${moy(bilan.tours)} ; ms/tour A ${moy(bilan.msA)} (p95 ${p95(bilan.msA)}), B ${moy(bilan.msB)} (p95 ${p95(bilan.msB)})`);
  console.log(`durée totale ${Math.round((Date.now() - debut) / 1000)} s`);
}

main().then(() => process.exit(0), erreur => { console.error(erreur); process.exit(1); });
