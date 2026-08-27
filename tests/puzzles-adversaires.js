/* Banc d'essai ADVERSARIAL — 8 positions.

   Suite distincte du banc historique (puzzles-ia.js), qui reste inchangé. Elle
   mesure une seule capacité : l'IA regarde-t-elle ce que l'adversaire pourra
   faire APRÈS son tour ?

   Le timing du moteur rend cette question centrale. `scoreCrownsAtTurnStart()`
   est appelée dans `beginTurn()`, donc les couronnes d'un joueur ne se valident
   qu'au début de SON tour suivant — c'est-à-dire APRÈS un tour complet de
   l'adversaire. Un porteur garé sur une case de validation n'est donc pas à
   l'abri : il reste une fenêtre entière pour l'en expulser.

   Chaque position offre au moins deux continuations de valeur comparable, dont
   une seule survit à la réplique adverse. Une IA qui ne regarde qu'un coup
   devant peut choisir la mauvaise sans rien faire d'absurde.

   Les conditions de réussite sont écrites en termes de règles et calculées par
   un ORACLE INDÉPENDANT (voir expulsablePar) : il refait le raisonnement de
   menace à partir du terrain observé, sans jamais appeler une fonction de
   décision de l'IA. Une assertion doit pouvoir contredire l'IA.

   Repères : sanctuaire (5,5) ; villages J0 (0,0) et (10,10) ; J1 (0,10) et (10,0). */

const GRILLE = 11;
const cle = (r, c) => `${r},${c}`;

function bloc(r0, c0, h, l) {
  const cellules = [];
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + l; c++) cellules.push([r, c]);
  return cellules;
}

/** Cases atteignables par un gardien pour un budget de déplacement donné,
 *  topologie réelle : orthogonal 1, diagonale 2, terrain uniquement, cases
 *  occupées interdites. */
function portee(sol, occupees, depart, budget) {
  const dist = new Map([[cle(depart[0], depart[1]), 0]]);
  const file = [{ r: depart[0], c: depart[1], cout: 0 }];
  const atteintes = new Set([cle(depart[0], depart[1])]);

  while (file.length) {
    file.sort((a, b) => a.cout - b.cout);
    const actuel = file.shift();
    if (actuel.cout !== dist.get(cle(actuel.r, actuel.c))) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = actuel.r + dr, nc = actuel.c + dc;
      if (nr < 0 || nc < 0 || nr >= GRILLE || nc >= GRILLE) continue;
      if (!sol.has(cle(nr, nc))) continue;
      if (occupees.has(cle(nr, nc))) continue;
      const suivant = actuel.cout + (dr && dc ? 2 : 1);
      if (suivant > budget) continue;
      if (suivant >= (dist.get(cle(nr, nc)) ?? Infinity)) continue;
      dist.set(cle(nr, nc), suivant);
      atteintes.add(cle(nr, nc));
      file.push({ r: nr, c: nc, cout: suivant });
    }
  }
  return atteintes;
}

/** Le gardien `victime` peut-il être expulsé du plateau par l'adversaire dans
 *  le budget donné ? Couvre la menace immédiate (un PUSH) comme la combinaison
 *  courte (se déplacer, puis pousser) — c'est justement ce qu'une évaluation
 *  purement locale ne voit pas. */
function expulsablePar(obs, victime, adversaires, budgetMove, budgetPush) {
  if (budgetPush < 1) return null;
  const sol = new Set(obs.terrain.map(([r, c]) => cle(r, c)));
  const occupees = new Set(obs.gardiens.map(g => cle(g.r, g.c)));

  for (const ennemi of adversaires) {
    const depuis = portee(sol, occupees, [ennemi.r, ennemi.c], budgetMove);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      // Case d'où pousser : adjacente à la victime, du côté opposé au vide.
      const posteR = victime.r - dr, posteC = victime.c - dc;
      if (!depuis.has(cle(posteR, posteC))) continue;
      // Case derrière la victime : si ce n'est pas du terrain, elle chute.
      const derriereR = victime.r + dr, derriereC = victime.c + dc;
      const dehors = derriereR < 0 || derriereC < 0 || derriereR >= GRILLE || derriereC >= GRILLE;
      if (dehors || !sol.has(cle(derriereR, derriereC))) {
        return { poste: [posteR, posteC], ennemi: ennemi.id, versLeVide: [derriereR, derriereC] };
      }
    }
  }
  return null;
}

