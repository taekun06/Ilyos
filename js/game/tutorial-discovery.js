      /* =====================================================================
         TUTORIEL — DÉCOUVERTE D'ILYOS

         Deux usages partagent désormais le même moteur :
         - `ILYOS_TUTORIAL.start()` : première découverte, libre et progressive ;
         - `ILYOS_TUTORIAL.startAscension()` : l'ancien parcours scénarisé
           « La Première Ascension », conservé comme future épreuve/puzzle.

         La Découverte est MUETTE : pas une consigne, pas une réplique, pas un
         bandeau d'objectif. Le joueur apprend par le cadrage de la caméra, la
         lumière posée sur ce qui compte, un HUD réduit à ce qui sert, et la
         conséquence immédiate de son geste. La grammaire tient en cinq signes
         (Appel, Promesse, Refus, Assentiment, Souffle) définis plus bas, et
         l'aide ne monte que sur l'immobilité, jamais sur l'horloge.

         Ce fragment vit dans le même IIFE que tutorial.js. Il réutilise donc
         volontairement son overlay, ses balises, son suivi des événements
         visuels et ses helpers d'état au lieu de créer un second moteur de
         tutoriel. La narration écrite/parlée de tutorial.js reste en place pour
         « La Première Ascension » seule, et est masquée en mode découverte.
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
        styleReady: false,
        // Grammaire muette
        promesseNode: null,
        promesseFrame: 0,
        souffleEnCours: false,
        cameraNotre: false,  // un recadrage à nous, pas un geste du joueur
        sasFini: false,      // le sas d'ouverture a rendu la caméra
        refusAt: 0,
        aide: 0,             // palier d'aide atteint sur l'étape en cours
        trace: []            // instrumentation : une ligne par étape franchie
      };

      /* L'aide ne monte que sur l'IMMOBILITÉ, jamais sur l'horloge seule :
         faire tourner le monde, survoler des cases, ouvrir un bouton comptent
         comme de l'activité (voir discTouched / tutoTouched) et remettent le
         compteur à zéro. Quelqu'un qui regarde n'est pas quelqu'un qui bloque.

         Palier 1 : l'Appel, à peine une respiration.
         Palier 2 : l'Appel s'affirme, et la caméra recadre la zone utile.
         Palier 3 : la Promesse s'offre sans qu'on l'ait demandée.

         Il n'y a pas de palier 4 : jamais de démonstration qui joue à la
         place du joueur. */
      const DISCOVERY_AIDE = [8000, 18000, 30000];
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

          /* --- Découverte muette : aucun canal écrit ni parlé -------------
             La bulle de narration, le portrait, le bandeau d'objectif et le
             bouton de voix appartenaient au tutoriel raconté. Ici rien ne
             parle : ce qui reste à l'écran, c'est le plateau et le HUD. */
          #tutorialLayer.discovery .tuto-speech,
          #tutorialLayer.discovery .tuto-portrait,
          #tutorialLayer.discovery .tuto-objective,
          #tutorialLayer.discovery .tuto-voice{display:none!important;}
          #tutorialLayer.discovery .tuto-quit{bottom:72px;opacity:.55;
            transition:opacity .3s, bottom .5s;}
          #tutorialLayer.discovery .tuto-quit:hover{opacity:1;}
          #tutorialLayer.discovery .disc-end-kicker{font-size:12px;letter-spacing:.16em;
            text-transform:uppercase;color:#91a8d6;}

          /* --- L'APPEL : « c'est ici que ça se passe » --------------------
             Palier 1, la balise de lumière respire à peine. Palier 2, elle
             s'affirme. C'est le même objet, jamais deux langages différents. */
          #tutorialLayer.discovery.appel-1 .tuto-beacon{opacity:.72;}
          #tutorialLayer.discovery.appel-1 .tuto-beacon::before{animation-duration:3.4s;}
          #tutorialLayer.discovery.appel-1 .tuto-beacon::after{animation-duration:3.4s;}
          #tutorialLayer.discovery.appel-1 .tuto-pulse,
          #gameScreen.tutorial-discovery.appel-1 .tuto-pulse{animation-duration:3s;
            filter:drop-shadow(0 0 6px rgba(255,226,150,.5));}

          /* --- LA PROMESSE : « voilà ce qui va arriver » ------------------
             Un fil de lumière tendu entre la case de départ et la case
             d'arrivée. Ne dit rien, montre le geste. */
          #tutorialLayer .disc-promesse{position:absolute;left:0;top:0;width:100%;height:100%;
            pointer-events:none;z-index:6;overflow:visible;}
          #tutorialLayer .disc-promesse .fil-ombre{stroke:rgba(20,14,4,.55);stroke-width:9;
            stroke-linecap:round;}
          #tutorialLayer .disc-promesse .fil{stroke:rgba(255,244,206,.98);stroke-width:4;
            stroke-linecap:round;stroke-dasharray:10 12;
            filter:drop-shadow(0 0 8px rgba(255,214,120,1));
            animation:disc-fil 1.4s linear infinite;}
          @keyframes disc-fil{to{stroke-dashoffset:-44;}}
          /* L'arrivée porte un anneau franc : entre deux cases voisines le
             trait est court, c'est lui qui dit « ici ». */
          #tutorialLayer .disc-promesse .bout{fill:none;stroke:rgba(255,246,214,.98);stroke-width:3;
            filter:drop-shadow(0 0 10px rgba(255,196,90,.95));
            transform-box:fill-box;transform-origin:center;
            animation:disc-fil-bout 1.9s ease-out infinite;}
          @keyframes disc-fil-bout{0%{transform:scale(.55);opacity:1}
            75%{transform:scale(1.25);opacity:0}100%{opacity:0}}


          /* --- LE REFUS : le monde se rétracte, brièvement ---------------- */
          #gameScreen.tutorial-discovery.disc-refus .board-wrap{animation:disc-refus-k .34s ease-out;}
          @keyframes disc-refus-k{0%,100%{filter:none}45%{filter:brightness(.82) saturate(.6)}}
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

      /* ==================================================================
         LA GRAMMAIRE MUETTE

         Un signal = un sens, partout, pour toujours. Le joueur n'apprend
         jamais un mot : il apprend six signes, une seule fois.

           L'APPEL       « c'est ici »          balise + bouton qui respire
           LA PROMESSE   « voilà ce qui vient » fil de lumière départ → arrivée
           LE REFUS      « pas ça »             le monde se rétracte
           L'ASSENTIMENT « oui »                éclat chaud
           LE SOUFFLE    « regarde »            la caméra cadre, on n'a pas la main

         Tout est local à la découverte : rien n'est partagé avec les
         Sanctuaires ni avec le jeu normal, dont les affordances (anneaux,
         prévisualisations) ne sont ici que lues, jamais modifiées.
         ================================================================== */

      /* L'APPEL. `niveau` 1 = à peine une respiration, 2 = assumé. Le spec est
         celui de tutoGuideStart (cases + sélecteurs de HUD). */
      function discAppel(spec, niveau) {
        const layer = TUTO.dom?.layer;
        if (!layer || !spec) return;
        layer.classList.toggle("appel-1", niveau === 1);
        els.gameScreen?.classList.toggle("appel-1", niveau === 1);
        try { tutoGuideStart(spec); } catch (_) { }
      }

      function discAppelStop() {
        TUTO.dom?.layer?.classList.remove("appel-1");
        els.gameScreen?.classList.remove("appel-1");
        tutoGuideStop();
      }

      /* LA PROMESSE. Un fil tendu de `from` vers `to`, reprojeté à chaque
         image depuis les positions 3D (tutoCellToScreen gère 2D comme 3D), donc
         il tient quand la caméra bouge. C'est la seule chose du tutoriel qui
         montre une conséquence avant qu'elle arrive. */
      function discPromesse(from, to) {
        discPromesseStop();
        const layer = TUTO.dom?.layer;
        if (!layer || !from || !to) return;
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "disc-promesse");
        const ombre = document.createElementNS(NS, "line");
        ombre.setAttribute("class", "fil-ombre");
        const line = document.createElementNS(NS, "line");
        line.setAttribute("class", "fil");
        const bout = document.createElementNS(NS, "circle");
        bout.setAttribute("class", "bout");
        bout.setAttribute("r", "17");
        svg.appendChild(ombre); svg.appendChild(line); svg.appendChild(bout);
        layer.appendChild(svg);
        DISCOVERY.promesseNode = svg;

        const suivre = () => {
          if (!DISCOVERY.active || DISCOVERY.promesseNode !== svg) return;
          const a = tutoCellToScreen(from[0], from[1]);
          const b = tutoCellToScreen(to[0], to[1]);
          if (!a || !b) { svg.style.display = "none"; }
          else {
            svg.style.display = "block";
            [ombre, line].forEach(el => {
              el.setAttribute("x1", a.x); el.setAttribute("y1", a.y);
              el.setAttribute("x2", b.x); el.setAttribute("y2", b.y);
            });
            bout.setAttribute("cx", b.x); bout.setAttribute("cy", b.y);
          }
          DISCOVERY.promesseFrame = requestAnimationFrame(suivre);
        };
        suivre();
      }

      function discPromesseStop() {
        cancelAnimationFrame(DISCOVERY.promesseFrame);
        DISCOVERY.promesseFrame = 0;
        DISCOVERY.promesseNode?.remove();
        DISCOVERY.promesseNode = null;
      }

      /* LE REFUS. Jamais une phrase : le monde se ternit un quart de seconde
         et revient. On ne bloque rien — le geste a simplement été sans effet,
         et ça se voit. */
      function discRefus() {
        const g = els.gameScreen;
        if (!g) return;
        const now = Date.now();
        if (now - (DISCOVERY.refusAt || 0) < 700) return;
        DISCOVERY.refusAt = now;
        g.classList.remove("disc-refus");
        void g.offsetWidth;
        g.classList.add("disc-refus");
        setTimeout(() => g.classList.remove("disc-refus"), 420);
      }

      /* Tout recadrage passe par ici. `tutoTravel` appelle `tutoLockCamera`,
         qui coupe la rotation à la souris : sans cette restitution, le premier
         plan de caméra confisquerait définitivement le monde au joueur. */
      function discTravel(r, c, duree, zoom) {
        tutoTravel(r, c, duree, zoom || 0);
        clearTimeout(DISCOVERY.rendreCameraTimer);
        DISCOVERY.rendreCameraTimer = setTimeout(() => {
          if (DISCOVERY.active && !DISCOVERY.souffleEnCours) discEnableFreeCamera();
        }, (duree || 0) + 120);
      }

      /* L'INVITATION. Une seule étape ne porte sur aucune case : celle où
         l'on découvre qu'on peut tourner le monde. Rien à éclairer, donc — on
         fait dériver la caméra de quelques degrés, doucement, puis on s'arrête.
         Le monde a bougé une fois : le joueur comprend qu'il peut le bouger.

         Tout le piège est là : ce mouvement ne doit pas franchir l'étape à la
         place du joueur. Tant qu'il dure, `discCameraMoved` répond non ; et
         quand il finit, discEnableFreeCamera reprend la pose d'arrivée comme
         nouvelle référence. Seul le geste du joueur compte encore. */
      function discInviterARegarder() {
        if (DISCOVERY.cameraNotre || DISCOVERY.souffleEnCours) return;
        const g = discGuardians()[0];
        if (!g) return;
        DISCOVERY.cameraNotre = true;
        discTravel(g.r, g.c + 1.8, 1700, -0.2);
        clearTimeout(DISCOVERY.inviteTimer);
        DISCOVERY.inviteTimer = setTimeout(() => {
          DISCOVERY.cameraNotre = false;
        }, 2100);   // après discTravel (1700 + 120), donc après la recalibration
      }

      /* LE SOUFFLE. La caméra raconte : une suite de cadrages joués d'affilée,
         letterbox posée, plateau intouchable. Rend la main en caméra libre. */
      async function discSouffle(plans) {
        if (!plans?.length) return;
        DISCOVERY.souffleEnCours = true;
        TUTO.cinematic = true;
        tutoLetterbox(true);
        if (state) state.inputLocked = true;
        for (const [r, c, duree, zoom] of plans) {
          if (!DISCOVERY.active) break;
          tutoTravel(r, c, duree, zoom || 0);
          await tutoWait(duree);
        }
        if (state) state.inputLocked = false;
        tutoLetterbox(false);
        TUTO.cinematic = false;
        DISCOVERY.souffleEnCours = false;
        // Le souffle a repris la caméra : on la rend, et on reprend la pose
        // courante comme nouvelle référence (l'étape « regarder » compare à elle).
        if (DISCOVERY.active) discEnableFreeCamera();
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
          // Un mouvement que NOUS avons déclenché n'est pas le geste du joueur.
          if (DISCOVERY.cameraNotre) return false;
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

        /* LE REFUS. Toucher le vide ne fait rien — sauf à l'étape « vide »,
           où c'est précisément la leçon et où le geste doit aboutir. Ailleurs,
           le monde se ternit un instant : le joueur apprend que la terre porte
           et que le vide, non. Aucun clic n'est bloqué pour autant. */
        try {
          const étape = DISCOVERY_STEPS[DISCOVERY.step];
          if (étape && étape.id !== "vide" && discInBounds(r, c) && !isLand(r, c)) discRefus();
        } catch (_) { }
      }

      /* Toute action du joueur — un clic, un bouton, une rotation de caméra —
         redescend l'aide à zéro : il a repris la main, on se tait. */
      function discTouched() {
        if (!DISCOVERY.active) return;
        tutoTouched();
        if (DISCOVERY.aide > 0 || DISCOVERY.promesseNode) discAideStop();
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
        state.rules.disableSecondCrown = true;

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
        // entrer par (1,0), atteindre (0,0), puis chasser le rival de (0,1)
        // vers (0,2) sans chute. Construire directement vers (0,0) ferait
        // passer le chemin par la case (0,1) que le rival vient bloquer.
        tutoEnsurePathFrom(carrier.r, carrier.c, 1, 0);
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
        const returnPath = typeof shortestMovementPath === "function"
          ? shortestMovementPath(carrier, 0, 0, GRID * GRID)
          : null;
        const returnMoves = Math.max(
          6,
          returnPath?.cost || returnPath?.length || (Math.abs(carrier.r - 1) + carrier.c + 1)
        );
        tutoSetHand([...Array(returnMoves).fill("MOVE"), "PUSH"]);
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

        /* La règle la plus abstraite du jeu — une Couronne ne s'ancre qu'au
           début de ton PROCHAIN tour — est ici jouée, pas énoncée. Le plan
           tient sur le porteur pendant que les tours passent : le joueur voit
           le temps s'écouler avec la Couronne encore en suspens, puis l'éclat
           au moment exact où elle s'ancre. C'est la seule façon de la montrer. */
        const carrier = discCarrier();
        TUTO.cinematic = true;
        tutoLetterbox(true);
        if (carrier) tutoTravel(carrier.r, carrier.c, 1400, 0.8);
        await tutoWait(1800);
        if (!DISCOVERY.active) return;

        state.inputLocked = false;
        try { await endTurn(true); } catch (_) { }
        if (!DISCOVERY.active) return;

        // Le tour adverse : la caméra le suit, c'est lui qui parle maintenant.
        state.inputLocked = true;
        const rival = tutoEnemies()[0];
        if (rival) tutoTravel(rival.r, rival.c, 1200, 0.5);
        await tutoWait(1500);
        if (!DISCOVERY.active) return;
        discMoveRivalHarmlessly();
        await tutoWait(900);
        // Retour sur la Couronne, juste avant qu'elle s'ancre.
        const porteur = discCarrier();
        if (porteur) tutoTravel(porteur.r, porteur.c, 1100, 0.8);
        await tutoWait(700);
        tutoLetterbox(false);
        TUTO.cinematic = false;
        discEnableFreeCamera();       // le plan rend la caméra, toujours

        state.inputLocked = false;
        try { await endTurn(true); } catch (_) { }
        if (state) state.inputLocked = false;
        DISCOVERY.validationRunning = false;
      }

      /* Chaque étape peut porter :
           souffle()  — les plans de caméra joués à l'entrée (le « regarde »)
           guide()    — l'Appel : cases à éclairer + boutons du HUD
           promesse() — {from,to} : le fil montré au dernier palier d'aide
         Aucune ne porte de texte. C'est la règle du parcours. */
      const DISCOVERY_STEPS = [
        {
          id: "regarder",
          setup() { discSetHud([]); },
          /* Rien à éclairer : l'objet de l'étape, c'est le monde entier. Et
             surtout : la caméra ne doit PAS bouger toute seule ici, sinon le
             tutoriel franchit l'étape à la place du joueur. L'aide est donc le
             mime du geste, jamais le geste lui-même. */
          guide: () => ({ cells: [] }),
          invite: discInviterARegarder,
          done: () => discCameraMoved()
        },
        {
          id: "gardien",
          // La caméra descend sur lui et s'arrête : le seul être vivant du plan.
          souffle() {
            const g = discGuardians()[0];
            return g ? [[g.r, g.c, 1400, 0.9]] : [];
          },
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
          // Le regard glisse du Gardien vers la terre devant lui : le trajet
          // est raconté par un mouvement, pas par une phrase.
          souffle() {
            const g = discGuardians()[0];
            if (!g) return [];
            return [[g.r, g.c, 800, 0.6], [g.r - 1, g.c + 0.5, 1500, 0.1]];
          },
          promesse() {
            const g = discGuardians()[0];
            if (!g) return null;
            const land = [[g.r - 1, g.c], [g.r, g.c + 1], [g.r - 1, g.c + 1]]
              .find(([r, c]) => discInBounds(r, c) && isLand(r, c) && !characterAt(r, c));
            return land ? { from: [g.r, g.c], to: land } : null;
          },
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
          // La caméra bute sur le bord de la terre et s'arrête net, comme un
          // pas qui ne peut pas se faire.
          souffle() {
            const g = discGuardians()[0];
            const v = DISCOVERY.voidTarget;
            if (!g) return [];
            return v ? [[g.r, g.c, 700, 0.5], [v[0], v[1], 1400, 0.2]] : [[g.r, g.c, 900, 0.5]];
          },
          guide: () => ({ cells: DISCOVERY.voidTarget ? [DISCOVERY.voidTarget] : [] }),
          promesse() {
            const g = discGuardians()[0];
            return g && DISCOVERY.voidTarget ? { from: [g.r, g.c], to: DISCOVERY.voidTarget } : null;
          },
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
          /* L'étape juste avant a montré que le vide refuse le pas. Celle-ci
             ouvre le seul bouton qui puisse y répondre : c'est le HUD lui-même,
             réduit à une seule possibilité, qui fait la phrase. */
          guide: () => ({
            hud: [DISCOVERY_HUD.island],
            cells: DISCOVERY.voidTarget ? [DISCOVERY.voidTarget] : []
          }),
          promesse() {
            const g = discGuardians()[0];
            return g && DISCOVERY.voidTarget ? { from: [g.r, g.c], to: DISCOVERY.voidTarget } : null;
          },
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
          // Le plan s'arrête sur elle avant tout le reste : elle seule brille.
          souffle() {
            const t = DISCOVERY.crownTarget;
            return t ? [[t[0], t[1], 1500, 0.8]] : [];
          },
          guide: () => ({
            hud: [DISCOVERY_HUD.move],
            cells: DISCOVERY.crownTarget ? [DISCOVERY.crownTarget] : []
          }),
          promesse() {
            const guardians = discGuardians();
            const g = guardians[guardians.length - 1] || guardians[0];
            return g && DISCOVERY.crownTarget ? { from: [g.r, g.c], to: DISCOVERY.crownTarget } : null;
          },
          setup() {
            discSetHud(["move"]);
            discPrepareCrown();
          },
          done() { return !!discCarrier(); }
        },
        {
          id: "transmission",
          // D'un Gardien à l'autre : le mouvement de caméra EST la transmission.
          souffle() {
            const carrier = discCarrier();
            const other = carrier && discOtherGuardian(carrier.id);
            if (!carrier || !other) return [];
            return [[carrier.r, carrier.c, 900, 0.7], [other.r, other.c, 1400, 0.5]];
          },
          promesse() {
            const carrier = discCarrier();
            const other = carrier && discOtherGuardian(carrier.id);
            return carrier && other ? { from: [carrier.r, carrier.c], to: [other.r, other.c] } : null;
          },
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
          /* Le plan remonte jusqu'au village, s'arrête sur le rival qui en
             barre le seuil, puis glisse d'un cran vers la case libre derrière
             lui. La direction de la poussée est donnée par un mouvement de
             caméra — c'est la seule chose que le joueur ait besoin de savoir. */
          souffle() {
            const carrier = discCarrier();
            const plans = [];
            if (carrier) plans.push([carrier.r, carrier.c, 800, 0.4]);
            plans.push([0, 0.5, 1700, 0.3]);
            plans.push([0, 1.6, 1100, 0.2]);
            return plans;
          },
          guide: () => ({
            hud: [DISCOVERY_HUD.move, DISCOVERY_HUD.push],
            cells: [...tutoEnemies().map(e => [e.r, e.c]), [0, 0], [0, 2]]
          }),
          // Le fil ne montre pas le retour (que le joueur sait déjà faire) mais
          // le geste neuf : d'où le rival part, où il doit finir.
          promesse() {
            const e = tutoEnemies()[0];
            return e ? { from: [e.r, e.c], to: [0, 2] } : null;
          },
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
          // Rien à faire : c'est un plan, pas une étape. Le joueur regarde
          // le temps passer et la Couronne s'ancrer.
          setup() {
            discSetHud([]);
            DISCOVERY.validationRunning = false;
            DISCOVERY.validationPromise = discRunValidationCycle();
          },
          done() { return (state?.players?.[0]?.score || 0) >= 1; }
        }
      ];

      /* Monte l'aide d'un cran. Chaque palier ajoute au précédent, il ne le
         remplace pas : la lumière s'affirme, la caméra vient, puis le fil. */
      function discMonterAide(step, niveau) {
        DISCOVERY.aide = niveau;
        try {
          if (typeof step.guide === "function") {
            discAppel(step.guide(), niveau === 1 ? 1 : 2);
          }
          if (niveau >= 2 && typeof step.invite === "function") { step.invite(); }
          else if (niveau >= 2 && !DISCOVERY.souffleEnCours) {
            const g = discGuardians()[0];
            const cible = (typeof step.guide === "function" && step.guide().cells?.[0])
              || (g && [g.r, g.c]);
            if (cible) discTravel(cible[0], cible[1], 1100, 0.3);
          }
          if (niveau >= 3 && typeof step.promesse === "function") {
            const p = step.promesse();
            if (p) discPromesse(p.from, p.to);
          }
        } catch (_) { }
      }

      function discAideStop() {
        DISCOVERY.aide = 0;
        discAppelStop();
        discPromesseStop();
      }

      function discArm(step) {
        TUTO.lastAct = Date.now();
        TUTO.hintShown = false;
        DISCOVERY.aide = 0;
        DISCOVERY.aideMax = 0;
        const check = () => {
          if (!DISCOVERY.active || DISCOVERY_STEPS[DISCOVERY.step] !== step) return;
          try { if (typeof step.tick === "function") step.tick(); } catch (_) { }
          // Pendant un plan de caméra, le joueur n'a pas la main : le compteur
          // d'immobilité n'a aucun sens, on le tient à zéro.
          if (DISCOVERY.souffleEnCours) TUTO.lastAct = Date.now();
          else {
            const immobile = Date.now() - TUTO.lastAct;
            let vise = 0;
            for (let i = 0; i < DISCOVERY_AIDE.length; i++) {
              if (immobile > DISCOVERY_AIDE[i]) vise = i + 1;
            }
            if (vise > DISCOVERY.aide) {
              discMonterAide(step, vise);
              DISCOVERY.aideMax = Math.max(DISCOVERY.aideMax || 0, vise);
              TUTO.hintShown = vise > 0;
            }
          }

          let ok = false;
          try { ok = !!step.done(); } catch (_) { ok = false; }
          if (!ok) return;
          tutoDisarm();
          discAideStop();
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
        discAideStop();
        try { step.setup?.(); } catch (err) { console.warn("[tuto/discovery] setup", step.id, err); }
        // Le SOUFFLE se joue APRÈS le setup : les plans se calculent sur le
        // monde tel qu'il vient d'être préparé (couronne posée, rival placé).
        const plans = (typeof step.souffle === "function") ? (step.souffle() || []) : [];
        if (plans.length) {
          discSouffle(plans).then(() => { if (DISCOVERY.active) TUTO.lastAct = Date.now(); });
        }
        discArm(step);
      }

      /* L'ASSENTIMENT, et rien d'autre : un éclat, un son, on enchaîne. Pas de
         phrase de félicitation — la conséquence à l'écran EST la phrase. */
      function discStepCleared(step) {
        try { if (typeof playSfx === "function") playSfx("crown"); } catch (_) { }
        tutoBloom();
        DISCOVERY.trace.push({
          id: step.id,
          secondes: Math.round((Date.now() - DISCOVERY.stepStartedAt) / 100) / 10,
          aide: DISCOVERY.aideMax || 0
        });

        const next = DISCOVERY.step + 1;
        let advanced = false;
        const advance = () => {
          if (advanced || !DISCOVERY.active) return;
          advanced = true;
          clearTimeout(DISCOVERY.advanceTimer);
          discGoto(next);
        };
        // Un temps de respiration sur la conséquence, puis la suite.
        DISCOVERY.advanceTimer = setTimeout(advance, 1100);
      }

      function discBuildEndCard() {
        const d = TUTO.dom;
        if (!d || d.layer.querySelector(".tuto-end")) return;
        const end = document.createElement("div");
        end.className = "tuto-end";
        end.innerHTML = `
          <div class="disc-end-kicker">Découverte accomplie</div>
          <h2>La lumière est revenue.</h2>
          <p>Le reste du ciel t'attend.</p>
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
        discAideStop();
        tutoBloom();
        // Le village s'est rallumé : un dernier plan le laisse voir, puis la
        // carte de fin — le seul endroit du parcours qui a encore des mots,
        // parce qu'il n'enseigne plus rien : il propose de jouer.
        tutoLetterbox(true);
        tutoTravel(0.6, 0.6, 2400, 0.4);
        setTimeout(() => { if (DISCOVERY.active) tutoTravel(2.5, 1.5, 2600, -2.6); }, 2500);
        setTimeout(() => { if (DISCOVERY.active) discBuildEndCard(); }, 5200);
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
        DISCOVERY.souffleEnCours = false;
        DISCOVERY.sasFini = false;
        DISCOVERY.aide = 0;
        discPromesseStop();
        DISCOVERY.cameraNotre = false;
        clearTimeout(DISCOVERY.inviteTimer);
        clearTimeout(DISCOVERY.rendreCameraTimer);
        try { tutoGrade(false); } catch (_) { }
        els.gameScreen?.classList.remove("appel-1", "disc-refus");
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

      /* LE SAS D'OUVERTURE — la seule phrase que le tutoriel prononce, et
         c'est la caméra qui la dit.

         Noir. Le village, éteint et gris. Un long silence sur lui. Puis la
         descente jusqu'à la petite terre où se tient le Gardien, la couleur qui
         revient en s'éloignant. Le but et le départ ont été montrés dans cet
         ordre : tout le parcours n'est plus que le trajet entre les deux. */
      async function discSasOuverture() {
        TUTO.cinematic = true;
        DISCOVERY.souffleEnCours = true;
        tutoLetterbox(true);
        tutoFadeBlack(true);
        tutoGrade(true);                           // ce qu'on va voir est éteint
        await tutoWaitForScene();
        if (!DISCOVERY.active) return;

        tutoTravel(0.5, 0.5, 200, 1.1);            // posé sur le village
        await tutoWait(500);
        tutoTravel(0.5, 0.5, 200, 1.1);            // second appel : le cadrage tient
        await tutoWait(450);
        tutoFadeBlack(false);                      // il apparaît, gris, sans lumière
        await tutoWait(1700);                      // on le laisse peser
        if (!DISCOVERY.active) return;

        const g = discGuardians()[0];
        tutoTravel(2.6, 1.6, 3200, -1.1);          // la descente le long du vide
        tutoGrade(false);                          // la couleur revient
        await tutoWait(2900);
        if (!DISCOVERY.active) return;
        if (g) tutoTravel(g.r, g.c, 2200, 0.2);    // arrivée sur le Gardien
        await tutoWait(2000);

        tutoLetterbox(false);
        TUTO.cinematic = false;
        DISCOVERY.souffleEnCours = false;
        if (!DISCOVERY.active) return;
        // La caméra est rendue : c'est la pose de référence à partir de
        // laquelle l'étape « regarder » détectera un vrai mouvement du joueur.
        discEnableFreeCamera();
        DISCOVERY.sasFini = true;
        discGoto(0);
      }

      function tutoDiscoveryStart() {
        if (TUTO.active) return;
        DISCOVERY.active = true;
        DISCOVERY.step = 0;
        DISCOVERY.validationRunning = false;
        DISCOVERY.lastCellClick = null;
        DISCOVERY.lastCharClickId = null;
        DISCOVERY.trace = [];
        DISCOVERY.sasFini = false;
        DISCOVERY.aide = 0;
        DISCOVERY.aideMax = 0;
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
        setTimeout(() => { if (DISCOVERY.active) discSasOuverture(); }, 450);
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
            inputLocked: !!state?.inputLocked,
            currentPlayer: state?.currentPlayer,
            score: state?.players?.[0]?.score || 0,
            chars: (state?.characters || []).map(ch => ({ id: ch.id, p: ch.player, r: ch.r, c: ch.c })),
            crown: state?.artifact ? {
              active: state.artifact.active,
              carrierId: state.artifact.carrierId,
              r: state.artifact.r,
              c: state.artifact.c
            } : null,
            secondCrown: state?.secondArtifact ? {
              active: state.secondArtifact.active,
              carrierId: state.secondArtifact.carrierId,
              r: state.secondArtifact.r,
              c: state.secondArtifact.c
            } : null,
            islandPlaced: !!state?.islandPlacedThisTurn,
            validationRunning: DISCOVERY.validationRunning,
            // Instrumentation du parcours muet : sans ça, « compréhensible
            // sans lire » ne se vérifie pas autrement qu'à l'intuition.
            // `id` vaut « regarder » dès l'ouverture (l'index part de 0) : il
            // ne dit donc pas que le parcours a commencé. `pret` le dit.
            pret: DISCOVERY.sasFini,
            souffle: DISCOVERY.souffleEnCours,
            aide: DISCOVERY.aide,
            aideMax: DISCOVERY.aideMax || 0,
            trace: DISCOVERY.trace.slice()
          };
        }
      };
