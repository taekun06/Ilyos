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
      const SKELETON_ATLAS = KAYKIT_CDN.skeletonCharacters + "skeleton_texture.png";

      const KAYKIT_ASSETS = {
        // Personnages gratuits officiels : plus de 75 clips intégrés.
        hero0: kaykitAssetSpec("characters", "Knight.glb", KAYKIT_CDN.characters + "knight_texture.png"),
        hero1: kaykitAssetSpec("characters", "Mage.glb", KAYKIT_CDN.characters + "mage_texture.png"),
        hero2: kaykitAssetSpec("characters", "Rogue.glb", KAYKIT_CDN.characters + "rogue_texture.png"),
        hero2Hooded: kaykitAssetSpec("characters", "Rogue_Hooded.glb", KAYKIT_CDN.characters + "rogue_texture.png"),
        hero3: kaykitAssetSpec("characters", "Barbarian.glb", KAYKIT_CDN.characters + "barbarian_texture.png"),

        // Squelettes gratuits : plus de 90 clips intégrés.
        skeletonWarrior: kaykitAssetSpec("skeletonCharacters", "Skeleton_Warrior.glb", SKELETON_ATLAS),
        skeletonMage: kaykitAssetSpec("skeletonCharacters", "Skeleton_Mage.glb", SKELETON_ATLAS),
        skeletonRogue: kaykitAssetSpec("skeletonCharacters", "Skeleton_Rogue.glb", SKELETON_ATLAS),
        skeletonMinion: kaykitAssetSpec("skeletonCharacters", "Skeleton_Minion.glb", SKELETON_ATLAS),

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
        castle0: kaykitAssetSpec("medieval", "buildings/blue/building_castle_blue.gltf", MEDIEVAL_ATLAS),
        castle1: kaykitAssetSpec("medieval", "buildings/red/building_castle_red.gltf", MEDIEVAL_ATLAS),
        castle2: kaykitAssetSpec("medieval", "buildings/green/building_castle_green.gltf", MEDIEVAL_ATLAS),
        castle3: kaykitAssetSpec("medieval", "buildings/yellow/building_castle_yellow.gltf", MEDIEVAL_ATLAS),

        // Fanions de village, un par couleur de joueur (jusqu'à 4).
        flag0: kaykitAssetSpec("medieval", "decoration/props/flag_blue.gltf", MEDIEVAL_ATLAS),
        flag1: kaykitAssetSpec("medieval", "decoration/props/flag_red.gltf", MEDIEVAL_ATLAS),
        flag2: kaykitAssetSpec("medieval", "decoration/props/flag_green.gltf", MEDIEVAL_ATLAS),
        flag3: kaykitAssetSpec("medieval", "decoration/props/flag_yellow.gltf", MEDIEVAL_ATLAS)
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
      const KAYKIT_BOARD_SPAN = GRID * KAYKIT_CELL_SPACING;

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
        safeRadius: KAYKIT_BOARD_SPAN / 2 + 4.2,  // ≈ 9.3 : grille + marge d'extension
        safeFloor: -9,                            // vide obligatoire sous les îles
        domeRadius: 170,
        cameraFar: 460,
        fogNear: 44,                              // > (zoom max 25 + demi-diagonale plateau 7.2)
        fogFar: 145,
        seaHigh: -11.5,                           // mer principale : îles ↓ vide ↓ nuages
        seaLow: -22,                              // seconde nappe, pour le parallaxe
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
      const KAYKIT_SKY_COLORS = {
        zenith: 0x3f86c9,
        upper: 0x6aaee0,
        middle: 0x9fd0ee,
        horizon: 0xf4faf2,   // touche ivoire (B < G) : la bande d'horizon se détache
        haze: 0xd8eefb,      // du bleu franc au-dessus et en dessous, sans virer au jaune
        abyss: 0xc2e4f7,
        // midDeep comble l'écart entre abyss et deep : c'est justement CETTE portion
        // du dégradé que montrent les caméras de jeu normales (voir plus bas), donc
        // sans un vrai pas de couleur ici, tout le cadrage normal affichait une
        // tranche quasi plate d'un dégradé bien plus large — d'où le "grand vide
        // bleu uniforme" signalé après coup.
        midDeep: 0x9ccae9,
        deep: 0x4d86bd,
        seaHigh: 0xeef6fd,   // volontairement PAS blanc pur : le décor ne doit jamais
        seaLow: 0xdcebf9,    // être plus lumineux que gardiens et couronnes
        distant: 0xa9c6dd
      };

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
        renderer.setClearColor(KAYKIT_SKY_COLORS.haze, 1);

        const scene = new THREE.Scene();
        // Brume atmosphérique lointaine seulement : elle démarre au-delà de la
        // distance caméra→coin de plateau la plus défavorable (zoom max 25 + 7.2),
        // donc le plateau et les gardiens restent parfaitement nets, et seul le
        // décor très éloigné se désature vers la couleur d'horizon.
        // Couleur de brume calée sur `abyss` et non sur `haze` : les objets lointains
        // (îlots, nappes) vivent dans la fenêtre visible du dôme, où le ciel vaut
        // ~abyss. Les fondre vers une couleur plus claire les faisait ressortir comme
        // des taches pâles au lieu de se dissoudre dans le ciel.
        scene.fog = new THREE.Fog(KAYKIT_SKY_COLORS.abyss, KAYKIT_SKY.fogNear, KAYKIT_SKY.fogFar);
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
        const ambient = new THREE.AmbientLight(0xf6faff, .30);
        scene.add(ambient);
        const hemi = new THREE.HemisphereLight(0xeaf7ff, 0x46688a, .80);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xffeed2, 1.78);
        sun.position.set(-6, 14, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
        sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
        sun.shadow.camera.near = .5; sun.shadow.camera.far = 35;
        sun.shadow.bias = -.00035;
        sun.shadow.normalBias = .012;
        sun.shadow.radius = 1.4;
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0x8ed8ef, .22);
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
          zoomDistance: 12.4, minZoom: 6.4, maxZoom: 25, viewTarget: new THREE.Vector3(0, .22, .18),
          materials: new Map(), geometries: new Map(), lastStateSignature: "", loadedCount: 0, totalAssets: Object.keys(KAYKIT_ASSETS).length,
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
          villagesBuilt: false,         // châteaux+fanions : construits une seule fois, jamais reconstruits
          crownCrossGroundBuilt: false, // sol central : statique, construit une seule fois
          islandLayerObjects: [],       // objets à disposer quand la signature d'îles change
          pedestalRegistry: new Map(),  // "r,c" -> pedestal (reconstruit avec la couche des îles)
          villageRegistry: new Map(),   // playerId -> chateau (construit une seule fois)
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
          Object.entries(KAYKIT_ASSETS).forEach(([assetKey, spec]) => loadKayKitAsset(assetKey, spec));
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

      // Nappe de nuages vue de dessus : amas doux, faible contraste, fondus vers
      // les bords pour qu'aucun bord de plan ne soit jamais visible. Une seule
      // texture par variante, partagée par la nappe entière (aucun tuilage).
      //
      // `holeStart`/`holeEnd` (en unités monde) évident progressivement le centre :
      // sans ce trou, la nappe s'étend jusque sous le plateau et l'on passe des îles
      // aux nuages sans transition. Avec lui on lit bien îles ↓ vide bleu ↓ nuages.
      function kaykitCloudSheetTexture(variant = 0, size2D = 150, holeStart = 11, holeEnd = 20) {
        const key = `cloud-sheet-v2-${variant}-${size2D}-${holeStart}-${holeEnd}`;
        if (kaykit3D?.materials?.has(key)) return kaykit3D.materials.get(key);
        const size = 512;
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
        mask.addColorStop(.80, "rgba(255,255,255,.88)");
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
      function makeKayKitDistantIslet(scale, withTower, seed) {
        const group = new THREE.Group();
        const tint = new THREE.Color(KAYKIT_SKY_COLORS.distant);
        // Roche nettement plus sombre que le dessus : c'est ce contraste interne qui
        // fait lire une île suspendue plutôt qu'un cône blanc posé dans le ciel. Les
        // deux tons restent désaturés et plus faibles que ceux du plateau (hiérarchie
        // §10 : le décor lointain doit toujours passer derrière le jeu).
        const rockMaterial = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(.68), fog: true, toneMapped: false });
        const topMaterial = new THREE.MeshBasicMaterial({ color: tint.clone().lerp(new THREE.Color(0xffffff), .16), fog: true, toneMapped: false });
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
          { y: KAYKIT_SKY.seaHigh, size: 150, hole: [2, 7], color: KAYKIT_SKY_COLORS.seaHigh, opacity: .62, variant: 0, curveDrop: 30, drift: { x: 3.4, z: 2.6, sx: .0105, sz: .0082 } },
          { y: KAYKIT_SKY.seaLow, size: 250, hole: [4, 12], color: KAYKIT_SKY_COLORS.seaLow, opacity: .40, variant: 1, curveDrop: 46, drift: { x: 5.2, z: 4.1, sx: .0061, sz: .0047 } }
        ].forEach((layer, index) => {
          const sheet = new THREE.Mesh(
            kaykitCurvedSeaGeometry(layer.size, layer.curveDrop),
            new THREE.MeshBasicMaterial({
              map: kaykitCloudSheetTexture(layer.variant, layer.size, layer.hole[0], layer.hole[1]),
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

        // COUCHE 3 — cinq silhouettes lointaines seulement : « ILYOS fait partie d'un
        // immense archipel », pas « il y a d'autres objets à cliquer ». Elles flottent
        // entre le plateau et la mer de nuages, hors du cylindre de sécurité, et à un
        // rayon supérieur à la distance orbitale maximale : la caméra reste donc
        // toujours à l'intérieur de leur anneau et aucune ne peut passer devant le jeu.
        // Altitudes toutes sous le niveau du plateau : l'archipel lointain se lit
        // « plus bas et plus loin », il ne vient jamais flotter à hauteur de jeu.
        // Deux rapprochés (30/32, juste au-dessus de `farRing` et `orbit.maxDistance`
        // = 25 : 5-7 unités de marge, la caméra ne peut donc jamais les atteindre) pour
        // qu'ils se distinguent déjà au zoom de jeu normal ; les deux autres restent
        // très loin, pour la profondeur en zoom éloigné.
        [
          { azimuth: .62, radius: 30, y: -5.8, scale: 1.5, tower: true },
          { azimuth: 1.94, radius: 49, y: -4.4, scale: 1.9, tower: false },
          { azimuth: 3.05, radius: 32, y: -8.4, scale: 1.3, tower: false },
          { azimuth: 4.36, radius: 62, y: -6.0, scale: 2.2, tower: true }
        ].forEach((spec, index) => {
          const x = Math.cos(spec.azimuth) * spec.radius;
          const z = Math.sin(spec.azimuth) * spec.radius;
          if (spec.radius < KAYKIT_SKY.farRing) return;
          if (!kaykitSkyPlacementAllowed(x, spec.y, z, spec.scale * 1.2)) return;
          const islet = makeKayKitDistantIslet(spec.scale, spec.tower, index / 4);
          islet.position.set(x, spec.y, z);
          sky.add(islet);
        });

        // Îlots SOUS l'archipel, aperçus par les interstices entre les îles. Ils sont
        // à l'intérieur du rayon de sécurité, ce qui est autorisé ici parce qu'ils
        // passent par l'autre branche de kaykitSkyPlacementAllowed : entièrement sous
        // `safeFloor`. La caméra restant toujours au-dessus du plateau, un rayon œil →
        // case ne descend jamais à ces altitudes, donc ils ne peuvent pas s'interposer.
        // C'est le repère de profondeur le plus efficace pour « on joue dans le ciel » :
        // on voit qu'il y a un dessous, et qu'il est vide.
        [
          { azimuth: 1.15, radius: 5.5, y: -14.2, scale: .85, tower: false },
          { azimuth: 4.02, radius: 7.5, y: -16.8, scale: 1.05, tower: true }
        ].forEach((spec, index) => {
          const x = Math.cos(spec.azimuth) * spec.radius;
          const z = Math.sin(spec.azimuth) * spec.radius;
          if (!kaykitSkyPlacementAllowed(x, spec.y, z, spec.scale * 1.2)) return;
          const islet = makeKayKitDistantIslet(spec.scale, spec.tower, .35 + index * .4);
          islet.position.set(x, spec.y, z);
          sky.add(islet);
        });

        parent.add(sky);
        kaykit3D.skyGroup = sky;
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
        const half = KAYKIT_BOARD_SPAN / 2;
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
        const grid = buildFadedGrid(gridPoints, gridAlphas, 0xf3fbff, .74);
        const majorGrid = buildFadedGrid(majorGridPoints, majorGridAlphas, 0xe9c877, .86);
        grid.renderOrder = 2; majorGrid.renderOrder = 3;
        staticGroup.add(grid, majorGrid);

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
          const isBlueBand = hsl.s > .25 && hueDeg >= 190 && hueDeg <= 260;
          const isRedBand = hsl.s > .30 && (hueDeg >= 335 || hueDeg <= 15);
          if (isBlueBand || isRedBand) {
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
        const boardSize = KAYKIT_BOARD_SPAN + .35;
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

      function kaykitIslandAccentColor(island, { preview = false, previewColor = 0x20f39a } = {}) {
        if (preview) return new THREE.Color(previewColor);
        const owner = Number.isInteger(island?.owner) ? island.owner : null;
        if (owner !== null && state?.players?.[owner]?.color) return new THREE.Color(state.players[owner].color);
        const hue = (kaykitHash("island-accent", island?.id ?? "preview") + .08) % 1;
        return new THREE.Color().setHSL(hue, .58, .56);
      }

      const ILYOS_ISLAND_TINTS = [
        0x9fae57,
        0x5f7a3c,
        0x8bbf8a,
        0x3f6b52,
        0x4f9488,
        0x8aa63f
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

      function renderKayKitIslandBlocks(group) {
        // Masqué pour toute la durée de l'action MAGIE (plus seulement une fois la
        // rotation amorcée) : le contour d'origine + le bloc-ghost teinté de
        // renderKayKitMagicRotationPreview prennent le relais dès la sélection de
        // l'île, en continu — sans ce masquage assorti, le bloc réel et le ghost se
        // superposaient à 0 cran de rotation.
        const hideSelectedForMagic = state?.phase === "ACTION"
          && state?.selectedActionType === "MAGIC"
          && state?.selectedIslandId
          && Array.isArray(state?.magicPreviewCells);
        (state?.islands || []).forEach(island => {
          if (hideSelectedForMagic && island.id === state.selectedIslandId) return;
          const block = makeKayKitIslandBlock(island);
          group.add(block);
        });
        // Le léger retrait de chaque bloc crée une séparation fine sans rainure artificielle.
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
        // cette île est caché pendant toute l'action (voir hideSelectedForMagic dans
        // renderKayKitIslandBlocks), donc sans ce contour on ne voit plus du tout
        // d'où elle vient. Volontairement très en retrait du ghost coloré.
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

        // Or établi ailleurs dans le jeu pour tout ce qui est précieux/important
        // (couronnes, halo de score, victoire — voir 0xffcf52 plus bas). Le
        // mélanger à 15% avec la couleur d'équipe donnait un or vif pour les
        // équipes chaudes (rouge, vert, violet) mais un kaki terne pour l'équipe
        // bleu cyan (#deaf3f) — le bleu et l'or sont proches en teinte inversée,
        // le mélange désature au lieu d'enrichir. Un seul gardien est sélectionné
        // à la fois, tous joueurs confondus : rien n'exige que cette couleur
        // varie par équipe, donc plus de mélange — un or constant et vif pour
        // tout le monde, cohérent avec le reste du langage visuel doré du jeu.
        const glowColor = selected
          ? new THREE.Color(0xffcf52)
          : visual.teamColor;
        // À .22 (respirant jusqu'à .36), cet émissif s'appliquait à TOUT le
        // matériau du gardien (armure, peau, tissu confondus) et le noyait dans
        // un blanc doré translucide au lieu de se lire comme un simple reflet
        // chaud. Le halo au sol et la colonne portent déjà la lisibilité de la
        // sélection ; ce glin ne doit être qu'un appoint discret.
        const glowIntensity = selected ? .09 : .075;
        visual.glowBase = glowIntensity;
        visual.glowMaterials.forEach(mat => {
          mat.emissive = glowColor.clone();
          mat.emissiveIntensity = glowIntensity;
        });

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

          // Reconstruction UNIQUEMENT si le modèle change réellement, ou si le
          // gardien vient d'apparaître.
          if (visual && visual.assetKey !== assetKey) {
            disposeCharacterVisual(visual);
            visual = null;
          }

          const isNew = !visual;
          if (!visual) visual = createCharacterVisual(character, index);
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
          visual.animator.play(locomotion, { fade: 0.12, timeScale });
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
            visual.glowMaterials.forEach(mat => { mat.emissiveIntensity = (visual.glowBase ?? .09) + breathe * .045; });
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



      function renderKayKitForestNatureOnIslands(group) {
        if (!kaykit3D || !state?.islands?.length) return;
        const occupied = new Set();
        (state.characters || []).forEach(character => occupied.add(key(character.r, character.c)));
        activeArtifacts().forEach(artifact => {
          if (artifact.active && !artifact.carrierId && Number.isFinite(artifact.r) && Number.isFinite(artifact.c)) occupied.add(key(artifact.r, artifact.c));
        });
        const forestAssets = [
          { key: "forestTree", width: .34, height: .70, scale: .90 },
          { key: "grain", width: .32, height: .34, scale: .85 },
          { key: "forestRock", width: .30, height: .24, scale: .92 },
          { key: "forestGrass", width: .27, height: .18, scale: .88 }
        ];
        (state.islands || []).forEach(island => {
          const cells = (island.cells || []).filter(([r, c]) => {
            const cellKey = key(r, c);
            return !occupied.has(cellKey) && !villageAt(r, c) && !isSanctuary(r, c);
          });
          if (cells.length < 3) return;
          cells.sort((a, b) => kaykitHash("forest-cell", island.id, b[0], b[1]) - kaykitHash("forest-cell", island.id, a[0], a[1]));
          const amount = cells.length >= 7 ? 2 : 1;
          for (let index = 0; index < Math.min(amount, cells.length); index++) {
            const [r, c] = cells[index];
            const pick = Math.floor(kaykitHash("forest-type", island.id, r, c) * forestAssets.length) % forestAssets.length;
            const spec = forestAssets[pick];
            const object = cloneKayKitAsset(spec.key, { maxWidth: spec.width, maxHeight: spec.height, targetFloor: 0 });
            if (!object) continue;
            const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
            object.position.set(p.x, p.y + .015, p.z);
            object.rotation.y = kaykitHash("forest-rotation", island.id, r, c) * Math.PI * 2;
            object.scale.multiplyScalar(spec.scale);
            object.userData.forestNatureDecoration = true;
            group.add(object);
          }
        });
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

          // Couche île (blocs fusionnés + coutures + décor forestier + les
          // piédestaux du grand boucle ci-dessous) : ne se reconstruit que si
          // state.islands a réellement changé (pose, retrait, rotation) — pas
          // sur un survol, une sélection ou un changement de tour.
          const islandsSig = kaykitIslandsSignature(state.islands);
          const rebuildIslandLayer = islandsSig !== kaykit3D.islandsSignature;
          if (rebuildIslandLayer) {
            disposeKayKitObjects(kaykit3D.islandLayerObjects);
            const before = dynamic.children.length;
            // Les îles sont fusionnées visuellement : un seul bloc par île, sans quadrillage interne.
            renderKayKitIslandBlocks(dynamic);
            renderKayKitIslandSeams(dynamic);
            // Variation visuelle discrète issue du Forest Nature Pack.
            renderKayKitForestNatureOnIslands(dynamic);
            kaykit3D.islandLayerObjects.push(...dynamic.children.slice(before));
            kaykit3D.pedestalRegistry = new Map();
          }

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
                if (!kaykit3D.villagesBuilt) {
                  const assetKey = `castle${Math.max(0, Math.min(3, playerId))}`;
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
                  kaykit3D.villageRegistry.set(playerId, castle);
                }
                const castle = kaykit3D.villageRegistry.get(playerId);
                if (castle) registerKayKitCellVisual(r, c, castle);
              }

              addCellHighlight(r, c, classes);
            }
          }
          if (rebuildIslandLayer) kaykit3D.islandsSignature = islandsSig;
          kaykit3D.villagesBuilt = true;

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
        kaykit3D.renderer.render(kaykit3D.scene, kaykit3D.camera);
      }