const porteurDe = (obs, joueur) => obs.gardiens.find(g => g.player === joueur && g.porte) || null;

/* Réserve adverse : c'est la ressource GARANTIE dont l'adversaire disposera à
   son tour, indépendamment de sa pioche. Les scénarios s'appuient dessus pour
   que la menace soit certaine et non spéculative. */
const RESERVE = (move, push, magic = 0) => ({ MOVE: move, PUSH: push, MAGIC: magic });

const SCENARIOS = [
  {
    id: "A1",
    nom: "Porteur expulsable par une poussée immédiate",
    /* Menace d'un seul coup. Une IA qui vérifie l'adjacence directe devrait
       déjà l'éviter : ce scénario sert de garde-bas, pour distinguer ce que V2
       savait déjà de ce que V3 apporte. */
    spec: {
      seed: 301, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(0, 2) },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 3, 3, 4) }],
      characters: [
        { id: "ia-p", player: 0, r: 4, c: 3 },
        { id: "adv-1", player: 1, r: 5, c: 3 }
      ],
      crowns: [{ r: 4, c: 3, carrierId: "ia-p", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const menace = expulsablePar(obs, p, obs.gardiensAdverses, 0, 2);
      return {
        ok: !menace,
        raison: menace
          ? `porteur en (${p.r},${p.c}) expulsable depuis (${menace.poste})`
          : `porteur en (${p.r},${p.c}), hors d'atteinte`
      };
    }
  },

  {
    id: "A2",
    nom: "Porteur expulsable par MOVE puis PUSH",
    /* La menace tient en deux coups adverses : l'ennemi n'est PAS adjacent au
       départ, il se déplace puis pousse. Une évaluation qui ne regarde que
       l'adjacence immédiate déclare la case sûre à tort. Des refuges
       réellement sûrs existent au centre de l'île. */
    spec: {
      seed: 302, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(2, 1) },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 3, 3, 4) }],
      characters: [
        { id: "ia-p", player: 0, r: 4, c: 3 },
        { id: "adv-1", player: 1, r: 6, c: 4 }
      ],
      crowns: [{ r: 4, c: 3, carrierId: "ia-p", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const menace = expulsablePar(obs, p, obs.gardiensAdverses, 2, 1);
      return {
        ok: !menace,
        raison: menace
          ? `porteur en (${p.r},${p.c}) expulsable après déplacement adverse vers (${menace.poste})`
          : `porteur en (${p.r},${p.c}), aucune ligne MOVE→PUSH`
      };
    }
  },

  {
    id: "A3",
    nom: "Case de validation piégée",
    /* Le cœur du timing d'ILYOS. La case de validation (1,0) semble idéale —
       la couronne s'y valide au début du tour suivant. Mais l'adversaire joue
       AVANT, et de (2,0) il expulse le porteur vers le vide en (0,0)... non :
       (0,0) est un village, donc terrain. La menace vient de l'ouest : depuis
       (1,1) une poussée envoie le porteur en (1,-1), hors du plateau.
       Une case sûre existe : (2,1), qui progresse aussi vers le village. */
    spec: {
      seed: 303, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(1, 1) },
      islands: [{ shapeKey: "square", owner: 0, cells: [[1, 0], [1, 1], [2, 0], [2, 1], [2, 2], [3, 2]] }],
      characters: [
        { id: "ia-p", player: 0, r: 2, c: 2 },
        { id: "adv-1", player: 1, r: 3, c: 2 }
      ],
      crowns: [{ r: 2, c: 2, carrierId: "ia-p", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const menace = expulsablePar(obs, p, obs.gardiensAdverses, 1, 1);
      return {
        ok: !menace,
        raison: menace
          ? `porteur en (${p.r},${p.c}) expulsable via (${menace.poste})`
          : `porteur en (${p.r},${p.c}), position tenable`
      };
    }
  },

  {
    id: "A4",
    nom: "Défendre plutôt que grappiller",
    /* L'adversaire porte une couronne et se trouve à une case de sa validation.
       L'IA peut soit avancer son propre gardien vers un gain modeste, soit
       neutraliser cette menace. Ne rien faire contre elle, c'est concéder un
       point au tour suivant. */
    spec: {
      seed: 304, islandPlacedThisTurn: true,
      hands: { 0: ["PUSH", "PUSH", "MOVE"], 1: [] },
      stash: { 1: RESERVE(2, 0) },
      islands: [
        { shapeKey: "line3", owner: 1, cells: [[1, 8], [1, 9], [1, 10], [2, 10]] },
        { shapeKey: "square", owner: 0, cells: bloc(6, 6, 2, 2) }
      ],
      characters: [
        { id: "ia-1", player: 0, r: 1, c: 8 },
        { id: "ia-2", player: 0, r: 6, c: 6 },
        { id: "adv-p", player: 1, r: 1, c: 9 }
      ],
      crowns: [{ r: 1, c: 9, carrierId: "adv-p", active: true }]
    },
    attendu(obs) {
      const adv = obs.gardiensAdverses.find(g => g.porte);
      if (!adv) return { ok: true, raison: "porteur adverse neutralisé" };
      return {
        ok: !adv.surCaseValidation,
        raison: adv.surCaseValidation
          ? `porteur adverse toujours en (${adv.r},${adv.c}), il validera`
          : `porteur adverse écarté en (${adv.r},${adv.c})`
      };
    }
  },

  {
    id: "A5",
    nom: "Réserve adverse permettant une poussée en force",
    /* L'adversaire dispose de 3 PUSH en réserve : une position tenable contre
       une poussée simple ne l'est plus contre une ligne poussée plus loin.
       L'IA doit tenir compte de la réserve visible, pas seulement de la
       distance. */
    spec: {
      seed: 305, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(2, 3) },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 2, 3, 5) }],
      characters: [
        { id: "ia-p", player: 0, r: 4, c: 2 },
        { id: "adv-1", player: 1, r: 6, c: 4 }
      ],
      crowns: [{ r: 4, c: 2, carrierId: "ia-p", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const menace = expulsablePar(obs, p, obs.gardiensAdverses, 2, 3);
      return {
        ok: !menace,
        raison: menace
          ? `porteur en (${p.r},${p.c}) expulsable via (${menace.poste})`
          : `porteur en (${p.r},${p.c}), hors d'atteinte`
      };
    }
  },

  {
    id: "A6",
    nom: "Ne pas exposer un gardien libre au bord du vide",
    /* Sans couronne en jeu de son côté, l'IA ne doit pas pour autant offrir un
       gardien : une pièce perdue est une action de moins à chaque tour suivant.
       Le scénario vérifie qu'aucun gardien ne finit expulsable gratuitement. */
    spec: {
      seed: 306, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(1, 1) },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 4, 3, 3) }],
      characters: [
        { id: "ia-1", player: 0, r: 5, c: 5 },
        { id: "adv-1", player: 1, r: 6, c: 6 }
      ],
      crowns: [{ r: 0, c: 0, active: true }]
    },
    attendu(obs) {
      const exposes = obs.gardiensIA.filter(g =>
        expulsablePar(obs, g, obs.gardiensAdverses, 1, 1));
      return {
        ok: exposes.length === 0,
        raison: exposes.length
          ? `${exposes.length} gardien(s) expulsable(s) : ${exposes.map(g => `(${g.r},${g.c})`).join(" ")}`
          : "aucun gardien exposé"
      };
    }
  },

  {
    id: "A7",
    nom: "Progression fragile contre position tenable",
    /* Deux progressions possibles vers le village : l'une avance davantage mais
       finit à portée d'une combinaison adverse, l'autre avance moins et tient.
       Une IA qui ne note que l'état de fin de tour choisit la première. */
    spec: {
      seed: 307, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(2, 1) },
      islands: [{ shapeKey: "square", owner: 0, cells: [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2], [4, 2]] }],
      characters: [
        { id: "ia-p", player: 0, r: 3, c: 2 },
        { id: "adv-1", player: 1, r: 4, c: 2 }
      ],
      crowns: [{ r: 3, c: 2, carrierId: "ia-p", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const menace = expulsablePar(obs, p, obs.gardiensAdverses, 2, 1);
      return {
        ok: !menace,
        raison: menace
          ? `porteur en (${p.r},${p.c}) expulsable via (${menace.poste})`
          : `porteur en (${p.r},${p.c}), tenable`
      };
    }
  },

  {
    id: "A8",
    nom: "Deux menaces, une seule parade",
    /* L'adversaire a deux gardiens capables d'atteindre le porteur. Se protéger
       de l'un en s'exposant à l'autre ne vaut rien : la case choisie doit tenir
       contre les deux. */
    spec: {
      seed: 308, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(1, 2) },
      islands: [{ shapeKey: "square", owner: 0, cells: bloc(4, 3, 3, 4) }],
      characters: [
        { id: "ia-p", player: 0, r: 5, c: 4 },
        { id: "adv-1", player: 1, r: 6, c: 6 },
        { id: "adv-2", player: 1, r: 6, c: 3 }
      ],
      crowns: [{ r: 5, c: 4, carrierId: "ia-p", active: true }]
    },
    attendu(obs) {
      const p = porteurDe(obs, 0);
      if (!p) return { ok: false, raison: "couronne perdue" };
      const menace = expulsablePar(obs, p, obs.gardiensAdverses, 2, 2);
      return {
        ok: !menace,
        raison: menace
          ? `porteur en (${p.r},${p.c}) expulsable par ${menace.ennemi} via (${menace.poste})`
          : `porteur en (${p.r},${p.c}), tient contre les deux gardiens`
      };
    }
  },
  {
    id: "A9",
    nom: "Empecher un point imminent",
    /* LE cas le plus important du jeu, signale en jouant : le porteur adverse
       est POSE sur une de ses cases de validation. Il marquera au DEBUT de son
       prochain tour — l IA a donc exactement un tour pour l en empecher, et
       c est sa derniere occasion.

       Elle dispose d un gardien a deux pas et de quoi le rejoindre puis le
       pousser hors du plateau. Rien d autre sur le plateau ne vaut un point.

       Reussite : l adversaire ne porte plus de couronne sur une case de
       validation a la fin du tour. */
    spec: {
      seed: 309, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "PUSH", "PUSH"], 1: [] },
      stash: { 1: RESERVE(0, 0) },
      islands: [
        { shapeKey: "square", owner: 1, cells: [[0, 9], [1, 9], [1, 10], [2, 9], [2, 10]] }
      ],
      characters: [
        { id: "adv-p", player: 1, r: 1, c: 10 },
        { id: "ia-1", player: 0, r: 2, c: 9 }
      ],
      crowns: [{ r: 1, c: 10, carrierId: "adv-p", active: true }]
    },
    attendu(obs) {
      const adv = obs.gardiensAdverses.find(g => g.porte);
      if (!adv) return { ok: true, raison: "porteur adverse neutralise" };
      return {
        ok: !adv.surCaseValidation,
        raison: adv.surCaseValidation
          ? `porteur adverse toujours en (${adv.r},${adv.c}) : il marque au prochain tour`
          : `porteur adverse ecarte en (${adv.r},${adv.c})`
      };
    }
  }
