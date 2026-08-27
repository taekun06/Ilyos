 = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        clearMagicPreview();
        state.reachable = new Set();
        renderAll();
        showToast("ORDINATEUR termine son tour.");
        await sleep(700);

        if (token === aiRunToken && state && state.winner === null) endTurn(true);
      }

      function scoreCrownsAtTurnStart(player) {
        if (!state || !player || state.winner !== null) return 0;
        let scored = 0;

        // Un gardien est indispensable pour marquer : une couronne posée au
        // sol sur une case de village ne vaut plus rien (la règle V66, qui la
        // validait sans porteur, est abandonnée). Et un gardien adverse posté
        // dans les trois cases du village y interdit toute validation.
        const eligibleCarriers = (state.characters || []).filter(char =>
          char.player === player.id
          && !!artifactCarriedBy(char.id)
          && isCrownValidationCell(player, char.r, char.c)
          && !validationBloqueeParAdversaire(player, char.r, char.c)
        );

        eligibleCarriers.forEach(char => {
          if (state.winner !== null) return;
          const artifact = artifactCarriedBy(char.id);
          if (!artifact) return;
          queueKayKitActionAnimation(char.id, "victory", 1200);
          animateCellPulse(char.r, char.c, "crown-burst");
          playSfx("crown");
          scoreCrownForPlayer(player, char, false, artifact);
          scored++;
        });

        if (scored > 0) {
          state.fxCells ||= [];
          crownValidationCellsForPlayer(player).forEach(([r, c]) => state.fxCells.push({ type: "score", r, c }));
        }
        return scored;
      }

      function beginTurn() {
        const p = currentPlayer();
        const scoredAtStart = scoreCrownsAtTurnStart(p);
        if (state.winner !== null) {
          renderAll();
          return;
        }
        /* Plus aucune île ne peut être posée : la partie s'arrête ici (V68).
           Vérifié à l'ouverture du tour, avant la pioche, pour que la fin
           tombe au même endroit qu'une victoire aux trois couronnes. */
        if (plateauSansPlace()) {
          state.winner = vainqueurAuxCouronnes();
          if (state.winner === null) state.winner = MATCH_NUL;
          terminerPartiePlateauPlein();
          renderAll();
          return;
        }

        state.turnTransitioning = false;
        p.hand = [];
        p.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };
        drawCards(p, 5);
        state.deckAnimationMode = "deal";
        state.phase = "ACTION_SELECT";
        // Limite d'îles par équipe (duel symétrique personnalisé) : une fois
        // atteinte, la pose d'île redevient facultative au lieu de rester
        // obligatoire sans qu'aucune forme ne puisse plus être choisie.
        state.islandPlacedThisTurn = islandLimitReachedForPlayer(p.id);
        /* Le verrou du sanctuaire se relâche ici, et les couronnes qui
           attendaient leur entrée en jeu arrivent alors — dans cet ordre, sans
           quoi elles se remettraient aussitôt en attente. */
        state.centerCrownTakenThisTurn = false;
        faireEntrerCouronnesEnAttente();
        state.treasureDropFromId = null;
        state.crownPickupCell = null;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.pendingSpawnIslandId = null;
        state.fxCells = [];
        state.inputLocked = false;
        state.undoHistory = [];
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.selectedMagicPivot = null;
        state.magicPreviewDirection = 0;
        state.magicPreviewSteps = 0;
        state.magicPreviewCells = null;
        state.magicPreviewValid = false;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        state.reachable = new Set();
        state.aiThinking = !!p.isAI;
        els.gameScreen.classList.toggle("ai-turn", !!p.isAI);
        startTurnTimer(true);
        resetKayKitPointerFeedback();
        renderAll();
        showTurnRibbon(p);
        // Nouveau tour d'un joueur humain : recadrage doux vers ses gardiens,
        // sauf au tout premier tour où l'objectif (la couronne) prime.
        // (le tour de l'IA est suivi action par action, pas ici).
        if (!p.isAI) {
          if (state.turn === 1) kaykitCenterOnCrown();
          else kaykitFollowCurrentPlayer();
        }

        setTimeout(() => {
          if (!state || state.winner !== null) return;
          state.deckAnimationMode = null;
          renderDeckDisplay();
        }, 900);

        if (state.turn === 1 && state.startingBoardMode === "symmetric") {
          const setupName = SYMMETRIC_DUEL_SETUPS[state.startingBoardPreset]?.name
            || "Archipels ouverts";
          showToast(`Duel symétrique — ${setupName}.`);
        } else if (p.isAI) {
          showToast(state.turn === 1
            ? `Tirage au sort : ${p.name} commence la partie.`
            : `${p.name} prépare son tour.`);
          const token = ++aiRunToken;
          setTimeout(() => runAITurn(token), 550);
        } else {
          state.inputLocked = false;
          if (!(state.turn === 1 && state.startingBoardMode === "symmetric")) {
            showToast(state.turn === 1
              ? `Tirage au sort : ${p.name} commence la partie.`
              : `${p.name} commence son tour.`);
          }
        }
      }

      function snapshotState() {
        return JSON.stringify({
          players: state.players,
          currentPlayer: state.currentPlayer,
          round: state.round,
          turn: state.turn,
          islands: state.islands,
          characters: state.characters,
          artifact: state.artifact,
          secondArtifact: state.secondArtifact,
          couronnesEnAttente: [...(state.couronnesEnAttente || [])],
          phase: state.phase,
          islandPlacedThisTurn: state.islandPlacedThisTurn,
          centerCrownTakenThisTurn: !!state.centerCrownTakenThisTurn,
          treasureDropFromId: state.treasureDropFromId,
          crownPickupCell: state.crownPickupCell,
          selectedIslandShape: state.selectedIslandShape,
          placementCells: state.placementCells,
          placementOriginIndex: state.placementOriginIndex,
          hoverAnchor: state.hoverAnchor,
          pendingSpawnIslandId: state.pendingSpawnIslandId,
          selectedActionCardId: state.selectedActionCardId,
          selectedActionType: state.selectedActionType,
          selectedActionCount: state.selectedActionCount,
          pushForceChoice: state.pushForceChoice,
          crownStealTargetId: state.crownStealTargetId,
          crownPickupArtifactId: state.crownPickupArtifactId,
          treasureDropArtifactId: state.treasureDropArtifactId,
          crownTransferTargetIds: [...(state.crownTransferTargetIds || [])],
          selectedCharId: state.selectedCharId,
          selectedIslandId: state.selectedIslandId,
          selectedMagicPivot: state.selectedMagicPivot,
          magicPreviewDirection: state.magicPreviewDirection,
          magicPreviewSteps: state.magicPreviewSteps,
          magicPreviewCells: state.magicPreviewCells,
          magicPreviewValid: state.magicPreviewValid,
          reachable: [...state.reachable],
          nextIslandId: state.nextIslandId,
          nextCharId: state.nextCharId,
          winner: state.winner
        });
      }

      // Pile d'instantanés plutôt qu'un slot unique : chaque action jouée empile
      // son état d'avant, ce qui permet de remonter plusieurs coups en arrière en
      // rappelant restoreUndoSnapshot() plusieurs fois (bouton, Échap, clic droit —
      // voir bindKayKitInteractions). Plafond généreux, juste pour éviter une
      // croissance illimitée sur une très longue partie.
      const UNDO_HISTORY_LIMIT = 20;

      function saveUndoSnapshot() {
        if (ilyosSimulationActive) return;
        state.undoHistory ||= [];
        state.undoHistory.push(snapshotState());
        if (state.undoHistory.length > UNDO_HISTORY_LIMIT) state.undoHistory.shift();
      }

      // Retire le dernier instantané empilé SANS le restaurer : utilisé quand
      // l'action pour laquelle il venait d'être pris échoue finalement (ex. cible
      // déjà occupée) — l'historique ne doit garder que des états correspondant à
      // des actions réellement jouées.
      function discardLastUndoSnapshot() {
        state.undoHistory?.pop();
      }

      /* Réécrit l'état de jeu depuis un instantané produit par snapshotState().
         Extrait de restoreUndoSnapshot() pour être réutilisable tel quel par le
         banc d'essai stratégique (window.ILYOS_BENCH), qui charge ses positions
         de test par ce même chemin : une seule définition de « recharger une
         position », donc aucun risque qu'un puzzle soit monté différemment
         d'une annulation réelle.

         Ne fait QUE poser l'état — ni rendu, ni toast, ni pile d'annulation :
         c'est l'appelant qui décide de la suite. */
      function applyStateSnapshot(snap) {
        if (!state || !snap) return false;
        state.players = snap.players;
        state.currentPlayer = snap.currentPlayer;
        state.round = snap.round;
        state.turn = snap.turn;
        state.islands = snap.islands;
        state.characters = snap.characters;
        state.artifact = snap.artifact;
        state.secondArtifact = snap.secondArtifact || { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
        state.couronnesEnAttente = [...(snap.couronnesEnAttente || [])];
        state.phase = snap.phase;
        state.islandPlacedThisTurn = !!snap.islandPlacedThisTurn;
        state.centerCrownTakenThisTurn = !!snap.centerCrownTakenThisTurn;
        state.treasureDropFromId = snap.treasureDropFromId || null;
        state.crownPickupCell = snap.crownPickupCell || null;
        state.selectedIslandShape = snap.selectedIslandShape;
        state.placementCells = snap.placementCells;
        state.placementOriginIndex = snap.placementOriginIndex;
        state.hoverAnchor = snap.hoverAnchor;
        state.pendingSpawnIslandId = snap.pendingSpawnIslandId;
        state.selectedActionCardId = snap.selectedActionCardId;
        state.selectedActionType = snap.selectedActionType;
        state.selectedActionCount = snap.selectedActionCount;
        state.pushForceChoice = snap.pushForceChoice || 1;
        state.crownStealTargetId = snap.crownStealTargetId || null;
        state.crownPickupArtifactId = snap.crownPickupArtifactId || null;
        state.treasureDropArtifactId = snap.treasureDropArtifactId || null;
        state.crownTransferTargetIds = Array.isArray(snap.crownTransferTargetIds)
          ? [...snap.crownTransferTargetIds]
          : [];
        state.selectedCharId = snap.selectedCharId;
        state.selectedIslandId = snap.selectedIslandId;
        state.selectedMagicPivot = snap.selectedMagicPivot;
        state.magicPreviewDirection = snap.magicPreviewDirection;
        state.magicPreviewSteps = snap.magicPreviewSteps;
        state.magicPreviewCells = snap.magicPreviewCells;
        state.magicPreviewValid = snap.magicPreviewValid;
        state.reachable = new Set(snap.reachable || []);
        state.nextIslandId = snap.nextIslandId;
        state.nextCharId = snap.nextCharId;
        state.winner = snap.winner;
        state.fxCells = [];
        state.inputLocked = false;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        return true;
      }

      function restoreUndoSnapshot() {
        if (!state?.undoHistory?.length) return false;
        if (!applyStateSnapshot(JSON.parse(state.undoHistory.pop()))) return false;
        renderAll();
        showToast(state.undoHistory.length
          ? `Action annulée · ${state.undoHistory.length} de plus possible${state.undoHistory.length > 1 ? "s" : ""}.`
          : "Dernière action annulée.");
        return true;
      }

      function handleCancelButton() {
        if (state?.inputLocked) return;
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        if (state?.phase === "ACTION" && state?.selectedActionType) {
          cancelSelectedCard();
        } else if (state?.phase === "PLACE_ISLAND") {
          // Pendant la mise en place personnalisée, abandonner la forme en
          // cours ne rend pas la main au tour de jeu (il n'a pas commencé) :
          // on revient au choix de forme du même placement.
          state.phase = state.draft ? "CHOOSE_ISLAND_SHAPE" : "ACTION_SELECT";
          state.selectedIslandShape = null;
          state.placementCells = null;
          state.placementOriginIndex = 0;
          state.hoverAnchor = null;
          state.reachable = new Set();
          renderAll();
        } else if (state?.phase === "DROP_TREASURE") {
          state.treasureDropFromId = null;
          state.treasureDropArtifactId = null;
          state.selectedCharId = null;
          state.reachable = new Set();
          state.phase = "ACTION_SELECT";
          renderAll();
        } else if (state?.phase === "PICKUP_CROWN") {
          state.crownPickupCell
