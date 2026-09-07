(() => {
      "use strict";

      /* ------------------------------------------------------------------
         HASARD DE JEU — point de passage unique, déterministe sur demande.

         Motif : le banc d'essai stratégique (window.ILYOS_BENCH) doit pouvoir
         rejouer exactement la même position et obtenir exactement la même
         décision de l'IA. Or plusieurs chemins de règles et de décision
         tiraient directement Math.random() — notamment un départage de ±.08
         dans aiAdjacentCrownPickup() qui n'était filtré par AUCUN réglage de
         difficulté, et rendait donc l'Expert non déterministe même à
         randomness: 0.

         Règle d'usage : gameRandom() remplace Math.random() UNIQUEMENT sur
         les chemins qui influencent l'état de jeu ou une décision d'IA. Le
         hasard purement visuel (particules, variantes de décor, variations
         sonores dans audio.js et kaykit3d.js) garde Math.random() : nous
         voulons un déterminisme stratégique, pas un déterminisme de chaque
         nuage.

         Sans graine posée, gameRandom() EST Math.random() : une partie
         normale reste exactement aussi aléatoire qu'avant. Le mode
         déterministe ne s'active que par setTestRandomSeed(n) explicite.

         Le générateur est délibérément gardé hors de `state` : y placer une
         fonction casserait structuredClone(), la sauvegarde locale et la
         synchronisation en ligne — et gênerait la future simulation du
         planner, qui doit pouvoir cloner l'état librement. */
      let ilyosSeededRandom = null;
      /* Graine en vigueur, conservée pour l archivage : une revue sans sa
         graine ne se rejoue pas à l identique. null = hasard normal. */
      let ilyosGraineActive = null;

      /* mulberry32 : 32 bits d'état, une seule multiplication imul par tirage,
         période 2^32. Largement suffisant pour départager des coups et battre
         un paquet de 13 cartes, et surtout reproductible à l'identique. */
      function ilyosMakeSeededRandom(seed) {
        let a = seed >>> 0;
        return function () {
          a = (a + 0x6D2B79F5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }

      function gameRandom() {
        return ilyosSeededRandom ? ilyosSeededRandom() : Math.random();
      }

      /** Pose (nombre) ou retire (null/undefined) la graine déterministe.
       *  Réservé au banc d'essai : une vraie partie ne doit jamais l'appeler. */
      function setTestRandomSeed(seed) {
        ilyosGraineActive = (seed === null || seed === undefined) ? null : seed;
        ilyosSeededRandom = (seed === null || seed === undefined)
          ? null
          : ilyosMakeSeededRandom(Number(seed));
        return ilyosSeededRandom !== null;
      }

      function isTestRandomSeeded() {
        return ilyosSeededRandom !== null;
      }

      /* Facteur d'accélération des temporisations, réservé au banc d'essai.
         Les pauses de l'IA (thinkDelay, actionDelay, attentes d'animation) sont
         purement cosmétiques : elles rendent le tour lisible pour un spectateur
         et n'entrent dans aucune décision. Les compresser pendant une mesure ne
         change donc que la durée du banc, jamais son résultat — ce que le test
         de reproductibilité vérifie explicitement en comparant vitesse normale
         et vitesse accélérée. 1 = rythme normal du jeu. */
      let benchSpeedFactor = 1;

      /* Mode simulation : les noyaux de règles s'exécutent sur un état cloné,
         sans rien raconter. Tous les points d'entrée de présentation — rendu,
         toasts, sons, animations, effets, sauvegarde d'annulation, statistiques
         — s'effacent quand ce drapeau est levé.

         C'est ce qui permet au planner d'utiliser LES MÊMES fonctions de règles
         que le jeu réel plutôt qu'une seconde implémentation : une règle qui
         change plus tard change pour les deux à la fois, et aucune divergence
         silencieuse ne peut s'installer entre ce que l'IA prévoit et ce que le
         jeu applique.

         Toujours faux en jeu normal. */
      let ilyosSimulationActive = false;
      function enSimulation() { return ilyosSimulationActive; }

      /* Taille du plateau. Variable, pas constante : le joueur peut choisir
         11×11 ou 13×13 au menu. GRID, CENTER et CORNERS sont recalculés
         ensemble par setBoardSize(), avant toute création de partie.

         Deux règles à respecter pour toute nouvelle valeur dérivée :
           — ne jamais la figer dans un `const` de module, elle serait périmée
             au premier changement de taille (c'était le cas de
             KAYKIT_BOARD_SPAN, devenu une fonction) ;
           — passer par CENTER/CORNERS plutôt que par des coordonnées écrites
             à la main, sinon la logique reste clouée au 11×11.

         La taille doit rester IMPAIRE : le sanctuaire et la couronne occupent
         la case centrale, qui n'existe que sur une grille impaire. */
      const BOARD_SIZES = [11, 13];
      const DEFAULT_BOARD_SIZE = 11;
      let GRID = DEFAULT_BOARD_SIZE;
      let CENTER = { r: (GRID - 1) / 2, c: (GRID - 1) / 2 };
      const MAX_GUARDIANS_PER_PLAYER = 6;
      // Joueur 0 (Chevalier) et 1 (Mage) alignés sur les couleurs déjà
      // utilisées pour leur armure/robe (character-materials-v1.js) et leur
      // portrait HUD (or / violet) — les villages, fanions et halos de
      // sélection lisaient auparavant bleu/rouge, sans rapport avec le reste
      // de l'identité visuelle du joueur.
      const PLAYER_COLORS = ["#ddb653", "#8052bc", "#62e36b", "#bb7cff"];
      const PLAYER_ICONS = ["🧙", "🧝", "🛡️", "🧑‍🚀"];
      let CORNERS = [
        { r: 0, c: 0 },
        { r: 0, c: GRID - 1 },
        { r: GRID - 1, c: GRID - 1 },
        { r: GRID - 1, c: 0 }
      ];

      function normalizeBoardSize(taille) {
        const n = Number(taille);
        return BOARD_SIZES.includes(n) ? n : DEFAULT_BOARD_SIZE;
      }

      /* Point d'entrée unique pour changer la taille du plateau. Appelé avant
         la construction d'une partie, jamais pendant. */
      function setBoardSize(taille) {
        GRID = normalizeBoardSize(taille);
        CENTER = { r: (GRID - 1) / 2, c: (GRID - 1) / 2 };
        // Le plateau DOM et l'aperçu symétrique se disposent en repeat(var(--board-n), 1fr).
        try { document.documentElement.style.setProperty("--board-n", String(GRID)); } catch (_) {}
        CORNERS = [
          { r: 0, c: 0 },
          { r: 0, c: GRID - 1 },
          { r: GRID - 1, c: GRID - 1 },
          { r: GRID - 1, c: 0 }
        ];

        /* La scène 3D n'est construite qu'une fois par session : ses bornes de
           caméra gardaient sinon les valeurs de la PREMIÈRE partie, et un
           passage 11×11 → 13×13 se retrouvait cadré pour l'ancienne taille —
           sans erreur, juste un plateau qui déborde. */
        if (typeof kaykit3D !== "undefined" && kaykit3D) {
          kaykit3D.gridSize = GRID;
          kaykit3D.minZoom = 6.4 * (GRID / 11);
          kaykit3D.maxZoom = 25 * (GRID / 11);
          kaykit3D.zoomDistance = 12.4 * (GRID / 11);
          if (kaykit3D.orbit) {
            kaykit3D.orbit.minDistance = kaykit3D.minZoom;
            kaykit3D.orbit.maxDistance = kaykit3D.maxZoom;
          }
        }
        return GRID;
      }
      const SHAPES = {
        domino: { name: "Domino", cells: [[0, 0], [1, 1]] },
        line3: { name: "Passerelle", cells: [[0, 0], [0, 1], [0, 2]] },
        l3: { name: "Virage", cells: [[0, 0], [1, 0], [1, 1]] },
        square: { name: "Carré", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
        t4: { name: "Carrefour", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
        s4: { name: "Serpent", cells: [[0, 1], [0, 2], [1, 0], [1, 1]], flippable: true },
        cross5: { name: "Croix", cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
        crossHollow: { name: "Croix creuse", cells: [[0, 1], [1, 0], [1, 2], [2, 1]] },
        v3: { name: "V", cells: [[0, 0], [1, 1], [0, 2]] }
      };
      /* Nombre d'exemplaires de CHAQUE forme dont dispose une équipe sur toute
         la partie. Ce n'est pas un plafond du nombre d'îles possédées : c'est un
         stock de pièces, forme par forme. 0 = illimité.

         Valeur par défaut seulement : le duel symétrique la fait choisir au
         joueur (voir shapeLimitPerOwner dans state.rules). Passer par
         shapeLimitPerOwner() plutôt que par cette constante. */
      const SHAPE_LIMIT_PER_OWNER_DEFAULT = 2;
      function shapeLimitPerOwner() {
        const limite = state?.rules?.shapeLimitPerOwner;
        return Number.isFinite(limite) ? limite : SHAPE_LIMIT_PER_OWNER_DEFAULT;
      }
      const ACTIONS = {
        MOVE: { name: "Déplacement", icon: "🥾", desc: "1 action = 1 case. 2 actions permettent une diagonale.", bg: "#0d84c9" },
        PUSH: { name: "Poussée", icon: "💥", desc: "Poussez une cible adjacente.", bg: "#b33d32" },
        MAGIC: { name: "Magie", icon: "🔮", desc: "1 magie permet toute rotation : 90°, 180°, 270° ou 360°.", bg: "#7d45cb" }
      };
      const CARD_BLUEPRINTS = [
        "MOVE", "MOVE", "MOVE", "MOVE",
        "MOVE", "MOVE", "MOVE", "MOVE",
        "PUSH", "PUSH", "PUSH", "PUSH",
        "MAGIC"
      ];

      const els = {
        setupScreen: document.getElementById("setupScreen"),
        gameScreen: document.getElementById("gameScreen"),
        playerCount: document.getElementById("playerCount"),
        playersForm: document.getElementById("playersForm"),
        modeOptions: document.getElementById("modeOptions"),
        resumeLocalPanel: document.getElementById("resumeLocalPanel"),
        startBtn: document.getElementById("startBtn"),
        altStartBtn: document.getElementById("altStartBtn"),
        rulesSetupBtn: document.getElementById("rulesSetupBtn"),

        activePortrait: document.getElementById("activePortrait"),
        activeName: document.getElementById("activeName"),
        turnRibbon: document.getElementById("turnRibbon"),
        turnRibbonPortrait: document.getElementById("turnRibbonPortrait"),
        turnRibbonName: document.getElementById("turnRibbonName"),
        turnRibbonMeta: document.getElementById("turnRibbonMeta"),
        symmetricSetupOverlay: document.getElementById("symmetricSetupOverlay"),
        symmetricSetupSelect: document.getElementById("symmetricSetupSelect"),
        randomSymmetricSetupBtn: document.getElementById("randomSymmetricSetupBtn"),
        confirmSymmetricSetupBtn: document.getElementById("confirmSymmetricSetupBtn"),
        symmetricSetupWaiting: document.getElementById("symmetricSetupWaiting"),
        symmetricIslandLimitSelect: document.getElementById("symmetricIslandLimitSelect"),
        symmetricAllowDissolveCheckbox: document.getElementById("symmetricAllowDissolveCheckbox"),
        // Mode Personnalisé : sections de l'overlay de mise en place et
        // quantités de la formation à poser (voir startCustomDraft).
        symmetricPresetControls: document.getElementById("symmetricPresetControls"),
        symmetricPresetContent: document.getElementById("symmetricPresetContent"),
        customSetupControls: document.getElementById("customSetupControls"),
        customIslandCountSelect: document.getElementById("customIslandCountSelect"),
        customGuardianCountSelect: document.getElementById("customGuardianCountSelect"),
        setupOverlayKicker: document.getElementById("setupOverlayKicker"),
        setupOverlayTitle: document.getElementById("setupOverlayTitle"),
        setupOverlayIntro: document.getElementById("setupOverlayIntro"),
        phaseLabel: document.getElementById("phaseLabel"),
        turnLabel: document.getElementById("turnLabel"),
        turnTimer: document.getElementById("turnTimer"),
        onlineBadge: document.getElementById("onlineBadge"),
        crownStatus: document.getElementById("crownStatus"),
        instruction: document.getElementById("instruction"),
        phaseOrb: document.getElementById("phaseOrb"),
        stepIsland: document.getElementById("stepIsland"),
        stepActions: document.getElementById("stepActions"),
        stepEnd: document.getElementById("stepEnd"),

        deckCount: document.getElementById("deckCount"),
        handCount: document.getElementById("handCount"),
        discardCount: document.getElementById("discardCount"),
        islandCount: document.getElementById("islandCount"),

        islandSelector: document.getElementById("islandSelector"),
        rotateLeftBtn: document.getElementById("rotateLeftBtn"),
        rotateRightBtn: document.getElementById("rotateRightBtn"),
        flipBtn: document.getElementById("flipBtn"),
        cancelCardBtn: document.getElementById("cancelCardBtn"),
        endTurnBtn: document.getElementById("endTurnBtn"),

        boardWrap: document.querySelector(".board-wrap"),
        board: document.getElementById("board"),
        scoreList: document.getElementById("scoreList"),
        unitCard: document.getElementById("unitCard"),
        hand: document.getElementById("hand"),
        deckDisplay: document.getElementById("deckDisplay"),

        rulesBtn: document.getElementById("rulesBtn"),
        soundBtn: document.getElementById("soundBtn"),
        soundMenu: document.getElementById("soundMenu"),
        closeSoundMenuBtn: document.getElementById("closeSoundMenuBtn"),
        soundToggleBtn: document.getElementById("soundToggleBtn"),
        musicTrackSelect: document.getElementById("musicTrackSelect"),
        masterVolumeSlider: document.getElementById("masterVolumeSlider"),
        musicVolumeSlider: document.getElementById("musicVolumeSlider"),
        effectsVolumeSlider: document.getElementById("effectsVolumeSlider"),
        masterVolumeValue: document.getElementById("masterVolumeValue"),
        musicVolumeValue: document.getElementById("musicVolumeValue"),
        effectsVolumeValue: document.getElementById("effectsVolumeValue"),
        testSoundBtn: document.getElementById("testSoundBtn"),
        kaykitCacheBtn: document.getElementById("kaykitCacheBtn"),
        kaykitCacheStatus: document.getElementById("kaykitCacheStatus"),
        newGameBtn: document.getElementById("newGameBtn"),
        ilyosSpiralTestBtn: document.getElementById("ilyosSpiralTestBtn"),
        ilyosAIvsAITestBtn: document.getElementById("ilyosAIvsAITestBtn"),
        onlineTools: document.getElementById("onlineTools"),
        onlineRoomCodeLabel: document.getElementById("onlineRoomCodeLabel"),
        copyRoomCodeBtn: document.getElementById("copyRoomCodeBtn"),
        reconnectOnlineBtn: document.getElementById("reconnectOnlineBtn"),
        rulesModal: document.getElementById("rulesModal"),
        closeRulesBtn: document.getElementById("closeRulesBtn"),

        victoryModal: document.getElementById("victoryModal"),
        victoryRecap: document.getElementById("victoryRecap"),
        victoryTitle: document.getElementById("victoryTitle"),
        victoryText: document.getElementById("victoryText"),
        victoryPortrait: document.getElementById("victoryPortrait"),
        victoryStats: document.getElementById("victoryStats"),
        replayBtn: document.getElementById("replayBtn"),
        backSetupBtn: document.getElementById("backSetupBtn"),

        altModeIntro: document.getElementById("altModeIntro"),
        toast: document.getElementById("toast"),
        leftPanel: document.querySelector(".left-panel"),
        rightPanel: document.querySelector(".right-panel")
      };

      let state = null;
      let pendingVisualMode = "alternative";

      /* Le HUD professionnel reste le même dans les deux rendus. Seule la
         représentation du plateau change : Three.js en 3D, ou le plateau DOM
         historique en 2D. Ce choix est volontairement local à l'appareil : il
         ne fait pas partie des règles, des sauvegardes ni de la synchro réseau. */
      const BOARD_RENDER_MODE_STORAGE_KEY = "ilyos-board-render-mode-v1";

      function readPreferredBoardRenderMode() {
        try {
          return localStorage.getItem(BOARD_RENDER_MODE_STORAGE_KEY) === "2d" ? "2d" : "3d";
        } catch (_) {
          return "3d";
        }
      }

      let boardRenderMode = readPreferredBoardRenderMode();

      function isKayKitBoardActive() {
        return boardRenderMode !== "2d";
      }

      /* Valeur de state.winner désignant un MATCH NUL. Distincte de null, qui
         signifie « partie en cours » : tout le code teste winner === null pour
         savoir si la partie continue, et doit continuer à le faire. */
      const MATCH_NUL = -1;

      /* Rangement des cartes en fin de tour. Déclaré ici pour être visible de
         tous les fragments ; l'implémentation est fournie par le module de
         réserve physique, exactement comme consumeAvailableActions. Un seul
         corps de règle, plusieurs appelants : la vraie fin de tour, le
         self-play et la transition simulée du planner. */
      let rangerCartesFinDeTour = function (player) {
        if (!player) return { MOVE: 0, PUSH: 0, MAGIC: 0 };
        player.hand = [];
        return { MOVE: 0, PUSH: 0, MAGIC: 0 };
      };

      /* Fin de tour complète : ce qui tient en réserve y va, TOUT le reste
         part à la défausse. Deuxième moitié indissociable de la règle — sans
         elle, le surplus disparaissait du jeu et la pioche ne se
         reconstituait plus. */
      let rangerEtDefausserFinDeTour = function (player) {
        if (!player) return { MOVE: 0, PUSH: 0, MAGIC: 0 };
        const range = rangerCartesFinDeTour(player);
        player.discard = Array.isArray(player.discard) ? player.discard : [];
        (player.hand || []).forEach(carte => {
          player.discard.push({ ...carte, used: false, fromStash: false, fromReserve: false });
        });
        player.hand = [];
        return range;
      };

      /* Ce que la réserve CONTIENDRA au prochain tour, sans rien modifier.

         À distinguer soigneusement de ce qui est jouable maintenant : une
         carte au-dessus du plafond de son type ne survivra pas à la fin du
         tour. Elle n'a donc aucune valeur de conservation — et lui en donner
         une pousse l'IA à thésauriser des ressources qui n'existeront plus. */
      let projeterReserveFinDeTour = function (player) {
        return { MOVE: 0, PUSH: 0, MAGIC: 0 };
      };
