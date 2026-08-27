 function replay() {
        els.victoryModal.classList.add("hidden");
        els.victoryModal.classList.remove("victory-visible");
        if (state?.onlineMode) {
          clearOnlineSession();
          resetToSetup();
          els.playerCount.value = "online";
          renderSetupFields();
          return;
        }
        startGame();
      }

      applyVisualMode("alternative");

      els.playerCount.addEventListener("change", renderSetupFields);
      els.symmetricSetupSelect?.addEventListener("change", () => {
        renderSymmetricSetupPreview(els.symmetricSetupSelect.value);
      });
      els.randomSymmetricSetupBtn?.addEventListener("click", chooseRandomSymmetricSetup);
      els.confirmSymmetricSetupBtn?.addEventListener("click", confirmSymmetricSetup);


      function collectIlyosDiagnosticReport() {
        const canvas = kaykit3D?.canvas;
        const board = els.boardWrap;
        const game = els.gameScreen;
        const rectOf = node => node?.getBoundingClientRect?.() || null;
        const canvasRect = rectOf(canvas);
        const boardRect = rectOf(board);
        const topbarRect = rectOf(game?.querySelector?.('.topbar'));
        const visible = node => {
          if (!node) return false;
          const r = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 1 && r.height > 1;
        };
        const intersects = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
        const candidates = [...new Set(document.querySelectorAll('.topbar,.banner-panel,.kaykit-controls,.kaykit-status'))].filter(visible);
        const overlaps = [];
        for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i], b = candidates[j], ar = rectOf(a), br = rectOf(b);
          const overlapW = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
          const overlapH = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
          const meaningful = overlapW * overlapH > 180;
          if (meaningful && intersects(ar, br) && !a.contains(b) && !b.contains(a)) overlaps.push(`${a.className} ↔ ${b.className}`);
        }
        const outside = candidates.filter(node => {
          const r = rectOf(node); return r.left < -2 || r.top < -2 || r.right > innerWidth + 2 || r.bottom > innerHeight + 2;
        }).map(node => String(node.className));
        return {
          build: window.ILYOS_BUILD || 'inconnue',
          url: location.href,
          viewport: `${innerWidth} × ${innerHeight}`,
          preset: state?.startingBoardPreset || null,
          phase: state?.phase || null,
          islands: state?.islands?.length || 0,
          characters: state?.characters?.length || 0,
          canvas: canvasRect ? `${Math.round(canvasRect.width)} × ${Math.round(canvasRect.height)}` : 'absent',
          board: boardRect ? `${Math.round(boardRect.width)} × ${Math.round(boardRect.height)}` : 'absent',
          canvasInsideBoard: !!(canvasRect && boardRect && canvasRect.left >= boardRect.left - 2 && canvasRect.right <= boardRect.right + 2 && canvasRect.top >= boardRect.top - 2 && canvasRect.bottom <= boardRect.bottom + 2),
          topbarHeight: topbarRect ? Math.round(topbarRect.height) : 0,
          kaykitLoaded: kaykit3D?.loadedCount || 0,
          kaykitTotal: kaykit3D?.totalAssets || 0,
          failedAssets: [...(kaykit3D?.failedAssets || [])],
          overlaps,
          outside
        };
      }

      function showIlyosDiagnosticPanel() {
        document.querySelector('.ilyos-diagnostic-panel')?.remove();
        const report = collectIlyosDiagnosticReport();
        const panel = document.createElement('aside');
        panel.className = 'ilyos-diagnostic-panel';
        const line = (label, value, status = 'ok') => `<p class="${status}"><strong>${label} :</strong> ${value}</p>`;
        panel.innerHTML = `<h3>Diagnostic ILYOS ${report.build}</h3>` +
          line('Scénario', `${report.preset || '—'} · ${report.phase || '—'}`, report.preset === 'spiral' ? 'ok' : 'bad') +
          line('Plateau', `${report.board} · Canvas ${report.canvas}`, report.canvasInsideBoard ? 'ok' : 'bad') +
          line('KayKit', `${report.kaykitLoaded}/${report.kaykitTotal} modèles`, report.failedAssets.length ? 'warn' : 'ok') +
          line('Chevauchements', report.overlaps.length ? report.overlaps.join('<br>') : 'aucun détecté', report.overlaps.length ? 'warn' : 'ok') +
          line('Hors écran', report.outside.length ? report.outside.join('<br>') : 'aucun', report.outside.length ? 'bad' : 'ok') +
          `<button type="button" data-refresh-diagnostic>Actualiser</button> <button type="button" data-close-diagnostic>Fermer</button>`;
        document.body.appendChild(panel);
        panel.querySelector('[data-refresh-diagnostic]')?.addEventListener('click', showIlyosDiagnosticPanel);
        panel.querySelector('[data-close-diagnostic]')?.addEventListener('click', () => panel.remove());
        window.__ILYOS_DIAGNOSTIC_REPORT = report;
        console.info('[ILYOS DIAGNOSTIC]', report);
        return report;
      }

      function launchIlyosSpiralDiagnostic() {
        document.body.classList.add('ilyos-diagnostic-mode');
        pendingVisualMode = 'alternative';
        els.playerCount.value = '2';
        els.playerCount.dispatchEvent(new Event('change', { bubbles: true }));
        const boardSelect = document.getElementById('startingBoardSelect');
        if (boardSelect) boardSelect.value = 'symmetric';
        const names = [...els.playersForm.querySelectorAll('.player-name')];
        if (names[0]) names[0].value = 'TEST AZUR';
        if (names[1]) names[1].value = 'TEST CORAIL';
        startLocalGame();
        if (els.symmetricSetupSelect) els.symmetricSetupSelect.value = 'spiral';
        renderSymmetricSetupPreview('spiral');
        confirmSymmetricSetup();
        setTimeout(() => {
          resizeKayKit3D();
          scheduleKayKitSync();
          showIlyosDiagnosticPanel();
        }, 900);
        setTimeout(showIlyosDiagnosticPanel, 2600);
      }

      const ILYOS_AUTOPLAY = {
        active: false,
        maxTurns: 16,
        startedTurn: 0,
        logs: [],
        monitor: null
      };

      function ilyosAutoplayLog(message, type = "info") {
        const entry = { time: new Date().toLocaleTimeString(), turn: state?.turn || 0, player: state?.currentPlayer ?? null, message, type };
        ILYOS_AUTOPLAY.logs.push(entry);
        if (ILYOS_AUTOPLAY.logs.length > 120) ILYOS_AUTOPLAY.logs.shift();
        console.info('[ILYOS AUTOPLAY]', entry);
        renderIlyosAutoplayPanel();
      }

      function renderIlyosAutoplayPanel() {
        let panel = document.querySelector('.ilyos-autoplay-panel');
        if (!panel) {
          panel = document.createElement('aside');
          panel.className = 'ilyos-autoplay-panel';
          document.body.appendChild(panel);
        }
        const recent = ILYOS_AUTOPLAY.logs.slice(-8).reverse();
        const player = state?.players?.[state?.currentPlayer];
        panel.innerHTML = `<h3>PARTIE AUTOMATIQUE · ${window.ILYOS_BUILD || 'V64'}</h3>` +
          `<p><strong>État :</strong> ${ILYOS_AUTOPLAY.active ? 'EN COURS' : 'ARRÊTÉE'}</p>` +
          `<p><strong>Tour :</strong> ${state?.turn || '—'} / ${ILYOS_AUTOPLAY.startedTurn + ILYOS_AUTOPLAY.maxTurns} · ${player?.name || '—'}</p>` +
          `<p><strong>Phase :</strong> ${state?.phase || '—'} · Îles ${state?.islands?.length || 0}</p>` +
          `<p><strong>Scores :</strong> ${(state?.players || []).map(p => `${p.name} ${p.score || 0}/3`).join(' · ') || '—'}</p>` +
          `<div class="ilyos-autoplay-log">${recent.map(item => `<div class="${item.type}"><b>T${item.turn}</b> ${item.message}</div>`).join('') || '<div>En attente…</div>'}</div>` +
          `<button data-autoplay-stop>${ILYOS_AUTOPLAY.active ? 'ARRÊTER' : 'FERMER'}</button> ` +
          `<button data-autoplay-report>DIAGNOSTIC</button>`;
        panel.querySelector('[data-autoplay-stop]')?.addEventListener('click', () => {
          if (ILYOS_AUTOPLAY.active) stopIlyosAutoplay('Arrêt manuel'); else panel.remove();
        });
        panel.querySelector('[data-autoplay-report]')?.addEventListener('click', showIlyosDiagnosticPanel);
      }

      function stopIlyosAutoplay(reason = 'Test terminé') {
        ILYOS_AUTOPLAY.active = false;
        clearInterval(ILYOS_AUTOPLAY.monitor);
        ILYOS_AUTOPLAY.monitor = null;
        if (state?.players) state.players.forEach(player => player.isAI = false);
        ilyosAutoplayLog(reason, 'warn');
        renderAll?.();
        renderIlyosAutoplayPanel();
      }

      function startIlyosAutoplay({ maxTurns = 16, difficulty = 'normal' } = {}) {
        if (!state) return false;
        ILYOS_AUTOPLAY.active = true;
        ILYOS_AUTOPLAY.maxTurns = Math.max(2, Number(maxTurns) || 16);
        ILYOS_AUTOPLAY.startedTurn = state.turn || 1;
        ILYOS_AUTOPLAY.logs = [];
        state.aiDifficulty = difficulty;
        state.players.forEach((player, index) => {
          player.isAI = true;
          player.name = index === 0 ? 'BOT AZUR' : 'BOT CORAIL';
        });
        stopTurnTimer();
        startTurnTimer(true);
        ilyosAutoplayLog(`Duel Spirale lancé · difficulté ${difficulty}`, 'ok');
        renderAll();

        clearInterval(ILYOS_AUTOPLAY.monitor);
        let lastTurn = state.turn;
        let lastPhase = state.phase;
        ILYOS_AUTOPLAY.monitor = setInterval(() => {
          if (!ILYOS_AUTOPLAY.active || !state) { clearInterval(ILYOS_AUTOPLAY.monitor); return; }
          if (state.winner !== null) {
            const winner = state.players[state.winner];
            stopIlyosAutoplay(`Victoire de ${winner?.name || 'un bot'} en ${state.turn} tours`);
            return;
          }
          if (state.turn !== lastTurn) {
            const previous = state.players[(state.currentPlayer - 1 + state.players.length) % state.players.length];
            ilyosAutoplayLog(`${previous?.name || 'Bot'} a terminé son tour`, 'ok');
            lastTurn = state.turn;
          }
          if (state.phase !== lastPhase) {
            ilyosAutoplayLog(`Phase ${lastPhase || '—'} → ${state.phase}`, 'info');
            lastPhase = state.phase;
          }
          if (state.turn >= ILYOS_AUTOPLAY.startedTurn + ILYOS_AUTOPLAY.maxTurns) {
            stopIlyosAutoplay(`Limite de ${ILYOS_AUTOPLAY.maxTurns} tours atteinte`);
            return;
          }
        }, 300);

        // Le premier tour d'un setup symétrique ne démarrait pas l'IA automatiquement.
        state.aiThinking = true;
        state.inputLocked = true;
        els.gameScreen.classList.add('ai-turn');
        const token = ++aiRunToken;
        setTimeout(() => runAITurn(token), 650);
        return true;
      }

      function launchIlyosSpiralAutoplay() {
        document.body.classList.add('ilyos-diagnostic-mode');
        pendingVisualMode = 'alternative';
        const ensureSetup = () => {
          els.playerCount.value = '2';
          els.playerCount.dispatchEvent(new Event('change', { bubbles: true }));
          const boardSelect = document.getElementById('startingBoardSelect');
          if (boardSelect) boardSelect.value = 'symmetric';
          const names = [...els.playersForm.querySelectorAll('.player-name')];
          if (names[0]) names[0].value = 'BOT AZUR';
          if (names[1]) names[1].value = 'BOT CORAIL';
          startLocalGame();
        };
        ensureSetup();
        let attempts = 0;
        const finishSetup = () => {
          attempts++;
          if (state?.setupSelectionPending && els.symmetricSetupSelect) {
            els.symmetricSetupSelect.value = 'spiral';
            renderSymmetricSetupPreview('spiral');
            confirmSymmetricSetup();
          }
          if (state && !state.setupSelectionPending && state.startingBoardPreset === 'spiral') {
            setTimeout(() => startIlyosAutoplay({ maxTurns: 18, difficulty: 'normal' }), 500);
            setTimeout(showIlyosDiagnosticPanel, 1200);
            return;
          }
          if (attempts < 30) setTimeout(finishSetup, 100);
          else {
            console.error('[ILYOS V74] Échec du lancement automatique', state);
            showToast('Le lancement automatique a échoué. Utilisez Outils de test → Relancer.');
          }
        };
        setTimeout(finishSetup, 80);
      }

      /*
       * IA contre IA : jusqu'ici accessible uniquement depuis la console
       * (window.ILYOS_API.launchConfiguredGame({..., autoplay:true}) ou
       * startIlyosAutoplay() sur une partie déjà lancée). Ce bouton fait la
       * même chose sans passer par la console : plateau classique à 2
       * joueurs (pas de préréglage symétrique à confirmer, donc plus direct
       * que Spirale des vents), les deux joueurs basculés en IA Expert.
       */
      function launchIlyosAIvsAI({ difficulty = 'expert', maxTurns = 40 } = {}) {
        document.body.classList.add('ilyos-diagnostic-mode');
        pendingVisualMode = 'alternative';
        els.playerCount.value = '2';
        els.playerCount.dispatchEvent(new Event('change', { bubbles: true }));
        const boardSelect = document.getElementById('startingBoardSelect');
        if (boardSelect) boardSelect.value = 'classic';
        const difficultySelect = document.getElementById('aiDifficultySelect');
        if (difficultySelect) difficultySelect.value = difficulty;
        const names = [...els.playersForm.querySelectorAll('.player-name')];
        if (names[0]) names[0].value = 'BOT AZUR';
        if (names[1]) names[1].value = 'BOT CORAIL';
        startLocalGame();

        let attempts = 0;
        const finishSetup = () => {
          attempts++;
          if (state && !state.setupSelectionPending) {
            setTimeout(() => startIlyosAutoplay({ maxTurns, difficulty }), 500);
            setTimeout(showIlyosDiagnosticPanel, 1200);
            return;
          }
          if (attempts < 30) setTimeout(finishSetup, 100);
          else {
            console.error('[ILYOS V74] Échec du lancement IA vs IA', state);
            showToast('Le lancement IA vs IA a échoué.');
          }
        };
        setTimeout(finishSetup, 80);
      }

      window.ILYOS_API = {
        launchConfiguredGame({ opponent = "1", board = "spiral", difficulty = "normal", turnTime = 0, boardSize = DEFAULT_BOARD_SIZE, autoplay = false } = {}) {
          try {
            pendingVisualMode = "alternative";
            els.playerCount.value = String(opponent);
            els.playerCount.dispatchEvent(new Event("change", { bubbles: true }));
            const boardSelect = document.getElementById("startingBoardSelect");
            if (boardSelect) boardSelect.value = board === "classic" ? "classic" : "symmetric";
            const boardSizeSelect = document.getElementById("boardSizeSelect");
            if (boardSizeSelect) boardSizeSelect.value = String(normalizeBoardSize(boardSize));
            const difficultySelect = document.getElementById("aiDifficultySelect");
            if (difficultySelect) difficultySelect.value = difficulty;
            // Comme les deux précédents : le changement de mode ci-dessus a
            // reconstruit els.modeOptions, donc le select vient d'être recréé
            // avec sa valeur par défaut — il faut la réappliquer ici.
            const turnTimerSelect = document.getElementById("turnTimerSelect");
            if (turnTimerSelect) turnTimerSelect.value = String(Number(turnTime) > 0 ? Number(turnTime) : 0);
            const names = [...els.playersForm.querySelectorAll(".player-name")];
            if (names[0] && !names[0].value.trim()) names[0].value = "JOUEUR 1";
            if (names[1] && !names[1].value.trim()) names[1].value = "JOUEUR 2";
            startLocalGame();
            if (board !== "classic") {
              let attempts = 0;
              const preset = SYMMETRIC_DUEL_SETUPS[board] ? board : "spiral";
              const finish = () => {
                attempts++;
                if (state?.setupSelectionPending && els.symmetricSetupSelect) {
                  els.symmetricSetupSelect.value = preset;
                  renderSymmetricSetupPreview(preset);
                  confirmSymmetricSetup();
                  if (autoplay) setTimeout(() => startIlyosAutoplay({ maxTurns: 18, difficulty }), 650);
                  return;
                }
                if (state && !state.setupSelectionPending) {
                  if (autoplay) setTimeout(() => startIlyosAutoplay({ maxTurns: 18, difficulty }), 650);
                  return;
                }
                if (attempts < 40) setTimeout(finish, 75);
                else showToast("Impossible de préparer le plateau symétrique.");
              };
              setTimeout(finish, 50);
            } else if (autoplay) {
              setTimeout(() => startIlyosAutoplay({ maxTurns: 18, difficulty }), 650);
            }
            return true;
          } catch (error) {
            console.error("[ILYOS V74] lancement impossible", error);
            showToast("Erreur pendant le lancement de la partie.");
            return false;
          }
        }
      };

      /* ==================================================================
         BANC D'ESSAI STRATÉGIQUE — window.ILYOS_BENCH

         Sert à mesurer la FORCE de l'IA, là où ILYOS_TEST mesure sa survie
         (le smoke test vérifie qu'une partie se termine, pas qu'elle soit
         bien jouée).

         Principe : une position de test est un instantané snapshotState(),
         rechargé par applyStateSnapshot() — exactement le chemin de
         l'annulation. Aucune seconde représentation du plateau n'est
         inventée ici, donc un puzzle ne peut pas diverger des règles.

         Le tour joué est le VRAI runAITurn(), avec ses vraies fonctions de
         décision et d'exécution : ce qui est mesuré est bien l'IA du jeu.
         ================================================================== */

      /* Construit un instantané complet à partir d'une description compacte.
         Les puzzles décrivent ce qui compte (îles, gardiens, couronnes, mains,
         réserve) ; tout le reste reçoit un défaut neutre de début de tour. */
      function benchBuildSnapshot(spec = {}) {
        const taille = spec.boardSize || 11;
        if (GRID !== taille) setBoardSize(taille);

        const attributions = getVillageAssignments(2);
        const joueurs = [0, 1].map(index => {
          const villages = attributions[index].map(v => ({ ...v }));
          const main = (spec.hands?.[index] || []).map((action, i) => ({
            id: `bench-P${index}-C${i}`,
            action,
            used: false
          }));
          return {
            id: index,
            name: index === 0 ? "BENCH IA" : "BENCH ADVERSAIRE",
            color: PLAYER_COLORS[index],
            icon: PLAYER_ICONS[index],
            // Seul le joueur testé est piloté par l'IA : l'adversaire reste
            // humain pour que la partie s'arrête à la fin du tour mesuré.
            isAI: index === (spec.aiPlayer ?? 0),
            aiDifficulty: index === (spec.aiPlayer ?? 0) ? (spec.difficulty || "expert") : null,
            village: { ...villages[0] },
            villages,
            score: spec.scores?.[index] || 0,
            // Pioche vide : un puzzle ne doit jamais dépendre d'un tirage.
            deck: [],
            discard: [],
            hand: main,
            stash: Object.assign({ MOVE: 0, PUSH: 0, MAGIC: 0 }, spec.stash?.[index] || {})
          };
        });

        let prochaineIle = 1;
        const iles = (spec.islands || []).map(ile => {
          const cellules = cloneCells(ile.cells);
          return {
            id: prochaineIle++,
            owner: ile.owner ?? 0,
            shapeKey: ile.shapeKey || "square",
            anchor: { r: cellules[0][0], c: cellules[0][1] },
            relCells: cloneCells(cellules.map(([r, c]) => [r - cellules[0][0], c - cellules[0][1]])),
            cells: cellules,
            // fromSetup marque les îles de décor : elles ne consomment pas le
            // stock de formes (voir shapeUsageCountForOwner). Un puzzle qui
            // teste le stock doit donc poser fromSetup: false explicitement.
            fromSetup: ile.fromSetup !== false,
            visualVariant: 0
          };
        });

        let prochainPerso = 1;
        const persos = (spec.characters || []).map(perso => ({
          id: perso.id || `bench-char-${prochainPerso++}`,
          player: perso.player ?? 0,
          r: perso.r,
          c: perso.c
        }));

        const couronne = (index, defaut) => {
          const spec1 = spec.crowns?.[index];
          if (spec1 === null) return { id: `crown-${index + 1}`, r: defaut.r, c: defaut.c, carrierId: null, active: false };
          const c = spec1 || {};
          return {
            id: `crown-${index + 1}`,
            r: c.r ?? defaut.r,
            c: c.c ?? defaut.c,
            carrierId: c.carrierId ?? null,
            active: c.active !== false
          };
        };

        return {
          players: joueurs,
          currentPlayer: spec.aiPlayer ?? 0,
          round: 1,
          turn: spec.turn ?? 3,
          islands: iles,
          characters: persos,
          artifact: couronne(0, CENTER),
          secondArtifact: spec.crowns?.[1] === undefined
            ? { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false }
            : couronne(1, CENTER),
          couronnesEnAttente: spec.couronnesEnAttente || [],
          phase: "ACTION_SELECT",
          islandPlacedThisTurn: !!spec.islandPlacedThisTurn,
          centerCrownTakenThisTurn: false,
          treasureDropFromId: null,
          crownPickupCell: null,
          selectedIslandShape: null,
          placementCells: null,
          placementOriginIndex: 0,
          hoverAnchor: null,
          pendingSpawnIslandId: null,
          selectedActionCardId: null,
          selectedActionType: null,
          selectedActionCount: 1,
          pushForceChoice: 1,
          crownStealTargetId: null,
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
          reachable: [],
          nextIslandId: prochaineIle,
          nextCharId: prochainPerso + 100,
          winner: null
        };
      }

      /* Photographie de l'état en termes de RÈGLES, pas de score interne.
         C'est sur cet objet que les puzzles écrivent leurs conditions de
         réussite : « le porteur est sur une case de validation », jamais
         « l'évaluation dépasse 120 ». */
      function benchObserveState(joueurIA) {
        const moi = state.players[joueurIA];
        const adverse = state.players.find(p => p.id !== joueurIA);
        const porteurs = (state.characters || []).map(char => ({
          id: char.id,
          player: char.player,
          r: char.r,
          c: char.c,
          porte: !!artifactCarriedBy(char.id),
          surCaseValidation: isCrownValidationCell(state.players[char.player], char.r, char.c)
        }));

        return {
          tour: state.turn,
          vainqueur: state.winner,
          scores: state.players.map(p => p.score),
          gardiens: porteurs,
          gardiensIA: porteurs.filter(g => g.player === joueurIA),
          gardiensAdverses: porteurs.filter(g => g.player !== joueurIA),
          couronnes: [state.artifact, state.secondArtifact].filter(Boolean).map(a => {
            // Une couronne portée ne met pas à jour ses propres r/c : sa position
            // réelle est celle de son porteur. Sans cette résolution, un puzzle
            // qui teste « la couronne a-t-elle atteint le village » lirait la
            // case de ramassage, pas la case d'arrivée.
            const porteur = a.carrierId ? state.characters.find(ch => ch.id === a.carrierId) : null;
            return {
              id: a.id,
              r: porteur ? porteur.r : a.r,
              c: porteur ? porteur.c : a.c,
              active: a.active,
              carrierId: a.carrierId,
              porteePar: porteur ? porteur.player : null
            };
          }),
          couronnesEnAttente: [...(state.couronnesEnAttente || [])],
          reserve: { ...(moi?.stash || {}) },
          reserveAdverse: { ...(adverse?.stash || {}) },
          mainRestante: (moi?.hand || []).filter(c => !c.used).map(c => c.action),
          iles: (state.islands || []).map(i => ({
            id: i.id, owner: i.owner, shapeKey: i.shapeKey, fromSetup: !!i.fromSetup,
            cells: i.cells.map(([r, c]) => [r, c])
          })),
          ilePoseeCeTour: !!state.islandPlacedThisTurn,
          /* Terrain et cases de validation relevés tels que le moteur les voit
             (isLand fait autorité). Les conditions de réussite des puzzles se
             calculent ensuite dessus, hors du jeu : un puzzle juge donc l'état
             obtenu avec son propre oracle, sans jamais réutiliser une fonction
             de décision de l'IA — c'est ce qui l'empêche de se contenter de
             confirmer ce que l'IA croit déjà. */
          terrain: (() => {
            const cases = [];
            for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
              if (isLand(r, c)) cases.push([r, c]);
            }
            return cases;
          })(),
          casesValidation: state.players.map(p => crownValidationCellsForPlayer(p)),
          sanctuaire: [CENTER.r, CENTER.c],
          taillePlateau: GRID
        };
      }

      /* Journal des actions réellement exécutées pendant le tour mesuré.
         Rempli par les fonctions d'exécution de l'IA (voir benchJournaliser),
         il sert à expliquer POURQUOI un puzzle échoue, pas seulement qu'il
         échoue. */
      let benchJournal = null;
      function benchJournaliser(entree) {
        if (benchJournal) benchJournal.push(entree);
      }

      /** Joue exactement un tour d'IA sur une position donnée et rend le
       *  résultat observé. Ne touche à rien si aucune partie n'est en cours. */
      async function benchRunPuzzle(spec = {}) {
        const joueurIA = spec.aiPlayer ?? 0;
        const graine = spec.seed ?? 1;

        /* ISOLER la position de tout ce qui traîne encore.

           Sans cette précaution, la première position jouée après le lancement
           héritait du travail asynchrone de la partie de préchauffage : un
           gardien qui n'appartenait pas au puzzle (char-100 en (6,5), observé
           au diagnostic) surgissait en cours de tour et jouait une action.
           C'était du BRUIT D'INSTRUMENT, et non le non-déterminisme du moteur
           auquel on l'avait d'abord attribué.

           Incrémenter aiRunToken invalide immédiatement tout tour d'IA encore
           en vol : chaque étape de runAITurn et de ses exécuteurs teste
           `token !== aiRunToken` et abandonne. Vider les animations en attente
           empêche leurs callbacks de rejouer une conséquence sur la nouvelle
           position. */
        aiRunToken++;
        if (kaykit3D?.pendingActionAnimations) kaykit3D.pendingActionAnimations.clear();
        for (let attente = 0; attente < 40 && state?.turnTransitioning; attente++) {
          await sleep(50);
        }

        setTestRandomSeed(graine);
        benchJournal = [];

        const instantane = benchBuildSnapshot(spec);
        /* Double chargement encadrant une courte pause. Le premier pose la
           position ; la pause laisse s'exécuter tout ce qui restait en vol
           (callbacks d'animation, fin de tour différée) ; le second efface ce
           que cela aurait pu écrire. Sans cela, la première position jouée
           après le lancement héritait d'un gardien de la partie de
           préchauffage, qui surgissait en cours de tour et jouait une action —
           du bruit d'instrument, pas du non-déterminisme moteur. */
        applyStateSnapshot(JSON.parse(JSON.stringify(instantane)));
        await sleep(180);
        applyStateSnapshot(JSON.parse(JSON.stringify(instantane)));
        state.rules = Object.assign(
          { allowDissolve: false, islandLimitPerPlayer: 0 },
          spec.rules || {}
        );
        state.soloMode = true;
        state.onlineMode = false;
        state.undoHistory = [];
        state.aiThinking = false;
        state.inputLocked = false;
        renderAll();

        const depart = benchObserveState(joueurIA);
        const token = ++aiRunToken;
        await runAITurn(token);

        // runAITurn se termine par endTurn(true), qui est asynchrone et n'est
        // pas attendu : c'est lui qui range les cartes non jouées dans la
        // réserve physique. Sans cette pause, un puzzle sur la réserve lirait
        // l'état d'avant le rangement.
        await sleep(900);
        const arrivee = benchObserveState(joueurIA);
        const journal = benchJournal ? [...benchJournal] : [];
        benchJournal = null;
        setTestRandomSeed(null);

        return { depart, arrivee, journal, joueurIA, graine };
      }

      /** Tue immédiatement tout tour d'IA en vol et vide les animations en
       *  attente. À appeler dès l'arrêt de la partie de préchauffage : sans
       *  cela, la queue de ce tour continue de s'exécuter et vient jouer une
       *  action pendant la première position mesurée. */
      function benchReinitialiser() {
        aiRunToken++;
        benchJournal = null;
        if (kaykit3D?.pendingActionAnimations) kaykit3D.pendingActionAnimations.clear();
        if (state) {
          state.aiThinking = false;
          state.inputLocked = false;
        }
        return true;
      }

      /* ------------------------------------------------------------------
         TESTS DE FIDÉLITÉ — la simulation dit-elle la vérité ?

         Pour une même position de départ et une même action, deux chemins sont
         comparés :

           SIMULÉ : le noyau de règle, sur un clone, présentation coupée.
           RÉEL   : le chemin complet du jeu, animations comprises, joué jusqu'à
                    son terme.

         Les deux doivent aboutir au MÊME état stratégique canonique. C'est la
         garantie qu'un plan calculé par l'IA correspondra à ce que le jeu
         appliquera réellement — et donc qu'aucune seconde implémentation des
         règles ne s'est glissée quelque part.

         Ce contrôle passe AVANT tout évaluateur et tout planner : une
         divergence ici invaliderait silencieusement tout ce qui serait
         construit au-dessus.
         ------------------------------------------------------------------ */
      /* Positions minimales, chacune isolant une conséquence de règle précise.
         Repères : sanctuaire (5,5) ; villages J0 (0,0) et (10,10) ; J1 (0,10)
         et (10,0). */
      const BENCH_BLOC = (r0, c0, h, l) => {
        const cellules = [];
        for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + l; c++) cellules.push([r, c]);
        return cellules;
      };

      const BENCH_CAS_FIDELITE = [
        {
          nom: "MOVE orthogonal",
          position: {
            seed: 201, islandPlacedThisTurn: true, hands: { 0: ["MOVE", "MOVE"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(4, 4, 2, 3) }],
            characters: [{ id: "g1", player: 0, r: 4, c: 4 }],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          action: { type: "MOVE", charId: "g1", r: 4, c: 5, cost: 1 }
        },
        {
          nom: "MOVE diagonal (coût 2)",
          position: {
            seed: 202, islandPlacedThisTurn: true, hands: { 0: ["MOVE", "MOVE"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(4, 4, 2, 3) }],
            characters: [{ id: "g1", player: 0, r: 4, c: 4 }],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          action: { type: "MOVE", charId: "g1", r: 5, c: 5, cost: 2 }
        },
        {
          nom: "MOVE en portant une couronne",
          position: {
            seed: 203, islandPlacedThisTurn: true, hands: { 0: ["MOVE", "MOVE"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(1, 0, 2, 3) }],
            characters: [{ id: "g1", player: 0, r: 1, c: 1 }],
            crowns: [{ r: 1, c: 1, carrierId: "g1", active: true }]
          },
          action: { type: "MOVE", charId: "g1", r: 1, c: 0, cost: 1 }
        },
        {
          nom: "MOVE ramassant une couronne libre",
          position: {
            seed: 204, islandPlacedThisTurn: true, hands: { 0: ["MOVE", "MOVE"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(4, 4, 2, 3) }],
            characters: [{ id: "g1", player: 0, r: 4, c: 4 }],
            crowns: [{ r: 4, c: 5, active: true }]
          },
          action: { type: "MOVE", charId: "g1", r: 4, c: 5, cost: 1 }
        },
        {
          nom: "PUSH simple",
          position: {
            seed: 205, islandPlacedThisTurn: true, hands: { 0: ["PUSH", "PUSH"], 1: [] },
            islands: [{ shapeKey: "line3", owner: 0, cells: [[6, 4], [6, 5], [6, 6], [6, 7]] }],
            characters: [
              { id: "g1", player: 0, r: 6, c: 4 },
              { id: "e1", player: 1, r: 6, c: 5 }
            ],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          action: { type: "PUSH", pusherId: "g1", r: 6, c: 5, force: 1 }
        },
        {
          nom: "PUSH provoquant une chute",
          position: {
            seed: 206, islandPlacedThisTurn: true, hands: { 0: ["PUSH", "PUSH"], 1: [] },
            islands: [{ shapeKey: "line3", owner: 0, cells: [[6, 4], [6, 5], [6, 6]] }],
            characters: [
              { id: "g1", player: 0, r: 6, c: 5 },
              { id: "e1", player: 1, r: 6, c: 6 }
            ],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          action: { type: "PUSH", pusherId: "g1", r: 6, c: 6, force: 1 }
        },
        {
          nom: "PUSH d'un porteur (chute + couronne lâchée)",
          position: {
            seed: 207, islandPlacedThisTurn: true, hands: { 0: ["PUSH", "PUSH"], 1: [] },
            islands: [{ shapeKey: "line3", owner: 0, cells: [[6, 4], [6, 5], [6, 6]] }],
            characters: [
              { id: "g1", player: 0, r: 6, c: 5 },
              { id: "e1", player: 1, r: 6, c: 6 }
            ],
            crowns: [{ r: 6, c: 6, carrierId: "e1", active: true }]
          },
          action: { type: "PUSH", pusherId: "g1", r: 6, c: 6, force: 1 }
        },
        {
          nom: "PUSH d'une couronne libre",
          position: {
            seed: 208, islandPlacedThisTurn: true, hands: { 0: ["PUSH", "PUSH"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(2, 2, 2, 4) }],
            characters: [{ id: "g1", player: 0, r: 2, c: 2 }],
            crowns: [{ r: 2, c: 3, active: true }]
          },
          action: { type: "PUSH", pusherId: "g1", r: 2, c: 3, force: 1 }
        },
        {
          nom: "MAGIC — rotation d'île",
          position: {
            seed: 209, islandPlacedThisTurn: true, hands: { 0: ["MAGIC", "MAGIC"], 1: [] },
            islands: [{ shapeKey: "line3", owner: 0, cells: [[3, 3], [3, 4], [3, 5]] }],
            characters: [{ id: "g1", player: 0, r: 7, c: 7 }],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          action: { type: "MAGIC", islandId: 1, pivot: [3, 4], direction: 1, turns: 1 }
        },
        {
          nom: "MAGIC — rotation portant un gardien",
          position: {
            seed: 210, islandPlacedThisTurn: true, hands: { 0: ["MAGIC", "MAGIC"], 1: [] },
            islands: [{ shapeKey: "line3", owner: 0, cells: [[3, 3], [3, 4], [3, 5]] }],
            characters: [{ id: "g1", player: 0, r: 3, c: 5 }],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          action: { type: "MAGIC", islandId: 1, pivot: [3, 4], direction: 1, turns: 1 }
        },
        {
          nom: "POSE — terrain + spawn",
          position: {
            seed: 211, islandPlacedThisTurn: false, hands: { 0: ["MOVE"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(4, 4, 2, 2) }],
            characters: [{ id: "g1", player: 0, r: 4, c: 4 }],
            crowns: [{ r: 0, c: 0, active: true }]
          },
          /* Le placement n'est pas imposé : les deux chemins doivent viser le
             MÊME emplacement, sinon on comparerait deux poses différentes. On
             interroge donc le moteur — findAutomaticIslandPlacement, celui-là
             même que le chemin réel utilisera. */
          action: () => {
            const choix = findAutomaticIslandPlacement(state.currentPlayer);
            return choix && {
              type: "POSE", shapeKey: choix.shapeKey, cells: choix.cells,
              owner: state.currentPlayer, relCells: choix.relCells, anchor: choix.anchor
            };
          }
        },
        {
          nom: "POSE — spawn ramassant une couronne",
          position: {
            seed: 212, islandPlacedThisTurn: false, hands: { 0: ["MOVE"], 1: [] },
            islands: [{ shapeKey: "square", owner: 0, cells: BENCH_BLOC(4, 4, 2, 2) }],
            characters: [{ id: "g1", player: 0, r: 4, c: 4 }],
            // La couronne repose sur le sanctuaire ; l'île posée le recouvre,
            // et le gardien qui y apparaît doit la ramasser.
            crowns: [{ r: 5, c: 5, active: true }]
          },
          action: () => {
            const choix = findAutomaticIslandPlacement(state.currentPlayer);
            return choix && {
              type: "POSE", shapeKey: choix.shapeKey, cells: choix.cells,
              owner: state.currentPlayer, relCells: choix.relCells, anchor: choix.anchor
            };
          }
        }
      ];

      /* Rejoue une action par le chemin ordinaire du jeu : mise en place de la
         sélection exactement comme le font les exécuteurs de l'IA, puis appel
         du gestionnaire réel. Aucune règle n'est réécrite ici. */
      function benchExecuterCheminReel(action) {
        switch (action.type) {
          case "MOVE": {
            const gardien = characterById(action.charId);
            if (!gardien) return null;
            state.phase = "ACTION";
            state.selectedActionType = "MOVE";
            state.selectedActionCount = action.cost;
            state.selectedCharId = gardien.id;
            state.selectedIslandId = null;
            state.reachable = movementRange(gardien, action.cost);
            return handleMoveClick(action.r, action.c);
          }
          case "PUSH": {
            const pousseur = characterById(action.pusherId);
            if (!pousseur) return null;
            state.phase = "ACTION";
            state.selectedActionType = "PUSH";
            state.selectedActionCount = action.force;
            state.selectedCharId = pousseur.id;
            state.selectedIslandId = null;
            state.reachable = new Set(
              orthogonalNeighbors(pousseur.r, pousseur.c).map(([r, c]) => key(r, c))
            );
            return handlePushClick(action.r, action.c);
          }
          case "MAGIC": {
            state.phase = "ACTION";
            state.selectedActionType = "MAGIC";
            state.selectedActionCount = 1;
            state.selectedIslandId = action.islandId;
            state.selectedMagicPivot = [...action.pivot];
            // confirmMagicRotation lit des crans : 3 vaut un quart de tour en
            // arrière, sinon le nombre de quarts de tour en avant.
            state.magicPreviewSteps = action.direction === -1 ? 3 : action.turns;
            return confirmMagicRotation();
          }
          case "POSE":
            return createAutomaticIslandAndSpawn(state.currentPlayer, false);
          default:
            return null;
        }
      }

      async function benchTesterFidelite(cas) {
        const instantane = benchBuildSnapshot(cas.position);
        const charger = () => {
          applyStateSnapshot(JSON.parse(JSON.stringify(instantane)));
          state.rules = Object.assign(
            { allowDissolve: false, islandLimitPerPlayer: 0 },
            cas.position.rules || {}
          );
          state.undoHistory = [];
          state.inputLocked = false;
        };

        // 1. Chemin simulé.
        setTestRandomSeed(cas.position.seed ?? 1);
        charger();
        const action = typeof cas.action === "function" ? cas.action() : cas.action;
        const empreinteSimulee = simulateActionFingerprint(action);

        // 2. Chemin réel : les VRAIES fonctions déclenchées par un clic de
        //    joueur ou par l'IA, pas le noyau. C'est tout l'intérêt du test —
        //    comparer le noyau au chemin complet, et non le noyau à lui-même.
        setTestRandomSeed(cas.position.seed ?? 1);
        charger();
        benchExecuterCheminReel(action);
        // Laisser retomber la présentation (animations, callbacks) : elle ne
        // doit RIEN changer à l'état logique. Si l'empreinte bouge pendant
        // cette attente, c'est précisément le défaut que l'on traque.
        await sleep(900);
        const empreinteReelle = strategicStateFingerprint();
        setTestRandomSeed(null);

        return {
          nom: cas.nom,
          ok: empreinteSimulee === empreinteReelle,
          simule: empreinteSimulee,
          reel: empreinteReelle
        };
      }

      async function benchFidelite() {
        const resultats = [];
        for (const cas of BENCH_CAS_FIDELITE) {
          try {
            resultats.push(await benchTesterFidelite(cas));
          } catch (erreur) {
            resultats.push({ nom: cas.nom, ok: false, erreur: String(erreur && erreur.message || erreur) });
          }
        }
        return resultats;
      }

      window.ILYOS_BENCH = {
        run: benchRunPuzzle,
        reinitialiser: benchReinitialiser,
        fidelite: benchFidelite,
        build: benchBuildSnapshot,
        observe: benchObserveState,
        seed: setTestRandomSeed,
        seeded: isTestRandomSeeded,
        /* Tirage brut, pour vérifier le générateur lui-même : c'est
           exactement la fonction que consomment shuffle(), createDeck() et les
           départages de l'IA. */
        tirage: () => gameRandom(),
        /* Contrôle du rythme : les temporisations de l'IA sont cosmétiques
           (lisibilité du tour pour un spectateur humain). Les réduire pendant
           le banc d'essai ne change aucune décision, seulement la durée. */
        vitesse: (facteur = 1) => { benchSpeedFactor = Math.max(0, Number(facteur) || 0); return benchSpeedFactor; }
      };

      window.ILYOS_TEST = {
        launchSpiral: launchIlyosSpiralDiagnostic,
        playSpiral: launchIlyosSpiralAutoplay,
        playAIvsAI: launchIlyosAIvsAI,
        startAutoplay: startIlyosAutoplay,
        stopAutoplay: stopIlyosAutoplay,
        report: collectIlyosDiagnosticReport,
        refresh: showIlyosDiagnosticPanel,
        autoplay: ILYOS_AUTOPLAY,
        /* Audition des bruitages sans avoir à provoquer la situation de jeu
           correspondante — indispensable pour régler un son : une chute ou une
           victoire sont autrement pénibles à déclencher à volonté.
           ILYOS_TEST.sfx("island") joue le son ; sans argument, la liste des
           types disponibles est renvoyée. */
        // ILYOS_TEST.sfx("spawn", "lumiere") pour auditionner une variante.
        sfx: (type, variant) => {
          const types = ["card", "island", "spawn", "move", "push", "rotate", "magic",
            "crownTake", "crownDrop", "crown", "turn", "victory", "fall", "error", "undo"];
          if (!type) return types;
          playSfx(type, variant ? { variant } : undefined);
          return variant ? `${type} · ${variant}` : type;
        },
        /* Marche complète : ILYOS_TEST.walk(4) joue les quatre pas d'un trajet
           de quatre cases, à la cadence réelle de l'animation. Un pas isolé ne
           dit rien de la marche — c'est la répétition qu'il faut juger. */
        walk: (cells = 3) => {
          const count = Math.max(1, Math.min(12, Math.round(cells)));
          const startColumn = Math.max(0, Math.round((GRID - count) / 2));
          const path = Array.from({ length: count }, (unused, index) => [5, startColumn + index]);
          playMovePath(path, 140 + count * 340);
          return { cases: count, dureeMs: 140 + count * 340 };
        }
      };

      els.ilyosSpiralTestBtn?.addEventListener('click', launchIlyosSpiralDiagnostic);
      els.ilyosAIvsAITestBtn?.addEventListener('click', () => launchIlyosAIvsAI());

      els.startBtn.addEventListener("click", () => {
        pendingVisualMode = "alternative";
        startGame();
      });
      els.altStartBtn.addEventListener("click", () => {
        pendingVisualMode = "alternative";
        startGame();
      });
      els.rulesSetupBtn.addEventListener("click", () => els.rulesModal.classList.remove("hidden"));
      els.rulesBtn.addEventListener("click", () => els.rulesModal.classList.remove("hidden"));
      els.closeRulesBtn.addEventListener("click", () => els.rulesModal.classList.add("hidden"));
      els.rulesModal.addEventListener("click", e => { if (e.target === els.rulesModal) els.rulesModal.classList.add("hidden"); });

      els.board.addEventListener("wheel", handleBoardWheel, { passive: false });
      els.hand.addEventListener("wheel", handleActionWheel, { passive: false });
      els.boardWrap.addEventListener("click", cancelFromBackdrop);
      document.addEventListener("keydown", handleRotateKey);
      // Après handleRotateKey, qui garde la priorité sur les flèches quand une
      // île ou une rotation magique est en cours (voir handleCameraKey).
      document.addEventListener("keydown", handleCameraKey);
      // Échap : ferme d'abord une éventuelle fenêtre ouverte (règles, menu son) —
      // sans quoi Échap déclencherait une annulation de coup EN PLUS de fermer la
      // fenêtre au clic suivant, un comportement surprenant. Sinon, même geste que
      // le bouton "Annuler" (handleCancelButton gère déjà la bonne priorité entre
      // désélection en cours et annulation réelle d'action — voir turns.js).
      document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (els.rulesModal && !els.rulesModal.classList.contains("hidden")) {
          els.rulesModal.classList.add("hidden");
          return;
        }
        if (els.soundMenu && !els.soundMenu.classList.contains("hidden")) {
          closeSoundMenu();
          return;
        }
        handleCancelButton();
      });

      els.rotateLeftBtn.addEventListener("click", () => rotateSelectedIsland(-1));
      els.rotateRightBtn.addEventListener("click", () => rotateSelectedIsland(1));
      els.flipBtn?.addEventListener("click", () => flipSelectedIsland());
      els.cancelCardBtn.addEventListener("click", handleCancelButton);
      els.endTurnBtn.addEventListener("click", () => endTurn(false));

      // HUD V2 (Prompt 2/3) : wiring additif uniquement — chaque bouton
      // appelle exactement la meme fonction que l'ancien panneau (aucune
      // logique de jeu/camera/magie dupliquee ici, juste de nouveaux points
      // d'entree). Ecouteurs attaches une seule fois au boot, comme le reste
      // de ce fichier — pas de nouvelle boucle rAF/polling/MutationObserver.
      document.getElementById("hudV2IslandStatus")?.addEventListener("click", () => {
        toggleHudV2Drawer("hudV2IslandDrawer", "hudV2IslandStatus");
      });
      // Délégation : #islandSelector est reconstruit à chaque renderIslandSelector().
      // Après le choix d'une forme, le drawer doit rester ouvert pendant
      // PLACE_ISLAND afin de rendre l'encadré de rotation immédiatement
      // accessible. On arrête aussi la propagation : renderAll() a déjà
      // remplacé le bouton cliqué et le listener document le prendrait sinon
      // pour un clic extérieur, puis refermerait le drawer dans la même frappe.
      document.getElementById("islandSelector")?.addEventListener("click", event => {
        if (!event.target.closest(".island-choice")) return;
        event.stopPropagation();
        const drawer = document.getElementById("hudV2IslandDrawer");
        drawer?.classList.remove("hidden");
        drawer?.setAttribute("aria-hidden", "false");
        document.getElementById("hudV2IslandStatus")?.setAttribute("aria-expanded", "true");
      });

      ["hudV2MoveCount", "hudV2PushCount", "hudV2MagicCount"].forEach((id, index) => {
        const type = ["MOVE", "PUSH", "MAGIC"][index];
        document.getElementById(id)?.addEventListener("click", () => {
          selectActionBatch(type, type === "PUSH" ? Math.max(1, state.pushForceChoice || 1) : 1);
        });
      });

      document.getElementById("hudV2MagicRotateLeft")?.addEventListener("click", () => rotateSelectedIsland(-1));
      document.getElementById("hudV2MagicRotateRight")?.addEventListener("click", () => rotateSelectedIsland(1));
      document.getElementById("hudV2MagicDissolve")?.addEventListener("click", () => dissolveSelectedIsland());
      document.getElementById("hudV2MagicConfirm")?.addEventListener("click", () => confirmMagicRotation());
      document.getElementById("hudV2MagicCancel")?.addEventListener("click", () => handleCancelButton());

      document.getElementById("hudV2PushForceMinus")?.addEventListener("click", () => hudV2PushForceStep(-1));
      document.getElementById("hudV2PushForcePlus")?.addEventListener("click", () => hudV2PushForceStep(1));

      // Menu secondaire unique (Prompt 3/3) : ⚙ remplace l'ancien bouton
      // caméra permanent. CAMÉRA garde le même délégué data-hud-camera que
      // la Passe 2 (setKayKitCameraMode()/snapKayKitView() inchangés). SON/
      // RÈGLES/NOUVELLE PARTIE sont les boutons réels #soundBtn/#rulesBtn/
      // #newGameBtn reparentés : leurs propres écouteurs (ci-dessous et plus
      // bas dans ce fichier) suffisent, celui-ci ferme juste le popover après.
      document.getElementById("hudV2GearBtn")?.addEventListener("click", () => {
        toggleHudV2Drawer("hudV2GearPopover", "hudV2GearBtn");
      });
      document.getElementById("hudV2GearPopover")?.addEventListener("click", event => {
        const cameraTarget = event.target.closest("[data-hud-camera]");
        if (cameraTarget) {
          const mode = cameraTarget.dataset.hudCamera;
          if (mode === "auto" || mode === "free") setKayKitCameraMode(mode);
          else if (mode === "front") snapKayKitView("front");
          else if (mode === "iso") snapKayKitView("isometric");
          closeHudV2Drawer();
          return;
        }
        // Infos techniques : replie/déplie SEULEMENT cette sous-section,
        // sans fermer tout le popover ⚙ (l'utilisateur peut vouloir la
        // consulter en gardant CAMÉRA/SON/RÈGLES accessibles juste au-dessus).
        const techToggle = event.target.closest("#hudV2TechToggle");
        if (techToggle) {
          const techInfo = document.getElementById("hudV2TechInfo");
          const willOpen = techInfo?.classList.contains("hidden");
          techInfo?.classList.toggle("hidden", !willOpen);
          techInfo?.setAttribute("aria-hidden", String(!willOpen));
          techToggle.setAttribute("aria-expanded", String(!!willOpen));
          return;
        }
        // Ciel : même repli/dépli que Infos techniques, indépendant. Peuple le
        // menu déroulant à la première ouverture seulement (KAYKIT_SKY_BAND_VARIANTS
        // ne change jamais en cours de partie, inutile de le refaire à chaque clic).
        const skyToggle = event.target.closest("#hudV2SkyToggle");
        if (skyToggle) {
          const skyPanel = document.getElementById("hudV2SkyPanel");
          const willOpen = skyPanel?.classList.contains("hidden");
          if (willOpen) renderHudV2SkyOptions();
          skyPanel?.classList.toggle("hidden", !willOpen);
          skyPanel?.setAttribute("aria-hidden", String(!willOpen));
          skyToggle.setAttribute("aria-expanded", String(!!willOpen));
          return;
        }
        // #soundBtn est volontairement exclu : openSoundMenu() positionne le
        // panneau son via getBoundingClientRect() du bouton dans un rAF
        // différé (audio.js) — fermer le popover ⚙ tout de suite le
        // masquerait avant cette lecture (rect à zéro). Le popover ⚙ se
        // referme de toute façon au clic suivant, en dehors (voir plus bas).
        if (event.target.closest("#rulesBtn, #newGameBtn")) closeHudV2Drawer();
      });

      document.getElementById("hudV2HandCount")?.addEventListener("click", () => {
        toggleHudV2Drawer("hudV2HandPopover", "hudV2HandCount");
      });

      // Sélecteur de ciel : liste construite depuis KAYKIT_SKY_BAND_VARIANTS
      // (kaykit3d.js, même IIFE) — une seule source, jamais dupliquée en dur ici.
      // Peuplé à la première ouverture du panneau (voir le toggle ci-dessus).
      function renderHudV2SkyOptions() {
        const select = document.getElementById("hudV2SkyVariant");
        if (!select || select.dataset.peuple === "1") {
          if (select) select.value = kaykitSkyBandActiveVariant;
          return;
        }
        select.dataset.peuple = "1";
        select.innerHTML = Object.entries(KAYKIT_SKY_BAND_VARIANTS)
          .map(([cle, spec]) => `<option value="${cle}">${spec.label}</option>`)
          .join("");
        select.value = kaykitSkyBandActiveVariant;
      }
      document.getElementById("hudV2SkyVariant")?.addEventListener("change", event => {
        window.ILYOS_SKY?.variante(event.target.value);
      });

      document.addEventListener("click", event => {
        const island = document.getElementById("hudV2IslandDrawer");
        const gear = document.getElementById("hudV2GearPopover");
        const hand = document.getElementById("hudV2HandPopover");
        const islandBtn = document.getElementById("hudV2IslandStatus");
        const gearBtn = document.getElementById("hudV2GearBtn");
        const handBtn = document.getElementById("hudV2HandCount");
        const insideAny = [island, gear, hand].some(el => el && el.contains(event.target));
        // BUG CORRIGÉ : ces boutons contiennent des <span> enfants (icône +
        // mot, voir renderHudV2()) — un clic dessus donne event.target = le
        // span, jamais le bouton lui-même. Avec une égalité stricte
        // (=== event.target), "onTrigger" restait faux, et ce même listener
        // refermait le drawer/popover DANS LA MÊME frappe que celle qui
        // venait de l'ouvrir (l'ouverture, elle, passe par le listener direct
        // du bouton ligne ~357, qui tourne AVANT que cet événement ne
        // remonte jusqu'à document). .contains() couvre aussi les enfants.
        // Les déclencheurs du HUD organique comptent AUSSI. Ils ne font que relayer
        // le clic vers les boutons d'origine (voir hud-organique-v2.js), mais c'est bien
        // sur EUX que le clic réel atterrit : sans les lister ici, ce listener refermait
        // le popover dans la même frappe que celle qui venait de l'ouvrir — exactement le
        // bug décrit juste au-dessus, sous une autre forme.
        const islandBtnOv2 = document.getElementById("ov2Island");
        const gearBtnOv2 = document.getElementById("ov2Gear");
        const onTrigger = [islandBtn, gearBtn, handBtn, islandBtnOv2, gearBtnOv2]
          .some(el => el && el.contains(event.target));
        if (!insideAny && !onTrigger) closeHudV2Drawer();
      });

      els.soundBtn.addEventListener("click", toggleSoundMenu);
      els.closeSoundMenuBtn.addEventListener("click", closeSoundMenu);
      els.soundToggleBtn.addEventListener("click", event => {
        event.stopPropagation();
        toggleSoundEnabled();
      });
      els.masterVolumeSlider.addEventListener("input", event => setSoundSetting("master", Number(event.target.value)));
      els.musicVolumeSlider.addEventListener("input", event => setSoundSetting("music", Number(event.target.value)));
      els.effectsVolumeSlider.addEventListener("input", event => setSoundSetting("effects", Number(event.target.value)));
      els.effectsVolumeSlider.addEventListener("change", () => playSfx("magic"));
      els.musicTrackSelect.addEventListener("change", event => setMusicTrack(event.target.value));
      /* Banc d'écoute (#sfxLab dans index.html) : un clic joue le bruitage
         correspondant. Délégation plutôt qu'un écouteur par bouton, pour que
         l'ajout d'un son dans le HTML suffise.
         Le son est joué même si le joueur a coupé le son général — sinon le
         banc ne sert à rien précisément quand on veut vérifier un réglage. */
      document.getElementById("sfxLab")?.addEventListener("click", event => {
        const button = event.target.closest("[data-sfx], [data-walk]");
        if (!button) return;
        event.stopPropagation();

        // ambientEnabled ne suffit pas : c'est updateSoundLevels() qui remonte
        // réellement masterGain, mis à zéro quand le son est coupé.
        const restoreMuted = !ambientEnabled;
        if (restoreMuted) { ambientEnabled = true; updateSoundLevels(); }
        if (button.dataset.walk) window.ILYOS_TEST.walk(Number(button.dataset.walk));
        else playSfx(button.dataset.sfx, button.dataset.variant ? { variant: button.dataset.variant } : undefined);
        if (restoreMuted) setTimeout(() => { ambientEnabled = false; updateSoundLevels(); }, 2600);

        button.classList.add("ilyos-sfx-playing");
        setTimeout(() => button.classList.remove("ilyos-sfx-playing"), 320);
      });
      els.kaykitCacheBtn?.addEventListener("click", event => {
        event.stopPropagation();
        verifyAndCacheKayKit();
      });
      els.soundMenu.addEventListener("click", event => event.stopPropagation());
      document.addEventListener("click", event => {
        if (!els.soundMenu.classList.contains("hidden") && !els.soundMenu.contains(event.target) && event.target !== els.soundBtn) {
          closeSoundMenu();
        }
      });
      window.addEventListener("resize", positionSoundMenu);

      els.newGameBtn.addEventListener("click", () => {
        if (confirm("Revenir à la configuration ? La partie en cours restera disponible dans « Reprendre ».")) resetToSetup();
      });
      els.copyRoomCodeBtn.addEventListener("click", copyOnlineRoomCode);
      els.reconnectOnlineBtn.addEventListener("click", reconnectOnlineNow);

      els.replayBtn.addEventListener("click", replay);
      els.backSetupBtn.addEventListener("click", resetToSetup);


      document.body.dataset.islandStyle = "D";
      loadSoundSettings();
      updateSoundUI();

      window.addEventListener("beforeunload", event => {
        if (!state || state.winner !== null) return;
        if (state.onlineMode) saveOnlineSession();
        else saveLocalSessionNow();
        event.preventDefault();
        event.returnValue = "";
      });

      window.addEventListener("error", event => {
        console.error("ILYOS", event.error || event.message);
        if (state && !state.inputLocked) {
          showToast("Une erreur a été interceptée. La partie a été sauvegardée.");
          if (state.onlineMode) saveOnlineSession();
          else saveLocalSessionNow();
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          if (state?.onlineMode) saveOnlineSession();
          else saveLocalSessionNow();
        }
      });

      renderSetupFields();

      window.addEventListener("error", event => {
        console.error("ILYOS runtime error", event.error || event.message);
        const status = document.querySelector(".kaykit-status");
        if (status) { status.textContent = "Erreur détectée · le plateau HTML de secours reste jouable"; status.classList.add("loaded"); }
      });
      window.addEventListener("unhandledrejection", event => {
        console.error("ILYOS promise error", event.reason);
      });
    })();
