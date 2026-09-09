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

      /* Un Relais de campagne peut occuper trois cases qui ne sont pas dans
         un coin. On conserve le château et toutes les règles de validation
         existantes ; seule la forme de sa zone vient alors de la définition. */
      const puzzleCornerCrownCellsBase = cornerCrownCellsForVillage;
      cornerCrownCellsForVillage = function cornerCrownCellsForVillagePuzzleAware(village) {
        const relais = PUZZLE.active && PUZZLE.def?.validation;
        const villageDuJoueur = state?.players?.[0] && villagesForPlayer(state.players[0])
          .some(v => v.r === village?.r && v.c === village?.c);
        if (relais && villageDuJoueur) return relais.map(([r, c]) => [r, c]);
        return puzzleCornerCrownCellsBase(village);
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

      /* CHANTIER DES TRANSITIONS — tout est ouvert.
         Régler un voyage demande de l'atteindre des dizaines de fois, et les
         Sanctuaires intéressants sont en fin de campagne. Exiger de résoudre
         les dix-sept précédents rendrait le travail impraticable.

         À REMETTRE quand les transitions seront réglées : il suffit de rendre
         sa ligne à la fonction ci-dessous. La progression, elle, continue
         d'être enregistrée normalement — rien n'est perdu. */
      const PUZZLE_TOUT_OUVERT = true;

      function puzzleDevUnlocked() {
        if (PUZZLE_TOUT_OUVERT) return true;
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

        /* Chaque Gardien NOMMÉ sur SA case, en même temps. La différence avec
           occupyCells n'est pas cosmétique : tant que n'importe qui pouvait
           remplir n'importe quelle case, le joueur se contentait d'envoyer
           chacun vers la plus proche et toute contrainte d'ordre se dissolvait.
           En liant le porteur à sa destination, on rend les croisements
           obligatoires — c'est la leçon des Quatre mains, qui n'en avait
           aucune. */
        assignedCells(def, goal) {
          return Object.entries(goal.pairs || {}).every(([cle, cellule]) => {
            const char = characterById(PUZZLE.charsByKey[cle]);
            return !!char && char.player === (goal.player ?? 0)
              && char.r === cellule[0] && char.c === cellule[1];
          });
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
          /* Pendant une séquence, le calque CAPTE les clics : c'est ce qui
             permet de la passer, et cela évite au passage qu'un clic destiné
             à l'interrompre sélectionne un Gardien sur le plateau. */
          #puzzleLayer.reveil{pointer-events:auto;}
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
          /* Le réveil du Sanctuaire. Trois calques seulement : une lueur qui
             monte du sol, une phrase posée sur le ciel, un fondu. Le reste du
             mouvement vient de la CAMÉRA, qui recule — c'est elle qui donne
             l'échelle, pas un effet. */
          #puzzleLayer .pz-bloom{position:absolute;inset:0;z-index:5;pointer-events:none;
            opacity:0;background:radial-gradient(circle at 50% 58%,
              rgba(255,238,190,.95),rgba(255,206,120,.35) 42%,rgba(255,200,110,0) 70%);}
          #puzzleLayer .pz-bloom.on{animation:pz-bloom-k 2.6s ease-out;}
          @keyframes pz-bloom-k{0%{opacity:0}12%{opacity:1}100%{opacity:0}}

          /* Le ciel d'ILYOS est CLAIR : un texte doré posé dessus sans voile
             se perd dans les nuages. Le dégradé est porté par l'élément
             lui-même — un ::before en z-index négatif ne peint pas de façon
             fiable sous un parent en opacité animée. */
          #puzzleLayer .pz-caption{position:absolute;left:50%;bottom:24%;
            transform:translateX(-50%) translateY(10px);z-index:9;
            width:min(760px,92vw);padding:26px 40px;text-align:center;opacity:0;
            background:radial-gradient(ellipse at center,
              rgba(4,6,14,.72),rgba(4,6,14,.42) 52%,rgba(4,6,14,0) 78%);
            transition:opacity 1s ease, transform 1s ease;
            font-family:'Cinzel Decorative','Almendra',serif;
            font-size:clamp(16px,2.2vw,22px);line-height:1.65;color:#ffeec6;
            text-shadow:0 2px 18px rgba(0,0,0,.75),0 0 34px rgba(255,206,120,.35);}
          #puzzleLayer .pz-caption.show{opacity:1;transform:translateX(-50%) translateY(0);}

          /* LA RÉPONSE AU LOIN. Un autre Sanctuaire s'allume par-delà l'archipel
             — le joueur n'apprend jamais lequel. Posé haut et sur le côté, à
             hauteur d'horizon : sur le plateau, ce serait un effet de plus ;
             au loin, c'est quelqu'un. */
          #puzzleLayer .pz-lointain{position:absolute;left:76%;top:34%;z-index:6;
            width:190px;height:190px;margin:-95px 0 0 -95px;pointer-events:none;opacity:0;
            background:radial-gradient(circle at 50% 50%,
              rgba(255,246,214,.92) 0%,rgba(255,222,150,.55) 14%,
              rgba(255,206,120,.20) 34%,rgba(255,200,110,0) 66%);}
          #puzzleLayer .pz-lointain.on{animation:pz-loin-k 3s ease-in-out;}
          @keyframes pz-loin-k{0%{opacity:0;transform:scale(.55)}
            34%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.12)}}

          #puzzleLayer .pz-fade{position:absolute;inset:0;z-index:11;pointer-events:none;
            background:#04060d;opacity:0;transition:opacity .7s ease;}
          #puzzleLayer .pz-fade.on{opacity:1;}

          /* Le nom du lieu où l'on vient d'arriver, sur le noir, puis tenu
             pendant que l'archipel se découvre dessous. */
          /* Le nom se tient d'abord sur le noir, puis sur le ciel quand le rideau
             se lève : il lui faut son propre voile, comme à la vérité. */
          #puzzleLayer .pz-lieu{position:absolute;left:50%;top:44%;z-index:13;
            transform:translate(-50%,-50%);width:min(860px,94vw);padding:40px 40px 46px;
            text-align:center;opacity:0;pointer-events:none;transition:opacity .9s ease;
            background:radial-gradient(ellipse at center,
              rgba(4,6,14,.66),rgba(4,6,14,.34) 54%,rgba(4,6,14,0) 78%);}
          #puzzleLayer .pz-lieu.show{opacity:1;}
          #puzzleLayer .pz-lieu .acte{display:block;font-size:11.5px;letter-spacing:.24em;
            text-transform:uppercase;color:#c3d2ee;margin-bottom:14px;
            text-shadow:0 1px 12px rgba(0,0,0,.9);}
          #puzzleLayer .pz-lieu .nom{display:block;font-family:'Cinzel Decorative','Almendra',serif;
            font-size:clamp(24px,4.2vw,40px);letter-spacing:.08em;color:#ffe3ab;
            text-shadow:0 2px 26px rgba(0,0,0,.8),0 0 46px rgba(255,206,120,.3);}

          /* Pendant le réveil, le chrome de jeu s'efface : on regarde le ciel,
             on ne joue plus. */
          #gameScreen.puzzle-reveil #hudV2Top,
          #gameScreen.puzzle-reveil #hudV2Dock,
          #gameScreen.puzzle-reveil #turnRibbon,
          #gameScreen.puzzle-reveil #ilyosHudOrganicV2,
          #gameScreen.puzzle-reveil #hudV2Toast,
          #gameScreen.puzzle-reveil .hud-v2-vignette,
          body.puzzle-reveil #toast,
          /* Les couronnes se valident AU DÉBUT du tour suivant : la distribution
             des cartes vole donc à l'écran au moment exact où le Sanctuaire
             s'éveille. Ces cartes vivent sur <body>, hors de #gameScreen. */
          body.puzzle-reveil > .card-cycle-v7-card,
          body.puzzle-reveil > .card-cycle-v7-count{opacity:0 !important;
            transition:opacity .8s ease;pointer-events:none;}
          #puzzleLayer.reveil .pz-brief,
          #puzzleLayer.reveil .pz-budget,
          #puzzleLayer.reveil .pz-plan,
          #puzzleLayer.reveil .pz-tools{opacity:0;transition:opacity .8s ease;
            pointer-events:none;}

          #puzzleLayer .pz-verite{display:inline-block;margin-bottom:10px;
            font-family:'Cinzel Decorative','Almendra',serif;font-size:16px;
            line-height:1.6;color:#ffe3ab;letter-spacing:.02em;}
          #puzzleLayer .pz-cout{opacity:.55;font-size:12.5px;}
          #puzzleMenu .pz-signe{font-size:14px;color:#8fa6d2;opacity:.8;}
          #puzzleLayer .pz-stars{font-size:30px;letter-spacing:8px;
            filter:drop-shadow(0 0 10px rgba(255,205,110,.5));}
          #puzzleLayer .pz-end-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
          #puzzleLayer .pz-end-actions .primary{background:linear-gradient(180deg,#f0c273,#c98f36);
            border-color:rgba(255,226,167,.55);color:#2a1b04;font-weight:800;
            box-shadow:0 6px 20px rgba(201,143,54,.35);}

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
          #gameScreen.puzzle-on #turnTimer,
          #gameScreen.puzzle-on #ov2Timer,
          #gameScreen.puzzle-on [data-hud="timer"],
          #gameScreen.puzzle-on .turn-timer,
          #gameScreen.puzzle-on [data-hud-render],
          #gameScreen.puzzle-on .kaykit-camera-hint,
          #gameScreen.puzzle-on .kaykit-camera-controls,
          #gameScreen.puzzle-on .kaykit-control-btn,
          #gameScreen.puzzle-on .kaykit-ui,
          #gameScreen.puzzle-on .kaykit-controls,
          #gameScreen.puzzle-on [data-hud-render-toggle],
          #gameScreen.puzzle-on .hud-v2-render-toggle,
          #gameScreen.puzzle-on #instruction,
          #gameScreen.puzzle-on .ov2-instruction,
          #gameScreen.puzzle-on #newGameBtn,
          #gameScreen.puzzle-on .hud-v2-popover-render-grid,
          #gameScreen.puzzle-on .hud-v2-coordinate-help,
          /* L'intitulé de la section et le séparateur qui la suit : sans eux,
             « RENDU DU PLATEAU » restait affiché au-dessus d'un vide. :has()
             n'est pas indispensable — s'il n'est pas compris, la règle est
             simplement ignorée et il ne reste qu'un titre orphelin. */
          #gameScreen.puzzle-on .hud-v2-popover-section-label:has(+ .hud-v2-popover-render-grid),
          #gameScreen.puzzle-on .hud-v2-popover-divider:has(+ .hud-v2-popover-section-label + .hud-v2-popover-camera-grid){display:none !important;}

          /* Le panneau descend sous le bandeau de l'énigme. #puzzleLayer est en
             z-index 1500001 sur <body> : aucun sélecteur ne peut faire passer
             le popover au-dessus depuis l'intérieur de #gameScreen, et son
             premier intitulé se retrouvait caché derrière le titre du
             Sanctuaire. Les boutons, eux, restaient cliquables — le calque est
             en pointer-events:none. */
          #gameScreen.puzzle-on #hudV2GearPopover{margin-top:58px !important;}

          /* LA ROUE RESTE, et son contenu avec — sauf le rendu 2D.

             Elle était masquée avec le reste du chrome, ce qui privait le
             joueur des Règles, du Son et du réglage de Ciel pendant tout le
             mode où il en a le plus besoin : on y passe de longues minutes
             sur la même position. Ne restent interdits que « Nouvelle partie »,
             qui n'a aucun sens dans une énigme — « ← Les Voies » et
             « ↺ Recommencer » font le travail proprement — et la bascule 2D,
             qui casse six énigmes : le plateau tactique écarte les
             destinations hors grille, et une poussée qui éjecte par le BORD
             n'y a aucun repère cliquable. Les presets de CAMÉRA, eux, sont
             rendus : la caméra est déjà libre à l'orbite, et le cadrage
             imposé par puzzleFrame ne se ré-applique que dans les deux
             premières secondes. */
          #gameScreen.puzzle-no-place #ov2Island,
          #gameScreen.puzzle-no-place #islandSelector{display:none !important;}
          /* Le plateau tactique 2D est de nouveau AUTORISÉ. Il était interdit
             parce qu'il écartait les destinations hors grille : une poussée
             qui éjecte par le BORD du plateau n'y avait aucun repère
             cliquable, alors que la 3D pose son ☠ dans le vide — et c'est le
             coup gagnant de six énigmes. La vue 2D dessine désormais ces
             éjections dans sa marge et les exécute par ILYOS_BENCH.poussee(),
             le seul chemin possible puisqu'aucune case du plateau d'origine ne
             peut recevoir ce clic. */
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
        threat: 0x9a63e0,     // le rival a annoncé qu'il viendrait là
        /* Le sceau porte un RANG : la case et le Gardien attendu portent le
           même signe, et c'est la seule chose qui les appareille. */
        sceau: 0xffd98a
      };

      /* Une couleur PAR RANG. Les bâtons de comptage seuls ne suffisaient pas :
         vus de la caméra de jeu, quatre sceaux dorés posés aux quatre bouts d'un
         plateau se ressemblent, et les insignes portés par des Gardiens en file
         se recouvrent. La teinte se lit d'un coup d'oeil là où le compte demande
         qu'on s'approche ; les bâtons restent, pour qui distingue mal les
         couleurs. Quatre teintes franches, aucune verte — le vert se perdrait
         sur les îles. */
      const PUZZLE_SCEAU_COLORS = {
        1: 0x2b9dff,   // bleu
        2: 0xff8a32,   // orange
        3: 0xe256cf,   // magenta
        4: 0xff4d4d    // vermillon — le jaune essayé d'abord se dissolvait
                       //   sur le vert clair des îles comme sur le ciel
      };

      function puzzleGoalCellsFrom(goal, sortie = []) {
        if (!goal) return sortie;
        const pousser = (cells, kind) =>
          (cells || []).forEach(([r, c]) => sortie.push({ r, c, kind }));
        switch (goal.type) {
          case "occupyCells": pousser(goal.cells, "guardian"); break;
          /* Le RANG distingue les sceaux entre eux : sans lui, quatre cases
             identiques ne diraient pas laquelle attend qui. */
          case "assignedCells":
            Object.values(goal.pairs || {}).forEach(([r, c], index) =>
              sortie.push({ r, c, kind: "sceau", rang: index + 1 }));
            break;
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
      function puzzleGlyphTexture(kind, couleur, rang = 0) {
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
        } else if (kind === "sceau") {
          /* LE SCEAU : un losange fin, et dedans une des quatre LUMIÈRES —
             croissant, étoile, croix, anneau. Le rang ne se compte plus, il se
             reconnaît : c'est une SILHOUETTE, seule chose qui survive à vingt
             pixels sous une vue inclinée. Les hachures essayées avant étaient
             une texture, et une texture disparaît à cette taille. Le disque
             plein a été écarté : à côté de l'anneau, seul le trou les séparait.

             LE MOTIF EST CLAIR, PAS COLORÉ. Une forme saturée posée sur le vert
             vif d'une île perd la moitié de son contraste ; un motif ivoire
             cerné de sa teinte et nimbé d'un halo se détache des deux fonds du
             jeu — l'herbe et le ciel — sans rien devoir à la couleur, qui ne
             sert plus qu'à l'appariement. */
          const halo = (couleurHalo, force) => {
            ctx.shadowColor = couleurHalo;
            ctx.shadowBlur = force;
          };
          const sansHalo = () => { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; };

          const d = 104;
          const losange = (k = 1) => {
            const t = d * k;
            ctx.beginPath();
            ctx.moveTo(0, -t); ctx.lineTo(t, 0); ctx.lineTo(0, t); ctx.lineTo(-t, 0);
            ctx.closePath();
          };

          /* LE FOND SOMBRE, et c'est lui qui fait tout. Un premier essai posait
             un motif ivoire à même la case : sur le vert clair d'une île, clair
             sur clair, il ne restait rien. Le sceau porte donc son propre fond
             de nuit — le motif ne dépend plus du terrain sur lequel il tombe,
             et c'est ce que faisait l'image de référence sans qu'on le
             remarque. */
          losange(.94);
          ctx.fillStyle = "rgba(9,14,30,.88)";
          ctx.fill();

          // Cartouche : deux traits fins plutôt qu'un épais — c'est ce qui fait
          // la différence entre une bordure et un bijou.
          /* Halo COURT. Un halo large était superbe sur la texture et
             catastrophique à l'écran : le rendu passe par un bloom, qui
             ramassait ces pixels clairs et blanchissait toute la zone — îles
             comprises. Le contraste vient désormais du fond de nuit, pas de la
             lueur. */
          halo(teinte, 10);
          losange(1);
          ctx.strokeStyle = teinte; ctx.lineWidth = 9; ctx.stroke();
          sansHalo();
          losange(.84);
          ctx.strokeStyle = teinte; ctx.lineWidth = 4; ctx.stroke();

          /* Le motif tient dans le carré INSCRIT au losange, pas dans le
             losange : au-delà il déborderait sur les pointes. */
          const r = 54;
          ctx.beginPath();
          if (rang === 1) {
            // le Croissant
            ctx.arc(0, 0, r, Math.PI * .42, Math.PI * 1.58, false);
            ctx.arc(r * .42, 0, r * .86, Math.PI * 1.5, Math.PI * .5, true);
            ctx.closePath();
          } else if (rang === 2) {
            // l'Étoile — quatre branches, pas cinq : elles restent effilées
            for (let i = 0; i < 8; i++) {
              const a = i * Math.PI / 4 - Math.PI / 2;
              const rr = i % 2 ? r * .32 : r;
              ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
          } else if (rang === 3) {
            // la Croix
            const b = r * .32;
            ctx.rect(-b, -r, b * 2, r * 2);
            ctx.rect(-r, -b, r * 2, b * 2);
          } else {
            // l'Anneau — le trou est large, c'est lui qui porte la lecture
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.arc(0, 0, r * .54, 0, Math.PI * 2, true);
          }
          halo(teinte, 12);
          ctx.fillStyle = teinte; ctx.fill();
          sansHalo();
          // Un liseré ivoire À L'INTÉRIEUR du motif : il lui donne son éclat
          // sans lui retirer sa couleur, qui reste le signe d'appariement.
          ctx.strokeStyle = "rgba(255,246,226,.85)"; ctx.lineWidth = 4; ctx.stroke();

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
        const { r, c, kind, rang } = marque;
        const couleur = (kind === "sceau" && PUZZLE_SCEAU_COLORS[rang])
          || PUZZLE_MARKER_COLORS[kind] || PUZZLE_MARKER_COLORS.guardian;
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
            color: couleur, transparent: true,
            opacity: kind === "sceau" ? .12 : (surTerre ? .34 : .24),
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
            map: puzzleGlyphTexture(kind, couleur, rang),
            /* 80 % pour les glyphes ordinaires : ils désignent la case, ils ne la
               remplacent pas. Le SCEAU, lui, se rend plein : il porte son propre
               fond de nuit, et le diluer rendait ce fond gris — donc le motif
               illisible sur une île claire, ce qu'on cherchait justement à
               éviter. */
            transparent: true, opacity: kind === "sceau" ? 1 : (surTerre ? 1 : .88),
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

      /* LE SIGNE PORTÉ. Le moteur n'a qu'UN modèle de Gardien par joueur : quatre
         alliés sont visuellement identiques, et une consigne « celui-ci va
         là-bas » serait injouable telle quelle. On accroche donc au-dessus de
         chacun le même sceau que celui posé au sol — un sprite enfant de son
         wrapper, qui le suit sans qu'on ait à le repositionner. C'est la
         solution la plus légère : des variantes de modèle seraient un chantier
         dans kaykit3d.js, pour une énigme.

         Reconstruit quand un sceau a perdu son parent : les visuels de
         personnage sont recréés par syncKayKitCharacters, et un sprite orphelin
         cesse silencieusement d'être rendu. */
      function puzzleRefreshSceaux() {
        const paires = PUZZLE.def?.goal?.type === "assignedCells"
          ? PUZZLE.def.goal.pairs : null;
        const poses = PUZZLE.sceaux || (PUZZLE.sceaux = []);
        if (!paires || typeof kaykit3D === "undefined" || !kaykit3D?.characterVisuals) {
          if (poses.length) { poses.forEach(sp => sp.parent?.remove(sp)); poses.length = 0; }
          return;
        }
        const cles = Object.keys(paires);
        const complet = poses.length === cles.length && poses.every(sp => !!sp.parent);
        if (complet) return;

        poses.forEach(sp => sp.parent?.remove(sp));
        poses.length = 0;
        cles.forEach((cle, index) => {
          const visual = kaykit3D.characterVisuals.get(String(PUZZLE.charsByKey[cle]));
          if (!visual?.wrapper) return;
          /* LE MÊME LOSANGE, à plat sous les pieds, et non un insigne flottant.
             Deux essais ont échoué avant : haut dans le ciel, le sprite
             dérivait sur la case du voisin — la vue est inclinée, tout ce qui
             monte part vers le haut de l'écran, et les Gardiens se suivent en
             file d'une case ; posé sur le casque, il se confondait avec le
             modèle. Au sol, il ne peut désigner que la case où se tient son
             porteur, et il porte exactement le tracé gravé sur la case
             attendue : aucune traduction à faire. */
          const teinte = PUZZLE_SCEAU_COLORS[index + 1] || PUZZLE_MARKER_COLORS.sceau;
          /* Plus petit qu'une case : à pleine taille le losange débordait sous
             les pieds et, la vue étant inclinée, se lisait comme une dalle
             POSÉE DEVANT le Gardien plutôt que sous lui. Resserré, il devient
             un socle et le Gardien se tient dedans. */
          const anneau = new THREE.Mesh(
            new THREE.PlaneGeometry(.82, .82),
            new THREE.MeshBasicMaterial({
              map: puzzleGlyphTexture("sceau", teinte, index + 1),
              transparent: true,
              side: THREE.DoubleSide, depthWrite: false, depthTest: false
            })
          );
          anneau.rotation.x = -Math.PI / 2;
          anneau.position.set(0, .05, 0);
          anneau.renderOrder = 58;
          anneau.userData = { ilyosTransient: true };
          visual.wrapper.add(anneau);
          poses.push(anneau);
        });
      }

      function puzzleClearMarkers() {
        PUZZLE.markerKey = null;
        (PUZZLE.sceaux || []).forEach(sp => sp.parent?.remove(sp));
        PUZZLE.sceaux = [];
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
          <div class="pz-bloom"></div>
          <div class="pz-lointain"></div>
          <div class="pz-caption"></div>
          <div class="pz-fade"></div>
          <div class="pz-lieu"></div>
          <div class="pz-tools">
            <button type="button" data-pz="restart">↺ Recommencer</button>
            <button type="button" data-pz="menu">← Les Voies</button>
          </div>`;
        document.body.appendChild(layer);
        layer.querySelector('[data-pz="restart"]').addEventListener("click", () => puzzleRestart());
        layer.querySelector('[data-pz="menu"]').addEventListener("click", () => puzzleBackToMenu());
        PUZZLE.dom = {
          layer,
          title: layer.querySelector(".pz-title"),
          goal: layer.querySelector(".pz-goal"),
          budget: layer.querySelector(".pz-budget"),
          plan: layer.querySelector(".pz-plan"),
          bloom: layer.querySelector(".pz-bloom"),
          lointain: layer.querySelector(".pz-lointain"),
          caption: layer.querySelector(".pz-caption"),
          fade: layer.querySelector(".pz-fade"),
          lieu: layer.querySelector(".pz-lieu")
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

      /* Où se trouve le Sanctuaire : le coin du village du joueur. Les deux
         énigmes qui n'en ont pas — celle sans rival, celle sans couronne —
         retombent sur le cadrage de la définition. */
      function puzzleSanctuaireCell(def) {
        const coins = def.villages?.[0];
        if (coins && coins.length) return coins[0];
        return puzzleFocusCell(def);
      }

      /* LE RÉVEIL. Version courte et volontairement sobre : la lueur monte, la
         caméra RECULE — c'est elle qui donne l'échelle du réseau, pas un effet
         — et la vérité s'inscrit sur le ciel. Quatre secondes, interruptibles
         d'un clic. La carte de fin ne vient qu'après.

         Les variantes annoncées (Voie qui se divise, rayon interrompu, réponse
         au loin) attendent qu'il y ait une carte des Voies : les écrire
         maintenant serait décorer un réseau qui n'existe pas encore. */
      /* L'échafaudage commun aux deux séquences — l'approche et le réveil.
         Toutes deux effacent le même chrome, se passent du même geste et
         doivent se démonter même si un appel de caméra jette. Le corps reçoit
         `attendre`, qui rend la main dès que le joueur veut passer. */
      async function puzzleSequence(corps) {
        const dom = PUZZLE.dom;
        if (!dom || PUZZLE.sequenceEnCours) return;
        PUZZLE.sequenceEnCours = true;
        PUZZLE.sequenceSaute = false;

        /* Le geste qui DÉCLENCHE une séquence ne doit pas l'interrompre : le
           clic sur « Sanctuaire suivant » est encore en train de remonter le
           DOM quand ce code s'exécute, et un écouteur posé sur le calque le
           recevrait aussitôt — le voyage se jouait en entier en moins d'une
           seconde. On n'arme donc la sortie qu'une fois ce clic passé. */
        const passer = () => { PUZZLE.sequenceSaute = true; };
        const armement = setTimeout(() => {
          dom.layer.addEventListener("click", passer, { once: true });
          window.addEventListener("keydown", passer, { once: true });
        }, 260);
        const attendre = async ms => {
          const fin = Date.now() + ms;
          while (Date.now() < fin && !PUZZLE.sequenceSaute) await tutoWait(60);
        };

        try {
          dom.layer.classList.add("reveil");
          els.gameScreen && els.gameScreen.classList.add("puzzle-reveil");
          document.body.classList.add("puzzle-reveil");
          await corps(dom, attendre);
        } finally {
          clearTimeout(armement);
          dom.layer.removeEventListener("click", passer);
          window.removeEventListener("keydown", passer);
          dom.caption.classList.remove("show");
          dom.bloom.classList.remove("on");
          dom.lointain.classList.remove("on");
          dom.lieu.classList.remove("show");
          dom.fade.classList.remove("on");
          dom.layer.classList.remove("reveil");
          els.gameScreen && els.gameScreen.classList.remove("puzzle-reveil");
          document.body.classList.remove("puzzle-reveil");
          PUZZLE.sequenceEnCours = false;
        }
      }

      /* L'APPROCHE. Le premier Sanctuaire reprend le prologue vocal de
         l'ancienne Première Ascension. Il passe par puzzleSequence : un clic
         ou une touche rend donc immédiatement la main, sans nouveau système.
         Les autres approches gardent leur phrase courte et silencieuse. */
      function puzzleApproche(def) {
        if (!def.avant && !def.prologue) return;
        return puzzleSequence(async (dom, attendre) => {
          if (def.prologue) {
            const dire = async (texte, duree) => {
              dom.caption.textContent = texte;
              dom.caption.classList.add("show");
              try { tutoSpeak(texte); } catch (_) { }
              await attendre(duree);
              dom.caption.classList.remove("show");
              try { tutoStopSpeak(); } catch (_) { }
            };

            try {
              await attendre(450);
              if (PUZZLE.sequenceSaute) return;
              await dire("Ton village s'est éteint.", 2600);
              if (PUZZLE.sequenceSaute) return;
              await attendre(500);
              if (PUZZLE.sequenceSaute) return;
              try {
                if (typeof kaykitFollowCell === "function") {
                  kaykitFollowCell(6, 6, {
                    duration: 3600, force: true, cinematique: true, zoomBoost: -1.4
                  });
                }
              } catch (_) { }
              await attendre(1100);
              if (PUZZLE.sequenceSaute) return;
              await dire("Rien ne mène plus jusqu'à lui.", 3200);
              if (PUZZLE.sequenceSaute) return;
              await attendre(500);
            } finally {
              try { tutoStopSpeak(); } catch (_) { }
            }
            return;
          }

          await attendre(500);
          dom.caption.innerHTML = def.avant;
          dom.caption.classList.add("show");
          await attendre(2600);
          dom.caption.classList.remove("show");
          await attendre(600);
        });
      }

      function puzzleReveil(def) {
        return puzzleSequence(async (dom, attendre) => {
          const [r, c] = puzzleSanctuaireCell(def);
          dom.bloom.classList.add("on");
          try { playSfx("crown"); } catch (_) { }
          try {
            if (typeof kaykitFollowCell === "function") {
              kaykitFollowCell(r, c, { duration: 900, force: true, cinematique: true, zoomBoost: 1.4 });
            }
          } catch (_) { }
          await attendre(900);

          /* Le recul : zoomBoost NÉGATIF éloigne (voir kaykitFollowCell, la
             distance vaut base - zoomBoost). C'est le seul moment où le joueur
             voit son archipel en entier. */
          try {
            if (typeof kaykitFollowCell === "function") {
              kaykitFollowCell(r, c, { duration: 2200, force: true, cinematique: true, zoomBoost: -3.4 });
            }
          } catch (_) { }

          /* Un autre Sanctuaire répond, par-delà l'archipel. Le joueur ne saura
             jamais lequel : c'est la seule chose qui lui dit qu'il n'est pas
             seul à rallumer des Voies. */
          dom.lointain.classList.add("on");

          if (def.verite) {
            dom.caption.innerHTML = `« ${def.verite} »`;
            dom.caption.classList.add("show");
            await attendre(2600);
            dom.caption.classList.remove("show");
            await attendre(500);
          } else {
            await attendre(1500);
          }
          dom.lointain.classList.remove("on");
        });
      }

      /* ---------- LE DÉPART ------------------------------------------------
         Ce qui manquait entre deux Sanctuaires : le sentiment d'ALLER quelque
         part. Le procédé est celui de Lara Croft GO — un seul plateau existe à
         la fois, et c'est le MOUVEMENT qui raconte le voyage, pas une seconde
         géométrie. Le Gardien s'avance hors de l'archipel sur une passerelle
         qui se pose sous ses pas, la caméra part avec lui, et le noir ne tombe
         qu'une fois qu'il marche déjà. Le rideau cesse alors d'être une
         coupure : il devient une sortie de champ. Même code, sensation
         inverse.

         Rien ici ne touche aux règles. La passerelle est décorative, la marche
         est jouée sur le VISUEL du gardien (playCharacterMove) sans que sa case
         logique bouge d'un pouce, et le plateau suivant se construit derrière
         le noir exactement comme avant. L'oracle des solutions ne voit
         strictement rien de cette séquence — il tourne d'ailleurs avec
         ilyosSimulationActive, qui court-circuite et la marche et la caméra. */

      const PUZZLE_DEPART = {
        pas: 4,          // cases parcourues hors du plateau
        marche: 2600,    // durée de la marche, ms
        avance: 500      // ms de marche restants QUAND le noir tombe
      };

      /* Vers où « l'avant » ? Pas vers r décroissant par principe : le joueur a
         pu tourner autour du plateau, et le monde ne change pas de sens parce
         que le cadrage a changé. On lit donc la direction que regarde vraiment
         la caméra et on la rabat sur l'axe de grille dominant : le départ suit
         toujours le haut de l'écran. */
      function puzzleDirectionDepart() {
        const defaut = [-1, 0];
        try {
          const camera = kaykit3D?.camera;
          const cible = kaykit3D?.orbit?.target || kaykit3D?.viewTarget;
          if (!camera || !cible) return defaut;
          /* kaykitCellPosition : x croît avec la colonne, z croît avec la
             ligne. La direction du regard est donc directement lisible en
             coordonnées de grille. */
          const dx = cible.x - camera.position.x;
          const dz = cible.z - camera.position.z;
          if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return defaut;
          return Math.abs(dz) >= Math.abs(dx)
            ? [Math.sign(dz), 0]
            : [0, Math.sign(dx)];
        } catch (_) { return defaut; }
      }

      /* Celui de mes gardiens qui est déjà le plus avancé dans cette direction.
         C'est le seul dont le départ ne ressemble pas à un demi-tour, et il a le
         moins de plateau à traverser avant d'atteindre le vide. */
      function puzzleGardienDuDepart(dir) {
        const miens = (state?.characters || []).filter(char => char.player === 0);
        if (!miens.length) return null;
        const avance = char => char.r * dir[0] + char.c * dir[1];
        return miens.reduce((a, b) => (avance(b) > avance(a) ? b : a));
      }

      /* LA PASSERELLE. Quelques dalles posées dans le vide, hors de la grille —
         kaykitCellPosition est de l'arithmétique pure, sans borne, et
         kaykitCellSurfaceY rend le niveau du plateau pour toute case sans île :
         un gardien peut donc marcher au-delà du bord, à plat.

         Les dalles ne s'allument pas d'un coup : chacune arrive juste avant le
         pas qui va s'y poser. C'est le « le chemin se construit parce que
         j'avance » du document, obtenu sans un seul asset nouveau. */
      function puzzlePasserelle(depart, dir, longueur, cadence) {
        if (typeof THREE === "undefined" || typeof kaykit3D === "undefined") return null;
        if (!kaykit3D?.fxGroup) return null;

        const groupe = new THREE.Group();
        const cote = KAYKIT_CELL_SPACING * .58;
        const epaisseur = .09;
        const geometrie = new THREE.BoxGeometry(cote, epaisseur, cote);
        const dalles = [];
        const cellules = [];

        for (let i = 1; i <= longueur; i++) {
          const r = depart[0] + dir[0] * i;
          const c = depart[1] + dir[1] * i;
          /* Une case déjà couverte par une île est du sol : y poser une dalle
             ne ferait qu'un plan qui lutte avec le dessus de l'île. */
          if (typeof islandAt === "function" && islandAt(r, c)) continue;
          cellules.push([r, c]);
          /* Hauteur d'île : le gardien marche SUR la dalle. C'est la même
             hauteur que kaykitCellSurfaceY rend pour une case de passerelle. */
          const p = kaykitCellPosition(r, c, KAYKIT_LEVELS.islandTop - epaisseur / 2);
          /* Un matériau par dalle : elles doivent s'éclaircir chacune à son
             tour, et une opacité est portée par le matériau, pas par le mesh. */
          const materiau = new THREE.MeshBasicMaterial({
            color: 0x5a6a86, fog: true, transparent: true, opacity: 0, toneMapped: false
          });
          const dalle = new THREE.Mesh(geometrie, materiau);
          dalle.position.set(p.x, p.y, p.z);
          groupe.add(dalle);
          dalles.push({ materiau, debut: (i - 1) * cadence });
        }

        kaykit3D.fxGroup.add(groupe);
        /* Déclarer les dalles AVANT la marche : c'est ce qui donne au gardien
           un sol à hauteur d'île sur tout le trajet, y compris sur les cases
           vides encore à l'intérieur du plateau. */
        try { kaykitSetPasserelle(cellules); } catch (_) { }

        const depuis = performance.now();
        const montee = 380;
        let vivante = true;
        const animer = () => {
          if (!vivante) return;
          const ecoule = performance.now() - depuis;
          dalles.forEach(dalle => {
            const t = (ecoule - dalle.debut) / montee;
            dalle.materiau.opacity = t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t));
          });
          requestAnimationFrame(animer);
        };
        requestAnimationFrame(animer);

        return {
          dispose() {
            vivante = false;
            try { kaykitClearPasserelle(); } catch (_) { }
            try {
              kaykit3D?.fxGroup?.remove(groupe);
              dalles.forEach(dalle => dalle.materiau.dispose());
              geometrie.dispose();
            } catch (_) { }
          }
        };
      }

      /* La séquence elle-même. Rend une fonction de démontage, que le voyage
         appelle UNE FOIS LE NOIR POSÉ : démonter plus tôt ferait disparaître la
         passerelle sous les pieds du gardien. */
      async function puzzleDepart(attendre, { camera = true } = {}) {
        const dir = puzzleDirectionDepart();

        /* Le départ ne DÉPEND PAS d'un gardien. Certaines énigmes vident le
           plateau en se résolvant — La charnière des cieux valide sa couronne
           et il ne reste plus personne — et la séquence entière sautait alors
           en silence. Quand il n'y a plus de gardien, c'est le chemin lui-même
           qui part vers l'avant, depuis le Sanctuaire : les dalles s'allument
           l'une après l'autre et la caméra les suit. */
        const gardien = puzzleGardienDuDepart(dir);
        const origine = gardien
          ? [gardien.r, gardien.c]
          : puzzleSanctuaireCell(PUZZLE.def || {});
        if (!origine) return null;

        let visual = null;
        try {
          if (gardien && typeof characterVisualById === "function") {
            visual = characterVisualById(gardien.id);
          }
        } catch (_) { }

        const pas = PUZZLE_DEPART.pas;
        const cadence = PUZZLE_DEPART.marche / pas;
        const passerelle = puzzlePasserelle(origine, dir, pas, cadence);

        const route = [[origine[0], origine[1]]];
        for (let i = 1; i <= pas; i++) route.push([origine[0] + dir[0] * i, origine[1] + dir[1] * i]);

        try {
          if (visual && typeof playCharacterMove === "function") {
            playCharacterMove(visual, route, PUZZLE_DEPART.marche);
          }
        } catch (_) { }

        /* La caméra vise une case ENCORE plus loin que l'arrivée du gardien :
           il marche donc vers le bas du cadre pendant que le regard, lui, est
           déjà porté sur ce qui vient. Le léger recul (zoomBoost négatif) ouvre
           le paysage au moment du départ. */
        /* `camera: false` quand c'est LE MONDE qui glisse : la caméra doit
           alors rester rigoureusement immobile, sans quoi la parallaxe se
           brouille et l'on ne sait plus qui bouge de l'archipel ou du regard. */
        try {
          if (camera && typeof kaykitFollowCell === "function") {
            kaykitFollowCell(origine[0] + dir[0] * (pas + 2), origine[1] + dir[1] * (pas + 2), {
              duration: PUZZLE_DEPART.marche + 400, force: true, cinematique: true, zoomBoost: -1.2
            });
          }
        } catch (_) { }

        await attendre(Math.max(0, PUZZLE_DEPART.marche - PUZZLE_DEPART.avance));

        return () => {
          passerelle?.dispose();
          /* Le visuel est resté en cours de marche, hors de la grille. Les
             identifiants de gardiens repartent de zéro à chaque énigme
             (`pz-${state.nextCharId++}`) : sans ce nettoyage, le gardien du
             Sanctuaire SUIVANT peut hériter du même visuel, et
             syncKayKitCharacters ne le replace pas tant que `move` est posé —
             il resterait planté dans le vide. */
          if (visual) {
            visual.move = null;
            visual.settle = null;
            try { visual.animator?.toIdle({ fade: .12 }); } catch (_) { }
          }
        };
      }

      /* ---------- LE MONDE QUI GLISSE --------------------------------------
         La transition « le monde s'étend », et la seule des trois où RIEN
         n'est masqué ni substitué derrière un rideau.

         Le principe, celui de Lara Croft GO : la caméra ne bouge pas, c'est
         l'archipel qui défile. L'ancien Sanctuaire s'éloigne et s'enfonce sous
         le cadre ; le prochain, dessiné à l'avance dans ses vraies formes,
         arrive exactement au centre. Quand il y est, on échange l'aperçu contre
         le vrai plateau et l'on remet le décalage à zéro — dans la même image,
         au même endroit. Il n'y a rien à cacher, donc pas de noir.

         Trois compensations, et l'affaire tient toute entière dedans :
         - le CIEL est décalé de l'inverse, sinon il partirait avec l'archipel
           (kaykitDecalerArchipel) — c'est lui qui donne la parallaxe ;
         - l'APERÇU est remonté de la hauteur dont l'ancien plateau s'enfonce,
           pour rester à niveau pendant que l'autre coule ;
         - le DÉCALAGE revient à zéro à la bascule, parce que tous les cadrages
           de caméra du moteur sont exprimés en coordonnées locales. */
      const PUZZLE_GLISSEMENT = {
        duree: 3400,   // ms de défilement
        avance: 13,    // cases parcourues vers l'avant
        chute: 8.5     // unités dont l'ancien archipel s'enfonce
      };

      /* Le terrain d'une définition : ses îles, plus les coins de village, qui
         reçoivent une île d'office au montage (voir puzzleStart). */
      function puzzleCellulesDe(def) {
        const cellules = [];
        (def.islands || []).forEach(entry => {
          (Array.isArray(entry) ? entry : entry.cells || []).forEach(cell => cellules.push(cell));
        });
        Object.values(def.villages || {}).forEach(coins =>
          (coins || []).forEach(cell => cellules.push(cell)));
        return cellules;
      }

      /* Rend false si l'aperçu n'a pas pu être bâti — bloc KayKit pas encore
         chargé. L'appelant retombe alors sur la voie au noir, qui, elle, ne
         dépend d'aucun asset. */
      async function puzzleGlissement(index, def, attendre, dir) {
        if (typeof kaykitApercuArchipel !== "function") return false;

        const zero = kaykitCellPosition(0, 0, 0);
        const un = kaykitCellPosition(dir[0], dir[1], 0);
        const dx = (un.x - zero.x) * PUZZLE_GLISSEMENT.avance;
        const dz = (un.z - zero.z) * PUZZLE_GLISSEMENT.avance;
        const chute = PUZZLE_GLISSEMENT.chute;

        const apercu = kaykitApercuArchipel(puzzleCellulesDe(def), { x: dx, y: 0, z: dz });
        if (!apercu) return false;

        const depuis = performance.now();
        let actif = true;
        const animer = () => {
          if (!actif) return;
          const t = Math.min(1, (performance.now() - depuis) / PUZZLE_GLISSEMENT.duree);
          const e = t * t * (3 - 2 * t);
          kaykitDecalerArchipel(-dx * e, -chute * e, -dz * e);
          apercu.position.set(dx, chute * e, dz);
          if (t < 1) requestAnimationFrame(animer);
        };
        requestAnimationFrame(animer);

        await attendre(PUZZLE_GLISSEMENT.duree);

        /* LA BASCULE. Tout se fait dans la même image : aucun rendu ne
           s'intercale entre le retrait de l'aperçu et la remise à zéro, donc
           aucune position intermédiaire n'est jamais affichée. */
        actif = false;
        kaykitRetirerApercu(apercu);
        puzzleStart(index, { muet: true });
        kaykitDecalerArchipel(0, 0, 0);
        return true;
      }

      /* L'ARRIVÉE. Le pendant du départ, et ce qui manquait le plus : on ne se
         RÉVEILLAIT pas devant le nouveau plateau, on y apparaissait. La caméra
         est donc posée en retrait, dans l'axe d'où l'on vient, puis glisse
         jusqu'au cadrage de jeu pendant que le rideau se lève. Le joueur
         reprend la main sur un mouvement qui s'achève, pas sur une image qui
         surgit.

         Deux précautions, toutes deux apprises en le regardant tourner :

         • puzzleStart réimpose son cadrage à 350, 700, 1100, 1600 et 2400 ms.
           Ces rappels écraseraient le glissement. On les désarme en effaçant
           PUZZLE.lastFrame, que puzzleFrame teste avant chaque rappel — et
           c'est sans risque ici : la course qu'ils protègent est celle contre
           camera-start-face-auto-v1.js, qui ne s'arme qu'au passage de
           gameScreen de caché à visible, donc jamais entre deux Sanctuaires.

         • La distance de jeu est RELEVÉE avant le recul, et le glissement la
           vise explicitement. Un cadrage cinématique part de la distance où
           l'on est : viser « zoomBoost 0 » après un recul aurait figé la
           caméra sur la distance du recul. */
      function puzzleArrivee(def, dir) {
        const [fr, fc] = puzzleFocusCell(def);
        const zoom = def.zoom || 0;
        PUZZLE.lastFrame = null;

        let distanceJeu = null;
        try { distanceJeu = kaykit3D?.zoomDistance ?? null; } catch (_) { }

        const recul = 3;
        try {
          if (typeof kaykitFollowCell === "function") {
            /* `dir` pointait vers l'AVANT au moment du départ : l'arrière du
               nouveau plateau se trouve donc à -dir. */
            kaykitFollowCell(fr - dir[0] * recul, fc - dir[1] * recul, {
              duration: 1, force: true, cinematique: true, zoomBoost: zoom - 3.4
            });
          }
        } catch (_) { }

        return function glisser(duree) {
          try {
            if (typeof kaykitFollowCell !== "function") return;
            const actuelle = kaykit3D?.zoomDistance;
            /* distance = base - zoomBoost, base = distance actuelle : viser
               `actuelle - distanceJeu` ramène exactement au cadrage de jeu,
               que la distance ait bougé pendant le recul ou non. */
            const retour = (Number.isFinite(actuelle) && Number.isFinite(distanceJeu))
              ? actuelle - distanceJeu
              : zoom;
            kaykitFollowCell(fr, fc, {
              duration: duree, force: true, cinematique: true, zoomBoost: retour
            });
          } catch (_) { }
        };
      }

      /* LE VOYAGE. Ce qui remplace un retour au menu entre deux Sanctuaires :
         on part dans le noir, l'archipel suivant se découvre dessous pendant
         que son nom se tient à l'écran, puis la main revient.

         Le fondu au noir n'est pas qu'une élégance : puzzleFrame ré-impose son
         cadrage à 350, 700, 1100, 1600 et 2400 ms pour gagner sa course contre
         camera-start-face-auto-v1.js. Toute la mise en place se fait donc
         derrière le noir, et l'on ne relève le rideau qu'une fois l'archipel
         posé — sinon le joueur verrait la caméra se battre avec elle-même. */
      async function puzzleVoyage(index) {
        const def = PUZZLES[index];
        if (!def || !PUZZLE.dom) { puzzleStart(index); return; }

        await puzzleSequence(async (dom, attendre) => {
          dom.layer.querySelectorAll(".pz-end").forEach(node => node.remove());

          const dir = puzzleDirectionDepart();

          /* VOIE DU MONDE QUI GLISSE. Caméra immobile pendant le départ du
             gardien : c'est l'archipel qui va bouger, et deux mouvements à la
             fois n'en laisseraient lire aucun. */
          const finDepartGlisse = await puzzleDepart(attendre, { camera: false });
          const glisse = await puzzleGlissement(index, def, attendre, dir);
          if (finDepartGlisse) finDepartGlisse();
          if (glisse) {
            dom.lieu.innerHTML = `<span class="acte">${PUZZLE_ACTES[def.acte] || ""}</span>`
              + `<span class="nom">${def.title}</span>`;
            dom.lieu.classList.add("show");
            await attendre(2200);
            dom.lieu.classList.remove("show");
            await attendre(900);
            return;
          }

          /* VOIE AU NOIR. Repli quand l'aperçu n'a pas pu être bâti : le
             gardien est déjà parti, on enchaîne sur le rideau. */
          const finDepart = null;

          dom.fade.classList.add("on");
          await attendre(760);
          if (finDepart) finDepart();

          puzzleStart(index, { muet: true });

          dom.lieu.innerHTML = `<span class="acte">${PUZZLE_ACTES[def.acte] || ""}</span>`
            + `<span class="nom">${def.title}</span>`;
          dom.lieu.classList.add("show");

          /* Le temps que le cadrage d'ouverture se pose une première fois. Le
             recul d'arrivée part de LUI : sans cette attente, on reculerait
             depuis un cadrage encore en train de bouger. */
          await attendre(980);
          const glisser = puzzleArrivee(def, dir);
          await attendre(140);

          /* Le rideau se lève sur une caméra DÉJÀ en mouvement : l'archipel se
             découvre pendant l'approche, il n'apparaît pas tout posé. */
          const approche = 2600;
          glisser(approche);
          dom.fade.classList.remove("on");
          await attendre(approche - 700);
          dom.lieu.classList.remove("show");
          await attendre(900);
        });

        // La phrase d'entrée, si ce Sanctuaire en porte une, vient seulement
        // après le nom du lieu : deux textes à la fois n'en font lire aucun.
        // Hors de la séquence précédente, qui n'en autorise qu'une à la fois.
        puzzleApproche(def);
      }

      /* UNE seule ligne au réveil, jamais deux (charte narrative). Quand le
         Sanctuaire porte une « vérité », c'est elle qu'on lit — une phrase
         mythologique qui dit ce que le joueur vient de comprendre, jamais quelle
         mécanique il a employée. Les Sanctuaires ordinaires gardent leur ligne
         d'enseignement, plus discrète : onze des dix-sept n'ont pas de vérité,
         et c'est ce qui donne du poids aux six autres. */
      function puzzleFinLigne(def, depense) {
        const compte = `<span class="pz-cout">${depense} carte${depense > 1 ? "s" : ""} dépensée${depense > 1 ? "s" : ""}${def.par ? ` — optimal : ${def.par}` : ""}</span>`;
        /* La vérité a déjà été lue sur le ciel pendant le réveil : la carte ne
           la répète pas, elle garde la ligne d'enseignement. */
        return `${def.winLine || ""}<br>${compte}`;
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

        /* Le réveil passe AVANT la carte : le Sanctuaire s'illumine et la
           caméra recule pendant que le joueur regarde encore le plateau. La
           carte n'arrive qu'ensuite, et ne répète pas la vérité déjà lue. */
        if (won) {
          puzzleReveil(def).then(() => puzzleCarteDeFin(def, depense, etoiles, true));
          return;
        }
        puzzleCarteDeFin(def, depense, etoiles, false);
      }

      function puzzleCarteDeFin(def, depense, etoiles, won) {
        if (!PUZZLE.dom) return;
        const suivant = PUZZLES[PUZZLE.index + 1];
        const panneau = document.createElement("div");
        panneau.className = "pz-end";
        panneau.innerHTML = `
          <h2>${won ? def.winTitle || "Sanctuaire éveillé" : "Le Sanctuaire reste éteint"}</h2>
          ${won ? `<div class="pz-stars">${"★".repeat(etoiles)}${"☆".repeat(3 - etoiles)}</div>` : ""}
          <p>${won ? puzzleFinLigne(def, depense) : def.failLine || "Il ne reste plus de quoi agir."}</p>
          <div class="pz-end-actions">
            <button type="button" data-pz="again">↺ Recommencer</button>
            ${won && suivant ? '<button type="button" class="primary" data-pz="next">Sanctuaire suivant →</button>' : ""}
            <button type="button" data-pz="back">← Les Voies</button>
          </div>`;
        PUZZLE.dom.layer.appendChild(panneau);
        panneau.querySelector('[data-pz="again"]').addEventListener("click", () => puzzleRestart());
        panneau.querySelector('[data-pz="back"]').addEventListener("click", () => puzzleBackToMenu());
        const boutonSuivant = panneau.querySelector('[data-pz="next"]');
        if (boutonSuivant) boutonSuivant.addEventListener("click", () => puzzleVoyage(PUZZLE.index + 1));
      }

      /* ---------- Boucle d'observation ------------------------------------
         L'objectif est testé AVANT l'échec : une énigme résolue avec sa
         dernière carte est une réussite, pas une main vide. */
      function puzzleTick() {
        if (!PUZZLE.active || PUZZLE.ended || !state) return;
        if (!PUZZLE.def.placement) state.islandPlacedThisTurn = true;
        puzzleSyncOverlay();
        puzzleRefreshMarkers();
        puzzleRefreshSceaux();
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
         Il n'en reste AUCUN. Les trois d'origine sont tombés un par un, chacun
         parce que sa raison d'être avait disparu.

         Échap et le clic droit étaient verrouillés parce qu'ils déclenchent
         l'annulation du dernier coup, laquelle cassait le décompte de cartes
         d'une énigme. Ce n'est plus vrai depuis que restoreUndoSnapshot
         recalcule PUZZLE.spent à chaque retour en arrière (voir plus haut) :
         l'annulation est devenue exacte, et l'interdire ne protégeait plus
         rien — elle privait seulement le joueur des deux gestes les plus
         naturels pour défaire un coup, dans le mode où l'on se trompe le plus.
         Échap referme aussi les fenêtres Règles et Son, donc les verrouiller
         rendait ces fenêtres impossibles à fermer au clavier.

         « T » était intercepté parce que la vue 2D ne savait pas cliquer une
         éjection par le bord du plateau. Elle le sait maintenant : elle dessine
         ces repères dans sa marge et les exécute par identifiant. */
      function puzzleKeyGuard(event) {
        if (!PUZZLE.active) return;
      }

      /* Le clic droit sec sur le canevas annule le dernier coup — c'est le
         geste du jeu, et une énigme n'a plus de raison de s'en priver. La
         fonction reste, vide, parce que le démontage la retire toujours des
         écouteurs : la supprimer obligerait à toucher trois autres endroits
         pour rien. */
      function puzzleRightClickGuard() { }

      /* ---------- Lancement d'une énigme ----------------------------------- */
      /* `replay` = le joueur RECOMMENCE (il perd l'étoile du sans-faute).
         `force`  = on contourne le verrou de progression (API de test, écran de
         fin). Les deux étaient confondus : lancer une énigme par
         ILYOS_PUZZLE.start() la comptait comme reprise et lui retirait ses
         étoiles avant même le premier coup. */
      /* `muet` coupe l'approche : l'oracle et le chercheur relancent des énigmes
         en boucle, et une phrase d'entrée qui capte les clics pendant trois
         secondes n'a aucun sens là. */
      function puzzleStart(index, { replay = false, force = false, muet = false } = {}) {
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

        /* Deux énigmes de MÊME taille n'appellent pas setBoardSize, donc rien
           ne vide le cache des châteaux : le village de l'énigme précédente
           restait accroché à la scène, flottant dans le vide au-dessus du
           nouvel archipel. Se voyait en enchaînant « Sanctuaire suivant ». */
        try { clearKayKitVillages(); } catch (_) { }
        /* Le sol du sanctuaire aussi : une énigme n'en a jamais, mais celui de
           la partie précédente restait accroché à la scène. */
        try { clearKayKitCrownCross(); } catch (_) { }

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

        /* La phrase d'entrée à la PREMIÈRE venue seulement : la relire à chaque
           « Recommencer » deviendrait une taxe sur l'essai-erreur, qui est le
           mode de jeu normal d'une énigme. */
        if (!muet && !replay && !reprise) puzzleApproche(def);
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
      /* `keep` laisse l'énigme EN PLACE au lieu de la démonter : le sondage
         de victoire la voit alors gagnée et joue le réveil, ce qu'un test
         visuel ne peut obtenir autrement qu'en rejouant tout à la souris. */
      async function puzzleVerifyLive(index, { keep = false } = {}) {
        const def = PUZZLES[index];
        const tours = def.solution || [];
        puzzleStart(index, { force: true, muet: true });
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
        if (!keep) puzzleTeardown();
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
      /* `noeudsMax` : certaines énigmes ne se tranchent pas sous le plafond de
         nœuds par défaut, et un barème non prouvé est un barème que le joueur
         finira par battre. */
      function puzzleSolve(index, plafond = null, secondesMax = 60, noeudsMax = null) {
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
              if (++noeuds > (noeudsMax || PUZZLE_SEARCH_MAX_NODES) || Date.now() > finAu) {
                return {
                  id: def.id, epuise: true, noeuds, coutMax,
                  secondes: Math.round((Date.now() - depart) / 100) / 10,
                  error: Date.now() > finAu
                    ? `exploration interrompue après ${secondesMax} s (${noeuds} nœuds)`
                    : `exploration interrompue à ${noeuds} nœuds`
                };
              }
              if (!puzzleSearchReplay(def, chemin)) continue;

              /* L'objectif se teste ICI, au dépilement, et non à la génération
                 des successeurs. Un successeur porte son coût TOTAL : en
                 rendant la main dès qu'il atteignait le but, la recherche
                 renvoyait le premier chemin gagnant rencontré, pas le moins
                 cher — sur une énigme à grande main, une seule marche de treize
                 cases trouvée depuis le seau 1 l'emportait sur une solution à
                 cinq cartes jamais explorée. Les seaux étant parcourus par coût
                 croissant, le premier chemin dépilé qui atteint le but est
                 optimal. */
              if (atteint()) {
                return {
                  id: def.id, cout, noeuds,
                  secondes: Math.round((Date.now() - depart) / 100) / 10,
                  chemin: chemin.map(puzzleSearchLabel)
                };
              }

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
                pousser(suivant, [...chemin, action]);
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
        /* Les points d'entrée de test démarrent MUETS : un test pilote des
           clics, et l'approche les avalerait. Passer { muet: false } pour
           observer la séquence elle-même. */
        start: (index, options) => puzzleStart(index, { force: true, muet: true, ...options }),
        /* Adressage par IDENTIFIANT : l'ordre de la campagne n'est plus celui
           des identifiants, et un test qui vise un index vise le mauvais
           Sanctuaire dès qu'on réordonne. */
        startById: (id, options) => puzzleStart(PUZZLES.findIndex(def => def.id === id),
          { force: true, muet: true, ...options }),
        restart: puzzleRestart,
        /* Joue la TRANSITION vers un Sanctuaire depuis celui en cours, sans
           passer par une victoire. Une transition ne se règle qu'en la
           regardant tourner des dizaines de fois ; l'atteindre en résolvant
           l'énigme à chaque essai n'est pas praticable, et la voie live de
           l'oracle ne convient qu'aux énigmes multi-tours. */
        voyage: index => puzzleVoyage(index),
        voyageById: id => puzzleVoyage(PUZZLES.findIndex(def => def.id === id)),
        exit: puzzleQuitToHome,
        list: () => PUZZLES.map((def, index) => ({
          index, id: def.id, title: def.title, board: def.board || 11, par: def.par ?? null
        })),
        /* Oracle de test : rejoue la solution de référence d'une énigme, ou de
           toutes, sans toucher à la partie en cours. */
        verify: (index, options) => (options?.live || puzzleIsMultiTurn(PUZZLES[index]))
          ? puzzleVerifyLive(index, options)
          : puzzleVerify(index),
        verifyAll: puzzleVerifyAll,
        /* Cherche le chemin le MOINS CHER vers l'objectif. Sert à établir les
           `par` sur preuve plutôt que sur la solution qu'on avait en tête. */
        solve: (index, plafond, secondesMax, noeudsMax) =>
          puzzleSolve(index, plafond, secondesMax, noeudsMax),
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
          /* Le déblocage linéaire est suspendu pendant le chantier des
             transitions. Exposé ici pour que le test du menu vérifie le
             comportement RÉEL au lieu d'être assoupli : il exige les 22 cartes
             ouvertes tant que ce drapeau tient, et le verrou linéaire dès
             qu'il retombe. */
          toutOuvert: PUZZLE_TOUT_OUVERT,
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