,
  {
    id: "A10",
    nom: "Defendre plutot que courir apres une couronne libre",
    /* Le cas realiste signale en jouant. Le porteur adverse est POSE sur une
       case de validation et marquera au debut de son prochain tour. Il n est
       PAS ejectable : la case derriere lui est du terrain. Le priver du point
       demande donc simplement de le DEPLACER hors de sa case, pas de le tuer.

       Et pendant ce temps une couronne libre traine ailleurs. Une IA dont les
       objectifs de deplacement visent les couronnes libres avant tout ira la
       chercher et laissera passer le point — un point vaut bien plus qu une
       couronne a ramasser.

       Reussite : l adversaire ne finit pas le tour porteur sur une case de
       validation. */
    spec: {
      seed: 310, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "PUSH", "PUSH"], 1: [] },
      stash: { 1: RESERVE(0, 0) },
      islands: [
        { shapeKey: "square", owner: 1, cells: [[0, 9], [1, 9], [1, 10], [2, 9], [2, 10], [3, 9], [3, 10]] },
        { shapeKey: "square", owner: 0, cells: [[5, 4], [5, 5], [5, 6], [6, 4], [6, 5], [6, 6]] }
      ],
      characters: [
        { id: "adv-p", player: 1, r: 1, c: 10 },
        { id: "ia-1", player: 0, r: 3, c: 10 }
      ],
      crowns: [
        { r: 1, c: 10, carrierId: "adv-p", active: true },
        { r: 5, c: 5, active: true }
      ]
    },
    attendu(obs) {
      const adv = obs.gardiensAdverses.find(g => g.porte);
      if (!adv) return { ok: true, raison: "porteur adverse neutralise" };
      return {
        ok: !adv.surCaseValidation,
        raison: adv.surCaseValidation
          ? `porteur adverse toujours en (${adv.r},${adv.c}) : le point est concede`
          : `porteur adverse ecarte en (${adv.r},${adv.c})`
      };
    }
  }
