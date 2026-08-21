      let toastTimer = null;
      let lastWheelAt = 0;
      let lastKeyRotateAt = 0;
      // Conservé pour la sérialisation/compatibilité : la durée réelle d'un tour
      // vient désormais de state.turnDurationSeconds (0 = aucune limite, défaut),
      // choisi dans le menu de configuration. Voir turnTimerControlsHTML().
      const TURN_DURATION_SECONDS = 180;
      const STATE_SCHEMA_VERSION = 22;
      const LOCAL_STORAGE_KEY = "ilyos-local-session-v22";
      const ONLINE_STORAGE_KEY = "ilyos-online-session-v1";
      const AI_LEVELS = {
        easy: {
          label: "Facile",
          actionLimit: 1,
          thinkDelay: 900,
          actionDelay: 520,
          maxMoveCost: 1,
          pushProbability: .22,
          magicProbability: .16,
          pushMax: 1,
          placementShortlist: 22,
          randomness: 2.2,
          crownTactics: 0
        },
        normal: {
          label: "Normal",
          actionLimit: 5,
          thinkDelay: 620,
          actionDelay: 280,
          maxMoveCost: 4,
          pushProbability: .66,
          magicProbability: .70,
          pushMax: 2,
          placementShortlist: 6,
          randomness: .28,
          crownTactics: 1
        },
        hard: {
          label: "Difficile",
          actionLimit: 7,
          thinkDelay: 430,
          actionDelay: 210,
          maxMoveCost: 5,
          pushProbability: .84,
          magicProbability: .88,
          pushMax: 4,
          placementShortlist: 3,
          randomness: .08,
          crownTactics: 2
        },
        expert: {
          label: "Expert stratège",
          actionLimit: 13,
          thinkDelay: 340,
          actionDelay: 120,
          maxMoveCost: 13,
          pushProbability: 1,
          magicProbability: 1,
          pushMax: 13,
          placementShortlist: 1,
          randomness: 0,
          crownTactics: 12,
          globalPlanning: true,
          defensePriority: 6.5,
          crownPriority: 8.5,
          denyScorePriority: 11,
          avoidWaste: true
        }
      };

      let turnTimerInterval = null;
      let aiRunToken = 0;

      let onlinePeer = null;
      let onlineConnection = null;
      let onlineRole = null;
      let onlineRoomCode = "";
      let onlineLocalName = "";
      let pendingOnlineStartingBoard = "classic";
      let pendingOnlineStartingPreset = "open";
      // 0 = aucune limite de temps (défaut). L'hôte seul décide de la valeur.
      let pendingOnlineTurnDuration = 0;
      let localPlayerIndex = null;
      let onlineConnected = false;
      let onlineReconnectTimer = null;
      let onlineSyncTimer = null;
      let networkApplyingState = false;
      let networkRevision = 0;
      let localSaveTimer = null;
      let boardRenderFrame = 0;
      let lastSavedSignature = "";
      let audioCtx = null;
      let ambientEnabled = true;
      let ambienceAudio = null;
      let effectsGain = null;
      let effectsLimiter = null;
      /* Bus audio unique (voir js/game/audio.js) : musique et bruitages ont
         désormais leur propre gain sous un master commun, ce qui rend le
         ducking et les fondus possibles. */
      let masterGain = null;
      let musicGain = null;
      let musicDuck = null;
      let musicElementSource = null;
      let reverbNode = null;
      let reverbDamp = null;
      let reverbReturn = null;
      // 11 : passage au moteur génératif. Le choix de piste est migré, pas jeté.
      const SOUND_SETTINGS_VERSION = 11;
      const soundSettings = {
        master: 0.50,
        // Le moteur génératif est bien plus présent que l'ancienne boucle :
        // 10 % était un contournement de sa qualité, plus une préférence.
        music: 0.34,
        effects: 1.40,
        track: "auto"
      };
      let currentMusicKey = "ciel";

      const key = (r, c) => `${r},${c}`;
      const cloneCells = cells => cells.map(([r, c]) => [r, c]);
      const ISLAND_VISUAL_VARIANTS = [0, 1, 2, 3, 4, 5];
      const ISLAND_VARIANT_CONTRAST = [
        [0, 9, 5, 10, 7, 4],
        [9, 0, 8, 4, 6, 7],
        [5, 8, 0, 9, 5, 6],
        [10, 4, 9, 0, 7, 6],
        [7, 6, 5, 7, 0, 6],
        [4, 7, 6, 6, 6, 0]
      ];

      function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }
      function inside(r, c) { return r >= 0 && c >= 0 && r < GRID && c < GRID; }
      function orthogonalNeighbors(r, c) {
        return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([nr, nc]) => inside(nr, nc));
      }
      function adjacentIslandIdsForCells(cells, islands = state?.islands || []) {
        const ownCells = new Set((cells || []).map(([r, c]) => key(r, c)));
        const cellToIsland = new Map();
        islands.forEach(island => {
          (island.cells || []).forEach(([r, c]) => cellToIsland.set(key(r, c), island.id));
        });
        const adjacentIds = new Set();
        (cells || []).forEach(([r, c]) => {
          orthogonalNeighbors(r, c).forEach(([nr, nc]) => {
            const neighborKey = key(nr, nc);
            if (ownCells.has(neighborKey)) return;
            const islandId = cellToIsland.get(neighborKey);
            if (islandId !== undefined && islandId !== null) adjacentIds.add(islandId);
          });
        });
        return [...adjacentIds];
      }
      function chooseIslandVisualVariant(cells, islandId, islands = state?.islands || []) {
        const adjacentIds = adjacentIslandIdsForCells(cells, islands);
        const adjacentVariants = adjacentIds
          .map(id => islands.find(island => String(island.id) === String(id)))
          .filter(Boolean)
          .map(island => Number.isInteger(island.visualVariant)
            ? island.visualVariant
            : Math.abs(Number(island.id) || 0) % ISLAND_VISUAL_VARIANTS.length);

        if (!adjacentVariants.length) {
          return Math.abs(Number(islandId) || 0) % ISLAND_VISUAL_VARIANTS.length;
        }

        let bestScore = -Infinity;
        let candidates = [];
        ISLAND_VISUAL_VARIANTS.forEach(variant => {
          const minimumContrast = Math.min(...adjacentVariants.map(
            adjacentVariant => ISLAND_VARIANT_CONTRAST[variant]?.[adjacentVariant] ?? 0
          ));
          if (minimumContrast > bestScore) {
            bestScore = minimumContrast;
            candidates = [variant];
          } else if (minimumContrast === bestScore) {
            candidates.push(variant);
          }
        });
        return candidates[Math.abs(Number(islandId) || 0) % candidates.length];
      }
      function normalizeShape(cells) {
        const minR = Math.min(...cells.map(c => c[0]));
        const minC = Math.min(...cells.map(c => c[1]));
        return cells.map(([r, c]) => [r - minR, c - minC]);
      }
      function rotateCells(cells, direction = 1, normalize = true) {
        const rotated = cells.map(([r, c]) => direction === 1 ? [c, -r] : [-c, r]);
        return normalize ? normalizeShape(rotated) : rotated;
      }
      function setPushForceChoice(value, { notify = false } = {}) {
        if (!state) return 1;
        const available = Math.max(1, availableActionCount("PUSH"));
        const next = Math.max(1, Math.min(available, Number(value) || 1));
        state.pushForceChoice = next;
        if (state.phase === "ACTION" && state.selectedActionType === "PUSH") state.selectedActionCount = next;
        if (notify) showToast(`Force de poussée : ${next}`);
        return next;
      }

      function handleActionWheel(event) {
        const pushBanner = event.target.closest?.(".action-push");
        if (!pushBanner || !state || !canLocalPlayerAct()) return;
        const available = availableActionCount("PUSH");
        if (available < 1) return;

        event.preventDefault();
        const direction = event.deltaY > 0 ? -1 : 1;
        setPushForceChoice((state.pushForceChoice || 1) + direction, { notify: true });
        renderHand();
        playSfx("rotate");
      }

      function handleBoardWheel(event) {
        if (!state || !canLocalPlayerAct()) return;

        const canRotatePlacement = state.phase === "PLACE_ISLAND" && !!state.placementCells;
        const canRotateMagic =
          state.phase === "ACTION" &&
          state.selectedActionType === "MAGIC" &&
          !!state.selectedIslandId &&
          !!state.selectedMagicPivot;

        if (!canRotatePlacement && !canRotateMagic) return;

        event.preventDefault();

        const now = performance.now();
        if (now - lastWheelAt < 90) return;
        lastWheelAt = now;

        const direction = event.deltaY > 0 ? 1 : -1;
        rotateSelectedIsland(direction);
      }

      function handleRotateKey(event) {
        if (!state || !canLocalPlayerAct()) return;
        const key = event.key.toLowerCase();

        if (key === "f") {
          const canFlipPlacement = state.phase === "PLACE_ISLAND" && !!state.placementCells;
          if (!canFlipPlacement) return;
          event.preventDefault();
          const now = performance.now();
          if (now - lastKeyRotateAt < 90) return;
          lastKeyRotateAt = now;
          flipSelectedIsland();
          return;
        }

        if (!["q", "e", "arrowleft", "arrowright"].includes(key)) return;

        const canRotatePlacement = state.phase === "PLACE_ISLAND" && !!state.placementCells;
        const canRotateMagic =
          state.phase === "ACTION" &&
          state.selectedActionType === "MAGIC" &&
          !!state.selectedIslandId &&
          !!state.selectedMagicPivot;

        if (!canRotatePlacement && !canRotateMagic) return;

        event.preventDefault();
        const now = performance.now();
        if (now - lastKeyRotateAt < 90) return;
        lastKeyRotateAt = now;

        const direction = (key === "q" || key === "arrowleft") ? -1 : 1;
        rotateSelectedIsland(direction);
      }

      function triggerFx(type, cells) {
        if (type === "move" && isCurrentPlayerAI()) {
          state.fxCells = [];
          return;
        }

        state.fxCells = cells.map(([r, c]) => ({ type, r, c }));
        // V78 (passe fluidité) : en mode 3D, ces classes fx-* sur les cellules
        // DOM n'ont jamais eu d'équivalent visuel dans la scène Three.js (le
        // plateau HTML n'est qu'une couche d'interaction/accessibilité dans ce
        // mode) — redessiner les 121 cellules pour ça était une dépense pure,
        // sans rien à montrer. On se contente de faire suivre l'état à la
        // synchronisation 3D existante ; le fallback HTML (hors mode 3D)
        // garde son comportement d'origine, seul endroit où fx-* est visible.
        if (document.body.dataset.visualMode === "alternative") {
          scheduleKayKitSync();
          setTimeout(() => {
            state.fxCells = [];
            scheduleKayKitSync();
          }, 420);
          return;
        }
        renderBoard();
        setTimeout(() => {
          state.fxCells = [];
          renderBoard();
        }, 420);
      }

      function animateToken(from, to, icon, color, kind, done, fall = false, path = null) {
        const fromCell = els.board.querySelector(`[data-r="${from[0]}"][data-c="${from[1]}"]`);
        const toCell = els.board.querySelector(`[data-r="${to[0]}"][data-c="${to[1]}"]`);
        if (!fromCell || !toCell) { done(); return; }

        state.inputLocked = true;
        const a = fromCell.getBoundingClientRect();
        const b = toCell.getBoundingClientRect();
        const ghost = document.createElement("div");
        const alternative = state?.visualMode === "alternative";
        ghost.className = `moving-token moving-${kind}${alternative ? " alt-moving-token" : ""}`;

        if (alternative) {
          ghost.innerHTML = `
          <span class="alt-moving-guardian" style="--token-color:${color || "#fff"}">
            <span class="alt-guardian-aura"></span>
            <span class="alt-guardian-legs"><i></i><i></i></span>
            <span class="alt-guardian-body"></span>
            <span class="alt-guardian-core"></span>
            <span class="alt-guardian-head"></span>
            <span class="alt-guardian-visor"></span>
            <span class="alt-guardian-crest"></span>
          </span>
        `;
        } else {
          ghost.textContent = icon;
        }

        ghost.style.setProperty("--ghost-color", color || "#fff");
        if (alternative && kaykit3D) ghost.style.opacity = "0";
        ghost.style.left = `${a.left}px`;
        ghost.style.top = `${a.top}px`;
        ghost.style.width = `${a.width}px`;
        ghost.style.height = `${a.height}px`;
        document.body.appendChild(ghost);

        const dx = b.left - a.left;
        const dy = b.top - a.top;

        let frames;
        let duration;

        if (alternative && kind === "move" && Array.isArray(path) && path.length) {
          const route = [from, ...path];
          const routeRects = route.map(([rr, cc]) => {
            const routeCell = els.board.querySelector(`[data-r="${rr}"][data-c="${cc}"]`);
            return routeCell?.getBoundingClientRect() || a;
          });

          frames = [{ transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 }];
          const segmentCount = Math.max(1, routeRects.length - 1);

          for (let index = 1; index < routeRects.length; index++) {
            const rect = routeRects[index];
            const stepDx = rect.left - a.left;
            const stepDy = rect.top - a.top;
            const startOffset = (index - 1) / segmentCount;
            const endOffset = index / segmentCount;
            const midOffset = startOffset + (endOffset - startOffset) * .54;

            const previousRect = routeRects[index - 1];
            const previousDx = previousRect.left - a.left;
            const previousDy = previousRect.top - a.top;
            const midDx = previousDx + (stepDx - previousDx) * .56;
            const midDy = previousDy + (stepDy - previousDy) * .56;

            frames.push({
              transform: `translate(${midDx}px,${midDy - 16}px) scale(1.05) rotateY(${index % 2 ? 8 : -8}deg)`,
              opacity: 1,
              offset: midOffset
            });
            frames.push({
              transform: `translate(${stepDx}px,${stepDy}px) scale(1) rotateY(0deg)`,
              opacity: 1,
              offset: endOffset
            });
          }

          duration = Math.min(1900, Math.max(520, segmentCount * 245));
        } else {
          frames = fall
            ? [
              { transform: "translate(0,0) scale(1)", opacity: 1 },
              { transform: `translate(${dx * .22}px,${dy * .22 - 7}px) scale(1.08)`, opacity: 1, offset: .24 },
              { transform: `translate(${dx * .56}px,${dy * .56 + 18}px) rotate(16deg) scale(.62)`, opacity: .62, offset: .64 },
              { transform: `translate(${dx * .72}px,${dy * .72 + 48}px) rotate(32deg) scale(.22)`, opacity: 0 }
            ]
            : kind === "push"
              ? [
                { transform: "translate(0,0) scale(1)", opacity: 1 },
                { transform: `translate(${-dx * .08}px,${-dy * .08}px) scale(1.10)`, opacity: 1, offset: .18 },
                { transform: `translate(${dx * .78}px,${dy * .78}px) scale(1.14)`, opacity: 1, offset: .74 },
                { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 1 }
              ]
              : [
                { transform: "translate(0,0) scale(1)", opacity: 1 },
                { transform: `translate(${dx * .45}px,${dy * .45 - 12}px) scale(1.12)`, opacity: 1, offset: .48 },
                { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 1 }
              ];
          duration = fall ? 520 : (kind === "push" ? 360 : 430);
        }

        const sourceCharacter = alternative
          ? fromCell.querySelector(".character")
          : null;
        sourceCharacter?.classList.add("character-in-motion");

        const animation = ghost.animate(frames, {
          duration,
          easing: kind === "push" ? "cubic-bezier(.18,.88,.30,1.18)" : "cubic-bezier(.18,.72,.18,1)",
          fill: "forwards"
        });
        animation.onfinish = () => {
          sourceCharacter?.classList.remove("character-in-motion");
          ghost.remove();
          state.inputLocked = false;
          done();
        };
      }


      function animateCellPulse(r, c, className) {
        if (isCurrentPlayerAI() && ["crown-burst", "spawn-arrival"].includes(className)) return;
        // V78 (passe fluidité) : en mode 3D, cette pulsation CSS sur la
        // cellule DOM (couche interaction/accessibilité, jamais affichée) n'a
        // aucun équivalent visible — la réponse visuelle réelle passe déjà
        // par queueKayKitActionAnimation()/Three.js (voir les appels "victory"
        // /"magic" à proximité de chaque appel de cette fonction). Aucun
        // intérêt à forcer un reflow (void cell.offsetWidth) pour un effet
        // invisible.
        if (document.body.dataset.visualMode === "alternative") return;
        requestAnimationFrame(() => {
          const cell = els.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
          if (!cell) return;
          cell.classList.remove(className);
          void cell.offsetWidth;
          cell.classList.add(className);
          setTimeout(() => cell.classList.remove(className), 760);
        });
      }

      function animateIslandArrival(island) {
        // V78 : la pose d'île a déjà son propre fondu d'apparition en 3D
        // (voir registerKayKitFadeIn/syncKayKitScene, déclenché par le
        // changement de state.islands) — ce pulse DOM (couche interaction/
        // accessibilité, invisible en mode 3D) serait une seconde
        // représentation visuelle pour rien.
        if (document.body.dataset.visualMode === "alternative") return;
        requestAnimationFrame(() => {
          island.cells.forEach(([r, c], index) => {
            const cell = els.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
            if (!cell) return;
            cell.style.setProperty("--arrival-delay", `${index * 45}ms`);
            cell.classList.add("island-arrival");
            setTimeout(() => {
              cell.classList.remove("island-arrival");
              cell.style.removeProperty("--arrival-delay");
            }, 850 + index * 45);
          });
        });
      }

      function animateIslandLiftRotation(islandId, degrees, callback) {
        const group = els.board.querySelector(`.island-art[data-island-id="${islandId}"]`);
        const island = state.islands.find(item => item.id === islandId);
        const cells = island
          ? island.cells.map(([r, c]) => els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`)).filter(Boolean)
          : [];
        group?.style.setProperty("--island-turn", `${degrees}deg`);
        group?.classList.add("island-lift-rotate");
        cells.forEach(cell => cell.classList.add("island-lift-cell"));
        setTimeout(() => callback?.(), 500);
      }

      function animateBoardMagic() {
        // V78 : le pulse magique 3D (playIslandMagicRotation, kaykit3d.js)
        // porte déjà l'effet visuel réel en mode alternative — ce pulse CSS
        // sur #board (couche interaction, invisible dans ce mode) n'apportait
        // rien et forçait un reflow (void offsetWidth) pour rien.
        if (document.body.dataset.visualMode === "alternative") return;
        els.board.classList.remove("magic-board-pulse");
        void els.board.offsetWidth;
        els.board.classList.add("magic-board-pulse");
        setTimeout(() => els.board.classList.remove("magic-board-pulse"), 620);
      }

      function cancelFromBackdrop(event) {
        if (!state || event.target !== els.boardWrap) return;
        if (state.phase === "SMART_CHAR") {
          cancelSmartCharacterAction();
        } else if (state.phase === "ACTION" && state.selectedActionType) {
          cancelSelectedCard();
        } else if (state.phase === "PICKUP_CROWN") {
          state.phase = "ACTION_SELECT";
          state.crownPickupCell = null;
          state.crownStealTargetId = null;
          state.crownPickupArtifactId = null;
          state.selectedCharId = null;
          state.reachable = new Set();
          renderAll();
        } else if (state.phase === "DROP_TREASURE") {
          state.phase = "ACTION_SELECT";
          state.treasureDropFromId = null;
          state.treasureDropArtifactId = null;
          state.crownTransferTargetIds = [];
          state.selectedCharId = null;
          state.reachable = new Set();
          renderAll();
        } else if (state.phase === "PLACE_ISLAND") {
          state.phase = "ACTION_SELECT";
          state.selectedIslandShape = null;
          state.placementCells = null;
          state.hoverAnchor = null;
          renderAll();
        }
      }

      function showToast(message) {
        els.toast.textContent = message;
        els.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1900);

        // HUD V2 (Prompt 2/3) : miroir dans le slot toast du nouveau dock.
        // showToast() est deja le point d'entree unique pour les evenements
        // notables (couronne, erreur...) — jamais pour les instructions de
        // tour normales, qui passent par turnContextInfo()/renderHudV2().
        const hudToast = document.getElementById("hudV2Toast");
        if (hudToast) {
          hudToast.textContent = message;
          clearTimeout(showToast.hudTimer);
          showToast.hudTimer = setTimeout(() => { hudToast.textContent = ""; }, 2400);
        }
      }


      function symmetricSetupOptionsHTML() {
        return Object.entries(SYMMETRIC_DUEL_SETUPS)
          .map(([id, setup]) => {
            const guardiansPerTeam = setup.characters.filter(
              character => character.player === 0
            ).length;
            return `<option value="${id}">${setup.name} — ${setup.islands.length} îles • ${guardiansPerTeam} gardien${guardiansPerTeam > 1 ? "s" : ""}/équipe</option>`;
          })
          .join("");
      }

      function startingBoardControlsHTML({ online = false } = {}) {
        return `
        <label class="mode-option-row starting-board-row" for="startingBoardSelect">
          <span>
            <b>Plateau de départ</b>
            <small>Le setup précis du Duel symétrique sera choisi sur l’écran du plateau.</small>
          </span>
          <select id="startingBoardSelect">
            <option value="classic" selected>Classique — plateau vide</option>
            <option value="symmetric">Duel symétrique — plateau préparé</option>
          </select>
        </label>
        ${turnTimerControlsHTML()}
      `;
      }

      // Chronomètre désactivé par défaut : une partie de base se joue sans
      // pression de temps. La valeur est une durée en secondes ; "0" signifie
      // "aucune limite" (voir isTurnTimerEnabled).
      function turnTimerControlsHTML() {
        return `
        <label class="mode-option-row turn-timer-row" for="turnTimerSelect">
          <span>
            <b>Temps par tour</b>
            <small>Sans limite par défaut. Avec une limite, une île est posée automatiquement à 0:00 puis le tour passe.</small>
          </span>
          <select id="turnTimerSelect">
            <option value="0" selected>Aucune limite</option>
            <option value="60">1 minute</option>
            <option value="120">2 minutes</option>
            <option value="180">3 minutes</option>
            <option value="300">5 minutes</option>
          </select>
        </label>
      `;
      }

      function selectedTurnDurationSeconds() {
        const raw = Number(document.getElementById("turnTimerSelect")?.value);
        return Number.isFinite(raw) && raw > 0 ? raw : 0;
      }

      function renderSymmetricSetupPreview(setupId) {
        const setup = SYMMETRIC_DUEL_SETUPS[setupId]
          || SYMMETRIC_DUEL_SETUPS.open;
        const preview = document.getElementById("symmetricSetupPreview");
        const name = document.getElementById("symmetricSetupName");
        const description = document.getElementById("symmetricSetupText");
        const islandCount = document.getElementById("symmetricSetupIslandCount");
        const characterCount = document.getElementById("symmetricSetupCharacterCount");
        const style = document.getElementById("symmetricSetupStyle");
        const guardiansPerTeam = setup.characters.filter(
          character => character.player === 0
        ).length;

        if (name) name.textContent = setup.name;
        if (description) description.textContent = setup.description;
        if (islandCount) islandCount.textContent = `${setup.islands.length} îles`;
        if (characterCount) {
          characterCount.textContent = `${guardiansPerTeam} gardien${guardiansPerTeam > 1 ? "s" : ""} / équipe`;
        }
        if (style) style.textContent = setup.style;
        if (!preview) return;

        const islandMap = new Map();
        setup.islands.forEach(island => {
          island.cells.forEach(([r, c]) => {
            islandMap.set(key(r, c), island.owner);
          });
        });

        const characterMap = new Map(
          setup.characters.map(character => [
            key(character.r, character.c),
            character.player
          ])
        );

        const villageMap = new Map();
        const assignments = getVillageAssignments(2);
        assignments.forEach((villages, playerId) => {
          villages.forEach(village => {
            villageMap.set(key(village.r, village.c), playerId);
          });
        });

        let html = "";
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const cellKey = key(r, c);
            const owner = islandMap.get(cellKey);
            const villageOwner = villageMap.get(cellKey);
            const characterOwner = characterMap.get(cellKey);
            const classes = ["setup-preview-cell"];

            if (owner !== undefined) classes.push(`setup-island-p${owner}`);
            if (villageOwner !== undefined) classes.push(`setup-village-p${villageOwner}`);
            if (isSanctuary(r, c)) classes.push("setup-preview-sanctuary");
            if (r === CENTER.r && c === CENTER.c) classes.push("setup-preview-crown");

            html += `<span class="${classes.join(" ")}">`;
            if (r === CENTER.r && c === CENTER.c) html += `<i>👑</i>`;
            if (villageOwner !== undefined) html += `<i class="setup-preview-village">⌂</i>`;
            if (characterOwner !== undefined) {
              html += `<b class="setup-preview-character setup-character-p${characterOwner}">●</b>`;
            }
            html += `</span>`;
          }
        }

        preview.innerHTML = html;
        preview.classList.remove("preview-refresh");
        void preview.offsetWidth;
        preview.classList.add("preview-refresh");
      }

      function refreshSymmetricSetupControls() {
        const boardSelect = document.getElementById("startingBoardSelect");
        if (!boardSelect) return;
        boardSelect.dataset.mode = boardSelect.value;
      }

      function wireStartingBoardControls() {
        const boardSelect = document.getElementById("startingBoardSelect");
        boardSelect?.addEventListener("change", refreshSymmetricSetupControls);
        refreshSymmetricSetupControls();
      }

      function renderSetupFields() {
        const selectedMode = String(els.playerCount.value);
        const soloMode = selectedMode === "1";
        const onlineMode = selectedMode === "online";
        const humanCount = (soloMode || onlineMode) ? 1 : Number(selectedMode);

        els.playersForm.innerHTML = "";
        els.modeOptions.innerHTML = "";
        renderLocalResumePanel(selectedMode);

        for (let i = 0; i < humanCount; i++) {
          const row = document.createElement("label");
          row.className = "player-field";
          row.innerHTML = `
          <span class="player-dot" style="background:${PLAYER_COLORS[i]};color:${PLAYER_COLORS[i]}"></span>
          <input class="player-name" maxlength="18" value="JOUEUR ${i + 1}" aria-label="Nom du joueur ${i + 1}">
        `;
          els.playersForm.appendChild(row);
        }

        if (soloMode) {
          const cpu = document.createElement("div");
          cpu.className = "player-field ai-player-field";
          cpu.innerHTML = `
          <span class="player-dot ai-dot" style="background:${PLAYER_COLORS[1]};color:${PLAYER_COLORS[1]}"></span>
          <span class="ai-player-name"><b>ORDINATEUR</b><small>Adversaire automatique</small></span>
          <span class="ai-chip">CPU</span>
        `;
          els.playersForm.appendChild(cpu);

          els.modeOptions.innerHTML = `
          <label class="mode-option-row" for="aiDifficultySelect">
            <span><b>Difficulté de l’ordinateur</b><small>Le niveau change sa stratégie et le nombre d’actions qu’il joue.</small></span>
            <select id="aiDifficultySelect">
              <option value="easy">Facile</option>
              <option value="normal" selected>Normal</option>
              <option value="hard">Difficile</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          ${startingBoardControlsHTML()}
        `;
          wireStartingBoardControls();
          els.startBtn.textContent = "Lancer ILYOS — KayKit Edition";
          return;
        }

        if (onlineMode) {
          const saved = loadSavedOnlineSession();
          els.modeOptions.innerHTML = `
          <div class="online-setup-panel">
            <div class="online-choice-row">
              <label>
                <span>Connexion</span>
                <select id="onlineRoleSelect">
                  <option value="host">Créer une partie</option>
                  <option value="guest">Rejoindre une partie</option>
                </select>
              </label>
              <label>
                <span>Code de partie</span>
                <input id="onlineRoomInput" class="online-room-input" maxlength="8" placeholder="Ex. ILYOS7">
              </label>
            </div>
            ${startingBoardControlsHTML({ online: true })}
            <p id="onlineSetupStatus" class="online-setup-status">Créez un salon puis partagez son code avec l’autre joueur.</p>
            ${saved ? `<button id="resumeOnlineBtn" type="button" class="resume-online-btn">↻ Reprendre ${saved.roomCode}</button>` : ""}
          </div>
        `;

          wireStartingBoardControls();

          const roleSelect = document.getElementById("onlineRoleSelect");
          const roomInput = document.getElementById("onlineRoomInput");
          const startingBoardSelect = document.getElementById("startingBoardSelect");
          const refreshOnlineLabels = () => {
            const host = roleSelect.value === "host";
            roomInput.placeholder = host ? "Généré automatiquement" : "Code reçu";
            if (startingBoardSelect) {
              startingBoardSelect.disabled = !host;
              if (!host) startingBoardSelect.value = "classic";
            }
            refreshSymmetricSetupControls();
            els.startBtn.textContent = host ? "Créer le salon" : "Rejoindre";
            const status = document.getElementById("onlineSetupStatus");
            if (status) {
              status.textContent = host
                ? "Créez un salon puis partagez son code avec l’autre joueur."
                : "Saisissez le code transmis par le créateur de la partie.";
            }
          };
          roleSelect.addEventListener("change", refreshOnlineLabels);
          refreshOnlineLabels();

          document.getElementById("resumeOnlineBtn")?.addEventListener("click", event => {
            event.preventDefault();
            resumeOnlineSession(saved);
          });
          return;
        }

        if (selectedMode === "2") {
          els.modeOptions.innerHTML = `
          ${startingBoardControlsHTML()}
        `;
          wireStartingBoardControls();
        }

        els.startBtn.textContent = "Lancer ILYOS — KayKit Edition";
      }


      function aiConfig() {
        return AI_LEVELS[state?.aiDifficulty || "normal"] || AI_LEVELS.normal;
      }

      function isOnlineMode() {
        return !!state?.onlineMode;
      }

      function canLocalPlayerAct() {
        if (!state) return false;
        if (!state.onlineMode) return !isCurrentPlayerAI();
        return onlineConnected && state.currentPlayer === localPlayerIndex;
      }

      function sanitizeRoomCode(value) {
        return String(value || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 8);
      }

      function generateRoomCode() {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        return code;
      }


      function serializeGameStateForSave() {
        if (!state) return null;
        const clean = JSON.parse(JSON.stringify({
          ...state,
          schemaVersion: STATE_SCHEMA_VERSION,
          reachable: [...(state.reachable || [])],
          fxCells: [],
          inputLocked: false,
          aiThinking: false,
          timerExpiring: false,
          undoHistory: [],
          magicHoverIslandId: null,
          magicHoverPivot: null,
          actionHoverCell: null,
          smartHoverType: null,
          smartHoverPath: [],
          smartPushForce: null,
          smartPushTargets: [],
          pushOptions: [],
          pushHoverOptionId: null,
          pushTargetId: null,
          pendingDirectMoveTarget: null,
          savedAt: Date.now()
        }));
        return clean;
      }

      function normalizeRestoredState(raw) {
        if (!raw || !Array.isArray(raw.players) || !raw.players.length) return null;
        const restored = JSON.parse(JSON.stringify(raw));

        restored.schemaVersion = STATE_SCHEMA_VERSION;
        restored.visualMode = "alternative";
        restored.players = restored.players.map((player, index) => ({
          id: index,
          name: String(player.name || `JOUEUR ${index + 1}`).toLocaleUpperCase("fr-FR"),
          color: player.color || PLAYER_COLORS[index],
          icon: player.icon || PLAYER_ICONS[index],
          isAI: !!player.isAI,
          aiDifficulty: player.aiDifficulty || null,
          village: player.village || CORNERS[index] || CORNERS[0],
          villages: Array.isArray(player.villages) && player.villages.length
            ? player.villages
            : [player.village || CORNERS[index] || CORNERS[0]],
          score: Number(player.score || 0),
          deck: (Array.isArray(player.deck) ? player.deck : createDeck(index))
            .filter(card => !card.fromStash)
            .map(card => ({ ...card, used: false, fromStash: false })),
          discard: (Array.isArray(player.discard) ? player.discard : [])
            .filter(card => !card.fromStash)
            .map(card => ({ ...card, used: false, fromStash: false })),
          hand: (Array.isArray(player.hand) ? player.hand : [])
            .filter(card => !card.fromStash)
            .slice(0, 5)
            .map(card => ({ ...card, fromStash: false })),
          stash: {
            MOVE: Math.max(0, Math.min(5, Number(player.stash?.MOVE || 0))),
            PUSH: Math.max(0, Math.min(5, Number(player.stash?.PUSH || 0))),
            MAGIC: Math.max(0, Math.min(5, Number(player.stash?.MAGIC || 0)))
          }
        }));

        /*
         * Migration V64 : chaque joueur doit posséder exactement 13 cartes
         * (8 déplacements, 4 poussées et 1 magie), toutes zones confondues.
         * Une ancienne composition est reconstruite proprement au prochain tour.
         */
        restored.players.forEach((player, index) => {
          const allCards = [...(player.deck || []), ...(player.hand || []), ...(player.discard || [])];
          const counts = allCards.reduce((acc, card) => {
            if (card?.action in acc) acc[card.action]++;
            return acc;
          }, { MOVE: 0, PUSH: 0, MAGIC: 0 });
          const valid = allCards.length === 13 && counts.MOVE === 8 && counts.PUSH === 4 && counts.MAGIC === 1;
          if (!valid) {
            player.deck = createDeck(index);
            player.hand = [];
            player.discard = [];
          }
        });

        restored.currentPlayer = Math.max(0, Math.min(
          Number(restored.currentPlayer || 0),
          restored.players.length - 1
        ));
        restored.round = Math.max(1, Number(restored.round || 1));
        restored.turn = Math.max(1, Number(restored.turn || 1));
        restored.islands = Array.isArray(restored.islands) ? restored.islands : [];
        restored.islands.forEach(island => {
          if (!Number.isInteger(island.visualVariant)) {
            island.visualVariant = Math.abs(Number(island.id) || 0) % ISLAND_VISUAL_VARIANTS.length;
          }
          island.visualVariant = ((island.visualVariant % ISLAND_VISUAL_VARIANTS.length) + ISLAND_VISUAL_VARIANTS.length)
            % ISLAND_VISUAL_VARIANTS.length;
        });
        restored.characters = Array.isArray(restored.characters) ? restored.characters : [];
        restored.reachable = new Set(restored.reachable || []);
        restored.fxCells = [];
        restored.inputLocked = false;
        restored.aiThinking = false;
        restored.timerExpiring = false;
        restored.undoHistory = [];
        restored.magicHoverIslandId = null;
        restored.magicHoverPivot = null;
        restored.actionHoverCell = null;
        restored.smartHoverType = null;
        restored.smartHoverPath = [];
        restored.smartPushForce = null;
        restored.smartPushTargets = new Set();
        restored.pushOptions = [];
        restored.pushHoverOptionId = null;
        restored.pushTargetId = null;
        restored.pendingDirectMoveTarget = null;
        restored.pushForceChoice = Math.max(1, Number(restored.pushForceChoice || 1));
        restored.crownPickupArtifactId ||= null;
        restored.treasureDropArtifactId ||= null;
        restored.crownStealTargetId ||= null;
        restored.crownTransferTargetIds = Array.isArray(restored.crownTransferTargetIds)
          ? restored.crownTransferTargetIds
          : [];
        restored.aiCrownMemory = {};
        restored.nextIslandId = Math.max(
          Number(restored.nextIslandId || 1),
          ...restored.islands.map(island => Number(island.id || 0) + 1),
          1
        );
        restored.nextCharId = Math.max(
          Number(restored.nextCharId || 100),
          restored.characters.length + 100
        );
        restored.winner = restored.winner ?? null;
        restored.startingBoardMode = restored.startingBoardMode === "symmetric"
          ? "symmetric"
          : "classic";
        restored.startingBoardPreset = restored.startingBoardMode === "symmetric"
          ? resolveSymmetricSetupId(restored.startingBoardPreset)
          : null;
        restored.setupSelectionPending = !!restored.setupSelectionPending;

        if (!restored.artifact) {
          restored.artifact = { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true };
        }
        restored.artifact.id ||= "crown-1";
        restored.artifact.active = restored.artifact.active !== false;
        if (!restored.secondArtifact) {
          restored.secondArtifact = { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
        }
        restored.secondArtifact.id ||= "crown-2";
        restored.secondArtifact.active = !!restored.secondArtifact.active;

        const validCharacterIds = new Set(restored.characters.map(char => char.id));
        for (const artifact of [restored.artifact, restored.secondArtifact]) {
          if (artifact.carrierId && !validCharacterIds.has(artifact.carrierId)) {
            artifact.carrierId = null;
            artifact.r = CENTER.r;
            artifact.c = CENTER.c;
          }
        }

        // Partie sans limite de temps (défaut, et cas de toutes les sauvegardes
        // antérieures à cette option) : aucun deadline à reconstituer.
        const duration = Number(restored.turnDurationSeconds);
        if (!Number.isFinite(duration) || duration <= 0) {
          restored.turnDurationSeconds = 0;
          restored.turnTimeLeft = null;
          restored.turnDeadline = null;
          return restored;
        }
        restored.turnDurationSeconds = duration;
        const remaining = Number(restored.turnTimeLeft);
        restored.turnTimeLeft = Number.isFinite(remaining)
          ? Math.max(1, Math.min(duration, remaining))
          : duration;
        restored.turnDeadline = Date.now() + restored.turnTimeLeft * 1000;

        return restored;
      }

      function loadSavedLocalSession() {
        try {
          const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "null");
          if (!saved?.state || saved.state.onlineMode) return null;
          return saved;
        } catch (error) {
          return null;
        }
      }

      function clearLocalSession() {
        try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch (error) { }
        lastSavedSignature = "";
      }

      function saveLocalSessionNow() {
        if (!state || state.onlineMode || networkApplyingState) return;
        try {
          state.turnTimeLeft = state.turnDeadline
            ? Math.max(0, (state.turnDeadline - Date.now()) / 1000)
            : state.turnTimeLeft;
          const snapshot = serializeGameStateForSave();
          const signature = JSON.stringify({
            turn: snapshot.turn,
            phase: snapshot.phase,
            currentPlayer: snapshot.currentPlayer,
            islands: snapshot.islands,
            characters: snapshot.characters,
            artifacts: [snapshot.artifact, snapshot.secondArtifact],
            players: snapshot.players,
            time: Math.floor(snapshot.turnTimeLeft)
          });
          if (signature === lastSavedSignature) return;
          lastSavedSignature = signature;
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
            version: STATE_SCHEMA_VERSION,
            savedAt: Date.now(),
            mode: snapshot.soloMode ? "solo" : "local",
            state: snapshot
          }));
        } catch (error) {
          console.warn("Sauvegarde locale impossible.", error);
        }
      }

      function scheduleLocalSave() {
        if (!state || state.onlineMode || networkApplyingState) return;
        clearTimeout(localSaveTimer);
        localSaveTimer = setTimeout(saveLocalSessionNow, 280);
      }

      function renderLocalResumePanel(selectedMode = String(els.playerCount.value)) {
        if (!els.resumeLocalPanel) return;
        const saved = loadSavedLocalSession();
        const onlineMode = String(selectedMode) === "online";

        if (!saved || onlineMode) {
          els.resumeLocalPanel.innerHTML = "";
          els.resumeLocalPanel.classList.add("hidden");
          return;
        }

        const date = new Date(saved.savedAt || Date.now());
        const modeLabel = saved.mode === "solo" ? "contre l’ordinateur" : "en local";
        els.resumeLocalPanel.classList.remove("hidden");
        els.resumeLocalPanel.innerHTML = `
        <div class="resume-local-copy">
          <strong>Partie sauvegardée ${modeLabel}</strong>
          <small>Tour ${saved.state?.turn || 1} · ${date.toLocaleDateString("fr-FR")} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small>
        </div>
        <button type="button" id="resumeLocalBtn">Reprendre</button>
        <button type="button" id="deleteLocalSaveBtn" aria-label="Supprimer la sauvegarde">×</button>
      `;

        document.getElementById("resumeLocalBtn")?.addEventListener("click", resumeLocalSession);
        document.getElementById("deleteLocalSaveBtn")?.addEventListener("click", () => {
          clearLocalSession();
          renderLocalResumePanel(selectedMode);
        });
      }

      function resumeLocalSession() {
        const saved = loadSavedLocalSession();
        const restored = normalizeRestoredState(saved?.state);
        if (!restored) {
          clearLocalSession();
          renderLocalResumePanel();
          showToast("La sauvegarde n’est plus compatible.");
          return;
        }

        stopTurnTimer();
        aiRunToken++;
        closeOnlineNetwork(false);
        state = restored;
        state.onlineMode = false;
        applyVisualMode(state.visualMode);

        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        els.gameScreen.classList.toggle("ai-turn", isCurrentPlayerAI());
        renderAll();
        startAmbient();

        if (state.setupSelectionPending) {
          state.inputLocked = true;
          stopTurnTimer();
          openSymmetricSetupOverlay({
            selectedId: state.startingBoardPreset || "open"
          });
          showToast("Choisissez le setup du Duel symétrique.");
          return;
        }

        startTurnTimer(false);
        showToast("Partie reprise.");
        if (isCurrentPlayerAI()) {
          const token = ++aiRunToken;
          setTimeout(() => runAITurn(token), 500);
        }
      }

      function loadSavedOnlineSession() {
        try {
          const saved = JSON.parse(localStorage.getItem(ONLINE_STORAGE_KEY) || "null");
          return saved?.roomCode && saved?.role ? saved : null;
        } catch (error) {
          return null;
        }
      }

      function createDeck(playerIndex) {
        return shuffle(CARD_BLUEPRINTS.map((action, i) => ({
          id: `P${playerIndex}-C${i}-${Math.random().toString(36).slice(2, 7)}`,
          action,
          used: false
        })));
      }

      function getVillageAssignments(count) {
        if (count === 2) {
          return [
            [CORNERS[0], CORNERS[2]],
            [CORNERS[1], CORNERS[3]]
          ];
        }
        if (count === 3) {
          return [
            [CORNERS[0]],
            [CORNERS[1]],
            [CORNERS[2]]
          ];
        }
        return CORNERS.slice(0, count).map(corner => [corner]);
      }

      function villagesForPlayer(player) {
        if (!player) return [];
        return Array.isArray(player.villages) && player.villages.length
          ? player.villages
          : player.village ? [player.village] : [];
      }

      function currentPlayer() { return state.players[state.currentPlayer]; }
      function villageAt(r, c) {
        return state.players.find(player =>
          villagesForPlayer(player).some(village => village.r === r && village.c === c)
        );
      }
      function villageZoneDataAt(r, c) {
        for (const player of state.players) {
          for (const village of villagesForPlayer(player)) {
            if (cornerCrownCellsForVillage(village).some(([vr, vc]) => vr === r && vc === c)) {
              return { player, village, isVillage: village.r === r && village.c === c };
            }
          }
        }
        return null;
      }
      function isSanctuary(r, c) {
        return Math.abs(r - CENTER.r) + Math.abs(c - CENTER.c) <= 1;
      }

      function isSanctuaryCenter(r, c) {
        return r === CENTER.r && c === CENTER.c;
      }
      function islandAt(r, c) { return state.islands.find(is => is.cells.some(([ir, ic]) => ir === r && ic === c)); }

      // Règle personnalisable (duel symétrique uniquement, voir
      // confirmSymmetricSetup) : nombre total d'îles qu'un joueur peut poser
      // sur toute la partie. 0/absent = illimité, comportement inchangé.
      function islandCountForOwner(playerId) {
        // On ne compte QUE les îles posées pendant la partie. Celles du plateau préparé
        // (Duel symétrique) portent déjà un propriétaire sans avoir été jouées : les
        // inclure revenait à décompter d'avance des poses que le joueur n'a pas faites.
        // La limite choisie au menu est donc bien un stock de pièces à poser, et non un
        // plafond du nombre d'îles possédées sur le plateau.
        return state.islands.filter(island => island.owner === playerId && !island.fromSetup).length;
      }

      function islandLimitReachedForPlayer(playerId) {
        const limit = state.rules?.islandLimitPerPlayer;
        if (!limit) return false;
        return islandCountForOwner(playerId) >= limit;
      }

      /*
       * La zone attenuée indique seulement une future zone de validation.
       * Seule la case Château est déjà praticable. Les deux autres cases
       * restent constructibles et deviennent du terrain après la pose d'une île.
       */
      function isLand(r, c) { return !!villageAt(r, c) || isSanctuary(r, c) || !!islandAt(r, c); }
      function characterAt(r, c) { return state.characters.find(ch => ch.r === r && ch.c === c); }

      function guardianCount(playerId) {
        return state.characters.filter(char => char.player === playerId).length;
      }

      function canCreateGuardian(playerId) {
        return guardianCount(playerId) < MAX_GUARDIANS_PER_PLAYER;
      }
      function characterById(id) { return state.characters.find(ch => ch.id === id); }
      function selectedCard() { return state.selectedActionType ? { action: state.selectedActionType } : null; }
      function unusedCardsOfType(type, player = currentPlayer()) {
        return (player?.hand || []).filter(card => !card.used && card.action === type);
      }

      function storedActionCount(type, player = currentPlayer()) {
        return Math.max(0, Math.min(5, Number(player?.stash?.[type] || 0)));
      }

      function availableActionCount(type, player = currentPlayer()) {
        if (!state || !player) return 0;
        return unusedCardsOfType(type, player).length + storedActionCount(type, player);
      }

      function consumeAvailableActions(type, count = 1, player = currentPlayer()) {
        if (!player || count < 1) return 0;

        let remaining = Math.min(
          Math.floor(count),
          availableActionCount(type, player)
        );

        const consumed = remaining;
        const freshCards = unusedCardsOfType(type, player);
        const freshUsed = Math.min(remaining, freshCards.length);

        freshCards.slice(0, freshUsed).forEach(card => {
          card.used = true;
        });
        remaining -= freshUsed;

        if (remaining > 0) {
          player.stash[type] = Math.max(
            0,
            storedActionCount(type, player) - remaining
          );
        }

        return consumed;
      }

      function selectedBatchSize() {
        return Math.max(
          1,
          Math.min(
            state.selectedActionCount || 1,
            availableActionCount(state.selectedActionType)
          )
        );
      }

      function ensureArtifactState() {
        if (!state) return;
        if (!state.artifact) {
          state.artifact = { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true };
        }
        state.artifact.id ||= "crown-1";
        state.artifact.active = true;

        if (!state.secondArtifact) {
          state.secondArtifact = { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
        }
        state.secondArtifact.id ||= "crown-2";
        if (state.secondArtifact.active === undefined) state.secondArtifact.active = false;
      }

      function artifactSlots() {
        ensureArtifactState();
        return [state.artifact, state.secondArtifact];
      }

      function activeArtifacts() {
        return artifactSlots().filter(artifact => artifact.active !== false);
      }

      function artifactById(id) {
        return artifactSlots().find(artifact => artifact.id === id) || null;
      }

      function looseArtifactAt(r, c) {
        return activeArtifacts().find(artifact =>
          artifact.carrierId === null && artifact.r === r && artifact.c === c
        ) || null;
      }

      function artifactCarriedBy(characterId) {
        if (!characterId) return null;
        return activeArtifacts().find(artifact => artifact.carrierId === characterId) || null;
      }

      function characterCarriesCrown(characterId) {
        return !!artifactCarriedBy(characterId);
      }

      function findCrownSpawnCell(excludedArtifactId = null) {
        const occupiedLoose = new Set(
          activeArtifacts()
            .filter(artifact => artifact.id !== excludedArtifactId && artifact.carrierId === null)
            .map(artifact => key(artifact.r, artifact.c))
        );

        const cells = [];
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            if (!isLand(r, c) || occupiedLoose.has(key(r, c))) continue;
            cells.push({
              r, c,
              occupied: !!characterAt(r, c),
              village: !!villageAt(r, c),
              distance: Math.abs(r - CENTER.r) + Math.abs(c - CENTER.c)
            });
          }
        }

        cells.sort((a, b) =>
          Number(a.occupied) - Number(b.occupied)
          || Number(a.village) - Number(b.village)
          || a.distance - b.distance
        );
        return cells[0] || { r: CENTER.r, c: CENTER.c };
      }

      function activateSecondCrownIfNeeded() {
        ensureArtifactState();
        if (state.secondArtifact.active || !state.artifact.carrierId) return false;
        const spawn = findCrownSpawnCell(state.secondArtifact.id);
        state.secondArtifact.active = true;
        state.secondArtifact.carrierId = null;
        state.secondArtifact.r = spawn.r;
        state.secondArtifact.c = spawn.c;
        setTimeout(() => {
          if (!state) return;
          animateCellPulse(spawn.r, spawn.c, "crown-burst");
          showToast("Une seconde couronne apparaît sur le terrain !");
          playSfx("crownTake");   // Une couronne entre en jeu : surtout pas le son du point marqué.
        }, 220);
        return true;
      }

      function giveArtifactToCharacter(artifact, char) {
        if (!artifact || !char) return false;
        const alreadyCarried = artifactCarriedBy(char.id);
        if (alreadyCarried && alreadyCarried.id !== artifact.id) return false;
        // Provenance retenue AVANT de changer de porteur : elle sert à animer le
        // trajet de la couronne (sol -> gardien, ou gardien -> gardien).
        const previousCarrierId = artifact.carrierId;
        const fromR = artifact.r;
        const fromC = artifact.c;
        artifact.active = true;
        artifact.carrierId = char.id;
        activateSecondCrownIfNeeded();
        if (previousCarrierId != null && previousCarrierId !== char.id) {
          const previous = characterById(previousCarrierId);
          if (previous) playCrownFlight(previous.r, previous.c, char.r, char.c, { arc: .55, duration: 340 });
        }
        playCrownPickup(char.id, Number.isFinite(fromR) ? fromR : char.r, Number.isFinite(fromC) ? fromC : char.c);
        return true;
      }

      function resetArtifactObject(artifact) {
        if (!artifact) return;
        artifact.active = true;
        artifact.carrierId = null;
        const spawn = findCrownSpawnCell(artifact.id);
        artifact.r = spawn.r;
        artifact.c = spawn.c;
        const occupant = characterAt(spawn.r, spawn.c);
        if (occupant && !characterCarriesCrown(occupant.id)) {
          artifact.carrierId = occupant.id;
          activateSecondCrownIfNeeded();
        }
        // aiCrownMemory (voir aiCrownActionUsed/markAICrownAction, js/game/ai.js)
        // marque "passe gratuite déjà faite" / "pose+poussée déjà faite" par
        // identifiant de couronne, sans jamais s'effacer — un jeton ne
        // pouvait donc bénéficier de ces tactiques gratuites qu'une seule
        // fois sur TOUTE la partie. Une couronne qui repart de zéro après
        // avoir été validée mérite un nouveau trajet, donc un nouveau droit
        // à ces tactiques.
        if (state.aiCrownMemory) {
          delete state.aiCrownMemory[`${artifact.id}:handoff`];
          delete state.aiCrownMemory[`${artifact.id}:drop-push`];
        }
      }

      function playerShortName(player) {
        return player.name && player.name.trim() ? player.name.trim().charAt(0).toUpperCase() : "J";
      }
      function avatarHTML(player, cls = "portrait-avatar") {
        return `
        <span class="${cls}" style="--avatarColor:${player.color}">
          <span class="avatar-crest"></span>
          <span class="avatar-helm"></span>
          <span class="avatar-face"></span>
        </span>
      `;
      }
      function clearMagicPreview() {
        state.selectedMagicPivot = null;
        state.magicPreviewDirection = 0;
        state.magicPreviewSteps = 0;
        state.magicPreviewCells = null;
        state.magicPreviewValid = false;
      }
      function isSameCell(a, b) {
        return !!a && !!b && a[0] === b[0] && a[1] === b[1];
      }
      function cellInPreviewSet(cells, r, c) {
        return Array.isArray(cells) && cells.some(([pr, pc]) => pr === r && pc === c);
      }


      function movementEdges(r, c) {
        const edges = orthogonalNeighbors(r, c).map(([nr, nc]) => ({
          r: nr,
          c: nc,
          cost: 1,
          diagonal: false
        }));

        for (const dr of [-1, 1]) {
          for (const dc of [-1, 1]) {
            const nr = r + dr;
            const nc = c + dc;
            if (!inside(nr, nc)) continue;

            edges.push({
              r: nr,
              c: nc,
              cost: 2,
              diagonal: true
            });
          }
        }

        return edges;
      }

      function shortestMovementPath(char, targetR, targetC, maxCost) {
        if (
          !char
          || !inside(targetR, targetC)
          || !isLand(targetR, targetC)
          || characterAt(targetR, targetC)
        ) return null;

        const startKey = key(char.r, char.c);
        const targetKey = key(targetR, targetC);
        const distances = new Map([[startKey, 0]]);
        const previous = new Map([[startKey, null]]);
        const open = [{ r: char.r, c: char.c, cost: 0 }];

        while (open.length) {
          open.sort((a, b) => a.cost - b.cost);
          const current = open.shift();
          const currentKey = key(current.r, current.c);

          if (current.cost !== distances.get(currentKey)) continue;
          if (currentKey === targetKey) break;

          for (const edge of movementEdges(current.r, current.c)) {
            const nextKey = key(edge.r, edge.c);
            if (!isLand(edge.r, edge.c)) continue;

            const occupant = characterAt(edge.r, edge.c);
            if (occupant) continue;

            const nextCost = current.cost + edge.cost;
            if (nextCost > maxCost) continue;
            if (nextCost >= (distances.get(nextKey) ?? Infinity)) continue;

            distances.set(nextKey, nextCost);
            previous.set(nextKey, {
              from: [current.r, current.c],
              diagonal: edge.diagonal,
              stepCost: edge.cost
            });
            open.push({ r: edge.r, c: edge.c, cost: nextCost });
          }
        }

        if (!distances.has(targetKey)) return null;

        const path = [];
        let cursor = [targetR, targetC];

        while (key(cursor[0], cursor[1]) !== startKey) {
          const entry = previous.get(key(cursor[0], cursor[1]));
          if (!entry) return null;

          path.unshift({
            r: cursor[0],
            c: cursor[1],
            diagonal: entry.diagonal,
            stepCost: entry.stepCost
          });
          cursor = entry.from;
        }

        const cells = path.map(step => [step.r, step.c]);
        cells.cost = distances.get(targetKey);
        cells.hasDiagonal = path.some(step => step.diagonal);
        cells.steps = path;
        return cells;
      }

      function clearSmartHover() {
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        // Force explicitement choisie par le joueur pour LA cible actuellement
        // survolée (voir getPushHoverPreview) : n'a plus de sens dès que le
        // survol change de case, donc réinitialisée avec le reste du hover.
        state.smartPushForce = null;
      }

      // Cases adjacentes que `char` pourrait pousser dès maintenant (adversaire
      // ou couronne libre), pour l'affichage discret au repos une fois le
      // gardien sélectionné. Ne simule aucune poussée : getPushHoverPreview()
      // reste la seule source de vérité pour le calcul réel.
      function pushableTargetsForCharacter(char) {
        if (!char || availableActionCount("PUSH") <= 0) return new Set();
        return new Set(
          orthogonalNeighbors(char.r, char.c)
            .filter(([nr, nc]) => characterAt(nr, nc) || looseArtifactAt(nr, nc))
            .map(([nr, nc]) => key(nr, nc))
        );
      }

      function beginSmartCharacterAction(char) {
        if (!char || char.player !== state.currentPlayer) return;
        state.phase = "SMART_CHAR";
        state.selectedCharId = char.id;
        state.selectedIslandId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        clearMagicPreview();
        clearSmartHover();
        // Le plateau doit montrer, dès la sélection et sans survol, ce que CE
        // gardien peut faire : déplacements accessibles (calcul déjà existant,
        // inchangé) et cibles poussables adjacentes.
        state.reachable = movementRange(char, availableActionCount("MOVE"));
        state.pushOptions = collectUnifiedPushOptions({ pusherId: char.id });
        state.pushHoverOptionId = null;
        state.pushTargetId = null;
        state.smartPushTargets = new Set();
        renderAll();
      }

      function cancelSmartCharacterAction(showMessage = true) {
        if (state.phase !== "SMART_CHAR") return;
        state.phase = "ACTION_SELECT";
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        clearSmartHover();
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        state.reachable = new Set();
        state.smartPushTargets = new Set();
        renderAll();
      }

      function previewSmartCharacterTarget(r, c) {
        const actor = characterById(state.selectedCharId);
        if (!actor) return { type: null, path: [] };

        if (actor.r === r && actor.c === c) {
          return { type: "CANCEL", path: [] };
        }

        const targetChar = characterAt(r, c);
        const targetCrown = looseArtifactAt(r, c);
        const adjacent = Math.abs(actor.r - r) + Math.abs(actor.c - c) === 1;

        if (adjacent && (targetChar || targetCrown) && availableActionCount("PUSH") > 0) {
          return { type: "PUSH", path: [] };
        }

        if (!targetChar && isLand(r, c)) {
          const availableMoves = availableActionCount("MOVE");
          const path = shortestMovementPath(actor, r, c, availableMoves);
          if (path?.length) {
            return { type: "MOVE", path };
          }
        }

        if (targetChar && targetChar.player === state.currentPlayer) {
          return { type: "SWITCH", path: [] };
        }

        return { type: null, path: [] };
      }

      function handleSmartCharacterClick(r, c) {
        const actor = characterById(state.selectedCharId);
        if (!actor) {
          cancelSmartCharacterAction(false);
          return;
        }

        if (actor.r === r && actor.c === c) {
          cancelSmartCharacterAction();
          return;
        }

        const preview = previewSmartCharacterTarget(r, c);
        const clickedChar = characterAt(r, c);
        const clickedCrown = looseArtifactAt(r, c);

        if (preview.type === "PUSH") {
          const options = collectUnifiedPushOptions({
            pusherId: actor.id,
            targetId: clickedChar?.id || clickedCrown?.id || null
          });
          if (!options.length) {
            showToast("Aucune poussée légale vers cette cible.");
            return;
          }
          state.phase = "ACTION";
          state.selectedActionType = "PUSH";
          state.selectedActionCount = 1;
          state.pushOptions = options;
          state.pushTargetId = clickedChar?.id || clickedCrown?.id || null;
          state.pushHoverOptionId = null;
          state.smartHoverType = null;
          state.smartHoverPath = [];
          state.smartPushForce = null;
          state.smartPushTargets = new Set();
          state.reachable = new Set();
          renderAll();
          scheduleKayKitSync();
          return;
        }

        if (preview.type === "MOVE") {
          const cost = preview.path.cost ?? preview.path.length;
          state.phase = "ACTION";
          state.selectedActionType = "MOVE";
          state.selectedActionCount = cost;
          state.actionHoverCell = [r, c];
          state.smartHoverType = null;
          state.smartHoverPath = [];
          state.smartPushTargets = new Set();
          clearUnifiedPushOptions();
          state.reachable = movementRange(actor, cost);
          handleMoveClick(r, c);
          return;
        }

        if (preview.type === "SWITCH" && clickedChar) {
          beginSmartCharacterAction(clickedChar);
          return;
        }

        if (clickedChar) {
          showToast("La poussée nécessite une cible adjacente et une action de poussée disponible.");
        } else if (isLand(r, c)) {
          showToast("Pas assez d’actions de déplacement pour atteindre cette case.");
        } else {
          showToast("Choisissez une case d’île accessible ou une cible adjacente.");
        }
      }

      function setOnlineSetupStatus(message, type = "") {
        const node = document.getElementById("onlineSetupStatus");
        if (!node) return;
        node.textContent = message;
        node.className = `online-setup-status ${type}`.trim();
      }


      async function copyOnlineRoomCode() {
        if (!onlineRoomCode) return;
        try {
          await navigator.clipboard.writeText(onlineRoomCode);
          showToast(`Code ${onlineRoomCode} copié.`);
        } catch (error) {
          const input = document.createElement("textarea");
          input.value = onlineRoomCode;
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
          showToast(`Code ${onlineRoomCode} copié.`);
        }
      }

      function reconnectOnlineNow() {
        if (!state?.onlineMode || onlineConnected) return;
        showToast("Tentative de reconnexion…");
        if (onlineRole === "guest") {
          connectGuestToHost();
        } else {
          try { onlinePeer?.reconnect(); } catch (error) { }
        }
      }

      function updateOnlineBadge() {
        if (!els.onlineBadge) return;
        if (!state?.onlineMode) {
          els.onlineBadge.classList.add("hidden");
          els.onlineTools?.classList.add("hidden");
          return;
        }
        els.onlineTools?.classList.remove("hidden");
        if (els.onlineRoomCodeLabel) els.onlineRoomCodeLabel.textContent = onlineRoomCode || "—";
        if (els.reconnectOnlineBtn) els.reconnectOnlineBtn.disabled = onlineConnected;
        els.onlineBadge.classList.remove("hidden");
        els.onlineBadge.classList.toggle("connected", onlineConnected);
        els.onlineBadge.classList.toggle("waiting", !onlineConnected);
        els.onlineBadge.textContent = onlineConnected
          ? `EN LIGNE · ${onlineRoomCode}`
          : `RECONNEXION · ${onlineRoomCode}`;
      }

      function serializeOnlineState() {
        if (!state) return null;
        return JSON.parse(JSON.stringify({
          ...state,
          reachable: [...(state.reachable || [])],
          fxCells: [],
          inputLocked: false,
          aiThinking: false,
          timerExpiring: false,
          undoHistory: [],
          magicHoverIslandId: null,
          magicHoverPivot: null,
          actionHoverCell: null,
          smartHoverType: null,
          smartHoverPath: [],
          smartPushForce: null,
          smartPushTargets: []
        }));
      }

      function saveOnlineSession() {
        if (!state?.onlineMode || !onlineRole || !onlineRoomCode) return;
        try {
          localStorage.setItem(ONLINE_STORAGE_KEY, JSON.stringify({
            version: 1,
            role: onlineRole,
            roomCode: onlineRoomCode,
            localName: onlineLocalName,
            localPlayerIndex,
            revision: networkRevision,
            savedAt: Date.now(),
            state: serializeOnlineState()
          }));
        } catch (error) {
          console.warn("Sauvegarde de reprise indisponible.", error);
        }
      }

      function clearOnlineSession() {
        try { localStorage.removeItem(ONLINE_STORAGE_KEY); } catch (error) { }
      }

      function closeOnlineNetwork(clearSaved = false) {
        if (onlineReconnectTimer) {
          clearTimeout(onlineReconnectTimer);
          onlineReconnectTimer = null;
        }
        if (onlineSyncTimer) {
          clearTimeout(onlineSyncTimer);
          onlineSyncTimer = null;
        }
        try { onlineConnection?.close(); } catch (error) { }
        try { onlinePeer?.destroy(); } catch (error) { }
        onlineConnection = null;
        onlinePeer = null;
        onlineConnected = false;
        onlineRole = null;
        onlineRoomCode = "";
        localPlayerIndex = null;
        networkApplyingState = false;
        if (clearSaved) clearOnlineSession();
        updateOnlineBadge();
      }

      function sendOnlineMessage(message) {
        if (!onlineConnection?.open) return false;
        try {
          onlineConnection.send(message);
          return true;
        } catch (error) {
          return false;
        }
      }

      function scheduleOnlineSync() {
        if (
          !state?.onlineMode
          || networkApplyingState
          || !onlineConnected
          || state.currentPlayer !== localPlayerIndex
        ) return;

        clearTimeout(onlineSyncTimer);
        onlineSyncTimer = setTimeout(() => {
          if (!state?.onlineMode || !onlineConnected || state.currentPlayer !== localPlayerIndex) return;
          networkRevision = Math.max(networkRevision, state.networkRevision || 0) + 1;
          state.networkRevision = networkRevision;
          const payload = serializeOnlineState();
          sendOnlineMessage({ type: "state", revision: networkRevision, state: payload });
          saveOnlineSession();
        }, 100);
      }


      function forceOnlineSync() {
        if (!state?.onlineMode || networkApplyingState || !onlineConnected) return;
        clearTimeout(onlineSyncTimer);
        networkRevision = Math.max(networkRevision, state.networkRevision || 0) + 1;
        state.networkRevision = networkRevision;
        const payload = serializeOnlineState();
        sendOnlineMessage({ type: "state", revision: networkRevision, state: payload });
        saveOnlineSession();
      }

      function applyOnlineState(incoming, revision = 0) {
        if (!incoming) return;
        if (revision && revision < (networkRevision || 0)) return;

        networkApplyingState = true;
        stopTurnTimer();
        aiRunToken++;

        state = incoming;
        state.onlineMode = true;
        state.soloMode = false;
        state.visualMode = "alternative";
        applyVisualMode(state.visualMode);
        state.players.forEach(player => {
          player.isAI = false;
          player.aiDifficulty = null;
        });
        state.reachable = new Set(incoming.reachable || []);
        state.inputLocked = false;
        state.aiThinking = false;
        state.timerExpiring = false;
        state.fxCells = [];
        state.undoHistory = [];
        state.networkRevision = revision || incoming.networkRevision || 0;
        networkRevision = state.networkRevision;
        // turnDurationSeconds() lit l'état reçu de l'hôte : sans limite, il n'y
        // a ni deadline ni temps restant à recalculer.
        state.turnTimeLeft = state.turnDeadline
          ? Math.max(0, (state.turnDeadline - Date.now()) / 1000)
          : (turnDurationSeconds() || null);

        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        els.gameScreen.classList.remove("ai-turn");
        renderAll();

        if (state.setupSelectionPending) {
          state.inputLocked = true;
          stopTurnTimer();
          openSymmetricSetupOverlay({
            waiting: onlineRole === "guest",
            selectedId: state.startingBoardPreset || "open"
          });
        } else {
          closeSymmetricSetupOverlay();
          startTurnTimer(false);
        }

        networkApplyingState = false;
        updateOnlineBadge();
        saveOnlineSession();
      }

      function attachOnlineConnection(connection) {
        if (onlineConnection && onlineConnection !== connection) {
          try { onlineConnection.close(); } catch (error) { }
        }
        onlineConnection = connection;

        connection.on("open", () => {
          onlineConnected = true;
          updateOnlineBadge();

          if (onlineRole === "guest") {
            sendOnlineMessage({
              type: "hello",
              name: onlineLocalName,
              revision: networkRevision
            });
            sendOnlineMessage({ type: "request-state" });
          } else if (state?.onlineMode) {
            sendOnlineMessage({
              type: "state",
              revision: state.networkRevision || networkRevision,
              state: serializeOnlineState()
            });
          }
          saveOnlineSession();
          renderAll();
          showToast("Connexion en ligne établie.");
        });

        connection.on("data", message => {
          if (!message || typeof message !== "object") return;

          if (message.type === "hello" && onlineRole === "host") {
            if (!state?.onlineMode) {
              createOnlineGame(
                onlineLocalName || "JOUEUR 1",
                String(message.name || "JOUEUR 2").toLocaleUpperCase("fr-FR")
              );
            } else {
              sendOnlineMessage({
                type: "state",
                revision: state.networkRevision || networkRevision,
                state: serializeOnlineState()
              });
            }
            return;
          }

          if (message.type === "request-state" && onlineRole === "host" && state?.onlineMode) {
            sendOnlineMessage({
              type: "state",
              revision: state.networkRevision || networkRevision,
              state: serializeOnlineState()
            });
            return;
          }

          if (message.type === "state") {
            applyOnlineState(message.state, message.revision || 0);
            if (onlineRole === "host") {
              setTimeout(() => forceOnlineSync(), 40);
            }
          }
        });

        connection.on("close", () => {
          onlineConnected = false;
          updateOnlineBadge();
          if (state?.onlineMode) {
            renderAll();
            showToast("Connexion interrompue : la partie est conservée et la reconnexion est automatique.");
            saveOnlineSession();
          }
          if (onlineRole === "guest") scheduleGuestReconnect();
        });

        connection.on("error", error => {
          console.warn("Connexion PeerJS", error);
        });
      }

      function scheduleGuestReconnect() {
        if (onlineReconnectTimer || onlineRole !== "guest") return;
        onlineReconnectTimer = setTimeout(() => {
          onlineReconnectTimer = null;
          connectGuestToHost();
        }, 2800);
      }

      function connectGuestToHost() {
        if (!onlinePeer || onlineRole !== "guest" || !onlineRoomCode) return;
        if (onlineConnection?.open) return;

        const hostId = `ilyos-${onlineRoomCode.toLowerCase()}-host`;
        const connection = onlinePeer.connect(hostId, {
          reliable: true,
          serialization: "json",
          metadata: { roomCode: onlineRoomCode, role: "guest", name: onlineLocalName }
        });
        attachOnlineConnection(connection);
      }

      function initializeOnlinePeer(role, roomCode) {
        if (typeof Peer === "undefined") {
          setOnlineSetupStatus("Le module de connexion n’a pas pu être chargé. Vérifiez votre accès Internet.", "error");
          return;
        }

        closeOnlineNetwork(false);
        onlineRole = role;
        onlineRoomCode = roomCode;
        localPlayerIndex = role === "host" ? 0 : 1;
        const peerId = role === "host" ? `ilyos-${roomCode.toLowerCase()}-host` : undefined;

        onlinePeer = new Peer(peerId, { debug: 1 });

        onlinePeer.on("open", () => {
          if (role === "host") {
            setOnlineSetupStatus(`Salon ${roomCode} créé. Envoyez ce code au deuxième joueur.`, "success");
            showToast(`Salon ${roomCode} prêt : en attente du deuxième joueur.`);
          } else {
            setOnlineSetupStatus(`Connexion au salon ${roomCode}…`);
            connectGuestToHost();
          }
        });

        onlinePeer.on("connection", connection => {
          if (role === "host") attachOnlineConnection(connection);
        });

        onlinePeer.on("disconnected", () => {
          onlineConnected = false;
          updateOnlineBadge();
          setTimeout(() => {
            try { onlinePeer?.reconnect(); } catch (error) { }
          }, 1200);
        });

        onlinePeer.on("error", error => {
          console.warn("PeerJS", error);
          if (error?.type === "unavailable-id" && role === "host") {
            setOnlineSetupStatus("Ce code est déjà utilisé. Choisissez un autre code ou rejoignez la partie.", "error");
          } else if (role === "guest") {
            setOnlineSetupStatus("Salon momentanément indisponible. Nouvelle tentative automatique…", "error");
            scheduleGuestReconnect();
          } else {
            setOnlineSetupStatus("Connexion impossible pour le moment. Réessayez.", "error");
          }
        });
      }

      function makeSymmetricPresetIsland(id, owner, cells) {
        const minR = Math.min(...cells.map(([r]) => r));
        const minC = Math.min(...cells.map(([, c]) => c));
        return {
          id,
          owner,
          anchor: { r: minR, c: minC },
          relCells: cells.map(([r, c]) => [r - minR, c - minC]),
          cells: cells.map(([r, c]) => [r, c])
        };
      }

      function mirrorPresetCells(cells) {
        return cells.map(([r, c]) => [r, GRID - 1 - c]);
      }

      function buildSymmetricPreset(baseIslands, characters) {
        const islands = [];
        let id = 1;

        baseIslands.forEach(cells => {
          islands.push(makeSymmetricPresetIsland(id++, 0, cells));
        });
        baseIslands.forEach(cells => {
          islands.push(makeSymmetricPresetIsland(id++, 1, mirrorPresetCells(cells)));
        });

        return {
          islands,
          characters: [
            ...characters.map((position, index) => ({
              id: `char-0-symmetric-${index}`,
              player: 0,
              r: position[0],
              c: position[1]
            })),
            ...characters.map((position, index) => ({
              id: `char-1-symmetric-${index}`,
              player: 1,
              r: position[0],
              c: GRID - 1 - position[1]
            }))
          ]
        };
      }

      const SYMMETRIC_DUEL_SETUPS = (() => {
        const definitions = {
          scouts: {
            name: "Duel des éclaireurs",
            description: "Seulement quatre îles et un gardien par équipe. Le plateau reste presque entièrement libre : chaque construction et chaque rotation modifient profondément la partie.",
            style: "4 îles • Construction",
            baseIslands: [
              [[0, 1], [1, 1], [1, 2]],
              [[10, 9], [9, 9], [9, 8]]
            ],
            characters: [[0, 0]]
          },

          open: {
            name: "Archipels ouverts",
            description: "Six îles et deux gardiens par équipe. Les routes de départ sont courtes, le centre demeure ouvert et chaque île possède plusieurs rotations possibles.",
            style: "6 îles • Très mobile",
            baseIslands: [
              [[0, 1], [1, 1], [1, 2]],
              [[10, 9], [9, 9], [9, 8]],
              [[4, 2], [4, 3], [5, 3]]
            ],
            characters: [[0, 0], [9, 9]]
          },

          lanes: {
            name: "Grandes passerelles",
            description: "Huit îles forment des axes larges sans fermer les espaces de magie. Deux gardiens permettent de défendre un village tout en progressant vers la couronne.",
            style: "8 îles • Déplacements",
            baseIslands: [
              [[1, 1], [1, 2], [2, 1], [2, 2]],
              [[8, 8], [8, 9], [9, 8], [9, 9]],
              [[3, 3], [3, 4], [4, 3]],
              [[7, 7], [7, 6], [6, 7]]
            ],
            characters: [[1, 1], [9, 9]]
          },

          spiral: {
            name: "Spirale des vents",
            description: "Dix petites îles tournent autour du centre tout en laissant la couronne isolée. Les détours, les sauts de couronne et la magie prennent une place importante.",
            style: "10 îles • Magie",
            baseIslands: [
              [[1, 1], [1, 2], [1, 3]],
              [[9, 9], [9, 8], [9, 7]],
              [[2, 4], [3, 3], [3, 4]],
              [[8, 6], [7, 6], [7, 7]],
              [[5, 2], [5, 3]]
            ],
            characters: [[1, 1], [9, 9]]
          },

          crossroads: {
            name: "Carrefours célestes",
            description: "Dix îles et trois gardiens par équipe. Plusieurs routes alternatives se croisent, mais les intervalles restent assez larges pour faire pivoter les îles en T et les carrés.",
            style: "10 îles • Tactique",
            baseIslands: [
              [[0, 1], [1, 1], [1, 2]],
              [[10, 9], [9, 9], [9, 8]],
              [[2, 3], [2, 4], [3, 3], [3, 4]],
              [[7, 6], [7, 7], [8, 6], [8, 7]],
              [[4, 2], [5, 2], [5, 3], [6, 2]]
            ],
            characters: [[0, 0], [1, 1], [8, 7]]
          },

          orbit: {
            name: "Orbite royale",
            description: "Trois gardiens par équipe, dont un proche du centre. La couronne est contestée rapidement, tandis que les cinq îles de chaque camp conservent des pivots tactiques.",
            style: "10 îles • Offensif",
            baseIslands: [
              [[0, 1], [1, 1], [1, 2]],
              [[10, 9], [9, 9], [9, 8]],
              [[3, 4], [4, 4], [4, 3]],
              [[7, 6], [6, 6], [6, 7]],
              [[2, 1], [3, 1]]
            ],
            characters: [[0, 0], [1, 1], [6, 6]]
          },

          citadels: {
            name: "Citadelles en mouvement",
            description: "Douze îles et quatre gardiens par équipe créent une bataille immédiate. Malgré la densité, chaque archipel garde plusieurs rotations valides et le centre reste libre.",
            style: "12 îles • Grande bataille",
            baseIslands: [
              [[0, 1], [1, 1], [1, 2]],
              [[10, 9], [9, 9], [9, 8]],
              [[2, 2], [2, 3], [3, 2]],
              [[8, 8], [8, 7], [7, 8]],
              [[4, 2], [5, 2], [5, 3]],
              [[6, 2], [6, 3], [7, 3]]
            ],
            characters: [[0, 0], [9, 9], [5, 4], [2, 2]]
          }
        };

        const setups = {};
        Object.entries(definitions).forEach(([id, definition]) => {
          const built = buildSymmetricPreset(
            definition.baseIslands,
            definition.characters
          );

          setups[id] = {
            id,
            name: definition.name,
            description: definition.description,
            style: definition.style,
            islands: built.islands,
            characters: built.characters
          };
        });
        return setups;
      })();
      function resolveSymmetricSetupId(setupId) {
        return SYMMETRIC_DUEL_SETUPS[setupId] ? setupId : "open";
      }

      function populateSymmetricSetupOverlay(selectedId = "open") {
        if (!els.symmetricSetupSelect) return;

        els.symmetricSetupSelect.innerHTML = symmetricSetupOptionsHTML();
        els.symmetricSetupSelect.value = resolveSymmetricSetupId(selectedId);
        renderSymmetricSetupPreview(els.symmetricSetupSelect.value);
      }

      function openSymmetricSetupOverlay({ waiting = false, selectedId = "open" } = {}) {
        if (!els.symmetricSetupOverlay) return;

        populateSymmetricSetupOverlay(selectedId);
        els.symmetricSetupSelect.disabled = waiting;
        els.randomSymmetricSetupBtn.disabled = waiting;
        els.confirmSymmetricSetupBtn.disabled = waiting;
        els.confirmSymmetricSetupBtn.textContent = waiting
          ? "En attente du créateur"
          : "Lancer ce setup";
        els.symmetricSetupWaiting.classList.toggle("hidden", !waiting);

        els.symmetricSetupOverlay.classList.remove("hidden");
        void els.symmetricSetupOverlay.offsetWidth;
        els.symmetricSetupOverlay.classList.add("visible");
      }

      function closeSymmetricSetupOverlay() {
        if (!els.symmetricSetupOverlay) return;
        els.symmetricSetupOverlay.classList.remove("visible");
        setTimeout(() => {
          if (!state?.setupSelectionPending) {
            els.symmetricSetupOverlay.classList.add("hidden");
          }
        }, 220);
      }

      function chooseRandomSymmetricSetup() {
        const ids = Object.keys(SYMMETRIC_DUEL_SETUPS);
        if (!ids.length || !els.symmetricSetupSelect) return;

        const current = els.symmetricSetupSelect.value;
        const pool = ids.filter(id => id !== current);
        const selected = (pool.length ? pool : ids)[
          Math.floor(Math.random() * (pool.length ? pool.length : ids.length))
        ];

        els.symmetricSetupSelect.value = selected;
        renderSymmetricSetupPreview(selected);
        els.randomSymmetricSetupBtn.classList.remove("random-picked");
        void els.randomSymmetricSetupBtn.offsetWidth;
        els.randomSymmetricSetupBtn.classList.add("random-picked");
      }

      function confirmSymmetricSetup() {
        if (!state || !state.setupSelectionPending) return;
        if (state.onlineMode && onlineRole === "guest") return;

        const setupId = resolveSymmetricSetupId(
          els.symmetricSetupSelect?.value || "open"
        );

        applyStartingBoardMode("symmetric", setupId);
        state.startingBoardPreset = setupId;
        // Options personnalisées : seul le duel symétrique les propose — le
        // classique reste figé sans dissolution et sans limite (voir la
        // valeur par défaut posée à la création de state).
        state.rules = {
          allowDissolve: !!els.symmetricAllowDissolveCheckbox?.checked,
          /* Le sélecteur du duel symétrique pilote désormais le stock de
              CHAQUE forme, et non plus un total d'îles. islandLimitPerPlayer
              reste à 0 : la règle du plafond total existe toujours dans le
              moteur (islandLimitReachedForPlayer) mais plus aucun écran ne la
              règle — la retirer serait un chantier séparé. */
          islandLimitPerPlayer: 0,
          shapeLimitPerOwner: Number(els.symmetricIslandLimitSelect?.value ?? SHAPE_LIMIT_PER_OWNER_DEFAULT) || 0
        };
        state.setupSelectionPending = false;
        state.inputLocked = false;
        closeSymmetricSetupOverlay();

        beginTurn();
        startAmbient();
        playSfx("turn");

        if (state.onlineMode) {
          forceOnlineSync();
        }
      }

      function applyStartingBoardMode(mode, setupId = "open") {
        if (!state || mode !== "symmetric" || state.players.length !== 2) {
          if (state) {
            state.startingBoardMode = "classic";
            state.startingBoardPreset = null;
          }
          return;
        }

        const resolvedId = resolveSymmetricSetupId(setupId);
        const setup = SYMMETRIC_DUEL_SETUPS[resolvedId];

        state.startingBoardMode = "symmetric";
        state.startingBoardPreset = resolvedId;
        state.islands = setup.islands.map((island, index) => ({
          ...island,
          // Marqueur indispensable pour islandCountForOwner : ces îles appartiennent
          // déjà à un joueur alors qu'il ne les a pas posées. Sans lui, la limite
          // d'îles par joueur les comptait et le Duel symétrique démarrait DÉJÀ à la
          // limite — plus aucune pose n'était possible de toute la partie.
          fromSetup: true,
          anchor: { ...island.anchor },
          relCells: island.relCells.map(([r, c]) => [r, c]),
          cells: island.cells.map(([r, c]) => [r, c]),
          visualVariant: Number.isInteger(island.visualVariant)
            ? island.visualVariant
            : index % ISLAND_VISUAL_VARIANTS.length
        }));
        state.characters = setup.characters.map(character => ({ ...character }));
        state.nextIslandId = Math.max(...state.islands.map(island => island.id)) + 1;
        state.nextCharId = 200;
      }

      function createOnlineGame(hostName, guestName) {
        stopTurnTimer();
        aiRunToken++;

        const names = [
          String(hostName || "JOUEUR 1").toLocaleUpperCase("fr-FR"),
          String(guestName || "JOUEUR 2").toLocaleUpperCase("fr-FR")
        ];
        const villageAssignments = getVillageAssignments(2);

        const players = names.map((name, i) => {
          const villages = villageAssignments[i].map(village => ({ ...village }));
          return {
            id: i,
            name,
            color: PLAYER_COLORS[i],
            icon: PLAYER_ICONS[i],
            isAI: false,
            aiDifficulty: null,
            village: { ...villages[0] },
            villages,
            score: 0,
            deck: createDeck(i),
            discard: [],
            hand: [],
            stash: { MOVE: 0, PUSH: 0, MAGIC: 0 }
          };
        });

        state = {
          players,
          soloMode: false,
          onlineMode: true,
          visualMode: pendingVisualMode,
          startingBoardMode: pendingOnlineStartingBoard,
          startingBoardPreset: null,
          turnDurationSeconds: pendingOnlineTurnDuration,
          setupSelectionPending: pendingOnlineStartingBoard === "symmetric",
          aiDifficulty: null,
          networkRevision: 0,
          currentPlayer: 0,
          round: 1,
          turn: 1,
          islands: [],
          // Même règle qu'en local (voir startGame) : plateau classique = aucun
          // gardien de départ, le premier est invoqué avec la première île.
          characters: pendingOnlineStartingBoard === "classic"
            ? []
            : players.map((player, index) => ({
              id: `char-${index}-start`,
              player: index,
              r: player.village.r,
              c: player.village.c
            })),
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          rules: { allowDissolve: false, islandLimitPerPlayer: 0 },
          islandPlacedThisTurn: false,
          centerCrownTakenThisTurn: false,
          treasureDropFromId: null,
          crownPickupCell: null,
          crownStealTargetId: null,
          aiCrownMemory: {},
          crownPickupArtifactId: null,
          treasureDropArtifactId: null,
          crownTransferTargetIds: [],
          selectedIslandShape: null,
          placementCells: null,
          placementOriginIndex: 0,
          placementRotationSteps: 0,
          hoverAnchor: null,
          pendingSpawnIslandId: null,
          fxCells: [],
          inputLocked: false,
          aiThinking: false,
          timerExpiring: false,
          turnTimeLeft: null,
          turnDeadline: null,
          selectedActionCardId: null,
          selectedActionType: null,
          selectedActionCount: 1,
          pushForceChoice: 1,
          selectedCharId: null,
          selectedIslandId: null,
          selectedMagicPivot: null,
          magicPreviewDirection: 0,
          magicPreviewSteps: 0,
          magicPreviewCells: null,
          magicPreviewValid: false,
          magicHoverIslandId: null,
          magicHoverPivot: null,
          actionHoverCell: null,
          smartHoverType: null,
          smartHoverPath: [],
          smartPushForce: null,
          smartPushTargets: new Set(),
          pushOptions: [],
          pushHoverOptionId: null,
          pushTargetId: null,
          pendingDirectMoveTarget: null,
          reachable: new Set(),
          nextIslandId: 1,
          nextCharId: 100,
          undoHistory: [],
          winner: null
        };

        applyVisualMode(state.visualMode);
        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        startAmbient();
        showAlternativeIntro();

        if (pendingOnlineStartingBoard === "symmetric") {
          state.phase = "SETUP_SELECT";
          state.inputLocked = true;
          renderAll();
          openSymmetricSetupOverlay({
            waiting: onlineRole === "guest",
            selectedId: "open"
          });
          forceOnlineSync();
        } else {
          beginTurn();
          playSfx("turn");
        }

        saveOnlineSession();
      }

      function startOnlineFromSetup() {
        const name = ([...els.playersForm.querySelectorAll(".player-name")][0]?.value.trim() || "JOUEUR 1")
          .toLocaleUpperCase("fr-FR");
        const role = document.getElementById("onlineRoleSelect")?.value || "host";
        const input = document.getElementById("onlineRoomInput");
        let roomCode = sanitizeRoomCode(input?.value);

        if (role === "host" && !roomCode) {
          roomCode = generateRoomCode();
          if (input) input.value = roomCode;
        }
        if (role === "host" && roomCode.length < 4) {
          roomCode = generateRoomCode();
          if (input) input.value = roomCode;
        }
        if (role === "guest" && roomCode.length < 4) {
          setOnlineSetupStatus("Saisissez un code de partie valide.", "error");
          return;
        }

        onlineLocalName = name;
        pendingOnlineStartingBoard = role === "host"
          ? (document.getElementById("startingBoardSelect")?.value || "classic")
          : "classic";
        // L'invité reçoit l'état complet de l'hôte : il n'impose pas sa propre
        // durée de tour, sinon les deux camps décompteraient différemment.
        pendingOnlineTurnDuration = role === "host" ? selectedTurnDurationSeconds() : 0;
        pendingOnlineStartingPreset = "open";
        initializeOnlinePeer(role, roomCode);
        els.startBtn.disabled = true;
        els.altStartBtn.disabled = true;
        setTimeout(() => {
          els.startBtn.disabled = false;
          els.altStartBtn.disabled = false;
        }, 1200);
      }

      function resumeOnlineSession(saved) {
        if (!saved) return;
        onlineLocalName = saved.localName || "JOUEUR";
        onlineRole = saved.role;
        onlineRoomCode = saved.roomCode;
        localPlayerIndex = Number.isInteger(saved.localPlayerIndex)
          ? saved.localPlayerIndex
          : saved.role === "host" ? 0 : 1;
        networkRevision = saved.revision || saved.state?.networkRevision || 0;

        if (saved.state) {
          applyOnlineState(saved.state, networkRevision);
        }
        initializeOnlinePeer(saved.role, saved.roomCode);
        showToast(`Reprise de la partie ${saved.roomCode}…`);
      }

      function startLocalGame() {
        clearLocalSession();
        stopTurnTimer();
        aiRunToken++;

        const selectedMode = Number(els.playerCount.value);
        const soloMode = selectedMode === 1;
        const aiDifficulty = document.getElementById("aiDifficultySelect")?.value || "normal";
        const startingBoardMode = document.getElementById("startingBoardSelect")?.value || "classic";
        const startingBoardPreset = null;
        const turnDurationChoice = selectedTurnDurationSeconds();
        const humanNames = [...els.playersForm.querySelectorAll(".player-name")]
          .map((input, i) => (input.value.trim() || `Joueur ${i + 1}`).toLocaleUpperCase("fr-FR"));
        const names = soloMode ? [...humanNames, "ORDINATEUR"] : humanNames;
        const count = names.length;
        const villageAssignments = getVillageAssignments(count);
        const startingPlayerIndex = Math.floor(Math.random() * count);

        const players = names.map((name, i) => {
          const villages = villageAssignments[i].map(village => ({ ...village }));
          return {
            id: i,
            name,
            color: PLAYER_COLORS[i],
            icon: PLAYER_ICONS[i],
            isAI: soloMode && i === 1,
            aiDifficulty: soloMode && i === 1 ? aiDifficulty : null,
            village: { ...villages[0] },
            villages,
            score: 0,
            deck: createDeck(i),
            discard: [],
            hand: [],
            stash: { MOVE: 0, PUSH: 0, MAGIC: 0 }
          };
        });

        // Plateau classique : on démarre sans aucun gardien. Le premier tour
        // impose déjà de poser une île, ce qui déclenche l'invocation — chaque
        // équipe obtient donc son premier gardien dès son premier tour, à
        // l'endroit qu'elle choisit plutôt que d'office sur son village.
        // Le mode symétrique, lui, remplace entièrement state.characters via
        // confirmSymmetricSetup() : il n'est pas concerné.
        const characters = startingBoardMode === "classic"
          ? []
          : players.map((p, i) => ({
            id: `char-${i}-start`,
            player: i,
            r: p.village.r,
            c: p.village.c
          }));

        state = {
          players,
          soloMode,
          onlineMode: false,
          visualMode: pendingVisualMode,
          startingBoardMode,
          startingBoardPreset,
          turnDurationSeconds: turnDurationChoice,
          setupSelectionPending: startingBoardMode === "symmetric",
          aiDifficulty,
          currentPlayer: startingPlayerIndex,
          round: 1,
          turn: 1,
          islands: [],
          characters,
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          // Règles optionnelles : jamais activées en classique. Le duel
          // symétrique peut les personnaliser via confirmSymmetricSetup().
          rules: { allowDissolve: false, islandLimitPerPlayer: 0 },
          islandPlacedThisTurn: false,
          centerCrownTakenThisTurn: false,
          treasureDropFromId: null,
          crownPickupCell: null,
          selectedIslandShape: null,
          placementCells: null,
          placementOriginIndex: 0,
          placementRotationSteps: 0,
          hoverAnchor: null,
          pendingSpawnIslandId: null,
          fxCells: [],
          inputLocked: false,
          aiThinking: false,
          timerExpiring: false,
          turnTimeLeft: null,
          turnDeadline: null,
          selectedActionCardId: null,
          selectedActionType: null,
          selectedActionCount: 1,
          pushForceChoice: 1,
          crownStealTargetId: null,
          aiCrownMemory: {},
          crownPickupArtifactId: null,
          treasureDropArtifactId: null,
          crownTransferTargetIds: [],
          selectedCharId: null,
          selectedIslandId: null,
          selectedMagicPivot: null,
          magicPreviewDirection: 0,
          magicPreviewSteps: 0,
          magicPreviewCells: null,
          magicPreviewValid: false,
          magicHoverIslandId: null,
          magicHoverPivot: null,
          actionHoverCell: null,
          smartHoverType: null,
          smartHoverPath: [],
          smartPushForce: null,
          smartPushTargets: new Set(),
          pushOptions: [],
          pushHoverOptionId: null,
          pushTargetId: null,
          pendingDirectMoveTarget: null,
          reachable: new Set(),
          nextIslandId: 1,
          nextCharId: 100,
          undoHistory: [],
          winner: null
        };

        applyVisualMode(state.visualMode);
        els.setupScreen.classList.add("hidden");
        els.gameScreen.classList.remove("hidden");
        startAmbient();
        showAlternativeIntro();

        if (startingBoardMode === "symmetric") {
          state.phase = "SETUP_SELECT";
          state.inputLocked = true;
          renderAll();
          openSymmetricSetupOverlay({ selectedId: "open" });
        } else {
          beginTurn();
          playSfx("turn");
        }
      }


      function startGame() {
        if (String(els.playerCount.value) === "online") {
          startOnlineFromSetup();
          return;
        }
        closeOnlineNetwork(false);
        startLocalGame();
      }


      function applyVisualMode(mode = "alternative") {
        const resolved = "alternative";
        document.body.dataset.visualMode = resolved;
        els.gameScreen.dataset.visualMode = resolved;
        if (state) state.visualMode = resolved;
        requestAnimationFrame(() => {
          initKayKit3D();
          resizeKayKit3D();
          scheduleKayKitSync();
        });
      }

      function showAlternativeIntro() {
        if (!els.altModeIntro || state?.visualMode !== "alternative") return;

        els.altModeIntro.classList.remove("hidden", "visible");
        void els.altModeIntro.offsetWidth;
        els.altModeIntro.classList.add("visible");

        clearTimeout(showAlternativeIntro.timer);
        showAlternativeIntro.timer = setTimeout(() => {
          els.altModeIntro.classList.remove("visible");
          setTimeout(() => els.altModeIntro.classList.add("hidden"), 420);
        }, 1450);
      }

      function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      function showTurnRibbon(player) {
        if (!els.turnRibbon || !player) return;

        els.turnRibbonPortrait.textContent = player.icon || "🧙";
        els.turnRibbonPortrait.style.setProperty("--pcolor", player.color || "#fff");
        els.turnRibbonName.textContent = player.name || "Joueur";
        els.turnRibbonMeta.textContent = `Tour ${state.turn} • Manche ${state.round}`;

        clearTimeout(showTurnRibbon.hideTimer);
        clearTimeout(showTurnRibbon.removeTimer);

        els.turnRibbon.classList.remove("hidden", "visible");
        void els.turnRibbon.offsetWidth;
        els.turnRibbon.classList.add("visible");

        showTurnRibbon.hideTimer = setTimeout(() => {
          els.turnRibbon.classList.remove("visible");
          showTurnRibbon.removeTimer = setTimeout(() => {
            els.turnRibbon.classList.add("hidden");
          }, 260);
        }, 960);
      }

      function triggerScoreAnimation(playerId) {
        if (!state) return;
        state.scoreAnimationPlayerId = playerId;
        renderScores();

        clearTimeout(triggerScoreAnimation.timer);
        triggerScoreAnimation.timer = setTimeout(() => {
          if (!state) return;
          state.scoreAnimationPlayerId = null;
          renderScores();
        }, 1000);
      }

      function isCurrentPlayerAI() {
        return !!state?.players?.[state.currentPlayer]?.isAI;
      }

      function stopTurnTimer() {
        if (turnTimerInterval) {
          clearInterval(turnTimerInterval);
          turnTimerInterval = null;
        }
      }

      // 0 (ou absent) = partie sans limite de temps, le cas par défaut.
      // Les sauvegardes/parties d'avant cette option n'ont pas le champ : elles
      // retombent donc naturellement sur "pas de chrono".
      function turnDurationSeconds() {
        const value = Number(state?.turnDurationSeconds);
        return Number.isFinite(value) && value > 0 ? value : 0;
      }

      function isTurnTimerEnabled() {
        return turnDurationSeconds() > 0;
      }

      function updateTurnTimerDisplay() {
        if (!els.turnTimer || !state) return;
        // Sans limite de temps, la pastille n'a rien à afficher : on la retire
        // du bandeau plutôt que d'y laisser un compteur figé.
        els.turnTimer.classList.toggle("hidden", !isTurnTimerEnabled());
        if (!isTurnTimerEnabled()) {
          els.turnTimer.classList.remove("warning", "danger");
          return;
        }
        const seconds = Math.max(0, Math.ceil(state.turnTimeLeft ?? turnDurationSeconds()));
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        els.turnTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
        els.turnTimer.classList.toggle("warning", seconds <= 30 && seconds > 10);
        els.turnTimer.classList.toggle("danger", seconds <= 10);
      }

      function startTurnTimer(resetDeadline = true) {
        stopTurnTimer();
        if (!state || state.winner !== null) return;

        if (!isTurnTimerEnabled()) {
          state.turnDeadline = null;
          state.turnTimeLeft = null;
          state.timerExpiring = false;
          updateTurnTimerDisplay();
          return;
        }

        const duration = turnDurationSeconds();
        if (resetDeadline || !state.turnDeadline) {
          state.turnTimeLeft = duration;
          state.turnDeadline = Date.now() + duration * 1000;
        } else {
          state.turnTimeLeft = Math.max(0, (state.turnDeadline - Date.now()) / 1000);
        }
        state.timerExpiring = false;
        updateTurnTimerDisplay();

        turnTimerInterval = setInterval(() => {
          if (!state || state.winner !== null) {
            stopTurnTimer();
            return;
          }

          state.turnTimeLeft = Math.max(0, (state.turnDeadline - Date.now()) / 1000);
          updateTurnTimerDisplay();

          if (state.turnTimeLeft <= 0) {
            if (state.onlineMode && !canLocalPlayerAct()) {
              updateTurnTimerDisplay();
              return;
            }
            stopTurnTimer();
            handleTurnTimeout();
          }
        }, 250);
      }

      async function handleTurnTimeout() {
        if (!state || state.winner !== null || state.timerExpiring) return;
        state.timerExpiring = true;
        aiRunToken++;
        state.aiThinking = false;
        state.inputLocked = true;
        els.gameScreen.classList.remove("ai-turn");
        showToast("Temps écoulé : le tour va se terminer automatiquement.");

        if (!state.islandPlacedThisTurn) {
          createAutomaticIslandAndSpawn(state.currentPlayer, true);
          await sleep(520);
        }

        state.phase = "ACTION_SELECT";
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.pushForceChoice = 1;
        state.crownStealTargetId = null;
        state.aiCrownMemory = {};
        state.crownPickupArtifactId = null;
        state.treasureDropArtifactId = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.pendingSpawnIslandId = null;
        state.treasureDropFromId = null;
        state.treasureDropArtifactId = null;
        state.crownTransferTargetIds = [];
        state.crownPickupCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        state.actionHoverCell = null;
        clearMagicPreview();
        state.reachable = new Set();
        state.inputLocked = false;
        renderAll();

        await sleep(480);
        if (state && state.winner === null) endTurn(true);
      }

      function automaticPlacementTarget(playerId) {
        const player = state.players[playerId];
        const ownCharacters = state.characters.filter(char => char.player === playerId);
        const ownCarrier = ownCharacters.find(char => characterCarriesCrown(char.id));

        // Défense prioritaire : un porteur adverse tout proche de SA PROPRE
        // zone de validation marquera au début de son prochain tour. Sans ce
        // garde-fou, la pose d'île obligatoire suivait toujours d'abord la
        // progression de notre propre porteur ou une couronne libre — l'IA
        // "oubliait" donc de placer une île (et le nouveau gardien qui va
        // avec) pour aller contester ce point pendant qu'elle poursuivait son
        // propre objectif. Ignoré si un de nos gardiens est déjà assez près
        // pour intervenir ce tour-ci sans aide d'une nouvelle île.
        if (aiConfig().crownTactics >= 2) {
          const urgentCarrier = state.characters.find(char => {
            if (char.player === playerId || !characterCarriesCrown(char.id)) return false;
            const owner = state.players[char.player];
            return aiValidationDistanceForPlayer(owner, char.r, char.c) <= 2;
          });
          if (urgentCarrier) {
            const alreadyClose = ownCharacters.some(char =>
              Math.abs(char.r - urgentCarrier.r) + Math.abs(char.c - urgentCarrier.c) <= 3
            );
            if (!alreadyClose) return [urgentCarrier.r, urgentCarrier.c];
          }
        }

        if (ownCarrier) {
          const validationCells = crownValidationCellsForPlayer(player);
          return [...validationCells].sort((a, b) =>
            (Math.abs(ownCarrier.r - a[0]) + Math.abs(ownCarrier.c - a[1])) -
            (Math.abs(ownCarrier.r - b[0]) + Math.abs(ownCarrier.c - b[1]))
          )[0];
        }

        const looseCrowns = activeArtifacts().filter(artifact => artifact.carrierId === null);
        if (looseCrowns.length) {
          looseCrowns.sort((a, b) => {
            const distanceA = ownCharacters.length
              ? Math.min(...ownCharacters.map(char => Math.abs(char.r - a.r) + Math.abs(char.c - a.c)))
              : Math.abs(a.r - CENTER.r) + Math.abs(a.c - CENTER.c);
            const distanceB = ownCharacters.length
              ? Math.min(...ownCharacters.map(char => Math.abs(char.r - b.r) + Math.abs(char.c - b.c)))
              : Math.abs(b.r - CENTER.r) + Math.abs(b.c - CENTER.c);
            return distanceA - distanceB;
          });
          return [looseCrowns[0].r, looseCrowns[0].c];
        }

        const opponentCarrier = activeArtifacts()
          .map(artifact => characterById(artifact.carrierId))
          .find(carrier => carrier && carrier.player !== playerId);
        if (opponentCarrier) return [opponentCarrier.r, opponentCarrier.c];

        const village = villagesForPlayer(player)[0] || CENTER;
        return [village.r, village.c];
      }

      function findAutomaticIslandPlacement(playerId) {
        const player = state.players[playerId];
        const target = automaticPlacementTarget(playerId);
        const ownCharacters = state.characters.filter(char => char.player === playerId);
        const ownCarrier = ownCharacters.find(char => characterCarriesCrown(char.id));
        const ownValidationCells = crownValidationCellsForPlayer(player);
        const opponents = state.players.filter(other => other.id !== playerId);
        const enemyValidationKeys = new Set(
          opponents.flatMap(other =>
            crownValidationCellsForPlayer(other).map(([r, c]) => key(r, c))
          )
        );
        const candidates = [];

        Object.entries(SHAPES).forEach(([shapeKey, shape]) => {
          // Stock par forme (voir shapeLimitPerOwner, js/game/bootstrap.js) : l'IA
          // respecte la même limite que le joueur humain, sinon elle
          // continuerait à spammer sa forme préférée sans restriction.
          const limiteForme = shapeLimitPerOwner();
          if (limiteForme && shapeUsageCountForOwner(playerId, shapeKey) >= limiteForme) return;
          let rotated = normalizeShape(shape.cells);
          const seen = new Set();

          for (let rotation = 0; rotation < 4; rotation++) {
            const signature = rotated.map(([r, c]) => `${r},${c}`).sort().join("|");

            if (!seen.has(signature)) {
              seen.add(signature);
              const height = Math.max(...rotated.map(([r]) => r)) + 1;
              const width = Math.max(...rotated.map(([, c]) => c)) + 1;

              for (let r = 0; r <= GRID - height; r++) {
                for (let c = 0; c <= GRID - width; c++) {
                  const cells = rotated.map(([dr, dc]) => [r + dr, c + dc]);
                  if (cells.some(([cr, cc]) => isLand(cr, cc))) continue;

                  const targetDistance = Math.min(
                    ...cells.map(([cr, cc]) => Math.abs(cr - target[0]) + Math.abs(cc - target[1]))
                  );
                  const characterDistance = ownCharacters.length
                    ? Math.min(
                      ...cells.flatMap(([cr, cc]) =>
                        ownCharacters.map(char => Math.abs(cr - char.r) + Math.abs(cc - char.c))
                      )
                    )
                    : 5;
                  const centerDistance = Math.min(
                    ...cells.map(([cr, cc]) => Math.abs(cr - CENTER.r) + Math.abs(cc - CENTER.c))
                  );
                  const contacts = aiExternalLandContacts(cells);
                  const ownZoneCells = cells.filter(([cr, cc]) =>
                    ownValidationCells.some(([vr, vc]) => vr === cr && vc === cc)
                  ).length;
                  const enemyZoneCells = cells.filter(([cr, cc]) =>
                    enemyValidationKeys.has(key(cr, cc))
                  ).length;

                  let carrierBridge = 0;
                  if (ownCarrier) {
                    const nearCarrier = Math.min(
                      ...cells.map(([cr, cc]) => Math.abs(cr - ownCarrier.r) + Math.abs(cc - ownCarrier.c))
                    );
                    const nearValidation = Math.min(
                      ...cells.flatMap(([cr, cc]) =>
                        ownValidationCells.map(([vr, vc]) => Math.abs(cr - vr) + Math.abs(cc - vc))
                      )
                    );
                    carrierBridge = nearCarrier + nearValidation;
                  }

                  // La connectivité au reste du terrain (contacts) n'a plus
                  // qu'un poids mineur : combler systématiquement les trous
                  // n'apporte rien de tactique en soi, et un terrain plus
                  // morcelé peut même gêner l'adversaire (accès imprévisible,
                  // moins de raccourcis). Seul un très léger tiebreaker
                  // subsiste pour éviter un semis totalement erratique.
                  let score =
                    targetDistance * 1.55
                    + characterDistance * .38
                    + centerDistance * .10
                    + (ownCarrier ? carrierBridge * .52 : 0)
                    - Math.min(contacts, 3) * .4
                    - ownZoneCells * (ownCarrier ? 7.5 : 3.2)
                    + enemyZoneCells * 4.4
                    + Math.random() * aiConfig().randomness;

                  candidates.push({
                    shapeKey,
                    relCells: cloneCells(rotated),
                    cells,
                    anchor: { r, c },
                    score
                  });
                }
              }
            }

            rotated = rotateCells(rotated, 1, true);
          }
        });

        candidates.sort((a, b) => a.score - b.score);
        const cfg = aiConfig();
        const shortlist = candidates.slice(
          0,
          Math.min(cfg.placementShortlist, candidates.length)
        );

        return shortlist.length
          ? shortlist[Math.floor(Math.random() * shortlist.length)]
          : null;
      }

      function createAutomaticIslandAndSpawn(playerId, fromTimeout = false) {
        if (!state || state.islandPlacedThisTurn) return null;
        const placement = findAutomaticIslandPlacement(playerId);

        if (!placement) {
          state.islandPlacedThisTurn = true;
          state.phase = "ACTION_SELECT";
          return null;
        }

        const islandId = state.nextIslandId++;
        const island = {
          id: islandId,
          owner: playerId,
          shapeKey: placement.shapeKey,
          anchor: { ...placement.anchor },
          relCells: cloneCells(placement.relCells),
          cells: cloneCells(placement.cells),
          visualVariant: chooseIslandVisualVariant(placement.cells, islandId, state.islands)
        };
        state.islands.push(island);
        // Même matérialisation pour les poses de l'IA que pour celles du joueur.
        playIslandDrop(island.id);
        state.islandPlacedThisTurn = true;

        let spawn = null;

        if (canCreateGuardian(playerId)) {
          const target = automaticPlacementTarget(playerId);
          const freeCells = island.cells.filter(([r, c]) => !characterAt(r, c));
          freeCells.sort((a, b) =>
            (Math.abs(a[0] - target[0]) + Math.abs(a[1] - target[1])) -
            (Math.abs(b[0] - target[0]) + Math.abs(b[1] - target[1]))
          );
          spawn = freeCells[0] || island.cells[0];

          const char = {
            id: `char-${state.nextCharId++}`,
            player: playerId,
            r: spawn[0],
            c: spawn[1]
          };
          state.characters.push(char);
          resolveArtifactForCharacter(char);
        }

        state.phase = "ACTION_SELECT";
        state.pendingSpawnIslandId = null;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        clearMagicPreview();
        state.reachable = new Set();
        renderAll();
        animateIslandArrival(island);
        if (spawn) {
          animateCellPulse(spawn[0], spawn[1], "spawn-arrival");
        }
        playSfx("island");

        if (fromTimeout) {
          showToast(
