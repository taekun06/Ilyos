      /* =====================================================================
         ILYOS — KAYKIT EDITION / moteur visuel Three.js
         Le modèle de jeu reste dans le DOM. Cette scène 3D reflète l'état et
         redirige les interactions vers les cellules originales.
         ===================================================================== */
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
        const hitGroup = new THREE.Group();
        const fxGroup = new THREE.Group();
        root.add(staticGroup, dynamicGroup, hitGroup, fxGroup);
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
          staticGroup, dynamicGroup, hitGroup, fxGroup, raycaster, pointer, clock, loader, textureLoader,
          hitMeshes: [], assets: new Map(), assetAnimations: new Map(), assetPromises: new Map(), failedAssets: new Set(), assetSources: new Map(), assetTextureUrls: new Map(),
          textureCache: new Map(), texturedMaterials: 0, untexturedMaterials: 0, repairedMaterials: 0, failedTextureAssets: new Set(), missingTexture: null,
          mixers: [], heroAnimators: [], proceduralHeroes: [], animatedObjects: [], skyLayers: [], hoverCell: null, hoverMarker: null, actionPreviewGroup: null, actionPreviewKey: null, viewMode: "front", disposed: false,
          zoomDistance: 12.4, minZoom: 6.4, maxZoom: 25, viewTarget: new THREE.Vector3(0, .22, .18),
          materials: new Map(), geometries: new Map(), lastStateSignature: "", loadedCount: 0, totalAssets: Object.keys(KAYKIT_ASSETS).length,
          packCatalog: new Map(), packRepresentatives: new Map(), packReady: new Set(), packErrors: new Set(),
          animationClipNames: new Set(), pendingActionAnimations: new Map(), activeMovementTweens: new Map(), characterHistory: new Map(), characterFacing: new Map(), cellVisuals: new Map(), hoveredVisuals: [], hoveredVisualKey: null, interactiveMeshes: [], universeSeed: Date.now(),
          orbit: null, manualOrbit: { azimuth: Math.PI / 4, polar: .88 }, cameraTween: null, tmpTweenTarget: new THREE.Vector3(), autoFit: true, userRotated: false, userInteracting: false, lastAspect: 1,
          syncInProgress: false, syncPending: false, cameraMode: "auto"
        };

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

      function accentVillageColors(object, color) {
        if (!object) return object;
        const accent = new THREE.Color(color || 0xffffff);
        const brightStone = new THREE.Color(0xf6edd6);
        const roofColor = accent.clone().offsetHSL(0, .24, .12);
        object.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const source = Array.isArray(child.material) ? child.material : [child.material];
          const styled = source.map(material => {
            const mat = material.clone();
            const label = `${child.name || ''} ${mat.name || ''}`.toLowerCase();
            const isRoof = /roof|flag|banner|cloth|cap|cone|spire/.test(label);
            const isStone = /wall|stone|tower|base|castle/.test(label);
            if (isRoof || isStone) {
              if ('map' in mat) mat.map = null;
              if ('aoMap' in mat) mat.aoMap = null;
              if ('lightMap' in mat) mat.lightMap = null;
              if ('emissiveMap' in mat) mat.emissiveMap = null;
            }
            if (mat.color) {
              const base = mat.color.clone();
              if (isRoof) {
                mat.color.copy(roofColor);
              } else if (isStone) {
                const stone = brightStone.clone().lerp(accent, .40);
                mat.color.copy(stone);
              } else {
                mat.color.copy(base.lerp(accent, .98));
              }
            }
            if ('emissive' in mat) {
              mat.emissive = (isRoof ? roofColor : accent).clone();
              mat.emissiveIntensity = isRoof ? .78 : (isStone ? .26 : .46);
            }
            if ('metalness' in mat) mat.metalness = isRoof ? .10 : Math.min(mat.metalness ?? 0, .06);
            if ('roughness' in mat) mat.roughness = isRoof ? .20 : Math.min(mat.roughness ?? .75, .46);
            mat.needsUpdate = true;
            return mat;
          });
          child.material = Array.isArray(child.material) ? styled : styled[0];
        });
        return object;
      }

      function addVillageVisibilityBoost(object, color) {
        if (!object) return object;
        const accentColor = new THREE.Color(color || 0xffffff);
        const accent = accentColor.getHex();
        const basePlate = new THREE.Mesh(
          new THREE.CylinderGeometry(.62, .66, .075, 8),
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
          new THREE.TorusGeometry(.57, .065, 12, 32),
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
          new THREE.CylinderGeometry(.018, .018, .52, 8),
          new THREE.MeshStandardMaterial({ color: 0xf7f0e1, roughness: .52, metalness: .08 })
        );
        flagPole.position.set(.18, .96, 0);
        object.add(flagPole);

        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(.20, .11, .02),
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
        // immédiate au lieu de la couronne plate d'origine.
        const gold = kaykitMaterial(0xffcf3f, { roughness: .16, metalness: .9, emissive: 0x6b3f00, emissiveIntensity: .16 });
        const velvet = kaykitMaterial(0x7a1230, { roughness: .92, metalness: 0 });
        const ruby = kaykitMaterial(0xff2f4d, { roughness: .12, metalness: .3, emissive: 0xb0002a, emissiveIntensity: .55 });
        const sapphire = kaykitMaterial(0x3fa0ff, { roughness: .14, metalness: .28, emissive: 0x1257c9, emissiveIntensity: .5 });

        const cap = new THREE.Mesh(kaykitGeometry("crown-cap-v1", () => new THREE.CylinderGeometry(.185, .20, .10, 14)), velvet);
        cap.position.y = .05; cap.castShadow = true; group.add(cap);

        const band = new THREE.Mesh(kaykitGeometry("crown-band-v2", () => new THREE.CylinderGeometry(.205, .205, .12, 16)), gold);
        band.position.y = .105; band.castShadow = true; group.add(band);

        const spikeCount = 8;
        const spikeGeometry = kaykitGeometry("crown-spike-v2", () => new THREE.ConeGeometry(.055, 1, 8));
        for (let i = 0; i < spikeCount; i++) {
          const a = i / spikeCount * Math.PI * 2;
          const spike = new THREE.Mesh(spikeGeometry, gold);
          spike.scale.y = .30;
          spike.position.set(Math.cos(a) * .165, .165 + .15, Math.sin(a) * .165);
          spike.castShadow = true;
          group.add(spike);
          if (i % 2 === 0) {
            const gem = new THREE.Mesh(kaykitGeometry("crown-band-gem-v1", () => new THREE.OctahedronGeometry(.034)), i % 4 === 0 ? ruby : sapphire);
            gem.position.set(Math.cos(a) * .205, .105, Math.sin(a) * .205);
            group.add(gem);
          }
        }

        const jewel = new THREE.Mesh(kaykitGeometry("crown-jewel-v2", () => new THREE.OctahedronGeometry(.078)), ruby);
        jewel.position.y = .43; jewel.scale.y = 1.3; group.add(jewel);
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

      const KAYKIT_ANIMATION_PATTERNS = {
        neutral: [/idle/i, /standing/i, /breath/i, /relax/i],
        move: [/run/i, /walk/i, /dash/i, /jump/i, /hop/i, /crawl/i, /sneak/i],
        attack: [/attack/i, /slash/i, /melee/i, /punch/i, /kick/i, /strike/i, /shoot/i],
        magic: [/cast/i, /spell/i, /magic/i, /summon/i, /staff/i, /wand/i],
        victory: [/cheer/i, /victory/i, /wave/i, /dance/i, /taunt/i, /celebr/i],
        hurt: [/hit/i, /hurt/i, /damage/i, /defeat/i, /death/i, /fall/i]
      };

      function chooseKayKitAnimationClip(clips, intent = "move", seed = 0) {
        if (!clips.length || !KAYKIT_ANIMATION_PATTERNS[intent]) return null;
        const patterns = KAYKIT_ANIMATION_PATTERNS[intent];
        let candidates = clips.filter(clip => patterns.some(pattern => pattern.test(clip.name || "")));
        if (intent === "neutral") {
          const safe = candidates.filter(clip => !/aim|attack|combat|weapon|sword|staff|bow|cast|spell|block|shield|hold|carry|hurt|death|jump|run|walk/i.test(clip.name || ""));
          if (safe.length) candidates = safe;
        }
        if (!candidates.length && intent !== "neutral") candidates = clips.filter(clip => !/idle|standing|breath|relax/i.test(clip.name || ""));
        if (!candidates.length && intent === "neutral") return null;
        if (!candidates.length) return null;
        if (intent === "neutral") {
          candidates.sort((a, b) => {
            const score = name => /idle_a|idle 1|idle_1|standing_idle/i.test(name) ? 0 : /standing/i.test(name) ? 1 : /idle/i.test(name) ? 2 : /breath|relax/i.test(name) ? 3 : 4;
            return score(a.name || "") - score(b.name || "") || String(a.name || "").localeCompare(String(b.name || ""));
          });
          return candidates[0] || null;
        }
        const index = Math.floor(Math.abs(seed % 1) * candidates.length);
        return candidates[index] || candidates[0];
      }

      function playKayKitAnimator(record, intent, seed = 0) {
        if (!record?.mixer || !record.clips?.length) return;
        const clip = chooseKayKitAnimationClip(record.clips, intent, seed);
        if (!clip) return;
        const next = record.mixer.clipAction(clip);
        next.reset().setEffectiveTimeScale(intent === "move" ? .96 : 1).setEffectiveWeight(1);
        next.setLoop(intent === "move" ? THREE.LoopRepeat : THREE.LoopOnce, intent === "move" ? Infinity : 1);
        next.clampWhenFinished = intent !== "move";
        next.fadeIn(.12).play();
        record.action = next;
        record.currentClip = clip;
        record.intent = intent;
      }

      function addAssetAnimation(wrapper, assetKey, intent = "neutral", seed = 0) {
        const clips = kaykit3D?.assetAnimations.get(assetKey) || [];
        if (!clips.length || !wrapper) return;
        const target = wrapper.children[0] || wrapper;
        const mixer = new THREE.AnimationMixer(target);
        const record = { mixer, target, clips, assetKey, action: null, currentClip: null, intent, seed };
        if (intent === "neutral") {
          const clip = chooseKayKitAnimationClip(clips, "neutral", seed);
          if (clip) {
            const action = mixer.clipAction(clip);
            action.reset().play();
            mixer.update(THREE.MathUtils.clamp(clip.duration * .28, .08, .34));
            action.paused = true;
            record.action = action; record.currentClip = clip;
          }
        } else {
          playKayKitAnimator(record, intent, seed);
          kaykit3D.mixers.push(mixer);
        }
        kaykit3D.heroAnimators.push(record);
      }

      function kaykitFacingRotation(fromR, fromC, toR, toC) {
        const dr = toR - fromR, dc = toC - fromC;
        if (!dr && !dc) return 0;
        return Math.atan2(dc, dr);
      }

      function queueKayKitActionAnimation(characterId, intent = "move", duration = 950, target = null, path = null) {
        if (!kaykit3D || characterId === null || characterId === undefined) return;
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
        }); scheduleKayKitSync();
        setTimeout(() => {
          if (!kaykit3D) return;
          const pending = kaykit3D.pendingActionAnimations.get(id);
          if (
            pending &&
            pending.actionToken === actionToken &&
            pending.expires <= performance.now()
          ) {
            kaykit3D.pendingActionAnimations.delete(id);
            scheduleKayKitSync();
          }
        }, duration + 80);
      }

      function queueKayKitCurrentPlayerAnimation(intent = "magic", duration = 1000) {
        const selected = state?.selectedCharId ? characterById(state.selectedCharId) : null;
        const actor = selected || state?.characters?.find(character => character.player === state.currentPlayer);
        if (actor) queueKayKitActionAnimation(actor.id, intent, duration);
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
        // Un gardien 3D est déjà visible sous le curseur : superposer un pictogramme
        // "personnage" redondant n'apporte rien et surcharge le survol.
        const glyphSuppressed = glyphKind === "character" || glyphKind === "select" || glyphKind === "invocation" || (placingIsland && (glyphKind === "place" || glyphKind === "invalid"));
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
        const hoverRingsSuppressed = glyphKind === "neutral" || glyphKind === "select" || glyphKind === "invocation" || (placingIsland && (glyphKind === "place" || glyphKind === "invalid"));
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
          if (previous && event) dispatchToCell("mouseleave", previous.r, previous.c, event, false);
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

          const next = hit
            ? { r: hit.userData.r, c: hit.userData.c, hit, hitAction: hit.userData?.kaykitAction || null }
            : null;
          const previous = kaykit3D.hoverCell;
          if (previous && (!next || previous.r !== next.r || previous.c !== next.c)) {
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
            updateHover(event);
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
        if (!force && kaykit3D.cameraMode !== "auto") return;
        const p = kaykitCellPosition(r, c, 0);
        kaykit3D.viewTarget = new THREE.Vector3(p.x, kaykit3D.viewTarget?.y ?? .22, p.z);
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
          child.traverse?.(obj => {
            if (obj.geometry?.userData?.ilyosTransient) obj.geometry.dispose?.();
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.filter(Boolean).forEach(mat => { if (mat.userData?.ilyosTransient) mat.dispose?.(); });
          });
          group.remove(child);
        }
      }

      function cellClassSet(r, c) {
        const cell = els.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        return cell ? cell.classList : null;
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
        const group = new THREE.Group();
        const shape = new THREE.Shape();
        shape.moveTo(-.46, -.46); shape.lineTo(.46, -.46); shape.lineTo(.46, .46); shape.lineTo(-.46, .46); shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: .42, bevelEnabled: true, bevelSegments: 2, bevelSize: .055, bevelThickness: .05, steps: 1 });
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
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-.45, .008, -.45), new THREE.Vector3(.45, .008, -.45), new THREE.Vector3(.45, .008, .45), new THREE.Vector3(-.45, .008, .45)
            ]),
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
        else if (classList.contains("push-fall-preview")) { color = 0xff3f45; fillOpacity = .58; kind = "push-danger"; size = .90 }
        else if (classList.contains("push-target-preview")) { color = 0xffa044; fillOpacity = .58; kind = "push-target"; size = .90 }
        else if (classList.contains("push-destination") || classList.contains("push-destination-preview")) { color = 0xff7442; fillOpacity = .46; kind = "push" }
        else if (classList.contains("push-line-preview")) { color = 0xffb14b; fillOpacity = .34; kind = "push" }
        // Marron uniforme (0xd9922f) sur tout l'identifiant "move", diagonale comprise :
        // ces cases utilisaient encore deux bleus cyan (0x63e6ff/0x36e6a3), en décalage
        // avec le reste du déplacement déjà recoloré.
        else if (classList.contains("diagonal-step-preview")) { color = 0xd9922f; fillOpacity = .46; kind = "move" }
        else if (classList.contains("move-target-preview")) { color = 0xd9922f; fillOpacity = .58; kind = "move"; size = .90 }
        else if (classList.contains("move-path-preview")) { color = 0xd9922f; fillOpacity = .34; kind = "move" }
        else if (classList.contains("reachable")) { color = 0xd9922f; fillOpacity = .52; kind = "move" }
        if (color === null) return;
        const p = kaykitCellPosition(r, c, kaykitCellSurfaceY(r, c));
        const y = p.y + .026;
        // Le gardien sélectionné mérite un halo rond épuré plutôt qu'un cadre carré
        // encombré de bordures et de coches : c'est ce halo que le joueur regarde
        // en premier, il doit rester net sur toute case (herbe, village, île sombre).
        const isSelected = kind === "selected";

        // Ombre de contraste : rend la sélection lisible sur herbe, pierre et village.
        const shadow = new THREE.Mesh(
          isSelected
            ? kaykitGeometry("cell-highlight-shadow-round-v1", () => new THREE.CircleGeometry(.49, 28))
            : kaykitGeometry("cell-highlight-shadow-v25", () => new THREE.PlaneGeometry(.94, .94)),
          new THREE.MeshBasicMaterial({ color: 0x071316, transparent: true, opacity: .62, depthWrite: false, depthTest: true, side: THREE.DoubleSide })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(p.x, y - .006, p.z);
        shadow.renderOrder = 27;
        kaykit3D.dynamicGroup.add(shadow);

        const fill = new THREE.Mesh(
          isSelected ? new THREE.CircleGeometry(size / 2, 28) : new THREE.PlaneGeometry(size, size),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.NormalBlending })
        );
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(p.x, y, p.z);
        fill.renderOrder = 30;
        kaykit3D.dynamicGroup.add(fill);

        if (!isSelected) {
          const outlinePoints = [
            new THREE.Vector3(-size / 2, 0, -size / 2), new THREE.Vector3(size / 2, 0, -size / 2),
            new THREE.Vector3(size / 2, 0, size / 2), new THREE.Vector3(-size / 2, 0, size / 2)
          ];
          const outer = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(outlinePoints),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .98, depthWrite: false, depthTest: true })
          );
          outer.position.set(p.x, y + .008, p.z);
          outer.renderOrder = 32;
          kaykit3D.dynamicGroup.add(outer);

          const innerSize = size - .11;
          const inner = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-innerSize / 2, 0, -innerSize / 2), new THREE.Vector3(innerSize / 2, 0, -innerSize / 2),
              new THREE.Vector3(innerSize / 2, 0, innerSize / 2), new THREE.Vector3(-innerSize / 2, 0, innerSize / 2)
            ]),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: lineOpacity, depthWrite: false, depthTest: true })
          );
          inner.position.set(p.x, y + .012, p.z);
          inner.renderOrder = 33;
          kaykit3D.dynamicGroup.add(inner);

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
          const borderY = y + .021;
          const horizontalGeometry = new THREE.BoxGeometry(size, borderHeight, borderThickness);
          const verticalGeometry = new THREE.BoxGeometry(borderThickness, borderHeight, size);
          [
            [horizontalGeometry, 0, -size / 2], [horizontalGeometry, 0, size / 2],
            [verticalGeometry, -size / 2, 0], [verticalGeometry, size / 2, 0]
          ].forEach(([geometry, dx, dz]) => {
            const bar = new THREE.Mesh(geometry, borderMaterial);
            bar.position.set(p.x + dx, borderY, p.z + dz);
            bar.renderOrder = 36;
            kaykit3D.dynamicGroup.add(bar);
          });
        }

        if (kind === "place" || kind === "invalid") {
          const tickMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, depthTest: true });
          const s = size / 2, l = .18;
          const pts = [];
          [[-s, -s, 1, 1], [s, -s, -1, 1], [s, s, -1, -1], [-s, s, 1, -1]].forEach(([x, z, dx, dz]) => {
            pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + dx * l, 0, z));
            pts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0, z + dz * l));
          });
          const ticks = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), tickMat);
          ticks.position.set(p.x, y + .016, p.z);
          ticks.renderOrder = 34;
          kaykit3D.dynamicGroup.add(ticks);
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
          kaykit3D.dynamicGroup.add(glow);
          kaykit3D.animatedObjects.push(glow);

          const haloMaterial = new THREE.MeshBasicMaterial({
            color: 0xfff09a,
            transparent: true,
            opacity: .96,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false
          });
          const halo = new THREE.Mesh(kaykitGeometry("selection-ring-v1", () => new THREE.RingGeometry(.32, .40, 40)), haloMaterial);
          halo.rotation.x = -Math.PI / 2;
          halo.position.set(p.x, y + .065, p.z);
          halo.renderOrder = 54;
          halo.userData.pulse = true;
          halo.userData.pulsePhase = (r * 11 + c) * .37;
          halo.userData.fadeIn = { start: performance.now(), duration: 140, target: haloMaterial.opacity };
          haloMaterial.opacity = 0;
          kaykit3D.dynamicGroup.add(halo);
          kaykit3D.animatedObjects.push(halo);

          const selectionLight = new THREE.PointLight(0xffdf5a, .46, 1.9, 2);
          selectionLight.position.set(p.x, y + .62, p.z);
          kaykit3D.dynamicGroup.add(selectionLight);

          // Sceau céleste : anneau bleu doux + petits repères "runiques" en
          // bordure du halo or, tournant très lentement — complète le halo
          // or existant ci-dessus sans le remplacer. Groupe unique pour que
          // l'anneau et les repères tournent ensemble (voir animatedObjects
          // plus bas, propriété slowSpin).
          const runeGroup = new THREE.Group();
          runeGroup.position.set(p.x, y + .058, p.z);
          runeGroup.rotation.x = -Math.PI / 2;
          runeGroup.renderOrder = 53;

          const blueRing = new THREE.Mesh(
            kaykitGeometry("selection-ring-blue-v1", () => new THREE.RingGeometry(.43, .465, 40)),
            new THREE.MeshBasicMaterial({ color: 0x67c8ea, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
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
          const runes = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(runePoints),
            new THREE.LineBasicMaterial({ color: 0x67c8ea, transparent: true, opacity: .85, depthWrite: false, depthTest: false })
          );
          runeGroup.add(runes);

          kaykit3D.dynamicGroup.add(runeGroup);
          runeGroup.userData.slowSpin = true;
          kaykit3D.animatedObjects.push(runeGroup);
        }

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
          resting: smartResting ? [[...(state.reachable || [])], [...(state.smartPushTargets || [])]] : null,
          spawnHover: state.phase === "PLACE_SPAWN" ? [state.pendingSpawnIslandId, state.hoverAnchor] : null
        });
        if (previewKey === kaykit3D.actionPreviewKey) return;
        kaykit3D.actionPreviewKey = previewKey;
        clearKayKitGroup(kaykit3D.actionPreviewGroup);
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
          (state.smartPushTargets || new Set()).forEach(cellKey => {
            if (cellKey === hoverKey) return;
            const [r, c] = cellKey.split(",").map(Number);
            addKayKitPushAffordance(r, c);
          });
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

        if (pushActive) {
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
        0xffffff, 0xf1f6df, 0xe9f2dd, 0xf5eed9, 0xe6f0e5, 0xf2e8d5, 0xe2ecdc
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
        const index = kaykit3D?.islandColorMap?.get(String(island?.id)) ?? 0;
        return ILYOS_ISLAND_TINTS[index % ILYOS_ISLAND_TINTS.length];
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
              color: preview ? previewColor : 0x6fbd49,
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
                const map = material.map || getBlockBitsTexture();
                if (map) {
                  configureKayKitTexture(map);
                  map.magFilter = THREE.NearestFilter;
                  map.minFilter = THREE.NearestMipmapNearestFilter || THREE.NearestFilter;
                  map.anisotropy = Math.min(8, kaykit3D?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
                  map.needsUpdate = true;
                }
                const mat = new THREE.MeshStandardMaterial({
                  map,
                  color: ilyosIslandTint(island),
                  roughness: .84,
                  metalness: 0,
                  transparent: material.transparent,
                  opacity: material.opacity ?? 1,
                  alphaTest: material.alphaTest ?? 0,
                  side: material.side ?? THREE.FrontSide,
                  vertexColors: material.vertexColors || false,
                  toneMapped: false
                });
                mat.name = `${material.name || 'block-bits'}-texture-forcee-v52`;
                mat.needsUpdate = true;
                return mat;
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
          const components = kaykitIslandComponents(cells);
          components.forEach(component => {
            const boundary = kaykitIslandBoundary(component);
            if (boundary.length < 2) return;
            const outline = new THREE.LineLoop(
              new THREE.BufferGeometry().setFromPoints(boundary.map(([x, z]) => new THREE.Vector3(x, KAYKIT_LEVELS.board + .48, z))),
              new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false })
            );
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
              const vertical = dc === 1;
              const seam = new THREE.Mesh(
                new THREE.BoxGeometry(vertical ? .018 : KAYKIT_CELL_SPACING * .68, .010, vertical ? KAYKIT_CELL_SPACING * .68 : .018),
                seamMaterial
              );
              seam.position.set(x, KAYKIT_LEVELS.islandTop + .080, z);
              seam.renderOrder = 86;
              group.add(seam);
            });
          }
        }
      }

      function makeCrownCrossGround() {
        const crossCells = [];
        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (isSanctuary(r, c)) crossCells.push([r, c]);
        const block = makeKayKitIslandBlock({ id: "crown-cross", cells: crossCells }, { preview: false, valid: true });
        block.userData.crownCross = true;
        block.traverse?.(child => {
          if (!child.isMesh || !child.material) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat, index) => {
            if (mat.color) mat.color.setHex(index === 0 ? 0xd7d2a1 : 0x716b58);
            mat.roughness = .9; mat.needsUpdate = true;
          });
        });
        return block;
      }

      function renderKayKitIslandBlocks(group) {
        if (kaykit3D) kaykit3D.islandColorMap = buildIlyosIslandColorMap(state?.islands || []);
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
            const originOutline = new THREE.LineLoop(
              new THREE.BufferGeometry().setFromPoints(boundary.map(([x, z]) => new THREE.Vector3(x, .045, z))),
              new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .30, depthWrite: false })
            );
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
            new THREE.CylinderGeometry(.17, .17, .055, 24),
            new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: true, opacity: .96, depthWrite: false })
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

      function registerProceduralHeroAnimation(wrapper, character, { assetKey = "", hasClips = false } = {}) {
        if (!kaykit3D || !wrapper || !character) return;
        const model = wrapper.children?.[0] || wrapper;
        kaykit3D.proceduralHeroes.push({
          id: String(character.id),
          wrapper,
          model,
          playerId: character.player ?? 0,
          seed: kaykitHash("hero-procedural", character.id, assetKey, character.player ?? 0),
          baseY: model.position.y,
          baseRotX: model.rotation.x,
          baseRotY: model.rotation.y,
          baseRotZ: model.rotation.z,
          baseScale: model.scale.x || 1,
          hasClips
        });
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
          { key: "forestBush", width: .32, height: .32, scale: .92 },
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
        try {
          resizeKayKit3D();
          clearKayKitGroup(kaykit3D.dynamicGroup);
          clearKayKitVisualHover();
          kaykit3D.mixers = [];
          kaykit3D.heroAnimators = [];
          kaykit3D.proceduralHeroes = [];
          kaykit3D.cellVisuals = new Map();
          kaykit3D.interactiveMeshes = [];
          kaykit3D.animatedObjects = kaykit3D.animatedObjects.filter(obj => obj.parent === kaykit3D.staticGroup);
          const nextCharacterHistory = new Map();

          const dynamic = kaykit3D.dynamicGroup;

          (kaykit3D.hitMeshes || []).forEach(hit => {
            const r = hit.userData.r;
            const c = hit.userData.c;

            if (!Number.isFinite(r) || !Number.isFinite(c)) return;

            hit.position.y = kaykitCellSurfaceY(r, c) + .03;
          });

          // Sol central en croix sous les couronnes.
          // Sol central en croix sous les couronnes.
          dynamic.add(makeCrownCrossGround());
          // Les îles sont fusionnées visuellement : un seul bloc par île, sans quadrillage interne.
          renderKayKitIslandBlocks(dynamic);
          renderKayKitIslandSeams(dynamic);

          const artifactByCarrier = new Map();
          [state.artifact, state.secondArtifact].filter(Boolean).forEach(artifact => {
            if (artifact.active && artifact.carrierId) artifactByCarrier.set(artifact.carrierId, artifact);
          });

          for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
              const land = isLand(r, c);
              const village = villageAt(r, c);
              const sanctuary = isSanctuary(r, c);
              const island = islandAt(r, c);
              const classes = cellClassSet(r, c);
              const p = kaykitCellPosition(r, c, 0);

              if (land && !island && !sanctuary) {
                const owner = village?.id ?? null;
                const ownerColor = Number.isInteger(owner) ? new THREE.Color(state.players[owner]?.color || PLAYER_COLORS[owner]).getHex() : null;
                const pedestal = makeKayKitPedestal(ownerColor, { sanctuary: false });
                pedestal.position.set(p.x, 0, p.z);
                dynamic.add(pedestal);
                registerKayKitCellVisual(r, c, pedestal);
              }

              if (village) {
                const playerId = village.id ?? state.players.indexOf(village);
                const assetKey = `castle${Math.max(0, Math.min(3, playerId))}`;
                const villageAccent = new THREE.Color(state.players[playerId]?.color || PLAYER_COLORS[playerId]).getHex();
                let castle = cloneKayKitAsset(assetKey, { maxWidth: .78, maxHeight: 1.18, targetFloor: 0 });
                if (!castle) castle = makeFallbackCastle(villageAccent);
                castle.position.set(p.x, KAYKIT_LEVELS.pedestalTop, p.z);
                castle.rotation.y = [Math.PI * .75, -Math.PI * .75, -Math.PI * .25, Math.PI * .25][playerId] || 0;
                dynamic.add(castle);
                registerKayKitCellVisual(r, c, castle);
                // Fanion planté à côté du château, dans le même repère local :
                // il suit automatiquement la position/rotation par coin du village.
                const flag = cloneKayKitAsset(`flag${Math.max(0, Math.min(3, playerId))}`, { maxWidth: .30, maxHeight: .62, targetFloor: 0 });
                if (flag) {
                  flag.position.set(.48, 0, .34);
                  castle.add(flag);
                }
              }

              addCellHighlight(r, c, classes);
            }
          }

          // Variation visuelle discrète issue du Forest Nature Pack.
          renderKayKitForestNatureOnIslands(dynamic);

          // Héros / gardiens.
          state.characters.forEach((character, index) => {
            const playerId = character.player ?? 0;
            const p = kaykitCellPosition(character.r, character.c, kaykitCellSurfaceY(character.r, character.c));
            const teamHeroPools = state.players.length === 2
              ? {
                0: ["hero0"],
                1: ["hero1"]
              }
              : {
                0: ["hero0", "hero3"],
                1: ["hero1", "hero2Hooded"],
                2: ["hero2", "hero0"],
                3: ["hero3", "hero1"]
              };
            const teamPool = teamHeroPools[playerId] || teamHeroPools[0];
            const teamIndex = state.characters.filter((item, itemIndex) => itemIndex < index && (item.player ?? 0) === playerId).length;
            const assetKey = teamPool[teamIndex % teamPool.length];
            const assetClips = kaykit3D?.assetAnimations.get(assetKey) || [];
            const safeNeutral = chooseKayKitAnimationClip(assetClips, "neutral", kaykitHash(character.id, index));
            let hero = cloneKayKitAsset(assetKey, { maxWidth: .63, maxHeight: 1.02, targetFloor: 0 });
            if (!hero) hero = makeFallbackHero(playerId);
            if (playerId === 0 && assetKey === "hero0") styleKnightMetalArmor(hero);
            if (playerId === 1 && assetKey === "hero1") styleMagePalette(hero);
            const teamColor = new THREE.Color(state.players[playerId]?.color || PLAYER_COLORS[playerId] || "#ffffff");
            // Le gardien sélectionné (SMART_CHAR) n'a plus de sceau au sol classique
            // (voir addCellHighlight) mais garde un ancrage au sol malgré tout — un
            // premier essai posait un sprite flou au niveau du buste avec la texture
            // "nuage" (amas irréguliers, pensée pour un ciel, pas pour une source de
            // lumière) : contour bosselé, lisait comme une tache plutôt qu'un halo.
            // Remplacé par un vrai halo de faisceau (voir plus bas, kaykitGlowTexture) :
            // disque net au sol + anneau qui tourne lentement + colonne de lumière.
            const isSelectedGuardian = character.id === state.selectedCharId;
            // Or saturé (0xe8a317) comme base DOMINANTE, teinte d'équipe en appoint
            // (15% seulement) — l'inverse des deux essais précédents, qui partaient
            // d'une couleur d'équipe pâle et la teintaient légèrement de blanc/crème :
            // un ton clair reste toujours proche du blanc, quel que soit le mélange,
            // surtout sur un ciel déjà pâle (peu de contraste de VALEUR, pas de teinte).
            // Un or franc et assez sombre garde du contraste sur n'importe quel fond.
            // Cause racine des essais précédents qui "ne changeaient pas de couleur" :
            // le renderer applique un tone mapping ACES global, qui délave toute
            // couleur saturée passée par un matériau standard — d'où `toneMapped:
            // false` sur chaque matériau du halo plus bas (déjà le procédé utilisé
            // pour le ciel, voir kaykitSkyDomeTexture).
            const glowColor = isSelectedGuardian ? new THREE.Color(0xffab1f).lerp(teamColor, .15) : teamColor;
            const glowIntensity = isSelectedGuardian ? .22 : .075;
            const selectionGlowMaterials = [];
            hero.traverse?.(child => {
              if (!child.isMesh || !child.material) return;
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              const cloned = materials.map(material => {
                const mat = material.clone();
                mat.userData = { ...(mat.userData || {}), ilyosTransient: true };
                if ("emissive" in mat) {
                  mat.emissive = glowColor.clone();
                  mat.emissiveIntensity = glowIntensity;
                  if (isSelectedGuardian) selectionGlowMaterials.push(mat);
                }
                mat.needsUpdate = true;
                return mat;
              });
              child.material = Array.isArray(child.material) ? cloned : cloned[0];
            });
            hero.position.set(p.x, p.y, p.z);
            const facing = kaykit3D.characterFacing.get(String(character.id));
            const defaultFacing = kaykitFacingRotation(character.r, character.c, CENTER.r, CENTER.c);
            hero.rotation.y = Number.isFinite(facing) ? facing : defaultFacing;
            dynamic.add(hero);
            registerKayKitCellVisual(character.r, character.c, hero);
            registerKayKitInteractive(hero, "character", character.r, character.c);
            if (isSelectedGuardian && selectionGlowMaterials.length) {
              // Halo en trois pièces, plus aucune n'étant un disque plat au sol — un
              // disque (même en deux couches, même resserré à .40) reste un cercle vu
              // du dessus : ça se lit comme un autocollant, pas comme une lumière.
              // 1. Anneau fin, net, en fondu NORMAL (pas additif) : sa vraie couleur
              //    s'affiche telle quelle, sans être éclaircie par la fusion avec le
              //    fond — c'est ce qui manquait pour que la couleur se voie enfin.
              // 2. Colonne verticale en cylindre effilé (pas deux plans croisés, qui
              //    présentaient un bord plat tranchant selon l'angle de caméra) :
              //    contour rond depuis n'importe quel angle.
              // 3. Petites particules qui montent et s'estompent, à hauteurs et
              //    phases différentes — c'est ce qui donne un vrai volume 3D (elles
              //    existent à des profondeurs différentes dans l'espace) plutôt qu'un
              //    aplat qui ne fonctionne que vu de face.
              const glowMap = kaykitGlowTexture();
              const haloGroup = new THREE.Group();
              haloGroup.position.set(p.x, p.y, p.z);
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
              ring.userData.slowSpin = true;
              haloGroup.add(ring);
              kaykit3D.animatedObjects.push(ring);

              // Colonne unique en cylindre effilé (et non deux plans croisés) : un
              // cylindre présente toujours un contour arrondi, jamais une carte plate
              // qui semble trancher le personnage selon l'angle de caméra. `FrontSide`
              // uniquement pour ne pas doubler l'opacité avec les faces arrière vues
              // par transparence.
              const beamHeight = 1.1;
              const beamMaterial = new THREE.MeshBasicMaterial({
                map: kaykitBeamGradientTexture(), color: glowColor.clone(), transparent: true, opacity: .55,
                blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, toneMapped: false
              });
              const beam = new THREE.Mesh(
                kaykitGeometry("selection-halo-beam-v2", () => new THREE.CylinderGeometry(.05, .22, beamHeight, 16, 1, true)),
                beamMaterial
              );
              beam.position.y = beamHeight / 2;
              haloGroup.add(beam);

              // Un matériau CLONÉ par particule : chacune doit pouvoir moduler son
              // opacité indépendamment (phase de montée décalée) sans faire varier
              // les 5 autres, ce qu'un matériau partagé unique empêcherait.
              const particleMaterial = new THREE.SpriteMaterial({
                map: glowMap, color: glowColor.clone(), transparent: true, opacity: .85,
                blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
              });
              const particleCount = 6;
              const particles = [];
              for (let i = 0; i < particleCount; i++) {
                const particle = new THREE.Sprite(particleMaterial.clone());
                const angle = (i / particleCount) * Math.PI * 2;
                const radius = .16 + (i % 2) * .08;
                particle.userData.baseAngle = angle;
                particle.userData.radius = radius;
                particle.userData.phase = i * .9;
                particle.scale.setScalar(.09);
                haloGroup.add(particle);
                particles.push(particle);
              }

              dynamic.add(haloGroup);
              // Reconstruit à chaque sync (comme le reste de dynamicGroup) : on repousse
              // donc systématiquement une nouvelle entrée plutôt que de réutiliser un
              // objet d'un cycle précédent (voir animateKayKit3D, userData.selectionGlow).
              hero.userData.selectionGlow = true;
              hero.userData.selectionGlowMaterials = selectionGlowMaterials;
              hero.userData.selectionGlowBase = glowIntensity;
              hero.userData.selectionHalo = { ring, beamMaterial, particles, particleMaterial };
              kaykit3D.animatedObjects.push(hero);
            }
            const pending = kaykit3D.pendingActionAnimations.get(String(character.id));
            const animationIntent =
              pending && pending.expires > performance.now() ? pending.intent : "neutral";
            const isTransientAction = !!(
              pending &&
              pending.expires > performance.now() &&
              !["move", "neutral"].includes(pending.intent)
            );

            const shouldStartTransientAction =
              isTransientAction && !pending.played;

            const shouldSkipTransientReplay =
              isTransientAction && pending.played;

            if (shouldStartTransientAction) {
              addAssetAnimation(
                hero,
                assetKey,
                animationIntent,
                kaykitHash(character.id, index)
              );
              pending.played = true;
            } else if (safeNeutral && !shouldSkipTransientReplay) {
              addAssetAnimation(
                hero,
                assetKey,
                animationIntent,
                kaykitHash(character.id, index)
              );
            }
            if (pending?.intent === "move" && Array.isArray(pending.path) && pending.path.length) {
              const route = [[character.r, character.c], ...pending.path];
              kaykit3D.activeMovementTweens.set(String(character.id), {
                object: hero,
                route,
                startedAt: pending.startedAt || performance.now(),
                duration: pending.duration || Math.max(520, pending.path.length * 245)
              });
            }
            registerProceduralHeroAnimation(hero, character, { assetKey, hasClips: assetClips.length > 0 });
            nextCharacterHistory.set(character.id, { r: character.r, c: character.c });

            if (artifactByCarrier.has(character.id)) {
              const crown = makeCrown();
              crown.scale.setScalar(.68);
              crown.position.set(0, .82, 0);
              hero.add(crown);
              registerKayKitInteractive(crown, "crown-carried", character.r, character.c);
            }
          });
          kaykit3D.characterHistory = nextCharacterHistory;

          // Couronnes posées sur le plateau.
          renderKayKitPlacementPreview();
          renderKayKitMagicRotationPreview();

          [state.artifact, state.secondArtifact].filter(Boolean).forEach(artifact => {
            if (!artifact.active || artifact.carrierId || !Number.isFinite(artifact.r) || !Number.isFinite(artifact.c)) return;
            const p = kaykitCellPosition(artifact.r, artifact.c, 0);
            const surfaceY = kaykitCellSurfaceY(artifact.r, artifact.c);
            const crown = makeCrown();
            crown.scale.setScalar(.96);
            crown.position.set(p.x, surfaceY + .012, p.z);
            dynamic.add(crown);
            registerKayKitCellVisual(artifact.r, artifact.c, crown);
            registerKayKitInteractive(crown, "crown-loose", artifact.r, artifact.c);
            const light = new THREE.PointLight(0xffcf52, .44, 1.8);
            light.position.set(p.x, surfaceY + .34, p.z); dynamic.add(light);
          });

          kaykit3D.lastStateSignature = `${state.turn}|${state.phase}|${state.islands.length}|${state.characters.length}|${state.currentPlayer}`;
          refreshKayKitHoverAfterSceneSync();
        } finally {
          kaykit3D.syncInProgress = false;
          if (kaykit3D.syncPending) {
            kaykit3D.syncPending = false;
            scheduleKayKitSync();
          }
        }
      }

      let kaykitLastVisualFrame = 0;
      let kaykitAdaptiveFrameInterval = 16.7;
      function animateKayKit3D(frameTime = performance.now()) {
        if (!kaykit3D || kaykit3D.disposed) return;
        requestAnimationFrame(animateKayKit3D);
        if (document.hidden) {
          kaykit3D.clock.getDelta();
          return;
        }
        const activeVisualMotion = !!(kaykit3D.activeMovementTweens?.size || kaykit3D.pendingActionAnimations?.size || kaykit3D.cameraTween || kaykit3D.userInteracting);
        const lowPower = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 4;
        kaykitAdaptiveFrameInterval = 16.7;
        if (frameTime - kaykitLastVisualFrame < kaykitAdaptiveFrameInterval) return;
        kaykitLastVisualFrame = frameTime;
        const delta = Math.min(.05, kaykit3D.clock.getDelta());
        const elapsed = kaykit3D.clock.elapsedTime;
        if (kaykit3D.hoverMarker?.visible) {
          const pulse = 1 + Math.sin(elapsed * 7) * .035;
          kaykit3D.hoverMarker.scale.setScalar(pulse);
        }
        kaykit3D.mixers.forEach(mixer => mixer.update(delta));
        (kaykit3D.proceduralHeroes || []).forEach(record => {
          const model = record?.model;
          if (!model || !record.wrapper?.parent) return;
          const pending = kaykit3D.pendingActionAnimations.get(record.id);
          const activePending = pending && pending.expires > performance.now() ? pending : null;
          const moving = !!kaykit3D.activeMovementTweens?.has(record.id) || activePending?.intent === "move";
          const intent = moving ? "move" : (activePending?.intent || "neutral");
          const pulseTime = elapsed * 3.2 + record.seed * 12;
          const fastTime = elapsed * 10.8 + record.seed * 16;
          const hover = record.hasClips ? Math.sin(pulseTime) * .010 : Math.sin(pulseTime) * .018;
          let yOffset = hover;
          let rotX = record.baseRotX;
          let rotY = record.baseRotY;
          let rotZ = record.baseRotZ;
          let scale = record.baseScale;

          if (moving) {
            yOffset += Math.max(0, Math.sin(fastTime)) * 0.032;
            if (!record.hasClips) {
              rotX += Math.abs(Math.sin(fastTime)) * 0.09;
              rotZ += Math.sin(fastTime * .86) * 0.075;
              rotY += Math.sin(fastTime * .42) * 0.045;
            }
            scale *= 1 + Math.sin(fastTime * 1.45) * .012;
          } else if (intent === "magic") {
            yOffset += Math.sin(fastTime * .6) * .026;
            rotZ += Math.sin(fastTime * .45) * .05;
            if (!record.hasClips) rotX += Math.sin(fastTime * .36) * .03;
            scale *= 1 + Math.max(0, Math.sin(fastTime * .72)) * 0.042;
          } else if (intent === "attack" || intent === "push") {
            yOffset += Math.max(0, Math.sin(fastTime * .95)) * 0.022;
            if (!record.hasClips) {
              rotX += Math.sin(fastTime * .7) * .06;
              rotZ += Math.sin(fastTime * .4) * .04;
            }
            scale *= 1 + Math.sin(fastTime * .9) * .018;
          } else {
            if (!record.hasClips) {
              rotX += Math.sin(pulseTime * .38) * .016;
              rotZ += Math.sin(pulseTime * .52) * .022;
            }
            scale *= 1 + Math.sin(pulseTime * .44) * .010;
          }

          model.position.y = record.baseY + yOffset;
          model.rotation.x = rotX;
          model.rotation.y = rotY;
          model.rotation.z = rotZ;
          model.scale.setScalar(scale);
        });
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
          // Respiration très douce de la brillance du gardien sélectionné (voir la
          // boucle de rendu des héros) : ±0.14 autour de la base, jamais assez marqué
          // pour distraire pendant une décision tactique.
          if (object.userData.selectionGlow && object.userData.selectionGlowMaterials) {
            const base = object.userData.selectionGlowBase;
            const breathe = Math.sin(elapsed * 2.1);
            const value = base + breathe * .14;
            object.userData.selectionGlowMaterials.forEach(mat => { mat.emissiveIntensity = value; });
            // Le halo respire en phase avec l'émissif du modèle (même onde) : les deux
            // se lisent comme une seule source de lumière qui pulse doucement, plutôt
            // que deux effets désynchronisés. Les particules montent en boucle et
            // tournent lentement autour du gardien — c'est leur MOUVEMENT dans les
            // trois dimensions (hauteur qui varie, rotation autour du buste) qui donne
            // du volume, pas seulement leur forme.
            const halo = object.userData.selectionHalo;
            if (halo?.ring?.parent) {
              halo.beamMaterial.opacity = .30 + breathe * .05;
              halo.particles.forEach(particle => {
                const cycle = ((elapsed * .35 + particle.userData.phase) % 2 + 2) % 2;
                const height = cycle * .55;
                const fade = cycle < 1 ? cycle : 2 - cycle;
                const angle = particle.userData.baseAngle + elapsed * .5;
                particle.position.set(
                  Math.cos(angle) * particle.userData.radius,
                  .06 + height,
                  Math.sin(angle) * particle.userData.radius
                );
                particle.material.opacity = fade * .85;
              });
            }
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
        if (kaykit3D.activeMovementTweens?.size) {
          const now = performance.now();
          kaykit3D.activeMovementTweens.forEach((tween, id) => {
            const object = tween.object;
            if (!object?.parent || !Array.isArray(tween.route) || tween.route.length < 2) {
              kaykit3D.activeMovementTweens.delete(id);
              return;
            }
            const progress = THREE.MathUtils.clamp((now - tween.startedAt) / Math.max(1, tween.duration), 0, 1);
            const segmentCount = tween.route.length - 1;
            const scaled = progress * segmentCount;
            const segment = Math.min(segmentCount - 1, Math.floor(scaled));
            const t = THREE.MathUtils.clamp(scaled - segment, 0, 1);
            const local = t * t * (3 - 2 * t);
            const [r0, c0] = tween.route[segment];
            const [r1, c1] = tween.route[segment + 1];
            const a = kaykitCellPosition(r0, c0, kaykitCellSurfaceY(r0, c0));
            const b = kaykitCellPosition(r1, c1, kaykitCellSurfaceY(r1, c1));
            object.position.set(
              THREE.MathUtils.lerp(a.x, b.x, local),
              THREE.MathUtils.lerp(a.y, b.y, local) + Math.sin(local * Math.PI) * .05,
              THREE.MathUtils.lerp(a.z, b.z, local)
            );
            if (r0 !== r1 || c0 !== c1) {
              const facing = kaykitFacingRotation(r0, c0, r1, c1);
              object.rotation.y = facing;
              kaykit3D.characterFacing.set(String(id), facing);
            }
            if (progress >= 1) kaykit3D.activeMovementTweens.delete(id);
          });
        }
        if (kaykit3D.orbit) kaykit3D.orbit.update();
        if (document.body.dataset.visualMode === "alternative" && !els.gameScreen.classList.contains("hidden")) {
          kaykit3D.renderer.render(kaykit3D.scene, kaykit3D.camera);
        }
      }