,
  {
    id: "A11",
    nom: "Se placer AVANT que le point ne devienne imminent",
    /* Le defaut signale en jouant : l IA sait ejecter un porteur pose sur une
       case de validation, mais elle n y est jamais a temps. Ici le porteur
       adverse est encore a deux pas de ses cases de validation — rien n est
       imminent, et une IA qui ne note que sa propre progression ne voit aucune
       raison de bouger vers le village adverse.

       Or occuper une des trois cases suffit a interdire le point : marquer
       exige que le porteur SOIT dessus, et une case occupee est inatteignable.
       L IA dispose d un gardien capable d en rejoindre une ce tour-ci.

       Reussite : un gardien de l IA occupe une case de validation adverse, ou
       le porteur adverse est neutralise. */
    spec: {
      seed: 311, islandPlacedThisTurn: true,
      hands: { 0: ["MOVE", "MOVE", "MOVE", "MOVE"], 1: [] },
      stash: { 1: RESERVE(0, 0) },
      islands: [
        { shapeKey: "square", owner: 1,
          cells: [[0, 9], [1, 9], [1, 10], [2, 9], [2, 10], [3, 9], [3, 10], [4, 9], [4, 10]] }
      ],
      characters: [
        { id: "adv-p", player: 1, r: 3, c: 10 },
        { id: "ia-1", player: 0, r: 4, c: 9 }
      ],
      crowns: [{ r: 3, c: 10, carrierId: "adv-p", active: true }]
    },
    attendu(obs) {
      const adv = obs.gardiensAdverses.find(g => g.porte);
      if (!adv) return { ok: true, raison: "porteur adverse neutralise" };
      const casesJ1 = obs.casesValidation[1] || [];
      const occupant = obs.gardiensIA.find(g =>
        casesJ1.some(([r, c]) => r === g.r && c === g.c));
      return {
        ok: !!occupant,
        raison: occupant
          ? `gardien IA en (${occupant.r},${occupant.c}) : case de validation adverse condamnee`
          : `aucun gardien IA sur les cases de validation adverses (gardiens en ${obs.gardiensIA.map(g => "(" + g.r + "," + g.c + ")").join(" ")})`
      };
    }
  }

];

module.exports = { SCENARIOS, expulsablePar, portee, bloc };
