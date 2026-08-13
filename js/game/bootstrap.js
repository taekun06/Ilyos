(() => {
      "use strict";

      const GRID = 11;
      const CENTER = { r: 5, c: 5 };
      const MAX_GUARDIANS_PER_PLAYER = 6;
      const PLAYER_COLORS = ["#22c3f2", "#ff5b50", "#62e36b", "#bb7cff"];
      const PLAYER_ICONS = ["🧙", "🧝", "🛡️", "🧑‍🚀"];
      const CORNERS = [
        { r: 0, c: 0 },
        { r: 0, c: 10 },
        { r: 10, c: 10 },
        { r: 10, c: 0 }
      ];
      const SHAPES = {
        domino: { name: "Domino", cells: [[0, 0], [0, 1]] },
        line3: { name: "Passerelle", cells: [[0, 0], [0, 1], [0, 2]] },
        l3: { name: "Virage", cells: [[0, 0], [1, 0], [1, 1]] },
        square: { name: "Carré", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
        t4: { name: "Carrefour", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
        s4: { name: "Serpent", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
        cross5: { name: "Croix", cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
        v3: { name: "V", cells: [[0, 0], [1, 1], [0, 2]] }
      };
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
        onlineTools: document.getElementById("onlineTools"),
        onlineRoomCodeLabel: document.getElementById("onlineRoomCodeLabel"),
        copyRoomCodeBtn: document.getElementById("copyRoomCodeBtn"),
        reconnectOnlineBtn: document.getElementById("reconnectOnlineBtn"),
        rulesModal: document.getElementById("rulesModal"),
        closeRulesBtn: document.getElementById("closeRulesBtn"),

        victoryModal: document.getElementById("victoryModal"),
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
