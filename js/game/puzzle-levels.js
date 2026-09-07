      /* =====================================================================
         PUZZLES — la collection

         Quatorze énigmes, de la leçon de poussée à l'enchaînement sans marge. Le
         moteur vit dans js/game/puzzle.js ; ce fragment ne contient que des
         données.

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
          title: "L'effet domino",
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
          title: "La couronne qui vole",
          tagline: "Personne ne traversera. La couronne, elle, ne tombe jamais.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 13,
          sanctuary: false,
          focus: [5, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0], [2, 0], [3, 0], [4, 0]],
            [[8, 0], [9, 0], [10, 0]]
          ],
          guardians: [
            { key: "A", p: 0, r: 8, c: 0, crown: 1 },
            { key: "B", p: 0, r: 9, c: 0 },
            { key: "C", p: 0, r: 3, c: 0 },
            { p: 1, r: 1, c: 0 }
          ],
          hand: { PUSH: 8, MOVE: 5, MAGIC: 1 },
          par: 11,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Elle a franchi le vide",
          winLine: "Un Gardien tombe, sa couronne reste — et le vide ne la retient pas.",
          failLine: "La couronne est du mauvais côté du gouffre.",
          solution: [
            { a: "PUSH", who: "B", on: [8, 0], force: 1 },
            { a: "PUSH", who: "B", on: [8, 0], force: 4 },
            { a: "MOVE", who: "C", to: [4, 0] },
            { a: "MOVE", who: "C", to: [2, 0] },
            { a: "PUSH", who: "C", on: [1, 0], force: 2 },
            { a: "MOVE", who: "C", to: [1, 0] }
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
           08 — Une rotation de 90° change une rangée en colonne ET emmène tous
           ceux qui se tiennent dessus. L'énigme n'est pas la rotation : c'est
           l'ESPACEMENT à donner aux passagers AVANT de tourner, sachant qu'une
           poussée trop forte jette son propre Gardien de tête dans le vide. */
        {
          id: "p08-ronde",
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
           09 — Deux couronnes, deux transports différents. L'une survole le
           gouffre ; l'autre ne bouge pas d'un pouce et se laisse EMPORTER par
           l'île qui pivote sous elle — une rotation déplace les couronnes au
           sol comme elle déplace les Gardiens. Et l'ordre compte : occuper la
           case d'arrivée avant le vol condamne le vol. */
        {
          id: "p09-fardeau",
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
           10 — La navette. Une seule île, un seul Gardien, aucun rival. Une
           barre pivotée par son extrémité se translate de toute sa longueur et
           emmène son passager — à condition qu'il se tienne à l'AUTRE bout. Le
           passager doit donc redescendre la barre entre deux rotations, et un
           quart de tour, au bon moment, fait tourner le couloir. */
        {
          id: "p10-escalier",
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
          par: 10,
          goal: { type: "reachCell", player: 0, cell: [10, 8] },
          winTitle: "La barre t'a porté jusqu'au bout",
          winLine: "Toujours à l'autre bout du pivot : c'est la seule place qui avance.",
          failLine: "La barre a tourné sans t'emmener.",
          solution: [
            { a: "MAGIC", island: "F", pivot: [6, 4], turns: 2 },
            { a: "MOVE", who: "G", to: [6, 4] },
            { a: "MAGIC", island: "F", pivot: [6, 6], turns: 2 },
            { a: "MOVE", who: "G", to: [6, 6] },
            { a: "MAGIC", island: "F", pivot: [6, 8], turns: 1, direction: -1 },
            { a: "MOVE", who: "G", to: [6, 8] },
            { a: "MAGIC", island: "F", pivot: [8, 8], turns: 2 }
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
          title: "Le dernier souffle",
          tagline: "Douze cartes. La solution en demande douze. Aucune ne se perd.",
          brief: "Ramène la couronne jusqu'à ton village.",
          board: 13,
          sanctuary: false,
          focus: [4, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0]],
            [[0, 1]],
            { key: "F", cells: [[6, 0], [7, 0], [8, 0]] },
            [[9, 0], [10, 0]]
          ],
          guardians: [
            { key: "A", p: 0, r: 6, c: 0, crown: 1 },
            { key: "B", p: 0, r: 7, c: 0 },
            { p: 1, r: 0, c: 1 }
          ],
          hand: { PUSH: 7, MAGIC: 2, MOVE: 3 },
          par: 12,
          goal: { type: "crownDelivered", player: 0 },
          winTitle: "Le dernier souffle",
          winLine: "Il a fallu en perdre un pour que la couronne arrive.",
          failLine: "Une carte de trop dépensée, et le seuil reste hors d'atteinte.",
          solution: [
            { a: "PUSH", who: "B", on: [6, 0], force: 1 },
            { a: "PUSH", who: "B", on: [6, 0], force: 5 },
            { a: "MAGIC", island: "F", pivot: [6, 0], turns: 2 },
            { a: "MOVE", who: "B", to: [6, 0] },
            { a: "MAGIC", island: "F", pivot: [4, 0], turns: 2 },
            { a: "MOVE", who: "B", to: [1, 0] },
            { a: "MOVE", who: "B", to: [0, 0] },
            { a: "PUSH", who: "B", on: [0, 1], force: 1 }
          ]
        },

        /* =================================================================
           ÉNIGMES MULTI-TOURS (12 à 14)

           Les onze premières tiennent dans un tour : leur main est donnée d'un
           bloc. Celles-ci durent plusieurs tours et écrivent leur PIOCHE au
           lieu de leur main — cinq cartes distribuées par tour, par le vrai
           `drawCards()`. Toute la boucle de jeu reste en place, et avec elle
           deux règles que les énigmes d'un seul tour ne pouvaient pas montrer :

           - une couronne ne se valide qu'au DÉBUT de ton tour suivant, donc le
             rival a le temps de venir squatter ton village (objectif `scored`,
             qui attend le vrai point de scoreCrownsAtTurnStart) ;
           - les cartes non jouées passent en réserve : rien n'est perdu, mais
             rien ne se rattrape non plus.

           Le rival joue des coups ÉCRITS, affichés au joueur avant qu'il
           commence (`rivalPlan`). Un coup devenu illégal est sauté — lui prendre
           sa case d'avance est une parade, pas un bug. Et la composition du
           paquet est elle-même une contrainte de conception : on ne peut pas
           jouer au tour 1 ce que seul le tour 2 distribue.
           ================================================================= */

        /* -----------------------------------------------------------------
           12 — Le rival annonce qu'il ira sur (1,0), une des trois cases du
           village. Le réflexe est de l'en déloger une fois assis ; la vraie
           réponse est de lui prendre la place d'avance, avec le Gardien qui ne
           porte rien. Cinq cartes suffisent alors, six si on le laisse
           s'installer. */
        {
          id: "p12-squatteur",
          title: "Le squatteur",
          tagline: "Il annonce où il va s'asseoir. À toi d'y être avant lui.",
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
          par: 5,
          rivalPlan: ["il se poste sur la case marquée — une case de ton village."],
          replies: [
            [{ a: "MOVE", who: "R1", to: [1, 0] }]
          ],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La place était prise",
          winLine: "Un Gardien qui ne porte rien vaut une place assise.",
          failLine: "Il s'est installé sur ton village, et tu n'as plus de quoi l'en sortir.",
          solution: [
            [
              { a: "MOVE", who: "G", to: [0, 0] },
              { a: "PUSH", who: "G", on: [0, 1], force: 1 },
              { a: "MOVE", who: "G2", to: [1, 0] }
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
          par: 12,
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
              { a: "MOVE", who: "C", to: [3, 0] },
              { a: "PUSH", who: "C", on: [3, 1], force: 1 },
              { a: "MOVE", who: "C", to: [2, 0] }
            ],
            [
              { a: "PUSH", who: "B", on: [7, 0], force: 1 },
              { a: "PUSH", who: "B", on: [7, 0], force: 4 }
            ],
            [
              { a: "MOVE", who: "C", to: [3, 0] },
              { a: "MOVE", who: "C", to: [1, 0] }
            ]
          ]
        },

        /* -----------------------------------------------------------------
           14 — Une course qui ne se gagne pas à la course. Le rival descend de
           deux cases par tour vers le village ; filer droit au but fait arriver
           un tour trop tard, puisqu'une couronne ne compte qu'au tour suivant.
           Le chemin le plus court passe par LUI : s'arrêter une case plus haut
           met sa descente à portée de poussée. */
        {
          id: "p14-course",
          title: "La course",
          tagline: "Il descend de deux cases par tour. Le plus court chemin passe par lui.",
          brief: "Valide ta couronne — elle ne compte qu'au début de ton prochain tour.",
          board: 13,
          sanctuary: false,
          focus: [4, 0],
          villages: { 0: [[0, 0]] },
          islands: [
            [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0]],
            [[0, 1]],
            [[1, 1], [2, 1], [3, 1], [4, 1]]
          ],
          guardians: [
            { key: "G", p: 0, r: 8, c: 0, crown: 1 },
            { key: "R", p: 1, r: 4, c: 1 }
          ],
          deck: [
            ["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"],
            ["MOVE", "PUSH", "MOVE", "PUSH", "MOVE"],
            ["MOVE", "PUSH"]
          ],
          par: 8,
          rivalPlan: [
            "il descend sur la case marquée.",
            "puis il se poste sur une case de ton village."
          ],
          replies: [
            [{ a: "MOVE", who: "R", to: [2, 1] }],
            [{ a: "MOVE", who: "R", to: [0, 1] }]
          ],
          goal: { type: "scored", player: 0, count: 1 },
          winTitle: "La course est finie",
          winLine: "S'arrêter à sa hauteur coûte une carte, et lui coûte la partie.",
          failLine: "Il est arrivé le premier.",
          solution: [
            [
              { a: "MOVE", who: "G", to: [3, 0] }
            ],
            [
              { a: "MOVE", who: "G", to: [2, 0] },
              { a: "PUSH", who: "G", on: [2, 1], force: 1 },
              { a: "MOVE", who: "G", to: [1, 0] }
            ]
          ]
        }
      );
