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
        cameraHint.textContent = "← → TOURNER · ESPACE : VUE DE FACE · MOLETTE : ZOOM · CLIC : JOUER";
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
        // "HUD" (hud-organique-v2-depth-v9.js et -v10.js) qui ne touchaient
        // en réalité qu'à ces mêmes 3 lumières — source de vérité désormais
        // consolidée ici, ces deux fichiers ayant depuis été supprimés. Le ratio
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

      // Images source de la bande : de vraies mers de nuages équirectangulaires (CC0,
      // voir assets/sky/LICENSE.txt), déjà recadrées sur les bornes exactes de
      // KAYKIT_SKY_BAND (10°-62° sous l'horizontale) et suréchantillonnées à 4096×512.
      // Remplacent le dégradé + les amas peints, mais PAS le contre-jour : celui-ci
      // reste peint par dessus à chaque appel, dynamique (azimut du soleil réglable).
      //
      // Chargées à part du pipeline THREE (textureLoader / configureKayKitTexture) car
      // elles sont dessinées dans un canvas 2D avant de devenir une CanvasTexture — un
      // HTMLImageElement suffit, pas besoin des réglages de mapping GPU tant qu'on ne
      // fait que les lire au pixel.
      //
      // Les 25 variantes du pack (voir assets/sky/LICENSE.txt), au choix via
      // window.ILYOS_SKY.variante — chacune chargée à la demande et mise en cache :
      // passer d'une variante à l'autre ne retélécharge jamais celle déjà vue, et
      // n'en télécharge aucune tant qu'on ne l'a pas choisie (aucun coût au démarrage
      // au-delà de la variante par défaut).
      const KAYKIT_SKY_BAND_VARIANTS = {};
      for (let n = 1; n <= 25; n++) {
        const num = String(n).padStart(2, "0");
        KAYKIT_SKY_BAND_VARIANTS["sky" + num] = { url: `./assets/sky/sky-band-${num}.webp`, label: "Sky_" + num };
      }
      // Repérage manuel de variantes déjà comparées en jeu (voir LICENSE.txt) —
      // n'empêche pas de choisir les autres, juste une indication dans l'aide.
      KAYKIT_SKY_BAND_VARIANTS.sky05.label = "Sky_05 — bleu profond";
      KAYKIT_SKY_BAND_VARIANTS.sky11.label = "Sky_11 — violet nocturne, étoilé";
      // Composites Sky_02 + Sky_23 demandés en session (voir assets/sky/LICENSE.txt
      // pour le détail des calculs) — pas des fichiers du pack d'origine, donc en
      // dehors de la boucle sky01..sky25 ci-dessus.
      KAYKIT_SKY_BAND_VARIANTS.blend0223 = { url: "./assets/sky/sky-band-blend-02-23.webp", label: "Mélange 02+23 — or proche, rose lointain (BASE)" };
      KAYKIT_SKY_BAND_VARIANTS.blend0223v2 = { url: "./assets/sky/sky-band-blend-02-23-v2.webp", label: "Mélange 02+23 — coupure plus basse, rose plus présent" };
      KAYKIT_SKY_BAND_VARIANTS.blend0223azimut = { url: "./assets/sky/sky-band-blend-02-23-azimut.webp", label: "Mélange 02+23 — par azimut (rose loin du soleil)" };
      // Base du jeu : le mélange vertical d'origine (coupure à 35%), validé après
      // comparaison des 25 variantes individuelles + de plusieurs mélanges 02/23.
      const KAYKIT_SKY_BAND_DEFAULT_VARIANT = "blend0223";
      const kaykitSkyBandVariantStates = new Map();
      let kaykitSkyBandActiveVariant = KAYKIT_SKY_BAND_DEFAULT_VARIANT;

      // Pas de placeholder à remplacer à chaud : tant que l'image d'une variante n'est
      // pas prête, la bande continue de fonctionner sur son rendu peint existant
      // (gradient + amas), qui est un ciel complet en soi. Une passe de reprise (voir
      // kaykitReprendreCielImage) purge le cache et redessine dès que l'image arrive.
      function kaykitSkyBandSourceEnsure(nom = kaykitSkyBandActiveVariant) {
        const spec = KAYKIT_SKY_BAND_VARIANTS[nom];
        if (!spec) return { img: null, ready: false, requested: true };
        let state = kaykitSkyBandVariantStates.get(nom);
        if (!state) {
          state = { img: null, ready: false, requested: false };
          kaykitSkyBandVariantStates.set(nom, state);
        }
        if (!state.requested) {
          state.requested = true;
          const img = new Image();
          img.decoding = "async";
          img.onload = () => { state.ready = true; };
          img.onerror = () => {
            console.warn("[ILYOS] image de ciel introuvable, bande peinte conservée :", spec.url);
          };
          img.src = spec.url;
          state.img = img;
        }
        return state;
      }

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

        const skySource = kaykitSkyBandSourceEnsure();
        if (skySource.ready) {
          // L'image couvre déjà exactement 360°×(top-bottom) : un simple étirement
          // plein cadre suffit, aucun recadrage à refaire ici.
          ctx.drawImage(skySource.img, 0, 0, W, H);
        } else {
          // Repli tant que l'image n'est pas arrivée : dégradé échantillonné ligne à
          // ligne depuis la table partagée, égalité exacte avec le dôme à toute
          // élévation. Une passe de reprise redessinera avec l'image dès qu'elle sera
          // prête (voir kaykitReprendreCielImage).
          for (let y = 0; y < H; y++) {
            const c = kaykitSkyColorAt(pTop + (y / H) * pSpan);
            ctx.fillStyle = "#" + c.getHexString();
            ctx.fillRect(0, y, W, 1);
            const noise = (Math.sin(y * 12.9898) * .5 + .5) * .012;
            ctx.fillStyle = "rgba(255,255,255," + noise.toFixed(4) + ")";
            ctx.fillRect(0, y, W, 1);
          }
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

        // Amas peints : uniquement en repli. L'image contient déjà ses propres nuages
        // photographiques ; les superposer par-dessus doublerait la lecture et
        // trahirait le raccord peint/photo.
        if (!skySource.ready) {
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
            "regenerer()           reconstruit la texture de ciel",
            "variante(nom)         change l'image de fond de la bande de ciel",
            "                      (sky01..sky25) — sans argument, liste les 25 options"
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
        variante(nom) {
          if (!nom) {
            return Object.entries(KAYKIT_SKY_BAND_VARIANTS)
              .map(([cle, spec]) => (cle === kaykitSkyBandActiveVariant ? "→ " : "  ") + cle + " : " + spec.label)
              .join("\n");
          }
          if (!KAYKIT_SKY_BAND_VARIANTS[nom]) {
            return "variante inconnue : " + nom + " (options : " + Object.keys(KAYKIT_SKY_BAND_VARIANTS).join(", ") + ")";
          }
          kaykitSkyBandActiveVariant = nom;
          // Démarre le chargement s'il n'a jamais eu lieu ; si l'image de cette variante
          // est déjà en cache (vue précédemment), rien à retélécharger.
          const source = kaykitSkyBandSourceEnsure(nom);
          // Autorise la passe de reprise à ré-agir : sans cette remise à zéro, elle
          // considérerait le ciel comme déjà « repris » depuis le chargement initial
          // et n'upgraderait jamais cette nouvelle variante une fois prête.
          kaykit3D.cielImageRepris = false;
          const rendu = this.regenerer();
          return source.ready
            ? rendu + " (variante « " + nom + " » appliquée)"
            : rendu + " (variante « " + nom + " » en cours de chargement — reprise automatique dès qu'elle est prête)";
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

      /** Redessine la bande de ciel dès que l'image équirectangulaire est arrivée,
       *  pour remplacer le repli peint (gradient + amas procéduraux) posé en attendant.
       *  Même principe que kaykitReprendreSoclesRocheux : purge le cache par clé puis
       *  reconstruit, plutôt que de retoucher la texture déjà posée sur le matériau. */
      function kaykitReprendreCielImage() {
        const src = kaykitSkyBandSourceEnsure();
        if (!src.ready) return false;
        const sky = kaykit3D?.scene?.getObjectByName("ilyos-sky");
        if (!sky) return false;
        const band = sky.children.find(c => c.geometry?.type === "SphereGeometry"
          && c.geometry.parameters?.thetaStart > 0);
        if (!band) return false;
        kaykit3D.materials.delete("sky-band-hd-v1");
        if (band.material.map) band.material.map.dispose();
        band.material.map = kaykitSkyBandTexture();
        band.material.needsUpdate = true;
        return true;
      }

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

        // Groupe À PART pour la zone de déplacement (aplat des cases
        // atteignables) : reconstruite sur sa PROPRE clé (le seul ensemble
        // atteignable), jamais sur celle du survol — sans quoi chaque case
        // survolée détruisait puis refaisait apparaître EN FONDU la zone
        // entière, un clignotement disgracieux signalé en jeu. Voir
        // refreshKayKitHoverPreviews().
        const moveZoneGroup = new THREE.Group();
        moveZoneGroup.name = "ilyos-move-zone";
        fxGroup.add(moveZoneGroup);
        kaykit3D.moveZoneGroup = moveZoneGroup;

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
            clearKayKitGroup(kaykit3D.moveZoneGroup);
            kaykit3D.moveZoneRef = null;
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

      /* Rotation de la caméra par paliers, autour du point qu'elle regarde.

         Un huitième de tour : assez pour changer franchement d'angle en une
         frappe, assez peu pour ne pas perdre ses repères. Quatre frappes font
         un demi-tour, huit un tour complet.

         La hauteur et la distance sont conservées telles quelles — on tourne
         autour du plateau, on ne recadre pas. Le mouvement passe par le même
         tween que le reste, qui sait déjà cohabiter avec OrbitControls : il
         écrit à la fois la position de la caméra et celle de l'orbite, et
         `orbit.update()` s'exécute derrière sans se battre avec lui. */
      const PAS_ROTATION_CAMERA = Math.PI / 4;

      function tournerKayKitCamera(sens) {
        if (!kaykit3D || !kaykit3D.camera) return false;
        const cible = kaykit3D.orbit ? kaykit3D.orbit.target.clone() : kaykit3D.viewTarget.clone();
        const ecart = new THREE.Vector3().subVectors(kaykit3D.camera.position, cible);
        const rayon = Math.hypot(ecart.x, ecart.z);
        if (rayon < 1e-3) return false;

        const azimut = Math.atan2(ecart.x, ecart.z) + sens * PAS_ROTATION_CAMERA;
        const arrivee = new THREE.Vector3(
          cible.x + Math.sin(azimut) * rayon,
          kaykit3D.camera.position.y,
          cible.z + Math.cos(azimut) * rayon
        );

        /* Tourner à la main, c'est reprendre la main : on passe en LIBRE, comme
           le ferait un glissé. Sans quoi le prochain recadrage automatique
           annulerait l'angle qu'on vient de choisir. ESPACE rend l'automatique. */
        kaykit3D.autoFit = false;
        kaykit3D.userRotated = true;
        if (kaykit3D.cameraMode !== "free") { kaykit3D.cameraMode = "free"; updateKayKitCameraModeUI(); }
        kaykit3D.cameraHint?.classList.add("hidden");

        kaykit3D.cameraTween = {
          started: performance.now(),
          duration: kaykitReducedMotion() ? 90 : 300,
          startPosition: kaykit3D.camera.position.clone(),
          endPosition: arrivee,
          startTarget: cible.clone(),
          endTarget: cible
        };
        return true;
      }

      /* ESPACE : retour à la vue de face, et retour à la caméra assistée.

         Les deux vont ensemble. Jusqu'ici, un simple glissé faisait basculer en
         LIBRE définitivement, et il fallait rouvrir le menu ⚙ pour retrouver
         l'automatique — autant dire que personne ne le retrouvait. Une touche
         qui remet la vue d'aplomb doit aussi remettre l'assistance. */
      function reprendreKayKitVueDeFace() {
        if (!kaykit3D) return false;
        snapKayKitView("front");
        kaykit3D.cameraMode = "auto";
        updateKayKitCameraModeUI();
        return true;
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

      /* Recadre au début du tour sur ce qui compte : les gardiens du joueur ET
         la couronne libre la plus proche d'eux.

         Auparavant la caméra ne visait que le barycentre des gardiens. On
         voyait donc ses pièces sans voir l'objectif — or à ILYOS l'objectif se
         déplace, et savoir où est la couronne est la première question qu'on se
         pose en début de tour.

         Le cadre s'élargit avec l'étalement des points d'intérêt : deux gardiens
         voisins d'une couronne tiennent dans un plan serré, des gardiens
         dispersés aux quatre coins demandent du recul. Sans cela, élargir le
         point visé sans reculer la caméra ne ferait que sortir tout le monde du
         champ. */
      function kaykitFollowCurrentPlayer(force = false) {
        if (!kaykit3D || !state?.characters?.length) return;
        if (!force && kaykit3D.cameraMode !== "auto") return;
        const mine = state.characters.filter(ch => ch.player === state.currentPlayer);
        if (!mine.length) return;

        const centreR = mine.reduce((somme, ch) => somme + ch.r, 0) / mine.length;
        const centreC = mine.reduce((somme, ch) => somme + ch.c, 0) / mine.length;

        const interets = mine.map(ch => ({ r: ch.r, c: ch.c }));
        const couronne = [state.artifact, state.secondArtifact]
          .filter(item => item?.active && !item.carrierId && Number.isFinite(item.r) && Number.isFinite(item.c))
          .sort((a, b) =>
            (Math.abs(a.r - centreR) + Math.abs(a.c - centreC))
            - (Math.abs(b.r - centreR) + Math.abs(b.c - centreC))
          )[0];
        if (couronne) interets.push({ r: couronne.r, c: couronne.c });

        const rs = interets.map(p => p.r);
        const cs = interets.map(p => p.c);
        const viseR = (Math.min(...rs) + Math.max(...rs)) / 2;
        const viseC = (Math.min(...cs) + Math.max(...cs)) / 2;

        /* Recul proportionnel à l'étalement, plafonné : au-delà, on ne lirait
           plus les gardiens. Le signe est négatif parce que kaykitFollowCell
           SOUSTRAIT le zoomBoost de la distance — un boost positif rapproche. */
        const etalement = Math.max(Math.max(...rs) - Math.min(...rs), Math.max(...cs) - Math.min(...cs));
        const recul = -Math.min(2.6, Math.max(0, etalement - 2) * .42);

        kaykitFollowCell(viseR, viseC, { duration: 720, force, zoomBoost: recul });
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
      /* Deuxième passe, après un premier retour en jeu : teindre chaque case
         atteignable (essayé ci-dessus, capture à l'appui) rendait bien la
         zone lisible, mais chargeait le plateau d'autant de tuiles que de
         cases atteignables. Ce qui manquait vraiment, c'était de voir d'un
         coup d'œil jusqu'où on peut aller — un contour, pas un pavage.

         `cellules` est l'ensemble complet des cases atteignables (tableau de
         [r, c]) ; la fonction ne dessine que les arêtes qui séparent une case
         du groupe d'une case qui n'y est pas, c'est-à-dire le périmètre
         extérieur — quelle que soit la forme de la zone (un carré plein, un
         U, deux îles disjointes...). Il n'y a plus de notion de coût par
         case : la ligne dit "vous pouvez atteindre jusqu'ici", pas "cette
         case-ci coûte plus cher que celle-là" — l'information que portait
         l'ancien anneau intérieur disparaît avec lui. */
      /* Troisième formule pour la zone de déplacement, après l'aplat plein
         (jugé "toutes les cases colorées en bleu", pas voulu) : un simple
         CONTOUR, bleu (même famille que la flèche de trajet), sans lueur ni
         remplissage. Reprend l'algorithme déjà validé pour le contour
         précédent — hauteur par case, comblement des trous d'obstacle,
         correction des coins en diagonale — avant qu'il ne soit remplacé
         par l'aplat ; seules la couleur et l'épaisseur changent ici.

         Le déplacement diagonal coûte 2, l'orthogonal 1 (movementEdges,
         core.js) : deux cases atteignables ne se touchent donc souvent que
         par un coin, sans case intermédiaire. Un contour naïf border alors
         chacune séparément — l'effet "grille de petites boîtes" signalé en
         jeu. Choix confirmé : PONTER ces coins pour ne former qu'une seule
         forme continue, plutôt que de laisser chaque case isolée avec son
         propre contour. */
      function addKayKitMoveZone(cellulesAtteignables) {
        const group = kaykit3D?.moveZoneGroup;
        if (!group || !cellulesAtteignables || !cellulesAtteignables.length) return;

        const demi = KAYKIT_CELL_SPACING / 2;
        const cle = (r, c) => r + "," + c;
        const ensembleAtteignable = new Set(cellulesAtteignables.map(([r, c]) => cle(r, c)));

        /* Une case occupée (gardien, couronne) au milieu de la zone n'est
           pas "atteignable" au sens des règles (movementRange l'exclut via
           characterAt), mais l'exclure du CONTOUR créait un petit anneau
           autour de chaque obstacle. On la réintègre ici pour le seul TRACÉ
           (jamais dans l'ensemble atteignable réel) si elle est entourée
           sur ses 4 côtés par la zone — un vrai renfoncement du contour,
           lui, communique avec l'extérieur de la zone et reste donc creusé. */
        const cellules = cellulesAtteignables.map(([r, c]) => [r, c]);
        const dansContour = new Set(ensembleAtteignable);
        const candidatsTrou = new Set();
        for (const [r, c] of cellulesAtteignables) {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const k = cle(r + dr, c + dc);
            if (!ensembleAtteignable.has(k)) candidatsTrou.add(k);
          }
        }
        for (const k of candidatsTrou) {
          const [r, c] = k.split(",").map(Number);
          if (!isLand(r, c)) continue;
          const entoure = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .every(([dr, dc]) => ensembleAtteignable.has(cle(r + dr, c + dc)));
          if (!entoure) continue;
          dansContour.add(k);
          cellules.push([r, c]);
        }
        const dedans = (r, c) => dansContour.has(cle(r, c));

        /* Chaque bord est identifié par les DEUX SOMMETS qu'il relie, en
           indices de sommet — le sommet (i,j) est le coin nord-ouest de la
           case (i,j). Garder ces indices (plutôt que directement des
           coordonnées monde) permet de repérer, par simple égalité, tous
           les segments qui passent par un même sommet — nécessaire pour la
           correction du coin en diagonale ci-dessous. */
        const bords = [
          { dr: -1, dc: 0, sommets: [[0, 0], [0, 1]] },
          { dr: 1, dc: 0, sommets: [[1, 0], [1, 1]] },
          { dr: 0, dc: -1, sommets: [[0, 0], [1, 0]] },
          { dr: 0, dc: 1, sommets: [[0, 1], [1, 1]] }
        ];
        // Hauteur PAR CASE (pas une hauteur commune au groupe) : chaque bord
        // suit la surface réelle de la case dont il vient, pour ne jamais
        // flotter au-dessus d'une case plus basse quand la zone mélange des
        // reliefs différents (sanctuaire surélevé + île ordinaire).
        const pointSommet = (i, j, yLocal) => {
          const centre = kaykitCellPosition(i, j, yLocal);
          return { x: centre.x - demi, z: centre.z - demi };
        };

        let segments = [];
        for (const [r, c] of cellules) {
          const yCase = kaykitCellSurfaceY(r, c) + .03;
          for (const bord of bords) {
            // Un voisin dans l'ensemble : ce bord est un mur interne, partagé
            // entre deux cases atteignables — pas un bord du périmètre.
            if (dedans(r + bord.dr, c + bord.dc)) continue;
            const [s1, s2] = bord.sommets;
            const i1 = r + s1[0], j1 = c + s1[1], i2 = r + s2[0], j2 = c + s2[1];
            const p1 = pointSommet(i1, j1, yCase);
            const p2 = pointSommet(i2, j2, yCase);
            segments.push({ i1, j1, i2, j2, x1: p1.x, y1: yCase, z1: p1.z, x2: p2.x, y2: yCase, z2: p2.z });
          }
        }
        if (!segments.length) return;

        /* Correction du coin en diagonale : quand exactement 4 demi-
           segments se rencontrent à un sommet (diagonale opposée "dedans",
           orthogonale opposée "dehors" — une marche d'escalier), on
           RACCOURCIT les 4 segments (jamais on ne les supprime — ça rouvrait
           le périmètre) et on les relie par deux courtes diagonales qui
           pontent le sommet au lieu de s'y croiser en X. C'est ce pontage,
           précisément, qui fait qu'une zone en marches d'escalier se lit
           comme UNE forme plutôt que comme des cases isolées. */
        const sommetsCandidats = new Set();
        for (const s of segments) {
          sommetsCandidats.add(s.i1 + "," + s.j1);
          sommetsCandidats.add(s.i2 + "," + s.j2);
        }
        const coupe = demi * .45;
        for (const cleSommet of sommetsCandidats) {
          const [i, j] = cleSommet.split(",").map(Number);
          const no = dedans(i - 1, j - 1);
          const ne = dedans(i - 1, j);
          const so = dedans(i, j - 1);
          const se = dedans(i, j);
          const diagNoSe = no && se && !ne && !so;
          const diagNeSo = ne && so && !no && !se;
          if (!diagNoSe && !diagNeSo) continue;

          const concernes = segments.filter(seg => (seg.i1 === i && seg.j1 === j) || (seg.i2 === i && seg.j2 === j));
          if (concernes.length !== 4) continue;

          const yVertex = concernes[0].y1;
          const p = pointSommet(i, j, yVertex);
          const coupes = {
            nord: { x: p.x, z: p.z - coupe },
            sud: { x: p.x, z: p.z + coupe },
            ouest: { x: p.x - coupe, z: p.z },
            est: { x: p.x + coupe, z: p.z }
          };
          for (const seg of concernes) {
            const surI1 = seg.i1 === i && seg.j1 === j;
            const autre = surI1 ? { x: seg.x2, z: seg.z2 } : { x: seg.x1, z: seg.z1 };
            const dx = autre.x - p.x, dz = autre.z - p.z;
            const direction = Math.abs(dx) > Math.abs(dz)
              ? (dx > 0 ? "est" : "ouest")
              : (dz > 0 ? "sud" : "nord");
            const point = coupes[direction];
            if (surI1) { seg.x1 = point.x; seg.z1 = point.z; }
            else { seg.x2 = point.x; seg.z2 = point.z; }
          }

          const yLiaison = concernes[0].y1;
          if (diagNoSe) {
            segments.push({ x1: coupes.ouest.x, y1: yLiaison, z1: coupes.ouest.z, x2: coupes.sud.x, y2: yLiaison, z2: coupes.sud.z });
            segments.push({ x1: coupes.nord.x, y1: yLiaison, z1: coupes.nord.z, x2: coupes.est.x, y2: yLiaison, z2: coupes.est.z });
          } else {
            segments.push({ x1: coupes.nord.x, y1: yLiaison, z1: coupes.nord.z, x2: coupes.ouest.x, y2: yLiaison, z2: coupes.ouest.z });
            segments.push({ x1: coupes.sud.x, y1: yLiaison, z1: coupes.sud.z, x2: coupes.est.x, y2: yLiaison, z2: coupes.est.z });
          }
        }

        /* Des rubans, pas des THREE.Line : `linewidth` sur LineBasicMaterial
           est ignoré par la quasi-totalité des pilotes desktop. Un ruban (un
           rectangle fin, orienté par sa rotation Y) a une épaisseur RÉELLE
           en unités de scène, donc un rendu garanti quel que soit le pilote. */
        const ajouterRuban = (segment, decalageY, couleur, opacite, epaisseur) => {
          const dx = segment.x2 - segment.x1;
          const dz = segment.z2 - segment.z1;
          const longueur = Math.hypot(dx, dz);
          if (longueur < 1e-4) return;
          const ruban = new THREE.Mesh(
            // +epaisseur en longueur : les bouts des rubans se rejoignent au
            // coin de la case sans laisser de brèche entre deux segments
            // perpendiculaires.
            new THREE.PlaneGeometry(longueur + epaisseur, epaisseur),
            new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: opacite, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
          );
          ruban.rotation.x = -Math.PI / 2;
          ruban.rotation.z = -Math.atan2(dz, dx);
          const yRuban = (segment.y1 !== undefined ? segment.y1 : segment.y2);
          ruban.position.set((segment.x1 + segment.x2) / 2, yRuban + decalageY, (segment.z1 + segment.z2) / 2);
          ruban.renderOrder = decalageY > 0 ? 20 : 19;
          group.add(ruban);
          registerKayKitFadeIn(ruban);
        };

        // Bleu (même famille que la flèche de trajet) plutôt que l'or/blanc
        // des essais précédents — un seul ensemble visuel cohérent avec la
        // flèche. Deux couches seulement (foncée dessous, claire dessus),
        // sans troisième couche de lueur : la lueur avait fini, à elle
        // seule, par former "une bande beaucoup trop large". Épaisseur mise
        // à l'échelle du zoom pour rester constante à l'écran.
        const zoomReference = 12.4 * (GRID / 11);
        const echelleZoom = THREE.MathUtils.clamp((kaykit3D.zoomDistance || zoomReference) / zoomReference, .4, 1.6);
        const epaisseurClaire = .12 * echelleZoom;
        const epaisseurSombre = epaisseurClaire + .045 * echelleZoom;
        for (const segment of segments) ajouterRuban(segment, -.002, 0x0d3a56, .85, epaisseurSombre);
        for (const segment of segments) ajouterRuban(segment, .002, 0x7fd8ff, 1, epaisseurClaire);
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

        /* Rayon élargi (.36 → .56) : c'est la seule cible de toute l'action
           poussée qui se trouve DANS LE VIDE, hors de la trame du plateau — sans
           la case elle-même pour rattraper un clic légèrement décalé, comme le
           fait la moindre autre destination (la sphère invisible EST toute la
           zone cliquable). Signalé injouable « quelquefois » : à un rayon aussi
           serré, un clic à peine excentré sur l'icône ☠ manquait sa cible. La
           sphère reste invisible (opacity .001) — seul son rayon change. */
        const hit = new THREE.Mesh(
          kaykitGeometry("unified-push-death-hit-v1", () => new THREE.SphereGeometry(.56, 12, 8)),
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

      /* Trajet de déplacement : une flèche fine qui suit le chemin réel du
         gardien jusqu'à la case survolée (façon Advance Wars), plutôt que
         d'empiler un carré orange plein sur chaque case traversée — signalé
         "pas beau" en jeu, et redondant avec l'aplat de zone qui montre déjà
         tout ce qui est atteignable. La flèche, elle, n'ajoute qu'une seule
         information : la DIRECTION prise pour s'y rendre. */
      /* Matériaux ET géométries mis en cache une fois pour toutes (jamais
         recréés à chaque appel) : cette fonction tourne à CHAQUE case
         survolée, donc à peu près à chaque déplacement de souris pendant un
         déplacement — signalé "ça ralentit le jeu" une fois le survol
         câblé dessus. Les segments d'un trajet sur grille n'ont que deux
         longueurs possibles (un pas droit ou un pas en diagonale), donc les
         géométries de tige se comptent en tout et pour tout sur les doigts
         d'une main ; pas besoin d'en fabriquer une nouvelle par case.
         Couleur/opacité fixes également : les matériaux sont créés une
         seule fois et jamais partagés entre eux (chaque couche a le sien),
         donc pas de fondu à l'apparition à leur appliquer — regénérer un
         matériau par mesh (nécessaire un temps pour contourner un bug de
         registerKayKitFadeIn sur matériau partagé) coûtait une allocation
         GPU à chaque survol pour un résultat identique à un matériau fixe. */
      // Bleu (même famille que l'aplat de zone, pour un seul ensemble
      // visuel cohérent) et nettement plus fine : signalé "plus belle, plus
      // fine et de couleur bleue" une fois l'or/marron jugé correct mais pas
      // assez soigné. Rayons quasiment divisés par deux par rapport à la
      // version précédente (.075/.05 → .045/.028 pour les tiges).
      const KAYKIT_MOVE_PATH_SOMBRE = { couleur: 0x0d3a56, opacite: .8 };
      const KAYKIT_MOVE_PATH_CLAIRE = { couleur: 0x7fd8ff, opacite: 1 };
      let kaykitMovePathMateriaux = null;
      function kaykitMovePathRessources() {
        if (kaykitMovePathMateriaux) return kaykitMovePathMateriaux;
        const mat = (couleur, opacite) => new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: opacite, depthWrite: false, depthTest: false });
        kaykitMovePathMateriaux = {
          matSombre: mat(KAYKIT_MOVE_PATH_SOMBRE.couleur, KAYKIT_MOVE_PATH_SOMBRE.opacite),
          matClair: mat(KAYKIT_MOVE_PATH_CLAIRE.couleur, KAYKIT_MOVE_PATH_CLAIRE.opacite),
          jointSombre: kaykitGeometry("move-path-joint-dark-v2", () => new THREE.SphereGeometry(.05, 10, 8)),
          jointClair: kaykitGeometry("move-path-joint-light-v2", () => new THREE.SphereGeometry(.032, 10, 8)),
          teteSombre: kaykitGeometry("move-path-head-dark-v2", () => new THREE.ConeGeometry(.13, .24, 12)),
          teteClaire: kaykitGeometry("move-path-head-light-v2", () => new THREE.ConeGeometry(.09, .2, 12)),
          // Longueur d'un pas droit = KAYKIT_CELL_SPACING, d'un pas en
          // diagonale = KAYKIT_CELL_SPACING·√2 — les deux seules valeurs
          // possibles sur un trajet en grille, donc les deux seules tiges à
          // mettre en cache (une par épaisseur).
          tigeSombreDroite: kaykitGeometry("move-path-shaft-dark-ortho-v2", () => new THREE.CylinderGeometry(.045, .045, KAYKIT_CELL_SPACING, 10)),
          tigeSombreDiagonale: kaykitGeometry("move-path-shaft-dark-diag-v2", () => new THREE.CylinderGeometry(.045, .045, KAYKIT_CELL_SPACING * Math.SQRT2, 10)),
          tigeClaireDroite: kaykitGeometry("move-path-shaft-light-ortho-v2", () => new THREE.CylinderGeometry(.028, .028, KAYKIT_CELL_SPACING, 10)),
          tigeClaireDiagonale: kaykitGeometry("move-path-shaft-light-diag-v2", () => new THREE.CylinderGeometry(.028, .028, KAYKIT_CELL_SPACING * Math.SQRT2, 10))
        };
        return kaykitMovePathMateriaux;
      }

      function addKayKitMovePathArrow(actor, path) {
        const group = kaykit3D?.actionPreviewGroup;
        if (!group || !actor || !path || !path.length) return;
        const yOf = (r, c) => kaykitCellSurfaceY(r, c) + .09;
        const points = [kaykitCellPosition(actor.r, actor.c, yOf(actor.r, actor.c))];
        for (const [r, c] of path) points.push(kaykitCellPosition(r, c, yOf(r, c)));

        const res = kaykitMovePathRessources();
        const segmentsTracés = [];
        for (let i = 0; i < points.length - 1; i++) {
          const from = points[i], to = points[i + 1];
          const direction = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
          const length = direction.length();
          if (length < 1e-4) continue;
          direction.normalize();
          // Diagonale si la longueur dépasse nettement un pas droit — la
          // légère différence de hauteur entre deux cases de reliefs
          // différents peut allonger un peu un pas droit sans le
          // transformer en diagonale ; le seuil est à mi-chemin des deux.
          const diagonale = length > KAYKIT_CELL_SPACING * 1.2;
          segmentsTracés.push({ from, direction, diagonale, coude: i > 0 });
        }

        /* Deux tons superposés (foncé dessous et plus large, clair dessus et
           plus fin) plutôt qu'une seule teinte or : signalé invisible sur le
           sable doré du sanctuaire — un ton unique, quel qu'il soit, finit
           toujours par se fondre dans UNE case du plateau ; la paire
           foncé/clair, elle, contraste avec à peu près n'importe quel fond. */
        const ajouterCouche = (tigeDroite, tigeDiagonale, joint, materiau, decalageY, ordre) => {
          for (const seg of segmentsTracés) {
            const shaft = new THREE.Mesh(seg.diagonale ? tigeDiagonale : tigeDroite, materiau);
            shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), seg.direction);
            shaft.position.copy(seg.from).addScaledVector(seg.direction, (seg.diagonale ? KAYKIT_CELL_SPACING * Math.SQRT2 : KAYKIT_CELL_SPACING) / 2);
            shaft.position.y += decalageY;
            shaft.renderOrder = ordre;
            group.add(shaft);

            // Petite bille à chaque coude : masque la brèche que deux
            // tronçons à angle laisseraient sinon entre eux.
            if (seg.coude) {
              const joint2 = new THREE.Mesh(joint, materiau);
              joint2.position.copy(seg.from);
              joint2.position.y += decalageY;
              joint2.renderOrder = ordre;
              group.add(joint2);
            }
          }
        };
        // renderOrder 96/97 : au-dessus du réticule de survol natif (jusqu'à
        // 92, voir hoverOutline) — sinon, sur un trajet d'une seule case, le
        // réticule couvre exactement la même case et peint PAR-DESSUS la
        // flèche, qui devient alors invisible malgré des meshes bel et bien
        // créés au bon endroit (signalé en jeu).
        ajouterCouche(res.tigeSombreDroite, res.tigeSombreDiagonale, res.jointSombre, res.matSombre, -.006, 96);
        ajouterCouche(res.tigeClaireDroite, res.tigeClaireDiagonale, res.jointClair, res.matClair, .006, 97);

        const last = points[points.length - 1];
        const prev = points[points.length - 2];
        const directionFinale = new THREE.Vector3(last.x - prev.x, last.y - prev.y, last.z - prev.z).normalize();
        const ajouterTete = (geometry, materiau, decalageY, ordre) => {
          const head = new THREE.Mesh(geometry, materiau);
          head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), directionFinale);
          head.position.copy(last).addScaledVector(directionFinale, -.02);
          head.position.y += decalageY;
          head.renderOrder = ordre;
          group.add(head);
        };
        ajouterTete(res.teteSombre, res.matSombre, -.006, 96);
        ajouterTete(res.teteClaire, res.matClair, .006, 97);
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

        /* Zone de déplacement gérée À PART, sur sa PROPRE clé et son propre
           groupe (kaykit3D.moveZoneGroup) — jamais mêlée à previewKey plus
           bas, qui change à CHAQUE case survolée. Avant cette séparation,
           reconstruire previewKey détruisait puis refaisait apparaître EN
           FONDU la zone entière à chaque survol, un clignotement disgracieux
           signalé en jeu ; ici, la zone ne bouge que lorsque l'ensemble
           atteignable lui-même change (sélection d'un autre gardien, fin de
           l'action).

           Clé = la RÉFÉRENCE de state.reachable, pas son contenu trié et
           sérialisé en JSON. `state.reachable` est TOUJOURS réaffecté à un
           Set neuf (jamais muté en place — vérifié sur tous les points
           d'affectation du fichier), donc comparer les références suffit à
           détecter un vrai changement, pour un coût nul. Le tri + JSON.
           stringify tournait, lui, à CHAQUE case survolée (cette fonction
           est appelée à chaque mousemove) — un vrai coût CPU répété pour ne
           produire, la plupart du temps, que la même clé. Signalé en jeu
           comme un ralentissement. */
        const zoneRef = smartResting ? state.reachable : null;
        if (zoneRef !== kaykit3D.moveZoneRef) {
          kaykit3D.moveZoneRef = zoneRef;
          clearKayKitGroup(kaykit3D.moveZoneGroup);
          if (smartResting) {
            const cellules = [...(state.reachable || [])].map(cellKey => cellKey.split(",").map(Number));
            addKayKitMoveZone(cellules);
          }
        }

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
          spawnHover: state.phase === "PLACE_SPAWN" ? [state.pendingSpawnIslandId, state.hoverAnchor] : null,
          /* Mise en place personnalisée : deux placements de gardiens
             consécutifs partagent phase ET pendingSpawnIslandId (toujours
             null), donc sans le rang du draft la clé serait identique d'un
             joueur à l'autre — les cases éclairées du précédent resteraient
             affichées pour le suivant. */
          draftPick: state.draft ? [state.draft.index, state.currentPlayer] : null
        });
        if (previewKey === kaykit3D.actionPreviewKey) return;
        kaykit3D.actionPreviewKey = previewKey;
        clearKayKitGroup(kaykit3D.actionPreviewGroup);
        kaykit3D.interactiveMeshes = (kaykit3D.interactiveMeshes || []).filter(object => !!object?.parent);
        kaykit3D.animatedObjects = kaykit3D.animatedObjects.filter(object => object?.parent);

        if (state.phase === "PLACE_SPAWN" && (state.pendingSpawnIslandId || state.draft)) {
          /* Mise en place personnalisée : le gardien n'est pas rattaché à une
             île fraîchement posée, les cases ouvertes sont toutes celles du
             joueur (voir draftGuardianCellAllowed). */
          const spawnIsland = state.pendingSpawnIslandId
            ? state.islands.find(is => is.id === state.pendingSpawnIslandId)
            : null;
          const cellAllowed = state.draft
            ? (r, c) => draftGuardianCellAllowed(state.currentPlayer, r, c)
            : (r, c) => !!spawnIsland?.cells?.some(([ir, ic]) => ir === r && ic === c) && !characterAt(r, c);

          const spawnCells = state.draft
            ? [
              ...state.islands
                .filter(island => island.owner === state.currentPlayer)
                .flatMap(island => island.cells),
              ...(state.players[state.currentPlayer]?.villages || []).map(village => [village.r, village.c])
            ]
            : (spawnIsland?.cells || []);

          const hoverKey = state.hoverAnchor ? key(state.hoverAnchor[0], state.hoverAnchor[1]) : null;
          spawnCells.forEach(([r, c]) => {
            if (!cellAllowed(r, c)) return;
            if (key(r, c) === hoverKey) return;
            addKayKitSpawnAffordance(r, c);
          });
          if (state.hoverAnchor) {
            const [hr, hc] = state.hoverAnchor;
            if (cellAllowed(hr, hc)) addKayKitSpawnGuardianGhost(hr, hc, state.currentPlayer);
          }
          return;
        }

        if (unifiedPushActive) {
          renderUnifiedPushAffordances();
          return;
        }

        if (moveActive && state.selectedCharId) {
          const path = state.smartHoverPath || [];
          if (path.length) addKayKitMovePathArrow(characterById(state.selectedCharId), path);
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
          clearKayKitGroup(kaykit3D.moveZoneGroup);
          kaykit3D.moveZoneRef = null;
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
        // Appelé explicitement à chaque annulation/fin de tour (turns.js,
        // ui.js) — la zone de déplacement doit disparaître avec le reste,
        // pas seulement au prochain survol.
        clearKayKitGroup(kaykit3D.moveZoneGroup);
        kaykit3D.moveZoneRef = null;
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

          // Ciel : bascule vers l'image équirectangulaire dès qu'elle a fini de charger
          // (réseau, pas un asset KayKit — condition indépendante des autres reprises).
          if (!kaykit3D.cielImageRepris) {
            kaykit3D.cielImageRepris = kaykitReprendreCielImage();
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
