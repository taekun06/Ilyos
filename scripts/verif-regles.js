/* MOTEUR DE RÈGLES — porte d'entrée unique (js/game/regles.js)

     node scripts/verif-regles.js [tours] [graine]     (aucun serveur)

   Deux contrôles, sans navigateur :

   1. Des coups ILLÉGAUX fabriqués à la main doivent être refusés, avec une
      raison, et des coups légaux acceptés (ILYOS_REGLES.verifier).
   2. Une partie CPU contre CPU : avant chaque action que l'IA joue, le moteur
      doit la déclarer permise, et l'appliquer par le moteur doit donner
      exactement le même état que par le planner. Fin de tour par le moteur.

   Le banc juge un résultat (accepté/refusé, état identique), pas une tactique. */

const { charger } = require('./moteur-sans-ecran');

// Pris AVANT le chargement : le moteur fait taire le `console` global du jeu.
const sortie = console;

const TOURS = Math.max(1, Number(process.argv[2]) || 16);
const GRAINE = Number(process.argv[3]) || 7300;
const BUDGET = { etatsMax: 600, largeurFaisceau: 12 };

const echecs = [];
const verifier = (condition, message) => {
  if (!condition) echecs.push(message);
  return condition;
};

const moteur = charger();
const regles = globalThis.window.ILYOS_REGLES;
if (!regles) {
  sortie.error('ILYOS_REGLES absent du bundle.');
  process.exit(1);
}

/* ---------------------------------------------------------------- 1. Cas */
{
  // Quelques tours joués, jusqu'à avoir des gardiens dans les deux camps.
  let json = moteur.selfplay.departMelange(GRAINE);
  let etat = JSON.parse(json);
  const camps = e => [e.characters.filter(g => g.player === e.currentPlayer), e.characters.filter(g => g.player !== e.currentPlayer)];
  for (let i = 0; i < 16 && camps(etat).some(c => !c.length); i++) {
    json = moteur.selfplay.tour(json, { graine: GRAINE + i, budget: BUDGET }).etat;
    etat = JSON.parse(json);
  }
  const joueur = etat.currentPlayer;
  const [miens, autres] = camps(etat);
  verifier(miens.length && autres.length, 'cas : il faut des gardiens des deux camps après deux tours');

  const refuse = (action, quoi, sur = etat) => {
    const r = regles.verifier(sur, action);
    verifier(!r.ok && typeof r.raison === 'string' && r.raison.length > 0, `cas « ${quoi} » : devait être refusé (${JSON.stringify(r)})`);
  };
  const accepte = (action, quoi) => {
    const r = regles.verifier(etat, action);
    verifier(r.ok, `cas « ${quoi} » : devait être accepté (${r.raison})`);
  };

  const g = miens[0];
  const terre = new Set(etat.islands.flatMap(i => i.cells.map(([r, c]) => `${r},${c}`)));
  refuse({ type: 'VOLER_LE_PLATEAU' }, 'type inconnu');
  refuse(null, 'action vide');
  if (autres[0]) refuse({ type: 'MOVE', charId: autres[0].id, r: autres[0].r, c: autres[0].c + 1, cost: 1 }, 'gardien adverse');
  refuse({ type: 'MOVE', charId: g.id, r: g.r, c: g.c, cost: 1 }, 'rester sur place');
  refuse({ type: 'MOVE', charId: g.id, r: -1, c: 0, cost: 1 }, 'hors du plateau');
  refuse({ type: 'MOVE', charId: g.id, r: g.r, c: g.c + 1, cost: 99 }, 'trop de cartes');
  // Une case de mer : jamais atteignable à pied.
  const mer = [];
  for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) if (!terre.has(`${r},${c}`)) mer.push([r, c]);
  if (mer[0]) refuse({ type: 'MOVE', charId: g.id, r: mer[0][0], c: mer[0][1], cost: 1 }, 'marcher dans le vide');
  refuse({ type: 'PUSH', pusherId: g.id, r: g.r + 5, c: g.c, force: 1 }, 'poussée à distance');
  refuse({ type: 'PUSH', pusherId: g.id, r: g.r, c: g.c + 1, force: 50 }, 'force sans cartes');
  refuse({ type: 'MAGIC', islandId: 999999, pivot: [0, 0], direction: 1, turns: 1 }, 'île inconnue');
  if (etat.islands[0]) {
    const ile = etat.islands[0];
    refuse({ type: 'MAGIC', islandId: ile.id, pivot: [ile.cells[0][0], ile.cells[0][1]], direction: 2, turns: 1 }, 'sens invalide');
  }
  if (etat.islands[0]) {
    const ile = etat.islands[0];
    refuse({ type: 'POSE', shapeKey: ile.shapeKey, cells: ile.cells, owner: joueur }, 'poser sur une île existante');
  }
  refuse({ type: 'POSE', shapeKey: 'FORME_INCONNUE', cells: [[0, 0]], owner: joueur }, 'forme inconnue');
  refuse({ type: 'POSE', shapeKey: (etat.islands[0] || {}).shapeKey || 'L', cells: [[0, 0]], owner: 1 - joueur }, 'pose par l\'adversaire');
  refuse({ type: 'SEQUENCE', actions: [] }, 'séquence vide');
  accepte({ type: 'FIN_TOUR' }, 'fin de tour');

  // Une partie terminée n'accepte plus rien.
  const fini = { ...etat, winner: joueur };
  refuse({ type: 'FIN_TOUR' }, 'partie terminée', fini);

  // Le moteur ne touche pas l'état fourni.
  const avant = JSON.stringify(etat);
  regles.appliquer(etat, { type: 'FIN_TOUR' });
  verifier(JSON.stringify(etat) === avant, 'appliquer() a modifié l\'état fourni');
  // Une fin de tour passe la main et l'annonce.
  const fin = regles.finDeTour(etat);
  verifier(fin.ok && fin.etat.currentPlayer !== joueur, 'fin de tour : la main doit passer');
  verifier(fin.ok && fin.evenements.some(e => e.type === 'nouveau-tour'), 'fin de tour : événement nouveau-tour absent');
}

