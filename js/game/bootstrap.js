(() => {
      "use strict";

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
