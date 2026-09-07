      /* =====================================================================
         PUZZLES — le cabinet d'énigmes

         Une collection d'énigmes à budget fermé : un plateau taillé à la main,
         une main de cartes figée, un objectif. Tout se résout DANS UN SEUL
         TOUR — la main EST le budget, et c'est elle qui fait la difficulté.

         Ce fragment ne modifie aucune règle. Il construit un `state` normal,
         laisse le joueur agir avec les vrais handlers d'ui.js, et se contente
         d'observer l'état pour décider si l'énigme est résolue ou perdue. Les
         prédicats d'objectif appellent les MÊMES fonctions que le jeu réel
         (isCrownValidationCell, validationBloqueeParAdversaire,
         artifactCarriedBy) : aucune seconde version des règles ne vit ici.

         Deux libertés sont accordées aux définitions, parce qu'une énigme n'est
         pas une partie :
         - `sanctuary: false` retire la croix centrale (isSanctuary est
           ENVELOPPÉE, jamais réécrite) ;
         - `villages` absent retire les villages du joueur concerné, ce qui rend
           la validation de couronne impossible et force un autre objectif.

         Point d'entrée : l'événement `ilyos-puzzle-requested` (émis par
         js/version-bootstrap.js au clic sur PUZZLES) ou `ILYOS_PUZZLE.open()`.
         ===================================================================== */

      const PUZZLE_STORAGE_KEY = "ilyos.puzzles.progress";
      const PUZZLE_DEV_KEY = "ilyos.puzzles.dev";

      /* Rempli par js/game/puzzle-levels.js. Déclaré ici pour que le moteur ne
         dépende pas de l'ordre d'évaluation des fragments. */
      const PUZZLES = [];

      const PUZZLE = {
        active: false,
        menuOpen: false,
        index: -1,
        def: null,
        budget: 0,
        restarted: false,
        ended: false,
        pollTimer: null,
        dom: null,
        menuDom: null,
        prevRenderMode: null,
        lastFrame: null,
        everStarted: false,
        spent: 0,
        rivalTurn: 0,
        replying: false,
        islandsByKey: {},
        charsByKey: {}
      };

      /* ---------- Sanctuaire optionnel ---------------------------------
         La croix centrale est de la terre indestructible dans une partie
         normale. Certaines énigmes ont besoin d'un plateau entièrement libre :
         on ENVELOPPE isSanctuary au lieu d'en écrire une seconde version, pour
         que isLand(), la validité des rotations et le reste du moteur restent
         la seule autorité. */
      const puzzleIsSanctuaryBase = isSanctuary;
      isSanctuary = function isSanctuaryPuzzleAware(r, c) {
        if (PUZZLE.active && PUZZLE.def && PUZZLE.def.sanctuary === false) return false;
        return puzzleIsSanctuaryBase(r, c);
      };

      /* ---------- Comptage exact des cartes -----------------------------
         Le budget ne peut pas se déduire de « ce qu'il reste » : quand la pioche
         se vide, drawCards() REMÉLANGE la défausse et rend des cartes déjà
         dépensées (voir ui.js). Une énigme multi-tours se croirait alors
         inépuisable et ne pourrait jamais être déclarée perdue.

         On compte donc à la source. consumeAvailableActions est le seul point
         de passage d'une carte jouée, et il rend le nombre réellement consommé ;
         on l'enveloppe comme card-rules-physical-reserve.js l'a fait avant nous,
         en ne comptant que le joueur humain — le rival puise dans un paquet
         vide et ne dépense rien. */
      const puzzleConsumeBase = consumeAvailableActions;
      consumeAvailableActions = function consumeAvailableActionsPuzzleAware(type, count = 1, player = currentPlayer()) {
        const depense = puzzleConsumeBase(type, count, player);
        if (PUZZLE.active && player && player.id === 0) PUZZLE.spent += depense;
        return depense;
      };

      /* ---------- Progression ------------------------------------------- */
      function puzzleLoadProgress() {
        try { return JSON.parse(localStorage.getItem(PUZZLE_STORAGE_KEY) || "{}") || {}; }
        catch (_) { return {}; }
      }

      function puzzleSaveProgress(progress) {
        try { localStorage.setItem(PUZZLE_STORAGE_KEY, JSON.stringify(progress)); } catch (_) { }
      }

      function puzzleDevUnlocked() {
        try { if (localStorage.getItem(PUZZLE_DEV_KEY) === "1") return true; } catch (_) { }
        try { return /[?&]dev=puzzles(&|$)/.test(location.search); } catch (_) { return false; }
      }

      function puzzleUnlocked(index) {
        if (index <= 0 || puzzleDevUnlocked()) return true;
        const progress = puzzleLoadProgress();
        const precedent = PUZZLES[index - 1];
        return !!(precedent && progress[precedent.id] && progress[precedent.id].solved);
      }

      /* ---------- Main de cartes ---------------------------------------
         Une définition écrit sa main soit en liste (["MOVE","PUSH"]) soit en
         comptes ({MOVE:4, PUSH:7}), la seconde forme étant seule lisible quand
         le budget dépasse la dizaine. */
      function puzzleHandList(hand) {
        if (Array.isArray(hand)) return hand.slice();
        const liste = [];
        ["MOVE", "PUSH", "MAGIC"].forEach(type => {
          for (let i = 0; i < (hand?.[type] || 0); i++) liste.push(type);
        });
        return liste;
      }

      /* Une énigme multi-tours écrit sa PIOCHE, tour 1 en tête :

           deck: [ ["MOVE","MOVE","PUSH"], ["PUSH","PUSH"] ]

         drawCards() tire par `deck.pop()`, donc par la FIN du tableau : la
         liste est aplatie puis retournée ici, et la définition reste lisible
         dans l'ordre où le joueur verra les cartes. */
      function puzzleDeckList(deck) {
        if (!deck) return [];
        const tours = Array.isArray(deck[0]) ? deck : [deck];
        return tours.flat();
      }

      function puzzleIsMultiTurn(def = PUZZLE.def) {
        return !!(def && def.deck);
      }

      /* Cartes encore disponibles : la main, la réserve, ET ce qui dort dans la
         pioche. Sans ce dernier terme, une énigme multi-tours se croirait
         perdue dès son premier tour, et le compteur afficherait un budget déjà
         dépensé. */
      function puzzleCardsSpent() {
        return PUZZLE.spent;
      }

      function puzzleCardsLeft() {
        return Math.max(0, PUZZLE.budget - PUZZLE.spent);
      }

      /* ---------- Fabrique de plateau ----------------------------------- */
      function puzzleBuildState(def) {
        setBoardSize(def.board || 11);

        const noms = ["TOI", "LES RIVAUX"];
        const players = noms.map((name, i) => {
          const villages = (def.villages?.[i] || []).map(([r, c]) => ({ r, c }));
          return {
            id: i, name, color: PLAYER_COLORS[i], icon: PLAYER_ICONS[i],
            isAI: false, aiDifficulty: null,
            village: villages[0] || null, villages,
            score: 0, deck: [], discard: [], hand: [],
            stash: { MOVE: 0, PUSH: 0, MAGIC: 0 }
          };
        });

        state = {
          players, soloMode: false, onlineMode: false, visualMode: "alternative",
          startingBoardMode: "classic", startingBoardPreset: null,
          turnDurationSeconds: 0, setupSelectionPending: false, draft: null,
          aiDifficulty: null, currentPlayer: 0, round: 1, turn: 1,
          islands: [], characters: [],
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          rules: { allowDissolve: false, islandLimitPerPlayer: 0, shapeLimitPerOwner: 0 },
          /* La pose est neutralisée : une énigme se résout avec les cartes
             qu'on lui donne, pas en fabriquant du terrain. Une définition peut
             la rouvrir avec `placement: true`. */
          islandPlacedThisTurn: !def.placement,
          centerCrownTakenThisTurn: false,
          couronnesEnAttente: [], treasureDropFromId: null, crownPickupCell: null,
          selectedIslandShape: null, placementCells: null, placementOriginIndex: 0,
          placementRotationSteps: 0, hoverAnchor: null, pendingSpawnIslandId: null,
          fxCells: [], inputLocked: false, aiThinking: false, timerExpiring: false,
          turnTimeLeft: null, turnDeadline: null,
          selectedActionCardId: null, selectedActionType: null, selectedActionCount: 1,
          pushForceChoice: 1, crownStealTargetId: null, aiCrownMemory: {},
          crownPickupArtifactId: null, treasureDropArtifactId: null, crownTransferTargetIds: [],
          selectedCharId: null, selectedIslandId: null, selectedMagicPivot: null,
          magicPreviewDirection: 0, magicPreviewSteps: 0, magicPreviewCells: null,
          magicPreviewValid: false, magicHoverIslandId: null, magicHoverPivot: null,
          actionHoverCell: null, smartHoverType: null, smartHoverPath: [],
          smartPushForce: null, smartPushTargets: new Set(), pushOptions: [],
          pushHoverOptionId: null, pushTargetId: null, pendingDirectMoveTarget: null,
          reachable: new Set(), nextIslandId: 1, nextCharId: 100,
          undoHistory: [], winner: null,
          puzzle: true
        };

        /* Terrain : une entrée = une île. Le découpage appartient à l'auteur de
           l'énigme, puisque c'est lui qui décide ce qui peut pivoter. */
        PUZZLE.islandsByKey = {};
        (def.islands || []).forEach(entry => {
          const cells = Array.isArray(entry) ? entry : entry.cells;
          const id = tutoAddIsland(cells.map(([r, c]) => [r, c]), 0);
          if (!Array.isArray(entry) && entry.key) PUZZLE.islandsByKey[entry.key] = id;
        });

        /* Gardiens. `crown: 1|2` fait porter la couronne correspondante. */
        PUZZLE.charsByKey = {};
        (def.guardians || []).forEach(g => {
          const char = { id: `pz-${state.nextCharId++}`, player: g.p || 0, r: g.r, c: g.c };
          state.characters.push(char);
          if (g.key) PUZZLE.charsByKey[g.key] = char.id;
          if (g.crown) {
            const crown = g.crown === 2 ? state.secondArtifact : state.artifact;
            crown.active = true;
            crown.carrierId = char.id;
            crown.r = g.r;
            crown.c = g.c;
          }
        });

        /* Couronnes au sol. */
        (def.crowns || []).forEach(entry => {
          const crown = entry.slot === 2 ? state.secondArtifact : state.artifact;
          crown.active = true;
          crown.carrierId = null;
          crown.r = entry.r;
          crown.c = entry.c;
        });

        if (puzzleIsMultiTurn(def)) {
          /* Multi-tours : on remplit la PIOCHE et on laisse le vrai drawCards()
             distribuer. Toute la boucle de tour du jeu reste en place —
             beginTurn(), scoreCrownsAtTurnStart(), la réserve de fin de tour —
             et seule la composition du paquet est écrite d'avance. */
          const pioche = puzzleDeckList(def.deck);
          PUZZLE.budget = pioche.length;
          state.players[0].deck = pioche
            .map((action, i) => ({ id: `PZ-D${i}`, action, used: false }))
            .reverse();
          drawCards(state.players[0], 5);
        } else {
          const main = puzzleHandList(def.hand);
          state.players[0].hand = main.map((action, i) => ({ id: `PZ-H${i}`, action, used: false }));
          PUZZLE.budget = main.length;
        }
        PUZZLE.rivalTurn = 0;
        PUZZLE.replying = false;
        PUZZLE.spent = 0;
      }

      /* ---------- Objectifs ---------------------------------------------
         Chaque prédicat lit l'état par les fonctions de règles du jeu. Aucun ne
         réimplémente une condition de victoire. */
      const PUZZLE_GOALS = {
        /* Livrer une couronne : exactement l'éligibilité testée par
           scoreCrownsAtTurnStart (porteur vivant, case de validation, aucun
           rival dans les trois cases du village). */
        crownDelivered(def, goal) {
          const joueur = state.players[goal.player ?? 0];
          if (!joueur) return false;
          return (state.characters || []).some(char =>
            char.player === joueur.id
            && !!artifactCarriedBy(char.id)
            && isCrownValidationCell(joueur, char.r, char.c)
            && !validationBloqueeParAdversaire(joueur, char.r, char.c));
        },

        /* Un gardien du joueur sur une case précise. */
        reachCell(def, goal) {
          return (state.characters || []).some(char =>
            char.player === (goal.player ?? 0)
            && char.r === goal.cell[0] && char.c === goal.cell[1]);
        },

        /* Des gardiens du joueur sur TOUTES les cases listées, en même temps. */
        occupyCells(def, goal) {
          return (goal.cells || []).every(([r, c]) => {
            const occupant = characterAt(r, c);
            return !!occupant && occupant.player === (goal.player ?? 0);
          });
        },

        /* Plus aucun gardien adverse en jeu. */
        eliminateAll(def, goal) {
          const adverse = goal.enemy ?? 1;
          return !(state.characters || []).some(char => char.player === adverse);
        },

        /* Une couronne — portée ou au sol — sur une case précise. */
        crownAtCell(def, goal) {
          return activeArtifacts().some(crown => {
            const porteur = crown.carrierId ? characterById(crown.carrierId) : null;
            const r = porteur ? porteur.r : crown.r;
            const c = porteur ? porteur.c : crown.c;
            return r === goal.cell[0] && c === goal.cell[1];
          });
        },

        /* Chaque case listée porte une couronne (portée ou au sol). */
        crownsAtCells(def, goal) {
          return (goal.cells || []).every(([r, c]) =>
            PUZZLE_GOALS.crownAtCell(def, { cell: [r, c] }));
        },

        /* Un gardien du joueur, PORTANT une couronne, sur une case précise. */
        carryToCell(def, goal) {
          const char = characterAt(goal.cell[0], goal.cell[1]);
          return !!char && char.player === (goal.player ?? 0) && !!artifactCarriedBy(char.id);
        },

        /* Points réellement marqués. À la différence de crownDelivered, qui
           constate une position, celui-ci attend que scoreCrownsAtTurnStart ait
           accordé le point au début du tour suivant — la vraie règle, seule
           applicable dès qu'une énigme dure plus d'un tour. */
        scored(def, goal) {
          const joueur = state.players[goal.player ?? 0];
          return !!joueur && (joueur.score || 0) >= (goal.count ?? 1);
        },

        /* Tous les objectifs listés, simultanément. Permet des énigmes à
           double contrainte sans inventer un prédicat par combinaison. */
        all(def, goal) {
          return (goal.goals || []).every(sous => {
            const predicat = PUZZLE_GOALS[sous.type];
            return !!predicat && !!predicat(def, sous);
          });
        }
      };

      function puzzleGoalReached() {
        const def = PUZZLE.def;
        if (!def || !state) return false;
        const predicat = PUZZLE_GOALS[def.goal?.type];
        if (!predicat) return false;
        try { return !!predicat(def, def.goal); } catch (_) { return false; }
      }

      /* ---------- Échec ---------------------------------------------------
         Une énigme est perdue quand plus rien ne peut changer : aucune carte
         jouable, ou plus aucun gardien pour agir. Une définition peut ajouter
         sa propre condition (`fail`), toujours évaluée APRÈS l'objectif. */
      function puzzleFailed() {
        const def = PUZZLE.def;
        if (!def || !state) return false;
        /* Pendant la riposte du rival et pendant la bascule de tour, l'état est
           transitoire : la main est vide entre la défausse et la pioche, et un
           Gardien peut avoir quitté le jeu en validant sa couronne. Juger là
           reviendrait à déclarer perdue une énigme en train d'être gagnée. */
        if (PUZZLE.replying || state.currentPlayer !== 0 || state.turnTransitioning) return false;
        if (!(state.characters || []).some(char => char.player === 0)) return true;
        if (typeof def.fail === "function") {
          try { if (def.fail()) return true; } catch (_) { }
        }
        return puzzleCardsLeft() <= 0;
      }

      /* ---------- Feuille de style --------------------------------------
         Tout est préfixé et ne vise que des identifiants propres aux énigmes.
         Le chrome de jeu masqué reprend la liste du tutoriel : une énigme se
         joue dans un seul tour, sans fin de tour, sans annulation, sans pose. */
      function puzzleInjectStyle() {
        if (document.getElementById("ilyos-puzzle-style")) return;
        const style = document.createElement("style");
        style.id = "ilyos-puzzle-style";
        style.textContent = `
          #puzzleLayer{position:fixed;inset:0;z-index:1500001;pointer-events:none;
            font-family:'Nunito Sans','Inter',system-ui,sans-serif;color:#eaf1ff;}
          #puzzleLayer .pz-brief{position:absolute;top:74px;left:50%;
            transform:translateX(-50%);max-width:min(620px,90vw);z-index:7;
            padding:9px 20px;border-radius:14px;text-align:center;
            background:rgba(9,16,34,.84);backdrop-filter:blur(6px);
            border:1px solid rgba(150,190,255,.28);
            box-shadow:0 8px 30px rgba(0,0,0,.45);}
          #puzzleLayer .pz-title{font-family:'Cinzel Decorative','Almendra',serif;
            font-size:15px;letter-spacing:.06em;color:#ffd98a;}
          #puzzleLayer .pz-goal{font-size:13.5px;line-height:1.45;color:#dce8ff;margin-top:3px;}
          #puzzleLayer .pz-budget{position:absolute;top:74px;right:16px;z-index:7;
            padding:8px 14px;border-radius:12px;font-size:12.5px;letter-spacing:.03em;
            background:rgba(9,16,34,.84);border:1px solid rgba(150,190,255,.28);}
          #puzzleLayer .pz-budget b{color:#ffd98a;font-size:15px;}
          #puzzleLayer .pz-budget.tight b{color:#ff9d7a;}
          #puzzleLayer .pz-plan{position:absolute;top:150px;right:16px;z-index:7;
            max-width:250px;padding:10px 14px;border-radius:12px;font-size:12px;
            line-height:1.5;background:rgba(9,16,34,.84);
            border:1px solid rgba(150,190,255,.28);}
          #puzzleLayer .pz-plan-title{font-size:10px;letter-spacing:.16em;
            color:#8fa6d2;margin-bottom:5px;}
          #puzzleLayer .pz-plan-line{color:#b9c8e6;opacity:.55;}
          #puzzleLayer .pz-plan-line b{color:#8fa6d2;margin-right:4px;}
          #puzzleLayer .pz-plan-line.next{opacity:1;color:#ffd0a0;}
          #puzzleLayer .pz-plan-line.next b{color:#ffb870;}
          #puzzleLayer .pz-plan-line.done{opacity:.3;text-decoration:line-through;}
          #puzzleLayer .pz-tools{position:absolute;left:16px;bottom:78px;z-index:7;
            display:flex;gap:8px;}
          #puzzleLayer button{pointer-events:auto;cursor:pointer;font:inherit;
            font-size:12.5px;padding:8px 14px;border-radius:999px;color:#c8d4ee;
            letter-spacing:.03em;background:rgba(9,16,34,.92);
            border:1px solid rgba(120,150,210,.4);box-shadow:0 4px 18px rgba(0,0,0,.4);
            transition:background .2s,color .2s,transform .1s;}
          #puzzleLayer button:hover{background:rgba(24,38,68,.96);color:#eef3ff;}
          #puzzleLayer button:active{transform:translateY(1px);}
          #puzzleLayer button.primary{background:#3a6bd0;border-color:#5f8de0;color:#f2f7ff;}
          #puzzleLayer button.primary:hover{background:#4a7be0;}

          #puzzleLayer .pz-end{position:absolute;inset:0;z-index:12;display:flex;
            flex-direction:column;align-items:center;justify-content:center;gap:18px;
            background:radial-gradient(circle at 50% 42%,rgba(12,22,48,.92),rgba(6,10,22,.97));
            pointer-events:auto;text-align:center;padding:24px;
            animation:pz-in .55s ease both;}
          @keyframes pz-in{from{opacity:0}to{opacity:1}}
          #puzzleLayer .pz-end h2{font-family:'Cinzel Decorative','Almendra',serif;
            font-size:clamp(21px,3.6vw,32px);margin:0;letter-spacing:.04em;}
          #puzzleLayer .pz-end p{margin:0;max-width:460px;color:#c4d2ee;line-height:1.6;font-size:14px;}
          #puzzleLayer .pz-stars{font-size:30px;letter-spacing:8px;
            filter:drop-shadow(0 0 10px rgba(255,205,110,.5));}
          #puzzleLayer .pz-end-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}

          /* Au-dessus de l'iframe du menu (z-index 2147483000, voir
             js/version-bootstrap.js) : l'écran de sélection s'ouvre alors que
             #gameScreen est encore masqué, donc l'iframe est toujours visible
             et la recouvrir est plus sûr que de lutter contre syncFrame(). */
          #puzzleMenu{position:fixed;inset:0;z-index:2147483100;overflow:auto;
            background:radial-gradient(circle at 50% 18%,rgba(18,30,62,.97),rgba(5,8,18,.99));
            font-family:'Nunito Sans','Inter',system-ui,sans-serif;color:#eaf1ff;
            padding:34px 20px 48px;animation:pz-in .4s ease both;}
          #puzzleMenu h1{font-family:'Cinzel Decorative','Almendra',serif;
            font-size:clamp(24px,4vw,36px);text-align:center;margin:0 0 6px;
            letter-spacing:.1em;color:#ffd98a;}
          #puzzleMenu .pz-sub{text-align:center;color:#9fb2d8;font-size:13px;margin-bottom:26px;}
          #puzzleMenu .pz-grid{display:grid;gap:14px;max-width:960px;margin:0 auto;
            grid-template-columns:repeat(auto-fill,minmax(196px,1fr));}
          #puzzleMenu .pz-card{position:relative;text-align:left;padding:15px 16px 14px;
            border-radius:16px;background:linear-gradient(180deg,rgba(18,30,60,.9),rgba(11,18,38,.9));
            border:1px solid rgba(120,160,225,.28);cursor:pointer;color:inherit;
            font:inherit;transition:transform .16s,border-color .2s,box-shadow .2s;}
          #puzzleMenu .pz-card:hover:not([disabled]){transform:translateY(-3px);
            border-color:rgba(180,210,255,.55);box-shadow:0 14px 34px rgba(0,0,0,.5);}
          #puzzleMenu .pz-card[disabled]{opacity:.42;cursor:not-allowed;}
          #puzzleMenu .pz-num{font-size:11px;letter-spacing:.18em;color:#8fa6d2;}
          #puzzleMenu .pz-name{font-family:'Cinzel Decorative','Almendra',serif;
            font-size:16px;margin:3px 0 6px;color:#ffe3ab;line-height:1.25;}
          #puzzleMenu .pz-line{font-size:12px;color:#a9bbdd;line-height:1.45;min-height:2.6em;}
          #puzzleMenu .pz-foot{display:flex;justify-content:space-between;align-items:center;
            margin-top:10px;font-size:11.5px;color:#8fa6d2;}
          #puzzleMenu .pz-foot .stars{letter-spacing:2px;color:#ffcf7a;}
          #puzzleMenu .pz-back{display:block;margin:30px auto 0;cursor:pointer;font:inherit;
            font-size:13px;padding:10px 22px;border-radius:999px;color:#c8d4ee;
            background:rgba(9,16,34,.92);border:1px solid rgba(120,150,210,.4);}
          #puzzleMenu .pz-back:hover{background:rgba(24,38,68,.96);color:#eef3ff;}

          /* Chrome de jeu masqué : une énigme tient dans un seul tour. */
          /* Fin de tour : masquée quand l'énigme tient dans un seul tour, rendue
             au joueur dès qu'elle en dure plusieurs — c'est alors lui qui
             décide quand laisser le rival jouer sa réplique. */
          #gameScreen.puzzle-one-turn #endTurnBtn,
          #gameScreen.puzzle-one-turn #ov2End,
          #gameScreen.puzzle-on #ov2Undo,
          #gameScreen.puzzle-on #ov2Gear,
          #gameScreen.puzzle-on #hudV2GearBtn,
          #gameScreen.puzzle-on #turnTimer,
          #gameScreen.puzzle-on #ov2Timer,
          #gameScreen.puzzle-on [data-hud="timer"],
          #gameScreen.puzzle-on .turn-timer,
          #gameScreen.puzzle-on [data-hud-render],
          #gameScreen.puzzle-on [data-hud-camera],
          #gameScreen.puzzle-on .kaykit-camera-hint,
          #gameScreen.puzzle-on .kaykit-camera-controls,
          #gameScreen.puzzle-on .kaykit-control-btn,
          #gameScreen.puzzle-on .kaykit-ui,
          #gameScreen.puzzle-on .kaykit-controls,
          #gameScreen.puzzle-on [data-hud-render-toggle],
          #gameScreen.puzzle-on .hud-v2-render-toggle,
          #gameScreen.puzzle-on #instruction,
          #gameScreen.puzzle-on .ov2-instruction,
          #gameScreen.puzzle-on #newGameBtn{display:none !important;}
          #gameScreen.puzzle-no-place #ov2Island,
          #gameScreen.puzzle-no-place #islandSelector{display:none !important;}
          /* Le plateau tactique 2D (js/plateau-tactique.js) écarte
             explicitement les destinations hors grille : une poussée qui éjecte
             par le BORD du plateau n'y a aucun repère cliquable, alors que la
             3D pose son ☠ dans le vide. C'est le coup gagnant de six énigmes.
             Le bouton vit sur <body>, hors de #gameScreen : il faut donc une
             classe posée sur <body> pour l'atteindre. */
          body.puzzle-mode #plateauTactiqueBtn{display:none !important;}
        `;
        document.head.appendChild(style);
      }

      /* ---------- Caméra -------------------------------------------------
         Même contrainte que le tutoriel : ne jamais couper orbit.enabled, et
         ré-imposer le cadrage plusieurs fois pour gagner la course contre
         js/camera-start-face-auto-v1.js, qui recentre le plateau ~520 ms après
         l'affichage. */
      function puzzleFrame(r, c, zoomBoost) {
        PUZZLE.lastFrame = { r, c };
        const go = tries => {
          let ok = false;
          try {
            if (typeof kaykitFollowCell === "function" && typeof kaykit3D !== "undefined" && kaykit3D) {
              kaykit3D.autoFit = false;
              kaykitFollowCell(r, c, { duration: 720, force: true, cinematique: true, zoomBoost: zoomBoost || 0 });
              ok = true;
            }
          } catch (_) { }
          try { tutoLockCamera(); } catch (_) { }
          if (!ok && tries > 0) setTimeout(() => go(tries - 1), 350);
        };
        go(8);
        [350, 700, 1100, 1600, 2400].forEach(delay => setTimeout(() => {
          if (PUZZLE.active && PUZZLE.lastFrame
            && PUZZLE.lastFrame.r === r && PUZZLE.lastFrame.c === c) go(0);
        }, delay));
      }

      /* Centre de gravité de l'énigme : le milieu du terrain, à défaut le
         centre du plateau. Une définition peut imposer `focus: [r,c]`. */
      function puzzleFocusCell(def) {
        if (Array.isArray(def.focus)) return def.focus;
        const cells = [];
        (def.islands || []).forEach(entry => {
          (Array.isArray(entry) ? entry : entry.cells).forEach(cell => cells.push(cell));
        });
        if (!cells.length) return [CENTER.r, CENTER.c];
        const sr = cells.reduce((total, cell) => total + cell[0], 0);
        const sc = cells.reduce((total, cell) => total + cell[1], 0);
        return [Math.round(sr / cells.length), Math.round(sc / cells.length)];
      }

      /* ---------- Surcouche en jeu --------------------------------------- */
      function puzzleBuildOverlay() {
        if (PUZZLE.dom) return PUZZLE.dom;
        const layer = document.createElement("div");
        layer.id = "puzzleLayer";
        layer.innerHTML = `
          <div class="pz-brief">
            <div class="pz-title"></div>
            <div class="pz-goal"></div>
          </div>
          <div class="pz-budget"></div>
          <div class="pz-plan" hidden></div>
          <div class="pz-tools">
            <button type="button" data-pz="restart">↺ Recommencer</button>
            <button type="button" data-pz="menu">← Puzzles</button>
          </div>`;
        document.body.appendChild(layer);
        layer.querySelector('[data-pz="restart"]').addEventListener("click", () => puzzleRestart());
        layer.querySelector('[data-pz="menu"]').addEventListener("click", () => puzzleBackToMenu());
        PUZZLE.dom = {
          layer,
          title: layer.querySelector(".pz-title"),
          goal: layer.querySelector(".pz-goal"),
          budget: layer.querySelector(".pz-budget"),
          plan: layer.querySelector(".pz-plan")
        };
        return PUZZLE.dom;
      }

      function puzzleSyncOverlay() {
        const dom = PUZZLE.dom;
        const def = PUZZLE.def;
        if (!dom || !def) return;
        dom.title.textContent = `${PUZZLE.index + 1}. ${def.title}`;
        dom.goal.textContent = def.brief || "";
        const restant = puzzleCardsLeft();
        const depense = puzzleCardsSpent();
        dom.budget.innerHTML = `Cartes <b>${restant}</b> / ${PUZZLE.budget}`
          + (def.par ? `<br><span style="opacity:.65">optimal : ${def.par} dépensées</span>` : "");
        dom.budget.classList.toggle("tight", def.par ? depense > def.par : false);

        /* Le plan du rival est PUBLIC. Une énigme se lit comme un problème
           d'échecs : la difficulté est d'y répondre, pas de le deviner. La
           ligne du tour à venir est mise en avant, les tours déjà joués
           s'éteignent. */
        const plan = def.rivalPlan || [];
        dom.plan.hidden = !plan.length;
        if (plan.length) {
          dom.plan.innerHTML = `<div class="pz-plan-title">LE RIVAL JOUERA</div>`
            + plan.map((ligne, i) => `<div class="pz-plan-line${
              i < PUZZLE.rivalTurn ? " done" : (i === PUZZLE.rivalTurn ? " next" : "")
            }"><b>T${i + 1}</b> ${ligne}</div>`).join("");
        }
      }

      /* ---------- Fin d'énigme -------------------------------------------- */
      function puzzleStarsFor(def, depense) {
        let etoiles = 1;
        if (!PUZZLE.restarted) etoiles = 2;
        if (def.par && depense <= def.par && !PUZZLE.restarted) etoiles = 3;
        return etoiles;
      }

      function puzzleRecordSolved(def, depense, etoiles) {
        const progress = puzzleLoadProgress();
        const avant = progress[def.id] || {};
        progress[def.id] = {
          solved: true,
          best: Number.isFinite(avant.best) ? Math.min(avant.best, depense) : depense,
          stars: Math.max(avant.stars || 0, etoiles)
        };
        puzzleSaveProgress(progress);
      }

      function puzzleShowEnd({ won }) {
        if (!PUZZLE.dom || PUZZLE.ended) return;
        PUZZLE.ended = true;
        clearInterval(PUZZLE.pollTimer);
        PUZZLE.pollTimer = null;
        if (state) state.inputLocked = true;

        const def = PUZZLE.def;
        const depense = puzzleCardsSpent();
        const etoiles = won ? puzzleStarsFor(def, depense) : 0;
        if (won) puzzleRecordSolved(def, depense, etoiles);

        const suivant = PUZZLES[PUZZLE.index + 1];
        const panneau = document.createElement("div");
        panneau.className = "pz-end";
        panneau.innerHTML = `
          <h2>${won ? def.winTitle || "Résolu" : "L'énigme résiste"}</h2>
          ${won ? `<div class="pz-stars">${"★".repeat(etoiles)}${"☆".repeat(3 - etoiles)}</div>` : ""}
          <p>${won
            ? `${def.winLine || ""}<br><span style="opacity:.7">${depense} carte${depense > 1 ? "s" : ""} dépensée${depense > 1 ? "s" : ""}${def.par ? ` — optimal : ${def.par}` : ""}</span>`
            : def.failLine || "Il ne reste plus de quoi agir."}</p>
          <div class="pz-end-actions">
            <button type="button" data-pz="again">↺ Recommencer</button>
            ${won && suivant ? '<button type="button" class="primary" data-pz="next">Puzzle suivant →</button>' : ""}
            <button type="button" data-pz="back">← Puzzles</button>
          </div>`;
        PUZZLE.dom.layer.appendChild(panneau);
        panneau.querySelector('[data-pz="again"]').addEventListener("click", () => puzzleRestart());
        panneau.querySelector('[data-pz="back"]').addEventListener("click", () => puzzleBackToMenu());
        const boutonSuivant = panneau.querySelector('[data-pz="next"]');
        if (boutonSuivant) boutonSuivant.addEventListener("click", () => puzzleStart(PUZZLE.index + 1));
      }

      /* ---------- Boucle d'observation ------------------------------------
         L'objectif est testé AVANT l'échec : une énigme résolue avec sa
         dernière carte est une réussite, pas une main vide. */
      function puzzleTick() {
        if (!PUZZLE.active || PUZZLE.ended || !state) return;
        if (!PUZZLE.def.placement) state.islandPlacedThisTurn = true;
        puzzleSyncOverlay();
        if (puzzleGoalReached()) { puzzleShowEnd({ won: true }); return; }
        // C'est au rival : on joue ses coups écrits, puis on rend la main.
        if (state.currentPlayer === 1 && !PUZZLE.replying && !state.turnTransitioning) {
          puzzlePlayRivalTurn();
          return;
        }
        if (puzzleFailed()) puzzleShowEnd({ won: false });
      }

      /* ---------- Le rival ---------------------------------------------
         Une énigme est un DUEL LOCAL : `players[1].isAI` vaut false, et le jeu
         rend simplement la main au joueur 2 en fin de tour. Il ne manque donc
         personne pour cliquer à sa place — c'est tout ce que fait ce bloc. La
         boucle de tour du jeu (endTurn / beginTurn / scoreCrownsAtTurnStart)
         n'est ni contournée ni réécrite.

         Les coups du rival sont écrits d'avance et affichés au joueur : une
         énigme se lit comme un problème d'échecs, sans surprise. Un coup devenu
         illégal — la case visée occupée entre-temps, par exemple — est SAUTÉ,
         jamais forcé : occuper la case avant lui est une parade légitime, et
         c'est même la solution courte de la douzième énigme. */
      function puzzleRivalStepLegal(step) {
        const char = characterById(PUZZLE.charsByKey[step.who]);
        if (!char) return null;
        if (step.a === "MOVE") {
          const chemin = shortestMovementPath(char, step.to[0], step.to[1], 99);
          if (!chemin) return null;
          return { type: "MOVE", charId: char.id, r: step.to[0], c: step.to[1], cost: chemin.cost ?? chemin.length };
        }
        if (step.a === "PUSH") {
          const dr = step.on[0] - char.r;
          const dc = step.on[1] - char.c;
          if (Math.abs(dr) + Math.abs(dc) !== 1) return null;
          return { type: "PUSH", pusherId: char.id, r: step.on[0], c: step.on[1], force: step.force };
        }
        return null;
      }

      async function puzzlePlayRivalTurn() {
        if (PUZZLE.replying || !PUZZLE.active) return;
        PUZZLE.replying = true;
        state.inputLocked = true;

        const script = PUZZLE.def.replies?.[PUZZLE.rivalTurn] || [];
        for (const step of script) {
          if (!PUZZLE.active) break;
          const action = puzzleRivalStepLegal(step);
          if (!action) continue;
          appliquerActionNoyau(action);
          tutoRender();
          await tutoWait(700);
        }
        PUZZLE.rivalTurn++;
        puzzleSyncOverlay();

        if (!PUZZLE.active) { PUZZLE.replying = false; return; }
        /* La pose reste neutralisée pour le rival aussi : sans ça endTurn(true)
           lui poserait une île automatique (voir createAutomaticIslandAndSpawn)
           et ferait apparaître un Gardien que l'énigme n'a jamais prévu. */
        if (!PUZZLE.def.placement) state.islandPlacedThisTurn = true;
        /* La pioche d'une énigme est écrite, pas cyclique : on vide la défausse
           avant que beginTurn() ne redistribue, sinon drawCards() la remélange
           et rend au joueur des cartes qu'il a déjà dépensées. */
        if (state.players?.[0]) state.players[0].discard.length = 0;
        try { await endTurn(true); } catch (_) { }
        if (!PUZZLE.def.placement && state) state.islandPlacedThisTurn = true;
        PUZZLE.replying = false;
        if (PUZZLE.active && state) state.inputLocked = false;
      }

      /* ---------- Garde-fous ---------------------------------------------
         Mêmes verrous que le tutoriel : Échap rembobinerait la partie, le clic
         droit sur le canevas 3D déclenche l'annulation de la dernière action
         (listener contextmenu de bindKayKitInteractions) et casserait le
         décompte de cartes. */
      function puzzleKeyGuard(event) {
        if (!PUZZLE.active) return;
        if (event.key === "Escape") { event.stopImmediatePropagation(); event.preventDefault(); }
        /* « T » bascule le plateau tactique 2D, où une chute par le bord du
           plateau n'est pas cliquable. La capture sur window passe avant le
           listener de js/plateau-tactique.js, posé sur document. */
        if (event.key === "t" || event.key === "T") {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      }

      function puzzleRightClickGuard(event) {
        if (!PUZZLE.active) return;
        if (event.type !== "contextmenu" && event.button !== 2) return;
        const cible = event.target;
        if (!cible || !cible.closest) return;
        if (!cible.closest("#gameScreen") && !cible.closest("#kaykitCanvas")) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      }

      /* ---------- Lancement d'une énigme ----------------------------------- */
      /* `replay` = le joueur RECOMMENCE (il perd l'étoile du sans-faute).
         `force`  = on contourne le verrou de progression (API de test, écran de
         fin). Les deux étaient confondus : lancer une énigme par
         ILYOS_PUZZLE.start() la comptait comme reprise et lui retirait ses
         étoiles avant même le premier coup. */
      function puzzleStart(index, { replay = false, force = false } = {}) {
        const def = PUZZLES[index];
        if (!def) return;
        if (!force && !puzzleUnlocked(index)) return;

        puzzleCloseMenu();
        puzzleInjectStyle();
        puzzleBuildOverlay();

        const reprise = PUZZLE.active && PUZZLE.index === index;
        PUZZLE.restarted = replay ? true : (reprise ? PUZZLE.restarted : false);
        PUZZLE.index = index;
        PUZZLE.def = def;
        PUZZLE.ended = false;
        PUZZLE.active = true;
        PUZZLE.everStarted = true;

        // Efface un éventuel écran de fin resté du tour précédent.
        PUZZLE.dom.layer.querySelectorAll(".pz-end").forEach(node => node.remove());

        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
        try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }
        try { if (PUZZLE.prevRenderMode === null) PUZZLE.prevRenderMode = boardRenderMode; } catch (_) { }
        try { boardRenderMode = "3d"; } catch (_) { }

        puzzleBuildState(def);

        try { applyVisualMode("alternative"); } catch (_) { }
        try { if (typeof applyBoardRenderMode === "function") applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        els.gameScreen && els.gameScreen.classList.add("puzzle-on");
        els.gameScreen && els.gameScreen.classList.toggle("puzzle-no-place", !def.placement);
        els.gameScreen && els.gameScreen.classList.toggle("puzzle-one-turn", !puzzleIsMultiTurn(def));
        document.body.classList.add("puzzle-mode");
        // Une session précédente a pu laisser la vue tactique allumée.
        try { window.ILYOS_PLATEAU_2D?.activer(false); } catch (_) { }

        window.addEventListener("keydown", puzzleKeyGuard, true);
        ["contextmenu", "pointerdown", "mousedown", "mouseup", "auxclick"].forEach(type =>
          window.addEventListener(type, puzzleRightClickGuard, true));

        tutoRender();
        puzzleSyncOverlay();
        const [fr, fc] = puzzleFocusCell(def);
        puzzleFrame(fr, fc, def.zoom || 0);

        clearInterval(PUZZLE.pollTimer);
        PUZZLE.pollTimer = setInterval(puzzleTick, 300);
      }

      function puzzleRestart() {
        if (PUZZLE.index < 0) return;
        puzzleStart(PUZZLE.index, { replay: true, force: true });
      }

      /* ---------- Sortie ---------------------------------------------------- */
      function puzzleTeardown() {
        PUZZLE.active = false;
        PUZZLE.ended = true;
        clearInterval(PUZZLE.pollTimer);
        PUZZLE.pollTimer = null;
        window.removeEventListener("keydown", puzzleKeyGuard, true);
        ["contextmenu", "pointerdown", "mousedown", "mouseup", "auxclick"].forEach(type =>
          window.removeEventListener(type, puzzleRightClickGuard, true));
        els.gameScreen && els.gameScreen.classList.remove("puzzle-on", "puzzle-no-place", "puzzle-one-turn");
        document.body.classList.remove("puzzle-mode");
        if (PUZZLE.dom) { PUZZLE.dom.layer.remove(); PUZZLE.dom = null; }
        try { tutoUnlockCamera(); } catch (_) { }
        if (state) { state.puzzle = false; state.inputLocked = false; }
      }

      function puzzleBackToMenu() {
        puzzleTeardown();
        try { els.gameScreen.classList.add("hidden"); } catch (_) { }
        puzzleOpenMenu();
      }

      function puzzleQuitToHome() {
        const aJoue = PUZZLE.everStarted;
        puzzleCloseMenu();
        puzzleTeardown();
        /* Sortir de la seule liste n'a rien sali : l'iframe du menu est déjà
           là, sous l'écran de sélection, il suffit de le retirer. Après une
           énigme en revanche `state` porte un plateau taillé main, et seul un
           rechargement garantit une partie normale ensuite. */
        if (!aJoue) return;
        try {
          els.gameScreen.classList.add("hidden");
          els.setupScreen.classList.remove("hidden");
        } catch (_) { }
        try { location.reload(); } catch (_) { }
      }

      /* ---------- Écran de sélection ---------------------------------------- */
      function puzzleCloseMenu() {
        if (PUZZLE.menuDom) { PUZZLE.menuDom.remove(); PUZZLE.menuDom = null; }
        PUZZLE.menuOpen = false;
      }

      function puzzleOpenMenu() {
        puzzleInjectStyle();
        puzzleCloseMenu();
        const progress = puzzleLoadProgress();
        const resolus = PUZZLES.filter(def => progress[def.id]?.solved).length;

        const menu = document.createElement("div");
        menu.id = "puzzleMenu";
        const cartes = PUZZLES.map((def, index) => {
          const ouvert = puzzleUnlocked(index);
          const fiche = progress[def.id] || {};
          const etoiles = fiche.stars || 0;
          return `
            <button type="button" class="pz-card" data-index="${index}"${ouvert ? "" : " disabled"}>
              <div class="pz-num">ÉNIGME ${String(index + 1).padStart(2, "0")}</div>
              <div class="pz-name">${ouvert ? def.title : "· · ·"}</div>
              <div class="pz-line">${ouvert ? (def.tagline || "") : "Résous l'énigme précédente."}</div>
              <div class="pz-foot">
                <span class="stars">${ouvert ? "★".repeat(etoiles) + "☆".repeat(3 - etoiles) : "🔒"}</span>
                <span>${ouvert && def.par ? `optimal ${def.par}` : ""}</span>
              </div>
            </button>`;
        }).join("");

        menu.innerHTML = `
          <h1>PUZZLES</h1>
          <div class="pz-sub">${resolus} / ${PUZZLES.length} résolues — une main figée, un seul tour, aucun hasard.</div>
          <div class="pz-grid">${cartes}</div>
          <button type="button" class="pz-back">← Retour au menu</button>`;
        document.body.appendChild(menu);
        menu.querySelectorAll(".pz-card").forEach(carte => {
          carte.addEventListener("click", () => {
            if (carte.hasAttribute("disabled")) return;
            puzzleStart(Number(carte.dataset.index));
          });
        });
        menu.querySelector(".pz-back").addEventListener("click", () => puzzleQuitToHome());
        PUZZLE.menuDom = menu;
        PUZZLE.menuOpen = true;
      }

      /* ---------- Vérification des solutions de référence --------------------
         Chaque définition porte sa solution optimale. Ce n'est pas de la
         documentation : c'est l'oracle de test. `_verify(i)` la rejoue sur un
         plateau neuf et rend le verdict, en refusant toute action qu'un joueur
         ne pourrait pas produire lui-même :
         - un déplacement doit exister au sens de shortestMovementPath ;
         - une force de poussée ne peut dépasser les cartes PUSH disponibles,
           exactement comme le plafond `maxForce` de computePushOptionsForTarget.

         Sans ces deux gardes, l'oracle validerait des solutions injouables. */
      function puzzleResolveAction(step) {
        const charId = step.who ? PUZZLE.charsByKey[step.who] : null;
        if (step.a === "MOVE") {
          const char = characterById(charId);
          if (!char) return { error: `gardien ${step.who} introuvable` };
          const budget = availableActionCount("MOVE");
          const chemin = shortestMovementPath(char, step.to[0], step.to[1], budget);
          if (!chemin) return { error: `déplacement impossible vers ${step.to} (budget ${budget})` };
          const cout = chemin.cost ?? chemin.length;
          return { action: { type: "MOVE", charId, r: step.to[0], c: step.to[1], cost: cout }, cout };
        }
        if (step.a === "PUSH") {
          const budget = availableActionCount("PUSH");
          if (step.force > budget) return { error: `force ${step.force} > ${budget} cartes PUSH` };
          return {
            action: { type: "PUSH", pusherId: charId, r: step.on[0], c: step.on[1], force: step.force },
            cout: step.force
          };
        }
        if (step.a === "MAGIC") {
          const islandId = PUZZLE.islandsByKey[step.island];
          if (islandId == null) return { error: `île ${step.island} introuvable` };
          if (availableActionCount("MAGIC") < 1) return { error: "aucune carte MAGIE" };
          return {
            action: {
              type: "MAGIC", islandId, pivot: step.pivot,
              direction: step.direction ?? 1, turns: step.turns ?? 2
            },
            cout: 1
          };
        }
        return { error: `action inconnue ${step.a}` };
      }

      function puzzleVerify(index) {
        const def = PUZZLES[index];
        if (!def) return { id: null, ok: false, raison: "énigme inexistante" };
        if (!Array.isArray(def.solution) || !def.solution.length) {
          return { id: def.id, ok: false, raison: "aucune solution de référence" };
        }

        const etatReel = state;
        const actifAvant = PUZZLE.active;
        const defAvant = PUZZLE.def;
        try {
          PUZZLE.active = true;
          PUZZLE.def = def;
          puzzleBuildState(def);

          const journal = [];
          for (let i = 0; i < def.solution.length; i++) {
            const resolu = puzzleResolveAction(def.solution[i]);
            if (resolu.error) {
              return { id: def.id, ok: false, raison: `coup ${i + 1} : ${resolu.error}`, journal };
            }
            const resultat = appliquerActionNoyau(resolu.action);
            if (!resultat) {
              return { id: def.id, ok: false, raison: `coup ${i + 1} refusé par le noyau (${resolu.action.type})`, journal };
            }
            journal.push(`${resolu.action.type} ${resolu.cout}`);
          }

          const depense = puzzleCardsSpent();
          const atteint = puzzleGoalReached();
          return {
            id: def.id,
            ok: atteint && (!def.par || depense === def.par),
            atteint,
            depense,
            par: def.par ?? null,
            restant: puzzleCardsLeft(),
            journal,
            raison: atteint
              ? (def.par && depense !== def.par ? `objectif atteint mais ${depense} cartes au lieu de ${def.par}` : "")
              : "objectif non atteint"
          };
        } catch (error) {
          return { id: def.id, ok: false, raison: `exception : ${error && error.message}` };
        } finally {
          PUZZLE.active = actifAvant;
          PUZZLE.def = defAvant;
          state = etatReel;
        }
      }

      /* Une énigme multi-tours ne PEUT pas être vérifiée à côté du jeu : sa
         correction dépend de la vraie boucle de tour — la défausse qui devient
         réserve, la pioche des cinq cartes suivantes, le point accordé par
         scoreCrownsAtTurnStart, la riposte du rival. On la joue donc pour de
         bon, sur le vrai plateau, et on regarde le résultat.

         `solution` prend ici une liste par TOUR : [[coups du tour 1], [tour 2]].
         Chaque tour est suivi d'une vraie fin de tour, la dernière comprise —
         sans quoi le point ne serait jamais accordé. */
      async function puzzleVerifyLive(index) {
        const def = PUZZLES[index];
        const tours = def.solution || [];
        puzzleStart(index, { force: true });
        await tutoWait(350);

        const journal = [];
        for (let t = 0; t < tours.length; t++) {
          for (let i = 0; i < tours[t].length; i++) {
            const resolu = puzzleResolveAction(tours[t][i]);
            if (resolu.error) {
              return { id: def.id, ok: false, raison: `T${t + 1} coup ${i + 1} : ${resolu.error}`, journal };
            }
            if (!appliquerActionNoyau(resolu.action)) {
              return { id: def.id, ok: false, raison: `T${t + 1} coup ${i + 1} refusé par le noyau`, journal };
            }
            journal.push(`T${t + 1} ${resolu.action.type} ${resolu.cout}`);
            tutoRender();
          }

          if (puzzleGoalReached()) break;
          state.islandPlacedThisTurn = true;
          try { await endTurn(true); } catch (_) { }
          // Le tick joue la riposte puis rend la main : on attend ce retour.
          const limite = Date.now() + 12000;
          while (Date.now() < limite
            && !(state.currentPlayer === 0 && !PUZZLE.replying && !state.turnTransitioning)) {
            await tutoWait(80);
          }
          if (puzzleGoalReached()) break;
        }

        const atteint = puzzleGoalReached();
        const depense = puzzleCardsSpent();
        const conforme = atteint && (!def.par || depense === def.par);
        const rapport = {
          id: def.id, ok: conforme, atteint, depense, par: def.par ?? null,
          restant: puzzleCardsLeft(), journal,
          raison: atteint
            ? (def.par && depense !== def.par ? `objectif atteint mais ${depense} cartes au lieu de ${def.par}` : "")
            : "objectif non atteint"
        };
        puzzleTeardown();
        return rapport;
      }

      /* Les énigmes d'un seul tour passent par l'oracle détaché, instantané et
         sans effet de bord ; les multi-tours sont réellement jouées. */
      async function puzzleVerifyAll() {
        const resultats = [];
        for (let index = 0; index < PUZZLES.length; index++) {
          resultats.push(puzzleIsMultiTurn(PUZZLES[index])
            ? await puzzleVerifyLive(index)
            : puzzleVerify(index));
        }
        return resultats;
      }

      /* ---------- Câblage ---------------------------------------------------- */
      window.addEventListener("ilyos-puzzle-requested", () => puzzleOpenMenu());

      window.ILYOS_PUZZLE = {
        open: puzzleOpenMenu,
        start: index => puzzleStart(index, { force: true }),
        restart: puzzleRestart,
        exit: puzzleQuitToHome,
        list: () => PUZZLES.map((def, index) => ({
          index, id: def.id, title: def.title, board: def.board || 11, par: def.par ?? null
        })),
        /* Oracle de test : rejoue la solution de référence d'une énigme, ou de
           toutes, sans toucher à la partie en cours. */
        verify: index => puzzleIsMultiTurn(PUZZLES[index])
          ? puzzleVerifyLive(index)
          : puzzleVerify(index),
        verifyAll: puzzleVerifyAll,
        unlockAll: () => { try { localStorage.setItem(PUZZLE_DEV_KEY, "1"); } catch (_) { } },
        /* Vue de l'état pour les tests : une énigme se pilote par clics
           simulés, et sans ce point d'observation il faudrait deviner où elle
           en est. N'écrit rien. */
        _debug: () => ({
          active: PUZZLE.active,
          menuOpen: PUZZLE.menuOpen,
          index: PUZZLE.index,
          id: PUZZLE.def?.id || null,
          ended: PUZZLE.ended,
          /* Les règles sont appliquées de façon synchrone, mais l'animation qui
             les raconte garde la main verrouillée quelques centaines de
             millisecondes. Sans ce témoin, un test qui enchaîne deux gestes
             voit son second clic avalé sans rien dire. */
          inputLocked: !!state?.inputLocked,
          currentPlayer: state?.currentPlayer,
          rivalTurn: PUZZLE.rivalTurn || 0,
          replying: !!PUZZLE.replying,
          score: state?.players?.[0]?.score || 0,
          budget: PUZZLE.budget,
          restant: puzzleCardsLeft(),
          depense: puzzleCardsSpent(),
          goal: PUZZLE.active ? puzzleGoalReached() : null,
          fail: PUZZLE.active ? puzzleFailed() : null,
          hand: state?.players?.[0]?.hand?.map(card => card.action) || [],
          /* Options de poussée en attente. La difficulté d'une énigme tient
             souvent au CHOIX de la force ; sans cette vue, un test ne peut pas
             vérifier que le bon coup est seulement proposé. */
          pushOptions: (state?.pushOptions || []).map(option => ({
            force: option.force, fell: !!option.fell,
            r: option.r, c: option.c,
            lastLand: [option.lastLandR, option.lastLandC]
          })),
          chars: (state?.characters || []).map(ch => ({ id: ch.id, p: ch.player, r: ch.r, c: ch.c })),
          crowns: (state ? [state.artifact, state.secondArtifact] : [])
            .filter(crown => crown && crown.active)
            .map(crown => ({ id: crown.id, r: crown.r, c: crown.c, carrierId: crown.carrierId }))
        })
      };
