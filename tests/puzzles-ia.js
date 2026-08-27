/* Banc d'essai tactique de l'IA — 16 positions déterministes.

   Ce fichier mesure la FORCE de l'IA. Le smoke test IA contre IA
   (partie-ia-contre-ia.spec.js) mesure sa SURVIE : il vérifie qu'une partie se
   termine sans erreur, ce qui ne dit rien de la qualité des coups joués. Les
   deux sont complémentaires et aucun ne remplace l'autre.

   Trois règles ont guidé l'écriture de ces puzzles.

   1. Les conditions de réussite sont écrites en termes de RÈGLES, jamais en
      termes de score interne. Aucune assertion du genre « l'évaluation dépasse
      120 » : il n'existe pas encore d'évaluateur stratégique, et en inventer un
      pour le banc d'essai rendrait la mesure circulaire — l'IA serait jugée par
      sa propre opinion.

   2. Plusieurs coups peuvent réussir un même puzzle dès lors qu'ils produisent
      un résultat stratégiquement équivalent. On juge l'état obtenu, pas une
      séquence de clics imaginée d'avance.

   3. Certains échecs sont ATTENDUS et ne doivent pas être « réparés ». Ils sont
      la mesure elle-même : l'IA actuelle pose son île avant toute action et ne
      planifie pas sa réserve, elle échouera donc par construction sur les
      puzzles correspondants. Modifier ces tests pour obtenir un meilleur total
      détruirait la seule chose qu'ils servent à établir.

   Repères géométriques (plateau 11×11) :
     Sanctuaire / centre ....... (5,5)
     Villages joueur 0 (IA) .... (0,0) et (10,10)
     Cases de validation J0 .... (0,0) (1,0) (0,1) · (10,10) (9,10) (10,9)
     Villages joueur 1 ......... (0,10) et (10,0)
     Cases de validation J1 .... (0,10) (1,10) (0,9) · (10,0) (9,0) (10,1)
   Un village et le sanctuaire sont toujours du terrain ; les autres cases de
   validation ne le deviennent que si une île les recouvre. */

const GRILLE = 11;
const SANCTUAIRE = [5, 5];

/* ---------------------------------------------------------------------------
   Oracles indépendants : recalculés ici à partir du terrain relevé, jamais
   empruntés au code de décision de l'IA. Une assertion doit pouvoir contredire
   l'IA, donc elle ne peut pas partager sa vision du plateau.
   ------------------------------------------------------------------------- */

const cle = (r, c) => `${r},${c}`;

/** Coût de déplacement réel entre deux cases : orthogonal 1, diagonal 2,
    uniquement sur du terrain. Dijkstra, même topologie que movementEdges(). */
function coutDeplacement(terrain, depart, arrivees) {
  const sol = new Set(terrain.map(([r, c]) => cle(r, c)));
  const buts = new Set(arrivees.filter(([r, c]) => sol.has(cle(r, c))).map(([r, c]) => cle(r, c)));
  if (!buts.size) return Infinity;
  if (buts.has(cle(depart[0], depart[1]))) return 0;
  if (!sol.has(cle(depart[0], depart[1]))) return Infinity;

  const dist = new Map([[cle(depart[0], depart[1]), 0]]);
  const file = [{ r: depart[0], c: depart[1], cout: 0 }];

  while (file.length) {
    file.sort((a, b) => a.cout - b.cout);
    const actuel = file.shift();
    if (actuel.cout !== dist.get(cle(actuel.r, actuel.c))) continue;
    if (buts.has(cle(actuel.r, actuel.c))) return actuel.cout;

    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = actuel.r + dr, nc = actuel.c + dc;
      if (nr < 0 || nc < 0 || nr >= GRILLE || nc >= GRILLE) continue;
      if (!sol.has(cle(nr, nc))) continue;
      const suivant = actuel.cout + (dr && dc ? 2 : 1);
      if (suivant >= (dist.get(cle(nr, nc)) ?? Infinity)) continue;
      dist.set(cle(nr, nc), suivant);
      file.push({ r: nr, c: nc, cout: suivant });
    }
  }
  return Infinity;
}

