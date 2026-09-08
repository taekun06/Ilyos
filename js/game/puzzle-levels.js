      /* =====================================================================
         PUZZLES — la collection

         Vingt-deux énigmes, de la leçon de poussée à l'archipel des neuf
         mensonges. Le moteur vit dans js/game/puzzle.js ; ce fragment ne
         contient que des données, et leur ORDRE est celui de la campagne :
         « Les Voies d'Ilyos » se joue de haut en bas de ce tableau, pas dans
         l'ordre des identifiants, qui ne dit plus que l'ancienneté.

         Chaque définition porte sa SOLUTION DE RÉFÉRENCE. Ce n'est pas de la
         documentation décorative : `ILYOS_PUZZLE.verify(i)` la rejoue sur un
         plateau neuf, refuse tout déplacement qui n'existe pas au sens de
         shortestMovementPath et toute force de poussée qui dépasse les cartes
         disponibles, puis vérifie que l'objectif tombe ET que le coût est
         exactement `par`. Une énigme dont la solution ne passe plus est une
         énigme cassée, et le test le dit.

         Conventions de terrain :
         - une case n'est de la TERRE que si une île la couvre, ou si c'est la
           case d'un village (villageAt). Tout le reste est le vide ;
         - `sanctuary: false` partout : la croix centrale de terre indestructible
           n'a aucun sens sur un plateau taillé pour une énigme, et elle
           invaliderait la moitié des rotations ;
         - les villages restent aux COINS, seuls endroits où
           cornerCrownCellsForVillage produit des cases cohérentes. Les énigmes
           sans village n'en déclarent aucun et visent un autre objectif ;
         - UNE ÎLE D'UNE SEULE CASE NE PIVOTE PAS. Son seul pivot possible est
           elle-même, et une rotation autour de son propre centre la laisse en
           place : elle est immobile par construction et ne transporte
           personne. C'est le moyen le plus simple de figer un terrain — et il
           est INVISIBLE, puisqu'une région découpée en îles d'une case
           ressemble à l'écran à une île entière. À préférer aux dégagements et
           aux collisions dès qu'on veut qu'un morceau de plateau ne bouge
           jamais ;
         - à l'inverse, toute île de plusieurs cases alignées est un VÉHICULE :
           pivotée par une extrémité elle se translate de sa longueur moins un,
           et emporte ce qui se tient dessus. Une île de trois projette donc une
           case à deux de distance, et une diagonale franchit un coin : il faut
           trois rangées de dégagement pour qu'aucune rotation ne relie deux
           régions censées rester séparées ;
         - aucun texte lu par le joueur ne cite de COORDONNÉES. Le jeu n'en
           affiche nulle part : un énoncé qui en donne est illisible. Les cases
           qui comptent sont marquées sur le plateau, déduites de `goal` et de
           `replies` par le moteur, et les textes n'y renvoient que par
           « la case marquée ».
         ===================================================================== */

      PUZZLES.push(
        /* -----------------------------------------------------------------
           01 — La poussée choisit sa force, et un rival dans ton village te
           verrouille. Le Gardien est enfermé derrière les deux rivaux : il ne
           peut RIEN faire d'autre que pousser, ce qui met la leçon au premier
           geste. Force 2 tue le premier rival mais dépose le second pile sur
           le coin du village ; il reste alors juste assez de cartes pour s'en
           sortir, et pas une de plus. */
        {
          id: "p01-seuil",
          acte: "PROLOGUE",
          title: "Le seuil gardé",
          tagline: "Deux rivaux, une seule ligne, et ton village derrière eux.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 11,
          sanctuary: false,
          focus: [1, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[0, 1], [1, 0], [2, 0], [3, 0]]
          ],
          guardians: [
            { key: "G", p: 0, r: 3, c: 0, crown: 1 },
            { p: 1, r: 2, c: 0 },
            { p: 1, r: 1, c: 0 }
          ],
          hand: { PUSH: 3, MOVE: 2, MAGIC: 1 },
          par: 5,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Le seuil est libre",
          winLine: "Une poussée assez longue les emporte tous les deux.",
          failLine: "Un rival campe encore sur ton village, et la main est vide.",
          solution: [
            { a: "PUSH", who: "G", on: [2, 0], force: 3 },
            { a: "MOVE", who: "G", to: [1, 0] }
          ]
        },
        /* -----------------------------------------------------------------
           02 — Le pivot. Une barre qui tourne autour de son EXTRÉMITÉ se
           translate de toute sa longueur et emmène son passager ; autour de son
           cœur, elle revient sur elle-même. C'est toute la différence entre
           franchir le gouffre et perdre sa seule carte Magie. */
        {
          id: "p02-pont",
          acte: "I",
          principe: "TRACE",
          title: "Le pont dérobé",
          tagline: "Le gouffre est trop large pour marcher. La barre, elle, tourne.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 11,
          sanctuary: false,
          focus: [3, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[0, 1], [1, 0]],
            { key: "B", cells: [[4, 0], [5, 0], [6, 0]] }
          ],
          guardians: [
            { key: "G", p: 0, r: 6, c: 0, crown: 1 },
            { p: 1, r: 1, c: 0 }
          ],
          hand: { MAGIC: 1, PUSH: 2, MOVE: 2 },
          par: 4,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "La barre s'est couchée",
          winLine: "Pivotée par son bout, elle t'a porté de l'autre côté.",
          failLine: "Sans la barre, le gouffre ne se franchit pas.",
          solution: [
            { a: "MAGIC", island: "B", pivot: [4, 0], turns: 2 },
            { a: "PUSH", who: "G", on: [1, 0], force: 2 },
            { a: "MOVE", who: "G", to: [1, 0] }
          ]
        },
        /* -----------------------------------------------------------------
           03 — La chaîne. Une pièce DÉTACHÉE du bloc plafonne la poussée juste
           avant elle : pousser fort dans une file trouée ne fait avancer d'une
           case que le morceau collé, et brûle autant de cartes que la force
           demandée. Il faut d'abord refermer le trou, puis pousser une fois. */
        {
          id: "p03-domino",
          acte: "I",
          principe: "MESURE",
          title: "La file",
          tagline: "Une file trouée avale les cartes sans rien déplacer.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 11,
          sanctuary: false,
          focus: [0, 3],
          villages: { 0: [[0, 0]] },
          islands: [
            [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 0]]
          ],
          guardians: [
            { key: "G", p: 0, r: 0, c: 5, crown: 1 },
            { p: 1, r: 0, c: 4 },
            { p: 1, r: 0, c: 3 },
            { p: 1, r: 0, c: 1 }
          ],
          hand: { PUSH: 5, MOVE: 4, MAGIC: 1 },
          par: 9,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Toute la file est tombée",
          winLine: "Refermer le trou d'abord : ensuite une seule poussée suffit.",
          failLine: "La file tient encore, et il ne reste rien pour la briser.",
          solution: [
            { a: "PUSH", who: "G", on: [0, 4], force: 1 },
            { a: "MOVE", who: "G", to: [0, 4] },
            { a: "PUSH", who: "G", on: [0, 3], force: 4 },
            { a: "MOVE", who: "G", to: [0, 1] }
          ]
        },
        /* -----------------------------------------------------------------
           04 — Le budget. Marcher jusqu'à la barre coûte trois cartes, et la
           barre ne sert qu'au Gardien qui se tient DESSUS : pivoter avant
           d'avoir marché laisse le porteur sur une corniche sans issue. Le
           dernier rival, lui, ne se déloge que depuis la case du village. */
        {
          id: "p04-main-serree",
          acte: "I",
          principe: "MESURE",
          verite: "Ce qui est dépensé trop tôt manque toujours au dernier instant.",
          title: "Main serrée",
          tagline: "Sept cartes, six coups justes. L'ordre décide de tout.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 13,
          sanctuary: false,
          focus: [2, 1],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0]],
            { key: "B", cells: [[2, 1], [3, 1], [4, 1]] },
            [[4, 2], [4, 3], [4, 4]]
          ],
          guardians: [
            { key: "G", p: 0, r: 4, c: 4, crown: 1 },
            { p: 1, r: 1, c: 0 }
          ],
          hand: { MOVE: 4, MAGIC: 1, PUSH: 2 },
          par: 6,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Six coups, pas un de plus",
          winLine: "Marcher d'abord, pivoter ensuite : la barre ne porte que son passager.",
          failLine: "La barre a tourné sans toi.",
          solution: [
            { a: "MOVE", who: "G", to: [4, 1] },
            { a: "MAGIC", island: "B", pivot: [2, 1], turns: 2 },
            { a: "MOVE", who: "G", to: [0, 0] },
            { a: "PUSH", who: "G", on: [1, 0], force: 1 }
          ]
        },
        /* -----------------------------------------------------------------
           05 — Tout à la fois : une chaîne à éjecter par le bord de la
           corniche, une barre-navette pour franchir le gouffre, un dernier
           rival à décrocher du village. Les quatre cartes MOVE de la marche
           sont comptées au plus juste. */
        {
          id: "p05-longue-marche",
          acte: "I",
          principe: "MESURE",
          title: "La longue marche",
          tagline: "Éjecter, traverser, déloger. Onze cartes exactement utiles.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 13,
          sanctuary: false,
          focus: [4, 2],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0]],
            { key: "B", cells: [[3, 1], [4, 1], [5, 1]] },
            [[5, 2], [5, 3], [5, 4], [5, 5]]
          ],
          guardians: [
            { key: "G", p: 0, r: 5, c: 5, crown: 1 },
            { p: 1, r: 5, c: 4 },
            { p: 1, r: 5, c: 3 },
            { p: 1, r: 1, c: 0 }
          ],
          hand: { PUSH: 6, MOVE: 5, MAGIC: 1 },
          par: 11,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "La marche est finie",
          winLine: "La corniche s'arrête à la barre : au-delà, il n'y a que le ciel.",
          failLine: "Le chemin est ouvert, mais il ne reste plus de quoi le prendre.",
          solution: [
            { a: "PUSH", who: "G", on: [5, 4], force: 4 },
            { a: "MOVE", who: "G", to: [5, 1] },
            { a: "MAGIC", island: "B", pivot: [3, 1], turns: 2 },
            { a: "PUSH", who: "G", on: [1, 0], force: 1 },
            { a: "MOVE", who: "G", to: [1, 0] }
          ]
        },
        /* -----------------------------------------------------------------
           06 — La règle que rien n'a encore montrée : une couronne ne tombe
           JAMAIS. Elle survole le vide et se pose sur sa case d'arrivée. Aucun
           Gardien ne franchira ce gouffre — mais la couronne, si. Encore
           faut-il la faire lâcher, et ne laisser personne sur sa case
           d'atterrissage. */
        {
          id: "p06-couronne-vole",
          acte: "II",
          principe: "TRACE",
          avant: "Quelqu'un attend déjà sur l'autre rive.",
          verite: "La lumière atteint les terres que nul Gardien ne peut fouler.",
          title: "La couronne qui vole",
          tagline: "Personne ne traversera. La couronne, elle, ne tombe jamais.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 13,
          sanctuary: false,
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0], [2, 0], [3, 0]],
            [[7, 0], [8, 0], [9, 0]],
            [[0, 1]]
          ],
          guardians: [
            { key: "A", p: 0, r: 8, c: 0, crown: 1 },
            { key: "C", p: 0, r: 3, c: 0 },
            { p: 1, r: 0, c: 1 }
          ],
          /* Aucune carte MAGIE. Ce n'est pas un interdit : une barre de trois
             cases translate ses passagers de deux cases par rotation, et le
             chercheur d'optimum a montré qu'avec une seule MAGIE on faisait
             pivoter la corniche pour rétrécir le gouffre — la couronne n'avait
             alors plus rien à franchir. Sans cette carte, le vide reste du
             vide. */
          hand: { PUSH: 6, MOVE: 4 },
          par: 8,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Elle a franchi le vide",
          winLine: "Une couronne ne tombe jamais : elle survole et se pose.",
          failLine: "La couronne est du mauvais côté du gouffre.",
          solution: [
            { a: "MOVE", who: "C", to: [2, 0] },
            { a: "DROP", who: "A", on: [7, 0] },
            { a: "PUSH", who: "A", on: [7, 0], force: 4 },
            { a: "PICKUP", who: "C", on: [3, 0] },
            { a: "MOVE", who: "C", to: [0, 0] },
            { a: "PUSH", who: "C", on: [0, 1], force: 1 }
          ]
        },
        /* -----------------------------------------------------------------
           18 — LES ACTIONS GRATUITES. Déposer, ramasser, transmettre ne coûtent
           rien : ce sont les trois gestes que la collection n'avait jamais
           obligé personne à voir, et dont l'oubli a faussé six barèmes. Ici le
           gouffre interdit de porter la couronne, et un Gardien ne peut pas
           voler : il faut la POSER, la POUSSER par-dessus le vide — une
           couronne ne tombe jamais, elle atterrit sur la dernière terre à
           portée — puis la faire RAMASSER par qui attend de l'autre côté. Le
           Veilleur assis sur le Sanctuaire bloque la validation tant qu'il y
           reste ; le déloger coûte la dernière carte de poussée. */
        {
          id: "p18-relais-des-mains",
          acte: "II",
          principe: "TRACE",
          title: "Le relais des mains",
          tagline: "Le gouffre ne se marche pas. La couronne, elle, se lance.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 11,
          sanctuary: false,
          focus: [4, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[0, 1]], [[1, 0]],
            [[2, 0]], [[3, 0]], [[5, 0]], [[6, 0]], [[7, 0]], [[8, 0]], [[6, 1]]
          ],
          guardians: [
            { key: "G", p: 0, r: 8, c: 0, crown: 1 },
            { key: "A", p: 0, r: 6, c: 1 },
            { key: "B", p: 0, r: 0, c: 0 },
            { p: 1, r: 0, c: 1 }
          ],
          hand: { MOVE: 3, PUSH: 5 },
          par: 6,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Les mains se sont passé la lumière",
          winLine: "Poser, lancer, ramasser : trois gestes qui ne coûtent rien, et une seule poussée qui compte.",
          failLine: "La couronne est restée du mauvais côté du vide.",
          solution: [
            { a: "DROP", who: "G", on: [7, 0] },
            { a: "MOVE", who: "A", to: [6, 0] },
            { a: "PICKUP", who: "A", on: [7, 0] },
            { a: "DROP", who: "A", on: [5, 0] },
            { a: "PUSH", who: "A", on: [5, 0], force: 4 },
            { a: "PUSH", who: "B", on: [0, 1], force: 1 },
            { a: "PICKUP", who: "B", on: [1, 0] }
          ]
        },
        /* -----------------------------------------------------------------
           09 — Deux couronnes, deux transports différents. L'une survole le
           gouffre ; l'autre ne bouge pas d'un pouce et se laisse EMPORTER par
           l'île qui pivote sous elle — une rotation déplace les couronnes au
           sol comme elle déplace les Gardiens. Et l'ordre compte : occuper la
           case d'arrivée avant le vol condamne le vol. */
        {
          id: "p09-fardeau",
          acte: "II",
          principe: "TRACE",
          title: "Le fardeau",
          tagline: "Deux couronnes, deux façons de voyager. Aucune ne marche.",
          brief: "Pose une couronne sur la case marquée d'or, et tiens l'autre en main sur la case bleue.",
          board: 11,
          sanctuary: false,
          islands: [
            { key: "B", cells: [[3, 5], [4, 5], [5, 5]] },
            [[6, 5], [7, 5]],
            [[9, 5], [9, 6]]
          ],
          crowns: [
            { slot: 1, r: 5, c: 5 },
            { slot: 2, r: 7, c: 5 }
          ],
          guardians: [
            { key: "G1", p: 0, r: 6, c: 5 },
            { key: "G2", p: 0, r: 9, c: 6 }
          ],
          hand: { PUSH: 4, MOVE: 2, MAGIC: 1 },
          par: 4,
          goal: {
            type: "all",
            goals: [
              { type: "crownAtCell", cell: [1, 5] },
              { type: "carryToCell", player: 0, cell: [9, 5] }
            ]
          },
          winTitle: "Les deux fardeaux sont posés",
          winLine: "L'île qui tourne emporte ce qui dort sur elle.",
          failLine: "Une couronne est restée en chemin.",
          solution: [
            { a: "PUSH", who: "G1", on: [7, 5], force: 2 },
            { a: "MOVE", who: "G2", to: [9, 5] },
            { a: "MAGIC", island: "B", pivot: [3, 5], turns: 2 }
          ]
        },
        /* -----------------------------------------------------------------
           08 — Une rotation de 90° change une rangée en colonne ET emmène tous
           ceux qui se tiennent dessus. L'énigme n'est pas la rotation : c'est
           l'ESPACEMENT à donner aux passagers AVANT de tourner, sachant qu'une
           poussée trop forte jette son propre Gardien de tête dans le vide. */
        {
          id: "p08-ronde",
          acte: "II",
          principe: "TRACE",
          title: "La ronde",
          tagline: "Trois passagers, une rotation. Reste à bien les asseoir.",
          brief: "Place un Gardien sur chacune des trois cases marquées.",
          board: 11,
          sanctuary: false,
          islands: [
            { key: "A", cells: [[4, 4], [4, 5], [4, 6], [4, 7], [4, 8]] }
          ],
          guardians: [
            { key: "G1", p: 0, r: 4, c: 4 },
            { key: "G2", p: 0, r: 4, c: 5 },
            { key: "G3", p: 0, r: 4, c: 6 },
            { p: 1, r: 4, c: 7 }
          ],
          hand: { PUSH: 3, MAGIC: 1, MOVE: 1 },
          par: 3,
          goal: { type: "occupyCells", player: 0, cells: [[4, 4], [7, 4], [8, 4]] },
          winTitle: "La rangée est devenue colonne",
          winLine: "Un quart de tour emporte ses passagers là où ils étaient assis.",
          failLine: "Mal assis, mal portés.",
          solution: [
            { a: "PUSH", who: "G1", on: [4, 5], force: 2 },
            { a: "MAGIC", island: "A", pivot: [4, 4], turns: 1, direction: 1 }
          ]
        },
        /* -----------------------------------------------------------------
           19 — LA DIAGONALE. Elle existe, elle franchit un coin, et elle coûte
           DEUX. C'est-à-dire exactement ce que coûtent les deux pas droits
           qu'elle remplace : une diagonale n'est jamais un raccourci, c'est un
           PASSAGE — elle ne sert que là où les deux cases droites sont du vide.
           Le couloir grand ouvert vers l'ouest ne mène nulle part ; l'escalier
           qui monte en biais est la seule route, et il n'y a pas de quoi le
           gravir en entier. Reste la barre, qui ne se couche pas là où on
           l'attend : pivotée par son autre bout, elle emmène son passager
           jusqu'au pied de l'escalier. */
        {
          id: "p19-la-corde-oblique",
          acte: "II",
          principe: "TRACE",
          title: "La corde oblique",
          tagline: "Un couloir large qui ne mène nulle part, un escalier de biais qu'on ne peut pas gravir.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 11,
          sanctuary: false,
          focus: [4, 2],
          villages: { 0: [[0, 0]] },
          islands: [
            { key: "B", cells: [[6, 3], [6, 4], [6, 5]] },
            [[6, 2]], [[6, 1]], [[6, 0]], [[5, 0]],
            [[3, 2]], [[2, 1]], [[2, 0]], [[1, 0]]
          ],
          guardians: [
            { key: "G", p: 0, r: 6, c: 5, crown: 1 }
          ],
          hand: { MOVE: 6, MAGIC: 1, PUSH: 3 },
          par: 7,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "La corde s'est tendue",
          winLine: "Deux cases par pas de biais : l'escalier ne pardonne pas un détour.",
          failLine: "L'escalier est encore au-dessus de toi.",
          solution: [
            { a: "MAGIC", island: "B", pivot: [6, 3], turns: 1, direction: -1 },
            { a: "MOVE", who: "G", to: [3, 2] },
            { a: "MOVE", who: "G", to: [2, 1] },
            { a: "MOVE", who: "G", to: [1, 0] }
          ]
        },
        /* -----------------------------------------------------------------
           10 — La navette. Une seule île, un seul Gardien, aucun rival. Une
           barre pivotée par son extrémité se translate de toute sa longueur et
           emmène son passager — à condition qu'il se tienne à l'AUTRE bout. Le
           passager doit donc redescendre la barre entre deux rotations, et un
           quart de tour, au bon moment, fait tourner le couloir. */
        {
          id: "p10-escalier",
          acte: "II",
          principe: "TRACE",
          verite: "Ce mécanisme n'a pas été bâti pour relier. Il a été bâti pour faire passer un seul voyageur.",
          title: "L'escalier",
          tagline: "Une barre, quatre rotations, et un passager qui doit courir.",
          brief: "Amène ton Gardien sur la case marquée.",
          board: 13,
          sanctuary: false,
          islands: [
            { key: "F", cells: [[6, 2], [6, 3], [6, 4]] }
          ],
          guardians: [
            { key: "G", p: 0, r: 6, c: 2 }
          ],
          hand: { MAGIC: 4, MOVE: 7 },
          /* Optimum PROUVÉ par ILYOS_PUZZLE.solve : six cartes, pas dix. Les
             rotations s'enchaînent sans les allers-retours à pied que la
             conception croyait obligatoires — un quart de tour bien choisi
             replace le passager du bon côté du pivot suivant. La navette reste
             la seule route ; seule la « taxe de marche » était imaginaire. */
          par: 6,
          goal: { type: "reachCell", player: 0, cell: [10, 8] },
          winTitle: "La barre t'a porté jusqu'au bout",
          winLine: "Toujours à l'autre bout du pivot : c'est la seule place qui avance.",
          failLine: "La barre a tourné sans t'emmener.",
          solution: [
            { a: "MAGIC", island: "F", pivot: [6, 4], turns: 1, direction: -1 },
            { a: "MAGIC", island: "F", pivot: [8, 4], turns: 1, direction: 1 },
            { a: "MAGIC", island: "F", pivot: [8, 6], turns: 1, direction: -1 },
            { a: "MAGIC", island: "F", pivot: [10, 6], turns: 1, direction: 1 },
            { a: "MOVE", who: "G", to: [10, 8] }
          ]
        },
        /* -----------------------------------------------------------------
           07 — Ni village, ni couronne, ni sanctuaire : une corniche nue et
           quatre rivaux. Le premier bloc est plafonné par un rival détaché
           qu'on ne voit pas comme un obstacle ; une poussée à pleine force n'y
           gagnerait qu'une case et viderait la main. Il faut souder la file
           d'une carte, puis l'éjecter d'un seul geste. */
        {
          id: "p07-vide-allie",
          acte: "II",
          principe: "MESURE",
          avant: "Il n'y a rien à rallumer ici.",
          verite: "Le sceau du Sanctuaire est celui de ceux qui le gardaient.",
          title: "Le vide pour seul allié",
          tagline: "Quatre rivaux, aucune couronne. La corniche fera le reste.",
          brief: "Fais tomber les quatre rivaux hors du plateau.",
          board: 11,
          sanctuary: false,
          islands: [
            [[5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7]]
          ],
          guardians: [
            { key: "G", p: 0, r: 5, c: 7 },
            { p: 1, r: 5, c: 6 },
            { p: 1, r: 5, c: 5 },
            { p: 1, r: 5, c: 3 },
            { p: 1, r: 5, c: 2 }
          ],
          hand: { PUSH: 7, MOVE: 2 },
          par: 7,
          goal: { type: "eliminateAll" },
          winTitle: "La corniche est nue",
          winLine: "Une pièce détachée arrête un bloc. Colle-la d'abord, pousse ensuite.",
          failLine: "Il en reste debout, et la main est vide.",
          solution: [
            { a: "PUSH", who: "G", on: [5, 6], force: 1 },
            { a: "MOVE", who: "G", to: [5, 6] },
            { a: "PUSH", who: "G", on: [5, 5], force: 5 }
          ]
        },
        /* -----------------------------------------------------------------
           11 — Tout, sans marge. Douze cartes pour douze cartes de solution.
           Le porteur ne franchira jamais le gouffre : il faut le SACRIFIER
           pour que sa couronne tombe au bord, l'envoyer voler seule jusqu'à
           l'autre rive, y amener le second Gardien par deux tours de navette,
           lui faire ramasser la couronne, puis décrocher le rival campé sur la
           dernière case du village. Une seule carte gaspillée et l'énigme est
           perdue. */
        {
          id: "p11-dernier-souffle",
          acte: "III",
          principe: "TRACE",
          verite: "Certaines lumières ne passent que de main morte.",
          title: "Le dernier souffle",
          tagline: "Il est seul sur son rocher, et il ne peut rien poser.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 13,
          sanctuary: false,
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0], [2, 0]],
            [[7, 0]],
            [[8, 0]],
            [[0, 1]]
          ],
          guardians: [
            { key: "A", p: 0, r: 7, c: 0, crown: 1 },
            { key: "B", p: 0, r: 8, c: 0 },
            { key: "C", p: 0, r: 1, c: 0 },
            { p: 1, r: 0, c: 1 }
          ],
          /* Poser une couronne est GRATUIT : un sacrifice n'est donc jamais
             nécessaire… sauf si le porteur n'a aucune case libre où poser. A
             est seul sur son rocher — le vide de trois côtés, B sur le
             quatrième — donc il ne peut ni marcher, ni poser. Sa couronne ne
             touchera le sol que s'il tombe. C'est la géométrie qui force le
             sacrifice, aucune règle. */
          hand: { PUSH: 8, MOVE: 3 },
          par: 8,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Le dernier souffle",
          winLine: "Il a fallu en perdre un pour que la couronne arrive.",
          failLine: "La couronne est restée entre ses mains, de l'autre côté du vide.",
          solution: [
            { a: "PUSH", who: "B", on: [7, 0], force: 1 },
            { a: "PUSH", who: "B", on: [7, 0], force: 5 },
            { a: "PICKUP", who: "C", on: [2, 0] },
            { a: "MOVE", who: "C", to: [0, 0] },
            { a: "PUSH", who: "C", on: [0, 1], force: 1 }
          ]
        },
        /* -----------------------------------------------------------------
           12 — Le rival annonce qu'il ira sur (1,0), une des trois cases du
           village. Le réflexe est de l'en déloger une fois assis ; la vraie
           réponse est de lui prendre la place d'avance, avec le Gardien qui ne
           porte rien. Cinq cartes suffisent alors, six si on le laisse
           s'installer. */
        {
          id: "p12-squatteur",
          acte: "III",
          principe: "CADENCE",
          verite: "Toute action possède son instant.",
          title: "La place prise",
          tagline: "Il annonce où il va s'asseoir. Assieds-toi, puis ne fais plus rien.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 11,
          sanctuary: false,
          focus: [1, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0], [2, 0], [3, 0]],
            [[0, 1]],
            [[1, 1]]
          ],
          guardians: [
            { key: "G", p: 0, r: 2, c: 0, crown: 1 },
            { key: "G2", p: 0, r: 3, c: 0 },
            { key: "R1", p: 1, r: 1, c: 1 },
            { key: "R2", p: 1, r: 0, c: 1 }
          ],
          deck: [
            ["MOVE", "MOVE", "PUSH", "MOVE", "MOVE"],
            ["MOVE", "PUSH", "MOVE", "PUSH", "MOVE"]
          ],
          /* Optimum réel : 3, et c'est un vrai coup de TEMPO — le premier de
             la collection. On monte d'une case sur le siège du rival, puis on
             TERMINE SON TOUR avec des cartes en main. Le rival ne peut plus
             s'y asseoir, sa case est prise ; son coup est simplement sauté. Il
             ne reste qu'à monter et pousser le second.

             Ni l'abattre (quatre cartes) ni foncer au village (le rival prend
             le siège derrière soi) ne valent ce simple arrêt. Le bon coup est
             de ne rien jouer de plus. */
          par: 3,
          rivalPlan: ["il se poste sur la case marquée — une case de ton village."],
          replies: [
            [{ a: "MOVE", who: "R1", to: [1, 0] }]
          ],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La place était prise",
          winLine: "Prendre la place ne coûte rien. Le bon coup était de s'arrêter là.",
          failLine: "Il s'est installé sur ton village, et tu n'as plus de quoi l'en sortir.",
          solution: [
            [
              { a: "MOVE", who: "G", to: [1, 0] }
            ],
            [
              { a: "MOVE", who: "G", to: [0, 0] },
              { a: "PUSH", who: "G", on: [0, 1], force: 1 }
            ]
          ]
        },
        /* -----------------------------------------------------------------
           LA DESCENTE — le bon coup ne va pas vers l'objectif.

           Refonte complète. L'ancienne version promettait que « le plus court
           chemin passe par lui » : c'était faux, le Veilleur descendait la
           colonne d'à côté et on le délogeait au passage pour une carte, sans
           y penser. Il n'y avait pas d'énigme.

           Ici il ne peut PAS être poussé — le paquet ne contient aucune carte
           POUSSER, et rien d'autre ne l'atteint. Sa route est écrite et se
           termine sur une case du village, ce qui interdit toute validation.
           La seule parade est d'envoyer le SECOND Gardien se poster sur la case
           qu'il doit traverser : un coup annoncé devient illégal quand la case
           est prise, et il reste planté là pour le reste de l'énigme.

           Ce geste s'éloigne de la couronne et ne rapporte rien sur le moment.
           C'est tout le sujet. Et il ne souffre aucun retard : la case doit
           être prise avant sa première riposte, donc dès le premier tour, sur
           des cartes que le porteur réclame. Aller au Sanctuaire en ligne
           droite réussit jusqu'au troisième tour, où l'on découvre que la place
           est tenue et qu'il ne reste rien pour s'en occuper. */
        {
          id: "p14-course",
          acte: "III",
          principe: "CADENCE",
          title: "La descente",
          tagline: "Il descend vers ton Sanctuaire, et rien ne peut le toucher.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 13,
          sanctuary: false,
          focus: [3, 1],
          villages: { 0: [[0, 0]] },
          /* La colonne du porteur et la voie du Veilleur ne se touchent NULLE
             PART : une colonne de vide les sépare, et le seul lien entre les
             deux est la diagonale qui joint la dernière case de la voie à la
             place du Sanctuaire. Cette case est donc un vrai point de passage
             obligé — sans quoi le blocage ne vaut rien, car une riposte annonce
             une DESTINATION et le moteur lui cherche un chemin : la première
             version offrait un détour, et le Veilleur passait tranquillement à
             côté du Gardien posté. */
          islands: [
            [[0, 1]], [[1, 0]], [[2, 0]], [[3, 0]], [[4, 0]], [[5, 0]],
            [[6, 0]], [[7, 0]], [[8, 0]],
            [[1, 2]], [[2, 2]], [[1, 3]]
          ],
          guardians: [
            { key: "G", p: 0, r: 8, c: 0, crown: 1 },
            { key: "H", p: 0, r: 1, c: 3 },
            { key: "R", p: 1, r: 2, c: 2 }
          ],
          /* Une carte de marge au second tour, pas zéro : une main vidée à la
             dernière carte empêche le tour suivant de commencer, et la couronne
             ne compte QU'AU DÉBUT du tour suivant. Sans cette carte, l'énigme
             se jouait juste et ne se gagnait jamais. */
          deck: [
            ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"],
            ["MOVE", "MOVE", "MOVE", "MOVE"]
          ],
          par: 8,
          rivalPlan: [
            "le Veilleur monte d'une case.",
            "puis il se pose sur la place du Sanctuaire."
          ],
          replies: [
            [{ a: "MOVE", who: "R", to: [1, 2] }],
            [{ a: "MOVE", who: "R", to: [0, 1] }]
          ],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La descente s'est arrêtée",
          winLine: "Une case prise à temps vaut mieux qu'une poussée qu'on n'a pas.",
          failLine: "Il s'est assis sur la place, et rien ne l'en délogera.",
          solution: [
            [
              { a: "MOVE", who: "H", to: [1, 2] },
              { a: "MOVE", who: "G", to: [4, 0] }
            ],
            [
              { a: "MOVE", who: "G", to: [1, 0] }
            ]
          ]
        },
        /* -----------------------------------------------------------------
           13 — Le rival annonce qu'il va se poster sur la SEULE case où la
           couronne peut se poser, et une couronne en vol ne se pose pas sur une
           case occupée. Le paquet du tour 1 ne contient qu'une carte POUSSER :
           impossible d'y lancer le vol, ce tour est fait pour nettoyer la rive
           — puis s'en écarter, sinon c'est ton propre Gardien qui l'encombre. */
        {
          id: "p13-intercepteur",
          acte: "III",
          principe: "CADENCE",
          verite: "Ils connaissent les Voies mieux que toi.",
          title: "L'intercepteur",
          tagline: "Il va se poster là où ta couronne doit atterrir.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 13,
          sanctuary: false,
          focus: [4, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0], [2, 0], [3, 0]],
            [[3, 1]],
            [[7, 0], [8, 0]]
          ],
          guardians: [
            { key: "A", p: 0, r: 7, c: 0, crown: 1 },
            { key: "B", p: 0, r: 8, c: 0 },
            { key: "C", p: 0, r: 1, c: 0 },
            { key: "R", p: 1, r: 3, c: 1 }
          ],
          deck: [
            ["MOVE", "MOVE", "PUSH", "MOVE", "MOVE"],
            ["PUSH", "PUSH", "PUSH", "PUSH", "PUSH"],
            ["MOVE", "MOVE", "MOVE", "PUSH"]
          ],
          /* Optimum réel : 8. La première solution de référence en dépensait
             douze — elle envoyait le receveur MARCHER jusqu'au rival puis
             revenir, alors qu'il suffit de descendre d'une case pour le
             pousser. Le chercheur, lui, annonce 6 : sa relaxation ignore le
             tour adverse, or le rival vient se placer sur la trajectoire et
             une pièce en travers PLAFONNE la poussée — le vol s'effondre à
             trois cases, qui sont du vide, et le moteur le refuse. */
          par: 8,
          rivalPlan: ["il se poste sur la case marquée, la seule où ta couronne peut se poser."],
          replies: [
            [{ a: "MOVE", who: "R", to: [3, 0] }]
          ],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La rive était libre",
          winLine: "Nettoyer la case d'arrivée, puis s'en écarter : un vol ne pardonne pas l'encombrement.",
          failLine: "La couronne n'avait nulle part où se poser.",
          solution: [
            [
              { a: "PUSH", who: "B", on: [7, 0], force: 1 }
            ],
            [
              { a: "MOVE", who: "C", to: [2, 0] },
              { a: "PUSH", who: "C", on: [3, 0], force: 1 },
              { a: "PUSH", who: "B", on: [7, 0], force: 4 },
              { a: "PICKUP", who: "C", on: [3, 0] }
            ],
            [
              { a: "MOVE", who: "C", to: [1, 0] }
            ]
          ]
        },
        /* -----------------------------------------------------------------
           LA RELÈVE — libérer une place ne suffit pas, il faut s'y tenir.

           Refonte. La première version ne pouvait pas fonctionner : le second
           Veilleur était programmé pour prendre la place au troisième tour,
           alors que la couronne comptait au début de ce même tour. La relève
           n'arrivait jamais, et la leçon ne se jouait pas.

           Elle arrive maintenant à la riposte SUIVANTE. Et comme un Veilleur
           sur n'importe laquelle des trois cases du village interdit toute
           validation, rester sur la case voisine — pourtant valide elle aussi —
           ne sert à rien : il faut occuper précisément celle qu'on vient de
           vider. Le paquet est calculé pour que ce pas de côté soit la
           dernière carte, et pour qu'il ne reste rien après. */
        {
          id: "p21-la-releve",
          acte: "III",
          principe: "CADENCE",
          verite: "On ne délivre pas une place. On la tient.",
          title: "La relève",
          tagline: "Tu peux le chasser. Un autre attend déjà son tour.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 13,
          sanctuary: false,
          focus: [2, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[0, 1]], [[1, 0]], [[2, 0]], [[3, 0]], [[4, 0]], [[5, 0]], [[6, 0]],
            [[1, 1]]
          ],
          guardians: [
            { key: "G", p: 0, r: 6, c: 0, crown: 1 },
            { key: "R", p: 1, r: 0, c: 1 },
            { key: "S", p: 1, r: 1, c: 1 }
          ],
          deck: [
            ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"],
            ["MOVE", "MOVE", "PUSH", "MOVE", "MOVE"]
          ],
          par: 8,
          rivalPlan: [
            "le second Veilleur attend son tour.",
            "il prend la place laissée vide."
          ],
          replies: [
            [],
            [{ a: "MOVE", who: "S", to: [0, 1] }]
          ],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La place est tenue",
          winLine: "La case voisine valide aussi. Elle ne défend rien.",
          failLine: "La relève a eu lieu, et la couronne n'a rien valu.",
          solution: [
            [
              { a: "MOVE", who: "G", to: [1, 0] }
            ],
            [
              { a: "MOVE", who: "G", to: [0, 0] },
              { a: "PUSH", who: "G", on: [0, 1], force: 1 },
              { a: "MOVE", who: "G", to: [0, 1] }
            ]
          ]
        },
        /* -----------------------------------------------------------------
           15 — Le relais du vide.

           Trois Gardiens, deux terres, un gouffre entre elles. Aucun ne
           traversera : c'est la COURONNE qui voyage, parce qu'elle seule ne
           tombe pas. Encore faut-il la déposer au bord avant de la pousser,
           et trouver la force juste — 1 et 2 ne rencontrent que du vide, le
           moteur refuse alors la poussée sans rien dépenser.

           Et à l'arrivée, le village ne s'allume pas : un rival campe sur
           l'une de ses trois cases. Il n'a pas besoin de tomber, seulement
           de s'écarter. */
        {
          id: "p15-relais-du-vide",
          acte: "III",
          principe: "MESURE",
          verite: "Le chemin le plus proche n'est pas toujours le chemin le plus court.",
          title: "Le relais du vide",
          tagline: "Aucun Gardien ne traversera. La lumière, elle, peut voyager.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 11,
          sanctuary: false,
          villages: { 0: [[10, 10]] },
          islands: [
            [[3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [8, 7]],
            [[8, 10], [9, 10], [10, 10], [10, 9], [10, 8]]
          ],
          crowns: [{ slot: 1, r: 3, c: 6 }],
          guardians: [
            { key: "A", p: 0, r: 4, c: 6 },
            { key: "B", p: 0, r: 8, c: 6 },
            { key: "C", p: 0, r: 9, c: 10 },
            { key: "R", p: 1, r: 10, c: 9 }
          ],
          /* A commence collé à la couronne : il la ramasse sans dépenser une
             carte. B, lui, devrait descendre toute l'échine puis la remonter —
             la même besogne lui coûte trois fois plus. Et A ne peut pas finir
             le travail seul : la seule case d'où l'on pose sur (8,7) est celle
             que B occupe. La transmission n'est donc pas un ornement, c'est le
             seul pont entre les deux moitiés de la solution. */
          deck: [
            ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"],
            ["PUSH", "PUSH", "PUSH", "PUSH", "PUSH"],
            ["MOVE", "MOVE", "PUSH"]
          ],
          par: 7,
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "Le relais est passé",
          winLine: "Une couronne se pousse aussi sur la terre ferme — et le premier tour ne servait à rien.",
          failLine: "La couronne est restée du mauvais côté du gouffre.",
          /* L'optimum prouvé n'est pas celui qu'on avait en tête, et il est
             meilleur : plutôt que de PORTER la couronne le long de l'échine, A
             la pose et la POUSSE — deux cartes au lieu de trois pas. Le premier
             tour ne sert alors qu'au ramassage, qui est gratuit : on le termine
             sans avoir rien dépensé, et les cinq DÉPLACER non joués passent en
             réserve. Terminer un tour les mains vides est ici le bon coup. */
          solution: [
            [
              { a: "PICKUP", who: "A", on: [3, 6] }
            ],
            [
              { a: "DROP", who: "A", on: [5, 6] },
              { a: "PUSH", who: "A", on: [5, 6], force: 2 },
              { a: "PICKUP", who: "B", on: [7, 6] },
              { a: "DROP", who: "B", on: [8, 7] },
              { a: "PUSH", who: "B", on: [8, 7], force: 3 }
            ],
            [
              { a: "PICKUP", who: "C", on: [8, 10] },
              { a: "MOVE", who: "C", to: [10, 10] },
              { a: "PUSH", who: "C", on: [10, 9], force: 1 }
            ]
          ]
        },
        /* -----------------------------------------------------------------
           16 — La charnière des cieux.

           L'épreuve jumelle de la précédente, et son exact contraire : ici la
           couronne ne quitte jamais son porteur, c'est le MONDE qui bouge.

           Deux rotations, deux usages opposés de la même carte. La première
           prend la passerelle par son extrémité haute : elle se translate de
           toute sa longueur et emporte son passager quatre lignes plus loin,
           sans dépenser un seul déplacement. La seconde prend le bras par la
           case OÙ SE TIENT le Gardien : il ne bouge pas d'un pouce, mais le
           chemin, lui, se dresse et va chercher la terrasse.

           Déplacer le voyageur, ou déplacer la route. */
        {
          id: "p16-charniere",
          acte: "III",
          principe: "TRACE",
          verite: "Les îles ne portent pas les chemins. Elles sont les chemins.",
          title: "La charnière des cieux",
          tagline: "Une passerelle qui marche, et le bord du monde au bout.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 11,
          sanctuary: false,
          /* Cadrage imposé : le terrain pèse vers le haut (deux rangées
             pleines), et le centre de gravité calculé laissait le Gardien de
             départ sous la barre d'action. */
          focus: [5, 2],
          villages: { 0: [[0, 0]] },
          islands: [
            /* Départ en Z. Aucune conséquence de règle : il brouille la
               lecture, là où un îlot d'une seule case annonçait trop clairement
               qu'on n'y ferait rien. */
            { key: "DEPART", cells: [[8, 2], [8, 3], [9, 1], [9, 2]] },
            { key: "PASSERELLE", cells: [[5, 2], [6, 2], [7, 2]] },
            { key: "BRAS", cells: [[3, 3], [3, 4], [3, 5]] },
            { key: "TERRASSE", cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
            { key: "PERCHOIR", cells: [[0, 1], [0, 2]] },
            /* LE VERROU, en colonne 0. Deux cases qui font trois choses à la
               fois, et c'est pour ça qu'elles sont là plutôt qu'ailleurs :

               - elles INTERDISENT à la terrasse de se coucher en échelle dans
                 la colonne 0 — sa rotation par [1,0] visait exactement
                 [1,0],[2,0],[3,0],[4,0],[5,0], et cette échelle ouvrait une
                 route droite jusqu'au village ;
               - elles ressemblent à un MARCHEPIED providentiel au pied du
                 Sanctuaire, alors qu'aucune de leurs voisines n'est de la
                 terre : on y va, et on ne va nulle part ;
               - étant deux, elles PIVOTENT — vers [3,0],[3,1] — ce qui donne
                 encore de quoi essayer avant de comprendre que ça ne mène pas
                 plus loin.

               La bonne fausse piste est celle qu'on essaie longtemps avant d'y
               renoncer. */
            { key: "VERROU", cells: [[3, 0], [4, 0]] }
          ],
          guardians: [
            { key: "G", p: 0, r: 8, c: 2, crown: 1 },
            { key: "R", p: 1, r: 0, c: 1 }
          ],
          deck: [
            ["MOVE", "MAGIC", "MOVE"],
            ["MAGIC", "MOVE", "MOVE"],
            ["MAGIC", "MOVE", "PUSH"]
          ],
          /* Optimum 7, PROUVÉ par recherche exhaustive (788 224 nœuds sous
             plafond 7), puis rejoué en direct sur les trois tours réels : le
             coût annoncé n'est plus une intention mais un fait.

             Il valait 8 jusqu'ici, et c'était faux. Le chercheur testait
             l'objectif à la GÉNÉRATION des successeurs et rendait la main au
             premier chemin gagnant rencontré, pas au moins cher ; il validait
             donc la solution qu'on lui présentait au lieu de la contredire.

             Ce que la vraie ligne fait, et qui n'était pas prévu : la
             PASSERELLE pivote TROIS FOIS sur elle-même, chaque rotation la
             reposant plus près du Sanctuaire avec son passager dessus — une
             île de trois cases n'est pas un pont, c'est une monture. Puis la
             couronne déposée est poussée vers le nord : le bloc poussé la
             contient ELLE et le Veilleur collé derrière, qui sort du plateau.
             Une seule poussée de force 1 fait le travail que trois rotations
             faisaient dans l'ancienne solution.

             DÉFAUT ASSUMÉ : la terrasse, le perchoir et le bras ne servent
             plus à rien dans la ligne optimale. Trois pièces de décor, là où
             une seule était déjà de trop. L'énigme reste juste et se tient,
             mais elle n'enseigne plus les trois usages de la Magie qu'elle
             était censée enseigner — c'est une refonte, pas une retouche, et
             elle attend un arbitrage. */
          par: 8,
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La charnière a tourné",
          winLine: "La passerelle s'est déplacée trois fois sous tes pieds, et la couronne poussée a emporté le Veilleur par-dessus bord.",
          failLine: "Le chemin ne s'est pas ouvert.",
          /* Trois emplois de la MÊME carte, tous différents :
             - la passerelle TRANSPORTE le Gardien par-dessus le vide ;
             - le perchoir emporte le RIVAL hors des cases du village, là où
               l'on aurait cru devoir le pousser ;
             - la terrasse, longue barre de cinq cases, pivote en ÉCHELLE
               verticale : le Gardien n'est pas dessus, c'est la route qui vient
               le chercher.

             RÉSERVE : le bras n'est touché par aucune de ces trois rotations.
             Il reste du décor, et une pièce inutile est un défaut — le même que
             le troisième Gardien du Relais avant sa refonte. */
          par: 7,
          solution: [
            [
              { a: "MOVE", who: "G", to: [7, 2] }
            ],
            [
            ],
            [
              { a: "MAGIC", island: "PASSERELLE", pivot: [5, 2], turns: 1, direction: 1 },
              { a: "MAGIC", island: "PASSERELLE", pivot: [5, 1], turns: 1, direction: -1 },
              { a: "MAGIC", island: "PASSERELLE", pivot: [4, 1], turns: 2, direction: 1 },
              { a: "DROP", who: "G", on: [1, 1] },
              { a: "PUSH", who: "G", on: [1, 1], force: 1 },
              { a: "MOVE", who: "G", to: [0, 1] }
            ]
          ]
        },
        /* -----------------------------------------------------------------
           LA PLUS COURTE TRACE — celle que personne ne marche.

           Refonte. La première version demandait de repérer deux barres et de
           monter dessus : que la rotation transporte plus vite que le pied, on
           le sait depuis la deuxième énigme du jeu. Il n'y avait rien à
           chercher, et le grand tour à dix-huit cartes n'était pas une
           tentation mais un décor.

           Le sujet est maintenant que LA COURONNE VOYAGE SEULE. Elle n'a besoin
           de personne : posée sur une île, une rotation l'emporte avec le
           terrain ; poussée, elle survole le vide et se dépose sur la dernière
           terre à portée. Le Gardien, lui, ne va nulle part — il n'y a d'ailleurs
           aucune route pour lui.

           Et la difficulté n'est pas de le deviner mais de le PLACER. Pousser
           exige d'être derrière : c'est la rotation, et elle seule, qui décide
           de quel côté de la couronne on se retrouve. Sur les six pivots
           possibles, un seul laisse le Gardien au sud de la couronne avec de la
           terre au nord ; les cinq autres se jouent, coûtent une carte, et ne
           mènent à rien.

           Optimum 6, PROUVÉ par recherche exhaustive sous plafond 6. */
        {
          id: "p20-la-plus-courte-trace",
          acte: "III",
          principe: "TRACE",
          title: "La plus courte trace",
          tagline: "Aucune route ne mène là-bas. La couronne n'en a pas besoin.",
          brief: "Dépose la couronne sur la case marquée.",
          board: 13,
          sanctuary: false,
          focus: [6, 2],
          villages: {},
          islands: [
            { key: "SOCLE", cells: [[9, 1], [9, 2], [9, 3]] },
            /* La cible, hors d'atteinte de tout pied : une île d'une case ne
               pivote pas et rien ne la relie au reste. */
            [[2, 1]],
            /* Le leurre : une belle barre de quatre, parfaitement pivotable, et
               qui ne rapproche de rien. Elle est là pour qu'on y passe du
               temps. */
            { key: "LEURRE", cells: [[5, 5], [6, 5], [7, 5], [8, 5]] }
          ],
          guardians: [
            { key: "G", p: 0, r: 9, c: 2, crown: 1 }
          ],
          /* UNE SEULE MAGIE, et c'est le coeur de l'énigme. Avec trois, le
             chercheur faisait MARCHER le socle vers le nord en l'enroulant sur
             lui-même, la couronne dessus, et terminait d'une poussée de 1 :
             quatre cartes, et la leçon contournée. C'est en outre l'idée de la
             charnière, déjà jouée. Une carte de Magie ne donne qu'un pivot :
             il faut choisir le bon, et la couronne doit ensuite franchir le
             vide toute seule. */
          hand: { MOVE: 6, PUSH: 6, MAGIC: 1 },
          par: 6,
          goal: { type: "crownAtCell", cell: [2, 1] },
          winTitle: "La trace la plus courte",
          winLine: "Personne n'a marché jusque-là. La couronne y est allée seule.",
          failLine: "La couronne est restée au sud.",
          solution: [
            { a: "DROP", who: "G", on: [9, 3] },
            { a: "MAGIC", island: "SOCLE", pivot: [9, 1], turns: 1, direction: -1 },
            { a: "PUSH", who: "G", on: [7, 1], force: 5 }
          ]
        },
        /* -----------------------------------------------------------------
           DESTINÉE — le quatrième Gardien entre, et l'énigme ne tient que
           parce qu'ils sont quatre.

           Elle remplace « Les quatre mains », qui ne tenait pas : quatre
           pointes interchangeables et quatre Gardiens laissaient chacun courir
           vers la plus proche, et toute contrainte se dissolvait dans le libre
           choix. Ici chaque case porte un SIGNE, chaque Gardien porte le même,
           et aucun ne peut prendre la place d'un autre.

           Le signe de chacun est à l'OPPOSÉ de lui. Les quatre trajets se
           croisent donc tous au carrefour, qui ne fait qu'une case, et les bras
           ne font qu'une case de large : personne ne double personne. Il faut
           GARER quelqu'un sur un bras déjà libéré, le temps que les autres
           passent — un aller-retour qui ne rapporte rien et sans lequel rien
           n'avance.

           Le Veilleur assis au carrefour ne peut être chassé que vers l'ouest :
           au nord comme au sud, le bloc poussé emporterait un allié dans le
           vide, et seul le Gardien de l'est est placé pour pousser dans la
           bonne direction. La géométrie désigne le pousseur.

           PAS DE BARÈME. La solution de référence coûte 23 cartes et n'est pas
           prouvée optimale : le chercheur n'a jamais tenu l'échelle d'une
           énigme à quatre Gardiens. Annoncer un chiffre non prouvé, c'est
           exactement ce qui s'est fait battre six fois. */
        {
          id: "p22-destinee",
          acte: "III",
          principe: "TRACE",
          avant: "Ils étaient trois.",
          verite: "Le carrefour en demandait quatre.",
          title: "Destinée",
          tagline: "Chaque Gardien a sa place, et ce n'est jamais la plus proche.",
          brief: "Conduis chaque Gardien sur la case qui porte son signe.",
          board: 13,
          sanctuary: false,
          focus: [6, 6],
          villages: {},
          islands: [
            [[3, 6]], [[4, 6]], [[5, 6]], [[6, 6]], [[7, 6]], [[8, 6]], [[9, 6]],
            [[6, 3]], [[6, 4]], [[6, 5]], [[6, 7]], [[6, 8]], [[6, 9]]
          ],
          guardians: [
            { key: "A", p: 0, r: 5, c: 6 },
            { key: "B", p: 0, r: 6, c: 7 },
            { key: "C", p: 0, r: 7, c: 6 },
            { key: "D", p: 0, r: 8, c: 6 },
            { key: "R", p: 1, r: 6, c: 6 }
          ],
          hand: { MOVE: 20, PUSH: 5 },
          goal: {
            type: "assignedCells", player: 0,
            pairs: { A: [9, 6], B: [6, 3], C: [3, 6], D: [6, 9] }
          },
          winTitle: "Chacun à sa place",
          winLine: "Un carrefour d'une case et quatre routes qui s'y croisent : il fallait en garer un.",
          failLine: "Un Gardien n'est pas sur son signe.",
          solution: [
            { a: "PUSH", who: "B", on: [6, 6], force: 4 },
            { a: "MOVE", who: "B", to: [6, 3] },
            { a: "MOVE", who: "A", to: [6, 5] },
            { a: "MOVE", who: "C", to: [3, 6] },
            { a: "MOVE", who: "D", to: [6, 9] },
            { a: "MOVE", who: "A", to: [9, 6] }
          ]
        },
        /* =================================================================
           17 — L'ARCHIPEL DES NEUF MENSONGES

           L'examen. Aucune règle nouvelle : tout ce que les seize précédentes
           ont appris, et rien d'autre. Neuf îles, quatre Gardiens, quatre
           rivaux, cinq tours de pioche écrite.

           Le thème est dans le titre : ce qui semble être un bon chemin peut
           être vrai localement sans être la bonne solution globale. Chaque île
           est un véhicule potentiel — le chercheur d'optimum l'a assez montré —
           et AUCUN pivot n'est interdit. Ce sont les distances, les collisions
           et la rareté des cartes qui rendent les mauvais chemins coûteux.

           Le rôle passe de main en main : A porte, B relaie, C envoie, D
           valide. Aucun Gardien ne fait le trajet entier.
           ================================================================= */
        {
          id: "p17-neuf-mensonges",
          acte: "CONFLUENCE",
          avant: "Tu connais désormais les Voies. Ne crois pas pour autant ce qu'elles te montrent.",
          title: "L'archipel des neuf mensonges",
          tagline: "Tu as appris à déplacer le monde. Maintenant le monde va te mentir.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 13,
          sanctuary: false,
          focus: [6, 5],
          villages: { 0: [[0, 0]] },
          islands: [
            /* Nord-ouest : le village et sa dernière serrure. */
            /* LE NORD TIENT SUR LA SEULE RANGÉE 0, et c'est structurel. Une
               île de trois cases projette une case à DEUX de distance quand on
               la pivote par une extrémité, et une diagonale franchit un coin :
               il faut donc trois rangées de dégagement entre la terre du sud
               (rangée 4) et celle du nord pour qu'aucune rotation ne vienne
               déposer un passager au pied du village. Trois tentatives de
               colmatage cas par cas ont échoué avant ce constat. */
            { key: "SEUIL", cells: [[0, 1], [0, 2], [0, 3]] },
            /* Le gouffre de la rangée 3 sépare le Virage de la Passerelle :
               aucun Gardien ne le franchit, une couronne poussée si. */
            { key: "PASSERELLE", cells: [[4, 1], [4, 2], [4, 3]] },
            /* Le faux chemin court : deux cases qui ne se touchent que par un
               coin. Une diagonale coûte DEUX déplacements (movementEdges), donc
               ce raccourci apparent est le plus cher du plateau. */
            /* Chaîne diagonale de trois. La troisième case, (7,1), n'est là
               que pour COLLISIONNER : sans elle, la croix pleine pivotée à 180°
               autour de (7,4) translatait tout le corridor de quatre colonnes
               vers l'ouest et venait toucher cette région — un convoi gratuit
               qui contournait la croix creuse, pourtant le cœur de l'énigme.
               Signalé en jouant. Elle ne connecte rien de neuf : elle ne touche
               que (6,0), en diagonale, et reste un cul-de-sac. */
            /* Chaîne diagonale. (5,2) est la plate-forme d'où l'on pousse la
               couronne vers le nord ; (7,0) n'est là que pour COLLISIONNER avec
               l'arrivée d'une rotation de la croix pleine qui, sans elle,
               translatait tout le corridor de quatre colonnes vers l'ouest. */
            { key: "DOMINO", cells: [[5, 2], [6, 1], [7, 0]] },
            /* Croix creuse : le cœur. Son centre (5,4) est vide, et selon son
               orientation elle relie la Passerelle, reçoit un Gardien, ou ferme
               une route. */
            { key: "CROIX_CREUSE", cells: [[4, 4], [5, 3], [5, 5], [6, 4]] },
            /* Croix pleine : le problème de poussée. Le rival en occupe le
               centre, et il faut le déloger pour traverser. */
            /* Bras ouest allongé À DESSEIN : le rival qui en occupe le centre
               se DÉPLACE d'une poussée de force 1, mais il faut une force 4
               pour l'envoyer par-dessus le bord. L'élimination spectaculaire
               coûte donc trois cartes de plus, et ce sont exactement celles
               qui manqueront à la fin. */
            { key: "CROIX_PLEINE", cells: [[6, 6], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [8, 6]] },
            /* Carrefour : le moyeu. Trois branches en partent, toutes
               plausibles. */
            { key: "CARREFOUR", cells: [[8, 8], [8, 9], [8, 10], [9, 9]] },
            /* Serpent : le faux raccourci majeur. Sa rotation ouvre une route
               vers le nord qui gagne vraiment — mais plus cher. */
            { key: "SERPENT", cells: [[6, 10], [6, 11], [5, 11], [5, 12]] },
            /* La première machine : le V qui transporte le porteur. */
            { key: "V", cells: [[10, 10], [11, 10], [11, 9]] },
            /* Le départ. Quatre sorties, aucune évidente. */
            { key: "CARRE", cells: [[10, 11], [10, 12], [11, 11], [11, 12]] }
          ],
          guardians: [
            { key: "A", p: 0, r: 11, c: 12, crown: 1 },
            { key: "B", p: 0, r: 8, c: 9 },
            { key: "C", p: 0, r: 5, c: 3 },
            { key: "D", p: 0, r: 0, c: 3 },
            { key: "R1", p: 1, r: 7, c: 6 },
            { key: "R2", p: 1, r: 6, c: 11 },
            { key: "R3", p: 1, r: 0, c: 1 }
          ],
          /* La pioche donne cinq cartes par tour. Les cartes non jouées passent
             en réserve : ne rien dépenser n'est pas perdre. */
          deck: [
            ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"],
            ["MAGIC", "PUSH", "PUSH", "PUSH", "PUSH"],
            ["MOVE", "MOVE", "MOVE", "MAGIC", "MAGIC"],
            ["MOVE", "MOVE", "MOVE", "MOVE", "PUSH"],
            ["MOVE", "MOVE", "MOVE", "PUSH", "PUSH"],
            ["MOVE", "MOVE", "MOVE", "PUSH", "PUSH"]
          ],
          /* AUCUN `par`. La solution de référence ci-dessous est vérifiée
             LÉGALE par l'oracle, mais rien ne dit qu'elle soit la moins chère :
             le chercheur d'optimum ne tient pas cette échelle. Annoncer un
             barème non prouvé serait répéter une erreur déjà commise cinq fois.
             L'oracle vérifie donc que l'énigme reste SOLUBLE, et rien d'autre. */
          par: null,
          /* Le nord tenant sur une seule rangée, le rival n'a aucun trajet à
             faire : il CAMPE déjà sur la case de validation, et sa seule
             présence verrouille le village. Il ne peut pas non plus être
             emporté par une rotation — la seule arrivée possible de son île
             chevaucherait le village, ce que le moteur refuse. */
          rivalPlan: [
            "il campe déjà sur ton village. Rien ne l'en fera bouger — sauf toi."
          ],
          replies: [],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "L'archipel s'illumine",
          winLine: "Aucun Gardien n'a fait le trajet. La lumière, elle, l'a fait en entier.",
          failLine: "Un chemin te semblait bon. Il l'était — mais pas jusqu'au bout.",
          /* AUDIT DE TOPOLOGIE (ILYOS_PUZZLE.audit) — ce que le chercheur ne
             peut pas dire, l'audit le dit. Cinquante-trois rotations légales
             recensées, et la propriété qui tient tout le puzzle :

             AUCUN Gardien du sud ne peut marcher jusqu'au village. Le gouffre
             de la rangée 3 sépare le plateau en deux, et seul D, isolé au nord
             sur quatre cases, atteint la zone de validation. Le relais n'est
             donc pas une élégance, c'est la seule issue.

             Deux rotations franchissent ce gouffre — la Passerelle dressée en
             pont, la Croix creuse qui dépose son passager au nord. Toutes deux
             sont LÉGALES et volontairement conservées : ce sont de vraies
             routes alternatives, simplement plus chères, puisqu'elles obligent
             un porteur du sud à faire tout le trajet nord alors que D est déjà
             sur place. Une fausse piste n'est pas une défaite.

             Le rival du village, lui, ne se déloge par aucune rotation : sa
             seule autre case ferait chevaucher le village, ce que le moteur
             refuse. La menace finale ne se contourne pas.

             Le chercheur d'optimum, en revanche, n'aboutit pas ici : quatre
             alliés, quatre rivaux et dix îles donnent un branchement qu'il ne
             couvre pas — 48 000 nœuds en deux minutes sans conclure. */
          /* SOLUTION DE RÉFÉRENCE — légale, vérifiée par l'oracle sous les
             vraies règles et la vraie structure de tours. Ce n'est PAS un
             optimum : le chercheur ne tient pas cette échelle, et rien ne dit
             qu'on ne fait pas mieux. Elle prouve seulement que l'énigme est
             soluble, et elle montre le relais voulu — A porte, B relaie, C
             convoie, D reçoit et valide.

             Aucun Gardien ne fait le trajet entier, et la couronne franchit le
             gouffre de la rangée 3 sans personne : elle est posée puis poussée,
             et ramassée gratuitement de l'autre côté. */
          solution: [
            [
              { a: "MOVE", who: "A", to: [11, 10] },
              { a: "MOVE", who: "C", to: [6, 4] }
            ],
            [
              { a: "MAGIC", island: "V", pivot: [10, 10], turns: 2 },
              { a: "MOVE", who: "A", to: [8, 10] },
              { a: "TRANSFER", who: "A", to: "B" }
            ],
            [
              { a: "MOVE", who: "B", to: [7, 7] },
              { a: "PUSH", who: "B", on: [7, 6], force: 1 },
              { a: "DROP", who: "B", on: [7, 6] },
              { a: "PUSH", who: "B", on: [7, 6], force: 2 },
              { a: "PICKUP", who: "C", on: [7, 4] }
            ],
            [
              { a: "MOVE", who: "C", to: [4, 2] }
            ],
            [
              { a: "MOVE", who: "C", to: [5, 2] },
              { a: "DROP", who: "C", on: [4, 2] },
              { a: "PUSH", who: "C", on: [4, 2], force: 4 },
              { a: "PICKUP", who: "D", on: [0, 2] }
            ],
            [
              { a: "MOVE", who: "D", to: [0, 2] },
              { a: "PUSH", who: "D", on: [0, 1], force: 2 },
              { a: "MOVE", who: "D", to: [0, 1] }
            ]
          ]
        }
      );