/* ----------------------------------------------- 2. Partie CPU contre CPU */
const bilan = { tours: 0, actions: 0, refusees: 0, ecarts: 0, evenements: {} };
{
  let json = moteur.selfplay.departMelange(GRAINE + 50);
  for (let i = 0; i < TOURS; i++) {
    const r = moteur.selfplay.tourControle(json, { graine: GRAINE * 10 + i, budget: BUDGET });
    bilan.tours++;
    bilan.actions += r.controle.actions;
    for (const refus of r.controle.refusees) {
      bilan.refusees++;
      echecs.push(`tour ${i + 1} : le moteur refuse un coup du CPU (${refus.type} : ${refus.raison})`);
    }
    for (const ecart of r.controle.ecarts) {
      bilan.ecarts++;
      echecs.push(`tour ${i + 1} : ${ecart.type} donne un autre état par le moteur que par le planner`);
    }
    for (const [type, n] of Object.entries(r.controle.evenements)) bilan.evenements[type] = (bilan.evenements[type] || 0) + n;
    json = r.etat;
    if (r.fin) break;
  }
  verifier(bilan.actions > TOURS, `partie : trop peu d'actions contrôlées (${bilan.actions})`);
}

sortie.log(`Moteur de règles : ${bilan.tours} tours, ${bilan.actions} actions du CPU contrôlées, ${bilan.refusees} refusées, ${bilan.ecarts} écarts.`);
sortie.log('Événements : ' + Object.entries(bilan.evenements).map(([t, n]) => `${t} ${n}`).join(', '));
if (echecs.length) {
  sortie.error(`ÉCHEC (${echecs.length}) :`);
  echecs.slice(0, 20).forEach(e => sortie.error('  - ' + e));
  process.exit(1);
}
sortie.log('OK : coups illégaux refusés, coups du CPU acceptés, mêmes états par le moteur et par le planner.');
process.exit(0);
