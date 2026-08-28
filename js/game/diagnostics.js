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
          `<div class="ilyos-autoplay-actions">` +
          `<button data-autoplay-stop>${ILYOS_AUTOPLAY.active ? 'ARRÊTER' : 'FERMER'}</button> ` +
          `<button data-autoplay-report>AFFICHAGE</button> ` +
          /* La revue s'ouvre d'un clic : l'exiger depuis la console revenait à
             la réserver à qui pense à la taper. */
          `<button data-autoplay-revue>${window.ILYOS_AUTOPSIE?.active?.() ? 'REVUE ✓' : 'REVUE IA'}</button>` +
          `</div>`;
        panel.querySelector('[data-autoplay-stop]')?.addEventListener('click', () => {
          if (ILYOS_AUTOPLAY.active) stopIlyosAutoplay('Arrêt manuel'); else panel.remove();
        });
        panel.querySelector('[data-autoplay-report]')?.addEventListener('click', showIlyosDiagnosticPanel);
        panel.querySelector('[data-autoplay-revue]')?.addEventListener('click', () => {
          const actif = !window.ILYOS_AUTOPSIE?.active?.();
          window.ILYOS_AUTOPSIE?.activer(actif);
          renderIlyosAutoplayPanel();
        });
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

      /* Au-delà de ce délai sans changement de tour, la partie automatique
         est considérée comme figée. Les tours mesurés durent 5 à 9 s, p95
         16 s, maximum observé 26 s : 35 s laisse de la marge tout en
         restant bien sous le seuil de blocage du test de bout en bout. */
      const AUTOPLAY_TOUR_BLOQUE_MS = 35000;

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
        let dernierChangement = Date.now();
        ILYOS_AUTOPLAY.forcages = 0;
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
            dernierChangement = Date.now();
          } else if (Date.now() - dernierChangement > AUTOPLAY_TOUR_BLOQUE_MS) {
            /* FORÇAGE DE FIN DE TOUR — uniquement en partie automatique.

               Un tour d'IA peut se figer sans exception ni message : le
               tour ne se termine jamais et la partie s'arrête là. Le
               minuteur retiré aux tours d'IA a supprimé une cause, mais il
               en subsiste au moins une autre, non identifiée à ce jour.

               Ce forçage vit dans le harnais d'autoplay, PAS dans le
               moteur : il ne s'applique donc qu'aux parties IA contre IA,
               jamais à une partie réelle ni aux bancs de puzzles, qui
               n'empruntent pas ce chemin. Une tentative précédente placée
               dans runAITurn faussait le scénario adversarial A7.

               Il est délibérément BRUYANT : chaque déclenchement est
               journalisé et compté, pour qu'on n'oublie pas qu'un défaut
               reste à corriger sous ce pansement. */
            ILYOS_AUTOPLAY.forcages++;
            ilyosAutoplayLog(`Tour ${state.turn} figé depuis ${Math.round((Date.now() - dernierChangement) / 1000)} s — fin de tour forcée`, 'warn');
            console.warn('[ILYOS] tour figé, fin forcée par le harnais autoplay', { tour: state.turn, joueur: state.currentPlayer });
            aiRunToken++;
            state.turnTransitioning = false;
            state.timerExpiring = false;
            state.aiThinking = false;
            state.inputLocked = false;
            dernierChangement = Date.now();
            endTurn(true);
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

      /* Inspection d'une décision SANS la jouer : charge la position et rend le
         rapport complet du planner — plan retenu, notes avant et après riposte,
         plans rejetés et la punition qui les a écartés. C'est l'outil demandé
         pour comprendre pourquoi Expert abandonne une ligne brillante. */
      function benchInspecterPlan(spec = {}) {
        const joueurIA = spec.aiPlayer ?? 0;
        setTestRandomSeed(spec.seed ?? 1);
        const instantane = benchBuildSnapshot(spec);
        applyStateSnapshot(JSON.parse(JSON.stringify(instantane)));
        state.rules = Object.assign(
          { allowDissolve: false, islandLimitPerPlayer: 0 }, spec.rules || {});
        state.undoHistory = [];
        const rapport = plannerChercherPlanRobuste(joueurIA);
        setTestRandomSeed(null);
        return {
          plan: rapport.plan.map(a => a.type),
          detail: rapport.plan,
          noteDepart: Math.round(rapport.noteDepart),
          noteArrivee: Math.round(rapport.noteArrivee),
          etatsExplores: rapport.etatsExplores,
          dureeMs: rapport.dureeMs,
          dureeTotaleMs: rapport.dureeTotaleMs,
          anticipation: rapport.anticipation,
          finalistes: (rapport.finalistes || []).map(n => ({
            plan: n.plan.map(a => a.type), note: Math.round(n.note)
          }))
        };
      }

      /* Contrôle de la règle de poussée elle-même (V67), indépendant de toute
         décision d'IA. On pose une position, on demande au résolveur ce qu'il
         ferait, et on compare les arrivées à ce que la règle exige.

         resoudrePousseeBloc() ne modifie rien : la position n'a pas besoin
         d'être rejouée entre deux cas. */
      function benchPoussee(cas = {}) {
        const instantane = benchBuildSnapshot(cas.spec || {});
        applyStateSnapshot(JSON.parse(JSON.stringify(instantane)));
        state.rules = Object.assign({ allowDissolve: false, islandLimitPerPlayer: 0 }, cas.rules || {});

        const [dr, dc] = cas.direction;
        const [sr, sc] = cas.depart;
        const plan = resoudrePousseeBloc(sr, sc, dr, dc, cas.force);

        // Arrivées exprimées en termes de jeu : qui finit où, et qui tombe.
        const arrivees = (plan ? plan.mouvements : []).map(mv => ({
          genre: mv.kind,
          id: mv.id,
          de: mv.from,
          vers: mv.to,
          chute: !!mv.chute
        }));
        return { distance: plan ? plan.distance : 0, arrivees };
      }

      /* Contrôle des règles de VALIDATION (V67) : le porteur est obligatoire,
         et un gardien adverse posté dans les trois cases d'un village y
         interdit tout point. On pose une position, on déclenche le décompte de
         début de tour, et on lit combien de points ont réellement été marqués. */
      function benchValidation(cas = {}) {
        const instantane = benchBuildSnapshot(cas.spec || {});
        applyStateSnapshot(JSON.parse(JSON.stringify(instantane)));
        state.rules = Object.assign({ allowDissolve: false, islandLimitPerPlayer: 0 }, cas.rules || {});
        const joueur = state.players[cas.joueur ?? 0];
        const avant = joueur.score;
        const marques = scoreCrownsAtTurnStart(joueur);
        return { marques, gain: joueur.score - avant };
      }

      /* =====================================================================
         SELF-PLAY SANS RENDU

         Une partie affichée dure trois à cinq minutes, presque entièrement
         passées en animations. Or les noyaux de règle sont purs et
         synchrones — c'est ce que prouve le banc de fidélité. On peut donc
         jouer des parties ENTIÈRES sans rien afficher, à une vitesse sans
         rapport avec le temps réel.

         C'est l'instrument qui manquait. Les douze poids de l'évaluateur ont
         été posés à la main et jamais vérifiés ; chaque correction faite « au
         jugé » en cassait une autre. Faire s'affronter deux jeux de poids sur
         des dizaines de parties remplace l'opinion par un résultat.

         Le harnais joue la MÊME position de départ pour tous, et alterne les
         camps : une différence de résultat vient alors des poids, pas du
         hasard des positions.
         ===================================================================== */

      /* Transition de tour d'une VRAIE partie : contrairement à
         applyTurnTransitionCore, qui distribue la main plausible utilisée par
         l'anticipation, celle-ci pioche réellement. */
      function selfplayTransitionTour() {
        const sortant = state.players[state.currentPlayer];

        /* Rangement des cartes : MÊME fonction que la vraie fin de tour.
           Une première version recopiait la logique et divergeait aussitôt —
           les cartes jouées n'allaient plus à la défausse, la pioche se vidait
           et une partie simulée durait 121 tours sans un seul point. */
        rangerCartesFinDeTour(sortant);
        // Ce qui n'a pas pu être rangé quitte la main par la défausse.
        sortant.discard = Array.isArray(sortant.discard) ? sortant.discard : [];
        (sortant.hand || []).forEach(carte => {
          sortant.discard.push({ ...carte, used: false, fromStash: false, fromReserve: false });
        });
        sortant.hand = [];

        state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
        state.turn++;

        const entrant = state.players[state.currentPlayer];
        scoreCrownsAtTurnStart(entrant);
        if (state.winner !== null && state.winner !== undefined) return false;

        // Règle V68 : plus de place pour poser, la partie s'arrête.
        if (plateauSansPlace()) {
          const vainqueur = vainqueurAuxCouronnes();
          state.winner = vainqueur === null ? MATCH_NUL : vainqueur;
          return false;
        }

        entrant.hand = [];
        drawCards(entrant, 5);
        state.islandPlacedThisTurn = islandLimitReachedForPlayer(entrant.id);
        state.centerCrownTakenThisTurn = false;
        faireEntrerCouronnesEnAttente();
        state.phase = "ACTION_SELECT";
        state.selectedActionType = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set();
        return true;
      }

      /* Joue un tour complet pour le joueur au trait. Renvoie le nombre
         d'actions appliquées — zéro signifie que le cerveau n'a rien trouvé. */
      function selfplayJouerTour(playerId, budget) {
        let rapport = null;
        try {
          rapport = plannerChercherPlanRobuste(playerId, budget);
        } catch (erreur) {
          console.warn("[ILYOS] self-play : planner en échec", erreur);
          return 0;
        }
        if (!rapport || !rapport.plan.length) return 0;
        let appliquees = 0;
        for (const action of rapport.plan) {
          if (!plannerAppliquerAction(action)) break;
          appliquees++;
        }
        /* La pose est obligatoire : si le plan ne l'a pas faite, on retombe sur
           la pose automatique, exactement comme le jeu réel le fait. */
        if (!state.islandPlacedThisTurn) {
          const pose = findAutomaticIslandPlacement(playerId);
          if (pose) {
            applyIslandPlacementCore(pose.shapeKey, pose.cells, playerId, pose.relCells, pose.anchor);
            appliquees++;
          }
        }
        return appliquees;
      }

      /* Poids de l'évaluateur : PLAN_POIDS est partagé, on le prête puis on le
         rend. Sans restitution, un tournoi laisserait le jeu réel avec les
         poids du dernier candidat testé. */
      function selfplayAppliquerPoids(poids) {
        if (!poids) return null;
        const memoire = {};
        Object.keys(poids).forEach(cle => {
          memoire[cle] = PLAN_POIDS[cle];
          PLAN_POIDS[cle] = poids[cle];
        });
        return memoire;
      }

      /** Une partie complète, sans rien afficher. */
      /* budget : plafonds de recherche du planner.

         Contre-intuitivement, ce n'est pas l'affichage qui coûte cher dans une
         partie, c'est la réflexion : 500 ms par décision, soit une quarantaine
         de secondes par partie. Un tournoi de mille parties y passerait la
         nuit.

         On réduit donc le temps de réflexion. La force ABSOLUE baisse, mais la
         comparaison entre deux jeux de poids reste valable puisque les deux
         camps réfléchissent autant — c'est un classement, pas une mesure. */
      function selfplayPartie({ depart, graine = 1, poids = [null, null], toursMax = 120,
                                budget = { tempsMaxMs: 150, etatsMax: 600 } } = {}) {
        const debut = performance.now();
        setTestRandomSeed(graine);
        const clone = structuredClone(depart);

        const resultat = withSimulatedState(clone, () => {
          let tours = 0;
          while (state.winner === null && tours < toursMax) {
            const joueur = state.currentPlayer;
            const memoire = selfplayAppliquerPoids(poids[joueur]);
            try {
              selfplayJouerTour(joueur, budget);
            } finally {
              selfplayAppliquerPoids(memoire);
            }
            tours++;
            if (!selfplayTransitionTour()) break;
          }
          return {
            vainqueur: state.winner,
            tours: state.turn,
            scores: state.players.map(p => p.score || 0),
            interrompue: tours >= toursMax,
            // Position finale : indispensable pour diagnostiquer une partie
            // simulée qui ne ressemble pas à une vraie.
            etatFinal: snapshotState()
          };
        });

        setTestRandomSeed(null);
        resultat.dureeMs = Math.round(performance.now() - debut);
        return resultat;
      }

      /* Tournoi entre deux jeux de poids, camps alternés. Chaque paire de
         parties joue la même graine des deux côtés : une différence ne peut
         alors pas venir du tirage. */
      function selfplayTournoi({ parties = 20, poidsA = null, poidsB = null, toursMax = 120,
                                budget = { tempsMaxMs: 150, etatsMax: 600 } } = {}) {
        if (!state) return { erreur: "lancez d'abord une partie pour disposer d'une position de départ" };
        const depart = structuredClone(canonicalDepart());
        const debut = performance.now();
        let gagneA = 0, gagneB = 0, nuls = 0, interrompues = 0;
        /* Couronnes cumulées : un verdict par partie discrimine mal — le
           tournoi témoin donnait 10 nuls sur 12. Le total des couronnes
           marquées de chaque côté reste informatif même quand personne ne
           gagne, et c'est lui qu'on regarde en premier. */
        let couronnesA = 0, couronnesB = 0;
        const durees = [];

        for (let i = 0; i < parties; i++) {
          const graine = 1000 + Math.floor(i / 2);
          // Camps alternés : A joue le joueur 0 une fois sur deux.
          const aEstJoueur0 = i % 2 === 0;
          const poids = aEstJoueur0 ? [poidsA, poidsB] : [poidsB, poidsA];
          const r = selfplayPartie({ depart, graine, poids, toursMax, budget });
          durees.push(r.dureeMs);
          if (r.interrompue) interrompues++;

          /* Une partie coupée au plafond de tours n'est pas un nul : on la
             départage aux couronnes, comme la règle du plateau saturé. Sans
             cela un tournoi court ne mesurait rien — huit parties, huit nuls. */
          let vainqueur = r.vainqueur;
          if (vainqueur === null || vainqueur === MATCH_NUL) {
            const [s0, s1] = r.scores;
            vainqueur = s0 === s1 ? null : (s0 > s1 ? 0 : 1);
          }

          couronnesA += aEstJoueur0 ? r.scores[0] : r.scores[1];
          couronnesB += aEstJoueur0 ? r.scores[1] : r.scores[0];

          if (vainqueur === null) nuls++;
          else if ((vainqueur === 0) === aEstJoueur0) gagneA++;
          else gagneB++;
        }

        durees.sort((x, y) => x - y);
        return {
          parties, gagneA, gagneB, nuls, interrompues,
          couronnesA, couronnesB,
          dureeTotaleMs: Math.round(performance.now() - debut),
          dureeMedianeMs: durees[Math.floor(durees.length / 2)],
          dureeMaxMs: durees[durees.length - 1]
        };
      }

      /* Position de départ : celle de la partie en cours, ramenée à son tour 1.
         On ne rejoue pas la création d'une partie — elle passe par l'interface
         — on repart de l'état actuel remis à zéro côté score et couronnes. */
      function canonicalDepart() {
        return JSON.parse(snapshotState());
      }

      /* =====================================================================
         FIDÉLITÉ D'UNE PARTIE ENTIÈRE

         Le banc de fidélité vérifie douze transitions ISOLÉES : une action,
         appliquée des deux façons, doit donner le même état. Il n'aurait pas vu
         le défaut qui a fait échouer le premier self-play — les cartes jouées
         n'allant plus à la défausse, c'est l'ACCUMULATION sur une partie qui
         révélait le problème, pas une transition prise seule.

         Ce contrôle-ci compare une partie complète. Il ne rejoue pas les
         DÉCISIONS — elles dépendent du temps de réflexion et du hasard, deux
         choses qu'on ne peut pas reproduire à l'identique. Il rejoue les
         ACTIONS que le jeu réel a effectivement jouées, et vérifie qu'elles
         produisent le même plateau. C'est exactement ce que veut dire fidélité.

         La matière vient du journal d'autopsie : position d'avant chaque
         décision, et plan joué. Il suffit de les enchaîner.
         ===================================================================== */

      /* Empreinte de PLATEAU : ce qui doit se reproduire à l'identique. La main
         et l'ordre de la pioche en sont exclus — ils dépendent d'un tirage
         aléatoire que la simulation ne peut pas rejouer, et ne décrivent aucune
         règle. */
      function empreintePlateau(etat) {
        const e = typeof etat === "string" ? JSON.parse(etat) : etat;
        const iles = (e.islands || [])
          .map(i => i.cells.map(c => c.join(",")).sort().join("|"))
          .sort().join(" / ");
        const gardiens = (e.characters || [])
          .map(c => `${c.player}:${c.r},${c.c}`).sort().join(" ");
        const couronnes = [e.artifact, e.secondArtifact]
          .map(a => a && a.active ? `${a.carrierId || "sol"}@${a.r},${a.c}` : "-")
          .join(" ");
        const scores = (e.players || []).map(j => j.score || 0).join("-");
        return `T${e.turn} J${e.currentPlayer} | ${scores} | ${couronnes} | ${gardiens} | ${iles}`;
      }

      /* Rejoue le journal d'autopsie en simulation et compare tour par tour. */
      function benchFidelitePartie() {
        const journal = (window.ILYOS_AUTOPSIE && window.ILYOS_AUTOPSIE.journal()) || [];
        if (journal.length < 2) {
          return { erreur: "journal trop court : jouez une partie avec la revue active" };
        }

        const etapes = [];
        for (let i = 0; i < journal.length - 1; i++) {
          const avant = journal[i];
          const apres = journal[i + 1];
          if (!avant.instantane || !apres.instantane) continue;

          const clone = JSON.parse(avant.instantane);
          const attendu = empreintePlateau(apres.instantane);

          const obtenu = withSimulatedState(clone, () => {
            for (const action of (avant.plan || [])) {
              if (!plannerAppliquerAction(action)) return "ACTION REFUSÉE : " + action.type;
            }
            /* Le jeu réel pose l'île automatiquement quand le plan ne l'a pas
               fait. Cette pose-là est choisie par une heuristique et n'est pas
               dans le journal : on ne peut donc pas la reproduire, et on le dit
               au lieu de compter une fausse divergence. */
            if (!state.islandPlacedThisTurn) return "POSE AUTOMATIQUE";
            selfplayTransitionTour();
            return empreintePlateau(snapshotState());
          });

          etapes.push({
            tour: avant.tour,
            joueur: avant.nomJoueur,
            comparable: obtenu !== "POSE AUTOMATIQUE" && !String(obtenu).startsWith("ACTION REFUSÉE"),
            fidele: obtenu === attendu,
            obtenu,
            attendu
          });
        }

        const comparables = etapes.filter(e => e.comparable);
        const fideles = comparables.filter(e => e.fidele);
        return {
          tours: etapes.length,
          comparables: comparables.length,
          fideles: fideles.length,
          nonComparables: etapes.filter(e => !e.comparable).map(e => ({ tour: e.tour, raison: e.obtenu })),
          divergences: comparables.filter(e => !e.fidele).slice(0, 3)
        };
      }

      window.ILYOS_SELFPLAY = {
        fidelitePartie: benchFidelitePartie,
        empreintePlateau,
        partie: selfplayPartie,
        tournoi: selfplayTournoi,
        depart: canonicalDepart
      };

      window.ILYOS_BENCH = {
        poussee: benchPoussee,
        validation: benchValidation,
        run: benchRunPuzzle,
        /* RELAIS ENTRE DEUX BUILDS — self-play croisé.

           Une partie fait jouer les deux IA dans la MÊME page : impossible d'y
           opposer deux versions du jeu. Le relais contourne cela en transportant
           l'état d'un build à l'autre entre chaque tour, chaque camp jouant
           toujours dans le build qui l'incarne.

           Réservé à la comparaison de versions. Ne sert jamais en jeu. */
        etatComplet: () => snapshotState(),
        jouerUnTour: async (json) => {
          if (json) applyStateSnapshot(JSON.parse(json));
          state.undoHistory = [];
          state.inputLocked = false;
          state.aiThinking = false;
          state.turnTransitioning = false;
          // Seul le joueur au trait est piloté : sinon beginTurn() enchaînerait
          // aussitôt le tour suivant dans ce build-ci, alors qu'il appartient à
          // l'autre.
          state.players.forEach((p, i) => {
            p.isAI = i === state.currentPlayer;
            p.aiDifficulty = i === state.currentPlayer ? "expert" : null;
          });
          const token = ++aiRunToken;
          await runAITurn(token);
          await sleep(700);
          return { etat: snapshotState(), vainqueur: state.winner ?? null, tour: state.turn };
        },
        plan: benchInspecterPlan,
        /* Coupe l'anticipation adverse pour un camp : ce camp joue alors
           exactement comme Expert V2. Réservé au self-play comparatif. */
        anticipation: (joueur, actif) => {
          if (actif === false) plannerSansAnticipation.add(joueur);
          else plannerSansAnticipation.delete(joueur);
          return [...plannerSansAnticipation];
        },
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
