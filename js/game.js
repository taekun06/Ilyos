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
      /* =====================================================================
         ILYOS — KAYKIT EDITION / moteur visuel Three.js
         Le modèle de jeu reste dans le DOM. Cette scène 3D reflète l'état et
         redirige les interactions vers les cellules originales.
         ===================================================================== */

      /* =====================================================================
         INSTRUMENTATION DE FLUIDITÉ (V77) — légère, désactivable, temporaire.
         window.ILYOS_PERF.enabled = false coupe toute la collecte (chaque
         point d'appel est gardé par `if (window.ILYOS_PERF)`, donc désactiver
         revient à ne plus rien mesurer, sans toucher au reste du moteur).
         window.ILYOS_PERF.report() renvoie un instantané : durée de
         syncKayKitScene (moyenne/p95/max), FPS et frametemps RÉELS (mesurés au
         point de renderer.render(), pas via une boucle rAF indépendante),
         renderer.info (appels, triangles, géométries, textures), nombre de
         synchronisations depuis le dernier resetActionSyncCount(), et les
         Long Tasks (>50 ms) captées par PerformanceObserver.
         ===================================================================== */
      window.ILYOS_PERF = (() => {
        const syncDurations = [];
        const frameDeltas = [];
        const longTasks = [];
        const boardRenderDurations = [];
        let lastFrameAt = 0;
        let syncsSinceReset = 0;
        // V78 (passe fluidité) : compteurs légers, alimentés depuis les
        // points d'appel déjà existants (renderBoard/ensureBoardCells) —
        // aucune boucle de mesure supplémentaire.
        let boardFullRebuilds = 0;
        let boardCellsTouched = 0;
        let forcedLayoutsInPath3D = 0;
        const MAX_SAMPLES = 400;

        let longTaskObserver = null;
        try {
          if ("PerformanceObserver" in window) {
            longTaskObserver = new PerformanceObserver(list => {
              list.getEntries().forEach(entry => {
                if (entry.duration >= 50) {
                  longTasks.push({ at: Math.round(entry.startTime), duration: Math.round(entry.duration) });
                  if (longTasks.length > 100) longTasks.shift();
                }
              });
            });
            longTaskObserver.observe({ entryTypes: ["longtask"] });
          }
        } catch (_) { /* Long Tasks non supportées par ce navigateur — pas bloquant */ }

        function percentile(sortedAsc, p) {
          if (!sortedAsc.length) return 0;
          const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
          return sortedAsc[idx];
        }
        function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

        return {
          enabled: true,
          recordSync(ms) {
            if (!this.enabled) return;
            syncDurations.push(ms);
            if (syncDurations.length > MAX_SAMPLES) syncDurations.shift();
            syncsSinceReset++;
          },
          recordFrame(now) {
            if (!this.enabled) return;
            if (lastFrameAt) {
              frameDeltas.push(now - lastFrameAt);
              if (frameDeltas.length > MAX_SAMPLES) frameDeltas.shift();
            }
            lastFrameAt = now;
          },
          resetActionSyncCount() { syncsSinceReset = 0; },
          // V78 : appelés depuis renderBoard()/ensureBoardCells() (js/game/ui.js)
          // — un seul point d'appel par évènement réel, pas de nouvelle boucle.
          recordBoardRebuild() { boardFullRebuilds++; },
          recordBoardCellsTouched(count) { boardCellsTouched += count; },
          recordForcedLayout3D() { forcedLayoutsInPath3D++; },
          recordBoardRender(ms) {
            if (!this.enabled) return;
            boardRenderDurations.push(ms);
            if (boardRenderDurations.length > MAX_SAMPLES) boardRenderDurations.shift();
          },
          clear() {
            syncDurations.length = 0; frameDeltas.length = 0; longTasks.length = 0;
            boardRenderDurations.length = 0;
            syncsSinceReset = 0; lastFrameAt = 0;
            boardFullRebuilds = 0; boardCellsTouched = 0; forcedLayoutsInPath3D = 0;
          },
          report() {
            const r = window.kaykit3D?.renderer;
            const sortedSync = [...syncDurations].sort((a, b) => a - b);
            const sortedFrames = [...frameDeltas].sort((a, b) => a - b);
            const sortedBoard = [...boardRenderDurations].sort((a, b) => a - b);
            const meanFrameMs = avg(frameDeltas);
            return {
              sync: {
                avgMs: +avg(syncDurations).toFixed(2),
                p95Ms: +percentile(sortedSync, .95).toFixed(2),
                maxMs: sortedSync.length ? +sortedSync[sortedSync.length - 1].toFixed(2) : 0,
                samples: syncDurations.length
              },
              // FPS plafonné par la cadence réelle de renderer.render() : ne peut
              // jamais dépasser ce que le moteur affiche vraiment à l'écran.
              fps: meanFrameMs ? +(1000 / meanFrameMs).toFixed(1) : 0,
              frameTimeMs: +meanFrameMs.toFixed(2),
              frameTimeP95Ms: +percentile(sortedFrames, .95).toFixed(2),
              frameTimeMaxMs: sortedFrames.length ? +sortedFrames[sortedFrames.length - 1].toFixed(2) : 0,
              render: r ? { calls: r.info.render.calls, triangles: r.info.render.triangles } : null,
              memory: r ? { geometries: r.info.memory.geometries, textures: r.info.memory.textures } : null,
              syncsSinceReset,
              longTasksCount: longTasks.length,
              longTasksRecent: longTasks.slice(-10),
              board: {
                fullRebuilds: boardFullRebuilds,
                cellsTouched: boardCellsTouched,
                forcedLayoutsInPath3D,
                avgMs: +avg(boardRenderDurations).toFixed(2),
                p95Ms: +percentile(sortedBoard, .95).toFixed(2),
                maxMs: sortedBoard.length ? +sortedBoard[sortedBoard.length - 1].toFixed(2) : 0
              }
            };
          }
        };
      })();

      const KAYKIT_CDN = {
        characters: "https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0@main/addons/kaykit_character_pack_adventures/Characters/gltf/",
        adventurerAssets: "https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0@main/addons/kaykit_character_pack_adventures/Assets/gltf/",
        adventurerTextures: "https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0@main/addons/kaykit_character_pack_adventures/Textures/",
        skeletonCharacters: "https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0@main/addons/kaykit_character_pack_skeletons/Characters/gltf/",
        medieval: "https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0@main/addons/kaykit_medieval_hexagon_pack/Assets/gltf/",
        medievalTextures: "https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0@main/addons/kaykit_medieval_hexagon_pack/Textures/"
      };

      /* Tous les dépôts gratuits officiels publiés par KayKit sur GitHub.
         Le catalogue complet est découvert en ligne puis mis en cache.
         Les modèles sont chargés paresseusement : tous les packs sont disponibles,
         mais le navigateur ne télécharge pas des centaines de modèles inutiles. */
      const KAYKIT_OFFICIAL_PACKS = [
        { id: "adventurers", label: "Aventuriers", repo: "KayKit-Character-Pack-Adventures-1.0", keywords: ["Knight.glb", "Mage.glb", "Rogue.glb", "Barbarian.glb"] },
        { id: "skeletons", label: "Squelettes", repo: "KayKit-Character-Pack-Skeletons-1.0", keywords: ["Skeleton_Warrior.glb", "Skeleton_Mage.glb", "Skeleton_Rogue.glb", "Skeleton_Minion.glb"] },
        { id: "medieval", label: "Hexagones médiévaux", repo: "KayKit-Medieval-Hexagon-Pack-1.0", keywords: ["building_castle", "mountain", "tree_single", "hex_grass"] },
        { id: "dungeon", label: "Donjon", repo: "KayKit-Dungeon-Remastered-1.0", keywords: ["chest", "barrel", "pillar", "banner", "torch", "crate"] },
        { id: "halloween", label: "Halloween", repo: "KayKit-Halloween-Bits-1.0", keywords: ["mausoleum", "gravestone", "grave", "pumpkin", "dead_tree", "lantern"] },
        { id: "restaurant", label: "Restaurant", repo: "KayKit-Restaurant-Bits-1.0", keywords: ["counter", "oven", "stove", "table", "food", "burger", "pizza"] },
        { id: "space", label: "Base spatiale", repo: "KayKit-Space-Base-Bits-1.0", keywords: ["module", "satellite", "antenna", "solar", "airlock", "crate"] },
        { id: "furniture", label: "Mobilier", repo: "KayKit-Furniture-Bits-1.0", keywords: ["bookshelf", "sofa", "armchair", "table", "chair", "bed"] },
        { id: "city", label: "Ville", repo: "KayKit-City-Builder-Bits-1.0", keywords: ["building", "house", "car", "lamp", "road", "tree"] },
        { id: "prototype", label: "Prototype", repo: "KayKit-Prototype-Bits-1.0", keywords: ["gem", "star", "flag", "coin", "chest", "sphere", "cube"] },
        { id: "blockBits", label: "Block Bits", repo: "KayKit_BlockBits_1.0_FREE", keywords: ["dirt_with_grass", "dirt", "grass", "stone"] }
      ];
      /* Héros chargés seulement quand une partie en a besoin.
         resolveHeroAssetKey() n'utilise que hero0 et hero1 à deux joueurs ; les
         trois autres ne servent qu'aux parties à trois ou quatre. Ils pèsent
         10,3 Mo sur les 19,9 Mo téléchargés à l'ouverture de la scène, soit la
         moitié du chargement initial pour des modèles que la majorité des
         parties n'affiche jamais.

         Ils restent déclarés dans KAYKIT_ASSETS : seul le lancement groupé les
         ignore. Toute demande ultérieure passe par ensureKayKitAsset(), qui
         mémoïse via kaykit3D.assetPromises. */
      const KAYKIT_DEFERRED_ASSETS = new Set(["hero2", "hero2Hooded", "hero3"]);

      const KAYKIT_CATALOG_CACHE_VERSION = "v45-local-2026-08";
      const KAYKIT_ASSET_MODE = "local-verified";
      const KAYKIT_USE_LOCAL = true;

      const KAYKIT_LOCAL_ROOT = "./assets/kaykit/";
      function kaykitAssetSpec(group, relativePath, textureUrl = null) {
        const local = KAYKIT_LOCAL_ROOT + group + "/" + relativePath;
        return {
          group,
          relativePath,
          urls: [local],
          // Les GLTF locaux référencent déjà leur texture exacte dans le même dossier.
          // Aucun atlas générique n'est réinjecté dans les matériaux.
          textures: [],
          expectedTexture: textureUrl ? textureUrl.split("/").pop() : null
        };
      }

      const ADVENTURER_TEXTURES = {
        knight: KAYKIT_CDN.adventurerTextures + "knight_texture.png",
        mage: KAYKIT_CDN.adventurerTextures + "mage_texture.png",
        rogue: KAYKIT_CDN.adventurerTextures + "rogue_texture.png",
        barbarian: KAYKIT_CDN.adventurerTextures + "barbarian_texture.png"
      };
      const MEDIEVAL_ATLAS = KAYKIT_CDN.medievalTextures + "hexagons_medieval.png";

      const KAYKIT_ASSETS = {
        // Personnages gratuits officiels : plus de 75 clips intégrés.
        hero0: kaykitAssetSpec("characters", "Knight.glb", KAYKIT_CDN.characters + "knight_texture.png"),
        hero1: kaykitAssetSpec("characters", "Mage.glb", KAYKIT_CDN.characters + "mage_texture.png"),
        hero2: kaykitAssetSpec("characters", "Rogue.glb", KAYKIT_CDN.characters + "rogue_texture.png"),
        hero2Hooded: kaykitAssetSpec("characters", "Rogue_Hooded.glb", KAYKIT_CDN.characters + "rogue_texture.png"),
        hero3: kaykitAssetSpec("characters", "Barbarian.glb", KAYKIT_CDN.characters + "barbarian_texture.png"),

        /* Le pack Squelettes (4 GLB, 18,4 Mo) était chargé ici avec tout le
           reste au démarrage de la scène. Il ne servait qu'au navigateur de
           packs décoratif, lui-même hors service depuis la V45 :
           registerKayKitPackRepresentative() n'a plus d'appelant, donc
           packRepresentatives reste vide et renderKayKitOfficialPackDecor()
           sort immédiatement. Aucun chemin de jeu ne référençait ces modèles.
           Les fichiers restent dans assets/kaykit/skeletonCharacters/ si le
           navigateur de packs revient un jour — mais ils devront alors être
           chargés à la demande, pas dans cette liste eager. */

        // Accessoires Aventuriers.
        sword: kaykitAssetSpec("adventurerAssets", "sword_1handed.gltf", ADVENTURER_TEXTURES.knight),
        shield: kaykitAssetSpec("adventurerAssets", "shield_badge_color.gltf", ADVENTURER_TEXTURES.knight),
        staff: kaykitAssetSpec("adventurerAssets", "staff.gltf", ADVENTURER_TEXTURES.mage),
        spellbook: kaykitAssetSpec("adventurerAssets", "spellbook_open.gltf", ADVENTURER_TEXTURES.mage),
        dagger: kaykitAssetSpec("adventurerAssets", "dagger.gltf", ADVENTURER_TEXTURES.rogue),
        smokebomb: kaykitAssetSpec("adventurerAssets", "smokebomb.gltf", ADVENTURER_TEXTURES.rogue),
        axe: kaykitAssetSpec("adventurerAssets", "axe_1handed.gltf", ADVENTURER_TEXTURES.barbarian),
        barbarianShield: kaykitAssetSpec("adventurerAssets", "shield_round_barbarian.gltf", ADVENTURER_TEXTURES.barbarian),

        // Terrain principal.
        tile: kaykitAssetSpec("medieval", "tiles/base/hex_grass.gltf", MEDIEVAL_ATLAS),
        tileBottom: kaykitAssetSpec("medieval", "tiles/base/hex_grass_bottom.gltf", MEDIEVAL_ATLAS),
        tileSlopeLow: kaykitAssetSpec("medieval", "tiles/base/hex_grass_sloped_low.gltf", MEDIEVAL_ATLAS),
        tileSlopeHigh: kaykitAssetSpec("medieval", "tiles/base/hex_grass_sloped_high.gltf", MEDIEVAL_ATLAS),
        waterTile: kaykitAssetSpec("medieval", "tiles/base/hex_water.gltf", MEDIEVAL_ATLAS),

        // Vrais blocs officiels KayKit Block Bits 1.0.
        blockBitsGrassDirt: kaykitAssetSpec("blockBits", "dirt_with_grass.gltf", "./assets/kaykit/blockBits/block_bits_texture.png"),
        blockBitsDirt: kaykitAssetSpec("blockBits", "dirt.gltf", "./assets/kaykit/blockBits/block_bits_texture.png"),
        blockBitsGrass: kaykitAssetSpec("blockBits", "grass.gltf", "./assets/kaykit/blockBits/block_bits_texture.png"),
        blockBitsStone: kaykitAssetSpec("blockBits", "stone.gltf", "./assets/kaykit/blockBits/block_bits_texture.png"),

        // KayKit Forest Nature Pack local : variation légère et non bloquante des grandes îles.
        forestTree: kaykitAssetSpec("forestNature", "Tree_2_A_Color1.gltf", "./assets/kaykit/forestNature/forest_texture.png"),
        forestBush: kaykitAssetSpec("forestNature", "Bush_2_A_Color1.gltf", "./assets/kaykit/forestNature/forest_texture.png"),
        forestRock: kaykitAssetSpec("forestNature", "Rock_1_A_Color1.gltf", "./assets/kaykit/forestNature/forest_texture.png"),
        forestGrass: kaykitAssetSpec("forestNature", "Grass_1_A_Color1.gltf", "./assets/kaykit/forestNature/forest_texture.png"),

        // Nature étendue.
        treeA: kaykitAssetSpec("medieval", "decoration/nature/tree_single_A.gltf", MEDIEVAL_ATLAS),
        treeB: kaykitAssetSpec("medieval", "decoration/nature/tree_single_B.gltf", MEDIEVAL_ATLAS),
        treesASmall: kaykitAssetSpec("medieval", "decoration/nature/trees_A_small.gltf", MEDIEVAL_ATLAS),
        treesAMedium: kaykitAssetSpec("medieval", "decoration/nature/trees_A_medium.gltf", MEDIEVAL_ATLAS),
        treesBSmall: kaykitAssetSpec("medieval", "decoration/nature/trees_B_small.gltf", MEDIEVAL_ATLAS),
        treesBMedium: kaykitAssetSpec("medieval", "decoration/nature/trees_B_medium.gltf", MEDIEVAL_ATLAS),
        rockA: kaykitAssetSpec("medieval", "decoration/nature/rock_single_A.gltf", MEDIEVAL_ATLAS),
        rockB: kaykitAssetSpec("medieval", "decoration/nature/rock_single_B.gltf", MEDIEVAL_ATLAS),
        rockC: kaykitAssetSpec("medieval", "decoration/nature/rock_single_C.gltf", MEDIEVAL_ATLAS),
        rockD: kaykitAssetSpec("medieval", "decoration/nature/rock_single_D.gltf", MEDIEVAL_ATLAS),
        rockE: kaykitAssetSpec("medieval", "decoration/nature/rock_single_E.gltf", MEDIEVAL_ATLAS),
        hillA: kaykitAssetSpec("medieval", "decoration/nature/hill_single_A.gltf", MEDIEVAL_ATLAS),
        hillB: kaykitAssetSpec("medieval", "decoration/nature/hill_single_B.gltf", MEDIEVAL_ATLAS),
        hillC: kaykitAssetSpec("medieval", "decoration/nature/hill_single_C.gltf", MEDIEVAL_ATLAS),
        mountainA: kaykitAssetSpec("medieval", "decoration/nature/mountain_A_grass_trees.gltf", MEDIEVAL_ATLAS),
        // Montagnes NUES, pour les îles flottantes lointaines. Ce sont elles qu'on
        // retourne pointe en bas : les variantes _grass_trees ont leur végétation au
        // sommet, qui se retrouverait sous l'île une fois inversée.
        // 1,80 de large pour 1,43 à 1,77 de haut — exactement la silhouette voulue.
        bareMountainA: kaykitAssetSpec("medieval", "decoration/nature/mountain_A.gltf", MEDIEVAL_ATLAS),
        bareMountainB: kaykitAssetSpec("medieval", "decoration/nature/mountain_B.gltf", MEDIEVAL_ATLAS),
        bareMountainC: kaykitAssetSpec("medieval", "decoration/nature/mountain_C.gltf", MEDIEVAL_ATLAS),
        mountainB: kaykitAssetSpec("medieval", "decoration/nature/mountain_B_grass_trees.gltf", MEDIEVAL_ATLAS),
        mountainC: kaykitAssetSpec("medieval", "decoration/nature/mountain_C_grass_trees.gltf", MEDIEVAL_ATLAS),

        // Bâtiments et éléments de décor.
        sanctuary: kaykitAssetSpec("medieval", "buildings/neutral/building_stage_C.gltf", MEDIEVAL_ATLAS),
        stageA: kaykitAssetSpec("medieval", "buildings/neutral/building_stage_A.gltf", MEDIEVAL_ATLAS),
        stageB: kaykitAssetSpec("medieval", "buildings/neutral/building_stage_B.gltf", MEDIEVAL_ATLAS),
        bridgeA: kaykitAssetSpec("medieval", "buildings/neutral/building_bridge_A.gltf", MEDIEVAL_ATLAS),
        fenceWood: kaykitAssetSpec("medieval", "buildings/neutral/fence_wood_straight.gltf", MEDIEVAL_ATLAS),
        fenceStone: kaykitAssetSpec("medieval", "buildings/neutral/fence_stone_straight.gltf", MEDIEVAL_ATLAS),
        grain: kaykitAssetSpec("medieval", "buildings/neutral/building_grain.gltf", MEDIEVAL_ATLAS),
        scaffolding: kaykitAssetSpec("medieval", "buildings/neutral/building_scaffolding.gltf", MEDIEVAL_ATLAS),
        // Architecture des îles flottantes lointaines. Les 357 modèles KayKit sont déjà
        // livrés dans le dépôt : en charger trois de plus ne coûte aucun téléchargement,
        // seulement un peu de temps de chargement. Les couleurs d'équipe (chaque teinte
        // appartient à un joueur) sont noyées par la brume atmosphérique appliquée aux
        // bâtiments, plus forte que celle du terrain — voir kaykitHazeObject.
        distantTower: kaykitAssetSpec("medieval", "buildings/yellow/building_tower_A_yellow.gltf", MEDIEVAL_ATLAS),
        distantWindmill: kaykitAssetSpec("medieval", "buildings/green/building_windmill_green.gltf", MEDIEVAL_ATLAS),
        distantChurch: kaykitAssetSpec("medieval", "buildings/red/building_church_red.gltf", MEDIEVAL_ATLAS),
        castle0: kaykitAssetSpec("medieval", "buildings/blue/building_castle_blue.gltf", MEDIEVAL_ATLAS),
        castle1: kaykitAssetSpec("medieval", "buildings/red/building_castle_red.gltf", MEDIEVAL_ATLAS),
        castle2: kaykitAssetSpec("medieval", "buildings/green/building_castle_green.gltf", MEDIEVAL_ATLAS),
        castle3: kaykitAssetSpec("medieval", "buildings/yellow/building_castle_yellow.gltf", MEDIEVAL_ATLAS),

        // Fanions de village, un par couleur de joueur (jusqu'à 4).
        flag0: kaykitAssetSpec("medieval", "decoration/props/flag_blue.gltf", MEDIEVAL_ATLAS),
        flag1: kaykitAssetSpec("medieval", "decoration/props/flag_red.gltf", MEDIEVAL_ATLAS),
        flag2: kaykitAssetSpec("medieval", "decoration/props/flag_green.gltf", MEDIEVAL_ATLAS),
        flag3: kaykitAssetSpec("medieval", "decoration/props/flag_yellow.gltf", MEDIEVAL_ATLAS),

        // Nuages KayKit réels (voir buildKayKitBoardClouds) : dérivent juste hors
        // du rayon de sécurité de l'archipel, à hauteur du plateau — lecture
        // "on est dans le ciel, il y a du vent" depuis la vue "front".
        cloudSmall: kaykitAssetSpec("medieval", "decoration/nature/cloud_small.gltf", MEDIEVAL_ATLAS),
        cloudBig: kaykitAssetSpec("medieval", "decoration/nature/cloud_big.gltf", MEDIEVAL_ATLAS)
      };


      let kaykit3D = null;
      let kaykitSyncFrame = 0;
      let kaykitLastSyncAt = 0;

      function kaykitHash(...values) {
        let hash = 2166136261;
        String(values.join("|")).split("").forEach(char => {
          hash ^= char.charCodeAt(0);
          hash = Math.imul(hash, 16777619);
        });
        return (hash >>> 0) / 4294967295;
      }

      // V55 : le moteur logique reste sur une grille 11 x 11 inchangée.
      // Seul l'espacement visuel 3D est réduit pour correspondre à la taille
      // réelle des Block Bits, sans modifier les règles ni les coordonnées.
      const KAYKIT_CELL_SPACING = .925;
      const KAYKIT_BLOCK_SIZE = .932;
      /* Fonction et non constante : figée au chargement, elle gardait la
         valeur du 11×11 après un passage en 13×13, et tout ce qui en dépend —
         cadrage caméra, volume de sécurité du ciel, anneau décoratif — se
         retrouvait calibré sur un plateau qui n'existait plus. */
      function kaykitBoardSpan() { return GRID * KAYKIT_CELL_SPACING; }

      // ===================== CIEL ILYOS — PROFONDEUR PAR COUCHES =====================
      // L'impression d'altitude ne vient PAS de nuages proches (essayé : ils voilaient
      // les cases et les gardiens) mais d'un empilement de plans très éloignés :
      //   1. dôme de ciel dégradé          (KAYKIT_SKY.domeRadius)
      //   2. brume d'horizon               (scene.fog, démarre bien au-delà du plateau)
      //   3. îlots lointains désaturés     (KAYKIT_SKY.farRing)
      //   4. ZONE JOUABLE — vide           (volume de sécurité ci-dessous)
      //   5. mer de nuages, très en bas    (KAYKIT_SKY.seaHigh / seaLow)
      //
      // VOLUME DE SÉCURITÉ : cylindre centré sur le plateau, de rayon `safeRadius`
      // et ouvert vers le haut à partir de `safeFloor`. Aucun élément décoratif n'a
      // le droit d'y exister (voir kaykitSkyPlacementAllowed). Comme la caméra est
      // bornée par ailleurs (orbit.maxDistance = 25, maxPolarAngle ≈ 88° → elle
      // reste au-dessus du plateau et à moins de 25 unités du centre), tout élément
      // soit franchement extérieur au cylindre, soit franchement sous son plancher,
      // ne peut jamais se retrouver sur le segment caméra → case. La contrainte
      // « zéro nuage devant le plateau » est donc garantie par construction, quel que
      // soit l'angle de vue, et pas seulement depuis la caméra initiale.
      const KAYKIT_SKY = {
        // Accesseur, pas valeur : le rayon doit suivre la taille du plateau.
        // ≈ 9.3 en 11×11, ≈ 10.2 en 13×13 — grille + marge d'extension.
        get safeRadius() { return kaykitBoardSpan() / 2 + 4.2; },
        safeFloor: -9,                            // vide obligatoire sous les îles
        domeRadius: 170,
        cameraFar: 460,
        fogNear: 44,                              // > (zoom max 25 + demi-diagonale plateau 7.2)
        fogFar: 145,
        // Mer descendue de -11,5 à -18 (et la seconde nappe de -22 à -30) pour libérer
        // la hauteur dont l'archipel lointain a besoin. Trois bornes l'enfermaient :
        // rayon > 25 (l'orbite caméra, sous peine d'îles gigantesques), angle > 20,7°
        // (le haut du cadre FACE) et y au-dessus de la mer — il ne restait qu'une
        // bande collée au bord supérieur de l'écran. Descendre la mer est la seule
        // des trois qu'on pouvait bouger, et c'est aussi la composition de
        // l'écran-titre : un archipel au-dessus d'une mer de nuages profonde.
        seaHigh: -18,                             // mer principale : îles ↓ vide ↓ nuages
        seaLow: -30,                              // seconde nappe, pour le parallaxe
        farRing: 30                               // rayon minimal des silhouettes lointaines
      };

      // Palette « sanctuaire céleste lumineux » : bleu soutenu au zénith, bande
      // d'horizon ivoire, jamais de cyan saturé ni de ciel dramatique.
      //
      // Point clé : les caméras d'ILYOS plongent toutes vers le plateau (≈ 20° à 56°
      // sous l'horizontale), donc TOUT ce que le joueur voit derrière les îles est la
      // partie du dôme SOUS l'horizon. Un premier essai blanc cassé de ce côté rendait
      // la mer de nuages littéralement invisible (blanc sur blanc) et voilait la scène.
      // D'où `abyss`/`deep` : un bleu pâle mais franc pour le gouffre sous l'archipel,
      // sur lequel le blanc des nuages ressort — et contre lequel le plateau gagne du
      // contraste. `haze` est la couleur de brume : elle se situe entre la bande
      // d'horizon et le bleu du gouffre, pour que le lointain se dissolve sans liseré.
      // ===================== DA « OR ET BLEU PROFOND » =====================
      // Reprend la direction artistique de l'illustration du menu : bleu de nuit au
      // zénith, masses dorées, cœur de lumière chaude qui perce, gouffre bleu soutenu
      // sous l'archipel. Remplace la palette « sanctuaire clair » précédente, dont le
      // problème n'était pas la justesse mais l'écart de valeur : tout y était compris
      // entre 70 % et 95 % de luminosité, donc AUCUN contraste possible.
      //
      // Les stops sont exprimés en p (élévation depuis le zénith / 180). Ce qui compte
      // vraiment est la tranche p .556 → .844, seule visible en jeu (KAYKIT_SKY_VIEW) :
      // elle va du chaud lumineux en haut de cadre au bleu profond en bas. C'est CETTE
      // course qui produit le contraste demandé — le plateau est traversé par un
      // dégradé chaud/froid au lieu de flotter sur un aplat.
      const KAYKIT_SKY_COLORS = {
        // CONTRE-JOUR : LE CIEL EST BLEU, L'OR NE VIENT QUE DE LA SOURCE.
        // Un premier essai peignait le dégradé lui-même en crème autour du soleil. Résultat
        // mesuré puis constaté à l'image : le soleil devenait invisible, faute de quoi que
        // ce soit de plus sombre contre quoi ressortir, et tout le cadre virait au beige.
        // Une source lumineuse n'existe que par ce qui l'entoure. La base est donc
        // entièrement bleue et s'assombrit vers le bas ; TOUTE la chaleur est produite par
        // le halo et le cœur radiaux de KAYKIT_SKY_SUN, qui se détachent dessus.
        zenith: 0x0a1526,
        upper: 0x132a4a,
        middle: 0x1e4370,
        horizon: 0x4a7098,   // horizon géométrique, vu en caméra libre basse seulement
        haze: 0x3d6690,      // p .56
        abyss: 0x35597f,     // p .62 — haut du cadre FACE
        midDeep: 0x264262,   // p .72
        deep: 0x1a3050,      // p .82 — bas du cadre FACE
        nadir: 0x0e1c30,     // p 1.0 — gouffre
        // Nappes vues de dessus, donc à contre-jour leur face côté caméra est à l'ombre.
        // Bleu-gris : la texture blanche des amas se lit alors comme des masses en ombre,
        // et c'est le soleil qui les traverse par-derrière qui crée l'événement lumineux.
        seaHigh: 0x6b7d9c,
        seaLow: 0x3f5175,
        fogColor: 0x1f3a5c,  // brume : même famille que `deep`, pour enfoncer le lointain
        // Éclairci de 0x4a6284 à 0x93a9c6 : sur l'ancien ciel pâle un bleu sombre
        // faisait silhouette, mais depuis que le ciel est bleu profond il s'y fondait
        // purement et simplement — les îlots étaient bien construits, et invisibles.
        // Un lointain plus CLAIR que le ciel, c'est aussi ce que fait la perspective
        // atmosphérique réelle : la brume éclaircit et désature avec la distance.
        distant: 0x93a9c6
      };

      // Position du soleil de contre-jour, en coordonnées de texture équirectangulaire.
      // `u` est l'azimut (0..1). La valeur .75 place le soleil DERRIÈRE le plateau vu
      // depuis la caméra FACE (qui est en +Z et regarde vers -Z) — vérifiée au rendu,
      // pas déduite : la convention d'UV de SphereGeometry combinée au flipY de
      // CanvasTexture est trop facile à inverser sur le papier.
      //
      // Le soleil est FIXE DANS LE MONDE : quand la caméra tourne, un côté du ciel
      // reste chaud et l'autre froid. C'est voulu — un soleil qui suivrait la caméra
      // donnerait un ciel identique dans toutes les directions, donc plat.
      // HORIZON PEINT. Une bande claire et brumeuse posée à l'élévation où la mer de
      // nuages rejoint visuellement le ciel. Peinte dans la texture de bande plutôt que
      // portée par une géométrie : un dôme n'a pas de bord, donc aucun angle de caméra ne
      // peut en révéler la limite — ce qui était précisément le défaut de l'approche par
      // le bord des nappes.
      //
      // `p` .611 correspond à 20° sous l'horizontale, la distance à laquelle la mer de
      // nuages se perd dans la brume. `spread` est la demi-hauteur de la bande, en degrés.
      const KAYKIT_SKY_HORIZON = { p: .611, spread: 7.5, force: .55 };

      const KAYKIT_SKY_SUN = {
        u: .75,
        // Élévation calée sur le cadre FACE réel, pas sur KAYKIT_SKY_VIEW (qui couvre
        // toutes les caméras) : plongée 37,2° et FOV 33° donnent un cadre p .615 → .798.
        // À p .625 le soleil sortait à 10 % du haut, donc derrière la barre de HUD.
        // .66 le pose au quart supérieur : dégagé du HUD, juste au-dessus du plateau.
        // .63 retenu à l'image (panneau ILYOS_SKY) : à .58 le soleil sort du cadre
        // par le haut, à .70 il passe entièrement derrière le plateau. .63 garde le
        // disque visible juste au-dessus de l'archipel, dégagé de la barre de HUD.
        p: .63,
        // Rayons en DEGRÉS d'angle, jamais en fraction de texture : voir le bloc de
        // peinture pour la raison (une fraction de largeur déborde la bande en hauteur).
        coreDeg: 3.2,     // rayon angulaire du disque
        haloDeg: 24,      // rayon angulaire du halo
        // NAPPE DIFFUSE, indépendante du halo. Un vrai contre-jour superpose deux
        // choses de nature différente : une chaleur atmosphérique très étalée, et
        // un cœur net. En corrigeant le halo qui débordait (91° d'élévation sur une
        // bande de 52), j'avais supprimé la première en même temps que le défaut —
        // d'où la perte du « soleil diffus » qui plaisait. Les deux sont désormais
        // réglables séparément : diffusionDeg pour l'étendue, diffusion pour la force.
        diffusionDeg: 44,
        diffusion: .55,
        ambientDeg: 26,   // portée verticale de la chaleur ambiante
        // Godrays peints DANS la texture de bande : aucune géométrie, aucun draw call
        // supplémentaire, et ils sont occultés par les nuages puisque ceux-ci sont
        // peints par-dessus. Le rendu volumétrique temps réel serait hors budget web
        // pour un gain à peine supérieur à cette distance.
        // maxDeg ramené de 54 à 25 : des rayons longs traversaient tout le cadre et
        // lisaient comme un étoilement graphique posé sur l'image. Courts, ils
        // restent une lueur autour de la source.
        rays: { count: 13, minDeg: 16, maxDeg: 25, halfWidthDeg: 1.6, strength: .30 },
        ambient: .06      // chaleur résiduelle présente à 360°, pour qu'aucun azimut
      };                  // ne donne un ciel mort quand la caméra tourne

      // Un élément atmosphérique n'est accepté que s'il tient entièrement sous le
      // plancher de sécurité, ou entièrement hors du cylindre de sécurité.
      function kaykitSkyPlacementAllowed(x, y, z, spread = 0) {
        if (y + spread <= KAYKIT_SKY.safeFloor) return true;
        return Math.hypot(x, z) - spread >= KAYKIT_SKY.safeRadius;
      }

      function kaykitCellPosition(r, c, y = 0) {
        return {
          x: (c - (GRID - 1) / 2) * KAYKIT_CELL_SPACING,
          y,
          z: (r - (GRID - 1) / 2) * KAYKIT_CELL_SPACING
        };
      }


      function kaykitPackCacheKey(pack) {
        return `ilyos:${KAYKIT_CATALOG_CACHE_VERSION}:${pack.repo}`;
      }

      function kaykitIsModelPath(path) {
        return /\.(gltf|glb)$/i.test(path) && !/(demo|preview|collider|collision|lod|source|example)/i.test(path);
      }

      async function fetchKayKitPackCatalog(pack) {
        if (!kaykit3D) return [];
        if (kaykit3D.packCatalog.has(pack.id)) return kaykit3D.packCatalog.get(pack.id);
        const cacheKey = kaykitPackCacheKey(pack);
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
          if (cached && Date.now() - cached.savedAt < 7 * 24 * 3600 * 1000 && Array.isArray(cached.files)) {
            kaykit3D.packCatalog.set(pack.id, cached.files);
            return cached.files;
          }
        } catch (_) { /* cache facultatif */ }

        let paths = [];
        const githubUrl = `https://api.github.com/repos/KayKit-Game-Assets/${pack.repo}/git/trees/main?recursive=1`;
        try {
          const response = await fetch(githubUrl, { headers: { Accept: "application/vnd.github+json" } });
          if (response.ok) {
            const data = await response.json();
            paths = (data.tree || []).filter(item => item.type === "blob" && kaykitIsModelPath(item.path)).map(item => item.path);
          }
        } catch (error) {
          console.warn(`Catalogue GitHub indisponible pour ${pack.label}`, error);
        }

        if (!paths.length) {
          const jsdelivrUrl = `https://data.jsdelivr.com/v1/package/gh/KayKit-Game-Assets/${pack.repo}@main/flat`;
          try {
            const response = await fetch(jsdelivrUrl);
            if (response.ok) {
              const data = await response.json();
              paths = (data.files || []).map(item => String(item.name || "").replace(/^\//, ""))
                .filter(kaykitIsModelPath);
            }
          } catch (error) {
            console.warn(`Catalogue jsDelivr indisponible pour ${pack.label}`, error);
          }
        }

        paths = [...new Set(paths)].sort();
        kaykit3D.packCatalog.set(pack.id, paths);
        try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), files: paths })); } catch (_) { /* quota */ }
        return paths;
      }

      function kaykitPackFileScore(pack, path) {
        const lower = path.toLowerCase();
        let score = 0;
        if (lower.includes("/gltf/")) score += 30;
        if (lower.endsWith(".gltf")) score += 8;
        if (lower.endsWith(".glb")) score += 6;
        pack.keywords.forEach((keyword, index) => {
          if (lower.includes(keyword.toLowerCase())) score += 120 - index * 8;
        });
        if (/(building|tree|chest|crate|table|module|house|grave|gem|character)/i.test(lower)) score += 12;
        if (/(floor|wall|roof|corner|straight|half|quarter|small)/i.test(lower)) score -= 8;
        return score;
      }

      function chooseKayKitPackRepresentative(pack, files) {
        if (!files.length) return null;
        const ranked = files.map(path => ({ path, score: kaykitPackFileScore(pack, path) }))
          .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
        const top = ranked.slice(0, Math.min(8, ranked.length));
        const index = Math.floor(kaykitHash(pack.id, kaykit3D?.universeSeed || 1) * top.length);
        return top[index]?.path || ranked[0]?.path || null;
      }

      function kaykitRepoCdnUrl(pack, path) {
        return `https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/${pack.repo}@main/${path}`;
      }

      async function registerKayKitPackRepresentative(pack) {
        if (!kaykit3D) return;
        const files = await fetchKayKitPackCatalog(pack);
        if (!files.length) {
          kaykit3D.packErrors.add(pack.id);
          updateKayKitLoadStatus();
          return;
        }
        const path = chooseKayKitPackRepresentative(pack, files);
        if (!path) return;
        const assetKey = `officialPack_${pack.id}`;
        if (!kaykit3D.assetPromises.has(assetKey)) kaykit3D.totalAssets++;
        const loaded = await loadKayKitAsset(assetKey, {
          group: `official:${pack.id}`,
          relativePath: path,
          urls: [kaykitRepoCdnUrl(pack, path)],
          textures: []
        });
        if (loaded) {
          kaykit3D.packRepresentatives.set(pack.id, assetKey);
          kaykit3D.packReady.add(pack.id);
          scheduleKayKitSync();
        } else kaykit3D.packErrors.add(pack.id);
        updateKayKitLoadStatus();
      }

      async function initKayKitOfficialUniverse() {
        if (!kaykit3D) return;
        // V45 stable : tous les modèles utilisés par le jeu sont locaux.
        // Les anciennes recherches GitHub/jsDelivr sont volontairement désactivées :
        // elles ralentissaient le démarrage et provoquaient des 404 hors connexion.
        kaykit3D.packReady.clear();
        ["adventurers", "skeletons", "medieval", "blockBits"].forEach(id => kaykit3D.packReady.add(id));
        kaykit3D.status.textContent = "KayKit local · chargement des modèles essentiels…";
        updateKayKitLoadStatus();
      }

      function initKayKit3D() {
        if (document.body.dataset.visualMode !== "alternative") return;
        if (kaykit3D) {
          kaykit3D.canvas.style.display = "block";
          kaykit3D.uiNodes.forEach(node => node.style.display = "flex");
          document.body.classList.add("kaykit-ready");
          kaykit3D.autoFit = true;
          resizeKayKit3D(true);
          scheduleKayKitSync();
          return;
        }
        if (!window.THREE || !THREE.WebGLRenderer) {
          console.warn("Three.js indisponible : conservation du plateau HTML de secours.");
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.id = "kaykitCanvas";
        canvas.className = "kaykit-canvas";
        canvas.setAttribute("aria-label", "Plateau 3D KayKit interactif");
        canvas.tabIndex = 0;
        els.boardWrap.insertBefore(canvas, els.board);

        const badge = document.createElement("div");
        badge.className = "kaykit-ui kaykit-badge";
        badge.textContent = "KAYKIT V45 · MODE LOCAL STABLE";
        els.boardWrap.appendChild(badge);

        const controls = document.createElement("div");
        controls.className = "kaykit-ui kaykit-controls";
        controls.innerHTML = `
        <button type="button" class="kaykit-control-btn" data-kay-view-face>VUE FACE</button>
        <button type="button" class="kaykit-control-btn" data-kay-view-iso>VUE ISO</button>
        <button type="button" class="kaykit-control-btn" data-kay-zoom-in>ZOOM +</button>
        <button type="button" class="kaykit-control-btn" data-kay-zoom-out>ZOOM −</button>
        <button type="button" class="kaykit-control-btn" data-kay-camera-auto>AUTO</button>
        <button type="button" class="kaykit-control-btn" data-kay-camera-free>LIBRE</button>
        <button type="button" class="kaykit-control-btn" data-kay-fullscreen>3D PLEIN ÉCRAN</button>
      `;
        els.boardWrap.appendChild(controls);

        const status = document.createElement("div");
        status.className = "kaykit-ui kaykit-status";
        status.textContent = "Chargement des modèles KayKit locaux…";
        els.boardWrap.appendChild(status);

        const cursorLabel = document.createElement("div");
        cursorLabel.className = "kaykit-cursor-label";
        cursorLabel.setAttribute("aria-live", "polite");
        els.boardWrap.appendChild(cursorLabel);

        const cameraHint = document.createElement("div");
        cameraHint.className = "kaykit-camera-hint";
        cameraHint.textContent = "GLISSER : TOURNER · MOLETTE : ZOOM · CLIC : JOUER";
        els.boardWrap.appendChild(cameraHint);

        let renderer;
        try {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
        } catch (error) {
          console.warn("WebGL indisponible : plateau HTML conservé.", error);
          canvas.remove(); badge.remove(); controls.remove(); status.remove(); cameraHint.remove();
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = .96;
        renderer.physicallyCorrectLights = false;
        // Le dôme de ciel (buildKayKitSkyEnvironment) recouvre tout l'écran dès le
        // premier rendu : cette couleur ne sert plus que de secours si le dôme n'a
        // pas encore été construit.
        renderer.setClearColor(KAYKIT_SKY_COLORS.fogColor, 1);

        const scene = new THREE.Scene();
        // Brume atmosphérique lointaine seulement : elle démarre au-delà de la
        // distance caméra→coin de plateau la plus défavorable (zoom max 25 + 7.2),
        // donc le plateau et les gardiens restent parfaitement nets, et seul le
        // décor très éloigné se désature vers la couleur d'horizon.
        // Couleur de brume calée sur `abyss` et non sur `haze` : les objets lointains
        // (îlots, nappes) vivent dans la fenêtre visible du dôme, où le ciel vaut
        // ~abyss. Les fondre vers une couleur plus claire les faisait ressortir comme
        // des taches pâles au lieu de se dissoudre dans le ciel.
        scene.fog = new THREE.Fog(KAYKIT_SKY_COLORS.fogColor, KAYKIT_SKY.fogNear, KAYKIT_SKY.fogFar);
        // Plan lointain relevé pour laisser respirer les couches célestes (dôme,
        // mer de nuages, îlots) : la précision du z-buffer dépend presque
        // uniquement du plan proche, inchangé, donc aucun z-fighting supplémentaire.
        const camera = new THREE.PerspectiveCamera(33, 1, .1, KAYKIT_SKY.cameraFar);
        camera.position.set(7.0, 9.1, 7.4);
        camera.lookAt(0, .22, .18);

        // Lumière céleste : soleil doux légèrement chaud sur le dessus, ambiance
        // froide en dessous. Le bleu profond en couleur « sol » de l'hémisphérique
        // remplace l'ancien olive : les faces inférieures des îles s'assombrissent
        // très légèrement et lisent comme des blocs suspendus au-dessus du vide,
        // sans halo ni faisceau sous chaque case.
        //
        // Passe éclairage/volume (visual-lighting-materials-v1) : ces valeurs
        // étaient auparavant re-clampées au runtime par deux scripts nommés
        // "HUD" (js/hud-organique-v2-depth-v9.js et -v10.js) qui ne touchaient
        // en réalité qu'à ces mêmes 3 lumières — source de vérité désormais
        // consolidée ici, ces deux fichiers sont neutralisés. Le ratio
        // ambient+hémisphère/soleil était trop favorable aux lumières
        // omnidirectionnelles (elles éclairent toutes les faces quasi
        // uniformément, quel que soit leur angle par rapport au soleil), ce
        // qui aplatissait le modelé des personnages/châteaux/reliefs. Ambient
        // et hémisphère réduits + désaturés (le bleu de sol de l'hémisphère
        // partait trop cyan une fois mélangé au fill), soleil renforcé pour
        // redevenir la vraie source du modelé. Luminosité globale volontairement
        // proche de l'ancienne — voir comparatif A/B/C dans le compte-rendu.
        const ambient = new THREE.AmbientLight(0xfff7ec, .16);
        scene.add(ambient);
        const hemi = new THREE.HemisphereLight(0xeef5f7, 0x56666a, .58);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xffeed2, 2.05);
        sun.position.set(-6, 14, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
        sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
        sun.shadow.camera.near = .5; sun.shadow.camera.far = 35;
        sun.shadow.bias = -.0004;
        sun.shadow.normalBias = .014;
        sun.shadow.radius = 1.75;
        scene.add(sun);
        // Bleu ciel neutre, moins saturé que l'ancien cyan (#8ed8ef) — son rôle
        // est d'ouvrir doucement les ombres, pas de reteinter les objets.
        const fill = new THREE.DirectionalLight(0xb7d9e0, .16);
        fill.position.set(8, 5, -8);
        scene.add(fill);
        const front = new THREE.DirectionalLight(0xfffbf1, .12);
        front.position.set(0, 6, 10);
        scene.add(front);

        const root = new THREE.Group();
        const staticGroup = new THREE.Group();
        const dynamicGroup = new THREE.Group();
        // Les gardiens vivent dans leur PROPRE groupe, jamais vidé par
        // syncKayKitScene. C'est la condition pour que leurs AnimationMixer,
        // leurs squelettes et leur animation en cours survivent à une
        // resynchronisation de l'état du jeu (voir syncKayKitCharacters).
        const characterGroup = new THREE.Group();
        const hitGroup = new THREE.Group();
        const fxGroup = new THREE.Group();
        root.add(staticGroup, dynamicGroup, characterGroup, hitGroup, fxGroup);
        scene.add(root);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const clock = new THREE.Clock();
        const loader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin("anonymous");
        if (loader) loader.setCrossOrigin("anonymous");

        kaykit3D = {
          canvas, badge, controls, status, cursorLabel, cameraHint, uiNodes: [badge, controls, status, cursorLabel, cameraHint], renderer, scene, camera, root,
          staticGroup, dynamicGroup, characterGroup, hitGroup, fxGroup, raycaster, pointer, clock, loader, textureLoader,
          hitMeshes: [], assets: new Map(), assetAnimations: new Map(), assetPromises: new Map(), failedAssets: new Set(), assetSources: new Map(), assetTextureUrls: new Map(),
          textureCache: new Map(), islandTintTextures: new Map(), islandTintMaterials: new Map(), texturedMaterials: 0, untexturedMaterials: 0, repairedMaterials: 0, failedTextureAssets: new Set(), missingTexture: null,
          mixers: [], heroAnimators: [], proceduralHeroes: [], animatedObjects: [], skyLayers: [], hoverCell: null, hoverMarker: null, actionPreviewGroup: null, actionPreviewKey: null, viewMode: "front", disposed: false,
          /* Distances de caméra proportionnelles à la taille du plateau : les
             valeurs d'origine (12.4 / 6.4 / 25) étaient calibrées sur le 11×11,
             et cadraient le 13×13 trop serré — les villages des coins
             débordaient de l'image. Le rapport GRID/11 les fait suivre. */
          // Exposée pour les passes externes qui cadrent la caméra
          // (voir reculPourPlateau, js/version-bootstrap.js).
          gridSize: GRID,
          zoomDistance: 12.4 * (GRID / 11), minZoom: 6.4 * (GRID / 11), maxZoom: 25 * (GRID / 11),
          viewTarget: new THREE.Vector3(0, .22, .18),
          materials: new Map(), geometries: new Map(), lastStateSignature: "", loadedCount: 0,
          // Compte ce qui est REELLEMENT lance : sinon la barre reste bloquee a
          // 64/67 pour des modeles que personne n'a demandes. ensureKayKitAsset()
          // incremente ce total quand un differe est finalement charge.
          totalAssets: Object.keys(KAYKIT_ASSETS).filter(key => !KAYKIT_DEFERRED_ASSETS.has(key)).length,
          packCatalog: new Map(), packRepresentatives: new Map(), packReady: new Set(), packErrors: new Set(),
          animationClipNames: new Set(), pendingActionAnimations: new Map(), activeMovementTweens: new Map(), characterHistory: new Map(), characterFacing: new Map(), cellVisuals: new Map(), hoveredVisuals: [], hoveredVisualKey: null, interactiveMeshes: [], universeSeed: Date.now(),
          // Registre persistant des gardiens : characterId -> CharacterVisual.
          // Une entrée conserve modèle, squelette, animateur, orientation et
          // position visuelle d'une synchronisation à l'autre.
          characterVisuals: new Map(),
          // Séquences visuelles en cours (poussée, chute, magie, couronne...),
          // mises à jour dans la boucle de rendu plutôt qu'avec des setTimeout.
          visualSequences: [], fxTweens: [], crownFlights: [], islandDrops: [],
          celebration: null, cameraFocusUntil: 0,
          orbit: null, manualOrbit: { azimuth: Math.PI / 4, polar: .88 }, cameraTween: null, tmpTweenTarget: new THREE.Vector3(), autoFit: true, userRotated: false, userInteracting: false, lastAspect: 1,
          syncInProgress: false, syncPending: false, cameraMode: "auto",
          // Qualité courante ("high" | "balanced" | "performance"), pilotée par
          // le moniteur d'images de js/complete-polish.js.
          qualityMode: "balanced",
          // Registres de la synchronisation incrémentale (V77) : syncKayKitScene
          // ne vide plus dynamicGroup à chaque appel. Chaque catégorie garde la
          // trace de ce qui existe déjà pour ne créer/mettre à jour/supprimer que
          // ce qui a réellement changé. Voir syncKayKitScene pour le détail.
          islandsSignature: null,       // signature de state.islands — rebuild îles/pedestaux/forêt seulement si elle change
          crownCrossGroundBuilt: false, // sol central : statique, construit une seule fois
          boardCloudsBuilt: false,      // nuages KayKit réels autour du plateau : statique, construit une seule fois
          islandLayerObjects: [],       // coutures + piédestaux : peu coûteux (géométries mises en cache), reconstruits en bloc à chaque changement d'île
          islandObjectRegistry: new Map(), // islandId -> { objects[], signature } — bloc+coque+décor NE sont reconstruits QUE pour l'île qui a réellement changé (pose/retrait/rotation), pas tout le plateau
          pedestalRegistry: new Map(),  // "r,c" -> pedestal (reconstruit avec la couche des îles)
          villageRegistry: new Map(),   // playerId -> chateau (reconstruit si posé en secours puis modèle réel disponible)
          highlightRegistry: new Map(), // "r,c" -> { signature, objects[] } pour les surbrillances de case
          looseCrownRegistry: new Map(),// "primary"/"secondary" -> { signature, objects[] }
          transientDynamicChildren: []  // ghosts de pose/rotation magique : reconstruits à chaque sync (peu coûteux, état éphémère)
        };

        // Contrat avec js/complete-polish.js, qui ajuste le pixel ratio, la
        // taille des ombres et la cadence d'animation selon les images par
        // seconde mesurées. Il lisait déjà `window.kaykit3D` — sans cette
        // exposition, son `renderer()` renvoyait null et TOUT son système de
        // qualité adaptative restait sans effet.
        window.kaykit3D = kaykit3D;
        // V78 : point d'entrée resize pour js/complete-polish.js (script
        // séparé, ne partage pas cette IIFE) — voir resizeKayKitRenderer().
        kaykit3D.resize = resizeKayKitRenderer;

        // Repère si un 'wheel' natif est en train d'être traité : OrbitControls
        // enchaîne start→change→end pour la molette exactement comme pour un
        // glissé, donc il faut ce signal pour ne pas confondre les deux. Écouteur
        // posé en phase de capture sur un ancêtre du canvas afin de s'exécuter
        // avant le gestionnaire interne d'OrbitControls, quel que soit l'ordre
        // d'inscription des écouteurs.
        let kaykitWheelActive = false;
        els.boardWrap.addEventListener('wheel', () => {
          kaykitWheelActive = true;
          setTimeout(() => { kaykitWheelActive = false; }, 0);
        }, { capture: true, passive: true });

        if (THREE.OrbitControls) {
          const orbit = new THREE.OrbitControls(camera, canvas);
          orbit.enableDamping = true;
          orbit.dampingFactor = .11;
          orbit.enableRotate = true;
          orbit.enableZoom = true;
          orbit.enablePan = true;
          orbit.screenSpacePanning = true;
          orbit.panSpeed = .92;
          orbit.rotateSpeed = .82;
          orbit.zoomSpeed = .82;
          orbit.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
          orbit.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
          orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
          orbit.minDistance = kaykit3D.minZoom;
          orbit.maxDistance = kaykit3D.maxZoom;
          orbit.minPolarAngle = .20;
          orbit.maxPolarAngle = Math.PI * .49;
          orbit.target.copy(kaykit3D.viewTarget);
          // OrbitControls déclenche 'start' dès qu'on appuie le bouton, même pour un
          // simple clic de jeu (sélectionner un gardien) qui ne bouge jamais la caméra.
          // On ne bascule en LIBRE que si un vrai mouvement a lieu entre 'start' et 'end'.
          let orbitDragActive = false;
          orbit.addEventListener('start', () => {
            if (!kaykit3D) return;
            // Un 'start' venu de la molette ne doit pas compter comme une prise
            // de contrôle manuelle de la caméra (voir kaykitWheelActive plus haut).
            orbitDragActive = !kaykitWheelActive;
            kaykit3D.autoFit = false;
            kaykit3D.userInteracting = true;
            kaykit3D.cameraTween = null;
            kaykit3D.cameraHint?.classList.add("hidden");
          });
          orbit.addEventListener('end', () => {
            orbitDragActive = false;
            if (kaykit3D) kaykit3D.userInteracting = false;
          });
          orbit.addEventListener('change', () => {
            if (!kaykit3D) return;
            kaykit3D.zoomDistance = orbit.object.position.distanceTo(orbit.target);
            if (orbitDragActive) {
              kaykit3D.userRotated = true;
              // Mouvement réel (glissé ou molette) : le joueur reprend la main.
              if (kaykit3D.cameraMode !== "free") { kaykit3D.cameraMode = "free"; updateKayKitCameraModeUI(); }
            }
          });
          kaykit3D.orbit = orbit;
        }

        updateKayKitCamera();
        buildKayKitStaticScene();
        bindKayKitInteractions();
        if (loader) {
          Object.entries(KAYKIT_ASSETS)
            .filter(([assetKey]) => !KAYKIT_DEFERRED_ASSETS.has(assetKey))
            .forEach(([assetKey, spec]) => loadKayKitAsset(assetKey, spec));
          setTimeout(() => initKayKitOfficialUniverse(), 100);
        } else {
          status.textContent = "Mode 3D de secours · chargeur KayKit indisponible";
          status.classList.add("loaded");
        }
        document.body.classList.add("kaykit-ready");
        resizeKayKit3D(true);
        scheduleKayKitSync();
        animateKayKit3D();

        controls.querySelector("[data-kay-view-face]")?.addEventListener("click", event => {
          event.stopPropagation();
          snapKayKitView("front");
        });
        controls.querySelector("[data-kay-view-iso]")?.addEventListener("click", event => {
          event.stopPropagation();
          snapKayKitView("isometric");
        });
        controls.querySelector("[data-kay-zoom-in]")?.addEventListener("click", event => {
          event.stopPropagation();
          zoomKayKitCamera(-1);
        });
        controls.querySelector("[data-kay-camera-auto]")?.addEventListener("click", event => {
          event.stopPropagation();
          setKayKitCameraMode("auto");
        });
        controls.querySelector("[data-kay-camera-free]")?.addEventListener("click", event => {
          event.stopPropagation();
          setKayKitCameraMode("free");
        });
        updateKayKitCameraModeUI();
        controls.querySelector("[data-kay-zoom-out]")?.addEventListener("click", event => {
          event.stopPropagation();
          zoomKayKitCamera(1);
        });
        controls.querySelector("[data-kay-fullscreen]")?.addEventListener("click", event => {
          event.stopPropagation();
          const target = els.gameScreen;
          if (!document.fullscreenElement) (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target);
          else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        });
        window.addEventListener("resize", resizeKayKit3D);
        document.addEventListener("fullscreenchange", () => {
          if (kaykit3D) {
            kaykit3D.autoFit = true;
            resizeKayKit3D(true);
          }
        });
        if (window.ResizeObserver) {
          kaykit3D.resizeObserver = new ResizeObserver(resizeKayKit3D);
          kaykit3D.resizeObserver.observe(els.board);
          kaykit3D.resizeObserver.observe(els.boardWrap);
        }
      }

      function hideKayKit3D() {
        if (!kaykit3D) return;
        kaykit3D.canvas.style.display = "none";
        kaykit3D.uiNodes.forEach(node => node.style.display = "none");
        document.body.classList.remove("kaykit-ready");
      }

      function kaykitGeometry(name, factory) {
        if (!kaykit3D) return factory();
        if (!kaykit3D.geometries.has(name)) kaykit3D.geometries.set(name, factory());
        return kaykit3D.geometries.get(name);
      }

      function kaykitMaterial(color, { roughness = .82, metalness = .03, emissive = 0, emissiveIntensity = 0, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
        const key = [color, roughness, metalness, emissive, emissiveIntensity, transparent, opacity, side].join("|");
        if (!kaykit3D.materials.has(key)) {
          kaykit3D.materials.set(key, new THREE.MeshStandardMaterial({
            color, roughness, metalness, emissive, emissiveIntensity, transparent, opacity, side
          }));
        }
        return kaykit3D.materials.get(key);
      }

      function configureKayKitTexture(texture) {
        if (!texture) return texture;
        texture.encoding = THREE.sRGBEncoding;
        const maxAnisotropy = kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
        texture.anisotropy = Math.min(12, maxAnisotropy);
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.flipY = false;
        texture.needsUpdate = true;
        return texture;
      }

      function loadKayKitTextureCandidates(urls) {
        if (!kaykit3D?.textureLoader || !urls?.length) return Promise.resolve(null);
        const cacheKey = urls.join("|");
        if (kaykit3D.textureCache.has(cacheKey)) return kaykit3D.textureCache.get(cacheKey);
        const promise = new Promise(resolve => {
          const tryAt = index => {
            const url = urls[index];
            if (!url) return resolve(null);
            kaykit3D.textureLoader.load(url, texture => resolve(configureKayKitTexture(texture)), undefined, () => tryAt(index + 1));
          };
          tryAt(0);
        });
        kaykit3D.textureCache.set(cacheKey, promise);
        return promise;
      }

      function makeKayKitMissingTexture() {
        if (kaykit3D?.missingTexture) return kaykit3D.missingTexture;
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#291a32'; ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ff2fb3';
        ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        if (kaykit3D) kaykit3D.missingTexture = texture;
        return texture;
      }

      function normalizeKayKitMaterial(material) {
        if (!material) return;
        if (material.map) {
          configureKayKitTexture(material.map);
          if ("roughness" in material) material.roughness = Math.min(material.roughness ?? .8, .82);
          if ("metalness" in material) material.metalness = Math.min(material.metalness ?? 0, .12);
        }
        material.transparent = material.opacity < 1 || material.transparent;
        material.alphaTest = material.alphaTest || 0;
        material.needsUpdate = true;
      }

      function addShadowFlags(object) {
        object.traverse?.(child => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.filter(Boolean).forEach(normalizeKayKitMaterial);
        });
        return object;
      }

      async function repairKayKitAssetMaterials(object, assetKey, spec) {
        if (!object) return;
        let textured = 0, untextured = 0;
        object.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.filter(Boolean).forEach(mat => {
            if (mat.map) { textured++; configureKayKitTexture(mat.map); }
            else untextured++;
            normalizeKayKitMaterial(mat);
          });
        });
        if (kaykit3D) {
          kaykit3D.texturedMaterials += textured;
          kaykit3D.untexturedMaterials += untextured;
          kaykit3D.assetTextureUrls.set(assetKey, textured ? "texture GLTF locale" : "matériau sans texture prévu par le modèle");
        }
        addShadowFlags(object);
      }

      // Dégradé vertical du dôme de ciel. `flipY` par défaut sur une CanvasTexture
      // fait correspondre le haut du canvas au sommet de la sphère, donc le zénith
      // se peint en premier. Bruit très léger pour éviter le banding sur un aplat
      // aussi étiré.
      // FENÊTRE VISIBLE DU DÔME — la donnée qui gouverne toute la composition du ciel.
      // Mesurée par lancer de rayons : les caméras FACE et ISO (à TOUT niveau de zoom,
      // car le zoom change la distance, pas l'inclinaison) ne montrent jamais qu'une
      // tranche du dôme comprise entre p ≈ .60 (haut du cadre) et p ≈ .79 (bas du
      // cadre), où p = 1 - uv.y, soit 18° à 52° SOUS l'horizontale. Tout ce qui est
      // peint hors de cette tranche n'existe pas pour le joueur en vue de jeu.
      const KAYKIT_SKY_VIEW = { top: .60, bottom: .79 };

      function kaykitSkyDomeTexture() {
        const key = "sky-dome-celestial-v3";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        // 1024 de large : la largeur du canvas couvre 360° d'azimut. En 512 px, un
        // amas de 60 px s'étalait sur 42° d'azimut — tellement étiré qu'il se lisait
        // comme un voile uniforme, jamais comme un nuage. C'était la cause directe de
        // l'effet « brouillard » : ce n'était pas une question d'opacité mais de
        // résolution angulaire. À 1024, 60 px = 21°, une taille de nuage crédible.
        const W = 1024, H = 512;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        const hex = value => `#${value.toString(16).padStart(6, "0")}`;
        const gradient = ctx.createLinearGradient(0, 0, 0, H);
        gradient.addColorStop(0, hex(KAYKIT_SKY_COLORS.zenith));
        gradient.addColorStop(.20, hex(KAYKIT_SKY_COLORS.upper));
        gradient.addColorStop(.38, hex(KAYKIT_SKY_COLORS.middle));
        // Bande d'horizon lumineuse à p .50 : c'est le vrai horizon géométrique, vu
        // seulement en caméra libre basse.
        gradient.addColorStop(.50, hex(KAYKIT_SKY_COLORS.horizon));
        gradient.addColorStop(.56, hex(KAYKIT_SKY_COLORS.haze));
        // .62 → 1.0 : la course de couleur est calée sur KAYKIT_SKY_VIEW, donc le haut
        // du cadre de jeu reçoit un bleu pâle lumineux et le bas un bleu franc. C'est
        // ce qui remplace l'aplat monotone par une vraie profondeur atmosphérique en
        // vue FACE, sans avoir à dézoomer.
        gradient.addColorStop(.62, hex(KAYKIT_SKY_COLORS.abyss));
        gradient.addColorStop(.70, hex(KAYKIT_SKY_COLORS.midDeep));
        gradient.addColorStop(1, hex(KAYKIT_SKY_COLORS.deep));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, W, H);
        for (let y = 0; y < H; y++) {
          ctx.fillStyle = `rgba(255,255,255,${(Math.sin(y * 12.9898) * .5 + .5) * .03})`;
          ctx.fillRect(0, y, W, 1);
        }

        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 23.71 + salt * 91.73) * 43758.5453;
          return x - Math.floor(x);
        };

        // Halo solaire : large, doux, légèrement chaud, posé au niveau de l'horizon.
        // Un ciel réel a une source de lumière ; sans elle le dégradé reste un aplat
        // neutre. En tournant la caméra, un côté du ciel devient plus chaud que
        // l'autre — l'atmosphère cesse d'être identique dans toutes les directions.
        // Centré à p ≈ .645, DANS la fenêtre visible (KAYKIT_SKY_VIEW). Placé plus haut
        // (p .545) il tombait juste au-dessus du cadre de jeu : seule sa frange basse
        // entrait à l'écran, ce qui le rendait imperceptible en vue FACE.
        //
        // Un point localisé reste invisible tant que la caméra ne regarde pas cet
        // azimut précis — imprévisible sans connaître l'orientation de départ du
        // joueur. Deux couches à la place : une chaleur AMBIANTE, une bande
        // horizontale pleine largeur (donc présente à 360°, jamais nulle) modulée en
        // sinus pour qu'un côté du ciel reste plus chaud que l'autre en tournant ;
        // et un cœur plus vif, large (rayon .55×W, donc visible sur plus de 180°
        // d'azimut) qui donne un vrai point focal quand la caméra s'en approche.
        const sunRow = H * .645;
        for (let y = Math.floor(H * .50); y < Math.floor(H * .82); y++) {
          const rowT = THREE.MathUtils.clamp(1 - Math.abs(y - sunRow) / (H * .30), 0, 1);
          for (let x = 0; x < W; x += 4) {
            const warmth = (.08 + .05 * Math.cos((x / W) * Math.PI * 2)) * rowT;
            ctx.fillStyle = `rgba(255,246,222,${warmth.toFixed(3)})`;
            ctx.fillRect(x, y, 4, 1);
          }
        }
        const sunX = 0, sunY = sunRow;
        [sunX - W, sunX, sunX + W].forEach(x => {
          const sun = ctx.createRadialGradient(x, sunY, 0, x, sunY, W * .50);
          sun.addColorStop(0, "rgba(255,246,218,.26)");
          sun.addColorStop(.28, "rgba(255,246,222,.14)");
          sun.addColorStop(.60, "rgba(255,245,226,.05)");
          sun.addColorStop(1, "rgba(255,245,228,0)");
          ctx.fillStyle = sun;
          ctx.fillRect(0, 0, W, H);
        });

        // Nuages lointains : des SILHOUETTES, pas des taches diffuses. Chaque amas est
        // un groupe de lobes qui se chevauchent, nettement plus large que haut, avec un
        // cœur assez dense pour se détacher du ciel. Un dégradé radial isolé et pâle,
        // c'est la définition même du brouillard ; c'est le contour lisible qui fait
        // lire « nuage ». Ils restent cantonnés au haut de la fenêtre visible, donc
        // derrière et au-dessus du plateau, jamais devant les cases ni les gardiens.
        const drawCloud = (cx, cy, scale, alpha) => {
          [[0, 0, 1, .5], [-.72, .12, .66, .36], [.74, .14, .62, .34],
           [-.32, -.26, .70, .40], [.36, -.22, .64, .38],
           [1.26, .26, .40, .24], [-1.24, .28, .38, .22]].forEach(([dx, dy, rx, ry]) => {
            const px = cx + dx * scale, py = cy + dy * scale;
            const radius = rx * scale, squash = ry / rx;
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(1, squash);
            const lobe = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            lobe.addColorStop(0, `rgba(255,255,255,${alpha})`);
            lobe.addColorStop(.55, `rgba(255,255,255,${alpha * .78})`);
            lobe.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = lobe;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        };
        // Moins d'amas, plus larges chacun : 15 amas modérés remplissaient la bande
        // presque en continu, sans vide net entre eux. En réduisant le nombre tout en
        // élargissant chaque amas individuellement, l'espace laissé entre deux amas
        // voisins (calculé, pas laissé au hasard) reste un vrai residu de ciel — le
        // « trou négatif » qui fait lire des nuages séparés plutôt qu'une traînée.
        const cloudTop = .572 * H, cloudBottom = .745 * H;
        const farCloudCount = 9;
        const farSpacing = W / farCloudCount;
        for (let i = 0; i < farCloudCount; i++) {
          const cx = (i + .5) * farSpacing + (seeded(i, 1) - .5) * farSpacing * .45;
          const cy = cloudTop + seeded(i, 2) * (cloudBottom - cloudTop);
          const scale = farSpacing * (.30 + seeded(i, 3) * .12);
          const alpha = .40 + seeded(i, 4) * .22;
          // Dupliqué à ±W : le raccord de la texture (wrapS = Repeat) doit rester
          // invisible quel que soit l'azimut de la caméra.
          drawCloud(cx - W, cy, scale, alpha);
          drawCloud(cx, cy, scale, alpha);
          drawCloud(cx + W, cy, scale, alpha);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = Math.min(8, kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      // ===================== BANDE DE CIEL HAUTE DENSITÉ =====================
      // POURQUOI. Le dôme seul ne PEUT PAS être net, et ce n'est pas une question de
      // direction artistique. Mesure : la texture équirectangulaire fait 1024×512 pour
      // 360°×180°, soit 2,84 px/°. Les caméras de jeu ont un FOV de 33° vertical
      // (≈ 55° horizontal en 16:9), et KAYKIT_SKY_VIEW établit que la tranche réellement
      // affichée ne fait que 34° — soit ~97 px de texture étalés sur toute la hauteur de
      // l'écran. Grossissement : ~10× dans les deux axes.
      //
      // À 10×, magFilter (LinearFilter) transforme chaque contour de nuage en une rampe
      // de ~10 px à l'écran. Un contour de 10 px de large N'EST PLUS un contour : c'est
      // la définition même d'un voile. C'est la cause de l'effet « brouillard » que les
      // réglages successifs d'opacité, de nombre d'amas et de taille de lobes n'ont
      // jamais pu corriger — ils agissaient sur la peinture, pas sur la loupe.
      // (Mipmaps et anisotropie ne servent à rien ici : elles ne jouent qu'en
      // MINIFICATION, jamais en magnification.)
      //
      // POURQUOI PAS UNE PLUS GRANDE ÉQUIRECT. Pour du 1:1 il faudrait ~10 000 px de
      // large, dont ~80 % peints pour des directions que le joueur ne regarde jamais.
      // Même une 4096×2048 (32 Mo) ne donnerait que 4×, en gaspillant les mêmes 80 %.
      //
      // SOLUTION. On ne peint en haute densité QUE la tranche utile. 4096×512 sur 52°
      // d'élévation = 11,4 px/° horizontal et 9,8 px/° vertical, soit 4× la densité
      // actuelle pour 8 Mo (4× moins qu'une équirect de même finesse). Le grossissement
      // tombe à ~2,5×, où un contour de nuage redevient un contour.
      //
      // Le dôme d'origine reste en place derrière : il couvre les 128° restants pour les
      // angles de caméra extrêmes, et sert de fond exact aux bords fondus de la bande
      // (mêmes couleurs aux mêmes élévations, donc raccord invisible).
      const KAYKIT_SKY_BAND = {
        top: 10,        // ° SOUS l'horizontale — 8° de marge au-dessus des 18° mesurés
        bottom: 62,     // ° SOUS l'horizontale — 10° de marge sous les 52° mesurés
        width: 4096,
        height: 512,
        fadeTop: .03,   // le fondu doit se terminer AVANT p .572 (1ers nuages du dôme),
        fadeBottom: .06 // sinon ceux-ci transparaissent et se dédoublent
      };

      // Table de dégradé partagée : la bande et le dôme DOIVENT donner la même couleur à
      // la même élévation, sinon le raccord se lit comme un pli. Ces stops sont ceux de
      // kaykitSkyDomeTexture, exprimés en p (= élévation depuis le zénith / 180).
      const KAYKIT_SKY_STOPS = [
        [0, "zenith"], [.20, "upper"], [.38, "middle"], [.50, "horizon"],
        [.56, "haze"], [.62, "abyss"], [.72, "midDeep"], [.82, "deep"], [1, "nadir"]
      ];

      function kaykitSkyColorAt(p) {
        const t = THREE.MathUtils.clamp(p, 0, 1);
        for (let i = 1; i < KAYKIT_SKY_STOPS.length; i++) {
          const [p1, k1] = KAYKIT_SKY_STOPS[i];
          if (t > p1 && i < KAYKIT_SKY_STOPS.length - 1) continue;
          const [p0, k0] = KAYKIT_SKY_STOPS[i - 1];
          const span = p1 - p0;
          const local = span > 0 ? THREE.MathUtils.clamp((t - p0) / span, 0, 1) : 0;
          return new THREE.Color(KAYKIT_SKY_COLORS[k0]).lerp(new THREE.Color(KAYKIT_SKY_COLORS[k1]), local);
        }
        return new THREE.Color(KAYKIT_SKY_COLORS.deep);
      }

      function kaykitSkyBandTexture() {
        const key = "sky-band-hd-v1";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);

        // Garde-fou matériel : 4096 est universel en pratique, mais un GPU bridé à 2048
        // doit dégrader proprement plutôt que rendre un carré noir.
        const maxSize = kaykit3D?.renderer?.capabilities?.maxTextureSize || 4096;
        const W = Math.min(KAYKIT_SKY_BAND.width, maxSize);
        const H = Math.min(KAYKIT_SKY_BAND.height, Math.max(128, Math.floor(maxSize / 8)));
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");

        const pTop = (90 + KAYKIT_SKY_BAND.top) / 180;
        const pBottom = (90 + KAYKIT_SKY_BAND.bottom) / 180;
        const pSpan = pBottom - pTop;
        const bandDeg = KAYKIT_SKY_BAND.bottom - KAYKIT_SKY_BAND.top;
        const pxPerDegH = W / 360, pxPerDegV = H / bandDeg;
        // Les px/° ne sont PAS égaux sur les deux axes, contrairement au dôme (1024×512
        // pour 360×180 donne 2,84 partout). Sans ce ratio, tout amas peint ici serait
        // étiré verticalement de ~15 % et lirait comme une traînée, pas comme un nuage.
        const vRatio = pxPerDegV / pxPerDegH;
        const rowOf = p => ((p - pTop) / pSpan) * H;

        // Dégradé échantillonné ligne à ligne depuis la table partagée plutôt que via
        // createLinearGradient : égalité exacte avec le dôme à toute élévation, y
        // compris si les stops changent un jour.
        for (let y = 0; y < H; y++) {
          const c = kaykitSkyColorAt(pTop + (y / H) * pSpan);
          ctx.fillStyle = "#" + c.getHexString();
          ctx.fillRect(0, y, W, 1);
          const noise = (Math.sin(y * 12.9898) * .5 + .5) * .012;
          ctx.fillStyle = "rgba(255,255,255," + noise.toFixed(4) + ")";
          ctx.fillRect(0, y, W, 1);
        }

        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 23.71 + salt * 91.73) * 43758.5453;
          return x - Math.floor(x);
        };

        // CONTRE-JOUR : une source localisée derrière le plateau, en trois couches,
        // parce qu'une seule ne lit jamais comme une source lumineuse :
        //   1. chaleur ambiante à 360°, faible, moduleée par l'azimut
        //   2. halo large — l'éblouissement atmosphérique
        //   3. cœur dense et petit — le point focal
        //
        // TOUS LES RAYONS SONT EN DEGRÉS, jamais en pixels. La texture fait 4096×512
        // pour 360°×52° : un rayon en pixels y couvre ~1,4× plus d'élévation que
        // d'azimut, et déborde surtout la bande. Un premier essai à « rayon = .22 ×
        // largeur » donnait 901 px, soit 79° d'azimut mais 91° d'élévation sur une
        // bande qui n'en fait que 52 : le halo noyait TOUT le cadre de crème et
        // effaçait le bleu qu'on venait de poser. C'était la cause du rendu « lavé ».
        const sunRow = rowOf(KAYKIT_SKY_SUN.p);
        const sunX = KAYKIT_SKY_SUN.u * W;
        const warmFalloffPx = KAYKIT_SKY_SUN.ambientDeg * pxPerDegV;
        for (let y = 0; y < H; y++) {
          const rowT = THREE.MathUtils.clamp(1 - Math.abs(y - sunRow) / warmFalloffPx, 0, 1);
          if (rowT <= 0) continue;
          for (let x = 0; x < W; x += 4) {
            // cos(Δazimut) ramené dans [0,1] : 1 face au soleil, 0 dos au soleil. C'est
            // ce qui fait qu'en tournant, le joueur passe d'un ciel chaud à un ciel
            // froid au lieu de retrouver le même décor dans toutes les directions.
            const dAz = ((x - sunX) / W) * Math.PI * 2;
            const facing = (Math.cos(dAz) * .5 + .5);
            const warmth = KAYKIT_SKY_SUN.ambient * (.25 + .75 * facing) * rowT;
            ctx.fillStyle = "rgba(255,226,170," + warmth.toFixed(3) + ")";
            ctx.fillRect(x, y, 4, 1);
          }
        }

        // Bande d'horizon : peinte AVANT le soleil et les nuages, elle est le fond sur
        // lequel ils se posent. Pleine largeur, donc présente à 360° — un horizon qui
        // n'existerait que d'un côté serait pire que pas d'horizon du tout.
        const horizonRow = rowOf(KAYKIT_SKY_HORIZON.p);
        const horizonSpreadPx = KAYKIT_SKY_HORIZON.spread * pxPerDegV;
        for (let y = 0; y < H; y++) {
          const t = 1 - Math.abs(y - horizonRow) / horizonSpreadPx;
          if (t <= 0) continue;
          // Courbe adoucie : une bande à bords linéaires se lit comme un ruban collé.
          const a = KAYKIT_SKY_HORIZON.force * Math.pow(t, 1.6);
          ctx.fillStyle = "rgba(214,231,246," + a.toFixed(3) + ")";
          ctx.fillRect(0, y, W, 1);
        }

        // Halo et cœur peints dans un repère écrasé par vRatio : circulaires en ANGLE,
        // donc elliptiques en pixels. Dupliqués à ±W pour franchir le raccord 0°/360°
        // sans coupure, puisque la caméra tourne.
        const drawGlow = (degRadius, stops) => {
          const r = degRadius * pxPerDegH;
          [sunX - W, sunX, sunX + W].forEach(x => {
            ctx.save();
            ctx.translate(x, sunRow);
            ctx.scale(1, vRatio);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            stops.forEach(([o, c]) => g.addColorStop(o, c));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        };
        // Peinte AVANT le halo : elle pose le lit de chaleur, les couches suivantes
        // creusent le point focal par-dessus.
        drawGlow(KAYKIT_SKY_SUN.diffusionDeg, [
          [0, "rgba(255,231,184," + (KAYKIT_SKY_SUN.diffusion * .52).toFixed(3) + ")"],
          [.40, "rgba(251,212,150," + (KAYKIT_SKY_SUN.diffusion * .24).toFixed(3) + ")"],
          [.75, "rgba(232,184,126," + (KAYKIT_SKY_SUN.diffusion * .08).toFixed(3) + ")"],
          [1, "rgba(220,170,120,0)"]
        ]);
        drawGlow(KAYKIT_SKY_SUN.haloDeg, [
          [0, "rgba(255,236,186,.88)"], [.14, "rgba(255,214,138,.58)"],
          [.40, "rgba(243,171,90,.24)"], [.72, "rgba(206,132,70,.07)"],
          [1, "rgba(184,114,66,0)"]
        ]);
        // Le cœur dépasse volontairement la luminosité du décor — seule entorse assumée
        // à la règle « rien de plus lumineux que gardiens et couronnes ». Sans elle un
        // contre-jour est impossible : une source qui n'est pas la chose la plus claire
        // de l'image n'est pas une source. C'est aussi ce que le Bloom ira chercher.
        drawGlow(KAYKIT_SKY_SUN.coreDeg, [
          [0, "rgba(255,253,246,1)"], [.35, "rgba(255,247,222,.94)"], [1, "rgba(255,234,178,0)"]
        ]);

        // GODRAYS. Faisceaux irréguliers partant du soleil, dessinés dans le même
        // repère écrasé que le halo (donc rectilignes en ANGLE, pas en pixels). Ils
        // sont peints AVANT les amas : les nuages les recouvrent ensuite, ce qui donne
        // la lecture « la lumière passe entre les masses » plutôt que « des traits sont
        // posés sur l'image ».
        const drawRays = () => {
          const R = KAYKIT_SKY_SUN.rays;
          if (!R || R.strength <= 0) return;
          [sunX - W, sunX, sunX + W].forEach(x => {
            ctx.save();
            ctx.translate(x, sunRow);
            ctx.scale(1, vRatio);
            for (let i = 0; i < R.count; i++) {
              // Espacement irrégulier : des rayons régulièrement répartis lisent comme
              // une roue dentée, jamais comme de la lumière.
              const a = (i / R.count) * Math.PI * 2 + seeded(i, 21) * .42;
              const len = (R.minDeg + seeded(i, 22) * (R.maxDeg - R.minDeg)) * pxPerDegH;
              const half = R.halfWidthDeg * (.5 + seeded(i, 23)) * pxPerDegH;
              const alpha = R.strength * (.45 + seeded(i, 24) * .55);
              ctx.save();
              ctx.rotate(a);
              const g = ctx.createLinearGradient(0, 0, len, 0);
              g.addColorStop(0, "rgba(255,244,212," + alpha.toFixed(3) + ")");
              g.addColorStop(.30, "rgba(255,228,168," + (alpha * .48).toFixed(3) + ")");
              g.addColorStop(1, "rgba(255,214,140,0)");
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(len, -half);
              ctx.lineTo(len, half);
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
            ctx.restore();
          });
        };
        drawRays();


        // Amas : mêmes TAILLES ANGULAIRES et mêmes graines que le dôme, donc la
        // composition déjà validée (9 amas larges, vrais vides entre eux) est conservée.
        // Ce qui change est uniquement qu'elle est désormais résolue au lieu d'être
        // fondue. Les lobes sont écrasés par vRatio pour rester circulaires en angle.
        const drawCloud = (cx, cy, scale, alpha, core = .68) => {
          [[0, 0, 1, .5], [-.72, .12, .66, .36], [.74, .14, .62, .34],
           [-.32, -.26, .70, .40], [.36, -.22, .64, .38],
           [1.26, .26, .40, .24], [-1.24, .28, .38, .22]].forEach(([dx, dy, rx, ry]) => {
            const px = cx + dx * scale, py = cy + dy * scale * vRatio;
            const radius = rx * scale, squash = (ry / rx) * vRatio;
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(1, squash);
            const lobe = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            // Cœur élargi (.55 → .68) et chute plus tardive : à 2,5× de grossissement le
            // dégradé n'est plus mangé par le filtrage, on peut donc assumer un vrai
            // cœur dense et un bord franc. À 10×, ce même réglage aurait fait une tache.
            lobe.addColorStop(0, "rgba(255,255,255," + alpha.toFixed(3) + ")");
            lobe.addColorStop(core, "rgba(255,255,255," + (alpha * .86).toFixed(3) + ")");
            lobe.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = lobe;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        };

        const cloudTopRow = rowOf(.572), cloudBottomRow = rowOf(.745);
        const farCloudCount = 9;
        const farSpacingDeg = 360 / farCloudCount;
        for (let i = 0; i < farCloudCount; i++) {
          const cxDeg = (i + .5) * farSpacingDeg + (seeded(i, 1) - .5) * farSpacingDeg * .45;
          const cx = cxDeg * pxPerDegH;
          const cy = cloudTopRow + seeded(i, 2) * (cloudBottomRow - cloudTopRow);
          const scale = (farSpacingDeg * (.30 + seeded(i, 3) * .12)) * pxPerDegH;
          const alpha = .40 + seeded(i, 4) * .22;
          // Dupliqué à ±W : le raccord (wrapS = Repeat) doit rester invisible quel que
          // soit l'azimut, puisque la caméra tourne.
          drawCloud(cx - W, cy, scale, alpha);
          drawCloud(cx, cy, scale, alpha);
          drawCloud(cx + W, cy, scale, alpha);
        }

        // Passe de détail : IMPOSSIBLE auparavant. Un amas de 4° occupait 11 px sur le
        // dôme et disparaissait entièrement dans le filtrage ; il en occupe 46 ici.
        // C'est exactement ce que la densité achète — une seconde échelle de lecture,
        // qui fait que le ciel supporte le zoom avant au lieu de s'aplatir.
        const wispCount = 22;
        const wispSpacingDeg = 360 / wispCount;
        for (let i = 0; i < wispCount; i++) {
          const cxDeg = (i + .5) * wispSpacingDeg + (seeded(i, 7) - .5) * wispSpacingDeg * .8;
          const cx = cxDeg * pxPerDegH;
          const cy = cloudTopRow + seeded(i, 8) * (cloudBottomRow - cloudTopRow) * 1.05;
          const scale = (wispSpacingDeg * (.22 + seeded(i, 9) * .16)) * pxPerDegH;
          const alpha = .13 + seeded(i, 10) * .11;
          drawCloud(cx - W, cy, scale, alpha, .8);
          drawCloud(cx, cy, scale, alpha, .8);
          drawCloud(cx + W, cy, scale, alpha, .8);
        }

        // Fondu des bords vers le dôme. destination-out : on retire de l'alpha, on ne
        // peint pas du blanc. Le dôme derrière ayant EXACTEMENT la même couleur à la
        // même élévation, seul le détail des nuages se dissout — jamais la couleur.
        const fade = (fromY, toY) => {
          const g = ctx.createLinearGradient(0, fromY, 0, toY);
          g.addColorStop(0, "rgba(0,0,0,1)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = g;
          ctx.fillRect(0, Math.min(fromY, toY), W, Math.abs(toY - fromY));
          ctx.restore();
        };
        fade(0, H * KAYKIT_SKY_BAND.fadeTop);
        fade(H, H * (1 - KAYKIT_SKY_BAND.fadeBottom));

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = Math.min(8, kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      // Nappe de nuages vue de dessus : amas doux, faible contraste, fondus vers
      // les bords pour qu'aucun bord de plan ne soit jamais visible. Une seule
      // texture par variante, partagée par la nappe entière (aucun tuilage).
      //
      // `holeStart`/`holeEnd` (en unités monde) évident progressivement le centre :
      // sans ce trou, la nappe s'étend jusque sous le plateau et l'on passe des îles
      // aux nuages sans transition. Avec lui on lit bien îles ↓ vide bleu ↓ nuages.
      // `resolution` : voir kaykitSkyBandTexture pour le raisonnement, qui vaut ici
      // ENCORE PLUS FORT. Mesure au rendu (caméra de jeu par défaut, canvas 718 px) :
      //   nappe haute — 512 px pour 150 unités monde = 3,4 px/u, écran = 59,8 px/u → 17,5×
      //   nappe basse — 512 px pour 250 unités monde = 2,0 px/u, écran = 40,5 px/u → 19,8×
      // Ces nappes occupent le CENTRE de l'écran (le dôme, lui, n'en occupe que le
      // pourtour : sous une caméra plongeante, les cercles d'élévation constante se
      // projettent en coniques, et le disque central est entièrement couvert par la mer
      // de nuages). C'était donc le pire grossissement de la scène, exactement là où le
      // joueur regarde — la vraie cause des « taches blanches molles » au fond.
      //
      // La composition n'est pas touchée : tout le tracé est déjà exprimé en `size /
      // size2D`, donc augmenter `size` conserve les tailles ANGULAIRES des amas et ne
      // fait que les résoudre. Nappe haute (lisible, opacité .62) → 2048 = 4,4× au lieu
      // de 17,5×. Nappe basse (parallaxe atténuée, opacité .40) → 1024, pour tenir le
      // budget VRAM à 20 Mo au lieu de 32.
      function kaykitCloudSheetTexture(variant = 0, size2D = 150, holeStart = 11, holeEnd = 20, resolution = 512, edgeFade = .80) {
        const key = `cloud-sheet-v4-${variant}-${size2D}-${holeStart}-${holeEnd}-${resolution}-${edgeFade}`;
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const size = Math.min(resolution, kaykit3D?.renderer?.capabilities?.maxTextureSize || resolution);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * (17.13 + variant * 4.7) + salt * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        // Des taches rondes isolées et pâles, aussi denses soient-elles, restent la
        // définition même du brouillard : ce qui fait lire « nuage » est un contour,
        // pas une opacité. Chaque amas est donc un petit groupe de lobes qui se
        // chevauchent (même principe que les nuages peints sur le dôme) : silhouette
        // reconnaissable, cœur net, bords qui se détachent du ciel.
        //
        // Répartition en secteurs angulaires (pas aléatoire globale) : un semis
        // purement aléatoire pouvait laisser un grand vide exactement dans la
        // direction où le joueur regarde, ou au contraire tout entasser d'un côté.
        // Un amas par secteur garantit une couverture homogène à 360°, donc visible
        // quel que soit l'azimut de caméra sans avoir à tourner.
        const bandStart = holeEnd;
        const bandWidth = size2D * .17;
        const maxBandWorld = bandStart + bandWidth;
        // Peu de secteurs, grands amas : un premier essai avec beaucoup de petits
        // amas ne perçait pas assez près du plateau pour se distinguer. Le nombre de
        // secteurs et la taille de chaque amas sont maintenant dérivés de la
        // circonférence réelle à mi-bande, pour que chaque amas reste GRAND (donc
        // visible, « proche ») tout en gardant un vrai vide (ciel qui traverse) entre
        // deux amas voisins — sans ce calcul, soit ils restent petits, soit ils se
        // rejoignent en nappe continue.
        const sectorCount = Math.max(5, Math.round(size2D / 26));
        const rMid = bandStart + bandWidth * .5;
        const arcPerSector = (2 * Math.PI * rMid) / sectorCount;
        const targetDiameterWorld = arcPerSector * .74;
        const baseScalePx = (targetDiameterWorld * (size / size2D)) / 2.6;
        const drawCloudCluster = (cx, cy, scale, alpha) => {
          [[0, 0, 1, .52], [-.68, .10, .62, .38], [.70, .12, .58, .36],
           [-.28, -.22, .64, .40], [.30, -.20, .58, .38]].forEach(([dx, dy, rx, ry]) => {
            const px = cx + dx * scale, py = cy + dy * scale;
            const radius = rx * scale, squash = ry / rx;
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(1, squash);
            const lobe = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            lobe.addColorStop(0, `rgba(255,255,255,${alpha})`);
            lobe.addColorStop(.5, `rgba(255,255,255,${alpha * .78})`);
            lobe.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = lobe;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        };
        for (let i = 0; i < sectorCount; i++) {
          const sectorAngle = (i / sectorCount) * Math.PI * 2;
          const angle = sectorAngle + (seeded(i, 1) - .5) * (Math.PI * 2 / sectorCount) * .6;
          const radiusWorld = bandStart + seeded(i, 2) * bandWidth;
          const cx = size / 2 + Math.cos(angle) * radiusWorld * (size / size2D);
          const cy = size / 2 + Math.sin(angle) * radiusWorld * (size / size2D);
          const scale = baseScalePx * (.85 + seeded(i, 3) * .35);
          const alpha = .70 + seeded(i, 4) * .24;
          drawCloudCluster(cx, cy, scale, alpha);
        }
        // Masque radial en une passe : trou doux au centre (le vide sous l'archipel)
        // et extinction avant le bord du plan, pour que le carré de la géométrie ne
        // puisse jamais se lire, quel que soit l'angle de caméra.
        ctx.globalCompositeOperation = "destination-in";
        const toTexel = world => THREE.MathUtils.clamp(world / size2D, 0, .5);
        const mask = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * .5);
        mask.addColorStop(0, "rgba(255,255,255,0)");
        mask.addColorStop(toTexel(holeStart) * 2, "rgba(255,255,255,0)");
        mask.addColorStop(toTexel(holeEnd) * 2, "rgba(255,255,255,1)");
        // `edgeFade` décide OÙ commence l'extinction du bord.
        //
        // À .80 (nappe proche) la nappe s'efface bien avant sa limite : c'est voulu, elle
        // passe sous le plateau et un bord franc s'y lirait comme une découpe.
        //
        // ESSAI ABANDONNÉ : porter ce fondu à .97 sur la nappe lointaine pour que son
        // bord forme un horizon. Ça marchait de face, mais le commentaire d'origine avait
        // raison — la garantie porte sur TOUT angle de caméra. Vers 15° d'inclinaison la
        // nappe est vue par la tranche et sa silhouette apparaît en bandes grises en
        // travers du ciel. L'horizon est désormais PEINT dans la texture de bande (voir
        // KAYKIT_SKY_HORIZON), qui n'a aucun bord par construction.
        mask.addColorStop(Math.min(edgeFade, .995), "rgba(255,255,255,.94)");
        mask.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = mask;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = "source-over";
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.encoding = THREE.sRGBEncoding;
        // Indispensable : vue rasante, une nappe horizontale est vue sous un angle
        // très fermé et le mip le plus grossier la réduit à un aplat uniforme —
        // c'est ce qui la faisait lire comme du brouillard au lieu d'une mer de
        // nuages. Le filtrage anisotrope conserve le relief jusqu'à l'horizon.
        texture.anisotropy = Math.min(16, kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      // Silhouette d'îlot lointain : bloc évasé + éventuelle tour claire. Volumes
      // très simples, matériau non éclairé et légèrement bleuté — ces éléments ne
      // doivent jamais attirer le clic ni concurrencer les bâtiments joueurs.
      // Perspective atmosphérique : plus un objet est loin, plus il se rapproche de la
      // couleur de la brume et perd son contraste propre. C'est ce qui crée la profondeur
      // — et accessoirement ce qui neutralise les couleurs d'équipe des bâtiments, qui
      // reçoivent volontairement une dose plus forte que le terrain.
      // Perspective atmosphérique : plus un objet est loin, plus il tire vers la couleur
      // de la brume et perd son contraste propre.
      //
      // Le matériau est en même temps APLATI en MeshBasicMaterial, et ce n'est pas un
      // détail. Premier essai : je me contentais de tirer `color` vers la brume sur le
      // MeshStandardMaterial d'origine — mesuré à #62758c, donc correctement assombri —
      // et les îles ressortaient malgré tout en vert vif à l'écran. La DirectionalLight
      // principale est à 2,05 : elle rallumait exactement ce que la brume venait
      // d'éteindre. Un décor lointain ne doit pas être éclairé, sinon sa valeur ne se
      // pilote plus. C'est aussi ce que faisaient les anciens îlots procéduraux.
      // Perspective atmosphérique : plus un objet est loin, plus il tire vers la couleur
      // de la brume et perd son contraste propre.
      //
      // CHOIX DU MATÉRIAU — c'est ici que se joue l'équilibre coût / rendu.
      //   · MeshStandardMaterial (l'original des modèles) : éclairage PBR par pixel. Sous
      //     la DirectionalLight à 2,05 il rallumait exactement ce que la brume venait
      //     d'éteindre, et c'est le plus cher des trois.
      //   · MeshBasicMaterial : aucun éclairage. La valeur redevenait pilotable, mais les
      //     bâtiments se détachaient comme des découpages plats, sans volume ni ombre.
      //   · MeshLambertMaterial : éclairage diffus calculé PAR SOMMET, pas par pixel. Il
      //     rend le volume et intègre les bâtiments à la lumière de la scène, pour un
      //     surcoût négligeable sur des modèles KayKit de quelques centaines de sommets.
      //
      // La dose de brume est appliquée un peu plus fort qu'en non-éclairé, puisque la
      // lumière va en récupérer une partie.
      function kaykitHazeObject(object, amount) {
        const haze = new THREE.Color(KAYKIT_SKY_COLORS.fogColor);
        const dose = THREE.MathUtils.clamp(amount, 0, 1);
        // Compensation de la relance par l'éclairage : sans elle, le vert des prairies
        // et les couleurs d'équipe des bâtiments remontaient au premier plan visuel.
        const doseEclairee = Math.min(1, dose * 1.18);
        object.traverse(child => {
          if (!child.isMesh || !child.material) return;
          const list = Array.isArray(child.material) ? child.material : [child.material];
          const rendus = list.map(material => {
            // Déjà converti (double passage sur le bâti) : on ne fait qu'enfoncer la teinte.
            if (material.isMeshLambertMaterial) {
              material.color.lerp(haze, dose);
              return material;
            }
            const color = material.color ? material.color.clone() : new THREE.Color(0xffffff);
            const lambert = new THREE.MeshLambertMaterial({
              map: material.map || null,
              color: color.lerp(haze, doseEclairee),
              transparent: material.transparent,
              opacity: material.opacity,
              side: material.side,
              alphaTest: material.alphaTest,
              fog: true
            });
            material.dispose();
            return lambert;
          });
          child.material = Array.isArray(child.material) ? rendus : rendus[0];
        });
      }

      // ÎLE FLOTTANTE LOINTAINE, assemblée à partir des VRAIES pièces KayKit — les mêmes
      // que le plateau lui-même, d'où la cohérence. Remplace un empilement de cônes et de
      // cylindres procéduraux qui ne ressemblait à rien.
      //
      //   socle    hex_grass_bottom  (le dessous rocheux d'un hexagone : y de -1 à 0)
      //   dessus   hex_grass
      //   relief   montagne (avec herbe et arbres) ou colline, parfois un rocher
      //   bâti     une tour, un moulin ou une église sur une île sur trois environ
      //
      // `haze` (0..1) applique la perspective atmosphérique en fonction de l'éloignement.
      // ÎLE FLOTTANTE LOINTAINE — une montagne RETOURNÉE, pointe vers le bas.
      //
      // Première tentative : un socle `hex_grass_bottom` surmonté d'un pont `hex_grass`.
      // Résultat, de gros blocs cubiques : un hexagone reste un hexagone, et vu d'une
      // caméra plongeante on n'en voyait que le dessus plat. Aucune silhouette d'île.
      //
      // Une montagne nue inversée résout tout d'un coup : sa pente donne la pointe
      // rocheuse caractéristique de l'île suspendue, et sa base — large et plate —
      // devient naturellement le plateau du dessus, sans qu'on ait à poser quoi que ce
      // soit pour le fabriquer. La rotation de π autour de X envoie y → -y : le modèle,
      // construit de 0 à h, occupe alors -h à 0, pile sous l'origine de l'île.
      //
      // Dessus : une colline herbue (le vert), et sur une île sur trois une tour, un
      // moulin ou une église (le monde habité).
      function makeKayKitFloatingIsle(seed, width, haze) {
        const rnd = salt => {
          const x = Math.sin((seed + 1) * 17.31 + salt * 41.77) * 43758.5453;
          return x - Math.floor(x);
        };
        const isle = new THREE.Group();

        const roche = cloneKayKitAsset(
          ["bareMountainA", "bareMountainB", "bareMountainC"][Math.floor(rnd(1) * 3) % 3],
          { maxWidth: width, maxHeight: width * (.72 + rnd(2) * .45), targetFloor: 0 }
        );
        if (!roche) return null;
        roche.rotation.x = Math.PI;   // pointe en bas
        isle.add(roche);

        // LA FACE SUPÉRIEURE EST EXACTEMENT À y = 0, et ce n'est pas une estimation :
        // cloneKayKitAsset pose le modèle sur targetFloor = 0, il occupe donc 0..h ; la
        // rotation de π envoie y → -y, soit -h..0. Comme la base d'une montagne est
        // plate, l'île offre un disque plat pile à l'origine.
        //
        // C'est là que tout se pose. Un premier essai plaçait le bâti à width × 0,22,
        // hauteur devinée pour « le sommet de la colline » : les bâtiments flottaient en
        // l'air, d'autant plus qu'ils étaient décalés latéralement au hasard.
        //
        // Les collines `hill_single` ont été retirées : à cette échelle elles se lisaient
        // comme un bloc vert facetté posé sur le rocher. De l'herbe véritable — semée en
        // touffes — donne le vert sans la masse. `forestGrass` et `forestBush` sont déjà
        // chargés par le jeu, aucun asset supplémentaire n'est nécessaire.
        const rayonUtile = width * .34;

        // BOSQUETS, pas touffes d'herbe. Ce qui donnait le bon rendu sur les îles était
        // la végétation en volume, pas un tapis vert. Les `trees_*` KayKit contiennent
        // DÉJÀ plusieurs arbres par modèle : deux à quatre bosquets suffisent à habiller
        // une île, pour deux à quatre draw calls — là où semer de l'herbe brin par brin
        // en coûtait un par touffe.
        //
        // Réservés aux îles les moins voilées : au-delà, la brume les réduit de toute
        // façon à des silhouettes, et le coût ne serait pas payé en retour.
        if (haze < .72) {
          const bosquets = 2 + Math.floor(rnd(20) * 3);
          for (let g = 0; g < bosquets; g++) {
            const bosquet = cloneKayKitAsset(
              ["treesASmall", "treesAMedium", "treesBSmall", "treesBMedium"][Math.floor(rnd(30 + g) * 4) % 4],
              {
                maxWidth: width * (.20 + rnd(40 + g) * .14),
                maxHeight: width * (.26 + rnd(50 + g) * .16),
                targetFloor: 0
              }
            );
            if (!bosquet) continue;
            const angle = rnd(60 + g) * Math.PI * 2;
            // Racine carrée : uniforme en AIRE, sinon tout s'entasse au centre.
            const rayon = Math.sqrt(rnd(70 + g)) * rayonUtile;
            bosquet.position.x += Math.cos(angle) * rayon;
            bosquet.position.z += Math.sin(angle) * rayon;
            bosquet.rotation.y = rnd(80 + g) * Math.PI * 2;
            isle.add(bosquet);
          }
        }

        // Une île sur trois habitée : assez pour raconter un monde, assez rare pour
        // rester un détail qu'on remarque. Posé sur la face réelle (y = 0) et maintenu
        // bien à l'intérieur du disque, donc jamais en surplomb.
        if (rnd(10) > .66) {
          const bati = cloneKayKitAsset(
            ["distantTower", "distantWindmill", "distantChurch"][Math.floor(rnd(11) * 3) % 3],
            { maxWidth: width * .28, maxHeight: width * .5, targetFloor: 0 }
          );
          if (bati) {
            const angle = rnd(12) * Math.PI * 2;
            const rayon = Math.sqrt(rnd(15)) * width * .17;
            bati.position.x += Math.cos(angle) * rayon;
            bati.position.z += Math.sin(angle) * rayon;
            bati.rotation.y = rnd(13) * Math.PI * 2;
            // Dose renforcée : sans elle le jaune, le vert et le rouge d'équipe des
            // bâtiments se lisent au loin et brouillent les repères des joueurs.
            kaykitHazeObject(bati, Math.min(1, haze + .28));
            isle.add(bati);
          }
        }

        isle.rotation.y = rnd(14) * Math.PI * 2;
        isle.traverse(child => {
          if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; }
        });
        kaykitHazeObject(isle, haze);
        return isle;
      }

      function makeKayKitDistantIslet(scale, withTower, seed) {
        const group = new THREE.Group();
        const tint = new THREE.Color(KAYKIT_SKY_COLORS.distant);
        // Roche nettement plus sombre que le dessus : c'est ce contraste interne qui
        // fait lire une île suspendue plutôt qu'un cône blanc posé dans le ciel. Les
        // deux tons restent désaturés et plus faibles que ceux du plateau (hiérarchie
        // §10 : le décor lointain doit toujours passer derrière le jeu).
        const rockMaterial = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(.68), fog: true, toneMapped: false });
        const topMaterial = new THREE.MeshBasicMaterial({ color: tint.clone().lerp(new THREE.Color(0xffffff), .16), fog: true, toneMapped: false });
        // Enregistrés pour que ILYOS_SKY.ilots() puisse réaccorder la teinte sans
        // reconstruire la scène — le rapport roche/dessus est conservé.
        if (kaykit3D) {
          kaykit3D.skyIsletMaterials = kaykit3D.skyIsletMaterials || [];
          kaykit3D.skyIsletMaterials.push({ material: rockMaterial, facteur: .68, versBlanc: 0 });
          kaykit3D.skyIsletMaterials.push({ material: topMaterial, facteur: 1, versBlanc: .16 });
        }
        const rock = new THREE.Mesh(
          kaykitGeometry("distant-islet-rock-v2", () => new THREE.ConeGeometry(.58, .92, 6)),
          rockMaterial
        );
        rock.rotation.x = Math.PI;
        rock.position.y = -.44;
        group.add(rock);
        const top = new THREE.Mesh(
          kaykitGeometry("distant-islet-top-v2", () => new THREE.CylinderGeometry(.66, .6, .18, 6)),
          topMaterial
        );
        group.add(top);
        if (withTower) {
          const tower = new THREE.Mesh(
            kaykitGeometry("distant-islet-tower-v2", () => new THREE.CylinderGeometry(.1, .13, .7, 6)),
            topMaterial
          );
          tower.position.set(.14, .44, -.08);
          group.add(tower);
          const roof = new THREE.Mesh(
            kaykitGeometry("distant-islet-roof-v2", () => new THREE.ConeGeometry(.17, .24, 6)),
            rockMaterial
          );
          roof.position.set(.14, .91, -.08);
          group.add(roof);
        }
        group.rotation.y = seed * Math.PI * 2;
        group.scale.setScalar(scale);
        group.traverse(child => { if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; } });
        return group;
      }

      // Effet de courbure : la nappe de nuages n'est plus un plan strictement rigide
      // mais s'affaisse comme la surface d'une planète vue depuis l'altitude.
      // Confiné à cette nappe décorative — jamais au plateau, qui reste un plan
      // rigoureusement plat. Un exposant proche de 1 (plutôt que quadratique) fait
      // tomber la courbe dès la bande réellement texturée (voir bandWidth dans
      // kaykitCloudSheetTexture) au lieu de la reporter sur le bord du plan, bien
      // au-delà de ce que la caméra voit jamais — sans quoi la courbure existe dans
      // la géométrie mais reste invisible à l'écran.
      function kaykitCurvedSeaGeometry(size, curveDrop) {
        const key = `curved-sea-v1-${size}-${curveDrop}`;
        if (kaykit3D?.geometries?.has(key)) return kaykit3D.geometries.get(key);
        const segments = 28;
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        const position = geometry.attributes.position;
        const half = size / 2;
        for (let i = 0; i < position.count; i++) {
          const t = Math.min(1, Math.hypot(position.getX(i), position.getY(i)) / half);
          // Le repère local Z devient le Y monde après la rotation -90° posant la
          // nappe à plat (voir kaykitCellPosition) : un Z négatif abaisse le point.
          position.setZ(i, -curveDrop * Math.pow(t, 1.1));
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        if (kaykit3D?.geometries) kaykit3D.geometries.set(key, geometry);
        return geometry;
      }

      // Construit les couches 1, 2, 3 et 5 (voir KAYKIT_SKY). La couche 4 — la zone
      // jouable — reste vide par construction : chaque élément procédural est validé
      // par kaykitSkyPlacementAllowed avant d'être ajouté.
      function buildKayKitSkyEnvironment(parent) {
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 43.117 + salt * 91.345) * 43758.5453;
          return x - Math.floor(x);
        };
        const sky = new THREE.Group();
        sky.name = "ilyos-sky";
        kaykit3D.skyLayers = [];

        // COUCHE 1 — dôme de ciel. Rayon très supérieur à la distance orbitale
        // maximale : la caméra reste toujours à l'intérieur, le dôme couvre donc
        // tout l'écran sans jamais se rapprocher du plateau. depthWrite désactivé
        // et renderOrder minimal : il se contente de peindre le fond.
        const dome = new THREE.Mesh(
          kaykitGeometry("sky-dome-v1", () => new THREE.SphereGeometry(KAYKIT_SKY.domeRadius, 32, 20)),
          new THREE.MeshBasicMaterial({
            map: kaykitSkyDomeTexture(), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false
          })
        );
        dome.renderOrder = -1000;
        dome.frustumCulled = false;
        sky.add(dome);

        // COUCHE 1b — bande de ciel haute densité, plaquée juste devant le dôme sur la
        // seule tranche que les caméras de jeu montrent (voir kaykitSkyBandTexture pour
        // le calcul de grossissement qui justifie son existence). Rayon légèrement
        // inférieur à celui du dôme pour lever toute ambiguïté de tri, et renderOrder
        // intercalé entre le dôme (-1000) et les nappes de nuages (-900).
        const bandThetaStart = Math.PI / 2 + THREE.MathUtils.degToRad(KAYKIT_SKY_BAND.top);
        const bandThetaLength = THREE.MathUtils.degToRad(KAYKIT_SKY_BAND.bottom - KAYKIT_SKY_BAND.top);
        const band = new THREE.Mesh(
          kaykitGeometry("sky-band-hd-v1", () => new THREE.SphereGeometry(
            KAYKIT_SKY.domeRadius * .985, 128, 24, 0, Math.PI * 2, bandThetaStart, bandThetaLength
          )),
          new THREE.MeshBasicMaterial({
            map: kaykitSkyBandTexture(), side: THREE.BackSide, transparent: true,
            depthWrite: false, fog: false, toneMapped: false
          })
        );
        band.renderOrder = -999;
        band.frustumCulled = false;
        sky.add(band);

        // COUCHE 5 — mer de nuages, très bas sous les îles. Deux nappes seulement :
        // la haute donne la lecture « îles ↓ vide ↓ nuages », la basse ajoute du
        // parallaxe quand la caméra tourne. Elles dérivent horizontalement à des
        // vitesses différentes, assez lentement pour ne se remarquer qu'après
        // plusieurs secondes, et sans aucune composante verticale.
        [
          // Trou central très réduit : les nuages passent désormais SOUS le plateau et
          // se voient dans les interstices entre les îles. Sans danger pour la lecture
          // — la caméra reste toujours au-dessus du plateau (maxPolarAngle ≈ 88°), donc
          // une nappe à y = -11.5 ne peut jamais s'interposer entre l'œil et une case.
          { y: KAYKIT_SKY.seaHigh, size: 150, hole: [2, 7], color: KAYKIT_SKY_COLORS.seaHigh, opacity: .62, variant: 0, resolution: 2048, curveDrop: 30, drift: { x: 3.4, z: 2.6, sx: .0105, sz: .0082 } },
          // NAPPE D'HORIZON. `curveDrop` porté de 46 à 78 : c'est lui qui fait la
          // « petite planète ». La surface s'affaisse d'autant plus vite en s'éloignant,
          // donc sa silhouette remonte dans le cadre et se lit comme un horizon courbe,
          // au lieu de fuir à plat vers un point de fuite qu'on ne voit jamais.
          // `edgeFade: .97` la laisse pleine jusqu'à son bord — voir kaykitCloudSheetTexture.
          { y: KAYKIT_SKY.seaLow, size: 250, hole: [4, 12], color: KAYKIT_SKY_COLORS.seaLow, opacity: .40, variant: 1, resolution: 1024, edgeFade: .80, curveDrop: 78, drift: { x: 5.2, z: 4.1, sx: .0061, sz: .0047 } }
        ].forEach((layer, index) => {
          const sheet = new THREE.Mesh(
            kaykitCurvedSeaGeometry(layer.size, layer.curveDrop),
            new THREE.MeshBasicMaterial({
              map: kaykitCloudSheetTexture(layer.variant, layer.size, layer.hole[0], layer.hole[1], layer.resolution, layer.edgeFade),
              color: layer.color, transparent: true,
              opacity: layer.opacity, depthWrite: false, fog: true, toneMapped: false
            })
          );
          sheet.rotation.x = -Math.PI / 2;
          sheet.position.y = layer.y;
          sheet.renderOrder = -900 + index * 10;
          sheet.frustumCulled = false;
          sky.add(sheet);
          kaykit3D.skyLayers.push({ object: sheet, base: sheet.position.clone(), drift: layer.drift });
        });

        // Crête de la mer de nuages : des amas posés sur la nappe haute. C'est eux
        // qui donnent son relief au sommet du moutonnement — une nappe seule, vue
        // d'une caméra très basse, se réduit à un aplat blanc et lit comme du
        // brouillard. Sprites (toujours face caméra, coût négligeable, silhouette
        // correcte quel que soit l'angle), jamais au-dessus du plancher de sécurité.
        const puffTexture = kaykitCloudTexture();
        const puffCount = 12;
        for (let i = 0; i < puffCount; i++) {
          const angle = (i / puffCount) * Math.PI * 2 + seeded(i, 2) * .5;
          // pow(.6) tasse la distribution vers 1 : la majorité des amas tombe dans la
          // bande moyenne/lointaine (35-65) qui forme la vraie crête d'horizon, visible
          // au zoom de jeu normal ; une minorité seulement reste proche, pour garder du
          // parallaxe sous les bords du plateau.
          const spread = Math.pow(seeded(i, 3), .6);
          // Le rayon court jusqu'au lointain et l'altitude remonte avec lui : les amas
          // proches moutonnent sur la nappe, les plus éloignés forment un banc à
          // hauteur d'horizon — c'est ce banc qui donne sa silhouette à la mer de
          // nuages depuis une caméra très basse, où la nappe est vue par la tranche.
          const radius = 18 + spread * 50;
          const y = KAYKIT_SKY.seaHigh + .8 + spread * 5.4 + seeded(i, 4) * 1.4;
          const scale = 11 + spread * 19 + seeded(i, 5) * 6;
          if (!kaykitSkyPlacementAllowed(Math.cos(angle) * radius, y, Math.sin(angle) * radius, scale * .5)) continue;
          const puff = new THREE.Sprite(new THREE.SpriteMaterial({
            map: puffTexture, color: KAYKIT_SKY_COLORS.seaHigh, transparent: true, depthWrite: false,
            opacity: .32 + spread * .16 + seeded(i, 6) * .14, fog: true, toneMapped: false
          }));
          puff.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
          // Les amas lointains s'aplatissent (aspect plus horizontal) : lecture "banc
          // de nuages à l'horizon" plutôt que "boules" une fois éloignés.
          puff.scale.set(scale, scale * THREE.MathUtils.lerp(.50, .30, spread), 1);
          puff.renderOrder = -880;
          sky.add(puff);
          kaykit3D.skyLayers.push({
            object: puff, base: puff.position.clone(),
            drift: { x: 1.6 + seeded(i, 7) * 1.8, z: 1.3 + seeded(i, 8) * 1.6, sx: .012 + seeded(i, 9) * .008, sz: .009 + seeded(i, 10) * .007 }
          });
        }

        // COUCHE 6 — poussière dorée (voir KAYKIT_SKY_DUST).
        buildKayKitSkyDust(sky);

        // COUCHE 3 — ARCHIPEL LOINTAIN : construit PLUS TARD, pas ici.
        // Les îles sont assemblées à partir de modèles KayKit, or buildKayKitSkyEnvironment
        // s'exécute avant la fin du chargement des assets : cloneKayKitAsset y renvoyait
        // null et il ne se créait aucune île — le ciel gardait ses 20 calques et rien d'autre.
        // Même différé que les nuages du plateau, voir buildKayKitDistantArchipelago.

        parent.add(sky);
        kaykit3D.skyGroup = sky;
      }

      /**
       * Nuages KayKit réels, en DEUX niveaux d'altitude tous deux sûrs PAR
       * CONSTRUCTION (jamais de masquage conditionnel selon le mode de
       * caméra — voir cahier des charges "environnement céleste léger",
       * 2026-08-19) :
       *
       *  - BAS (mer de nuages sous le plateau, y ≈ -1.8 à -2.5) : rayon
       *    libre, y compris proche du centre. Sûr à TOUT angle/zoom parce
       *    que la caméra elle-même ne descend jamais sous y≈4 (vue "front",
       *    zoom minimal 6.4) ni y≈4.5 (orbite/isométrique, même zoom) — une
       *    caméra qui ne peut pas être en dessous de y=4 ne peut pas non
       *    plus regarder VERS une case (toutes à y∈[0, 1.3]) EN PASSANT par
       *    y=-2 : ces nuages ne peuvent donc géométriquement jamais finir
       *    entre l'œil et une case. C'est ce niveau, proche et large, qui
       *    porte l'essentiel de la lecture "on est haut dans le ciel" en vue
       *    "front" (le mockup de référence : îles → nuages en contrebas).
       *  - LOINTAIN, hors du rayon de sécurité de l'archipel
       *    (kaykitSkyPlacementAllowed, même garantie que
       *    buildKayKitSkyEnvironment — sûr à tout angle par construction,
       *    pas par masquage), calé au plus près de ce rayon pour rester
       *    visible en bordure du cadrage "front" par défaut (vérifié par
       *    projection caméra réelle).
       *
       * Densité pilotée par kaykit3D.qualityMode (mobile = moins d'instances,
       * jamais moins de sécurité géométrique).
       */
      // ============ NUAGES GLTF DU PLATEAU : TRAITEMENT CONTRE-JOUR ============
      // Ces amas (cloud_big / cloud_small, 32 instances) sont de VRAIES géométries
      // KayKit attachées à la Scene, PAS au groupe « ilyos-sky ». Toute la palette
      // KAYKIT_SKY_COLORS les ignorait donc totalement : ils restaient en blanc pur
      // éclairé de face, ce qui en faisait — après le soleil — les objets les plus
      // lumineux de l'image. Or à contre-jour, un nuage placé entre l'œil et la source
      // est DANS L'OMBRE. C'était la cause du rendu « coton » persistant.
      //
      // Comme ce sont de vraies normales, on peut faire mieux qu'un liseré peint :
      //   corps refroidi (le nuage n'est plus la valeur la plus claire)
      // + liseré additif là où la normale regarde le soleil ET fuit la caméra,
      //   c'est-à-dire exactement le bord incandescent de l'illustration du menu.
      //
      // L'éclairage 3D de la scène n'est pas touché (choix « contre-jour peint
      // seulement ») : gardiens et cases gardent leur lisibilité.
      const KAYKIT_CLOUD_BACKLIT = {
        // DirectionalLight principale à 2.05 : à 0x8493b6 les nuages ressortaient encore
        // quasi blancs à l'écran. Il faut descendre franchement la valeur pour qu'ils
        // cessent d'être l'élément le plus clair de l'image.
        body: 0x5a6b90,     // corps refroidi — remplace le blanc pur
        rim: 0xffd08a,      // liseré chaud
        rimPower: 2.4,      // resserrement du liseré sur le bord
        rimStrength: 0.55
      };

      // Direction MONDE du soleil, dérivée de KAYKIT_SKY_SUN pour que le liseré et le
      // halo peint dans le ciel désignent forcément le même point. Convention de
      // SphereGeometry : phi = u·2π, theta = p·π, x = -cos(phi)·sin(theta),
      // y = cos(theta), z = sin(phi)·sin(theta).
      function kaykitSunWorldDirection() {
        const phi = KAYKIT_SKY_SUN.u * Math.PI * 2;
        const theta = KAYKIT_SKY_SUN.p * Math.PI;
        return new THREE.Vector3(
          -Math.cos(phi) * Math.sin(theta),
          Math.cos(theta),
          Math.sin(phi) * Math.sin(theta)
        ).normalize();
      }

      const kaykitBacklitCloudCache = new Map();

      function kaykitBacklitCloudMaterial(source) {
        if (!source) return source;
        const cached = kaykitBacklitCloudCache.get(source.uuid);
        if (cached) return cached;

        // Clone : le matériau vient du GLTF et est partagé par toutes les instances,
        // le muter en place contaminerait tout autre usage de l'asset.
        const mat = source.clone();
        mat.color = new THREE.Color(KAYKIT_CLOUD_BACKLIT.body);

        const sunDir = kaykitSunWorldDirection();
        mat.onBeforeCompile = shader => {
          shader.uniforms.uSunDir = { value: sunDir };
          shader.uniforms.uRimColor = { value: new THREE.Color(KAYKIT_CLOUD_BACKLIT.rim).convertSRGBToLinear() };
          shader.uniforms.uRimPower = { value: KAYKIT_CLOUD_BACKLIT.rimPower };
          shader.uniforms.uRimStrength = { value: KAYKIT_CLOUD_BACKLIT.rimStrength };
          // Conservé pour que le panneau de réglage puisse pousser de nouvelles
          // valeurs sans recompiler le programme.
          mat.userData.shader = shader;

          shader.vertexShader = shader.vertexShader
            .replace("#include <common>",
              "#include <common>\nvarying vec3 vBacklitN;\nvarying vec3 vBacklitW;")
            .replace("#include <worldpos_vertex>",
              "#include <worldpos_vertex>\n" +
              "  vBacklitN = normalize(mat3(modelMatrix) * objectNormal);\n" +
              "  vBacklitW = (modelMatrix * vec4(transformed, 1.0)).xyz;");

          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>",
              "#include <common>\nvarying vec3 vBacklitN;\nvarying vec3 vBacklitW;\n" +
              "uniform vec3 uSunDir;\nuniform vec3 uRimColor;\n" +
              "uniform float uRimPower;\nuniform float uRimStrength;")
            // ANCRAGE CRITIQUE : avant <tonemapping_fragment>, PAS avant
            // <dithering_fragment>. À ce dernier point gl_FragColor a déjà subi le
            // tone mapping ACES ET l'encodage sRGB : y ajouter 1.5 sature tout à blanc
            // pur, ce qui laissait les nuages exactement aussi cotonneux qu'avant.
            // Injecté ici, le lisere est une VRAIE lumière : il traverse ACES, se
            // comporte comme le reste de l'éclairage, et le Bloom pourra le cueillir.
            .replace("#include <tonemapping_fragment>",
              "  vec3 bN = normalize(vBacklitN);\n" +
              "  vec3 bV = normalize(cameraPosition - vBacklitW);\n" +
              // 1 - |N·V| : maximal sur la silhouette, nul de face. abs() pour que les
              // faces arrière (nuages non fermés du pack) s'allument aussi.
              // Sur un volume OPAQUE, la face qui regarde le soleil est celle qu'on ne voit
              // PAS : tester dot(N, soleil) n'allume donc jamais rien de visible
              // (vérifié — nuages passés en noir, aucun bord ne s'allumait). Ce qui
              // s'embrase à contre-jour, c'est la SILHOUETTE du côté du soleil : on
              // projette donc normale et direction du soleil sur le plan perpendi-
              // culaire à la vue, et on compare ces deux directions-là.
              "  vec3 nPerp = normalize(bN - bV * dot(bN, bV));\n" +
              "  vec3 sPerp = normalize(uSunDir - bV * dot(uSunDir, bV));\n" +
              "  float bRim = pow(1.0 - abs(dot(bN, bV)), uRimPower);\n" +
              // Ne s'allume que du côté qui regarde le soleil : sans ce facteur on
              // obtient un contour uniforme (effet néon) au lieu d'un contre-jour.
              "  float bBack = smoothstep(-0.10, 0.90, dot(nPerp, sPerp));\n" +
              "  gl_FragColor.rgb += uRimColor * (bRim * bBack * uRimStrength);\n" +
              "#include <tonemapping_fragment>");
        };
        // Trois matériaux identiques compileraient trois programmes sans cette clé.
        mat.customProgramCacheKey = () => "ilyos-backlit-cloud-v1";
        mat.needsUpdate = true;

        kaykitBacklitCloudCache.set(source.uuid, mat);
        return mat;
      }

      // Poussière dorée en suspension. Points additifs : une seule géométrie, un seul
      // draw call, aucune animation propre — le calque est confié au même mécanisme de
      // dérive que les nappes (kaykit3D.skyLayers), donc il respire avec le reste.
      //
      // Rayon intérieur 10 : bien au-delà de la demi-diagonale du plateau (7,2), donc
      // les particules n'occultent JAMAIS une case jouable. Elles n'entrent dans le
      // cadre que par les bords et les coins — exactement la limite convenue.
      // Deux champs, parce qu'un seul anneau ne peut pas satisfaire les deux besoins.
      //
      // CHAMP LOINTAIN : l'anneau large, celui qui donne la profondeur.
      //
      // CHAMP PROCHE : un premier essai excluait tout un rayon de 10 autour du centre,
      // pour être certain qu'aucune particule ne couvre une case. Trop prudent — une
      // poussière de quelques pixels ne masque rien, à la différence d'une masse de
      // nuage — et ça creusait un vide visible juste autour du plateau.
      // La bonne exclusion n'est pas un RAYON mais une TRANCHE D'ALTITUDE : les
      // particules proches passent au-dessus des gardiens (> nearAbove) ou sous
      // l'archipel (< nearBelow), jamais dans le plan de jeu. Elles peuvent donc venir
      // très près en projection écran sans jamais se confondre avec une pièce.
      //
      // Champ proche plus petit et plus discret : la taille est atténuée par la
      // distance, donc à réglage égal une particule proche serait énorme.
      // POUSSIÈRE DORÉE — deux zones × deux calibres.
      //
      // ZONES. Le champ LOINTAIN (anneau large) donne la profondeur. Le champ PROCHE
      // remplit les bords du cadre, avec deux régimes séparés par `boardRadius` :
      //   · r <  boardRadius : exclusion par TRANCHE D'ALTITUDE — les particules passent
      //     au-dessus des gardiens ou sous la coque des îles, jamais dans le plan de jeu.
      //   · r >= boardRadius : aucune contrainte, plus aucune case ne peut être occultée.
      // Sans ce second régime, les côtés du cadre restaient vides : au bord de l'écran la
      // tranche visible va de y ≈ -0,4 à 5,5, où « y > 3,6 » ne laissait qu'une lamelle.
      //
      // CALIBRES. Premier essai : pour gagner en présence j'avais simplement grossi les
      // particules (.42 → .85). Plus visible, mais grossier — la finesse faisait justement
      // le charme du réglage précédent. Or présence et finesse ne s'opposent pas : c'est
      // le NOMBRE qui donne la présence, la TAILLE qui donne le grain. D'où une majorité
      // de fines (fineRatio) et une minorité de plus grosses, comme une vraie poussière en
      // suspension — les grosses accrochent l'œil, les fines font la matière.
      //
      // Tirage uniforme en AIRE (racine carrée) : uniforme sur le rayon entasserait les
      // particules au centre, là où on n'en veut pas, et affamerait la périphérie.
      const KAYKIT_SKY_DUST = {
        color: 0xffd89a,
        fineRatio: .82,

        count: 340, innerRadius: 10, outerRadius: 30, minY: -7, maxY: 9,
        farFine: { size: .30, opacity: .80 },
        farMote: { size: .90, opacity: 1 },

        nearCount: 400, nearInner: 2.2, nearOuter: 16,
        boardRadius: 8,
        nearAbove: 3.6,   // au-dessus du sommet des gardiens
        nearBelow: -3.2,  // sous la coque des îles
        nearSpan: 6,
        sideMinY: -4, sideMaxY: 8,
        nearFine: { size: .15, opacity: .62 },
        nearMote: { size: .44, opacity: .82 }
      };

      function kaykitDustTexture() {
        const key = "sky-dust-v1";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, "rgba(255,244,214,1)");
        g.addColorStop(.30, "rgba(255,224,164,.5)");
        g.addColorStop(1, "rgba(255,208,140,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      function buildKayKitSkyDust(parent) {
        const D = KAYKIT_SKY_DUST;
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 31.77 + salt * 57.19) * 43758.5453;
          return x - Math.floor(x);
        };

        // Les quatre calques sont enregistrés ici pour que le panneau de réglage agisse
        // sur tous d'un seul geste, chacun relativement à sa propre valeur de départ.
        kaykit3D.skyDustFields = [];

        const makeField = (name, points, calibre, drift) => {
          if (!points.length) return;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
          const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({
            map: kaykitDustTexture(), size: calibre.size, sizeAttenuation: true,
            color: D.color, opacity: calibre.opacity, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, fog: false, toneMapped: false
          }));
          cloud.name = name;
          cloud.renderOrder = -870;
          cloud.frustumCulled = false;
          parent.add(cloud);
          kaykit3D.skyLayers.push({ object: cloud, base: cloud.position.clone(), drift });
          kaykit3D.skyDustFields.push({
            object: cloud, baseSize: calibre.size, baseOpacity: calibre.opacity
          });
        };

        // Répartit un semis entre fines et grosses. Le tirage porte sur l'indice du
        // point, donc la séparation reste stable d'une partie à l'autre.
        const separer = (points, salt) => {
          const fines = [], grosses = [];
          for (let i = 0; i < points.length; i += 3) {
            const cible = seeded(i / 3, salt) < D.fineRatio ? fines : grosses;
            cible.push(points[i], points[i + 1], points[i + 2]);
          }
          return { fines, grosses };
        };

        const loin = [];
        for (let i = 0; i < D.count; i++) {
          const a = seeded(i, 1) * Math.PI * 2;
          const r = Math.sqrt(D.innerRadius * D.innerRadius
            + seeded(i, 2) * (D.outerRadius * D.outerRadius - D.innerRadius * D.innerRadius));
          loin.push(Math.cos(a) * r, D.minY + seeded(i, 3) * (D.maxY - D.minY), Math.sin(a) * r);
        }
        const loinSep = separer(loin, 31);
        const driftLoin = { x: 1.8, z: 1.3, sx: .0038, sz: .0029 };
        makeField("ilyos-sky-dust-fine", loinSep.fines, D.farFine, driftLoin);
        makeField("ilyos-sky-dust-mote", loinSep.grosses, D.farMote, driftLoin);

        const pres = [];
        for (let i = 0; i < D.nearCount; i++) {
          const a = seeded(i, 11) * Math.PI * 2;
          const r = Math.sqrt(D.nearInner * D.nearInner
            + seeded(i, 12) * (D.nearOuter * D.nearOuter - D.nearInner * D.nearInner));
          let y;
          if (r >= D.boardRadius) {
            y = D.sideMinY + seeded(i, 14) * (D.sideMaxY - D.sideMinY);
          } else {
            // Une sur deux au-dessus, une sur deux en dessous : au-dessus seul, le champ
            // semblait suspendu au plafond ; en dessous seul, il disparaissait derrière
            // le plateau dès que la caméra plongeait.
            const above = seeded(i, 13) > .45;
            y = above
              ? D.nearAbove + seeded(i, 14) * D.nearSpan
              : D.nearBelow - seeded(i, 14) * D.nearSpan;
          }
          pres.push(Math.cos(a) * r, y, Math.sin(a) * r);
        }
        const presSep = separer(pres, 47);
        const driftPres = { x: .9, z: .7, sx: .0071, sz: .0058 };
        makeField("ilyos-sky-dust-near-fine", presSep.fines, D.nearFine, driftPres);
        makeField("ilyos-sky-dust-near-mote", presSep.grosses, D.nearMote, driftPres);
      }

      // ===================== PANNEAU DE RÉGLAGE EN DIRECT =====================
      // Exposé sur window pour arbitrer les choix de direction artistique À L'IMAGE
      // plutôt que sur des captures produites une par une. Régler le ciel « au juger »
      // à travers un cycle patch → build → rechargement coûte une minute par essai ;
      // ici c'est instantané, donc on peut réellement comparer.
      //
      //   ILYOS_SKY.aide()                    liste les commandes
      //   ILYOS_SKY.soleil({ p: .58 })        remonte le soleil (défaut .66)
      //   ILYOS_SKY.liseré({ force: .9 })     intensité du liseré des nuages
      //   ILYOS_SKY.rayons({ force: .5 })     intensité des godrays
      //   ILYOS_SKY.valeurs()                 relit les réglages courants
      window.ILYOS_SKY = {
        aide() {
          return [
            "soleil({ p, u, diffusion, etendue, halo })",
            "                      p = élévation : PLUS GRAND = PLUS BAS (.58 hors cadre,",
            "                      .63 visible, .70 derrière le plateau). u = azimut 0..1",
            "liseret({ force, nettete })   bord lumineux des nuages (= rimStrength/rimPower)",
            "                      force 0..1.5, nettete 1..5 (plus haut = bord plus fin)",
            "                      visible surtout en caméra BASSE : le soleil éclaire par-dessous",
            "rayons({ force, nombre, longueur })   godrays autour du soleil",
            "                      diffusion 0..1 = nappe de chaleur étalée (le soleil diffus)",
            "                      halo = rayon du cœur net. Les deux se cumulent.",
            "poussiere({ force, taille })  particules dorées (multiplicateurs, 1 = code)",
            "ilots({ teinte: 0x93a9c6 })   silhouettes d'archipel lointain",
            "horizon({ force, elevation, epaisseur })  bande d'horizon peinte dans le ciel :",
            "                      elevation en p (.611 = 20° sous l'horizontale), epaisseur en degrés",
            "bloom({ actif, force, seuil, rayon })   éblouissement autour des hautes",
            "                      lumières. seuil = luminance de déclenchement (0..1).",
            "cadrage({ hauteur, recul, inclinaison })   recul = distance caméra (17) ;",
            "                      inclinaison en degrés sous l'horizontale (37.2) : le haut",
            "                      du cadre est à (inclinaison - 16,5°). 30 fait entrer l'horizon.",
            "                      hauteur visée (-0.5) : plus haut =",
            "                      hauteur visée : plus haut =",
            "                      plateau plus bas dans le cadre, plus de ciel visible",
            "nuages({ corps: 0x5a6b90 })   couleur du corps des nuages",
            "valeurs()             réglages courants",
            "regenerer()           reconstruit la texture de ciel"
          ].join("\n");
        },
        valeurs() {
          return {
            soleil: { p: KAYKIT_SKY_SUN.p, u: KAYKIT_SKY_SUN.u },
            rayons: Object.assign({}, KAYKIT_SKY_SUN.rays),
            liseré: { force: KAYKIT_CLOUD_BACKLIT.rimStrength, nettete: KAYKIT_CLOUD_BACKLIT.rimPower },
            nuages: "#" + KAYKIT_CLOUD_BACKLIT.body.toString(16).padStart(6, "0")
          };
        },
        regenerer() {
          const sky = kaykit3D && kaykit3D.scene && kaykit3D.scene.getObjectByName("ilyos-sky");
          if (!sky) return "scène 3D pas encore prête";
          // La texture est mise en cache par clé : sans cette purge, on regénérerait
          // l'ancienne à l'identique.
          kaykit3D.materials.delete("sky-band-hd-v1");
          const band = sky.children.find(c => c.geometry && c.geometry.type === "SphereGeometry"
            && c.geometry.parameters && c.geometry.parameters.thetaStart > 0);
          if (!band) return "bande de ciel introuvable";
          if (band.material.map) band.material.map.dispose();
          band.material.map = kaykitSkyBandTexture();
          band.material.needsUpdate = true;
          return "ciel régénéré";
        },
        soleil(opts = {}) {
          if (opts.p !== undefined) KAYKIT_SKY_SUN.p = opts.p;
          if (opts.u !== undefined) KAYKIT_SKY_SUN.u = opts.u;
          if (opts.diffusion !== undefined) KAYKIT_SKY_SUN.diffusion = opts.diffusion;
          if (opts.etendue !== undefined) KAYKIT_SKY_SUN.diffusionDeg = opts.etendue;
          if (opts.halo !== undefined) KAYKIT_SKY_SUN.haloDeg = opts.halo;
          // Le soleil peint et le liseré des nuages DOIVENT rester d'accord : c'est
          // toute la raison d'être de kaykitSunWorldDirection. On repousse donc la
          // nouvelle direction dans les shaders déjà compilés.
          const dir = kaykitSunWorldDirection();
          kaykitBacklitCloudCache.forEach(mat => {
            const sh = mat.userData && mat.userData.shader;
            if (sh && sh.uniforms.uSunDir) sh.uniforms.uSunDir.value.copy(dir);
          });
          return this.regenerer();
        },
        // Alias sans accent : `liseré` est pénible à taper dans une console.
        liseret(opts) { return this.liseré(opts); },
        rim(opts) { return this.liseré(opts); },
        liseré(opts = {}) {
          if (opts.force !== undefined) KAYKIT_CLOUD_BACKLIT.rimStrength = opts.force;
          if (opts.nettete !== undefined) KAYKIT_CLOUD_BACKLIT.rimPower = opts.nettete;
          kaykitBacklitCloudCache.forEach(mat => {
            const sh = mat.userData && mat.userData.shader;
            if (!sh) return;
            sh.uniforms.uRimStrength.value = KAYKIT_CLOUD_BACKLIT.rimStrength;
            sh.uniforms.uRimPower.value = KAYKIT_CLOUD_BACKLIT.rimPower;
          });
          return this.valeurs().liseré;
        },
        rayons(opts = {}) {
          const R = KAYKIT_SKY_SUN.rays;
          if (opts.force !== undefined) R.strength = opts.force;
          if (opts.nombre !== undefined) R.count = opts.nombre;
          if (opts.longueur !== undefined) R.maxDeg = opts.longueur;
          return this.regenerer();
        },
        poussiere(opts = {}) {
          const champs = kaykit3D && kaykit3D.skyDustFields;
          if (!champs || !champs.length) return "poussière introuvable";
          // `force` et `taille` sont des MULTIPLICATEURS : 1 = les valeurs du code.
          // Chaque calque est ajusté par rapport à sa propre base, ce qui préserve le
          // rapport fines/grosses et proche/lointain quel que soit le réglage.
          champs.forEach(champ => {
            if (opts.force !== undefined) champ.object.material.opacity = champ.baseOpacity * opts.force;
            if (opts.taille !== undefined) champ.object.material.size = champ.baseSize * opts.taille;
          });
          return champs.map(champ => ({
            calque: champ.object.name.replace("ilyos-sky-dust-", ""),
            points: champ.object.geometry.attributes.position.count,
            taille: +champ.object.material.size.toFixed(3),
            force: +champ.object.material.opacity.toFixed(3)
          }));
        },
        bloom(opts = {}) {
          if (opts.actif !== undefined) KAYKIT_BLOOM.actif = !!opts.actif;
          if (opts.force !== undefined) KAYKIT_BLOOM.force = opts.force;
          if (opts.seuil !== undefined) KAYKIT_BLOOM.seuil = opts.seuil;
          if (opts.douceur !== undefined) KAYKIT_BLOOM.douceur = opts.douceur;
          if (opts.rayon !== undefined) KAYKIT_BLOOM.rayon = opts.rayon;
          if (opts.reprendre) { kaykitBloom.coupeAuto = false; kaykitBloom.imagesBasses = 0; }
          return Object.assign({}, KAYKIT_BLOOM, { coupeAutomatique: kaykitBloom.coupeAuto });
        },
        cadrage(opts = {}) {
          if (opts.hauteur !== undefined) window.ILYOS_FRONT_VIEW_HEIGHT = opts.hauteur;
          if (opts.recul !== undefined) window.ILYOS_FRONT_DISTANCE = opts.recul;
          if (opts.inclinaison !== undefined) window.ILYOS_FRONT_PITCH_DEG = opts.inclinaison;
          // Réapplique le preset FACE avec les nouvelles valeurs.
          if (typeof window.ILYOS_applyFrontCameraPreset === "function") {
            window.ILYOS_applyFrontCameraPreset({ explicit: true });
          }
          const inclinaison = Number.isFinite(window.ILYOS_FRONT_PITCH_DEG)
            ? window.ILYOS_FRONT_PITCH_DEG : 37.2;
          return {
            hauteur: Number.isFinite(window.ILYOS_FRONT_VIEW_HEIGHT) ? window.ILYOS_FRONT_VIEW_HEIGHT : -0.5,
            recul: Number.isFinite(window.ILYOS_FRONT_DISTANCE) ? window.ILYOS_FRONT_DISTANCE : 17,
            inclinaison,
            hautDuCadre: +(inclinaison - 16.5).toFixed(1) + "° sous l'horizon"
          };
        },
        horizon(opts = {}) {
          const sky = kaykit3D && kaykit3D.scene && kaykit3D.scene.getObjectByName("ilyos-sky");
          if (!sky) return "scène 3D pas encore prête";
          const nappes = sky.children.filter(c => c.geometry && c.geometry.type === "PlaneGeometry");
          const basse = nappes[1];
          if (!basse) return "nappe d'horizon introuvable";
          if (opts.force !== undefined) KAYKIT_SKY_HORIZON.force = opts.force;
          if (opts.elevation !== undefined) KAYKIT_SKY_HORIZON.p = opts.elevation;
          if (opts.epaisseur !== undefined) KAYKIT_SKY_HORIZON.spread = opts.epaisseur;
          if (opts.nappe !== undefined) basse.material.opacity = opts.nappe;
          const etat = Object.assign({}, KAYKIT_SKY_HORIZON, { nappe: basse.material.opacity });
          return Object.assign(etat, { rendu: this.regenerer() });
        },
        ilots(opts = {}) {
          const mats = kaykit3D && kaykit3D.skyIsletMaterials;
          if (!mats || !mats.length) return "îlots introuvables";
          if (opts.teinte !== undefined) {
            KAYKIT_SKY_COLORS.distant = opts.teinte;
            mats.forEach(entree => {
              const c = new THREE.Color(opts.teinte).multiplyScalar(entree.facteur);
              if (entree.versBlanc) c.lerp(new THREE.Color(0xffffff), entree.versBlanc);
              entree.material.color.copy(c);
            });
          }
          return { teinte: "#" + KAYKIT_SKY_COLORS.distant.toString(16).padStart(6, "0"),
                   materiaux: mats.length };
        },
        nuages(opts = {}) {
          if (opts.corps !== undefined) {
            KAYKIT_CLOUD_BACKLIT.body = opts.corps;
            kaykitBacklitCloudCache.forEach(mat => mat.color.setHex(opts.corps));
          }
          return this.valeurs().nuages;
        }
      };

      // Archipel lointain. Séparé de buildKayKitSkyEnvironment et appelé seulement une fois
      // les modèles KayKit disponibles — sinon cloneKayKitAsset renvoie null et rien n'est
      // construit. Même principe que buildKayKitBoardClouds : on attend l'asset, jamais de
      // pièce de secours à remplacer à chaud.
      /** Remplace le cône de repli des plateformes de château par la montagne
       *  retournée, une fois les modèles KayKit disponibles. Les plateformes sont
       *  construites très tôt — avant la fin du chargement — et ne seraient sinon
       *  reconstruites qu'au premier changement de couche d'île. */
      function kaykitReprendreSoclesRocheux() {
        const registre = kaykit3D?.pedestalRegistry;
        if (!registre || !registre.size) return false;
        let reprises = 0;
        registre.forEach(socle => {
          if (socle.userData.ilyosSocleRocheux !== false) return;
          const couleur = socle.userData.ilyosSocleCouleur ?? 0;
          const variante = ["bareMountainA", "bareMountainB", "bareMountainC"][Math.abs(couleur) % 3];
          const roche = cloneKayKitAsset(variante, { maxWidth: 1.02, maxHeight: .86, targetFloor: 0 });
          if (!roche) return;
          // Le cône de repli est le seul ConeGeometry du socle : le retirer ne peut
          // pas emporter le bloc (ExtrudeGeometry) ni le liseré (LineLoop).
          const aRetirer = [];
          socle.traverse(o => { if (o.isMesh && o.geometry?.type === "ConeGeometry") aRetirer.push(o); });
          disposeKayKitObjects(aRetirer);
          roche.rotation.x = Math.PI;
          roche.rotation.y = (Math.abs(couleur) % 7) * .9;
          roche.position.y = .14;
          roche.traverse(child => {
            if (!child.isMesh) return;
            child.castShadow = false;
            child.receiveShadow = false;
          });
          socle.add(roche);
          socle.userData.ilyosSocleRocheux = true;
          reprises++;
        });
        return reprises > 0;
      }

      function buildKayKitDistantArchipelago() {
        const sky = kaykit3D?.scene?.getObjectByName("ilyos-sky");
        if (!sky) return false;
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 43.117 + salt * 91.345) * 43758.5453;
          return x - Math.floor(x);
        };

        // COUCHE 3 — ARCHIPEL LOINTAIN. « ILYOS fait partie d'un immense archipel »,
        // pas « il y a d'autres objets à cliquer ».
        //
        // Les îles sont désormais de vraies pièces KayKit assemblées (voir
        // makeKayKitFloatingIsle), et non plus des cônes procéduraux.
        //
        // ALTITUDE DÉDUITE, JAMAIS POSÉE À LA MAIN : y = hauteurCaméra − rayon × tan(angle).
        // Un placement manuel avait produit un îlot à 15° sous l'horizontale, hors du cadre
        // FACE qui commence à 20,7°. L'angle est tiré entre 21° et 32° : au-delà de ~33°
        // l'île passerait sous la mer de nuages (seaHigh = -11,5) et disparaîtrait.
        //
        // TAILLE PROPORTIONNELLE AU RAYON : sans cela les lointaines deviennent des miettes
        // et les proches des monstres. La variation restante (×0,7 à ×1,5) fait le relief.
        const ISLET_CAM_Y = 8.7;   // hauteur caméra du preset FACE (version-bootstrap.js)
        const isleCount = kaykit3D.qualityMode === "performance" ? 13 : 26;
        for (let i = 0; i < isleCount; i++) {
          // Secteurs réguliers + gigue : un semis libre laisse de grands vides, or la
          // caméra tourne et doit trouver de la matière dans toutes les directions.
          const azimuth = (i / isleCount) * Math.PI * 2 + (seeded(i, 61) - .5) * .40;
          // RAYON MINIMAL 28, ET CE N'EST PAS UN CHOIX ESTHÉTIQUE. La caméra orbite à
          // 13,8 du centre (jusqu'à 25 au zoom arrière) : une île posée à 13 se retrouve
          // littéralement à côté de l'objectif et remplit la moitié de l'écran. Elle doit
          // rester franchement au-delà de l'orbite pour lire comme un fond.
          const radius = 28 + seeded(i, 62) * 7;
          const x = Math.cos(azimuth) * radius;
          const z = Math.sin(azimuth) * radius;
          // ALTITUDE PRISE DANS UNE FENÊTRE, pas tirée librement. Deux bornes opposées :
          //   · assez BAS pour entrer dans le cadre FACE, qui commence à 20,7° sous
          //     l'horizontale — d'où y <= hauteurCaméra - rayon × tan(22,5°) ;
          //   · assez HAUT pour rester au-dessus de la mer de nuages (seaHigh = -11,5),
          //     sous laquelle l'île serait purement masquée — d'où y >= -10,5.
          // Ces deux bornes se referment l'une sur l'autre : au-delà du rayon ~47 la
          // fenêtre est vide, ce qui borne l'archipel bien plus que le goût.
          // Angle vise entre 24 et 29 deg : a 22,5 les iles se collaient au bord
          // superieur du cadre et se lisaient comme un bandeau. Plus bas serait mieux
          // encore, mais au-dela de 30 deg elles passent sous la mer de nuages — c est
          // cette collision qui borne aussi le rayon a 35.
          // Fenêtre rouverte à 24-42° maintenant que la mer est à -18 : les îles
          // descendent au milieu du cadre au lieu de s'aligner sur son bord supérieur.
          // Le plancher -17 les garde juste au-dessus de la nappe haute.
          const angle = THREE.MathUtils.degToRad(24 + seeded(i, 63) * 18);
          const y = Math.max(-17, ISLET_CAM_Y - radius * Math.tan(angle));
          const width = radius * .11 * (.7 + seeded(i, 64) * .8);
          if (!kaykitSkyPlacementAllowed(x, y, z, width * .8)) continue;
          // Brume croissante avec la distance. Relevée (0,45 mini) : à 0,22 le vert des
          // prairies KayKit restait saturé et les îles se lisaient comme des blocs posés
          // devant la scène au lieu de s'enfoncer dans le lointain.
          const haze = THREE.MathUtils.mapLinear(radius, 28, 35, .64, .88);
          const isle = makeKayKitFloatingIsle(i, width, haze);
          if (!isle) continue;
          isle.position.set(x, y, z);
          sky.add(isle);
        }

        // SEMIS DE PETITES ÎLES — leur rôle est la PROFONDEUR, pas le décor. Plus loin,
        // plus bas et nettement plus petites que l'anneau principal : c'est l'échelonnement
        // des TAILLES qui fait lire la distance, bien plus que la brume seule.
        //
        // Elles descendent sous la nappe haute (-18), qui est semi-transparente : on les
        // devine au travers, ce qui donne la sensation d'un gouffre habité plutôt que d'un
        // fond vide. Rayon tiré en racine carrée, donc uniforme en aire.
        const petitesCount = kaykit3D.qualityMode === "performance" ? 12 : 24;
        for (let i = 0; i < petitesCount; i++) {
          const azimuth = (i / petitesCount) * Math.PI * 2 + (seeded(i, 91) - .5) * .55;
          const radius = 26 + Math.sqrt(seeded(i, 92)) * 46;
          const x = Math.cos(azimuth) * radius;
          const z = Math.sin(azimuth) * radius;
          const y = -7 - seeded(i, 93) * 30;
          const width = radius * .045 * (.6 + seeded(i, 94) * .9);
          if (!kaykitSkyPlacementAllowed(x, y, z, width * .8)) continue;
          const petite = makeKayKitFloatingIsle(300 + i, width,
            THREE.MathUtils.mapLinear(radius, 26, 72, .58, .9));
          if (!petite) continue;
          petite.position.set(x, y, z);
          sky.add(petite);
        }

        // Îles SOUS l'archipel, aperçues par les interstices. Autorisées à l'intérieur du
        // rayon de sécurité parce qu'elles passent par l'autre branche de
        // kaykitSkyPlacementAllowed : entièrement sous `safeFloor`. La caméra restant
        // toujours au-dessus du plateau, un rayon œil → case ne descend jamais à ces
        // altitudes. C'est le repère de profondeur le plus efficace pour « on joue dans le
        // ciel » : on voit qu'il y a un dessous, et qu'il est vide.
        [
          // Abaissées avec la mer : à -14/-16 elles se retrouveraient maintenant
          // AU-DESSUS de la nappe haute, alors que leur rôle est d'être aperçues
          // au travers des interstices, bien plus bas que le plateau.
          { azimuth: 1.15, radius: 5.5, y: -21.5, width: 2.6 },
          { azimuth: 4.02, radius: 7.5, y: -24.5, width: 3.2 }
        ].forEach((spec, index) => {
          const x = Math.cos(spec.azimuth) * spec.radius;
          const z = Math.sin(spec.azimuth) * spec.radius;
          if (!kaykitSkyPlacementAllowed(x, spec.y, z, spec.width * .8)) return;
          const isle = makeKayKitFloatingIsle(90 + index, spec.width, .58);
          if (!isle) return;
          isle.position.set(x, spec.y, z);
          sky.add(isle);
        });
        // INDISPENSABLE : sans cette valeur de retour, l appelant stockait `undefined`,
        // le drapeau restait faux et l archipel se reconstruisait A CHAQUE IMAGE —
        // 26 iles ajoutees par frame, jusqu au gel du moteur.
        return true;
      }

      function buildKayKitBoardClouds(parent) {
        if (!kaykit3D) return;
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 71.31 + salt * 19.71) * 43758.5453;
          return x - Math.floor(x);
        };
        const group = new THREE.Group();
        group.name = "ilyos-board-clouds";
        const economy = kaykit3D.qualityMode === "performance";

        const addCloud = (spec, index) => {
          const x = Math.cos(spec.azimuth) * spec.radius;
          const z = Math.sin(spec.azimuth) * spec.radius;
          const cloud = cloneKayKitAsset(spec.key, { maxWidth: spec.scale, maxHeight: spec.scale * .6, targetFloor: 0 });
          if (!cloud) return;
          cloud.position.set(x, spec.y, z);
          cloud.rotation.y = seeded(index, 1) * Math.PI * 2;
          cloud.traverse(child => {
            if (!child.isMesh) return;
            child.castShadow = false; child.receiveShadow = false;
            child.material = kaykitBacklitCloudMaterial(child.material);
          });
          group.add(cloud);
          kaykit3D.skyLayers.push({
            object: cloud, base: cloud.position.clone(),
            // Même mécanisme de dérive que buildKayKitSkyEnvironment (voir la
            // boucle d'animation dans animateKayKit3D) : aucun code d'animation
            // supplémentaire nécessaire.
            drift: {
              x: 1.1 + seeded(index, 2) * 1.0, z: .9 + seeded(index, 3) * .8,
              sx: .006 + seeded(index, 4) * .004, sz: .005 + seeded(index, 5) * .003
            }
          });
        };

        // BAS — mer de nuages proche, sous le plateau (sécurité : voir
        // docstring). Desktop 4, mobile 3 — grandes masses, pas une nuée.
        const lowSpecs = [
          // AZIMUTS RAMENÉS SUR LES CÔTÉS. La caméra FACE est en +Z et regarde vers -Z :
          // +X est donc à droite de l'écran, -X à gauche. Les azimuts proches de 0 et de π
          // encadrent le plateau, ceux proches de π/2 et 3π/2 se placent devant ou derrière
          // lui. Les valeurs d'origine (.6, 2.4, 4.1, 5.3) tombaient dans la seconde
          // catégorie et empilaient les nuages dans l'axe du regard.
          // Rayon porte de ~3,5 a ~9 et altitude remontee a hauteur de plateau. Ne
          // corriger que l azimut ne suffisait pas : a un rayon de 3 ces nuages restaient
          // DANS l emprise du plateau (demi-portee 5,1), et seule leur altitude negative
          // les empechait de le couvrir — ils se lisaient donc comme posés dessous.
          // A un rayon de 9 ils sont franchement a l exterieur, donc libres de remonter
          // au niveau du jeu et d encadrer le plateau par la gauche et par la droite.
          { key: "cloudBig", azimuth: .20, radius: 8.8, y: -.3, scale: 2.6 },
          { key: "cloudSmall", azimuth: 6.06, radius: 9.6, y: .6, scale: 2.1 },
          { key: "cloudBig", azimuth: Math.PI - .22, radius: 9.0, y: -.1, scale: 2.5 },
          { key: "cloudSmall", azimuth: Math.PI + .18, radius: 9.8, y: .8, scale: 2.2 }
        ];
        (economy ? lowSpecs.slice(0, 3) : lowSpecs).forEach((spec, index) => addCloud(spec, index));

        // LOINTAIN — hors du rayon de sécurité, calé pour dépasser dans le
        // cadrage "front" (azimuth 3.93/5.5 : même arc que les îlots proches
        // ci-dessous, vérifié par projection caméra). Desktop 3, mobile 2.
        const farSpecs = [
          { key: "cloudSmall", azimuth: .42, radius: 12.5, y: 1.8, scale: 1.4 },
          { key: "cloudBig", azimuth: Math.PI - .38, radius: 14, y: 2.4, scale: 2.0 },
          { key: "cloudBig", azimuth: Math.PI + .44, radius: 9.6, y: .6, scale: 1.6 }
        ];
        (economy ? farSpecs.slice(0, 2) : farSpecs).forEach((spec, index) => addCloud(spec, index + 10));

        // Ombres de nuages : décalques doux au ras du plateau (alpha faible,
        // même texture que les amas du ciel), pas de vrais objets shadow-caster
        // — assombrissent légèrement le terrain sous leur passage sans toucher
        // au shadow-mapping (coût quasi nul, y compris sur mobile).
        const shadowTexture = kaykitCloudTexture();
        [
          { x: -2.5, z: 1.5, scale: 9, opacity: .15 },
          { x: 3, z: -2, scale: 7, opacity: .11 }
        ].forEach((spec, index) => {
          const decal = new THREE.Mesh(
            kaykitGeometry("cloud-shadow-decal-v1", () => new THREE.PlaneGeometry(1, .625)),
            new THREE.MeshBasicMaterial({
              map: shadowTexture, color: 0x27384a, transparent: true, opacity: spec.opacity,
              depthWrite: false, fog: false, toneMapped: false
            })
          );
          decal.rotation.x = -Math.PI / 2;
          decal.scale.set(spec.scale, spec.scale, 1);
          decal.position.set(spec.x, KAYKIT_LEVELS.islandTop + .03, spec.z);
          decal.renderOrder = 6;
          group.add(decal);
          kaykit3D.skyLayers.push({
            object: decal, base: decal.position.clone(),
            drift: { x: 3.2 + index, z: 2.4 + index * .6, sx: .004 + index * .001, sz: .003 + index * .001 }
          });
        });

        parent.add(group);
        kaykit3D.boardCloudsGroup = group;
      }

      function buildKayKitStaticScene() {
        if (!kaykit3D) return;
        const { staticGroup, hitGroup, hitMeshes, fxGroup } = kaykit3D;

        buildKayKitSkyEnvironment(staticGroup);

        // Plus de socle plein, de dalles opaques ni d'ombre de plateau : seule
        // la grille filaire reste, suspendue dans le ciel — îles et gardiens
        // au-dessus du vide plutôt que sur un plancher. Le disque d'ombre
        // (board-shadow-v55) a été retiré : à bords francs, il se voyait comme
        // une tache circulaire flottante une fois le plancher disparu, au lieu
        // de lire comme une simple ombre portée.
        //
        // Chaque ligne est découpée case par case et porte une alpha par sommet
        // qui s'éteint radialement. Sans ce découpage, l'interpolation ne se
        // ferait qu'entre les deux extrémités d'une ligne complète et fondrait
        // tout le tracé. Objectif : la grille reste franche là où l'on joue,
        // mais son périmètre carré disparaît — c'était lui qui recréait
        // visuellement « un immense sol bleu invisible » sous l'archipel.
        const half = kaykitBoardSpan() / 2;
        // Vue de FACE, une grille plane qui garde de la matière jusqu'à son bord franc
        // se lit en perspective comme un SOL qui fuit vers un horizon — contraire au
        // ciel. Mais l'éteindre trop tôt rend les cases de bordure inutilisables pour
        // poser une île. Le compromis retenu : c'est le CARRÉ qu'il faut casser, pas la
        // grille. La décroissance est donc radiale et le plancher assez haut pour que
        // les bords de la grille restent lisibles — ce sont les coins, qui dessinent la
        // silhouette rectangulaire, qui s'effacent le plus.
        const gridFade = (x, z) => {
          const t = Math.hypot(x, z) / half;
          const k = THREE.MathUtils.clamp((t - .58) / (1.20 - .58), 0, 1);
          return .14 + .86 * (1 - k * k * (3 - 2 * k));
        };
        const gridPoints = [];
        const gridAlphas = [];
        const majorGridPoints = [];
        const majorGridAlphas = [];
        for (let i = 0; i <= GRID; i++) {
          const d = (i - GRID / 2) * KAYKIT_CELL_SPACING;
          const major = (i === 0 || i === GRID || i === Math.floor(GRID / 2) || i === Math.ceil(GRID / 2));
          const points = major ? majorGridPoints : gridPoints;
          const alphas = major ? majorGridAlphas : gridAlphas;
          for (let s = 0; s < GRID; s++) {
            const a = (s - GRID / 2) * KAYKIT_CELL_SPACING;
            const b = (s + 1 - GRID / 2) * KAYKIT_CELL_SPACING;
            points.push(new THREE.Vector3(d, .061, a), new THREE.Vector3(d, .061, b));
            alphas.push(1, 1, 1, gridFade(d, a), 1, 1, 1, gridFade(d, b));
            points.push(new THREE.Vector3(a, .061, d), new THREE.Vector3(b, .061, d));
            alphas.push(1, 1, 1, gridFade(a, d), 1, 1, 1, gridFade(b, d));
          }
        }
        // Sans plancher, la grille est le seul repère pour viser une case : le
        // bleu sur bleu d'origine (pensé pour contraster avec des dalles claires,
        // pas avec le ciel) devenait trop discret. Blanc quasi opaque + liseré
        // doré sur les lignes majeures (cohérent avec le reste de la DA) pour
        // rester lisible même en mouvement de caméra.
        const buildFadedGrid = (points, alphas, color, opacity) => {
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(alphas, 4));
          return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
            color, transparent: true, opacity, vertexColors: true, depthWrite: false, depthTest: true
          }));
        };
        // Passe "environnement céleste léger" (visual-island-relief-v2, v3) :
        // grille beaucoup plus translucide (0.74/0.86 → 0.20/0.24) pour lire
        // comme une trame magique suspendue plutôt qu'un sol plein — le ciel
        // et les nuages doivent transparaître au travers. gridFade() garde son
        // dégradé radial existant, juste appliqué à une base plus basse.
        const grid = buildFadedGrid(gridPoints, gridAlphas, 0xf3fbff, .20);
        const majorGrid = buildFadedGrid(majorGridPoints, majorGridAlphas, 0xe9c877, .24);
        grid.renderOrder = 2; majorGrid.renderOrder = 3;
        staticGroup.add(grid, majorGrid);

        // Fond de grille très ténu : un simple aplat sous les lignes, pour que
        // les cases vides se lisent comme une trame de lumière posée dans le
        // ciel plutôt que comme des trous — jamais un sol, juste assez pour
        // ancrer visuellement la grille. Un seul plan, une seule couleur.
        const gridFill = new THREE.Mesh(
          // La taille entre dans la clé : sans elle, le plan mis en cache pour
          // le 11×11 serait resservi tel quel sur un plateau 13×13.
          kaykitGeometry(`grid-fill-plane-v2-${GRID}`, () => new THREE.PlaneGeometry(kaykitBoardSpan(), kaykitBoardSpan())),
          new THREE.MeshBasicMaterial({
            color: 0xdcefff, transparent: true, opacity: .06, depthWrite: false, fog: true, toneMapped: false
          })
        );
        gridFill.rotation.x = -Math.PI / 2;
        gridFill.position.y = .04;
        gridFill.renderOrder = 1;
        staticGroup.add(gridFill);

        const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const p = kaykitCellPosition(r, c, .82);
            const hit = new THREE.Mesh(kaykitGeometry("hit-cell-v55", () => new THREE.PlaneGeometry(KAYKIT_CELL_SPACING, KAYKIT_CELL_SPACING)), hitMat);
            hit.rotation.x = -Math.PI / 2;
            hit.position.set(p.x, p.y, p.z);
            hit.userData.r = r; hit.userData.c = c;
            hitGroup.add(hit); hitMeshes.push(hit);
          }
        }

        const actionPreviewGroup = new THREE.Group();
        actionPreviewGroup.name = "ilyos-action-preview";
        fxGroup.add(actionPreviewGroup);
        kaykit3D.actionPreviewGroup = actionPreviewGroup;

        const hover = new THREE.Group();
        // Réticule rond plutôt que carré : plus lisible sur une case comme sur un
        // gardien, et l'anneau a une vraie épaisseur (Torus) au lieu d'un LineLoop 1px.
        const hoverHalf = KAYKIT_CELL_SPACING * .38;
        const hoverFill = new THREE.Mesh(
          kaykitGeometry("hover-fill-v57", () => new THREE.CircleGeometry(hoverHalf * .92, 28)),
          new THREE.MeshBasicMaterial({ color: 0x00d9ff, transparent: true, opacity: .10, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
        );
        hoverFill.rotation.x = -Math.PI / 2; hoverFill.position.y = .018; hoverFill.renderOrder = 90; hoverFill.userData.hoverRole = "fill"; hover.add(hoverFill);
        const hoverOutline = new THREE.Mesh(
          kaykitGeometry("hover-marker-ring-v57", () => new THREE.TorusGeometry(hoverHalf, .026, 8, 40)),
          new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: .96, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
        );
        hoverOutline.rotation.x = -Math.PI / 2; hoverOutline.position.y = .026; hoverOutline.renderOrder = 92; hoverOutline.userData.hoverRole = "outline"; hover.add(hoverOutline);
        const hoverDot = new THREE.Mesh(kaykitGeometry("hover-dot-v18", () => new THREE.RingGeometry(.075, .145, 20)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, depthTest: true }));
        hoverDot.rotation.x = -Math.PI / 2; hoverDot.position.y = .012; hoverDot.userData.hoverRole = "dot"; hover.add(hoverDot);
        // Fond sombre discret sous le glyphe : préserve la lisibilité du symbole blanc
        // aussi bien sur herbe claire que sur terrain sombre, sans l'agrandir.
        const glyphBacking = new THREE.Mesh(
          kaykitGeometry("hover-glyph-backing-v1", () => new THREE.CircleGeometry(.30, 28)),
          new THREE.MeshBasicMaterial({ color: 0x081018, transparent: true, opacity: .46, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
        );
        glyphBacking.rotation.x = -Math.PI / 2;
        glyphBacking.position.y = .019;
        glyphBacking.renderOrder = 94;
        glyphBacking.userData.hoverRole = "glyphBacking";
        glyphBacking.visible = false;
        hover.add(glyphBacking);
        // Symbole central adapté à l’action ciblée : rendu en volumes fins (et non en
        // lignes 1px THREE.LineSegments, dont l'épaisseur WebGL n'est pas fiable) afin
        // de rester lisible à toute distance/inclinaison de caméra.
        const GLYPH_SCALE = 1.35;
        const glyphStrokeGeometry = kaykitGeometry("hover-glyph-stroke-v1", () => new THREE.BoxGeometry(1, .016, .05));
        const addHoverGlyph = (kind, segments, directional = false) => {
          const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, depthTest: false });
          // Le glyphe "move" doit pouvoir pivoter pour pointer vers la vraie
          // destination : ses traits vivent dans un sous-groupe dédié, tourné en
          // bloc, plutôt que directement sous `hover` comme les autres symboles
          // (fixes, ils n'ont pas de direction à indiquer).
          let parent = hover;
          if (directional) {
            parent = new THREE.Group();
            parent.userData.hoverRole = "glyphGroup";
            parent.userData.hoverKind = kind;
            hover.add(parent);
          }
          segments.forEach(([x1, z1, x2, z2]) => {
            const sx1 = x1 * GLYPH_SCALE, sz1 = z1 * GLYPH_SCALE, sx2 = x2 * GLYPH_SCALE, sz2 = z2 * GLYPH_SCALE;
            const dx = sx2 - sx1, dz = sz2 - sz1;
            const length = Math.hypot(dx, dz);
            if (length < 1e-4) return;
            const stroke = new THREE.Mesh(glyphStrokeGeometry, material);
            stroke.scale.set(length, 1, 1);
            stroke.position.set((sx1 + sx2) / 2, .021, (sz1 + sz2) / 2);
            stroke.rotation.y = -Math.atan2(dz, dx);
            stroke.renderOrder = 95;
            stroke.userData.hoverRole = "glyph";
            stroke.userData.hoverKind = kind;
            stroke.visible = false;
            parent.add(stroke);
          });
        };
        addHoverGlyph("move", [[0, -.18, 0, .18], [0, .18, -.10, .07], [0, .18, .10, .07]], true);
        addHoverGlyph("push", [[-.17, -.10, .03, -.10], [.03, -.10, -.05, -.17], [.03, -.10, -.05, -.03], [.02, .10, .20, .10], [.20, .10, .12, .03], [.20, .10, .12, .17]]);
        addHoverGlyph("magic", [[0, -.19, 0, .19], [-.19, 0, .19, 0], [-.13, -.13, .13, .13], [-.13, .13, .13, -.13]]);
        addHoverGlyph("place", [[-.14, 0, .14, 0], [0, -.14, 0, .14], [-.10, -.10, .10, .10], [-.10, .10, .10, -.10]]);
        addHoverGlyph("invocation", [[0, -.18, .16, .10], [.16, .10, -.16, .10], [-.16, .10, 0, -.18], [-.10, .02, .10, .02]]);
        addHoverGlyph("crown", [[-.18, .10, -.18, -.08], [-.18, -.08, -.08, .02], [-.08, .02, 0, -.10], [0, -.10, .08, .02], [.08, .02, .18, -.08], [.18, -.08, .18, .10], [-.18, .10, .18, .10]]);
        addHoverGlyph("character", [[-.12, .15, .12, .15], [-.12, .15, -.12, -.06], [.12, .15, .12, -.06], [-.12, -.06, 0, -.16], [.12, -.06, 0, -.16]]);
        addHoverGlyph("select", [[-.15, -.15, .15, -.15], [.15, -.15, .15, .15], [.15, .15, -.15, .15], [-.15, .15, -.15, -.15]]);
        addHoverGlyph("invalid", [[-.14, -.14, .14, .14], [-.14, .14, .14, -.14]]);
        const tickMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          depthTest: false
        })
        const tickPoints = [];
        const t = .44, l = .16;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
          tickPoints.push(new THREE.Vector3(sx * t, .016, sz * t), new THREE.Vector3(sx * (t - l), .016, sz * t));
          tickPoints.push(new THREE.Vector3(sx * t, .016, sz * t), new THREE.Vector3(sx * t, .016, sz * (t - l)));
        });
        const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPoints), tickMat);
        ticks.userData.hoverRole = "ticks"; hover.add(ticks);
        const hoverLight = new THREE.PointLight(0x00e5ff, 0, 2.4, 2);
        hoverLight.position.y = .65;
        hoverLight.userData.hoverRole = "light";
        hover.add(hoverLight);
        hover.visible = false;
        fxGroup.add(hover);
        kaykit3D.hoverMarker = hover;

        // Toute l'atmosphère vit dans buildKayKitSkyEnvironment, hors du volume
        // de sécurité : rien de décoratif n'est ajouté autour du plateau ici.
      }

      function makeFallbackTile(ownerColor = null, isSanctuaryTile = false) {
        const group = new THREE.Group();
        const cliff = new THREE.Mesh(
          kaykitGeometry("tile-cliff", () => new THREE.CylinderGeometry(.49, .38, .42, 8, 1, false, Math.PI / 8)),
          kaykitMaterial(isSanctuaryTile ? 0xc3b3d9 : 0x8f7a59, { roughness: .98 })
        );
        cliff.position.y = -.09; cliff.castShadow = true; cliff.receiveShadow = true; group.add(cliff);
        const top = new THREE.Mesh(
          kaykitGeometry("tile-top", () => new THREE.CylinderGeometry(.5, .5, .16, 8, 1, false, Math.PI / 8)),
          kaykitMaterial(isSanctuaryTile ? 0x9b83ca : 0x73b94f, { roughness: .92 })
        );
        top.position.y = .18; top.castShadow = true; top.receiveShadow = true; group.add(top);
        if (ownerColor) {
          const trim = new THREE.Mesh(
            kaykitGeometry("tile-trim", () => new THREE.TorusGeometry(.38, .035, 6, 8)),
            kaykitMaterial(ownerColor, { roughness: .6, emissive: ownerColor, emissiveIntensity: .06 })
          );
          trim.rotation.x = Math.PI / 2; trim.position.y = .285; group.add(trim);
        }
        return group;
      }

      function makeFallbackTree(seed = 0) {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(kaykitGeometry("tree-trunk", () => new THREE.CylinderGeometry(.075, .11, .44, 6)), kaykitMaterial(0x8c613e, { roughness: 1 }));
        trunk.position.y = .22; trunk.castShadow = true; group.add(trunk);
        const foliageColor = seed > .5 ? 0x4d9a43 : 0x63ad49;
        const crown = new THREE.Mesh(kaykitGeometry("tree-crown", () => new THREE.IcosahedronGeometry(.34, 1)), kaykitMaterial(foliageColor, { roughness: 1 }));
        crown.scale.set(1, .9, 1); crown.position.y = .59; crown.castShadow = true; group.add(crown);
        return group;
      }

      function makeFallbackCastle(color) {
        const group = new THREE.Group();
        const accent = new THREE.Color(color || 0xffffff);
        const warmStone = accent.clone().lerp(new THREE.Color(0xf2e7d1), .34);
        const deepAccent = accent.clone().offsetHSL(0, .12, -.06);
        const stone = kaykitMaterial(warmStone.getHex(), { roughness: .72, emissive: accent.getHex(), emissiveIntensity: .06 });
        const wallTint = kaykitMaterial(accent.clone().lerp(new THREE.Color(0xf4ecd9), .18).getHex(), { roughness: .62, emissive: accent.getHex(), emissiveIntensity: .14 });
        const roof = kaykitMaterial(deepAccent.getHex(), { roughness: .24, emissive: accent.getHex(), emissiveIntensity: .34 });
        const basePlate = new THREE.Mesh(kaykitGeometry("castle-baseplate-v39", () => new THREE.CylinderGeometry(.56, .6, .10, 8)), kaykitMaterial(accent.getHex(), { roughness: .32, emissive: accent.getHex(), emissiveIntensity: .32 }));
        basePlate.position.y = .05; basePlate.castShadow = true; basePlate.receiveShadow = true; group.add(basePlate);
        const base = new THREE.Mesh(kaykitGeometry("castle-base-v39", () => new THREE.BoxGeometry(.62, .42, .62)), wallTint);
        base.position.y = .31; base.castShadow = true; base.receiveShadow = true; group.add(base);
        const band = new THREE.Mesh(kaykitGeometry("castle-band-v39", () => new THREE.BoxGeometry(.66, .08, .66)), kaykitMaterial(accent.getHex(), { roughness: .34, emissive: accent.getHex(), emissiveIntensity: .20 }));
        band.position.y = .20; group.add(band);
        [[-.24, .24], [.24, .24], [-.24, -.24], [.24, -.24]].forEach(([x, z], i) => {
          const tower = new THREE.Mesh(kaykitGeometry(`castle-tower-v39-${i}`, () => new THREE.CylinderGeometry(.12, .15, .58, 8)), i % 2 === 0 ? stone : wallTint);
          tower.position.set(x, .43, z); tower.castShadow = true; tower.receiveShadow = true; group.add(tower);
          const cap = new THREE.Mesh(kaykitGeometry(`castle-cap-v39-${i}`, () => new THREE.ConeGeometry(.18, .28, 8)), roof);
          cap.position.set(x, .86, z); cap.castShadow = true; group.add(cap);
        });
        const keep = new THREE.Mesh(kaykitGeometry("castle-keep-v39", () => new THREE.CylinderGeometry(.14, .16, .44, 8)), stone);
        keep.position.set(0, .53, 0); keep.castShadow = true; group.add(keep);
        const keepCap = new THREE.Mesh(kaykitGeometry("castle-keep-cap-v39", () => new THREE.ConeGeometry(.20, .24, 8)), roof);
        keepCap.position.set(0, .88, 0); keepCap.castShadow = true; group.add(keepCap);
        const flagPole = new THREE.Mesh(kaykitGeometry("flag-pole-v39", () => new THREE.CylinderGeometry(.018, .018, .55, 6)), kaykitMaterial(0x765134, { roughness: .8 }));
        flagPole.position.set(0, .98, 0); group.add(flagPole);
        const flag = new THREE.Mesh(kaykitGeometry("flag-v39", () => new THREE.PlaneGeometry(.30, .20)), new THREE.MeshStandardMaterial({ color: accent.getHex(), roughness: .30, emissive: accent.getHex(), emissiveIntensity: .28, side: THREE.DoubleSide }));
        flag.position.set(.17, 1.10, 0); flag.rotation.y = Math.PI / 2; group.add(flag);
        return group;
      }

      function styleKnightMetalArmor(hero) {
        if (!hero) return hero;
        const metalGrey = new THREE.Color(0x9aa3ad);
        const darkMetal = new THREE.Color(0x5d6670);
        hero.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const source = Array.isArray(child.material) ? child.material : [child.material];
          const styled = source.map(material => {
            const mat = material.clone();
            const label = `${child.name || ''} ${mat.name || ''}`.toLowerCase();
            const preserve = /skin|face|eye|hair|mouth|teeth/.test(label);
            if (!preserve) {
              if (mat.color) {
                mat.color.copy(/boot|leather|belt|strap|wood/.test(label) ? darkMetal : metalGrey);
              }
              if ('metalness' in mat) mat.metalness = .78;
              if ('roughness' in mat) mat.roughness = .26;
              if ('emissive' in mat) {
                mat.emissive = new THREE.Color(0x182028);
                mat.emissiveIntensity = .045;
              }
            }
            mat.needsUpdate = true;
            return mat;
          });
          child.material = Array.isArray(child.material) ? styled : styled[0];
        });
        return hero;
      }

      function styleMagePalette(hero) {
        if (!hero) return hero;
        const robeMain = new THREE.Color(0x6c45d8);
        const robeShadow = new THREE.Color(0x2a1b67);
        const arcaneTrim = new THREE.Color(0x3fd7d4);
        hero.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const source = Array.isArray(child.material) ? child.material : [child.material];
          const styled = source.map(material => {
            const mat = material.clone();
            const label = `${child.name || ''} ${mat.name || ''}`.toLowerCase();
            const preserve = /skin|face|eye|hair|mouth|teeth|wood|staff|book|paper/.test(label);
            if (!preserve) {
              const useTrim = /hat|hood|cape|robe|cloth|body|torso|dress|sleeve/.test(label);
              // Les gemmes/orbes méritent un rendu à part de la robe : plus
              // lisses et plus réfléchissantes qu'un tissu, plutôt qu'une simple
              // variante de la même étoffe. Sans map d'environnement dans la
              // scène, on compte sur les lumières directionnelles existantes
              // (sun/fill/front) pour faire vivre ce reflet — d'où un metalness
              // modéré plutôt qu'extrême, qui resterait noir sans reflet à capter.
              const isGem = /trim|gem|orb|magic|crystal/.test(label);
              if (mat.color) {
                mat.color.copy(useTrim ? robeMain : robeShadow);
                if (isGem) mat.color.copy(arcaneTrim);
              }
              if ('metalness' in mat) mat.metalness = isGem ? .42 : (useTrim ? .16 : .08);
              if ('roughness' in mat) mat.roughness = isGem ? .16 : (useTrim ? .40 : .58);
              if ('emissive' in mat) {
                mat.emissive = (useTrim ? arcaneTrim : robeShadow).clone();
                mat.emissiveIntensity = isGem ? .18 : (useTrim ? .09 : .05);
              }
            }
            mat.needsUpdate = true;
            return mat;
          });
          child.material = Array.isArray(child.material) ? styled : styled[0];
        });
        return hero;
      }

      /* La texture "hexagons_medieval" des bâtiments n'est pas une photo mais un
         atlas de nuanciers : chaque colonne est un dégradé vertical plat (pierre
         grise, bois brun, un bleu, un rouge...) et le modèle GLTF choisit sa
         couleur de toit/fanion simplement en pointant ses UV sur la colonne
         voulue. On garde tout le rendu/texture KayKit d'origine tel quel (pierre,
         bois, fenêtres, reflets) et on ne touche QUE les pixels de la colonne
         "équipe" du modèle (bleu ou rouge, saturés) pour les faire glisser vers
         la teinte de faction — le minimum nécessaire pour la couleur d'équipe. */
      function recolorKayKitBuildingTexture(sourceMap, accentColor) {
        if (!sourceMap?.image?.width) return sourceMap;
        const accent = new THREE.Color(accentColor);
        const cacheKey = `village-atlas:${sourceMap.uuid}:${accent.getHexString()}`;
        if (kaykit3D.materials.has(cacheKey)) return kaykit3D.materials.get(cacheKey);
        const accentHsl = { h: 0, s: 0, l: 0 };
        accent.getHSL(accentHsl);
        const img = sourceMap.image;
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        const tmp = new THREE.Color();
        const hsl = { h: 0, s: 0, l: 0 };
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] === 0) continue;
          tmp.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
          tmp.getHSL(hsl);
          const hueDeg = hsl.h * 360;
          // Les 4 châteaux KayKit sources (castle0..3) ne sont pas tous
          // bleus/rouges : ce sont des modèles bleu/rouge/VERT/JAUNE distincts
          // (building_castle_{blue,red,green,yellow}.gltf). Ne détecter que
          // les bandes bleue/rouge laissait les châteaux vert et jaune
          // intacts — jamais reteintés vers la couleur réelle du joueur (ex:
          // un joueur lavande héritant du modèle jaune restait jaune).
          const isBlueBand = hsl.s > .25 && hueDeg >= 190 && hueDeg <= 260;
          const isRedBand = hsl.s > .30 && (hueDeg >= 335 || hueDeg <= 15);
          const isGreenBand = hsl.s > .25 && hueDeg >= 80 && hueDeg <= 165;
          const isYellowBand = hsl.s > .35 && hueDeg >= 35 && hueDeg <= 70;
          if (isBlueBand || isRedBand || isGreenBand || isYellowBand) {
            tmp.setHSL(accentHsl.h, Math.max(hsl.s, accentHsl.s * .85), hsl.l);
            px[i] = tmp.r * 255; px[i + 1] = tmp.g * 255; px[i + 2] = tmp.b * 255;
          }
        }
        ctx.putImageData(data, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = sourceMap.wrapS;
        texture.wrapT = sourceMap.wrapT;
        // Sans repasser par configureKayKitTexture() (encodage sRGB, mipmaps,
        // anisotropie), la nouvelle texture canvas rendait plate et délavée par
        // rapport au modèle KayKit d'origine — c'était la vraie cause du rendu
        // terne, pas la recoloration elle-même.
        configureKayKitTexture(texture);
        kaykit3D.materials.set(cacheKey, texture);
        return texture;
      }

      function accentVillageColors(object, color) {
        if (!object) return object;
        const accent = new THREE.Color(color || 0xffffff);
        object.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const source = Array.isArray(child.material) ? child.material : [child.material];
          const styled = source.map(material => {
            const mat = material.clone();
            if (mat.map) mat.map = recolorKayKitBuildingTexture(mat.map, accent);
            if (mat.color) mat.color.set(0xffffff);
            mat.needsUpdate = true;
            return mat;
          });
          child.material = Array.isArray(child.material) ? styled : styled[0];
        });
        return object;
      }

      function addVillageVisibilityBoost(object, color) {
        if (!object) return object;
        // FUITE (corrigee) : appelee une fois par village a chaque sync (jusqu'a
        // 4 fois), les 4 geometries ci-dessous ne dependent jamais de `color`
        // (seuls les MATERIAUX en dependent) — elles etaient pourtant recreees
        // a chaque appel au lieu d'etre mises en cache comme le reste du fichier.
        const accentColor = new THREE.Color(color || 0xffffff);
        const accent = accentColor.getHex();
        const basePlate = new THREE.Mesh(
          kaykitGeometry("village-base-plate-v1", () => new THREE.CylinderGeometry(.62, .66, .075, 8)),
          new THREE.MeshStandardMaterial({
            color: accent,
            roughness: .42,
            metalness: .06,
            emissive: accent,
            emissiveIntensity: .38
          })
        );
        basePlate.position.y = .04;
        basePlate.castShadow = false;
        basePlate.receiveShadow = true;
        object.add(basePlate);

        const ring = new THREE.Mesh(
          kaykitGeometry("village-ring-v1", () => new THREE.TorusGeometry(.57, .065, 12, 32)),
          new THREE.MeshStandardMaterial({
            color: accent,
            roughness: .26,
            metalness: .16,
            emissive: accent,
            emissiveIntensity: .82,
            transparent: true,
            opacity: 1
          })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = .085;
        ring.castShadow = false;
        ring.receiveShadow = false;
        object.add(ring);

        const flagPole = new THREE.Mesh(
          kaykitGeometry("village-flagpole-v1", () => new THREE.CylinderGeometry(.018, .018, .52, 8)),
          new THREE.MeshStandardMaterial({ color: 0xf7f0e1, roughness: .52, metalness: .08 })
        );
        flagPole.position.set(.18, .96, 0);
        object.add(flagPole);

        const flag = new THREE.Mesh(
          kaykitGeometry("village-flag-v1", () => new THREE.BoxGeometry(.20, .11, .02)),
          new THREE.MeshStandardMaterial({
            color: accentColor.clone().offsetHSL(0, .18, .10).getHex(),
            roughness: .34,
            metalness: .02,
            emissive: accent,
            emissiveIntensity: .34
          })
        );
        flag.position.set(.29, 1.04, 0);
        object.add(flag);
        return object;
      }

      function makeFallbackHero(playerId = 0) {
        const color = new THREE.Color(PLAYER_COLORS[playerId] || "#67b8df").getHex();
        const group = new THREE.Group();
        const skin = kaykitMaterial(0xf0b890, { roughness: .9 });
        const cloth = playerId === 0
          ? kaykitMaterial(0x9aa3ad, { roughness: .28, metalness: .78 })
          : kaykitMaterial(0x6c45d8, { roughness: .54, metalness: .12, emissive: 0x3fd7d4, emissiveIntensity: .10 });
        const dark = playerId === 0
          ? kaykitMaterial(0x5d6670, { roughness: .34, metalness: .62 })
          : kaykitMaterial(0x2a1b67, { roughness: .76 });
        const legs = new THREE.Mesh(kaykitGeometry("hero-legs", () => new THREE.BoxGeometry(.28, .35, .22)), dark);
        legs.position.y = .23; legs.castShadow = true; group.add(legs);
        const torso = new THREE.Mesh(kaykitGeometry("hero-torso", () => new THREE.BoxGeometry(.42, .46, .28)), cloth);
        torso.position.y = .61; torso.castShadow = true; group.add(torso);
        const head = new THREE.Mesh(kaykitGeometry("hero-head", () => new THREE.IcosahedronGeometry(.2, 1)), skin);
        head.position.y = 1.02; head.castShadow = true; group.add(head);
        const hatGeom = playerId === 1 ? new THREE.ConeGeometry(.27, .42, 8) : new THREE.CylinderGeometry(.23, .27, .18, 8);
        const hat = new THREE.Mesh(hatGeom, kaykitMaterial(playerId === 1 ? 0x6c45d8 : color, { roughness: playerId === 1 ? .48 : .82, metalness: playerId === 1 ? .10 : 0, emissive: playerId === 1 ? 0x3fd7d4 : 0, emissiveIntensity: playerId === 1 ? .08 : 0 }));
        hat.position.y = 1.25; hat.castShadow = true; group.add(hat);
        const item = new THREE.Mesh(
          playerId === 1 ? kaykitGeometry("staff", () => new THREE.CylinderGeometry(.025, .025, .85, 6)) : kaykitGeometry("sword", () => new THREE.BoxGeometry(.06, .72, .08)),
          kaykitMaterial(playerId === 1 ? 0x8a633e : 0xcfd8dd, { metalness: playerId === 1 ? 0 : .4, roughness: .5 })
        );
        item.position.set(.32, .63, 0); item.rotation.z = playerId === 1 ? -.12 : -.38; item.castShadow = true; group.add(item);
        return group;
      }

      function makeCrown() {
        const group = new THREE.Group();
        // Or plus poli (métalness élevée, faible rugosité), bonnet de velours visible
        // sous la bande, gemmes alternées rubis/saphir : lecture "objet précieux"
        // immédiate au lieu de la couronne plate d'origine. Bande à deux niveaux,
        // pointes de hauteurs alternées terminées par des perles, joyau central
        // plus gros et plus facetté, avec sa propre lueur : silhouette de
        // couronne royale plutôt qu'une simple étoile dorée.
        const gold = kaykitMaterial(0xffcf3f, { roughness: .16, metalness: .9, emissive: 0x6b3f00, emissiveIntensity: .16 });
        const goldTrim = kaykitMaterial(0xffe27a, { roughness: .10, metalness: .95, emissive: 0x8a5a00, emissiveIntensity: .22 });
        const velvet = kaykitMaterial(0x7a1230, { roughness: .92, metalness: 0 });
        const ruby = kaykitMaterial(0xff2f4d, { roughness: .12, metalness: .3, emissive: 0xb0002a, emissiveIntensity: .55 });
        const sapphire = kaykitMaterial(0x3fa0ff, { roughness: .14, metalness: .28, emissive: 0x1257c9, emissiveIntensity: .5 });

        const cap = new THREE.Mesh(kaykitGeometry("crown-cap-v1", () => new THREE.CylinderGeometry(.185, .20, .10, 14)), velvet);
        cap.position.y = .05; cap.castShadow = true; group.add(cap);

        const band = new THREE.Mesh(kaykitGeometry("crown-band-v2", () => new THREE.CylinderGeometry(.205, .205, .12, 16)), gold);
        band.position.y = .105; band.castShadow = true; group.add(band);

        // Filet plus fin et plus clair sur le bord supérieur de la bande :
        // profondeur sculptée au lieu d'un cylindre unique tout plat.
        const bandTrim = new THREE.Mesh(kaykitGeometry("crown-band-trim-v1", () => new THREE.TorusGeometry(.207, .016, 8, 20)), goldTrim);
        bandTrim.rotation.x = Math.PI / 2; bandTrim.position.y = .165; bandTrim.castShadow = true; group.add(bandTrim);

        const spikeCount = 8;
        const tallSpikeGeometry = kaykitGeometry("crown-spike-tall-v3", () => new THREE.ConeGeometry(.052, .40, 8));
        const shortSpikeGeometry = kaykitGeometry("crown-spike-short-v3", () => new THREE.ConeGeometry(.048, .28, 8));
        const pearlGeometry = kaykitGeometry("crown-spike-pearl-v1", () => new THREE.SphereGeometry(.030, 10, 8));
        for (let i = 0; i < spikeCount; i++) {
          const a = i / spikeCount * Math.PI * 2;
          const tall = i % 2 === 0;
          const spikeGeometry = tall ? tallSpikeGeometry : shortSpikeGeometry;
          const spikeHeight = tall ? .40 : .28;
          const spike = new THREE.Mesh(spikeGeometry, gold);
          spike.position.set(Math.cos(a) * .165, .165 + spikeHeight / 2, Math.sin(a) * .165);
          spike.castShadow = true;
          group.add(spike);

          const pearl = new THREE.Mesh(pearlGeometry, goldTrim);
          pearl.position.set(Math.cos(a) * .165, .165 + spikeHeight, Math.sin(a) * .165);
          pearl.castShadow = true;
          group.add(pearl);

          if (i % 2 === 0) {
            const gem = new THREE.Mesh(kaykitGeometry("crown-band-gem-v1", () => new THREE.OctahedronGeometry(.034)), i % 4 === 0 ? ruby : sapphire);
            gem.position.set(Math.cos(a) * .205, .105, Math.sin(a) * .205);
            group.add(gem);
          }
        }

        const jewel = new THREE.Mesh(kaykitGeometry("crown-jewel-v3", () => new THREE.IcosahedronGeometry(.095, 0)), ruby);
        jewel.position.y = .47; jewel.scale.y = 1.25; jewel.castShadow = true; group.add(jewel);
        const jewelLight = new THREE.PointLight(0xff4d6a, .55, 1.1, 2);
        jewelLight.position.y = .47; group.add(jewelLight);

        const halo = new THREE.Mesh(
          kaykitGeometry("crown-gold-halo-v29", () => new THREE.TorusGeometry(.26, .022, 8, 24)),
          new THREE.MeshBasicMaterial({ color: 0xffd96a, transparent: true, opacity: .46, depthWrite: false })
        );
        halo.rotation.x = Math.PI / 2; halo.position.y = .07; halo.renderOrder = 28; group.add(halo);
        const hitProxy = new THREE.Mesh(
          kaykitGeometry("crown-hit-proxy-v21", () => new THREE.SphereGeometry(.22, 12, 8)),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: .001, depthWrite: false })
        );
        hitProxy.position.y = .22;
        group.add(hitProxy);
        group.userData.isCrown = true;
        return group;
      }

      function makeSanctuary() {
        const group = new THREE.Group();
        const base = new THREE.Mesh(kaykitGeometry("sanctuary-base", () => new THREE.CylinderGeometry(.47, .53, .22, 8)), kaykitMaterial(0xcdb866, { roughness: .74, metalness: .05 }));
        base.position.y = .13; base.castShadow = true; base.receiveShadow = true; group.add(base);
        const rune = new THREE.Mesh(kaykitGeometry("sanctuary-rune", () => new THREE.RingGeometry(.18, .29, 8)), new THREE.MeshBasicMaterial({ color: 0x75e5ff, transparent: true, opacity: .9, side: THREE.DoubleSide }));
        rune.rotation.x = -Math.PI / 2; rune.position.y = .255; group.add(rune);
        const crystal = new THREE.Mesh(kaykitGeometry("sanctuary-crystal", () => new THREE.OctahedronGeometry(.18)), kaykitMaterial(0x7ddfff, { roughness: .22, metalness: .1, emissive: 0x1e8fc3, emissiveIntensity: .55 }));
        crystal.position.y = .53; crystal.castShadow = true; group.add(crystal);
        crystal.userData.floatCrystal = true;
        return group;
      }

      /* Demande un asset qui n'a pas été lancé au démarrage.
         Idempotent : loadKayKitAsset() mémoïse par kaykit3D.assetPromises, donc
         les appels répétés — un par gardien, un par fantôme de pose — ne
         déclenchent qu'un seul téléchargement.

         À l'arrivée du GLB, loadKayKitAsset() appelle scheduleKayKitSync() : le
         gardien apparaît tout seul à la synchronisation suivante, sans qu'aucun
         appelant n'ait à attendre la promesse. C'est le même mécanisme qui
         permet déjà à createCharacterVisual() de ne rien poser tant que le
         modèle n'est pas là. */
      function ensureKayKitAsset(assetKey) {
        if (!assetKey || !kaykit3D || kaykit3D.disposed) return;
        if (kaykit3D.assets.has(assetKey) || kaykit3D.failedAssets.has(assetKey)) return;
        if (kaykit3D.assetPromises.has(assetKey)) return;
        const spec = KAYKIT_ASSETS[assetKey];
        if (!spec) return;
        // Le total n'incluait pas les différés : il monte au moment où l'un
        // d'eux est réellement demandé, pour que l'état de chargement reste juste.
        kaykit3D.totalAssets++;
        updateKayKitLoadStatus();
        loadKayKitAsset(assetKey, spec);
      }

      function loadKayKitAsset(assetKey, spec) {
        if (!kaykit3D?.loader) return Promise.resolve(null);
        if (kaykit3D.assetPromises.has(assetKey)) return kaykit3D.assetPromises.get(assetKey);
        const candidates = Array.isArray(spec?.urls) ? spec.urls.slice() : [];
        const promise = new Promise(resolve => {
          const tryIndex = index => {
            const url = candidates[index];
            if (!url) {
              console.warn(`Asset KayKit non chargé (${assetKey}). Utilisation du modèle de secours.`);
              if (kaykit3D) {
                kaykit3D.failedAssets.add(assetKey);
                updateKayKitLoadStatus();
              }
              return resolve(null);
            }
            kaykit3D.loader.load(url, async gltf => {
              if (!kaykit3D || kaykit3D.disposed) return resolve(null);
              const scene = gltf.scene;
              await repairKayKitAssetMaterials(scene, assetKey, spec);
              kaykit3D.assets.set(assetKey, scene);
              const clips = gltf.animations || [];
              kaykit3D.assetAnimations.set(assetKey, clips);
              clips.forEach(clip => { if (clip?.name) kaykit3D.animationClipNames.add(clip.name); });
              kaykit3D.assetSources.set(assetKey, url.startsWith("http") ? "online" : "local");
              kaykit3D.loadedCount++;
              updateKayKitLoadStatus();
              scheduleKayKitSync();
              resolve(scene);
            }, undefined, error => {
              console.warn(`Échec chargement KayKit (${assetKey}) via ${url}`, error);
              tryIndex(index + 1);
            });
          };
          tryIndex(0);
        });
        kaykit3D.assetPromises.set(assetKey, promise);
        return promise;
      }

      function updateKayKitLoadStatus() {
        if (!kaykit3D) return;
        const done = kaykit3D.loadedCount + kaykit3D.failedAssets.size;
        const packCount = kaykit3D.packReady.size;
        const clipCount = kaykit3D.animationClipNames.size;
        const failedTextureCount = kaykit3D.failedTextureAssets?.size || 0;
        const textureState = failedTextureCount
          ? `textures absentes ${failedTextureCount} (damier magenta)`
          : `textures validées${kaykit3D.repairedMaterials ? ` · atlas associés ${kaykit3D.repairedMaterials}` : ""}`;
        if (done >= kaykit3D.totalAssets) {
          kaykit3D.status.textContent = `KayKit local prêt · ${done}/${kaykit3D.totalAssets} modèles · ${clipCount} animations · ${textureState}`;
          kaykit3D.status.classList.add("loaded");
        } else {
          kaykit3D.status.textContent = `KayKit local ${done}/${kaykit3D.totalAssets} · animations ${clipCount}`;
        }
      }


      function cloneKayKitAsset(assetKey, { maxWidth = .9, maxHeight = 1, targetFloor = 0, exactWidth = null, exactDepth = null, exactHeight = null } = {}) {
        const source = kaykit3D?.assets.get(assetKey);
        if (!source) return null;
        let clone;
        try {
          clone = THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(source) : source.clone(true);
        } catch (_) { clone = source.clone(true); }
        const wrapper = new THREE.Group();
        wrapper.add(clone);
        clone.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          if (Array.isArray(child.material)) child.material = child.material.map(material => material.clone());
          else child.material = child.material.clone();
        });
        const box = new THREE.Box3().setFromObject(clone);
        const size = new THREE.Vector3(); box.getSize(size);
        const useExact = exactWidth != null || exactDepth != null || exactHeight != null;
        if (useExact) {
          // Les Block Bits sont volontairement ajustés indépendamment sur X/Y/Z :
          // une case fait 1 unité, le modèle doit donc remplir la case sans que sa
          // grande hauteur d'origine réduise artificiellement sa largeur.
          clone.scale.set(
            (exactWidth ?? maxWidth) / Math.max(size.x, .001),
            (exactHeight ?? maxHeight) / Math.max(size.y, .001),
            (exactDepth ?? exactWidth ?? maxWidth) / Math.max(size.z, .001)
          );
        } else {
          const scale = Math.min(
            maxWidth / Math.max(size.x, size.z, .001),
            maxHeight / Math.max(size.y, .001)
          );
          clone.scale.setScalar(scale);
        }
        const scaledBox = new THREE.Box3().setFromObject(clone);
        const scaledCenter = new THREE.Vector3(); scaledBox.getCenter(scaledCenter);
        clone.position.x -= scaledCenter.x;
        clone.position.z -= scaledCenter.z;
        clone.position.y += targetFloor - scaledBox.min.y;
        addShadowFlags(wrapper);
        return wrapper;
      }

      function getBlockBitsTexture() {
        if (!kaykit3D?.textureLoader) return null;
        const key = 'block-bits-texture-v46';
        if (kaykit3D.textureCache.has(key)) return kaykit3D.textureCache.get(key);
        const texture = kaykit3D.textureLoader.load(
          './assets/kaykit/blockBits/block_bits_texture.png',
          loaded => {
            configureKayKitTexture(loaded);
            loaded.magFilter = THREE.NearestFilter;
            loaded.minFilter = THREE.NearestMipmapNearestFilter || THREE.NearestFilter;
            loaded.generateMipmaps = true;
            loaded.needsUpdate = true;
            scheduleKayKitSync();
          },
          undefined,
          error => console.error('Texture Block Bits introuvable', error)
        );
        configureKayKitTexture(texture);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapNearestFilter || THREE.NearestFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        kaykit3D.textureCache.set(key, texture);
        return texture;
      }

      // Le choix des clips d'animation des gardiens vit désormais dans
      // js/animation-system.js (ILYOS_ANIM.resolveClip + CLIP_TABLE), qui
      // s'appuie sur les noms de clips RÉELS des GLB KayKit plutôt que sur des
      // motifs approximatifs. Les anciennes fonctions chooseKayKitAnimationClip,
      // playKayKitAnimator et addAssetAnimation ont été retirées : elles
      // recréaient un AnimationMixer par gardien à chaque synchronisation, et
      // figeaient l'Idle sur une seule image (`action.paused = true`, mixer
      // jamais ajouté à la boucle de rendu) — c'était la cause des personnages
      // immobiles.

      function kaykitFacingRotation(fromR, fromC, toR, toC) {
        const dr = toR - fromR, dc = toC - fromC;
        if (!dr && !dc) return 0;
        return Math.atan2(dc, dr);
      }

      /**
       * Point d'entrée unique du gameplay vers l'animation.
       *
       * Le moteur appelle cette fonction APRÈS avoir validé une action : elle ne
       * décide jamais rien, elle raconte. Elle route l'intention vers la
       * séquence correspondante du registre persistant, et conserve
       * `pendingActionAnimations` — encore lu ailleurs pour savoir si une
       * animation est en cours (caméra, cadence de rendu).
       */
      // V78 (passe fluidité) : onComplete devient l'autorité de fin d'action
      // visuelle pour le chemin 3D — remplace l'ancien animateToken() HTML
      // (getBoundingClientRect/.moving-token/element.animate) pour MOVE/PUSH
      // en mode alternative (voir js/game/ui.js). Le délai avant l'appel de
      // onComplete est fourni par l'appelant via `duration` : cette fonction
      // ne réinvente aucun calcul de durée, elle réutilise le même minuteur
      // (setTimeout(duration + 80)) qui pilotait déjà le nettoyage interne de
      // pendingActionAnimations, en y accrochant simplement ce callback.
      function queueKayKitActionAnimation(characterId, intent = "move", duration = 950, target = null, path = null, onComplete = null) {
        if (!kaykit3D || characterId === null || characterId === undefined) {
          if (typeof onComplete === "function") onComplete();
          return;
        }
        const id = String(characterId);
        const character = state?.characters?.find(item => String(item.id) === id);
        if (character && target && Number.isFinite(target.r) && Number.isFinite(target.c)) {
          kaykit3D.characterFacing.set(id, kaykitFacingRotation(character.r, character.c, target.r, target.c));
        }

        const startedAt = performance.now();
        const actionToken = `${id}:${intent}:${startedAt}:${Math.random().toString(16).slice(2)}`;

        kaykit3D.pendingActionAnimations.set(id, {
          intent,
          startedAt,
          expires: startedAt + duration,
          duration,
          target,
          path: Array.isArray(path) ? path.map(step => [step[0], step[1]]) : null,
          actionToken,
          played: false
        });

        // Le gardien peut ne pas encore avoir de visuel (première pose d'île) :
        // dans ce cas la synchronisation qui suit le créera, et son état neutre
        // sera correct. Aucune animation n'est perdue pour autant, car les
        // actions ne concernent que des gardiens déjà présents.
        const visual = kaykit3D.characterVisuals.get(id);
        if (visual) {
          switch (intent) {
            case "move": {
              const route = Array.isArray(path) && path.length && character
                ? [[character.r, character.c], ...path.map(step => [step[0], step[1]])]
                : null;
              if (route) playCharacterMove(visual, route, duration);
              break;
            }
            case "attack":
            case "push":
              playCharacterPush(visual, target, duration);
              break;
            case "hurt":
              // Léger décalage : quand plusieurs gardiens sont poussés d'un coup,
              // leurs réactions se propagent au lieu de partir à l'unisson.
              playCharacterHit(visual, target, kaykit3D._hitStagger || 0);
              kaykit3D._hitStagger = ((kaykit3D._hitStagger || 0) + 70) % 280;
              break;
            case "magic":
              playCharacterMagic(visual, target);
              break;
            case "victory":
              playCharacterVictory(visual, Math.floor(visual.seed * 420));
              break;
            case "fall":
              playCharacterFall(visual);
              break;
            default:
              break;
          }
        }

        scheduleKayKitSync();
        setTimeout(() => {
          if (!kaykit3D) { if (typeof onComplete === "function") onComplete(); return; }
          const pending = kaykit3D.pendingActionAnimations.get(id);
          if (
            pending &&
            pending.actionToken === actionToken &&
            pending.expires <= performance.now()
          ) {
            kaykit3D.pendingActionAnimations.delete(id);
            kaykit3D._hitStagger = 0;
            scheduleKayKitSync();
          }
          if (typeof onComplete === "function") onComplete();
        }, duration + 80);
      }

      function queueKayKitCurrentPlayerAnimation(intent = "magic", duration = 1000, target = null) {
        const selected = state?.selectedCharId ? characterById(state.selectedCharId) : null;
        const actor = selected || state?.characters?.find(character => character.player === state.currentPlayer);
        // La cible sert à orienter le lanceur : sans elle, il incantait dos à
        // l'île qu'il faisait tourner.
        if (actor) queueKayKitActionAnimation(actor.id, intent, duration, target);
      }

      /**
       * Chute d'un gardien éjecté du plateau. Appelé juste AVANT que la logique
       * ne le retire de state.characters : le visuel se détache alors du
       * registre normal et s'anime seul jusqu'à disparaître.
       */
      function queueKayKitCharacterFall(characterId, direction = null) {
        const visual = kaykit3D?.characterVisuals.get(String(characterId));
        if (!visual) return;
        playCharacterFall(visual, direction);
      }

      /** Le lanceur de sort le plus pertinent pour une rotation d'île. */
      function kaykitMagicCaster() {
        const selected = state?.selectedCharId ? characterById(state.selectedCharId) : null;
        return selected || state?.characters?.find(character => character.player === state.currentPlayer) || null;
      }


      async function verifyAndCacheKayKit() {
        if (!els.kaykitCacheBtn) return;
        const button = els.kaykitCacheBtn;
        const status = els.kaykitCacheStatus;
        const urls = [...new Set(Object.values(KAYKIT_ASSETS).flatMap(spec => [...(spec.urls || []), ...(spec.textures || [])]).filter(Boolean))];
        button.disabled = true;
        let completed = 0;
        let success = 0;
        let cache = null;
        try { if ('caches' in window) cache = await caches.open('ilyos-kaykit-v10'); } catch (_) { cache = null; }
        const queue = urls.slice();
        const workers = Array.from({ length: 4 }, async () => {
          while (queue.length) {
            const url = queue.shift();
            try {
              const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
              if (response.ok) {
                success++;
                if (cache) await cache.put(url, response.clone());
              }
            } catch (_) { /* diagnostic final */ }
            completed++;
            if (status) status.textContent = `KayKit : ${completed}/${urls.length} fichiers principaux vérifiés…`;
          }
        });
        await Promise.all(workers);
        button.disabled = false;
        const ok = success === urls.length;
        if (status) status.textContent = ok
          ? `KayKit prêt : ${success} fichiers principaux accessibles et mis en cache.`
          : `KayKit partiel : ${success}/${urls.length} fichiers accessibles. Le jeu utilisera ses modèles de secours si nécessaire.`;
        showToast(ok ? "KayKit est prêt et mis en cache." : "Vérification KayKit partielle : consultez le menu Son.");
      }

      function registerKayKitCellVisual(r, c, object) {
        if (!kaykit3D || !object) return;
        const k = `${r},${c}`;
        if (!kaykit3D.cellVisuals.has(k)) kaykit3D.cellVisuals.set(k, []);
        kaykit3D.cellVisuals.get(k).push(object);
      }

      function clearKayKitVisualHover() {
        if (!kaykit3D) return;
        (kaykit3D.hoveredVisuals || []).forEach(record => {
          if (!record?.mesh) return;
          record.mesh.material = record.originalMaterial;
          (record.clonedMaterials || []).forEach(material => material?.dispose?.());
        });
        kaykit3D.hoveredVisuals = [];
        kaykit3D.hoveredVisualKey = null;
      }

      function setKayKitVisualHover(cell, intent) {
        // Clone temporairement les matériaux afin de ne jamais modifier les matériaux partagés.
        if (!kaykit3D) return;
        const visualKey = cell && intent ? `${cell.r},${cell.c}|${intent.kind}` : null;
        if (visualKey && kaykit3D.hoveredVisualKey === visualKey) return;
        clearKayKitVisualHover();
        if (!cell || !intent) return;

        const accent = new THREE.Color(intent.color);
        // Un gardien est un modèle détaillé (armure, peau, tissu) : le même
        // repeint fort que sur un décor de case plat le "blanchit" en glaçon
        // et le rend méconnaissable. On garde juste un léger reflet d'accent.
        const isCharacterModel = ["ally", "enemy", "select"].includes(intent.kind);
        const strength = isCharacterModel ? .08 : (intent.actionable ? .24 : .11);
        const emissiveStrength = isCharacterModel ? .16 : (intent.actionable ? .72 : .38);
        const emissiveFloor = isCharacterModel ? .12 : (intent.actionable ? .50 : .22);
        const visuals = kaykit3D.cellVisuals.get(`${cell.r},${cell.c}`) || [];

        visuals.forEach(object => object?.traverse?.(mesh => {
          if (!mesh.isMesh || !mesh.material) return;
          const originalMaterial = mesh.material;
          const originals = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
          const clonedMaterials = originals.map(material => {
            const clone = material.clone();
            if (clone.color) clone.color.lerp(accent, strength);
            if (clone.emissive) {
              clone.emissive = clone.emissive.clone().lerp(accent, emissiveStrength);
              clone.emissiveIntensity = Math.max(clone.emissiveIntensity || 0, emissiveFloor);
            }
            clone.needsUpdate = true;
            return clone;
          });
          mesh.material = Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0];
          kaykit3D.hoveredVisuals.push({ mesh, originalMaterial, clonedMaterials });
        }));
        kaykit3D.hoveredVisualKey = visualKey;
      }

      function kaykitHoverIntent(r, c, hitAction = null) {
        const cell = els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        const classes = cell?.classList;
        const character = characterAt(r, c);
        const island = islandAt(r, c);
        const crowns = [state?.artifact, state?.secondArtifact].filter(Boolean);
        const looseCrown = crowns.some(item => item.active && !item.carrierId && item.r === r && item.c === c);

        if (state?.phase === "PLACE_ISLAND") {
          const valid = isValidPlacement(r, c);
          return { kind: valid ? "place" : "invalid", actionable: valid, color: valid ? 0x16f29a : 0xff2948, label: valid ? "POSER L’ÎLE ICI" : "POSE IMPOSSIBLE" };
        }
        if (state?.phase === "PLACE_SPAWN") {
          const allowed = classes?.contains("spawn-choice");
          return { kind: allowed ? "invocation" : "invalid", actionable: allowed, color: allowed ? 0x53e6d1 : 0xff4058, label: allowed ? "INVOCATION" : "CASE INDISPONIBLE" };
        }
        // Pendant la transmission, une case libre signifie poser la couronne, jamais se déplacer.
        if (state?.phase === "DROP_TREASURE" && state.reachable?.has(key(r, c)) && !character) {
          return { kind: "crown-place", actionable: true, color: 0xffc928, label: "POSER ICI" };
        }
        if (state?.phase === "ACTION" && state.selectedActionType === "MOVE") {
          if (character?.player === state.currentPlayer) {
            const selected = character.id === state.selectedCharId;
            return {
              kind: selected ? "select" : "ally",
              actionable: true,
              color: selected ? 0xc9a45d : 0x43e6d0,
              label: selected ? "GARDIEN SÉLECTIONNÉ" : "CHOISIR CE GARDIEN"
            };
          }
          const nearest = state.selectedCharId ? null : nearestMoverForCell(r, c);
          const valid = state.selectedCharId ? state.reachable?.has(key(r, c)) : !!nearest;
          if (valid) {
            const previewPath = state.selectedCharId ? state.smartHoverPath : nearest?.path;
            const moveCost = previewPath?.cost ?? previewPath?.length ?? 1;
            const mover = state.selectedCharId ? characterById(state.selectedCharId) : nearest?.char;
            return {
              kind: "move",
              actionable: true,
              // Marron uniforme, quel que soit le coût : la distinction cyan/vert par
              // coût laissait un rond cyan visible sur les diagonales, incohérent avec
              // les anneaux d'affordance persistants (déjà marron, voir
              // addKayKitMoveAffordance).
              color: 0xd9922f,
              label: `DÉPLACER · ${moveCost} ACTION${moveCost > 1 ? "S" : ""}`,
              facing: mover ? kaykitFacingRotation(mover.r, mover.c, r, c) : null
            };
          }
          return { kind: "invalid", actionable: false, color: 0xff4058, label: "DESTINATION IMPOSSIBLE" };
        }
        if (state?.phase === "ACTION" && state.selectedActionType === "PUSH") {
          const selected = character?.id === state.selectedCharId;
          if (selected) return { kind: "select", actionable: true, color: 0xc9a45d, label: "POUSSEUR SÉLECTIONNÉ" };
          if (!state.selectedCharId && character?.player === state.currentPlayer) {
            return { kind: "ally", actionable: true, color: 0x43e6d0, label: "CHOISIR CE GARDIEN" };
          }
          const valid = state.selectedCharId
            ? (Math.abs((characterById(state.selectedCharId)?.r ?? 99) - r) + Math.abs((characterById(state.selectedCharId)?.c ?? 99) - c) === 1 && !!(character || looseCrown))
            : !!nearestPusherForTarget(r, c);
          if (valid) {
            const falling = !!getPushHoverPreview()?.fell;
            const force = Math.max(1, selectedBatchSize());
            return {
              kind: "push",
              actionable: true,
              color: falling ? 0xff5538 : 0xff8a32,
              label: falling ? `POUSSER · CHUTE · F${force}` : `POUSSER · FORCE ${force}`
            };
          }
          if (character?.player === state.currentPlayer) {
            return { kind: "ally", actionable: true, color: 0x43e6d0, label: "CHOISIR CE GARDIEN" };
          }
          return { kind: "invalid", actionable: false, color: 0xff4058, label: "CIBLE NON ADJACENTE" };
        }
        // Interaction directe gardien → destination/cible. On lit uniquement state.*
        // (jamais les classes du plateau DOM caché, qui ne sont pas rafraîchies en mode 3D).
        if (state?.phase === "SMART_CHAR") {
          if (character?.id === state.selectedCharId) {
            return { kind: "select", actionable: true, color: 0xc9a45d, label: "GARDIEN SÉLECTIONNÉ" };
          }
          if (character?.player === state.currentPlayer) {
            return { kind: "ally", actionable: true, color: 0x43e6d0, label: "CHANGER DE GARDIEN" };
          }
          const smartHovered = isSameCell(state.actionHoverCell, [r, c]);
          if (smartHovered && state.smartHoverType === "MOVE") {
            const moveCost = state.smartHoverPath?.cost ?? state.smartHoverPath?.length ?? 1;
            const actor = characterById(state.selectedCharId);
            return {
              kind: "move",
              actionable: true,
              // Marron uniforme, quel que soit le coût : la distinction cyan/vert par
              // coût laissait un rond cyan visible sur les diagonales, incohérent avec
              // les anneaux d'affordance persistants (déjà marron, voir
              // addKayKitMoveAffordance).
              color: 0xd9922f,
              label: `DÉPLACER · ${moveCost} ACTION${moveCost > 1 ? "S" : ""}`,
              facing: actor ? kaykitFacingRotation(actor.r, actor.c, r, c) : null
            };
          }
          if (smartHovered && state.smartHoverType === "PUSH") {
            const preview = getPushHoverPreview();
            const force = preview?.force ?? 1;
            const required = preview?.requiredForce ?? 1;
            const insufficient = required > force;
            return {
              kind: "push",
              actionable: !insufficient,
              color: insufficient ? 0xff8a32 : (preview?.fell ? 0xff5538 : 0xff8a32),
              label: insufficient
                ? `FORCE ${required} REQUISE · VOUS AVEZ ${force}`
                : (preview?.fell ? `POUSSER · CHUTE · F${force}` : `POUSSER · FORCE ${force}`)
            };
          }
          if (character) {
            return { kind: "enemy", actionable: false, color: 0xff6f72, label: "CIBLE NON ATTEIGNABLE" };
          }
          return { kind: "invalid", actionable: false, color: 0xff4058, label: "DESTINATION IMPOSSIBLE" };
        }
        // Un objet couronne sous le pointeur garde toujours la priorité visuelle,
        // même si sa case appartient aussi à une île ciblable par la magie.
        if (hitAction === "crown-carried" || hitAction === "crown-loose" || (!character && looseCrown)) {
          return { kind: "crown", actionable: true, color: 0xffc928, label: "COURONNE" };
        }
        if (state?.phase === "ACTION" && state.selectedActionType === "MAGIC") {
          if (classes?.contains("magic-invalid")) return { kind: "invalid", actionable: false, color: 0xff4058, label: "ROTATION IMPOSSIBLE" };
          if (classes?.contains("magic-valid") || classes?.contains("magic-selected-island") || classes?.contains("magic-hover-pivot")) {
            return { kind: "magic", actionable: true, color: 0xc36cff, label: "ÎLE CIBLÉE PAR LA MAGIE" };
          }
          if (island && !character) return { kind: "magic", actionable: true, color: 0xc36cff, label: "CHOISIR CETTE ÎLE" };
          return { kind: "invalid", actionable: false, color: 0xff4058, label: character ? "CASE OCCUPÉE" : "ÎLE REQUISE" };
        }
        if (classes?.contains("magic-valid") || classes?.contains("magic-selected-island") || classes?.contains("magic-hover-pivot")) return { kind: "magic", actionable: true, color: 0xc36cff, label: "MAGIE" };
        if (hitAction === "character" || character) {
          const owner = state?.players?.[character?.player]?.name;
          const ally = character?.player === state?.currentPlayer;
          return {
            kind: ally ? "ally" : "enemy",
            actionable: true,
            color: ally ? 0x43e6d0 : 0xff6f72,
            label: `${ally ? "ALLIÉ" : "ADVERSAIRE"} · ${(owner || "GARDIEN").toUpperCase()}`
          };
        }
        if (classes?.contains("push-target-preview") || classes?.contains("push-destination-preview") || classes?.contains("push-destination")) return { kind: "push", actionable: true, color: 0xff8a32, label: "POUSSER CETTE CIBLE" };
        if (classes?.contains("reachable") || classes?.contains("move-target-preview") || classes?.contains("move-path-preview")) return { kind: "move", actionable: true, color: 0xd9922f, label: "DÉPLACER ICI" };
        if (classes?.contains("selected") || classes?.contains("selected-character")) return { kind: "select", actionable: true, color: 0xf4c84b, label: "SÉLECTION ACTIVE" };
        return { kind: "neutral", actionable: false, color: 0xf4c84b, label: "" };
      }
      function applyKayKitHoverIntent(intent) {
        if (!kaykit3D?.hoverMarker) return;
        const glyphKind = intent.kind === "crown-place"
          ? "place"
          : (["ally", "enemy"].includes(intent.kind) ? "character" : intent.kind);
        // Pose d'île : renderKayKitPlacementPreview() affiche déjà le vrai modèle
        // d'île teinté vert/rouge — voir plus bas pour hoverRingsSuppressed.
        const placingIsland = state?.phase === "PLACE_ISLAND";
        const unifiedPushActive = !!state?.pushOptions?.length;
        // Un gardien 3D est déjà visible sous le curseur : superposer un pictogramme
        // "personnage" redondant n'apporte rien et surcharge le survol.
        const glyphSuppressed = glyphKind === "character" || glyphKind === "select" || glyphKind === "invocation" || (unifiedPushActive && glyphKind === "push") || (placingIsland && (glyphKind === "place" || glyphKind === "invalid"));
        // Le gardien sélectionné a déjà son propre halo persistant au sol
        // (addCellHighlight, kind "selected") : re-dessiner un second réticule de
        // survol par-dessus (remplissage + anneau + coches) en plus de ce halo ne
        // fait que doubler l'indicateur "sélectionné" — visible comme 2 cercles +
        // un carré empilés. On masque tout le réticule éphémère dans ce cas précis.
        // Même logique pour "invocation" : addKayKitSpawnGuardianGhost() dessine
        // maintenant le futur gardien en volume à cet endroit précis — le grand
        // réticule (remplissage + anneau + coches, depthTest désactivé) rendait ce
        // ghost illisible en passant systématiquement devant lui.
        // Idem pour la pose d'île : renderKayKitPlacementPreview() dessine déjà le
        // vrai modèle d'île teinté vert/rouge selon la validité — le réticule
        // générique (gros cercle + pictogramme) par-dessus ne fait que la
        // cacher/la surcharger sans ajouter d'information.
        // Survol "neutre" (case vide, plateau, décor) : il n'y a aucune action à
        // annoncer. Le réticule — carré de coches + anneau + remplissage — suivait
        // pourtant le curseur en permanence, ce qui bruite le plateau sans rien
        // apprendre au joueur. On ne montre plus rien tant qu'une case ne propose
        // pas réellement quelque chose.
        const hoverRingsSuppressed = glyphKind === "neutral" || glyphKind === "select" || glyphKind === "invocation" || (unifiedPushActive && glyphKind === "push") || (placingIsland && (glyphKind === "place" || glyphKind === "invalid"));
        kaykit3D.hoverMarker.traverse?.(child => {
          if (child.userData.hoverRole === "light") {
            child.color.setHex(intent.color);
            child.intensity = hoverRingsSuppressed ? 0 : (intent.actionable ? .80 : .48);
            return;
          }
          if (child.userData.hoverRole === "glyph") {
            child.visible = !glyphSuppressed && child.userData.hoverKind === glyphKind;
            if (child.material?.color) child.material.color.setHex(intent.kind === "crown-place" ? 0xffdf63 : 0xffffff);
            return;
          }
          if (child.userData.hoverRole === "glyphGroup") {
            // Seul le glyphe "move" transporte un cap réel ; les autres restent figés.
            child.rotation.y = child.userData.hoverKind === glyphKind && Number.isFinite(intent.facing) ? intent.facing : 0;
            return;
          }
          if (child.userData.hoverRole === "glyphBacking") {
            child.visible = !glyphSuppressed && glyphKind !== "neutral";
            return;
          }
          if (child.userData.hoverRole === "dot") {
            child.visible = false;
            return;
          }
          if (!child.material?.color) return;
          child.material.color.setHex(intent.color);
          if (child.userData.hoverRole === "fill")
            child.material.opacity = hoverRingsSuppressed ? 0 :
              intent.kind === "neutral"
                ? .08
                : (intent.kind === "magic"
                  ? .32
                  : (intent.kind === "invalid" ? .25 : .28));
          if (child.userData.hoverRole === "outline") {
            child.material.opacity = hoverRingsSuppressed ? 0 : (intent.kind === "neutral" ? .78 : 1);
            child.scale.setScalar(intent.kind === "magic" ? 1.18 : (intent.actionable ? 1.13 : 1));
          }
          if (child.userData.hoverRole === "ticks") {
            child.material.opacity = hoverRingsSuppressed ? 0 : (intent.kind === "neutral" ? .68 : 1);
            child.scale.setScalar(intent.kind === "magic" ? 1.22 : (intent.actionable ? 1.16 : 1));
          }
          child.material.needsUpdate = true;
        });
        if (kaykit3D.cursorLabel) {
          kaykit3D.cursorLabel.textContent = intent.label || "";
          kaykit3D.cursorLabel.dataset.kind = intent.kind;
          kaykit3D.cursorLabel.classList.toggle("visible", intent.kind !== "neutral" && !!intent.label);
        }
      }

      function registerKayKitInteractive(object, type, r, c) {
        if (!kaykit3D || !object) return;
        object.traverse?.(child => {
          if (!child.isMesh) return;
          child.userData.r = r; child.userData.c = c; child.userData.kaykitAction = type;
          kaykit3D.interactiveMeshes.push(child);
        });
      }

      function dispatchKayKitClick(hit, event) {
        if (!hit) return;
        const { r, c, kaykitAction } = hit.userData || {};
        const cell = els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if (!cell) return;
        const selector = kaykitAction === "crown-carried" ? ".carrier-crown" : kaykitAction === "crown-loose" ? ".artifact" : null;
        const target = selector ? cell.querySelector(selector) : cell;
        (target || cell).dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, clientX: event.clientX || 0, clientY: event.clientY || 0,
          button: event.button || 0, buttons: event.buttons || 0, view: window
        }));
      }

      function bindKayKitInteractions() {
        if (!kaykit3D) return;
        const { canvas } = kaykit3D;
        let pointerDown = null;
        let dragMoved = false;
        const DRAG_THRESHOLD = 7;
        // Coalescement du survol : un mousemove natif peut arriver bien plus
        // souvent que l'écran ne se rafraîchit (une souris de jeu à 1000 Hz
        // envoie un événement par milliseconde). updateHover fait deux lancers
        // de rayon contre toutes les cases + gardiens + couronnes, et une
        // requête DOM par changement de case — répété à ce rythme, c'était une
        // source directe de saccades au survol du plateau. Un seul appel par
        // image suffit : l'œil ne distingue pas un survol mis à jour à 1000 Hz
        // d'un survol mis à jour à 60 Hz.
        let pendingHoverEvent = null;
        let hoverFrameScheduled = false;
        const scheduleHoverUpdate = event => {
          pendingHoverEvent = event;
          if (hoverFrameScheduled) return;
          hoverFrameScheduled = true;
          requestAnimationFrame(() => {
            hoverFrameScheduled = false;
            if (pendingHoverEvent) updateHover(pendingHoverEvent);
            pendingHoverEvent = null;
          });
        };
        const pick = event => {
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;

          kaykit3D.pointer.x =
            ((event.clientX - rect.left) / rect.width) * 2 - 1;

          kaykit3D.pointer.y =
            -((event.clientY - rect.top) / rect.height) * 2 + 1;

          kaykit3D.raycaster.setFromCamera(
            kaykit3D.pointer,
            kaykit3D.camera
          );

          const interactive =
            kaykit3D.raycaster.intersectObjects(
              kaykit3D.interactiveMeshes || [],
              false
            )[0]?.object;

          if (interactive) return interactive;

          return kaykit3D.raycaster.intersectObjects(
            kaykit3D.hitMeshes,
            false
          )[0]?.object || null;
        };
        const dispatchToCell = (type, r, c, event, bubbles = false) => {
          const cell = els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
          if (!cell) return;
          cell.dispatchEvent(new MouseEvent(type, {
            bubbles, cancelable: true, clientX: event.clientX || 0, clientY: event.clientY || 0,
            button: event.button || 0, buttons: event.buttons || 0, view: window
          }));
        };
        const clearHover = (event = null) => {
          const previous = kaykit3D.hoverCell;
          if (previous && !previous.special && event) dispatchToCell("mouseleave", previous.r, previous.c, event, false);
          if (state?.pushHoverOptionId) {
            state.pushHoverOptionId = null;
            if (els.instruction) els.instruction.textContent = phaseInfo().instruction;
            renderTurnContext();
            renderHand();
          }
          kaykit3D.hoverCell = null;
          // Pendant la pose, conserver le dernier ancrage : les boutons de rotation
          // doivent transformer exactement la même prévisualisation.
          if (state?.phase !== "PLACE_ISLAND") clearPlacementPreview(true);
          if (kaykit3D.hoverMarker) {
            kaykit3D.hoverMarker.visible = false;
            kaykit3D.hoverMarker.scale.setScalar(1);
          }
          kaykit3D.cursorLabel?.classList.remove("visible");
          canvas.style.cursor = "default";
          clearKayKitVisualHover();
          refreshKayKitHoverPreviews();
        };
        const updateHover = event => {
          if (!canLocalPlayerAct()) {
            if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
            kaykit3D.cursorLabel?.classList.remove("visible");
            canvas.style.cursor = "default";
            clearKayKitVisualHover();
            clearKayKitGroup(kaykit3D.actionPreviewGroup);
            kaykit3D.actionPreviewKey = null;
            return null;
          }
          if (dragMoved) {
            if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
            kaykit3D.cursorLabel?.classList.remove("visible");
            clearKayKitVisualHover();
            clearKayKitGroup(kaykit3D.actionPreviewGroup);
            kaykit3D.actionPreviewKey = null;
            return null;
          }
          const hit = pick(event);
          const specialInteraction = hit?.userData?.ilyosInteraction;
          if (
            specialInteraction === "push-destination"
            || specialInteraction === "push-death-destination"
          ) {
            const optionId = hit.userData.pushOptionId;
            if (state.pushHoverOptionId !== optionId) {
              state.pushHoverOptionId = optionId;
              if (els.instruction) els.instruction.textContent = phaseInfo().instruction;
              renderTurnContext();
              renderHand();
            }
            const option = state.pushOptions?.find(item => item.id === optionId);
            kaykit3D.hoverCell = { special: true, hit };
            if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
            clearKayKitVisualHover();
            refreshKayKitHoverPreviews();
            if (kaykit3D.cursorLabel && option) {
              kaykit3D.cursorLabel.textContent = option.fell
                ? `☠ CHUTE · FORCE ${option.force}`
                : `POUSSER · FORCE ${option.force}`;
              kaykit3D.cursorLabel.dataset.kind = "push";
              kaykit3D.cursorLabel.classList.add("visible");
            }
            canvas.style.cursor = "pointer";
            return kaykit3D.hoverCell;
          }

          const next = hit
            ? { r: hit.userData.r, c: hit.userData.c, hit, hitAction: hit.userData?.kaykitAction || null }
            : null;
          const previous = kaykit3D.hoverCell;
          if (previous?.special && state?.pushHoverOptionId) {
            state.pushHoverOptionId = null;
            if (els.instruction) els.instruction.textContent = phaseInfo().instruction;
            renderTurnContext();
            renderHand();
          }
          if (previous && !previous.special && (!next || previous.r !== next.r || previous.c !== next.c)) {
            dispatchToCell("mouseleave", previous.r, previous.c, event, false);
          }
          if (next && (!previous || previous.r !== next.r || previous.c !== next.c)) {
            dispatchToCell("mouseenter", next.r, next.c, event, false);
          }
          if (next) dispatchToCell("mousemove", next.r, next.c, event, false);

          if (state?.phase === "PLACE_ISLAND") {
            if (next) {
              const sameAnchor = Array.isArray(state.hoverAnchor) && state.hoverAnchor[0] === next.r && state.hoverAnchor[1] === next.c;
              if (!sameAnchor) {
                state.hoverAnchor = [next.r, next.c];
                updatePlacementPreview(next.r, next.c);
              }
            } else {
              clearPlacementPreview(true);
            }
          }

          kaykit3D.hoverCell = next;
          const intent = next ? kaykitHoverIntent(next.r, next.c, next.hitAction) : null;
          setKayKitVisualHover(next, intent);
          if (kaykit3D.hoverMarker) {
            kaykit3D.hoverMarker.visible = !!next;
            if (next) {
              const p = kaykitCellPosition(next.r, next.c, kaykitCellSurfaceY(next.r, next.c) + .085);
              kaykit3D.hoverMarker.position.set(p.x, p.y, p.z);
              applyKayKitHoverIntent(intent);
            }
          }
          refreshKayKitHoverPreviews();
          canvas.style.cursor = next
            ? (intent.actionable ? "pointer" : (intent.kind === "invalid" ? "not-allowed" : "crosshair"))
            : "default";
          return next;
        };
        canvas.addEventListener("pointerdown", event => {
          pointerDown = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY };
          dragMoved = false;
          if (!kaykit3D.orbit) canvas.setPointerCapture?.(event.pointerId);
        });
        canvas.addEventListener("pointermove", event => {
          // Le libellé suivait auparavant le curseur au pixel près : sa largeur
          // varie avec le texte ("MAGIE" vs "DÉPLACER · 2 ACTIONS"), donc son
          // centre optique glissait sans arrêt et ne semblait jamais aligné sur
          // rien de fixe — d'où l'impression répétée de tooltip "pas centré".
          // On fixe désormais sa position une fois pour toutes (voir CSS,
          // .kaykit-cursor-label : centré sur le plateau, ancré en bas), comme
          // une bannière de statut plutôt qu'un curseur personnalisé.
          if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > DRAG_THRESHOLD) {
            dragMoved = true;
            kaykit3D.autoFit = false;
            kaykit3D.userRotated = true;
            kaykit3D.cameraTween = null;
            if (kaykit3D.cameraMode !== "free") { kaykit3D.cameraMode = "free"; updateKayKitCameraModeUI(); }
            kaykit3D.cameraHint?.classList.add("hidden");
            if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
          }
          if (dragMoved && pointerDown && !kaykit3D.orbit) {
            const dx = event.clientX - pointerDown.lastX;
            const dy = event.clientY - pointerDown.lastY;
            kaykit3D.manualOrbit.azimuth -= dx * .0085;
            kaykit3D.manualOrbit.polar = THREE.MathUtils.clamp(kaykit3D.manualOrbit.polar + dy * .007, .22, Math.PI * .49);
            pointerDown.lastX = event.clientX;
            pointerDown.lastY = event.clientY;
            updateKayKitCamera(false);
          } else if (!dragMoved) {
            scheduleHoverUpdate(event);
          }
        });
        canvas.addEventListener("pointerup", event => {
          if (!kaykit3D.orbit) canvas.releasePointerCapture?.(event.pointerId);
          pointerDown = null;
          requestAnimationFrame(() => { dragMoved = false; });
        });
        canvas.addEventListener("pointercancel", () => {
          pointerDown = null;
          dragMoved = false;
        });
        canvas.addEventListener("pointerleave", event => {
          clearHover(event);
        });
        canvas.addEventListener("click", event => {
          if (dragMoved) return;
          const next = updateHover(event);
          const specialInteraction = next?.hit?.userData?.ilyosInteraction;
          if (
            specialInteraction === "push-destination"
            || specialInteraction === "push-death-destination"
          ) {
            executeUnifiedPushOption(next.hit.userData.pushOptionId);
            return;
          }
          if (next?.hit) dispatchKayKitClick(next.hit, event);
          else if (next) dispatchToCell("click", next.r, next.c, event, true);
        });
        canvas.addEventListener("wheel", event => {
          event.stopPropagation();
        }, { passive: false });
        canvas.addEventListener("contextmenu", event => {
          // Le clic droit sert déjà à tourner la caméra (OrbitControls, voir plus
          // haut) : `dragMoved` (déjà utilisé pour désambiguïser le clic gauche
          // simple d'un glissé, tous boutons confondus) permet de ne déclencher
          // l'annulation que sur un clic droit SEC, jamais après une rotation.
          event.preventDefault();
          if (dragMoved) return;
          handleCancelButton();
        });
      }

      function kaykitFitDistance(aspect = kaykit3D?.camera?.aspect || 1, mode = kaykit3D?.viewMode || "isometric") {
        if (!kaykit3D) return 14.6;
        const verticalFov = THREE.MathUtils.degToRad(kaykit3D.camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(.25, aspect));
        const boardSize = kaykitBoardSpan() + .35;
        const heightDistance = (boardSize / 2) / Math.tan(verticalFov / 2);
        const widthDistance = (boardSize / 2) / Math.tan(horizontalFov / 2);
        const base = Math.max(heightDistance, widthDistance);
        // Revert : .74 espaçait trop (grand ciel vide en haut, châteaux minuscules) —
        // confirmé par capture utilisateur. Le cadrage voulu est le resserré
        // d'origine, .64, qui remplit le cadre sans marge inutile.
        const multiplier = mode === "front" ? .64 : .68;
        return THREE.MathUtils.clamp(base * multiplier, kaykit3D.minZoom, kaykit3D.maxZoom);
      }

      function kaykitPositionForView(mode, distance, target = kaykit3D?.viewTarget) {
        const position = new THREE.Vector3();
        if (!target) return position;
        if (mode === "front") {
          // Angle plus plongeant qu'un vrai plan face : on garde la même distance
          // au plateau (même magnitude que l'ancien vecteur .40/.96) mais on relève
          // le point de vue pour mieux lire les cases et les gardiens en survol.
          position.set(target.x, target.y + distance * .63, target.z + distance * .83);
        } else if (kaykit3D?.orbit) {
          position.set(target.x + distance * .61, target.y + distance * .70, target.z + distance * .61);
        } else {
          const polar = kaykit3D?.manualOrbit?.polar ?? .88;
          const azimuth = kaykit3D?.manualOrbit?.azimuth ?? Math.PI / 4;
          const horizontal = Math.sin(polar) * distance;
          position.set(
            target.x + Math.sin(azimuth) * horizontal,
            target.y + Math.cos(polar) * distance,
            target.z + Math.cos(azimuth) * horizontal
          );
        }
        return position;
      }

      function updateKayKitCamera(syncOrbit = true) {
        if (!kaykit3D) return;
        const target = kaykit3D.viewTarget || new THREE.Vector3(0, .22, .18);
        const position = kaykitPositionForView(kaykit3D.viewMode, kaykit3D.zoomDistance, target);
        kaykit3D.camera.position.copy(position);
        kaykit3D.camera.lookAt(target);
        if (kaykit3D.orbit && syncOrbit) {
          kaykit3D.orbit.target.copy(target);
          kaykit3D.orbit.object.position.copy(position);
          kaykit3D.orbit.update();
        }
        kaykit3D.camera.updateProjectionMatrix();
      }

      function animateKayKitCameraTo(mode, distance, duration = 520) {
        if (!kaykit3D) return;
        const target = kaykit3D.viewTarget.clone();
        const endPosition = kaykitPositionForView(mode, distance, target);
        const currentTarget = kaykit3D.orbit ? kaykit3D.orbit.target.clone() : target.clone();
        kaykit3D.cameraTween = {
          started: performance.now(), duration,
          startPosition: kaykit3D.camera.position.clone(),
          endPosition,
          startTarget: currentTarget,
          endTarget: target
        };
      }

      function snapKayKitView(mode = "isometric") {
        if (!kaykit3D) return;
        kaykit3D.viewMode = mode;
        kaykit3D.autoFit = true;
        kaykit3D.userRotated = false;
        // Un recadrage manuel explicite ramène toujours au centre du plateau,
        // même si la caméra "AUTO" suivait une action ailleurs.
        kaykit3D.viewTarget = new THREE.Vector3(0, .22, .18);
        if (mode === "isometric") kaykit3D.manualOrbit = { azimuth: Math.PI / 4, polar: .82 };
        kaykit3D.zoomDistance = kaykitFitDistance(kaykit3D.camera.aspect, mode);
        animateKayKitCameraTo(mode, kaykit3D.zoomDistance);
      }

      // Bascule AUTO / LIBRE : en AUTO, la caméra recadre seule vers le début de
      // tour du joueur humain et vers les actions de l'IA ; en LIBRE, elle reste
      // exactement où le joueur l'a laissée.
      function setKayKitCameraMode(mode) {
        if (!kaykit3D) return;
        kaykit3D.cameraMode = mode === "free" ? "free" : "auto";
        updateKayKitCameraModeUI();
        if (kaykit3D.cameraMode === "auto") {
          kaykit3D.userRotated = false;
          kaykitFollowCurrentPlayer(true);
        }
      }

      function updateKayKitCameraModeUI() {
        if (!kaykit3D) return;
        const autoBtn = kaykit3D.controls?.querySelector?.("[data-kay-camera-auto]");
        const freeBtn = kaykit3D.controls?.querySelector?.("[data-kay-camera-free]");
        autoBtn?.classList.toggle("kaykit-mode-active", kaykit3D.cameraMode === "auto");
        freeBtn?.classList.toggle("kaykit-mode-active", kaykit3D.cameraMode !== "auto");
      }

      // Recadre en douceur sur une case précise (action de l'IA, poussée, chute…).
      // `force` outrepasse le mode LIBRE (utilisé par le bouton AUTO lui-même).
      function kaykitFollowCell(r, c, { duration = 620, force = false, zoomBoost = 0 } = {}) {
        if (!kaykit3D || !Number.isFinite(r) || !Number.isFinite(c)) return;
        // En mode LIBRE, aucune animation de jeu ne reprend la main sur la
        // caméra : le joueur garde son cadrage.
        if (!force && kaykit3D.cameraMode !== "auto") return;
        const p = kaykitCellPosition(r, c, 0);
        kaykit3D.viewTarget = new THREE.Vector3(p.x, kaykit3D.viewTarget?.y ?? .22, p.z);
        // Mouvement réduit : on conserve le recadrage (il porte l'information
        // « c'est ici que ça se passe ») mais sans zoom appuyé ni long
        // déplacement, qui sont les composantes réellement inconfortables.
        if (kaykitReducedMotion()) {
          animateKayKitCameraTo(kaykit3D.viewMode, kaykit3D.zoomDistance, Math.min(200, duration));
          return;
        }
        const distance = zoomBoost
          ? THREE.MathUtils.clamp(kaykit3D.zoomDistance - zoomBoost, kaykit3D.minZoom, kaykit3D.maxZoom)
          : kaykit3D.zoomDistance;
        animateKayKitCameraTo(kaykit3D.viewMode, distance, duration);
      }

      // Recadre vers le centre des gardiens du joueur dont c'est le tour.
      function kaykitFollowCurrentPlayer(force = false) {
        if (!kaykit3D || !state?.characters?.length) return;
        if (!force && kaykit3D.cameraMode !== "auto") return;
        const mine = state.characters.filter(ch => ch.player === state.currentPlayer);
        if (!mine.length) return;
        const avgR = mine.reduce((sum, ch) => sum + ch.r, 0) / mine.length;
        const avgC = mine.reduce((sum, ch) => sum + ch.c, 0) / mine.length;
        kaykitFollowCell(avgR, avgC, { duration: 720, force });
      }

      // Tout premier tour de la partie : on montre l'objectif (la couronne)
      // plutôt que le village du joueur.
      function kaykitCenterOnCrown(force = false) {
        if (!kaykit3D || !state) return;
        if (!force && kaykit3D.cameraMode !== "auto") return;
        const artifact = [state.artifact, state.secondArtifact]
          .find(item => item?.active && !item.carrierId && Number.isFinite(item.r) && Number.isFinite(item.c));
        if (!artifact) return;
        kaykitFollowCell(artifact.r, artifact.c, { duration: 720, force });
      }

      function zoomKayKitCamera(direction) {
        if (!kaykit3D) return;
        kaykit3D.autoFit = false;
        kaykit3D.cameraTween = null;
        kaykit3D.zoomDistance = THREE.MathUtils.clamp(kaykit3D.zoomDistance + direction * .9, kaykit3D.minZoom, kaykit3D.maxZoom);
        if (kaykit3D.orbit) {
          const offset = new THREE.Vector3().subVectors(kaykit3D.orbit.object.position, kaykit3D.orbit.target).normalize().multiplyScalar(kaykit3D.zoomDistance);
          kaykit3D.orbit.object.position.copy(kaykit3D.orbit.target).add(offset);
          kaykit3D.orbit.update();
        } else updateKayKitCamera(false);
      }

      function toggleKayKitCamera() {
        snapKayKitView("front");
      }

      // V78 (passe fluidité) : point d'entrée léger pour les AUTRES scripts
      // (js/complete-polish.js, chargé séparément, hors de cette IIFE) — un
      // changement de qualité/DPR ne doit JAMAIS refitter la caméra ni
      // simuler un vrai resize de fenêtre. refitCamera:false garantit que
      // seuls renderer.setSize()/camera.aspect sont mis à jour si besoin ;
      // resizeKayKit3D() lui-même ne refit déjà QUE si forceFit ou si l'aspect
      // a réellement changé (voir plus bas), donc refitCamera=false ici NE
      // PASSE PAS forceFit=true — la position caméra reste intouchée.
      function resizeKayKitRenderer({ refitCamera = false } = {}) {
        resizeKayKit3D(refitCamera);
      }

      function resizeKayKit3D(forceFit = false) {
        if (!kaykit3D || document.body.dataset.visualMode !== "alternative") return;
        requestAnimationFrame(() => {
          if (!kaykit3D) return;
          const wrapRect = els.boardWrap.getBoundingClientRect();
          if (wrapRect.width < 20 || wrapRect.height < 20) return;
          const width = Math.round(wrapRect.width);
          const height = Math.round(wrapRect.height);
          kaykit3D.canvas.style.left = `0px`;
          kaykit3D.canvas.style.top = `0px`;
          kaykit3D.canvas.style.width = `${width}px`;
          kaykit3D.canvas.style.height = `${height}px`;
          kaykit3D.renderer.setSize(width, height, false);
          const nextAspect = width / height;
          const aspectChanged = Math.abs(nextAspect - kaykit3D.lastAspect) > .035;
          kaykit3D.lastAspect = nextAspect;
          kaykit3D.camera.aspect = nextAspect;
          kaykit3D.camera.updateProjectionMatrix();
          if (forceFit || (kaykit3D.autoFit && aspectChanged)) {
            kaykit3D.zoomDistance = kaykitFitDistance(nextAspect, kaykit3D.viewMode);
            animateKayKitCameraTo(kaykit3D.viewMode, kaykit3D.zoomDistance, 360);
          }
          kaykit3D.badge.style.left = `18px`;
          kaykit3D.badge.style.top = `18px`;
          kaykit3D.controls.style.right = `18px`;
          kaykit3D.controls.style.top = `auto`;
          kaykit3D.status.style.bottom = `18px`;
        });
      }

      function scheduleKayKitSync() {
        if (document.body.dataset.visualMode != "alternative") return;
        const now = performance.now();
        if (kaykit3D?.syncInProgress) {
          kaykit3D.syncPending = true;
          return;
        }
        if (now - kaykitLastSyncAt < 20 && kaykitSyncFrame) return;
        cancelAnimationFrame(kaykitSyncFrame);
        kaykitSyncFrame = requestAnimationFrame(() => {
          kaykitSyncFrame = 0;
          kaykitLastSyncAt = performance.now();
          if (!kaykit3D) initKayKit3D();
          if (kaykit3D) syncKayKitScene();
        });
      }

      function clearKayKitGroup(group) {
        if (!group) return;
        while (group.children.length) {
          const child = group.children[group.children.length - 1];
          disposeKayKitTaggedResources(child);
          group.remove(child);
        }
      }

      /**
       * Dispose les géométries/matériaux/textures d'un objet (et de ses
       * descendants) marqués `userData.ilyosTransient` — jamais une ressource
       * partagée via kaykitGeometry()/kaykitMaterial(), qui reste en cache pour
       * le reste de la session. Ne retire PAS l'objet de son parent : c'est à
       * l'appelant de le faire (voir clearKayKitGroup et disposeKayKitObjects).
       */
      function disposeKayKitTaggedResources(object) {
        object?.traverse?.(obj => {
          if (obj.geometry?.userData?.ilyosTransient) obj.geometry.dispose?.();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.filter(Boolean).forEach(mat => {
            if (!mat.userData?.ilyosTransient) return;
            if (mat.map?.userData?.ilyosTransient) mat.map.dispose?.();
            mat.dispose?.();
          });
        });
      }

      /**
       * Retire et dispose une LISTE d'objets top-level (par opposition à
       * clearKayKitGroup, qui vide un groupe entier) — utilisé par la
       * synchronisation incrémentale pour ne défaire que ce qui doit
       * effectivement changer (une case surlignée, la couche des îles, une
       * couronne posée...) sans toucher au reste de dynamicGroup.
       */
      function disposeKayKitObjects(list) {
        if (!list?.length) return;
        list.forEach(object => {
          disposeKayKitTaggedResources(object);
          object.parent?.remove(object);
        });
        list.length = 0;
      }

      function cellClassSet(r, c) {
        const cell = els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        return cell ? cell.classList : null;
      }

      /**
       * Équivalent de cellClassSet() pour les 121 cases en une seule passe DOM
       * au lieu de 121 querySelector individuels (un par case, à chaque sync).
       * Utilisé par syncKayKitScene, qui doit lire l'état de TOUTES les cases
       * à chaque appel pour les surbrillances (survol, sélection...).
       */
      function buildKayKitCellClassMap() {
        const map = new Map();
        els.board.querySelectorAll(".cell").forEach(cell => {
          const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
          if (Number.isFinite(r) && Number.isFinite(c)) map.set(`${r},${c}`, cell.classList);
        });
        return map;
      }

      /**
       * Signature compacte de state.islands : change si et seulement si une île
       * est posée, retirée, ou tourne (donc que ses cases changent). Sert à
       * savoir si la couche île/piédestaux/décor forestier doit être
       * reconstruite — inchangée sur un simple survol ou une sélection.
       */
      function kaykitIslandsSignature(islands) {
        if (!islands?.length) return "";
        let sig = "";
        for (let i = 0; i < islands.length; i++) {
          const island = islands[i];
          sig += island.id + ":" + (island.visualVariant ?? 0) + ":";
          const cells = island.cells;
          for (let j = 0; j < cells.length; j++) sig += cells[j][0] + "." + cells[j][1] + ",";
          sig += "|";
        }
        return sig;
      }

      const KAYKIT_LEVELS = { board: .05, islandTop: .47, pedestalTop: .47 };

      function kaykitCellSurfaceY(r, c) {
        if (islandAt(r, c)) return KAYKIT_LEVELS.islandTop + .014;
        if (isLand(r, c)) return KAYKIT_LEVELS.pedestalTop + .014;
        return KAYKIT_LEVELS.board + .014;
      }

      // Texture de nuage : plusieurs disques radiaux flous superposés à des
      // offsets aléatoires (seedés, donc stable d'un appel à l'autre) pour
      // éviter un cercle parfait trop artificiel. Un seul canvas partagé par
      // tous les amas de la mer de nuages — seules opacité/échelle/position
      // varient par sprite (voir buildKayKitSkyEnvironment).
      function kaykitCloudTexture() {
        const key = "cloud-sprite-v1";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 160;
        const ctx = canvas.getContext('2d');
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        for (let i = 0; i < 7; i++) {
          const cx = 60 + seeded(i, 1) * 136;
          const cy = 70 + seeded(i, 2) * 40;
          const r = 34 + seeded(i, 3) * 40;
          const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          blob.addColorStop(0, "rgba(255,255,255,.95)");
          blob.addColorStop(.6, "rgba(255,255,255,.55)");
          blob.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = blob;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      // Halo : un unique dégradé radial NET (cœur plein, extinction douce, contour
      // parfaitement circulaire) — à ne jamais confondre avec kaykitCloudTexture, qui
      // superpose des amas irréguliers pour lire comme un nuage, pas comme une source
      // de lumière. Un premier essai réutilisait cette texture nuage pour le halo du
      // gardien sélectionné : le contour bosselé et asymétrique se lisait comme une
      // tache plutôt qu'un halo. Cette texture-ci sert à la fois au disque au sol et
      // au faisceau vertical (voir la boucle de rendu des héros) — un seul dégradé
      // suffit aux deux, il change juste d'échelle.
      function kaykitGlowTexture() {
        const key = "glow-radial-v1";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const c = size / 2;
        const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
        glow.addColorStop(0, "rgba(255,255,255,1)");
        glow.addColorStop(.35, "rgba(255,255,255,.85)");
        glow.addColorStop(.65, "rgba(255,255,255,.32)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      // Fondu vertical simple (bas opaque → haut transparent), appliqué au flanc
      // d'un cylindre plutôt qu'à deux plans croisés : un cylindre garde toujours
      // un contour arrondi quel que soit l'angle de caméra, donc jamais cette
      // "carte plate" qui tranche le personnage en deux vue de biais.
      function kaykitBeamGradientTexture() {
        const key = "beam-gradient-v1";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const w = 8, h = 128;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, "rgba(255,255,255,.9)");
        grad.addColorStop(.18, "rgba(255,255,255,.6)");
        grad.addColorStop(.6, "rgba(255,255,255,.18)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      function kaykitCanvasTexture(name, base, accent) {
        const key = `surface-v30-${name}-${base}-${accent}`;
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 256, 256);
        gradient.addColorStop(0, base);
        gradient.addColorStop(.32, accent);
        gradient.addColorStop(.68, base);
        gradient.addColorStop(1, accent);
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);

        // Texture végétale volontairement lisible : touffes, brins et petites zones denses.
        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        for (let i = 0; i < 760; i++) {
          const x = seeded(i, 1) * 256;
          const y = seeded(i, 2) * 256;
          const length = 3 + seeded(i, 3) * 7;
          const angle = (-.45 + seeded(i, 4) * .9);
          const dark = seeded(i, 5) > .48;
          ctx.strokeStyle = dark
            ? `rgba(11,68,24,${.42 + seeded(i, 6) * .34})`
            : `rgba(236,255,170,${.34 + seeded(i, 7) * .34})`;
          ctx.lineWidth = 1.0 + seeded(i, 8) * 1.45;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.sin(angle) * length, y - length);
          ctx.stroke();
        }
        for (let i = 0; i < 210; i++) {
          const x = seeded(i, 11) * 256, y = seeded(i, 12) * 256;
          const r = 1.2 + seeded(i, 13) * 3.3;
          ctx.fillStyle = `rgba(15,72,35,${.22 + seeded(i, 14) * .24})`;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        for (let i = 0; i < 150; i++) {
          const x = seeded(i, 21) * 256, y = seeded(i, 22) * 256;
          ctx.fillStyle = `rgba(246,255,176,${.34 + seeded(i, 23) * .38})`;
          ctx.fillRect(x, y, 1.2 + seeded(i, 24) * 1.8, 1.2 + seeded(i, 25) * 1.8);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(name.includes('island-top') ? 4.6 : 2.9, name.includes('island-top') ? 4.6 : 2.9);
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(16, kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        texture.needsUpdate = true;
        if (kaykit3D) kaykit3D.materials.set(key, texture);
        return texture;
      }

      function makeKayKitPedestal(ownerColor = null, { sanctuary = false } = {}) {
        // FUITE (corrigee) : appelee une fois par case en terre non-île a
        // CHAQUE synchronisation de scene (survol, selection, deplacement...),
        // sans jamais mettre en cache l'ExtrudeGeometry biseautee — la forme
        // extrudee est pourtant TOUJOURS identique, aucun parametre ne la fait
        // varier. Sur un plateau a une dizaine de cases en terre, chaque sync
        // creait une dizaine d'ExtrudeGeometry neuves (le type de geometrie le
        // plus couteux a construire ici), jamais liberees. Mesure en jeu : une
        // seule action de deplacement en creait 16.
        const group = new THREE.Group();
        const geometry = kaykitGeometry("pedestal-extrude-v1", () => {
          const shape = new THREE.Shape();
          shape.moveTo(-.46, -.46); shape.lineTo(.46, -.46); shape.lineTo(.46, .46); shape.lineTo(-.46, .46); shape.closePath();
          return new THREE.ExtrudeGeometry(shape, { depth: .42, bevelEnabled: true, bevelSegments: 2, bevelSize: .055, bevelThickness: .05, steps: 1 });
        });
        const topColor = sanctuary ? 0x8fd8d4 : 0x70bd72;
        const sideColor = sanctuary ? 0x496f77 : 0x506949;
        const topMat = new THREE.MeshStandardMaterial({ color: topColor, map: kaykitCanvasTexture(sanctuary ? 'sanctuary' : 'pedestal', sanctuary ? '#9fe8df' : '#79c77b', sanctuary ? '#5aaeb1' : '#4f9e61'), roughness: .82 });
        const sideMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: .96 });
        const mesh = new THREE.Mesh(geometry, [topMat, sideMat]);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = .47;
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        if (ownerColor !== null) {
          const outline = new THREE.LineLoop(
            kaykitGeometry("pedestal-outline-v1", () => new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-.45, .008, -.45), new THREE.Vector3(.45, .008, -.45), new THREE.Vector3(.45, .008, .45), new THREE.Vector3(-.45, .008, .45)
            ])),
            new THREE.LineBasicMaterial({ color: ownerColor, transparent: true, opacity: .95, depthWrite: false })
          );
          outline.position.y = .012; group.add(outline);

          // DESSOUS DES PLATEFORMES DE CHÂTEAU — montagne KayKit retournée.
          // Remplace un ConeGeometry surmonté de trois pointes : le même bricolage
          // procédural que celui abandonné pour l'archipel lointain, et pour la même
          // raison — un cône ne fait pas une île, il fait un cône.
          //
          // Une montagne nue retournée résout tout d'un coup : sa pente donne la pointe
          // rocheuse de l'île suspendue, et sa base large et plate vient se loger sous
          // la plateforme sans qu'on ait à raccorder quoi que ce soit. Même pièce et
          // même geste que makeKayKitFloatingIsle, donc cohérence garantie entre le
          // socle des joueurs et l'archipel du fond.
          //
          // La variante est tirée de la couleur du propriétaire : les quatre châteaux
          // n'ont pas le même rocher, sans qu'aucun ne soit choisi à la main.
          const varianteRoche = ["bareMountainA", "bareMountainB", "bareMountainC"][Math.abs(ownerColor) % 3];
          const roche = cloneKayKitAsset(varianteRoche, {
            maxWidth: 1.02, maxHeight: .86, targetFloor: 0
          });
          if (roche) {
            roche.rotation.x = Math.PI;              // pointe vers le bas
            roche.rotation.y = (Math.abs(ownerColor) % 7) * .9;
            roche.position.y = .14;                  // remonte sous la plateforme
            roche.traverse(child => {
              if (!child.isMesh) return;
              child.castShadow = false;
              child.receiveShadow = false;
            });
            group.add(roche);
            group.userData.ilyosSocleRocheux = true;
          } else {
            // Repli si le modèle n'est pas encore chargé : l'ancien cône, pour ne
            // jamais laisser une plateforme flotter sans dessous. Une passe de reprise
            // (kaykitReprendreSoclesRocheux) remplacera ce cône par la montagne dès que
            // les modèles seront chargés : les plateformes, elles, ne sont reconstruites
            // qu'au premier changement de couche d'île, ce qui serait trop tard.
            const underRock = new THREE.Mesh(
              kaykitGeometry("pedestal-underside-rock-v1", () => new THREE.ConeGeometry(.56, .62, 6)),
              new THREE.MeshStandardMaterial({ color: KAYKIT_HULL_COLOR_MID.getHex(), roughness: .92 })
            );
            underRock.rotation.x = Math.PI;
            underRock.position.y = -.36;
            underRock.castShadow = false; underRock.receiveShadow = false;
            group.add(underRock);
            group.userData.ilyosSocleRocheux = false;
            group.userData.ilyosSocleCouleur = ownerColor;
          }
        }
        return group;
      }

      function addCellHighlight(r, c, classList) {
        if (!kaykit3D || !classList) return;
        // Dès l'entrée en MAGIE avec une île choisie, le ghost 3D (contour d'origine +
        // bloc teinté vert/rouge, voir renderKayKitMagicRotationPreview) s'affiche en
        // continu — plus seulement une fois la rotation amorcée (magicPreviewSteps
        // ≠ 0). Les carrés plats ci-dessous ne font donc plus que doubler ce ghost,
        // même à 0 cran : on les masque pour toute la durée de l'action, pas
        // seulement après le premier cran de rotation.
        const magicGhostActive = state?.phase === "ACTION" && state?.selectedActionType === "MAGIC" && !!state?.selectedIslandId;
        // Même principe que pour la rotation magique : le ghost 3D de
        // renderKayKitPlacementPreview() (vrai modèle d'île, teinté vert/rouge)
        // montre déjà l'empreinte exacte. Le carré plat en dessous ne ferait
        // plus que la doubler d'un gros aplat coloré — on le masque.
        const placementGhostActive = state?.phase === "PLACE_ISLAND" && !!state?.hoverAnchor;
        // placeIsland() laisse state.selectedIslandId sur l'île tout juste posée,
        // ce qui ajoute la classe "selected" à CHACUNE de ses cases. Le sceau de
        // sélection ci-dessous (halo or, lueur, anneau runique, lumière) est conçu
        // pour UN gardien : appliqué à toute l'île pendant l'invocation, il empile
        // 3 à 5 disques concentriques par case et masque le ghost du gardien.
        // Les anneaux d'invocation (addKayKitSpawnAffordance) portent déjà cette
        // information — on masque le sceau d'île pendant cette phase.
        const islandSealSuppressed = state?.phase === "PLACE_SPAWN";
        const unifiedPushActive = !!state?.pushOptions?.length;
        let color = null, fillOpacity = .30, lineOpacity = 1, kind = "generic", size = .84;
        // fx-push/fx-move pilotaient un anneau de "validation" affiché après coup, une
        // fois le déplacement/la poussée terminés — retiré : plus aucune trace visuelle
        // au sol une fois l'action jouée (voir le bloc resultRing, supprimé plus bas).
        if (!placementGhostActive && classList.contains("preview-invalid")) { color = 0xff2948; fillOpacity = .64; kind = "invalid"; size = .90 }
        else if (!placementGhostActive && classList.contains("preview-valid")) { color = 0x18ef91; fillOpacity = .62; kind = "place"; size = .90 }
        else if (!magicGhostActive && (classList.contains("magic-valid") || classList.contains("magic-selected-island"))) { color = 0xb930ff; fillOpacity = .58; lineOpacity = 1; kind = "magic"; size = .90 }
        else if (!magicGhostActive && classList.contains("magic-invalid")) { color = 0xff4058; fillOpacity = .52; kind = "invalid"; size = .90 }
        // Le gardien sélectionné (selected-character) n'a plus de marqueur au sol : il
        // brille lui-même à la place (voir la boucle de rendu des héros, plus bas, et
        // l'émissif pulsé dans animateKayKit3D). Seule une ÎLE sélectionnée (classe
        // "selected" générique, hors invocation) garde ce sceau au sol.
        else if (!islandSealSuppressed && classList.contains("selected")) { color = 0xc9a45d; fillOpacity = .64; lineOpacity = 1; kind = "selected"; size = .88 }
        else if (!unifiedPushActive && classList.contains("push-fall-preview")) { color = 0xff3f45; fillOpacity = .58; kind = "push-danger"; size = .90 }
        else if (!unifiedPushActive && classList.contains("push-target-preview")) { color = 0xffa044; fillOpacity = .58; kind = "push-target"; size = .90 }
        else if (!unifiedPushActive && (classList.contains("push-destination") || classList.contains("push-destination-preview"))) { color = 0xff7442; fillOpacity = .46; kind = "push" }
        else if (!unifiedPushActive && classList.contains("push-line-preview")) { color = 0xffb14b; fillOpacity = .34; kind = "push" }
        else if (classList.contains("direct-move-candidate")) { color = 0x67c8ea; fillOpacity = .42; lineOpacity = 1; kind = "direct-move"; size = .88 }
        // Marron uniforme (0xd9922f) sur tout l'identifiant "move", diagonale comprise :
        // ces cases utilisaient encore deux bleus cyan (0x63e6ff/0x36e6a3), en décalage
        // avec le reste du déplacement déjà recoloré.
        else if (classList.contains("diagonal-step-preview")) { color = 0xd9922f; fillOpacity = .46; kind = "move" }
        else if (classList.contains("move-target-preview")) { color = 0xd9922f; fillOpacity = .58; kind = "move"; size = .90 }
        else if (classList.contains("move-path-preview")) { color = 0xd9922f; fillOpacity = .34; kind = "move" }
        else if (classList.contains("reachable")) { color = 0xd9922f; fillOpacity = .52; kind = "move" }

        // SYNCHRONISATION INCRÉMENTALE (V77) : cette fonction est appelée pour
        // les 121 cases à CHAQUE sync (survol, sélection, déplacement...), mais
        // la plupart des cases n'ont pas changé d'un appel à l'autre. On calcule
        // une signature compacte de la surbrillance voulue et on la compare à
        // celle déjà affichée pour cette case — si rien n'a changé, on ne touche
        // à rien (ni la scène, ni animatedObjects). Auparavant, TOUTE la scène
        // dynamique était détruite et reconstruite à chaque sync, y compris pour
        // un simple survol de case.
        const registryKey = `${r},${c}`;
        const registry = kaykit3D.highlightRegistry;
        const existing = registry.get(registryKey);
        const signature = color === null ? "" : `${kind}|${color}|${size}|${fillOpacity}|${lineOpacity}`;

        if (existing && existing.signature === signature) return; // rien n'a changé pour cette case

        if (existing) {
          disposeKayKitObjects(existing.objects);
          registry.delete(registryKey);
        }
        if (color === null) return; // la case n'a plus de surbrillance : suppression déjà faite ci-dessus

        const created = [];
        const add = object => { kaykit3D.dynamicGroup.add(object); created.push(object); };

        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
        const y = p.y + .026;
        // Le gardien sélectionné mérite un halo rond épuré plutôt qu'un cadre carré
        // encombré de bordures et de coches : c'est ce halo que le joueur regarde
        // en premier, il doit rester net sur toute case (herbe, village, île sombre).
        const isSelected = kind === "selected" || kind === "direct-move";

        // Ombre de contraste : rend la sélection lisible sur herbe, pierre et village.
        const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x071316, transparent: true, opacity: .62, depthWrite: false, depthTest: true, side: THREE.DoubleSide });
        shadowMaterial.userData.ilyosTransient = true;
        const shadow = new THREE.Mesh(
          isSelected
            ? kaykitGeometry("cell-highlight-shadow-round-v1", () => new THREE.CircleGeometry(.49, 28))
            : kaykitGeometry("cell-highlight-shadow-v25", () => new THREE.PlaneGeometry(.94, .94)),
          shadowMaterial
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(p.x, y - .006, p.z);
        shadow.renderOrder = 27;
        add(shadow);

        // Les géométries passent par le cache kaykitGeometry (un petit nombre de
        // tailles/natures discrètes .84/.88/.90 × quelques genres suffit à couvrir
        // tous les cas) ; les matériaux, eux, varient réellement par instance
        // (couleur/opacité propres à cette case) et sont tagués `ilyosTransient`
        // pour être disposés par disposeKayKitObjects quand cette case change.
        const fillMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.NormalBlending });
        fillMaterial.userData.ilyosTransient = true;
        const fill = new THREE.Mesh(
          isSelected
            ? kaykitGeometry(`cell-highlight-fill-circle-${size}`, () => new THREE.CircleGeometry(size / 2, 28))
            : kaykitGeometry(`cell-highlight-fill-plane-${size}`, () => new THREE.PlaneGeometry(size, size)),
          fillMaterial
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(p.x, y, p.z);
        fill.renderOrder = 30;
        add(fill);

        if (!isSelected) {
          const outerMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .98, depthWrite: false, depthTest: true });
          outerMaterial.userData.ilyosTransient = true;
          const outer = new THREE.LineLoop(
            kaykitGeometry(`cell-highlight-outline-outer-${size}`, () => new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-size / 2, 0, -size / 2), new THREE.Vector3(size / 2, 0, -size / 2),
              new THREE.Vector3(size / 2, 0, size / 2), new THREE.Vector3(-size / 2, 0, size / 2)
            ])),
            outerMaterial
          );
          outer.position.set(p.x, y + .008, p.z);
          outer.renderOrder = 32;
          add(outer);

          const innerSize = size - .11;
          const innerMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: lineOpacity, depthWrite: false, depthTest: true });
          innerMaterial.userData.ilyosTransient = true;
          const inner = new THREE.LineLoop(
            kaykitGeometry(`cell-highlight-outline-inner-${size}`, () => new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-innerSize / 2, 0, -innerSize / 2), new THREE.Vector3(innerSize / 2, 0, -innerSize / 2),
              new THREE.Vector3(innerSize / 2, 0, innerSize / 2), new THREE.Vector3(-innerSize / 2, 0, innerSize / 2)
            ])),
            innerMaterial
          );
          inner.position.set(p.x, y + .012, p.z);
          inner.renderOrder = 33;
          add(inner);

          // Bordure volumique : LineBasicMaterial reste souvent trop fin sous WebGL.
          // Quatre barres 3D garantissent une sélection très lisible sur une île.
          const borderThickness = kind === "magic" ? .105 : (kind === "place" || kind === "invalid") ? .082 : .060;
          const borderHeight = kind === "magic" ? .042 : .030;
          const borderMaterial = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            depthTest: true
          });
          borderMaterial.userData.ilyosTransient = true;
          const borderY = y + .021;
          const horizontalGeometry = kaykitGeometry(`cell-highlight-border-h-${size}-${borderHeight}-${borderThickness}`, () => new THREE.BoxGeometry(size, borderHeight, borderThickness));
          const verticalGeometry = kaykitGeometry(`cell-highlight-border-v-${size}-${borderHeight}-${borderThickness}`, () => new THREE.BoxGeometry(borderThickness, borderHeight, size));
          [
            [horizontalGeometry, 0, -size / 2], [horizontalGeometry, 0, size / 2],
            [verticalGeometry, -size / 2, 0], [verticalGeometry, size / 2, 0]
          ].forEach(([geometry, dx, dz]) => {
            const bar = new THREE.Mesh(geometry, borderMaterial);
            bar.position.set(p.x + dx, borderY, p.z + dz);
            bar.renderOrder = 36;
            add(bar);
          });
        }

        if (kind === "place" || kind === "invalid") {
          const tickMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, depthTest: true });
          tickMat.userData.ilyosTransient = true;
          const ticksGeometry = kaykitGeometry(`cell-highlight-ticks-${size}`, () => {
            const s = size / 2, l = .18;
            const pts = [];
            [[-s, -s, 1, 1], [s, -s, -1, 1], [s, s, -1, -1], [-s, s, 1, -1]].forEach(([x, z, dx, dz]) => {
              pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + dx * l, 0, z));
              pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0, z + dz * l));
            });
            return new THREE.BufferGeometry().setFromPoints(pts);
          });
          const ticks = new THREE.LineSegments(ticksGeometry, tickMat);
          ticks.position.set(p.x, y + .016, p.z);
          ticks.renderOrder = 34;
          add(ticks);
        }

        // Halo rond à deux couches : un anneau net qui porte la couleur du joueur,
        // entouré d'une lueur douce plus large. Reste lisible même recouvert par un hover.
        if (isSelected) {
          const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffe9a8,
            transparent: true,
            opacity: .34,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
          });
          glowMaterial.userData.ilyosTransient = true;
          const glow = new THREE.Mesh(kaykitGeometry("selection-glow-v1", () => new THREE.RingGeometry(.18, .47, 40)), glowMaterial);
          glow.rotation.x = -Math.PI / 2;
          glow.position.set(p.x, y + .05, p.z);
          glow.renderOrder = 52;
          glow.userData.pulse = true;
          glow.userData.pulsePhase = (r * 11 + c) * .37 + .6;
          // Déjà poussé dans animatedObjects ci-dessous (pour le pulse) : on fixe
          // juste le fondu ici plutôt que de rappeler registerKayKitFadeIn, qui
          // le pousserait une seconde fois dans la même liste.
          glow.userData.fadeIn = { start: performance.now(), duration: 140, target: glowMaterial.opacity };
          glowMaterial.opacity = 0;
          add(glow);
          kaykit3D.animatedObjects.push(glow);

          const haloMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff09a,
            transparent: true,
            opacity: .96,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
          });
          haloMaterial.userData.ilyosTransient = true;
          const halo = new THREE.Mesh(kaykitGeometry("selection-ring-v1", () => new THREE.RingGeometry(.32, .40, 40)), haloMaterial);
          halo.rotation.x = -Math.PI / 2;
          halo.position.set(p.x, y + .065, p.z);
          halo.renderOrder = 54;
          halo.userData.pulse = true;
          halo.userData.pulsePhase = (r * 11 + c) * .37;
          halo.userData.fadeIn = { start: performance.now(), duration: 140, target: haloMaterial.opacity };
          haloMaterial.opacity = 0;
          add(halo);
          kaykit3D.animatedObjects.push(halo);

          const selectionLight = new THREE.PointLight(0xffdf5a, .46, 1.9, 2);
          selectionLight.position.set(p.x, y + .62, p.z);
          add(selectionLight);

          // Sceau céleste : anneau bleu doux + petits repères "runiques" en
          // bordure du halo or, tournant très lentement — complète le halo
          // or existant ci-dessus sans le remplacer. Groupe unique pour que
          // l'anneau et les repères tournent ensemble (voir animatedObjects
          // plus bas, propriété slowSpin).
          const runeGroup = new THREE.Group();
          runeGroup.position.set(p.x, y + .058, p.z);
          runeGroup.rotation.x = -Math.PI / 2;
          runeGroup.renderOrder = 53;

          const blueRingMaterial = new THREE.MeshBasicMaterial({ color: 0x67c8ea, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
          blueRingMaterial.userData.ilyosTransient = true;
          const blueRing = new THREE.Mesh(
            kaykitGeometry("selection-ring-blue-v1", () => new THREE.RingGeometry(.43, .465, 40)),
            blueRingMaterial
          );
          runeGroup.add(blueRing);

          const runeCount = 8;
          const runePoints = [];
          for (let i = 0; i < runeCount; i++) {
            const angle = (i / runeCount) * Math.PI * 2;
            runePoints.push(
              new THREE.Vector3(Math.cos(angle) * .40, 0, Math.sin(angle) * .40),
              new THREE.Vector3(Math.cos(angle) * .475, 0, Math.sin(angle) * .475)
            );
          }
          const runesMaterial = new THREE.LineBasicMaterial({ color: 0x67c8ea, transparent: true, opacity: .85, depthWrite: false, depthTest: false });
          runesMaterial.userData.ilyosTransient = true;
          const runes = new THREE.LineSegments(
            kaykitGeometry("selection-runes-v1", () => new THREE.BufferGeometry().setFromPoints(runePoints)),
            runesMaterial
          );
          runeGroup.add(runes);

          add(runeGroup);
          runeGroup.userData.slowSpin = true;
          kaykit3D.animatedObjects.push(runeGroup);
        }

        registry.set(registryKey, { signature, objects: created });
      }

      // Fondu d'apparition pour un marqueur 3D éphémère (anneau d'affordance,
      // halo...) : ces meshes sont détruits puis recréés à chaque
      // refreshKayKitHoverPreviews(), donc une simple opacité fixe "pop"
      // sans transition possible côté Three.js. On démarre à 0 et on laisse
      // la boucle d'animation (voir kaykit3D.animatedObjects) remonter vers
      // l'opacité cible en douceur, sans changer le marqueur lui-même.
      function registerKayKitFadeIn(mesh, duration = 140) {
        if (!mesh || !kaykit3D) return mesh;
        // Groupe (ex. ghost de placement, un bloc par case) : même traitement
        // sur chaque mesh transparent qu'il contient, chacun animé séparément.
        if (!mesh.material) {
          mesh.traverse?.(child => {
            if (child.isMesh && child.material?.transparent) registerKayKitFadeIn(child, duration);
          });
          return mesh;
        }
        if (!mesh.material.transparent) return mesh;
        const target = mesh.material.opacity;
        mesh.material.opacity = 0;
        mesh.userData.fadeIn = { start: performance.now(), duration, target };
        kaykit3D.animatedObjects.push(mesh);
        return mesh;
      }

      // Marqueur "possibilité" lisible dès la sélection, sans remplir la case :
      // un anneau à vraie épaisseur (Torus), ~35% de la largeur de case, pas un
      // point plat. Coût 1 = anneau simple ; coût 2+ = second anneau concentrique,
      // pour distinguer une diagonale au repos sans avoir à la survoler.
      function addKayKitMoveAffordance(r, c, costTier) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group) return;
        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c) + .022);
        // Bronze ambré (0xd9922f), même identité que le surlignage "case atteignable"
        // (move-target-preview/reachable dans addCellHighlight). Un premier essai en
        // marron désaturé (0x9c6b3f) se délavait en gris une fois mélangé en
        // transparence au vert saturé du plateau — même hue, valeur trop proche. Le
        // contraste vient maintenant de la VALEUR autant que de la teinte : liseré
        // sombre (quasi opaque) juste sous l'anneau clair, comme un contour de bande
        // dessinée — la combinaison reste lisible sur n'importe quel fond, pas
        // seulement celui-ci.
        const outerStroke = new THREE.Mesh(
          kaykitGeometry("smart-move-ring-stroke-v1", () => new THREE.TorusGeometry(.165, .040, 8, 28)),
          new THREE.MeshBasicMaterial({ color: 0x3d2408, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide })
        );
        outerStroke.rotation.x = -Math.PI / 2;
        outerStroke.position.set(p.x, p.y - .002, p.z);
        outerStroke.renderOrder = 19;
        group.add(outerStroke);
        registerKayKitFadeIn(outerStroke);
        const outer = new THREE.Mesh(
          kaykitGeometry("smart-move-ring-outer-v1", () => new THREE.TorusGeometry(.16, .026, 8, 28)),
          new THREE.MeshBasicMaterial({ color: 0xd9922f, transparent: true, opacity: .94, depthWrite: false, side: THREE.DoubleSide })
        );
        outer.rotation.x = -Math.PI / 2;
        outer.position.set(p.x, p.y, p.z);
        outer.renderOrder = 20;
        group.add(outer);
        registerKayKitFadeIn(outer);
        if (costTier >= 2) {
          const inner = new THREE.Mesh(
            kaykitGeometry("smart-move-ring-inner-v1", () => new THREE.TorusGeometry(.095, .020, 8, 24)),
            new THREE.MeshBasicMaterial({ color: 0xd9922f, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide })
          );
          inner.rotation.x = -Math.PI / 2;
          inner.position.set(p.x, p.y + .003, p.z);
          inner.renderOrder = 21;
          group.add(inner);
          registerKayKitFadeIn(inner);
        }
      }

      // Anneau orange compact directement sous le personnage/couronne poussable
      // — jamais une zone colorée sur toute la case, le modèle reste intact.
      function addKayKitPushAffordance(r, c) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group) return;
        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c) + .024);
        const ring = new THREE.Mesh(
          kaykitGeometry("smart-push-ring-v1", () => new THREE.TorusGeometry(.19, .026, 8, 26)),
          new THREE.MeshBasicMaterial({ color: 0xce8b55, transparent: true, opacity: .68, depthWrite: false, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, p.y, p.z);
        ring.renderOrder = 20;
        group.add(ring);
        registerKayKitFadeIn(ring);
      }

      function registerUnifiedPushInteraction(object, interaction, option) {
        if (!kaykit3D || !object || !option) return;
        object.userData.ilyosInteraction = interaction;
        object.userData.pushOptionId = option.id;
        kaykit3D.interactiveMeshes.push(object);
      }

      function addKayKitPushDestination(option, emphasized = false) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group || option.fell || !Number.isFinite(option.r) || !Number.isFinite(option.c)) return;
        const p = kaykitCellPosition(option.r, option.c, kaykitCellSurfaceY(option.r, option.c) + .04);
        const ring = new THREE.Mesh(
          kaykitGeometry("unified-push-destination-ring-v1", () => new THREE.TorusGeometry(.22, .035, 10, 32)),
          new THREE.MeshBasicMaterial({
            color: emphasized ? 0xffd08a : 0xff8a32,
            transparent: true,
            opacity: emphasized ? 1 : .78,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, p.y, p.z);
        ring.scale.setScalar(emphasized ? 1.12 : 1);
        ring.renderOrder = 58;
        group.add(ring);

        const hit = new THREE.Mesh(
          kaykitGeometry("unified-push-destination-hit-v1", () => new THREE.CircleGeometry(.34, 24)),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: .001, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
        );
        hit.rotation.x = -Math.PI / 2;
        hit.position.set(p.x, p.y + .012, p.z);
        hit.renderOrder = 60;
        group.add(hit);
        registerUnifiedPushInteraction(hit, "push-destination", option);
      }

      function pushDeathTexture() {
        if (kaykit3D?.pushDeathTexture) return kaykit3D.pushDeathTexture;
        const canvas = document.createElement("canvas");
        canvas.width = 192;
        canvas.height = 192;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, 192, 192);
        context.shadowColor = "rgba(255, 176, 70, .85)";
        context.shadowBlur = 18;
        context.fillStyle = "#fff0c6";
        context.font = "bold 128px serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("☠", 96, 101);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        kaykit3D.pushDeathTexture = texture;
        return texture;
      }

      function addKayKitDeathPushDestination(option, position, emphasized = false) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group || !position) return;

        const halo = new THREE.Mesh(
          kaykitGeometry("unified-push-death-halo-v1", () => new THREE.TorusGeometry(.27, .045, 10, 32)),
          new THREE.MeshBasicMaterial({ color: 0xffa13d, transparent: true, opacity: emphasized ? .86 : .48, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.copy(position).add(new THREE.Vector3(0, -.24, 0));
        halo.renderOrder = 57;
        group.add(halo);

        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: pushDeathTexture(),
          transparent: true,
          opacity: emphasized ? 1 : .88,
          depthWrite: false,
          depthTest: false
        }));
        sprite.position.copy(position);
        sprite.scale.setScalar(emphasized ? .66 : .59);
        sprite.renderOrder = 59;
        group.add(sprite);

        const hit = new THREE.Mesh(
          kaykitGeometry("unified-push-death-hit-v1", () => new THREE.SphereGeometry(.36, 12, 8)),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: .001, depthWrite: false, depthTest: false })
        );
        hit.position.copy(position);
        hit.renderOrder = 60;
        group.add(hit);
        registerUnifiedPushInteraction(hit, "push-death-destination", option);
      }

      function renderUnifiedPushAffordances() {
        if (!kaykit3D || !state?.pushOptions?.length) return;
        const hoveredId = state.pushHoverOptionId;
        const lines = new Map();

        state.pushOptions.forEach(option => {
          const lineKey = [
            option.pusherId,
            option.targetType || "character",
            option.targetId,
            option.dr,
            option.dc
          ].join(":");
          if (!lines.has(lineKey)) lines.set(lineKey, []);
          lines.get(lineKey).push(option);
        });

        lines.forEach(options => {
          const target = options[0].targetType === "crown"
            ? artifactById(options[0].targetId)
            : characterById(options[0].targetId);
          if (!target) return;
          const hovered = options.find(option => option.id === hoveredId) || null;
          addKayKitPushAffordance(target.r, target.c);

          options.forEach(option => {
            const emphasized = option.id === hoveredId;
            if (!option.fell) {
              addKayKitPushDestination(option, emphasized);
              return;
            }
            const edge = kaykitCellPosition(option.lastLandR, option.lastLandC, kaykitCellSurfaceY(option.lastLandR, option.lastLandC));
            const direction = new THREE.Vector3(option.dc, 0, option.dr).normalize();
            const deathPosition = new THREE.Vector3(edge.x, edge.y, edge.z)
              .add(direction.multiplyScalar(.85));
            deathPosition.y += .35;
            addKayKitDeathPushDestination(option, deathPosition, emphasized);
          });

          const furthest = hovered || [...options].sort((a, b) => b.force - a.force)[0];
          const arrowEnd = furthest.fell
            ? [furthest.lastLandR + furthest.dr, furthest.lastLandC + furthest.dc]
            : [furthest.r, furthest.c];
          addKayKitPushDirection(
            { r: target.r, c: target.c },
            [target.r + furthest.dr, target.c + furthest.dc],
            arrowEnd
          );

          if (hovered?.preview?.impacts) {
            hovered.preview.impacts.forEach(impact => {
              if (!impact.to) return;
              addKayKitActionPreviewCell(impact.to[0], impact.to[1], {
                color: 0xffb15c,
                opacity: .34,
                size: .64
              });
            });
          }
        });
      }

      // Anneau discret sur chaque case d'invocation valable de la nouvelle île,
      // visible dès l'entrée en PLACE_SPAWN (même idiome que les affordances
      // MOVE/PUSH ci-dessus) : le joueur voit où il peut invoquer avant même
      // de survoler une case précise.
      function addKayKitSpawnAffordance(r, c) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group) return;
        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c) + .022);
        const ring = new THREE.Mesh(
          kaykitGeometry("spawn-ring-v1", () => new THREE.TorusGeometry(.17, .024, 8, 26)),
          new THREE.MeshBasicMaterial({ color: 0x1fbfa6, transparent: true, opacity: .82, depthWrite: false, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, p.y, p.z);
        ring.renderOrder = 20;
        group.add(ring);
        registerKayKitFadeIn(ring);
      }

      // Un seul représentant par joueur suffit pour un ghost : contrairement au
      // héros réel (voir teamHeroPools plus bas), il n'a pas besoin de refléter
      // exactement quel modèle sera tiré, seulement "un gardien de cette équipe".
      const KAYKIT_SPAWN_GHOST_HERO = { 0: "hero0", 1: "hero1", 2: "hero2", 3: "hero3" };

      // Ghost du gardien à invoquer, survolé pendant PLACE_SPAWN : réutilise le
      // même clonage d'asset que le héros réel (voir la boucle state.characters
      // plus bas), en plus translucide — "si je clique ici, il apparaîtra ainsi".
      function addKayKitSpawnGuardianGhost(r, c, playerId) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group) return;
        const assetKey = KAYKIT_SPAWN_GHOST_HERO[playerId] || "hero0";
        // Le fantôme de pose peut réclamer un héros avant qu'aucun gardien de
        // ce joueur n'existe : il doit donc pouvoir déclencher le chargement
        // lui aussi, sinon il resterait sur le modèle de secours pendant toute
        // la phase de placement d'une partie à trois ou quatre.
        ensureKayKitAsset(assetKey);
        let hero = cloneKayKitAsset(assetKey, { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
        if (!hero) hero = makeFallbackHero(playerId);
        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
        hero.position.set(p.x, p.y, p.z);
        hero.rotation.y = kaykitFacingRotation(r, c, CENTER.r, CENTER.c);
        const accent = new THREE.Color(state.players[playerId]?.color || PLAYER_COLORS[playerId] || "#ffffff");
        hero.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const cloned = materials.map(material => {
            const mat = material.clone();
            if ("emissive" in mat) { mat.emissive = accent.clone(); mat.emissiveIntensity = .22; }
            mat.transparent = true;
            mat.opacity = .74;
            mat.depthWrite = false;
            mat.needsUpdate = true;
            return mat;
          });
          child.material = Array.isArray(child.material) ? cloned : cloned[0];
          child.renderOrder = 21;
        });
        group.add(hero);
      }

      function addKayKitActionPreviewCell(r, c, {
        color,
        opacity = .34,
        size = .78,
        pulse = false
      }) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group) return;
        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
        const geometry = new THREE.PlaneGeometry(size, size);
        geometry.userData = { ...(geometry.userData || {}), ilyosTransient: true };
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: true
        });
        material.userData = { ...(material.userData || {}), ilyosTransient: true };
        const fill = new THREE.Mesh(geometry, material);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(p.x, p.y + .075, p.z);
        fill.renderOrder = 46;
        if (pulse) {
          fill.userData.pulse = true;
          fill.userData.pulsePhase = (r * 5 + c) * .41;
          kaykit3D.animatedObjects.push(fill);
        }
        group.add(fill);

        const half = size / 2;
        const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-half, 0, -half),
          new THREE.Vector3(half, 0, -half),
          new THREE.Vector3(half, 0, half),
          new THREE.Vector3(-half, 0, half)
        ]);
        outlineGeometry.userData = { ...(outlineGeometry.userData || {}), ilyosTransient: true };
        const outlineMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: .92,
          depthWrite: false,
          depthTest: false
        });
        outlineMaterial.userData = { ...(outlineMaterial.userData || {}), ilyosTransient: true };
        const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
        outline.position.set(p.x, p.y + .088, p.z);
        outline.renderOrder = 48;
        group.add(outline);
      }

      function addKayKitPushDirection(pusher, target, destination) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group || !pusher || !target) return;
        const from = kaykitCellPosition(pusher.r, pusher.c, kaykitCellSurfaceY(pusher.r, pusher.c) + .82);
        const endCell = destination || target;
        const to = kaykitCellPosition(endCell[0], endCell[1], kaykitCellSurfaceY(endCell[0], endCell[1]) + .82);
        const direction = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
        const length = direction.length();
        if (length < .05) return;
        direction.normalize();
        const arrowMaterial = new THREE.MeshBasicMaterial({
          color: 0xffa044,
          transparent: true,
          opacity: .98,
          depthWrite: false,
          depthTest: false
        });
        arrowMaterial.userData = { ...(arrowMaterial.userData || {}), ilyosTransient: true };
        const shaftLength = Math.max(.08, length - .22);
        const shaftGeometry = new THREE.CylinderGeometry(.035, .035, shaftLength, 8);
        shaftGeometry.userData = { ...(shaftGeometry.userData || {}), ilyosTransient: true };
        const shaft = new THREE.Mesh(shaftGeometry, arrowMaterial);
        shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        shaft.position.copy(from).addScaledVector(direction, shaftLength / 2);
        shaft.renderOrder = 54;
        group.add(shaft);

        const headGeometry = new THREE.ConeGeometry(.12, .24, 12);
        headGeometry.userData = { ...(headGeometry.userData || {}), ilyosTransient: true };
        const head = new THREE.Mesh(headGeometry, arrowMaterial);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        head.position.copy(from).addScaledVector(direction, Math.max(.12, length - .12));
        head.renderOrder = 55;
        group.add(head);
      }

      function refreshKayKitHoverPreviews() {
        if (!kaykit3D?.actionPreviewGroup || !state || document.body.dataset.visualMode !== "alternative") return;
        // Le gardien sélectionné via SMART_CHAR (clic direct) doit produire le même
        // aperçu 3D que l'action MOVE/PUSH classique : on couvre les deux chemins
        // ici plutôt que de dupliquer la simulation ou le rendu plus bas.
        const moveActive = (state.phase === "ACTION" && state.selectedActionType === "MOVE")
          || (state.phase === "SMART_CHAR" && state.smartHoverType === "MOVE");
        const pushActive = (state.phase === "ACTION" && state.selectedActionType === "PUSH")
          || (state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH");
        const unifiedPushActive = !!state.pushOptions?.length;
        // Gardien sélectionné en SMART_CHAR, avant même de survoler une case
        // précise : le plateau doit déjà montrer, discrètement, ce qu'il peut
        // faire (voir beginSmartCharacterAction). Reste actif même pendant un
        // hover, pour que les autres possibilités restent visibles autour de
        // l'option actuellement examinée.
        const smartResting = state.phase === "SMART_CHAR" && !!state.selectedCharId;
        const pushPreview = pushActive ? getPushHoverPreview() : null;
        const previewKey = JSON.stringify({
          phase: state.phase,
          action: state.selectedActionType,
          smartType: state.smartHoverType,
          selected: state.selectedCharId,
          hover: state.actionHoverCell,
          path: state.smartHoverPath,
          pathSteps: state.smartHoverPath?.steps,
          magicIsland: state.magicHoverIslandId,
          magicPivot: state.magicHoverPivot,
          push: pushPreview,
          force: pushPreview?.force ?? 0,
          pushOptions: unifiedPushActive ? state.pushOptions.map(option => option.id) : null,
          pushHover: state.pushHoverOptionId,
          resting: smartResting ? [...(state.reachable || [])] : null,
          spawnHover: state.phase === "PLACE_SPAWN" ? [state.pendingSpawnIslandId, state.hoverAnchor] : null
        });
        if (previewKey === kaykit3D.actionPreviewKey) return;
        kaykit3D.actionPreviewKey = previewKey;
        clearKayKitGroup(kaykit3D.actionPreviewGroup);
        kaykit3D.interactiveMeshes = (kaykit3D.interactiveMeshes || []).filter(object => !!object?.parent);
        kaykit3D.animatedObjects = kaykit3D.animatedObjects.filter(object => object?.parent);

        if (state.phase === "PLACE_SPAWN" && state.pendingSpawnIslandId) {
          const spawnIsland = state.islands.find(is => is.id === state.pendingSpawnIslandId);
          const hoverKey = state.hoverAnchor ? key(state.hoverAnchor[0], state.hoverAnchor[1]) : null;
          (spawnIsland?.cells || []).forEach(([r, c]) => {
            if (characterAt(r, c)) return;
            if (key(r, c) === hoverKey) return;
            addKayKitSpawnAffordance(r, c);
          });
          if (state.hoverAnchor) {
            const [hr, hc] = state.hoverAnchor;
            const allowed = !!spawnIsland?.cells?.some(([ir, ic]) => ir === hr && ic === hc) && !characterAt(hr, hc);
            if (allowed) addKayKitSpawnGuardianGhost(hr, hc, state.currentPlayer);
          }
          return;
        }

        if (smartResting) {
          const hoverKey = state.actionHoverCell ? key(state.actionHoverCell[0], state.actionHoverCell[1]) : null;
          const costs = state.reachable?.costs;
          (state.reachable || new Set()).forEach(cellKey => {
            if (cellKey === hoverKey) return;
            const [r, c] = cellKey.split(",").map(Number);
            addKayKitMoveAffordance(r, c, costs?.get(cellKey) || 1);
          });
        }

        if (unifiedPushActive) {
          renderUnifiedPushAffordances();
          return;
        }

        if (moveActive && state.selectedCharId) {
          const path = state.smartHoverPath || [];
          path.forEach(([r, c], index) => {
            const diagonal = !!path.steps?.[index]?.diagonal;
            addKayKitActionPreviewCell(r, c, {
              color: 0xd9922f,
              opacity: diagonal ? .46 : .30,
              size: .72
            });
          });
          if (state.actionHoverCell) {
            addKayKitActionPreviewCell(state.actionHoverCell[0], state.actionHoverCell[1], {
              color: 0xd9922f,
              opacity: .58,
              size: .88,
              pulse: true
            });
          }
          return;
        }

        if (pushActive && !unifiedPushActive) {
          const preview = pushPreview;
          (preview?.impacts || []).forEach(impact => {
            addKayKitActionPreviewCell(impact.from[0], impact.from[1], {
              color: impact.fell ? 0xff3f45 : 0xffa044,
              opacity: impact.fell ? .58 : .42,
              size: .84
            });
            if (impact.to) {
              addKayKitActionPreviewCell(impact.to[0], impact.to[1], {
                color: 0xff7442,
                opacity: .48,
                size: .86,
                pulse: true
              });
            }
          });
          if (state.actionHoverCell) {
            addKayKitActionPreviewCell(state.actionHoverCell[0], state.actionHoverCell[1], {
              color: 0xffa044,
              opacity: .58,
              size: .88
            });
            addKayKitPushDirection(
              characterById(state.selectedCharId),
              state.actionHoverCell,
              preview?.destination || null
            );
          }
          return;
        }

        if (
          (state.phase === "ACTION_SELECT" || (state.phase === "ACTION" && state.selectedActionType === "MAGIC"))
          && state.magicHoverIslandId
        ) {
          const island = state.islands.find(item => item.id === state.magicHoverIslandId);
          (island?.cells || []).forEach(([r, c]) => {
            const pivot = isSameCell(state.magicHoverPivot, [r, c]);
            addKayKitActionPreviewCell(r, c, {
              color: 0xc36cff,
              opacity: pivot ? .58 : .32,
              size: pivot ? .88 : .76,
              pulse: pivot
            });
          });
        }
      }

      function refreshKayKitHoverAfterSceneSync() {
        if (!kaykit3D) return;
        if (!canLocalPlayerAct()) {
          if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
          kaykit3D.cursorLabel?.classList.remove("visible");
          kaykit3D.canvas.style.cursor = "default";
          clearKayKitVisualHover();
          clearKayKitGroup(kaykit3D.actionPreviewGroup);
          kaykit3D.actionPreviewKey = null;
          return;
        }

        const hovered = kaykit3D.hoverCell;
        if (!hovered) {
          if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
          kaykit3D.cursorLabel?.classList.remove("visible");
          kaykit3D.canvas.style.cursor = "default";
          clearKayKitVisualHover();
          refreshKayKitHoverPreviews();
          return;
        }
        if (hovered.special) {
          if (kaykit3D.hoverMarker) kaykit3D.hoverMarker.visible = false;
          refreshKayKitHoverPreviews();
          return;
        }
        const intent = kaykitHoverIntent(hovered.r, hovered.c, hovered.hitAction);
        const p = kaykitCellPosition(hovered.r, hovered.c, kaykitCellSurfaceY(hovered.r, hovered.c) + .085);
        kaykit3D.hoverMarker.visible = true;
        kaykit3D.hoverMarker.position.set(p.x, p.y, p.z);
        applyKayKitHoverIntent(intent);
        setKayKitVisualHover(hovered, intent);
        kaykit3D.canvas.style.cursor = intent.actionable
          ? "pointer"
          : (intent.kind === "invalid" ? "not-allowed" : "crosshair");
        refreshKayKitHoverPreviews();
      }

      function resetKayKitPointerFeedback() {
        if (!kaykit3D) return;
        kaykit3D.hoverCell = null;
        if (kaykit3D.hoverMarker) {
          kaykit3D.hoverMarker.visible = false;
          kaykit3D.hoverMarker.scale.setScalar(1);
        }
        if (kaykit3D.cursorLabel) {
          kaykit3D.cursorLabel.textContent = "";
          kaykit3D.cursorLabel.dataset.kind = "neutral";
          kaykit3D.cursorLabel.classList.remove("visible");
        }
        kaykit3D.canvas.style.cursor = "default";
        clearKayKitVisualHover();
        clearKayKitGroup(kaykit3D.actionPreviewGroup);
        kaykit3D.actionPreviewKey = null;
      }


      function makeKayKitGhost(object, opacity = .5, tintColor = null) {
        if (!object) return object;
        object.traverse?.(child => {
          if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            const clones = materials.map(material => {
              const clone = material.clone();
              clone.transparent = true;
              clone.opacity = opacity;
              clone.depthWrite = false;
              if (tintColor !== null && clone.color) clone.color.lerp(new THREE.Color(tintColor), .18);
              if (tintColor !== null && "emissive" in clone) {
                clone.emissive = new THREE.Color(tintColor);
                clone.emissiveIntensity = .12;
              }
              clone.needsUpdate = true;
              return clone;
            });
            child.material = Array.isArray(child.material) ? clones : clones[0];
          }
        });
        return object;
      }

      function kaykitIslandComponents(cells) {
        const remaining = new Map((cells || []).map(([r, c]) => [`${r},${c}`, [r, c]]));
        const components = [];
        while (remaining.size) {
          const first = remaining.values().next().value;
          const queue = [first];
          const component = [];
          remaining.delete(`${first[0]},${first[1]}`);
          while (queue.length) {
            const [r, c] = queue.shift();
            component.push([r, c]);
            [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
              const k = `${nr},${nc}`;
              if (remaining.has(k)) {
                queue.push(remaining.get(k));
                remaining.delete(k);
              }
            });
          }
          components.push(component);
        }
        return components;
      }

      function kaykitIslandBoundary(component) {
        const edges = new Map();
        const pointKey = ([x, z]) => `${x},${z}`;
        const edgeKey = (a, b) => `${pointKey(a)}>${pointKey(b)}`;
        const addEdge = (a, b) => {
          const reverse = edgeKey(b, a);
          if (edges.has(reverse)) edges.delete(reverse);
          else edges.set(edgeKey(a, b), { a, b });
        };
        component.forEach(([r, c]) => {
          // Coordonnées multipliées par deux pour éviter les erreurs de flottants.
          const x0 = 2 * c - GRID, x1 = x0 + 2;
          const z0 = 2 * r - GRID, z1 = z0 + 2;
          addEdge([x0, z0], [x1, z0]);
          addEdge([x1, z0], [x1, z1]);
          addEdge([x1, z1], [x0, z1]);
          addEdge([x0, z1], [x0, z0]);
        });
        if (!edges.size) return [];
        const outgoing = new Map();
        edges.forEach(edge => {
          const k = pointKey(edge.a);
          if (!outgoing.has(k)) outgoing.set(k, []);
          outgoing.get(k).push(edge);
        });
        const first = edges.values().next().value;
        const loop = [first.a];
        let current = first.b;
        edges.delete(edgeKey(first.a, first.b));
        let guard = 0;
        while (pointKey(current) !== pointKey(loop[0]) && guard++ < 200) {
          loop.push(current);
          const candidates = (outgoing.get(pointKey(current)) || []).filter(edge => edges.has(edgeKey(edge.a, edge.b)));
          if (!candidates.length) break;
          const next = candidates[0];
          edges.delete(edgeKey(next.a, next.b));
          current = next.b;
        }
        return loop.map(([x, z]) => [(x / 2) * KAYKIT_CELL_SPACING, (z / 2) * KAYKIT_CELL_SPACING]);
      }

      // ── Coque d'île (visual-island-relief-v2) ──────────────────────────────
      // Une seule coque continue par composante connexe, construite à partir
      // du contour extérieur (kaykitIslandBoundary, inchangé) : anneau plein →
      // anneau intermédiaire → anneau final, resserrés vers l'intérieur, reliés
      // par des parois, fond fermé par une vraie triangulation. Aucune pièce
      // par case ni par bord — contrairement à la V1 (archivée sur
      // visual-island-relief-v1), qui produisait des blocs indépendants.
      // Purement décoratif, sous KAYKIT_LEVELS.board : jamais ajouté à
      // hitMeshes/interactiveMeshes (seules listes testées par le raycast —
      // voir buildKayKitStaticScene) + raycast = no-op en défense en profondeur.

      function kaykitPolygonSignedArea(points) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
          const [x0, z0] = points[i];
          const [x1, z1] = points[(i + 1) % points.length];
          area += x0 * z1 - x1 * z0;
        }
        return area / 2;
      }

      function kaykitSegmentsIntersect([ax, az], [bx, bz], [cx, cz], [dx, dz]) {
        const d1x = bx - ax, d1z = bz - az;
        const d2x = dx - cx, d2z = dz - cz;
        const denom = d1x * d2z - d1z * d2x;
        if (Math.abs(denom) < 1e-9) return false; // parallèles : pas d'intersection franche
        const t = ((cx - ax) * d2z - (cz - az) * d2x) / denom;
        const u = ((cx - ax) * d1z - (cz - az) * d1x) / denom;
        const eps = 1e-6;
        return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
      }

      // Un polygone rectiligne (tous les angles à 90°) est simple s'il n'a
      // aucune paire d'arêtes non adjacentes qui se croisent.
      function kaykitPolygonSelfIntersects(points) {
        const n = points.length;
        for (let i = 0; i < n; i++) {
          const a1 = points[i], a2 = points[(i + 1) % n];
          for (let j = i + 1; j < n; j++) {
            if (j === i || (j + 1) % n === i || i === (j + 1) % n) continue;
            if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue; // arêtes adjacentes
            const b1 = points[j], b2 = points[(j + 1) % n];
            if (kaykitSegmentsIntersect(a1, a2, b1, b2)) return true;
          }
        }
        return false;
      }

      // Rétrécit un contour fermé vers l'intérieur d'une distance donnée.
      // Robuste sur les coins concaves (L/T/croix) : normale intérieure
      // déterminée une fois pour tout le polygone via le signe de son aire
      // (donc valable aussi bien en coin convexe que rentrant), puis
      // intersection des droites d'arêtes décalées pour chaque sommet, avec
      // une distance de pointe clampée (jamais plus de miterLimit × distance)
      // pour éviter les pointes qui débordent au-delà du contour d'origine.
      // Le nombre de sommets ne change jamais : chaque anneau reste en
      // correspondance 1-pour-1 avec le contour d'origine, ce qui simplifie
      // la construction des parois entre anneaux.
      function kaykitOffsetPolygonInward(points, distance, { miterLimit = 3 } = {}) {
        const n = points.length;
        if (n < 3 || distance <= 0) return points.slice();
        const area = kaykitPolygonSignedArea(points);
        const inwardSign = area >= 0 ? 1 : -1;
        const edgeDirs = [];
        const edgeNormals = [];
        for (let i = 0; i < n; i++) {
          const [x0, z0] = points[i];
          const [x1, z1] = points[(i + 1) % n];
          const dx = x1 - x0, dz = z1 - z0;
          const len = Math.hypot(dx, dz) || 1;
          const dirX = dx / len, dirZ = dz / len;
          edgeDirs.push([dirX, dirZ]);
          // Normale à 90° de la direction d'arête ; le signe (déterminé par le
          // winding global) pointe toujours vers l'intérieur du polygone.
          edgeNormals.push([-dirZ * inwardSign, dirX * inwardSign]);
        }
        const result = [];
        for (let i = 0; i < n; i++) {
          const prev = (i - 1 + n) % n;
          const [px, pz] = points[i];
          const [d0x, d0z] = edgeDirs[prev];
          const [n0x, n0z] = edgeNormals[prev];
          const [d1x, d1z] = edgeDirs[i];
          const [n1x, n1z] = edgeNormals[i];
          // Point de départ + direction de chacune des deux droites décalées.
          const p0x = px + n0x * distance, p0z = pz + n0z * distance;
          const p1x = px + n1x * distance, p1z = pz + n1z * distance;
          const cross = d0x * d1z - d0z * d1x;
          let newX, newZ;
          if (Math.abs(cross) < 1e-6) {
            // Arêtes quasi colinéaires (sommet inutile côté source) : simple
            // translation moyenne, jamais de division par une quasi-nulle.
            newX = px + (n0x + n1x) * .5 * distance;
            newZ = pz + (n0z + n1z) * .5 * distance;
          } else {
            const t = ((p1x - p0x) * d1z - (p1z - p0z) * d1x) / cross;
            newX = p0x + d0x * t;
            newZ = p0z + d0z * t;
          }
          const rawX = newX - px, rawZ = newZ - pz;
          const rawLen = Math.hypot(rawX, rawZ);
          const maxLen = distance * miterLimit;
          if (rawLen > maxLen && rawLen > 1e-6) {
            const k = maxLen / rawLen;
            newX = px + rawX * k;
            newZ = pz + rawZ * k;
          }
          result.push([newX, newZ]);
        }
        return result;
      }

      // Tente l'offset ; si le résultat s'auto-intersecte (goulet trop étroit
      // pour la distance demandée), réduit progressivement la distance plutôt
      // que de produire une géométrie cassée.
      function kaykitSafeOffsetPolygonInward(points, distance) {
        let attemptDistance = distance;
        for (let attempt = 0; attempt < 4; attempt++) {
          const candidate = kaykitOffsetPolygonInward(points, attemptDistance);
          if (!kaykitPolygonSelfIntersects(candidate)) return candidate;
          attemptDistance *= 0.65;
        }
        return kaykitOffsetPolygonInward(points, attemptDistance);
      }

      function kaykitTriangulateRing(points) {
        const shapePoints = points.map(([x, z]) => new THREE.Vector2(x, z));
        return THREE.ShapeUtils.triangulateShape(shapePoints, []);
      }

      // Profil en 4 anneaux : ringA très peu resserré juste sous la tuile
      // (falaise quasi verticale) puis ring1/ring2 qui accentuent le
      // resserrement — silhouette "falaise puis masse rocheuse", plus un
      // socle trapézoïdal. Profondeur totale ~+31% par rapport à la passe
      // précédente (0.70 → 0.92 pour ring2) pour bien lire l'île comme
      // flottante en caméra normale ; des pointes rocheuses (voir plus bas)
      // descendent encore davantage sous ring2 par endroits.
      const KAYKIT_HULL_RINGA_INSET = KAYKIT_CELL_SPACING * .03;
      const KAYKIT_HULL_RING1_INSET = KAYKIT_CELL_SPACING * .10;
      const KAYKIT_HULL_RING2_INSET = KAYKIT_CELL_SPACING * .26;
      const KAYKIT_HULL_RINGA_DEPTH = .20;
      const KAYKIT_HULL_RING1_DEPTH = .48;
      const KAYKIT_HULL_RING2_DEPTH = .92;
      const KAYKIT_HULL_OVERLAP = .04; // chevauchement dans le dessous KayKit, jamais au-dessus de la surface jouable
      // Amplitude des micro-irrégularités déterministes (jamais sur ring0/ringA,
      // qui doivent rester nettes sous la tuile) : décalage latéral sur
      // ring1/ring2, variation de hauteur uniquement sur ring2 (le fond).
      const KAYKIT_HULL_JITTER_XZ = KAYKIT_CELL_SPACING * .03;
      const KAYKIT_HULL_JITTER_Y = KAYKIT_HULL_RING2_DEPTH * .065;
      // Variation "sculptée" du resserrement lui-même (pas juste un décalage
      // latéral) : chaque sommet de ring1/ring2 pousse son propre offset
      // intérieur (déjà validé sans auto-intersection à facteur 1) entre 70%
      // et 130% de la distance de base — certaines faces restent larges plus
      // longtemps, d'autres se contractent plus tôt. Bornes conservatrices :
      // même à 130%, l'inset final de ring2 (~34%) reste très en-deçà de la
      // moitié d'une case, donc pas de risque d'auto-intersection nouveau sur
      // les goulets à une case de large déjà validés par l'offset de base.
      const KAYKIT_HULL_ORGANIC_MIN = .70;
      const KAYKIT_HULL_ORGANIC_MAX = 1.30;

      // Calibré par échantillonnage réel en jeu (gl.readPixels sur le flanc
      // de terre KayKit visible juste au-dessus de la coque, éclairage B,
      // assets chargés) — pas une valeur théorique. Le flanc KayKit lit
      // autour de RGB(210,148,106) sur ses faces éclairées ; la teinte
      // "raccord" ci-dessous est calée dessus (légèrement retenue pour rester
      // cohérente une fois mélangée aux teintes plus sombres du dégradé).
      // La correction précédente (passe silhouette) était trop sombre :
      // le vrai problème de délavage venait du calibrage initial, pas d'un
      // effet d'éclairage à sur-corriger indéfiniment.
      // Re-calibré après comparaison face éclairée / face à l'ombre : la
      // teinte doit rester assez saturée pour survivre à la lumière hémisphère
      // (composante "sol" froide #56666a) qui délave nettement plus les faces
      // orientées vers le bas de la coque que le flanc KayKit (faces plus
      // variées). But : rester crédible côté soleil ET côté ombre, pas un
      // calibrage parfait dans un seul cas.
      const KAYKIT_HULL_COLOR_TOP = new THREE.Color(0xaf5f37);    // raccord terre KayKit, saturation encore relevée (faces sous la coque très diluées par la teinte "sol" de l'hémisphère)
      const KAYKIT_HULL_COLOR_MID = new THREE.Color(0x8f5228);    // moins orangé, plus minéral — même famille
      const KAYKIT_HULL_COLOR_BOTTOM = new THREE.Color(0x4a3223); // roche profonde, jamais noire

      // Point de contrôle intermédiaire légèrement avant la mi-hauteur : la
      // masse bascule vers le registre "minéral" assez tôt plutôt que de
      // s'attarder dans le ton terre chaude, sans pour autant créer de bande
      // nette (toujours un lerp continu de bout en bout).
      const KAYKIT_HULL_COLOR_MID_T = .42;

      function kaykitHullColorAt(y, yTop, yBottom, seed = 0) {
        const span = yTop - yBottom || 1;
        const t = Math.min(1, Math.max(0, (yTop - y) / span));
        const color = new THREE.Color();
        if (t <= KAYKIT_HULL_COLOR_MID_T) color.lerpColors(KAYKIT_HULL_COLOR_TOP, KAYKIT_HULL_COLOR_MID, t / KAYKIT_HULL_COLOR_MID_T);
        else color.lerpColors(KAYKIT_HULL_COLOR_MID, KAYKIT_HULL_COLOR_BOTTOM, (t - KAYKIT_HULL_COLOR_MID_T) / (1 - KAYKIT_HULL_COLOR_MID_T));
        // Variation de luminosité très subtile et déterministe (±4%) pour
        // casser l'uniformité plate sans bruit visible ni texture — un
        // multiplicateur par sommet, pas un motif.
        if (seed) {
          const lum = .96 + kaykitHash("hull-lum", seed) * .08;
          color.multiplyScalar(lum);
        }
        // CONVERSION sRGB → LINÉAIRE, et c'est elle qui fait tout ici.
        // Les textures KayKit sont déclarées en sRGB : le shader les décode donc vers
        // le linéaire avant l'éclairage. Les couleurs par sommet, elles, ne subissent
        // aucune conversion — elles sont prises telles quelles pour du linéaire.
        // Le même brun nominal ressortait donc bien plus clair sur la coque que sur le
        // bloc de terre au-dessus : la coque virait au crème et la jonction se lisait
        // comme une cassure franche entre deux matières étrangères.
        // Convertie, la coque retrouve exactement le registre du bloc KayKit.
        return color.convertSRGBToLinear();
      }

      // Décalage latéral déterministe très faible (2-4% d'une case), jamais
      // assez pour remettre en cause l'offset intérieur déjà validé — juste
      // de quoi casser l'aspect "extrusion CAO" sur les anneaux inférieurs.
      function kaykitHullJitterRing(ring, ring0Ref, ringTag) {
        return ring.map(([x, z], i) => {
          const [ox, oz] = ring0Ref[i];
          const jx = (kaykitHash("hull-jitter-x", ringTag, Math.round(ox * 1000), Math.round(oz * 1000)) - .5) * 2 * KAYKIT_HULL_JITTER_XZ;
          const jz = (kaykitHash("hull-jitter-z", ringTag, Math.round(ox * 1000), Math.round(oz * 1000)) - .5) * 2 * KAYKIT_HULL_JITTER_XZ;
          return [x + jx, z + jz];
        });
      }

      // Pousse chaque sommet plus ou moins loin le long de son propre vecteur
      // de resserrement déjà calculé (ring0 → ringBase), au lieu d'un anneau
      // uniformément plus petit. C'est ça qui donne "certaines portions
      // restent larges plus longtemps, d'autres se contractent plus tôt" —
      // une silhouette sculptée plutôt qu'une extrusion mathématique.
      function kaykitHullOrganicRing(ringBase, ring0Ref, ringTag) {
        return ringBase.map(([x, z], i) => {
          const [ox, oz] = ring0Ref[i];
          const factor = KAYKIT_HULL_ORGANIC_MIN + kaykitHash("hull-organic", ringTag, Math.round(ox * 1000), Math.round(oz * 1000)) * (KAYKIT_HULL_ORGANIC_MAX - KAYKIT_HULL_ORGANIC_MIN);
          return [ox + (x - ox) * factor, oz + (z - oz) * factor];
        });
      }

      // Fond légèrement irrégulier (±5-8%) : casse la ligne horizontale
      // parfaite du dessous sans remettre en cause la fermeture technique du
      // volume (le fond triangulé utilise ces mêmes hauteurs par sommet).
      function kaykitHullRing2YDeltas(ring0Ref, ringTag) {
        return ring0Ref.map(([ox, oz]) => {
          const roll = kaykitHash("hull-bottom-y", ringTag, Math.round(ox * 1000), Math.round(oz * 1000));
          return (roll - .5) * 2 * KAYKIT_HULL_JITTER_Y;
        });
      }

      // Pointes rocheuses intégrées à la même géométrie : jamais un cône
      // séparé. Chaque pointe part d'un sommet de ring2 (déjà place dans la
      // masse) et de ses deux voisins immédiats — la "naissance" de la
      // pointe, assez large — puis se referme sur un unique sommet-pointe
      // décalé latéralement (asymétrique, "cassé") et poussé plus bas. Le
      // nombre de pointes dépend de la taille du contour (nombre de sommets
      // de ring0), jamais du nombre de cases : pas une pointe par cellule.
      function kaykitHullSpikeAnchors(n, islandTag) {
        if (n <= 4) {
          // Petite île (~1 case) : rarement une pointe, jamais plus d'une.
          return kaykitHash("hull-spike-count-small", islandTag) < .45 ? 1 : 0;
        }
        if (n <= 8) {
          return kaykitHash("hull-spike-count-mid", islandTag) < .35 ? 2 : 1;
        }
        return kaykitHash("hull-spike-count-large", islandTag) < .5 ? 3 : 2;
      }

      function kaykitHullBuildSpikes(ring2, y2Arr, n, islandTag) {
        const spikeCount = kaykitHullSpikeAnchors(n, islandTag);
        if (!spikeCount) return [];
        const usedAnchors = new Set();
        const spikes = [];
        for (let s = 0; s < spikeCount; s++) {
          // Répartit les pointes autour du contour au lieu de les laisser
          // s'agglutiner au même endroit ; jitter déterministe pour éviter
          // une symétrie parfaite entre pointes.
          const spread = Math.round((s / spikeCount + kaykitHash("hull-spike-spread", islandTag, s) * .5) * n) % n;
          let anchor = spread;
          let guard = 0;
          while (usedAnchors.has(anchor) && guard++ < n) anchor = (anchor + 1) % n;
          usedAnchors.add(anchor);
          const prev = (anchor - 1 + n) % n;
          const next = (anchor + 1) % n;
          const rim = [prev, anchor, next];
          const cx = (ring2[prev][0] + ring2[anchor][0] + ring2[next][0]) / 3;
          const cz = (ring2[prev][1] + ring2[anchor][1] + ring2[next][1]) / 3;
          const cy = (y2Arr[prev] + y2Arr[anchor] + y2Arr[next]) / 3;
          const isDominant = s === 0;
          const depthFactor = isDominant
            ? 1.20 + kaykitHash("hull-spike-depth-dom", islandTag, s) * .15
            : 1.02 + kaykitHash("hull-spike-depth-sec", islandTag, s) * .10;
          const apexY = (KAYKIT_LEVELS.board + KAYKIT_HULL_OVERLAP - KAYKIT_HULL_RING2_DEPTH) - KAYKIT_HULL_RING2_DEPTH * (depthFactor - 1);
          // Décalage latéral de la pointe : casse la symétrie du cône,
          // jamais assez grand pour sortir de l'aplomb de la masse basse.
          const lateralAmp = KAYKIT_CELL_SPACING * (isDominant ? .16 : .10);
          const apexAngle = kaykitHash("hull-spike-angle", islandTag, s) * Math.PI * 2;
          const apexX = cx + Math.cos(apexAngle) * lateralAmp * (.4 + kaykitHash("hull-spike-lateral", islandTag, s) * .6);
          const apexZ = cz + Math.sin(apexAngle) * lateralAmp * (.4 + kaykitHash("hull-spike-lateral2", islandTag, s) * .6);
          spikes.push({ rim, apex: [apexX, apexY, apexZ] });
        }
        return spikes;
      }

      // Construit une seule géométrie fermée (anneau plein → falaise quasi
      // verticale → resserrement sculpté → fond légèrement irrégulier avec
      // quelques pointes rocheuses intégrées, fermé par une vraie
      // triangulation) à partir d'un contour en coordonnées locales (déjà
      // recentré sur l'île). Couleur en dégradé (attribut vertex color) du
      // ton terre KayKit en haut vers un brun rocheux plus sombre en bas et
      // dans les pointes.
      function kaykitBuildIslandHullGeometry(localContour) {
        const topY = KAYKIT_LEVELS.board + KAYKIT_HULL_OVERLAP;
        const ring0 = localContour;
        const ringA = kaykitSafeOffsetPolygonInward(localContour, KAYKIT_HULL_RINGA_INSET);
        let ring1 = kaykitSafeOffsetPolygonInward(localContour, KAYKIT_HULL_RING1_INSET);
        let ring2 = kaykitSafeOffsetPolygonInward(localContour, KAYKIT_HULL_RING2_INSET);
        // Resserrement sculpté (pas uniforme) sur ring1/ring2 uniquement —
        // ring0/ringA restent nets pour le raccord aux tuiles — puis le
        // micro-jitter latéral existant par-dessus.
        ring1 = kaykitHullOrganicRing(ring1, ring0, "ring1-organic");
        ring2 = kaykitHullOrganicRing(ring2, ring0, "ring2-organic");
        ring1 = kaykitHullJitterRing(ring1, ring0, "ring1");
        ring2 = kaykitHullJitterRing(ring2, ring0, "ring2");
        const ring2YDeltas = kaykitHullRing2YDeltas(ring0, "ring2-y");

        const y0 = topY, yA = topY - KAYKIT_HULL_RINGA_DEPTH, y1 = topY - KAYKIT_HULL_RING1_DEPTH, y2 = topY - KAYKIT_HULL_RING2_DEPTH;
        const n = ring0.length;
        const yArr = (y) => new Array(n).fill(y);
        const y2Arr = yArr(y2).map((y, i) => y + ring2YDeltas[i]);

        const islandTag = ring0.map(([x, z]) => `${Math.round(x * 1000)}:${Math.round(z * 1000)}`).join("|");
        const spikes = kaykitHullBuildSpikes(ring2, y2Arr, n, islandTag);
        const deepestY = spikes.reduce((min, sp) => Math.min(min, sp.apex[1]), y2);

        const pos = [];
        const col = [];
        const push = (x, y, z) => {
          pos.push(x, y, z);
          const seed = `${Math.round(x * 500)}:${Math.round(y * 500)}:${Math.round(z * 500)}`;
          const c = kaykitHullColorAt(y, y0, deepestY, seed);
          col.push(c.r, c.g, c.b);
        };
        const wallStrip = (ringA_, yArrA, ringB_, yArrB) => {
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const a0 = [ringA_[i][0], yArrA[i], ringA_[i][1]];
            const a1 = [ringA_[j][0], yArrA[j], ringA_[j][1]];
            const b0 = [ringB_[i][0], yArrB[i], ringB_[i][1]];
            const b1 = [ringB_[j][0], yArrB[j], ringB_[j][1]];
            push(...a0); push(...a1); push(...b1);
            push(...a0); push(...b1); push(...b0);
          }
        };
        wallStrip(ring0, yArr(y0), ringA, yArr(yA));
        wallStrip(ringA, yArr(yA), ring1, yArr(y1));
        wallStrip(ring1, yArr(y1), ring2, y2Arr);

        // Fond : triangulation robuste (Earcut via THREE.ShapeUtils), valable
        // sur un contour concave (L/T/croix) — jamais un éventail naïf. La
        // triangulation ne regarde que (x,z) ; la hauteur par sommet (avec
        // irrégularité) est réappliquée ensuite via l'index d'origine. Le
        // fond reste entier même là où une pointe part d'un sommet : la
        // pointe prolonge simplement la masse plus bas depuis ces mêmes
        // sommets, elle ne remplace pas le fond (le petit triangle de fond
        // resté au même endroit se retrouve caché à l'intérieur du volume de
        // la pointe, invisible de l'extérieur — aucun trou, aucune couture).
        const faces = kaykitTriangulateRing(ring2);
        faces.forEach(([a, b, c]) => {
          push(ring2[a][0], y2Arr[a], ring2[a][1]);
          push(ring2[b][0], y2Arr[b], ring2[b][1]);
          push(ring2[c][0], y2Arr[c], ring2[c][1]);
        });

        // Pointes : 3 faces reliant le triangle de naissance (large) au
        // sommet-pointe décalé (fin, asymétrique) — prolonge la masse au
        // lieu d'un cône rapporté.
        spikes.forEach(({ rim: [ri, rj, rk], apex }) => {
          const pi = [ring2[ri][0], y2Arr[ri], ring2[ri][1]];
          const pj = [ring2[rj][0], y2Arr[rj], ring2[rj][1]];
          const pk = [ring2[rk][0], y2Arr[rk], ring2[rk][1]];
          push(...pi); push(...pj); push(...apex);
          push(...pj); push(...pk); push(...apex);
          push(...pk); push(...pi); push(...apex);
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        geometry.computeVertexNormals();
        return geometry;
      }

      let kaykitHullMaterialCache = null;
      function kaykitIslandHullMaterial() {
        // Matériau construit directement (pas via kaykitMaterial, qui ne
        // propage pas vertexColors et n'en tient pas compte dans sa clé de
        // cache) : un seul matériau pour toute la coque, dégradé terre KayKit
        // → brun rocheux porté par la géométrie (voir kaykitHullColorAt),
        // color blanc pour ne pas multiplier le dégradé par une teinte
        // supplémentaire. DoubleSide : leçon retenue de la V1 — une
        // géométrie main-codée n'a pas un winding garanti cohérent sur
        // chaque face (parois + fond triangulé indépendamment) ; DoubleSide
        // élimine tout risque de face culled selon l'angle de vue.
        if (kaykitHullMaterialCache) return kaykitHullMaterialCache;
        // roughness légèrement relevée (.85 → .90) : matière mate, réduit le
        // léger lobe spéculaire résiduel sur les faces quasi verticales
        // (ringA) directement face au soleil de la scène B, sans toucher à
        // l'éclairage global — la réponse du matériau, pas la lumière.
        kaykitHullMaterialCache = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: .90, metalness: 0, side: THREE.DoubleSide, vertexColors: true
        });
        return kaykitHullMaterialCache;
      }

      // Une coque par composante connexe (jamais un polygone reliant deux
      // groupes de cellules non adjacentes à travers le vide). Géométrie mise
      // en cache par signature de contour local : les îles de même forme sur
      // le plateau réutilisent le même BufferGeometry, seule la position du
      // mesh diffère.
      function addKayKitIslandHull(group, island, cells) {
        const components = kaykitIslandComponents(cells);
        const material = kaykitIslandHullMaterial();
        components.forEach(component => {
          const contour = kaykitIslandBoundary(component);
          if (contour.length < 3) return;
          const [anchorR, anchorC] = component[0];
          const anchor = kaykitCellPosition(anchorR, anchorC, 0);
          const localContour = contour.map(([x, z]) => [x - anchor.x, z - anchor.z]);
          const shapeKey = localContour.map(([x, z]) => `${Math.round(x * 1000)}:${Math.round(z * 1000)}`).join("|");
          const geometry = kaykitGeometry(`island-hull-v2:${shapeKey}`, () => kaykitBuildIslandHullGeometry(localContour));
          const hull = new THREE.Mesh(geometry, material);
          hull.position.set(anchor.x, 0, anchor.z);
          hull.castShadow = false;
          hull.receiveShadow = true;
          hull.raycast = () => {};
          group.add(hull);
        });
      }

      function kaykitIslandAccentColor(island, { preview = false, previewColor = 0x20f39a } = {}) {
        if (preview) return new THREE.Color(previewColor);
        const owner = Number.isInteger(island?.owner) ? island.owner : null;
        if (owner !== null && state?.players?.[owner]?.color) return new THREE.Color(state.players[owner].color);
        const hue = (kaykitHash("island-accent", island?.id ?? "preview") + .08) % 1;
        return new THREE.Color().setHSL(hue, .58, .56);
      }

      // PALETTE RESSERRÉE — même arbitrage que kaykitHullColorAt (voir plus haut) :
      // une famille de teintes doit se lire comme UN archipel avec des nuances, pas
      // comme six pastilles de couleur choisies indépendamment. L'ancienne palette
      // dérivait sur 100° de teinte (du jaune-olive 70° au sarcelle 170°) et sur 32
      // points de luminosité (33 %-65 %) : deux blocs voisins pouvaient se lire comme
      // deux matières différentes (herbe sèche contre mousse humide) plutôt que comme
      // deux parcelles du même terrain.
      //
      // Resserrée à un arc de 54° (88°-142°, jaune-vert à vert-émeraude, jamais de
      // dérive vers le bleu-sarcelle) avec alternance de luminosité/saturation pour
      // garder les 6 teintes distinguables : mesuré, l'écart RGB minimal entre deux
      // teintes passe de 32,9 à 42,2 (donc MIEUX différencié qu'avant, pas moins),
      // tout en gardant l'écart moyen comparable (77,0 contre 82,1). C'est cet écart
      // minimal qui compte : buildIlyosIslandColorMap ne garantit que des indices
      // DIFFÉRENTS entre îles voisines, jamais lesquels — la pire paire doit donc
      // rester nette.
      const ILYOS_ISLAND_TINTS = [
        0x88c261, // sauge claire chaude
        0x348d3a, // vert profond — ancre de la famille
        0x5cb27c, // vert froid moyen
        0x5a842a, // olive sombre chaud
        0x88bf95, // vert clair froid
        0x54a744  // vert moyen, transition
      ];

      function buildIlyosIslandColorMap(islands) {
        const list = Array.isArray(islands) ? islands : [];
        const cellOwner = new Map();
        list.forEach(island => (island.cells || []).forEach(([r, c]) => cellOwner.set(`${r},${c}`, island.id)));
        const neighbors = new Map(list.map(island => [String(island.id), new Set()]));
        list.forEach(island => {
          const id = String(island.id);
          (island.cells || []).forEach(([r, c]) => {
            [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
              const other = cellOwner.get(`${nr},${nc}`);
              if (other !== undefined && String(other) !== id) neighbors.get(id)?.add(String(other));
            });
          });
        });
        const result = new Map();
        [...list].sort((a, b) => (neighbors.get(String(b.id))?.size || 0) - (neighbors.get(String(a.id))?.size || 0)).forEach(island => {
          const id = String(island.id);
          const forbidden = new Set([...(neighbors.get(id) || [])].map(other => result.get(other)).filter(Number.isInteger));
          let colorIndex = 0;
          while (forbidden.has(colorIndex) && colorIndex < ILYOS_ISLAND_TINTS.length - 1) colorIndex++;
          if (forbidden.has(colorIndex)) colorIndex = Math.abs(Math.floor(kaykitHash('island-color-fallback', id) * ILYOS_ISLAND_TINTS.length)) % ILYOS_ISLAND_TINTS.length;
          result.set(id, colorIndex);
        });
        return result;
      }

      function ilyosIslandTint(island) {
        const index = Number.isInteger(island?.visualVariant)
          ? island.visualVariant
          : Math.abs(Number(island?.id) || 0) % ILYOS_ISLAND_TINTS.length;
        return ILYOS_ISLAND_TINTS[index % ILYOS_ISLAND_TINTS.length];
      }

      // Repasses "matière" de l'atlas Block Bits (passe plateau/environnement v1).
      //
      // L'atlas partagé par dirt_with_grass.gltf n'est pas une texture peinte :
      // c'est un nuancier de dégradés plats (une case = une teinte unie), et le
      // modèle pointe ses UV sur DEUX cases précises — une pour le dessus
      // (herbe), une pour les flancs (terre/falaise). Confirmé par inspection
      // des UV/normales du GLB : la case herbe est le rectangle pixel
      // [384..512)×[768..1024), la case terre le rectangle [640..768)×[0..256)
      // du fichier 1024×1024 ./assets/kaykit/blockBits/block_bits_texture.png.
      //
      // Un vrai grain (dégradé, taches, brins) a été tenté ici puis abandonné :
      // le modèle est un monticule bas-poly fait de nombreuses petites
      // facettes, et chacune échantillonne une sous-région DIFFÉRENTE et NON
      // ADJACENTE de cette même case (UV irréguliers, hérités de l'asset
      // source). Confirmé par test contrôlé en jeu : même un motif fin et
      // "raccordable" en bord de rectangle laisse une ligne visible à chaque
      // frontière de facette — seule une teinte strictement unie n'en laisse
      // aucune, quelle que soit la sous-région échantillonnée. On se limite
      // donc à un aplat par variant (plus riche que l'unique vert délavé
      // d'origine, voir ILYOS_ISLAND_TINTS) — le reste de l'atlas (bois,
      // pierre, fenêtres d'autres assets Block Bits inutilisés) n'est jamais
      // touché.
      const KAYKIT_ISLAND_GRASS_RECT = { x: 384, y: 768, w: 128, h: 256 };
      const KAYKIT_ISLAND_DIRT_RECT = { x: 640, y: 0, w: 128, h: 256 };

      function kaykitPaintIslandGrass(context, rect, tint) {
        const { x, y, w, h } = rect;
        context.fillStyle = `#${new THREE.Color(tint).getHexString()}`;
        context.fillRect(x, y, w, h);
      }

      function kaykitPaintIslandDirt(context, rect) {
        const { x, y, w, h } = rect;
        // Teinte terre commune à toutes les factions/variants (la pierre des
        // châteaux suit la même logique : un monde cohérent, seul l'accent
        // change selon le sujet — ici l'herbe, pas la terre).
        context.fillStyle = "#92694a";
        context.fillRect(x, y, w, h);
      }

      function kaykitIslandTintTexture(sourceTexture, variantIndex) {
        const sourceImage = sourceTexture?.image;
        if (!sourceImage?.width || !sourceImage?.height) return sourceTexture;
        const cacheKey = `${sourceTexture.uuid}|${variantIndex}|v2`;
        const cached = kaykit3D?.islandTintTextures?.get(cacheKey);
        if (cached) return cached;

        const canvas = document.createElement("canvas");
        canvas.width = sourceImage.width;
        canvas.height = sourceImage.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return sourceTexture;
        context.drawImage(sourceImage, 0, 0);

        const tint = ILYOS_ISLAND_TINTS[variantIndex];
        kaykitPaintIslandGrass(context, KAYKIT_ISLAND_GRASS_RECT, tint);
        kaykitPaintIslandDirt(context, KAYKIT_ISLAND_DIRT_RECT);

        const texture = sourceTexture.clone();
        texture.image = canvas;
        texture.needsUpdate = true;
        texture.name = `${sourceTexture.name || "block-bits"}-island-${variantIndex}`;
        kaykit3D?.islandTintTextures?.set(cacheKey, texture);
        return texture;
      }

      function kaykitIslandTintMaterial(baseMaterial, variant) {
        const variantIndex = Math.max(0, Number(variant) || 0) % ILYOS_ISLAND_TINTS.length;
        const map = baseMaterial.map || getBlockBitsTexture();
        const materialIdentity = map?.uuid || baseMaterial.name || baseMaterial.type;
        const cacheKey = `${materialIdentity}|${baseMaterial.name || "material"}|${variantIndex}`;
        const cached = kaykit3D?.islandTintMaterials?.get(cacheKey);
        if (cached) return cached;

        const material = baseMaterial.clone();
        if (map) {
          configureKayKitTexture(map);
          map.magFilter = THREE.NearestFilter;
          map.minFilter = THREE.NearestMipmapNearestFilter || THREE.NearestFilter;
          map.anisotropy = Math.min(8, kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
          map.needsUpdate = true;
          material.map = kaykitIslandTintTexture(map, variantIndex);
        }
        material.color?.set(0xffffff);
        material.userData.ilyosSharedIslandTint = true;
        material.name = `${baseMaterial.name || "block-bits"}-island-tint-${variantIndex}`;
        material.needsUpdate = true;
        kaykit3D?.islandTintMaterials?.set(cacheKey, material);
        return material;
      }

      function makeKayKitIslandBlock(island, { preview = false, valid = true, previewMode = "placement" } = {}) {
        const group = new THREE.Group();
        group.userData.islandBlock = true;
        group.userData.islandId = island?.id ?? "preview";
        const cells = (island?.cells || []).slice();
        if (!cells.length) return group;

        const previewColor = previewMode === "magic" ? (valid ? 0xb768ff : 0xff3158) : (valid ? 0x20f39a : 0xff2c4c);
        const previewAccent = new THREE.Color(previewColor);
        // Le ghost de pose d'île doit rester "léger" (lisible sans écraser le
        // plateau) ; la rotation magique garde son opacité d'origine, inchangée.
        const previewOpacity = previewMode === "magic" ? .82 : .60;

        const tintPreview = (object) => {
          if (!preview) return;
          object.traverse?.(child => {
            if (!child.isMesh || !child.material) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            const cloned = materials.map(material => {
              const mat = material.clone();
              if (mat.color) mat.color.lerp(previewAccent, .70);
              if ("emissive" in mat) {
                mat.emissive = previewAccent.clone();
                mat.emissiveIntensity = .30;
              }
              mat.transparent = true;
              mat.opacity = previewOpacity;
              mat.depthWrite = false;
              mat.needsUpdate = true;
              return mat;
            });
            child.material = Array.isArray(child.material) ? cloned : cloned[0];
          });
        };

        cells.forEach(([r, c]) => {
          const p = kaykitCellPosition(r, c, 0);
          let block = cloneKayKitAsset('blockBitsGrassDirt', {
            exactWidth: KAYKIT_BLOCK_SIZE,
            exactDepth: KAYKIT_BLOCK_SIZE,
            exactHeight: .46,
            targetFloor: 0
          });

          if (!block) {
            const fallbackMat = new THREE.MeshStandardMaterial({
              color: preview ? previewColor : ilyosIslandTint(island),
              roughness: .88,
              transparent: preview,
              opacity: preview ? previewOpacity : 1
            });
            block = new THREE.Mesh(kaykitGeometry('block-bits-loading-fallback-v52', () => new THREE.BoxGeometry(KAYKIT_BLOCK_SIZE, .46, KAYKIT_BLOCK_SIZE)), fallbackMat);
          } else {
            tintPreview(block);
            block.traverse?.(child => {
              if (!child.isMesh) return;
              child.castShadow = !preview;
              child.receiveShadow = true;
              const source = Array.isArray(child.material) ? child.material : [child.material];
              const styled = source.map(material => {
                if (preview) return material;
                return kaykitIslandTintMaterial(material, island.visualVariant);
              });
              child.material = Array.isArray(child.material) ? styled : styled[0];
            });
          }

          block.position.set(p.x, KAYKIT_LEVELS.board, p.z);
          block.renderOrder = preview ? 20 : 4;
          group.add(block);
          if (!preview) registerKayKitCellVisual(r, c, block);
        });

        if (!preview) addKayKitIslandHull(group, island, cells);

        if (preview) {
          // FUITE (corrigee) : contour d'île, sa forme varie a chaque case
          // survolee (pose d'île ou rotation magique en aperçu continu) — pas
          // de cle de cache raisonnable ici. Meme traitement que la flèche de
          // poussée (addKayKitPushDirection) : tagué `ilyosTransient` pour que
          // clearKayKitGroup le libère au prochain rebuild plutôt que
          // l'abandonner en mémoire.
          const components = kaykitIslandComponents(cells);
          components.forEach(component => {
            const boundary = kaykitIslandBoundary(component);
            if (boundary.length < 2) return;
            const outlineGeometry = new THREE.BufferGeometry().setFromPoints(boundary.map(([x, z]) => new THREE.Vector3(x, KAYKIT_LEVELS.board + .48, z)));
            outlineGeometry.userData = { ...(outlineGeometry.userData || {}), ilyosTransient: true };
            const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
            outlineMaterial.userData = { ...(outlineMaterial.userData || {}), ilyosTransient: true };
            const outline = new THREE.LineLoop(outlineGeometry, outlineMaterial);
            outline.renderOrder = 25;
            group.add(outline);
          });
        }

        return group;
      }

      function renderKayKitIslandSeams(group) {
        if (!state?.islands?.length) return;
        const islandIdAt = (r, c) => islandAt(r, c)?.id ?? null;
        const seamMaterial = new THREE.MeshBasicMaterial({
          color: 0x183027, transparent: true, opacity: .72, depthWrite: false, depthTest: false
        });
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const current = islandIdAt(r, c);
            if (current === null) continue;
            [[0, 1], [1, 0]].forEach(([dr, dc]) => {
              const next = islandIdAt(r + dr, c + dc);
              if (next === null || String(next) === String(current)) return;
              const x = (c - (GRID - 1) / 2 + dc * .5) * KAYKIT_CELL_SPACING;
              const z = (r - (GRID - 1) / 2 + dr * .5) * KAYKIT_CELL_SPACING;
              // FUITE (corrigee) : appelee pour CHAQUE frontiere entre deux
              // cases d'îles differentes, sur TOUTE la grille, a chaque sync —
              // mais seules deux formes constantes existent (barre horizontale
              // ou verticale, KAYKIT_CELL_SPACING ne varie jamais). Cache
              // trivial au lieu d'une BoxGeometry neuve par seam par sync.
              const vertical = dc === 1;
              const seam = new THREE.Mesh(
                kaykitGeometry(vertical ? "island-seam-vertical-v1" : "island-seam-horizontal-v1", () => new THREE.BoxGeometry(vertical ? .018 : KAYKIT_CELL_SPACING * .68, .010, vertical ? KAYKIT_CELL_SPACING * .68 : .018)),
                seamMaterial
              );
              seam.position.set(x, KAYKIT_LEVELS.islandTop + .080, z);
              seam.renderOrder = 86;
              group.add(seam);
            });
          }
        }
      }

      // Halo doré du sanctuaire : un unique disque radial partagé (comme
      // kaykitCloudTexture), posé à plat au sol en blending additif pour
      // lire comme une lumière plutôt qu'une décalcomanie plaquée.
      function kaykitSanctuaryHaloTexture() {
        const key = "sanctuary-halo-v2";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const glow = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        glow.addColorStop(0, "rgba(255,226,158,.96)");
        glow.addColorStop(.42, "rgba(255,190,90,.58)");
        glow.addColorStop(.75, "rgba(214,110,60,.18)");
        glow.addColorStop(1, "rgba(214,110,60,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 256, 256);
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        if (kaykit3D?.materials) kaykit3D.materials.set(key, texture);
        return texture;
      }

      // Réseau de fissures lumineuses du sanctuaire : baké directement dans le
      // matériau du dessus (map couleur + emissiveMap), pas posé comme un
      // plan par-dessus — donc plus aucun risque d'avoir l'impression d'un
      // symbole qui "flotte" au-dessus de la pierre : la lueur sort de la
      // surface elle-même. Un unique canvas partagé (comme kaykitCloudTexture),
      // généré une fois via un bruit pseudo-aléatoire seedé (donc stable).
      function kaykitSanctuaryCrackedGoldTextures() {
        const key = "sanctuary-cracked-gold-v2";
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);

        const seeded = (i, salt = 0) => {
          const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };

        const SIZE = 512;
        const colorCanvas = document.createElement('canvas');
        colorCanvas.width = colorCanvas.height = SIZE;
        const colorCtx = colorCanvas.getContext('2d');
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = glowCanvas.height = SIZE;
        const glowCtx = glowCanvas.getContext('2d');

        // Pierre dorée mouchetée, pas un aplat uni.
        const base = colorCtx.createLinearGradient(0, 0, SIZE, SIZE);
        base.addColorStop(0, "#ecc271");
        base.addColorStop(.5, "#dba848");
        base.addColorStop(1, "#c48b34");
        colorCtx.fillStyle = base;
        colorCtx.fillRect(0, 0, SIZE, SIZE);
        for (let i = 0; i < 46; i++) {
          const x = seeded(i, 1) * SIZE, y = seeded(i, 2) * SIZE, r = 14 + seeded(i, 3) * 48;
          const dark = seeded(i, 4) > .5;
          const blob = colorCtx.createRadialGradient(x, y, 0, x, y, r);
          blob.addColorStop(0, dark ? "rgba(110,72,26,.14)" : "rgba(255,232,175,.14)");
          blob.addColorStop(1, "rgba(0,0,0,0)");
          colorCtx.fillStyle = blob;
          colorCtx.beginPath(); colorCtx.arc(x, y, r, 0, Math.PI * 2); colorCtx.fill();
        }

        // Fissures : plusieurs branches partant du centre vers les bords,
        // chacune coudée 3-4 fois — un vrai réseau, pas une seule forme.
        const cx = SIZE / 2, cy = SIZE / 2;
        const branchCount = 5;
        const paths = [];
        for (let b = 0; b < branchCount; b++) {
          let angle = (b / branchCount) * Math.PI * 2 + seeded(b, 10) * .6;
          let x = cx, y = cy;
          const pts = [[x, y]];
          const segs = 3 + Math.floor(seeded(b, 11) * 2);
          for (let s = 0; s < segs; s++) {
            angle += (seeded(b * 10 + s, 12) - .5) * 1.15;
            const len = SIZE * .15 + seeded(b * 10 + s, 13) * SIZE * .11;
            x += Math.cos(angle) * len; y += Math.sin(angle) * len;
            pts.push([x, y]);
          }
          paths.push(pts);
          // Sous-fissure courte greffée sur le 2e segment, pour la ramification.
          if (seeded(b, 14) > .35) {
            const [bx, by] = pts[1];
            let ba = angle + (seeded(b, 15) - .5) * 2.2;
            const bpts = [[bx, by]];
            for (let s = 0; s < 2; s++) {
              ba += (seeded(b * 5 + s, 16) - .5) * 1.2;
              const len = SIZE * .09 + seeded(b * 5 + s, 17) * SIZE * .07;
              bpts.push([bpts[bpts.length - 1][0] + Math.cos(ba) * len, bpts[bpts.length - 1][1] + Math.sin(ba) * len]);
            }
            paths.push(bpts);
          }
        }

        const strokePath = (ctx, pts, width, color) => {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          ctx.stroke();
        };

        // Cercle magique à deux anneaux (extérieur + intérieur), gravé comme
        // les fissures : une vraie limite de rituel plutôt qu'une simple dalle.
        const strokeCircle = (ctx, radius, width, color) => {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.stroke();
        };
        const circleRadii = [SIZE * .41, SIZE * .30];

        // Graduations autour de l'anneau extérieur, comme un cadran gravé —
        // une ligne courte tous les 30°, une longue tous les 90°.
        const tickPaths = [];
        const tickCount = 24;
        for (let i = 0; i < tickCount; i++) {
          const a = (i / tickCount) * Math.PI * 2;
          const long = i % 6 === 0;
          const rOuter = circleRadii[0] + (long ? 15 : 8);
          const rInner = circleRadii[0] - (long ? 7 : 3);
          tickPaths.push([
            [cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner],
            [cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter]
          ]);
        }

        // Runes : symboles angulaires abstraits (pas un alphabet réel), posés
        // entre les deux anneaux à intervalles réguliers, chacun légèrement
        // désaxé pour ne pas paraître tamponné à la machine.
        const runeTemplates = [
          [[[0, -.5], [0, .5]], [[0, -.5], [.4, -.15]], [[0, -.5], [-.4, -.15]]],
          [[[0, -.5], [0, .5]], [[0, 0], [.35, .25]], [[0, 0], [.35, -.25]]],
          [[[-.4, -.4], [.4, .4]], [[-.4, .4], [.4, -.4]]],
          [[[0, -.5], [0, .5]], [[-.3, 0], [.3, 0]]],
          [[[-.35, -.45], [.1, -.05]], [[.1, -.05], [-.1, .05]], [[-.1, .05], [.35, .45]]],
          [[[0, -.4], [.3, 0]], [[.3, 0], [0, .4]], [[0, .4], [-.3, 0]], [[-.3, 0], [0, -.4]]]
        ];
        const runePaths = [];
        const runeCount = 6;
        const runeRadius = (circleRadii[0] + circleRadii[1]) / 2;
        for (let i = 0; i < runeCount; i++) {
          const angle = (i / runeCount) * Math.PI * 2 + seeded(i, 20) * .3;
          const px = cx + Math.cos(angle) * runeRadius;
          const py = cy + Math.sin(angle) * runeRadius;
          const tmpl = runeTemplates[Math.floor(seeded(i, 21) * runeTemplates.length) % runeTemplates.length];
          const tilt = angle + Math.PI / 2 + (seeded(i, 22) - .5) * .5;
          const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
          const scale = SIZE * .050;
          tmpl.forEach(seg => {
            runePaths.push(seg.map(([lx, ly]) => [
              px + (lx * cosT - ly * sinT) * scale,
              py + (lx * sinT + ly * cosT) * scale
            ]));
          });
        }

        // Gravure sur la map couleur : rainure sombre + reflet clair au bord.
        paths.forEach(pts => {
          strokePath(colorCtx, pts, 9, "rgba(66,42,16,.92)");
          strokePath(colorCtx, pts, 3, "rgba(255,226,155,.6)");
        });
        circleRadii.forEach(radius => {
          strokeCircle(colorCtx, radius, 6, "rgba(66,42,16,.85)");
          strokeCircle(colorCtx, radius, 2, "rgba(255,226,155,.55)");
        });
        tickPaths.forEach(pts => {
          strokePath(colorCtx, pts, 3, "rgba(66,42,16,.75)");
          strokePath(colorCtx, pts, 1.1, "rgba(255,226,155,.5)");
        });
        runePaths.forEach(pts => {
          strokePath(colorCtx, pts, 5, "rgba(66,42,16,.9)");
          strokePath(colorCtx, pts, 1.8, "rgba(255,226,155,.65)");
        });

        // Carte émissive : noir partout sauf les fissures/cercles/runes, qui
        // rayonnent — c'est elle qui donne l'impression que la lumière
        // traverse la pierre plutôt qu'une simple gravure éclairée dessus.
        glowCtx.fillStyle = "#000";
        glowCtx.fillRect(0, 0, SIZE, SIZE);
        paths.forEach(pts => {
          glowCtx.shadowColor = "rgba(255,190,110,1)";
          glowCtx.shadowBlur = 30;
          strokePath(glowCtx, pts, 9, "rgba(255,225,170,1)");
          glowCtx.shadowBlur = 0;
          strokePath(glowCtx, pts, 2.2, "rgba(255,248,225,1)");
        });
        circleRadii.forEach(radius => {
          glowCtx.shadowColor = "rgba(255,190,110,1)";
          glowCtx.shadowBlur = 16;
          strokeCircle(glowCtx, radius, 4, "rgba(255,220,160,1)");
          glowCtx.shadowBlur = 0;
          strokeCircle(glowCtx, radius, 1.4, "rgba(255,248,225,1)");
        });
        tickPaths.forEach(pts => {
          glowCtx.shadowColor = "rgba(255,190,110,1)";
          glowCtx.shadowBlur = 8;
          strokePath(glowCtx, pts, 2.4, "rgba(255,220,160,1)");
          glowCtx.shadowBlur = 0;
        });
        runePaths.forEach(pts => {
          glowCtx.shadowColor = "rgba(255,150,210,1)";
          glowCtx.shadowBlur = 14;
          strokePath(glowCtx, pts, 3.6, "rgba(255,200,235,1)");
          glowCtx.shadowBlur = 0;
          strokePath(glowCtx, pts, 1.3, "rgba(255,245,250,1)");
        });

        const colorTexture = new THREE.CanvasTexture(colorCanvas);
        colorTexture.encoding = THREE.sRGBEncoding;
        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        glowTexture.encoding = THREE.sRGBEncoding;

        const result = { colorTexture, glowTexture };
        if (kaykit3D?.materials) kaykit3D.materials.set(key, result);
        return result;
      }

      // Dalle de sanctuaire — style "autel royal" : pierre dorée craquelée,
      // toute la surface du dessus laisse passer une lueur chaude à travers
      // un réseau de fissures gravées (bakées dans le matériau, rien ne
      // flotte au-dessus). Socle taillé (même extrusion biseautée que
      // makeKayKitPedestal, pas un bloc d'île grass/dirt) : le sanctuaire doit
      // se lire comme le trône de la couronne, pas comme une île de plus.
      function makeSanctuaryTile() {
        const group = new THREE.Group();
        // ExtrudeGeometry par défaut génère les UV du dessus à partir des
        // coordonnées BRUTES de la forme (-.46..46), pas normalisées 0..1 —
        // avec le wrap par défaut (clamp), ça n'affichait qu'un minuscule
        // coin du motif étiré/écrasé sur toute la dalle. UVGenerator maison
        // pour recentrer proprement le dessus sur 0..1 (le motif tient enfin
        // en entier sur chaque dalle) ; les côtés gardent la génération
        // standard mais avec un wrap répété (texture appliquée en dessous).
        const sanctuaryUVGenerator = {
          generateTopUV(geometry, vertices, indexA, indexB, indexC) {
            const n = (x, y) => new THREE.Vector2((x + .46) / .92, (y + .46) / .92);
            return [
              n(vertices[indexA * 3], vertices[indexA * 3 + 1]),
              n(vertices[indexB * 3], vertices[indexB * 3 + 1]),
              n(vertices[indexC * 3], vertices[indexC * 3 + 1])
            ];
          },
          generateBottomUV(geometry, vertices, indexA, indexB, indexC) {
            return sanctuaryUVGenerator.generateTopUV(geometry, vertices, indexA, indexB, indexC);
          },
          generateSideWallUV(geometry, vertices, indexA, indexB, indexC, indexD) {
            const fallback = THREE.ExtrudeGeometry?.WorldUVGenerator;
            if (fallback?.generateSideWallUV) return fallback.generateSideWallUV(geometry, vertices, indexA, indexB, indexC, indexD);
            const n = (x, y, z) => new THREE.Vector2((x + z + .92) / 1.84, (y + .46) / .92);
            return [
              n(vertices[indexA * 3], vertices[indexA * 3 + 1], vertices[indexA * 3 + 2]),
              n(vertices[indexB * 3], vertices[indexB * 3 + 1], vertices[indexB * 3 + 2]),
              n(vertices[indexC * 3], vertices[indexC * 3 + 1], vertices[indexC * 3 + 2]),
              n(vertices[indexD * 3], vertices[indexD * 3 + 1], vertices[indexD * 3 + 2])
            ];
          }
        };
        const geometry = kaykitGeometry("sanctuary-extrude-v2", () => {
          const shape = new THREE.Shape();
          shape.moveTo(-.46, -.46); shape.lineTo(.46, -.46); shape.lineTo(.46, .46); shape.lineTo(-.46, .46); shape.closePath();
          return new THREE.ExtrudeGeometry(shape, {
            depth: .42, bevelEnabled: true, bevelSegments: 2, bevelSize: .055, bevelThickness: .05, steps: 1,
            UVGenerator: sanctuaryUVGenerator
          });
        });
        const { colorTexture, glowTexture } = kaykitSanctuaryCrackedGoldTextures();
        const topMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, map: colorTexture, roughness: .45, metalness: .22,
          emissive: new THREE.Color(0xffffff), emissiveMap: glowTexture, emissiveIntensity: 2.1
        });

        // Le même motif se devine sur les parois, en transparence — on
        // réutilise les mêmes textures avec un wrap répété (les UV de côté
        // ne couvrent pas une seule fois 0..1 comme le dessus) et une
        // opacité plus faible pour rester un aperçu, pas une copie nette.
        const sideColorTexture = colorTexture.clone();
        sideColorTexture.wrapS = sideColorTexture.wrapT = THREE.RepeatWrapping;
        sideColorTexture.repeat.set(1.6, 1);
        sideColorTexture.needsUpdate = true;
        const sideGlowTexture = glowTexture.clone();
        sideGlowTexture.wrapS = sideGlowTexture.wrapT = THREE.RepeatWrapping;
        sideGlowTexture.repeat.set(1.6, 1);
        sideGlowTexture.needsUpdate = true;

        // Contour translucide : les faces latérales lisent comme du verre
        // ambré éclairé de l'intérieur plutôt qu'une pierre opaque — cohérent
        // avec les fissures lumineuses du dessus.
        const sideMat = new THREE.MeshStandardMaterial({
          color: 0xd9a54a, map: sideColorTexture, roughness: .28, metalness: .05,
          emissive: new THREE.Color(0xffb35a), emissiveMap: sideGlowTexture, emissiveIntensity: .9,
          transparent: true, opacity: .58, depthWrite: false, side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, [topMat, sideMat]);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = .47;
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.renderOrder = 4;
        group.add(mesh);

        return group;
      }

      function makeCrownCrossGround() {
        const crossCells = [];
        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (isSanctuary(r, c)) crossCells.push([r, c]);

        const group = new THREE.Group();
        group.userData.crownCross = true;
        crossCells.forEach(([r, c]) => {
          const p = kaykitCellPosition(r, c, 0);
          const tile = makeSanctuaryTile();
          tile.position.set(p.x, 0, p.z);
          group.add(tile);
          registerKayKitCellVisual(r, c, tile);
        });

        const center = kaykitCellPosition(CENTER.r, CENTER.c, KAYKIT_LEVELS.islandTop + .018);
        const halo = new THREE.Mesh(
          kaykitGeometry("sanctuary-halo-plane-v1", () => new THREE.PlaneGeometry(2.55, 2.55)),
          new THREE.MeshBasicMaterial({
            map: kaykitSanctuaryHaloTexture(), transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false
          })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(center.x, center.y, center.z);
        halo.renderOrder = 6;
        halo.userData.sanctuaryHalo = true;
        group.add(halo);

        const light = new THREE.PointLight(0xffcf78, .5, 2.6, 2);
        light.position.set(center.x, center.y + .5, center.z);
        group.add(light);

        return group;
      }

      /**
       * Masque/affiche le bloc réel de l'île en cours de rotation MAGIE — pas
       * une reconstruction, juste `.visible` : appelé à CHAQUE sync (le survol/
       * la sélection ne change pas la signature de l'île, donc ne passe pas par
       * la reconstruction incrémentale de syncKayKitScene). Sans ce masquage,
       * le bloc réel et le ghost de renderKayKitMagicRotationPreview se
       * superposaient à 0 cran de rotation.
       */
      function refreshKayKitMagicHiddenIsland() {
        if (!kaykit3D) return;
        const hiddenId = (state?.phase === "ACTION"
          && state?.selectedActionType === "MAGIC"
          && state?.selectedIslandId
          && Array.isArray(state?.magicPreviewCells))
          ? String(state.selectedIslandId)
          : null;
        kaykit3D.islandObjectRegistry.forEach((entry, id) => {
          const visible = id !== hiddenId;
          entry.objects.forEach(object => { object.visible = visible; });
        });
      }

      function renderKayKitPlacementPreview() {
        if (!kaykit3D || state.phase !== "PLACE_ISLAND" || !state.hoverAnchor) return;
        const [anchorR, anchorC] = state.hoverAnchor;
        const previewCells = previewAbsoluteCells(anchorR, anchorC);
        if (!previewCells.length) return;
        const valid = isValidPlacement(anchorR, anchorC);
        const previewIsland = { id: "placement-preview", owner: null, cells: previewCells };
        const block = makeKayKitIslandBlock(previewIsland, { preview: true, valid, previewMode: "placement" });
        kaykit3D.dynamicGroup.add(block);
        // Pas de fondu ici : ce ghost est reconstruit à chaque déplacement de
        // souris via un resync complet de la scène (déjà coûteux en soi), et
        // traverser+enregistrer chaque mesh du bloc dans animatedObjects à
        // cette fréquence ajoutait un ralentissement perceptible. Les autres
        // marqueurs (anneaux d'affordance, halo de sélection), eux, passent
        // par le chemin léger refreshKayKitHoverPreviews() et gardent leur
        // fondu.
      }

      function renderKayKitMagicRotationPreview() {
        if (!kaykit3D || state?.phase !== "ACTION" || state?.selectedActionType !== "MAGIC") return;
        // Affiché en continu dès l'île choisie, pas seulement une fois la rotation
        // amorcée (magicPreviewSteps ≠ 0) : le joueur doit voir d'où part l'île
        // pendant toute l'action, pas seulement après le premier cran de rotation.
        if (!state.selectedIslandId || !Array.isArray(state.magicPreviewCells)) return;

        // Trace au sol, discrète, de l'emplacement de départ : le bloc normal de
        // cette île est caché pendant toute l'action (voir refreshKayKitMagicHiddenIsland),
        // donc sans ce contour on ne voit plus du tout d'où elle vient.
        // Volontairement très en retrait du ghost coloré.
        const originalIsland = state.islands.find(item => item.id === state.selectedIslandId);
        if (originalIsland?.cells?.length) {
          kaykitIslandComponents(originalIsland.cells).forEach(component => {
            const boundary = kaykitIslandBoundary(component);
            if (boundary.length < 2) return;
            // Forme variable par île : même traitement que le contour de pose
            // (makeKayKitIslandBlock) — tagué ilyosTransient plutôt que mis en
            // cache, affiché en continu tant que l'action magie est active.
            const originGeometry = new THREE.BufferGeometry().setFromPoints(boundary.map(([x, z]) => new THREE.Vector3(x, .045, z)));
            originGeometry.userData = { ...(originGeometry.userData || {}), ilyosTransient: true };
            const originMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .30, depthWrite: false });
            originMaterial.userData = { ...(originMaterial.userData || {}), ilyosTransient: true };
            const originOutline = new THREE.LineLoop(originGeometry, originMaterial);
            originOutline.renderOrder = 24;
            kaykit3D.dynamicGroup.add(originOutline);
          });
        }

        const previewIsland = {
          id: `magic-preview-${state.selectedIslandId}`,
          owner: null,
          cells: state.magicPreviewCells.map(([r, c]) => [r, c])
        };
        const block = makeKayKitIslandBlock(previewIsland, {
          preview: true,
          valid: !!state.magicPreviewValid,
          previewMode: "magic"
        });
        block.position.y = .055;
        block.userData.magicRotationPreview = true;
        kaykit3D.dynamicGroup.add(block);

        // Pivot doré clairement visible pendant la rotation.
        if (Array.isArray(state.selectedMagicPivot)) {
          const [r, c] = state.selectedMagicPivot;
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c) + .08);
          const pivot = new THREE.Mesh(
            kaykitGeometry("magic-pivot-marker-v1", () => new THREE.CylinderGeometry(.17, .17, .055, 24)),
            new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: true, opacity: .96, depthWrite: false })
          );
          pivot.position.set(p.x, p.y, p.z);
          pivot.renderOrder = 45;
          kaykit3D.dynamicGroup.add(pivot);
        }
      }

      // Avant même de cliquer un pivot : simple survol d'une case d'île pendant
      // Magie -> aperçu fantôme immédiat d'une rotation de 90° autour de cette
      // case (state.magicHoverPreviewCells, calculé au survol dans ui.js).
      // L'île réelle reste visible normalement ; seul le ghost est superposé
      // (contrairement à la rotation confirmée, qui masque l'île d'origine).
      function renderKayKitMagicHoverPreview() {
        if (!kaykit3D || state?.phase !== "ACTION" || state?.selectedActionType !== "MAGIC") return;
        if (state.selectedIslandId) return;
        if (!state.magicHoverIslandId || !Array.isArray(state.magicHoverPreviewCells)) return;

        const previewIsland = {
          id: `magic-hover-preview-${state.magicHoverIslandId}`,
          owner: null,
          cells: state.magicHoverPreviewCells.map(([r, c]) => [r, c])
        };
        const block = makeKayKitIslandBlock(previewIsland, {
          preview: true,
          valid: !!state.magicHoverPreviewValid,
          previewMode: "magic"
        });
        block.position.y = .055;
        block.userData.magicRotationPreview = true;
        kaykit3D.dynamicGroup.add(block);

        if (Array.isArray(state.magicHoverPivot)) {
          const [r, c] = state.magicHoverPivot;
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c) + .08);
          const pivot = new THREE.Mesh(
            kaykitGeometry("magic-pivot-marker-v1", () => new THREE.CylinderGeometry(.17, .17, .055, 24)),
            new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: true, opacity: .55, depthWrite: false })
          );
          pivot.position.set(p.x, p.y, p.z);
          pivot.renderOrder = 45;
          kaykit3D.dynamicGroup.add(pivot);
        }
      }

      function addKayKitDecorAsset(group, assetKey, x, y, z, maxWidth, maxHeight, rotation = 0, scale = 1) {
        let object = cloneKayKitAsset(assetKey, { maxWidth, maxHeight, targetFloor: 0 });
        if (!object) return null;
        object.position.set(x, y, z);
        object.rotation.y = rotation;
        object.scale.multiplyScalar(scale);
        group.add(object);
        return object;
      }

      function renderKayKitEnvironmentDecor(group) {
        if (!kaykit3D) return;
        const decorations = [
          ["mountainA", -7.8, -.42, -6.9, 2.2, 2.0, .35, .92],
          ["mountainB", 7.7, -.42, -6.8, 2.1, 1.9, -.4, .9],
          ["mountainC", -7.7, -.42, 6.9, 2.0, 1.85, 2.4, .88],
          ["hillA", 7.6, -.42, 6.8, 1.8, 1.1, -2.1, .92],
          ["hillC", 0, -.46, 7.15, 1.65, 1.0, Math.PI, .88],
          ["tileSlopeHigh", -5.85, -.38, 6.15, 1.05, .58, .55, .92],
          ["waterTile", 0, -.53, -6.20, 1.10, .35, 0, 1.0],
          ["stageA", -4.8, -.28, -6.05, .82, .62, .15, .9],
          ["stageB", 4.8, -.28, -6.05, .82, .72, -.15, .9],
          ["treesAMedium", -6.7, -.18, -2.8, 1.1, 1.45, .8, .9],
          ["treesBMedium", 6.8, -.18, -2.4, 1.1, 1.45, -.7, .9],
          ["treesASmall", -6.8, -.18, 2.5, .9, 1.2, 2.1, .9],
          ["treesBSmall", 6.8, -.18, 2.8, .9, 1.2, -2.2, .9],
          ["rockA", -6.35, -.15, -5.0, .65, .55, .3, 1],
          ["rockB", 6.25, -.15, -5.1, .65, .55, -.8, 1],
          ["rockC", -6.3, -.15, 5.0, .62, .52, 1.2, 1],
          ["rockD", 6.3, -.15, 5.0, .62, .52, -1.1, 1],
          ["bridgeA", 0, -.34, -6.15, 1.6, .72, 0, .92],
          ["fenceWood", -3.1, -.18, 6.0, 1.25, .48, .04, 1],
          ["fenceStone", 3.1, -.18, 6.0, 1.25, .48, -.04, 1],
          ["grain", -5.95, -.18, .1, .72, .82, Math.PI / 2, .9],
          ["scaffolding", 5.95, -.18, .1, .72, .90, -Math.PI / 2, .9]
        ];
        decorations.forEach(args => addKayKitDecorAsset(group, ...args));
      }


      function renderKayKitOfficialPackDecor(group) {
        if (!kaykit3D?.packRepresentatives?.size) return;
        const slots = [
          [-8.1, -5.3], [-5.5, -7.8], [-1.9, -8.2], [1.9, -8.2], [5.5, -7.8],
          [8.1, -5.3], [8.25, 0], [8.0, 5.3], [4.4, 8.0], [-4.4, 8.0]
        ];
        KAYKIT_OFFICIAL_PACKS.forEach((pack, index) => {
          const assetKey = kaykit3D.packRepresentatives.get(pack.id);
          if (!assetKey) return;
          const [x, z] = slots[index] || [0, 8];
          let object = cloneKayKitAsset(assetKey, { maxWidth: 1.28, maxHeight: 1.48, targetFloor: 0 });
          if (!object) return;
          object.position.set(x, -.25, z);
          object.rotation.y = Math.atan2(-x, -z);
          object.scale.multiplyScalar(pack.id === "adventurers" || pack.id === "skeletons" ? .88 : 1);
          group.add(object);

          const hue = kaykitHash("pack-color", pack.id);
          const color = new THREE.Color().setHSL(hue, .62, .52).getHex();
          const pedestal = new THREE.Mesh(
            kaykitGeometry(`pack-pedestal-${index}`, () => new THREE.CylinderGeometry(.68, .76, .16, 12)),
            kaykitMaterial(color, { roughness: .68, emissive: color, emissiveIntensity: .06 })
          );
          pedestal.position.set(x, -.28, z);
          pedestal.receiveShadow = true;
          group.add(pedestal);
        });
      }

      function renderKayKitOfficialPackDecorOnIslands(group) {
        const reserved = new Set();
        if (!kaykit3D?.packRepresentatives?.size || !state?.islands?.length) return reserved;
        const occupied = new Set();
        state.characters.forEach(character => occupied.add(key(character.r, character.c)));
        [state.artifact, state.secondArtifact].filter(Boolean).forEach(artifact => {
          if (artifact.active && !artifact.carrierId && Number.isFinite(artifact.r) && Number.isFinite(artifact.c)) occupied.add(key(artifact.r, artifact.c));
        });
        const candidates = [];
        state.islands.forEach(island => {
          island.cells.forEach(([r, c]) => {
            const cellKey = key(r, c);
            if (occupied.has(cellKey) || villageAt(r, c) || isSanctuary(r, c)) return;
            candidates.push({ r, c, islandId: island.id, score: kaykitHash('official-island-slot', island.id, r, c) });
          });
        });
        candidates.sort((a, b) => b.score - a.score);
        const usedIslands = new Map();
        KAYKIT_OFFICIAL_PACKS.forEach(pack => {
          const assetKey = kaykit3D.packRepresentatives.get(pack.id);
          if (!assetKey) return;
          let candidate = candidates.find(item => !reserved.has(key(item.r, item.c)) && (usedIslands.get(item.islandId) || 0) < 2);
          if (!candidate) candidate = candidates.find(item => !reserved.has(key(item.r, item.c)));
          if (!candidate) return;
          const cellKey = key(candidate.r, candidate.c);
          reserved.add(cellKey);
          usedIslands.set(candidate.islandId, (usedIslands.get(candidate.islandId) || 0) + 1);
          const p = kaykitCellPosition(candidate.r, candidate.c, 0);
          const object = cloneKayKitAsset(assetKey, { maxWidth: .44, maxHeight: .62, targetFloor: 0 });
          if (!object) return;
          object.position.set(p.x, .30, p.z);
          object.rotation.y = kaykitHash('official-rotation', pack.id, candidate.r, candidate.c) * Math.PI * 2;
          object.scale.multiplyScalar(pack.id === 'adventurers' || pack.id === 'skeletons' ? .74 : .88);
          group.add(object);
        });
        return reserved;
      }

      function renderKayKitHeroAccessories(group, character, playerId, p) {
        const accessorySets = [
          [["sword", .23, .48, .04, .24, .58, -.55], ["shield", -.25, .45, .02, .30, .48, .25]],
          [["staff", .25, .46, .03, .22, .72, -.18], ["spellbook", -.23, .44, .08, .30, .23, .25]],
          [["dagger", .23, .43, .04, .18, .46, -.72], ["smokebomb", -.23, .39, .07, .18, .18, .25]],
          [["axe", .24, .45, .03, .25, .62, -.55], ["barbarianShield", -.25, .44, .02, .30, .48, .18]]
        ];
        const set = accessorySets[playerId] || accessorySets[0];
        set.forEach(([key, dx, dy, dz, w, h, rot]) => {
          const item = cloneKayKitAsset(key, { maxWidth: w, maxHeight: h, targetFloor: 0 });
          if (!item) return;
          item.position.set(p.x + dx, p.y + dy, p.z + dz);
          item.rotation.set(0, (character.id?.length || 0) * .08 + rot, playerId === 1 ? .08 : -.16);
          group.add(item);
        });
      }

      /* ================================================================
       * GARDIENS — registre visuel persistant
       * ================================================================
       * Avant la V76, chaque appel à syncKayKitScene() vidait dynamicGroup,
       * reconstruisait tous les gardiens et repartait de `mixers = []`. Un
       * clic, un survol ou un rafraîchissement d'interface suffisait donc à
       * réinitialiser toutes les animations en cours.
       *
       * Désormais un gardien est créé UNE FOIS, vit dans characterGroup (jamais
       * vidé) et n'est reconstruit que s'il apparaît, disparaît, ou change
       * réellement de modèle. La synchronisation se contente de mettre à jour
       * position, orientation, sélection et couronne.
       */
      const ANIM = () => window.ILYOS_ANIM || null;
      const ANIM_STATES = () => window.ILYOS_ANIM?.STATES || {};

      // Intentions gameplay (déjà utilisées par le moteur) -> états d'animation.
      const KAYKIT_INTENT_TO_STATE = {
        move: "MOVE",
        attack: "PUSH",
        push: "PUSH",
        hurt: "HIT",
        magic: "MAGIC_CAST",
        victory: "VICTORY",
        score: "SCORE",
        pickup: "CROWN_PICKUP",
        throw: "CROWN_DROP",
        spawn: "SPAWN",
        fall: "FALL",
        neutral: "IDLE"
      };

      function kaykitReducedMotion() {
        return !!window.ILYOS_ANIM?.prefersReducedMotion?.();
      }

      function emitVisualEvent(name, payload) {
        window.ILYOS_VISUAL_EVENTS?.emit?.(name, payload);
      }

      /** Modèle KayKit attribué à un gardien — logique inchangée depuis la V75. */
      function resolveHeroAssetKey(character, index) {
        const playerId = character.player ?? 0;
        const teamHeroPools = state.players.length === 2
          ? { 0: ["hero0"], 1: ["hero1"] }
          : {
            0: ["hero0", "hero3"],
            1: ["hero1", "hero2Hooded"],
            2: ["hero2", "hero0"],
            3: ["hero3", "hero1"]
          };
        const teamPool = teamHeroPools[playerId] || teamHeroPools[0];
        const teamIndex = state.characters.filter((item, itemIndex) => itemIndex < index && (item.player ?? 0) === playerId).length;
        return teamPool[teamIndex % teamPool.length];
      }

      /** Repère l'os de la tête : sert d'ancrage à la couronne portée. */
      function findHeadBone(model) {
        let head = null;
        model.traverse?.(child => {
          if (head || !child.isBone) return;
          if (/^head$/i.test(child.name || "")) head = child;
        });
        if (head) return head;
        model.traverse?.(child => {
          if (head || !child.isBone) return;
          if (/head/i.test(child.name || "")) head = child;
        });
        return head;
      }

      function createCharacterVisual(character, index) {
        const playerId = character.player ?? 0;
        const assetKey = resolveHeroAssetKey(character, index);
        // Modèle encore en cours de chargement (pas encore dans assets, pas
        // encore marqué en échec) : on attend plutôt que de poser un modèle
        // de secours qu'il faudrait ensuite remplacer à chaud — l'attente est
        // très brève (assets locaux). Le modèle de secours ne reste utilisé
        // que si l'asset a réellement échoué (kaykit3D.failedAssets).
        if (!kaykit3D.assets.has(assetKey) && !kaykit3D.failedAssets.has(assetKey)) {
          // Point de passage obligé de tout gardien affiché : c'est ici qu'un
          // héros différé est réclamé, quelle que soit la façon dont la partie
          // a commencé — duel local, partie en ligne, sauvegarde reprise,
          // rejouée par l'IA. Aucun appelant n'a besoin de connaître la liste.
          ensureKayKitAsset(assetKey);
          return null;
        }
        const clips = kaykit3D?.assetAnimations.get(assetKey) || [];
        let wrapper = cloneKayKitAsset(assetKey, { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
        const usesFallback = !wrapper;
        if (!wrapper) wrapper = makeFallbackHero(playerId);
        if (playerId === 0 && assetKey === "hero0") styleKnightMetalArmor(wrapper);
        if (playerId === 1 && assetKey === "hero1") styleMagePalette(wrapper);

        const model = wrapper.children?.[0] || wrapper;

        // Les matériaux sont clonés UNE FOIS ici. Auparavant chaque
        // synchronisation reclonait tous les matériaux de tous les gardiens
        // pour appliquer la teinte de sélection : autant d'allocations
        // inutiles à chaque survol de case.
        const glowMaterials = [];
        wrapper.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const cloned = materials.map(material => {
            const mat = material.clone();
            mat.userData = { ...(mat.userData || {}), ilyosTransient: true };
            if ("emissive" in mat) glowMaterials.push(mat);
            mat.needsUpdate = true;
            return mat;
          });
          child.material = Array.isArray(child.material) ? cloned : cloned[0];
        });

        const seed = kaykitHash("hero-anim", character.id, assetKey, playerId);
        const animator = (clips.length && ANIM())
          ? new (ANIM().KayKitCharacterAnimator)(model, clips, { seed, id: character.id, assetKey })
          : null;

        const surfaceY = kaykitCellSurfaceY(character.r, character.c);
        const p = kaykitCellPosition(character.r, character.c, surfaceY);
        wrapper.position.set(p.x, p.y, p.z);
        const storedFacing = kaykit3D.characterFacing.get(String(character.id));
        const facing = Number.isFinite(storedFacing)
          ? storedFacing
          : kaykitFacingRotation(character.r, character.c, CENTER.r, CENTER.c);
        wrapper.rotation.y = facing;

        kaykit3D.characterGroup.add(wrapper);

        const visual = {
          id: String(character.id),
          assetKey,
          playerId,
          wrapper,
          model,
          animator,
          seed,
          hasClips: clips.length > 0 && !usesFallback,
          usesFallback,
          headBone: animator ? findHeadBone(model) : null,
          glowMaterials,
          teamColor: new THREE.Color(state.players[playerId]?.color || PLAYER_COLORS[playerId] || "#ffffff"),
          r: character.r,
          c: character.c,
          facing,
          facingTarget: facing,
          facingSpeed: 0,
          selected: false,
          carrying: false,
          halo: null,
          crown: null,
          move: null,
          fall: null,
          recoil: 0,
          baseModelY: model.position.y,
          baseModelScale: model.scale.x || 1,
          // Décalage de phase du bruit procédural de secours (modèles sans clips).
          proceduralSeed: kaykitHash("hero-procedural", character.id, assetKey, playerId),
          lastUpdate: 0
        };
        kaykit3D.characterVisuals.set(visual.id, visual);

        // Apparition : un gardien qui vient d'être posé mérite une vraie
        // animation, pas un simple affichage. Les gardiens déjà présents au
        // moment d'un chargement de partie démarrent directement en Idle
        // (voir syncKayKitCharacters -> spawnable).
        if (animator) {
          animator.play(ANIM_STATES().IDLE, { offset: seed, fade: 0 });
        }
        return visual;
      }

      function disposeCharacterVisual(visual) {
        if (!visual) return;
        visual.animator?.destroy();
        detachVisualCrown(visual);
        setCharacterSelected(visual, false);
        visual.wrapper?.traverse?.(obj => {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.filter(Boolean).forEach(mat => { if (mat.userData?.ilyosTransient) mat.dispose?.(); });
        });
        visual.wrapper?.parent?.remove(visual.wrapper);
        kaykit3D.characterVisuals.delete(visual.id);
      }

      /* ----------------------------------------------------------------
       * Sélection : halo créé/détruit uniquement quand la sélection change.
       * ---------------------------------------------------------------- */
      function setCharacterSelected(visual, selected) {
        if (!visual || visual.selected === selected) return;
        visual.selected = selected;

        /* Or de sélection, réservé au HALO — anneau, colonne, particules.
           Un seul gardien est sélectionné à la fois, tous joueurs confondus :
           rien n'exige que cette couleur varie par équipe. */
        const glowColor = new THREE.Color(0xffcf52);

        /* Le MODÈLE n'est plus touché du tout par la sélection.
           Mesuré avant correctif, sur un chevalier de duel symétrique :
             au repos        3 émissifs distincts (#15191a@.015, #3a2a0d@.025…)
             sélectionné     1 seul (#ffcf52@.062) — armure, peau et tissu confondus
             désélectionné   1 seul — les valeurs d'origine n'étaient JAMAIS rendues
           Le lavage doré était donc définitif : un gardien sélectionné une fois
           restait différent pour le reste de la partie. Deux passes avaient déjà
           réduit son intensité (.22 → .09) puis son amplitude (±.14 → ±.045)
           sans traiter la cause, qui est le remplacement de la couleur.

           Ne pas essayer de « mémoriser puis restaurer » ces émissifs : l'état
           des matériaux d'un gardien est écrit en DEUX temps — d'abord
           styleKnightMetalArmor / styleMagePalette à la création, puis
           character-materials-v1.js qui restaure les vrais matériaux du GLB une
           fois ce script chargé. Une capture faite à la création fige donc le
           métal gris intermédiaire (#182028), pas le rendu final. Le seul état
           juste est celui que porte le matériau à l'instant présent : on n'y
           touche pas.

           La lisibilité de la sélection est entièrement portée par le halo —
           anneau au sol, colonne de lumière, particules. C'était déjà écrit
           ici ; il suffisait d'en tirer la conséquence. */

        if (!selected) {
          if (visual.halo) {
            visual.halo.group.parent?.remove(visual.halo.group);
            visual.halo.particles.forEach(particle => particle.material?.dispose?.());
            visual.halo.beamMaterial?.dispose?.();
            visual.halo.ring?.material?.dispose?.();
            visual.halo = null;
          }
          return;
        }

        // Halo en trois pièces (anneau net, colonne de lumière, particules qui
        // montent) — voir l'historique de conception V75 : un disque plat au sol
        // se lit comme un autocollant, pas comme une source de lumière.
        // Il est désormais ENFANT du gardien : il le suit pendant un
        // déplacement, au lieu d'être recréé à chaque synchronisation.
        const glowMap = kaykitGlowTexture();
        const haloGroup = new THREE.Group();
        haloGroup.renderOrder = 15;

        const ring = new THREE.Mesh(
          kaykitGeometry("selection-halo-ring-v1", () => new THREE.TorusGeometry(.34, .017, 8, 40)),
          new THREE.MeshBasicMaterial({
            color: glowColor.clone(), transparent: true, opacity: .95, depthWrite: false,
            side: THREE.DoubleSide, toneMapped: false
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = .04;
        haloGroup.add(ring);

        // La colonne précédente (rayon .22 à la base) était plus large que le
        // gardien lui-même, et le dégradé du texture est le plus lumineux tout
        // en bas — exactement à hauteur de buste. Le gardien se retrouvait
        // littéralement À L'INTÉRIEUR d'un cône de lumière additive, d'où le
        // rendu « fantôme translucide ». Rayon divisé par trois : la colonne se
        // lit désormais comme un rai de lumière qui s'échappe derrière le
        // gardien plutôt que comme une lampe qui l'engloutit.
        const beamHeight = 1.35;
        const beamMaterial = new THREE.MeshBasicMaterial({
          map: kaykitBeamGradientTexture(), color: glowColor.clone(), transparent: true, opacity: .16,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, toneMapped: false
        });
        const beam = new THREE.Mesh(
          kaykitGeometry("selection-halo-beam-v3", () => new THREE.CylinderGeometry(.022, .075, beamHeight, 16, 1, true)),
          beamMaterial
        );
        beam.position.y = beamHeight / 2;
        haloGroup.add(beam);

        const particleMaterial = new THREE.SpriteMaterial({
          map: glowMap, color: glowColor.clone(), transparent: true, opacity: .85,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        });
        const particles = [];
        const particleCount = kaykitReducedMotion() ? 0 : 6;
        for (let i = 0; i < particleCount; i++) {
          const particle = new THREE.Sprite(particleMaterial.clone());
          particle.userData.baseAngle = (i / particleCount) * Math.PI * 2;
          particle.userData.radius = .16 + (i % 2) * .08;
          particle.userData.phase = i * .9;
          particle.scale.setScalar(.09);
          haloGroup.add(particle);
          particles.push(particle);
        }
        particleMaterial.dispose();

        visual.wrapper.add(haloGroup);
        visual.halo = { group: haloGroup, ring, beamMaterial, particles };
      }

      /* ----------------------------------------------------------------
       * Couronne portée : ancrée sur l'os de la tête.
       * ---------------------------------------------------------------- */
      function attachVisualCrown(visual) {
        if (!visual || visual.crown) return;
        const crown = makeCrown();
        crown.scale.setScalar(.62);
        // Enfant du groupe persistant (et non du gardien) : la couronne garde
        // ainsi une orientation verticale stable quelle que soit l'animation
        // en cours, tout en suivant exactement l'os de la tête (voir
        // updateKayKitCharacters).
        kaykit3D.characterGroup.add(crown);
        visual.crown = crown;
        visual.carrying = true;
      }

      function detachVisualCrown(visual) {
        if (!visual?.crown) return;
        visual.crown.parent?.remove(visual.crown);
        visual.crown = null;
        visual.carrying = false;
      }

      /** Position monde visée par la couronne portée. */
      const KAYKIT_TMP_VEC = new THREE.Vector3();
      function crownAnchorPosition(visual, out) {
        if (visual.headBone) {
          visual.headBone.getWorldPosition(out);
          out.y += .26;
          return out;
        }
        out.copy(visual.wrapper.position);
        out.y += .92;
        return out;
      }

      /* ----------------------------------------------------------------
       * Synchronisation : mise à jour incrémentale du registre.
       * ---------------------------------------------------------------- */
      function syncKayKitCharacters(artifactByCarrier, nextCharacterHistory) {
        if (!kaykit3D?.characterGroup) return;
        const seen = new Set();
        const now = performance.now();

        state.characters.forEach((character, index) => {
          const id = String(character.id);
          seen.add(id);
          const assetKey = resolveHeroAssetKey(character, index);
          let visual = kaykit3D.characterVisuals.get(id);

          // Reconstruction UNIQUEMENT si le modèle change réellement.
          if (visual && visual.assetKey !== assetKey) {
            disposeCharacterVisual(visual);
            visual = null;
          }

          const isNew = !visual;
          if (!visual) visual = createCharacterVisual(character, index);
          // Modèle KayKit pas encore chargé : on ne pose rien plutôt qu'un
          // modèle de secours (voir createCharacterVisual) — le gardien
          // apparaîtra dès que son modèle sera prêt, à la prochaine
          // synchronisation (assets locaux, attente très brève).
          if (!visual) return;

          // Un gardien réellement nouveau (pose d'île) joue son apparition ;
          // ceux reconstruits au chargement d'une sauvegarde ou à la reprise
          // d'une partie en ligne démarrent directement au repos.
          if (isNew && kaykit3D.sceneWarmedUp && !kaykitReducedMotion()) {
            playCharacterSpawn(visual);
          } else if (isNew) {
            kaykit3D.characterVisuals.get(id).wrapper.visible = true;
          }

          // Position logique : si aucune animation de déplacement n'est en
          // cours, le visuel se cale immédiatement sur la grille. Le gameplay
          // reste autoritaire — l'animation ne fait que raconter le résultat.
          const movedLogically = visual.r !== character.r || visual.c !== character.c;
          visual.r = character.r;
          visual.c = character.c;
          if (!visual.move && !visual.fall) {
            const surfaceY = kaykitCellSurfaceY(character.r, character.c);
            const p = kaykitCellPosition(character.r, character.c, surfaceY);
            const delta = Math.abs(visual.wrapper.position.x - p.x) + Math.abs(visual.wrapper.position.z - p.z);
            // Un changement de case NON initié par un déplacement volontaire —
            // typiquement un gardien poussé — faisait auparavant sauter le
            // modèle d'une case à l'autre d'une image à la suivante. On le fait
            // désormais glisser : c'est court, mais c'est ce qui rend la poussée
            // lisible. Seuil sur la distance pour ne pas déclencher un glissement
            // sur un simple recalage de surface.
            if (movedLogically && delta > .05 && !kaykitReducedMotion()) {
              visual.shove = {
                startedAt: performance.now(),
                duration: 240,
                from: visual.wrapper.position.clone(),
                to: new THREE.Vector3(p.x, p.y, p.z)
              };
            } else if (!visual.shove) {
              visual.wrapper.position.set(p.x, p.y, p.z);
            } else {
              // Une poussée en chaîne peut redéfinir la cible en cours de route.
              visual.shove.to.set(p.x, p.y, p.z);
            }
            if (movedLogically) {
              const storedFacing = kaykit3D.characterFacing.get(id);
              if (Number.isFinite(storedFacing)) visual.facingTarget = storedFacing;
            }
          }

          setCharacterSelected(visual, character.id === state.selectedCharId);

          const carries = artifactByCarrier.has(character.id);
          if (carries && !visual.crown) attachVisualCrown(visual);
          else if (!carries && visual.crown) detachVisualCrown(visual);

          // Le gardien au repos revient à l'Idle adapté à sa situation.
          if (visual.animator && !visual.animator.locked && !visual.move && !visual.fall) {
            visual.animator.toIdle({ selected: visual.selected, carrying: visual.carrying });
          }

          registerKayKitCellVisual(character.r, character.c, visual.wrapper);
          registerKayKitInteractive(visual.wrapper, "character", character.r, character.c);
          if (visual.crown) registerKayKitInteractive(visual.crown, "crown-carried", character.r, character.c);
          nextCharacterHistory.set(character.id, { r: character.r, c: character.c });
        });

        // Gardiens disparus du plateau : chute déjà jouée par la poussée, sinon
        // retrait immédiat.
        [...kaykit3D.characterVisuals.keys()].forEach(id => {
          if (seen.has(id)) return;
          const visual = kaykit3D.characterVisuals.get(id);
          if (visual?.fall) return;                 // la chute se termine d'elle-même
          disposeCharacterVisual(visual);
        });

        kaykit3D.sceneWarmedUp = true;
        kaykit3D.lastCharacterSyncAt = now;
      }

      /* ----------------------------------------------------------------
       * Séquences d'animation déclenchées par le gameplay
       * ---------------------------------------------------------------- */

      /** Apparition d'un gardien : cercle au sol, montée, puis Idle. */
      function playCharacterSpawn(visual) {
        if (!visual) return;
        const states = ANIM_STATES();
        visual.spawn = { startedAt: performance.now(), duration: 520 };
        visual.wrapper.visible = true;
        if (visual.animator?.hasState(states.SPAWN)) {
          visual.animator.play(states.SPAWN, { fade: 0, returnTo: states.IDLE });
        }
        spawnGroundBurst(visual.wrapper.position, visual.teamColor, { radius: .42, duration: 620 });
        emitVisualEvent("characterSpawned", { id: visual.id, r: visual.r, c: visual.c });
      }

      /** Rotation vers une cible puis marche synchronisée avec le tween. */
      function playCharacterMove(visual, route, duration) {
        if (!visual || !Array.isArray(route) || route.length < 2) return;
        const states = ANIM_STATES();
        const cells = route.length - 1;
        const reduced = kaykitReducedMotion();
        // Anticipation : le gardien pivote AVANT de partir. Sans ce temps,
        // un demi-tour se lisait comme une téléportation d'orientation.
        const turnDelay = reduced ? 0 : THREE.MathUtils.clamp(100 + cells * 20, 100, 180);
        const [r0, c0] = route[0];
        const [r1, c1] = route[1];
        visual.facingTarget = kaykitFacingRotation(r0, c0, r1, c1);

        const locomotion = cells >= 2 && visual.animator?.hasState("RUN") ? "RUN" : states.MOVE;
        const travel = Math.max(240, duration - turnDelay);
        visual.move = {
          route: route.map(step => [step[0], step[1]]),
          startedAt: performance.now() + turnDelay,
          duration: travel,
          cells,
          locomotion,
          started: false
        };
        if (visual.animator) {
          const timeScale = visual.animator.matchLocomotionSpeed(locomotion, cells, travel);
          // Le clip démarre pendant la rotation d'anticipation : le gardien
          // amorce son pas au moment où il pivote, ce qui supprime le temps mort.
          // CALIBRAGE DU FONDU D'ENTRÉE EN MARCHE. turnDelay (ligne ci-dessus) vaut
          // au minimum 120 ms (cells=1, le cas le plus fréquent) — c'était EXACTEMENT
          // la durée du fade (0.12s), marge nulle. Le crossfade Idle/Selected -> Marche
          // se terminait donc pile au moment, voire un peu APRÈS, où le tween de
          // position démarrait réellement : les toutes premières images du vrai
          // déplacement montraient encore un mélange de poses (jambes floues, pas mal
          // synchronisés avec le sol). C'est précisément ce qui manquait à un DEUXIÈME
          // déplacement enchaîné pendant que le gardien marche déjà : `play()`
          // court-circuite alors le fade (état déjà actif, voir plus haut), le clip
          // continue tel quel, donc net dès la première image — d'où l'impression
          // d'un pas mieux vu la deuxième fois.
          // Fade ramené à .08s : le fondu est désormais TOUJOURS terminé avant le
          // premier vrai pas, avec 40 ms de marge même dans le cas le plus serré.
          visual.animator.play(locomotion, { fade: 0.08, timeScale });
        }
        emitVisualEvent("characterMoved", { id: visual.id, from: route[0], to: route[route.length - 1], cells });
      }

      /** Poussée : anticipation, frappe, impact. */
      function playCharacterPush(visual, target, duration = 900) {
        if (!visual) return;
        const states = ANIM_STATES();
        if (target && Number.isFinite(target.r)) {
          visual.facingTarget = kaykitFacingRotation(visual.r, visual.c, target.r, target.c);
        }
        const animator = visual.animator;
        if (!animator) return;

        // CALIBRAGE — les clips d'attaque KayKit sont longs (Punch_A dure 1,47 s)
        // parce qu'ils sont pensés pour un jeu d'action, pas pour une action de
        // plateau qui doit se lire en moins d'une seconde. Joués à vitesse 1
        // dans une fenêtre de 900 ms, ils paraissaient mous et se faisaient
        // couper en plein geste. On les recale donc sur la durée réelle de
        // l'action, borné pour ne jamais devenir saccadé ni ridicule.
        const clipDuration = animator.durationOf(states.PUSH);
        const targetSeconds = Math.max(.34, (duration / 1000) * .82);
        const timeScale = clipDuration > 0
          ? THREE.MathUtils.clamp(clipDuration / targetSeconds, 1, 2.6)
          : 1;
        const scaledMs = clipDuration > 0 ? (clipDuration / timeScale) * 1000 : duration;

        // Recul d'armement calé sur la durée réellement jouée.
        visual.recoilPhase = { startedAt: performance.now(), duration: scaledMs };
        animator.play(states.PUSH, {
          fade: 0.08,
          force: true,
          timeScale,
          returnTo: states.IDLE,
          onFinish: () => emitVisualEvent("pushRecovered", { id: visual.id })
        });
        // L'impact tombe à ~45 % du clip REJOUÉ (et non de sa durée d'origine) :
        // c'est là que le poing arrive vraiment.
        const impactDelay = Math.max(70, scaledMs * .45);
        kaykit3D.visualSequences.push({
          at: performance.now() + impactDelay,
          run: () => {
            if (!target || !Number.isFinite(target.r)) return;
            const surfaceY = kaykitCellSurfaceY(target.r, target.c);
            const p = kaykitCellPosition(target.r, target.c, surfaceY);
            spawnImpactBurst(p);
            emitVisualEvent("pushImpact", { id: visual.id, r: target.r, c: target.c });
          }
        });
        emitVisualEvent("characterPushed", { id: visual.id, target });
      }

      /** Réaction du gardien poussé. */
      function playCharacterHit(visual, source, delay = 0) {
        if (!visual?.animator) return;
        const states = ANIM_STATES();
        const trigger = () => {
          if (!kaykit3D?.characterVisuals.has(visual.id)) return;
          // Une réaction retardée ne doit jamais écraser une chute déjà lancée :
          // le gardien éjecté repasserait en pose debout en plein vol.
          if (visual.fall) return;
          if (source && Number.isFinite(source.r)) {
            visual.facingTarget = kaykitFacingRotation(visual.r, visual.c, source.r, source.c);
          }
          visual.animator.play(states.HIT, { fade: 0.08, force: true, returnTo: states.IDLE });
        };
        if (delay > 0) kaykit3D.visualSequences.push({ at: performance.now() + delay, run: trigger });
        else trigger();
      }

      /** Magie : le gardien lance réellement le sort. */
      function playCharacterMagic(visual, target) {
        if (!visual?.animator) return;
        const states = ANIM_STATES();
        if (target && Number.isFinite(target.r)) {
          visual.facingTarget = kaykitFacingRotation(visual.r, visual.c, target.r, target.c);
        }
        visual.animator.play(states.MAGIC_CAST, { fade: 0.12, force: true, returnTo: states.IDLE });
        spawnCastAura(visual);
        emitVisualEvent("magicCast", { id: visual.id, target });
      }

      /** Chute dans le vide : trajectoire courte vers la couche nuageuse. */
      function playCharacterFall(visual, direction = null) {
        if (!visual || visual.fall) return;
        const states = ANIM_STATES();
        visual.move = null;
        visual.shove = null;

        // Le gardien doit d'abord ATTEINDRE la case du vide, puis tomber depuis
        // celle-ci. Le faire descendre depuis sa case d'origine le faisait
        // traverser l'île sur laquelle il se tenait encore.
        const from = visual.wrapper.position.clone();
        let to = null;
        if (direction && Number.isFinite(direction.toR) && Number.isFinite(direction.toC)) {
          const p = kaykitCellPosition(direction.toR, direction.toC, from.y);
          to = new THREE.Vector3(p.x, from.y, p.z);
        } else if (direction && (direction.dr || direction.dc)) {
          // Sans case connue, on se rabat sur une case entière dans le sens de
          // la poussée — jamais une fraction, qui laisserait le gardien au-dessus
          // du sol de l'île.
          to = new THREE.Vector3(
            from.x + direction.dc * KAYKIT_CELL_SPACING,
            from.y,
            from.z + direction.dr * KAYKIT_CELL_SPACING
          );
        }

        const reduced = kaykitReducedMotion();
        visual.fall = {
          startedAt: performance.now(),
          // `ejectRatio` : part du temps total consacrée au trajet horizontal
          // au-dessus du plateau, avant que la gravité ne prenne le dessus.
          ejectRatio: to ? .26 : 0,
          duration: reduced ? 260 : 820,
          from,
          to,
          fromY: from.y,
          spin: (Math.random() - .5) * 2.4
        };
        // Le gardien réagit d'abord au coup, puis part : jouer directement la
        // chute donnait une bascule molle, sans lien avec la poussée reçue.
        visual.animator?.play(states.HIT, { fade: 0.06, force: true });
        kaykit3D.visualSequences.push({
          at: performance.now() + 130,
          run: () => { if (visual.fall) visual.animator?.play(states.FALL, { fade: 0.1, force: true }); }
        });
        emitVisualEvent("characterFell", { id: visual.id, r: visual.r, c: visual.c });
      }

      /** Célébration : les gardiens ne partent jamais tous sur la même image. */
      function playCharacterVictory(visual, delay = 0) {
        if (!visual?.animator) return;
        const states = ANIM_STATES();
        kaykit3D.visualSequences.push({
          at: performance.now() + delay,
          run: () => {
            if (!kaykit3D?.characterVisuals.has(visual.id)) return;
            visual.animator.play(states.VICTORY, {
              fade: 0.16,
              force: true,
              timeScale: .92 + visual.seed * .2,
              returnTo: states.IDLE
            });
          }
        });
      }

      /**
       * Rotation visuelle d'une île sous l'effet de la magie.
       *
       * L'île n'était jusqu'ici animée qu'en 2D sur le plateau DOM : en 3D elle
       * se contentait de réapparaître à sa nouvelle place. Elle se soulève
       * désormais, tourne autour de la case pivot, puis se repose avec un léger
       * amortissement.
       *
       * IMPORTANT : purement visuel. Les coordonnées logiques sont appliquées
       * par confirmMagicRotation à la fin de son propre délai — cette fonction
       * ne décide de rien et ne déplace aucune case.
       *
       * @param {number} signedDegrees rotation réelle, signée (+90, +180, -90…)
       */
      function playIslandMagicRotation(islandId, signedDegrees, pivotR, pivotC, duration = 500) {
        if (!kaykit3D || !Number.isFinite(pivotR) || !Number.isFinite(pivotC)) return;
        if (kaykitReducedMotion()) return;

        const blocks = [];
        kaykit3D.dynamicGroup.children.forEach(child => {
          if (child.userData?.islandBlock && String(child.userData.islandId) === String(islandId)) blocks.push(child);
        });
        if (!blocks.length) return;

        const pivotPos = kaykitCellPosition(pivotR, pivotC, 0);
        const pivot = new THREE.Group();
        pivot.position.set(pivotPos.x, 0, pivotPos.z);
        kaykit3D.dynamicGroup.add(pivot);
        // Les blocs d'île sont construits en coordonnées monde à l'origine du
        // groupe : on les décale de l'inverse du pivot pour que la rotation du
        // conteneur s'effectue bien autour de la case choisie.
        blocks.forEach(block => {
          block.position.x -= pivotPos.x;
          block.position.z -= pivotPos.z;
          pivot.add(block);
        });

        // Le sens : le moteur applique (dr,dc) -> (dc,-dr) pour un cran positif.
        // Avec x = c et z = r, cela correspond à une rotation de -90° autour de
        // Y. Le signe est donc inversé par rapport aux degrés du plateau.
        const targetY = -THREE.MathUtils.degToRad(signedDegrees);
        const easing = window.ILYOS_ANIM?.easing;
        kaykit3D.fxTweens.push({
          object: pivot,
          startedAt: performance.now(),
          duration,
          update: (obj, t) => {
            // Élévation en cloche : l'île se soulève, tourne, puis se repose.
            const lift = Math.sin(t * Math.PI) * .34;
            const spin = easing ? easing.easeInOutCubic(t) : t * t * (3 - 2 * t);
            obj.position.y = lift;
            obj.rotation.y = targetY * spin;
            // Amortissement final : très légère compression à l'atterrissage.
            if (t > .88) obj.position.y = -Math.sin((t - .88) / .12 * Math.PI) * .022;
          },
          dispose: obj => {
            // Les blocs sont RENDUS au groupe dynamique avec leur position
            // d'origine avant que le conteneur ne soit retiré. Les supprimer
            // avec lui ferait disparaître l'île pendant la ou les images qui
            // séparent la fin du tween de la reconstruction de la scène.
            const parent = obj.parent;
            [...obj.children].forEach(block => {
              block.position.x += pivotPos.x;
              block.position.z += pivotPos.z;
              block.position.y = 0;
              parent?.add(block);
            });
            parent?.remove(obj);
          }
        });

        spawnGroundBurst(new THREE.Vector3(pivotPos.x, .05, pivotPos.z), new THREE.Color(0x9d7bff), { radius: .5, duration });
        emitVisualEvent("islandRotated", { islandId, degrees: signedDegrees, pivot: [pivotR, pivotC] });
      }

      /** Trait d'énergie du lanceur vers l'île ciblée. */
      function linkCasterToIsland(casterId, pivotR, pivotC) {
        const visual = kaykit3D?.characterVisuals.get(String(casterId));
        if (!visual || !Number.isFinite(pivotR)) return;
        visual.facingTarget = kaykitFacingRotation(visual.r, visual.c, pivotR, pivotC);
        const from = visual.wrapper.position.clone();
        from.y += .8;
        const p = kaykitCellPosition(pivotR, pivotC, 0);
        spawnMagicLink(from, new THREE.Vector3(p.x, .35, p.z));
      }

      /* ================================================================
       * COURONNES
       * ================================================================ */

      /**
       * Ramassage : le gardien regarde la couronne, joue son animation de prise,
       * et la couronne le rejoint physiquement au lieu d'apparaître au-dessus
       * de sa tête d'une image à l'autre.
       */
      function playCrownPickup(characterId, fromR, fromC) {
        const visual = kaykit3D?.characterVisuals.get(String(characterId));
        if (!visual) return;
        const states = ANIM_STATES();
        if (Number.isFinite(fromR) && Number.isFinite(fromC)) {
          visual.facingTarget = kaykitFacingRotation(visual.r, visual.c, fromR, fromC);
        }
        visual.animator?.play(states.CROWN_PICKUP, {
          fade: .1,
          force: true,
          timeScale: 1.35,
          returnTo: states.IDLE
        });
        if (!kaykitReducedMotion()) {
          const surfaceY = kaykitCellSurfaceY(fromR ?? visual.r, fromC ?? visual.c);
          const p = kaykitCellPosition(fromR ?? visual.r, fromC ?? visual.c, surfaceY);
          spawnGroundBurst(new THREE.Vector3(p.x, p.y + .02, p.z), new THREE.Color(0xffcf52), { radius: .3, duration: 420 });
        }
        emitVisualEvent("crownPicked", { id: String(characterId), from: [fromR, fromC] });
      }

      /**
       * Trajectoire d'une couronne entre deux points du plateau : transfert à un
       * allié ou projection. L'arc et la rotation évitent la lecture « la
       * couronne a été téléportée ».
       */
      function playCrownFlight(fromR, fromC, toR, toC, { arc = .9, duration = 420 } = {}) {
        if (!kaykit3D || kaykitReducedMotion()) return;
        const crown = makeCrown();
        crown.scale.setScalar(.6);
        kaykit3D.fxGroup.add(crown);
        const a = kaykitCellPosition(fromR, fromC, kaykitCellSurfaceY(fromR, fromC) + .4);
        const b = kaykitCellPosition(toR, toC, kaykitCellSurfaceY(toR, toC) + .4);
        const from = new THREE.Vector3(a.x, a.y, a.z);
        const to = new THREE.Vector3(b.x, b.y, b.z);
        const easing = window.ILYOS_ANIM?.easing;
        kaykit3D.fxTweens.push({
          object: crown,
          startedAt: performance.now(),
          duration,
          update: (obj, t) => {
            obj.position.lerpVectors(from, to, t);
            obj.position.y += Math.sin(t * Math.PI) * arc;
            obj.rotation.y = t * Math.PI * 3;
            obj.rotation.z = Math.sin(t * Math.PI) * .5;
          },
          dispose: obj => {
            // Petite impulsion à l'atterrissage, puis retrait : c'est la
            // synchronisation qui affichera ensuite la couronne à sa vraie place.
            spawnGroundBurst(to, new THREE.Color(0xffcf52), { radius: .26, duration: 320 });
            obj.parent?.remove(obj);
          }
        });
        emitVisualEvent("crownThrown", { from: [fromR, fromC], to: [toR, toC] });
      }

      /** Validation au village : moment fort du jeu, halo doré et célébration. */
      function playCrownScore(characterId) {
        const visual = kaykit3D?.characterVisuals.get(String(characterId));
        if (!visual) return;
        const gold = new THREE.Color(0xffcf52);
        spawnGroundBurst(visual.wrapper.position, gold, { radius: .68, duration: 760 });
        if (!kaykitReducedMotion()) {
          const pool = kaykitFxSpritePool();
          if (pool) {
            for (let i = 0; i < 14; i++) {
              const mote = pool.acquire();
              mote.material.color.copy(gold);
              mote.scale.setScalar(.1);
              kaykit3D.fxGroup.add(mote);
              const angle = (i / 14) * Math.PI * 2;
              const base = visual.wrapper.position.clone();
              const radius = .3 + Math.random() * .45;
              kaykit3D.fxTweens.push({
                object: mote,
                startedAt: performance.now() + i * 18,
                duration: 900,
                update: (obj, t) => {
                  obj.position.set(
                    base.x + Math.cos(angle) * radius * (.4 + t),
                    base.y + .1 + t * 1.5,
                    base.z + Math.sin(angle) * radius * (.4 + t)
                  );
                  obj.material.opacity = Math.sin(t * Math.PI) * .95;
                },
                dispose: obj => pool.release(obj)
              });
            }
          }
        }
        emitVisualEvent("crownScored", { id: String(characterId) });
      }

      /* ================================================================
       * POSE D'ÎLE
       * ================================================================ */

      /**
       * L'île apparaît légèrement au-dessus de sa position puis descend et se
       * pose avec un amortissement — elle « se matérialise » au lieu de
       * simplement s'afficher.
       */
      function playIslandDrop(islandId, duration = 520) {
        if (!kaykit3D || kaykitReducedMotion()) return;
        // La synchronisation qui suit la pose reconstruit les blocs : on attend
        // donc une image avant de chercher le bloc à animer.
        kaykit3D.visualSequences.push({
          at: performance.now() + 30,
          run: () => {
            const blocks = kaykit3D.dynamicGroup.children.filter(
              child => child.userData?.islandBlock && String(child.userData.islandId) === String(islandId)
            );
            if (!blocks.length) return;
            const easing = window.ILYOS_ANIM?.easing;
            blocks.forEach(block => {
              const baseY = block.position.y;
              kaykit3D.fxTweens.push({
                object: block,
                startedAt: performance.now(),
                duration,
                update: (obj, t) => {
                  // Descente en easeOut puis très légère compression : le poids
                  // d'un morceau d'île qui se pose.
                  const drop = easing ? easing.easeOutQuint(t) : 1 - Math.pow(1 - t, 5);
                  const settle = t > .82 ? -Math.sin((t - .82) / .18 * Math.PI) * .03 : 0;
                  obj.position.y = baseY + (1 - drop) * .85 + settle;
                },
                dispose: obj => { obj.position.y = baseY; }
              });
            });
            emitVisualEvent("islandPlaced", { islandId });
          }
        });
      }

      /* ================================================================
       * VICTOIRE
       * ================================================================ */

      /**
       * Célébration de fin de partie. Les gardiens gagnants ne partent jamais
       * sur la même image : sans décalage, une équipe entière qui applaudit à
       * l'unisson se lit comme un bug d'animation.
       * Les adversaires gardent une pose neutre — pas d'animation humiliante.
       */
      function playVictoryCelebration(playerId) {
        if (!kaykit3D) return;
        const gold = new THREE.Color(0xffcf52);
        let index = 0;
        kaykit3D.characterVisuals.forEach(visual => {
          if (visual.playerId !== playerId) return;
          playCharacterVictory(visual, index * 140 + Math.floor(visual.seed * 220));
          index++;
          if (kaykitReducedMotion()) return;
          kaykit3D.visualSequences.push({
            at: performance.now() + index * 140,
            run: () => {
              if (!kaykit3D?.characterVisuals.has(visual.id)) return;
              spawnGroundBurst(visual.wrapper.position, gold, { radius: .55, duration: 820 });
            }
          });
        });
        emitVisualEvent("victory", { playerId });
      }

      function characterVisualById(characterId) {
        return kaykit3D?.characterVisuals.get(String(characterId)) || null;
      }

      /* ================================================================
       * OUTIL DE DIAGNOSTIC
       * ================================================================
       * Exposé sur window mais jamais affiché : aucun élément d'interface n'y
       * renvoie, un joueur normal ne le rencontre pas. Sert à vérifier quels
       * clips existent réellement dans les GLB et lequel joue à un instant T.
       */
      window.ILYOS_ANIMATION_DEBUG = {
        /** Vue d'ensemble : un objet par gardien présent sur le plateau. */
        get characters() {
          if (!kaykit3D) return [];
          return [...kaykit3D.characterVisuals.values()].map(visual => ({
            id: visual.id,
            player: visual.playerId,
            model: visual.assetKey,
            state: visual.animator?.state || "(aucun animateur)",
            clip: visual.animator?.currentClipName || null,
            locked: !!visual.animator?.locked,
            clipCount: visual.animator ? visual.animator.listClips().length : 0,
            cell: `${visual.r},${visual.c}`,
            selected: visual.selected,
            carrying: visual.carrying,
            moving: !!visual.move,
            falling: !!visual.fall
          }));
        },
        get stats() {
          if (!kaykit3D) return null;
          return {
            visuelsPersistants: kaykit3D.characterVisuals.size,
            animateursActifs: [...kaykit3D.characterVisuals.values()].filter(v => v.animator).length,
            actionsEnAttente: kaykit3D.pendingActionAnimations.size,
            sequencesEnAttente: kaykit3D.visualSequences.length,
            fxEnCours: kaykit3D.fxTweens.length,
            clipsCharges: kaykit3D.animationClipNames.size,
            mouvementRéduit: kaykitReducedMotion()
          };
        },
        /** Clips disponibles pour un gardien (ou pour tous si aucun id). */
        listClips(characterId) {
          if (characterId != null) {
            const visual = characterVisualById(characterId);
            return visual?.animator?.listClips() || [];
          }
          const out = {};
          kaykit3D?.characterVisuals.forEach(visual => {
            out[`${visual.id} (${visual.assetKey})`] = visual.animator?.listClips() || [];
          });
          return out;
        },
        /** Joue un clip brut par son nom — pour tester une animation à la main. */
        play(characterId, clipName, { loop = false } = {}) {
          const visual = characterVisualById(characterId);
          if (!visual?.animator) return `Gardien ${characterId} introuvable ou sans animateur.`;
          const clips = visual.animator.clipIndex;
          if (!clips.has(clipName)) return `Clip "${clipName}" absent. Voir listClips(${characterId}).`;
          const action = visual.animator._action(clips.get(clipName));
          visual.animator.current?.crossFadeTo(action.reset().play(), .15, false);
          visual.animator.current = action;
          visual.animator.currentClipName = clipName;
          action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
          action.clampWhenFinished = !loop;
          return `Lecture de "${clipName}" sur le gardien ${characterId}.`;
        },
        /**
         * Rejoue une séquence complète (et non un simple clip) pour vérifier
         * son calibrage sans avoir à monter la situation de jeu correspondante.
         */
        sequence(characterId, kind = "push", options = {}) {
          const visual = characterVisualById(characterId);
          if (!visual) return `Gardien ${characterId} introuvable.`;
          const target = options.target || { r: visual.r, c: visual.c + 1 };
          switch (kind) {
            case "push": playCharacterPush(visual, target, options.duration || 900); break;
            case "hit": playCharacterHit(visual, target, options.delay || 0); break;
            case "magic": playCharacterMagic(visual, target); break;
            case "fall": playCharacterFall(visual, options.direction || { dr: 0, dc: 1 }); break;
            case "spawn": playCharacterSpawn(visual); break;
            case "victory": playCharacterVictory(visual, options.delay || 0); break;
            default: return `Séquence inconnue : ${kind}.`;
          }
          return `Séquence "${kind}" lancée sur ${characterId} (clip ${visual.animator?.currentClipName}).`;
        },
        /**
         * Force la validation de la 3e couronne pour un joueur, en passant par
         * le VRAI chemin de score (scoreCrownForPlayer) plutôt qu'en simulant
         * l'effet : sert à vérifier la célébration de victoire sans avoir à
         * jouer une partie complète jusqu'au bout.
         */
        forceVictory(playerId = 0) {
          const player = state?.players?.[playerId];
          const char = state?.characters?.find(c => c.player === playerId);
          if (!player || !char) return `Joueur ${playerId} ou gardien introuvable.`;
          player.score = 2;
          const artifact = state.artifact;
          artifact.active = true;
          artifact.carrierId = char.id;
          artifact.r = char.r;
          artifact.c = char.c;
          scoreCrownForPlayer(player, char, false, artifact);
          return `Victoire forcée pour ${player.name} via char-${char.id}.`;
        },
        /**
         * Rejoue la rotation visuelle d'une île, pour contrôler que son sens
         * correspond bien à la rotation logique appliquée par le moteur.
         */
        rotateIsland(islandId, signedDegrees = 90, pivotR = null, pivotC = null) {
          const island = state?.islands?.find(item => String(item.id) === String(islandId));
          if (!island) return `Île ${islandId} introuvable (îles : ${(state?.islands || []).map(i => i.id).join(", ")}).`;
          const [r, c] = island.cells[0];
          playIslandMagicRotation(islandId, signedDegrees, pivotR ?? r, pivotC ?? c, 900);
          return `Rotation de ${signedDegrees}° autour de (${pivotR ?? r},${pivotC ?? c}).`;
        },
        /** Rejoue un état de la machine à états (IDLE, MOVE, PUSH...). */
        state(characterId, stateName) {
          const visual = characterVisualById(characterId);
          if (!visual?.animator) return `Gardien ${characterId} introuvable.`;
          visual.animator.play(stateName, { force: true });
          return `État "${stateName}" -> clip "${visual.animator.currentClipName}".`;
        }
      };
      /* ================================================================
       * EFFETS D'ACTION — pool partagé
       * ================================================================
       * Les impacts et halos sont créés à chaque poussée, magie ou apparition.
       * Sans réutilisation, chaque action alloue géométries et matériaux, ce
       * qui provoque des à-coups du ramasse-miettes sur mobile. Les sprites
       * sont donc empruntés à un pool et rendus après usage.
       */
      function kaykitFxSpritePool() {
        if (!kaykit3D) return null;
        if (!kaykit3D._fxSpritePool) {
          const Pool = window.ILYOS_ANIM?.FxPool;
          if (!Pool) return null;
          const map = kaykitGlowTexture();
          kaykit3D._fxSpritePool = new Pool(() => new THREE.Sprite(new THREE.SpriteMaterial({
            map, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false
          })), { max: 40 });
        }
        return kaykit3D._fxSpritePool;
      }

      /**
       * Anneau qui s'écarte au sol : apparition d'un gardien, atterrissage.
       * Enregistré dans fxTweens, mis à jour par la boucle de rendu.
       */
      function spawnGroundBurst(position, color, { radius = .4, duration = 520 } = {}) {
        if (!kaykit3D || kaykitReducedMotion()) return;
        const ring = new THREE.Mesh(
          kaykitGeometry("fx-ground-ring-v1", () => new THREE.RingGeometry(.28, .34, 32)),
          new THREE.MeshBasicMaterial({
            color: (color || new THREE.Color(0xffe6a8)).clone(), transparent: true, opacity: .85,
            side: THREE.DoubleSide, depthWrite: false, toneMapped: false
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(position);
        ring.position.y += .05;
        kaykit3D.fxGroup.add(ring);
        kaykit3D.fxTweens.push({
          object: ring, startedAt: performance.now(), duration,
          update: (obj, t) => {
            const eased = 1 - Math.pow(1 - t, 3);
            obj.scale.setScalar(.5 + eased * radius * 5.2);
            obj.material.opacity = .85 * (1 - eased);
          },
          dispose: obj => { obj.material.dispose(); obj.parent?.remove(obj); }
        });
      }

      /**
       * Impact de poussée : flash bref + éclats de poussière.
       * Volontairement court (moins de 400 ms) pour ne jamais retarder le tour.
       */
      function spawnImpactBurst(position) {
        if (!kaykit3D) return;
        playSfx?.("push");
        if (kaykitReducedMotion()) return;
        const pool = kaykitFxSpritePool();
        const flash = new THREE.Sprite(new THREE.SpriteMaterial({
          map: kaykitGlowTexture(), color: new THREE.Color(0xfff2cc), transparent: true,
          opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
        }));
        flash.position.copy(position);
        flash.position.y += .55;
        flash.scale.setScalar(.35);
        kaykit3D.fxGroup.add(flash);
        kaykit3D.fxTweens.push({
          object: flash, startedAt: performance.now(), duration: 240,
          update: (obj, t) => {
            obj.scale.setScalar(.35 + t * .75);
            obj.material.opacity = .95 * (1 - t);
          },
          dispose: obj => { obj.material.dispose(); obj.parent?.remove(obj); }
        });

        if (!pool) return;
        for (let i = 0; i < 7; i++) {
          const speck = pool.acquire();
          const angle = (i / 7) * Math.PI * 2 + Math.random() * .5;
          const spread = .18 + Math.random() * .22;
          speck.material.color.setHex(0xd9c9a6);
          speck.material.opacity = .8;
          speck.scale.setScalar(.07 + Math.random() * .05);
          speck.position.copy(position);
          speck.position.y += .3;
          kaykit3D.fxGroup.add(speck);
          const dx = Math.cos(angle) * spread;
          const dz = Math.sin(angle) * spread;
          const origin = speck.position.clone();
          kaykit3D.fxTweens.push({
            object: speck, startedAt: performance.now(), duration: 380 + Math.random() * 140,
            update: (obj, t) => {
              const eased = 1 - Math.pow(1 - t, 2);
              obj.position.set(
                origin.x + dx * eased * 2.1,
                origin.y + Math.sin(t * Math.PI) * .28,
                origin.z + dz * eased * 2.1
              );
              obj.material.opacity = .8 * (1 - t);
            },
            dispose: obj => pool.release(obj)
          });
        }
      }

      /** Énergie qui apparaît autour du gardien pendant l'incantation. */
      function spawnCastAura(visual) {
        if (!kaykit3D || !visual || kaykitReducedMotion()) return;
        const color = new THREE.Color(0x9d7bff);
        spawnGroundBurst(visual.wrapper.position, color, { radius: .34, duration: 700 });
        const pool = kaykitFxSpritePool();
        if (!pool) return;
        for (let i = 0; i < 8; i++) {
          const mote = pool.acquire();
          mote.material.color.copy(color);
          mote.scale.setScalar(.08);
          kaykit3D.fxGroup.add(mote);
          const angle = (i / 8) * Math.PI * 2;
          const base = visual.wrapper.position.clone();
          kaykit3D.fxTweens.push({
            object: mote, startedAt: performance.now() + i * 26, duration: 620,
            update: (obj, t) => {
              // Spirale ascendante : l'énergie converge vers les mains du mage.
              const radius = .38 * (1 - t) + .06;
              const spin = angle + t * 3.4;
              obj.position.set(
                base.x + Math.cos(spin) * radius,
                base.y + .12 + t * .95,
                base.z + Math.sin(spin) * radius
              );
              obj.material.opacity = Math.sin(t * Math.PI) * .9;
            },
            dispose: obj => pool.release(obj)
          });
        }
      }

      /** Trait d'énergie entre le lanceur et l'île ciblée. */
      function spawnMagicLink(fromPosition, toPosition) {
        if (!kaykit3D || kaykitReducedMotion()) return;
        const pool = kaykitFxSpritePool();
        if (!pool) return;
        const count = 10;
        for (let i = 0; i < count; i++) {
          const mote = pool.acquire();
          mote.material.color.setHex(0x9d7bff);
          mote.scale.setScalar(.1);
          kaykit3D.fxGroup.add(mote);
          const offset = i / count;
          kaykit3D.fxTweens.push({
            object: mote, startedAt: performance.now() + i * 18, duration: 420,
            update: (obj, t) => {
              const progress = Math.min(1, t + offset * .2);
              obj.position.lerpVectors(fromPosition, toPosition, progress);
              // Arc léger : une ligne parfaitement droite se lit comme un bug
              // de rendu plutôt que comme un projectile.
              obj.position.y += Math.sin(progress * Math.PI) * .5;
              obj.material.opacity = Math.sin(t * Math.PI) * .85;
            },
            dispose: obj => pool.release(obj)
          });
        }
      }

      /* ================================================================
       * BOUCLE DE RENDU DES GARDIENS
       * ================================================================ */
      const KAYKIT_TMP_CROWN = new THREE.Vector3();

      /** Interpolation d'angle par le chemin le plus court (jamais de 180° sec). */
      function approachAngle(current, target, maxDelta) {
        let diff = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        if (Math.abs(diff) <= maxDelta) return target;
        return current + Math.sign(diff) * maxDelta;
      }

      function updateKayKitCharacters(delta, elapsed, now) {
        if (!kaykit3D?.characterVisuals?.size) return;
        const reduced = kaykitReducedMotion();
        // Budget d'animation : en mode performance, les gardiens au repos et
        // sans action en cours ne sont mis à jour qu'une image sur deux. Les
        // gardiens qui bougent, tombent ou jouent une action gardent toujours
        // 60 Hz — c'est là que la fluidité se voit.
        const economy = kaykit3D.qualityMode === "performance";
        const frameParity = (kaykit3D._animFrame = (kaykit3D._animFrame || 0) + 1) % 2;

        kaykit3D.characterVisuals.forEach(visual => {
          if (!visual.wrapper?.parent) return;

          /* --- 1. Animation squelette ------------------------------- */
          // Un gardien « occupé » (déplacement, chute, action en cours) garde
          // toujours la pleine cadence. Les autres peuvent, en mode performance,
          // n'être évalués qu'une image sur deux — avec le delta CUMULÉ, sinon
          // leur Idle tournerait deux fois moins vite au lieu d'être allégé.
          const busy = !!(visual.move || visual.fall || visual.shove || visual.spawn || visual.animator?.locked);
          if (visual.animator) {
            if (!economy || busy) {
              visual.animator.update(delta);
            } else {
              visual._pendingDelta = (visual._pendingDelta || 0) + delta;
              if ((kaykitHash(visual.id) * 2 | 0) !== frameParity) {
                visual.animator.update(visual._pendingDelta);
                visual._pendingDelta = 0;
              }
            }
          }

          /* --- 2. Orientation --------------------------------------- */
          // Une rotation progressive, jamais instantanée : c'est l'anticipation
          // qui rend un déplacement lisible. ~10 rad/s couvre un demi-tour en
          // un peu plus de 300 ms.
          if (visual.wrapper.rotation.y !== visual.facingTarget) {
            const speed = reduced ? 40 : 10.5;
            visual.wrapper.rotation.y = approachAngle(visual.wrapper.rotation.y, visual.facingTarget, speed * delta);
            visual.facing = visual.wrapper.rotation.y;
            kaykit3D.characterFacing.set(visual.id, visual.facing);
          }

          /* --- 3. Déplacement --------------------------------------- */
          if (visual.move) {
            const move = visual.move;
            if (now >= move.startedAt) {
              const progress = THREE.MathUtils.clamp((now - move.startedAt) / Math.max(1, move.duration), 0, 1);
              const segmentCount = move.route.length - 1;
              const scaled = progress * segmentCount;
              const segment = Math.min(segmentCount - 1, Math.floor(scaled));
              const t = THREE.MathUtils.clamp(scaled - segment, 0, 1);
              const local = t * t * (3 - 2 * t);
              const [r0, c0] = move.route[segment];
              const [r1, c1] = move.route[segment + 1];
              const a = kaykitCellPosition(r0, c0, kaykitCellSurfaceY(r0, c0));
              const b = kaykitCellPosition(r1, c1, kaykitCellSurfaceY(r1, c1));
              visual.wrapper.position.set(
                THREE.MathUtils.lerp(a.x, b.x, local),
                THREE.MathUtils.lerp(a.y, b.y, local),
                THREE.MathUtils.lerp(a.z, b.z, local)
              );
              // Le gardien regarde toujours le segment qu'il est en train de
              // parcourir : sur un trajet en L, il pivote donc au virage.
              if (r0 !== r1 || c0 !== c1) visual.facingTarget = kaykitFacingRotation(r0, c0, r1, c1);

              if (progress >= 1) {
                visual.move = null;
                // Arrivée : petit amortissement puis retour au repos. Le
                // crossfade évite la coupure sèche marche -> immobile.
                visual.settle = { startedAt: now, duration: reduced ? 0 : 180 };
                visual.animator?.toIdle({ selected: visual.selected, carrying: visual.carrying, fade: .18 });
                emitVisualEvent("characterMoveEnded", { id: visual.id, r: visual.r, c: visual.c });
              }
            }
          }

          /* --- 3 bis. Glissement subi (poussée) --------------------- */
          if (visual.shove) {
            const shove = visual.shove;
            const t = THREE.MathUtils.clamp((now - shove.startedAt) / Math.max(1, shove.duration), 0, 1);
            // Départ vif puis freinage : un corps poussé part d'un coup et
            // ralentit, il n'accélère pas progressivement.
            const eased = 1 - Math.pow(1 - t, 3);
            visual.wrapper.position.lerpVectors(shove.from, shove.to, eased);
            if (t >= 1) {
              visual.wrapper.position.copy(shove.to);
              visual.shove = null;
            }
          }

          /* --- 4. Chute --------------------------------------------- */
          if (visual.fall) {
            const fall = visual.fall;
            const t = THREE.MathUtils.clamp((now - fall.startedAt) / fall.duration, 0, 1);

            // Phase 1 — éjection : le gardien parcourt la case vers le vide en
            // restant à hauteur du plateau. Il quitte donc réellement l'île
            // avant de tomber, au lieu de s'enfoncer au travers.
            // Phase 2 — gravité, depuis la case du vide.
            const eject = fall.ejectRatio;
            if (fall.to && t < eject) {
              const k = t / eject;
              visual.wrapper.position.lerpVectors(fall.from, fall.to, k * (2 - k));
              // Petit soulèvement : le corps est projeté, il ne glisse pas.
              visual.wrapper.position.y = fall.fromY + Math.sin(k * Math.PI) * .12;
            } else {
              if (fall.to) visual.wrapper.position.x = fall.to.x, visual.wrapper.position.z = fall.to.z;
              const g = eject >= 1 ? 0 : (t - eject) / (1 - eject);
              // Accélération quadratique : la gravité doit se sentir.
              visual.wrapper.position.y = fall.fromY - g * g * 7.2;
            }
            visual.wrapper.rotation.z = fall.spin * Math.max(0, t - eject);
            const fade = 1 - THREE.MathUtils.clamp((t - .55) / .45, 0, 1);
            visual.glowMaterials.forEach(mat => {
              // `transparent` bascule en cours de vie du matériau : sans
              // needsUpdate, le programme shader compilé reste opaque et le
              // fondu ne se voit jamais.
              if (mat.transparent !== true) { mat.transparent = true; mat.needsUpdate = true; }
              mat.opacity = fade;
            });
            if (t >= 1) {
              visual.fall = null;
              disposeCharacterVisual(visual);
              return;
            }
          }

          /* --- 5. Amortissement d'arrivée --------------------------- */
          let settleOffset = 0;
          if (visual.settle) {
            const t = THREE.MathUtils.clamp((now - visual.settle.startedAt) / Math.max(1, visual.settle.duration), 0, 1);
            // Compression brève : le poids du corps qui se pose.
            settleOffset = -Math.sin(t * Math.PI) * .022;
            if (t >= 1) visual.settle = null;
          }

          /* --- 6. Recul d'armement de la poussée -------------------- */
          let recoilOffset = 0;
          if (visual.recoilPhase) {
            const t = THREE.MathUtils.clamp((now - visual.recoilPhase.startedAt) / visual.recoilPhase.duration, 0, 1);
            // Recul (0 -> 25 %) puis projection vers l'avant (25 -> 55 %).
            recoilOffset = t < .25 ? -(t / .25) * .06 : t < .55 ? ((t - .25) / .3) * .09 - .06 : .03 * (1 - (t - .55) / .45);
            if (t >= 1) visual.recoilPhase = null;
          }

          /* --- 7. Apparition ---------------------------------------- */
          let spawnScale = 1;
          if (visual.spawn) {
            const t = THREE.MathUtils.clamp((now - visual.spawn.startedAt) / visual.spawn.duration, 0, 1);
            spawnScale = .55 + .45 * (1 - Math.pow(1 - t, 3));
            if (t >= 1) visual.spawn = null;
          }

          /* --- 8. Modèle : offsets purement visuels ------------------ */
          // Ces offsets touchent UNIQUEMENT le modèle enfant, jamais le wrapper
          // qui porte la position issue de la grille — la logique du plateau
          // reste donc intacte.
          const model = visual.model;
          if (model && model !== visual.wrapper) {
            if (visual.hasClips) {
              // Modèle animé : plus aucun balancement procédural. L'animation
              // squelette suffit, et la superposer produisait un flottement
              // parasite.
              model.position.y = visual.baseModelY + settleOffset;
              model.position.z = recoilOffset;
              model.scale.setScalar(visual.baseModelScale * spawnScale);
            } else {
              // Modèle de secours sans squelette : on conserve l'animation
              // procédurale, seule source de vie disponible.
              const pulse = elapsed * 3.2 + visual.proceduralSeed * 12;
              model.position.y = visual.baseModelY + Math.sin(pulse) * .018 + settleOffset;
              model.position.z = recoilOffset;
              model.rotation.z = Math.sin(pulse * .52) * .022;
              model.scale.setScalar(visual.baseModelScale * spawnScale * (1 + Math.sin(pulse * .44) * .01));
            }
          }

          /* --- 9. Couronne portée ----------------------------------- */
          if (visual.crown) {
            crownAnchorPosition(visual, KAYKIT_TMP_CROWN);
            visual.crown.position.copy(KAYKIT_TMP_CROWN);
            visual.crown.rotation.y = elapsed * .9;
            visual.crown.position.y += Math.sin(elapsed * 2.4 + visual.seed * 6) * .015;
          }

          /* --- 10. Halo de sélection -------------------------------- */
          const halo = visual.halo;
          if (halo) {
            const breathe = Math.sin(elapsed * 2.1);
            // Amplitude divisée par trois (±.14 -> ±.045) : la version large
            // faisait passer TOUT le matériau du gardien par un pic à .36, ce
            // qui le blanchissait à chaque respiration au lieu de simplement
            // le teinter d'un reflet doré discret.
            /* La respiration ne touche plus l'émissif du gardien, pour la
               même raison : elle écrivait une intensité unique sur les quinze
               matériaux et effaçait la hiérarchie du GLB. Seul le halo pulse
               désormais — c'est lui qui porte la sélection. */
            halo.ring.rotation.z = elapsed * .16;
            // Le halo respire en phase avec l'émissif du modèle (même onde) :
            // les deux se lisent comme une seule source de lumière qui pulse
            // doucement plutôt que deux effets désynchronisés.
            halo.beamMaterial.opacity = .14 + breathe * .04;
            halo.particles.forEach(particle => {
              const cycle = ((elapsed * .35 + particle.userData.phase) % 2 + 2) % 2;
              const fade = cycle < 1 ? cycle : 2 - cycle;
              const angle = particle.userData.baseAngle + elapsed * .5;
              particle.position.set(
                Math.cos(angle) * particle.userData.radius,
                .06 + cycle * .55,
                Math.sin(angle) * particle.userData.radius
              );
              particle.material.opacity = fade * .85;
            });
          }
        });
      }

      /** Séquences différées (impacts, réactions en chaîne, célébrations). */
      function updateKayKitSequences(now) {
        if (!kaykit3D) return;
        if (kaykit3D.visualSequences.length) {
          const due = kaykit3D.visualSequences.filter(item => item.at <= now);
          if (due.length) {
            kaykit3D.visualSequences = kaykit3D.visualSequences.filter(item => item.at > now);
            due.forEach(item => {
              try { item.run(); }
              catch (error) { console.warn("[ILYOS_ANIM] séquence visuelle en échec", error); }
            });
          }
        }
        if (kaykit3D.fxTweens.length) {
          for (let i = kaykit3D.fxTweens.length - 1; i >= 0; i--) {
            const tween = kaykit3D.fxTweens[i];
            if (now < tween.startedAt) continue;
            const t = THREE.MathUtils.clamp((now - tween.startedAt) / Math.max(1, tween.duration), 0, 1);
            try { tween.update(tween.object, t); } catch (_) { /* objet libéré */ }
            if (t >= 1) {
              try { tween.dispose?.(tween.object); } catch (_) { /* déjà libéré */ }
              kaykit3D.fxTweens.splice(i, 1);
            }
          }
        }
      }



      // `grain` (building_grain.gltf) retiré : cette réserve de grain crème et
      // hexagonale ne se lisait pas comme un élément naturel posé sur une île, mais
      // comme une tuile étrangère collée sur la case. Restent trois décors végétaux et
      // minéraux, tous cohérents avec l'univers de l'archipel.
      const KAYKIT_FOREST_ASSETS = [
        { key: "forestTree", width: .34, height: .70, scale: .90 },
        { key: "forestRock", width: .30, height: .24, scale: .92 },
        { key: "forestGrass", width: .27, height: .18, scale: .88 }
      ];

      /**
       * Décor forestier d'UNE SEULE île (voir kaykitBuildIslandVisual) —
       * retourne la liste d'objets à ajouter, ne touche pas au groupe.
       * `occupied` est calculé une seule fois par sync (personnages/artefacts),
       * pas par île.
       */
      function buildKayKitIslandForestDecor(island, occupied) {
        const objects = [];
        const cells = (island.cells || []).filter(([r, c]) => {
          const cellKey = key(r, c);
          return !occupied.has(cellKey) && !villageAt(r, c) && !isSanctuary(r, c);
        });
        if (cells.length < 3) return objects;
        cells.sort((a, b) => kaykitHash("forest-cell", island.id, b[0], b[1]) - kaykitHash("forest-cell", island.id, a[0], a[1]));
        const amount = cells.length >= 7 ? 2 : 1;
        for (let index = 0; index < Math.min(amount, cells.length); index++) {
          const [r, c] = cells[index];
          const pick = Math.floor(kaykitHash("forest-type", island.id, r, c) * KAYKIT_FOREST_ASSETS.length) % KAYKIT_FOREST_ASSETS.length;
          const spec = KAYKIT_FOREST_ASSETS[pick];
          const object = cloneKayKitAsset(spec.key, { maxWidth: spec.width, maxHeight: spec.height, targetFloor: 0 });
          if (!object) continue;
          const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
          // DÉCALAGE VERS UN COIN. Au centre, le décor occupait la place du gardien et
          // brouillait la lecture de la case : on hésitait entre « case décorée » et
          // « case occupée ». Repoussé dans un angle, il habille sans jamais disputer
          // le centre, qui reste réservé au jeu.
          // Le coin est tiré du hash de la cellule : il est donc stable d'un rendu à
          // l'autre, et deux cases voisines ne prennent pas le même.
          const coin = Math.floor(kaykitHash("forest-corner", island.id, r, c) * 4) % 4;
          const ecart = KAYKIT_BLOCK_SIZE * .29;
          const dx = (coin === 0 || coin === 3) ? -ecart : ecart;
          const dz = (coin < 2) ? -ecart : ecart;
          object.position.set(p.x + dx, p.y + .015, p.z + dz);
          object.rotation.y = kaykitHash("forest-rotation", island.id, r, c) * Math.PI * 2;
          object.scale.multiplyScalar(spec.scale);
          object.userData.forestNatureDecoration = true;
          objects.push(object);
        }
        return objects;
      }

      /** Signature d'UNE île : tout ce qui influence son bloc+coque+décor. */
      function kaykitIslandSignature(island) {
        const cells = island.cells || [];
        let sig = (island.visualVariant ?? 0) + ":" + (Number.isInteger(island.owner) ? island.owner : "-") + ":";
        for (let j = 0; j < cells.length; j++) sig += cells[j][0] + "." + cells[j][1] + ",";
        return sig;
      }

      /**
       * Bloc+coque+décor d'UNE île, prêts à ajouter au groupe dynamique.
       * Isolé de renderKayKitIslandBlocks (qui bouclait sur TOUTES les îles)
       * pour permettre la reconstruction incrémentale : voir l'appelant dans
       * syncKayKitScene, qui ne rappelle cette fonction que pour l'île dont la
       * signature a changé — la géométrie de la coque elle-même reste de toute
       * façon mise en cache par forme (kaykitGeometry, voir addKayKitIslandHull),
       * mais le clonage des blocs/matériaux par cellule ne l'était pas et se
       * refaisait pour TOUT le plateau à chaque pose d'île.
       */
      function buildKayKitIslandVisual(island, occupied) {
        const objects = [];
        const block = makeKayKitIslandBlock(island);
        objects.push(block);
        objects.push(...buildKayKitIslandForestDecor(island, occupied));
        return objects;
      }

      function syncKayKitScene() {
        if (!kaykit3D || !state || document.body.dataset.visualMode !== "alternative") return;
        if (kaykit3D.syncInProgress) {
          kaykit3D.syncPending = true;
          return;
        }
        kaykit3D.syncInProgress = true;
        const __perfStart = window.ILYOS_PERF ? performance.now() : 0;
        try {
          resizeKayKit3D();
          // SYNCHRONISATION INCRÉMENTALE (V77) : dynamicGroup n'est plus vidé en
          // bloc à chaque appel — clearKayKitGroup(dynamicGroup) détruisait et
          // reconstruisait TOUT (îles, piédestaux, châteaux, surbrillances...)
          // même pour un simple survol de case. Chaque catégorie ci-dessous
          // garde désormais son propre registre et ne recrée que ce qui a
          // réellement changé ; le registre persistant des gardiens
          // (characterGroup, voir syncKayKitCharacters) était déjà épargné.
          clearKayKitVisualHover();
          // Ghosts de pose d'île / rotation magique de LA sync précédente :
          // état éphémère (hover, action en cours), peu coûteux à reconstruire
          // en entier à chaque fois — inutile de les diffuser au registre.
          disposeKayKitObjects(kaykit3D.transientDynamicChildren);
          // cellVisuals/interactiveMeshes sont des index de LOOKUP (pas des
          // objets 3D) : ils sont reconstruits à chaque sync pour rester
          // exacts, mais en ne faisant que ré-enregistrer les références déjà
          // existantes — beaucoup plus léger que recréer les objets eux-mêmes.
          kaykit3D.cellVisuals = new Map();
          kaykit3D.interactiveMeshes = [];
          // Filtre défensif générique (déjà utilisé ailleurs, voir
          // refreshKayKitHoverPreviews) : ne retire que les références mortes
          // (objet réellement retiré de la scène), jamais les objets persistants
          // encore présents dans dynamicGroup d'une sync à l'autre.
          kaykit3D.animatedObjects = kaykit3D.animatedObjects.filter(obj => !!obj?.parent);
          const nextCharacterHistory = new Map();

          const dynamic = kaykit3D.dynamicGroup;

          (kaykit3D.hitMeshes || []).forEach(hit => {
            const r = hit.userData.r;
            const c = hit.userData.c;

            if (!Number.isFinite(r) || !Number.isFinite(c)) return;

            hit.position.y = kaykitCellSurfaceY(r, c) + .03;
          });

          // Sol central en croix sous les couronnes : statique (dépend de
          // isSanctuary, fixe pour toute la partie), construit une seule fois.
          if (!kaykit3D.crownCrossGroundBuilt) {
            dynamic.add(makeCrownCrossGround());
            kaykit3D.crownCrossGroundBuilt = true;
          }
          // Nuages du plateau : statiques (comme le sol en croix), construits une
          // seule fois — mais seulement une fois les deux assets KayKit chargés
          // (même principe que châteaux/gardiens : jamais de secours à remplacer
          // à chaud, on attend juste que l'asset soit prêt).
          if (!kaykit3D.boardCloudsBuilt && kaykit3D.assets.has("cloudSmall") && kaykit3D.assets.has("cloudBig")) {
            buildKayKitBoardClouds(dynamic);
            kaykit3D.boardCloudsBuilt = true;
          }

          // Archipel lointain : mêmes conditions, mêmes raisons. `tileBottom` est la pièce
          // indispensable (le dessous rocheux des îles) ; sans elle rien ne peut être assemblé.
          // Socles de château : même condition d'asset que l'archipel.
          if (!kaykit3D.soclesRocheuxRepris && kaykit3D.assets.has("bareMountainA")) {
            kaykit3D.soclesRocheuxRepris = kaykitReprendreSoclesRocheux();
          }

          if (!kaykit3D.distantArchipelagoBuilt && kaykit3D.assets.has("bareMountainA")
            && kaykit3D.assets.has("bareMountainB") && kaykit3D.assets.has("bareMountainC")
            && kaykit3D.assets.has("hillA")) {
            kaykit3D.distantArchipelagoBuilt = buildKayKitDistantArchipelago();
          }

          // Couche île (blocs fusionnés + coutures + décor forestier + les
          // piédestaux du grand boucle ci-dessous) : ne se reconstruit que si
          // state.islands a réellement changé (pose, retrait, rotation) — pas
          // sur un survol, une sélection ou un changement de tour.
          const islandsSig = kaykitIslandsSignature(state.islands);
          const rebuildIslandLayer = islandsSig !== kaykit3D.islandsSignature;
          if (rebuildIslandLayer) {
            // INCRÉMENTAL PAR ÎLE : ne reconstruit que l'île dont la
            // signature a changé (pose, retrait, rotation), pas tout le
            // plateau — voir buildKayKitIslandVisual. La géométrie de coque
            // est déjà mise en cache par forme (kaykitGeometry), mais le
            // clonage des blocs/matériaux/décor par cellule ne l'était pas et
            // se refaisait pour TOUTES les îles à chaque pose, causant des
            // pics de 100-300ms mesurés en jeu (voir window.ILYOS_PERF).
            const currentIds = new Set(state.islands.map(island => String(island.id)));
            kaykit3D.islandObjectRegistry.forEach((entry, id) => {
              if (currentIds.has(id)) return;
              disposeKayKitObjects(entry.objects);
              kaykit3D.islandObjectRegistry.delete(id);
            });
            const occupied = new Set();
            (state.characters || []).forEach(character => occupied.add(key(character.r, character.c)));
            activeArtifacts().forEach(artifact => {
              if (artifact.active && !artifact.carrierId && Number.isFinite(artifact.r) && Number.isFinite(artifact.c)) occupied.add(key(artifact.r, artifact.c));
            });
            state.islands.forEach(island => {
              const id = String(island.id);
              const signature = kaykitIslandSignature(island);
              const entry = kaykit3D.islandObjectRegistry.get(id);
              if (entry && entry.signature === signature) return;
              if (entry) disposeKayKitObjects(entry.objects);
              const objects = buildKayKitIslandVisual(island, occupied);
              objects.forEach(object => dynamic.add(object));
              kaykit3D.islandObjectRegistry.set(id, { objects, signature });
            });

            // Coutures + piédestaux : dépendent de l'adjacence entre îles
            // (donc de TOUT le plateau) mais restent bon marché — géométries
            // mises en cache, pas de clonage GLTF — rebâtir l'ensemble à
            // chaque changement reste largement moins coûteux que le pic
            // ci-dessus, inutile de les rendre incrémentaux aussi.
            disposeKayKitObjects(kaykit3D.islandLayerObjects);
            const before = dynamic.children.length;
            renderKayKitIslandSeams(dynamic);
            kaykit3D.islandLayerObjects.push(...dynamic.children.slice(before));
            kaykit3D.pedestalRegistry = new Map();
          }
          // Masquage du bloc réel pendant une rotation MAGIE en cours : pas une
          // reconstruction (voir refreshKayKitMagicHiddenIsland), donc appelé à
          // CHAQUE sync, y compris celles qui ne passent pas par rebuildIslandLayer
          // (sélection/survol pendant l'action).
          refreshKayKitMagicHiddenIsland();

          const artifactByCarrier = new Map();
          [state.artifact, state.secondArtifact].filter(Boolean).forEach(artifact => {
            if (artifact.active && artifact.carrierId) artifactByCarrier.set(artifact.carrierId, artifact);
          });

          // Une seule passe DOM pour les 121 cases (au lieu d'un querySelector
          // individuel par case) : voir buildKayKitCellClassMap.
          const cellClasses = buildKayKitCellClassMap();

          for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
              const land = isLand(r, c);
              const village = villageAt(r, c);
              const sanctuary = isSanctuary(r, c);
              const island = islandAt(r, c);
              const classes = cellClasses.get(`${r},${c}`);
              const p = kaykitCellPosition(r, c, 0);
              const cellKey = `${r},${c}`;

              if (land && !island && !sanctuary) {
                if (rebuildIslandLayer) {
                  const owner = village?.id ?? null;
                  const ownerColor = Number.isInteger(owner) ? new THREE.Color(state.players[owner]?.color || PLAYER_COLORS[owner]).getHex() : null;
                  const pedestal = makeKayKitPedestal(ownerColor, { sanctuary: false });
                  pedestal.position.set(p.x, 0, p.z);
                  dynamic.add(pedestal);
                  kaykit3D.islandLayerObjects.push(pedestal);
                  kaykit3D.pedestalRegistry.set(cellKey, pedestal);
                }
                const pedestal = kaykit3D.pedestalRegistry.get(cellKey);
                if (pedestal) registerKayKitCellVisual(r, c, pedestal);
              }

              if (village) {
                const playerId = village.id ?? state.players.indexOf(village);
                const assetKey = `castle${Math.max(0, Math.min(3, playerId))}`;
                // Clé = la CASE (cellKey), pas le joueur : en 2 joueurs, chacun
                // possède 2 villages en diagonale (voir getVillageAssignments
                // dans core.js) — villageAt(r,c) renvoie alors le MÊME objet
                // joueur pour ses deux cases. Une clé par playerId ne gardait
                // donc qu'un seul château par joueur : le second village de
                // chaque joueur n'avait jamais le sien (case vide).
                const villageKey = cellKey;
                // Construit une seule fois, mais seulement une fois le vrai
                // modèle KayKit disponible : tant qu'il charge encore, on ne
                // pose RIEN plutôt qu'un modèle de secours qui devrait ensuite
                // être remplacé (l'ancienne version de ce correctif tentait ce
                // remplacement à chaud et pouvait faire disparaître le château
                // si le remplacement échouait). L'attente ne dure qu'un instant
                // au tout premier rendu (assets locaux, chargement rapide) ;
                // le modèle de secours ne sert plus qu'au cas — normalement
                // jamais atteint — où l'asset a définitivement échoué.
                const assetStillLoading = !kaykit3D.assets.has(assetKey) && !kaykit3D.failedAssets.has(assetKey);
                if (!kaykit3D.villageRegistry.has(villageKey) && !assetStillLoading) {
                  const villageAccent = new THREE.Color(state.players[playerId]?.color || PLAYER_COLORS[playerId]).getHex();
                  let castle = cloneKayKitAsset(assetKey, { maxWidth: .78, maxHeight: 1.18, targetFloor: 0 });
                  if (castle) accentVillageColors(castle, villageAccent);
                  else castle = makeFallbackCastle(villageAccent);
                  // Décalé vers le coin extérieur réel du plateau (diagonale
                  // opposée au centre) plutôt que centré sur sa case : le
                  // village se lit comme posé au bord de l'île plutôt qu'au
                  // milieu d'une case vide.
                  const cornerDirR = r <= CENTER.r ? -1 : 1;
                  const cornerDirC = c <= CENTER.c ? -1 : 1;
                  const cornerOffset = KAYKIT_CELL_SPACING * .32;
                  castle.position.set(p.x + cornerDirC * cornerOffset, KAYKIT_LEVELS.pedestalTop, p.z + cornerDirR * cornerOffset);
                  castle.rotation.y = [Math.PI * .75, -Math.PI * .75, -Math.PI * .25, Math.PI * .25][playerId] || 0;
                  dynamic.add(castle);
                  // Fanion planté à côté du château, dans le même repère local :
                  // il suit automatiquement la position/rotation par coin du village.
                  const flag = cloneKayKitAsset(`flag${Math.max(0, Math.min(3, playerId))}`, { maxWidth: .30, maxHeight: .62, targetFloor: 0 });
                  if (flag) {
                    accentVillageColors(flag, villageAccent);
                    flag.position.set(.48, 0, .34);
                    castle.add(flag);
                  }
                  kaykit3D.villageRegistry.set(villageKey, castle);
                }
                const castle = kaykit3D.villageRegistry.get(villageKey);
                if (castle) registerKayKitCellVisual(r, c, castle);
              }

              addCellHighlight(r, c, classes);
            }
          }
          if (rebuildIslandLayer) kaykit3D.islandsSignature = islandsSig;

          // Héros / gardiens — mise à jour INCRÉMENTALE d'un registre persistant.
          // Les modèles, squelettes et AnimationMixer ne sont plus reconstruits
          // à chaque synchronisation : voir syncKayKitCharacters().
          syncKayKitCharacters(artifactByCarrier, nextCharacterHistory);
          kaykit3D.characterHistory = nextCharacterHistory;

          // Ghosts de pose d'île / rotation magique : état éphémère (hover),
          // reconstruits à chaque sync (peu coûteux) puis suivis dans
          // transientDynamicChildren pour être disposés au prochain appel.
          {
            const before = dynamic.children.length;
            renderKayKitPlacementPreview();
            renderKayKitMagicRotationPreview();
            renderKayKitMagicHoverPreview();
            kaykit3D.transientDynamicChildren.push(...dynamic.children.slice(before));
          }

          // Couronnes posées sur le plateau : mises à jour seulement si leur
          // position ou leur disponibilité a changé depuis la sync précédente.
          [state.artifact, state.secondArtifact].filter(Boolean).forEach((artifact, idx) => {
            const slot = artifact.id != null ? String(artifact.id) : (idx === 0 ? "primary" : "secondary");
            const active = !!(artifact.active && !artifact.carrierId && Number.isFinite(artifact.r) && Number.isFinite(artifact.c));
            const signature = active ? `${artifact.r},${artifact.c}` : "";
            const existing = kaykit3D.looseCrownRegistry.get(slot);
            if (existing && existing.signature === signature) {
              if (active && existing.crown) {
                registerKayKitCellVisual(artifact.r, artifact.c, existing.crown);
                registerKayKitInteractive(existing.crown, "crown-loose", artifact.r, artifact.c);
              }
              return;
            }
            if (existing) {
              disposeKayKitObjects(existing.objects);
              kaykit3D.looseCrownRegistry.delete(slot);
            }
            if (!active) return;
            const p = kaykitCellPosition(artifact.r, artifact.c, 0);
            const surfaceY = kaykitCellSurfaceY(artifact.r, artifact.c);
            const crown = makeCrown();
            crown.scale.setScalar(.96);
            crown.position.set(p.x, surfaceY + .012, p.z);
            dynamic.add(crown);
            registerKayKitCellVisual(artifact.r, artifact.c, crown);
            registerKayKitInteractive(crown, "crown-loose", artifact.r, artifact.c);
            const light = new THREE.PointLight(0xffcf52, .44, 1.8);
            light.position.set(p.x, surfaceY + .34, p.z);
            dynamic.add(light);
            kaykit3D.looseCrownRegistry.set(slot, { signature, crown, objects: [crown, light] });
          });
          // Les créneaux de couronne qui n'existent plus dans state (couronne
          // désactivée en fin de partie) doivent tout de même être nettoyés.
          const activeCrownSlots = new Set(
            [state.artifact, state.secondArtifact].filter(Boolean).map((a, i) => a.id != null ? String(a.id) : (i === 0 ? "primary" : "secondary"))
          );
          kaykit3D.looseCrownRegistry.forEach((entry, slot) => {
            if (activeCrownSlots.has(slot)) return;
            disposeKayKitObjects(entry.objects);
            kaykit3D.looseCrownRegistry.delete(slot);
          });

          kaykit3D.lastStateSignature = `${state.turn}|${state.phase}|${state.islands.length}|${state.characters.length}|${state.currentPlayer}`;
          refreshKayKitHoverAfterSceneSync();
        } finally {
          kaykit3D.syncInProgress = false;
          if (window.ILYOS_PERF) window.ILYOS_PERF.recordSync(performance.now() - __perfStart);
          if (kaykit3D.syncPending) {
            kaykit3D.syncPending = false;
            scheduleKayKitSync();
          }
        }
      }

      // ========================= BLOOM (post-traitement) =========================
      // Écrit à la main plutôt qu'en important EffectComposer/UnrealBloomPass : trois
      // fichiers de moins dans vendor/, aucune dépendance ajoutée, et surtout le contrôle
      // exact de la résolution des passes — c'est elle qui décide du coût.
      //
      // Chaîne : scène → cible plein écran, puis extraction des hautes lumières et flou
      // séparable à RÉSOLUTION RÉDUITE (moitié par axe = quart de surface), enfin
      // composition additive sur l'écran. Le flou étant une opération de basse fréquence,
      // le faire en pleine résolution serait payer quatre fois pour un résultat
      // indiscernable.
      //
      // C'est pour lui que le cœur solaire dépasse volontairement la luminosité du décor
      // (voir KAYKIT_SKY_SUN) : sans une zone au-dessus du seuil, il n'y a rien à cueillir.
      const KAYKIT_BLOOM = {
        actif: true,
        // Seuil retenu à l'image. À .74 le bloom attrapait les nuages pâles et noyait
        // toute la scène dans un voile blanc — l'inverse du contraste qu'on cherchait.
        // À .90 seuls le disque solaire et les arêtes dorées du plateau le franchissent.
        seuil: .90,        // luminance à partir de laquelle un pixel déborde
        douceur: .10,      // largeur de la transition, pour éviter un seuil net et sale
        force: .46,        // intensité de la réinjection
        echelle: .5,       // diviseur de résolution des passes de flou
        rayon: 1.0,        // écartement des échantillons, en texels
        fpsPlancher: 32    // sous ce FPS soutenu, le bloom se coupe tout seul
      };

      const kaykitBloom = {
        pret: false, multiEchantillon: false, cibleScene: null, cibleA: null, cibleB: null,
        camera: null, quad: null, matSeuil: null, matFlou: null, matCompo: null,
        largeur: 0, hauteur: 0, imagesBasses: 0, coupeAuto: false, derniereImage: 0
      };

      function kaykitBloomShader(uniforms, fragment) {
        return new THREE.ShaderMaterial({
          uniforms,
          vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = vec4(position.xy, 0.0, 1.0);",
            "}"
          ].join("\n"),
          fragmentShader: fragment.join("\n"),
          depthTest: false, depthWrite: false, transparent: false
        });
      }

      function kaykitBloomEnsure(renderer) {
        const taille = renderer.getDrawingBufferSize(new THREE.Vector2());
        const l = Math.max(2, Math.floor(taille.x));
        const h = Math.max(2, Math.floor(taille.y));
        if (kaykitBloom.pret && kaykitBloom.largeur === l && kaykitBloom.hauteur === h) return true;

        const petitL = Math.max(2, Math.floor(l * KAYKIT_BLOOM.echelle));
        const petitH = Math.max(2, Math.floor(h * KAYKIT_BLOOM.echelle));
        const options = {
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat, stencilBuffer: false
        };

        if (!kaykitBloom.pret) {
          // CIBLE MULTI-ÉCHANTILLONNÉE, et ce n'est pas un raffinement.
          // Le renderer est créé avec antialias:true, mais ce réglage ne vaut QUE pour
          // le tampon de l'écran. Une WebGLRenderTarget ordinaire n'est pas
          // multi-échantillonnée : envoyer la scène dedans lui faisait perdre son
          // anticrénelage, et tout le jeu ressortait crénelé — régression signalée dès
          // la première mise en service du bloom.
          // WebGL2 sait rendre en multi-échantillonnage dans une cible ; à défaut, on
          // renonce au bloom plutôt que de dégrader l'image (voir kaykitRenderAvecBloom).
          const multiDispo = !!(renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget);
          kaykitBloom.multiEchantillon = multiDispo;
          kaykitBloom.cibleScene = multiDispo
            ? new THREE.WebGLMultisampleRenderTarget(l, h, Object.assign({ depthBuffer: true }, options))
            : new THREE.WebGLRenderTarget(l, h, Object.assign({ depthBuffer: true }, options));
          // 4 échantillons. Mesuré : à 4, le taux d'arêtes dures est RIGOUREUSEMENT
          // identique avec et sans bloom (écart 0,000) ; à 2 il remonte de 0,279 % à
          // 0,342 %. Le crénelage étant précisément le défaut signalé, la qualité prime
          // ici sur les ~1,5 FPS que 2 échantillons auraient économisés.
          if (multiDispo) kaykitBloom.cibleScene.samples = 4;
          kaykitBloom.cibleScene.texture.encoding = renderer.outputEncoding;
          kaykitBloom.cibleA = new THREE.WebGLRenderTarget(petitL, petitH, Object.assign({ depthBuffer: false }, options));
          kaykitBloom.cibleB = new THREE.WebGLRenderTarget(petitL, petitH, Object.assign({ depthBuffer: false }, options));
          kaykitBloom.cibleA.texture.encoding = renderer.outputEncoding;
          kaykitBloom.cibleB.texture.encoding = renderer.outputEncoding;

          kaykitBloom.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

          kaykitBloom.matSeuil = kaykitBloomShader(
            { tSource: { value: null }, uSeuil: { value: KAYKIT_BLOOM.seuil }, uDouceur: { value: KAYKIT_BLOOM.douceur } },
            [
              "uniform sampler2D tSource;",
              "uniform float uSeuil;",
              "uniform float uDouceur;",
              "varying vec2 vUv;",
              "void main() {",
              "  vec3 c = texture2D(tSource, vUv).rgb;",
              "  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));",
              "  float f = smoothstep(uSeuil, uSeuil + uDouceur, l);",
              "  gl_FragColor = vec4(c * f, 1.0);",
              "}"
            ]);

          // Flou gaussien SÉPARABLE : deux passes à cinq échantillons au lieu d'une passe
          // à vingt-cinq. Les poids exploitent l'interpolation bilinéaire du GPU, chaque
          // échantillon en valant deux.
          kaykitBloom.matFlou = kaykitBloomShader(
            { tSource: { value: null }, uDirection: { value: new THREE.Vector2() } },
            [
              "uniform sampler2D tSource;",
              "uniform vec2 uDirection;",
              "varying vec2 vUv;",
              "void main() {",
              "  vec3 s = texture2D(tSource, vUv).rgb * 0.2270270270;",
              "  s += texture2D(tSource, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;",
              "  s += texture2D(tSource, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;",
              "  s += texture2D(tSource, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;",
              "  s += texture2D(tSource, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;",
              "  gl_FragColor = vec4(s, 1.0);",
              "}"
            ]);

          // L'alpha vient de la scène, jamais du bloom : le canvas est en alpha:true et
          // la page compte dessus.
          kaykitBloom.matCompo = kaykitBloomShader(
            { tScene: { value: null }, tBloom: { value: null }, uForce: { value: KAYKIT_BLOOM.force } },
            [
              "uniform sampler2D tScene;",
              "uniform sampler2D tBloom;",
              "uniform float uForce;",
              "varying vec2 vUv;",
              "void main() {",
              "  vec4 base = texture2D(tScene, vUv);",
              "  vec3 halo = texture2D(tBloom, vUv).rgb;",
              "  gl_FragColor = vec4(base.rgb + halo * uForce, base.a);",
              "}"
            ]);

          kaykitBloom.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), kaykitBloom.matSeuil);
          kaykitBloom.quad.frustumCulled = false;
          kaykitBloom.pret = true;
        } else {
          kaykitBloom.cibleScene.setSize(l, h);
          kaykitBloom.cibleA.setSize(petitL, petitH);
          kaykitBloom.cibleB.setSize(petitL, petitH);
        }

        kaykitBloom.largeur = l;
        kaykitBloom.hauteur = h;
        return true;
      }

      function kaykitBloomPasse(renderer, materiau, cible) {
        kaykitBloom.quad.material = materiau;
        renderer.setRenderTarget(cible);
        renderer.clear();
        renderer.render(kaykitBloom.quad, kaykitBloom.camera);
      }

      /** Rend la scène avec bloom. Retourne false si le bloom n'a pas pu s'appliquer,
       *  auquel cas l'appelant fait un rendu direct. */
      function kaykitRenderAvecBloom(renderer, scene, camera) {
        if (!KAYKIT_BLOOM.actif || kaykitBloom.coupeAuto) return false;
        if (!kaykitBloomEnsure(renderer)) return false;
        // Sans multi-échantillonnage disponible, le bloom coûterait l'anticrénelage de
        // toute la scène pour un halo : le marché n'en vaut pas la peine.
        if (!kaykitBloom.multiEchantillon) return false;

        const B = kaykitBloom;
        renderer.setRenderTarget(B.cibleScene);
        renderer.clear();
        renderer.render(scene, camera);

        B.matSeuil.uniforms.tSource.value = B.cibleScene.texture;
        B.matSeuil.uniforms.uSeuil.value = KAYKIT_BLOOM.seuil;
        B.matSeuil.uniforms.uDouceur.value = KAYKIT_BLOOM.douceur;
        kaykitBloomPasse(renderer, B.matSeuil, B.cibleA);

        const px = KAYKIT_BLOOM.rayon / Math.max(1, B.cibleA.width);
        const py = KAYKIT_BLOOM.rayon / Math.max(1, B.cibleA.height);
        B.matFlou.uniforms.tSource.value = B.cibleA.texture;
        B.matFlou.uniforms.uDirection.value.set(px, 0);
        kaykitBloomPasse(renderer, B.matFlou, B.cibleB);
        B.matFlou.uniforms.tSource.value = B.cibleB.texture;
        B.matFlou.uniforms.uDirection.value.set(0, py);
        kaykitBloomPasse(renderer, B.matFlou, B.cibleA);

        B.matCompo.uniforms.tScene.value = B.cibleScene.texture;
        B.matCompo.uniforms.tBloom.value = B.cibleA.texture;
        B.matCompo.uniforms.uForce.value = KAYKIT_BLOOM.force;
        kaykitBloomPasse(renderer, B.matCompo, null);

        // REPLI AUTOMATIQUE. `fpsPlancher` était documenté depuis le début sans être
        // appliqué : une garantie annoncée mais absente. On compte les images dont le
        // temps dépasse le plancher, et on coupe après 120 consécutives (~2 s) — assez
        // long pour ignorer un à-coup de chargement, assez court pour qu'une machine
        // réellement trop lente ne subisse pas le bloom pendant toute la partie.
        // Le compteur se remet à zéro dès qu'une image repasse au-dessus.
        const maintenant = performance.now();
        if (B.derniereImage) {
          const fps = 1000 / Math.max(1, maintenant - B.derniereImage);
          if (fps < KAYKIT_BLOOM.fpsPlancher) {
            B.imagesBasses++;
            if (B.imagesBasses > 120) {
              B.coupeAuto = true;
              console.info("[ILYOS] bloom coupé automatiquement : FPS soutenu sous " +
                KAYKIT_BLOOM.fpsPlancher + ". Réactivation : ILYOS_SKY.bloom({ reprendre: true }).");
            }
          } else B.imagesBasses = 0;
        }
        B.derniereImage = maintenant;
        return true;
      }

      function animateKayKit3D(frameTime = performance.now()) {
        if (!kaykit3D || kaykit3D.disposed) return;
        requestAnimationFrame(animateKayKit3D);
        // Pause réelle hors jeu (V78 — passe fluidité) : rien de coûteux ne
        // s'exécute quand l'onglet est masqué, quand #gameScreen n'est pas
        // affiché (menu, écran de configuration), ou hors du mode visuel 3D —
        // mixers, séquences, pulses, dérive du ciel et caméra restent tous
        // gelés. Seul le clock est drainé (clock.getDelta()) pour qu'aucun
        // delta géant n'arrive d'un coup au retour. La boucle rAF continue
        // d'être programmée, mais chaque tick ne coûte alors presque rien.
        const gameHidden = document.body.dataset.visualMode !== "alternative"
          || !els.gameScreen
          || els.gameScreen.classList.contains("hidden");
        if (document.hidden || gameHidden) {
          kaykit3D.clock.getDelta();
          return;
        }
        // L'ancien throttle "performance" (~30 i/s dès qu'aucune animation
        // n'était en cours) a été retiré : il plafonnait le rendu même sans
        // aucune contrainte matérielle réelle, provoquant lui-même du
        // miroitement (seuil fixe comparé à un timestamp rAF jitter). Le
        // rendu suit désormais directement requestAnimationFrame, à pleine
        // cadence quel que soit le mode qualité. Seules les animations Idle
        // (gardiens au repos) restent allégées à une image sur deux en mode
        // performance — logique déjà portée par updateKayKitCharacters(),
        // indépendante de cette boucle.
        const delta = Math.min(.05, kaykit3D.clock.getDelta());
        const elapsed = kaykit3D.clock.elapsedTime;
        if (kaykit3D.hoverMarker?.visible) {
          const pulse = 1 + Math.sin(elapsed * 7) * .035;
          kaykit3D.hoverMarker.scale.setScalar(pulse);
        }
        // Gardiens : animation squelette, orientation, déplacement, couronne et
        // halo. Remplace l'ancienne boucle `proceduralHeroes`, qui simulait le
        // mouvement en secouant le modèle faute d'animation réellement jouée.
        const frameNow = performance.now();
        updateKayKitCharacters(delta, elapsed, frameNow);
        updateKayKitSequences(frameNow);
        kaykit3D.animatedObjects.forEach(object => {
          if (!object?.parent) return;
          if (object.userData.pulse) {
            const s = 1 + Math.sin(elapsed * 3 + object.userData.pulsePhase) * .055;
            object.scale.set(s, s, s);
          }
          // Rotation "extrêmement lente" du sceau de sélection (voir addCellHighlight,
          // kind "selected") : un tour complet toutes les ~40 secondes.
          if (object.userData.slowSpin) {
            object.rotation.z = elapsed * .16;
          }
          // Fondu d'apparition (voir registerKayKitFadeIn) : remonte vers
          // l'opacité cible puis se retire lui-même de la liste animée.
          if (object.userData.fadeIn && object.material) {
            const { start, duration, target } = object.userData.fadeIn;
            const progress = Math.min(1, (performance.now() - start) / duration);
            object.material.opacity = target * (progress * (2 - progress));
            if (progress >= 1) delete object.userData.fadeIn;
          }
        });
        // Dérive des couches célestes (voir buildKayKitSkyEnvironment) : translation
        // horizontale pure, sans pulsation ni composante verticale, à des vitesses
        // différentes par couche pour créer du parallaxe. Volontairement lente — un
        // aller-retour complet dure plusieurs minutes, donc le mouvement ne se
        // remarque qu'après plusieurs secondes d'observation et n'attire jamais le
        // regard pendant une décision tactique. Liste séparée d'animatedObjects :
        // elle survit aux resynchronisations de scène, qui ne concernent que le jeu.
        (kaykit3D.skyLayers || []).forEach(layer => {
          if (!layer.object?.parent) return;
          layer.object.position.x = layer.base.x + Math.sin(elapsed * layer.drift.sx) * layer.drift.x;
          layer.object.position.z = layer.base.z + Math.cos(elapsed * layer.drift.sz) * layer.drift.z;
        });
        if (kaykit3D.cameraTween) {
          const tween = kaykit3D.cameraTween;
          const raw = Math.min(1, (performance.now() - tween.started) / tween.duration);
          const eased = 1 - Math.pow(1 - raw, 3);
          kaykit3D.camera.position.lerpVectors(tween.startPosition, tween.endPosition, eased);
          const tweenTarget = kaykit3D.tmpTweenTarget.lerpVectors(tween.startTarget, tween.endTarget, eased);
          kaykit3D.camera.lookAt(tweenTarget);
          if (kaykit3D.orbit) {
            kaykit3D.orbit.target.copy(tweenTarget);
            kaykit3D.orbit.object.position.copy(kaykit3D.camera.position);
          }
          if (raw >= 1) kaykit3D.cameraTween = null;
        }
        // Le déplacement des gardiens est désormais porté par le registre
        // persistant (visual.move, voir updateKayKitCharacters) : il survit aux
        // resynchronisations et reste synchronisé avec le clip de marche.
        if (kaykit3D.orbit) kaykit3D.orbit.update();
        // gameHidden garantit déjà ici visualMode==="alternative" et
        // #gameScreen visible (voir le retour anticipé en tête de fonction) :
        // plus besoin de revérifier avant de rendre.
        // Mesure du FPS RÉEL : window.ILYOS_PERF.recordFrame() n'est appelé
        // qu'ici, au moment ou renderer.render() est effectivement invoqué —
        // pas via une boucle requestAnimationFrame indépendante qui tournerait
        // plus vite que le rendu réel (c'était la cause des ~140 FPS affichés
        // par js/complete-polish.js alors que le rendu est plafonné ~60).
        if (window.ILYOS_PERF) window.ILYOS_PERF.recordFrame(performance.now());
        // Bloom si disponible, rendu direct sinon — jamais d'écran noir en cas d'échec.
        if (!kaykitRenderAvecBloom(kaykit3D.renderer, kaykit3D.scene, kaykit3D.camera)) {
          kaykit3D.renderer.setRenderTarget(null);
          kaykit3D.renderer.render(kaykit3D.scene, kaykit3D.camera);
        }
      }
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
      let pendingOnlineBoardSize = DEFAULT_BOARD_SIZE;
      // 0 = aucune limite de temps (défaut). L'hôte seul décide de la valeur.
      let pendingOnlineTurnDuration = 0;
      let localPlayerIndex = null;
      let onlineConnected = false;
      let onlineReconnectTimer = null;
      let onlineConnectTimeoutTimer = null;
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
        return Object.keys(SYMMETRIC_DUEL_SETUPS)
          .map(id => {
            const setup = symmetricSetup(id);
            const guardiansPerTeam = setup.characters.filter(
              character => character.player === 0
            ).length;
            return `<option value="${id}">${setup.name} — ${setup.islands.length} îles • ${guardiansPerTeam} gardien${guardiansPerTeam > 1 ? "s" : ""}/équipe</option>`;
          })
          .join("");
      }

      function boardSizeControlHTML() {
        return `
        <label class="mode-option-row board-size-row" for="boardSizeSelect">
          <span>
            <b>Taille du plateau</b>
            <small>Le 13×13 élargit le centre : les villages restent à leurs coins, les trajets vers la couronne s’allongent.</small>
          </span>
          <select id="boardSizeSelect">
            <option value="11" selected>11 × 11 — standard</option>
            <option value="13">13 × 13 — élargi</option>
          </select>
        </label>
      `;
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
        ${boardSizeControlHTML()}
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
        const setup = symmetricSetup(setupId);
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

        // Équipes : le plateau de départ reste classique (setupSelectionPending
        // suppose 2 camps, pas 2 équipes de 2), mais la taille reste un choix
        // valide — getVillageAssignments et le reste de la construction ne
        // dépendent pas du preset.
        if (selectedMode === "3" || selectedMode === "4") {
          els.modeOptions.innerHTML = boardSizeControlHTML();
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
        if (onlineConnectTimeoutTimer) {
          clearTimeout(onlineConnectTimeoutTimer);
          onlineConnectTimeoutTimer = null;
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

        // L'invité ne choisit pas la taille du plateau : sans ce recalage,
        // son GRID/CENTER/CORNERS locaux restent sur le défaut (ou une
        // partie précédente) alors que les positions reçues sont celles de
        // l'hôte — décalage silencieux du rendu et des cases cliquables.
        setBoardSize(incoming.boardSize);

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
          clearTimeout(onlineConnectTimeoutTimer);
          onlineConnectTimeoutTimer = null;
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

        // Le SDK ne signale ni erreur ni "close" quand l'offre WebRTC ne reçoit
        // jamais de réponse (hôte injoignable en pair-à-pair malgré la
        // signalisation OK) : ça reste bloqué sur "Connexion…" indéfiniment.
        // Ce filet transforme ce silence en échec explicite, avec reprise
        // automatique comme les autres cas d'erreur.
        clearTimeout(onlineConnectTimeoutTimer);
        onlineConnectTimeoutTimer = setTimeout(() => {
          onlineConnectTimeoutTimer = null;
          if (onlineConnection !== connection || connection.open) return;
          try { connection.close(); } catch (error) { }
          setOnlineSetupStatus("Connexion impossible : l’hôte est injoignable. Nouvelle tentative…", "error");
          scheduleGuestReconnect();
        }, 12000);
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

        // PeerJS ne fournit qu'un unique serveur STUN par défaut. Sur certains
        // réseaux (isolation Wi-Fi, NAT restrictif, 4G), la négociation directe
        // échoue silencieusement et la connexion reste bloquée sans jamais
        // déclencher d'erreur. Plusieurs STUN redondants + un relais TURN
        // public (OpenRelay, gratuit et sans clé) donnent une vraie chance de
        // réussir même quand le pair-à-pair direct est impossible.
        onlinePeer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:global.stun.twilio.com:3478" },
              { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
            ]
          }
        });

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

      /* Les dispositions symétriques sont écrites en coordonnées absolues pour
         un plateau 11×11. Sur une grille plus large, une cellule comme [10, 9]
         — collée au coin opposé — se retrouverait au milieu de nulle part.

         La conversion préserve donc la DISTANCE AU BORD le plus proche, axe par
         axe : ce qui touchait un bord y reste collé, et l'anneau supplémentaire
         s'ajoute au centre. C'est le choix retenu pour le 13×13 — les ouvertures
         restent celles qu'on connaît, le milieu devient plus ouvert.

         Une cellule strictement au centre du 11×11 (indice 5) reste au centre.
         Entre les deux, l'écart est réparti vers le centre, donc deux pièces
         voisines peuvent se séparer d'une case : c'est voulu, c'est ce qui
         élargit le plateau plutôt que de l'étirer. */
      const SYMMETRIC_PRESET_SOURCE_GRID = 11;
      function scalePresetIndex(index) {
        if (GRID === SYMMETRIC_PRESET_SOURCE_GRID) return index;
        const milieu = (SYMMETRIC_PRESET_SOURCE_GRID - 1) / 2;
        if (index === milieu) return (GRID - 1) / 2;
        if (index < milieu) return index;                          // ancré au bord haut/gauche
        return GRID - 1 - (SYMMETRIC_PRESET_SOURCE_GRID - 1 - index); // ancré au bord bas/droit
      }
      function scalePresetCell([r, c]) {
        return [scalePresetIndex(r), scalePresetIndex(c)];
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

        // Conversion à la taille réelle du plateau avant tout le reste : le
        // miroir doit opérer sur les coordonnées finales, pas sur celles du 11×11.
        const ajustees = baseIslands.map(cells => cells.map(scalePresetCell));

        ajustees.forEach(cells => {
          islands.push(makeSymmetricPresetIsland(id++, 0, cells));
        });
        ajustees.forEach(cells => {
          islands.push(makeSymmetricPresetIsland(id++, 1, mirrorPresetCells(cells)));
        });

        return {
          islands,
          characters: [
            ...characters.map((position, index) => {
              const [r, c] = scalePresetCell(position);
              return { id: `char-0-symmetric-${index}`, player: 0, r, c };
            }),
            ...characters.map((position, index) => {
              const [r, c] = scalePresetCell(position);
              return { id: `char-1-symmetric-${index}`, player: 1, r, c: GRID - 1 - c };
            })
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

        /* Les îles ne sont PLUS construites ici. Cette IIFE s'exécute au
            chargement du module, quand GRID vaut encore sa valeur par défaut :
            un plateau 13×13 choisi plus tard héritait alors de positions
            calculées pour le 11×11. Seules les définitions brutes sont
            conservées ; symmetricSetup() les convertit à la taille réelle au
            moment de construire la partie. */
        const setups = {};
        Object.entries(definitions).forEach(([id, definition]) => {
          setups[id] = {
            id,
            name: definition.name,
            description: definition.description,
            style: definition.style,
            baseIslands: definition.baseIslands,
            characters: definition.characters
          };
        });
        return setups;
      })();
      /* Construit une disposition à la taille COURANTE du plateau.
         Mémoïsé par (identifiant, taille) : l'aperçu du menu la demande à
         chaque survol, et rien ne justifie de la recalculer.
         Passer systématiquement par cette fonction — SYMMETRIC_DUEL_SETUPS ne
         contient plus que les définitions brutes en 11×11. */
      const symmetricSetupCache = new Map();
      function symmetricSetup(setupId) {
        const id = resolveSymmetricSetupId(setupId);
        const cle = `${id}@${GRID}`;
        if (symmetricSetupCache.has(cle)) return symmetricSetupCache.get(cle);
        const definition = SYMMETRIC_DUEL_SETUPS[id];
        const construit = buildSymmetricPreset(definition.baseIslands, definition.characters);
        const setup = { ...definition, islands: construit.islands, characters: construit.characters };
        symmetricSetupCache.set(cle, setup);
        return setup;
      }

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
        const setup = symmetricSetup(resolvedId);

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

        /* Même règle que startLocalGame() : la taille du plateau doit être
           fixée AVANT getVillageAssignments et le reste de la construction.
           C'est l'hôte qui décide (pendingOnlineBoardSize) ; l'invité recevra
           la vraie taille via l'état synchronisé, voir applyOnlineState(). */
        setBoardSize(pendingOnlineBoardSize);

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
          boardSize: GRID,
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
        // Comme pour startingBoardMode : seul l'hôte décide, l'invité reçoit
        // la vraie taille via l'état synchronisé (voir applyOnlineState).
        pendingOnlineBoardSize = role === "host"
          ? (document.getElementById("boardSizeSelect")?.value || DEFAULT_BOARD_SIZE)
          : DEFAULT_BOARD_SIZE;
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

        /* La taille du plateau est fixée AVANT tout le reste : getVillageAssignments,
           les coins, le sanctuaire et la scène 3D lisent tous GRID/CENTER/CORNERS
           pendant la construction qui suit. La déplacer plus bas produirait une
           partie mi-11×11 mi-13×13, sans erreur visible. */
        setBoardSize(document.getElementById("boardSizeSelect")?.value);

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
            spawn
              ? "Une île et un gardien ont été placés automatiquement."
              : `Une île a été placée automatiquement. Limite de ${MAX_GUARDIANS_PER_PLAYER} gardiens atteinte.`
          );
        } else if (!spawn) {
          showToast(`Île placée. Limite de ${MAX_GUARDIANS_PER_PLAYER} gardiens atteinte.`);
        }
        return island;
      }

      function aiLandDistanceToTargets(startR, startC, targets) {
        const validTargets = (targets || []).filter(([r, c]) => inside(r, c) && isLand(r, c));
        if (!validTargets.length) return 99;

        const targetSet = new Set(validTargets.map(([r, c]) => key(r, c)));
        const startKey = key(startR, startC);
        if (targetSet.has(startKey)) return 0;
        if (!inside(startR, startC) || !isLand(startR, startC)) return 99;

        const queue = [[startR, startC, 0]];
        const seen = new Set([startKey]);

        for (let index = 0; index < queue.length; index++) {
          const [r, c, distance] = queue[index];
          for (const [nr, nc] of orthogonalNeighbors(r, c)) {
            const nextKey = key(nr, nc);
            if (seen.has(nextKey) || !isLand(nr, nc)) continue;
            if (targetSet.has(nextKey)) return distance + 1;
            seen.add(nextKey);
            queue.push([nr, nc, distance + 1]);
          }
        }
        /*
         * Si les terrains ne sont pas encore reliés, l'IA conserve une notion
         * de direction grâce à la distance de Manhattan. Elle se rapproche donc
         * du bord utile en attendant qu'une future île crée le pont.
         */
        const fallback = Math.min(
          ...validTargets.map(([r, c]) => Math.abs(startR - r) + Math.abs(startC - c))
        );
        return 30 + fallback;
      }

      function aiValidationTargetsForPlayer(player) {
        const active = crownValidationCellsForPlayer(player)
          .filter(([r, c]) => isLand(r, c));

        return active.length
          ? active
          : villagesForPlayer(player).map(village => [village.r, village.c]);
      }

      function aiValidationDistanceForPlayer(player, r, c) {
        return aiLandDistanceToTargets(r, c, aiValidationTargetsForPlayer(player));
      }

      function aiNearestOwnCharacterDistance(r, c, excludedIds = []) {
        const excluded = new Set(excludedIds);
        const own = aiOwnCharacters().filter(char => !excluded.has(char.id));
        if (!own.length) return 99;
        return Math.min(...own.map(char => Math.abs(char.r - r) + Math.abs(char.c - c)));
      }

      function aiLooseCrownTargets() {
        return activeArtifacts()
          .filter(artifact => artifact.carrierId === null)
          .map(artifact => [artifact.r, artifact.c]);
      }

      function aiStrategicTargetsForCharacter(char) {
        if (characterCarriesCrown(char.id)) {
          return aiValidationTargetsForPlayer(currentPlayer());
        }

        const loose = aiLooseCrownTargets();
        if (loose.length) return loose;

        const opponentCarrier = aiOpponentCarrier();
        if (opponentCarrier) {
          const adjacent = orthogonalNeighbors(opponentCarrier.r, opponentCarrier.c)
            .filter(([r, c]) => isLand(r, c));
          if (adjacent.length) return adjacent;
        }

        return [[CENTER.r, CENTER.c]];
      }

      function simulateCharacterPushForAI(startR, startC, dr, dc, force) {
        const line = collectPushLine(startR, startC, dr, dc);
        const simulated = line.map(char => ({
          char,
          r: char.r,
          c: char.c,
          alive: true
        }));

        const movingIds = new Set(line.map(char => char.id));
        const fixedOccupants = new Set(
          state.characters
            .filter(char => !movingIds.has(char.id))
            .map(char => key(char.r, char.c))
        );

        const requiredForce = line.length;
        if (force < requiredForce) return simulated;
        const pushDistance = Math.max(1, force - requiredForce + 1);
        for (let step = 0; step < pushDistance; step++) {
          for (let i = simulated.length - 1; i >= 0; i--) {
            const item = simulated[i];
            if (!item.alive) continue;

            const nr = item.r + dr;
            const nc = item.c + dc;

            if (!inside(nr, nc) || !isLand(nr, nc)) {
              item.alive = false;
              continue;
            }

            const blockedByFixed = fixedOccupants.has(key(nr, nc));
            const blockedByLine = simulated.some((other, index) =>
              index !== i && other.alive && other.r === nr && other.c === nc
            );
            const blockedByCrown = !!looseArtifactAt(nr, nc);

            if (blockedByFixed || blockedByLine || blockedByCrown) continue;
            item.r = nr;
            item.c = nc;
          }
        }

        return simulated;
      }

      function aiExternalLandContacts(cells, ignoredIslandId = null) {
        const ownCells = new Set(cells.map(([r, c]) => key(r, c)));
        const contacts = new Set();

        cells.forEach(([r, c]) => {
          orthogonalNeighbors(r, c).forEach(([nr, nc]) => {
            const neighborKey = key(nr, nc);
            if (ownCells.has(neighborKey)) return;

            const neighborIsland = islandAt(nr, nc);
            const externalLand =
              !!villageAt(nr, nc)
              || isSanctuary(nr, nc)
              || (neighborIsland && neighborIsland.id !== ignoredIslandId);

            if (externalLand) contacts.add(neighborKey);
          });
        });

        return contacts.size;
      }

      function aiOwnCharacters() {
        return state.characters.filter(ch => ch.player === state.currentPlayer);
      }

      function aiOpponentCarrier() {
        return activeArtifacts()
          .map(artifact => characterById(artifact.carrierId))
          .find(carrier => carrier && carrier.player !== state.currentPlayer) || null;
      }

      function aiMoveGoal(char) {
        const targets = aiStrategicTargetsForCharacter(char);
        return [...targets].sort((a, b) =>
          (Math.abs(char.r - a[0]) + Math.abs(char.c - a[1])) -
          (Math.abs(char.r - b[0]) + Math.abs(char.c - b[1]))
        )[0] || [CENTER.r, CENTER.c];
      }

      function distanceToNearestOwnVillage(r, c) {
        return aiValidationDistanceForPlayer(currentPlayer(), r, c);
      }

      function aiAdjacentCrownPickup() {
        const options = [];
        const own = aiOwnCharacters().filter(char => !characterCarriesCrown(char.id));

        for (const char of own) {
          for (const artifact of activeArtifacts()) {
            if (artifact.carrierId !== null) continue;
            const distance = Math.abs(char.r - artifact.r) + Math.abs(char.c - artifact.c);
            if (distance !== 1) continue;

            options.push({
              char,
              artifact,
              score: distanceToNearestOwnVillage(char.r, char.c) + Math.random() * .08
            });
          }
        }

        options.sort((a, b) => a.score - b.score);
        return options[0] || null;
      }

      async function aiPerformFreeCrownPickup(option, token) {
        if (!option || token !== aiRunToken || !state) return false;
        if (characterCarriesCrown(option.char.id) || option.artifact.carrierId !== null) return false;

        saveUndoSnapshot();
        if (!giveArtifactToCharacter(option.artifact, option.char)) {
          discardLastUndoSnapshot();
          return false;
        }

        state.selectedCharId = option.char.id;
        state.phase = "ACTION_SELECT";
        renderAll();
        animateCellPulse(option.char.r, option.char.c, "crown-burst");
        playSfx("crownTake");   // Ramassage libre par l'IA.
        showToast("ORDINATEUR récupère gratuitement une couronne adjacente.");
        await sleep(520);
        resolveArtifactForCharacter(option.char);
        return true;
      }


      function aiCrownActionUsed(artifactId, action) {
        return !!state.aiCrownMemory?.[`${artifactId}:${action}`];
      }

      function markAICrownAction(artifactId, action) {
        state.aiCrownMemory ||= {};
        state.aiCrownMemory[`${artifactId}:${action}`] = true;
      }

      function aiBestFreeCrownHandoff() {
        if (aiConfig().crownTactics < 1) return null;

        const own = aiOwnCharacters();
        const options = [];

        for (const carrier of own) {
          const artifact = artifactCarriedBy(carrier.id);
          if (!artifact || aiCrownActionUsed(artifact.id, "handoff")) continue;

          const carrierDistance = distanceToNearestOwnVillage(carrier.r, carrier.c);

          for (const ally of own) {
            if (ally.id === carrier.id || characterCarriesCrown(ally.id)) continue;

            const allyDistance = distanceToNearestOwnVillage(ally.r, ally.c);
            const gain = carrierDistance - allyDistance;
            if (gain < 1) continue;

            if (Math.abs(ally.r - carrier.r) + Math.abs(ally.c - carrier.c) === 1) {
              options.push({
                carrier, ally, artifact,
                direct: true,
                gain,
                score: -gain * 4
              });
            }

            for (const [dropR, dropC] of orthogonalNeighbors(carrier.r, carrier.c)) {
              if (!isLand(dropR, dropC) || characterAt(dropR, dropC) || looseArtifactAt(dropR, dropC)) continue;
              if (Math.abs(ally.r - dropR) + Math.abs(ally.c - dropC) !== 1) continue;

              options.push({
                carrier, ally, artifact,
                direct: false,
                dropR, dropC,
                gain,
                score: -gain * 2.2 + .3
              });
            }
          }
        }

        options.sort((a, b) => a.score - b.score);
        return options[0] || null;
      }

      async function aiPerformFreeCrownHandoff(option, token) {
        if (!option || token !== aiRunToken || !state) return false;
        const liveArtifact = artifactCarriedBy(option.carrier.id);
        if (!liveArtifact || liveArtifact.id !== option.artifact.id) return false;
        if (characterCarriesCrown(option.ally.id)) return false;

        saveUndoSnapshot();
        markAICrownAction(liveArtifact.id, "handoff");

        if (option.direct) {
          if (!giveArtifactToCharacter(liveArtifact, option.ally)) {
            discardLastUndoSnapshot();
            return false;
          }

          state.selectedCharId = option.ally.id;
          renderAll();
          animateCellPulse(option.ally.r, option.ally.c, "crown-burst");
          playSfx("crownTake");   // Transmission : l'allié prend la couronne.
          showToast("ORDINATEUR transmet directement la couronne à un allié adjacent.");
          await sleep(360);
          resolveArtifactForCharacter(option.ally);
          return true;
        }

        if (characterAt(option.dropR, option.dropC) || looseArtifactAt(option.dropR, option.dropC)) {
          discardLastUndoSnapshot();
          return false;
        }

        liveArtifact.carrierId = null;
        liveArtifact.r = option.dropR;
        liveArtifact.c = option.dropC;
        renderAll();
        animateCellPulse(option.dropR, option.dropC, "crown-burst");
        showToast("ORDINATEUR pose la couronne entre deux alliés.");
        await sleep(280);

        if (token !== aiRunToken || !state) return false;
        if (!giveArtifactToCharacter(liveArtifact, option.ally)) {
          discardLastUndoSnapshot();
          return false;
        }

        state.selectedCharId = option.ally.id;
        renderAll();
        animateCellPulse(option.ally.r, option.ally.c, "crown-burst");
        playSfx("crownTake");   // L'allié prend la couronne.
        showToast("L’allié récupère immédiatement la couronne.");
        await sleep(340);
        resolveArtifactForCharacter(option.ally);
        return true;
      }

      function simulateLooseCrownPush(artifact, dr, dc, force, startR = artifact.r, startC = artifact.c) {
        const exactForce = Math.max(1, Math.floor(force || 1));
        let crossedVoid = false;

        for (let step = 1; step <= exactForce; step++) {
          const r = startR + dr * step;
          const c = startC + dc * step;

          if (!inside(r, c)) {
            return {
              r: startR,
              c: startC,
              moved: 0,
              valid: false,
              crossedVoid,
              reason: "outside"
            };
          }

          const otherCrown = looseArtifactAt(r, c);
          const obstacle =
            characterAt(r, c)
            || (otherCrown && otherCrown.id !== artifact.id);

          /*
           * La trajectoire peut passer au-dessus du vide, mais pas traverser
           * un gardien ni une autre couronne.
           */
          if (obstacle) {
            return {
              r: startR,
              c: startC,
              moved: 0,
              valid: false,
              crossedVoid,
              reason: "blocked"
            };
          }

          if (step < exactForce) {
            if (!isLand(r, c)) crossedVoid = true;
            continue;
          }

          /*
           * La force choisie doit faire atterrir exactement la couronne
           * sur une case de terrain. Une force trop faible ou trop forte
           * ne permet donc pas la poussée.
           */
          if (!isLand(r, c)) {
            return {
              r: startR,
              c: startC,
              moved: 0,
              valid: false,
              crossedVoid: true,
              reason: "no-landing"
            };
          }

          return {
            r,
            c,
            moved: exactForce,
            valid: true,
            crossedVoid,
            reason: null
          };
        }

        return {
          r: startR,
          c: startC,
          moved: 0,
          valid: false,
          crossedVoid,
          reason: "no-landing"
        };
      }

      function adjacentFreeAllyForCrown(r, c, excludedIds = []) {
        const excluded = new Set(excludedIds);
        return orthogonalNeighbors(r, c)
          .map(([nr, nc]) => characterAt(nr, nc))
          .find(char =>
            char
            && char.player === state.currentPlayer
            && !excluded.has(char.id)
            && !characterCarriesCrown(char.id)
          ) || null;
      }

      function aiBestDropAndPushCrown() {
        const cfg = aiConfig();
        if (cfg.crownTactics < 2 || availableActionCount("PUSH") < 1) return null;

        const availablePush = Math.min(
          availableActionCount("PUSH"),
          cfg.pushMax
        );
        const options = [];

        for (const carrier of aiOwnCharacters()) {
          const artifact = artifactCarriedBy(carrier.id);
          if (!artifact || aiCrownActionUsed(artifact.id, "drop-push")) continue;

          const startDistance = distanceToNearestOwnVillage(
            carrier.r,
            carrier.c
          );

          for (const [dropR, dropC] of orthogonalNeighbors(carrier.r, carrier.c)) {
            if (
              !isLand(dropR, dropC)
              || characterAt(dropR, dropC)
              || looseArtifactAt(dropR, dropC)
            ) continue;

            const dr = dropR - carrier.r;
            const dc = dropC - carrier.c;

            for (let force = 1; force <= availablePush; force++) {
              const simulation = simulateLooseCrownPush(
                artifact,
                dr,
                dc,
                force,
                dropR,
                dropC
              );
              if (!simulation.valid) continue;

              const endDistance = distanceToNearestOwnVillage(
                simulation.r,
                simulation.c
              );
              const receivingAlly = adjacentFreeAllyForCrown(
                simulation.r,
                simulation.c,
                [carrier.id]
              );
              const distanceGain = startDistance - endDistance;

              if (distanceGain < 2 && !receivingAlly) continue;

              const score =
                -distanceGain * 2.3
                - force * .35
                - (receivingAlly ? 7 : 0)
                - (simulation.crossedVoid ? .8 : 0)
                + Math.random() * cfg.randomness;

              options.push({
                carrier,
                artifact,
                dropR,
                dropC,
                dr,
                dc,
                force,
                endR: simulation.r,
                endC: simulation.c,
                receivingAlly,
                distanceGain,
                score
              });
            }
          }
        }

        options.sort((a, b) => a.score - b.score);
        return options[0] || null;
      }

      async function aiPerformDropAndPushCrown(option, token) {
        if (!option || token !== aiRunToken || !state) return false;

        const artifact = artifactCarriedBy(option.carrier.id);
        if (!artifact || artifact.id !== option.artifact.id) return false;
        if (characterAt(option.dropR, option.dropC) || looseArtifactAt(option.dropR, option.dropC)) return false;

        saveUndoSnapshot();
        markAICrownAction(artifact.id, "drop-push");

        artifact.carrierId = null;
        artifact.r = option.dropR;
        artifact.c = option.dropC;
        state.phase = "ACTION_SELECT";
        renderAll();
        animateCellPulse(option.dropR, option.dropC, "crown-burst");
        showToast("ORDINATEUR pose la couronne pour préparer une poussée.");
        await sleep(360);

        if (token !== aiRunToken || !state) return false;

        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = Math.min(option.force, availableActionCount("PUSH"));
        state.pushForceChoice = state.selectedActionCount;
        state.selectedCharId = option.carrier.id;
        state.selectedIslandId = null;
        state.reachable = new Set(
          orthogonalNeighbors(option.carrier.r, option.carrier.c)
            .map(([r, c]) => key(r, c))
        );
        renderAll();
        await sleep(260);

        if (token !== aiRunToken || !state) return false;
        handlePushClick(option.dropR, option.dropC);
        await sleep(720);

        if (token !== aiRunToken || !state) return true;

        const pushedArtifact = artifactById(option.artifact.id);
        if (pushedArtifact?.carrierId === null) {
          const ally = adjacentFreeAllyForCrown(
            pushedArtifact.r,
            pushedArtifact.c,
            [option.carrier.id]
          );

          if (ally) {
            giveArtifactToCharacter(pushedArtifact, ally);
            state.selectedCharId = ally.id;
            renderAll();
            animateCellPulse(ally.r, ally.c, "crown-burst");
            playSfx("crownTake");   // Prise après poussée.
            showToast("Après la poussée, un allié récupère gratuitement la couronne.");
            await sleep(440);
            resolveArtifactForCharacter(ally);
          }
        }

        return true;
      }

      function aiCellThreatForPlayer(playerId, r, c) {
        let threat = 0;
        for (const enemy of state.characters) {
          if (enemy.player === playerId) continue;
          const d = Math.abs(enemy.r - r) + Math.abs(enemy.c - c);
          if (d === 1) threat += 12;
          else if (d === 2) threat += 4;
        }
        const edgeRisk = orthogonalNeighbors(r, c).filter(([nr, nc]) => !inside(nr, nc) || !isLand(nr, nc)).length;
        return threat + edgeRisk * 2.5;
      }

      /*
       * Anticipation locale (un coup) : un ennemi déjà adjacent à cette case
       * pourrait-il, dès son prochain tour, pousser le gardien qui s'y trouve
       * dans le vide avec une seule poussée de force 1 (aucune ligne de
       * gardiens à déplacer derrière lui) ? aiCellThreatForPlayer ne mesure
       * qu'une proximité générique ; ceci vérifie la perte immédiate et
       * concrète du porteur de couronne, le pire résultat possible.
       */
      function aiPushOffRisk(playerId, r, c) {
        for (const enemy of state.characters) {
          if (enemy.player === playerId) continue;
          const dr = r - enemy.r, dc = c - enemy.c;
          if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
          const landR = r + dr, landC = c + dc;
          if (!inside(landR, landC) || !isLand(landR, landC)) return true;
        }
        return false;
      }

      function aiBestMove() {
        const availableMoves = availableActionCount("MOVE");
        if (availableMoves < 1) return null;
        const cfg = aiConfig();
        const maxCost = cfg.globalPlanning ? availableMoves : Math.min(availableMoves, cfg.maxMoveCost);
        const opponents = state.players.filter(p => p.id !== state.currentPlayer);
        const enemyValidation = new Set(opponents.flatMap(p => aiValidationTargetsForPlayer(p).map(([r, c]) => key(r, c))));
        let best = null;

        aiOwnCharacters().forEach(char => {
          const carrying = characterCarriesCrown(char.id);
          const alreadySafe = carrying && isCrownValidationCell(currentPlayer(), char.r, char.c);
          const targets = aiStrategicTargetsForCharacter(char);
          const startDistance = aiLandDistanceToTargets(char.r, char.c, targets);
          const startThreat = aiCellThreatForPlayer(char.player, char.r, char.c);

          for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
            if ((r === char.r && c === char.c) || !isLand(r, c) || characterAt(r, c)) continue;
            const path = shortestMovementPath(char, r, c, maxCost);
            if (!path?.length) continue;
            const cost = path.cost ?? path.length;
            const targetDistance = aiLandDistanceToTargets(r, c, targets);
            const progress = startDistance - targetDistance;
            const looseCrown = looseArtifactAt(r, c);
            const scoringCell = carrying && isCrownValidationCell(currentPlayer(), r, c);
            const opponentCarrier = aiOpponentCarrier();
            const adjacentOpponentCarrier = opponentCarrier && Math.abs(r - opponentCarrier.r) + Math.abs(c - opponentCarrier.c) === 1;
            const threat = aiCellThreatForPlayer(char.player, r, c);
            const blocksEnemyVillage = !carrying && enemyValidation.has(key(r, c));

            // Un porteur déjà sécurisé ne quitte pas son village sauf pour fuir un danger immédiat.
            if (alreadySafe && !scoringCell && startThreat < 12) continue;

            // defensePriority/denyScorePriority/crownPriority (définis dans
            // AI_LEVELS.expert) : coefficients normalisés autour de 5 (le
            // niveau implicite des difficultés inférieures) pour renforcer,
            // à l'Expert, la fuite du porteur menacé et la course pour priver
            // l'adversaire d'un point imminent — sans rien changer aux
            // niveaux qui ne définissent pas ces clés.
            const defenseScale = (cfg.defensePriority ?? 5) / 5;
            const denyScale = (cfg.denyScorePriority ?? 5) / 5;
            const crownScale = (cfg.crownPriority ?? 5) / 5;

            let utility = progress * 42 - cost * 3 - targetDistance * 1.2;
            if (carrying) utility += progress * 58 - threat * 13 * defenseScale;
            else utility -= threat * 3.2;
            // Un porteur qu'on amène volontairement à portée d'une poussée
            // dans le vide perd la couronne pour de bon dès le tour adverse
            // suivant — un coup d'avance suffit à repérer ce cas précis, bien
            // plus grave qu'une simple proximité (threat) déjà comptée.
            if (carrying && aiPushOffRisk(char.player, r, c)) utility -= 1800 * defenseScale;
            if (scoringCell) utility += 2200 * crownScale;
            if (looseCrown && !carrying) utility += 1050 * crownScale;
            if (adjacentOpponentCarrier && !carrying) utility += 360 * denyScale + aiOpponentScoreThreat() * 2 * denyScale;
            if (blocksEnemyVillage) utility += 95 * denyScale;
            if (progress <= 0) utility -= 18 + cost * 5;
            if (targetDistance >= 30) utility -= 28;
            if (alreadySafe && scoringCell) utility += 500 * crownScale;

            if (!best || utility > best.utility) {
              best = {
                char, r, c, cost, utility, score: -utility, progress, targetDistance, carrying,
                capturesCrown: !!(looseCrown && !carrying), scoringCell,
                adjacentOpponentCarrier: !!adjacentOpponentCarrier, threat
              };
            }
          }
        });
        return best && best.utility > 8 ? best : null;
      }

      function aiBestPush() {
        const availablePush = availableActionCount("PUSH");
        if (availablePush < 1) return null;
        const cfg = aiConfig();
        const maxForce = Math.min(availablePush, cfg.pushMax);
        const options = [];
        // Voir aiBestMove : mêmes coefficients normalisés autour de 5.
        const defenseScale = (cfg.defensePriority ?? 5) / 5;
        const denyScale = (cfg.denyScorePriority ?? 5) / 5;
        const crownScale = (cfg.crownPriority ?? 5) / 5;

        aiOwnCharacters().forEach(pusher => {
          orthogonalNeighbors(pusher.r, pusher.c).forEach(([r, c]) => {
            const targetChar = characterAt(r, c);
            const targetCrown = looseArtifactAt(r, c);
            if (!targetChar && !targetCrown) return;
            const dr = r - pusher.r, dc = c - pusher.c;

            if (targetCrown) {
              if (!characterCarriesCrown(pusher.id)) return;
              for (let force = 1; force <= maxForce; force++) {
                const simulation = simulateLooseCrownPush(targetCrown, dr, dc, force);
                if (simulation.moved < 1) continue;
                const before = distanceToNearestOwnVillage(targetCrown.r, targetCrown.c);
                const after = distanceToNearestOwnVillage(simulation.r, simulation.c);
                const ally = adjacentFreeAllyForCrown(simulation.r, simulation.c, [pusher.id]);
                const gain = before - after;
                const utility = gain * 85 * crownScale + (ally ? 190 : 0) - force * 8;
                if (utility > 15) options.push({ pusher, r, c, count: force, priority: -utility, utility, targetType: "crown" });
              }
              return;
            }

            const line = collectPushLine(r, c, dr, dc);
            const requiredForce = line.length;
            if (requiredForce < 1 || requiredForce > maxForce) return;
            for (let force = requiredForce; force <= maxForce; force++) {
              const simulation = simulateCharacterPushForAI(r, c, dr, dc, force);
              let utility = -force * 7;
              for (const item of simulation) {
                const isOwn = item.char.player === state.currentPlayer;
                const carrying = characterCarriesCrown(item.char.id);
                const owner = state.players[item.char.player];
                if (!item.alive) {
                  // Éliminer un gardien adverse (sans couronne) en le poussant
                  // dans le vide était sous-valorisé face aux gains de
                  // progression/déplacement, alors que c'est justement près
                  // du village adverse (deux bords proches à la fois) que ces
                  // occasions sont les plus fréquentes. Mis à l'échelle de
                  // denyScorePriority : moins de gardiens adverses, c'est
                  // aussi moins de capacité à défendre ou marquer plus tard.
                  utility += isOwn ? (carrying ? -1400 : -260) : (carrying ? 1150 : 480 * denyScale);
                  continue;
                }
                const beforeThreat = aiCellThreatForPlayer(item.char.player, item.char.r, item.char.c);
                const afterThreat = aiCellThreatForPlayer(item.char.player, item.r, item.c);
                utility += isOwn
                  ? (beforeThreat - afterThreat) * 8 * (carrying ? defenseScale : 1)
                  : (afterThreat - beforeThreat) * 5;
                if (carrying) {
                  const before = aiValidationDistanceForPlayer(owner, item.char.r, item.char.c);
                  const after = aiValidationDistanceForPlayer(owner, item.r, item.c);
                  // Repousser le porteur adverse pour l'éloigner de sa case de
                  // validation (denyScale) pèse désormais nettement plus lourd
                  // à l'Expert que faire progresser son propre porteur
                  // (crownScale) — priver l'adversaire d'un point imminent
                  // passe avant sa propre progression.
                  utility += isOwn ? (before - after) * 120 * crownScale : (after - before) * 145 * denyScale;
                  if (!isOwn && before === 0 && after > 0) utility += 950 * denyScale;
                  if (isOwn && after === 0) utility += 750 * crownScale;
                } else if (isOwn) {
                  utility -= 22;
                }
              }
              if (utility > 10) options.push({ pusher, r, c, count: force, priority: -utility, utility, targetType: "character", requiredForce });
            }
          });
        });
        options.sort((a, b) => b.utility - a.utility || a.count - b.count);
        return options[0] || null;
      }

      function aiBestMagic() {
        const availableMagic = availableActionCount("MAGIC");
        if (availableMagic < 1 || !state.islands.length) return null;
        const cfg = aiConfig();
        const options = [];
        // Voir aiBestMove : mêmes coefficients normalisés autour de 5.
        const denyScale = (cfg.denyScorePriority ?? 5) / 5;
        const crownScale = (cfg.crownPriority ?? 5) / 5;
        for (const island of state.islands) for (const pivot of island.cells) for (const steps of [1, 3, 2]) {
          const direction = steps === 3 ? -1 : 1, turns = steps === 3 ? 1 : steps;
          const rotation = calculateIslandRotationAroundPivot(island, pivot[0], pivot[1], direction, turns);
          if (!rotation.valid) continue;
          let utility = -12;
          for (const move of rotation.characterMoves) {
            const owner = state.players[move.char.player];
            const carrying = characterCarriesCrown(move.char.id);
            const isOwn = move.char.player === state.currentPlayer;
            if (carrying) {
              const before = aiValidationDistanceForPlayer(owner, move.char.r, move.char.c);
              const after = aiValidationDistanceForPlayer(owner, move.r, move.c);
              utility += isOwn ? (before - after) * 145 * crownScale : (after - before) * 165 * denyScale;
              if (isOwn && after === 0) utility += 900 * crownScale;
              if (!isOwn && before === 0 && after > 0) utility += 1000 * denyScale;
            } else {
              const beforeThreat = aiCellThreatForPlayer(move.char.player, move.char.r, move.char.c);
              const afterThreat = aiCellThreatForPlayer(move.char.player, move.r, move.c);
              utility += isOwn ? (beforeThreat - afterThreat) * 5 : (afterThreat - beforeThreat) * 3;
            }
          }
          for (const move of rotation.artifactMoves || []) {
            const before = aiNearestOwnCharacterDistance(move.artifact.r, move.artifact.c);
            const after = aiNearestOwnCharacterDistance(move.r, move.c);
            utility += (before - after) * 55;
          }
          // Poids fortement réduit : combler des trous de terrain n'est pas
          // un objectif en soi (un plateau plus morcelé peut même gêner
          // l'adversaire), ce terme ne doit plus pouvoir, à lui seul, motiver
          // une rotation qui n'apporte aucun gain de couronne/menace réel —
          // sinon la magie se gaspille sur du "rangement" plutôt que sur de
          // la tactique.
          const beforeContacts = aiExternalLandContacts(island.cells, island.id);
          const afterContacts = aiExternalLandContacts(rotation.absCells, island.id);
          utility += (afterContacts - beforeContacts) * 4;
          if (utility > 20) options.push({ island, pivot, steps, cost: 1, score: -utility, utility });
        }
        options.sort((a, b) => b.utility - a.utility);
        return options[0] || null;
      }

      async function aiPerformMove(option, token) {
        if (!option || token !== aiRunToken) return false;
        state.phase = "ACTION";
        state.selectedActionType = "MOVE";
        state.selectedActionCount = option.cost;
        state.selectedCharId = option.char.id;
        state.selectedIslandId = null;
        state.reachable = movementRange(option.char, option.cost);
        renderAll();
        await sleep(260);
        if (token !== aiRunToken || !state) return false;
        handleMoveClick(option.r, option.c);
        await sleep(650);
        return true;
      }

      async function aiPerformPush(option, token) {
        if (!option || token !== aiRunToken) return false;
        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = option.count;
        state.selectedCharId = option.pusher.id;
        state.selectedIslandId = null;
        state.reachable = new Set(orthogonalNeighbors(option.pusher.r, option.pusher.c).map(([r, c]) => key(r, c)));
        renderAll();
        await sleep(260);
        if (token !== aiRunToken || !state) return false;
        handlePushClick(option.r, option.c);
        await sleep(650);
        return true;
      }

      async function aiPerformMagic(option, token) {
        if (!option || token !== aiRunToken) return false;
        state.phase = "ACTION";
        state.selectedActionType = "MAGIC";
        state.selectedActionCount = 1;
        state.selectedIslandId = option.island.id;
        state.selectedMagicPivot = [...option.pivot];
        state.magicPreviewSteps = option.steps;
        updateMagicPreview();
        renderAll();
        await sleep(380);
        if (token !== aiRunToken || !state) return false;
        confirmMagicRotation();
        await sleep(620);
        return true;
      }

      function aiCrownValidationOption() {
        if (availableActionCount("MOVE") < 1) return null;
        const char = aiOwnCharacters().find(candidate =>
          characterCarriesCrown(candidate.id)
          && isCrownValidationCell(currentPlayer(), candidate.r, candidate.c)
        );
        return char ? { char } : null;
      }

      async function aiPerformCrownValidation(option, token) {
        if (!option || token !== aiRunToken || !state) return false;

        state.phase = "ACTION_SELECT";
        state.selectedActionType = null;
        state.selectedCharId = option.char.id;
        renderAll();
        showToast("ORDINATEUR valide une couronne pour 1 déplacement.");
        await sleep(320);

        if (token !== aiRunToken || !state) return false;
        const validated = validateCrownPoint(option.char, { fromAI: true });
        await sleep(520);
        return validated;
      }

      function aiOpponentScoreThreat() {
        const opponents = state.players.filter(player => player.id !== state.currentPlayer);
        let threat = 0;

        for (const opponent of opponents) {
          const carrier = state.characters.find(char =>
            char.player === opponent.id && characterCarriesCrown(char.id)
          );
          if (!carrier) continue;

          const distance = aiValidationDistanceForPlayer(
            opponent,
            carrier.r,
            carrier.c
          );

          if (distance === 0) threat = Math.max(threat, 140);
          else if (distance <= 2) threat = Math.max(threat, 95);
          else if (distance <= 4) threat = Math.max(threat, 55);
        }

        return threat;
      }

      function aiExpertActionChoice(move, push, magic) {
        const choices = [];
        if (move) choices.push({ type: "MOVE", option: move, value: move.utility ?? (-move.score) });
        if (push) choices.push({ type: "PUSH", option: push, value: push.utility ?? (-push.priority) });
        if (magic) choices.push({ type: "MAGIC", option: magic, value: magic.utility ?? (-magic.score) });
        choices.sort((a, b) => b.value - a.value);
        // L'Expert conserve ses cartes plutôt que de jouer un coup neutre ou nuisible.
        return choices.find(choice => choice.value > 12) || null;
      }

      async function runAITurn(token) {
        if (!state || token !== aiRunToken || !isCurrentPlayerAI()) return;

        const cfg = aiConfig();
        state.aiThinking = true;
        state.inputLocked = true;
        els.gameScreen.classList.add("ai-turn");
        renderAll();
        showToast(`ORDINATEUR · ${cfg.label.toUpperCase()} analyse le plateau…`);
        await sleep(cfg.thinkDelay);

        if (token !== aiRunToken || !state) return;

        if (!state.islandPlacedThisTurn) {
          createAutomaticIslandAndSpawn(state.currentPlayer, false);
          await sleep(760);
        }

        let actionsPlayed = 0;
        let freeTacticsPlayed = 0;

        while (
          token === aiRunToken
          && state
          && state.winner === null
          && actionsPlayed < cfg.actionLimit
        ) {
          state.inputLocked = false;
          let acted = false;
          let consumedAction = false;

          /*
           * 1. Si un porteur est déjà sur l'une des 3 cases de son coin,
           * l'IA dépense 1 déplacement pour valider immédiatement le point.
           */
          const crownValidation = null; // Validation désormais automatique au début du tour.

          /*
           * 2. Une couronne adjacente est toujours récupérée gratuitement.
           */
          const freePickup = aiAdjacentCrownPickup();
          if (!acted && freePickup && freeTacticsPlayed < 3) {
            acted = await aiPerformFreeCrownPickup(freePickup, token);
            freeTacticsPlayed++;
          }

          /*
           * 2. Transfert gratuit : le porteur pose la couronne sur une case
           * commune et l'allié situé à deux cases la récupère immédiatement.
           */
          if (!acted && freeTacticsPlayed < 3) {
            const handoff = aiBestFreeCrownHandoff();
            if (handoff) {
              acted = await aiPerformFreeCrownHandoff(handoff, token);
              freeTacticsPlayed++;
            }
          }

          /*
           * 3. Aux niveaux Difficile et Expert, l'IA peut poser la couronne,
           * puis employer ses poussées pour la rapprocher d'un village ou
           * d'un allié.
           */
          if (!acted) {
            const dropPush = aiBestDropAndPushCrown();
            if (dropPush) {
              acted = await aiPerformDropAndPushCrown(dropPush, token);
              consumedAction = acted;
            }
          }

          const push = aiBestPush();
          const magic = aiBestMagic();
          const move = aiBestMove();
          const carrier = aiOwnCharacters().find(ch => characterCarriesCrown(ch.id));

          if (window.ILYOS && typeof window.ILYOS.yieldToMainThread === "function") {
            await window.ILYOS.yieldToMainThread();
          }
          if (!acted && cfg.globalPlanning) {
            const choice = aiExpertActionChoice(move, push, magic);

            if (choice?.type === "MOVE") {
              acted = await aiPerformMove(choice.option, token);
            } else if (choice?.type === "PUSH") {
              acted = await aiPerformPush(choice.option, token);
            } else if (choice?.type === "MAGIC") {
              acted = await aiPerformMagic(choice.option, token);
            }

            consumedAction = acted;
          } else {
            const strongMagicThreshold =
              cfg.crownTactics >= 3 ? 1.5 :
                cfg.crownTactics >= 2 ? -.5 :
                  -3;

            if (
              !acted
              && magic
              && magic.score < strongMagicThreshold
              && Math.random() < cfg.magicProbability
            ) {
              acted = await aiPerformMagic(magic, token);
              consumedAction = acted;
            }

            if (
              !acted
              && push
              && (aiOpponentCarrier() || !carrier || push.priority < 0)
              && Math.random() < cfg.pushProbability
            ) {
              acted = await aiPerformPush(push, token);
              consumedAction = acted;
            }

            if (!acted && move) {
              acted = await aiPerformMove(move, token);
              consumedAction = acted;
            }

            if (!acted && magic && Math.random() < cfg.magicProbability) {
              acted = await aiPerformMagic(magic, token);
              consumedAction = acted;
            }
          }

          if (!acted) break;
          if (consumedAction) actionsPlayed++;
          await sleep(cfg.actionDelay);
        }

        if (token !== aiRunToken || !state || state.winner !== null) return;
        state.aiThinking = false;
        state.inputLocked = false;
        els.gameScreen.classList.remove("ai-turn");
        state.phase = "ACTION_SELECT";
        state.selectedActionType
 = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        clearMagicPreview();
        state.reachable = new Set();
        renderAll();
        showToast("ORDINATEUR termine son tour.");
        await sleep(700);

        if (token === aiRunToken && state && state.winner === null) endTurn(true);
      }

      function scoreCrownsAtTurnStart(player) {
        if (!state || !player || state.winner !== null) return 0;
        let scored = 0;

        const eligibleCarriers = (state.characters || []).filter(char =>
          char.player === player.id
          && !!artifactCarriedBy(char.id)
          && isCrownValidationCell(player, char.r, char.c)
        );

        eligibleCarriers.forEach(char => {
          if (state.winner !== null) return;
          const artifact = artifactCarriedBy(char.id);
          if (!artifact) return;
          queueKayKitActionAnimation(char.id, "victory", 1200);
          animateCellPulse(char.r, char.c, "crown-burst");
          playSfx("crown");
          scoreCrownForPlayer(player, char, false, artifact);
          scored++;
        });

        // Une couronne déposée directement sur une des trois cases du village
        // est également validée au début du tour, conformément à la règle V66.
        [state.artifact, state.secondArtifact].filter(Boolean).forEach(artifact => {
          if (state.winner !== null || !artifact.active || artifact.carrierId) return;
          if (!Number.isFinite(artifact.r) || !Number.isFinite(artifact.c)) return;
          if (!isCrownValidationCell(player, artifact.r, artifact.c)) return;
          animateCellPulse(artifact.r, artifact.c, "crown-burst");
          playSfx("crown");
          scoreCrownForPlayer(player, null, false, artifact);
          scored++;
        });

        if (scored > 0) {
          state.fxCells ||= [];
          crownValidationCellsForPlayer(player).forEach(([r, c]) => state.fxCells.push({ type: "score", r, c }));
        }
        return scored;
      }

      function beginTurn() {
        const p = currentPlayer();
        const scoredAtStart = scoreCrownsAtTurnStart(p);
        if (state.winner !== null) {
          renderAll();
          return;
        }
        state.turnTransitioning = false;
        p.hand = [];
        p.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };
        drawCards(p, 5);
        state.deckAnimationMode = "deal";
        state.phase = "ACTION_SELECT";
        // Limite d'îles par équipe (duel symétrique personnalisé) : une fois
        // atteinte, la pose d'île redevient facultative au lieu de rester
        // obligatoire sans qu'aucune forme ne puisse plus être choisie.
        state.islandPlacedThisTurn = islandLimitReachedForPlayer(p.id);
        state.centerCrownTakenThisTurn = false;
        state.treasureDropFromId = null;
        state.crownPickupCell = null;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.pendingSpawnIslandId = null;
        state.fxCells = [];
        state.inputLocked = false;
        state.undoHistory = [];
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.selectedMagicPivot = null;
        state.magicPreviewDirection = 0;
        state.magicPreviewSteps = 0;
        state.magicPreviewCells = null;
        state.magicPreviewValid = false;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        state.reachable = new Set();
        state.aiThinking = !!p.isAI;
        els.gameScreen.classList.toggle("ai-turn", !!p.isAI);
        startTurnTimer(true);
        resetKayKitPointerFeedback();
        renderAll();
        showTurnRibbon(p);
        // Nouveau tour d'un joueur humain : recadrage doux vers ses gardiens,
        // sauf au tout premier tour où l'objectif (la couronne) prime.
        // (le tour de l'IA est suivi action par action, pas ici).
        if (!p.isAI) {
          if (state.turn === 1) kaykitCenterOnCrown();
          else kaykitFollowCurrentPlayer();
        }

        setTimeout(() => {
          if (!state || state.winner !== null) return;
          state.deckAnimationMode = null;
          renderDeckDisplay();
        }, 900);

        if (state.turn === 1 && state.startingBoardMode === "symmetric") {
          const setupName = SYMMETRIC_DUEL_SETUPS[state.startingBoardPreset]?.name
            || "Archipels ouverts";
          showToast(`Duel symétrique — ${setupName}.`);
        } else if (p.isAI) {
          showToast(state.turn === 1
            ? `Tirage au sort : ${p.name} commence la partie.`
            : `${p.name} prépare son tour.`);
          const token = ++aiRunToken;
          setTimeout(() => runAITurn(token), 550);
        } else {
          state.inputLocked = false;
          if (!(state.turn === 1 && state.startingBoardMode === "symmetric")) {
            showToast(state.turn === 1
              ? `Tirage au sort : ${p.name} commence la partie.`
              : `${p.name} commence son tour.`);
          }
        }
      }

      function snapshotState() {
        return JSON.stringify({
          players: state.players,
          currentPlayer: state.currentPlayer,
          round: state.round,
          turn: state.turn,
          islands: state.islands,
          characters: state.characters,
          artifact: state.artifact,
          secondArtifact: state.secondArtifact,
          phase: state.phase,
          islandPlacedThisTurn: state.islandPlacedThisTurn,
          centerCrownTakenThisTurn: !!state.centerCrownTakenThisTurn,
          treasureDropFromId: state.treasureDropFromId,
          crownPickupCell: state.crownPickupCell,
          selectedIslandShape: state.selectedIslandShape,
          placementCells: state.placementCells,
          placementOriginIndex: state.placementOriginIndex,
          hoverAnchor: state.hoverAnchor,
          pendingSpawnIslandId: state.pendingSpawnIslandId,
          selectedActionCardId: state.selectedActionCardId,
          selectedActionType: state.selectedActionType,
          selectedActionCount: state.selectedActionCount,
          pushForceChoice: state.pushForceChoice,
          crownStealTargetId: state.crownStealTargetId,
          crownPickupArtifactId: state.crownPickupArtifactId,
          treasureDropArtifactId: state.treasureDropArtifactId,
          crownTransferTargetIds: [...(state.crownTransferTargetIds || [])],
          selectedCharId: state.selectedCharId,
          selectedIslandId: state.selectedIslandId,
          selectedMagicPivot: state.selectedMagicPivot,
          magicPreviewDirection: state.magicPreviewDirection,
          magicPreviewSteps: state.magicPreviewSteps,
          magicPreviewCells: state.magicPreviewCells,
          magicPreviewValid: state.magicPreviewValid,
          reachable: [...state.reachable],
          nextIslandId: state.nextIslandId,
          nextCharId: state.nextCharId,
          winner: state.winner
        });
      }

      // Pile d'instantanés plutôt qu'un slot unique : chaque action jouée empile
      // son état d'avant, ce qui permet de remonter plusieurs coups en arrière en
      // rappelant restoreUndoSnapshot() plusieurs fois (bouton, Échap, clic droit —
      // voir bindKayKitInteractions). Plafond généreux, juste pour éviter une
      // croissance illimitée sur une très longue partie.
      const UNDO_HISTORY_LIMIT = 20;

      function saveUndoSnapshot() {
        state.undoHistory ||= [];
        state.undoHistory.push(snapshotState());
        if (state.undoHistory.length > UNDO_HISTORY_LIMIT) state.undoHistory.shift();
      }

      // Retire le dernier instantané empilé SANS le restaurer : utilisé quand
      // l'action pour laquelle il venait d'être pris échoue finalement (ex. cible
      // déjà occupée) — l'historique ne doit garder que des états correspondant à
      // des actions réellement jouées.
      function discardLastUndoSnapshot() {
        state.undoHistory?.pop();
      }

      function restoreUndoSnapshot() {
        if (!state?.undoHistory?.length) return false;
        const snap = JSON.parse(state.undoHistory.pop());
        state.players = snap.players;
        state.currentPlayer = snap.currentPlayer;
        state.round = snap.round;
        state.turn = snap.turn;
        state.islands = snap.islands;
        state.characters = snap.characters;
        state.artifact = snap.artifact;
        state.secondArtifact = snap.secondArtifact || { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
        state.phase = snap.phase;
        state.islandPlacedThisTurn = !!snap.islandPlacedThisTurn;
        state.centerCrownTakenThisTurn = !!snap.centerCrownTakenThisTurn;
        state.treasureDropFromId = snap.treasureDropFromId || null;
        state.crownPickupCell = snap.crownPickupCell || null;
        state.selectedIslandShape = snap.selectedIslandShape;
        state.placementCells = snap.placementCells;
        state.placementOriginIndex = snap.placementOriginIndex;
        state.hoverAnchor = snap.hoverAnchor;
        state.pendingSpawnIslandId = snap.pendingSpawnIslandId;
        state.selectedActionCardId = snap.selectedActionCardId;
        state.selectedActionType = snap.selectedActionType;
        state.selectedActionCount = snap.selectedActionCount;
        state.pushForceChoice = snap.pushForceChoice || 1;
        state.crownStealTargetId = snap.crownStealTargetId || null;
        state.crownPickupArtifactId = snap.crownPickupArtifactId || null;
        state.treasureDropArtifactId = snap.treasureDropArtifactId || null;
        state.crownTransferTargetIds = Array.isArray(snap.crownTransferTargetIds)
          ? [...snap.crownTransferTargetIds]
          : [];
        state.selectedCharId = snap.selectedCharId;
        state.selectedIslandId = snap.selectedIslandId;
        state.selectedMagicPivot = snap.selectedMagicPivot;
        state.magicPreviewDirection = snap.magicPreviewDirection;
        state.magicPreviewSteps = snap.magicPreviewSteps;
        state.magicPreviewCells = snap.magicPreviewCells;
        state.magicPreviewValid = snap.magicPreviewValid;
        state.reachable = new Set(snap.reachable || []);
        state.nextIslandId = snap.nextIslandId;
        state.nextCharId = snap.nextCharId;
        state.winner = snap.winner;
        state.fxCells = [];
        state.inputLocked = false;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.actionHoverCell = null;
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        renderAll();
        showToast(state.undoHistory.length
          ? `Action annulée · ${state.undoHistory.length} de plus possible${state.undoHistory.length > 1 ? "s" : ""}.`
          : "Dernière action annulée.");
        return true;
      }

      function handleCancelButton() {
        if (state?.inputLocked) return;
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        if (state?.phase === "ACTION" && state?.selectedActionType) {
          cancelSelectedCard();
        } else if (state?.phase === "PLACE_ISLAND") {
          state.phase = "ACTION_SELECT";
          state.selectedIslandShape = null;
          state.placementCells = null;
          state.placementOriginIndex = 0;
          state.hoverAnchor = null;
          state.reachable = new Set();
          renderAll();
        } else if (state?.phase === "DROP_TREASURE") {
          state.treasureDropFromId = null;
          state.treasureDropArtifactId = null;
          state.selectedCharId = null;
          state.reachable = new Set();
          state.phase = "ACTION_SELECT";
          renderAll();
        } else if (state?.phase === "PICKUP_CROWN") {
          state.crownPickupCell
 = null;
          state.crownStealTargetId = null;
          state.crownPickupArtifactId = null;
          state.selectedCharId = null;
          state.reachable = new Set();
          state.phase = "ACTION_SELECT";
          renderAll();
        } else if (state?.phase === "SMART_CHAR") {
          cancelSmartCharacterAction();
        } else {
          restoreUndoSnapshot();
        }
      }


      /* ==================================================================
         ILYOS — AUDIO
         ------------------------------------------------------------------
         Les deux pistes historiques étaient deux WAV en base64 inline :
         20 s en 18 kHz stéréo et 26 s en 16 kHz mono, soit 2,15 Mo gzip
         — 92 % du poids de js/game.js — pour environ cinq secondes de
         matériau réellement distinct, répété en boucle pendant toute la
         partie. Elles sont remplacées par un moteur génératif Web Audio :
         zéro octet, zéro requête, et une ambiance qui ne se répète jamais.

         Tout passe désormais par un seul graphe :

             voix génératives ─┐
             <audio> externe ──┼→ musicGain → musicDuck ─┐
                                                          ├→ masterGain
             bruitages ────────────→ effectsGain ────────┘      │
                                                                 ↓
             (départ réverbe partagé) → reverbDamp → reverb ──→ limiteur → sortie

         Conséquence utile : musique et bruitages ont enfin des gains
         séparés sur le même bus, donc le ducking et les fondus croisés
         deviennent possibles — ce que l'ancien <audio>.volume, hors du
         graphe Web Audio, interdisait.
         ================================================================== */

      /* Ambiances génératives. Chacune est une grammaire, pas un fichier :
         une fondamentale, une grille d'accords en demi-tons, les degrés
         autorisés pour les cloches, et les bornes du filtre. Changer un
         de ces nombres change la couleur de l'ambiance sans toucher au
         moteur. */
      const MUSIC_AMBIENCES = {
        ciel: {
          label: "Ciel clair",
          rootMidi: 50,                       // D3
          /* Mode lydien : c'est la quarte augmentée (le +6) qui donne
             l'impression de flotter plutôt que de se poser. */
          chords: [[0, 7, 16, 23], [-3, 4, 14, 21], [2, 9, 18, 26], [-5, 2, 11, 18]],
          bellDegrees: [0, 2, 4, 6, 7, 9, 11, 14, 16, 18],
          chordSeconds: 15,
          bellInterval: [1.7, 4.6],
          cutoff: [560, 1650],
          padGain: .085,
          bellGain: .085,
          subGain: .05,
          padWave: "sawtooth"
        },
        brume: {
          label: "Brume",
          rootMidi: 45,                       // A2
          // Dorien : mineur, mais la sixte majeure empêche que ce soit triste.
          chords: [[0, 7, 15, 22], [-2, 5, 12, 21], [3, 10, 15, 19], [-4, 3, 12, 19]],
          bellDegrees: [0, 2, 3, 5, 7, 9, 10, 12, 15, 17],
          chordSeconds: 18,
          bellInterval: [2.4, 6.2],
          cutoff: [380, 1080],
          padGain: .095,
          bellGain: .07,
          subGain: .07,
          padWave: "triangle"
        },
        nuit: {
          label: "Nuit",
          rootMidi: 41,                       // F2
          // Éolien, très espacé : les accords durent presque une demi-minute.
          chords: [[0, 7, 12, 19], [-3, 4, 12, 16], [-5, 2, 10, 14], [0, 5, 12, 17]],
          bellDegrees: [0, 3, 5, 7, 10, 12, 15, 19],
          chordSeconds: 24,
          bellInterval: [3.4, 8.5],
          cutoff: [300, 820],
          padGain: .1,
          bellGain: .055,
          subGain: .09,
          padWave: "triangle"
        }
      };

      /* Pistes audio réelles — vide par défaut, et c'est volontaire : le jeu
         ne télécharge aucun octet d'audio tant que ce registre est vide.

         Pour ajouter une vraie musique composée, déposer les fichiers dans
         assets/audio/ et déclarer l'entrée ici :

             theme: {
               label: "Thème principal",
               src: "./assets/audio/theme",     // sans extension
               formats: ["opus", "m4a"]         // par ordre de préférence
             }

         Elle apparaît alors automatiquement dans le menu Son, elle est
         chargée seulement quand le joueur la choisit, et elle passe par le
         même bus que le moteur génératif (donc mêmes volumes, même
         limiteur, même ducking). Aucun autre code n'est à toucher.
         Le service worker doit en revanche apprendre à les mettre en cache
         — voir sw.js, chantier séparé. */
      const MUSIC_FILES = {};

      const MUSIC_FILE_MIME = { opus: 'audio/ogg; codecs="opus"', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: "audio/mpeg", webm: 'audio/webm; codecs="opus"' };

      /* Anciennes valeurs de réglage → nouvelles ambiances. Sans cette table,
         un joueur qui avait choisi "Sanctuaire mystique" se retrouverait
         silencieusement remis sur l'ambiance par défaut. */
      const MUSIC_TRACK_MIGRATION = { sky: "ciel", mystic: "brume", alternate: "auto" };
      const MUSIC_AUTO_SWITCH_SECONDS = 240;

      function musicTrackExists(value) {
        return value === "auto" || !!MUSIC_AMBIENCES[value] || !!MUSIC_FILES[value];
      }

      function normalizeMusicTrack(value) {
        const migrated = MUSIC_TRACK_MIGRATION[value] || value;
        return musicTrackExists(migrated) ? migrated : "auto";
      }

      function loadSoundSettings() {
        let storedVersion = null;
        try {
          const saved = JSON.parse(localStorage.getItem("ilyosSoundSettings") || "null");
          if (saved) {
            storedVersion = Number(saved.version || 0);
            const compatible = Number(saved.version || 0) >= SOUND_SETTINGS_VERSION;
            if (compatible && Number.isFinite(saved.master)) soundSettings.master = Math.min(1, Math.max(0, saved.master));
            if (compatible && Number.isFinite(saved.music)) soundSettings.music = Math.min(1, Math.max(0, saved.music));
            if (Number.isFinite(saved.effects)) soundSettings.effects = Math.min(1.6, Math.max(0, saved.effects));
            // Le choix de piste survit au changement de version : il est migré,
            // pas jeté (voir MUSIC_TRACK_MIGRATION).
            if (typeof saved.track === "string") soundSettings.track = normalizeMusicTrack(saved.track);
            if (typeof saved.enabled === "boolean") ambientEnabled = saved.enabled;
          }
        } catch (error) {
          console.warn("Réglages audio non récupérés.", error);
        }
        soundSettings.track = normalizeMusicTrack(soundSettings.track);
        currentMusicKey = resolveAmbienceKey();
        /* Réécriture immédiate dès que l'entrée stockée date d'une version
           antérieure : sinon l'ancienne valeur reste dans localStorage et la
           migration est refaite à chaque chargement. Comparer la piste avant
           et après normalisation ne suffit pas — elle a déjà été normalisée
           en sortant du bloc de lecture. */
        if (storedVersion !== null && storedVersion < SOUND_SETTINGS_VERSION) saveSoundSettings();
      }

      function saveSoundSettings() {
        try {
          localStorage.setItem("ilyosSoundSettings", JSON.stringify({
            ...soundSettings,
            version: SOUND_SETTINGS_VERSION,
            enabled: ambientEnabled
          }));
        } catch (error) {
          console.warn("Réglages audio non sauvegardés.", error);
        }
      }

      /* ---------- Le bus ---------- */

      /* Réverbe sans fichier : une réponse impulsionnelle bruitée à décroissance
         exponentielle suffit à un ConvolverNode. C'est ce qui donne au moteur
         sa profondeur — sans elle, les nappes sonnent comme un orgue de test.
         Les deux canaux sont décorrélés, d'où la largeur stéréo. */
      /* Longueur de la queue de réverbe. C'est le poste CPU dominant de tout le
         moteur audio — mesuré hors ligne sur ce graphe exact, en rendu de 10 s :
         ~1,6 % d'un cœur pour la synthèse seule, ~3,7 % avec une queue de 1,8 s,
         ~5,7 % avec 3,6 s. Le coût vit sur le fil audio, pas sur celui qui rend
         la 3D, donc il ne dispute rien à la scène — mais la marge est plus mince
         sur un téléphone, d'où le raccourcissement. */
      function reverbSeconds() {
        if (window.kaykit3D?.qualityMode === "performance") return 1.6;
        const cores = navigator.hardwareConcurrency || 4;
        const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
        if (cores <= 4 || smallScreen) return 2.2;
        return 3.6;
      }

      function buildReverbImpulse(ctx, seconds = reverbSeconds(), decay = 2.4) {
        const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
          }
        }
        return impulse;
      }

      function ensureAudio() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!audioCtx && AudioContextClass) {
          audioCtx = new AudioContextClass();

          // Limiteur de sortie : réglages conservés de la version précédente,
          // ils tenaient déjà correctement les pics de poussée.
          effectsLimiter = audioCtx.createDynamicsCompressor();
          effectsLimiter.threshold.value = -10;
          effectsLimiter.knee.value = 8;
          effectsLimiter.ratio.value = 8;
          effectsLimiter.attack.value = 0.003;
          effectsLimiter.release.value = 0.14;
          effectsLimiter.connect(audioCtx.destination);

          masterGain = audioCtx.createGain();
          masterGain.connect(effectsLimiter);

          musicGain = audioCtx.createGain();
          musicDuck = audioCtx.createGain();
          musicDuck.gain.value = 1;
          musicGain.connect(musicDuck);
          musicDuck.connect(masterGain);

          // Conserve le nom historique : plusieurs fragments s'y réfèrent.
          effectsGain = audioCtx.createGain();
          effectsGain.connect(masterGain);

          reverbNode = audioCtx.createConvolver();
          reverbNode.buffer = buildReverbImpulse(audioCtx);
          reverbDamp = audioCtx.createBiquadFilter();
          reverbDamp.type = "lowpass";
          reverbDamp.frequency.value = 3200;
          reverbReturn = audioCtx.createGain();
          reverbReturn.gain.value = .85;
          reverbDamp.connect(reverbNode);
          reverbNode.connect(reverbReturn);
          reverbReturn.connect(masterGain);

          /* Un casque débranché, une sortie changée en cours de partie, ou un
             onglet mis en veille par le système suspendent le contexte sans
             prévenir le jeu. Sans reprise, le son ne revient jamais et il faut
             recharger la page. */
          audioCtx.addEventListener("statechange", () => {
            if (!ambientEnabled || audioCtx.state !== "suspended") return;
            audioCtx.resume().then(() => {
              if (!document.hidden) updateMusicSource(false);
            }).catch(() => { });
          });
        }

        updateSoundLevels();
      }

      /* Départ réverbe. Renvoie null si le graphe n'est pas prêt, pour que les
         appelants puissent simplement ignorer l'envoi. */
      function connectReverbSend(node, amount) {
        if (!audioCtx || !reverbDamp || amount <= 0) return null;
        const send = audioCtx.createGain();
        send.gain.value = amount;
        node.connect(send);
        send.connect(reverbDamp);
        return send;
      }

      function createPanner(pan) {
        if (!audioCtx || !audioCtx.createStereoPanner) return null;
        const panner = audioCtx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        return panner;
      }

      const midiToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

      /* ---------- Moteur génératif ---------- */

      const music = {
        running: false,
        timer: null,
        ambienceKey: "ciel",
        chordIndex: 0,
        chord: null,
        nextChordTime: 0,
        nextBellTime: 0,
        nextAmbienceSwitch: 0,
        intensity: .2,
        voices: [],
        sub: null
      };

      const MUSIC_LOOKAHEAD_MS = 120;
      const MUSIC_SCHEDULE_AHEAD = .5;

      function resolveAmbienceKey() {
        if (MUSIC_AMBIENCES[soundSettings.track]) return soundSettings.track;
        if (soundSettings.track === "auto") {
          return MUSIC_AMBIENCES[currentMusicKey] ? currentMusicKey : "ciel";
        }
        return "ciel";
      }

      function currentAmbience() {
        return MUSIC_AMBIENCES[music.ambienceKey] || MUSIC_AMBIENCES.ciel;
      }

      const randomBetween = (min, max) => min + Math.random() * (max - min);
      const pickFrom = list => list[Math.floor(Math.random() * list.length)];

      /* Intensité 0 → 1, relue à chaque tick du planificateur. C'est le seul
         lien entre le moteur et les règles : il lit `state`, il ne le modifie
         jamais, et il tolère l'absence de partie en cours. */
      function musicIntensity() {
        if (!state) return .12;
        if (state.winner !== null) return .95;

        let value = .18;
        const scores = (state.players || []).map(player => player.score || 0);
        const bestScore = scores.length ? Math.max(...scores) : 0;
        if (bestScore >= 2) value += .34;
        else if (bestScore >= 1) value += .14;

        // Une couronne portée est le moment le plus tendu d'une partie.
        if (typeof characterCarriesCrown === "function") {
          const carried = (state.characters || []).some(character => characterCarriesCrown(character.id));
          if (carried) value += .28;
        }

        if ((state.turn || 0) > 24) value += .1;
        // Pendant le tour de l'IA, le joueur attend : on retire un peu de
        // densité pour que le plateau paraisse plus calme.
        if (state.aiThinking) value -= .12;

        return Math.max(0, Math.min(1, value));
      }

      /* Une partie dure vingt à trente minutes, soit plusieurs milliers de voix
         planifiées. Un nœud arrêté mais toujours connecté au graphe n'est pas
         libéré : sans ce nettoyage, le graphe grossit indéfiniment. `ended` de
         l'oscillateur est le seul signal fiable pour savoir quand couper. */
      function registerMusicVoice(stopAt, nodes, terminator) {
        const entry = { stopAt, nodes };
        music.voices.push(entry);
        if (terminator) {
          terminator.onended = () => {
            nodes.forEach(node => { try { node.disconnect(); } catch (error) { } });
            entry.nodes = [];
          };
        }
        // Purge paresseuse : les voix terminées sont retirées au fil de l'eau
        // plutôt que par un balayage périodique.
        if (music.voices.length > 64) {
          const now = audioCtx.currentTime;
          music.voices = music.voices.filter(voice => voice.stopAt > now);
        }
      }

      function scheduleMusicChord(time) {
        const ambience = currentAmbience();
        const chord = ambience.chords[music.chordIndex % ambience.chords.length];
        music.chord = chord;
        music.chordIndex++;

        const duration = ambience.chordSeconds;
        const attack = Math.min(4.5, duration * .35);
        const release = 2.2;
        const openness = .25 + music.intensity * .75;
        const cutoffPeak = ambience.cutoff[0] + (ambience.cutoff[1] - ambience.cutoff[0]) * openness;

        chord.forEach((semitone, index) => {
          const frequency = midiToFreq(ambience.rootMidi + semitone);
          // Deux oscillateurs désaccordés par note : c'est ce battement lent
          // qui distingue une nappe d'un simple accord d'oscillateurs.
          [-7, 7].forEach(detune => {
            const osc = audioCtx.createOscillator();
            osc.type = index === 0 ? "triangle" : ambience.padWave;
            osc.frequency.value = frequency;
            osc.detune.value = detune;

            const filter = audioCtx.createBiquadFilter();
            filter.type = "lowpass";
            filter.Q.value = .7;
            filter.frequency.setValueAtTime(ambience.cutoff[0], time);
            filter.frequency.linearRampToValueAtTime(cutoffPeak, time + duration * .55);
            filter.frequency.linearRampToValueAtTime(ambience.cutoff[0], time + duration + release);

            const gain = audioCtx.createGain();
            // Les notes aiguës de l'accord sont volontairement plus discrètes.
            const level = ambience.padGain * (index === 0 ? 1 : .62 / Math.sqrt(index));
            gain.gain.setValueAtTime(.0001, time);
            gain.gain.linearRampToValueAtTime(level, time + attack);
            gain.gain.setValueAtTime(level, time + duration - .4);
            gain.gain.linearRampToValueAtTime(.0001, time + duration + release);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(musicGain);
            const send = connectReverbSend(gain, .45);

            osc.start(time);
            osc.stop(time + duration + release + .2);
            registerMusicVoice(
              time + duration + release + .2,
              [osc, filter, gain, send].filter(Boolean),
              osc
            );
          });
        });
      }

      function scheduleMusicBell(time) {
        const ambience = currentAmbience();
        const chordTones = music.chord || ambience.chords[0];
        // Deux fois sur trois la cloche tombe sur une note de l'accord courant,
        // sinon sur un degré libre du mode : assez de surprise pour que l'oreille
        // ne prédise pas la suite, jamais assez pour sonner faux.
        const semitone = Math.random() < .66
          ? pickFrom(chordTones)
          : pickFrom(ambience.bellDegrees);
        const octave = 12 * (1 + Math.floor(Math.random() * 2));
        const frequency = midiToFreq(ambience.rootMidi + semitone + octave);
        const duration = randomBetween(2.4, 4.6);
        const level = ambience.bellGain * randomBetween(.55, 1) * (.55 + music.intensity * .45);

        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;

        // Une quinte très en retrait donne le corps métallique sans passer par
        // une vraie synthèse FM.
        const partial = audioCtx.createOscillator();
        partial.type = "sine";
        partial.frequency.value = frequency * 3.01;
        const partialGain = audioCtx.createGain();
        partialGain.gain.value = .12;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(.0001, time);
        gain.gain.exponentialRampToValueAtTime(Math.max(level, .001), time + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, time + duration);

        const panner = createPanner(randomBetween(-.75, .75));
        osc.connect(gain);
        partial.connect(partialGain);
        partialGain.connect(gain);

        const tail = panner || gain;
        if (panner) gain.connect(panner);
        tail.connect(musicGain);
        const send = connectReverbSend(tail, .8);

        osc.start(time);
        partial.start(time);
        osc.stop(time + duration + .1);
        partial.stop(time + duration + .1);
        registerMusicVoice(
          time + duration + .1,
          [osc, partial, partialGain, gain, panner, send].filter(Boolean),
          osc
        );
      }

      function ensureMusicSub() {
        const ambience = currentAmbience();
        if (music.sub) return;
        const osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = midiToFreq(ambience.rootMidi - 12);
        const gain = audioCtx.createGain();
        gain.gain.value = .0001;
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start();
        music.sub = { osc, gain };
      }

      function updateMusicSubTarget() {
        if (!music.sub || !audioCtx) return;
        const ambience = currentAmbience();
        music.sub.osc.frequency.setTargetAtTime(midiToFreq(ambience.rootMidi - 12), audioCtx.currentTime, .8);
        const target = ambience.subGain * (.45 + music.intensity * .55);
        music.sub.gain.gain.setTargetAtTime(Math.max(target, .0001), audioCtx.currentTime, 1.2);
      }

      function musicTick() {
        if (!music.running || !audioCtx) return;
        const now = audioCtx.currentTime;
        const horizon = now + MUSIC_SCHEDULE_AHEAD;

        // Lissage : l'intensité suit l'état du jeu, mais lentement, pour que le
        // changement s'entende comme une dérive et non comme une bascule.
        music.intensity += (musicIntensity() - music.intensity) * .04;

        if (soundSettings.track === "auto" && now >= music.nextAmbienceSwitch) {
          const keys = Object.keys(MUSIC_AMBIENCES);
          const next = keys[(keys.indexOf(music.ambienceKey) + 1) % keys.length];
          music.ambienceKey = next;
          currentMusicKey = next;
          music.nextAmbienceSwitch = now + MUSIC_AUTO_SWITCH_SECONDS;
          updateSoundUI();
        }

        while (music.nextChordTime < horizon) {
          scheduleMusicChord(Math.max(music.nextChordTime, now + .05));
          music.nextChordTime = Math.max(music.nextChordTime, now + .05) + currentAmbience().chordSeconds;
        }

        while (music.nextBellTime < horizon) {
          scheduleMusicBell(Math.max(music.nextBellTime, now + .05));
          const ambience = currentAmbience();
          // Plus la partie est tendue, plus les cloches se resserrent.
          const density = 1 - music.intensity * .55;
          music.nextBellTime = Math.max(music.nextBellTime, now + .05)
            + randomBetween(ambience.bellInterval[0], ambience.bellInterval[1]) * density;
        }

        updateMusicSubTarget();
      }

      function startGenerativeMusic() {
        if (!audioCtx || music.running) return;
        music.ambienceKey = resolveAmbienceKey();
        currentMusicKey = music.ambienceKey;
        music.running = true;
        music.chordIndex = 0;
        music.intensity = musicIntensity();
        const now = audioCtx.currentTime;
        music.nextChordTime = now + .1;
        music.nextBellTime = now + 1.4;
        music.nextAmbienceSwitch = now + MUSIC_AUTO_SWITCH_SECONDS;
        ensureMusicSub();
        musicTick();
        music.timer = setInterval(musicTick, MUSIC_LOOKAHEAD_MS);
      }

      function stopGenerativeMusic({ immediate = false } = {}) {
        if (music.timer) { clearInterval(music.timer); music.timer = null; }
        music.running = false;
        if (!audioCtx) return;

        const now = audioCtx.currentTime;
        if (music.sub) {
          music.sub.gain.gain.cancelScheduledValues(now);
          music.sub.gain.gain.setTargetAtTime(.0001, now, immediate ? .05 : .4);
          const sub = music.sub;
          setTimeout(() => { try { sub.osc.stop(); sub.osc.disconnect(); sub.gain.disconnect(); } catch (error) { } }, immediate ? 200 : 1400);
          music.sub = null;
        }

        // Les voix déjà planifiées s'éteignent d'elles-mêmes ; on ne coupe
        // brutalement que si on nous le demande (changement d'ambiance).
        if (immediate) {
          music.voices.forEach(voice => voice.nodes.forEach(node => {
            try { if (node.stop) node.stop(); node.disconnect(); } catch (error) { }
          }));
          music.voices = [];
        }
      }

      /* ---------- Pistes audio réelles ---------- */

      function pickMusicFileSource(entry) {
        if (!entry?.src) return null;
        const probe = ambienceAudio || new Audio();
        const formats = entry.formats?.length ? entry.formats : ["opus", "m4a"];
        const supported = formats.find(format => {
          const mime = MUSIC_FILE_MIME[format];
          return mime && probe.canPlayType(mime) !== "";
        }) || formats[formats.length - 1];
        return `${entry.src}.${supported}`;
      }

      function ensureMusicElement() {
        if (ambienceAudio) return ambienceAudio;
        ambienceAudio = new Audio();
        ambienceAudio.preload = "none";
        ambienceAudio.loop = true;
        ambienceAudio.crossOrigin = "anonymous";
        ambienceAudio.addEventListener("ended", handleMusicEnded);
        if (audioCtx && !musicElementSource) {
          try {
            musicElementSource = audioCtx.createMediaElementSource(ambienceAudio);
            musicElementSource.connect(musicGain);
          } catch (error) {
            // Navigateur qui refuse la passerelle : la piste joue quand même,
            // simplement hors du bus (volume géré directement sur l'élément).
            console.warn("Passerelle Web Audio indisponible pour la musique.", error);
          }
        }
        return ambienceAudio;
      }

      function stopMusicFile() {
        if (ambienceAudio && !ambienceAudio.paused) ambienceAudio.pause();
      }

      /* Un seul point d'entrée pour « ce qui doit jouer maintenant » : soit une
         ambiance générative, soit un fichier, jamais les deux. */
      function updateMusicSource(force = false) {
        if (!ambientEnabled) return;

        const fileEntry = MUSIC_FILES[soundSettings.track];
        if (fileEntry) {
          stopGenerativeMusic({ immediate: true });
          const element = ensureMusicElement();
          const source = pickMusicFileSource(fileEntry);
          if (source && (force || element.getAttribute("src") !== source)) {
            element.pause();
            element.setAttribute("src", source);
            element.load();
          }
          element.play().catch(() => { });
          return;
        }

        stopMusicFile();
        const wanted = resolveAmbienceKey();
        if (force && music.running && wanted !== music.ambienceKey) {
          stopGenerativeMusic({ immediate: false });
        }
        if (!music.running) startGenerativeMusic();
        else if (wanted !== music.ambienceKey) {
          music.ambienceKey = wanted;
          currentMusicKey = wanted;
        }
      }

      function handleMusicEnded() {
        // Les fichiers bouclent d'eux-mêmes ; ce gestionnaire ne sert plus qu'aux
        // pistes déclarées non bouclées.
        if (!ambientEnabled || !MUSIC_FILES[soundSettings.track]) return;
        ambienceAudio?.play().catch(() => { });
      }

      function refreshMusicTrackOptions() {
        const select = els.musicTrackSelect;
        if (!select) return;
        const entries = [
          ["auto", "Alternance des ambiances"],
          ...Object.entries(MUSIC_AMBIENCES).map(([key, ambience]) => [key, ambience.label]),
          ...Object.entries(MUSIC_FILES).map(([key, file]) => [key, file.label || key])
        ];
        const signature = entries.map(([key]) => key).join("|");
        // Reconstruit seulement si la liste a changé : ajouter une piste dans
        // MUSIC_FILES suffit à la faire apparaître, sans toucher à index.html.
        if (select.dataset.ilyosTracks === signature) return;
        select.dataset.ilyosTracks = signature;
        select.innerHTML = entries
          .map(([key, label]) => `<option value="${key}">${label}</option>`)
          .join("");
      }

      function setMusicTrack(value) {
        const track = normalizeMusicTrack(value);
        soundSettings.track = track;
        if (MUSIC_AMBIENCES[track]) currentMusicKey = track;
        ensureAudio();
        updateSoundLevels();
        updateMusicSource(true);
        saveSoundSettings();
        updateSoundUI();
        if (ambientEnabled) startAmbient();
      }

      /* ---------- Volumes ---------- */

      function updateSoundLevels() {
        const enabledMultiplier = ambientEnabled ? 1 : 0;

        if (audioCtx && masterGain) {
          const now = audioCtx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setTargetAtTime(soundSettings.master * enabledMultiplier, now, .02);
          musicGain.gain.setTargetAtTime(Math.min(1, soundSettings.music * .92), now, .05);
          effectsGain.gain.setTargetAtTime(Math.min(1.65, soundSettings.effects), now, .018);
        }

        // Piste externe qui n'a pas pu rejoindre le bus : repli sur le volume
        // de l'élément lui-même pour que les réglages restent honnêtes.
        if (ambienceAudio && !musicElementSource) {
          ambienceAudio.volume = Math.min(1, soundSettings.master * soundSettings.music * .92) * enabledMultiplier;
        }
      }

      /* Ducking : la musique recule brièvement pour laisser passer un événement
         important. Impossible avec l'ancien <audio> isolé du graphe. */
      function duckMusic(amount = .45, seconds = .9) {
        if (!audioCtx || !musicDuck) return;
        const now = audioCtx.currentTime;
        musicDuck.gain.cancelScheduledValues(now);
        musicDuck.gain.setTargetAtTime(1 - amount, now, .05);
        musicDuck.gain.setTargetAtTime(1, now + seconds, .35);
      }

      function updateSoundUI() {
        if (!els.soundBtn) return;
        els.soundBtn.textContent = ambientEnabled ? "🔊 SON ▾" : "🔇 SON ▾";
        els.soundBtn.classList.toggle("active", ambientEnabled);
        els.soundBtn.setAttribute("aria-pressed", ambientEnabled ? "true" : "false");

        if (els.soundToggleBtn) {
          els.soundToggleBtn.textContent = ambientEnabled ? "🔊 SON ACTIVÉ" : "🔇 SON COUPÉ";
          els.soundToggleBtn.classList.toggle("off", !ambientEnabled);
        }

        if (els.masterVolumeSlider) {
          els.masterVolumeSlider.value = Math.round(soundSettings.master * 100);
          els.musicVolumeSlider.value = Math.round(soundSettings.music * 100);
          els.effectsVolumeSlider.value = Math.round(soundSettings.effects * 100);
          refreshMusicTrackOptions();
          if (els.musicTrackSelect) els.musicTrackSelect.value = soundSettings.track;
          els.masterVolumeValue.textContent = `${Math.round(soundSettings.master * 100)} %`;
          els.musicVolumeValue.textContent = `${Math.round(soundSettings.music * 100)} %`;
          els.effectsVolumeValue.textContent = `${Math.round(soundSettings.effects * 100)} %`;
        }
      }

      async function startAmbient() {
        ensureAudio();
        if (!ambientEnabled) {
          updateSoundLevels();
          updateSoundUI();
          return;
        }

        try {
          if (audioCtx?.state === "suspended") await audioCtx.resume();
          updateSoundLevels();
          updateMusicSource(false);
        } catch (error) {
          console.warn("Le navigateur attend une interaction pour lancer la musique.", error);
        }
      }

      function stopAmbient() {
        ambientEnabled = false;
        stopGenerativeMusic({ immediate: false });
        stopMusicFile();
        updateSoundLevels();
        updateSoundUI();
        saveSoundSettings();
      }

      async function enableSound() {
        ambientEnabled = true;
        updateSoundLevels();
        updateSoundUI();
        saveSoundSettings();
        await startAmbient();
      }

      async function toggleSoundEnabled() {
        if (ambientEnabled) stopAmbient();
        else await enableSound();
      }

      /* Onglet en arrière-plan : la musique se tait, les réglages ne bougent pas.
         Sans ça, une partie laissée ouverte continue de synthétiser dans le vide. */
      document.addEventListener("visibilitychange", () => {
        if (!ambientEnabled || !audioCtx) return;
        if (document.hidden) {
          stopGenerativeMusic({ immediate: false });
          stopMusicFile();
        } else {
          updateMusicSource(false);
        }
      });

      function positionSoundMenu() {
        if (!els.soundBtn || !els.soundMenu || els.soundMenu.classList.contains("hidden")) return;
        const rect = els.soundBtn.getBoundingClientRect();
        const menuWidth = Math.min(310, window.innerWidth - 16);
        const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.left + rect.width - menuWidth));
        const top = Math.min(window.innerHeight - els.soundMenu.offsetHeight - 8, rect.bottom + 8);
        els.soundMenu.style.left = `${left}px`;
        els.soundMenu.style.top = `${Math.max(8, top)}px`;
        els.soundMenu.style.width = `${menuWidth}px`;
      }

      function openSoundMenu() {
        els.soundMenu.classList.remove("hidden");
        els.soundBtn.setAttribute("aria-expanded", "true");
        updateSoundUI();
        requestAnimationFrame(positionSoundMenu);
      }

      function closeSoundMenu() {
        els.soundMenu.classList.add("hidden");
        els.soundBtn.setAttribute("aria-expanded", "false");
      }

      function toggleSoundMenu(event) {
        event?.stopPropagation();
        if (els.soundMenu.classList.contains("hidden")) openSoundMenu();
        else closeSoundMenu();
      }

      function setSoundSetting(name, value) {
        soundSettings[name] = name === "effects"
          ? Math.min(1.6, Math.max(0, value / 100))
          : Math.min(1, Math.max(0, value / 100));
        updateSoundLevels();
        updateSoundUI();
        saveSoundSettings();
      }

      /* ---------- Bruitages ---------- */

      /* Les bruitages restent entièrement synthétisés — ils ne coûtent aucun
         octet — mais ce ne sont plus des paires de bips à hauteur fixe. Trois
         primitives remplacent l'ancien couple playTone/playNoise :

           sfxNoise  bruit à filtre balayé — toute la matière : pierre,
                     souffle, frottement, transitoire d'impact.
           sfxSweep  oscillateur à enveloppe de hauteur. Un sinus qui descend
                     de 250 à 44 Hz est un impact ; le même sinus à hauteur
                     fixe n'est qu'un bip. C'est là que se joue l'essentiel de
                     la différence avec la version précédente.
           sfxBell   partiels inharmoniques — cristal, cloche, couronne. Ce
                     sont les rapports non entiers qui font entendre du métal
                     plutôt qu'un orgue.

         Chaque son suit ensuite le même schéma que n'importe quel sound design
         de jeu : transitoire (le claquement), corps (la hauteur qui chute),
         queue (la réverbe). Le dosage de réverbe est propre à chaque son —
         une pierre qui se pose est sèche, la magie est noyée. */

      // Chaque son composite consomme 2 à 5 voix : le plafond tient compte
      // d'une poussée en chaîne qui déclencherait plusieurs sons à la suite.
      const SFX_MAX_VOICES = 22;
      let sfxActiveVoices = 0;

      function sfxVoiceAvailable() {
        if (sfxActiveVoices >= SFX_MAX_VOICES) return false;
        sfxActiveVoices++;
        return true;
      }

      function releaseSfxVoice(seconds) {
        setTimeout(() => { sfxActiveVoices = Math.max(0, sfxActiveVoices - 1); }, Math.max(60, seconds * 1000));
      }

      function sfxGraphReady() {
        if (!ambientEnabled) return false;
        ensureAudio();
        if (!audioCtx || !effectsGain) return false;
        if (audioCtx.state === "suspended") audioCtx.resume();
        return true;
      }

      /* Sortie commune : panoramique optionnel, départ réverbe dosé par son, et
         déconnexion de toute la chaîne quand la voix s'éteint. */
      function sfxRoute(terminator, gain, nodes, { pan, reverb = .16 } = {}, lifetime = .5) {
        const panner = Number.isFinite(pan) ? createPanner(pan) : null;
        const tail = panner || gain;
        if (panner) gain.connect(panner);
        tail.connect(effectsGain);
        const send = connectReverbSend(tail, reverb);
        const all = [...nodes, panner, send].filter(Boolean);
        terminator.onended = () => all.forEach(node => { try { node.disconnect(); } catch (error) { } });
        releaseSfxVoice(lifetime + .15);
      }

      /* Le bruit blanc est mis en cache par tranche de 50 ms : le remplir coûte
         un Math.random() par échantillon, et l'ancienne version en allouait un
         neuf à chaque poussée. */
      const noiseBuffers = new Map();
      function noiseBuffer(duration) {
        const slots = Math.max(1, Math.ceil(duration * 20));
        const cached = noiseBuffers.get(slots);
        if (cached && cached.sampleRate === audioCtx.sampleRate) return cached;
        const length = Math.floor(audioCtx.sampleRate * (slots / 20));
        const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        noiseBuffers.set(slots, buffer);
        return buffer;
      }

      /* Texture papier. Un froissement n'est pas un souffle : c'est une nuée de
         micro-craquements irréguliers. Du bruit continu sous enveloppe lisse —
         ce que faisait la version précédente du son de fin de tour — donne du
         vent, jamais de la fibre. Le grain est donc fabriqué dans le tampon
         lui-même : des salves très courtes, d'amplitude aléatoire, séparées de
         quasi-silences. Trois tirages sont gardés en cache et choisis au hasard
         pour qu'une page ne se tourne jamais deux fois exactement pareil. */
      const paperBuffers = new Map();
      function paperBuffer(duration) {
        const slot = Math.max(1, Math.ceil(duration * 20));
        let variants = paperBuffers.get(slot);
        if (!variants || variants[0].sampleRate !== audioCtx.sampleRate) {
          const rate = audioCtx.sampleRate;
          const length = Math.floor(rate * (slot / 20));
          variants = [0, 1, 2].map(() => {
            const buffer = audioCtx.createBuffer(1, length, rate);
            const data = buffer.getChannelData(0);
            const grains = Math.max(6, Math.round((slot / 20) * 300));
            for (let g = 0; g < grains; g++) {
              // Position tirée au hasard : une répartition régulière
              // s'entendrait comme un bourdonnement à la fréquence de la grille.
              const start = Math.floor(Math.random() * length);
              const grainLength = Math.floor(rate * (.0006 + Math.random() * .0035));
              // Exposant > 1 : beaucoup de petits craquements, peu de gros.
              const amplitude = Math.pow(Math.random(), 1.7);
              for (let i = 0; i < grainLength && start + i < length; i++) {
                data[start + i] += (Math.random() * 2 - 1) * amplitude * (1 - i / grainLength);
              }
            }
            return buffer;
          });
          paperBuffers.set(slot, variants);
        }
        return variants[Math.floor(Math.random() * variants.length)];
      }

      function sfxNoise({
        duration = .2, gain = .3, from = 900, to = null, q = 1, type = "bandpass",
        attack = .004, delay = 0, baseDelay = 0, pan, reverb = .16, texture = "blanc"
      } = {}) {
        if (!sfxGraphReady() || !sfxVoiceAvailable()) return;
        const now = audioCtx.currentTime + baseDelay + delay;

        const source = audioCtx.createBufferSource();
        source.buffer = texture === "papier" ? paperBuffer(duration) : noiseBuffer(duration);

        const filter = audioCtx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(Math.max(20, from), now);
        // Le balayage du filtre est ce qui transforme un souffle plat en
        // matière : montant il ouvre, descendant il s'enfonce.
        if (to !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);

        const level = audioCtx.createGain();
        level.gain.setValueAtTime(.0001, now);
        level.gain.exponentialRampToValueAtTime(Math.max(gain, .001), now + attack);
        level.gain.exponentialRampToValueAtTime(.0001, now + duration);

        source.connect(filter);
        filter.connect(level);
        sfxRoute(source, level, [source, filter, level], { pan, reverb }, delay + duration);
        source.start(now);
        source.stop(now + duration + .02);
      }

      function sfxSweep({
        fromHz = 200, toHz = 60, duration = .3, gain = .3, type = "sine",
        attack = .006, delay = 0, baseDelay = 0, pan, reverb = .16, curve = "exp"
      } = {}) {
        if (!sfxGraphReady() || !sfxVoiceAvailable()) return;
        const now = audioCtx.currentTime + baseDelay + delay;

        const osc = audioCtx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(20, fromHz), now);
        if (curve === "lin") osc.frequency.linearRampToValueAtTime(Math.max(20, toHz), now + duration);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), now + duration);
        // Léger désaccord par déclenchement : deux déplacements de suite ne
        // sonnent plus exactement pareil.
        osc.detune.value = (Math.random() * 2 - 1) * 12;

        const level = audioCtx.createGain();
        level.gain.setValueAtTime(.0001, now);
        level.gain.exponentialRampToValueAtTime(Math.max(gain, .001), now + attack);
        level.gain.exponentialRampToValueAtTime(.0001, now + duration);

        osc.connect(level);
        sfxRoute(osc, level, [osc, level], { pan, reverb }, delay + duration);
        osc.start(now);
        osc.stop(now + duration + .03);
      }

      /* Chaque famille d'action a sa propre signature de partiels. C'est le
         point qui manquait le plus : magie, invocation, couronne et fin de tour
         partageaient un seul timbre de cloche et ne se distinguaient que par la
         hauteur — donc pas du tout, une fois la partie lancée. Le timbre est ce
         qui permet de reconnaître une action sans regarder l'écran ; la hauteur
         ne fait que la nuancer. */
      const BELL_PROFILES = {
        // Magie : rapports franchement non entiers. Ça scintille, c'est instable.
        magie: [1, 2.76, 5.4, 8.93],
        // Invocation : harmoniques purs. Un gardien qui se matérialise est
        // solide et présent — contraste volontaire avec la magie.
        invocation: [1, 2, 3, 4],
        // Cérémonie : quasi harmonique, avec la tierce. Chaud et consonant.
        ceremonie: [1, 2, 2.99, 4.02],
        // Gong de fin de tour : deux partiels graves, très feutré.
        gong: [1, 2.4, 3.9],
        // Pierre : partiels bas et resserrés, sans brillance. Ce n'est pas du
        // métal — la roche résonne, elle ne chante pas.
        pierre: [1, 2.1, 3.32],
        // Acier : partiels serrés dans l'aigu et décroissance rapide — le cri
        // court d'une lame sur un bouclier, jamais le chant d'une cloche.
        acier: [1, 2.39, 3.68, 5.94]
      };

      /* Apparition d'un gardien : « physique » est la piste retenue après
         écoute comparée. Les deux autres ("souffle", "lumiere") restent
         implémentées et s'auditionnent par
         ILYOS_TEST.sfx("spawn", "souffle") — changer cette constante suffit à
         basculer le jeu sur l'une d'elles. */
      const SPAWN_VARIANT = "physique";
      const BELL_RATIOS = BELL_PROFILES.magie;

      function sfxBell({
        hz = 660, duration = .9, gain = .3, delay = 0, baseDelay = 0, pan, reverb = .5, ratios = BELL_RATIOS
      } = {}) {
        if (!sfxGraphReady() || !sfxVoiceAvailable()) return;
        const now = audioCtx.currentTime + baseDelay + delay;

        const level = audioCtx.createGain();
        level.gain.setValueAtTime(.0001, now);
        level.gain.exponentialRampToValueAtTime(Math.max(gain, .001), now + .006);
        level.gain.exponentialRampToValueAtTime(.0001, now + duration);

        const nodes = [];
        let first = null;
        ratios.forEach((ratio, index) => {
          const osc = audioCtx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = hz * ratio;
          const partial = audioCtx.createGain();
          // Les partiels aigus sont plus discrets, comme sur un vrai métal.
          partial.gain.value = 1 / (1 + index * 2.2);
          osc.connect(partial);
          partial.connect(level);
          osc.start(now);
          osc.stop(now + duration + .03);
          if (!first) first = osc;
          nodes.push(osc, partial);
        });

        sfxRoute(first, level, [...nodes, level], { pan, reverb }, delay + duration);
      }

      /* Position stéréo dérivée de la colonne jouée : une poussée à gauche du
         plateau s'entend à gauche. Volontairement modérée (±0,6) pour rester
         confortable au casque. */
      function panForCell(c) {
        if (!Number.isFinite(c)) return undefined;
        return Math.max(-1, Math.min(1, ((c - (GRID - 1) / 2) / ((GRID - 1) / 2)) * .6));
      }

      function playSfx(type, options = {}) {
        if (!ambientEnabled) return;
        const pan = panForCell(options.c);
        const at = {};
        if (Number.isFinite(pan)) at.pan = pan;
        // baseDelay décale tout le son sans toucher aux délais internes qui
        // articulent ses couches (transitoire, corps, queue).
        if (Number.isFinite(options.delay) && options.delay > 0) at.baseDelay = options.delay;

        switch (type) {
          case "card":
            // Papier : un frottement bref et haut, plus un clic très court.
            sfxNoise({ ...at, duration: .085, gain: .15, from: 3600, to: 1100, q: .7, type: "highpass", reverb: .06 });
            sfxSweep({ ...at, fromHz: 1750, toHz: 880, duration: .045, gain: .07, type: "triangle", reverb: .05 });
            break;

          case "island":
            /* Verrouillage : une pièce qui se cale dans son logement.
               Rien ne tombe dans ILYOS — les îles flottent — donc ni impact de
               carrière ni grave profond : les deux versions précédentes
               supposaient une gravité que la fiction du jeu n'a pas. Ici un
               claquement tactile, un calage de quelques millimètres, et une
               courte résonance de pierre. Volontairement bref : l'action
               revient à chaque tour. */
            sfxNoise({ ...at, duration: .045, gain: .34, from: 2200, to: 1100, q: 2.6, reverb: .08 });
            sfxSweep({ ...at, fromHz: 880, toHz: 560, duration: .035, gain: .2, type: "triangle", reverb: .06 });
            sfxSweep({ ...at, fromHz: 280, toHz: 132, duration: .14, gain: .38, delay: .045, reverb: .16 });
            sfxNoise({ ...at, duration: .1, gain: .16, from: 900, to: 380, q: 1.2, type: "lowpass", delay: .045, reverb: .18 });
            sfxBell({ ...at, hz: 130.81, duration: .38, gain: .16, delay: .07, reverb: .3, ratios: BELL_PROFILES.pierre });
            break;

          case "spawn":
            /* Trois pistes coexistent, le choix se fait à l'oreille. Voir
               SPAWN_VARIANT pour figer celle qui sera jouée en partie. */
            if ((options.variant || SPAWN_VARIANT) === "souffle") {
              // Une inspiration qui se referme sur une seule note chaude :
              // une présence qui s'installe, pas un carillon.
              sfxNoise({ ...at, duration: .32, gain: .2, from: 260, to: 1500, q: 1.5, attack: .2, reverb: .5 });
              sfxBell({ ...at, hz: 146.83, duration: 1.2, gain: .2, delay: .27, reverb: .55, ratios: BELL_PROFILES.invocation });
              sfxSweep({ ...at, fromHz: 73.42, toHz: 146.83, duration: .34, gain: .18, type: "triangle", delay: .27, reverb: .35 });
            } else if ((options.variant || SPAWN_VARIANT) === "lumiere") {
              // La piste magique, assumée franchement cette fois : montée
              // scintillante et accord qui s'ouvre pour de bon.
              sfxNoise({ ...at, duration: .36, gain: .23, from: 400, to: 5200, q: 1.8, attack: .24, reverb: .7 });
              [523.25, 783.99, 1046.5, 1567.98].forEach((hz, index) =>
                sfxBell({ ...at, hz, duration: 1.3 - index * .18, gain: .146 - index * .023, delay: .28 + index * .06, reverb: .85, ratios: BELL_PROFILES.magie }));
              sfxNoise({ ...at, duration: .18, gain: .133, from: 6800, to: 3200, q: .8, type: "highpass", delay: .28, reverb: .8 });
            } else {
              /* Arrivée physique — variante retenue. Resserrée : le cliquetis
                 tenait sur 85 ms et la résonance traînait jusqu'à 650 ms, ce
                 qui étirait l'apparition bien au-delà de ce que montre
                 l'écran. Ramenée à ~340 ms au total. */
              [0, .028, .052].forEach((delay, index) =>
                sfxNoise({ ...at, duration: .04, gain: .18 - index * .036, from: 3400 - index * 500, to: 1500, q: 1.8, type: "highpass", delay, reverb: .18 }));
              sfxNoise({ ...at, duration: .07, gain: .27, from: 1400, to: 480, q: 1.2, delay: .085, reverb: .15 });
              sfxSweep({ ...at, fromHz: 240, toHz: 96, duration: .15, gain: .30, type: "triangle", delay: .085, reverb: .16 });
              sfxBell({ ...at, hz: 196, duration: .26, gain: .107, delay: .1, reverb: .22, ratios: BELL_PROFILES.pierre });
            }
            break;

          case "move": {
            // Pas sur la pierre. Volontairement en retrait : c'est le son le
            // plus rejoué de toute la partie, il ne doit jamais fatiguer.
            // Le corps grave qu'il avait a été retiré : il empiétait sur celui
            // de la poussée, et c'est justement ce grave qui doit signer une
            // poussée. Le déplacement ne garde qu'un appui bref et mat.
            //
            // Alternance gauche/droite : un pas sur deux est légèrement plus
            // grave et un peu moins appuyé. Sans elle, une marche de quatre
            // cases sonne comme un métronome (voir playMovePath).
            const otherFoot = ((options.step || 0) % 2) === 1;
            const tune = otherFoot ? .88 : 1;
            const level = otherFoot ? .86 : 1;
            sfxNoise({ ...at, duration: .07, gain: .41 * level, from: 1600 * tune, to: 560 * tune, q: 1.3, reverb: .12 });
            sfxNoise({ ...at, duration: .05, gain: .22 * level, from: 300 * tune, to: 180 * tune, q: .9, type: "lowpass", delay: .015, reverb: .08 });
            break;
          }

          case "push":
            /* L'ancien son de rotation, repris À L'IDENTIQUE : deux frottements
               de pierre qui se croisent, l'un montant et l'autre descendant,
               plus un corps grave qui donne la masse.

               Le second frottement reste à 160 ms. C'est délibéré : je l'avais
               ramené à 50 ms pour fondre les deux en une seule attaque, mais
               l'écoute a tranché — l'espacement d'origine sonne mieux ici, la
               poussée n'est pas un impact sec mais un raclement qui dure.
               Ne pas « corriger » à nouveau sans écouter. */
            sfxNoise({ ...at, duration: .34, gain: .55, from: 320, to: 1250, q: 2.2, attack: .06, reverb: .3 });
            sfxNoise({ ...at, duration: .24, gain: .34, from: 1400, to: 520, q: 1.6, delay: .16, reverb: .3 });
            sfxSweep({ ...at, fromHz: 128, toHz: 96, duration: .4, gain: .16, type: "triangle", reverb: .22 });
            break;

          case "rotate":
            /* L'ancienne lame de la poussée, reprise à l'identique. Un seul
               impact : le sifflement n'est qu'une amorce d'air qui se referme
               sur la frappe à 40 ms, sous le seuil (~40 ms) au-delà duquel
               l'oreille entendrait deux événements distincts. */
            sfxNoise({ ...at, duration: .055, gain: .2, from: 1400, to: 3200, q: 1.6, attack: .022, reverb: .1 });
            sfxNoise({ ...at, duration: .05, gain: .22, from: 5200, to: 1900, q: .5, type: "highpass", delay: .04, reverb: .12 });
            sfxBell({ ...at, hz: 1244.51, duration: .42, gain: .1, delay: .04, reverb: .38, ratios: BELL_PROFILES.acier });
            sfxSweep({ ...at, fromHz: 190, toHz: 42, duration: .34, gain: .26, delay: .04, reverb: .2 });
            break;

          case "magic":
            // Cristal instable : partiels inharmoniques égrenés en arpège
            // montant, largement réverbérés. Le scintillement est la signature.
            [392, 587.33, 880, 1174.66].forEach((hz, index) =>
              sfxBell({ ...at, hz, duration: 1.1 + index * .25, gain: .2 - index * .025, delay: index * .075, reverb: .85, ratios: BELL_PROFILES.magie }));
            // Glissando poussé plus haut : la magie est la plus brillante des
            // deux familles cristallines, la couronne la plus chaude.
            sfxSweep({ ...at, fromHz: 520, toHz: 2600, duration: .5, gain: .11, reverb: .8 });
            break;

          case "crown":
            // Événement majeur : la musique recule le temps qu'on l'entende.
            // Timbre chaud et consonant — l'opposé du scintillement de la magie.
            duckMusic(.5, 1.1);
            // Souffle volontairement bridé dans l'aigu : c'est lui qui tirait le
            // timbre de la couronne au-dessus de celui de la magie, alors que
            // la cérémonie doit être la plus chaude des deux.
            sfxNoise({ duration: .5, gain: .13, from: 420, to: 1900, q: 1.2, attack: .18, reverb: .7 });
            // Le profil « cérémonie » est quasi harmonique : ses partiels se
            // renforcent au lieu de se disperser comme ceux de la magie, donc
            // il faut moins de gain pour le même niveau perçu.
            [329.63, 493.88, 659.25].forEach((hz, index) =>
              sfxBell({ hz, duration: 1.8 - index * .25, gain: .19 - index * .03, delay: index * .1, reverb: .75, ratios: BELL_PROFILES.ceremonie }));
            break;

          case "turn":
            /* Page qui se tourne, en trois temps : la page est saisie et se
               soulève, elle bascule, elle retombe. Le grain vient du tampon
               (texture "papier") — la version précédente appliquait une
               enveloppe lisse à du bruit continu, ce qui donnait du vent.
               Toujours aucune hauteur définie : ce son revient à chaque tour et
               ne doit jamais pouvoir jurer avec la musique générative. */
            sfxNoise({ texture: "papier", duration: .1, gain: .53, from: 2200, to: 4200, q: .8, attack: .01, reverb: .03 });
            sfxNoise({ texture: "papier", duration: .19, gain: .60, from: 4600, to: 1300, q: .7, attack: .03, delay: .07, reverb: .04 });
            sfxNoise({ texture: "papier", duration: .12, gain: .35, from: 1500, to: 500, q: .9, type: "lowpass", delay: .21, reverb: .05 });
            break;

          case "victory":
            // Fanfare cérémonielle, même timbre que la couronne — c'est le même
            // monde narratif — mais quatre notes montantes et une queue longue.
            duckMusic(.35, 2.6);
            [329.63, 493.88, 659.25, 987.77].forEach((hz, index) =>
              sfxBell({ hz, duration: 2.4, gain: .23, delay: index * .15, reverb: .8, ratios: BELL_PROFILES.ceremonie }));
            sfxNoise({ duration: 1.2, gain: .1, from: 500, to: 4500, q: 1, attack: .5, reverb: .85 });
            break;

          case "crownTake":
            /* Ramasser la couronne. Volontairement LÉGER : le son "crown" est
               désormais réservé au point marqué, et l'entendre à chaque
               ramassage laissait croire qu'un point venait d'être inscrit.
               Deux notes qui montent, or et bref — un objet qu'on saisit. */
            sfxNoise({ ...at, duration: .12, gain: .12, from: 900, to: 3400, q: 1.4, attack: .04, reverb: .35 });
            [783.99, 1174.66].forEach((hz, index) =>
              sfxBell({ ...at, hz, duration: .5 - index * .12, gain: .12 - index * .03, delay: index * .07, reverb: .5, ratios: BELL_PROFILES.ceremonie }));
            break;

          case "crownDrop":
            /* Poser la couronne : le miroir exact du ramassage, en descendant.
               C'est cette symétrie qui rend les deux gestes lisibles sans
               regarder le plateau. */
            [1174.66, 783.99].forEach((hz, index) =>
              sfxBell({ ...at, hz, duration: .45 + index * .2, gain: .1 + index * .02, delay: index * .07, reverb: .45, ratios: BELL_PROFILES.ceremonie }));
            sfxNoise({ ...at, duration: .14, gain: .11, from: 2200, to: 700, q: 1.2, type: "lowpass", delay: .07, reverb: .3 });
            break;

          case "fall":
            // Chute : la hauteur s'effondre sur près d'une seconde, le vent
            // suit, la réverbe reste grande ouverte — le gardien part vers les
            // nuages, on doit l'entendre s'éloigner.
            duckMusic(.4, 1.1);
            // Deux glissandos descendants simultanés donnaient un sifflement
            // de dessin animé. Le tonal se réduit à un seul corps qui s'éloigne
            // et c'est l'air qui porte la chute : le gardien s'enfonce dans les
            // nuages, il ne glisse pas sur un toboggan.
            sfxNoise({ ...at, duration: 1.15, gain: .34, from: 2600, to: 240, q: .6, type: "lowpass", attack: .09, reverb: .8 });
            sfxSweep({ ...at, fromHz: 240, toHz: 46, duration: 1.05, gain: .22, type: "triangle", reverb: .75 });
            sfxNoise({ ...at, duration: .5, gain: .12, from: 900, to: 180, q: 2.4, delay: .5, reverb: .85 });
            break;

          case "error":
            // Impossibilité : sourd, bref, sans réverbe. Ce n'est pas une
            // punition, juste une porte fermée.
            sfxSweep({ fromHz: 165, toHz: 116, duration: .17, gain: .185, type: "square", reverb: .02 });
            sfxNoise({ duration: .1, gain: .085, from: 400, to: 160, q: 1.4, type: "lowpass", reverb: .04 });
            break;

          case "undo":
            // Retour en arrière : le souffle monte au lieu de descendre.
            sfxNoise({ duration: .2, gain: .14, from: 500, to: 2200, q: 1.6, attack: .07, reverb: .25 });
            sfxSweep({ fromHz: 620, toHz: 880, duration: .16, gain: .16, reverb: .2 });
            break;

          default:
            sfxBell({ hz: 520, duration: .35, gain: .2, reverb: .25 });
        }
      }

      /* Un déplacement traverse souvent plusieurs cases, et un seul bruit de pas
         pour un trajet de quatre cases sonnait faux — on voyait le gardien
         marcher sans l'entendre. Chaque case reçoit donc son pas.

         Les pas sont planifiés d'un coup, via le décalage `delay` des
         primitives, donc calés à l'échantillon près sur l'horloge audio plutôt
         qu'à la merci d'une file de setTimeout. La cadence reprend celle de
         l'animation (walkDuration dans ui.js : une amorce puis ~340 ms par
         case), et le panoramique suit la colonne réellement traversée : une
         marche vers la gauche du plateau se déplace vers la gauche. */
      function playMovePath(path, walkDuration) {
        if (!ambientEnabled) return;
        const steps = Array.isArray(path) ? path.filter(cell => Array.isArray(cell)) : [];
        if (!steps.length) { playSfx("move"); return; }

        // Amorce identique à celle absorbée par la séquence 3D avant que le
        // gardien ne se mette réellement en marche.
        const lead = .14;
        const span = Math.max(.12, (walkDuration || 0) / 1000 - lead);
        const perStep = Math.max(.1, span / steps.length);

        steps.forEach(([, c], index) => {
          playSfx("move", { c, step: index, delay: lead + index * perStep });
        });
      }

      function drawCards(player, count) {
        while (player.hand.length < count) {
          if (player.deck.length === 0) {
            if (player.discard.length === 0) break;
            player.deck = shuffle(
              player.discard.splice(0).map(card => ({
                ...card,
                used: false,
                fromStash: false
              }))
            );
          }

          const card = player.deck.pop();
          if (!card) break;
          card.used = false;
          card.fromStash = false;
          player.hand.push(card);
        }
      }

      function phaseInfo() {
        const amount = state.selectedActionType ? selectedBatchSize() : 1;
        const magicDegrees = ((state.magicPreviewSteps || 0) % 5 + 5) % 5 * 90;
        const player = currentPlayer();

        if (player?.isAI || state.aiThinking) {
          return { label: "Tour de l’adversaire", instruction: "L’adversaire joue. Vos commandes sont temporairement verrouillées." };
        }

        if (state.pendingDirectMoveTarget) {
          return { label: "Choisir le gardien", instruction: "Cliquez l’un des gardiens éclairés pour rejoindre le sanctuaire." };
        }

        switch (state.phase) {
          case "SETUP_SELECT":
            return { label: "Choisir le setup", instruction: "Sélectionnez la configuration du Duel symétrique." };
          case "CHOOSE_ISLAND_SHAPE":
            return { label: "Île obligatoire", instruction: "Prochain clic : choisissez une forme dans le panneau de gauche." };
          case "PLACE_ISLAND":
            return { label: "Poser l’île", instruction: "Prochain clic : une zone verte du plateau." };
          case "PLACE_SPAWN":
            return { label: "Invocation obligatoire", instruction: "Prochain clic : une case libre de la nouvelle île." };
          case "DROP_TREASURE":
            return { label: "Transmettre ou poser", instruction: "Prochain clic : un allié ou une case libre adjacente." };
          case "PICKUP_CROWN":
            return { label: "Récupérer la couronne", instruction: "Prochain clic : un de vos gardiens adjacents." };
          case "SMART_CHAR":
            return { label: "Gardien sélectionné", instruction: "Prochain clic : une destination éclairée ou une cible adjacente." };
          case "ACTION_SELECT":
            return state.islandPlacedThisTurn
              ? { label: "Choisir une action", instruction: "Choisissez une action ou cliquez directement une cible valide." }
              : { label: "Île obligatoire", instruction: "Commencez par choisir une forme d’île. Vous pourrez agir avant ou après sa pose." };
          case "ACTION":
            if (state.selectedActionType === "MOVE") {
              return state.selectedCharId
                ? { label: `Déplacement 1 à ${amount}`, instruction: "Prochain clic : une destination éclairée." }
                : { label: `Déplacement 1 à ${amount}`, instruction: "Prochain clic : un de vos gardiens." };
            }
            if (state.selectedActionType === "PUSH") {
              if (state.pushOptions?.length) {
                const hovered = state.pushOptions.find(option => option.id === state.pushHoverOptionId);
                return hovered
                  ? { label: `Poussée · Force ${hovered.force}`, instruction: hovered.fell ? "Prochain clic : ☠ pour confirmer la chute." : "Prochain clic : la destination orange choisie." }
                  : { label: "Choisir la poussée", instruction: "Prochain clic : une destination orange ou ☠." };
              }
              return state.selectedCharId
                ? { label: `Poussée ×${amount}`, instruction: "Prochain clic : une cible adjacente éclairée." }
                : { label: `Poussée ×${amount}`, instruction: "Prochain clic : votre gardien pousseur." };
            }
            return state.selectedIslandId
              ? { label: `Magie ${magicDegrees ? magicDegrees + "°" : ""}`.trim(), instruction: magicDegrees ? "Prochain clic : une case de l’aperçu pour valider." : "Tournez l’île avec ↺, ↻ ou la molette." }
              : { label: "Magie", instruction: "Prochain clic : une case pivot sur l’île à tourner." };
          default:
            return { label: "", instruction: "" };
        }
      }

      function turnContextInfo() {
        const amount = state.selectedActionType ? selectedBatchSize() : 1;
        const action = state.selectedActionType ? ACTIONS[state.selectedActionType] : null;
        const player = currentPlayer();

        if (player?.isAI || state.aiThinking) {
          return { kind: "wait", kicker: "TOUR DE L’ADVERSAIRE", title: `${player?.icon || ""} ${player?.name || "Ordinateur"}`.trim(), next: "L’adversaire prépare son action." };
        }

        if (state.pendingDirectMoveTarget) {
          return { kind: "move", kicker: "CHOISISSEZ LE GARDIEN", title: "Accès au sanctuaire", next: "Cliquez l’un des gardiens éclairés." };
        }

        if (!state.islandPlacedThisTurn && state.phase === "ACTION_SELECT") {
          return { kind: "build", kicker: "ÉTAPE OBLIGATOIRE", title: "Poser une île", next: "Choisissez une forme d’île." };
        }
        if (state.phase === "CHOOSE_ISLAND_SHAPE") {
          return { kind: "build", kicker: "ÉTAPE OBLIGATOIRE", title: "Choisir une île", next: "Choisissez une forme d’île." };
        }
        if (state.phase === "PLACE_ISLAND") {
          const degrees = ((state.placementRotationSteps || 0) % 4) * 90;
          return { kind: "build", kicker: "ÎLE À POSER", title: `Rotation : ${degrees}°`, next: "Q/E pour tourner, clic pour poser." };
        }
        if (state.phase === "PLACE_SPAWN") {
          return { kind: "build", kicker: "INVOCATION", title: "Choisir une case", next: "Cliquez une case en surbrillance." };
        }
        if (state.phase === "DROP_TREASURE") {
          return { kind: "crown", kicker: "COURONNE", title: "Transmettre ou poser", next: "Cliquez un allié ou une case libre adjacente." };
        }
        if (state.phase === "PICKUP_CROWN") {
          return { kind: "crown", kicker: "COURONNE", title: "Choisir le porteur", next: "Cliquez un de vos gardiens adjacents." };
        }
        if (state.phase === "SMART_CHAR") {
          return { kind: "move", kicker: "GARDIEN SÉLECTIONNÉ", title: "Choisir son action", next: "Cliquez une destination ou une cible éclairée." };
        }
        if (state.phase === "ACTION" && action) {
          if (state.selectedActionType === "MOVE") {
            return { kind: "move", kicker: "ACTION ACTIVE", title: `${action.icon} ${action.name} · jusqu’à ${amount}`, next: state.selectedCharId ? "Cliquez une destination éclairée." : "Cliquez un de vos gardiens." };
          }
          if (state.selectedActionType === "PUSH") {
            if (state.pushOptions?.length) {
              const hovered = state.pushOptions.find(option => option.id === state.pushHoverOptionId);
              return hovered
                ? { kind: "push", kicker: hovered.fell ? "☠ CHUTE" : "POUSSÉE", title: `Force ${hovered.force}`, next: "Cliquez pour exécuter ce résultat." }
                : { kind: "push", kicker: "ACTION ACTIVE", title: "Choisir un résultat", next: "Cliquez une destination orange ou ☠." };
            }
            return { kind: "push", kicker: "ACTION ACTIVE", title: `${action.icon} ${action.name} · force ${amount}`, next: state.selectedCharId ? "Cliquez une cible adjacente éclairée." : "Cliquez votre gardien pousseur." };
          }
          const degrees = ((state.magicPreviewSteps || 0) % 5 + 5) % 5 * 90;
          return { kind: "magic", kicker: "ACTION ACTIVE", title: `${action.icon} ${action.name}${degrees ? ` · ${degrees}°` : ""}`, next: state.selectedIslandId ? (degrees ? "Cliquez l’aperçu pour valider." : "Tournez avec ↺, ↻ ou la molette.") : "Cliquez une case pivot sur une île." };
        }
        if (state.islandPlacedThisTurn) {
          return { kind: "end", kicker: "À VOUS DE JOUER", title: "Choisir une action ou terminer", next: "Choisissez une action ou terminez votre tour." };
        }
        return { kind: "build", kicker: "À FAIRE", title: "Poser une île", next: "Choisissez une forme d’île." };
      }

      function renderTurnContext() {
        const root = document.getElementById("turnContext");
        if (!root || !state) return;
        const info = turnContextInfo();
        root.className = `turn-context context-${info.kind}`;
        document.getElementById("turnContextKicker").textContent = info.kicker;
        document.getElementById("turnContextTitle").textContent = info.title;
        document.getElementById("turnContextNext").textContent = info.next;
      }


      function scheduleBoardRender() {
        if (document.body.dataset.visualMode === "alternative") return;
        if (boardRenderFrame || !state) return;
        boardRenderFrame = requestAnimationFrame(() => {
          boardRenderFrame = 0;
          if (state) renderBoard();
        });
      }

      function updateCrownStatus() {
        if (!els.crownStatus || !state) return;
        const crowns = activeArtifacts();
        const carried = crowns.filter(artifact => artifact.carrierId).length;
        const loose = crowns.length - carried;
        const readyOwnerFor = artifact => {
          const carrier = characterById(artifact.carrierId);
          if (carrier) {
            const owner = state.players[carrier.player];
            return owner && isCrownValidationCell(owner, carrier.r, carrier.c)
              ? owner
              : null;
          }
          if (!Number.isFinite(artifact.r) || !Number.isFinite(artifact.c)) return null;
          return state.players.find(owner => isCrownValidationCell(owner, artifact.r, artifact.c)) || null;
        };
        const readyCrowns = crowns
          .map(artifact => ({ artifact, owner: readyOwnerFor(artifact) }))
          .filter(entry => entry.owner);
        const ready = readyCrowns.length;

        els.crownStatus.classList.toggle("crown-ready", ready > 0);
        els.crownStatus.textContent = ready > 0
          ? `${ready} à valider · ${readyCrowns[0].owner.name}`
          : `${loose} libre${loose > 1 ? "s" : ""} · ${carried} portée${carried > 1 ? "s" : ""}`;
        els.crownStatus.title = crowns
          .map((artifact, index) => {
            const carrier = characterById(artifact.carrierId);
            const readyOwner = readyOwnerFor(artifact);
            if (readyOwner) {
              return `Couronne ${index + 1} : village de ${readyOwner.name} — validation au début de son prochain tour`;
            }
            return carrier
              ? `Couronne ${index + 1} : ${state.players[carrier.player].name}`
              : `Couronne ${index + 1} : libre`;
          })
          .join("\n");
      }

      function renderAll() {
        ensureArtifactState();
        renderHeader();
        renderTurnContext();
        renderBoard();
        renderHand();
        renderScores();
        renderDeckDisplay();
        renderStats();
        renderIslandSelector();
        renderControls();
        renderUnitCard();
        updateCrownStatus();
        updateOnlineBadge();
        renderHudV2();
        // V78 (passe fluidité) : remplace les MutationObserver globaux sur
        // #gameScreen de js/archipelago-behaviour.js et js/immersion-fluidity.js
        // (scripts séparés, hors de cette IIFE) — chacun garde sa propre garde
        // interne (contexte/joueur+phase inchangés ⇒ no-op), donc les appeler
        // à chaque renderAll() ne fait aucun travail DOM superflu.
        window.ILYOS_ARCHIPELAGO?.updateVisualState?.();
        window.ILYOS_IMMERSION?.monitorTurn?.();
        scheduleOnlineSync();
        scheduleLocalSave();
      }

      // HUD V2 (Prompt 2/3) : lecture seule du state existant, aucune boucle
      // propre — appele depuis renderAll() (deja declenche par chaque
      // changement d'etat, pas de rAF/polling/MutationObserver ajoute ici).
      // #turnLabel/#turnTimer/#cancelCardBtn/#endTurnBtn/#islandSelector sont
      // les memes elements que l'ancien HUD (juste reancres dans index.html) :
      // leur logique (renderHeader/updateTurnTimerDisplay/renderControls/
      // renderIslandSelector/selectIslandShape) reste inchangee. Les boutons
      // DÉPLACER/POUSSER/MAGIE appellent exactement selectActionBatch(), comme
      // les boutons de l'ancien panneau ACTIONS — aucun second systeme d'action.
      // Iconographie HUD V2 : traits SVG (stroke:currentColor), meme famille que
      // la silhouette de portrait (fillPortrait ci-dessus) — plus d'emojis
      // disparates (🏝👢💥✦🃏👑) dont le rendu/poids varie selon police/OS.
      const HUD_V2_ICONS = {
        DECK: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"7\" width=\"14\" height=\"17\" rx=\"2\"/><rect x=\"7\" y=\"3\" width=\"14\" height=\"17\" rx=\"2\"/></svg>",
        ISLAND: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M2.5 15.5L12 11l9.5 4.5L12 20l-9.5-4.5z\"/><path d=\"M8.6 15.2L12 8l3.4 7.2\"/></svg>",
        MOVE: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3v18M3 12h18M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6\"/></svg>",
        PUSH: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"2.1\"/><path d=\"M12 7.2V2.4M12 7.2l-1.8 1.8M12 7.2l1.8 1.8\"/><path d=\"M12 16.8v4.8M12 16.8l-1.8-1.8M12 16.8l1.8-1.8\"/><path d=\"M16.8 12h4.8M16.8 12l-1.8-1.8M16.8 12l-1.8 1.8\"/><path d=\"M7.2 12H2.4M7.2 12l1.8-1.8M7.2 12l1.8 1.8\"/></svg>",
        MAGIC: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M20.5 12A8.5 8.5 0 1 1 17 5.6\"/><path d=\"M20.5 5.6v4.2h-4.2\"/><path d=\"M11 2.8l1.35 4.05L16.4 8.2l-3.65 2.15L11 14.4l-1.75-4.05L5.6 8.2l3.65-1.35L11 2.8z\"/></svg>",
        CROWN: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 18.5h16l1.1-9.6-5.3 3.3L12 5.8 8.2 12.2 2.9 8.9 4 18.5z\"/></svg>"
      };

      // Sélecteur de Force manuel HUD V2 : mêmes deux chemins que renderHand()
      // (bouton +/-), même fonction de fond (setPushForceChoice()/
      // state.smartPushForce) — seule la source de rendu change.
      function hudV2PushForceStep(delta) {
        if (!state) return;
        const classicPushActive = state.phase === "ACTION" && state.selectedActionType === "PUSH" && !state.pushOptions?.length;
        const smartPushHovered = state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH";
        if (!classicPushActive && !smartPushHovered) return;
        const maxForce = Math.max(1, availableActionCount("PUSH"));
        if (smartPushHovered) {
          const preview = getPushHoverPreview();
          const minForce = Math.max(1, preview?.requiredForce || 1);
          const current = Math.max(minForce, Math.min(maxForce, preview?.force || minForce));
          state.smartPushForce = Math.max(minForce, Math.min(maxForce, current + delta));
          refreshKayKitHoverPreviews();
          scheduleBoardRender();
        } else {
          const current = Math.max(1, Math.min(state.pushForceChoice || 1, maxForce));
          setPushForceChoice(current + delta, { notify: true });
        }
        renderHudV2();
        renderHand();
      }

      function renderHudV2() {
        if (!state || !els.gameScreen) return;
        const hudTop = document.getElementById("hudV2Top");
        if (!hudTop) return;

        const crownPips = score => {
          const filled = Math.max(0, Math.min(3, score || 0));
          let out = "";
          for (let i = 0; i < 3; i++) {
            out += `<span class="hud-v2-crown-icon${i < filled ? " is-filled" : ""}">${HUD_V2_ICONS.CROWN}</span>`;
          }
          return out;
        };

        const active = currentPlayer();

        // Portraits/noms fixes gauche=joueur[0] / droite=joueur[1] (jamais
        // permutés selon le tour, cf. "le halo passe d'un portrait à
        // l'autre" — sinon les noms sauteraient de côté à chaque tour).
        // 4 joueurs/2v2 : toujours aucun champ d'équipe fiable identifié
        // dans state (voir startLocalGame(), core.js) — seuls les deux
        // premiers joueurs sont représentés, gap déjà documenté.
        const leftPlayer = state.players[0] || null;
        const rightPlayer = state.players.length > 1 ? state.players[1] : null;

        // Portrait : aucun asset 2D circulaire trouvé dans assets/kaykit
        // (uniquement des modèles .glb + leurs atlas de texture, inexploitables
        // tels quels) — silhouette neutre temporaire (pas un emoji) le temps
        // que de vrais portraits soient fournis. Un seul <svg> statique,
        // injecté une fois par portrait (idempotent : ne réinjecte pas si
        // déjà présent), teinté par la couleur du joueur via le fond du
        // cercle — aucune scène 3D, aucun coût de rendu supplémentaire.
        const silhouetteSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 20.5c0-4.7 3.6-8.5 8-8.5s8 3.8 8 8.5"/></svg>';
        const fillPortrait = (prefix, p, isActiveTurn) => {
          const portraitEl = document.getElementById(`hudV2${prefix}Portrait`);
          const nameEl = document.getElementById(`hudV2${prefix}Name`);
          const scoreEl = document.getElementById(`hudV2${prefix}Score`);
          if (portraitEl) {
            if (p) {
              portraitEl.classList.remove("hidden");
              portraitEl.style.setProperty("--hud-v2-portrait-color", p.color);
              const iconEl = portraitEl.querySelector(".hud-v2-portrait-icon");
              if (iconEl && !iconEl.dataset.filled) {
                iconEl.innerHTML = silhouetteSvg;
                iconEl.dataset.filled = "1";
              }
              portraitEl.classList.toggle("hud-v2-portrait-active", !!isActiveTurn);
            } else {
              portraitEl.classList.add("hidden");
            }
          }
          if (nameEl) {
            nameEl.textContent = p ? (p.isAI ? "CPU" : p.name) : "";
            nameEl.classList.toggle("hud-v2-player-name-active", !!isActiveTurn);
          }
          if (scoreEl) scoreEl.innerHTML = p ? crownPips(p.score) : "";
        };
        fillPortrait("Active", leftPlayer, leftPlayer && state.currentPlayer === leftPlayer.id);
        fillPortrait("Opponent", rightPlayer, rightPlayer && state.currentPlayer === rightPlayer.id);

        // --- ÎLE : pill/bouton, disparaît une fois l'île posée ce tour ---
        const islandStatusEl = document.getElementById("hudV2IslandStatus");
        const islandDrawer = document.getElementById("hudV2IslandDrawer");
        if (islandStatusEl) {
          islandStatusEl.classList.toggle("hidden", !!state.islandPlacedThisTurn);
          islandStatusEl.innerHTML = `<span class="hud-v2-pill-icon" aria-hidden="true">${HUD_V2_ICONS.ISLAND}</span><span class="hud-v2-pill-word">ÎLE</span>`;
        }
        if (state.islandPlacedThisTurn && islandDrawer && !islandDrawer.classList.contains("hidden")) {
          closeHudV2Drawer();
        }

        // --- DÉPLACER / POUSSER / MAGIE : vrais boutons, meme etat que renderHand() ---
        // Libellés fixes (verbe, pas le nom de la carte : "Déplacement" donnerait
        // "DÉPLACEMENT ×N" au lieu de "DÉPLACER ×N" attendu par la maquette).
        // Icône dans son propre span, visuellement plus grande que le texte
        // (hiérarchie demandée) — le mot se masque sous 480px, le compte reste.
        const pillLabels = { MOVE: "DÉPLACER", PUSH: "POUSSER", MAGIC: "MAGIE" };
        const pillIcons = { MOVE: HUD_V2_ICONS.MOVE, PUSH: HUD_V2_ICONS.PUSH, MAGIC: HUD_V2_ICONS.MAGIC };
        const smartSelected = state.phase === "SMART_CHAR" && !!state.selectedCharId;
        [["MOVE", "hudV2MoveCount"], ["PUSH", "hudV2PushCount"], ["MAGIC", "hudV2MagicCount"]].forEach(([type, id]) => {
          const btn = document.getElementById(id);
          if (!btn) return;
          const action = ACTIONS[type];
          const remaining = availableActionCount(type, active);
          const reason = actionUnavailableReason(type);
          const disabled = remaining <= 0 || !!reason;
          const isActive = (state.phase === "ACTION" && state.selectedActionType === type)
            || (smartSelected && (type === "MOVE" || type === "PUSH"));
          const label = `${pillLabels[type]} ×${remaining}`;
          btn.innerHTML = `<span class="hud-v2-pill-icon" aria-hidden="true">${pillIcons[type]}</span>` +
            `<span class="hud-v2-pill-word">${pillLabels[type]}</span>` +
            `<span class="hud-v2-pill-count">×${remaining}</span>`;
          // complete-polish.js fige aria-label sur le premier textContent vu —
          // on le retient synchronisé nous-mêmes à chaque rendu.
          btn.setAttribute("aria-label", label);
          btn.disabled = disabled;
          btn.classList.toggle("hud-v2-pill-active", isActive);
          btn.title = disabled ? reason : action.name;
        });

        // --- Rangée contextuelle Magie (rotation en cours) ---
        const magicRow = document.getElementById("hudV2MagicRow");
        if (magicRow) {
          const rotating = state.phase === "ACTION" && state.selectedActionType === "MAGIC";
          magicRow.classList.toggle("hidden", !rotating);
        }
        const magicDissolveBtn = document.getElementById("hudV2MagicDissolve");
        if (magicDissolveBtn) {
          magicDissolveBtn.classList.toggle("hidden", !canDissolveSelectedIsland());
        }

        // --- Sélecteur de Force manuel (repli) — équivalent HUD V2 du bloc
        // v60-context-options de renderHand() (élément #hand invisible ici,
        // voir index.html). Même calcul min/max/force que renderHand(), même
        // source (getPushHoverPreview()/state.pushForceChoice), rien de neuf.
        // Masqué pendant le flux unifié cible→destination, qui choisit
        // automatiquement la Force via la destination cliquée.
        const pushForceRow = document.getElementById("hudV2PushForceRow");
        if (pushForceRow) {
          const classicPushActive = state.phase === "ACTION" && state.selectedActionType === "PUSH" && !state.pushOptions?.length;
          const smartPushHovered = state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH";
          const maxForce = Math.max(1, availableActionCount("PUSH"));
          let force = null, minForce = 1, hint = "";
          if (smartPushHovered) {
            const preview = getPushHoverPreview();
            if (preview) {
              minForce = Math.max(1, preview.requiredForce || 1);
              force = Math.max(minForce, Math.min(maxForce, preview.force || minForce));
              hint = preview.fell ? "☠ Chute hors du plateau" : `Minimum ${minForce}`;
            }
          } else if (classicPushActive) {
            force = Math.max(1, Math.min(state.pushForceChoice || 1, maxForce));
            hint = "Puis cliquez la cible adjacente";
          }
          pushForceRow.classList.toggle("hidden", force === null);
          if (force !== null) {
            document.getElementById("hudV2PushForceValue").textContent = force;
            document.getElementById("hudV2PushForceHint").textContent = hint;
            const minusBtn = document.getElementById("hudV2PushForceMinus");
            const plusBtn = document.getElementById("hudV2PushForcePlus");
            if (minusBtn) minusBtn.disabled = force <= minForce;
            if (plusBtn) plusBtn.disabled = force >= maxForce;
          }
        }

        // --- Mini-fiche gardien : usage réduit — uniquement quand elle
        // apporte une info réellement utile (couronne portée). Le halo 3D
        // suffit déjà à indiquer une simple sélection ; pas de fiche
        // systématique pour ça (évite de recréer un panneau permanent).
        const unitSlot = document.getElementById("hudV2UnitCardSlot");
        if (unitSlot) {
          const ch = characterById(state.selectedCharId);
          const carriesCrown = ch && characterCarriesCrown(ch.id);
          if (ch && carriesCrown) {
            const p = state.players[ch.player];
            unitSlot.classList.remove("hidden");
            unitSlot.innerHTML = `<span class="hud-v2-unit-icon">${p.icon}</span><span class="hud-v2-unit-crown hud-v2-crown-icon is-filled">${HUD_V2_ICONS.CROWN}</span>`;
          } else {
            unitSlot.classList.add("hidden");
            unitSlot.innerHTML = "";
          }
        }

        // --- Micro-instruction (une seule ligne, meme source que l'ancien panneau) ---
        const instructionEl = document.getElementById("hudV2Instruction");
        if (instructionEl) {
          // Flux direct POUSSER : indicateur de chute (☠ + coût) quand
          // l'option actuellement retenue (pusherId/force) est une chute —
          // même donnée que computePushOptionsForTarget(), rien de recalculé.
          const currentPushOption = state.pushOptions?.find(
            option => option.id === state.pushHoverOptionId
          );
          if (currentPushOption) {
            instructionEl.textContent = currentPushOption.fell
              ? `☠ Force ${state.selectedActionCount} — pousse hors du plateau.`
              : `Cliquez une destination éclairée · Force ${state.selectedActionCount}.`;
          } else {
            const info = turnContextInfo();
            instructionEl.textContent = info?.next || info?.title || "";
          }
        }

        // --- Deck (ex-"Main") : commande autonome, valeurs reelles ---
        const handCountEl = document.getElementById("hudV2HandCount");
        if (handCountEl) {
          const handLabel = `DECK ×${(active.hand || []).length}`;
          handCountEl.innerHTML = `<span class="hud-v2-pill-icon" aria-hidden="true">${HUD_V2_ICONS.DECK}</span><span class="hud-v2-pill-word">${handLabel}</span>`;
          handCountEl.setAttribute("aria-label", handLabel);
        }
        const popDeck = document.getElementById("hudV2HandPopoverDeck");
        const popHand = document.getElementById("hudV2HandPopoverHand");
        const popDiscard = document.getElementById("hudV2HandPopoverDiscard");
        if (popDeck) popDeck.textContent = (active.deck || []).length;
        if (popHand) popHand.textContent = (active.hand || []).length;
        if (popDiscard) popDiscard.textContent = (active.discard || []).length;

        // --- Séparateur "·" du timer : invisible si le chrono de tour est
        // désactivé (isTurnTimerEnabled(), même lecture que updateTurnTimerDisplay()).
        const timerDot = document.getElementById("hudV2TimerDot");
        if (timerDot) timerDot.classList.toggle("hidden", !isTurnTimerEnabled());

        // --- Infos techniques (menu ⚙) : reparente une seule fois les vrais
        // éléments .kaykit-status (js/game/kaykit3d.js) et .v69-quality-pill
        // (js/complete-polish.js) — même noeuds, même logique de mise à
        // jour, simplement retirés de l'interface normale. Idempotent (no-op
        // une fois déjà déplacés) : pas de nouvelle boucle, juste profité du
        // passage habituel de renderAll().
        const techSlot = document.getElementById("hudV2TechInfo");
        if (techSlot) {
          const kaykitStatus = document.querySelector(".kaykit-status");
          if (kaykitStatus && kaykitStatus.parentElement !== techSlot) techSlot.appendChild(kaykitStatus);
          const qualityPill = document.querySelector(".v69-quality-pill");
          if (qualityPill && qualityPill.parentElement !== techSlot) techSlot.appendChild(qualityPill);
        }
      }

      // Ferme tout popover/drawer HUD V2 ouvert (île, menu ⚙, main).
      function closeHudV2Drawer() {
        ["hudV2IslandDrawer", "hudV2GearPopover", "hudV2HandPopover"].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          el.classList.add("hidden");
          el.setAttribute("aria-hidden", "true");
        });
        document.getElementById("hudV2IslandStatus")?.setAttribute("aria-expanded", "false");
        document.getElementById("hudV2GearBtn")?.setAttribute("aria-expanded", "false");
        document.getElementById("hudV2HandCount")?.setAttribute("aria-expanded", "false");
      }

      function toggleHudV2Drawer(id, triggerId) {
        const el = document.getElementById(id);
        if (!el) return;
        const willOpen = el.classList.contains("hidden");
        closeHudV2Drawer();
        if (willOpen) {
          el.classList.remove("hidden");
          el.setAttribute("aria-hidden", "false");
          document.getElementById(triggerId)?.setAttribute("aria-expanded", "true");
        }
      }

      function renderHeader() {
        const p = currentPlayer();
        const info = phaseInfo();
        const previousPlayer = els.gameScreen.dataset.player;

        // HUD V2 (Prompt 3/3) : #activePortrait/#activeName/#phaseLabel/
        // #instruction/#stepIsland/#stepActions/#stepEnd ont été supprimés du
        // DOM (remplacés par #hudV2Top/#hudV2Instruction) — gardés en lecture
        // optionnelle ici pour ne rien casser si jamais réintroduits.
        if (els.activePortrait) { els.activePortrait.textContent = p.icon; els.activePortrait.style.color = p.color; }
        if (els.activeName) els.activeName.textContent = p.name;
        if (els.phaseLabel) els.phaseLabel.textContent = info.label;
        els.turnLabel.textContent = `Tour ${state.turn}${p.isAI ? ` · CPU ${AI_LEVELS[state.aiDifficulty || "normal"].label}` : ""}`;
        updateTurnTimerDisplay();
        updateOnlineBadge();
        if (els.instruction) els.instruction.textContent = info.instruction;
        document.documentElement.style.setProperty("--player-color", p.color);

        const islandPickPhase = !state.islandPlacedThisTurn;
        if (els.leftPanel) els.leftPanel.classList.toggle("choice-focus", islandPickPhase);
        els.gameScreen.classList.toggle("island-required", !state.islandPlacedThisTurn);

        if (previousPlayer !== String(p.id)) {
          els.gameScreen.dataset.player = String(p.id);
          els.gameScreen.classList.remove("player-switch");
          void els.gameScreen.offsetWidth;
          els.gameScreen.classList.add("player-switch");
          setTimeout(() => els.gameScreen.classList.remove("player-switch"), 720);
        }

        if (els.stepIsland && els.stepActions && els.stepEnd) {
          [els.stepIsland, els.stepActions, els.stepEnd].forEach(el => el.className = "");
          const placingIsland = state.phase === "CHOOSE_ISLAND_SHAPE" || state.phase === "PLACE_ISLAND" || state.phase === "PLACE_SPAWN";
          if (!state.islandPlacedThisTurn || placingIsland) {
            els.stepIsland.classList.add("active");
            if (!placingIsland) els.stepActions.classList.add("active");
          } else {
            els.stepIsland.classList.add("done");
            els.stepActions.classList.add("active");
            if (allCardsUsed()) {
              els.stepActions.className = "done";
              els.stepEnd.classList.add("active");
            }
          }
        }
      }

      function shapeMiniHTML(cells) {
        const norm = normalizeShape(cells);
        const rows = Math.max(...norm.map(([r]) => r)) + 1;
        const cols = Math.max(...norm.map(([, c]) => c)) + 1;
        const positions = new Set(norm.map(([r, c]) => key(r, c)));
        let html = `<span class="island-mini" style="--mini-rows:${rows};--mini-cols:${cols}">`;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (positions.has(key(r, c))) {
              html += `<i style="grid-row:${r + 1};grid-column:${c + 1}"></i>`;
            }
          }
        }
        return html + "</span>";
      }

      // Test : nombre d'îles d'une forme donnée déjà posées par ce
      // propriétaire (owner d'île = state.currentPlayer côté joueur humain)
      // sur toute la partie. shapeLimitPerOwner() renvoie 0 pour « illimité ».
      function shapeUsageCountForOwner(ownerId, shapeKey) {
        return state.islands.filter(island => island.owner === ownerId && island.shapeKey === shapeKey).length;
      }

      function shapeLimitReached(shapeKey) {
        const limite = shapeLimitPerOwner();
        if (!limite) return false;
        return shapeUsageCountForOwner(state.currentPlayer, shapeKey) >= limite;
      }

      function renderIslandSelector() {
        els.islandSelector.innerHTML = "";
        const available = !state.islandPlacedThisTurn && ["ACTION_SELECT", "CHOOSE_ISLAND_SHAPE", "PLACE_ISLAND"].includes(state.phase);
        const emphasize = !state.islandPlacedThisTurn;

        Object.entries(SHAPES).forEach(([shapeKey, shape]) => {
          const used = shapeUsageCountForOwner(state.currentPlayer, shapeKey);
          const maxedOut = shapeLimitReached(shapeKey);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "island-choice" +
            (state.selectedIslandShape === shapeKey ? " active" : "") +
            (emphasize ? " choice-ready" : "") +
            (maxedOut ? " choice-maxed" : "");
          button.disabled = !available || maxedOut;
          const flipBadge = shape.flippable
            ? `<span class="island-choice-flip" aria-hidden="true" title="Peut être retournée (miroir)">⇄</span>`
            : "";
          const limite = shapeLimitPerOwner();
          const limitBadge = limite
            ? `<span class="island-choice-limit"${maxedOut ? ' data-maxed="true"' : ""}>${used}/${limite}</span>`
            : "";
          button.innerHTML = `<span class="island-choice-preview">${shapeMiniHTML(shape.cells)}${flipBadge}</span><span class="island-choice-name">${shape.name}</span>${limitBadge}`;
          const limitSuffix = limite ? ` (${used}/${limite} posées)` : "";
          button.title = (shape.flippable ? `${shape.name} (peut être retournée en miroir)` : shape.name)
            + (maxedOut ? " — limite atteinte" : limitSuffix);
          button.setAttribute("aria-label", (shape.flippable ? `Choisir l’île ${shape.name}, peut être retournée en miroir` : `Choisir l’île ${shape.name}`) + limitSuffix);
          button.addEventListener("click", () => selectIslandShape(shapeKey));
          els.islandSelector.appendChild(button);
        });
      }

      function selectIslandShape(shapeKey) {
        if (!canLocalPlayerAct()) return;
        if (state.islandPlacedThisTurn) return;
        if (!["ACTION_SELECT", "CHOOSE_ISLAND_SHAPE", "PLACE_ISLAND"].includes(state.phase)) return;
        if (shapeLimitReached(shapeKey)) {
          showToast(`Limite atteinte : ${shapeLimitPerOwner()} île${shapeLimitPerOwner() > 1 ? "s" : ""} « ${SHAPES[shapeKey].name} » maximum.`);
          return;
        }
        state.selectedIslandShape = shapeKey;
        state.placementCells = cloneCells(SHAPES[shapeKey].cells);
        state.placementOriginIndex = 0;
        state.placementRotationSteps = 0;
        state.hoverAnchor = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.treasureDropFromId = null;
        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "PLACE_ISLAND";
        renderAll();
        // Le contexte de tour affiche déjà "Île à poser" et le ghost 3D suit la
        // souris : ce toast ne ferait que répéter la même information.
        playSfx("card");
      }

      function previewAbsoluteCells(anchorR, anchorC) {
        if (state.phase !== "PLACE_ISLAND" || !state.placementCells) return [];
        const origin = state.placementCells[state.placementOriginIndex] || state.placementCells[0] || [0, 0];
        return state.placementCells.map(([dr, dc]) => [anchorR + (dr - origin[0]), anchorC + (dc - origin[1])]);
      }

      function isValidPlacement(anchorR, anchorC) {
        const cells = previewAbsoluteCells(anchorR, anchorC);
        if (cells.length === 0) return false;

        // Une île peut être posée n'importe où :
        // elle doit seulement rester dans la grille et ne rien chevaucher.
        return cells.every(([r, c]) => inside(r, c) && !isLand(r, c));
      }

      function recomputeValidAnchors() {
        // V5 : aucune indication permanente. Seul l’aperçu sous la souris est coloré.
      }

      function previewClassForCell(r, c) {
        if (state.phase !== "PLACE_ISLAND" || !state.hoverAnchor) return "";
        const [ar, ac] = state.hoverAnchor;
        const cells = previewAbsoluteCells(ar, ac);
        if (!cells.some(([pr, pc]) => pr === r && pc === c)) return "";
        return isValidPlacement(ar, ac) ? "preview-valid" : "preview-invalid";
      }

      // V78 (passe fluidité) : plateau DOM persistant. Les 121 cellules sont
      // créées et leurs listeners attachés UNE SEULE FOIS ; ensureBoardCells()
      // ne reconstruit plus jamais rien au-delà de ce premier appel (garde
      // sur la taille de boardCellMap). renderBoard() devient une mise à jour
      // incrémentale : la logique de calcul par cellule est strictement
      // identique à avant (mêmes conditions, même ordre), mais accumulée dans
      // des variables locales (classes/html/styles) au lieu de muter le DOM
      // directement. Une signature texte par cellule (classes+styles+html)
      // est comparée à la précédente : si identique, aucune écriture DOM
      // n'a lieu pour cette cellule. La logique de clic (onCellEnter/
      // onCellLeave/onCellClick) reste strictement inchangée.
      let boardCellMap = null;
      let boardCellSignatures = null;

      function ensureBoardCells() {
        if (boardCellMap && boardCellMap.size === GRID * GRID) return;
        els.board.innerHTML = "";
        boardCellMap = new Map();
        boardCellSignatures = new Map();
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.dataset.r = r;
            cell.dataset.c = c;
            cell.addEventListener("mouseenter", onCellEnter);
            cell.addEventListener("mousemove", onCellEnter);
            cell.addEventListener("mouseleave", onCellLeave);
            cell.addEventListener("click", onCellClick);
            els.board.appendChild(cell);
            boardCellMap.set(key(r, c), cell);
          }
        }
        if (window.ILYOS_PERF) window.ILYOS_PERF.recordBoardRebuild();
      }

      function renderBoard() {
        const __perfStart = window.ILYOS_PERF ? performance.now() : 0;
        ensureBoardCells();
        const magicPreviewSet = new Set((state.magicPreviewCells || []).map(([r, c]) => key(r, c)));
        const fxMap = new Map((state.fxCells || []).map(fx => [key(fx.r, fx.c), fx.type]));
        const spawnIsland = state.pendingSpawnIslandId ? state.islands.find(is => is.id === state.pendingSpawnIslandId) : null;
        const showMagicRotation = state.phase === "ACTION" && state.selectedActionType === "MAGIC" && (state.magicPreviewSteps || 0) > 0;
        const actionHoverKey = state.actionHoverCell ? key(state.actionHoverCell[0], state.actionHoverCell[1]) : null;
        const smartPathSet = new Set((state.smartHoverPath || []).map(([r, c]) => key(r, c)));
        const pushHoverPreview = getPushHoverPreview();
        const pushDestinationKey = pushHoverPreview?.destination ? key(pushHoverPreview.destination[0], pushHoverPreview.destination[1]) : null;
        const pushImpactOrigins = new Map(
          (pushHoverPreview?.impacts || []).map(impact => [key(impact.from[0], impact.from[1]), impact])
        );
        const pushImpactDestinations = new Map(
          (pushHoverPreview?.impacts || [])
            .filter(impact => impact.to)
            .map(impact => [key(impact.to[0], impact.to[1]), impact])
        );

        let cellsTouched = 0;
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            const classes = ["cell"];
            let html = "";
            let islandOwnerColor = null;
            let villageColor = null;
            let pushArrowAngle = null;

            const village = villageAt(r, c);
            const villageZone = villageZoneDataAt(r, c);
            const island = islandAt(r, c);
            const char = characterAt(r, c);
            if (island) {
              islandOwnerColor = state.players[island.owner].color;
              classes.push("placed-island-cell");
            }
            const northLand = inside(r - 1, c) && isLand(r - 1, c);
            const southLand = inside(r + 1, c) && isLand(r + 1, c);
            const westLand = inside(r, c - 1) && isLand(r, c - 1);
            const eastLand = inside(r, c + 1) && isLand(r, c + 1);

            if (isLand(r, c)) {
              classes.push("land");
              if (!northLand) classes.push("edge-top");
              if (!southLand) classes.push("edge-bottom");
              if (!westLand) classes.push("edge-left");
              if (!eastLand) classes.push("edge-right");

              if (island) {
                const northIsland = inside(r - 1, c) ? islandAt(r - 1, c) : null;
                const southIsland = inside(r + 1, c) ? islandAt(r + 1, c) : null;
                const westIsland = inside(r, c - 1) ? islandAt(r, c - 1) : null;
                const eastIsland = inside(r, c + 1) ? islandAt(r, c + 1) : null;
                if (!northIsland || northIsland.id !== island.id) classes.push("island-outline-top");
                if (!southIsland || southIsland.id !== island.id) classes.push("island-outline-bottom");
                if (!westIsland || westIsland.id !== island.id) classes.push("island-outline-left");
                if (!eastIsland || eastIsland.id !== island.id) classes.push("island-outline-right");
              }
            } else {
              classes.push("void", ((r + c) % 2 === 0 ? "cloud-a" : "cloud-b"));
            }

            if (villageZone) {
              villageColor = villageZone.player.color;

              if (village) {
                classes.push("village");
                html += `
                <span class="village-icon">🏰</span>
                <span class="village-owner-mark" style="--village-color:${village.color}">${playerShortName(village)}</span>
              `;
              } else if (!island) {
                /*
                 * Le repère coloré disparaît dès qu'une île est construite
                 * sur cette case afin de laisser apparaître le terrain normal.
                 */
                classes.push("village-zone-extension");
                html += `
                <span class="village-zone-fill" style="--village-color:${villageZone.player.color}"></span>
              `;
              }
            }
            if (isSanctuary(r, c)) {
              classes.push(
                "sanctuary",
                isSanctuaryCenter(r, c) ? "sanctuary-center" : "sanctuary-arm"
              );
              html += isSanctuaryCenter(r, c)
                ? `<span class="sanctuary-ring"></span>`
                : `<span class="sanctuary-arm-mark"></span>`;
            }
            if (island && state.selectedIslandId === island.id && !(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) {
              classes.push("selected");
            }
            if (
              (state.phase === "ACTION_SELECT" || (state.phase === "ACTION" && state.selectedActionType === "MAGIC"))
              && island
              && state.magicHoverIslandId === island.id
            ) {
              classes.push("magic-hover-island");
            }
            if (
              (state.phase === "ACTION_SELECT" || (state.phase === "ACTION" && state.selectedActionType === "MAGIC"))
              && isSameCell(state.magicHoverPivot, [r, c])
            ) {
              classes.push("magic-hover-pivot");
            }
            if (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && island && state.selectedIslandId === island.id) {
              classes.push("magic-selected-island");
            }
            if (state.phase === "PICKUP_CROWN" && char && char.player === state.currentPlayer && state.reachable.has(key(r, c))) {
              classes.push("crown-claimable", "ally-ready");
            }
            if (
              state.phase === "DROP_TREASURE"
              && char
              && (state.crownTransferTargetIds || []).includes(char.id)
              && state.reachable.has(key(r, c))
            ) {
              classes.push("crown-claimable", "ally-ready", "crown-transfer-choice");
            }
            const hideReachableAfterCharacterChoice = (
              (state.phase === "ACTION" && state.selectedCharId && ["MOVE", "PUSH"].includes(state.selectedActionType || ""))
              || state.phase === "SMART_CHAR"
            );
            if (state.reachable.has(key(r, c)) && !hideReachableAfterCharacterChoice) classes.push("reachable");
            if (state.selectedCharId && char?.id === state.selectedCharId) classes.push("selected-character");
            if (
              char
              && state.pendingDirectMoveTarget?.candidateIds?.includes(char.id)
            ) {
              classes.push("direct-move-candidate");
            }

            const placementClass = previewClassForCell(r, c);
            if (placementClass) classes.push(placementClass);

            if (showMagicRotation && magicPreviewSet.has(key(r, c))) {
              classes.push(state.magicPreviewValid ? "magic-valid" : "magic-invalid", "magic-rotation-preview");
            }
            if (state.selectedMagicPivot && state.selectedMagicPivot[0] === r && state.selectedMagicPivot[1] === c) classes.push("magic-pivot");

            const spawnAllowed = spawnIsland && spawnIsland.cells.some(([ir, ic]) => ir === r && ic === c) && !char;
            if (spawnAllowed) classes.push("spawn-choice");

            const cellKey = key(r, c);
            if (
              ((state.phase === "ACTION" && state.selectedActionType === "MOVE") || (state.phase === "SMART_CHAR" && state.smartHoverType === "MOVE"))
              && state.selectedCharId
              && actionHoverKey === cellKey
            ) {
              classes.push("move-target-preview", "action-target-preview");
            }
            if (
              ((state.phase === "ACTION" && state.selectedActionType === "PUSH") || (state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH"))
              && actionHoverKey === cellKey
            ) {
              classes.push("push-target-preview", "action-target-preview");

              const pusher = characterById(state.selectedCharId);
              if (pusher) {
                const dr = r - pusher.r;
                const dc = c - pusher.c;
                pushArrowAngle =
                  dc === 1 ? "0deg" :
                    dr === 1 ? "90deg" :
                      dc === -1 ? "180deg" :
                        "-90deg";
              }
            }
            if (state.phase === "SMART_CHAR" && state.smartHoverType === "CANCEL" && actionHoverKey === cellKey) {
              classes.push("smart-cancel-preview");
            }
            if (smartPathSet.has(cellKey)) {
              classes.push("move-path-preview");
              const pathIndex = (state.smartHoverPath || []).findIndex(
                ([pr, pc]) => pr === r && pc === c
              );
              const pathMeta = state.smartHoverPath?.steps?.[pathIndex];
              if (pathMeta?.diagonal) {
                classes.push("diagonal-step-preview");
              }
            }
            const pushOriginImpact = pushImpactOrigins.get(cellKey);
            const pushDestinationImpact = pushImpactDestinations.get(cellKey);
            if (pushOriginImpact) {
              classes.push("push-line-preview");
              if (pushOriginImpact.fell) classes.push("push-fall-preview");
            }
            if (pushDestinationImpact || pushDestinationKey === cellKey) {
              classes.push("push-destination-preview");
            }

            const fxType = fxMap.get(cellKey);
            if (fxType) classes.push(`fx-${fxType}`);

            const looseCrowns = activeArtifacts().filter(artifact =>
              artifact.carrierId === null && artifact.r === r && artifact.c === c
            );
            looseCrowns.forEach(artifact => {
              const crownClass = artifact.id === "crown-2" ? "crown-2" : "crown-1";
              html += `<span class="artifact ${crownClass}" data-artifact-id="${artifact.id}" title="Cliquer pour récupérer cette couronne">👑</span>`;
            });

            if (char) {
              const owner = state.players[char.player];
              const carriedArtifact = artifactCarriedBy(char.id);
              const carrying = !!carriedArtifact;
              const crownPointReady = (
                state.phase === "ACTION_SELECT"
                && char.player === state.currentPlayer
                && canValidateCrownPoint(char)
              );
              if (crownPointReady) classes.push("crown-validation-ready");
              const selectingActionCharacter = state.phase === "ACTION"
                && ["MOVE", "PUSH"].includes(state.selectedActionType || "")
                && char.player === state.currentPlayer;
              const selectable = (
                (selectingActionCharacter && !state.selectedCharId)
                || (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && char.player === state.currentPlayer)
                || (state.phase === "PICKUP_CROWN" && char.player === state.currentPlayer && state.reachable.has(key(r, c)))
              );
              const readyAction = selectingActionCharacter && !state.selectedCharId;
              if (readyAction) classes.push("ally-ready");
              html += `
              <span class="character ${carrying ? "carrying" : ""} ${selectable ? "selectable" : ""} ${readyAction ? "ready-action" : ""}" style="--pcolor:${owner.color};--token-color:${owner.color}">
                ${carrying ? `<span class="carrier-crown ${char.player === state.currentPlayer ? "own-crown" : "opponent-crown"}" data-artifact-id="${carriedArtifact.id}" title="${char.player === state.currentPlayer ? "Cliquer pour transmettre ou poser gratuitement la couronne" : "Cliquer pour récupérer la couronne"}">👑</span>` : ``}
                <span class="character-standee">${owner.icon}</span>
                <span class="alt-guardian-3d" aria-hidden="true">
                  <span class="alt-guardian-aura"></span>
                  <span class="alt-guardian-legs"><i></i><i></i></span>
                  <span class="alt-guardian-body"></span>
                  <span class="alt-guardian-core"></span>
                  <span class="alt-guardian-head"></span>
                  <span class="alt-guardian-visor"></span>
                  <span class="alt-guardian-crest"></span>
                </span>
                <span class="character-base"></span>
              </span>
              ${crownPointReady ? `
                <span
                  class="crown-score-option"
                  role="button"
                  tabindex="0"
                  title="Dépenser 1 déplacement pour valider le point"
                >
                  <strong>VALIDER +1</strong>
                  <small>−1 déplacement</small>
                </span>
              ` : ""}
            `;
            } else if (state.phase === "PLACE_SPAWN" && spawnAllowed && state.hoverAnchor && state.hoverAnchor[0] === r && state.hoverAnchor[1] === c) {
              const owner = currentPlayer();
              html += `
              <span class="character spawn-preview" style="--pcolor:${owner.color};--token-color:${owner.color}">
                <span class="character-standee">${owner.icon}</span>
                <span class="alt-guardian-3d" aria-hidden="true">
                  <span class="alt-guardian-aura"></span>
                  <span class="alt-guardian-legs"><i></i><i></i></span>
                  <span class="alt-guardian-body"></span>
                  <span class="alt-guardian-core"></span>
                  <span class="alt-guardian-head"></span>
                  <span class="alt-guardian-visor"></span>
                  <span class="alt-guardian-crest"></span>
                </span>
                <span class="character-base"></span>
              </span>
            `;
            }


            if (
              ((state.phase === "ACTION" && state.selectedActionType === "MOVE") || (state.phase === "SMART_CHAR" && state.smartHoverType === "MOVE"))
              && state.selectedCharId
              && actionHoverKey === key(r, c)
              && state.reachable.has(key(r, c))
              && !char
            ) {
              const selected = characterById(state.selectedCharId);
              const owner = selected ? state.players[selected.player] : currentPlayer();
              html += `
              <span class="action-ghost move-ghost" style="--ghost-color:${owner.color}">
                <span>${owner.icon}</span>
              </span>
            `;
            }

            const destinationImpact = pushImpactDestinations.get(key(r, c));
            if (destinationImpact && !characterAt(r, c)) {
              html += `
              <span class="action-ghost push-ghost ${destinationImpact.carrying ? "carrying" : ""}" style="--ghost-color:${destinationImpact.color}">
                <span>${destinationImpact.icon}</span>
              </span>
            `;
            }

            const className = classes.join(" ");
            const signature = className + "|" + (islandOwnerColor || "") + "|" + (villageColor || "") + "|" + (pushArrowAngle || "") + "|" + html;
            if (boardCellSignatures.get(cellKey) === signature) continue;
            boardCellSignatures.set(cellKey, signature);
            cellsTouched++;
            const cellEl = boardCellMap.get(cellKey);
            cellEl.className = className;
            if (islandOwnerColor) cellEl.style.setProperty("--island-owner", islandOwnerColor);
            else cellEl.style.removeProperty("--island-owner");
            if (villageColor) cellEl.style.setProperty("--village-color", villageColor);
            else cellEl.style.removeProperty("--village-color");
            if (pushArrowAngle) cellEl.style.setProperty("--push-arrow-angle", pushArrowAngle);
            else cellEl.style.removeProperty("--push-arrow-angle");
            cellEl.innerHTML = html;
          }
        }
        renderExitGates();
        // V78 : le fallback HTML seul (hors mode 3D) reste seul consommateur
        // de cette couche décorative SVG — en mode "alternative", les îles
        // sont déjà représentées par la scène Three.js, cette génération est
        // une seconde représentation visuelle inutile.
        if (document.body.dataset.visualMode !== "alternative") renderIslandArtLayer();
        if (window.ILYOS_PERF) {
          window.ILYOS_PERF.recordBoardCellsTouched(cellsTouched);
          window.ILYOS_PERF.recordBoardRender(performance.now() - __perfStart);
        }
        scheduleKayKitSync();
      }

      function islandBoundaryPath(cells) {
        const set = new Set(cells.map(([r, c]) => key(r, c)));
        const edges = [];

        cells.forEach(([r, c]) => {
          if (!set.has(key(r - 1, c))) edges.push([[c, r], [c + 1, r]]);
          if (!set.has(key(r, c + 1))) edges.push([[c + 1, r], [c + 1, r + 1]]);
          if (!set.has(key(r + 1, c))) edges.push([[c + 1, r + 1], [c, r + 1]]);
          if (!set.has(key(r, c - 1))) edges.push([[c, r + 1], [c, r]]);
        });

        const unused = new Set(edges.map((_, index) => index));
        const paths = [];
        const pointKey = point => `${point[0]},${point[1]}`;

        while (unused.size) {
          const firstIndex = unused.values().next().value;
          unused.delete(firstIndex);
          const first = edges[firstIndex];
          const start = first[0];
          let current = first[1];
          const points = [start, current];
          let guard = 0;

          while (pointKey(current) !== pointKey(start) && guard++ < 500) {
            const nextIndex = [...unused].find(index => pointKey(edges[index][0]) === pointKey(current));
            if (nextIndex === undefined) break;
            unused.delete(nextIndex);
            current = edges[nextIndex][1];
            points.push(current);
          }

          if (points.length >= 4) {
            paths.push(`M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`);
          }
        }

        return paths.join(" ");
      }

      function renderIslandArtLayer() {
        const oldLayer = els.board.querySelector(".island-art-layer");
        if (oldLayer) oldLayer.remove();
        if (!state.islands.length) return;

        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.classList.add("island-art-layer");
        svg.setAttribute("viewBox", `0 0 ${GRID} ${GRID}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML = `
        <defs>
          <linearGradient id="grassNatural" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c7eb82"/>
            <stop offset="46%" stop-color="#8fbe58"/>
            <stop offset="100%" stop-color="#5f873f"/>
          </linearGradient>
          <linearGradient id="grassGolden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d2ed78"/>
            <stop offset="45%" stop-color="#96c64f"/>
            <stop offset="100%" stop-color="#587d34"/>
          </linearGradient>
          <linearGradient id="grassMagic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#b9e47e"/>
            <stop offset="50%" stop-color="#79ae54"/>
            <stop offset="100%" stop-color="#466f42"/>
          </linearGradient>
          <linearGradient id="grassStone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c2e481"/>
            <stop offset="42%" stop-color="#87b557"/>
            <stop offset="100%" stop-color="#57763f"/>
          </linearGradient>
          <linearGradient id="cliffNatural" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#917252"/>
            <stop offset="100%" stop-color="#4f3c30"/>
          </linearGradient>
          <linearGradient id="cliffGolden" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#98703f"/>
            <stop offset="100%" stop-color="#4e321e"/>
          </linearGradient>
          <linearGradient id="cliffMagic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#55716d"/>
            <stop offset="100%" stop-color="#263a42"/>
          </linearGradient>
          <linearGradient id="cliffStone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#97836c"/>
            <stop offset="100%" stop-color="#493d34"/>
          </linearGradient>
          <pattern id="grassSpeckles" width=".42" height=".42" patternUnits="userSpaceOnUse">
            <circle cx=".10" cy=".12" r=".035" fill="#f4ffd4" opacity=".48"/>
            <circle cx=".31" cy=".28" r=".026" fill="#466b36" opacity=".34"/>
          </pattern>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy=".16" stdDeviation=".12" flood-color="#172517" flood-opacity=".48"/>
          </filter>
          <filter id="magicGlow" x="-40%" y="-40%" width="180%" height="190%">
            <feGaussianBlur stdDeviation=".055" result="blur"/>
            <feFlood flood-color="#62e8ff" flood-opacity=".90" result="color"/>
            <feComposite in="color" in2="blur" operator="in" result="glow"/>
            <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          <linearGradient id="altIslandTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#d7fff2"/>
            <stop offset="38%" stop-color="#71e0c4"/>
            <stop offset="72%" stop-color="#3d8fa9"/>
            <stop offset="100%" stop-color="#285272"/>
          </linearGradient>
          <linearGradient id="altIslandCliff" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#315b72"/>
            <stop offset="48%" stop-color="#182c49"/>
            <stop offset="100%" stop-color="#090f24"/>
          </linearGradient>
          <linearGradient id="altIslandCore" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#63f7ff" stop-opacity=".10"/>
            <stop offset="42%" stop-color="#7f6dff" stop-opacity=".92"/>
            <stop offset="100%" stop-color="#ff65d8" stop-opacity=".20"/>
          </linearGradient>
          <pattern id="altRunes" width=".52" height=".52" patternUnits="userSpaceOnUse">
            <path d="M .08 .26 L .22 .08 L .38 .26 L .22 .44 Z" fill="none" stroke="#c9ffff" stroke-width=".025" opacity=".56"/>
          </pattern>
          <filter id="altIslandGlow" x="-50%" y="-50%" width="200%" height="230%">
            <feDropShadow dx="0" dy=".20" stdDeviation=".12" flood-color="#040817" flood-opacity=".88"/>
            <feDropShadow dx="0" dy="0" stdDeviation=".06" flood-color="#75ecff" flood-opacity=".70"/>
          </filter>
        </defs>
      `;

        state.islands.forEach(island => {
          const pathData = islandBoundaryPath(island.cells);
          if (!pathData) return;
          const group = document.createElementNS(ns, "g");
          group.classList.add("island-art");
          group.style.setProperty("--owner-color", state.players[island.owner]?.color || "#ffffff");
          group.dataset.islandId = island.id;
          group.innerHTML = `
          <path class="island-deep-shadow" d="${pathData}" transform="translate(0 .24)"></path>
          <path class="island-alt-core" d="${pathData}" transform="translate(0 .31)"></path>
          <path class="island-cliff" d="${pathData}" transform="translate(0 .15)"></path>
          <path class="island-rim" d="${pathData}"></path>
          <path class="island-top" d="${pathData}"></path>
          <path class="island-texture" d="${pathData}"></path>
          <path class="island-alt-runes" d="${pathData}"></path>
          <path class="island-owner-line" d="${pathData}"></path>
        `;
          svg.appendChild(group);
        });

        els.board.insertBefore(svg, els.board.firstChild);
      }

      function loadIslandRenderDemo() {
        state.islands = [
          { id: 1, owner: 0, anchor: { r: 2, c: 2 }, relCells: [[0, 0], [0, 1], [1, 0]], cells: [[2, 2], [2, 3], [3, 2]] },
          { id: 2, owner: 1, anchor: { r: 2, c: 6 }, relCells: [[0, 0], [0, 1], [1, 0], [1, 1]], cells: [[2, 6], [2, 7], [3, 6], [3, 7]] },
          { id: 3, owner: 0, anchor: { r: 5, c: 1 }, relCells: [[0, 0], [0, 1], [0, 2]], cells: [[5, 1], [5, 2], [5, 3]] },
          { id: 4, owner: 1, anchor: { r: 6, c: 7 }, relCells: [[0, 0], [0, 1], [1, 0]], cells: [[6, 7], [6, 8], [7, 7]] },
          { id: 5, owner: 0, anchor: { r: 8, c: 3 }, relCells: [[0, 1], [1, 0], [1, 1], [1, 2]], cells: [[8, 4], [9, 3], [9, 4], [9, 5]] }
        ];
        state.nextIslandId = 6;
        if (state.characters[0]) { state.characters[0].r = 3; state.characters[0].c = 2; }
        if (state.characters[1]) { state.characters[1].r = 6; state.characters[1].c = 7; }
        state.artifact = { id: "crown-1", r: CENTER.r, c: CENTER.c, carrierId: null, active: true };
        state.secondArtifact = { id: "crown-2", r: CENTER.r, c: CENTER.c, carrierId: null, active: false };
        state.phase = "ACTION_SELECT";
        state.islandPlacedThisTurn = false;
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.pendingSpawnIslandId = null;
        state.hoverAnchor = null;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set();
        renderAll();
      }

      function onCellEnter(event) {
        const r = Number(event.currentTarget.dataset.r);
        const c = Number(event.currentTarget.dataset.c);

        if (state.phase === "PLACE_ISLAND") {
          state.hoverAnchor = [r, c];
          updatePlacementPreview(r, c);
          return;
        }

        if (state.phase === "PLACE_SPAWN") {
          state.hoverAnchor = [r, c];
          els.board.querySelectorAll(".spawn-preview").forEach(node => node.remove());
          const cell = els.board.querySelector(`[data-r="${r}"][data-c="${c}"]`);
          if (cell && cell.classList.contains("spawn-choice")) {
            const owner = currentPlayer();
            cell.insertAdjacentHTML("beforeend", `
            <span class="character spawn-preview" style="--pcolor:${owner.color};--token-color:${owner.color}">
              <span class="character-standee">${owner.icon}</span>
                <span class="alt-guardian-3d" aria-hidden="true">
                  <span class="alt-guardian-aura"></span>
                  <span class="alt-guardian-legs"><i></i><i></i></span>
                  <span class="alt-guardian-body"></span>
                  <span class="alt-guardian-core"></span>
                  <span class="alt-guardian-head"></span>
                  <span class="alt-guardian-visor"></span>
                  <span class="alt-guardian-crest"></span>
                </span>
                <span class="character-base"></span>
            </span>
          `);
          }
          return;
        }

        if (state.phase === "SMART_CHAR") {
          const preview = previewSmartCharacterTarget(r, c);
          const nextCell = preview.type ? [r, c] : null;
          if (
            !isSameCell(state.actionHoverCell, nextCell)
            || state.smartHoverType !== preview.type
            || JSON.stringify(state.smartHoverPath) !== JSON.stringify(preview.path)
          ) {
            state.actionHoverCell = nextCell;
            state.smartHoverType = preview.type;
            state.smartHoverPath = preview.path || [];
            // Nouvelle cible : tout choix de force explicite précédent portait
            // sur une cible différente, il ne veut plus rien dire ici.
            state.smartPushForce = null;
            scheduleBoardRender();
            // Le panneau ACTIONS doit apparaître/disparaître avec le contrôle de
            // force contextuel dès que la cible poussable survolée change.
            renderHand();
          }
          return;
        }

        // Plus d'aperçu magie au survol en ACTION_SELECT (avant tout choix
        // d'action) : cet aperçu n'a de sens que pendant un usage réel de la
        // magie (voir plus bas). Survoler une case libre d'île en dehors de
        // ce contexte ne doit plus rien annoncer côté magie.
        if (state.phase === "ACTION" && state.selectedActionType === "MAGIC") {
          const island = islandAt(r, c);
          const nextIslandId = island?.id || null;
          const nextPivot = island ? [r, c] : null;
          const samePivot = nextPivot ? isSameCell(state.magicHoverPivot, nextPivot) : !state.magicHoverPivot;
          if (state.magicHoverIslandId !== nextIslandId || !samePivot) {
            state.magicHoverIslandId = nextIslandId;
            state.magicHoverPivot = nextPivot;
            // Ghost immédiat au survol (avant même le clic de pivot) : un aperçu
            // de la rotation à 90° s'affiche dès qu'on survole une case d'île,
            // pour ne plus avoir à cliquer puis tourner pour voir le résultat.
            updateMagicHoverPreview();
            scheduleBoardRender();
            if (kaykit3D) {
              kaykit3D.lastStateSignature = "";
              scheduleKayKitSync();
            }
          }
          return;
        }

        if (state.phase === "ACTION" && state.selectedCharId && ["MOVE", "PUSH"].includes(state.selectedActionType)) {
          let valid = false;
          let path = [];

          if (state.selectedActionType === "MOVE") {
            const actor = characterById(state.selectedCharId);
            path = actor
              ? (shortestMovementPath(actor, r, c, availableActionCount("MOVE")) || [])
              : [];
            valid = path.length > 0;
          } else {
            const pusher = characterById(state.selectedCharId);
            valid = !!pusher
              && Math.abs(pusher.r - r) + Math.abs(pusher.c - c) === 1
              && !!(characterAt(r, c) || looseArtifactAt(r, c));
          }

          const next = valid ? [r, c] : null;
          const pathChanged = JSON.stringify(state.smartHoverPath || []) !== JSON.stringify(path);
          if (!isSameCell(state.actionHoverCell, next) || pathChanged) {
            state.actionHoverCell = next;
            state.smartHoverPath = path;
            scheduleBoardRender();
            // Le panneau ACTIONS doit afficher le coût MOVE dès que la case
            // survolée change, comme pour le survol PUSH côté SMART_CHAR.
            renderHand();
          }
        }
      }

      function onCellLeave(event) {
        if (!state) return;
        const r = Number(event.currentTarget.dataset.r);
        const c = Number(event.currentTarget.dataset.c);

        if (state.phase === "SMART_CHAR" && isSameCell(state.actionHoverCell, [r, c])) {
          clearSmartHover();
          scheduleBoardRender();
          renderHand();
          return;
        }

        if (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && isSameCell(state.magicHoverPivot, [r, c])) {
          state.magicHoverIslandId = null;
          state.magicHoverPivot = null;
          state.magicHoverPreviewCells = null;
          state.magicHoverPreviewValid = false;
          scheduleBoardRender();
          if (kaykit3D) {
            kaykit3D.lastStateSignature = "";
            scheduleKayKitSync();
          }
          return;
        }

        if (state.phase === "ACTION" && state.actionHoverCell && isSameCell(state.actionHoverCell, [r, c])) {
          state.actionHoverCell = null;
          if (state.selectedActionType === "MOVE") state.smartHoverPath = [];
          scheduleBoardRender();
          if (state.selectedActionType === "MOVE") renderHand();
        }
      }

      function clearPlacementPreview(clearAnchor = false) {
        els.board.querySelectorAll(".cell").forEach(cell => {
          cell.classList.remove("preview-valid", "preview-invalid");
        });
        if (clearAnchor) state.hoverAnchor = null;
        scheduleKayKitSync();
      }

      function updatePlacementPreview(anchorR, anchorC) {
        const valid = isValidPlacement(anchorR, anchorC);
        const preview = new Set(previewAbsoluteCells(anchorR, anchorC).map(([r, c]) => key(r, c)));

        els.board.querySelectorAll(".cell").forEach(cell => {
          cell.classList.remove("preview-valid", "preview-invalid");
          const r = Number(cell.dataset.r);
          const c = Number(cell.dataset.c);
          if (preview.has(key(r, c))) {
            cell.classList.add(valid ? "preview-valid" : "preview-invalid");
          }
        });
        scheduleKayKitSync();
      }


      function isCenterCrownCell(cell) {
        return Array.isArray(cell) && cell[0] === CENTER.r && cell[1] === CENTER.c;
      }

      function beginCrownRecovery(claimers, options = {}) {
        const validClaimers = (claimers || [])
          .filter(Boolean)
          .filter(claimer => !characterCarriesCrown(claimer.id));
        const {
          crownCell = null,
          stealTargetId = null,
          artifactId = null,
          emptyMessage = "Aucun de vos gardiens n’est adjacent à la couronne.",
          singleMessage = null,
          multipleMessage = "Choisissez le gardien adjacent qui récupère la couronne."
        } = options;

        if (isCenterCrownCell(crownCell) && state.centerCrownTakenThisTurn) {
          showToast("Une seule couronne peut être récupérée sur la case centrale pendant ce tour.");
          return false;
        }

        if (!validClaimers.length) {
          showToast(emptyMessage);
          return false;
        }

        if (validClaimers.length === 1) {
          const claimer = validClaimers[0];
          saveUndoSnapshot();
          const artifact = artifactById(artifactId)
            || (stealTargetId ? artifactCarriedBy(stealTargetId) : crownCell ? looseArtifactAt(crownCell[0], crownCell[1]) : null);
          if (!artifact || !giveArtifactToCharacter(artifact, claimer)) {
            discardLastUndoSnapshot();
            showToast("Ce gardien porte déjà une couronne.");
            return false;
          }
          if (isCenterCrownCell(crownCell)) state.centerCrownTakenThisTurn = true;
          state.crownPickupCell = null;
          state.crownStealTargetId = null;
          state.selectedCharId = claimer.id;
          state.selectedIslandId = null;
          state.reachable = new Set();
          state.phase = "ACTION_SELECT";
          renderAll();
          animateCellPulse(claimer.r, claimer.c, "crown-burst");
          playSfx("crownTake");   // Ramassage, pas un point marqué.
          showToast(singleMessage || `${currentPlayer().name} récupère la couronne !`);
          return true;
        }

        state.crownStealTargetId = stealTargetId;
        state.crownPickupArtifactId = artifactId;
        state.crownPickupCell = crownCell;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.reachable = new Set(validClaimers.map(claimer => key(claimer.r, claimer.c)));
        state.phase = "PICKUP_CROWN";
        renderAll();
        showToast(multipleMessage);
        return true;
      }

      function onCellClick(event) {
        if (!state || state.winner !== null || state.inputLocked || !canLocalPlayerAct()) return;
        const r = Number(event.currentTarget.dataset.r);
        const c = Number(event.currentTarget.dataset.c);
        const clickedScoreOption = !!event.target.closest?.(".crown-score-option");
        const clickedCrownNode = event.target.closest?.(".carrier-crown,.artifact");
        const clickedCrownBadge = !!event.target.closest?.(".carrier-crown");
        const clickedArtifactId = clickedCrownNode?.dataset?.artifactId || null;

        if (state.pendingDirectMoveTarget) {
          const target = state.pendingDirectMoveTarget;
          const clicked = characterAt(r, c);
          if (clicked && target.candidateIds.includes(clicked.id)) {
            const range = movementRange(clicked, availableActionCount("MOVE"));
            state.pendingDirectMoveTarget = null;
            state.phase = "ACTION";
            state.selectedActionType = "MOVE";
            state.selectedActionCount = target.cost;
            state.selectedCharId = clicked.id;
            state.selectedIslandId = null;
            state.reachable = range;
            performMoveToCell(clicked, target.r, target.c, range);
            return;
          }
          state.pendingDirectMoveTarget = null;
        }

        if (clickedScoreOption) {
          const scoringChar = characterAt(r, c);
          validateCrownPoint(scoringChar);
          return;
        }

        if (state.phase === "PLACE_ISLAND") {
          state.hoverAnchor = [r, c];
          if (isValidPlacement(r, c)) {
            placeIsland(r, c);
          } else {
            updatePlacementPreview(r, c);
            showToast("Cette forme ne tient pas ici.");
          }
          return;
        }

        if (state.phase === "PLACE_SPAWN") {
          if (!canCreateGuardian(state.currentPlayer)) {
            state.phase = "ACTION_SELECT";
            state.pendingSpawnIslandId = null;
            renderAll();
            showToast(`Limite atteinte : ${MAX_GUARDIANS_PER_PLAYER} gardiens maximum.`);
            return;
          }

          const island = state.islands.find(is => is.id === state.pendingSpawnIslandId);
          if (island && island.cells.some(([ir, ic]) => ir === r && ic === c) && !characterAt(r, c)) {
            const char = {
              id: `char-${state.nextCharId++}`,
              player: state.currentPlayer,
              r, c
            };
            state.characters.push(char);
            resolveArtifactForCharacter(char);
            state.phase = "ACTION_SELECT";
            state.selectedIslandShape = null;
            state.placementCells = null;
            state.placementOriginIndex = 0;
            state.hoverAnchor = null;
            state.pendingSpawnIslandId = null;
            state.selectedCharId = char.id;
            state.selectedIslandId = null;
            clearMagicPreview();
            resetKayKitPointerFeedback();
            renderAll();
            animateCellPulse(r, c, "spawn-arrival");
            playSfx("spawn");
            showToast("Gardien invoqué.");
          } else {
            showToast("Choisissez une case libre de l’île.");
          }
          return;
        }

        if (state.phase === "DROP_TREASURE") {
          const owner = characterById(state.treasureDropFromId);
          const clickedAlly = characterAt(r, c);
          const transferTargets = new Set(state.crownTransferTargetIds || []);

          if (owner && state.reachable.has(key(r, c))) {
            saveUndoSnapshot();
            const artifact = artifactById(state.treasureDropArtifactId) || artifactCarriedBy(owner.id);

            if (!artifact) {
              discardLastUndoSnapshot();
              showToast("Aucune couronne à transmettre ou à poser.");
              return;
            }

            if (
              clickedAlly
              && clickedAlly.player === state.currentPlayer
              && transferTargets.has(clickedAlly.id)
              && !characterCarriesCrown(clickedAlly.id)
            ) {
              if (!giveArtifactToCharacter(artifact, clickedAlly)) {
                discardLastUndoSnapshot();
                showToast("Ce gardien porte déjà une couronne.");
                return;
              }

              if (kaykit3D) {
                kaykit3D.characterFacing.set(String(owner.id), kaykitFacingRotation(owner.r, owner.c, clickedAlly.r, clickedAlly.c));
                kaykit3D.characterFacing.set(String(clickedAlly.id), kaykitFacingRotation(clickedAlly.r, clickedAlly.c, owner.r, owner.c));
              }
              state.treasureDropFromId = null;
              state.treasureDropArtifactId = null;
              state.crownTransferTargetIds = [];
              state.selectedCharId = clickedAlly.id;
              state.reachable = new Set();
              state.phase = "ACTION_SELECT";
              renderAll();
              animateCellPulse(clickedAlly.r, clickedAlly.c, "crown-burst");
              playSfx("crownTake");   // L'allié reçoit la couronne : c'est une prise.
              showToast(`${currentPlayer().name} transmet gratuitement la couronne.`);
              return;
            }

            if (clickedAlly) {
              discardLastUndoSnapshot();
              showToast("Choisissez l’allié indiqué ou une case libre adjacente.");
              return;
            }

            artifact.carrierId = null;
            artifact.r = r;
            artifact.c = c;
            state.treasureDropFromId = null;
            state.treasureDropArtifactId = null;
            state.crownTransferTargetIds = [];
            state.selectedCharId = owner.id;
            state.reachable = new Set();
            state.phase = "ACTION_SELECT";
            renderAll();
            animateCellPulse(r, c, "crown-burst");
            playSfx("crownDrop");   // Pose au sol.
            showToast("Couronne posée gratuitement.");
          } else {
            showToast("Choisissez un allié adjacent ou une case libre adjacente.");
          }
          return;
        }

        if (state.phase === "PICKUP_CROWN") {
          const pickedChar = characterAt(r, c);
          if (pickedChar && pickedChar.player === state.currentPlayer && state.reachable.has(key(r, c))) {
            saveUndoSnapshot();
            const stolenFrom = characterById(state.crownStealTargetId);
            const artifact = artifactById(state.crownPickupArtifactId)
              || (stolenFrom ? artifactCarriedBy(stolenFrom.id) : state.crownPickupCell ? looseArtifactAt(state.crownPickupCell[0], state.crownPickupCell[1]) : null);
            if (!artifact || !giveArtifactToCharacter(artifact, pickedChar)) {
              discardLastUndoSnapshot();
              showToast("Ce gardien porte déjà une couronne.");
              return;
            }
            if (isCenterCrownCell(state.crownPickupCell)) state.centerCrownTakenThisTurn = true;
            state.crownPickupCell = null;
            state.crownStealTargetId = null;
            state.crownPickupArtifactId = null;
            state.selectedCharId = pickedChar.id;
            state.selectedIslandId = null;
            state.reachable = new Set();
            state.phase = "ACTION_SELECT";
            renderAll();
            animateCellPulse(pickedChar.r, pickedChar.c, "crown-burst");
            playSfx("crownTake");   // Ramassage, éventuellement volé à l'adversaire.
            showToast(stolenFrom ? `${currentPlayer().name} récupère la couronne à l’adversaire !` : "Couronne récupérée.");
          } else {
            showToast("Choisissez un de vos gardiens adjacents.");
          }
          return;
        }

        if (state.phase === "SMART_CHAR") {
          handleSmartCharacterClick(r, c);
          return;
        }

        if (state.phase === "ACTION") {
          const action = state.selectedActionType;
          if (action === "MOVE") handleMoveClick(r, c);
          else if (action === "PUSH" && state.pushOptions?.length) {
            const target = characterAt(r, c) || looseArtifactAt(r, c);
            if (!target) return;
            const options = collectUnifiedPushOptions({
              pusherId: state.selectedCharId || null,
              targetId: target.id
            });
            if (!options.length) {
              showToast("Aucune poussée légale vers cette cible.");
              return;
            }
            state.pushOptions = options;
            state.pushTargetId = target.id;
            state.pushHoverOptionId = null;
            renderAll();
            scheduleKayKitSync();
          }
          else if (action === "PUSH") handlePushClick(r, c);
          else if (action === "MAGIC") handleMagicClick(r, c);
          return;
        }

        const char = characterAt(r, c);
        const island = islandAt(r, c);

        if (state.phase === "ACTION_SELECT" && looseArtifactAt(r, c)) {
          const clickedLooseArtifact = artifactById(clickedArtifactId) || looseArtifactAt(r, c);
          const claimers = orthogonalNeighbors(r, c)
            .map(([nr, nc]) => characterAt(nr, nc))
            .filter(adjacentChar => adjacentChar && adjacentChar.player === state.currentPlayer);

          beginCrownRecovery(claimers, {
            crownCell: [r, c],
            stealTargetId: null,
            artifactId: clickedLooseArtifact?.id || null,
            emptyMessage: "Aucun de vos gardiens n’est adjacent à la couronne.",
            singleMessage: `${currentPlayer().name} récupère automatiquement la couronne !`,
            multipleMessage: "Plusieurs gardiens sont adjacents : choisissez celui qui récupère la couronne."
          });
          return;
        }


        if (
          state.phase === "ACTION_SELECT"
          && char
          && char.player === state.currentPlayer
          && !clickedCrownBadge
          && canValidateCrownPoint(char)
        ) {
          validateCrownPoint(char);
          return;
        }

        if (
          state.phase === "ACTION_SELECT"
          && clickedCrownBadge
          && char
          && char.player !== state.currentPlayer
          && !!artifactCarriedBy(char.id)
        ) {
          const claimers = orthogonalNeighbors(r, c)
            .map(([nr, nc]) => characterAt(nr, nc))
            .filter(adjacentChar => adjacentChar && adjacentChar.player === state.currentPlayer);

          const opponentArtifact = artifactById(clickedArtifactId) || artifactCarriedBy(char.id);
          beginCrownRecovery(claimers, {
            crownCell: [r, c],
            stealTargetId: char.id,
            artifactId: opponentArtifact?.id || null,
            emptyMessage: "Placez un de vos gardiens à côté du porteur adverse pour récupérer la couronne.",
            singleMessage: `${currentPlayer().name} récupère automatiquement la couronne adverse !`,
            multipleMessage: "Plusieurs gardiens sont adjacents : choisissez celui qui récupère la couronne adverse."
          });
          return;
        }

        if (
          state.phase === "ACTION_SELECT"
          && clickedCrownBadge
          && char
          && char.player === state.currentPlayer
          && !!artifactCarriedBy(char.id)
        ) {
          const carriedArtifact = artifactById(clickedArtifactId) || artifactCarriedBy(char.id);

          const adjacentAllies = orthogonalNeighbors(r, c)
            .map(([nr, nc]) => characterAt(nr, nc))
            .filter(ally =>
              ally
              && ally.player === state.currentPlayer
              && ally.id !== char.id
              && !characterCarriesCrown(ally.id)
            );

          const dropCells = orthogonalNeighbors(r, c).filter(([nr, nc]) =>
            isLand(nr, nc)
            && !characterAt(nr, nc)
            && !looseArtifactAt(nr, nc)
          );

          const choiceCells = [
            ...dropCells,
            ...adjacentAllies.map(ally => [ally.r, ally.c])
          ];

          if (!choiceCells.length) {
            showToast("Aucune case libre et aucun allié adjacent ne peuvent recevoir la couronne.");
            return;
          }

          state.treasureDropArtifactId = carriedArtifact?.id || null;
          state.crownTransferTargetIds = adjacentAllies.map(ally => ally.id);
          state.selectedCharId = char.id;
          state.selectedIslandId = null;
          state.treasureDropFromId = char.id;
          state.reachable = new Set(choiceCells.map(([nr, nc]) => key(nr, nc)));
          state.phase = "DROP_TREASURE";
          renderAll();

          if (adjacentAllies.length && dropCells.length) {
            showToast("Choisissez : un allié adjacent ou une case libre pour poser la couronne.");
          } else if (adjacentAllies.length) {
            showToast("Choisissez l’allié adjacent qui reçoit la couronne.");
          } else {
            showToast("Choisissez une case adjacente libre pour poser la couronne.");
          }
          return;
        }

        if (
          state.phase === "ACTION_SELECT"
          && char
          && char.player !== state.currentPlayer
          && beginPushAgainstTarget(char)
        ) {
          return;
        }

        if (state.phase === "ACTION_SELECT" && char && char.player === state.currentPlayer) {
          beginSmartCharacterAction(char);
          return;
        }

        if (
          state.phase === "ACTION_SELECT"
          && isSanctuary(r, c)
          && tryDirectSanctuaryMove(r, c)
        ) {
          return;
        }

        // Cliquer une case libre d'île déplace directement le gardien le plus
        // proche capable de l'atteindre — la magie ne se déclenche plus
        // implicitement ici, seulement via sa propre carte d'action (menant à
        // handleMagicClick plus haut).
        if (state.phase === "ACTION_SELECT" && island && !char) {
          const nearest = nearestMoverForCell(r, c);
          if (!nearest) {
            showToast("Aucun de vos gardiens ne peut atteindre cette case.");
            return;
          }
          state.phase = "ACTION";
          state.selectedActionType = "MOVE";
          state.selectedActionCount = availableActionCount("MOVE");
          state.selectedCharId = nearest.char.id;
          state.selectedIslandId = null;
          state.reachable = movementRange(nearest.char, availableActionCount("MOVE"));
          handleMoveClick(r, c);
          return;
        }

        if (char) {
          state.selectedCharId = char.id;
          state.selectedIslandId = null;
        } else if (island) {
          state.selectedIslandId = island.id;
          state.selectedCharId = null;
        } else {
          state.selectedCharId = null;
          state.selectedIslandId = null;
        }
        renderAll();
      }

      function placeIsland(anchorR, anchorC) {
        const absCells = previewAbsoluteCells(anchorR, anchorC);
        const islandId = state.nextIslandId++;
        const island = {
          id: islandId,
          owner: state.currentPlayer,
          shapeKey: state.selectedIslandShape,
          anchor: { r: anchorR, c: anchorC },
          relCells: cloneCells(state.placementCells),
          cells: absCells,
          visualVariant: chooseIslandVisualVariant(absCells, islandId, state.islands)
        };
        state.islands.push(island);
        // L'île se matérialise : elle descend depuis quelques centimètres
        // au-dessus de sa position finale au lieu d'apparaître d'un coup.
        playIslandDrop(island.id);

        state.islandPlacedThisTurn = true;

        if (canCreateGuardian(state.currentPlayer)) {
          state.phase = "PLACE_SPAWN";
          state.pendingSpawnIslandId = island.id;
        } else {
          state.phase = "ACTION_SELECT";
          state.pendingSpawnIslandId = null;
        }
        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;
        state.selectedCharId = null;
        clearMagicPreview();
        state.selectedIslandId = island.id;
        resetKayKitPointerFeedback();
        renderAll();
        animateIslandArrival(island);
        playSfx("island");

        // Le contexte de tour affiche déjà "Invocation obligatoire · Placer le
        // gardien" : un toast ici ne ferait que répéter la même instruction.
        if (!canCreateGuardian(state.currentPlayer)) {
          showToast(`Île posée. Limite atteinte : ${MAX_GUARDIANS_PER_PLAYER} gardiens maximum.`);
        }
      }

      function actionUnavailableReason(type) {
        const available = availableActionCount(type);
        if (available <= 0) return `Aucune action ${ACTIONS[type].name.toLowerCase()} disponible.`;
        if (type === "MOVE") {
          const movable = state.characters.some(char => {
            if (char.player !== state.currentPlayer) return false;
            return orthogonalNeighbors(char.r, char.c).some(([r, c]) => isLand(r, c) && !characterAt(r, c));
          });
          if (!movable) return "Aucune destination libre autour de vos gardiens.";
        }
        if (type === "PUSH") {
          const target = state.characters.some(char => {
            if (char.player !== state.currentPlayer) return false;
            return orthogonalNeighbors(char.r, char.c).some(([r, c]) => {
              const other = characterAt(r, c);
              return !!(looseArtifactAt(r, c) || (other && other.id !== char.id));
            });
          });
          if (!target) return "Aucun adversaire ou objet adjacent à pousser.";
        }
        if (type === "MAGIC" && !(state.islands || []).length) return "Aucune île compatible avec la magie.";
        return "";
      }

      function renderHand() {
        els.hand.innerHTML = "";
        // Le panneau doit changer d'allure dès qu'un gardien est sélectionné,
        // pas seulement quand une action classique est activée : bandeau de
        // contexte + boutons MOVE/PUSH mis en avant (même style que "active").
        const smartSelected = state.phase === "SMART_CHAR" && !!state.selectedCharId;
        if (smartSelected) {
          const badge = document.createElement("div");
          badge.className = "v60-context-options smart-char-badge";
          badge.innerHTML = "<span>🛡️ GARDIEN SÉLECTIONNÉ</span>";
          els.hand.appendChild(badge);
        }
        const bar = document.createElement("div");
        bar.className = "v60-action-bar";
        ["MOVE", "PUSH", "MAGIC"].forEach(type => {
          const action = ACTIONS[type];
          const remaining = availableActionCount(type);
          const active = state.phase === "ACTION" && state.selectedActionType === type;
          const smartReady = smartSelected && (type === "MOVE" || type === "PUSH");
          const reason = actionUnavailableReason(type);
          const disabled = remaining <= 0 || !!reason;
          const button = document.createElement("button");
          button.type = "button";
          button.className = `v60-action-btn action-${type.toLowerCase()}${(active || smartReady) ? " active" : ""}${disabled ? " disabled" : ""}`;
          button.dataset.type = type;
          button.setAttribute("aria-pressed", active ? "true" : "false");
          button.setAttribute("aria-disabled", disabled ? "true" : "false");
          button.title = disabled ? reason : `${action.name} ×${remaining}`;
          const status = disabled ? reason : (active ? "Sélectionnée" : (smartReady ? `${remaining} disponible${remaining > 1 ? "s" : ""}` : "Disponible"));
          button.innerHTML = `<span class="v60-action-icon">${action.icon}</span><strong>${action.name}</strong><b>×${remaining}</b><small>${status}</small>`;
          if (!disabled) button.addEventListener("click", () => type === "PUSH" ? beginUnifiedPushFromHud() : selectActionBatch(type, 1));
          else button.addEventListener("click", () => showToast(reason));
          bar.appendChild(button);
        });
        els.hand.appendChild(bar);

        // Coût lu au survol d'une destination MOVE (chemin déjà calculé par
        // shortestMovementPath, cost/steps déjà accrochés dessus) : que ce
        // survol vienne du bouton MOVE classique ou du clic direct SMART_CHAR,
        // le panneau doit dire ce que ce clic coûterait avant qu'il n'ait lieu.
        const classicMoveActive = state.phase === "ACTION" && state.selectedActionType === "MOVE";
        const smartMoveHovered = state.phase === "SMART_CHAR" && state.smartHoverType === "MOVE";
        if ((classicMoveActive || smartMoveHovered) && state.actionHoverCell) {
          const path = state.smartHoverPath || [];
          const cost = path.cost ?? path.length;
          if (cost > 0) {
            const remaining = Math.max(0, availableActionCount("MOVE") - cost);
            const contextual = document.createElement("div");
            contextual.className = "v60-context-options move-options";
            contextual.innerHTML = `<span>🥾 Déplacement</span><b>Coût : ${cost}</b><small>Restera : ${remaining}</small>`;
            els.hand.appendChild(contextual);
          }
        }

        const classicPushActive = state.phase === "ACTION" && state.selectedActionType === "PUSH";
        const smartPushHovered = state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH";
        if ((classicPushActive || smartPushHovered) && !state.pushOptions?.length) {
          const max = Math.max(1, availableActionCount("PUSH"));
          // Même contrôle pour les deux chemins (bouton PUSH classique et clic
          // direct sur un gardien) : seule la source du minimum change. En
          // SMART_CHAR, getPushHoverPreview() reste l'unique simulation.
          let force = null, min = 1, extra = "";
          if (smartPushHovered) {
            const preview = getPushHoverPreview();
            if (preview) {
              min = Math.max(1, preview.requiredForce || 1);
              force = Math.max(min, Math.min(max, preview.force || min));
              const [targetR, targetC] = preview.target;
              const distance = (!preview.fell && preview.destination)
                ? Math.abs(preview.destination[0] - targetR) + Math.abs(preview.destination[1] - targetC)
                : null;
              extra = `<small>Minimum : ${min}</small>` + (
                preview.fell
                  ? `<small>Chute hors du plateau</small>`
                  : distance ? `<small>Destination : ${distance} case${distance > 1 ? "s" : ""}</small>` : ""
              );
            }
          } else {
            force = Math.max(1, Math.min(state.pushForceChoice || 1, max));
            extra = "<small>Sélectionnez ensuite la cible adjacente.</small>";
          }
          if (force !== null) {
            const contextual = document.createElement("div");
            contextual.className = "v60-context-options";
            contextual.innerHTML = `<span>💥 Poussée</span><button type="button" data-force-minus>−</button><b>${force}</b><button type="button" data-force-plus>+</button>${extra}`;
            contextual.querySelector('[data-force-minus]').disabled = force <= min;
            contextual.querySelector('[data-force-plus]').disabled = force >= max;
            contextual.querySelector('[data-force-minus]').onclick = () => {
              if (smartPushHovered) {
                state.smartPushForce = Math.max(min, force - 1);
                refreshKayKitHoverPreviews();
                scheduleBoardRender();
                renderHand();
              } else { setPushForceChoice(force - 1, { notify: true }); renderHand(); }
            };
            contextual.querySelector('[data-force-plus]').onclick = () => {
              if (smartPushHovered) {
                state.smartPushForce = Math.min(max, force + 1);
                refreshKayKitHoverPreviews();
                scheduleBoardRender();
                renderHand();
              } else { setPushForceChoice(force + 1, { notify: true }); renderHand(); }
            };
            els.hand.appendChild(contextual);
          }
        }
        if (state.phase === "ACTION" && state.selectedActionType === "MAGIC" && state.selectedIslandId) {
          const contextual = document.createElement("div");
          contextual.className = "v60-context-options magic-options";
          contextual.innerHTML = '<span>Rotation disponible</span><small>Choisissez le pivot sur l’île, puis utilisez ↺ ou ↻. Chaque clic ajoute 90°.</small>';
          els.hand.appendChild(contextual);
        }
      }

      function showActionConsumption(type, spent, remaining) {
        const feedback = document.getElementById("actionFeedback");
        const action = ACTIONS[type];
        if (!feedback || !action || spent < 1) return;
        feedback.innerHTML = `<strong>${action.icon} ${action.name}</strong><span>−${spent} · ${remaining} restante${remaining === 1 ? "" : "s"}</span>`;
        feedback.className = `action-feedback show feedback-${type.toLowerCase()}`;
        clearTimeout(showActionConsumption.timer);
        showActionConsumption.timer = setTimeout(() => {
          feedback.classList.remove("show");
        }, 2400);
      }


      function prepareActionSwitch() {
        if (!state) return false;

        if (state.inputLocked) {
          showToast("L’animation en cours doit d’abord se terminer.");
          return false;
        }

        /*
         * L'apparition du gardien après la pose d'une île reste obligatoire.
         * Toutes les autres sélections temporaires peuvent être abandonnées
         * instantanément en cliquant sur une nouvelle action.
         */
        if (state.phase === "PLACE_SPAWN") {
          showToast("Placez d’abord le nouveau gardien sur son île.");
          return false;
        }

        state.treasureDropFromId = null;
        state.treasureDropArtifactId = null;
        state.crownTransferTargetIds = [];
        state.crownPickupCell = null;
        state.crownStealTargetId = null;
        state.crownPickupArtifactId = null;

        state.selectedIslandShape = null;
        state.placementCells = null;
        state.placementOriginIndex = 0;
        state.hoverAnchor = null;

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;

        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.magicHoverPreviewCells = null;
        state.magicHoverPreviewValid = false;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;

        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        return true;
      }

      function selectCard(card) {
        selectActionBatch(card.action, 1);
      }

      function selectActionBatch(type, count) {
        if (!canLocalPlayerAct()) return;

        if (type === "PUSH") {
          beginUnifiedPushFromHud();
          return;
        }

        if (state.phase === "ACTION" && state.selectedActionType === type) {
          cancelSelectedCard();
          // Le plateau/panneau montrent déjà que l'action n'est plus active ;
          // seule la magie (pas de retour visuel équivalent) garde un toast.
          if (type === "MAGIC") showToast(`${ACTIONS[type].name} quitté.`);
          return;
        }

        const available = availableActionCount(type);
        if (available === 0) {
          showToast(`Aucune action ${ACTIONS[type].name.toLowerCase()} disponible.`);
          return;
        }

        /*
         * Cliquer sur une nouvelle action annule seulement la sélection
         * inachevée précédente. Aucune carte n'est consommée.
         */
        if (!prepareActionSwitch()) return;

        state.selectedActionType = type;
        state.selectedActionCount =
          type === "MOVE"
            ? available
            : type === "MAGIC"
              ? 1
              : Math.max(1, Math.min(count, available));
        if (type === "PUSH") state.pushForceChoice = state.selectedActionCount;
        state.selectedActionCardId = null;
        state.phase = "ACTION";

        resetKayKitPointerFeedback();
        renderAll();
        playSfx("card");

        // Déplacement/Poussée : le panneau ACTIONS et le plateau (marqueurs,
        // aperçu au survol) montrent déjà tout ce que ce toast répétait.
        // La magie n'a pas d'équivalent visuel pour l'instant, elle garde le sien.
        if (type === "MAGIC") {
          showToast("Magie activée : une seule magie permet 90°, 180°, 270° ou 360°.");
        }
      }

      function useSelectedCard(countOverride = null) {
        if (!state.selectedActionType) return;

        const type = state.selectedActionType;
        const spent = consumeAvailableActions(
          type,
          countOverride ?? selectedBatchSize()
        );

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.magicHoverPreviewCells = null;
        state.magicHoverPreviewValid = false;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        resetKayKitPointerFeedback();
        renderAll();
        showActionConsumption(type, spent, availableActionCount(type));

        if (allCardsUsed()) {
          showToast("Toutes les actions disponibles ont été utilisées.");
        }
      }

      function allCardsUsed() {
        const player = currentPlayer();
        return player.hand.every(card => card.used)
          && ["MOVE", "PUSH", "MAGIC"].every(type => storedActionCount(type, player) === 0);
      }

      function clearUnifiedPushOptions() {
        if (!state) return;
        state.pushOptions = [];
        state.pushHoverOptionId = null;
        state.pushTargetId = null;
      }

      function pushOptionKey(option) {
        return [
          option.pusherId,
          option.targetType || "character",
          option.targetId,
          option.dr,
          option.dc,
          option.force,
          option.fell ? "fall" : `${option.r},${option.c}`
        ].join(":");
      }

      function computePushOptionsForTarget(target, targetType = "character") {
        if (!state || !target || availableActionCount("PUSH") < 1) return [];
        const targetsCrown = targetType === "crown";

        const pushers = orthogonalNeighbors(target.r, target.c)
          .map(([r, c]) => characterAt(r, c))
          .filter(char =>
            char
            && char.player === state.currentPlayer
            && (targetsCrown || char.id !== target.id)
          );
        const maxForce = availableActionCount("PUSH");
        const options = [];

        pushers.forEach(pusher => {
          const dr = target.r - pusher.r;
          const dc = target.c - pusher.c;
          const requiredForce = targetsCrown ? 1 : collectPushLine(target.r, target.c, dr, dc).length;
          for (let force = Math.max(1, requiredForce); force <= maxForce; force++) {
            const preview = getPushHoverPreview({ pusher, target, force });
            if (!preview || force < preview.requiredForce) continue;
            const lead = preview.impacts?.[0];
            if (targetsCrown && !lead?.to) continue;
            options.push({
              pusherId: pusher.id,
              targetType,
              targetId: target.id,
              dr,
              dc,
              force,
              r: lead?.to?.[0] ?? null,
              c: lead?.to?.[1] ?? null,
              fell: !!lead?.fell,
              lastLandR: lead?.lastLand?.[0] ?? target.r,
              lastLandC: lead?.lastLand?.[1] ?? target.c,
              preview
            });
          }
        });

        return options;
      }

      function collectUnifiedPushOptions({
        pusherId = null,
        targetId = null
      } = {}) {
        if (!state || availableActionCount("PUSH") < 1) return [];

        const options = [];
        state.characters.forEach(target => {
          if (targetId != null && String(target.id) !== String(targetId)) return;
          computePushOptionsForTarget(target, "character").forEach(option => {
            if (pusherId != null && String(option.pusherId) !== String(pusherId)) return;
            const normalized = { ...option, id: pushOptionKey(option) };
            options.push(normalized);
          });
        });
        activeArtifacts()
          .filter(artifact => artifact.carrierId === null)
          .forEach(target => {
            if (targetId != null && String(target.id) !== String(targetId)) return;
            computePushOptionsForTarget(target, "crown").forEach(option => {
              if (pusherId != null && String(option.pusherId) !== String(pusherId)) return;
              const normalized = { ...option, id: pushOptionKey(option) };
              options.push(normalized);
            });
          });

        const unique = new Map();
        options.forEach(option => {
          if (!unique.has(option.id)) unique.set(option.id, option);
        });
        return [...unique.values()];
      }

      function beginUnifiedPushFromHud() {
        if (!state || !canLocalPlayerAct()) return;
        if (availableActionCount("PUSH") < 1) {
          showToast("Aucune poussée disponible.");
          return;
        }
        const options = collectUnifiedPushOptions();
        if (!options.length) {
          showToast("Aucune poussée possible actuellement.");
          return;
        }
        if (!prepareActionSwitch()) return;

        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.reachable = new Set();
        state.pushOptions = options;
        state.pushHoverOptionId = null;
        state.pushTargetId = null;
        renderAll();
        scheduleKayKitSync();
      }

      function beginPushAgainstTarget(target) {
        const options = collectUnifiedPushOptions({ targetId: target?.id });
        if (!options.length) return false;

        state.phase = "ACTION";
        state.selectedActionType = "PUSH";
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.reachable = new Set();
        state.pushOptions = options;
        state.pushTargetId = target.id;
        state.pushHoverOptionId = null;
        renderAll();
        scheduleKayKitSync();
        return true;
      }

      function executeUnifiedPushOption(optionId) {
        const option = state?.pushOptions?.find(item => item.id === optionId);
        if (!option) return false;

        const pusher = characterById(option.pusherId);
        const target = option.targetType === "crown"
          ? artifactById(option.targetId)
          : characterById(option.targetId);
        if (!pusher || !target) {
          clearUnifiedPushOptions();
          return false;
        }

        state.phase = "ACTION";
        state.selectedCharId = pusher.id;
        state.selectedActionType = "PUSH";
        state.selectedActionCount = option.force;
        state.actionHoverCell = [target.r, target.c];
        setPushForceChoice(option.force);
        handlePushClick(target.r, target.c);
        return true;
      }

      function directMoveCandidatesToCell(r, c) {
        const budget = availableActionCount("MOVE");
        if (budget < 1) return [];
        const destinationKey = key(r, c);

        return state.characters
          .filter(char => char.player === state.currentPlayer)
          .map(char => {
            const reachable = movementRange(char, budget);
            if (!reachable.has(destinationKey)) return null;
            const cost = reachable.costs?.get(destinationKey);
            if (!Number.isFinite(cost)) return null;
            return { char, cost, reachable };
          })
          .filter(Boolean)
          .sort((a, b) => a.cost - b.cost || String(a.char.id).localeCompare(String(b.char.id)));
      }

      function tryDirectSanctuaryMove(r, c) {
        if (!state || state.phase !== "ACTION_SELECT" || !isSanctuary(r, c)) return false;
        if (characterAt(r, c) || looseArtifactAt(r, c)) return false;

        const candidates = directMoveCandidatesToCell(r, c);
        if (!candidates.length) {
          showToast("Aucun gardien ne peut atteindre cette case.");
          return true;
        }

        const bestCost = candidates[0].cost;
        const best = candidates.filter(candidate => candidate.cost === bestCost);
        if (best.length === 1) {
          const candidate = best[0];
          state.phase = "ACTION";
          state.selectedActionType = "MOVE";
          state.selectedActionCount = candidate.cost;
          state.selectedCharId = candidate.char.id;
          state.selectedIslandId = null;
          state.reachable = candidate.reachable;
          performMoveToCell(candidate.char, r, c, candidate.reachable);
          return true;
        }

        state.pendingDirectMoveTarget = {
          r,
          c,
          cost: bestCost,
          candidateIds: best.map(candidate => candidate.char.id)
        };
        renderAll();
        scheduleKayKitSync();
        return true;
      }

      function nearestMoverForCell(r, c) {
        if (!isLand(r, c) || characterAt(r, c)) return null;
        const maxMoves = availableActionCount("MOVE");
        if (maxMoves < 1) return null;
        const options = state.characters
          .filter(char => char.player === state.currentPlayer)
          .map(char => ({ char, path: shortestMovementPath(char, r, c, maxMoves) }))
          .filter(option => option.path?.length)
          .map(option => ({
            ...option,
            cost: option.path.cost ?? option.path.length,
            distance: Math.abs(option.char.r - r) + Math.abs(option.char.c - c)
          }))
          .sort((a, b) => a.cost - b.cost || a.distance - b.distance || String(a.char.id).localeCompare(String(b.char.id)));
        return options[0] || null;
      }

      // Tous les gardiens du joueur adjacents à (r, c), triés (déterministe).
      // nearestPusherForTarget() reste un simple raccourci sur le premier —
      // utilisé là où l'ambiguïté n'a pas d'importance (ex: validité de survol).
      function pushersForTarget(r, c) {
        if (!characterAt(r, c) && !looseArtifactAt(r, c)) return [];
        return orthogonalNeighbors(r, c)
          .map(([nr, nc]) => characterAt(nr, nc))
          .filter(char => char && char.player === state.currentPlayer)
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      }

      function nearestPusherForTarget(r, c) {
        return pushersForTarget(r, c)[0] || null;
      }

      // Force minimale légale pour que `pusher` pousse la cible (r, c) — même
      // règle que dans getPushHoverPreview() (une couronne libre n'impose pas
      // d'alignement, une ligne de gardiens exige au moins sa longueur), utile
      // ici où aucune preview n'existe encore (le pousseur n'est pas déterminé).
      function requiredPushForce(pusherR, pusherC, targetR, targetC) {
        if (!characterAt(targetR, targetC)) return 1;
        const dr = targetR - pusherR, dc = targetC - pusherC;
        return Math.max(1, collectPushLine(targetR, targetC, dr, dc).length);
      }

      function handleMoveClick(r, c) {
        const clickedChar = characterAt(r, c);
        if (state.selectedCharId && clickedChar?.id === state.selectedCharId) {
          cancelSelectedCard();
          return;
        }
        if (!state.selectedCharId) {
          if (clickedChar && clickedChar.player === state.currentPlayer) {
            selectCharacterForMove(clickedChar);
            return;
          }
          const nearest = nearestMoverForCell(r, c);
          if (!nearest) {
            showToast("Aucun de vos gardiens ne peut atteindre cette case.");
            return;
          }
          state.selectedCharId = nearest.char.id;
          state.selectedIslandId = null;
          state.reachable = movementRange(nearest.char, availableActionCount("MOVE"));
          handleMoveClick(r, c);
          return;
        }
        if (clickedChar && clickedChar.player === state.currentPlayer) {
          selectCharacterForMove(clickedChar);
          return;
        }
        if (!state.reachable.has(key(r, c))) {
          showToast("Cette case n’est pas accessible.");
          return;
        }

        performMoveToCell(characterById(state.selectedCharId), r, c, state.reachable);
      }

      function performMoveToCell(char, r, c, reachable = null) {
        if (!char || characterAt(r, c) || !isLand(r, c)) return false;
        const destinationKey = key(r, c);
        const activeRange = reachable || movementRange(char, availableActionCount("MOVE"));
        if (!activeRange.has(destinationKey)) {
          showToast("Cette case n’est pas accessible.");
          return false;
        }

        const maxMoves = availableActionCount("MOVE");
        const path = shortestMovementPath(char, r, c, maxMoves);
        if (!path?.length) {
          showToast("Cette case n’est pas accessible.");
          return false;
        }

        const cost = activeRange.costs?.get(destinationKey) ?? path.cost ?? path.length;
        if (!Number.isFinite(cost) || cost < 1 || cost > maxMoves) {
          showToast("Cette case n’est pas accessible.");
          return false;
        }

        const owner = state.players[char.player];
        const from = [char.r, char.c];
        saveUndoSnapshot();
        // ~340 ms par case, plus la rotation d'anticipation absorbée en tête de
        // séquence (voir playCharacterMove). L'ancienne cadence — 680 ms minimum
        // pour une seule case — transformait chaque pas en petite cinématique et
        // ralentissait nettement un joueur expérimenté.
        const walkDuration = Math.min(1600, 140 + path.length * 340);
        // Le joueur humain regarde déjà où il clique : ne recadrer que pour l'IA.
        if (isCurrentPlayerAI()) kaykitFollowCell(r, c, { duration: Math.min(900, walkDuration) });
        // V78 (passe fluidité) : en mode 3D, plus de animateToken() HTML
        // (getBoundingClientRect/.moving-token/element.animate invisible en
        // alt mode) — queueKayKitActionAnimation() devient l'autorité visuelle
        // unique, son onComplete exécute exactement le callback de gameplay
        // qu'animateToken() portait, à la fin de la MÊME durée déjà utilisée
        // pour la séquence 3D "move" (walkDuration, inchangée) : aucun
        // changement de durée perceptible. Le fallback HTML (hors 3D) garde
        // animateToken() tel quel.
        /* Un pas par case traversée, joué PENDANT la marche et non plus une
           seule fois à l'arrivée : le trajet dure walkDuration, et n'entendre
           qu'un bruit au bout donnait un gardien qui marche en silence. */
        playMovePath(path, walkDuration);

        if (state.visualMode === "alternative") {
          state.inputLocked = true;
          queueKayKitActionAnimation(char.id, "move", walkDuration, { r, c }, path, () => {
            state.inputLocked = false;
            char.r = r;
            char.c = c;
            resolveArtifactForCharacter(char);
            triggerFx("move", [from, ...path]);
            useSelectedCard(cost);
          });
        } else {
          queueKayKitActionAnimation(char.id, "move", walkDuration, { r, c }, path);
          animateToken(from, [r, c], owner.icon, owner.color, "move", () => {
            char.r = r;
            char.c = c;
            resolveArtifactForCharacter(char);
            triggerFx("move", [from, ...path]);
            useSelectedCard(cost);
          }, false, path);
        }
        return true;
      }

      function selectCharacterForMove(char) {
        state.actionHoverCell = null;
        state.smartHoverPath = [];
        state.selectedCharId = char.id;
        state.selectedIslandId = null;
        const maxMoves = availableActionCount("MOVE");
        state.selectedActionCount = maxMoves;
        state.reachable = movementRange(char, maxMoves);
        renderAll();
        // Une contrainte réelle mérite un toast ; le mode d'emploi normal, lui,
        // se lit déjà sur les cases éclairées et l'aperçu au survol.
        if (state.reachable.size === 0) {
          showToast("Aucun déplacement possible pour ce gardien.");
        }
      }

      function movementRange(char, maxCost) {
        const startKey = key(char.r, char.c);
        const distances = new Map([[startKey, 0]]);
        const open = [{ r: char.r, c: char.c, cost: 0 }];
        const result = new Set();

        while (open.length) {
          open.sort((a, b) => a.cost - b.cost);
          const current = open.shift();
          const currentKey = key(current.r, current.c);

          if (current.cost !== distances.get(currentKey)) continue;

          for (const edge of movementEdges(current.r, current.c)) {
            if (!isLand(edge.r, edge.c)) continue;
            if (characterAt(edge.r, edge.c)) continue;

            const nextCost = current.cost + edge.cost;
            if (nextCost > maxCost) continue;

            const nextKey = key(edge.r, edge.c);
            if (nextCost >= (distances.get(nextKey) ?? Infinity)) continue;

            distances.set(nextKey, nextCost);
            result.add(nextKey);
            open.push({ r: edge.r, c: edge.c, cost: nextCost });
          }
        }

        // Même idiome que shortestMovementPath() (cost/steps accrochés au
        // tableau retourné) : le Set garde son comportement normal, avec le
        // coût par case disponible pour l'affichage au repos (voir kaykit3d.js).
        result.costs = distances;
        return result;
      }

      function removeCharacterFromGame(char, dropR = null, dropC = null, fallDirection = null) {
        if (!char) return;
        const carriedArtifact = artifactCarriedBy(char.id);
        if (carriedArtifact) {
          carriedArtifact.carrierId = null;
          if (Number.isInteger(dropR) && Number.isInteger(dropC)) {
            carriedArtifact.r = dropR;
            carriedArtifact.c = dropC;
          } else {
            resetArtifactObject(carriedArtifact);
          }
        }
        // Le gardien quitte immédiatement l'état logique — la règle est
        // appliquée sans attendre l'animation. Seul le VISUEL survit quelques
        // centaines de millisecondes, le temps de le montrer tomber vers les
        // nuages au lieu de disparaître d'un coup (voir playCharacterFall).
        queueKayKitCharacterFall(char.id, fallDirection);
        // fallDirection n'est renseigné que par une vraie chute hors du plateau
        // (voir l'appelant dans resolvePush) — jamais quand un gardien quitte le
        // jeu après avoir validé une couronne, qui a déjà son propre son.
        /* La chute est désormais le SEUL son d'une poussée qui éjecte (voir
           le garde !result.fell côté poussée). Le décalage de 230 ms ne servait
           qu'à laisser passer l'impact du coup : sans ce coup, il ne produisait
           plus qu'un blanc au moment précis de l'action. Réduit à 80 ms, la
           chute démarre pendant la réaction HIT du gardien et se déroule sur
           toute l'éjection puis la descente. */
        if (fallDirection) playSfx("fall", { c: char.c, delay: .08 });
        state.characters = state.characters.filter(ch => ch.id !== char.id);
        if (state.selectedCharId === char.id) state.selectedCharId = null;
      }

      function collectPushLine(startR, startC, dr, dc) {
        const line = [];
        let r = startR;
        let c = startC;
        while (true) {
          const ch = characterAt(r, c);
          if (!ch) break;
          line.push(ch);
          r += dr;
          c += dc;
        }
        return line;
      }

      function getPushHoverPreview(context = null) {
        const manualPush = state.phase === "ACTION" && state.selectedActionType === "PUSH";
        const smartPush = state.phase === "SMART_CHAR" && state.smartHoverType === "PUSH";
        if (!context && !((manualPush || smartPush) && state.selectedCharId && state.actionHoverCell)) {
          return null;
        }

        const pusher = context?.pusher || characterById(state.selectedCharId);
        if (!pusher) return null;

        const [targetR, targetC] = context?.target
          ? [context.target.r, context.target.c]
          : state.actionHoverCell;
        if (Math.abs(pusher.r - targetR) + Math.abs(pusher.c - targetC) !== 1) return null;

        const targetChar = characterAt(targetR, targetC);
        const targetCrown = looseArtifactAt(targetR, targetC);
        if (!targetChar && !targetCrown) return null;

        const dr = targetR - pusher.r;
        const dc = targetC - pusher.c;
        // La force minimale légale se calcule avant tout : une couronne libre
        // n'impose pas d'alignement (1 suffit toujours), une ligne de gardiens
        // exige au moins sa longueur — c'est la même règle qu'ailleurs, jamais
        // dupliquée, juste lue plus tôt pour pouvoir en faire le plancher.
        // Même précédence que la branche plus bas (if targetCrown … else …) :
        // une case avec à la fois un gardien et une couronne libre (cas limite)
        // suit la couronne, donc pas d'alignement à exiger.
        const line = targetCrown ? [] : collectPushLine(targetR, targetC, dr, dc);
        const requiredForce = targetCrown ? 1 : line.length;
        // Hors action manuelle, aucun sélecteur de force n'est affiché par défaut :
        // state.smartPushForce porte le choix explicite du joueur pour CETTE cible
        // (survolée), sinon on retombe sur le minimum légal plutôt que sur le
        // dernier choix global (qui pouvait être insuffisant pour cette cible-ci).
        const force = context
          ? Math.max(1, Math.min(availableActionCount("PUSH"), context.force || requiredForce))
          : smartPush
            ? Math.min(availableActionCount("PUSH"), Math.max(requiredForce, state.smartPushForce || requiredForce))
            : selectedBatchSize();
        const impacts = [];

        if (targetCrown) {
          const simulation = simulateLooseCrownPush(targetCrown, dr, dc, force);
          impacts.push({
            type: "crown",
            id: targetCrown.id,
            from: [targetR, targetC],
            to: simulation.moved ? [simulation.r, simulation.c] : null,
            fell: false,
            icon: "👑",
            color: "#ffd76a",
            carrying: false
          });
        } else {
          const simulated = line.map(char => ({
            char,
            r: char.r,
            c: char.c,
            alive: true,
            lastLand: [char.r, char.c]
          }));
          const fixedOccupants = new Set(
            state.characters
              .filter(char => !line.some(item => item.id === char.id))
              .map(char => key(char.r, char.c))
          );

          const previewDistance = force < requiredForce ? 0 : Math.max(1, force - requiredForce + 1);
          for (let step = 0; step < previewDistance; step++) {
            for (let i = simulated.length - 1; i >= 0; i--) {
              const item = simulated[i];
              if (!item.alive) continue;
              const nr = item.r + dr;
              const nc = item.c + dc;

              if (!inside(nr, nc) || !isLand(nr, nc)) {
                item.lastLand = [item.r, item.c];
                item.alive = false;
                continue;
              }

              const blockedByFixed = fixedOccupants.has(key(nr, nc));
              const blockedByLine = simulated.some((other, index) =>
                index !== i && other.alive && other.r === nr && other.c === nc
              );
              const blockedByCrown = !!looseArtifactAt(nr, nc);
              if (blockedByFixed || blockedByLine || blockedByCrown) continue;

              item.r = nr;
              item.c = nc;
              item.lastLand = [nr, nc];
            }
          }

          simulated.forEach(item => {
            const owner = state.players[item.char.player];
            impacts.push({
              type: "character",
              id: item.char.id,
              from: [item.char.r, item.char.c],
              to: item.alive ? [item.r, item.c] : null,
              fell: !item.alive,
              lastLand: item.lastLand,
              icon: owner.icon,
              color: owner.color,
              carrying: characterCarriesCrown(item.char.id)
            });
          });
        }

        const lead = impacts[0];
        return {
          target: [targetR, targetC],
          destination: lead?.to || null,
          fell: !!lead?.fell,
          icon: lead?.icon || "👑",
          color: lead?.color || "#ffd76a",
          carrying: !!lead?.carrying,
          lineCount: impacts.length,
          impacts,
          direction: [dr, dc],
          force,
          requiredForce
        };
      }

      function handlePushClick(r, c) {
        const clickedChar = characterAt(r, c);
        if (state.selectedCharId && clickedChar?.id === state.selectedCharId) {
          cancelSelectedCard();
          return;
        }
        if (!state.selectedCharId) {
          if (clickedChar && clickedChar.player === state.currentPlayer) {
            state.actionHoverCell = null;
            state.selectedCharId = clickedChar.id;
            state.reachable = new Set(orthogonalNeighbors(r, c).map(([nr, nc]) => key(nr, nc)));
            renderAll();
            return;
          }
          const pushers = pushersForTarget(r, c);
          if (!pushers.length) {
            showToast("Aucun de vos gardiens n’est adjacent à cette cible.");
            return;
          }
          if (pushers.length > 1) {
            // Plusieurs gardiens à égalité : on n'en choisit pas un à la place
            // du joueur, on les met en évidence et on attend son clic.
            state.actionHoverCell = null;
            state.selectedCharId = null;
            state.reachable = new Set(pushers.map(p => key(p.r, p.c)));
            renderAll();
            showToast("Plusieurs gardiens peuvent pousser cette cible : cliquez celui qui doit agir.");
            return;
          }
          const nearest = pushers[0];
          state.selectedActionCount = Math.min(
            availableActionCount("PUSH"),
            Math.max(requiredPushForce(nearest.r, nearest.c, r, c), state.pushForceChoice || 1)
          );
          state.actionHoverCell = null;
          state.selectedCharId = nearest.id;
          state.reachable = new Set(orthogonalNeighbors(nearest.r, nearest.c).map(([nr, nc]) => key(nr, nc)));
          handlePushClick(r, c);
          return;
        }

        const pusher = characterById(state.selectedCharId);
        const distance = Math.abs(pusher.r - r) + Math.abs(pusher.c - c);
        const targetChar = characterAt(r, c);
        const targetArtifact = looseArtifactAt(r, c);

        if (distance !== 1 || (!targetChar && !targetArtifact)) {
          if (clickedChar && clickedChar.player === state.currentPlayer) {
            state.actionHoverCell = null;
            state.selectedCharId = clickedChar.id;
            state.reachable = new Set(orthogonalNeighbors(r, c).map(([nr, nc]) => key(nr, nc)));
            renderAll();
          } else showToast("La cible doit être adjacente.");
          return;
        }

        const dr = r - pusher.r;
        const dc = c - pusher.c;
        const force = selectedBatchSize();
        if (targetChar) {
          const requiredForce = collectPushLine(r, c, dr, dc).length;
          if (force < requiredForce) {
            showToast(`Force ${requiredForce} requise pour pousser ${requiredForce} personnage${requiredForce > 1 ? "s" : ""} aligné${requiredForce > 1 ? "s" : ""}.`);
            return;
          }
        }
        saveUndoSnapshot();
        queueKayKitActionAnimation(pusher.id, "attack", 900, { r, c });
        if (targetChar) queueKayKitActionAnimation(targetChar.id, "hurt", 850, { r: pusher.r, c: pusher.c });
        const result = targetChar ? pushCharacter(targetChar, dr, dc, force, r, c) : pushLooseArtifact(targetArtifact, dr, dc, force, r, c);
        if (!result) discardLastUndoSnapshot();
        if (!result) return;

        // Une poussée (surtout une chute) mérite d'être vue même par le joueur
        // qui vient de cliquer : impact souvent hors de son cadrage actuel.
        const impactCell = result.to || result.from;
        kaykitFollowCell(impactCell[0], impactCell[1], { duration: 680, zoomBoost: result.fell ? 1.6 : 0 });

        // V78 (passe fluidité) : plus de animateToken() HTML en mode 3D — la
        // résolution logique (fx/sfx/carte consommée) est signalée par une
        // entrée dédiée de queueKayKitActionAnimation (id synthétique, sans
        // aucun visuel propre : ne collisionne pas avec les entrées "attack"/
        // "hurt" ci-dessus, qui gardent leurs animations 3D inchangées),
        // après le MÊME délai qu'animateToken() utilisait pour push/chute
        // (360/520 ms) : aucun changement de durée perceptible. Le fallback
        // HTML (hors 3D) garde animateToken() tel quel.
        /* Le son du coup part MAINTENANT, pas à la fin de l'animation : il y
           était joué 360 à 520 ms après le son de chute, lequel est déclenché
           en amont pendant pushCharacter(). On entendait donc tomber avant
           d'entendre frapper.

           Et quand la poussée fait tomber quelqu'un, le coup n'est PAS joué :
           la chute raconte déjà l'action à elle seule, et les deux sons
           empilés donnaient exactement la superposition que ce correctif
           cherche à supprimer. */
        if (!result.fell) playSfx("push", { c: impactCell[1] });

        if (state.visualMode === "alternative") {
          state.inputLocked = true;
          queueKayKitActionAnimation(`__push-complete-${pusher.id}__`, "none", result.fell ? 520 : 360, null, null, () => {
            state.inputLocked = false;
            triggerFx("push", [result.from, result.to]);
            useSelectedCard();
          });
        } else {
          animateToken(result.from, result.to, result.icon, result.color, "push", () => {
            triggerFx("push", [result.from, result.to]);
            useSelectedCard();
          }, result.fell);
        }
      }

      function pushCharacter(target, dr, dc, force, originR, originC) {
        const line = collectPushLine(target.r, target.c, dr, dc);
        if (!line.length) return false;

        const leadFrom = [target.r, target.c];
        const leadOwner = state.players[target.player];
        let anyMoved = false;
        let anyFell = false;
        let removedCount = 0;
        const movedIds = new Set();

        const requiredForce = line.length;
        if (force < requiredForce) {
          showToast(`Force ${requiredForce} requise pour pousser cette ligne.`);
          return false;
        }
        const pushDistance = Math.max(1, force - requiredForce + 1);
        for (let step = 0; step < pushDistance; step++) {
          for (let i = line.length - 1; i >= 0; i--) {
            const ch = line[i];
            if (!state.characters.some(existing => existing.id === ch.id)) continue;

            const nextR = ch.r + dr;
            const nextC = ch.c + dc;

            if (!inside(nextR, nextC) || !isLand(nextR, nextC)) {
              anyFell = true;
              removedCount++;
              // La case du vide visée est transmise au visuel : le gardien la
              // rejoint d'abord, puis tombe DEPUIS elle. Sans cette destination,
              // il s'enfonçait à la verticale depuis sa case actuelle et
              // traversait l'île sur laquelle il se tenait encore.
              removeCharacterFromGame(ch, ch.r, ch.c, { dr, dc, toR: nextR, toC: nextC });
              continue;
            }

            const blocker = characterAt(nextR, nextC);
            if (blocker) continue;

            ch.r = nextR;
            ch.c = nextC;
            anyMoved = true;
            movedIds.add(ch.id);
            resolveArtifactForCharacter(ch);
          }
        }

        if (!anyMoved && !anyFell) {
          showToast("La poussée est bloquée.");
          return false;
        }

        const leadStillThere = state.characters.find(existing => existing.id === target.id);
        const impacted = movedIds.size + removedCount;
        if (removedCount && movedIds.size) {
          showToast(`${impacted} gardien${impacted > 1 ? "s" : ""} décalé${impacted > 1 ? "s" : ""}, dont ${removedCount} retiré${removedCount > 1 ? "s" : ""} du jeu.`);
        } else if (removedCount) {
          showToast(`${removedCount} gardien${removedCount > 1 ? "s" : ""} retiré${removedCount > 1 ? "s" : ""} du jeu.`);
        } else {
          showToast(`${impacted} gardien${impacted > 1 ? "s" : ""} repoussé${impacted > 1 ? "s" : ""} de ${pushDistance} case${pushDistance > 1 ? "s" : ""}.`);
        }

        return {
          from: leadFrom,
          to: leadStillThere ? [leadStillThere.r, leadStillThere.c] : leadFrom,
          icon: leadOwner.icon,
          color: leadOwner.color,
          fell: !leadStillThere || anyFell
        };
      }

      function pushLooseArtifact(artifact, dr, dc, force, originR, originC) {
        if (!artifact) return false;

        const from = [artifact.r, artifact.c];
        const simulation = simulateLooseCrownPush(
          artifact,
          dr,
          dc,
          force,
          artifact.r,
          artifact.c
        );

        if (!simulation.valid) {
          artifact.r = originR;
          artifact.c = originC;

          if (simulation.reason === "blocked") {
            showToast("La trajectoire de la couronne est bloquée.");
          } else if (simulation.reason === "outside") {
            showToast("La force choisie envoie la couronne hors du plateau.");
          } else {
            showToast("Choisissez une force qui fait atterrir la couronne sur une île.");
          }
          return false;
        }

        artifact.r = simulation.r;
        artifact.c = simulation.c;

        if (simulation.crossedVoid) {
          showToast(
            `La couronne survole le vide et atterrit à ${simulation.moved} case${simulation.moved > 1 ? "s" : ""}.`
          );
        } else {
          showToast(
            `Couronne repoussée de ${simulation.moved} case${simulation.moved > 1 ? "s" : ""}.`
          );
        }

        return {
          from,
          to: [artifact.r, artifact.c],
          icon: "👑",
          color: "#ffd76a",
          fell: false
        };
      }

      function respawnCharacter(char) {
        const village = state.players[char.player].village;
        const spot = findNearestFreeLand(village.r, village.c);
        char.r = spot.r;
        char.c = spot.c;
      }

      function findNearestFreeLand(startR, startC) {
        const queue = [[startR, startC]];
        const visited = new Set([key(startR, startC)]);
        while (queue.length) {
          const [r, c] = queue.shift();
          if (isLand(r, c) && !characterAt(r, c)) return { r, c };
          for (const [nr, nc] of orthogonalNeighbors(r, c)) {
            const k = key(nr, nc);
            if (!visited.has(k)) {
              visited.add(k);
              queue.push([nr, nc]);
            }
          }
        }
        return { r: startR, c: startC };
      }


      function calculateIslandRotationAroundPivot(island, pivotR, pivotC, direction, turns = 1) {
        let currentAbs = island.cells.map(([r, c]) => [r, c]);
        let currentCharacters = state.characters
          .filter(ch => currentAbs.some(([ir, ic]) => ir === ch.r && ic === ch.c))
          .map(ch => ({ char: ch, r: ch.r, c: ch.c }));
        let currentArtifacts = activeArtifacts()
          .filter(artifact =>
            artifact.carrierId === null
            && currentAbs.some(([ir, ic]) => ir === artifact.r && ic === artifact.c)
          )
          .map(artifact => ({ artifact, r: artifact.r, c: artifact.c }));

        // L'île est soulevée pendant la rotation : seul l'emplacement final est contrôlé.
        for (let turn = 0; turn < turns; turn++) {
          const nextAbs = currentAbs.map(([r, c]) => {
            const dr = r - pivotR;
            const dc = c - pivotC;
            return direction === 1 ? [pivotR + dc, pivotC - dr] : [pivotR - dc, pivotC + dr];
          });

          currentCharacters = currentCharacters.map(item => {
            const idx = currentAbs.findIndex(([r, c]) => r === item.r && c === item.c);
            const [nr, nc] = nextAbs[idx];
            return { char: item.char, r: nr, c: nc };
          });
          currentArtifacts = currentArtifacts.map(item => {
            const idx = currentAbs.findIndex(([r, c]) => r === item.r && c === item.c);
            const [nr, nc] = nextAbs[idx];
            return { artifact: item.artifact, r: nr, c: nc };
          });
          currentAbs = nextAbs;
        }

        if (currentAbs.some(([r, c]) => !inside(r, c))) {
          return { valid: false, absCells: currentAbs, reason: "l’arrivée ferait sortir l’île du plateau." };
        }

        const otherCells = new Set();
        for (const other of state.islands) {
          if (other.id === island.id) continue;
          for (const [r, c] of other.cells) otherCells.add(key(r, c));
        }
        if (currentAbs.some(([r, c]) => otherCells.has(key(r, c)) || villageAt(r, c) || isSanctuary(r, c))) {
          return { valid: false, absCells: currentAbs, reason: "l’arrivée chevauche un autre terrain." };
        }

        const movingIds = new Set(currentCharacters.map(item => item.char.id));
        for (const move of currentCharacters) {
          const blocker = characterAt(move.r, move.c);
          if (blocker && !movingIds.has(blocker.id)) {
            return { valid: false, absCells: currentAbs, reason: "un gardien occupe la zone d’arrivée." };
          }
        }

        const minR = Math.min(...currentAbs.map(cell => cell[0]));
        const minC = Math.min(...currentAbs.map(cell => cell[1]));
        return {
          valid: true,
          absCells: currentAbs,
          relCells: currentAbs.map(([r, c]) => [r - minR, c - minC]),
          anchor: { r: minR, c: minC },
          characterMoves: currentCharacters,
          artifactMoves: currentArtifacts
        };
      }

      // Aperçu au simple survol, avant tout clic de pivot : pas de rotation,
      // juste la forme actuelle de l'île survolée. Sert d'identification
      // visuelle (remplace le surlignage de case classique, peu visible en
      // 3D) — pas un aperçu de résultat. Le vrai aperçu de rotation
      // (updateMagicPreview ci-dessous) prend le relais dès qu'une île est
      // confirmée par un clic et qu'on tourne réellement.
      function updateMagicHoverPreview() {
        state.magicHoverPreviewCells = null;
        state.magicHoverPreviewValid = false;

        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;
        if (state.selectedIslandId) return;
        if (!state.magicHoverIslandId) return;

        const island = state.islands.find(is => is.id === state.magicHoverIslandId);
        if (!island) return;

        state.magicHoverPreviewCells = island.cells.map(([r, c]) => [r, c]);
        state.magicHoverPreviewValid = true;
      }

      function updateMagicPreview() {
        state.magicPreviewCells = null;
        state.magicPreviewValid = false;

        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;
        if (!state.selectedIslandId || !state.selectedMagicPivot) return;

        const island = state.islands.find(is => is.id === state.selectedIslandId);
        if (!island) return;

        const steps = ((state.magicPreviewSteps || 0) % 5 + 5) % 5;
        if (steps === 0) {
          state.magicPreviewCells = island.cells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = true;
          return;
        }
        if (steps === 4) {
          state.magicPreviewCells = island.cells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = true;
          return;
        }

        const direction = steps === 3 ? -1 : 1;
        const turns = steps === 3 ? 1 : steps;

        const rotation = calculateIslandRotationAroundPivot(
          island,
          state.selectedMagicPivot[0],
          state.selectedMagicPivot[1],
          direction,
          turns
        );

        if (rotation.valid) {
          state.magicPreviewCells = rotation.absCells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = true;
        } else {
          state.magicPreviewCells = rotation.absCells ? rotation.absCells.map(([r, c]) => [r, c]) : island.cells.map(([r, c]) => [r, c]);
          state.magicPreviewValid = false;
        }
      }

      function confirmMagicRotation() {
        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;

        const island = state.islands.find(is => is.id === state.selectedIslandId);
        const steps = ((state.magicPreviewSteps % 5) + 5) % 5;

        if (!island || !state.selectedMagicPivot || !steps) {
          showToast("Choisissez une case pivot puis utilisez la roulette.");
          return;
        }

        if (steps === 4) {
          queueKayKitCurrentPlayerAnimation("magic", 1050);
          animateBoardMagic();
          playSfx("magic");
          showToast("Rotation complète de 360° pour 1 magie.");
          useSelectedCard(1);
          return;
        }

        const direction = steps === 3 ? -1 : 1;
        const turns = steps === 3 ? 1 : steps;

        const rotation = calculateIslandRotationAroundPivot(
          island,
          state.selectedMagicPivot[0],
          state.selectedMagicPivot[1],
          direction,
          turns
        );

        if (!rotation.valid) {
          showToast(`Rotation impossible : ${rotation.reason}`);
          return;
        }

        saveUndoSnapshot();
        const [pivotR, pivotC] = state.selectedMagicPivot;
        // Rotation réellement effectuée, signée : un cran « 3 » est un quart de
        // tour en arrière (-90°), pas trois quarts de tour en avant. Le plateau
        // DOM continue d'afficher 270° ; la 3D, elle, doit montrer le mouvement
        // le plus court, sinon l'île part dans le sens opposé au résultat.
        const signedDegrees = direction * turns * 90;
        queueKayKitCurrentPlayerAnimation("magic", 1150, { r: pivotR, c: pivotC });
        const caster = state.selectedCharId ? characterById(state.selectedCharId) : null;
        const casterId = caster?.id
          ?? state.characters.find(character => character.player === state.currentPlayer)?.id;
        if (casterId != null) linkCasterToIsland(casterId, pivotR, pivotC);
        playIslandMagicRotation(island.id, signedDegrees, pivotR, pivotC, 500);
        state.inputLocked = true;
        showToast("L’île se soulève avant de tourner…");
        playSfx("magic");

        animateIslandLiftRotation(island.id, steps * 90, () => {
          if (!state || state.winner !== null) return;
          island.cells = rotation.absCells;
          island.relCells = rotation.relCells;
          island.anchor = rotation.anchor;

          for (const move of rotation.characterMoves) {
            move.char.r = move.r;
            move.char.c = move.c;
          }
          for (const move of rotation.artifactMoves || []) {
            move.artifact.r = move.r;
            move.artifact.c = move.c;
          }

          state.inputLocked = false;
          animateBoardMagic();
          showToast(`Île tournée de ${steps * 90}° pour 1 magie : seule l’arrivée doit être libre.`);
          useSelectedCard(1);
        });
      }

      /*
       * Règle « dissoudre une île » : 1 magie retire du plateau une île
       * entièrement vide (aucun gardien, aucune couronne dessus). Simple et
       * équilibré — ça coûte la même ressource rare qu'une rotation, et
       * l'impossibilité de cibler une île occupée exclut tout usage pour
       * capturer ou piéger un gardien : on ne peut dissoudre que du terrain
       * inutilisé.
       */
      function islandIsEmpty(island) {
        if (!island) return false;
        return island.cells.every(([r, c]) => !characterAt(r, c) && !looseArtifactAt(r, c));
      }

      function canDissolveSelectedIsland() {
        if (!state.rules?.allowDissolve) return false;
        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return false;
        if (!state.selectedIslandId) return false;
        return islandIsEmpty(state.islands.find(is => is.id === state.selectedIslandId));
      }

      function dissolveSelectedIsland() {
        if (!state.rules?.allowDissolve) {
          showToast("La dissolution d’île n’est pas activée pour cette partie.");
          return;
        }
        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;
        const island = state.islands.find(is => is.id === state.selectedIslandId);
        if (!island) {
          showToast("Choisissez d’abord une case pivot sur une île.");
          return;
        }
        if (!islandIsEmpty(island)) {
          showToast("Cette île n’est pas vide : impossible de la dissoudre.");
          return;
        }
        if (availableActionCount("MAGIC") < 1) {
          showToast("Aucune magie disponible.");
          return;
        }

        saveUndoSnapshot();
        const cells = island.cells.map(([ir, ic]) => [ir, ic]);
        state.islands = state.islands.filter(is => is.id !== island.id);
        cells.forEach(([ir, ic]) => animateCellPulse(ir, ic, "magic-vanish"));

        if (kaykit3D) {
          const avgR = cells.reduce((sum, [ir]) => sum + ir, 0) / cells.length;
          const avgC = cells.reduce((sum, [, ic]) => sum + ic, 0) / cells.length;
          const p = kaykitCellPosition(avgR, avgC, KAYKIT_LEVELS.islandTop + .1);
          spawnGroundBurst(p, new THREE.Color(0xa86df2), { radius: .55, duration: 620 });
          kaykit3D.lastStateSignature = "";
        }

        playSfx("magic");
        showToast("Île dissoute pour 1 magie : elle retourne au vide.");
        scheduleKayKitSync();
        useSelectedCard(1);
      }

      function handleMagicClick(r, c) {
        if (state.magicPreviewCells && state.magicPreviewSteps && cellInPreviewSet(state.magicPreviewCells, r, c)) {
          confirmMagicRotation();
          return;
        }

        if (state.selectedMagicPivot && isSameCell(state.selectedMagicPivot, [r, c])) {
          cancelSelectedCard();
          showToast("Magie quittée.");
          return;
        }

        const island = islandAt(r, c);

        if (!island) {
          showToast("Choisissez une case appartenant à une île.");
          return;
        }

        if (state.selectedIslandId !== island.id || !isSameCell(state.selectedMagicPivot, [r, c])) {
          state.selectedIslandId = island.id;
          state.selectedMagicPivot = [r, c];
          state.magicHoverIslandId = null;
          state.magicHoverPivot = null;
          state.magicHoverPreviewCells = null;
          state.magicHoverPreviewValid = false;
          state.selectedCharId = null;
          state.reachable = new Set();
          state.magicPreviewDirection = 0;
          state.magicPreviewSteps = 0;
          state.magicPreviewCells = island.cells.map(([ir, ic]) => [ir, ic]);
          state.magicPreviewValid = true;
          renderAll();
          showToast("Pivot sélectionné : utilisez la roulette ou les boutons ↺ ↻. La forme 3D affichée sera la position finale.");
          return;
        }

        if (state.magicPreviewSteps) {
          confirmMagicRotation();
        } else {
          showToast("Tournez d’abord l’île pour prévisualiser sa nouvelle position.");
        }
      }

      function rotateSelectedIsland(direction) {
        if (state.phase === "PLACE_ISLAND" && state.placementCells) {
          const origin = state.placementCells[state.placementOriginIndex] || state.placementCells[0] || [0, 0];
          let rotated = state.placementCells.map(([r, c]) => {
            const dr = r - origin[0];
            const dc = c - origin[1];
            return direction === 1
              ? [origin[0] + dc, origin[1] - dr]
              : [origin[0] - dc, origin[1] + dr];
          });

          // recentre uniquement visuellement pour garder de petites coordonnées,
          // sans casser le fait que la souris reste sur une case de l'île.
          const minR = Math.min(...rotated.map(c => c[0]));
          const minC = Math.min(...rotated.map(c => c[1]));
          rotated = rotated.map(([r, c]) => [r - minR, c - minC]);
          const oldOrigin = rotated[state.placementOriginIndex];
          if (!oldOrigin) {
            state.placementOriginIndex = 0;
          } else {
            // conserver le même index d'origine après recentrage
            state.placementOriginIndex = Math.max(0, state.placementOriginIndex);
          }
          state.placementCells = rotated;
          // Purement informatif (panneau "Rotation : X°") : ne change rien à la
          // forme réellement posée, déjà entièrement portée par placementCells.
          state.placementRotationSteps = ((state.placementRotationSteps || 0) + direction + 4) % 4;
          renderTurnContext();

          if (state.hoverAnchor) {
            updatePlacementPreview(state.hoverAnchor[0], state.hoverAnchor[1]);
            if (kaykit3D) {
              kaykit3D.lastStateSignature = "";
              scheduleKayKitSync();
            }
            playSfx("rotate");
          } else {
            renderBoard();
            scheduleKayKitSync();
          }
          return;
        }

        if (!(state.phase === "ACTION" && state.selectedActionType === "MAGIC")) return;

        if (!state.selectedIslandId || !state.selectedMagicPivot) {
          showToast("Cliquez d’abord sur une case de l’île à faire tourner.");
          return;
        }

        let nextSteps = ((state.magicPreviewSteps || 0) + direction) % 5;
        if (nextSteps < 0) nextSteps = 4;

        state.magicPreviewSteps = nextSteps;
        updateMagicPreview();
        renderAll();
        playSfx("rotate");

        if (!nextSteps) {
          showToast("Rotation remise à 0°.");
        } else if (state.magicPreviewValid) {
          showToast(`Aperçu : ${nextSteps * 90}°. Cliquez sur une case de l’aperçu pour valider.`);
        } else {
          showToast("Cette rotation est impossible depuis cette case pivot.");
        }
      }

      // Miroir horizontal de l'île en cours de pose : la rotation seule ne
      // peut pas transformer une forme chirale (ex. le "Serpent" en S) en son
      // symétrique (en Z) — il faut un vrai flip. Uniquement disponible en
      // pose (pas de flip sur une île déjà posée via la magie).
      function flipSelectedIsland() {
        if (!(state.phase === "PLACE_ISLAND" && state.placementCells)) return;

        const origin = state.placementCells[state.placementOriginIndex] || state.placementCells[0] || [0, 0];
        let flipped = state.placementCells.map(([r, c]) => [r, origin[1] - (c - origin[1])]);

        // recentre pour garder de petites coordonnées, comme rotateSelectedIsland.
        const minR = Math.min(...flipped.map(c => c[0]));
        const minC = Math.min(...flipped.map(c => c[1]));
        flipped = flipped.map(([r, c]) => [r - minR, c - minC]);
        state.placementCells = flipped;

        if (state.hoverAnchor) {
          updatePlacementPreview(state.hoverAnchor[0], state.hoverAnchor[1]);
          if (kaykit3D) {
            kaykit3D.lastStateSignature = "";
            scheduleKayKitSync();
          }
          playSfx("rotate");
        } else {
          renderBoard();
          scheduleKayKitSync();
        }
      }

      function calculateIslandRotation(island, direction) {
        const oldRel = island.relCells;
        const newRel = rotateCells(oldRel, direction, false);
        const absCells = newRel.map(([dr, dc]) => [island.anchor.r + dr, island.anchor.c + dc]);

        if (absCells.some(([r, c]) => !inside(r, c))) {
          return { valid: false, reason: "La rotation ferait sortir l'île du plateau." };
        }

        const otherCells = new Set();
        for (const other of state.islands) {
          if (other.id === island.id) continue;
          for (const [r, c] of other.cells) otherCells.add(key(r, c));
        }
        if (absCells.some(([r, c]) => otherCells.has(key(r, c)) || villageAt(r, c) || isSanctuary(r, c))) {
          return { valid: false, reason: "La rotation chevauche un autre terrain." };
        }

        const oldIndex = new Map(oldRel.map(([dr, dc], i) => [key(island.anchor.r + dr, island.anchor.c + dc), i]));
        const charsOnIsland = state.characters.filter(ch => oldIndex.has(key(ch.r, ch.c)));
        const movingIds = new Set(charsOnIsland.map(ch => ch.id));
        const characterMoves = charsOnIsland.map(ch => {
          const idx = oldIndex.get(key(ch.r, ch.c));
          const [nr, nc] = absCells[idx];
          return { char: ch, r: nr, c: nc };
        });

        for (const move of characterMoves) {
          const blocker = characterAt(move.r, move.c);
          if (blocker && !movingIds.has(blocker.id)) {
            return { valid: false, reason: "Un gardien bloque la rotation." };
          }
        }

        let artifactMove = null;
        if (state.artifact.carrierId === null) {
          const idx = oldIndex.get(key(state.artifact.r, state.artifact.c));
          if (idx !== undefined) {
            artifactMove = { r: absCells[idx][0], c: absCells[idx][1] };
          }
        }

        return { valid: true, relCells: newRel, absCells, characterMoves, artifactMove };
      }

      function cancelSelectedCard() {
        if (state.phase !== "ACTION") return;
        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;
        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.magicHoverIslandId = null;
        state.magicHoverPivot = null;
        state.magicHoverPreviewCells = null;
        state.magicHoverPreviewValid = false;
        state.actionHoverCell = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        clearMagicPreview();
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";
        resetKayKitPointerFeedback();
        renderAll();
      }

      function renderScores() {
        // HUD V2 (Prompt 3/3) : #scoreList a été supprimé (remplacé par les
        // couronnes compactes de #hudV2Top) — cette fonction n'a plus de
        // cible et ne fait plus rien, sans casser availableActionCount() ni
        // les autres lectures qui en dépendent ailleurs.
        if (!els.scoreList) return;
        els.scoreList.innerHTML = "";
        state.players.forEach((p, i) => {
          const card = document.createElement("div");
          card.className = "score-card"
            + (i === state.currentPlayer ? " active" : "")
            + (state.scoreAnimationPlayerId === p.id ? " score-updated" : "");
          card.style.setProperty("--pcolor", p.color);
          card.innerHTML = `
          <strong>
            <span class="name-wrap" data-icon="${p.icon}"><span>${p.name}</span></span>
            <span class="score-value">${p.score}/3</span>
          </strong>
          <div class="score-actions" aria-label="Stock d’actions de ${p.name}">
            <span title="Déplacements disponibles"><em>D</em><b>${availableActionCount("MOVE", p)}</b></span>
            <span title="Poussées disponibles"><em>P</em><b>${availableActionCount("PUSH", p)}</b></span>
            <span title="Magies disponibles"><em>M</em><b>${availableActionCount("MAGIC", p)}</b></span>
          </div>
          <small>${state.characters.filter(ch => ch.player === p.id).length} gardien(s)</small>
        `;
          els.scoreList.appendChild(card);
        });
      }


      function renderDeckDisplay() {
        if (!els.deckDisplay) return;

        const p = currentPlayer();
        const deckLeft = p.deck.length;
        const discardCount = p.discard.length;
        const mode = state.deckAnimationMode || "";
        const visibleCards = (p.hand || []).slice(0, 5);

        const cards = visibleCards.map((card, index) => `
        <span
          class="v64-mini-card action-${card.action.toLowerCase()} ${mode === "deal" ? "deal-card" : ""} ${mode === "discard" ? "discard-card" : ""}"
          style="--card-index:${index}"
          title="${ACTIONS[card.action].name}"
          aria-label="${ACTIONS[card.action].name}"
        ></span>
      `).join("");

        const lastDiscard = p.discard?.[p.discard.length - 1];
        const lastDiscardLabel = lastDiscard ? ACTIONS[lastDiscard.action]?.name : "Aucune";
        els.deckDisplay.innerHTML = `
        <div class="v64-deck-summary v66-deck-summary" aria-label="Pioche, main et défausse">
          <span class="v64-deck-count"><b>${deckLeft}</b><small>Pioche</small></span>
          <div class="v64-mini-hand" aria-label="${p.hand.length} cartes en main">
            <small class="v64-mini-hand-label">Main · ${p.hand.length}</small>
            ${cards || `<small class="v64-mini-hand-empty">Nouvelle main au prochain tour</small>`}
          </div>
          <span class="v64-deck-count" title="Dernière défausse : ${lastDiscardLabel}"><b>${discardCount}</b><small>Défausse</small></span>
        </div>
      `;
      }

      function renderStats() {
        const p = currentPlayer();
        els.deckCount.textContent = p.deck.length;
        els.handCount.textContent = p.hand.length;
        els.discardCount.textContent = p.discard.length;
        els.islandCount.textContent = state.islands.filter(is => is.owner === p.id).length;
      }

      function renderControls() {
        const aiLocked = isCurrentPlayerAI()
          || state.aiThinking
          || (state.onlineMode && !canLocalPlayerAct());
        const canRotatePlacement = !aiLocked && state.phase === "PLACE_ISLAND";
        const canRotateMagic = !aiLocked && state.phase === "ACTION" && state.selectedActionType === "MAGIC" && !!state.selectedIslandId && !!state.selectedMagicPivot;
        const canCancel = !aiLocked && (state.phase === "PLACE_ISLAND" || state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType) || state.phase === "DROP_TREASURE" || state.phase === "PICKUP_CROWN" || !!state.undoHistory?.length);
        const canEndFromSelection = state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType);
        const canEnd = state.islandPlacedThisTurn && (state.phase === "ACTION_SELECT" || canEndFromSelection);
        els.rotateLeftBtn.disabled = !(canRotatePlacement || canRotateMagic);
        els.rotateRightBtn.disabled = !(canRotatePlacement || canRotateMagic);
        // Le miroir n'a de sens que pour une forme chirale (ex. Serpent) : les
        // autres formes n'ont rien à retourner, le bouton reste donc masqué.
        const currentShapeFlippable = !!(state.selectedIslandShape && SHAPES[state.selectedIslandShape]?.flippable);
        const canFlipPlacement = canRotatePlacement && currentShapeFlippable;
        if (els.flipBtn) {
          els.flipBtn.disabled = !canFlipPlacement;
          els.flipBtn.classList.toggle("hidden", !currentShapeFlippable);
        }
        const islandRotate = document.getElementById("hudV2IslandRotate");
        if (islandRotate) {
          islandRotate.classList.toggle("hidden", !canRotatePlacement);
          islandRotate.setAttribute("aria-hidden", canRotatePlacement ? "false" : "true");
        }
        els.cancelCardBtn.disabled = !canCancel;
        // Désélectionner (rien n'est encore consommé) et annuler la dernière
        // action (undoHistory réellement non vide) sont deux idées différentes :
        // le libellé du bouton ne doit jamais les confondre.
        if (state.phase === "PLACE_ISLAND") {
          els.cancelCardBtn.textContent = "Changer d’île";
          els.cancelCardBtn.title = "Quitter le placement sans poser cette île";
        } else if (state.phase === "ACTION" && state.selectedActionType) {
          els.cancelCardBtn.textContent = "Quitter l’action";
          els.cancelCardBtn.title = `Quitter ${ACTIONS[state.selectedActionType].name.toLowerCase()} sans consommer d’action`;
        } else if (state.phase === "SMART_CHAR") {
          els.cancelCardBtn.textContent = "Désélectionner";
          els.cancelCardBtn.title = "Désélectionner ce gardien";
        } else if (["DROP_TREASURE", "PICKUP_CROWN"].includes(state.phase)) {
          els.cancelCardBtn.textContent = "Quitter le choix";
          els.cancelCardBtn.title = "Revenir au choix des actions";
        } else if (state.undoHistory?.length) {
          els.cancelCardBtn.textContent = state.undoHistory.length > 1
            ? `↶ Annuler dernière action (${state.undoHistory.length})`
            : "↶ Annuler dernière action";
          els.cancelCardBtn.title = "Revenir avant la dernière action exécutée";
        } else {
          els.cancelCardBtn.textContent = "Annuler";
          els.cancelCardBtn.title = "";
        }
        els.endTurnBtn.disabled = aiLocked || !canEnd;
        els.endTurnBtn.classList.toggle("selection-will-cancel", canEndFromSelection && canEnd);
        // Prêt à conclure : île posée, aucune sélection en cours à abandonner.
        // Légère mise en avant, jamais un second libellé — le bouton reste
        // toujours "Fin du tour" (voir title pour la raison d'un blocage).
        els.endTurnBtn.classList.toggle("end-turn-ready", canEnd && state.phase === "ACTION_SELECT");
        els.endTurnBtn.textContent = "Fin du tour";
        if (!state.islandPlacedThisTurn) {
          els.endTurnBtn.title = "Posez d’abord une île.";
        } else if (state.phase === "PLACE_SPAWN") {
          els.endTurnBtn.title = "Terminez d’abord l’invocation obligatoire.";
        } else if (["DROP_TREASURE", "PICKUP_CROWN"].includes(state.phase)) {
          els.endTurnBtn.title = "Terminez ou quittez d’abord ce choix.";
        } else {
          els.endTurnBtn.title = canEndFromSelection ? "La sélection en cours sera simplement abandonnée." : "Terminer le tour.";
        }
      }

      function renderUnitCard() {
        const ch = characterById(state.selectedCharId);
        if (ch) {
          const p = state.players[ch.player];
          els.unitCard.classList.remove("empty");
          els.unitCard.innerHTML = `
          <div class="big-icon">${p.icon}</div>
          <p><b style="color:${p.color}">Gardien de ${p.name}</b></p>
          <p>Déplacement : 1 case orthogonale par action</p>
          <p>Poussée : toutes les cibles alignées glissent du nombre de poussées jouées</p>
          <p>${characterCarriesCrown(ch.id) ? "Porte une couronne" : "Gardien standard"}</p>
        `;
          return;
        }

        const island = state.islands.find(is => is.id === state.selectedIslandId);
        if (island) {
          const owner = state.players[island.owner];
          els.unitCard.classList.remove("empty");
          els.unitCard.innerHTML = `
          <div class="big-icon">🏝️</div>
          <p><b>Île</b></p>
          <p>Propriétaire : <span style="color:${owner.color}">${owner.name}</span></p>
          <p>Taille : ${island.cells.length} case(s)</p>
          <p>Magie : choisissez une case pivot, tournez avec la molette / Q / E, puis cliquez sur l’aperçu.</p>
        `;
          return;
        }

        els.unitCard.classList.add("empty");
        els.unitCard.innerHTML = `
        <div class="big-icon">☁️</div>
        <p>Sélectionnez un gardien ou une île pour afficher ses informations.</p>
      `;
      }


      function cornerCrownCellsForVillage(village) {
        if (!village) return [];
        const cells = [[village.r, village.c]];

        cells.push(
          village.r === 0
            ? [1, village.c]
            : [GRID - 2, village.c]
        );

        cells.push(
          village.c === 0
            ? [village.r, 1]
            : [village.r, GRID - 2]
        );

        return cells;
      }

      function crownValidationCellsForPlayer(player) {
        if (!player) return [];
        const unique = new Map();

        villagesForPlayer(player).forEach(village => {
          cornerCrownCellsForVillage(village).forEach(([r, c]) => {
            unique.set(key(r, c), [r, c]);
          });
        });

        return [...unique.values()];
      }

      function isCrownValidationCell(player, r, c) {
        return crownValidationCellsForPlayer(player)
          .some(([vr, vc]) => vr === r && vc === c);
      }

      function canValidateCrownPoint(char) {
        return false;
      }

      /*
       * L'ancien système de traits et de sorties est volontairement supprimé.
       * Cette fonction reste vide afin de préserver les appels de rendu existants.
       */
      function renderExitGates() { }

      function validateCrownPoint(char, options = {}) {
        const { fromAI = false } = options;

        if (!state || !char || state.winner !== null) return false;
        if (!fromAI) showToast("La couronne sera validée si elle est encore dans votre village au début de votre prochain tour.");
        return false;

        /* Compatibilité conservée : ancien flux volontairement inaccessible. */

        const player = state.players[char.player];
        const artifact = artifactCarriedBy(char.id);

        if (char.player !== state.currentPlayer) {
          if (!fromAI) showToast("Ce gardien n’appartient pas au joueur actif.");
          return false;
        }

        if (!artifact) {
          if (!fromAI) showToast("Ce gardien ne porte pas de couronne.");
          return false;
        }

        if (!isCrownValidationCell(player, char.r, char.c)) {
          if (!fromAI) showToast("Placez le porteur sur une des 3 cases de votre coin.");
          return false;
        }

        if (availableActionCount("MOVE") < 1) {
          if (!fromAI) showToast("Il faut encore 1 déplacement pour valider la couronne.");
          return false;
        }

        saveUndoSnapshot();

        if (consumeAvailableActions("MOVE", 1) < 1) {
          discardLastUndoSnapshot();
          if (!fromAI) showToast("Aucun déplacement disponible.");
          return false;
        }

        state.selectedActionCardId = null;
        state.selectedActionType = null;
        state.selectedActionCount = 1;
        state.selectedCharId = null;
        state.selectedIslandId = null;
        state.smartHoverType = null;
        state.smartHoverPath = [];
        state.actionHoverCell = null;
        state.reachable = new Set();
        state.phase = "ACTION_SELECT";

        queueKayKitActionAnimation(char.id, "victory", 1200);
        animateCellPulse(char.r, char.c, "crown-burst");
        playSfx("crown");
        scoreCrownForPlayer(player, char, false, artifact);
        renderAll();
        return true;
      }

      function scoreCrownForPlayer(player, char, throughExit = false, artifact = artifactCarriedBy(char?.id)) {
        player.score++;
        triggerScoreAnimation(player.id);
        if (char) playCrownScore(char.id);
        if (artifact) artifact.carrierId = null;

        if (throughExit && char) {
          respawnCharacter(char);
          showToast(`${player.name} sort avec la couronne et marque un point ! (${player.score}/3)`);
        } else {
          showToast(`${player.name} valide une couronne au début de son tour ! (${player.score}/3)`);
        }

        if (player.score >= 3) {
          state.winner = player.id;
          // Célébration sur le plateau AVANT l'écran de victoire : les gardiens
          // gagnants fêtent le résultat pendant que l'interface se prépare.
          playVictoryCelebration(player.id);
          setTimeout(() => showVictory(player), 450);
        } else {
          // Un gardien qui valide une couronne (dépôt au village, hors sortie
          // par une porte — mécanique historique déjà désactivée) est retiré
          // du jeu : la couronne se paie du gardien qui l'a portée jusqu'ici.
          // Exclu de la couronne gagnante ci-dessus pour ne pas faire
          // disparaître le gardien pendant sa propre célébration de victoire.
          if (char && !throughExit) removeCharacterFromGame(char);
          resetArtifactObject(artifact);
        }
      }

      function resolveArtifactForCharacter(char) {
        if (!characterCarriesCrown(char.id)) {
          const looseArtifact = looseArtifactAt(char.r, char.c);
          if (looseArtifact && giveArtifactToCharacter(looseArtifact, char)) {
            showToast(`${state.players[char.player].name} récupère une couronne !`);
          }
        }

        /* Le point sera vérifié et accordé au début du prochain tour du porteur. */
      }

      function resetArtifact() {
        resetArtifactObject(state.artifact);
      }

      async function endTurn(force = false) {
        if (!state || state.winner !== null || state.turnTransitioning) return;
        if (!force && state.phase !== "ACTION_SELECT") {
          const cancellableSelection = state.islandPlacedThisTurn
            && (state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType));
          if (!cancellableSelection || !prepareActionSwitch()) return;
        }

        if (!state.islandPlacedThisTurn) {
          if (force) {
            createAutomaticIslandAndSpawn(state.currentPlayer, true);
          } else {
            showToast("Vous devez poser une île avant de terminer le tour.");
            return;
          }
        }

        clearUnifiedPushOptions();
        state.pendingDirectMoveTarget = null;

        state.turnTransitioning = true;
        stopTurnTimer();
        aiRunToken++;
        state.aiThinking = false;
        state.timerExpiring = false;
        state.inputLocked = true;
        els.gameScreen.classList.remove("ai-turn");
        resetKayKitPointerFeedback();

        const p = currentPlayer();

        /*
         * Les cartes restent visibles pendant leur trajet vers la défausse.
         */
        if ((p.hand || []).length) {
          state.deckAnimationMode = "discard";
          renderDeckDisplay();
          await sleep(620);
        }

        p.stash ||= { MOVE: 0, PUSH: 0, MAGIC: 0 };

        /*
         * Chaque carte fraîche non utilisée devient une action stockée,
         * dans la limite de cinq actions par type. La carte elle-même va
         * quand même dans la défausse.
         */
        ["MOVE", "PUSH", "MAGIC"].forEach(type => {
          const unusedFresh = unusedCardsOfType(type, p).length;
          p.stash[type] = Math.min(
            5,
            storedActionCount(type, p) + unusedFresh
          );
        });

        const cardsToDiscard = p.hand.map(card => ({
          ...card,
          used: false,
          fromStash: false
        }));

        p.discard.push(...cardsToDiscard);
        p.hand = [];
        state.deckAnimationMode = null;

        const wasLast = state.currentPlayer === state.players.length - 1;
        state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
        state.turn++;
        if (wasLast) state.round++;

        playSfx("turn");
        beginTurn();
        forceOnlineSync();
      }
      function showVictory(player) {
        stopTurnTimer();
        aiRunToken++;
        els.gameScreen.classList.remove("ai-turn");

        els.victoryPortrait.textContent = player.icon || "🧙";
        els.victoryPortrait.style.setProperty("--pcolor", player.color || "#fff");
        els.victoryTitle.textContent = player.name;
        els.victoryTitle.style.color = player.color;
        els.victoryText.textContent = `${player.name} a validé trois couronnes et prend le contrôle d’ILYOS.`;
        els.victoryStats.textContent = `${state.turn} tours • ${state.round} manches • Score ${player.score}/3`;

        els.victoryModal.classList.remove("hidden");
        void els.victoryModal.offsetWidth;
        els.victoryModal.classList.add("victory-visible");

        if (!state.onlineMode) clearLocalSession();
        playSfx("victory");
      }

      function resetToSetup() {
        stopTurnTimer();
        aiRunToken++;
        if (state?.onlineMode) closeOnlineNetwork(false);
        els.gameScreen.classList.remove("ai-turn");
        state = null;
        pendingVisualMode = "alternative";
        applyVisualMode("alternative");
        els.victoryModal.classList.add("hidden");
        els.victoryModal.classList.remove("victory-visible");
        els.rulesModal.classList.add("hidden");
        els.gameScreen.classList.add("hidden");
        els.setupScreen.classList.remove("hidden");
        renderSetupFields();
      }


      /* ======================================================================
       * CARTES — RÉSERVE PHYSIQUE V1
       *
       * Cycle autoritaire :
       *   PIOCHE -> MAIN -> DÉFAUSSE (si jouée)
       *                  -> RÉSERVE  (si inutilisée en fin de tour)
       *   RÉSERVE -> DÉFAUSSE quand la carte stockée est finalement jouée
       *   DÉFAUSSE -> PIOCHE uniquement lorsque drawCards() doit remélanger.
       *
       * `player.reserveCards` contient les vraies cartes mises de côté.
       * `player.stash` reste uniquement un miroir 0..5 par type afin de garder
       * compatibles le HUD, l'IA et les anciennes lectures de sauvegarde.
       * ====================================================================== */
      {
        const PHYSICAL_RESERVE_LIMIT_PER_TYPE = 5;
        const PHYSICAL_RESERVE_TYPES = ["MOVE", "PUSH", "MAGIC"];

        function physicalReserveCounts(player) {
          const counts = { MOVE: 0, PUSH: 0, MAGIC: 0 };
          (player?.reserveCards || []).forEach(card => {
            if (PHYSICAL_RESERVE_TYPES.includes(card?.action)) counts[card.action]++;
          });
          return counts;
        }

        function syncPhysicalReserveStash(player) {
          if (!player) return { MOVE: 0, PUSH: 0, MAGIC: 0 };
          const counts = physicalReserveCounts(player);
          player.stash = {
            MOVE: Math.min(PHYSICAL_RESERVE_LIMIT_PER_TYPE, counts.MOVE),
            PUSH: Math.min(PHYSICAL_RESERVE_LIMIT_PER_TYPE, counts.PUSH),
            MAGIC: Math.min(PHYSICAL_RESERVE_LIMIT_PER_TYPE, counts.MAGIC)
          };
          return player.stash;
        }

        function removeCardFromZoneById(zone, id) {
          if (!Array.isArray(zone) || id == null) return null;
          const index = zone.findIndex(card => String(card?.id) === String(id));
          if (index < 0) return null;
          return zone.splice(index, 1)[0] || null;
        }

        function pullMatchingCard(player, type) {
          for (const zoneName of ["discard", "deck"]) {
            const zone = player?.[zoneName];
            if (!Array.isArray(zone)) continue;
            const index = zone.findIndex(card => card?.action === type);
            if (index >= 0) return zone.splice(index, 1)[0];
          }
          return null;
        }

        function sanitizePhysicalReserve(player) {
          if (!player) return [];
          player.reserveCards = Array.isArray(player.reserveCards) ? player.reserveCards : [];
          const seen = new Set();
          const perType = { MOVE: 0, PUSH: 0, MAGIC: 0 };
          player.reserveCards = player.reserveCards.filter(card => {
            if (!card || !PHYSICAL_RESERVE_TYPES.includes(card.action)) return false;
            const key = String(card.id ?? "");
            if (key && seen.has(key)) return false;
            if (perType[card.action] >= PHYSICAL_RESERVE_LIMIT_PER_TYPE) return false;
            if (key) seen.add(key);
            perType[card.action]++;
            card.used = false;
            card.fromStash = false;
            card.fromReserve = true;
            return true;
          });
          syncPhysicalReserveStash(player);
          return player.reserveCards;
        }

        function migrateLegacyStashToPhysicalReserve(player) {
          if (!player) return [];
          if (Array.isArray(player.reserveCards)) return sanitizePhysicalReserve(player);

          const wanted = {
            MOVE: Math.min(5, Math.max(0, Number(player.stash?.MOVE) || 0)),
            PUSH: Math.min(5, Math.max(0, Number(player.stash?.PUSH) || 0)),
            MAGIC: Math.min(5, Math.max(0, Number(player.stash?.MAGIC) || 0))
          };
          player.reserveCards = [];

          PHYSICAL_RESERVE_TYPES.forEach(type => {
            for (let i = 0; i < wanted[type]; i++) {
              const card = pullMatchingCard(player, type);
              if (!card) break;
              card.used = false;
              card.fromStash = false;
              card.fromReserve = true;
              player.reserveCards.push(card);
            }
          });

          return sanitizePhysicalReserve(player);
        }

        function ensurePhysicalReserve(player) {
          return Array.isArray(player?.reserveCards)
            ? sanitizePhysicalReserve(player)
            : migrateLegacyStashToPhysicalReserve(player);
        }

        /* ------------------------------------------------------------------
         * Les lectures d'actions utilisent désormais les vraies cartes.
         * ------------------------------------------------------------------ */
        storedActionCount = function storedActionCountPhysical(type, player = currentPlayer()) {
          if (!player || !PHYSICAL_RESERVE_TYPES.includes(type)) return 0;
          ensurePhysicalReserve(player);
          return Math.min(
            PHYSICAL_RESERVE_LIMIT_PER_TYPE,
            player.reserveCards.filter(card => card.action === type).length
          );
        };

        availableActionCount = function availableActionCountPhysical(type, player = currentPlayer()) {
          if (!state || !player) return 0;
          return unusedCardsOfType(type, player).length + storedActionCount(type, player);
        };

        /* ------------------------------------------------------------------
         * Jouer une action déplace immédiatement la vraie carte vers Défausse.
         * Priorité inchangée : cartes fraîches de la main, puis réserve.
         * ------------------------------------------------------------------ */
        consumeAvailableActions = function consumeAvailableActionsPhysical(type, count = 1, player = currentPlayer()) {
          if (!player || count < 1 || !PHYSICAL_RESERVE_TYPES.includes(type)) return 0;
          ensurePhysicalReserve(player);
          player.hand = Array.isArray(player.hand) ? player.hand : [];
          player.discard = Array.isArray(player.discard) ? player.discard : [];

          let remaining = Math.min(
            Math.max(0, Math.floor(count)),
            availableActionCount(type, player)
          );
          const requested = remaining;
          let freshUsed = 0;
          let reserveUsed = 0;

          /* Main -> Défausse : la carte jouée quitte réellement la main. */
          while (remaining > 0) {
            const index = player.hand.findIndex(card => !card.used && card.action === type);
            if (index < 0) break;
            const [card] = player.hand.splice(index, 1);
            if (!card) break;
            player.discard.push({
              ...card,
              used: false,
              fromStash: false,
              fromReserve: false
            });
            freshUsed++;
            remaining--;
          }

          /* Réserve -> Défausse : la carte stockée quitte physiquement sa zone. */
          while (remaining > 0) {
            const index = player.reserveCards.findIndex(card => card.action === type);
            if (index < 0) break;
            const [card] = player.reserveCards.splice(index, 1);
            if (!card) break;
            player.discard.push({
              ...card,
              used: false,
              fromStash: false,
              fromReserve: false
            });
            reserveUsed++;
            remaining--;
          }

          syncPhysicalReserveStash(player);

          if (freshUsed > 0) {
            window.dispatchEvent(new CustomEvent("ilyos:fresh-card-used", {
              detail: { type, count: freshUsed }
            }));
          }
          if (reserveUsed > 0) {
            window.dispatchEvent(new CustomEvent("ilyos:reserve-card-used", {
              detail: { type, count: reserveUsed }
            }));
          }

          return requested - remaining;
        };

        /* ------------------------------------------------------------------
         * Fin de tour : les cartes encore en main sont toutes inutilisées.
         * On les place en réserve jusqu'à 5 PAR TYPE. Un éventuel surplus
         * reste dans la main quelques millisecondes afin que endTurn() legacy
         * l'envoie normalement à la défausse. Une carte réservée n'y va pas.
         * ------------------------------------------------------------------ */
        const endTurnBeforePhysicalReserve = endTurn;
        endTurn = async function endTurnPhysicalReserve(force = false) {
          if (!state || state.winner !== null || state.turnTransitioning) return;

          /* Même garde que la fonction historique, exécutée AVANT de déplacer
             une carte pour qu'un clic invalide ne modifie jamais la réserve. */
          if (!force && state.phase !== "ACTION_SELECT") {
            const cancellableSelection = state.islandPlacedThisTurn
              && (state.phase === "SMART_CHAR" || (state.phase === "ACTION" && !!state.selectedActionType));
            if (!cancellableSelection || !prepareActionSwitch()) return;
          }
          if (!state.islandPlacedThisTurn && !force) {
            showToast("Vous devez poser une île avant de terminer le tour.");
            return;
          }

          const player = currentPlayer();
          ensurePhysicalReserve(player);
          player.hand = Array.isArray(player.hand) ? player.hand : [];

          const counts = physicalReserveCounts(player);
          const keepInHand = [];
          const banked = { MOVE: 0, PUSH: 0, MAGIC: 0 };

          player.hand.forEach(card => {
            const type = card?.action;
            const canBank = !card?.used
              && PHYSICAL_RESERVE_TYPES.includes(type)
              && counts[type] < PHYSICAL_RESERVE_LIMIT_PER_TYPE;

            if (canBank) {
              counts[type]++;
              banked[type]++;
              player.reserveCards.push({
                ...card,
                used: false,
                fromStash: false,
                fromReserve: true
              });
            } else {
              keepInHand.push(card);
            }
          });
          player.hand = keepInHand;
          syncPhysicalReserveStash(player);

          if (banked.MOVE || banked.PUSH || banked.MAGIC) {
            window.dispatchEvent(new CustomEvent("ilyos:cards-banked", { detail: { ...banked } }));
          }

          /* La fonction historique conserve tout le reste du lifecycle :
             transition, IA, tour suivant, sync online. Les cartes réservées ont
             déjà quitté la main, donc elle ne peut plus les défausser. */
          return endTurnBeforePhysicalReserve(force);
        };

        /* ------------------------------------------------------------------
         * Sauvegardes : V1 inclut reserveCards dans l'état sérialisé. Pour les
         * anciennes sauvegardes à stash virtuel, on retire autant de vraies
         * cartes que possible de Défausse puis Pioche et on les met de côté.
         * ------------------------------------------------------------------ */
        const normalizeRestoredStateBeforePhysicalReserve = normalizeRestoredState;
        normalizeRestoredState = function normalizeRestoredStatePhysicalReserve(raw) {
          if (!raw || !Array.isArray(raw.players) || !raw.players.length) return null;

          const prepared = JSON.parse(JSON.stringify(raw));
          const savedPhysical = prepared.players.map(player =>
            Array.isArray(player.reserveCards) ? JSON.parse(JSON.stringify(player.reserveCards)) : null
          );

          /* La normalisation V64 compte 13 cartes seulement dans deck/main/
             discard. On y remet temporairement les cartes de réserve pour que
             cette vérification voie bien l'intégralité du paquet physique. */
          prepared.players.forEach((player, index) => {
            const reserve = savedPhysical[index];
            if (!reserve) return;
            player.deck = Array.isArray(player.deck) ? player.deck : [];
            player.hand = Array.isArray(player.hand) ? player.hand : [];
            player.discard = Array.isArray(player.discard) ? player.discard : [];
            const reserveIds = new Set(reserve.map(card => String(card?.id)));
            ["deck", "hand", "discard"].forEach(zoneName => {
              player[zoneName] = player[zoneName].filter(card => !reserveIds.has(String(card?.id)));
            });
            player.discard.push(...reserve.map(card => ({ ...card, used: false, fromReserve: false, fromStash: false })));
            player.stash = { MOVE: 0, PUSH: 0, MAGIC: 0 };
            delete player.reserveCards;
          });

          const restored = normalizeRestoredStateBeforePhysicalReserve(prepared);
          if (!restored) return null;

          restored.players.forEach((player, index) => {
            const wanted = savedPhysical[index];
            if (!wanted) {
              /* Ancienne sauvegarde : physicalisation best-effort de l'ancien
                 stash, sans créer de cartes supplémentaires. */
              migrateLegacyStashToPhysicalReserve(player);
              return;
            }

            player.reserveCards = [];
            wanted.forEach(savedCard => {
              let card = null;
              for (const zoneName of ["discard", "deck", "hand"]) {
                card = removeCardFromZoneById(player[zoneName], savedCard?.id);
                if (card) break;
              }
              if (!card && PHYSICAL_RESERVE_TYPES.includes(savedCard?.action)) {
                card = pullMatchingCard(player, savedCard.action);
              }
              if (card) {
                player.reserveCards.push({ ...card, used: false, fromStash: false, fromReserve: true });
              }
            });
            sanitizePhysicalReserve(player);
          });

          return restored;
        };

        /* Synchronise les joueurs déjà créés lors d'une reprise/live reload. */
        if (state?.players) state.players.forEach(ensurePhysicalReserve);
      }
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