const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const porteurDe = (obs, joueur) => obs.gardiens.find(g => g.player === joueur && g.porte) || null;
const couronneDe = (obs, joueur) => obs.couronnes.find(cr => cr.porteePar === joueur) || null;
const aJoue = (journal, type) => journal.some(e => e.type === type && e.applique !== false);

/* Une île pleine et rectangulaire, raccourci d'écriture pour les décors. */
function bloc(r0, c0, hauteur, largeur) {
  const cellules = [];
  for (let r = r0; r < r0 + hauteur; r++) for (let c = c0; c < c0 + largeur; c++) cellules.push([r, c]);
  return cellules;
}

/* ---------------------------------------------------------------------------
   Les 16 puzzles.
   ------------------------------------------------------------------------- */

const PUZZLES = [
  {
    id: "01",
    nom: "Diagonale vers couronne",
    /* La seule route vers la couronne passe par un pas diagonal qui n'améliore
       PAS la distance de Manhattan. Une IA qui mesure ses distances sur les
       seuls voisins orthogonaux ne voit aucun progrès à faire ce pas et reste
       sur place ; avec la vraie topologie (diagonale = coût 2) le progrès est
       réel. C'est le puzzle qui isole la correction des distances. */
    spec: {
      seed: 101,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE"], 1: [] },
      islands: [
        { shapeKey: "line3", owner: 0, cells: [[3, 2], [3, 3], [3, 4]] },
        { shapeKey: "domino", owner: 0, cells: [[2, 5]] },
        { shapeKey: "line3", owner: 1, cells: [[3, 6], [3, 7], [3, 8]] },
        { shapeKey: "domino", owner: 1, cells: [[3, 9]] }
      ],
      characters: [{ id: "ia-1", player: 0, r: 3, c: 4 }],
      crowns: [{ r: 3, c: 9, active: true }]
    },
    attendu(obs) {
      const g = obs.gardiensIA[0];
      if (!g) return { ok: false, raison: "gardien IA absent" };
      const avant = coutDeplacement(obs.terrain, [3, 4], [[3, 9]]);
      const apres = coutDeplacement(obs.terrain, [g.r, g.c], [[3, 9]]);
      return {
        ok: apres < avant,
        raison: `coût réel vers la couronne ${avant} → ${apres} (gardien en ${g.r},${g.c})`
      };
    }
  },

  {
    id: "02",
    nom: "Validation immédiate",
    /* Le porteur est à un pas d'une case de validation et dispose du
       déplacement nécessaire. La validation elle-même se produit au DÉBUT du
       tour suivant (scoreCrownsAtTurnStart) : la condition porte donc sur la
       position du porteur en fin de tour, pas sur le score. */
    spec: {
      seed: 102,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE"], 1: [] },
      islands: [{ shapeKey: "square", owner: 0, cells: [[1, 0], [1, 1], [0, 1], [2, 1]] }],
      characters: [{ id: "ia-1", player: 0, r: 1, c: 1 }],
      crowns: [{ r: 1, c: 1, carrierId: "ia-1", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "l'IA ne porte plus de couronne" };
      return {
        ok: p.surCaseValidation,
        raison: p.surCaseValidation
          ? `porteur en (${p.r},${p.c}), case de validation`
          : `porteur en (${p.r},${p.c}), hors case de validation`
      };
    }
  },

  {
    id: "03",
    nom: "Empêcher une validation adverse",
    /* Le porteur adverse est déjà posé sur une de ses cases de validation : il
       marque au début de son prochain tour si rien n'est fait. Une poussée vers
       l'extérieur du plateau le fait chuter. Réussite = l'adversaire ne porte
       plus de couronne sur une case de validation. */
    spec: {
      seed: 103,
      islandPlacedThisTurn: true,
      hands: { 0: ["PUSH", "PUSH"], 1: [] },
      islands: [{ shapeKey: "line3", owner: 1, cells: [[1, 8], [1, 9], [1, 10]] }],
      characters: [
        { id: "ia-1", player: 0, r: 1, c: 8 },
        { id: "adv-1", player: 1, r: 1, c: 9 }
      ],
      crowns: [{ r: 1, c: 9, carrierId: "adv-1", active: true }]
    },
    attendu(obs) {
      const adv = obs.gardiensAdverses.find(g => g.porte);
      if (!adv) return { ok: true, raison: "l'adversaire ne porte plus de couronne" };
      return {
        ok: !adv.surCaseValidation,
        raison: adv.surCaseValidation
          ? `porteur adverse toujours en (${adv.r},${adv.c}) sur case de validation`
          : `porteur adverse déplacé en (${adv.r},${adv.c})`
      };
    }
  },

  {
    id: "04",
    nom: "Protéger un porteur menacé de chute",
    /* Le porteur de l'IA est adossé au vide avec un gardien adverse adjacent :
       au tour suivant, une poussée l'expulse et la couronne est perdue. Une
       retraite existe. Réussite = le porteur conserve la couronne et n'est plus
       en position d'être poussé hors du plateau. */
    spec: {
      seed: 104,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE"], 1: [] },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 2, 3, 3) }],
      characters: [
        { id: "ia-1", player: 0, r: 4, c: 2 },
        { id: "adv-1", player: 1, r: 5, c: 2 }
      ],
      crowns: [{ r: 4, c: 2, carrierId: "ia-1", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const sol = new Set(obs.terrain.map(([r, c]) => cle(r, c)));
      const expulsable = obs.gardiensAdverses.some(a => {
        const dr = p.r - a.r, dc = p.c - a.c;
        if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
        return !sol.has(cle(p.r + dr, p.c + dc));
      });
      return {
        ok: !expulsable,
        raison: expulsable
          ? `porteur en (${p.r},${p.c}) toujours expulsable dans le vide`
          : `porteur en (${p.r},${p.c}), hors de portée d'une expulsion`
      };
    }
  },

  {
    id: "05",
    nom: "Éliminer un porteur adverse",
    /* Le porteur adverse est au bord du vide, l'IA est adjacente et dispose
       d'une poussée. Réussite = l'adversaire ne porte plus la couronne. */
    spec: {
      seed: 105,
      islandPlacedThisTurn: true,
      hands: { 0: ["PUSH", "PUSH"], 1: [] },
      islands: [{ shapeKey: "line3", owner: 0, cells: [[6, 4], [6, 5], [6, 6]] }],
      characters: [
        { id: "ia-1", player: 0, r: 6, c: 5 },
        { id: "adv-1", player: 1, r: 6, c: 6 }
      ],
      crowns: [{ r: 6, c: 6, carrierId: "adv-1", active: true }]
    },
    attendu(obs) {
      const advPorte = obs.gardiensAdverses.some(g => g.porte);
      return {
        ok: !advPorte,
        raison: advPorte ? "le porteur adverse tient toujours la couronne" : "porteur adverse neutralisé"
      };
    }
  },

  {
    id: "06",
    nom: "Éliminer un gardien rentable",
    /* Même mécanique sans couronne en jeu : un gardien adverse isolé au bord du
       vide. Réussite = un gardien adverse de moins qu'au départ. */
    spec: {
      seed: 106,
      islandPlacedThisTurn: true,
      hands: { 0: ["PUSH", "PUSH"], 1: [] },
      islands: [{ shapeKey: "line3", owner: 0, cells: [[8, 4], [8, 5], [8, 6]] }],
      characters: [
        { id: "ia-1", player: 0, r: 8, c: 5 },
        { id: "adv-1", player: 1, r: 8, c: 6 }
      ],
      crowns: [{ r: 5, c: 5, active: true }]
    },
    attendu(obs, depart) {
      const avant = depart.gardiensAdverses.length;
      const apres = obs.gardiensAdverses.length;
      return { ok: apres < avant, raison: `gardiens adverses ${avant} → ${apres}` };
    }
  },

  {
    id: "07",
    nom: "Transmission gratuite utile",
    /* Le porteur est loin de son village ; un allié beaucoup plus proche peut
       recevoir la couronne gratuitement. Réussite = la couronne est portée par
       un gardien de l'IA strictement plus proche d'une case de validation
       qu'au départ. */
    spec: {
      seed: 107,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE"], 1: [] },
      islands: [{ shapeKey: "line3", owner: 0, cells: [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]] }],
      characters: [
        { id: "ia-loin", player: 0, r: 2, c: 3 },
        { id: "ia-pres", player: 0, r: 1, c: 1 }
      ],
      crowns: [{ r: 2, c: 3, carrierId: "ia-loin", active: true }]
    },
    attendu(obs, depart) {
      const cr = couronneDe(obs, 0);
      if (!cr) return { ok: false, raison: "l'IA ne porte plus la couronne" };
      const cibles = obs.casesValidation[0];
      const avant = coutDeplacement(depart.terrain, [2, 3], cibles);
      const apres = coutDeplacement(obs.terrain, [cr.r, cr.c], cibles);
      return { ok: apres < avant, raison: `couronne à ${avant} → ${apres} du village` };
    }
  },

  {
    id: "08",
    nom: "Poussée de couronne utile",
    /* Une couronne libre est adjacente à un gardien de l'IA ; la pousser ou la
       ramasser la rapproche du village. Réussite = la couronne est plus proche
       d'une case de validation de l'IA qu'au départ (portée ou non). */
    spec: {
      seed: 108,
      islandPlacedThisTurn: true,
      hands: { 0: ["PUSH", "MOVE"], 1: [] },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(1, 1, 2, 4) }],
      characters: [{ id: "ia-1", player: 0, r: 2, c: 3 }],
      crowns: [{ r: 1, c: 3, active: true }]
    },
    attendu(obs, depart) {
      const cr = obs.couronnes.find(c => c.active);
      if (!cr) return { ok: false, raison: "couronne introuvable" };
      const cibles = obs.casesValidation[0];
      const avant = coutDeplacement(depart.terrain, [1, 3], cibles);
      const apres = coutDeplacement(obs.terrain, [cr.r, cr.c], cibles);
      return {
        ok: apres < avant || cr.porteePar === 0,
        raison: cr.porteePar === 0
          ? "couronne récupérée par l'IA"
          : `couronne à ${avant} → ${apres} du village`
      };
    }
  },

  {
    id: "09",
    nom: "Magie ouvrant une route",
    /* Le porteur est enfermé sur un îlot : aucune route vers une case de
       validation. Une rotation d'île peut relier les deux régions. Réussite =
       en fin de tour, une route existe réellement (oracle de terrain). */
    spec: {
      seed: 109,
      islandPlacedThisTurn: true,
      hands: { 0: ["MAGIC", "MOVE"], 1: [] },
      islands: [
        { shapeKey: "square", owner: 0, cells: [[2, 2], [2, 3], [3, 2], [3, 3]] },
        { shapeKey: "line3", owner: 0, cells: [[5, 1], [5, 2], [5, 3]] }
      ],
      characters: [{ id: "ia-1", player: 0, r: 3, c: 2 }],
      crowns: [{ r: 3, c: 2, carrierId: "ia-1", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const cout = coutDeplacement(obs.terrain, [p.r, p.c], obs.casesValidation[0]);
      return {
        ok: Number.isFinite(cout),
        raison: Number.isFinite(cout)
          ? `route ouverte, coût ${cout} vers la validation`
          : "toujours aucune route vers une case de validation"
      };
    }
  },

  {
    id: "10",
    nom: "Magie coupant une route adverse",
    /* Le porteur adverse dispose d'une route vers son village. Une rotation
       peut la rompre. Réussite = en fin de tour l'adversaire n'a plus de route
       vers ses cases de validation. */
    spec: {
      seed: 110,
      islandPlacedThisTurn: true,
      hands: { 0: ["MAGIC", "MAGIC"], 1: [] },
      islands: [
        { shapeKey: "line3", owner: 1, cells: [[1, 7], [1, 8], [1, 9]] },
        { shapeKey: "line3", owner: 0, cells: [[3, 7], [3, 8], [3, 9]] }
      ],
      characters: [
        { id: "adv-1", player: 1, r: 1, c: 7 },
        { id: "ia-1", player: 0, r: 3, c: 7 }
      ],
      crowns: [{ r: 1, c: 7, carrierId: "adv-1", active: true }]
    },
    attendu(obs) {
      const adv = obs.gardiensAdverses.find(g => g.porte);
      if (!adv) return { ok: true, raison: "porteur adverse neutralisé" };
      const cout = coutDeplacement(obs.terrain, [adv.r, adv.c], obs.casesValidation[1]);
      return {
        ok: !Number.isFinite(cout),
        raison: Number.isFinite(cout)
          ? `l'adversaire garde une route (coût ${cout})`
          : "route adverse coupée"
      };
    }
  },

  {
    id: "11",
    nom: "Agir avant de poser l'île",
    /* ÉCHEC ATTENDU EN BASELINE. runAITurn() appelle
       createAutomaticIslandAndSpawn() avant sa boucle d'actions : l'IA actuelle
       ne PEUT pas agir avant de poser. Le puzzle ne demande qu'une chose,
       observable dans le journal : au moins une action jouée avant la pose. */
    spec: {
      seed: 111,
      islandPlacedThisTurn: false,
      hands: { 0: ["MOVE", "MOVE", "PUSH"], 1: [] },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 4, 2, 3) }],
      characters: [
        { id: "ia-1", player: 0, r: 4, c: 4 },
        { id: "adv-1", player: 1, r: 4, c: 6 }
      ],
      crowns: [{ r: 4, c: 5, active: true }]
    },
    attendu(obs, depart, journal) {
      const iPose = journal.findIndex(e => e.type === "POSE");
      const iAction = journal.findIndex(e => e.type !== "POSE" && e.applique !== false);
      if (iAction === -1) return { ok: false, raison: "aucune action jouée" };
      if (iPose === -1) return { ok: true, raison: "aucune pose imposée, actions jouées" };
      return {
        ok: iAction < iPose,
        raison: iAction < iPose
          ? "une action a précédé la pose"
          : "l'île a été posée avant toute action (pose automatique en début de tour)"
      };
    }
  },

  {
    id: "12",
    nom: "Poser tôt est préférable",
    /* Cas inverse : la pose apporte immédiatement un gardien jouable (et
       parfois une couronne), donc poser d'abord est le bon ordre. Réussite =
       une île a été posée ET l'IA finit le tour avec plus de gardiens. */
    spec: {
      seed: 112,
      islandPlacedThisTurn: false,
      hands: { 0: ["MOVE", "MOVE"], 1: [] },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 4, 2, 2) }],
      characters: [{ id: "ia-1", player: 0, r: 4, c: 4 }],
      crowns: [{ r: 5, c: 5, active: true }]
    },
    attendu(obs, depart) {
      const posee = obs.iles.length > depart.iles.length;
      const plusDeGardiens = obs.gardiensIA.length > depart.gardiensIA.length;
      return {
        ok: posee && plusDeGardiens,
        raison: `îles ${depart.iles.length}→${obs.iles.length}, gardiens IA ${depart.gardiensIA.length}→${obs.gardiensIA.length}`
      };
    }
  },

  {
    id: "13",
    nom: "Conserver la réserve",
    /* ÉCHEC POSSIBLE PAR CONSTRUCTION. Aucun gain n'est disponible : les
       gardiens sont isolés sur un îlot sans couronne ni adversaire à portée.
       Dépenser des cartes serait strictement inférieur à les garder. Réussite =
       au moins 3 cartes non utilisées en fin de tour. */
    spec: {
      seed: 113,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE", "PUSH", "MAGIC"], 1: [] },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(7, 7, 2, 2) }],
      characters: [{ id: "ia-1", player: 0, r: 7, c: 7 }],
      crowns: [{ r: 5, c: 5, active: true }]
    },
    attendu(obs) {
      /* On lit la RÉSERVE, pas la main : à la fin du tour, les cartes non
         jouées quittent la main pour la réserve physique (voir
         endTurnPhysicalReserve). Une main vide ne prouve donc rien — c'est le
         stock accumulé qui distingue « gardées » de « gaspillées ». */
      const stock = (obs.reserve.MOVE || 0) + (obs.reserve.PUSH || 0) + (obs.reserve.MAGIC || 0);
      return { ok: stock >= 3, raison: `réserve constituée : ${stock} carte(s) (${JSON.stringify(obs.reserve)})` };
    }
  },

  {
    id: "14",
    nom: "Dépenser une grosse réserve",
    /* L'inverse : une combinaison décisive existe mais coûte cher. Le porteur
       peut rejoindre une case de validation en dépensant plusieurs
       déplacements. Réussite = porteur sur une case de validation. */
    spec: {
      seed: 114,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"], 1: [] },
      islands: [{ shapeKey: "line3", owner: 0, cells: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] }],
      characters: [{ id: "ia-1", player: 0, r: 0, c: 5 }],
      crowns: [{ r: 0, c: 5, carrierId: "ia-1", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      return {
        ok: p.surCaseValidation,
        raison: `porteur en (${p.r},${p.c})${p.surCaseValidation ? ", validation atteinte" : ""}`
      };
    }
  },

  {
    id: "15",
    nom: "Préparer une couronne en attente",
    /* Durci après le Prompt 1, où ce puzzle était un FAUX POSITIF : il passait
       sans que l'IA consulte jamais `couronnesEnAttente`. Une couronne libre
       traînait au nord-ouest, l'IA courait dessus, et sa trajectoire frôlait le
       sanctuaire par accident — le test validait donc un résultat obtenu pour
       une tout autre raison.

       Version durcie : plus aucune couronne libre. La seule couronne active est
       PORTÉE PAR L'ADVERSAIRE, ce qui envoie explicitement le comportement
       actuel dans la direction opposée — quand aucune couronne n'est libre,
       aiStrategicTargetsForCharacter() vise les cases autour du porteur
       adverse. Rester immobile échoue aussi (le gardien démarre à distance 2).
       Seule une approche délibérée du sanctuaire, là où la couronne en attente
       apparaîtra au prochain tour, satisfait la condition.

       Le gardien évolue sur un couloir fermé (5,6)-(5,8) relié au sanctuaire :
       s'approcher de l'adversaire et s'approcher du sanctuaire sont deux
       directions strictement opposées, sans échappatoire. */
    spec: {
      seed: 115,
      islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE"], 1: [] },
      islands: [
        { shapeKey: "line3", owner: 0, cells: [[5, 6], [5, 7], [5, 8]] },
        { shapeKey: "line3", owner: 1, cells: [[1, 8], [1, 9], [1, 10]] }
      ],
      characters: [
        { id: "ia-1", player: 0, r: 5, c: 7 },
        { id: "adv-1", player: 1, r: 1, c: 9 }
      ],
      crowns: [
        { r: 1, c: 9, carrierId: "adv-1", active: true },
        { r: 5, c: 5, active: false }
      ],
      couronnesEnAttente: ["crown-2"]
    },
    attendu(obs) {
      /* Distance 1 ou 0 : le gardien doit pouvoir prendre la couronne dès son
         apparition. Le départ est à 2, donc l'immobilité échoue, et s'éloigner
         vers l'adversaire échoue davantage. */
      const distances = obs.gardiensIA.map(g => manhattan([g.r, g.c], SANCTUAIRE));
      const enPosition = distances.some(d => d <= 1);
      return {
        ok: enPosition,
        raison: `distance(s) au sanctuaire : ${distances.join(", ") || "aucun gardien"} (départ : 2)`
      };
    }
  },

  {
    id: "16",
    nom: "Forme limitée",
    /* Le stock par forme est réellement contraignant ici : shapeLimitPerOwner
       est posé à 1 et la Croix (cross5, la forme la plus polyvalente) est déjà
       consommée par une île de partie (fromSetup: false, donc comptée dans le
       stock). L'IA doit poser une autre forme sans se bloquer. Réussite = une
       île est posée et aucune Croix supplémentaire n'apparaît. */
    spec: {
      seed: 116,
      islandPlacedThisTurn: false,
      rules: { shapeLimitPerOwner: 1 },
      hands: { 0: ["MOVE"], 1: [] },
      islands: [
        { shapeKey: "square", owner: 0, cells: bloc(4, 4, 2, 2) },
        { shapeKey: "cross5", owner: 0, fromSetup: false, cells: [[7, 2], [8, 1], [8, 2], [8, 3], [9, 2]] }
      ],
      characters: [{ id: "ia-1", player: 0, r: 4, c: 4 }],
      crowns: [{ r: 5, c: 5, active: true }]
    },
    attendu(obs, depart) {
      const posee = obs.iles.length > depart.iles.length;
      const croix = obs.iles.filter(i => i.shapeKey === "cross5" && !i.fromSetup).length;
      const croixAvant = depart.iles.filter(i => i.shapeKey === "cross5" && !i.fromSetup).length;
      return {
        ok: posee && croix === croixAvant,
        raison: `île posée : ${posee ? "oui" : "non"}, croix de partie ${croixAvant}→${croix}`
      };
    }
  }
];

module.exports = { PUZZLES, coutDeplacement, manhattan, cle };
