      /* =====================================================================
         TUTORIEL — « La Première Ascension »

         Un récit continu, pas cinq leçons juxtaposées : même plateau, même
         Gardien, même couronne, qui évoluent d'un beat au suivant. La Mer de
         Nuages parle PENDANT que le plateau est déjà jouable — le texte ne
         bloque jamais l'action.

         Ce fragment est autonome. Il ne modifie aucune règle : il construit un
         `state` normal, restreint les entrées en amont des handlers d'`ui.js`
         (capture sur `els.board`, seul point de passage des clics de case en 2D
         comme en 3D), verrouille la caméra, et détecte la réussite de chaque
         beat en interrogeant l'état + en écoutant `window.ILYOS_VISUAL_EVENTS`.

         Beats livrés ici : I (L'Ancrage) et II (L'Éveil). III–V sont déclarés
         mais marqués `todo` — même structure à compléter.

         Point d'entrée : l'événement `ilyos-menu-tutorial-requested` (déjà émis
         par menu/menu-bridge.js quand on clique TUTORIEL) ou
         `window.ILYOS_TUTORIAL.start()`.
         ===================================================================== */

      const TUTO_STORAGE_KEY = "ilyos.tutorial.done";

      const TUTO = {
        active: false,
        beatIndex: 0,
        gateAllows: null,          // (r,c,event) => bool ; null = tout permis
        pollTimer: null,
        eventUnsubs: [],
        sayQueue: [],
        sayBusy: false,
        typeTimer: null,
        nudgeAt: 0,
        dom: null
      };

      /* ---------- Feuille de style (injectée en dernier) --------------------
         Toutes les règles sont préfixées et ne visent que des ids/classes
         propres au tutoriel : aucun risque de collision avec la cascade
         existante (cf. js/game/README.md). */
      function tutoInjectStyle() {
        if (document.getElementById("ilyos-tutorial-style")) return;
        const style = document.createElement("style");
        style.id = "ilyos-tutorial-style";
        style.textContent = `
          /* Au-dessus du HUD organique v2 (z ≈ 100160), sous le visualiseur de
             défausse (1002000) et le menu iframe. Sinon les fenêtres de dialogue
             passent SOUS le HUD et se lisent par-dessus les jauges. */
          #tutorialLayer{position:fixed;inset:0;z-index:1500000;pointer-events:none;
            font-family:'Nunito Sans','Inter',system-ui,sans-serif;}

          /* Objectif : toujours SOUS le bandeau HUD du haut ; dans la bande
             letterbox quand elle est fermée. */
          #tutorialLayer .tuto-objective{position:absolute;top:74px;left:50%;
            transform:translateX(-50%);max-width:min(560px,86vw);z-index:7;
            padding:7px 16px;border-radius:999px;
            background:rgba(9,16,34,.82);backdrop-filter:blur(6px);
            color:#dce8ff;font-size:13px;letter-spacing:.02em;text-align:center;
            border:1px solid rgba(150,190,255,.28);opacity:0;
            transition:opacity .4s, top .5s;}
          #tutorialLayer .tuto-objective.show{opacity:1;}
          #tutorialLayer.boxed .tuto-objective{top:calc(14vh + 10px);}

          /* Réplique : flotte AU-DESSUS de la barre d'action quand on joue ;
             devient un sous-titre dans la bande basse en mode cinématique. */
          #tutorialLayer .tuto-speech{position:absolute;left:50%;bottom:150px;
            transform:translateX(-50%);width:min(680px,92vw);z-index:7;
            display:flex;gap:14px;align-items:flex-end;opacity:0;
            transition:opacity .45s, transform .45s, bottom .5s;}
          #tutorialLayer .tuto-speech.show{opacity:1;transform:translateX(-50%) translateY(0);}
          #tutorialLayer .tuto-speech:not(.show){transform:translateX(-50%) translateY(12px);}
          #tutorialLayer .tuto-portrait{flex:0 0 auto;width:52px;height:52px;
            border-radius:50%;background:
              radial-gradient(circle at 35% 30%,rgba(200,225,255,.95),rgba(120,160,220,.35) 55%,rgba(60,90,150,.15));
            box-shadow:0 0 22px rgba(150,195,255,.35),inset 0 0 14px rgba(255,255,255,.4);
            animation:tuto-drift 6s ease-in-out infinite;}
          @keyframes tuto-drift{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-4px) scale(1.04)}}
          #tutorialLayer .tuto-bubble{flex:1 1 auto;
            background:linear-gradient(180deg,rgba(12,20,40,.94),rgba(10,16,32,.94));
            border:1px solid rgba(150,190,255,.3);border-radius:14px;
            padding:13px 17px 14px;color:#eaf1ff;line-height:1.5;font-size:15px;
            box-shadow:0 10px 40px rgba(0,0,0,.5);min-height:1.5em;
            transition:background .35s, border-color .35s, box-shadow .35s;}
          #tutorialLayer .tuto-bubble .tuto-caret{opacity:.5;}
          /* Mode cinématique : sous-titre plein cadre dans la bande basse. */
          #tutorialLayer.boxed .tuto-speech{bottom:0;height:14vh;align-items:center;
            width:min(900px,88vw);}
          #tutorialLayer.boxed .tuto-portrait{width:38px;height:38px;opacity:.85;}
          #tutorialLayer.boxed .tuto-bubble{background:transparent;border-color:transparent;
            box-shadow:none;font-size:clamp(15px,1.9vw,19px);text-align:left;
            padding:0 4px;text-shadow:0 2px 12px rgba(0,0,0,.7);}

          #tutorialLayer button.tuto-btn{pointer-events:auto;cursor:pointer;
            font:inherit;font-size:14px;padding:10px 20px;border-radius:10px;
            border:1px solid rgba(150,190,255,.4);color:#eaf1ff;
            background:rgba(20,32,60,.9);transition:background .2s,transform .1s;}
          #tutorialLayer button.tuto-btn:hover{background:rgba(34,52,92,.95);}
          #tutorialLayer button.tuto-btn.primary{background:#3a6bd0;border-color:#5f8de0;}
          #tutorialLayer button.tuto-btn:active{transform:translateY(1px);}

          #tutorialLayer .tuto-quit{position:absolute;left:50%;bottom:78px;
            transform:translateX(-50%);z-index:7;
            pointer-events:auto;cursor:pointer;font:inherit;font-size:12px;
            padding:7px 14px;border-radius:999px;color:#c8d4ee;letter-spacing:.03em;
            background:rgba(9,16,34,.92);border:1px solid rgba(120,150,210,.4);
            box-shadow:0 4px 18px rgba(0,0,0,.4);transition:bottom .5s, background .2s;}
          #tutorialLayer .tuto-quit:hover{background:rgba(18,28,52,.95);color:#eef3ff;}
          #tutorialLayer.boxed .tuto-quit{bottom:calc(14vh + 14px);}

          #tutorialLayer .tuto-voice{position:absolute;bottom:78px;right:16px;z-index:7;
            pointer-events:auto;cursor:pointer;font:inherit;font-size:15px;line-height:1;
            width:34px;height:34px;display:flex;align-items:center;justify-content:center;
            border-radius:50%;color:#c8d4ee;
            background:rgba(9,16,34,.92);border:1px solid rgba(120,150,210,.4);
            box-shadow:0 4px 18px rgba(0,0,0,.4);transition:bottom .5s, background .2s;}
          #tutorialLayer .tuto-voice:hover{background:rgba(18,28,52,.95);}
          #tutorialLayer .tuto-voice.off{color:#8894b4;}
          #tutorialLayer.boxed .tuto-voice{bottom:calc(14vh + 14px);}

          #tutorialLayer .tuto-end{position:absolute;inset:0;z-index:12;display:flex;
            flex-direction:column;align-items:center;justify-content:center;gap:22px;
            background:radial-gradient(circle at 50% 40%,rgba(12,22,48,.9),rgba(6,10,22,.96));
            pointer-events:auto;text-align:center;color:#eef3ff;padding:24px;
            animation:tuto-end-in 1s ease both;}
          @keyframes tuto-end-in{from{opacity:0}to{opacity:1}}
          #tutorialLayer .tuto-end h2{font-family:'Cinzel Decorative','Almendra',serif;
            font-size:clamp(22px,4vw,34px);margin:0;letter-spacing:.04em;}
          #tutorialLayer .tuto-end p{margin:0;max-width:460px;color:#c4d2ee;line-height:1.6;}
          #tutorialLayer .tuto-frieze{display:flex;gap:14px;font-size:26px;filter:drop-shadow(0 0 8px rgba(150,195,255,.4));}

          /* Chrome de jeu masqué pendant le tuto : les beats s'enchaînent seuls,
             pas de fin de tour manuelle ni d'annulation d'action validée. */
          /* Fin de tour, annulation, bascule de vue, minuteur, menu HUD :
             tout ce qui permettrait de sortir du rail ou de rembobiner le
             récit est masqué pendant le tuto (HUD historique ET HUD organique
             v2, qui est celui réellement affiché). */
          #gameScreen.tutorial-on #endTurnBtn,
          #gameScreen.tutorial-on #ov2End,
          #gameScreen.tutorial-on #ov2Undo,
          #gameScreen.tutorial-on #ov2Gear,
          #gameScreen.tutorial-on #hudV2GearBtn,
          #gameScreen.tutorial-on #turnTimer,
          #gameScreen.tutorial-on #ov2Timer,
          #gameScreen.tutorial-on [data-hud="timer"],
          #gameScreen.tutorial-on .turn-timer,
          #gameScreen.tutorial-on [data-hud-render],
          #gameScreen.tutorial-on [data-hud-camera],
          #gameScreen.tutorial-on .kaykit-camera-hint,
          #gameScreen.tutorial-on .kaykit-camera-controls,
          #gameScreen.tutorial-on .kaykit-control-btn,
          #gameScreen.tutorial-on .kaykit-ui,
          #gameScreen.tutorial-on .kaykit-controls,
          #gameScreen.tutorial-on [data-hud-render-toggle],
          #gameScreen.tutorial-on .hud-v2-render-toggle,
          #gameScreen.tutorial-on #instruction,
          #gameScreen.tutorial-on .ov2-instruction,
          #gameScreen.tutorial-on #newGameBtn{display:none !important;}
          #gameScreen.tutorial-on #cancelCardBtn.tuto-hide{display:none !important;}
          #gameScreen.tutorial-beat-clear .board-wrap{animation:tuto-flash .9s ease-out;}
          @keyframes tuto-flash{0%{filter:brightness(1)}25%{filter:brightness(1.35)}100%{filter:brightness(1)}}

          /* ---- Cinématique ---- */
          #tutorialLayer .tuto-bar{position:absolute;left:0;right:0;height:0;background:#04060d;
            z-index:6;transition:height .8s cubic-bezier(.65,0,.2,1);}
          #tutorialLayer .tuto-bar.top{top:0;box-shadow:0 6px 24px rgba(0,0,0,.5);}
          #tutorialLayer .tuto-bar.bot{bottom:0;box-shadow:0 -6px 24px rgba(0,0,0,.5);}
          #tutorialLayer.boxed .tuto-bar{height:14vh;}
          #tutorialLayer .tuto-fade{position:absolute;inset:0;background:#04060d;opacity:0;
            z-index:8;pointer-events:none;transition:opacity 1.1s ease;}
          #tutorialLayer .tuto-fade.on{opacity:1;}
          #tutorialLayer .tuto-fade.soft{background:radial-gradient(circle at 50% 45%,rgba(255,244,214,.96),rgba(240,232,210,.98));}
          #tutorialLayer .tuto-bloom{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:0;
            background:radial-gradient(circle at 50% 56%,rgba(255,228,150,.95),rgba(255,205,110,0) 55%);}
          #tutorialLayer .tuto-bloom.flash{animation:tuto-bloom-k 1.05s ease-out;}
          @keyframes tuto-bloom-k{0%{opacity:0}14%{opacity:.9}100%{opacity:0}}
          /* ---- Guidage visuel (remplace toute consigne écrite) ----
             Une balise de lumière posée sur la case qui compte, et une mise en
             valeur du bouton du HUD à employer. Rien n'est expliqué : on
             éclaire, le joueur comprend. */
          /* Une colonne de lumière tombe du ciel sur la case, et un anneau
             s'ouvre à sa base. Lisible même sur un ciel clair. */
          #tutorialLayer .tuto-beacon{position:absolute;width:0;height:0;pointer-events:none;z-index:6;}
          #tutorialLayer .tuto-beacon::before{content:"";position:absolute;
            left:-19px;bottom:-6px;width:38px;height:190px;
            background:linear-gradient(to top,
              rgba(255,244,206,.92) 0%, rgba(255,226,150,.55) 22%,
              rgba(255,214,120,.22) 55%, rgba(255,214,120,0) 100%);
            filter:blur(1px);
            -webkit-mask-image:linear-gradient(to top,#000 0%,#000 40%,transparent 100%);
            mask-image:linear-gradient(to top,#000 0%,#000 40%,transparent 100%);
            animation:tuto-beam-k 2.2s ease-in-out infinite;}
          #tutorialLayer .tuto-beacon::after{content:"";position:absolute;
            left:-34px;top:-19px;width:68px;height:38px;border-radius:50%;
            border:2.5px solid rgba(255,246,214,.98);
            box-shadow:0 0 22px rgba(255,226,150,1),0 0 46px rgba(255,196,90,.7),
              inset 0 0 14px rgba(255,244,200,.75);
            animation:tuto-beacon-ring 2.2s ease-out infinite;}
          @keyframes tuto-beam-k{0%,100%{opacity:.5}50%{opacity:1}}
          @keyframes tuto-beacon-ring{0%{transform:scale(.5);opacity:1}
            70%{transform:scale(1.55);opacity:0}100%{opacity:0}}

          #gameScreen.tutorial-on .tuto-pulse{position:relative;
            animation:tuto-pulse-k 1.9s ease-in-out infinite;
            filter:drop-shadow(0 0 10px rgba(255,226,150,.9)) drop-shadow(0 0 24px rgba(255,206,110,.55));}
          @keyframes tuto-pulse-k{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}

          /* Étalonnage « village éteint » : gris et sombre, il se lève quand
             la caméra quitte le village. */
          #tutorialLayer .tuto-grade{position:absolute;inset:0;z-index:4;pointer-events:none;
            opacity:0;background:rgba(9,13,24,.55);
            -webkit-backdrop-filter:grayscale(.75) brightness(.72);
            backdrop-filter:grayscale(.75) brightness(.72);
            transition:opacity 2.2s ease;}
          #tutorialLayer .tuto-grade.on{opacity:1;}
          #tutorialLayer .tuto-void{position:absolute;inset:0;z-index:5;pointer-events:none;opacity:0;
            background:radial-gradient(circle at 50% 60%,rgba(4,6,13,0) 30%,rgba(4,6,13,.55) 100%);}
          #tutorialLayer .tuto-void.pulse{animation:tuto-void-k .7s ease-out;}
          @keyframes tuto-void-k{0%{opacity:0}25%{opacity:1}100%{opacity:0}}
          #gameScreen.tuto-shake .board-wrap{animation:tuto-shake-k .45s ease-in-out;}
          @keyframes tuto-shake-k{0%,100%{transform:translate(0,0)}
            20%{transform:translate(-7px,4px)}40%{transform:translate(6px,-5px)}
            60%{transform:translate(-4px,-3px)}80%{transform:translate(4px,3px)}}
        `;
        document.head.appendChild(style);
      }

      /* ---------- Overlay de narration ---------------------------------- */
      function tutoBuildOverlay() {
        if (TUTO.dom) return TUTO.dom;
        const layer = document.createElement("div");
        layer.id = "tutorialLayer";
        layer.innerHTML = `
          <div class="tuto-bloom"></div>
          <div class="tuto-void"></div>
          <div class="tuto-bar top"></div>
          <div class="tuto-bar bot"></div>
          <button type="button" class="tuto-quit">Quitter le tutoriel</button>
          <button type="button" class="tuto-voice" title="Voix de la Mer">🔊</button>
          <div class="tuto-objective"></div>
          <div class="tuto-speech">
            <div class="tuto-portrait" aria-hidden="true"></div>
            <div class="tuto-bubble"></div>
          </div>
          <div class="tuto-grade"></div>
          <div class="tuto-fade on"></div>`;
        document.body.appendChild(layer);
        layer.querySelector(".tuto-quit").addEventListener("click", () => {
          if (confirm("Quitter le tutoriel ? Il reprendra depuis le début.")) tutoExit(true);
        });
        layer.querySelector(".tuto-voice").addEventListener("click", tutoToggleVoice);
        TUTO.dom = {
          layer,
          objective: layer.querySelector(".tuto-objective"),
          speech: layer.querySelector(".tuto-speech"),
          bubble: layer.querySelector(".tuto-bubble"),
          fade: layer.querySelector(".tuto-fade"),
          bloom: layer.querySelector(".tuto-bloom"),
          void: layer.querySelector(".tuto-void"),
          grade: layer.querySelector(".tuto-grade")
        };
        return TUTO.dom;
      }

      /* Le bandeau du haut n'est PAS une consigne permanente : il ne porte
         que l'indice de secours, montré si le joueur reste bloqué (voir
         tutoArm). Le reste du temps, le plateau parle seul. */
      function tutoSetObjective(text) {
        const d = TUTO.dom; if (!d) return;
        d.objective.textContent = text || "";
        d.objective.classList.toggle("show", !!text);
      }

      /* Le village éteint : étalonnage sombre et désaturé posé sur toute
         l'image pendant que la caméra le regarde. Ce n'est pas un effet sur
         l'objet — c'est un plan de cinéma : ce qu'on voit est éteint. */
      function tutoGrade(on) {
        TUTO.dom && TUTO.dom.grade.classList.toggle("on", !!on);
      }

      /* ---------- Guidage visuel -------------------------------------
         Quand le joueur bloque, on n'écrit rien : on ALLUME. Une balise de
         lumière sur la case qui compte, et le bouton du HUD à employer qui
         respire. Les balises sont des halos DOM reprojetés à chaque image
         depuis la position 3D de la case, donc elles suivent la caméra ; en
         rendu 2D elles se calent sur la case du plateau DOM. */

      // Position à l'écran du centre d'une case, quel que soit le rendu.
      function tutoCellToScreen(r, c) {
        try {
          if (typeof kaykit3D !== "undefined" && kaykit3D && kaykit3D.camera && kaykit3D.canvas
            && isKayKitBoardActive()) {
            const p = kaykitCellPosition(r, c, .45);
            const v = new THREE.Vector3(p.x, p.y, p.z).project(kaykit3D.camera);
            if (v.z > 1) return null;                       // derrière la caméra
            const box = kaykit3D.canvas.getBoundingClientRect();
            return {
              x: box.left + (v.x * .5 + .5) * box.width,
              y: box.top + (-v.y * .5 + .5) * box.height
            };
          }
        } catch (_) { }
        const cell = els.board && els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if (!cell) return null;
        const box = cell.getBoundingClientRect();
        if (!box.width) return null;
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      }

      function tutoGuideStop() {
        cancelAnimationFrame(TUTO.beaconFrame);
        TUTO.beaconFrame = 0;
        (TUTO.beaconNodes || []).forEach(n => n.remove());
        TUTO.beaconNodes = [];
        (TUTO.pulsed || []).forEach(el => el.classList.remove("tuto-pulse"));
        TUTO.pulsed = [];
      }

      /* cells : liste de cases à éclairer. hud : sélecteurs d'éléments du HUD
         à faire respirer. Les deux sont recalculés à chaque image tant que le
         guidage est actif — les cases bougent, la caméra aussi. */
      function tutoGuideStart(spec) {
        tutoGuideStop();
        if (!TUTO.dom || !spec) return;

        (spec.hud || []).forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.classList.add("tuto-pulse");
            TUTO.pulsed.push(el);
          });
        });

        const cells = spec.cells || [];
        TUTO.beaconNodes = cells.map(() => {
          const node = document.createElement("div");
          node.className = "tuto-beacon";
          TUTO.dom.layer.appendChild(node);
          return node;
        });

        const suivre = () => {
          if (!TUTO.active || !TUTO.beaconNodes.length) return;
          cells.forEach(([r, c], i) => {
            const node = TUTO.beaconNodes[i];
            const pos = tutoCellToScreen(r, c);
            if (!pos) { node.style.display = "none"; return; }
            node.style.display = "block";
            node.style.left = `${pos.x}px`;
            node.style.top = `${pos.y}px`;
          });
          TUTO.beaconFrame = requestAnimationFrame(suivre);
        };
        suivre();
      }

      /* ---------- Voix de la Mer (Web Speech API) --------------------- */
      const TUTO_VOICE_KEY = "ilyos.tutorial.voice";

      function tutoVoiceEnabled() {
        try {
          if (localStorage.getItem(TUTO_VOICE_KEY) === "0") return false;
        } catch (_) { }
        // Coupée si le son du jeu est à zéro.
        try {
          if (typeof soundSettings === "object" && soundSettings
            && Number(soundSettings.master) === 0) return false;
        } catch (_) { }
        return typeof window !== "undefined" && "speechSynthesis" in window;
      }

      function tutoSyncVoiceButton() {
        const b = TUTO.dom && TUTO.dom.layer.querySelector(".tuto-voice");
        if (!b) return;
        const on = tutoVoiceEnabled();
        b.textContent = on ? "🔊" : "🔇";
        b.classList.toggle("off", !on);
      }

      function tutoToggleVoice() {
        let off = false;
        try { off = localStorage.getItem(TUTO_VOICE_KEY) === "0"; } catch (_) { }
        try { localStorage.setItem(TUTO_VOICE_KEY, off ? "1" : "0"); } catch (_) { }
        if (!off) { try { speechSynthesis.cancel(); } catch (_) { } }
        tutoSyncVoiceButton();
      }

      /* On veut une voix d'HOMME, GRAVE et la plus NATURELLE possible. On
         classe les voix françaises disponibles : voix masculines connues et
         voix neuronales/en ligne (Natural, Neural, Google, WaveNet…) en tête.
         Le résultat est mémorisé — la liste des voix se charge de façon
         asynchrone (voir onvoiceschanged dans tutoStart). */
      function tutoPickVoice() {
        let voices = [];
        try { voices = speechSynthesis.getVoices() || []; } catch (_) { return null; }
        const fr = voices.filter(v => /^fr(-|_|$)/i.test(v.lang || ""));
        if (!fr.length) return null;
        const MALE = /(thomas|paul|nicolas|henri|guillaume|mathieu|claude|jacques|daniel|rémy|remy|antoine|alain|male\b|homme|\bm\b)/i;
        const NATURAL = /(natural|neural|online|google|wavenet|studio|premium|enhanced|siri|multilingual)/i;
        const FEMALE = /(am[ée]lie|audrey|virginie|marie|c[ée]line|julie|hortense|caroline|manon|sophie|denise|l[ée]a|charlotte|female|femme|\bf\b)/i;
        const score = v => {
          const n = v.name || "";
          let s = 0;
          if (MALE.test(n)) s += 5;
          if (NATURAL.test(n)) s += 3;
          if (FEMALE.test(n)) s -= 3;
          if (/^fr-FR/i.test(v.lang || "")) s += 1;
          if (v.localService === false) s += 1;   // les voix distantes sont souvent meilleures
          if (/compact|eloquence|espeak/i.test(n)) s -= 4; // voix robotiques
          return s;
        };
        return fr.slice().sort((a, b) => score(b) - score(a))[0] || null;
      }

      function tutoVoice() {
        if (!TUTO.voice) TUTO.voice = tutoPickVoice();
        return TUTO.voice;
      }

      function tutoSpeak(text) {
        if (!tutoVoiceEnabled() || !text) return;
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(String(text));
          u.lang = "fr-FR";
          u.rate = 0.9;      // posé mais naturel
          u.pitch = 0.78;    // grave — une voix d'homme, basse, qui vient de loin
          let vol = 0.92;
          try {
            if (typeof soundSettings === "object" && soundSettings && Number.isFinite(soundSettings.master)) {
              vol = Math.min(1, Math.max(0.15, soundSettings.master * 0.95));
            }
          } catch (_) { }
          u.volume = vol;
          const v = tutoVoice();
          if (v) u.voice = v;
          TUTO.utterance = u;
          speechSynthesis.speak(u);
        } catch (_) { }
      }

      function tutoStopSpeak() {
        try { speechSynthesis && speechSynthesis.cancel(); } catch (_) { }
        TUTO.utterance = null;
      }

      /* File de répliques : chaque ligne s'écrit lettre à lettre, la suivante
         enchaîne. Non bloquant — le plateau reste jouable pendant. Un clic sur
         la bulle révèle la ligne en cours d'un coup puis passe à la suivante. */
      function tutoSayLines(lines, opts = {}) {
        TUTO.sayQueue = (Array.isArray(lines) ? lines.slice() : [lines]).filter(Boolean);
        TUTO.sayThen = opts.then || null;
        // Cadre film UNIQUEMENT pour les moments cinématiques (plans, bascule de
        // chapitre) — pas pendant la consigne d'un chapitre, où l'on doit
        // pouvoir jouer et voir la barre d'action.
        if ((opts.box || TUTO.cinematic) && TUTO.sayQueue.length) tutoLetterbox(true);
        if (!TUTO.sayBusy) tutoPumpSay();
      }

      function tutoPumpSay() {
        const d = TUTO.dom; if (!d) return;
        clearTimeout(TUTO.typeTimer);
        const next = TUTO.sayQueue.shift();
        if (next == null) {
          TUTO.sayBusy = false;
          const then = TUTO.sayThen; TUTO.sayThen = null;
          if (typeof then !== "function" && !TUTO.cinematic) tutoLetterbox(false);
          if (typeof then === "function") then();
          return;
        }
        TUTO.sayBusy = true;
        d.speech.classList.add("show");
        tutoSpeak(next);                     // la voix démarre avec la ligne
        const voice = tutoVoiceEnabled();
        const perChar = voice ? 60 : 16;    // frappe calée sur la lecture vocale
        let i = 0;
        const step = () => {
          i++;
          d.bubble.innerHTML = tutoEscape(next.slice(0, i)) +
            (i < next.length ? '<span class="tuto-caret">▌</span>' : "");
          if (i < next.length) {
            TUTO.typeTimer = setTimeout(step, next[i - 1] === "." ? perChar * 3 : perChar);
          } else if (voice) {
            // Attendre la fin de la voix avant la ligne suivante (plafonné 9 s).
            const t0 = Date.now();
            const waitVoice = () => {
              let speaking = false;
              try { speaking = speechSynthesis.speaking; } catch (_) { }
              TUTO.typeTimer = setTimeout(
                (speaking && Date.now() - t0 < 9000) ? waitVoice : tutoPumpSay,
                speaking ? 180 : 320
              );
            };
            waitVoice();
          } else {
            TUTO.typeTimer = setTimeout(tutoPumpSay, 750);
          }
        };
        step();
      }

      function tutoEscape(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }

      // Clic sur la bulle : coupe la voix, révèle / passe à la ligne suivante.
      function tutoSpeechClick() {
        if (!TUTO.sayBusy) return;
        clearTimeout(TUTO.typeTimer);
        tutoStopSpeak();
        tutoPumpSay();
      }

      /* ---------- Caméra verrouillée ----------------------------------- */
      // La scène 3D n'est construite qu'après un requestAnimationFrame
      // (applyBoardRenderMode). On (re)pose donc le verrou en boucle courte au
      // démarrage, puis à chaque recadrage de beat.
      function tutoLockCamera(persistMs) {
        const apply = () => {
          try {
            if (typeof kaykit3D !== "undefined" && kaykit3D) {
              // On garde orbit.enabled = true : sinon la boucle de rendu
              // n'applique plus AUCUN mouvement caméra, y compris nos propres
              // recadrages de beat. On coupe seulement l'entrée utilisateur.
              // autoFit = false neutralise camera-start-face-auto-v1.js, qui
              // sinon recentre le plateau ~520 ms après l'affichage.
              kaykit3D.autoFit = false;
              kaykit3D.userRotated = true;
              kaykit3D.cameraMode = "auto";
              if (kaykit3D.orbit) {
                kaykit3D.orbit.enabled = true;
                kaykit3D.orbit.enableRotate = false;
                kaykit3D.orbit.enablePan = false;
                kaykit3D.orbit.enableZoom = false;
              }
            }
          } catch (_) { }
        };
        apply();
        clearInterval(TUTO.lockTimer);
        if (persistMs) {
          const stopAt = Date.now() + persistMs;
          TUTO.lockTimer = setInterval(() => {
            apply();
            if (Date.now() > stopAt) { clearInterval(TUTO.lockTimer); TUTO.lockTimer = null; }
          }, 400);
        }
      }

      function tutoUnlockCamera() {
        clearInterval(TUTO.lockTimer);
        TUTO.lockTimer = null;
        try {
          if (typeof kaykit3D !== "undefined" && kaykit3D) {
            kaykit3D.cameraMode = "auto";
            if (kaykit3D.orbit) {
              kaykit3D.orbit.enabled = true;
              kaykit3D.orbit.enableRotate = true;
              kaykit3D.orbit.enablePan = true;
              kaykit3D.orbit.enableZoom = true;
            }
          }
        } catch (_) { }
      }

      function tutoFrame(r, c, zoomBoost) {
        TUTO.lastFrame = { r, c, zoomBoost: zoomBoost || 0 };
        const go = (tries) => {
          let ok = false;
          try {
            if (typeof kaykitFollowCell === "function" && typeof kaykit3D !== "undefined" && kaykit3D) {
              kaykit3D.autoFit = false;
              // force:true recadre même caméra verrouillée (voir kaykitFollowCurrentPlayer).
              kaykitFollowCell(r, c, { duration: 720, force: true, zoomBoost: zoomBoost || 0 });
              ok = true;
            }
          } catch (_) { }
          tutoLockCamera();
          if (!ok && tries > 0) setTimeout(() => go(tries - 1), 350);
        };
        go(8);
        // camera-start-face-auto-v1.js ré-applique un cadrage « plateau entier »
        // jusqu'à ~1 s après l'affichage puis encore à ~520 ms : on ré-impose
        // le cadre du beat plusieurs fois pour gagner la course.
        [350, 700, 1100, 1600, 2400].forEach(d => setTimeout(() => {
          if (TUTO.active && TUTO.lastFrame
            && TUTO.lastFrame.r === r && TUTO.lastFrame.c === c) go(0);
        }, d));
      }

      /* ---------- Cinématique ----------------------------------------- */
      const tutoWait = ms => new Promise(res => setTimeout(res, ms));

      function tutoLetterbox(on) {
        TUTO.dom && TUTO.dom.layer.classList.toggle("boxed", !!on);
      }
      function tutoFadeBlack(on, soft) {
        const f = TUTO.dom && TUTO.dom.fade; if (!f) return;
        f.classList.toggle("soft", !!soft);
        f.classList.toggle("on", !!on);
      }
      function tutoBloom() {
        const b = TUTO.dom && TUTO.dom.bloom; if (!b) return;
        b.classList.remove("flash"); void b.offsetWidth; b.classList.add("flash");
      }
      function tutoVoidPulse() {
        const v = TUTO.dom && TUTO.dom.void; if (!v) return;
        v.classList.remove("pulse"); void v.offsetWidth; v.classList.add("pulse");
      }
      function tutoShake() {
        if (!els.gameScreen) return;
        els.gameScreen.classList.remove("tuto-shake");
        void els.gameScreen.offsetWidth;
        els.gameScreen.classList.add("tuto-shake");
        setTimeout(() => els.gameScreen && els.gameScreen.classList.remove("tuto-shake"), 500);
      }

      // Recadrage direct (sans les ré-applications de tutoFrame) pour un
      // long travelling cinématique.
      function tutoTravel(r, c, duration, zoomBoost) {
        try {
          if (typeof kaykitFollowCell === "function" && typeof kaykit3D !== "undefined" && kaykit3D) {
            kaykit3D.autoFit = false;
            kaykitFollowCell(r, c, { duration, force: true, zoomBoost: zoomBoost || 0 });
          }
        } catch (_) { }
        tutoLockCamera();
      }

      /* La scène 3D naît de façon asynchrone (requestAnimationFrame + chargement
         des modèles). Lancer le plan d'ouverture avant qu'elle existe donnait un
         premier plan cadré au hasard : on l'attend. */
      async function tutoWaitForScene(maxMs = 3500) {
        const t0 = Date.now();
        while (Date.now() - t0 < maxMs) {
          try { if (typeof kaykit3D !== "undefined" && kaykit3D && kaykit3D.camera) return true; } catch (_) { }
          await tutoWait(150);
        }
        return false;
      }

      /* Plan d'ouverture : écran noir → la caméra descend le long du trajet,
         du village (haut) jusqu'à l'archipel (bas), pendant que la Mer pose le
         décor. Le plateau du beat I est déjà construit derrière le noir. */
      async function tutoOpeningShot() {
        TUTO.cinematic = true;
        tutoLetterbox(true);
        tutoSetObjective("");
        tutoFadeBlack(true);
        tutoGrade(true);                          // le village est éteint
        await tutoWaitForScene();                 // ne rien cadrer avant que la 3D existe
        tutoTravel(0.5, 0.5, 200, 1.2);          // caméra posée sur le village
        await tutoWait(500);
        tutoTravel(0.5, 0.5, 200, 1.2);          // second appel : le cadrage tient
        await tutoWait(500);
        tutoFadeBlack(false);                     // il apparaît, gris et sans lumière
        await tutoWait(900);                      // un temps de silence sur le village
        tutoSayLines(["Ton village s'est éteint."]);
        await tutoWait(2600);
        tutoTravel(4, 1, 4200, -1.4);             // descente le long du vide
        tutoGrade(false);                         // la couleur revient en s'éloignant
        await tutoWait(1300);
        tutoSayLines(["Rien ne mène plus jusqu'à lui."]);
        await tutoWait(3200);
        tutoTravel(8, 1.5, 2800, -0.4);           // arrivée sur l'archipel nu
        await tutoWait(2600);
        // Avec la voix, le prologue peut durer plus que le travelling : on
        // laisse la Mer finir (plafonné) avant d'entrer dans le chapitre I.
        const t0 = Date.now();
        while (TUTO.active && TUTO.sayBusy && Date.now() - t0 < 14000) await tutoWait(200);
        TUTO.cinematic = false;
      }

      /* Plan de fin : la caméra s'élève du village, tout le trajet en vue,
         vers la mer de nuages, puis fondu clair avant l'écran de fin. */
      async function tutoEndingShot() {
        TUTO.cinematic = true;
        tutoLetterbox(true);
        tutoSetObjective("");
        // Retour au village, qui n'est plus gris : la lumière y est revenue.
        tutoTravel(0.8, 0.8, 2600, 0.6);
        await tutoWait(2400);
        tutoBloom();
        await tutoWait(900);
        tutoTravel(3.5, 1, 3400, -4.2);           // recul large sur tout le chemin bâti
        await tutoWait(3000);
        tutoFadeBlack(true, true);                // fondu vers une lumière douce
        await tutoWait(1200);
      }

      /* ---------- Fabrique de plateau --------------------------------- */
      function tutoBuildState() {
        setBoardSize(11);
        const names = ["TOI", "LES RIVAUX"];
        const villageAssignments = getVillageAssignments(2);
        const players = names.map((name, i) => {
          const villages = villageAssignments[i].map(v => ({ ...v }));
          return {
            id: i, name, color: PLAYER_COLORS[i], icon: PLAYER_ICONS[i],
            isAI: false, aiDifficulty: null,
            village: { ...villages[0] }, villages,
            score: 0, deck: createDeck(i), discard: [], hand: [],
            stash: { MOVE: 0, PUSH: 0, MAGIC: 0 }
          };
        });

        state = {
          players, soloMode: false, onlineMode: false, visualMode: "alternative",
          startingBoardMode: "classic", startingBoardPreset: null,
          turnDurationSeconds: null, setupSelectionPending: false, draft: null,
          aiDifficulty: null, currentPlayer: 0, round: 1, turn: 1,
          islands: [], characters: [],
          artifact: { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true },
          secondArtifact: { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false },
          phase: "ACTION_SELECT",
          rules: { allowDissolve: false, islandLimitPerPlayer: 0 },
          islandPlacedThisTurn: false, centerCrownTakenThisTurn: false,
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
          tutorial: true
        };
      }

      function tutoAddIsland(cells, owner = 0) {
        const list = cells.map(([r, c]) => [r, c]);
        const id = state.nextIslandId++;
        const anchor = { r: list[0][0], c: list[0][1] };
        const rel = list.map(([r, c]) => [r - anchor.r, c - anchor.c]);
        state.islands.push({
          id, owner, shapeKey: "tuto", fromSetup: true,
          anchor, relCells: rel, cells: list,
          visualVariant: (typeof chooseIslandVisualVariant === "function"
            ? chooseIslandVisualVariant(list, id) : id % 6)
        });
        return id;
      }

      // Garantit que chaque case listée est de la terre ferme (pose un îlot
      // 1×1 minimal là où il en manque).
      function tutoEnsureLand(cells) {
        cells.forEach(([r, c]) => { if (!isLand(r, c)) tutoAddIsland([[r, c]]); });
      }

      /* Relie deux cases par un chemin de terre en L (vertical puis horizontal).
         C'est ce qui permet aux chapitres d'être ADDITIFS : le monde se
         prolonge à partir de là où le joueur a laissé son Gardien, au lieu
         d'être reconstruit autour d'une position imposée. */
      function tutoEnsurePathFrom(r0, c0, r1, c1) {
        const cells = [];
        const stepR = r1 > r0 ? 1 : -1;
        for (let r = r0; r !== r1; r += stepR) cells.push([r, c0]);
        const stepC = c1 > c0 ? 1 : -1;
        for (let c = c0; c !== c1; c += stepC) cells.push([r1, c]);
        cells.push([r1, c1]);
        tutoEnsureLand(cells);
      }

      function tutoGuardian0() {
        return state.characters.find(ch => ch.player === 0) || null;
      }

      function tutoEnemies() {
        return state.characters.filter(ch => ch.player === 1);
      }

      // Remplace tous les Gardiens rivaux par ceux listés (positions absolues).
      function tutoSetEnemies(cells) {
        state.characters = state.characters.filter(ch => ch.player !== 1);
        cells.forEach(([r, c]) => {
          state.characters.push({ id: `char-r${state.nextCharId++}`, player: 1, r, c });
        });
      }

      // Repositionne le Gardien du joueur SANS toucher à la couronne.
      function tutoPlaceGuardian(r, c) {
        let g = tutoGuardian0();
        if (!g) { g = { id: `char-${state.nextCharId++}`, player: 0, r, c }; state.characters.push(g); }
        g.r = r; g.c = c;
        return g;
      }

      // Repositionne le Gardien ET lui remet la couronne portée en main.
      function tutoCarrier(r, c) {
        let g = tutoGuardian0();
        if (!g) { g = { id: `char-${state.nextCharId++}`, player: 0, r, c }; state.characters.push(g); }
        g.r = r; g.c = c;
        const crown = state.artifact;
        crown.active = true;
        crown.carrierId = g.id;
        crown.r = r; crown.c = c;
        state.secondArtifact.active = false;
        return g;
      }

      function tutoSetHand(actions) {
        state.players[0].hand = actions.map((a, i) => ({ id: `TUTO-H${i}`, action: a, used: false }));
      }

      function tutoRender() {
        try { renderAll(); } catch (_) { }
        try { if (typeof scheduleKayKitSync === "function") scheduleKayKitSync(); } catch (_) { }
      }

      /* ---------- Garde-fou sur les clics de case ---------------------- */
      function tutoGateClick(event) {
        if (!TUTO.active) return;
        // Pendant un plan (ouverture, fin) le plateau n'accepte rien : sinon un
        // joueur pressé pose une île avant que le chapitre I existe, et le
        // setup du chapitre l'efface sous ses yeux.
        if (TUTO.cinematic || typeof TUTO.gateAllows !== "function") {
          event.stopImmediatePropagation();
          event.stopPropagation();
          event.preventDefault();
          return;
        }
        tutoTouched();                 // toute tentative repousse l'indice
        const cell = event.target && event.target.closest && event.target.closest(".cell");
        if (!cell) return;
        const r = Number(cell.dataset.r);
        const c = Number(cell.dataset.c);
        if (TUTO.gateAllows(r, c, event)) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
        tutoNudge();
      }

      // Réplique douce quand un geste est refusé (beats I–II) — throttlée.
      function tutoNudge() {
        const now = Date.now();
        if (now - TUTO.nudgeAt < 2600) return;
        TUTO.nudgeAt = now;
        const beat = TUTO_BEATS[TUTO.beatIndex];
        tutoSayLines([beat && beat.nudge ? beat.nudge : "Pas là. Reste près de ce qui compte."]);
      }

      // Masque le bouton d'annulation uniquement quand il propose « ↶ Annuler
      // dernière action » (le reste — Désélectionner, Changer d'île — est utile).
      function tutoWatchCancelBtn() {
        const btn = els.cancelCardBtn;
        if (!btn || tutoWatchCancelBtn.obs) return;
        const sync = () => btn.classList.toggle("tuto-hide",
          TUTO.active && /Annuler dernière action/.test(btn.textContent || ""));
        tutoWatchCancelBtn.obs = new MutationObserver(sync);
        tutoWatchCancelBtn.obs.observe(btn, { childList: true, characterData: true, subtree: true });
        sync();
      }

      /* ================================================================
         LES BEATS — un seul voyage, un seul plateau, jamais réinitialisé.

         RÈGLE ABSOLUE : un `setup()` est ADDITIF. Il n'efface aucune île, ne
         déplace jamais le Gardien du joueur, ne lui reprend pas sa couronne.
         Ce que le joueur a bâti reste exactement où il l'a bâti — y compris
         l'île qu'il a posée lui-même au chapitre I, à l'endroit qu'il a choisi.
         Chaque chapitre ne fait qu'AJOUTER ce dont il a besoin devant lui, en
         partant de la position réelle du Gardien (voir tutoEnsurePathFrom).

         L'unique exception est le RATTRAPAGE : `setup(true)` est appelé quand
         le chapitre est devenu infaisable, et là seulement on repositionne.

         Géographie : le Gardien remonte la colonne gauche, de l'archipel (bas)
         jusqu'au village (coin 0,0). Le gouffre est la ligne 2, franchie au
         chapitre IV en faisant basculer la corniche par-dessus.
         ================================================================ */

      const TUTO_ARCHIPEL = [[9, 1], [8, 1], [9, 2]];
      const TUTO_COURONNE = [6, 1];        // l'îlot de la couronne (chapitre II)
      const TUTO_CORNICHE = [[5, 1], [4, 1], [3, 1]];  // la barre qui pivote (III → IV)
      const TUTO_VILLAGE = [0, 0];

      const TUTO_BEATS = [

        /* -------- I — L'Ancrage -------- */
        {
          id: "ancrage",
          frame: { r: 8, c: 1.5, zoom: -0.5 },
          // Le bouton ÎLE respire, et une lumière se pose sur le rebord de
          // l'archipel : « c'est de là que ça part ».
          guide: () => ({
            hud: ["#ov2Island"],
            cells: [[8, 2], [7, 1]]
          }),
          nudge: "Pas si haut. Pas encore.",
          intro: ["Tout commence par une terre."],
          success: ["Quelqu'un s'éveille."],
          // SEUL beat qui construit à partir de rien : c'est le début du monde.
          setup() {
            state.islands.length = 0;
            state.characters.length = 0;
            state.players[0].score = 0;
            state.players[0].stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
            tutoAddIsland(TUTO_ARCHIPEL);
            // La couronne, déjà visible au loin sur son îlot : c'est la lueur
            // qui donnera envie de monter au chapitre suivant.
            tutoEnsureLand([TUTO_COURONNE]);
            state.artifact.r = TUTO_COURONNE[0]; state.artifact.c = TUTO_COURONNE[1];
            state.artifact.active = true; state.artifact.carrierId = null;
            state.secondArtifact.active = false;
            state.phase = "ACTION_SELECT";
            state.islandPlacedThisTurn = false;
            state.selectedIslandShape = null;
            state.placementCells = null;
            state.selectedCharId = null;
            tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"]);
            tutoRender();
          },
          /* Une île se pose OÙ L'ON VEUT — c'est la règle du jeu (voir
             isValidPlacement dans ui.js) et le tutoriel n'a pas à la trahir.
             Le seul terrain interdit est celui que le récit doit encore poser
             lui-même : la corniche des rivaux et le gouffre, au-dessus de la
             couronne. Tout le bas du ciel est libre, couronne comprise —
             on peut la ceinturer si on veut.

             Les formes sont normalisées vers le bas/la droite depuis leur
             ancre, donc contrôler l'ancre suffit à garantir toutes les cases. */
          gate(r, c) {
            if (state.phase === "PLACE_SPAWN") return true;
            if (state.phase === "PLACE_ISLAND") return r >= TUTO_COURONNE[0];
            return true;
          },
          done() {
            return !!state.islandPlacedThisTurn && !!tutoGuardian0();
          }
        },

        /* -------- II — L'Éveil -------- */
        {
          id: "eveil",
          frame: { r: 7, c: 1.5, zoom: -0.3 },
          // Le Gardien s'allume, la couronne aussi : le trajet se lit tout seul.
          guide: () => {
            const g = tutoGuardian0();
            return {
              hud: ["#ov2Move"],
              cells: [...(g ? [[g.r, g.c]] : []), TUTO_COURONNE]
            };
          },
          nudge: "Ton Gardien d'abord.",
          intro: ["Là-haut. Cette lueur."],
          success: ["Voilà ce qui rallume un village."],
          // ADDITIF : le Gardien reste exactement où le joueur l'a fait
          // apparaître. On se contente de relier sa case à la couronne.
          setup(replay) {
            if (replay) tutoPlaceGuardian(8, 1);
            const g = tutoGuardian0() || tutoPlaceGuardian(8, 1);
            tutoEnsurePathFrom(g.r, g.c, TUTO_COURONNE[0], TUTO_COURONNE[1]);
            state.artifact.r = TUTO_COURONNE[0]; state.artifact.c = TUTO_COURONNE[1];
            state.artifact.active = true; state.artifact.carrierId = null;
            state.islandPlacedThisTurn = true;
            state.phase = "ACTION_SELECT";
            state.selectedCharId = null;
            state.reachable = new Set();
            tutoSetHand(["MOVE", "MOVE", "MOVE", "MOVE", "MOVE"]);
            tutoRender();
          },
          gate(r, c) {
            const here = characterAt(r, c);
            if (here && here.player === 0) return true;
            if (state.reachable && state.reachable.has && state.reachable.has(`${r},${c}`)) return true;
            return false;
          },
          done() {
            const g = tutoGuardian0();
            return !!(g && typeof artifactCarriedBy === "function" && artifactCarriedBy(g.id));
          }
        },

        /* -------- III — Les Rivaux -------- */
        {
          id: "rivaux",
          frame: { r: 5, c: 1, zoom: -0.1 },
          // Les rivaux s'allument, et le vide au-dessus d'eux aussi : la
          // direction de la poussée se lit sans qu'on la nomme.
          guide: () => ({
            hud: ["#ov2Push"],
            cells: [...tutoEnemies().map(e => [e.r, e.c]), [2, 1]]
          }),
          retry: "Il a basculé avec eux.",
          nudge: "Vise le vide.",
          intro: ["Tu n'es pas seul à la vouloir."],
          success: ["Le vide ne rend rien."],
          // ADDITIF : le Gardien reste où il a ramassé la couronne. On ajoute
          // la corniche devant lui — UNE seule île de trois cases, c'est elle
          // qui basculera au chapitre suivant. Le gouffre est la ligne 2.
          setup(replay) {
            if (replay) tutoCarrier(6, 1);
            const g = tutoGuardian0() || tutoCarrier(6, 1);
            tutoEnsurePathFrom(g.r, g.c, 6, 1);
            if (!state.islands.some(i => i.id === TUTO.pivotIslandId)) {
              TUTO.pivotIslandId = tutoAddIsland(TUTO_CORNICHE, 0);
            }
            // Les rivaux occupent le haut de la corniche ; la ligne 2 est vide.
            tutoSetEnemies([[4, 1], [3, 1]]);
            state.islandPlacedThisTurn = true;
            state.phase = "ACTION_SELECT";
            state.selectedCharId = null;
            state.reachable = new Set();
            tutoSetHand(["MOVE", "MOVE", "PUSH", "PUSH", "PUSH"]);
            tutoRender();
          },
          gate() { return true; },
          fail() {
            if (!tutoGuardian0()) return true;
            // Plus de quoi pousser : le chapitre est devenu infaisable.
            try {
              return tutoEnemies().length > 0 && availableActionCount("PUSH") < 1
                && availableActionCount("MOVE") < 1;
            } catch (_) { return false; }
          },
          done() { return tutoEnemies().length === 0; }
        },

        /* -------- IV — Le Pivot -------- */
        {
          id: "pivot",
          frame: { r: 4.5, c: 0.5, zoom: 0 },
          /* On éclaire les TROIS cases de la barre, jamais une seule : le
             joueur voit qu'il a un choix à faire, il ne reçoit pas la réponse.
             C'est tout l'intérêt du chapitre. */
          guide: () => ({
            hud: ["#ov2Magic"],
            cells: (state.islands.find(i => i.id === TUTO.pivotIslandId) || { cells: [] })
              .cells.map(([r, c]) => [r, c])
          }),
          intro: ["La terre s'arrête. Pas le ciel."],
          success: ["Le ciel s'est plié. Tu es passé."],
          retry: "Le ciel est retombé comme il était.",
          /* ADDITIF : la corniche est celle du chapitre III, avec le Gardien
             posé dessus là où il a fini de pousser. Rien n'est reconstruit.

             Le puzzle : la barre (5,1)-(4,1)-(3,1) peut pivoter autour de
             N'IMPORTE laquelle de ses cases. Pivoter autour du HAUT et faire
             un demi-tour envoie le Gardien quatre cases plus haut ET couche la
             barre par-dessus le gouffre — elle devient le pont. Pivoter autour
             du cœur ne l'avance que de deux et ne franchit rien. C'est au
             joueur de le trouver : aucune case n'est interdite. */
          setup(replay) {
            if (replay) {
              tutoSetEnemies([]);
              state.islands = state.islands.filter(i => i.id !== TUTO.pivotIslandId);
              TUTO.pivotIslandId = tutoAddIsland(TUTO_CORNICHE, 0);
              tutoCarrier(5, 1);
            }
            const g = tutoGuardian0() || tutoCarrier(5, 1);
            // Le Gardien doit se tenir SUR la barre pour être emporté par elle.
            const barre = state.islands.find(i => i.id === TUTO.pivotIslandId);
            if (!barre || !barre.cells.some(([r, c]) => r === g.r && c === g.c)) {
              tutoCarrier(5, 1);
            }
            state.islandPlacedThisTurn = true;
            state.phase = "ACTION_SELECT";
            state.selectedCharId = null;
            state.selectedIslandId = null;
            state.reachable = new Set();
            tutoSetHand(["MAGIC", "MAGIC", "MAGIC"]);
            tutoRender();
          },
          gate() { return true; },   // aucun pivot interdit : c'est la découverte
          tick() {
            /* Seule l'étape vraiment obscure du jeu est faite pour le joueur :
               « recliquer l'île fantôme pour valider ». Le compte à rebours se
               remet à zéro à chaque cran de rotation, pour qu'on ait tout le
               temps d'aller jusqu'au demi-tour. */
            const enMagie = state.phase === "ACTION" && state.selectedActionType === "MAGIC"
              && state.selectedMagicPivot && (state.magicPreviewSteps || 0) !== 0;
            if (!enMagie) { TUTO.magicConfirmAt = 0; TUTO.magicSteps = null; return; }
            const steps = state.magicPreviewSteps || 0;
            if (TUTO.magicSteps !== steps) {          // le joueur tourne encore
              TUTO.magicSteps = steps;
              TUTO.magicConfirmAt = Date.now() + 2600;
              return;
            }
            if (Date.now() > TUTO.magicConfirmAt) {
              TUTO.magicConfirmAt = Date.now() + 2600;
              try { if (typeof confirmMagicRotation === "function") confirmMagicRotation(); } catch (_) { }
            }
          },
          // Réussi quand le Gardien a franchi le gouffre (ligne 2), pas
          // seulement quand l'île a bougé : une rotation qui n'avance à rien
          // se voit, et le joueur en tire la leçon lui-même.
          done() {
            const g = tutoGuardian0();
            return !!g && g.r <= 2;
          },
          fail() {
            if (!tutoGuardian0()) return true;
            try { return availableActionCount("MAGIC") < 1; } catch (_) { return false; }
          }
        },

        /* -------- V — Le Couronnement -------- */
        {
          id: "couronnement",
          frame: { r: 1.5, c: 0.5, zoom: 0.3 },
          // L'intrus, et la case du village sur laquelle finir.
          guide: () => ({
            hud: ["#ov2Push", "#ov2Move"],
            cells: [...tutoEnemies().map(e => [e.r, e.c]), TUTO_VILLAGE]
          }),
          retry: "La couronne a glissé au loin.",
          nudge: "Vers l'intérieur, jamais vers le vide.",
          intro: ["Ton village. Et quelqu'un devant."],
          success: ["Une lumière est revenue. Il en manque deux."],
          // ADDITIF : le Gardien est là où la barre l'a déposé, de l'autre côté
          // du gouffre. On ne relie que le dernier pas jusqu'au village.
          setup(replay) {
            if (replay) tutoCarrier(1, 1);
            const g = tutoGuardian0() || tutoCarrier(1, 1);
            // Un chemin depuis sa case réelle jusqu'au seuil du village.
            tutoEnsurePathFrom(g.r, g.c, 1, TUTO_VILLAGE[1]);
            /* Les trois cases de validation d'un village ne sont PAS de la
               terre d'office : seule la case du village l'est (isLand =
               villageAt || sanctuaire || île). Sans ça l'intrus se retrouvait
               debout au-dessus du vide. On les matérialise, plus la case où il
               sera chassé. */
            const zone = (typeof crownValidationCellsForPlayer === "function")
              ? crownValidationCellsForPlayer(state.players[0]).map(([r, c]) => [r, c])
              : [[0, 0], [1, 0], [0, 1]];
            tutoEnsureLand([...zone, [0, 2]]);
            tutoSetEnemies([[0, 1]]);                 // sur une case de validation du village
            state.players[0].score = 0;
            state.islandPlacedThisTurn = true;
            state.phase = "ACTION_SELECT";
            state.selectedCharId = null;
            state.reachable = new Set();
            tutoSetHand(["PUSH", "PUSH", "MOVE", "MOVE", "MOVE", "MOVE"]);
            tutoRender();
          },
          gate() { return true; },
          tick() {
            const g = tutoGuardian0();
            const p = state.players[0];
            if (!g || !p) return;
            if (typeof artifactCarriedBy !== "function" || !artifactCarriedBy(g.id)) return;
            if (typeof isCrownValidationCell !== "function" || !isCrownValidationCell(p, g.r, g.c)) return;
            if (typeof validationBloqueeParAdversaire === "function"
              && validationBloqueeParAdversaire(p, g.r, g.c)) return;
            try { if (typeof scoreCrownsAtTurnStart === "function") scoreCrownsAtTurnStart(p); } catch (_) { }
          },
          fail() {
            // Porteur disparu SANS avoir marqué = il est tombé.
            if (!tutoGuardian0() && (state.players[0].score || 0) < 1) return true;
            // Ou plus une seule carte pour finir : le chapitre est devenu
            // infaisable, on le reprend au lieu de laisser coincé.
            try {
              return availableActionCount("MOVE") < 1 && availableActionCount("PUSH") < 1;
            } catch (_) { return false; }
          },
          done() { return (state.players[0].score || 0) >= 1; }
        }
      ];

      /* ================================================================
         MOTEUR DE SÉQUENÇAGE
         ================================================================ */
      function tutoGoto(index) {
        const beat = TUTO_BEATS[index];
        if (!beat) return tutoFinish();
        TUTO.beatIndex = index;
        tutoDisarm();

        if (beat.todo) {
          TUTO.gateAllows = () => true;
          tutoSetObjective("");
          tutoSayLines([
            "Ici s'arrête, pour l'instant, ce que la Mer peut t'enseigner.",
            "La suite de l'Ascension — les Rivaux, le Pivot, le Couronnement — arrive bientôt."
          ], { then: () => setTimeout(() => tutoFinish(), 600) });
          return;
        }

        TUTO.gateAllows = beat.gate || (() => true);
        if (!TUTO.cinematic) tutoLetterbox(false);
        try { beat.setup(false); } catch (err) { console.warn("[tuto] setup", beat.id, err); }
        tutoFrameOnGuardian(beat);
        // Aucune consigne permanente : le plateau parle seul. L'indice n'arrive
        // qu'en secours, quand le joueur reste bloqué (voir tutoArm).
        tutoSetObjective("");
        tutoSayLines(beat.intro || []);
        tutoArm(beat);
      }

      /* Délai avant que le guidage lumineux ne s'allume. Assez long pour
         laisser regarder, essayer, se tromper — assez court pour ne jamais
         laisser quelqu'un vraiment coincé. */
      const TUTO_HINT_DELAY = 15000;

      function tutoTouched() {
        TUTO.lastAct = Date.now();
        if (TUTO.hintShown) { TUTO.hintShown = false; tutoGuideStop(); }
      }

      /* Le cadrage suit le Gardien RÉEL, pas une case écrite en dur : puisque
         le joueur choisit où il pose son île et où il s'arrête, la caméra doit
         le retrouver là où il est. `beat.frame` ne sert plus que de repère de
         hauteur (à mi-chemin entre le Gardien et l'objectif du chapitre). */
      function tutoFrameOnGuardian(beat) {
        const g = tutoGuardian0();
        const f = beat.frame || {};
        if (!g) {
          if (beat.frame) tutoFrame(f.r, f.c, f.zoom);
          return;
        }
        const viseR = Number.isFinite(f.r) ? (g.r + f.r) / 2 : g.r;
        const viseC = Number.isFinite(f.c) ? (g.c + f.c) / 2 : g.c;
        tutoFrame(viseR, viseC, f.zoom || 0);
      }

      function tutoArm(beat) {
        TUTO.failGuardAt = Date.now() + 1200; // laisser le setup se stabiliser
        TUTO.lastAct = Date.now();
        TUTO.hintShown = false;
        const check = () => {
          if (!TUTO.active || TUTO_BEATS[TUTO.beatIndex] !== beat) return;
          try { if (typeof beat.tick === "function") beat.tick(); } catch (_) { }
          // Guidage de secours : rien pendant qu'on cherche ; la lumière
          // seulement si plus rien ne bouge. Le compte ne démarre qu'une fois
          // la Mer silencieuse — sinon il tournerait pendant la réplique.
          if (TUTO.sayBusy) TUTO.lastAct = Date.now();
          else if (!TUTO.hintShown && typeof beat.guide === "function"
            && Date.now() - TUTO.lastAct > TUTO_HINT_DELAY) {
            TUTO.hintShown = true;
            try { tutoGuideStart(beat.guide()); } catch (_) { }
          }
          // La réussite l'emporte toujours sur l'échec (un même geste peut
          // déclencher les deux : valider une couronne retire le porteur).
          let ok = false;
          try { ok = !!beat.done(); } catch (_) { ok = false; }
          if (ok) { tutoDisarm(); tutoBeatCleared(beat); return; }
          // Rattrapage (beats III–V) : un geste qui rend le beat infaisable
          // restaure le point de départ, avec un mot de la Mer.
          if (typeof beat.fail === "function" && Date.now() > TUTO.failGuardAt) {
            let bad = false;
            try { bad = !!beat.fail(); } catch (_) { bad = false; }
            if (bad) { tutoDisarm(); tutoBeatFailed(beat); }
          }
        };
        TUTO.pollTimer = setInterval(check, 350);
        const bus = window.ILYOS_VISUAL_EVENTS;
        if (bus && typeof bus.on === "function") {
          ["islandPlaced", "characterSpawned", "crownPicked", "characterMoveEnded",
            "characterPushed", "characterFell", "islandRotated", "crownScored"]
            // Les événements visuels relancent la vérification, mais ne
            // retirent PAS l'indice : certains partent d'animations d'ambiance,
            // pas d'un geste du joueur (c'est tutoTouched qui s'en charge).
            .forEach(name => TUTO.eventUnsubs.push(bus.on(name, () => setTimeout(check, 60))));
        }
      }

      function tutoBeatFailed(beat) {
        tutoSayLines([beat.retry || "Ce n'était pas le bon geste. Recommence."], {
          then: () => setTimeout(() => {
            if (!TUTO.active) return;
            // Seul cas où un chapitre a le droit de repositionner : il est
            // devenu infaisable, on remet le voyage sur ses rails.
            try { beat.setup(true); } catch (_) { }
            tutoFrameOnGuardian(beat);
            tutoSetObjective("");
            tutoLetterbox(false);
            tutoArm(beat);
          }, 400)
        });
      }

      function tutoDisarm() {
        clearInterval(TUTO.pollTimer);
        TUTO.pollTimer = null;
        TUTO.hintShown = false;
        tutoGuideStop();
        TUTO.eventUnsubs.forEach(u => { try { u && u(); } catch (_) { } });
        TUTO.eventUnsubs = [];
      }

      function tutoBeatCleared(beat) {
        try { if (typeof playSfx === "function") playSfx("crown"); } catch (_) { }
        if (els.gameScreen) {
          els.gameScreen.classList.add("tutorial-beat-clear");
          setTimeout(() => els.gameScreen.classList.remove("tutorial-beat-clear"), 1000);
        }
        tutoSetObjective("");
        const nextIndex = TUTO.beatIndex + 1;
        let advanced = false;
        const advance = () => {
          if (advanced || !TUTO.active) return;
          advanced = true;
          clearTimeout(TUTO.advanceCap);
          tutoGoto(nextIndex);
        };
        // La narration de succès ne retarde l'enchaînement que jusqu'à un
        // plafond : le joueur qui a réussi n'attend jamais plus de ~5 s.
        TUTO.advanceCap = setTimeout(advance, 8000);
        tutoSayLines(beat.success || [], { then: () => setTimeout(advance, 700) });
      }

      /* ---------- Fin ------------------------------------------------- */
      async function tutoFinish() {
        try { localStorage.setItem(TUTO_STORAGE_KEY, "1"); } catch (_) { }
        tutoDisarm();
        TUTO.gateAllows = () => false;
        const d = TUTO.dom;
        if (!d) return;
        await tutoEndingShot();
        if (!TUTO.dom) return;                    // sortie pendant le plan
        d.speech.classList.remove("show");
        tutoSetObjective("");
        const end = document.createElement("div");
        end.className = "tuto-end";
        end.innerHTML = `
          <h2>Il en manque deux.</h2>
          <p>Le reste du ciel t'attend.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
            <button type="button" class="tuto-btn primary" data-tuto="play">Entrer dans une vraie partie</button>
            <button type="button" class="tuto-btn" data-tuto="menu">Retour au menu</button>
          </div>`;
        d.layer.appendChild(end);
        // Le fondu clair se dissipe : la carte de fin flotte au-dessus du
        // plateau reculé.
        setTimeout(() => tutoFadeBlack(false), 500);
        end.querySelector('[data-tuto="menu"]').addEventListener("click", () => tutoExit(true));
        end.querySelector('[data-tuto="play"]').addEventListener("click", () => {
          tutoExit(false);
          try {
            els.gameScreen.classList.add("hidden");
            els.setupScreen.classList.remove("hidden");
          } catch (_) { }
        });
      }

      /* ---------- Démarrage / arrêt ---------------------------------- */
      function tutoStart() {
        if (TUTO.active) return;
        tutoInjectStyle();
        tutoBuildOverlay();
        tutoWatchCancelBtn();
        tutoSyncVoiceButton();
        // Amorce le chargement asynchrone des voix du navigateur et
        // (re)choisit la voix dès que la liste est disponible.
        try {
          TUTO.voice = tutoPickVoice();
          speechSynthesis.onvoiceschanged = () => { TUTO.voice = tutoPickVoice(); };
        } catch (_) { }
        TUTO.active = true;

        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }
        try { if (typeof aiRunToken !== "undefined") aiRunToken++; } catch (_) { }

        // Le tutoriel se fait toujours sur le plateau 3D, quelle que soit la
        // préférence de l'appareil ; elle est restaurée à la sortie.
        try { TUTO.prevRenderMode = boardRenderMode; } catch (_) { TUTO.prevRenderMode = "3d"; }
        try { boardRenderMode = "3d"; } catch (_) { }

        tutoBuildState();

        try { applyVisualMode("alternative"); } catch (_) { }
        try { if (typeof applyBoardRenderMode === "function") applyBoardRenderMode("3d", { persist: false }); } catch (_) { }
        try { els.setupScreen.classList.add("hidden"); } catch (_) { }
        try { els.gameScreen.classList.remove("hidden"); } catch (_) { }
        try { if (typeof startAmbient === "function") startAmbient(); } catch (_) { }
        els.gameScreen && els.gameScreen.classList.add("tutorial-on");

        // Le minuteur ne doit jamais courir pendant le tuto.
        state.turnDurationSeconds = 0;
        state.turnDeadline = null;
        state.turnTimeLeft = null;
        try { if (typeof stopTurnTimer === "function") stopTurnTimer(); } catch (_) { }

        // Capture : seul point de passage des clics de case, 2D comme 3D.
        els.board && els.board.addEventListener("click", tutoGateClick, true);
        els.board && els.board.addEventListener("mousedown", tutoGateClick, true);
        els.board && els.board.addEventListener("pointerdown", tutoGateClick, true);
        // Tout geste dans l'écran de jeu (plateau, HUD, cartes) repousse
        // l'indice de secours : il n'apparaît qu'au vrai silence.
        els.gameScreen && els.gameScreen.addEventListener("pointerdown", tutoTouched, true);
        TUTO.dom.bubble.addEventListener("click", tutoSpeechClick);
        window.addEventListener("keydown", tutoKeyGuard, true);
        ["contextmenu", "pointerdown", "mousedown", "mouseup", "auxclick"].forEach(type =>
          window.addEventListener(type, tutoRightClickGuard, true));

        // Coups d'éclat cinématiques, branchés pour toute la durée du tuto.
        const bus = window.ILYOS_VISUAL_EVENTS;
        if (bus && typeof bus.on === "function") {
          TUTO.fxUnsubs = [
            bus.on("characterFell", () => { if (TUTO.active) { tutoShake(); tutoVoidPulse(); } }),
            bus.on("crownScored", () => { if (TUTO.active) tutoBloom(); }),
            bus.on("crownPicked", () => { if (TUTO.active) tutoBloom(); })
          ];
        }

        tutoRender();
        tutoLockCamera(9000);
        // Plan d'ouverture : on bâtit d'abord le plateau du beat I derrière le
        // noir, on le révèle par un travelling, puis le beat I commence.
        setTimeout(async () => {
          if (!TUTO.active) return;
          try { TUTO_BEATS[0].setup(); } catch (_) { }
          await tutoOpeningShot();
          if (TUTO.active) tutoGoto(0);
        }, 700);
      }

      // Empêche Échap de rembobiner la partie pendant le tuto.
      function tutoKeyGuard(event) {
        if (!TUTO.active) return;
        if (event.key === "Escape") { event.stopImmediatePropagation(); event.preventDefault(); }
      }

      /* Le clic droit sur le canevas 3D déclenche l'annulation de la dernière
         action (voir le listener `contextmenu` de bindKayKitInteractions). Dans
         le tutoriel il rembobinait le chapitre à mi-parcours et laissait l'état
         incohérent avec le scénario : on l'intercepte en amont, ainsi que tout
         événement de bouton droit qui pourrait y mener. */
      function tutoRightClickGuard(event) {
        if (!TUTO.active) return;
        if (event.type !== "contextmenu" && event.button !== 2) return;
        const cible = event.target;
        if (!cible || !cible.closest) return;
        if (!cible.closest("#gameScreen") && !cible.closest("#kaykitCanvas")) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        event.preventDefault();
      }

      function tutoExit(toMenu) {
        TUTO.active = false;
        TUTO.cinematic = false;
        tutoDisarm();
        tutoGuideStop();
        tutoStopSpeak();
        (TUTO.fxUnsubs || []).forEach(u => { try { u && u(); } catch (_) { } });
        TUTO.fxUnsubs = [];
        clearTimeout(TUTO.typeTimer);
        TUTO.sayQueue = []; TUTO.sayBusy = false;

        els.board && els.board.removeEventListener("click", tutoGateClick, true);
        els.board && els.board.removeEventListener("mousedown", tutoGateClick, true);
        els.board && els.board.removeEventListener("pointerdown", tutoGateClick, true);
        els.gameScreen && els.gameScreen.removeEventListener("pointerdown", tutoTouched, true);
        window.removeEventListener("keydown", tutoKeyGuard, true);
        ["contextmenu", "pointerdown", "mousedown", "mouseup", "auxclick"].forEach(type =>
          window.removeEventListener(type, tutoRightClickGuard, true));

        els.gameScreen && els.gameScreen.classList.remove("tutorial-on", "tutorial-beat-clear");
        clearTimeout(TUTO.advanceCap);
        tutoUnlockCamera();
        if (TUTO.dom) { TUTO.dom.layer.remove(); TUTO.dom = null; }
        if (state) state.tutorial = false;

        // Restaure la préférence de rendu de l'appareil.
        try {
          if (TUTO.prevRenderMode && TUTO.prevRenderMode !== "3d" && typeof applyBoardRenderMode === "function") {
            boardRenderMode = TUTO.prevRenderMode;
            applyBoardRenderMode(TUTO.prevRenderMode, { persist: false });
          }
        } catch (_) { }

        if (toMenu) {
          try {
            els.gameScreen.classList.add("hidden");
            els.setupScreen.classList.remove("hidden");
          } catch (_) { }
          // Le menu (iframe isolée) se ré-affiche seul quand #gameScreen
          // reprend .hidden — via le MutationObserver de version-bootstrap.js.
          try { location.reload(); } catch (_) { }
        }
      }

      /* ---------- Câblage ------------------------------------------- */
      window.addEventListener("ilyos-menu-tutorial-requested", () => tutoStart());
      window.ILYOS_TUTORIAL = {
        start: tutoStart,
        exit: () => tutoExit(true),
        goto: tutoGoto,
        done: () => { try { return localStorage.getItem(TUTO_STORAGE_KEY) === "1"; } catch (_) { return false; } },
        /* Vue de l'état pour les tests : le tutoriel se pilote par clics
           simulés, et sans ce point d'observation il faudrait deviner où en est
           le scénario. N'écrit rien, ne sert à aucun chemin de jeu. */
        _debug: () => ({
          beat: TUTO.beatIndex,
          phase: state && state.phase,
          reachable: state && state.reachable ? [...state.reachable] : null,
          selectedCharId: state && state.selectedCharId,
          chars: state && state.characters.map(c => ({ id: c.id, p: c.player, r: c.r, c: c.c })),
          moveCount: (() => { try { return availableActionCount("MOVE"); } catch (e) { return String(e); } })(),
          hand: state && state.players[0].hand.map(c => c.action + (c.used ? "!" : "")),
          selectedAction: state && state.selectedActionType,
          magic: state && {
            pivot: state.selectedMagicPivot, steps: state.magicPreviewSteps,
            islandId: state.selectedIslandId, previewLen: (state.magicPreviewCells || []).length
          },
          score: state && state.players[0].score,
          enemies: state && state.characters.filter(c => c.player === 1).length,
          islandPlaced: state && state.islandPlacedThisTurn
        })
      };
