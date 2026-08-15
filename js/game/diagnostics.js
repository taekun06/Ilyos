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

      window.ILYOS_API = {
        launchConfiguredGame({ opponent = "1", board = "spiral", difficulty = "normal", turnTime = 0, autoplay = false } = {}) {
          try {
            pendingVisualMode = "alternative";
            els.playerCount.value = String(opponent);
            els.playerCount.dispatchEvent(new Event("change", { bubbles: true }));
            const boardSelect = document.getElementById("startingBoardSelect");
            if (boardSelect) boardSelect.value = board === "classic" ? "classic" : "symmetric";
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

      window.ILYOS_TEST = {
        launchSpiral: launchIlyosSpiralDiagnostic,
        playSpiral: launchIlyosSpiralAutoplay,
        startAutoplay: startIlyosAutoplay,
        stopAutoplay: stopIlyosAutoplay,
        report: collectIlyosDiagnosticReport,
        refresh: showIlyosDiagnosticPanel,
        autoplay: ILYOS_AUTOPLAY
      };

      els.ilyosSpiralTestBtn?.addEventListener('click', launchIlyosSpiralDiagnostic);

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
      // Délégation : #islandSelector est reconstruit à chaque renderIslandSelector(),
      // son propre bouton garde son clic (selectIslandShape) ; celui-ci ferme
      // seulement le drawer une fois la sélection faite (bulle après coup).
      document.getElementById("islandSelector")?.addEventListener("click", event => {
        if (event.target.closest(".island-choice")) closeHudV2Drawer();
      });

      ["hudV2MoveCount", "hudV2PushCount", "hudV2MagicCount"].forEach((id, index) => {
        const type = ["MOVE", "PUSH", "MAGIC"][index];
        document.getElementById(id)?.addEventListener("click", () => {
          selectActionBatch(type, type === "PUSH" ? Math.max(1, state.pushForceChoice || 1) : 1);
        });
      });

      document.getElementById("hudV2MagicRotateLeft")?.addEventListener("click", () => rotateSelectedIsland(-1));
      document.getElementById("hudV2MagicRotateRight")?.addEventListener("click", () => rotateSelectedIsland(1));
      document.getElementById("hudV2MagicConfirm")?.addEventListener("click", () => confirmMagicRotation());
      document.getElementById("hudV2MagicCancel")?.addEventListener("click", () => handleCancelButton());

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

      document.addEventListener("click", event => {
        const island = document.getElementById("hudV2IslandDrawer");
        const gear = document.getElementById("hudV2GearPopover");
        const hand = document.getElementById("hudV2HandPopover");
        const islandBtn = document.getElementById("hudV2IslandStatus");
        const gearBtn = document.getElementById("hudV2GearBtn");
        const handBtn = document.getElementById("hudV2HandCount");
        const insideAny = [island, gear, hand].some(el => el && el.contains(event.target));
        const onTrigger = [islandBtn, gearBtn, handBtn].some(el => el === event.target);
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