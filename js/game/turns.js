ectedActionType = null;
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

        const eligibleCarriers = (state.characters || []).filter(char =>
          char.player === player.id
          && !!artifactCarriedBy(char.id)
          && isCrownValidationCell(player, char.r, char.c)
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

        // Une couronne déposée directement sur une des trois cases du village
        // est également validée au début du tour, conformément à la règle V66.
        [state.artifact, state.secondArtifact].filter(Boolean).forEach(artifact => {
          if (state.winner !== null || !artifact.active || artifact.carrierId) return;
          if (!Number.isFinite(artifact.r) || !Number.isFinite(artifact.c)) return;
          if (!isCrownValidationCell(player, artifact.r, artifact.c)) return;
          animateCellPulse(artifact.r, artifact.c, "crown-burst");
          playSfx("crown");
          scoreCrownForPlayer(player, null, false, artifact);
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
        state.turnTransitioning = false;
        p.hand = [];
        p.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };
        drawCards(p, 5);
        state.deckAnimationMode = "deal";
        state.phase = "ACTION_SELECT";
        state.islandPlacedThisTurn = false;
        state.centerCrownTakenThisTurn = false;
        state.treasureDropFromId = null;
        state.crownPickupCell = null;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.pendingSpawnIslandId = null;
        state.fxCells = [];
        state.inputLocked = false;
        state.undoSnapshot = null;
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
        state.reachable = new Set();
        state.aiThinking = !!p.isAI;
        els.gameScreen.classList.toggle("ai-turn", !!p.isAI);
        startTurnTimer(true);
        renderAll();
        showTurnRibbon(p);

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
          showToast(`${p.name} prépare son tour.`);
          const token = ++aiRunToken;
          setTimeout(() => runAITurn(token), 550);
        } else {
          state.inputLocked = false;
          if (!(state.turn === 1 && state.startingBoardMode === "symmetric")) {
            showToast(`${p.name} commence son tour.`);
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

      function saveUndoSnapshot() {
        state.undoSnapshot = snapshotState();
      }

      function restoreUndoSnapshot() {
        if (!state?.undoSnapshot) return false;
        const snap = JSON.parse(state.undoSnapshot);
        state.players = snap.players;
        state.currentPlayer = snap.currentPlayer;
        state.round = snap.round;
        state.turn = snap.turn;
        state.islands = snap.islands;
        state.characters = snap.characters;
        state.artifact = snap.artifact;
        state.secondArtifact = snap.secondArtifact || { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
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
        state.undoSnapshot = null;
        renderAll();
        showToast("Dernière action annulée.");
        return true;
      }

      function handleCancelButton() {
        if (state?.inputLocked) return;
        if (state?.phase === "ACTION" && state?.selectedActionType) {
          cancelSelectedCard();
        } else if (state?.phase === "PLACE_ISLAND") {
          state.phase = "ACTION_SELECT";
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
          state.crownPick