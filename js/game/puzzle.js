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

      /* La campagne parle de SANCTUAIRES, pas d'énigmes numérotées. Le joueur
         ne doit jamais lire « Puzzle 12/17 » : il lit un nom de lieu et l'état
         de son réveil. Les identifiants internes (p01…p17) ne bougent pas —
         c'est sur eux que la progression est enregistrée. */
      const PUZZLE_ACTES = {
        PROLOGUE: "Prologue · La première lueur",
        I: "Acte I · Les Voies éteintes",
        II: "Acte II · Les Îles se souviennent",
        III: "Acte III · La Dissonance",
        CONFLUENCE: "Confluence"
      };

      /* Les trois principes anciens ne sont JAMAIS présentés comme des
         catégories : un symbole discret sur la fiche, rien de plus. */
      const PUZZLE_PRINCIPES = {
        MESURE: { signe: "◆", nom: "La Mesure" },
        CADENCE: { signe: "◇", nom: "La Cadence" },
        TRACE: { signe: "◈", nom: "La Trace" }
      };

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
        markerKey: null,
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

      /* L'annulation rend les cartes au joueur ; le compteur doit les rendre
         aussi. On recalcule alors la dépense par différence — exact ici, parce
         qu'une énigme ne remélange jamais sa défausse (voir puzzlePlayRivalTurn)
         et que l'historique d'annulation ne franchit pas les tours. */
      function puzzlePotentialLeft() {
        const joueur = state?.players?.[0];
        if (!joueur) return 0;
        try {
          return (joueur.deck?.length || 0)
            + availableActionCount("MOVE", joueur)
            + availableActionCount("PUSH", joueur)
            + availableActionCount("MAGIC", joueur);
        } catch (_) { return 0; }
      }

      const puzzleRestoreUndoBase = restoreUndoSnapshot;
      restoreUndoSnapshot = function restoreUndoSnapshotPuzzleAware() {
        const restaure = puzzleRestoreUndoBase();
        if (restaure && PUZZLE.active) {
          PUZZLE.spent = Math.max(0, PUZZLE.budget - puzzlePotentialLeft());
        }
        return restaure;
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
          /* disableSecondCrown : sans lui, activateSecondCrownIfNeeded()
             fait surgir une seconde couronne dès qu'un gardien ramasse la
             première (voir core.js). Une énigme compte ses couronnes une par
             une — signalé en jeu sur la sixième, où passer la couronne à un
             allié en faisait apparaître une seconde. */
          rules: {
            allowDissolve: false, islandLimitPerPlayer: 0,
            shapeLimitPerOwner: 0, disableSecondCrown: true
          },
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

        /* Une case de village est de la TERRE au sens des règles — isLand()
           passe par villageAt() — mais rien ne la DESSINE : le château se
           retrouve suspendu à l'écart des îles, comme s'il flottait seul.
           On matérialise donc chaque coin de village qu'aucune île ne couvre.
           Sans effet sur les règles (la case était déjà praticable) ni sur les
           rotations (villageAt les refusait déjà), et le plateau redevient
           lisible. */
        Object.values(def.villages || {}).forEach(coins => {
          (coins || []).forEach(([r, c]) => {
            if (!islandAt(r, c)) tutoAddIsland([[r, c]], 0);
          });
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
          #puzzleLayer .pz-verite{display:inline-block;margin-bottom:10px;
            font-family:'Cinzel Decorative','Almendra',serif;font-size:16px;
            line-height:1.6;color:#ffe3ab;letter-spacing:.02em;}
          #puzzleLayer .pz-cout{opacity:.55;font-size:12.5px;}
          #puzzleMenu .pz-signe{font-size:14px;color:#8fa6d2;opacity:.8;}
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
        /* Les cases MARQUÉES comptent autant que le terrain dans le cadrage :
           plusieurs d'entre elles tombent dans le vide, hors de toute île, et
           le centre de gravité du seul terrain les laissait au ras de l'écran
           ou sous la barre d'action — signalé en jeu sur la neuvième. */
        puzzleMarkedCells(def).forEach(marque => cells.push([marque.r, marque.c]));
        if (!cells.length) return [CENTER.r, CENTER.c];
        const sr = cells.reduce((total, cell) => total + cell[0], 0);
        const sc = cells.reduce((total, cell) => total + cell[1], 0);
        return [Math.round(sr / cells.length), Math.round(sc / cells.length)];
      }

      /* ---------- Marquage des cases objectif ---------------------------
         Le joueur ne voit AUCUNE coordonnée : un énoncé qui en cite est
         illisible. Les cases qui comptent sont donc marquées sur le plateau,
         et les énoncés n'y renvoient plus que par « la case marquée ».

         Elles sont DÉDUITES de l'objectif, jamais déclarées une seconde fois :
         un énoncé et son marquage ne peuvent pas diverger.

         Le groupe est à part. `actionPreviewGroup` est balayé à chaque case
         survolée (voir refreshKayKitHoverPreviews) : un marqueur permanent y
         clignoterait sans arrêt. */
      const PUZZLE_MARKER_COLORS = {
        /* Trois couleurs, trois sens, et rien de plus à retenir : bleu, il faut
           un Gardien à toi ; or, il faut une couronne ; violet, le rival arrive.
           Les teintes sont SATURÉES à dessein — un pastel posé en
           MeshBasicMaterial sur une île vert vif ou un ciel clair vire au blanc
           et perd son sens (vérifié à l'écran sur le premier jet). */
        guardian: 0x1f8fff,   // amène un Gardien ici
        carrier: 0x1f8fff,    // un Gardien PORTANT une couronne (même famille)
        crown: 0xf0a800,      // pose une couronne ici
        threat: 0x9a63e0      // le rival a annoncé qu'il viendrait là
      };

      function puzzleGoalCellsFrom(goal, sortie = []) {
        if (!goal) return sortie;
        const pousser = (cells, kind) =>
          (cells || []).forEach(([r, c]) => sortie.push({ r, c, kind }));
        switch (goal.type) {
          case "occupyCells": pousser(goal.cells, "guardian"); break;
          case "reachCell": pousser([goal.cell], "guardian"); break;
          case "carryToCell": pousser([goal.cell], "carrier"); break;
          case "crownAtCell": pousser([goal.cell], "crown"); break;
          case "crownsAtCells": pousser(goal.cells, "crown"); break;
          case "all": (goal.goals || []).forEach(sous => puzzleGoalCellsFrom(sous, sortie)); break;
          default: break;
        }
        return sortie;
      }

      /* Les cases que le rival a ANNONCÉES. Son plan est public : le montrer
         sur le plateau évite d'avoir à le décrire en coordonnées. */
      function puzzleThreatCells(def) {
        const tour = def.replies?.[PUZZLE.rivalTurn] || [];
        return tour
          .filter(step => step.a === "MOVE" && Array.isArray(step.to))
          .map(step => ({ r: step.to[0], c: step.to[1], kind: "threat" }));
      }

      function puzzleMarkedCells(def) {
        return [...puzzleGoalCellsFrom(def.goal), ...puzzleThreatCells(def)];
      }

      /* Interrogé par ui.js pour autoriser le clic direct sur une case marquée.
         Rend faux hors énigme, pour ne rien changer à une partie normale. */
      function puzzleIsMarkedCell(r, c) {
        if (!PUZZLE.active || !PUZZLE.def) return false;
        return puzzleMarkedCells(PUZZLE.def).some(marque => marque.r === r && marque.c === c);
      }

      function puzzleMarkerGroup() {
        if (typeof kaykit3D === "undefined" || !kaykit3D || !kaykit3D.fxGroup) return null;
        if (typeof THREE === "undefined") return null;
        let groupe = kaykit3D.puzzleMarkerGroup;
        if (!groupe || !groupe.parent) {
          groupe = new THREE.Group();
          groupe.name = "ilyos-puzzle-markers";
          kaykit3D.fxGroup.add(groupe);
          kaykit3D.puzzleMarkerGroup = groupe;
        }
        return groupe;
      }

      /* Le glyphe est posé AU SOL, dans le carré, et non flottant au-dessus :
         il désigne alors la case elle-même au lieu de planer à côté d'elle.

         Les glyphes d'échecs (\u265F \u265A \u265B) ont été essayés et abandonnés :
         à la distance de caméra du jeu, une case fait une vingtaine de pixels
         et leurs détails tournent à la bouillie. On dessine donc des marques
         GÉOMÉTRIQUES — traits épais, silhouettes fermées — qui gardent leur
         forme une fois réduites. Une vraie rune gravée pourra les remplacer :
         il suffira de charger une image à la place du tracé, le reste ne
         bouge pas. */
      function puzzleGlyphTexture(kind, couleur) {
        const taille = 256;
        const canevas = document.createElement("canvas");
        canevas.width = canevas.height = taille;
        const ctx = canevas.getContext("2d");
        ctx.translate(taille / 2, taille / 2);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        const teinte = "#" + couleur.toString(16).padStart(6, "0");
        const tracerCouronne = () => {
          ctx.beginPath();
          ctx.moveTo(-72, 44);
          ctx.lineTo(-72, -26);
          ctx.lineTo(-36, 14);
          ctx.lineTo(0, -52);
          ctx.lineTo(36, 14);
          ctx.lineTo(72, -26);
          ctx.lineTo(72, 44);
          ctx.closePath();
        };
        const tracerChevron = () => {
          ctx.beginPath();
          ctx.moveTo(-62, -46);
          ctx.lineTo(62, -46);
          ctx.lineTo(0, 34);
          ctx.closePath();
          ctx.moveTo(-62, 52);
          ctx.lineTo(62, 52);
          ctx.lineTo(62, 72);
          ctx.lineTo(-62, 72);
          ctx.closePath();
        };
        const tracerCroix = () => {
          ctx.beginPath();
          ctx.moveTo(-56, -56); ctx.lineTo(56, 56);
          ctx.moveTo(56, -56); ctx.lineTo(-56, 56);
        };

        // Le contour sombre est tracé d'abord, en dessous : c'est lui qui
        // détache la marque du vert vif d'une île comme du ciel clair.
        ctx.strokeStyle = "rgba(8,14,28,.92)";
        ctx.fillStyle = teinte;

        if (kind === "threat") {
          tracerCroix();
          ctx.lineWidth = 46; ctx.stroke();
          ctx.strokeStyle = teinte;
          ctx.lineWidth = 28; ctx.stroke();
        } else {
          if (kind === "guardian") tracerChevron(); else tracerCouronne();
          ctx.lineWidth = 26; ctx.stroke();
          ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canevas);
        texture.userData = { ilyosTransient: true };
        return texture;
      }

      /* Cadre carré FIN. Une LineLoop ne convient pas : `linewidth` est ignoré
         par presque tous les pilotes, le trait resterait un cheveu à toute
         distance. On construit donc une vraie surface — un carré percé d'un
         carré — dont l'épaisseur se maîtrise au millième. */
      function puzzleFrameGeometry(exterieur, epaisseur) {
        const demi = exterieur / 2;
        const interieur = demi - epaisseur;
        const forme = new THREE.Shape();
        forme.moveTo(-demi, -demi);
        forme.lineTo(demi, -demi);
        forme.lineTo(demi, demi);
        forme.lineTo(-demi, demi);
        forme.closePath();
        const trou = new THREE.Path();
        trou.moveTo(-interieur, -interieur);
        trou.lineTo(interieur, -interieur);
        trou.lineTo(interieur, interieur);
        trou.lineTo(-interieur, interieur);
        trou.closePath();
        forme.holes.push(trou);
        return new THREE.ShapeGeometry(forme);
      }

      /* Équerres d'angle : quatre petits « L » qui tiennent les coins. C'est ce
         qui donne au marqueur sa lecture de VISEUR — la case est désignée, pas
         seulement encadrée — tout en gardant le trait fin. */
      function puzzleCornerPieces(exterieur, epaisseur, longueur) {
        const demi = exterieur / 2;
        const bord = demi - epaisseur / 2;
        const morceaux = [];
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
          morceaux.push({ w: longueur, h: epaisseur, x: sx * (demi - longueur / 2), y: sy * bord });
          morceaux.push({ w: epaisseur, h: longueur, x: sx * bord, y: sy * (demi - longueur / 2) });
        });
        return morceaux;
      }

      /* Cadre pointillé : la case n'est PAS encore de la terre. Tirets faits de
         vraies petites surfaces, pour la même raison que le cadre plein. */
      function puzzleDashedFrameGeometries(exterieur, epaisseur, tirets = 7) {
        const demi = exterieur / 2;
        const pas = exterieur / tirets;
        const plein = pas * .52;
        const morceaux = [];
        for (let i = 0; i < tirets; i++) {
          const centre = -demi + pas * (i + .5);
          morceaux.push({ w: plein, h: epaisseur, x: centre, y: demi - epaisseur / 2 });
          morceaux.push({ w: plein, h: epaisseur, x: centre, y: -demi + epaisseur / 2 });
          morceaux.push({ w: epaisseur, h: plein, x: -demi + epaisseur / 2, y: centre });
          morceaux.push({ w: epaisseur, h: plein, x: demi - epaisseur / 2, y: centre });
        }
        return morceaux;
      }

      function puzzleAddMarker(marque) {
        const groupe = puzzleMarkerGroup();
        if (!groupe) return;
        const { r, c, kind } = marque;
        const couleur = PUZZLE_MARKER_COLORS[kind] || PUZZLE_MARKER_COLORS.guardian;
        /* Hauteur du DESSUS DES ÎLES, y compris pour une case vide.
           kaykitCellSurfaceY() rend le niveau du plateau (.05) là où il n'y a
           pas de terre, contre .47 pour une île : en vue inclinée, le marqueur
           d'une case vide se retrouvait projeté nettement à côté de la grille
           — signalé en jeu comme un décalage. Une dalle fantôme doit se tenir
           là où le sol arrivera, pas 40 centimètres plus bas. */
        const p = kaykitCellPosition(r, c, KAYKIT_LEVELS.islandTop + .014);
        /* Une case sans terre reste une cible légitime — c'est même le sujet
           des énigmes où la rotation d'une île vient créer le sol. Elle se
           distingue par son cadre pointillé, et rien d'autre. */
        const surTerre = isLand(r, c);
        const cote = KAYKIT_CELL_SPACING * .9;
        const epaisseur = .046;

        const transitoire = objet => {
          objet.userData = { ...(objet.userData || {}), ilyosTransient: true };
          return objet;
        };
        const couche = (geo, mat, hauteur, ordre, dx = 0, dz = 0) => {
          const maille = new THREE.Mesh(transitoire(geo), transitoire(mat));
          maille.rotation.x = -Math.PI / 2;
          maille.position.set(p.x + dx, p.y + hauteur, p.z + dz);
          maille.renderOrder = ordre;
          groupe.add(maille);
          return maille;
        };
        const trait = (couleurTrait, opacite) => new THREE.MeshBasicMaterial({
          color: couleurTrait, transparent: true, opacity: opacite,
          side: THREE.DoubleSide, depthWrite: false, depthTest: false
        });

        /* L'aplat : la surface teintée qui remplit l'intérieur du carré, par
           opposition au cadre qui n'en dessine que le contour. C'est lui qui
           fait lire « cette CASE est une cible » plutôt que « il y a un trait
           ici », et dans le vide c'est lui qui donne au marqueur l'épaisseur
           d'une dalle fantôme au lieu d'un cadre suspendu. */
        couche(
          new THREE.PlaneGeometry(cote, cote),
          new THREE.MeshBasicMaterial({
            color: couleur, transparent: true, opacity: surTerre ? .34 : .24,
            side: THREE.DoubleSide, depthWrite: false, depthTest: true
          }),
          .075, 44
        );

        /* Liseré sombre glissé sous le cadre : c'est lui qui garde le trait fin
           lisible sur un ciel clair, où une couleur seule se dissoudrait. */
        const poserMorceaux = (morceaux, materiau, hauteur, ordre) => {
          morceaux.forEach(t => couche(
            new THREE.PlaneGeometry(t.w, t.h), materiau.clone(), hauteur, ordre, t.x, -t.y
          ));
        };

        if (surTerre) {
          couche(puzzleFrameGeometry(cote + .022, epaisseur + .026), trait(0x0a1020, .45), .098, 48);
          couche(puzzleFrameGeometry(cote, epaisseur), trait(couleur, 1), .102, 50);
          // Les équerres ne sont posées que sur la terre : dans le vide, le
          // pointillé porte déjà toute la lecture, en ajouter les surchargerait.
          poserMorceaux(puzzleCornerPieces(cote + .05, epaisseur + .018, .2), trait(couleur, 1), .104, 51);
        } else {
          const ombre = puzzleDashedFrameGeometries(cote, epaisseur + .022);
          poserMorceaux(ombre, trait(0x0a1020, .45), .098, 48);
          poserMorceaux(puzzleDashedFrameGeometries(cote, epaisseur), trait(couleur, .95), .102, 50);
        }

        /* Le glyphe, à plat dans le carré. Il bat très légèrement — assez pour
           attirer l'oeil au premier regard, pas assez pour tirer dessus pendant
           toute la durée de l'énigme. */
        const glyphe = couche(
          new THREE.PlaneGeometry(cote * .74, cote * .74),
          new THREE.MeshBasicMaterial({
            map: puzzleGlyphTexture(kind, couleur),
            transparent: true, opacity: surTerre ? 1 : .88,
            depthWrite: false, depthTest: false
          }),
          .106, 52
        );
        glyphe.userData.pulse = true;
        glyphe.userData.pulsePhase = (r * 5 + c) * .41;
        kaykit3D.animatedObjects.push(glyphe);
      }

      /* Reconstruit seulement quand les cases marquées changent : le groupe
         survit aux survols, et la scène ne se refait pas à chaque battement
         d'horloge du moteur d'énigmes. */
      function puzzleRefreshMarkers() {
        if (!PUZZLE.active || !PUZZLE.def) return;
        const cells = puzzleMarkedCells(PUZZLE.def);
        const cle = JSON.stringify(cells);
        const groupe = puzzleMarkerGroup();
        if (!groupe) return;
        if (cle === PUZZLE.markerKey && groupe.children.length) return;
        PUZZLE.markerKey = cle;
        if (typeof clearKayKitGroup === "function") clearKayKitGroup(groupe);
        cells.forEach(puzzleAddMarker);
      }

      function puzzleClearMarkers() {
        PUZZLE.markerKey = null;
        const groupe = typeof kaykit3D !== "undefined" && kaykit3D
          ? kaykit3D.puzzleMarkerGroup : null;
        if (groupe && typeof clearKayKitGroup === "function") clearKayKitGroup(groupe);
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
        /* Le nom du lieu, pas un numéro d'énigme. */
        dom.title.textContent = def.title;
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

      /* UNE seule ligne au réveil, jamais deux (charte narrative). Quand le
         Sanctuaire porte une « vérité », c'est elle qu'on lit — une phrase
         mythologique qui dit ce que le joueur vient de comprendre, jamais quelle
         mécanique il a employée. Les Sanctuaires ordinaires gardent leur ligne
         d'enseignement, plus discrète : onze des dix-sept n'ont pas de vérité,
         et c'est ce qui donne du poids aux six autres. */
      function puzzleFinLigne(def, depense) {
        const compte = `<span class="pz-cout">${depense} carte${depense > 1 ? "s" : ""} dépensée${depense > 1 ? "s" : ""}${def.par ? ` — optimal : ${def.par}` : ""}</span>`;
        return def.verite
          ? `<span class="pz-verite">« ${def.verite} »</span><br>${compte}`
          : `${def.winLine || ""}<br>${compte}`;
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
          <h2>${won ? def.winTitle || "Sanctuaire éveillé" : "Le Sanctuaire reste éteint"}</h2>
          ${won ? `<div class="pz-stars">${"★".repeat(etoiles)}${"☆".repeat(3 - etoiles)}</div>` : ""}
          <p>${won ? puzzleFinLigne(def, depense) : def.failLine || "Il ne reste plus de quoi agir."}</p>
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
        puzzleRefreshMarkers();
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
        puzzleClearMarkers();
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
          const signe = PUZZLE_PRINCIPES[def.principe];
          return `
            <button type="button" class="pz-card" data-index="${index}"${ouvert ? "" : " disabled"}>
              <div class="pz-num">${PUZZLE_ACTES[def.acte] || ""}</div>
              <div class="pz-name">${ouvert ? def.title : "Sanctuaire ignoré"}</div>
              <div class="pz-line">${ouvert
                ? (fiche.solved ? "Sanctuaire éveillé" : "Sanctuaire dormant")
                : "La Voie ne mène pas encore jusqu'ici."}</div>
              <div class="pz-foot">
                <span class="stars">${ouvert ? "★".repeat(etoiles) + "☆".repeat(3 - etoiles) : "🔒"}</span>
                <span class="pz-signe" title="${signe ? signe.nom : ""}">${ouvert && signe ? signe.signe : ""}</span>
              </div>
            </button>`;
        }).join("");

        menu.innerHTML = `
          <h1>LES VOIES D'ILYOS</h1>
          <div class="pz-sub">${resolus} / ${PUZZLES.length} Sanctuaires éveillés — réveillez les Sanctuaires oubliés.</div>
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
        /* Transmission et dépôt sont GRATUITS : ni l'un ni l'autre ne passe
           par consumeSelectedActionCore (voir la phase DROP_TREASURE dans
           ui.js). L'oracle les rejoue avec les fonctions du jeu, sans coût,
           pour que la solution de référence décrive vraiment ce que le joueur
           fera à la souris. */
        if (step.a === "TRANSFER") {
          const source = characterById(charId);
          const cible = characterById(PUZZLE.charsByKey[step.to]);
          if (!source || !cible) return { error: `transmission : gardien introuvable` };
          if (Math.abs(source.r - cible.r) + Math.abs(source.c - cible.c) !== 1) {
            return { error: "transmission : gardiens non adjacents" };
          }
          const couronne = artifactCarriedBy(source.id);
          if (!couronne) return { error: `${step.who} ne porte aucune couronne` };
          if (!giveArtifactToCharacter(couronne, cible)) {
            return { error: `${step.to} porte déjà une couronne` };
          }
          return { action: null, cout: 0 };
        }
        /* Ramassage d'une couronne au sol par un Gardien ADJACENT : gratuit
           lui aussi (phase PICKUP_CROWN d'ui.js). C'est le geste qui manquait
           au vocabulaire, et dont l'oubli a faussé plusieurs `par`. */
        if (step.a === "PICKUP") {
          const char = characterById(charId);
          if (!char) return { error: "ramassage : gardien introuvable" };
          const [cr, cc] = step.on;
          if (Math.abs(char.r - cr) + Math.abs(char.c - cc) > 1) {
            return { error: "ramassage : couronne non adjacente" };
          }
          const couronne = looseArtifactAt(cr, cc);
          if (!couronne) return { error: `aucune couronne au sol en ${step.on}` };
          if (!giveArtifactToCharacter(couronne, char)) {
            return { error: `${step.who} porte déjà une couronne` };
          }
          return { action: null, cout: 0 };
        }
        if (step.a === "DROP") {
          const source = characterById(charId);
          if (!source) return { error: "dépôt : gardien introuvable" };
          const couronne = artifactCarriedBy(source.id);
          if (!couronne) return { error: `${step.who} ne porte aucune couronne` };
          const [dr, dc] = step.on;
          if (Math.abs(source.r - dr) + Math.abs(source.c - dc) !== 1) {
            return { error: "dépôt : case non adjacente" };
          }
          if (!isLand(dr, dc) || characterAt(dr, dc) || looseArtifactAt(dr, dc)) {
            return { error: `dépôt impossible sur ${step.on}` };
          }
          couronne.carrierId = null;
          couronne.r = dr;
          couronne.c = dc;
          return { action: null, cout: 0 };
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
            if (resolu.action) {
              const resultat = appliquerActionNoyau(resolu.action);
              if (!resultat) {
                return { id: def.id, ok: false, raison: `coup ${i + 1} refusé par le noyau (${resolu.action.type})`, journal };
              }
            }
            journal.push(`${resolu.action ? resolu.action.type : def.solution[i].a} ${resolu.cout}`);
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
            if (resolu.action && !appliquerActionNoyau(resolu.action)) {
              return { id: def.id, ok: false, raison: `T${t + 1} coup ${i + 1} refusé par le noyau`, journal };
            }
            journal.push(`T${t + 1} ${resolu.action ? resolu.action.type : tours[t][i].a} ${resolu.cout}`);
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
          /* Une énigme `wip` est jouable mais n'a pas encore de solution de
             référence vérifiée : la passer à l'oracle ne dirait rien d'utile.
             Le marqueur rend l'inachèvement visible dans le code plutôt que de
             le cacher derrière un `par` inventé. */
          if (PUZZLES[index].wip) continue;
          resultats.push(puzzleIsMultiTurn(PUZZLES[index])
            ? await puzzleVerifyLive(index)
            : puzzleVerify(index));
        }
        return resultats;
      }

      /* ---------- Chercheur de raccourcis --------------------------------
         Une solution de référence qui marche ne prouve RIEN sur son coût : elle
         dit qu'un chemin existe, pas qu'il est le moins cher. Quatre `par`
         annoncés se sont révélés faux en jeu, tous pour la même raison — un
         geste GRATUIT oublié : un Gardien voisin d'une couronne au sol la
         ramasse sans dépenser de carte (voir la phase PICKUP_CROWN d'ui.js).

         Ce chercheur explore l'espace des coups par coût croissant et s'arrête
         au premier chemin qui atteint l'objectif. Il n'écrit aucune règle : il
         énumère les coups avec les fonctions du jeu — movementRange pour les
         déplacements, collectUnifiedPushOptions pour les poussées,
         calculateIslandRotationAroundPivot pour les rotations — et les applique
         par appliquerActionNoyau.

         RELAXATION ASSUMÉE : la recherche donne toutes les cartes de la pioche
         d'emblée et ne termine jamais de tour. Sur une énigme d'un seul tour
         c'est exact ; sur une énigme multi-tours cela rend une BORNE
         INFÉRIEURE, qu'il faut confronter au découpage des tours. Un optimum
         trouvé sous cette borne est donc toujours un vrai problème ; l'inverse
         demande vérification. */
      const PUZZLE_SEARCH_MAX_NODES = 60000;

      function puzzleSearchActions() {
        const actions = [];
        const aMoi = char => char && char.player === 0;

        /* Gratuits d'abord : ramassage, transmission, dépôt. Ils ne coûtent
           aucune carte et sont précisément ce que les `par` ignoraient. */
        activeArtifacts().filter(a => a.carrierId === null && Number.isFinite(a.r)).forEach(couronne => {
          orthogonalNeighbors(couronne.r, couronne.c).forEach(([r, c]) => {
            const voisin = characterAt(r, c);
            if (aMoi(voisin) && !artifactCarriedBy(voisin.id)) {
              actions.push({ a: "PICKUP", charId: voisin.id, crownId: couronne.id, cout: 0 });
            }
          });
        });

        (state.characters || []).filter(aMoi).forEach(porteur => {
          const couronne = artifactCarriedBy(porteur.id);
          if (!couronne) return;
          orthogonalNeighbors(porteur.r, porteur.c).forEach(([r, c]) => {
            const voisin = characterAt(r, c);
            if (aMoi(voisin) && !artifactCarriedBy(voisin.id)) {
              actions.push({ a: "TRANSFER", fromId: porteur.id, toId: voisin.id, cout: 0 });
            } else if (!voisin && isLand(r, c) && !looseArtifactAt(r, c)) {
              actions.push({ a: "DROP", charId: porteur.id, r, c, cout: 0 });
            }
          });
        });

        const budgetMove = availableActionCount("MOVE");
        if (budgetMove > 0) {
          (state.characters || []).filter(aMoi).forEach(char => {
            const portee = movementRange(char, budgetMove);
            portee.forEach(cle => {
              const [r, c] = cle.split(",").map(Number);
              const cout = portee.costs?.get(cle);
              if (Number.isFinite(cout) && cout > 0) {
                actions.push({ a: "MOVE", charId: char.id, r, c, cout });
              }
            });
          });
        }

        if (availableActionCount("PUSH") > 0) {
          collectUnifiedPushOptions().forEach(option => {
            const cible = option.targetType === "crown"
              ? artifactById(option.targetId)
              : characterById(option.targetId);
            if (!cible) return;
            actions.push({
              a: "PUSH", pusherId: option.pusherId,
              r: cible.r, c: cible.c, force: option.force, cout: option.force
            });
          });
        }

        if (availableActionCount("MAGIC") > 0) {
          (state.islands || []).forEach(ile => {
            ile.cells.forEach(([pr, pc]) => {
              [[1, 1], [-1, 1], [1, 2]].forEach(([direction, turns]) => {
                const rotation = calculateIslandRotationAroundPivot(ile, pr, pc, direction, turns);
                if (rotation?.valid) {
                  actions.push({
                    a: "MAGIC", islandId: ile.id, pivot: [pr, pc],
                    direction, turns, cout: 1
                  });
                }
              });
            });
          });
        }

        return actions;
      }

      function puzzleSearchApply(action) {
        if (action.a === "PICKUP") {
          const char = characterById(action.charId);
          const couronne = artifactById(action.crownId);
          return !!(char && couronne && giveArtifactToCharacter(couronne, char));
        }
        if (action.a === "TRANSFER") {
          const source = characterById(action.fromId);
          const cible = characterById(action.toId);
          const couronne = source ? artifactCarriedBy(source.id) : null;
          return !!(cible && couronne && giveArtifactToCharacter(couronne, cible));
        }
        if (action.a === "DROP") {
          const char = characterById(action.charId);
          const couronne = char ? artifactCarriedBy(char.id) : null;
          if (!couronne) return false;
          couronne.carrierId = null;
          couronne.r = action.r;
          couronne.c = action.c;
          return true;
        }
        /* Les coups de recherche portent `a:` (vocabulaire des définitions) ;
           le noyau attend `type:`. Sans cette traduction, appliquerActionNoyau
           tombait sur son `default` et rejetait TOUT en silence — la recherche
           n'explorait qu'un seul nœud. */
        if (action.a === "MOVE") {
          return !!appliquerActionNoyau({
            type: "MOVE", charId: action.charId, r: action.r, c: action.c, cost: action.cout
          });
        }
        if (action.a === "PUSH") {
          return !!appliquerActionNoyau({
            type: "PUSH", pusherId: action.pusherId, r: action.r, c: action.c, force: action.force
          });
        }
        if (action.a === "MAGIC") {
          return !!appliquerActionNoyau({
            type: "MAGIC", islandId: action.islandId, pivot: action.pivot,
            direction: action.direction, turns: action.turns
          });
        }
        return false;
      }

      /* Toutes les cartes en main d'emblée : c'est la relaxation décrite plus
         haut, seule façon d'explorer sans simuler les fins de tour. */
      function puzzleSearchBuild(def) {
        puzzleBuildState(def);
        const joueur = state.players[0];
        (joueur.deck || []).forEach(carte => joueur.hand.push({ ...carte, used: false }));
        joueur.deck = [];
      }

      function puzzleSearchReplay(def, chemin) {
        puzzleSearchBuild(def);
        for (const action of chemin) {
          if (!puzzleSearchApply(action)) return false;
        }
        return true;
      }

      function puzzleSearchLabel(action) {
        if (action.a === "MOVE") return `MOVE ${action.charId}->${action.r},${action.c} (${action.cout})`;
        if (action.a === "PUSH") return `PUSH ${action.pusherId} sur ${action.r},${action.c} f${action.force}`;
        if (action.a === "MAGIC") return `MAGIC île${action.islandId} pivot ${action.pivot} t${action.turns}d${action.direction}`;
        if (action.a === "PICKUP") return `PICKUP ${action.charId}`;
        if (action.a === "TRANSFER") return `TRANSFER ${action.fromId}->${action.toId}`;
        if (action.a === "DROP") return `DROP ${action.charId} en ${action.r},${action.c}`;
        return action.a;
      }

      /* Recherche par coût croissant (files par coût : les coûts sont de petits
         entiers, une file à seaux suffit et évite tout tri). */
      function puzzleSolve(index, plafond = null, secondesMax = 60) {
        const def = PUZZLES[index];
        if (!def) return { id: null, error: "énigme inexistante" };

        const etatReel = state;
        const actifAvant = PUZZLE.active;
        const defAvant = PUZZLE.def;
        const depart = Date.now();
        const finAu = depart + secondesMax * 1000;
        try {
          PUZZLE.active = true;
          PUZZLE.def = def;

          const budget = puzzleDeckList(def.deck).length || puzzleHandList(def.hand).length;
          const coutMax = Number.isFinite(plafond) ? plafond : budget;
          const seaux = [];
          const vus = new Set();
          const pousser = (cout, chemin) => {
            if (cout > coutMax) return;
            (seaux[cout] ||= []).push(chemin);
          };

          /* L'objectif `scored` attend le point accordé par
             scoreCrownsAtTurnStart, donc un changement de tour — que la
             recherche ne simule jamais. On lui substitue l'état DEPUIS LEQUEL
             ce point sera accordé, c'est-à-dire exactement l'éligibilité que
             cette fonction teste : porteur vivant sur une case de validation
             libre de tout rival. Sans cette substitution, la recherche ne
             trouve jamais rien sur les énigmes multi-tours. */
          const butReel = def.goal?.type === "scored"
            ? { type: "crownDelivered", player: def.goal.player ?? 0 }
            : def.goal;
          const atteint = () => {
            const predicat = PUZZLE_GOALS[butReel?.type];
            try { return !!predicat && !!predicat(def, butReel); } catch (_) { return false; }
          };

          puzzleSearchBuild(def);
          if (atteint()) return { id: def.id, cout: 0, chemin: [] };
          vus.add(strategicStateFingerprint());
          const coupsRacine = puzzleSearchActions().map(puzzleSearchLabel);
          pousser(0, []);

          let noeuds = 0;
          for (let cout = 0; cout <= coutMax; cout++) {
            const file = seaux[cout];
            if (!file) continue;
            while (file.length) {
              const chemin = file.shift();
              if (++noeuds > PUZZLE_SEARCH_MAX_NODES || Date.now() > finAu) {
                return {
                  id: def.id, epuise: true, noeuds, coutMax,
                  secondes: Math.round((Date.now() - depart) / 100) / 10,
                  error: Date.now() > finAu
                    ? `exploration interrompue après ${secondesMax} s (${noeuds} nœuds)`
                    : `exploration interrompue à ${noeuds} nœuds`
                };
              }
              if (!puzzleSearchReplay(def, chemin)) continue;

              /* Un INSTANTANÉ du nœud, pris une seule fois. Chaque successeur
                 le restaure au lieu de reconstruire le plateau et de rejouer
                 tout le chemin : le rejeu coûtait O(profondeur) par arête, ce
                 qui rendait la recherche inutilisable dès qu'une énigme passait
                 la dizaine de cartes (vingt minutes sans réponse sur le boss).
                 snapshotState/applyStateSnapshot sont ceux du jeu, synchrones,
                 et déjà employés par l'annulation. */
              const instantane = snapshotState();
              const coups = puzzleSearchActions();

              for (const action of coups) {
                const suivant = cout + action.cout;
                if (suivant > coutMax) continue;
                if (!applyStateSnapshot(JSON.parse(instantane))) break;
                if (!puzzleSearchApply(action)) continue;
                const empreinte = strategicStateFingerprint();
                if (vus.has(empreinte)) continue;
                vus.add(empreinte);
                const nouveau = [...chemin, action];
                if (atteint()) {
                  return {
                    id: def.id, cout: suivant, noeuds,
                    secondes: Math.round((Date.now() - depart) / 100) / 10,
                    chemin: nouveau.map(puzzleSearchLabel)
                  };
                }
                pousser(suivant, nouveau);
              }
            }
          }
          return {
            id: def.id, cout: null, noeuds, coutMax, coupsRacine,
            secondes: Math.round((Date.now() - depart) / 100) / 10,
            message: `aucune solution à ${coutMax} cartes ou moins`
          };
        } catch (error) {
          return { id: def.id, error: `exception : ${error && error.message}` };
        } finally {
          PUZZLE.active = actifAvant;
          PUZZLE.def = defAvant;
          state = etatReel;
        }
      }

      /* ---------- Audit de conception -------------------------------------
         Le chercheur d'optimum ne tient pas les grandes énigmes. Cet audit
         répond à d'autres questions, moins ambitieuses mais décisives quand on
         dessine un plateau :

         - quelles rotations sont légales, et OÙ elles emmènent les cases ;
         - qui elles transportent — Gardien, rival ou couronne posée ;
         - quelles cases un Gardien peut atteindre à pied, donc quelles régions
           sont réellement séparées ;
         - quelles îles ne servent à rien.

         Il ne prouve rien sur le coût. Il montre la topologie, ce qui suffit à
         repérer un raccourci qui saute une moitié du puzzle. */
      function puzzleAudit(index = PUZZLE.index) {
        const def = PUZZLES[index];
        if (!def) return { error: "énigme inexistante" };

        const etatReel = state;
        const actifAvant = PUZZLE.active;
        const defAvant = PUZZLE.def;
        try {
          PUZZLE.active = true;
          PUZZLE.def = def;
          puzzleBuildState(def);

          const nom = ile => Object.keys(PUZZLE.islandsByKey)
            .find(cle => PUZZLE.islandsByKey[cle] === ile.id) || `île${ile.id}`;

          /* Toutes les rotations légales, avec ce qu'elles emportent. */
          const rotations = [];
          (state.islands || []).forEach(ile => {
            ile.cells.forEach(([pr, pc]) => {
              [[1, 1], [-1, 1], [1, 2]].forEach(([direction, turns]) => {
                const rot = calculateIslandRotationAroundPivot(ile, pr, pc, direction, turns);
                if (!rot?.valid) return;
                const passagers = (rot.characterMoves || [])
                  .filter(m => m.char.r !== m.r || m.char.c !== m.c)
                  .map(m => `${m.char.player === 0 ? "allié" : "RIVAL"} ${m.char.r},${m.char.c}->${m.r},${m.c}`);
                rotations.push({
                  ile: nom(ile),
                  pivot: [pr, pc],
                  tour: turns === 2 ? "180" : (direction === 1 ? "90+" : "90-"),
                  cases: rot.absCells.map(([r, c]) => `${r},${c}`).join(" "),
                  passagers
                });
              });
            });
          });

          /* LE contrôle décisif : pour CHAQUE rotation légale, on l'applique et
             on redemande au moteur si un Gardien du sud atteint le village à
             pied. Vérifier les adjacences à l'œil ne marche pas — une diagonale
             franchit un coin, et deux corrections successives m'ont échappé
             pour cette raison. Ici c'est movementRange qui répond. */
          const ponts = [];
          const convois = [];
          const depots = [];
          rotations.forEach(rot => {
            const avant = snapshotState();
            const ile = state.islands.find(i => nom(i) === rot.ile);
            const calc = ile && calculateIslandRotationAroundPivot(
              ile, rot.pivot[0], rot.pivot[1],
              rot.tour === "90-" ? -1 : 1, rot.tour === "180" ? 2 : 1);
            if (calc?.valid) {
              applyMagicRotationCore(ile.id, calc);
              const ouvre = (state.characters || [])
                .filter(ch => ch.player === 0 && ch.r >= 4)
                .some(ch => [...movementRange(ch, 99)]
                  .some(k => k === "0,0" || k === "1,0" || k === "0,1"));
              if (ouvre) ponts.push(`${rot.ile} pivot ${rot.pivot} ${rot.tour} -> [${rot.cases}]`);
              /* Second angle mort, tout aussi coûteux : une rotation qui
                 n'ouvre AUCUNE route mais convoie un Gardien sur une longue
                 distance. Un trajet gratuit de quatre cases vaut quatre
                 DÉPLACER, et peut contourner une région entière. */
              /* Indépendant des occupants : ce qui compte n'est pas qui se
                 tient sur l'île MAINTENANT, mais où un passager SERAIT déposé
                 s'il y montait en cours de partie. On regarde donc le trajet de
                 chaque CASE. Ne pas le faire m'a coûté deux raccourcis : la
                 passerelle dressée dépose son passager au pied du village, et
                 personne n'est dessus au premier tour. */
              ile.cells.forEach(([cr, cc], i) => {
                const [nr, nc] = calc.absCells[i] || [];
                if (!Number.isFinite(nr)) return;
                const d = Math.abs(cr - nr) + Math.abs(cc - nc);
                if (d >= 3) {
                  convois.push(`${rot.ile} pivot ${rot.pivot} ${rot.tour} : ${cr},${cc}->${nr},${nc} (${d} cases)`);
                }
                /* Un passager déposé au nord, ou à une diagonale du nord, a
                   franchi le gouffre sans le franchir. */
                if (cr >= 4 && nr <= 2) {
                  depots.push(`${rot.ile} pivot ${rot.pivot} ${rot.tour} : ${cr},${cc}->${nr},${nc} (dépose au NORD)`);
                }
              });
            }
            applyStateSnapshot(JSON.parse(avant));
          });

          /* Régions accessibles à pied : un budget énorme révèle la topologie
             réelle, diagonales comprises. */
          const pied = (state.characters || []).filter(ch => ch.player === 0).map(ch => {
            const portee = movementRange(ch, 99);
            return {
              gardien: `${ch.r},${ch.c}`,
              atteint: [...portee].length,
              village: [...portee].some(k => k === "0,0" || k === "1,0" || k === "0,1")
            };
          });

          return { id: def.id, rotations, pied, ponts, convois, depots };
        } catch (error) {
          return { error: `exception : ${error && error.message}` };
        } finally {
          PUZZLE.active = actifAvant;
          PUZZLE.def = defAvant;
          state = etatReel;
        }
      }

      /* ---------- Câblage ---------------------------------------------------- */
      window.addEventListener("ilyos-puzzle-requested", () => puzzleOpenMenu());

      window.ILYOS_PUZZLE = {
        open: puzzleOpenMenu,
        start: index => puzzleStart(index, { force: true }),
        /* Adressage par IDENTIFIANT : l'ordre de la campagne n'est plus celui
           des identifiants, et un test qui vise un index vise le mauvais
           Sanctuaire dès qu'on réordonne. */
        startById: id => puzzleStart(PUZZLES.findIndex(def => def.id === id), { force: true }),
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
        /* Cherche le chemin le MOINS CHER vers l'objectif. Sert à établir les
           `par` sur preuve plutôt que sur la solution qu'on avait en tête. */
        solve: (index, plafond, secondesMax) => puzzleSolve(index, plafond, secondesMax),
        /* Topologie d'une énigme : rotations légales, ce qu'elles transportent,
           et ce qu'un Gardien atteint à pied. */
        audit: puzzleAudit,
        unlockAll: () => { try { localStorage.setItem(PUZZLE_DEV_KEY, "1"); } catch (_) { } },
        /* Force un recalcul des marqueurs (mise au point du rendu). */
        refreshMarkers: () => { PUZZLE.markerKey = null; puzzleRefreshMarkers(); },
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
