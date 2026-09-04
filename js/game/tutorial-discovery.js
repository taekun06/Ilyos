      /* =====================================================================
         TUTORIEL — DÉCOUVERTE D'ILYOS

         Deux usages partagent désormais le même moteur :
         - `ILYOS_TUTORIAL.start()` : première découverte, libre et progressive ;
         - `ILYOS_TUTORIAL.startAscension()` : l'ancien parcours scénarisé
           « La Première Ascension », conservé comme future épreuve/puzzle.

         Ce fragment vit dans le même IIFE que tutorial.js. Il réutilise donc
         volontairement son overlay, sa narration, ses balises, son suivi des
         événements visuels et ses helpers d'état au lieu de créer un second
         moteur de tutoriel.
         ===================================================================== */

      const tutoStartPremiereAscension = tutoStart;
      const tutoExitBase = tutoExit;
      const tutoDebugAscension = window.ILYOS_TUTORIAL?._debug || (() => null);

      const DISCOVERY = {
        active: false,
        step: 0,
        stepStartedAt: 0,
        advanceTimer: null,
        lastCellClick: null,
        lastCharClickId: null,
        cameraPosition0: null,
        cameraQuaternion0: null,
        moveStart: null,
        voidTarget: null,
        crownTarget: null,
        transferFrom: null,
        validationRunning: false,
        validationPromise: null,
        styleReady: false
      };

      const DISCOVERY_HINT_DELAY = 12000;
      const DISCOVERY_HUD = {
        island: "#ov2Island",
        move: "#ov2Move",
        push: "#ov2Push",
        magic: "#ov2Magic"
      };

      function discInjectStyle() {
        if (DISCOVERY.styleReady || document.getElementById("ilyos-discovery-style")) return;
        const style = document.createElement("style");
        style.id = "ilyos-discovery-style";
        style.textContent = `
          #gameScreen.tutorial-discovery .disc-concealed{display:none!important;}
          #tutorialLayer.discovery .tuto-portrait{display:none;}
          #tutorialLayer.discovery .tuto-speech{width:min(610px,88vw);bottom:118px;}
          #tutorialLayer.discovery .tuto-bubble{font-size:14px;padding:10px 15px;
            background:rgba(9,16,34,.78);backdrop-filter:blur(7px);}
          #tutorialLayer.discovery .tuto-objective{top:68px;background:rgba(9,16,34,.72);}
          #tutorialLayer.discovery .tuto-quit{bottom:72px;opacity:.8;}
          #tutorialLayer.discovery .tuto-voice{bottom:72px;opacity:.8;}
          #tutorialLayer.discovery .disc-end-kicker{font-size:12px;letter-spacing:.16em;
            text-transform:uppercase;color:#91a8d6;}
        `;
        document.head.appendChild(style);
        DISCOVERY.styleReady = true;
      }

      function discInBounds(r, c) {
        return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < 11 && c < 11;
      }

      function discGuardians() {
        return (state?.characters || []).filter(ch => ch.player === 0);
      }

      function discCarrier() {
        const carrierId = state?.artifact?.carrierId;
        return carrierId == null ? null : (state.characters || []).find(ch => ch.id === carrierId) || null;
      }

      function discOtherGuardian(carrierId) {
        return discGuardians().find(ch => ch.id !== carrierId) || null;
      }

      function discManhattan(a, b) {
        return a && b ? Math.abs(a.r - b.r) + Math.abs(a.c - b.c) : Infinity;
      }

      function discFreeCellNear(r, c, { landOnly = false, avoidValidation = false } = {}) {
        const candidates = [[r - 1, c], [r, c - 1], [r, c + 1], [r + 1, c],
          [r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]];
        for (const [rr, cc] of candidates) {
          if (!discInBounds(rr, cc) || characterAt(rr, cc)) continue;
          if (landOnly && !isLand(rr, cc)) continue;
          if (avoidValidation && typeof isCrownValidationCell === "function"
            && isCrownValidationCell(state.players[0], rr, cc)) continue;
          return [rr, cc];
        }
        return null;
      }

      function discResetSelection() {
        if (!state) return;
        state.phase = "ACTION_SELECT";
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.selectedMagicPivot = null;
        state.pendingDirectMoveTarget = null;
        state.pushTargetId = null;
        state.pushOptions = [];
        state.reachable = new Set();
        state.crownTransferTargetIds = [];
        state.treasureDropFromId = null;
        state.treasureDropArtifactId = null;
      }

      function discSetHud(visible = []) {
        const keep = new Set(visible);
        Object.entries(DISCOVERY_HUD).forEach(([name, selector]) => {
          document.querySelectorAll(selector).forEach(el =>
            el.classList.toggle("disc-concealed", !keep.has(name)));
        });
      }

      function discRestoreHud() {
        document.querySelectorAll(".disc-concealed").forEach(el => el.classList.remove("disc-concealed"));
      }

      function discEnableFreeCamera() {
        try {
          if (typeof kaykit3D === "undefined" || !kaykit3D) return;
          clearInterval(TUTO.lockTimer);
          TUTO.lockTimer = null;
          kaykit3D.autoFit = false;
          kaykit3D.cameraTween = null;
          kaykit3D.cameraMode = "free";
          kaykit3D.userRotated = false;
          kaykit3D.userInteracting = false;
          if (kaykit3D.orbit) {
            kaykit3D.orbit.enabled = true;
            kaykit3D.orbit.enableRotate = true;
            kaykit3D.orbit.enablePan = true;
            kaykit3D.orbit.enableZoom = true;
          }
          if (kaykit3D.camera) {
            DISCOVERY.cameraPosition0 = kaykit3D.camera.position.clone();
            DISCOVERY.cameraQuaternion0 = kaykit3D.camera.quaternion.clone();
          }
        } catch (_) { }
      }

      function discCameraMoved() {
        try {
          if (!DISCOVERY.cameraPosition0 || !DISCOVERY.cameraQuaternion0 || !kaykit3D?.camera) return false;
          const posDelta = kaykit3D.camera.position.distanceTo(DISCOVERY.cameraPosition0);
          const dot = Math.min(1, Math.abs(kaykit3D.camera.quaternion.dot(DISCOVERY.cameraQuaternion0)));
          const angleDelta = 2 * Math.acos(dot);
          return posDelta > 0.35 || angleDelta > 0.08;
        } catch (_) { return false; }
      }

      function discBoardTap(event) {
        if (!DISCOVERY.active) return;
        const cell = event.target?.closest?.(".cell");
        if (!cell) return;
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        DISCOVERY.lastCellClick = { r, c, at: Date.now() };
        const ch = characterAt(r, c);
        if (ch) DISCOVERY.lastCharClickId = ch.id;
      }

      function discTouched() {
        if (!DISCOVERY.active) return;
        const hadHint = !!TUTO.hintShown;
        tutoTouched();
        if (hadHint) tutoSetObjective("");
      }

      function discBuildState() {
        tutoBuildState();
        state.islands.length = 0;
        state.characters.length = 0;
        state.players[0].score = 0;
        state.players[1].score = 0;
        state.players[0].isAI = false;
        state.players[1].isAI = false;
        state.players[0].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        state.players[1].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        state.artifact.active = false;
        state.artifact.carrierId = null;
        state.artifact.r = 2;
        state.artifact.c = 2;
        state.secondArtifact.active = false;
        state.islandPlacedThisTurn = false;
        state.centerCrownTakenThisTurn = false;
        state.rules.allowDissolve = false;
        state.rules.islandLimitPerPlayer = 0;

        // Une petite terre lisible, assez proche du village pour que le voyage
        // final reste court, mais entourée de vide afin que la pose d'île ait un sens.
        tutoAddIsland([[5, 2], [5, 3], [4, 2], [4, 3], [3, 2]], 0);
        state.characters.push({ id: `char-${state.nextCharId++}`, player: 0, r: 5, c: 2 });
        tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"]);
        discResetSelection();
        tutoRender();
      }

      function discChooseVoidTarget() {
        const g = discGuardians()[0];
        if (!g) return null;
        const candidates = [[g.r - 1, g.c], [g.r, g.c - 1], [g.r, g.c + 1], [g.r + 1, g.c]];
        const found = candidates.find(([r, c]) => discInBounds(r, c) && !isLand(r, c));
        return found || null;
      }

      function discPrepareCrown() {
        const guardians = discGuardians();
        const newborn = guardians[guardians.length - 1] || guardians[0];
        if (!newborn) return;

        let target = discFreeCellNear(newborn.r, newborn.c, { landOnly: true });
        if (!target) {
          target = discFreeCellNear(newborn.r, newborn.c);
          if (target) tutoEnsureLand([target]);
        }
        if (!target) target = [Math.max(0, newborn.r - 1), newborn.c];
        tutoEnsureLand([target]);

        DISCOVERY.crownTarget = target;
        state.artifact.active = true;
        state.artifact.carrierId = null;
        state.artifact.r = target[0];
        state.artifact.c = target[1];
        state.secondArtifact.active = false;
        state.islandPlacedThisTurn = true;
        state.players[0].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "MOVE"]);
        discResetSelection();
        tutoRender();
      }

      function discPrepareTransfer() {
        const carrier = discCarrier();
        const other = carrier && discOtherGuardian(carrier.id);
        if (!carrier || !other) return;
        DISCOVERY.transferFrom = carrier.id;

        // Le placement d'île est libre. S'il a créé un archipel très éloigné,
        // on rapproche seulement le Gardien non porteur à deux pas : le joueur
        // garde encore le geste important à faire (se rejoindre puis transmettre),
        // sans se retrouver avec huit cases de marche qui n'apprennent rien.
        if (discManhattan(carrier, other) > 4) {
          const near = discFreeCellNear(carrier.r, carrier.c);
          if (near) {
            const second = discFreeCellNear(near[0], near[1]);
            const destination = second || near;
            tutoEnsureLand([near, destination]);
            other.r = destination[0];
            other.c = destination[1];
          }
        }
        tutoEnsurePathFrom(other.r, other.c, carrier.r, carrier.c);
        state.players[0].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "MOVE"]);
        discResetSelection();
        tutoRender();
      }

      function discPrepareRival() {
        const carrier = discCarrier();
        if (!carrier) return;

        // Le retour au village devient un vrai petit problème tactique :
        // atteindre la case (0,0), puis chasser le rival de (0,1) vers (0,2)
        // sans chute. La destination est volontairement de la terre ferme.
        tutoEnsurePathFrom(carrier.r, carrier.c, 0, 0);
        tutoEnsureLand([[0, 0], [1, 0], [0, 1], [0, 2], [1, 1], [1, 2]]);

        // Évite qu'un allié soit exactement sur la case réservée au rival.
        discGuardians().filter(g => g.id !== carrier.id && g.r === 0 && g.c === 1)
          .forEach(g => { g.r = 1; g.c = 1; });
        if (carrier.r === 0 && carrier.c === 1) {
          carrier.r = 1; carrier.c = 0;
          state.artifact.r = carrier.r; state.artifact.c = carrier.c;
        }

        tutoSetEnemies([[0, 1]]);
        state.players[0].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
        tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "MOVE", "PUSH"]);
        state.islandPlacedThisTurn = true;
        discResetSelection();
        tutoRender();
      }

      function discRivalBlocksValidation() {
        const p = state?.players?.[0];
        if (!p) return true;
        if (typeof validationBloqueeParAdversaire === "function") {
          const carrier = discCarrier();
          if (carrier) return validationBloqueeParAdversaire(p, carrier.r, carrier.c);
        }
        return tutoEnemies().some(e => [[0, 0], [1, 0], [0, 1]].some(([r, c]) => e.r === r && e.c === c));
      }

      function discMoveRivalHarmlessly() {
        const enemy = tutoEnemies()[0];
        if (!enemy) return;
        const safe = [[1, 2], [0, 2], [1, 1], [2, 2]].find(([r, c]) =>
          discInBounds(r, c) && !characterAt(r, c)
          && !(typeof isCrownValidationCell === "function" && isCrownValidationCell(state.players[0], r, c)));
        if (!safe) return;
        tutoEnsureLand([safe]);
        enemy.r = safe[0]; enemy.c = safe[1];
        tutoRender();
      }

      async function discRunValidationCycle() {
        if (!DISCOVERY.active || DISCOVERY.validationRunning) return;
        DISCOVERY.validationRunning = true;
        state.inputLocked = true;
        discSetHud([]);
        tutoSetObjective("");

        tutoSayLines([
          "Tu es revenu.",
          "Mais une Couronne ne s'ancre qu'au début de ton prochain tour."
        ]);
        await tutoWait(1800);
        if (!DISCOVERY.active) return;

        state.inputLocked = false;
        try { await endTurn(true); } catch (_) { }
        if (!DISCOVERY.active) return;

        state.inputLocked = true;
        tutoSayLines(["Le rival a encore un tour."]);
        await tutoWait(1500);
        if (!DISCOVERY.active) return;
        discMoveRivalHarmlessly();
        await tutoWait(900);

        state.inputLocked = false;
        try { await endTurn(true); } catch (_) { }
        if (state) state.inputLocked = false;
        DISCOVERY.validationRunning = false;
      }

      const DISCOVERY_STEPS = [
        {
          id: "regarder",
          intro: [],
          hint: "Fais tourner le monde.",
          setup() {
            discSetHud([]);
            setTimeout(() => { if (DISCOVERY.active) tutoSayLines(["Regarde."]); }, 900);
          },
          done: () => discCameraMoved()
        },
        {
          id: "gardien",
          intro: ["Là."],
          hint: "Touche ton Gardien.",
          guide: () => {
            const g = discGuardians()[0];
            return { cells: g ? [[g.r, g.c]] : [] };
          },
          setup() { discSetHud([]); DISCOVERY.lastCharClickId = null; },
          done() {
            const g = discGuardians()[0];
            return !!g && DISCOVERY.lastCharClickId === g.id;
          }
        },
        {
          id: "marcher",
          intro: ["Il peut avancer."],
          hint: "Choisis DÉPLACER, puis une autre case de terre.",
          guide: () => {
            const g = discGuardians()[0];
            if (!g) return { hud: [DISCOVERY_HUD.move], cells: [] };
            const land = [[g.r - 1, g.c], [g.r, g.c + 1], [g.r - 1, g.c + 1]]
              .filter(([r, c]) => discInBounds(r, c) && isLand(r, c) && !characterAt(r, c));
            return { hud: [DISCOVERY_HUD.move], cells: [[g.r, g.c], ...land] };
          },
          setup() {
            const g = discGuardians()[0];
            DISCOVERY.moveStart = g ? { r: g.r, c: g.c } : null;
            discSetHud(["move"]);
            discResetSelection();
            tutoRender();
          },
          done() {
            const g = discGuardians()[0];
            return !!(g && DISCOVERY.moveStart
              && (g.r !== DISCOVERY.moveStart.r || g.c !== DISCOVERY.moveStart.c));
          }
        },
        {
          id: "vide",
          intro: ["Et après ?"],
          hint: "Essaie la case vide juste devant toi.",
          guide: () => ({ cells: DISCOVERY.voidTarget ? [DISCOVERY.voidTarget] : [] }),
          setup() {
            discSetHud(["move"]);
            DISCOVERY.lastCellClick = null;
            DISCOVERY.voidTarget = discChooseVoidTarget();
            discResetSelection();
            tutoRender();
          },
          done() {
            const tap = DISCOVERY.lastCellClick;
            if (!tap) return false;
            if (DISCOVERY.voidTarget
              && tap.r === DISCOVERY.voidTarget[0] && tap.c === DISCOVERY.voidTarget[1]) return true;
            return discInBounds(tap.r, tap.c) && !isLand(tap.r, tap.c);
          }
        },
        {
          id: "ile",
          intro: ["Alors, crée le chemin."],
          hint: "Ouvre ÎLE, pose une terre dans le vide, puis choisis où éveiller le nouveau Gardien.",
          guide: () => ({
            hud: [DISCOVERY_HUD.island],
            cells: DISCOVERY.voidTarget ? [DISCOVERY.voidTarget] : []
          }),
          setup() {
            discSetHud(["island"]);
            state.islandPlacedThisTurn = false;
            state.pendingSpawnIslandId = null;
            discResetSelection();
            tutoRender();
          },
          done() { return !!state.islandPlacedThisTurn && discGuardians().length >= 2; }
        },
        {
          id: "couronne",
          intro: ["Une lumière."],
          hint: "Amène un Gardien sur la Couronne.",
          guide: () => ({
            hud: [DISCOVERY_HUD.move],
            cells: DISCOVERY.crownTarget ? [DISCOVERY.crownTarget] : []
          }),
          setup() {
            discSetHud(["move"]);
            discPrepareCrown();
          },
          done() { return !!discCarrier(); }
        },
        {
          id: "transmission",
          intro: ["Deux Gardiens. Une même lumière."],
          hint: "Rapproche tes Gardiens. Clique le porteur, puis un allié adjacent pour lui transmettre la Couronne.",
          guide: () => {
            const carrier = discCarrier();
            const other = carrier && discOtherGuardian(carrier.id);
            return { hud: [DISCOVERY_HUD.move], cells: [carrier, other].filter(Boolean).map(g => [g.r, g.c]) };
          },
          setup() {
            discSetHud(["move"]);
            discPrepareTransfer();
          },
          done() {
            const carrier = discCarrier();
            return !!(carrier && DISCOVERY.transferFrom && carrier.id !== DISCOVERY.transferFrom
              && carrier.player === 0);
          }
        },
        {
          id: "rival",
          intro: ["Quelqu'un te barre le retour."],
          hint: "Ramène la Couronne au village, puis utilise POUSSER pour écarter le rival sans le faire tomber.",
          guide: () => ({
            hud: [DISCOVERY_HUD.move, DISCOVERY_HUD.push],
            cells: [...tutoEnemies().map(e => [e.r, e.c]), [0, 0], [0, 2]]
          }),
          setup() {
            discSetHud(["move", "push"]);
            discPrepareRival();
          },
          done() {
            const carrier = discCarrier();
            const p = state?.players?.[0];
            if (!carrier || !p) return false;
            const onValidation = typeof isCrownValidationCell === "function"
              ? isCrownValidationCell(p, carrier.r, carrier.c)
              : [[0, 0], [1, 0], [0, 1]].some(([r, c]) => carrier.r === r && carrier.c === c);
            return onValidation && !discRivalBlocksValidation();
          }
        },
        {
          id: "tenir",
          intro: [],
          hint: "Observe le tour adverse.",
          setup() {
            discSetHud([]);
            DISCOVERY.validationRunning = false;
            DISCOVERY.validationPromise = discRunValidationCycle();
          },
          done() { return (state?.players?.[0]?.score || 0) >= 1; }
        }
      ];

      function discShowHint(step) {
        TUTO.hintShown = true;
        if (step.hint) tutoSetObjective(step.hint);
        if (typeof step.guide === "function") {
          try { tutoGuideStart(step.guide()); } catch (_) { }
        }
      }

      function discArm(step) {
        TUTO.lastAct = Date.now();
        TUTO.hintShown = false;
        const check = () => {
          if (!DISCOVERY.active || DISCOVERY_STEPS[DISCOVERY.step] !== step) return;
          try { if (typeof step.tick === "function") step.tick(); } catch (_) { }
          if (TUTO.sayBusy) TUTO.lastAct = Date.now();
          else if (!TUTO.hintShown && Date.now() - TUTO.lastAct > DISCOVERY_HINT_DELAY) discShowHint(step);

          let ok = false;
          try { ok = !!step.done(); } catch (_) { ok = false; }
          if (!ok) return;
          tutoDisarm();
          tutoSetObjective("");
          discStepCleared(step);
        };
        TUTO.pollTimer = setInterval(check, 250);
        const bus = window.ILYOS_VISUAL_EVENTS;
        if (bus && typeof bus.on === "function") {
          ["islandPlaced", "characterSpawned", "crownPicked", "characterMoveEnded",
            "characterPushed", "characterFell", "crownScored"]
            .forEach(name => TUTO.eventUnsubs.push(bus.on(name, () => setTimeout(check, 40))));
        }
      }

      function discGoto(index) {
        const step = DISCOVERY_STEPS[index];
        if (!step) return discFinish();
        tutoDisarm();
        clearTimeout(DISCOVERY.advanceTimer);
        DISCOVERY.step = index;
        DISCOVERY.stepStartedAt = Date.now();
        TUTO.beatIndex = index;
        TUTO.gateAllows = () => true;
        tutoSetObjective("");
        tutoGuideStop();
        try { step.setup?.(); } catch (err) { console.warn("[tuto/discovery] setup", step.id, err); }
        if (step.intro?.length) tutoSayLines(step.intro);
        discArm(step);
      }

      function discStepCleared(step) {
        try { if (typeof playSfx === "function") playSfx("crown"); } catch (_) { }
        const lines = {
          regarder: ["Le monde répond à ton regard."],
          gardien: ["Il t'écoute."],
          marcher: ["La terre porte ses pas."],
          vide: ["Le vide ne se traverse pas."],
          ile: ["Un autre Gardien s'éveille."],
          couronne: ["Elle voyage avec lui."],
          transmission: ["La Couronne peut passer d'un allié à l'autre."],
          rival: ["Tu es revenu. Mais ce n'est pas encore gagné."],
          tenir: []
        }[step.id] || [];

        const next = DISCOVERY.step + 1;
        let advanced = false;
        const advance = () => {
          if (advanced || !DISCOVERY.active) return;
          advanced = true;
          clearTimeout(DISCOVERY.advanceTimer);
          discGoto(next);
        };
        DISCOVERY.advanceTimer = setTimeout(advance, 5200);
        if (lines.length) tutoSayLines(lines, { then: () => setTimeout(advance, 450) });
        else setTimeout(advance, 350);
      }

      function discBuildEndCard() {
        const d = TUTO.dom;
        if (!d || d.layer.querySelector(".tuto-end")) return;
        const end = document.createElement("div");
        end.className = "tuto-end";
        end.innerHTML = `
          <div class="disc-end-kicker">Découverte accomplie</div>
          <h2>La lumière est revenue.</h2>
          <p>Tu sais bâtir, déplacer, transmettre, pousser et surtout pourquoi une Couronne doit survivre jusqu'à ton prochain tour.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
            <button type="button" class="tuto-btn primary" data-tuto="play">Entrer dans une vraie partie</button>
            <button type="button" class="tuto-btn" data-tuto="menu">Retour au menu</button>
          </div>`;
        d.layer.appendChild(end);
        end.querySelector('[data-tuto="menu"]').addEventListener("click", () => tutoExit(true));
        end.querySelector('[data-tuto="play"]').addEventListener("click", () => {
          tutoExit(false);
          try {
            els.gameScreen.classList.add("hidden");
            els.setupScreen.classList.remove("hidden");
          } catch (_) { }
        });
      }

      function discFinish() {
        try { localStorage.setItem(TUTO_STORAGE_KEY, "1"); } catch (_) { }
        tutoDisarm();
        clearTimeout(DISCOVERY.advanceTimer);
        discSetHud([]);
        TUTO.gateAllows = () => false;
        tutoSetObjective("");
        tutoGuideStop();
        tutoBloom();
        tutoSayLines([
          "Voilà la règle qu'aucun symbole ne pouvait te montrer.",
          "La lumière revient au début de ton tour — si tu as réussi à la garder."
        ], { then: () => setTimeout(discBuildEndCard, 400) });
        // La voix navigateur peut être absente ou rester muette : l'écran final
        // ne doit jamais dépendre d'elle pour apparaître.
        setTimeout(() => { if (DISCOVERY.active) discBuildEndCard(); }, 6500);
      }

      function discCleanup() {
        clearTimeout(DISCOVERY.advanceTimer);
        DISCOVERY.advanceTimer = null;
        DISCOVERY.active = false;
        DISCOVERY.validationRunning = false;
        DISCOVERY.validationPromise = null;
        DISCOVERY.lastCellClick = null;
        DISCOVERY.lastCharClickId = null;
        DISCOVERY.cameraPosition0 = null;
        DISCOVERY.cameraQuaternion0 = null;
        try { els.board?.removeEventListener("click", discBoardTap, true); } catch (_) { }
        try { els.board?.removeEventListener("mousedown", discBoardTap, true); } catch (_) { }
        try { els.board?.removeEventListener("pointerdown", discBoardTap, true); } catch (_) { }
        try { els.gameScreen?.removeEventListener("pointerdown", discTouched, true); } catch (_) { }
        els.gameScreen?.classList.remove("tutorial-discovery");
        TUTO.dom?.layer?.classList.remove("discovery");
        discRestoreHud();
      }

      // La sortie du moteur reste unique. On lui ajoute seulement le nettoyage
      // propre à la découverte avant de laisser tutorial.js restaurer caméra,
      // rendu, overlay, listeners et retour menu.
      tutoExit = function (toMenu) {
        discCleanup();
        return tutoExitBase(toMenu);
      };

      function tutoDiscoveryStart() {
        if (TUTO.active) return;
        DISCOVERY.active = true;
        DISCOVERY.step = 0;
        DISCOVERY.validationRunning = false;
        DISCOVERY.lastCellClick = null;
        DISCOVERY.lastCharClickId = null;
        discInjectStyle();
        tutoInjectStyle();
        tutoBuildOverlay();
        tutoWatchCancelBtn();
        tutoSyncVoiceButton();
        TUTO.dom?.layer?.classList.add("discovery");
        try {
          TUTO.voice = tutoPickVoice();
          speechSynthesis.onvoiceschanged = () => { TUTO.voice = tutoPickVoice(); };
        } catch (_) { }
        TUTO.active = true;

        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
        try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }
        try { TUTO.prevRenderMode = boardRenderMode; } catch (_) { TUTO.prevRenderMode = "3d"; }
        try { boardRenderMode = "3d"; } catch (_) { }

        discBuildState();
        try { applyVisualMode("alternative"); } catch (_) { }
        try { if (typeof applyBoardRenderMode === "function") applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        els.gameScreen?.classList.add("tutorial-on", "tutorial-discovery");

        state.turnDurationSeconds = 0;
        state.turnDeadline = null;
        state.turnTimeLeft = null;
        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }

        // Observation uniquement : contrairement à La Première Ascension, on ne
        // filtre pas les clics valides. Le joueur peut essayer, se tromper et
        // regarder librement. Ces listeners ne font qu'observer son geste.
        els.board?.addEventListener("click", discBoardTap, true);
        els.board?.addEventListener("mousedown", discBoardTap, true);
        els.board?.addEventListener("pointerdown", discBoardTap, true);
        els.gameScreen?.addEventListener("pointerdown", discTouched, true);
        TUTO.dom?.bubble?.addEventListener("click", tutoSpeechClick);
        window.addEventListener("keydown", tutoKeyGuard, true);
        ["contextmenu", "pointerdown", "mousedown", "mouseup", "auxclick"].forEach(type =>
          window.addEventListener(type, tutoRightClickGuard, true));

        const bus = window.ILYOS_VISUAL_EVENTS;
        if (bus && typeof bus.on === "function") {
          TUTO.fxUnsubs = [
            bus.on("characterFell", () => { if (TUTO.active) { tutoShake(); tutoVoidPulse(); } }),
            bus.on("crownScored", () => { if (TUTO.active) tutoBloom(); }),
            bus.on("crownPicked", () => { if (TUTO.active) tutoBloom(); })
          ];
        }

        discSetHud([]);
        tutoRender();
        setTimeout(async () => {
          if (!DISCOVERY.active) return;
          await tutoWaitForScene();
          if (!DISCOVERY.active) return;
          // La caméra de départ globale finit ses deux recentrages à ~520 ms.
          // On passe ensuite définitivement en libre et on prend cette pose
          // comme référence pour détecter un vrai mouvement du joueur.
          await tutoWait(650);
          discEnableFreeCamera();
          tutoFadeBlack(false);
          discGoto(0);
        }, 450);
      }

      /* ---------------------------------------------------------------------
         CORRECTION DE « LA PREMIÈRE ASCENSION »

         L'ancien chapitre V validait directement la Couronne depuis son tick,
         alors que la vraie règle appelle scoreCrownsAtTurnStart au début du
         prochain tour du propriétaire. On conserve le puzzle, mais on lui fait
         maintenant vivre un aller-retour de tour réel avec endTurn(true).
         --------------------------------------------------------------------- */
      const ascensionCrownBeat = TUTO_BEATS.find(beat => beat.id === "couronnement");
      if (ascensionCrownBeat) {
        const ascensionFailBase = ascensionCrownBeat.fail;
        const ascensionSetupBase = ascensionCrownBeat.setup;
        ascensionCrownBeat.setup = function (replay) {
          TUTO.ascensionValidationRunning = false;
          return ascensionSetupBase.call(this, replay);
        };
        ascensionCrownBeat.fail = function () {
          if (TUTO.ascensionValidationRunning) return false;
          return typeof ascensionFailBase === "function" ? ascensionFailBase.call(this) : false;
        };
        ascensionCrownBeat.tick = function () {
          if (TUTO.ascensionValidationRunning || DISCOVERY.active) return;
          const g = tutoGuardian0();
          const p = state?.players?.[0];
          if (!g || !p || state.currentPlayer !== 0) return;
          if (typeof artifactCarriedBy !== "function" || !artifactCarriedBy(g.id)) return;
          if (typeof isCrownValidationCell !== "function" || !isCrownValidationCell(p, g.r, g.c)) return;
          if (typeof validationBloqueeParAdversaire === "function"
            && validationBloqueeParAdversaire(p, g.r, g.c)) return;

          TUTO.ascensionValidationRunning = true;
          state.inputLocked = true;
          tutoSayLines(["Tiens-la jusqu'à ton prochain tour."], {
            then: () => setTimeout(async () => {
              if (!TUTO.active || DISCOVERY.active) return;
              state.inputLocked = false;
              try { await endTurn(true); } catch (_) { }
              if (!TUTO.active || DISCOVERY.active) return;
              state.inputLocked = true;
              await tutoWait(1300);
              state.inputLocked = false;
              try { await endTurn(true); } catch (_) { }
              if (state) state.inputLocked = false;
              TUTO.ascensionValidationRunning = false;
            }, 250)
          });
        };
      }

      // Le listener menu déclaré dans tutorial.js appelle `tutoStart()` au
      // moment du clic. Réassigner ce binding suffit donc à faire du nouveau
      // parcours l'entrée officielle, sans dupliquer ni modifier le bridge menu.
      tutoStart = tutoDiscoveryStart;

      window.ILYOS_TUTORIAL = {
        ...window.ILYOS_TUTORIAL,
        start: tutoDiscoveryStart,
        startDiscovery: tutoDiscoveryStart,
        startAscension: () => {
          discCleanup();
          TUTO.ascensionValidationRunning = false;
          return tutoStartPremiereAscension();
        },
        mode: () => DISCOVERY.active ? "discovery" : (TUTO.active ? "ascension" : null),
        _debug: () => {
          if (!DISCOVERY.active) return { mode: TUTO.active ? "ascension" : null, legacy: tutoDebugAscension() };
          return {
            mode: "discovery",
            step: DISCOVERY.step,
            id: DISCOVERY_STEPS[DISCOVERY.step]?.id || null,
            phase: state?.phase,
            currentPlayer: state?.currentPlayer,
            score: state?.players?.[0]?.score || 0,
            chars: (state?.characters || []).map(ch => ({ id: ch.id, p: ch.player, r: ch.r, c: ch.c })),
            crown: state?.artifact ? {
              active: state.artifact.active,
              carrierId: state.artifact.carrierId,
              r: state.artifact.r,
              c: state.artifact.c
            } : null,
            islandPlaced: !!state?.islandPlacedThisTurn,
            validationRunning: DISCOVERY.validationRunning
          };
        }
      };
