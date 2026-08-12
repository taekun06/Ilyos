);
            break;
          case "turn":
            playTone(246.94, .18, .30, "triangle");
            playTone(369.99, .26, .30, "triangle", .10);
            break;
          case "victory":
            [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => playTone(frequency, .55, .36, "sine", index * .14));
            break;
          default:
            playTone(520, .12, .28, "sine");
        }
      }

      function drawCards(player, count) {
        while (player.hand.length < count) {
          if (player.deck.length === 0) {
            if (player.discard.length === 0) break;
            player.deck = shuffle(
              player.discard.splice(0).map(card => ({
                ...card,
                used: false,
                fromStash: false
              }))
            );
          }

          const card = player.deck.pop();
          if (!card) break;
          card.used = false;
          card.fromStash = false;
          player.hand.push(card);
        }
      }

      function phaseInfo() {
        const amount = state.selectedActionType ? selectedBatchSize() : 1;
        const magicDegrees = ((state.magicPreviewSteps || 0) % 5 + 5) % 5 * 90;
        const player = currentPlayer();

        if (player?.isAI || state.aiThinking) {
          return { label: "Tour de l’adversaire", instruction: "L’adversaire joue. Vos commandes sont temporairement verrouillées." };
        }

        switch (state.phase) {
          case "SETUP_SELECT":
            return { label: "Choisir le setup", instruction: "Sélectionnez la configuration du Duel symétrique." };
          case "CHOOSE_ISLAND_SHAPE":
            return { label: "Île obligatoire", instruction: "Prochain clic : choisissez une forme dans le panneau de gauche." };
          case "PLACE_ISLAND":
            return { label: "Poser l’île", instruction: "Prochain clic : une zone verte du plateau." };
          case "PLACE_SPAWN":
            return { label: "Invocation obligatoire", instruction: "Prochain clic : une case libre de la nouvelle île." };
          case "DROP_TREASURE":
            return { label: "Transmettre ou poser", instruction: "Prochain clic : un allié ou une case libre adjacente." };
          case "PICKUP_CROWN":
            return { label: "Récupérer la couronne", instruction: "Prochain clic : un de vos gardiens adjacents." };
          case "SMART_CHAR":
            return { label: "Gardien sélectionné", instruction: "Prochain clic : une destination éclairée ou une cible adjacente." };
          case "ACTION_SELECT":
            return state.islandPlacedThisTurn
              ? { label: "Choisir une action", instruction: "Choisissez une action à droite ou cliquez directement une cible valide." }
              : { label: "Île obligatoire", instruction: "Commencez par choisir une forme à gauche. Vous pourrez agir avant ou après sa pose." };
          case "ACTION":
            if (state.selectedActionType === "MOVE") {
              return state.selectedCharId
                ? { label: `Déplacement 1 à ${amount}`, instruction: "Prochain clic : une destination éclairée." }
                : { label: `Déplacement 1 à ${amount}`, instruction: "Prochain clic : un de vos gardiens." };
            }
            if (state.selectedActionType === "PUSH") {
              return state.selectedCharId
                ? { label: `Poussée ×${amount}`, instruction: "Prochain clic : une cible adjacente éclairée." }
                : { label: `Poussée ×${amount}`, instruction: "Prochain clic : votre gardien pousseur." };
            }
            return state.selectedIslandId
              ? { label: `Magie ${magicDegrees ? magicDegrees + "°" : ""}`.trim(), instruction: magicDegrees ? "Prochain clic : une case de l’aperçu pour valider." : "Tournez l’île avec ↺, ↻ ou la molette." }
              : { label: "Magie", instruction: "Prochain clic : une case pivot sur l’île à tourner." };
          default:
            return { label: "", instruction: "" };
        }
      }

      function turnContextInfo() {
        const amount = state.selectedActionType ? selectedBatchSize() : 1;
        const action = state.selectedActionType ? ACTIONS[state.selectedActionType] : null;
        const player = currentPlayer();

        if (player?.isAI || state.aiThinking) {
          return { kind: "wait", kicker: "TOUR DE L’ADVERSAIRE", title: `${player?.icon || ""} ${player?.name || "Ordinateur"}`.trim(), next: "L’adversaire prépare son action." };
        }

        if (!state.islandPlacedThisTurn && state.phase === "ACTION_SELECT") {
          return { kind: "build", kicker: "ÉTAPE OBLIGATOIRE", title: "Poser une île", next: "Choisissez une forme à gauche." };
        }
        if (state.phase === "CHOOSE_ISLAND_SHAPE") {
          return { kind: "build", kicker: "ÉTAPE OBLIGATOIRE", title: "Choisir une île", next: "Cliquez une forme à gauche." };
        }
        if (state.phase === "PLACE_ISLAND") {
          return { kind: "build", kicker: "ÎLE SÉLECTIONNÉE", title: "Choisir son emplacement", next: "Cliquez une zone verte du plateau." };
        }
        if (state.phase === "PLACE_SPAWN") {
          return { kind: "build", kicker: "INVOCATION OBLIGATOIRE", title: "Placer le gardien", next: "Cliquez une case libre de la nouvelle île." };
        }
        if (state.phase === "DROP_TREASURE") {
          return { kind: "crown", kicker: "COURONNE", title: "Transmettre ou poser", next: "Cliquez un allié ou une case libre adjacente." };
        }
        if (state.phase === "PICKUP_CROWN") {
          return { kind: "crown", kicker: "COURONNE", title: "Choisir le porteur", next: "Cliquez un de vos gardiens adjacents." };
        }
        if (state.phase === "SMART_CHAR") {
          return { kind: "move", kicker: "GARDIEN SÉLECTIONNÉ", title: "Choisir son action", next: "Cliquez une destination ou une cible éclairée." };
        }
        if (state.phase === "ACTION" && action) {
          if (state.selectedActionType === "MOVE") {
            return { kind: "move", kicker: "ACTION ACTIVE", title: `${action.icon} ${action.name} · jusqu’à ${amount}`, next: state.selectedCharId ? "Cliquez une destination éclairée." : "Cliquez un de vos gardiens." };
          }
          if (state.selectedActionType === "PUSH") {
            return { kind: "push", kicker: "ACTION ACTIVE", title: `${action.icon} ${action.name} · force ${amount}`, next: state.selectedCharId ? "Cliquez une cible adjacente éclairée." : "Cliquez votre gardien pousseur." };
          }
          const degrees = ((state.magicPreviewSteps || 0) % 5 + 5) % 5 * 90;
          return { kind: "magic", kicker: "ACTION ACTIVE", title: `${action.icon} ${action.name}${degrees ? ` · ${degrees}°` : ""}`, next: state.selectedIslandId ? (degrees ? "Cliquez l’aperçu pour valider." : "Tournez avec ↺, ↻ ou la molette.") : "Cliquez une case pivot sur une île." };
        }
        if (state.islandPlacedThisTurn) {
          return { kind: "end", kicker: "À VOUS DE JOUER", title: "Choisir une action ou terminer", next: "Actions à droite · Fin du tour quand vous êtes prêt." };
        }
        return { kind: "build", kicker: "À FAIRE", title: "Poser une île", next: "Choisissez une forme à gauche." };
      }

      function renderTurnContext() {
        const root = document.getElementById("turnContext");
        if (!root || !state) return;
        const info = turnContextInfo();
        root.className = `turn-context context-${info.kind}`;
        document.getElementById("turnContextKicker").textContent = info.kicker;
        document.getElementById("turnContextTitle").textContent = info.title;
        document.getElementById("turnContextNext").textContent = info.next;
      }


      function scheduleBoardRender() {
        if (document.body.dataset.visualMode === "alternative") return;
        if (boardRenderFrame || !state) return;
        boardRenderFrame = requestAnimationFrame(() => {
          boardRenderFrame = 0;
          if (state) renderBoard();
        });
      }

      function updateCrownStatus() {
        if (!els.crownStatus || !state) return;
        const crowns = activeArtifacts();
        const carried = crowns.filter(artifact => artifact.carrierId).length;
        const loose = crowns.length - carried;
        const readyOwnerFor = artifact => {
          const carrier = characterById(artifact.carrierId);
          if (carrier) {
            const owner = state.players[carrier.player];
            return owner && isCrownValidationCell(owner, carrier.r, carrier.c)
              ? owner
              : null;
          }
          if (!Number.isFinite(artifact.r) || !Number.isFinite(artifact.c)) return null;
          return state.players.find(owner => isCrownValidationCell(owner, artifact.r, artifact.c)) || null;
        };
        const readyCrowns = crowns
          .map(artifact => ({ artifact, owner: readyOwnerFor(artifact) }))
          .filter(entry => entry.owner);
        const ready = readyCrowns.length;

        els.crownStatus.classList.toggle("crown-ready", ready > 0);
        els.crownStatus.textContent = ready > 0
          ? `${ready} à valider · ${readyCrowns[0].owner.name}`
          : `${loose} libre${loose > 1 ? "s" : ""} · ${carried} portée${carried > 1 ? "s" : ""}`;
        els.crownStatus.title = crowns
          .map((artifact, index) => {
            const carrier = characterById(artifact.carrierId);
            const readyOwner = readyOwnerFor(artifact);
            if (readyOwner) {
              return `Couronne ${index + 1} : village de ${readyOwner.name} — validation au début de son prochain tour`;
            }
            return carrier
              ? `Couronne ${index + 1} : ${state.players[carrier.player].name}`
              : `Couronne ${index + 1} : libre`;
          })
          .join("\n");
      }

      function renderAll() {
        ensureArtifactState();
        renderHeader();
        renderTurnContext();
        renderBoard();
        renderHand();
        renderScores();
        renderDeckDisplay();
        renderStats();
        renderIslandSelector();
        renderControls();
        renderUnitCard();
        updateCrownStatus();
        updateOnlineBadge();
        scheduleOnlineSync();
        scheduleLocalSave();
      }

      function renderHeader() {
        const p = currentPlayer();
        const info = phaseInfo();
        const previousPlayer = els.gameScreen.dataset.player;

        els.activePortrait.textContent = p.icon;
        els.activePortrait.style.color = p.color;
        els.activeName.textContent = p.name;
        els.phaseLabel.textContent = info.label;
        els.turnLabel.textContent = `Tour ${state.turn}${p.isAI ? ` · IA ${AI_LEVELS[state.aiDifficulty || "normal"].label}` : ""}`;
        updateTurnTimerDisplay();
        updateOnlineBadge();
        els.instruction.textContent = info.instruction;
        document.documentElement.style.setProperty("--player-color", p.color);

        const islandPickPhase = !state.islandPlacedThisTurn;
        if (els.leftPanel) els.leftPanel.classList.toggle("choice-focus", islandPickPhase);
        els.gameScreen.classList.toggle("island-required", !state.islandPlacedThisTurn);

        if (previousPlayer !== String(p.id)) {
          els.gameScreen.dataset.player = String(p.id);
          els.gameScreen.classList.remove("player-switch");
          void els.gameScreen.offsetWidth;
          els.gameScreen.classList.add("player-switch");
          setTimeout(() => els.gameScreen.classList.remove("player-switch"), 720);
        }

        [els.stepIsland, els.stepActions, els.stepEnd].forEach(el => el.className = "");
        const placingIsland = state.phase === "CHOOSE_ISLAND_SHAPE" || state.phase === "PLACE_ISLAND" || state.phase === "PLACE_SPAWN";
        if (!state.islandPlacedThisTurn || placingIsland) {
          els.stepIsland.classList.add("active");
          if (!placingIsland) els.stepActions.classList.add("active");
        } else {
          els.stepIsland.classList.add("done");
          els.stepActions.classList.add("active");
          if (allCardsUsed()) {
            els.stepActions.className = "done";
            els.stepEnd.classList.add("active");
          }
        }
      }

      function shapeMiniHTML(cells) {
        const norm = normalizeShape(cells);
        const rows = Math.max(...norm.map(([r]) => r)) + 1;
        const cols = Math.max(...norm.map(([, c]) => c)) + 1;
        const positions = new Set(norm.map(([r, c]) => key(r, c)));
        let html = `<span class="island-mini" style="--mini-rows:${rows};--mini-cols:${cols}">`;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (positions.has(key(r, c))) {
              html += `<i style="grid-row:${r + 1};grid-column:${c + 1}"></i>`;
            }
          }
        }
        return html + "</span>";
      }

      function renderIslandSelector() {
        els.islandSelector.innerHTML = "";
        const available = !state.islandPlacedThisTurn && ["ACTION_SELECT", "CHOOSE_ISLAND_SHAPE", "PLACE_ISLAND"].includes(state.phase);
        const emphasize = !state.islandPlacedThisTurn;

        Object.entries(SHAPES).forEach(([shapeKey, shape]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "island-choice" +
            (state.selectedIslandShape === shapeKey ? " active" : "") +
            (emphasize ? " choice-ready" : "");
          button.disabled = !available;
          button.innerHTML = `<span class="island-choice-preview">${shapeMiniHTML(shape.cells)}</span><span class="island-choice-name">${shape.name}</span>`;
          button.title = shape.name;
          button.setAttribute("aria-label", `Choisir l’île ${shape.name}`);
          button.addEventListener("click", () => selectIslandShape(shapeKey));
          els.islandSelector.appendChild(button);
        });
      }

      function selectIslandShape(shapeKey) {
        if (!canLocalPlayerAct()) return;
        if (state.islandPlacedThisTurn) return;
        if (!["ACTION_SELECT", "CHOOSE_ISLAND_SHAPE", "PLACE_ISLAND"].includes(state.phase)) return;
        state.selectedIslandShape = shapeKey;
        state.placementCells = cloneCells(SHAPES[shapeKey].cells);
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.treasureDropFromId = null;
        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "PLACE_ISLAND";
        renderAll();
        showToast(`Île sélectionnée.`);
        playSfx("card");
      }

      function previewAbsoluteCells(anchorR, anchorC) {
        if (state.phase !== "PLACE_ISLAND" || !state.placementCells) return [];
        const origin = state.placementCells[state.placementOriginIndex] || state.placementCells[0] || [0, 0];
        return state.placementCells.map(([dr, dc]) => [anchorR + (dr - origin[0]), anchorC + (dc - origin[1])]);
      }

      function isValidPlacement(anchorR, anchorC) {
        const cells = previewAbsoluteCells(anchorR, anchorC);
        if (cells.length === 0) return false;

        // Une île peut être posée n'importe où :
        // elle doit seulement rester dans la grille et ne rien chevaucher.
        return cells.every(([r, c]) => inside(r, c) && !isLand(r, c));
      }

      function recomputeValidAnchors() {
        // V5 : aucune indication permanente. Seul l’aperçu sous la souris est coloré.
      }

      function previewClassForCell(r, c) {
        if (state.phase !== "PLACE_ISLAND" || !state.hoverAnchor) return "";
        const [ar, ac] = state.hoverAnchor;
        const cells = previewAbsoluteCells(ar, ac);
        if (!cells.some(([pr, pc]) => pr === r && pc === c)) return "";
        return isValidPlacement(ar, ac) ? "preview-valid" : "preview-invalid";
      }

      function renderBoard() {
        els.board.innerHTML = "";
        const magicPreviewSet = new Set((state.magicPreviewCells || []).map(([r, c]) => key(r, c)));
        const fxMap = new Map((state.fxCells || []).map(fx => [key(fx.r, fx.c), fx.type]));
        const spawnIsland = state.pendingSpawnIslandId ? state.islands.find(is => is.id === state.pendingSpawnIslandId) : null;
        const showMagicRotation = state.phase === "ACTION" && state.selectedActionType === "MAGIC" && (state.magicPreviewSteps || 0) > 0;
        const actionHoverKey = state.actionHoverCell ? key(state.actionHoverCell[0], state.actionHoverCell[1]) : null;
        const smartPathSet = new Set((state.smartHoverPath || []).map(([r, c]) => key(r, c)));
        const pushHoverPreview = getPushHoverPreview();
        const pushDestinationKey = pushHoverPreview?.destination ? key(pushHoverPreview.destination[0], pushHoverPreview.destination[1]) : null;
        const pushImpactOrigins = new Map(
          (pushHoverPreview?.impacts || []).map(impact => [key(impact.from[0], impact.from[1]), impact])
        );
        const pushImpactDestinations = new Map(
          (pushHoverPreview?.impacts || [])
            .filter(impact => impact.to)
            .map(impact => [key(impact.to[0], impact.to[1]), impact])
        );

        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.dataset.r = r;
            cell.dataset.c = c;

            const village = villageAt(r, c);
            const villageZone = villageZoneDataAt(r, c);
            const island = islandAt(r, c);
            const char = characterAt(r, c);
            if (island) {
              cell.style.setProperty("--island-owner", state.players[island.owner].color);
              cell.classList.add("placed-island-cell");
            }
            const northLand = inside(r - 1, c) && isLand(r - 1, c);
            const southLand = inside(r + 1, c) && isLand(r + 1, c);
            const westLand = inside(r, c - 1) && isLand(r, c - 1);
            const eastLand = inside(r, c + 1) && isLand(r, c + 1);

            if (isLand(r, c)) {
              cell.classList.add("land");
              if (!northLand) cell.classList.add("edge-top");
              if (!southLand) cell.classList.add("edge-bottom");
              if (!westLand) cell.classList.add("edge-left");
              if (!eastLand) cell.classList.add("edge-right");

              if (island) {
                const northIsland = inside(r - 1, c) ? islandAt(r - 1, c) : null;
                const southIsland = inside(r + 1, c) ? islandAt(r + 1, c) : null;
                const westIsland = inside(r, c - 1) ? islandAt(r, c - 1) : null;
                const eastIsland = inside(r, c + 1) ? islandAt(r, c + 1) : null;
                if (!northIsland || northIsland.id !== island.id) cell.classList.add("island-outline-top");
                if (!southIsland || southIsland.id !== island.id) cell.classList.add("island-outline-bottom");
                if (!westIsland || westIsland.id !== island.id) cell.classList.add("island-outline-left");
                if (!eastIsland || eastIsland.id !== island.id) cell.classList.add("island-outline-right");
              }
            } else {
              cell.classList.add("void", ((r + c) % 2 === 0 ? "cloud-a" : "cloud-b"));
            }

            if (villageZone) {
              cell.style.setProperty("--village-color", villageZone.player.color);

              if (village) {
                cell.classList.add("village");
                cell.innerHTML += `
                <span class="village-icon">🏰</span>
                <span class="village-owner-mark" style="--village-color:${village.color}">${playerShortName(village)}</span>
              `;
              } else if (!island) {
                /*
                 * Le repère coloré disparaît dès qu'une île est construite
                 * sur cette case afin de laisser apparaître le terrain normal.
                 */
                cell.classList.add("village-zone-extension");
                cell.innerHTML += `
                <span class="village-zone-fill" style="--village-color:${villageZone.player.color}"></span>
              `;
              }
            }
            if (isSanctuary(r, c)) {
              cell.classList.add(
                "sanctuary",
                isSanctuaryCenter(r, c) ? "sanctuary-center" : "sanctuary-arm"
              );
              cell.innerHTML += isSanctuaryCenter(r, c)
                ? `<span class="sanctuary-ring"></span>`
                : `<span class="sanctuary-arm-mark"></span>`;
            }
            if (island && state.selectedIslandId === island.id && !(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) {
              cell.classList.add("selected");
            }
            if (
              (state.phase === "ACTION_SELECT" || (state.phase === "ACTION" && state.selectedActionType === "MAGIC"))
              && island
              && state.magicHoverIslandId === island.id
            ) {
              cell.classList.add("magic-hover-island");
            }
            if (
              (state.phase === "ACTION_SELECT" || (state.phase === "ACTION" && state.selectedActionType === "MAGIC"))
              && isSameCell(state.magicHoverPivot, [r, c])
            ) {
              cell.classList.add("magic-hover-pivot");
            }
            if (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && island && state.selectedIslandId === island.id) {
              cell.classList.add("magic-selected-island");
            }
            if (state.phase === "PICKUP_CROWN" && char && char.player === state.currentPlayer && state.reachable.has(key(r, c))) {
              cell.classList.add("crown-claimable", "ally-ready");
            }
            if (
              state.phase === "DROP_TREASURE"
              && char
              && (state.crownTransferTargetIds || []).includes(char.id)
              && state.reachable.has(key(r, c))
            ) {
              cell.classList.add("crown-claimable", "ally-ready", "crown-transfer-choice");
            }
            const hideReachableAfterCharacterChoice = (
              (state.phase === "ACTION" && state.selectedCharId && ["MOVE", "PUSH"].includes(state.selectedActionType || ""))
              || state.phase === "SMART_CHAR"
            );
            if (state.reachable.has(key(r, c)) && !hideReachableAfterCharacterChoice) cell.classList.add("reachable");
            if (state.selectedCharId && char?.id === state.selectedCharId) cell.classList.add("selected-character");

            const placementClass = previewClassForCell(r, c);
            if (placementClass) cell.classList.add(placementClass);

            if (showMagicRotation && magicPreviewSet.has(key(r, c))) {
              cell.classList.add(state.magicPreviewValid ? "magic-valid" : "magic-invalid", "magic-rotation-preview");
            }
            if (state.selectedMagicPivot && state.selectedMagicPivot[0] === r && state.selectedMagicPivot[1] === c) cell.classList.add("magic-pivot");

            const spawnAllowed = spawnIsland && spawnIsland.cells.some(([ir, ic]) => ir === r && ic === c) && !char;
            if (spawnAllowed) cell.classList.add("spawn-choice");

            const cellKey = key(r, c);
            if (
              ((state.phase === "ACTION" && state.selectedActionType === "MOVE") || (state.phase === "SMART_CHAR" && state.smartHoverType === "MOVE"))
              && state.selectedCharId
              && actionHoverKey === cellKey
            ) {
              cell.classList.add("move-target-preview", "action-target-preview");
            }
            if (
              ((state.phase === "ACTION" && state.selectedActionType === "PUSH") || (state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH"))
              && actionHoverKey === cellKey
            ) {
              cell.classList.add("push-target-preview", "action-target-preview");

              const pusher = characterById(state.selectedCharId);
              if (pusher) {
                const dr = r - pusher.r;
                const dc = c - pusher.c;
                const angle =
                  dc === 1 ? "0deg" :
                    dr === 1 ? "90deg" :
                      dc === -1 ? "180deg" :
                        "-90deg";
                cell.style.setProperty("--push-arrow-angle", angle);
              }
            }
            if (state.phase === "SMART_CHAR" && state.smartHoverType === "CANCEL" && actionHoverKey === cellKey) {
              cell.classList.add("smart-cancel-preview");
            }
            if (smartPathSet.has(cellKey)) {
              cell.classList.add("move-path-preview");
              const pathIndex = (state.smartHoverPath || []).findIndex(
                ([pr, pc]) => pr === r && pc === c
              );
              const pathMeta = state.smartHoverPath?.steps?.[pathIndex];
              if (pathMeta?.diagonal) {
                cell.classList.add("diagonal-step-preview");
              }
            }
            const pushOriginImpact = pushImpactOrigins.get(cellKey);
            const pushDestinationImpact = pushImpactDestinations.get(cellKey);
            if (pushOriginImpact) {
              cell.classList.add("push-line-preview");
              if (pushOriginImpact.fell) cell.classList.add("push-fall-preview");
            }
            if (pushDestinationImpact || pushDestinationKey === cellKey) {
              cell.classList.add("push-destination-preview");
            }

            const fxType = fxMap.get(cellKey);
            if (fxType) cell.classList.add(`fx-${fxType}`);

            const looseCrowns = activeArtifacts().filter(artifact =>
              artifact.carrierId === null && artifact.r === r && artifact.c === c
            );
            looseCrowns.forEach(artifact => {
              const crownClass = artifact.id === "crown-2" ? "crown-2" : "crown-1";
              cell.innerHTML += `<span class="artifact ${crownClass}" data-artifact-id="${artifact.id}" title="Cliquer pour récupérer cette couronne">👑</span>`;
            });

            if (char) {
              const owner = state.players[char.player];
              const carriedArtifact = artifactCarriedBy(char.id);
              const carrying = !!carriedArtifact;
              const crownPointReady = (
                state.phase === "ACTION_SELECT"
                && char.player === state.currentPlayer
                && canValidateCrownPoint(char)
              );
              if (crownPointReady) cell.classList.add("crown-validation-ready");
              const selectingActionCharacter = state.phase === "ACTION"
                && ["MOVE", "PUSH"].includes(state.selectedActionType || "")
                && char.player === state.currentPlayer;
              const selectable = (
                (selectingActionCharacter && !state.selectedCharId)
                || (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && char.player === state.currentPlayer)
                || (state.phase === "PICKUP_CROWN" && char.player === state.currentPlayer && state.reachable.has(key(r, c)))
              );
              const readyAction = selectingActionCharacter && !state.selectedCharId;
              if (readyAction) cell.classList.add("ally-ready");
              cell.innerHTML += `
              <span class="character ${carrying ? "carrying" : ""} ${selectable ? "selectable" : ""} ${readyAction ? "ready-action" : ""}" style="--pcolor:${owner.color};--token-color:${owner.color}">
                ${carrying ? `<span class="carrier-crown ${char.player === state.currentPlayer ? "own-crown" : "opponent-crown"}" data-artifact-id="${carriedArtifact.id}" title="${char.player === state.currentPlayer ? "Cliquer pour transmettre ou poser gratuitement la couronne" : "Cliquer pour récupérer la couronne"}">👑</span>` : ``}
                <span class="character-standee">${owner.icon}</span>
                <span class="alt-guardian-3d" aria-hidden="true">
                  <span class="alt-guardian-aura"></span>
                  <span class="alt-guardian-legs"><i></i><i></i></span>
                  <span class="alt-guardian-body"></span>
                  <span class="alt-guardian-core"></span>
                  <span class="alt-guardian-head"></span>
                  <span class="alt-guardian-visor"></span>
                  <span class="alt-guardian-crest"></span>
                </span>
                <span class="character-base"></span>
              </span>
              ${crownPointReady ? `
                <span
                  class="crown-score-option"
                  role="button"
                  tabindex="0"
                  title="Dépenser 1 déplacement pour valider le point"
                >
                  <strong>VALIDER +1</strong>
                  <small>−1 déplacement</small>
                </span>
              ` : ""}
            `;
            } else if (state.phase === "PLACE_SPAWN" && spawnAllowed && state.hoverAnchor && state.hoverAnchor[0] === r && state.hoverAnchor[1] === c) {
              const owner = currentPlayer();
              cell.innerHTML += `
              <span class="character spawn-preview" style="--pcolor:${owner.color};--token-color:${owner.color}">
                <span class="character-standee">${owner.icon}</span>
                <span class="alt-guardian-3d" aria-hidden="true">
                  <span class="alt-guardian-aura"></span>
                  <span class="alt-guardian-legs"><i></i><i></i></span>
                  <span class="alt-guardian-body"></span>
                  <span class="alt-guardian-core"></span>
                  <span class="alt-guardian-head"></span>
                  <span class="alt-guardian-visor"></span>
                  <span class="alt-guardian-crest"></span>
                </span>
                <span class="character-base"></span>
              </span>
            `;
            }


            if (
              ((state.phase === "ACTION" && state.selectedActionType === "MOVE") || (state.phase === "SMART_CHAR" && state.smartHoverType === "MOVE"))
              && state.selectedCharId
              && actionHoverKey === key(r, c)
              && state.reachable.has(key(r, c))
              && !char
            ) {
              const selected = characterById(state.selectedCharId);
              const owner = selected ? state.players[selected.player] : currentPlayer();
              cell.innerHTML += `
              <span class="action-ghost move-ghost" style="--ghost-color:${owner.color}">
                <span>${owner.icon}</span>
              </span>
            `;
            }

            const destinationImpact = pushImpactDestinations.get(key(r, c));
            if (destinationImpact && !characterAt(r, c)) {
              cell.innerHTML += `
              <span class="action-ghost push-ghost ${destinationImpact.carrying ? "carrying" : ""}" style="--ghost-color:${destinationImpact.color}">
                <span>${destinationImpact.icon}</span>
              </span>
            `;
            }

            cell.addEventListener("mouseenter", onCellEnter);
            cell.addEventListener("mousemove", onCellEnter);
            cell.addEventListener("mouseleave", onCellLeave);
            cell.addEventListener("click", onCellClick);
            els.board.appendChild(cell);
          }
        }
        renderExitGates();
        renderIslandArtLayer();
        scheduleKayKitSync();
      }

      function islandBoundaryPath(cells) {
        const set = new Set(cells.map(([r, c]) => key(r, c)));
        const edges = [];

        cells.forEach(([r, c]) => {
          if (!set.has(key(r - 1, c))) edges.push([[c, r], [c + 1, r]]);
          if (!set.has(key(r, c + 1))) edges.push([[c + 1, r], [c + 1, r + 1]]);
          if (!set.has(key(r + 1, c))) edges.push([[c + 1, r + 1], [c, r + 1]]);
          if (!set.has(key(r, c - 1))) edges.push([[c, r + 1], [c, r]]);
        });

        const unused = new Set(edges.map((_, index) => index));
        const paths = [];
        const pointKey = point => `${point[0]},${point[1]}`;

        while (unused.size) {
          const firstIndex = unused.values().next().value;
          unused.delete(firstIndex);
          const first = edges[firstIndex];
          const start = first[0];
          let current = first[1];
          const points = [start, current];
          let guard = 0;

          while (pointKey(current) !== pointKey(start) && guard++ < 500) {
            const nextIndex = [...unused].find(index => pointKey(edges[index][0]) === pointKey(current));
            if (nextIndex === undefined) break;
            unused.delete(nextIndex);
            current = edges[nextIndex][1];
            points.push(current);
          }

          if (points.length >= 4) {
            paths.push(`M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`);
          }
        }

        return paths.join(" ");
      }

      function renderIslandArtLayer() {
        const oldLayer = els.board.querySelector(".island-art-layer");
        if (oldLayer) oldLayer.remove();
        if (!state.islands.length) return;

        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.classList.add("island-art-layer");
        svg.setAttribute("viewBox", `0 0 ${GRID} ${GRID}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML = `
        <defs>
          <linearGradient id="grassNatural" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c7eb82"/>
            <stop offset="46%" stop-color="#8fbe58"/>
            <stop offset="100%" stop-color="#5f873f"/>
          </linearGradient>
          <linearGradient id="grassGolden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d2ed78"/>
            <stop offset="45%" stop-color="#96c64f"/>
            <stop offset="100%" stop-color="#587d34"/>
          </linearGradient>
          <linearGradient id="grassMagic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#b9e47e"/>
            <stop offset="50%" stop-color="#79ae54"/>
            <stop offset="100%" stop-color="#466f42"/>
          </linearGradient>
          <linearGradient id="grassStone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c2e481"/>
            <stop offset="42%" stop-color="#87b557"/>
            <stop offset="100%" stop-color="#57763f"/>
          </linearGradient>
          <linearGradient id="cliffNatural" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#917252"/>
            <stop offset="100%" stop-color="#4f3c30"/>
          </linearGradient>
          <linearGradient id="cliffGolden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#98703f"/>
            <stop offset="100%" stop-color="#4e321e"/>
          </linearGradient>
          <linearGradient id="cliffMagic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#55716d"/>
            <stop offset="100%" stop-color="#263a42"/>
          </linearGradient>
          <linearGradient id="cliffStone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#97836c"/>
            <stop offset="100%" stop-color="#493d34"/>
          </linearGradient>
          <pattern id="grassSpeckles" width=".42" height=".42" patternUnits="userSpaceOnUse">
            <circle cx=".10" cy=".12" r=".035" fill="#f4ffd4" opacity=".48"/>
            <circle cx=".31" cy=".28" r=".026" fill="#466b36" opacity=".34"/>
          </pattern>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy=".16" stdDeviation=".12" flood-color="#172517" flood-opacity=".48"/>
          </filter>
          <filter id="magicGlow" x="-40%" y="-40%" width="180%" height="190%">
            <feGaussianBlur stdDeviation=".055" result="blur"/>
            <feFlood flood-color="#62e8ff" flood-opacity=".90" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          <linearGradient id="altIslandTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#d7fff2"/>
            <stop offset="38%" stop-color="#71e0c4"/>
            <stop offset="72%" stop-color="#3d8fa9"/>
            <stop offset="100%" stop-color="#285272"/>
          </linearGradient>
          <linearGradient id="altIslandCliff" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#315b72"/>
            <stop offset="48%" stop-color="#182c49"/>
            <stop offset="100%" stop-color="#090f24"/>
          </linearGradient>
          <linearGradient id="altIslandCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#63f7ff" stop-opacity=".10"/>
            <stop offset="42%" stop-color="#7f6dff" stop-opacity=".92"/>
            <stop offset="100%" stop-color="#ff65d8" stop-opacity=".20"/>
          </linearGradient>
          <pattern id="altRunes" width=".52" height=".52" patternUnits="userSpaceOnUse">
            <path d="M .08 .26 L .22 .08 L .38 .26 L .22 .44 Z" fill="none" stroke="#c9ffff" stroke-width=".025" opacity=".56"/>
          </pattern>
          <filter id="altIslandGlow" x="-50%" y="-50%" width="200%" height="230%">
            <feDropShadow dx="0" dy=".20" stdDeviation=".12" flood-color="#040817" flood-opacity=".88"/>
            <feDropShadow dx="0" dy="0" stdDeviation=".06" flood-color="#75ecff" flood-opacity=".70"/>
          </filter>
        </defs>
      `;

        state.islands.forEach(island => {
          const pathData = islandBoundaryPath(island.cells);
          if (!pathData) return;
          const group = document.createElementNS(ns, "g");
          group.classList.add("island-art");
          group.style.setProperty("--owner-color", state.players[island.owner]?.color || "#ffffff");
          group.dataset.islandId = island.id;
          group.innerHTML = `
          <path class="island-deep-shadow" d="${pathData}" transform="translate(0 .24)"></path>
          <path class="island-alt-core" d="${pathData}" transform="translate(0 .31)"></path>
          <path class="island-cliff" d="${pathData}" transform="translate(0 .15)"></path>
          <path class="island-rim" d="${pathData}"></path>
          <path class="island-top" d="${pathData}"></path>
          <path class="island-texture" d="${pathData}"></path>
          <path class="island-alt-runes" d="${pathData}"></path>
          <path class="island-owner-line" d="${pathData}"></path>
        `;
          svg.appendChild(group);
        });

        els.board.insertBefore(svg, els.board.firstChild);
      }

      function loadIslandRenderDemo() {
        state.islands = [
          { id: 1, owner: 0, anchor: { r: 2, c: 2 }, relCells: [[0, 0], [0, 1], [1, 0]], cells: [[2, 2], [2, 3], [3, 2]] },
          { id: 2, owner: 1, anchor: { r: 2, c: 6 }, relCells: [[0, 0], [0, 1], [1, 0], [1, 1]], cells: [[2, 6], [2, 7], [3, 6], [3, 7]] },
          { id: 3, owner: 0, anchor: { r: 5, c: 1 }, relCells: [[0, 0], [0, 1], [0, 2]], cells: [[5, 1], [5, 2], [5, 3]] },
          { id: 4, owner: 1, anchor: { r: 6, c: 7 }, relCells: [[0, 0], [0, 1], [1, 0]], cells: [[6, 7], [6, 8], [7, 7]] },
          { id: 5, owner: 0, anchor: { r: 8, c: 3 }, relCells: [[0, 1], [1, 0], [1, 1], [1, 2]], cells: [[8, 4], [9, 3], [9, 4], [9, 5]] }
        ];
        state.nextIslandId = 6;
        if (state.characters[0]) { state.characters[0].r = 3; state.characters[0].c = 2; }
        if (state.characters[1]) { state.characters[1].r = 6; state.characters[1].c = 7; }
        state.artifact = { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true };
        state.secondArtifact = { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
        state.phase = "ACTION_SELECT";
        state.islandPlacedThisTurn = false;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.pendingSpawnIslandId = null;
        state.hoverAnchor = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set();
        renderAll();
      }

      function onCellEnter(event) {
        const r = Number(event.currentTarget.dataset.r);
        const c = Number(event.currentTarget.dataset.c);

        if (state.phase === "PLACE_ISLAND") {
          state.hoverAnchor = [r, c];
          updatePlacementPreview(r, c);
          return;
        }

        if (state.phase === "PLACE_SPAWN") {
          state.hoverAnchor = [r, c];
          els.board.querySelectorAll(".spawn-preview").forEach(node => node.remove());
          const cell = els.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
          if (cell && cell.classList.contains("spawn-choice")) {
            const owner = currentPlayer();
            cell.insertAdjacentHTML("beforeend", `
            <span class="character spawn-preview" style="--pcolor:${owner.color};--token-color:${owner.color}">
              <span class="character-standee">${owner.icon}</span>
                <span class="alt-guardian-3d" aria-hidden="true">
                  <span class="alt-guardian-aura"></span>
                  <span class="alt-guardian-legs"><i></i><i></i></span>
                  <span class="alt-guardian-body"></span>
                  <span class="alt-guardian-core"></span>
                  <span class="alt-guardian-head"></span>
                  <span class="alt-guardian-visor"></span>
                  <span class="alt-guardian-crest"></span>
                </span>
                <span class="character-base"></span>
            </span>
          `);
          }
          return;
        }

        if (state.phase === "SMART_CHAR") {
          const preview = previewSmartCharacterTarget(r, c);
          const nextCell = preview.type ? [r, c] : null;
          if (
            !isSameCell(state.actionHoverCell, nextCell)
            || state.smartHoverType !== preview.type
            || JSON.stringify(state.smartHoverPath) !== JSON.stringify(preview.path)
          ) {
            state.actionHoverCell = nextCell;
            state.smartHoverType = preview.type;
            state.smartHoverPath = preview.path || [];
            // Nouvelle cible : tout choix de force explicite précédent portait
            // sur une cible différente, il ne veut plus rien dire ici.
            state.smartPushForce = null;
            scheduleBoardRender();
            // Le panneau ACTIONS doit apparaître/disparaître avec le contrôle de
            // force contextuel dès que la cible poussable survolée change.
            renderHand();
          }
          return;
        }

        if (state.phase === "ACTION_SELECT") {
          const island = islandAt(r, c);
          const char = characterAt(r, c);
          const nextIslandId = island && !char && availableActionCount("MAGIC") > 0 ? island.id : null;
          const nextPivot = nextIslandId ? [r, c] : null;
          const samePivot = nextPivot ? isSameCell(state.magicHoverPivot, nextPivot) : !state.magicHoverPivot;
          if (state.magicHoverIslandId !== nextIslandId || !samePivot) {
            state.magicHoverIslandId = nextIslandId;
            state.magicHoverPivot = nextPivot;
            scheduleBoardRender();
          }
          return;
        }

        if (state.phase === "ACTION" && state.selectedActionType === "MAGIC") {
          const island = islandAt(r, c);
          const nextIslandId = island?.id || null;
          const nextPivot = island ? [r, c] : null;
          const samePivot = nextPivot ? isSameCell(state.magicHoverPivot, nextPivot) : !state.magicHoverPivot;
          if (state.magicHoverIslandId !== nextIslandId || !samePivot) {
            state.magicHoverIslandId = nextIslandId;
            state.magicHoverPivot = nextPivot;
            scheduleBoardRender();
          }
          return;
        }

        if (state.phase === "ACTION" && state.selectedCharId && ["MOVE", "PUSH"].includes(state.selectedActionType)) {
          let valid = false;
          let path = [];

          if (state.selectedActionType === "MOVE") {
            const actor = characterById(state.selectedCharId);
            path = actor
              ? (shortestMovementPath(actor, r, c, availableActionCount("MOVE")) || [])
              : [];
            valid = path.length > 0;
          } else {
            const pusher = characterById(state.selectedCharId);
            valid = !!pusher
              && Math.abs(pusher.r - r) + Math.abs(pusher.c - c) === 1
              && !!(characterAt(r, c) || looseArtifactAt(r, c));
          }

          const next = valid ? [r, c] : null;
          const pathChanged = JSON.stringify(state.smartHoverPath || []) !== JSON.stringify(path);
          if (!isSameCell(state.actionHoverCell, next) || pathChanged) {
            state.actionHoverCell = next;
            state.smartHoverPath = path;
            scheduleBoardRender();
          }
        }
      }

      function onCellLeave(event) {
        if (!state) return;
        const r = Number(event.currentTarget.dataset.r);
        const c = Number(event.currentTarget.dataset.c);

        if (state.phase === "SMART_CHAR" && isSameCell(state.actionHoverCell, [r, c])) {
          clearSmartHover();
          scheduleBoardRender();
          renderHand();
          return;
        }

        if ((state.phase === "ACTION_SELECT" || (state.phase === "ACTION" && state.selectedActionType === "MAGIC")) && isSameCell(state.magicHoverPivot, [r, c])) {
          state.magicHoverIslandId = null;
          state.magicHoverPivot = null;
          scheduleBoardRender();
          return;
        }

        if (state.phase === "ACTION" && state.actionHoverCell && isSameCell(state.actionHoverCell, [r, c])) {
          state.actionHoverCell = null;
          if (state.selectedActionType === "MOVE") state.smartHoverPath = [];
          scheduleBoardRender();
        }
      }

      function clearPlacementPreview(clearAnchor = false) {
        els.board.querySelectorAll(".cell").forEach(cell => {
          cell.classList.remove("preview-valid", "preview-invalid");
        });
        if (clearAnchor) state.hoverAnchor = null;
        scheduleKayKitSync();
      }

      function updatePlacementPreview(anchorR, anchorC) {
        const valid = isValidPlacement(anchorR, anchorC);
        const preview = new Set(previewAbsoluteCells(anchorR, anchorC).map(([r, c]) => key(r, c)));

        els.board.querySelectorAll(".cell").forEach(cell => {
          cell.classList.remove("preview-valid", "preview-invalid");
          const r = Number(cell.dataset.r);
          const c = Number(cell.dataset.c);
          if (preview.has(key(r, c))) {
            cell.classList.add(valid ? "preview-valid" : "preview-invalid");
          }
        });
        scheduleKayKitSync();
      }


      function isCenterCrownCell(cell) {
        return Array.isArray(cell) && cell[0] === CENTER.r && cell[1] === CENTER.c;
      }

      function beginCrownRecovery(claimers, options = {}) {
        const validClaimers = (claimers || [])
          .filter(Boolean)
          .filter(claimer => !characterCarriesCrown(claimer.id));
        const {
          crownCell = null,
          stealTargetId = null,
          artifactId = null,
          emptyMessage = "Aucun de vos gardiens n’est adjacent à la couronne.",
          singleMessage = null,
          multipleMessage = "Choisissez le gardien adjacent qui récupère la couronne."
        } = options;

        if (isCenterCrownCell(crownCell) && state.centerCrownTakenThisTurn) {
          showToast("Une seule couronne peut être récupérée sur la case centrale pendant ce tour.");
          return false;
        }

        if (!validClaimers.length) {
          showToast(emptyMessage);
          return false;
        }

        if (validClaimers.length === 1) {
          const claimer = validClaimers[0];
          saveUndoSnapshot();
          const artifact = artifactById(artifactId)
            || (stealTargetId ? artifactCarriedBy(stealTargetId) : crownCell ? looseArtifactAt(crownCell[0], crownCell[1]) : null);
          if (!artifact || !giveArtifactToCharacter(artifact, claimer)) {
            state.undoSnapshot = null;
            showToast("Ce gardien porte déjà une couronne.");
            return false;
          }
          if (isCenterCrownCell(crownCell)) state.centerCrownTakenThisTurn = true;
          state.crownPickupCell = null;
          state.crownStealTargetId = null;
          state.selectedCharId = claimer.id;
          state.selectedIslandId = null;
          state.reachable = new Set();
          state.phase = "ACTION_SELECT";
          renderAll();
          animateCellPulse(claimer.r, claimer.c, "crown-burst");
          playSfx("crown");
          showToast(singleMessage || `${currentPlayer().name} récupère la couronne !`);
          return true;
        }

        state.crownStealTargetId = stealTargetId;
        state.crownPickupArtifactId = artifactId;
        state.crownPickupCell = crownCell;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set(validClaimers.map(claimer => key(claimer.r, claimer.c)));
        state.phase = "PICKUP_CROWN";
        renderAll();
        showToast(multipleMessage);
        return true;
      }

      function onCellClick(event) {
        if (!state || state.winner !== null || state.inputLocked || !canLocalPlayerAct()) return;
        const r = Number(event.currentTarget.dataset.r);
        const c = Number(event.currentTarget.dataset.c);
        const clickedScoreOption = !!event.target.closest?.(".crown-score-option");
        const clickedCrownNode = event.target.closest?.(".carrier-crown,.artifact");
        const clickedCrownBadge = !!event.target.closest?.(".carrier-crown");
        const clickedArtifactId = clickedCrownNode?.dataset?.artifactId || null;

        if (clickedScoreOption) {
          const scoringChar = characterAt(r, c);
          validateCrownPoint(scoringChar);
          return;
        }

        if (state.phase === "PLACE_ISLAND") {
          state.hoverAnchor = [r, c];
          if (isValidPlacement(r, c)) {
            placeIsland(r, c);
          } else {
            updatePlacementPreview(r, c);
            showToast("Cette forme ne tient pas ici.");
          }
          return;
        }

        if (state.phase === "PLACE_SPAWN") {
          if (!canCreateGuardian(state.currentPlayer)) {
            state.phase = "ACTION_SELECT";
            state.pendingSpawnIslandId = null;
            renderAll();
            showToast("Limite atteinte : 5 gardiens maximum.");
            return;
          }

          const island = state.islands.find(is => is.id === state.pendingSpawnIslandId);
          if (island && island.cells.some(([ir, ic]) => ir === r && ic === c) && !characterAt(r, c)) {
            const char = {
              id: `char-${state.nextCharId++}`,
              player: state.currentPlayer,
              r, c
            };
            state.characters.push(char);
            resolveArtifactForCharacter(char);
            state.phase = "ACTION_SELECT";
            state.selectedIslandShape = null;
            state.placementCells = null;
            state.placementOriginIndex = 0;
            state.hoverAnchor = null;
            state.pendingSpawnIslandId = null;
            state.selectedCharId = char.id;
            state.selectedIslandId = null;
            clearMagicPreview();
            resetKayKitPointerFeedback();
            renderAll();
            animateCellPulse(r, c, "spawn-arrival");
            playSfx("spawn");
            showToast("Gardien invoqué.");
          } else {
            showToast("Choisissez une case libre de l’île.");
          }
          return;
        }

        if (state.phase === "DROP_TREASURE") {
          const owner = characterById(state.treasureDropFromId);
          const clickedAlly = characterAt(r, c);
          const transferTargets = new Set(state.crownTransferTargetIds || []);

          if (owner && state.reachable.has(key(r, c))) {
            saveUndoSnapshot();
            const artifact = artifactById(state.treasureDropArtifactId) || artifactCarriedBy(owner.id);

            if (!artifact) {
              state.undoSnapshot = null;
              showToast("Aucune couronne à transmettre ou à poser.");
              return;
            }

            if (
              clickedAlly
              && clickedAlly.player === state.currentPlayer
              && transferTargets.has(clickedAlly.id)
              && !characterCarriesCrown(clickedAlly.id)
            ) {
              if (!giveArtifactToCharacter(artifact, clickedAlly)) {
                state.undoSnapshot = null;
                showToast("Ce gardien porte déjà une couronne.");
                return;
              }

              if (kaykit3D) {
                kaykit3D.characterFacing.set(String(owner.id), kaykitFacingRotation(owner.r, owner.c, clickedAlly.r, clickedAlly.c));
                kaykit3D.characterFacing.set(String(clickedAlly.id), kaykitFacingRotation(clickedAlly.r, clickedAlly.c, owner.r, owner.c));
              }
              state.treasureDropFromId = null;
              state.treasureDropArtifactId = null;
              state.crownTransferTargetIds = [];
              state.selectedCharId = clickedAlly.id;
              state.reachable = new Set();
              state.phase = "ACTION_SELECT";
              renderAll();
              animateCellPulse(clickedAlly.r, clickedAlly.c, "crown-burst");
              playSfx("crown");
              showToast(`${currentPlayer().name} transmet gratuitement la couronne.`);
              return;
            }

            if (clickedAlly) {
              state.undoSnapshot = null;
              showToast("Choisissez l’allié indiqué ou une case libre adjacente.");
              return;
            }

            artifact.carrierId = null;
            artifact.r = r;
            artifact.c = c;
            state.treasureDropFromId = null;
            state.treasureDropArtifactId = null;
            state.crownTransferTargetIds = [];
            state.selectedCharId = owner.id;
            state.reachable = new Set();
            state.phase = "ACTION_SELECT";
            renderAll();
            animateCellPulse(r, c, "crown-burst");
            playSfx("crown");
            showToast("Couronne posée gratuitement.");
          } else {
            showToast("Choisissez un allié adjacent ou une case libre adjacente.");
          }
          return;
        }

        if (state.phase === "PICKUP_CROWN") {
          const pickedChar = characterAt(r, c);
          if (pickedChar && pickedChar.player === state.currentPlayer && state.reachable.has(key(r, c))) {
            saveUndoSnapshot();
            const stolenFrom = characterById(state.crownStealTargetId);
            const artifact = artifactById(state.crownPickupArtifactId)
              || (stolenFrom ? artifactCarriedBy(stolenFrom.id) : state.crownPickupCell ? looseArtifactAt(state.crownPickupCell[0], state.crownPickupCell[1]) : null);
            if (!artifact || !giveArtifactToCharacter(artifact, pickedChar)) {
              state.undoSnapshot = null;
              showToast("Ce gardien porte déjà une couronne.");
              return;
            }
            if (isCenterCrownCell(state.crownPickupCell)) state.centerCrownTakenThisTurn = true;
            state.crownPickupCell = null;
            state.crownStealTargetId = null;
            state.crownPickupArtifactId = null;
            state.selectedCharId = pickedChar.id;
            state.selectedIslandId = null;
            state.reachable = new Set();
            state.phase = "ACTION_SELECT";
            renderAll();
            animateCellPulse(pickedChar.r, pickedChar.c, "crown-burst");
            playSfx("crown");
            showToast(stolenFrom ? `${currentPlayer().name} récupère la couronne à l’adversaire !` : "Couronne récupérée.");
          } else {
            showToast("Choisissez un de vos gardiens adjacents.");
          }
          return;
        }

        if (state.phase === "SMART_CHAR") {
          handleSmartCharacterClick(r, c);
          return;
        }

        if (state.phase === "ACTION") {
          const action = state.selectedActionType;
          if (action === "MOVE") handleMoveClick(r, c);
          else if (action === "PUSH") handlePushClick(r, c);
          else if (action === "MAGIC") handleMagicClick(r, c);
          return;
        }

        const char = characterAt(r, c);
        const island = islandAt(r, c);

        if (state.phase === "ACTION_SELECT" && looseArtifactAt(r, c)) {
          const clickedLooseArtifact = artifactById(clickedArtifactId) || looseArtifactAt(r, c);
          const claimers = orthogonalNeighbors(r, c)
            .map(([nr, nc]) => characterAt(nr, nc))
            .filter(adjacentChar => adjacentChar && adjacentChar.player === state.currentPlayer);

          beginCrownRecovery(claimers, {
            crownCell: [r, c],
            stealTargetId: null,
            artifactId: clickedLooseArtifact?.id || null,
            emptyMessage: "Aucun de vos gardiens n’est adjacent à la couronne.",
            singleMessage: `${currentPlayer().name} récupère automatiquement la couronne !`,
            multipleMessage: "Plusieurs gardiens sont adjacents : choisissez celui qui récupère la couronne."
          });
          return;
        }


        if (
          state.phase === "ACTION_SELECT"
          && char
          && char.player === state.currentPlayer
          && !clickedCrownBadge
          && canValidateCrownPoint(char)
        ) {
          validateCrownPoint(char);
          return;
        }

        if (
          state.phase === "ACTION_SELECT"
          && clickedCrownBadge
          && char
          && char.player !== state.currentPlayer
          && !!artifactCarriedBy(char.id)
        ) {
          const claimers = orthogonalNeighbors(r, c)
            .map(([nr, nc]) => characterAt(nr, nc))
            .filter(adjacentChar => adjacentChar && adjacentChar.player === state.currentPlayer);

          const opponentArtifact = artifactById(clickedArtifactId) || artifactCarriedBy(char.id);
          beginCrownRecovery(claimers, {
            crownCell: [r, c],
            stealTargetId: char.id,
            artifactId: opponentArtifact?.id || null,
            emptyMessage: "Placez un de vos gardiens à côté du porteur adverse pour récupérer la couronne.",
            singleMessage: `${currentPlayer().name} récupère automatiquement la couronne adverse !`,
            multipleMessage: "Plusieurs gardiens sont adjacents : choisissez celui qui récupère la couronne adverse."
          });
          return;
        }

        if (
          state.phase === "ACTION_SELECT"
          && clickedCrownBadge
          && char
          && char.player === state.currentPlayer
          && !!artifactCarriedBy(char.id)
        ) {
          const carriedArtifact = artifactById(clickedArtifactId) || artifactCarriedBy(char.id);

          const adjacentAllies = orthogonalNeighbors(r, c)
            .map(([nr, nc]) => characterAt(nr, nc))
            .filter(ally =>
              ally
              && ally.player === state.currentPlayer
              && ally.id !== char.id
              && !characterCarriesCrown(ally.id)
            );

          const dropCells = orthogonalNeighbors(r, c).filter(([nr, nc]) =>
            isLand(nr, nc)
            && !characterAt(nr, nc)
            && !looseArtifactAt(nr, nc)
          );

          const choiceCells = [
            ...dropCells,
            ...adjacentAllies.map(ally => [ally.r, ally.c])
          ];

          if (!choiceCells.length) {
            showToast("Aucune case libre et aucun allié adjacent ne peuvent recevoir la couronne.");
            return;
          }

          state.treasureDropArtifactId = carriedArtifact?.id || null;
          state.crownTransferTargetIds = adjacentAllies.map(ally => ally.id);
          state.selectedCharId = char.id;
          state.selectedIslandId = null;
          state.treasureDropFromId = char.id;
          state.reachable = new Set(choiceCells.map(([nr, nc]) => key(nr, nc)));
          state.phase = "DROP_TREASURE";
          renderAll();

          if (adjacentAllies.length && dropCells.length) {
            showToast("Choisissez : un allié adjacent ou une case libre pour poser la couronne.");
          } else if (adjacentAllies.length) {
            showToast("Choisissez l’allié adjacent qui reçoit la couronne.");
          } else {
            showToast("Choisissez une case adjacente libre pour poser la couronne.");
          }
          return;
        }

        if (state.phase === "ACTION_SELECT" && char && char.player !== state.currentPlayer && availableActionCount("PUSH") > 0) {
          const pushers = pushersForTarget(r, c);
          if (pushers.length === 1) {
            const pusher = pushers[0];
            const required = requiredPushForce(pusher.r, pusher.c, r, c);
            state.phase = "ACTION";
            state.selectedActionType = "PUSH";
            state.selectedActionCount = Math.min(availableActionCount("PUSH"), Math.max(required, state.pushForceChoice || 1));
            state.selectedCharId = pusher.id;
            state.reachable = new Set(orthogonalNeighbors(pusher.r, pusher.c).map(([nr, nc]) => key(nr, nc)));
            renderAll();
            return;
          }
          if (pushers.length > 1) {
            // Aucun pousseur choisi à la place du joueur : on met en évidence
            // les gardiens éligibles et on attend son clic.
            state.phase = "ACTION";
            state.selectedActionType = "PUSH";
            state.selectedActionCount = Math.max(1, Math.min(state.pushForceChoice || 1, availableActionCount("PUSH")));
            state.selectedCharId = null;
            state.reachable = new Set(pushers.map(p => key(p.r, p.c)));
            renderAll();
            showToast("Plusieurs gardiens peuvent pousser cette cible : cliquez celui qui doit agir.");
            return;
          }
        }

        if (state.phase === "ACTION_SELECT" && char && char.player === state.currentPlayer) {
          beginSmartCharacterAction(char);
          return;
        }

        if (state.phase === "ACTION_SELECT" && island && !char) {
          startDirectMagic(r, c);
          return;
        }

        if (char) {
          state.selectedCharId = char.id;
          state.selectedIslandId = null;
        } else if (island) {
          state.selectedIslandId = island.id;
          state.selectedCharId = null;
        } else {
          state.selectedCharId = null;
          state.selectedIslandId = null;
        }
        renderAll();
      }

      function placeIsland(anchorR, anchorC) {
        const absCells = previewAbsoluteCells(anchorR, anchorC);
        const island = {
          id: state.nextIslandId++,
          owner: state.currentPlayer,
          anchor: { r: anchorR, c: anchorC },
          relCells: cloneCells(state.placementCells),
          cells: absCells
        };
        state.islands.push(island);

        state.islandPlacedThisTurn = true;

        if (canCreateGuardian(state.currentPlayer)) {
          state.phase = "PLACE_SPAWN";
          state.pendingSpawnIslandId = island.id;
        } else {
          state.phase = "ACTION_SELECT";
          state.pendingSpawnIslandId = null;
        }
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.selectedCharId = null;
        clearMagicPreview();
        state.selectedIslandId = island.id;
        resetKayKitPointerFeedback();
        renderAll();
        animateIslandArrival(island);
        playSfx("island");

        if (canCreateGuardian(state.currentPlayer)) {
          showToast("Invocation : choisissez la case où le gardien apparaîtra.");
        } else {
          showToast("Île posée. Limite atteinte : 5 gardiens maximum.");
        }
      }

      function actionUnavailableReason(type) {
        const available = availableActionCount(type);
        if (available <= 0) return `Aucune action ${ACTIONS[type].name.toLowerCase()} disponible.`;
        if (type === "MOVE") {
          const movable = state.characters.some(char => {
            if (char.player !== state.currentPlayer) return false;
            return orthogonalNeighbors(char.r, char.c).some(([r, c]) => isLand(r, c) && !characterAt(r, c));
          });
          if (!movable) return "Aucune destination libre autour de vos gardiens.";
        }
        if (type === "PUSH") {
          const target = state.characters.some(char => {
            if (char.player !== state.currentPlayer) return false;
            return orthogonalNeighbors(char.r, char.c).some(([r, c]) => {
              const other = characterAt(r, c); return !!(looseArtifactAt(r, c) || (other && other.player !== state.currentPlayer));
            });
          });
          if (!target) return "Aucun adversaire ou objet adjacent à pousser.";
        }
        if (type === "MAGIC" && !(state.islands || []).length) return "Aucune île compatible avec la magie.";
        return "";
      }

      function renderHand() {
        els.hand.innerHTML = "";
        // Le panneau doit changer d'allure dès qu'un gardien est sélectionné,
        // pas seulement quand une action classique est activée : bandeau de
        // contexte + boutons MOVE/PUSH mis en avant (même style que "active").
        const smartSelected = state.phase === "SMART_CHAR" && !!state.selectedCharId;
        if (smartSelected) {
          const badge = document.createElement("div");
          badge.className = "v60-context-options smart-char-badge";
          badge.innerHTML = "<span>GARDIEN SÉLECTIONNÉ</span>";
          els.hand.appendChild(badge);
        }
        const bar = document.createElement("div");
        bar.className = "v60-action-bar";
        ["MOVE", "PUSH", "MAGIC"].forEach(type => {
          const action = ACTIONS[type];
          const remaining = availableActionCount(type);
          const active = state.phase === "ACTION" && state.selectedActionType === type;
          const smartReady = smartSelected && (type === "MOVE" || type === "PUSH");
          const reason = actionUnavailableReason(type);
          const disabled = remaining <= 0 || !!reason;
          const button = document.createElement("button");
          button.type = "button";
          button.className = `v60-action-btn action-${type.toLowerCase()}${(active || smartReady) ? " active" : ""}${disabled ? " disabled" : ""}`;
          button.dataset.type = type;
          button.setAttribute("aria-pressed", active ? "true" : "false");
          button.setAttribute("aria-disabled", disabled ? "true" : "false");
          button.title = disabled ? reason : `${action.name} ×${remaining}`;
          const status = disabled ? reason : (active ? "Sélectionnée" : (smartReady ? `${remaining} disponible${remaining > 1 ? "s" : ""}` : "Disponible"));
          button.innerHTML = `<span class="v60-action-icon">${action.icon}</span><strong>${action.name}</strong><b>×${remaining}</b><small>${status}</small>`;
          if (!disabled) button.addEventListener("click", () => selectActionBatch(type, type === "PUSH" ? Math.max(1, state.pushForceChoice || 1) : 1));
          else button.addEventListener("click", () => showToast(reason));
          bar.appendChild(button);
        });
        els.hand.appendChild(bar);

        const classicPushActive = state.phase === "ACTION" && state.selectedActionType === "PUSH";
        const smartPushHovered = state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH";
        if (classicPushActive || smartPushHovered) {
          const max = Math.max(1, availableActionCount("PUSH"));
          // Même contrôle pour les deux chemins (bouton PUSH classique et clic
          // direct sur un gardien) : seule la source du minimum change. En
          // SMART_CHAR, getPushHoverPreview() reste l'unique simulation.
          let force = null, min = 1, hint = "";
          if (smartPushHovered) {
            const preview = getPushHoverPreview();
            if (preview) {
              min = Math.max(1, preview.requiredForce || 1);
              force = Math.max(min, Math.min(max, preview.force || min));
              hint = min > 1 ? `<small>Minimum requis : ${min}</small>` : "<small>Cliquez pour pousser.</small>";
            }
          } else {
            force = Math.max(1, Math.min(state.pushForceChoice || 1, max));
            hint = "<small>Sélectionnez ensuite la cible adjacente.</small>";
          }
          if (force !== null) {
            const contextual = document.createElement("div");
            contextual.className = "v60-context-options";
            contextual.innerHTML = `<span>Force de poussée</span><button type="button" data-force-minus>−</button><b>${force}</b><button type="button" data-force-plus>+</button>${hint}`;
            contextual.querySelector('[data-force-minus]').disabled = force <= min;
            contextual.querySelector('[data-force-plus]').disabled = force >= max;
            contextual.querySelector('[data-force-minus]').onclick = () => {
              if (smartPushHovered) {
                state.smartPushForce = Math.max(min, force - 1);
                refreshKayKitHoverPreviews();
                scheduleBoardRender();
                renderHand();
              } else { setPushForceChoice(force - 1, { notify: true }); renderHand(); }
            };
            contextual.querySelector('[data-force-plus]').onclick = () => {
              if (smartPushHovered) {
                state.smartPushForce = Math.min(max, force + 1);
                refreshKayKitHoverPreviews();
                scheduleBoardRender();
                renderHand();
              } else { setPushForceChoice(force + 1, { notify: true }); renderHand(); }
            };
            els.hand.appendChild(contextual);
          }
        }
        if (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && state.selectedIslandId) {
          const contextual = document.createElement("div");
          contextual.className = "v60-context-options magic-options";
          contextual.innerHTML = '<span>Rotation disponible</span><small>Choisissez le pivot sur l’île, puis utilisez ↺ ou ↻. Chaque clic ajoute 90°.</small>';
          els.hand.appendChild(contextual);
        }
      }

      function showActionConsumption(type, spent, remaining) {
        const feedback = document.getElementById("actionFeedback");
        const action = ACTIONS[type];
        if (!feedback || !action || spent < 1) return;
        feedback.innerHTML = `<strong>${action.icon} ${action.name}</strong><span>−${spent} · ${remaining} restante${remaining === 1 ? "" : "s"}</span>`;
        feedback.className = `action-feedback show feedback-${type.toLowerCase()}`;
        clearTimeout(showActionConsumption.timer);
        showActionConsumption.timer = setTimeout(() => {
          feedback.classList.remove("show");
        }, 2400);
      }


      function prepareActionSwitch() {
        if (!state) return false;

        if (state.inputLocked) {
          showToast("L’animation en cours doit d’abord se terminer.");
          return false;
        }

        /*
         * L'apparition du gardien après la pose d'une île reste obligatoire.
         * Toutes les autres sélections temporaires peuvent être abandonnées
         * instantanément en cliquant sur une nouvelle action.
         */
        if (state.phase === "PLACE_SPAWN") {
          showToast("Placez d’abord le nouveau gardien sur son île.");
          return false;
        }

        state.treasureDropFromId = null;
        state.treasureDropArtifactId = null;
        state.crownTransferTargetIds = [];
        state.crownPickupCell = null;
        state.crownStealTargetId = null;
        state.crownPickupArtifactId = null;

        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;

        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];

        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        return true;
      }

      function selectCard(card) {
        selectActionBatch(card.action, 1);
      }

      function selectActionBatch(type, count) {
        if (!canLocalPlayerAct()) return;

        if (state.phase === "ACTION" && state.selectedActionType === type) {
          cancelSelectedCard();
          // Le plateau/panneau montrent déjà que l'action n'est plus active ;
          // seule la magie (pas de retour visuel équivalent) garde un toast.
          if (type === "MAGIC") showToast(`${ACTIONS[type].name} quitté.`);
          return;
        }

        const available = availableActionCount(type);
        if (available === 0) {
          showToast(`Aucune action ${ACTIONS[type].name.toLowerCase()} disponible.`);
          return;
        }

        /*
         * Cliquer sur une nouvelle action annule seulement la sélection
         * inachevée précédente. Aucune carte n'est consommée.
         */
        if (!prepareActionSwitch()) return;

        state.selectedActionType = type;
        state.selectedActionCount =
          type === "MOVE"
            ? available
            : type === "MAGIC"
              ? 1
              : Math.max(1, Math.min(count, available));
        if (type === "PUSH") state.pushForceChoice = state.selectedActionCount;
        state.selectedActionCardId = null;
        state.phase = "ACTION";

        resetKayKitPointerFeedback();
        renderAll();
        playSfx("card");

        // Déplacement/Poussée : le panneau ACTIONS et le plateau (marqueurs,
        // aperçu au survol) montrent déjà tout ce que ce toast répétait.
        // La magie n'a pas d'équivalent visuel pour l'instant, elle garde le sien.
        if (type === "MAGIC") {
          showToast("Magie activée : une seule magie permet 90°, 180°, 270° ou 360°.");
        }
      }

      function useSelectedCard(countOverride = null) {
        if (!state.selectedActionType) return;

        const type = state.selectedActionType;
        const spent = consumeAvailableActions(
          type,
          countOverride ?? selectedBatchSize()
        );

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        resetKayKitPointerFeedback();
        renderAll();
        showActionConsumption(type, spent, availableActionCount(type));

        if (allCardsUsed()) {
          showToast("Toutes les actions disponibles ont été utilisées.");
        }
      }

      function allCardsUsed() {
        const player = currentPlayer();
        return player.hand.every(card => card.used)
          && ["MOVE", "PUSH", "MAGIC"].every(type => storedActionCount(type, player) === 0);
      }

      function nearestMoverForCell(r, c) {
        if (!isLand(r, c) || characterAt(r, c)) return null;
        const maxMoves = availableActionCount("MOVE");
        if (maxMoves < 1) return null;
        const options = state.characters
          .filter(char => char.player === state.currentPlayer)
          .map(char => ({ char, path: shortestMovementPath(char, r, c, maxMoves) }))
          .filter(option => option.path?.length)
          .map(option => ({
            ...option,
            cost: option.path.cost ?? option.path.length,
            distance: Math.abs(option.char.r - r) + Math.abs(option.char.c - c)
          }))
          .sort((a, b) => a.cost - b.cost || a.distance - b.distance || String(a.char.id).localeCompare(String(b.char.id)));
        return options[0] || null;
      }

      // Tous les gardiens du joueur adjacents à (r, c), triés (déterministe).
      // nearestPusherForTarget() reste un simple raccourci sur le premier —
      // utilisé là où l'ambiguïté n'a pas d'importance (ex: validité de survol).
      function pushersForTarget(r, c) {
        if (!characterAt(r, c) && !looseArtifactAt(r, c)) return [];
        return orthogonalNeighbors(r, c)
          .map(([nr, nc]) => characterAt(nr, nc))
          .filter(char => char && char.player === state.currentPlayer)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      }

      function nearestPusherForTarget(r, c) {
        return pushersForTarget(r, c)[0] || null;
      }

      // Force minimale légale pour que `pusher` pousse la cible (r, c) — même
      // règle que dans getPushHoverPreview() (une couronne libre n'impose pas
      // d'alignement, une ligne de gardiens exige au moins sa longueur), utile
      // ici où aucune preview n'existe encore (le pousseur n'est pas déterminé).
      function requiredPushForce(pusherR, pusherC, targetR, targetC) {
        if (!characterAt(targetR, targetC)) return 1;
        const dr = targetR - pusherR, dc = targetC - pusherC;
        return Math.max(1, collectPushLine(targetR, targetC, dr, dc).length);
      }

      function handleMoveClick(r, c) {
        const clickedChar = characterAt(r, c);
        if (state.selectedCharId && clickedChar?.id === state.selectedCharId) {
          cancelSelectedCard();
          return;
        }
        if (!state.selectedCharId) {
          if (clickedChar && clickedChar.player === state.currentPlayer) {
            selectCharacterForMove(clickedChar);
            return;
          }
          const nearest = nearestMoverForCell(r, c);
          if (!nearest) {
            showToast("Aucun de vos gardiens ne peut atteindre cette case.");
            return;
          }
          state.selectedCharId = nearest.char.id;
          state.selectedIslandId = null;
          state.reachable = movementRange(nearest.char, availableActionCount("MOVE"));
          handleMoveClick(r, c);
          return;
        }
        if (clickedChar && clickedChar.player === state.currentPlayer) {
          selectCharacterForMove(clickedChar);
          return;
        }
        if (!state.reachable.has(key(r, c))) {
          showToast("Cette case n’est pas accessible.");
          return;
        }

        const char = characterById(state.selectedCharId);
        const maxMoves = availableActionCount("MOVE");
        const path = shortestMovementPath(char, r, c, maxMoves);
        if (!path?.length) {
          showToast("Cette case n’est pas accessible.");
          return;
        }

        const cost = path.cost ?? path.length;
        const owner = state.players[char.player];
        const from = [char.r, char.c];
        saveUndoSnapshot();
        const walkDuration = Math.min(2400, Math.max(680, path.length * 320));
        queueKayKitActionAnimation(char.id, "move", walkDuration, { r, c }, path);
        // Le joueur humain regarde déjà où il clique : ne recadrer que pour l'IA.
        if (isCurrentPlayerAI()) kaykitFollowCell(r, c, { duration: Math.min(900, walkDuration) });
        animateToken(from, [r, c], owner.icon, owner.color, "move", () => {
          char.r = r;
          char.c = c;
          resolveArtifactForCharacter(char);
          triggerFx("move", [from, ...path]);
          playSfx("move");
          useSelectedCard(cost);
        }, false, path);
      }

      function selectCharacterForMove(char) {
        state.actionHoverCell = null;
        state.smartHoverPath = [];
        state.selectedCharId = char.id;
        state.selectedIslandId = null;
        const maxMoves = availableActionCount("MOVE");
        state.selectedActionCount = maxMoves;
        state.reachable = movementRange(char, maxMoves);
        renderAll();
        // Une contrainte réelle mérite un toast ; le mode d'emploi normal, lui,
        // se lit déjà sur les cases éclairées et l'aperçu au survol.
        if (state.reachable.size === 0) {
          showToast("Aucun déplacement possible pour ce gardien.");
        }
      }

      function movementRange(char, maxCost) {
        const startKey = key(char.r, char.c);
        const distances = new Map([[startKey, 0]]);
        const open = [{ r: char.r, c: char.c, cost: 0 }];
        const result = new Set();

        while (open.length) {
          open.sort((a, b) => a.cost - b.cost);
          const current = open.shift();
          const currentKey = key(current.r, current.c);

          if (current.cost !== distances.get(currentKey)) continue;

          for (const edge of movementEdges(current.r, current.c)) {
            if (!isLand(edge.r, edge.c)) continue;
            if (characterAt(edge.r, edge.c)) continue;

            const nextCost = current.cost + edge.cost;
            if (nextCost > maxCost) continue;

            const nextKey = key(edge.r, edge.c);
            if (nextCost >= (distances.get(nextKey) ?? Infinity)) continue;

            distances.set(nextKey, nextCost);
            result.add(nextKey);
            open.push({ r: edge.r, c: edge.c, cost: nextCost });
          }
        }

        // Même idiome que shortestMovementPath() (cost/steps accrochés au
        // tableau retourné) : le Set garde son comportement normal, avec le
        // coût par case disponible pour l'affichage au repos (voir kaykit3d.js).
        result.costs = distances;
        return result;
      }

      function removeCharacterFromGame(char, dropR = null, dropC = null) {
        if (!char) return;
        const carriedArtifact = artifactCarriedBy(char.id);
        if (carriedArtifact) {
          carriedArtifact.carrierId = null;
          if (Number.isInteger(dropR) && Number.isInteger(dropC)) {
            carriedArtifact.r = dropR;
            carriedArtifact.c = dropC;
          } else {
            resetArtifactObject(carriedArtifact);
          }
        }
        state.characters = state.characters.filter(ch => ch.id !== char.id);
        if (state.selectedCharId === char.id) state.selectedCharId = null;
      }

      function collectPushLine(startR, startC, dr, dc) {
        const line = [];
        let r = startR;
        let c = startC;
        while (true) {
          const ch = characterAt(r, c);
          if (!ch) break;
          line.push(ch);
          r += dr;
          c += dc;
        }
        return line;
      }

      function getPushHoverPreview() {
        const manualPush = state.phase === "ACTION" && state.selectedActionType === "PUSH";
        const smartPush = state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH";
        if (!((manualPush || smartPush) && state.selectedCharId && state.actionHoverCell)) {
          return null;
        }

        const pusher = characterById(state.selectedCharId);
        if (!pusher) return null;

        const [targetR, targetC] = state.actionHoverCell;
        if (Math.abs(pusher.r - targetR) + Math.abs(pusher.c - targetC) !== 1) return null;

        const targetChar = characterAt(targetR, targetC);
        const targetCrown = looseArtifactAt(targetR, targetC);
        if (!targetChar && !targetCrown) return null;

        const dr = targetR - pusher.r;
        const dc = targetC - pusher.c;
        // La force minimale légale se calcule avant tout : une couronne libre
        // n'impose pas d'alignement (1 suffit toujours), une ligne de gardiens
        // exige au moins sa longueur — c'est la même règle qu'ailleurs, jamais
        // dupliquée, juste lue plus tôt pour pouvoir en faire le plancher.
        // Même précédence que la branche plus bas (if targetCrown … else …) :
        // une case avec à la fois un gardien et une couronne libre (cas limite)
        // suit la couronne, donc pas d'alignement à exiger.
        const line = targetCrown ? [] : collectPushLine(targetR, targetC, dr, dc);
        const requiredForce = targetCrown ? 1 : line.length;
        // Hors action manuelle, aucun sélecteur de force n'est affiché par défaut :
        // state.smartPushForce porte le choix explicite du joueur pour CETTE cible
        // (survolée), sinon on retombe sur le minimum légal plutôt que sur le
        // dernier choix global (qui pouvait être insuffisant pour cette cible-ci).
        const force = smartPush
          ? Math.min(availableActionCount("PUSH"), Math.max(requiredForce, state.smartPushForce || requiredForce))
          : selectedBatchSize();
        const impacts = [];

        if (targetCrown) {
          const simulation = simulateLooseCrownPush(targetCrown, dr, dc, force);
          impacts.push({
            type: "crown",
            id: targetCrown.id,
            from: [targetR, targetC],
            to: simulation.moved ? [simulation.r, simulation.c] : null,
            fell: false,
            icon: "👑",
            color: "#ffd76a",
            carrying: false
          });
        } else {
          const simulated = line.map(char => ({
            char,
            r: char.r,
            c: char.c,
            alive: true
          }));
          const fixedOccupants = new Set(
            state.characters
              .filter(char => !line.some(item => item.id === char.id))
              .map(char => key(char.r, char.c))
          );

          const previewDistance = force < requiredForce ? 0 : Math.max(1, force - requiredForce + 1);
          for (let step = 0; step < previewDistance; step++) {
            for (let i = simulated.length - 1; i >= 0; i--) {
              const item = simulated[i];
              if (!item.alive) continue;
              const nr = item.r + dr;
              const nc = item.c + dc;

              if (!inside(nr, nc) || !isLand(nr, nc)) {
                item.alive = false;
                continue;
              }

              const blockedByFixed = fixedOccupants.has(key(nr, nc));
              const blockedByLine = simulated.some((other, index) =>
                index !== i && other.alive && other.r === nr && other.c === nc
              );
              const blockedByCrown = !!looseArtifactAt(nr, nc);
              if (blockedByFixed || blockedByLine || blockedByCrown) continue;

              item.r = nr;
              item.c = nc;
            }
          }

          simulated.forEach(item => {
            const owner = state.players[item.char.player];
            impacts.push({
              type: "character",
              id: item.char.id,
              from: [item.char.r, item.char.c],
              to: item.alive ? [item.r, item.c] : null,
              fell: !item.alive,
              icon: owner.icon,
              color: owner.color,
              carrying: characterCarriesCrown(item.char.id)
            });
          });
        }

        const lead = impacts[0];
        return {
          target: [targetR, targetC],
          destination: lead?.to || null,
          fell: !!lead?.fell,
          icon: lead?.icon || "👑",
          color: lead?.color || "#ffd76a",
          carrying: !!lead?.carrying,
          lineCount: impacts.length,
          impacts,
          direction: [dr, dc],
          force,
          requiredForce
        };
      }

      function handlePushClick(r, c) {
        const clickedChar = characterAt(r, c);
        if (state.selectedCharId && clickedChar?.id === state.selectedCharId) {
          cancelSelectedCard();
          return;
        }
        if (!state.selectedCharId) {
          if (clickedChar && clickedChar.player === state.currentPlayer) {
            state.actionHoverCell = null;
            state.selectedCharId = clickedChar.id;
            state.reachable = new Set(orthogonalNeighbors(r, c).map(([nr, nc]) => key(nr, nc)));
            renderAll();
            return;
          }
          const pushers = pushersForTarget(r, c);
          if (!pushers.length) {
            showToast("Aucun de vos gardiens n’est adjacent à cette cible.");
            return;
          }
          if (pushers.length > 1) {
            // Plusieurs gardiens à égalité : on n'en choisit pas un à la place
            // du joueur, on les met en évidence et on attend son clic.
            state.actionHoverCell = null;
            state.selectedCharId = null;
            state.reachable = new Set(pushers.map(p => key(p.r, p.c)));
            renderAll();
            showToast("Plusieurs gardiens peuvent pousser cette cible : cliquez celui qui doit agir.");
            return;
          }
          const nearest = pushers[0];
          state.selectedActionCount = Math.min(
            availableActionCount("PUSH"),
            Math.max(requiredPushForce(nearest.r, nearest.c, r, c), state.pushForceChoice || 1)
          );
          state.actionHoverCell = null;
          state.selectedCharId = nearest.id;
          state.reachable = new Set(orthogonalNeighbors(nearest.r, nearest.c).map(([nr, nc]) => key(nr, nc)));
          handlePushClick(r, c);
          return;
        }

        const pusher = characterById(state.selectedCharId);
        const distance = Math.abs(pusher.r - r) + Math.abs(pusher.c - c);
        const targetChar = characterAt(r, c);
        const targetArtifact = looseArtifactAt(r, c);

        if (distance !== 1 || (!targetChar && !targetArtifact)) {
          if (clickedChar && clickedChar.player === state.currentPlayer) {
            state.actionHoverCell = null;
            state.selectedCharId = clickedChar.id;
            state.reachable = new Set(orthogonalNeighbors(r, c).map(([nr, nc]) => key(nr, nc)));
            renderAll();
          } else showToast("La cible doit être adjacente.");
          return;
        }

        const dr = r - pusher.r;
        const dc = c - pusher.c;
        const force = selectedBatchSize();
        if (targetChar) {
          const requiredForce = collectPushLine(r, c, dr, dc).length;
          if (force < requiredForce) {
            showToast(`Force ${requiredForce} requise pour pousser ${requiredForce} personnage${requiredForce > 1 ? "s" : ""} aligné${requiredForce > 1 ? "s" : ""}.`);
            return;
          }
        }
        saveUndoSnapshot();
        queueKayKitActionAnimation(pusher.id, "attack", 900, { r, c });
        if (targetChar) queueKayKitActionAnimation(targetChar.id, "hurt", 850, { r: pusher.r, c: pusher.c });
        const result = targetChar ? pushCharacter(targetChar, dr, dc, force, r, c) : pushLooseArtifact(targetArtifact, dr, dc, force, r, c);
        if (!result) state.undoSnapshot = null;
        if (!result) return;

        // Une poussée (surtout une chute) mérite d'être vue même par le joueur
        // qui vient de cliquer : impact souvent hors de son cadrage actuel.
        const impactCell = result.to || result.from;
        kaykitFollowCell(impactCell[0], impactCell[1], { duration: 680, zoomBoost: result.fell ? 1.6 : 0 });

        animateToken(result.from, result.to, result.icon, result.color, "push", () => {
          triggerFx("push", [result.from, result.to]);
          playSfx("push");
          useSelectedCard();
        }, result.fell);
      }

      function pushCharacter(target, dr, dc, force, originR, originC) {
        const line = collectPushLine(target.r, target.c, dr, dc);
        if (!line.length) return false;

        const leadFrom = [target.r, target.c];
        const leadOwner = state.players[target.player];
        let anyMoved = false;
        let anyFell = false;
        let removedCount = 0;
        const movedIds = new Set();

        const requiredForce = line.length;
        if (force < requiredForce) {
          showToast(`Force ${requiredForce} requise pour pousser cette ligne.`);
          return false;
        }
        const pushDistance = Math.max(1, force - requiredForce + 1);
        for (let step = 0; step < pushDistance; step++) {
          for (let i = line.length - 1; i >= 0; i--) {
            const ch = line[i];
            if (!state.characters.some(existing => existing.id === ch.id)) continue;

            const nextR = ch.r + dr;
            const nextC = ch.c + dc;

            if (!inside(nextR, nextC) || !isLand(nextR, nextC)) {
              anyFell = true;
              removedCount++;
              removeCharacterFromGame(ch, ch.r, ch.c);
              continue;
            }

            const blocker = characterAt(nextR, nextC);
            if (blocker) continue;

            ch.r = nextR;
            ch.c = nextC;
            anyMoved = true;
            movedIds.add(ch.id);
            resolveArtifactForCharacter(ch);
          }
        }

        if (!anyMoved && !anyFell) {
          showToast("La poussée est bloquée.");
          return false;
        }

        const leadStillThere = state.characters.find(existing => existing.id === target.id);
        const impacted = movedIds.size + removedCount;
        if (removedCount && movedIds.size) {
          showToast(`${impacted} gardien${impacted > 1 ? "s" : ""} décalé${impacted > 1 ? "s" : ""}, dont ${removedCount} retiré${removedCount > 1 ? "s" : ""} du jeu.`);
        } else if (removedCount) {
          showToast(`${removedCount} gardien${removedCount > 1 ? "s" : ""} retiré${removedCount > 1 ? "s" : ""} du jeu.`);
        } else {
          showToast(`${impacted} gardien${impacted > 1 ? "s" : ""} repoussé${impacted > 1 ? "s" : ""} de ${pushDistance} case${pushDistance > 1 ? "s" : ""}.`);
        }

        return {
          from: leadFrom,
          to: leadStillThere ? [leadStillThere.r, leadStillThere.c] : leadFrom,
          icon: leadOwner.icon,
          color: leadOwner.color,
          fell: !leadStillThere || anyFell
        };
      }

      function pushLooseArtifact(artifact, dr, dc, force, originR, originC) {
        if (!artifact) return false;

        const from = [artifact.r, artifact.c];
        const simulation = simulateLooseCrownPush(
          artifact,
          dr,
          dc,
          force,
          artifact.r,
          artifact.c
        );

        if (!simulation.valid) {
          artifact.r = originR;
          artifact.c = originC;

          if (simulation.reason === "blocked") {
            showToast("La trajectoire de la couronne est bloquée.");
          } else if (simulation.reason === "outside") {
            showToast("La force choisie envoie la couronne hors du plateau.");
          } else {
            showToast("Choisissez une force qui fait atterrir la couronne sur une île.");
          }
          return false;
        }

        artifact.r = simulation.r;
        artifact.c = simulation.c;

        if (simulation.crossedVoid) {
          showToast(
            `La couronne survole le vide et atterrit à ${simulation.moved} case${simulation.moved > 1 ? "s" : ""}.`
          );
        } else {
          showToast(
            `Couronne repoussée de ${simulation.moved} case${simulation.moved > 1 ? "s" : ""}.`
          );
        }

        return {
          from,
          to: [artifact.r, artifact.c],
          icon: "👑",
          color: "#ffd76a",
          fell: false
        };
      }

      function respawnCharacter(char) {
        const village = state.players[char.player].village;
        const spot = findNearestFreeLand(village.r, village.c);
        char.r = spot.r;
        char.c = spot.c;
      }

      function findNearestFreeLand(startR, startC) {
        const queue = [[startR, startC]];
        const visited = new Set([key(startR, startC)]);
        while (queue.length) {
          const [r, c] = queue.shift();
          if (isLand(r, c) && !characterAt(r, c)) return { r, c };
          for (const [nr, nc] of orthogonalNeighbors(r, c)) {
            const k = key(nr, nc);
            if (!visited.has(k)) {
              visited.add(k);
              queue.push([nr, nc]);
            }
          }
        }
        return { r: startR, c: startC };
      }


      function calculateIslandRotationAroundPivot(island, pivotR, pivotC, direction, turns = 1) {
        let currentAbs = island.cells.map(([r, c]) => [r, c]);
        let currentCharacters = state.characters
          .filter(ch => currentAbs.some(([ir, ic]) => ir === ch.r && ic === ch.c))
          .map(ch => ({ char: ch, r: ch.r, c: ch.c }));
        let currentArtifacts = activeArtifacts()
          .filter(artifact =>
            artifact.carrierId === null
            && currentAbs.some(([ir, ic]) => ir === artifact.r && ic === artifact.c)
          )
          .map(artifact => ({ artifact, r: artifact.r, c: artifact.c }));

        // L'île est soulevée pendant la rotation : seul l'emplacement final est contrôlé.
        for (let turn = 0; turn < turns; turn++) {
          const nextAbs = currentAbs.map(([r, c]) => {
            const dr = r - pivotR;
            const dc = c - pivotC;
            return direction === 1 ? [pivotR + dc, pivotC - dr] : [pivotR - dc, pivotC + dr];
          });

          currentCharacters = currentCharacters.map(item => {
            const idx = currentAbs.findIndex(([r, c]) => r === item.r && c === item.c);
            const [nr, nc] = nextAbs[idx];
            return { char: item.char, r: nr, c: nc };
          });
          currentArtifacts = currentArtifacts.map(item => {
            const idx = currentAbs.findIndex(([r, c]) => r === item.r && c === item.c);
            const [nr, nc] = nextAbs[idx];
            return { artifact: item.artifact, r: nr, c: nc };
          });
          currentAbs = nextAbs;
        }

        if (currentAbs.some(([r, c]) => !inside(r, c))) {
          return { valid: false, absCells: currentAbs, reason: "l’arrivée ferait sortir l’île du plateau." };
        }

        const otherCells = new Set();
        for (const other of state.islands) {
          if (other.id === island.id) continue;
          for (const [r, c] of other.cells) otherCells.add(key(r, c));
        }
        if (currentAbs.some(([r, c]) => otherCells.has(key(r, c)) || villageAt(r, c) || isSanctuary(r, c))) {
          return { valid: false, absCells: currentAbs, reason: "l’arrivée chevauche un autre terrain." };
        }

        const movingIds = new Set(currentCharacters.map(item => item.char.id));
        for (const move of currentCharacters) {
          const blocker = characterAt(move.r, move.c);
          if (blocker && !movingIds.has(blocker.id)) {
            return { valid: false, absCells: currentAbs, reason: "un gardien occupe la zone d’arrivée." };
          }
        }

        const minR = Math.min(...currentAbs.map(cell => cell[0]));
        const minC = Math.min(...currentAbs.map(cell => cell[1]));
        return {
          valid: true,
          absCells: currentAbs,
          relCells: currentAbs.map(([r, c]) => [r - minR, c - minC]),
          anchor: { r: minR, c: minC },
          characterMoves: currentCharacters,
          artifactMoves: currentArtifacts
        };
      }

      function updateMagicPreview() {
        state.magicPreviewCells = null;
        state.magicPreviewValid = false;

        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;
        if (!state.selectedIslandId || !state.selectedMagicPivot) return;

        const island = state.islands.find(is => is.id === state.selectedIslandId);
        if (!island) return;

        const steps = ((state.magicPreviewSteps || 0) % 5 + 5) % 5;
        if (steps === 0) {
          state.magicPreviewCells = island.cells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = true;
          return;
        }
        if (steps === 4) {
          state.magicPreviewCells = island.cells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = true;
          return;
        }

        const direction = steps === 3 ? -1 : 1;
        const turns = steps === 3 ? 1 : steps;

        const rotation = calculateIslandRotationAroundPivot(
          island,
          state.selectedMagicPivot[0],
          state.selectedMagicPivot[1],
          direction,
          turns
        );

        if (rotation.valid) {
          state.magicPreviewCells = rotation.absCells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = true;
        } else {
          state.magicPreviewCells = rotation.absCells ? rotation.absCells.map(([r, c]) => [r, c]) : island.cells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = false;
        }
      }

      function confirmMagicRotation() {
        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;

        const island = state.islands.find(is => is.id === state.selectedIslandId);
        const steps = ((state.magicPreviewSteps % 5) + 5) % 5;

        if (!island || !state.selectedMagicPivot || !steps) {
          showToast("Choisissez une case pivot puis utilisez la roulette.");
          return;
        }

        if (steps === 4) {
          queueKayKitCurrentPlayerAnimation("magic", 1050);
          animateBoardMagic();
          playSfx("magic");
          showToast("Rotation complète de 360° pour 1 magie.");
          useSelectedCard(1);
          return;
        }

        const direction = steps === 3 ? -1 : 1;
        const turns = steps === 3 ? 1 : steps;

        const rotation = calculateIslandRotationAroundPivot(
          island,
          state.selectedMagicPivot[0],
          state.selectedMagicPivot[1],
          direction,
          turns
        );

        if (!rotation.valid) {
          showToast(`Rotation impossible : ${rotation.reason}`);
          return;
        }

        saveUndoSnapshot();
        queueKayKitCurrentPlayerAnimation("magic", 1150);
        state.inputLocked = true;
        showToast("L’île se soulève avant de tourner…");
        playSfx("magic");

        animateIslandLiftRotation(island.id, steps * 90, () => {
          if (!state || state.winner !== null) return;
          island.cells = rotation.absCells;
          island.relCells = rotation.relCells;
          island.anchor = rotation.anchor;

          for (const move of rotation.characterMoves) {
            move.char.r = move.r;
            move.char.c = move.c;
          }
          for (const move of rotation.artifactMoves || []) {
            move.artifact.r = move.r;
            move.artifact.c = move.c;
          }

          state.inputLocked = false;
          animateBoardMagic();
          showToast(`Île tournée de ${steps * 90}° pour 1 magie : seule l’arrivée doit être libre.`);
          useSelectedCard(1);
        });
      }

      function handleMagicClick(r, c) {
        if (state.magicPreviewCells && state.magicPreviewSteps && cellInPreviewSet(state.magicPreviewCells, r, c)) {
          confirmMagicRotation();
          return;
        }

        if (state.selectedMagicPivot && isSameCell(state.selectedMagicPivot, [r, c])) {
          cancelSelectedCard();
          showToast("Magie quittée.");
          return;
        }

        const island = islandAt(r, c);

        if (!island) {
          showToast("Choisissez une case appartenant à une île.");
          return;
        }

        if (state.selectedIslandId !== island.id || !isSameCell(state.selectedMagicPivot, [r, c])) {
          state.selectedIslandId = island.id;
          state.selectedMagicPivot = [r, c];
          state.magicHoverIslandId = null;
          state.magicHoverPivot = null;
          state.selectedCharId = null;
          state.reachable = new Set();
          state.magicPreviewDirection = 0;
          state.magicPreviewSteps = 0;
          state.magicPreviewCells = island.cells.map(([ir, ic]) => [ir, ic]);
          state.magicPreviewValid = true;
          renderAll();
          showToast("Pivot sélectionné : utilisez la roulette ou les boutons ↺ ↻. La forme 3D affichée sera la position finale.");
          return;
        }

        if (state.magicPreviewSteps) {
          confirmMagicRotation();
        } else {
          showToast("Tournez d’abord l’île pour prévisualiser sa nouvelle position.");
        }
      }

      function rotateSelectedIsland(direction) {
        if (state.phase === "PLACE_ISLAND" && state.placementCells) {
          const origin = state.placementCells[state.placementOriginIndex] || state.placementCells[0] || [0, 0];
          let rotated = state.placementCells.map(([r, c]) => {
            const dr = r - origin[0];
            const dc = c - origin[1];
            return direction === 1
              ? [origin[0] + dc, origin[1] - dr]
              : [origin[0] - dc, origin[1] + dr];
          });

          // recentre uniquement visuellement pour garder de petites coordonnées,
          // sans casser le fait que la souris reste sur une case de l'île.
          const minR = Math.min(...rotated.map(c => c[0]));
          const minC = Math.min(...rotated.map(c => c[1]));
          rotated = rotated.map(([r, c]) => [r - minR, c - minC]);
          const oldOrigin = rotated[state.placementOriginIndex];
          if (!oldOrigin) {
            state.placementOriginIndex = 0;
          } else {
            // conserver le même index d'origine après recentrage
            state.placementOriginIndex = Math.max(0, state.placementOriginIndex);
          }
          state.placementCells = rotated;

          if (state.hoverAnchor) {
            updatePlacementPreview(state.hoverAnchor[0], state.hoverAnchor[1]);
            if (kaykit3D) {
              kaykit3D.lastStateSignature = "";
              scheduleKayKitSync();
            }
            playSfx("rotate");
          } else {
            renderBoard();
            scheduleKayKitSync();
          }
          return;
        }

        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;

        if (!state.selectedIslandId || !state.selectedMagicPivot) {
          showToast("Cliquez d’abord sur une case de l’île à faire tourner.");
          return;
        }

        let nextSteps = ((state.magicPreviewSteps || 0) + direction) % 5;
        if (nextSteps < 0) nextSteps = 4;

        state.magicPreviewSteps = nextSteps;
        updateMagicPreview();
        renderAll();
        playSfx("rotate");

        if (!nextSteps) {
          showToast("Rotation remise à 0°.");
        } else if (state.magicPreviewValid) {
          showToast(`Aperçu : ${nextSteps * 90}°. Cliquez sur une case de l’aperçu pour valider.`);
        } else {
          showToast("Cette rotation est impossible depuis cette case pivot.");
        }
      }

      function calculateIslandRotation(island, direction) {
        const oldRel = island.relCells;
        const newRel = rotateCells(oldRel, direction, false);
        const absCells = newRel.map(([dr, dc]) => [island.anchor.r + dr, island.anchor.c + dc]);

        if (absCells.some(([r, c]) => !inside(r, c))) {
          return { valid: false, reason: "La rotation ferait sortir l'île du plateau." };
        }

        const otherCells = new Set();
        for (const other of state.islands) {
          if (other.id === island.id) continue;
          for (const [r, c] of other.cells) otherCells.add(key(r, c));
        }
        if (absCells.some(([r, c]) => otherCells.has(key(r, c)) || villageAt(r, c) || isSanctuary(r, c))) {
          return { valid: false, reason: "La rotation chevauche un autre terrain." };
        }

        const oldIndex = new Map(oldRel.map(([dr, dc], i) => [key(island.anchor.r + dr, island.anchor.c + dc), i]));
        const charsOnIsland = state.characters.filter(ch => oldIndex.has(key(ch.r, ch.c)));
        const movingIds = new Set(charsOnIsland.map(ch => ch.id));
        const characterMoves = charsOnIsland.map(ch => {
          const idx = oldIndex.get(key(ch.r, ch.c));
          const [nr, nc] = absCells[idx];
          return { char: ch, r: nr, c: nc };
        });

        for (const move of characterMoves) {
          const blocker = characterAt(move.r, move.c);
          if (blocker && !movingIds.has(blocker.id)) {
            return { valid: false, reason: "Un gardien bloque la rotation." };
          }
        }

        let artifactMove = null;
        if (state.artifact.carrierId === null) {
          const idx = oldIndex.get(key(state.artifact.r, state.artifact.c));
          if (idx !== undefined) {
            artifactMove = { r: absCells[idx][0], c: absCells[idx][1] };
          }
        }

        return { valid: true, relCells: newRel, absCells, characterMoves, artifactMove };
      }

      function cancelSelectedCard() {
        if (state.phase !== "ACTION") return;
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        resetKayKitPointerFeedback();
        renderAll();
      }

      function renderScores() {
        els.scoreList.innerHTML = "";
        state.players.forEach((p, i) => {
          const card = document.createElement("div");
          card.className = "score-card"
            + (i === state.currentPlayer ? " active" : "")
            + (state.scoreAnimationPlayerId === p.id ? " score-updated" : "");
          card.style.setProperty("--pcolor", p.color);
          card.innerHTML = `
          <strong>
            <span class="name-wrap" data-icon="${p.icon}"><span>${p.name}</span></span>
            <span class="score-value">${p.score}/3</span>
          </strong>
          <div class="score-actions" aria-label="Stock d’actions de ${p.name}">
            <span title="Déplacements disponibles"><em>D</em><b>${availableActionCount("MOVE", p)}</b></span>
            <span title="Poussées disponibles"><em>P</em><b>${availableActionCount("PUSH", p)}</b></span>
            <span title="Magies disponibles"><em>M</em><b>${availableActionCount("MAGIC", p)}</b></span>
          </div>
          <small>${state.characters.filter(ch => ch.player === p.id).length} gardien(s)</small>
        `;
          els.scoreList.appendChild(card);
        });
      }


      function renderDeckDisplay() {
        if (!els.deckDisplay) return;

        const p = currentPlayer();
        const deckLeft = p.deck.length;
        const discardCount = p.discard.length;
        const mode = state.deckAnimationMode || "";
        const visibleCards = (p.hand || []).slice(0, 5);

        const cards = visibleCards.map((card, index) => `
        <span
          class="v64-mini-card action-${card.action.toLowerCase()} ${mode === "deal" ? "deal-card" : ""} ${mode === "discard" ? "discard-card" : ""}"
          style="--card-index:${index}"
          title="${ACTIONS[card.action].name}"
          aria-label="${ACTIONS[card.action].name}"
        ></span>
      `).join("");

        const lastDiscard = p.discard?.[p.discard.length - 1];
        const lastDiscardLabel = lastDiscard ? ACTIONS[lastDiscard.action]?.name : "Aucune";
        els.deckDisplay.innerHTML = `
        <div class="v64-deck-summary v66-deck-summary" aria-label="Pioche, main et défausse">
          <span class="v64-deck-count"><b>${deckLeft}</b><small>Pioche</small></span>
          <div class="v64-mini-hand" aria-label="${p.hand.length} cartes en main">
            <small class="v64-mini-hand-label">Main · ${p.hand.length}</small>
            ${cards || `<small class="v64-mini-hand-empty">Nouvelle main au prochain tour</small>`}
          </div>
          <span class="v64-deck-count" title="Dernière défausse : ${lastDiscardLabel}"><b>${discardCount}</b><small>Défausse</small></span>
        </div>
      `;
      }

      function renderStats() {
        const p = currentPlayer();
        els.deckCount.textContent = p.deck.length;
        els.handCount.textContent = p.hand.length;
        els.discardCount.textContent = p.discard.length;
        els.islandCount.textContent = state.islands.filter(is => is.owner === p.id).length;
      }

      function renderControls() {
        const aiLocked = isCurrentPlayerAI()
          || state.aiThinking
          || (state.onlineMode && !canLocalPlayerAct());
        const canRotatePlacement = !aiLocked && state.phase === "PLACE_ISLAND";
        const canRotateMagic = !aiLocked && state.phase === "ACTION" && state.selectedActionType === "MAGIC" && !!state.selectedIslandId && !!state.selectedMagicPivot;
        const canCancel = !aiLocked && (state.phase === "PLACE_ISLAND" || state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType) || state.phase === "DROP_TREASURE" || state.phase === "PICKUP_CROWN" || !!state.undoSnapshot);
        const canEndFromSelection = state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType);
        const canEnd = state.islandPlacedThisTurn && (state.phase === "ACTION_SELECT" || canEndFromSelection);
        els.rotateLeftBtn.disabled = !(canRotatePlacement || canRotateMagic);
        els.rotateRightBtn.disabled = !(canRotatePlacement || canRotateMagic);
        els.cancelCardBtn.disabled = !canCancel;
        if (state.phase === "PLACE_ISLAND") {
          els.cancelCardBtn.textContent = "Changer d’île";
          els.cancelCardBtn.title = "Quitter le placement sans poser cette île";
        } else if (state.phase === "ACTION" && state.selectedActionType) {
          els.cancelCardBtn.textContent = "Quitter l’action";
          els.cancelCardBtn.title = `Quitter ${ACTIONS[state.selectedActionType].name.toLowerCase()} sans consommer d’action`;
        } else if (state.phase === "SMART_CHAR") {
          els.cancelCardBtn.textContent = "Quitter le choix";
          els.cancelCardBtn.title = "Désélectionner ce gardien";
        } else if (["DROP_TREASURE", "PICKUP_CROWN"].includes(state.phase)) {
          els.cancelCardBtn.textContent = "Quitter le choix";
          els.cancelCardBtn.title = "Revenir au choix des actions";
        } else if (state.undoSnapshot) {
          els.cancelCardBtn.textContent = "Annuler l’action";
          els.cancelCardBtn.title = "Revenir avant la dernière action exécutée";
        } else {
          els.cancelCardBtn.textContent = "Annuler";
          els.cancelCardBtn.title = "";
        }
        els.endTurnBtn.disabled = aiLocked || !canEnd;
        els.endTurnBtn.classList.toggle("selection-will-cancel", canEndFromSelection && canEnd);
        if (!state.islandPlacedThisTurn) {
          els.endTurnBtn.textContent = "Poser une île";
          els.endTurnBtn.title = "La pose d’une île est obligatoire avant la fin du tour";
        } else if (state.phase === "PLACE_SPAWN") {
          els.endTurnBtn.textContent = "Placer le gardien";
          els.endTurnBtn.title = "Terminez d’abord l’invocation obligatoire";
        } else if (["DROP_TREASURE", "PICKUP_CROWN"].includes(state.phase)) {
          els.endTurnBtn.textContent = "Finir le choix";
          els.endTurnBtn.title = "Terminez ou quittez d’abord ce choix";
        } else {
          els.endTurnBtn.textContent = "Fin du tour";
          els.endTurnBtn.title = canEndFromSelection ? "La sélection en cours sera simplement abandonnée" : "Terminer le tour";
        }
      }

      function renderUnitCard() {
        const ch = characterById(state.selectedCharId);
        if (ch) {
          const p = state.players[ch.player];
          els.unitCard.classList.remove("empty");
          els.unitCard.innerHTML = `
          <div class="big-icon">${p.icon}</div>
          <p><b style="color:${p.color}">Gardien de ${p.name}</b></p>
          <p>Déplacement : 1 case orthogonale par action</p>
          <p>Poussée : toutes les cibles alignées glissent du nombre de poussées jouées</p>
          <p>${characterCarriesCrown(ch.id) ? "Porte une couronne" : "Gardien standard"}</p>
        `;
          return;
        }

        const island = state.islands.find(is => is.id === state.selectedIslandId);
        if (island) {
          const owner = state.players[island.owner];
          els.unitCard.classList.remove("empty");
          els.unitCard.innerHTML = `
          <div class="big-icon">🏝️</div>
          <p><b>Île</b></p>
          <p>Propriétaire : <span style="color:${owner.color}">${owner.name}</span></p>
          <p>Taille : ${island.cells.length} case(s)</p>
          <p>Magie : choisissez une case pivot, tournez avec la molette / Q / E, puis cliquez sur l’aperçu.</p>
        `;
          return;
        }

        els.unitCard.classList.add("empty");
        els.unitCard.innerHTML = `
        <div class="big-icon">☁️</div>
        <p>Sélectionnez un gardien ou une île pour afficher ses informations.</p>
      `;
      }


      function cornerCrownCellsForVillage(village) {
        if (!village) return [];
        const cells = [[village.r, village.c]];

        cells.push(
          village.r === 0
            ? [1, village.c]
            : [GRID - 2, village.c]
        );

        cells.push(
          village.c === 0
            ? [village.r, 1]
            : [village.r, GRID - 2]
        );

        return cells;
      }

      function crownValidationCellsForPlayer(player) {
        if (!player) return [];
        const unique = new Map();

        villagesForPlayer(player).forEach(village => {
          cornerCrownCellsForVillage(village).forEach(([r, c]) => {
            unique.set(key(r, c), [r, c]);
          });
        });

        return [...unique.values()];
      }

      function isCrownValidationCell(player, r, c) {
        return crownValidationCellsForPlayer(player)
          .some(([vr, vc]) => vr === r && vc === c);
      }

      function canValidateCrownPoint(char) {
        return false;
      }

      /*
       * L'ancien système de traits et de sorties est volontairement supprimé.
       * Cette fonction reste vide afin de préserver les appels de rendu existants.
       */
      function renderExitGates() { }

      function validateCrownPoint(char, options = {}) {
        const { fromAI = false } = options;

        if (!state || !char || state.winner !== null) return false;
        if (!fromAI) showToast("La couronne sera validée si elle est encore dans votre village au début de votre prochain tour.");
        return false;

        /* Compatibilité conservée : ancien flux volontairement inaccessible. */

        const player = state.players[char.player];
        const artifact = artifactCarriedBy(char.id);

        if (char.player !== state.currentPlayer) {
          if (!fromAI) showToast("Ce gardien n’appartient pas au joueur actif.");
          return false;
        }

        if (!artifact) {
          if (!fromAI) showToast("Ce gardien ne porte pas de couronne.");
          return false;
        }

        if (!isCrownValidationCell(player, char.r, char.c)) {
          if (!fromAI) showToast("Placez le porteur sur une des 3 cases de votre coin.");
          return false;
        }

        if (availableActionCount("MOVE") < 1) {
          if (!fromAI) showToast("Il faut encore 1 déplacement pour valider la couronne.");
          return false;
        }

        saveUndoSnapshot();

        if (consumeAvailableActions("MOVE", 1) < 1) {
          state.undoSnapshot = null;
          if (!fromAI) showToast("Aucun déplacement disponible.");
          return false;
        }

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        state.actionHoverCell = null;
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";

        queueKayKitActionAnimation(char.id, "victory", 1200);
        animateCellPulse(char.r, char.c, "crown-burst");
        playSfx("crown");
        scoreCrownForPlayer(player, char, false, artifact);
        renderAll();
        return true;
      }

      function scoreCrownForPlayer(player, char, throughExit = false, artifact = artifactCarriedBy(char?.id)) {
        player.score++;
        triggerScoreAnimation(player.id);
        if (artifact) artifact.carrierId = null;

        if (throughExit && char) {
          respawnCharacter(char);
          showToast(`${player.name} sort avec la couronne et marque un point ! (${player.score}/3)`);
        } else {
          showToast(`${player.name} valide une couronne au début de son tour ! (${player.score}/3)`);
        }

        if (player.score >= 3) {
          state.winner = player.id;
          setTimeout(() => showVictory(player), 450);
        } else {
          resetArtifactObject(artifact);
        }
      }

      function resolveArtifactForCharacter(char) {
        if (!characterCarriesCrown(char.id)) {
          const looseArtifact = looseArtifactAt(char.r, char.c);
          if (looseArtifact && giveArtifactToCharacter(looseArtifact, char)) {
            showToast(`${state.players[char.player].name} récupère une couronne !`);
          }
        }

        /* Le point sera vérifié et accordé au début du prochain tour du porteur. */
      }

      function resetArtifact() {
        resetArtifactObject(state.artifact);
      }

      async function endTurn(force = false) {
        if (!state || state.winner !== null || state.turnTransitioning) return;
        if (!force && state.phase !== "ACTION_SELECT") {
          const cancellableSelection = state.islandPlacedThisTurn
            && (state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType));
          if (!cancellableSelection || !prepareActionSwitch()) return;
        }

        if (!state.islandPlacedThisTurn) {
          if (force) {
            createAutomaticIslandAndSpawn(state.currentPlayer, true);
          } else {
            showToast("Vous devez poser une île avant de terminer le tour.");
            return;
          }
        }

        state.turnTransitioning = true;
        stopTurnTimer();
        aiRunToken++;
        state.aiThinking = false;
        state.timerExpiring = false;
        state.inputLocked = true;
        els.gameScreen.classList.remove("ai-turn");
        resetKayKitPointerFeedback();

        const p = currentPlayer();

        /*
         * Les cartes restent visibles pendant leur trajet vers la défausse.
         */
        if ((p.hand || []).length) {
          state.deckAnimationMode = "discard";
          renderDeckDisplay();
          await sleep(620);
        }

        p.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };

        /*
         * Chaque carte fraîche non utilisée devient une action stockée,
         * dans la limite de cinq actions par type. La carte elle-même va
         * quand même dans la défausse.
         */
        ["MOVE", "PUSH", "MAGIC"].forEach(type => {
          const unusedFresh = unusedCardsOfType(type, p).length;
          p.stash[type] = Math.min(
            5,
            storedActionCount(type, p) + unusedFresh
          );
        });

        const cardsToDiscard = p.hand.map(card => ({
          ...card,
          used: false,
          fromStash: false
        }));

        p.discard.push(...cardsToDiscard);
        p.hand = [];
        state.deckAnimationMode = null;

        const wasLast = state.currentPlayer === state.players.length - 1;
        state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
        state.turn++;
        if (wasLast) state.round++;

        playSfx("turn");
        beginTurn();
        forceOnlineSync();
      }
      function showVictory(player) {
        stopTurnTimer();
        aiRunToken++;
        els.gameScreen.classList.remove("ai-turn");

        els.victoryPortrait.textContent = player.icon || "🧙";
        els.victoryPortrait.style.setProperty("--pcolor", player.color || "#fff");
        els.victoryTitle.textContent = player.name;
        els.victoryTitle.style.color = player.color;
        els.victoryText.textContent = `${player.name} a validé trois couronnes et prend le contrôle d’ILYOS.`;
        els.victoryStats.textContent = `${state.turn} tours • ${state.round} manches • Score ${player.score}/3`;

        els.victoryModal.classList.remove("hidden");
        void els.victoryModal.offsetWidth;
        els.victoryModal.classList.add("victory-visible");

        if (!state.onlineMode) clearLocalSession();
        playSfx("victory");
      }

      function resetToSetup() {
        stopTurnTimer();
        aiRunToken++;
        if (state?.onlineMode) closeOnlineNetwork(false);
        els.gameScreen.classList.remove("ai-turn");
        state = null;
        pendingVisualMode = "alternative";
        applyVisualMode("alternative");
        els.victoryModal.classList.add("hidden");
        els.victoryModal.classList.remove("victory-visible");
        els.rulesModal.classList.add("hidden");
        els.gameScreen.classList.add("hidden");
        els.setupScreen.classList.remove("hidden");
        renderSetupFields();
      }

