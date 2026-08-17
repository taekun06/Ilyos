    (() => {
      'use strict';
      const VERSION = 'V76';

      /*
       * Correctif visuel îles — six variantes réellement lisibles, uniquement
       * sur l'herbe. Aucun plan/carré coloré n'est ajouté et la terre conserve
       * sa texture/couleur KayKit d'origine.
       *
       * game.js crée déjà un matériau partagé par variante et lui applique un
       * léger lerp global (.32). On annule exactement ce lerp, puis on applique
       * la couleur dans le shader seulement aux pixels où le vert domine.
       */
      const ISLAND_GRASS_TINTS = [
        0x9aae58,
        0x668348,
        0xadc47d,
        0x4f7653,
        0x65967a,
        0x83a84f
      ];
      const LEGACY_GLOBAL_TINT = 0.32;

      function islandVariantFrom(material, cacheKey = '') {
        const fromName = String(material?.name || '').match(/island-tint-(\d+)/i);
        if (fromName) return Number(fromName[1]) % ISLAND_GRASS_TINTS.length;
        const fromKey = String(cacheKey).match(/(?:^|\|)(\d+)$/);
        if (fromKey) return Number(fromKey[1]) % ISLAND_GRASS_TINTS.length;
        return null;
      }

      function restoreUntintedBaseColor(material, tint) {
        if (!material?.color || material.userData?.ilyosGrassBaseRestored) return;
        const keep = 1 - LEGACY_GLOBAL_TINT;
        const clamp = value => Math.max(0, Math.min(1, value));
        material.color.r = clamp((material.color.r - tint.r * LEGACY_GLOBAL_TINT) / keep);
        material.color.g = clamp((material.color.g - tint.g * LEGACY_GLOBAL_TINT) / keep);
        material.color.b = clamp((material.color.b - tint.b * LEGACY_GLOBAL_TINT) / keep);
        material.userData = material.userData || {};
        material.userData.ilyosGrassBaseRestored = true;
      }

      function patchIslandGrassMaterial(material, variantIndex) {
        if (!material || !window.THREE || !Number.isInteger(variantIndex)) return material;
        material.userData = material.userData || {};
        if (material.userData.ilyosGrassOnlyTintV2) return material;

        const tint = new THREE.Color(ISLAND_GRASS_TINTS[variantIndex]);
        restoreUntintedBaseColor(material, tint);

        const previousOnBeforeCompile = material.onBeforeCompile;
        const previousProgramCacheKey = material.customProgramCacheKey;

        material.onBeforeCompile = function (shader, renderer) {
          if (typeof previousOnBeforeCompile === 'function') {
            previousOnBeforeCompile.call(this, shader, renderer);
          }

          shader.uniforms.ilyosIslandGrassTint = { value: tint.clone() };
          const mapChunk = '#include <map_fragment>';
          if (!shader.fragmentShader.includes(mapChunk)) return;

          shader.fragmentShader = shader.fragmentShader.replace(
            mapChunk,
            `${mapChunk}
            // Masque uniquement les pixels réellement verts de la texture.
            // La terre/brun reste donc strictement issue de la texture KayKit.
            float ilyosGreenDominance = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
            float ilyosChroma = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))
                              - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
            float ilyosGrassMask = smoothstep(0.025, 0.135, ilyosGreenDominance)
                                 * smoothstep(0.035, 0.12, ilyosChroma);

            // Conserve les ombres et les variations de luminosité de l'herbe
            // d'origine tout en rendant les six variantes franchement lisibles.
            float ilyosSourceLight = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            float ilyosTintLight = max(0.001, dot(ilyosIslandGrassTint, vec3(0.299, 0.587, 0.114)));
            vec3 ilyosGrassColor = clamp(ilyosIslandGrassTint * (ilyosSourceLight / ilyosTintLight), 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, ilyosGrassColor, ilyosGrassMask * 0.84);`
          );
          shader.fragmentShader = `uniform vec3 ilyosIslandGrassTint;\n${shader.fragmentShader}`;
        };

        material.customProgramCacheKey = function () {
          const baseKey = typeof previousProgramCacheKey === 'function'
            ? previousProgramCacheKey.call(this)
            : '';
          return `${baseKey}|ilyos-grass-only-v2-${variantIndex}`;
        };

        material.userData.ilyosGrassOnlyTintV2 = true;
        material.userData.ilyosGrassVariant = variantIndex;
        material.needsUpdate = true;
        return material;
      }

      function installIslandGrassColorFix() {
        const k = window.kaykit3D;
        const cache = k?.islandTintMaterials;
        if (!k || !(cache instanceof Map) || !window.THREE) return false;

        // Corrige les matériaux déjà créés.
        cache.forEach((material, cacheKey) => {
          const variant = islandVariantFrom(material, cacheKey);
          if (variant !== null) patchIslandGrassMaterial(material, variant);
        });

        // Corrige automatiquement les futurs matériaux mis en cache, sans
        // ajouter de boucle de rendu ni de draw call.
        if (!cache.__ilyosGrassOnlySetWrapped) {
          const nativeSet = cache.set;
          cache.set = function (cacheKey, material) {
            const variant = islandVariantFrom(material, cacheKey);
            if (variant !== null) patchIslandGrassMaterial(material, variant);
            return nativeSet.call(this, cacheKey, material);
          };
          Object.defineProperty(cache, '__ilyosGrassOnlySetWrapped', {
            value: true,
            configurable: true
          });
        }

        // Sécurité pour les blocs déjà présents dans la scène avant le patch.
        k.root?.traverse?.(object => {
          if (!object?.isMesh || !object.material) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
            const variant = islandVariantFrom(material);
            if (variant !== null) patchIslandGrassMaterial(material, variant);
          });
        });

        return true;
      }

      function scheduleIslandGrassColorFix() {
        [0, 80, 260, 800, 1800].forEach(delay => {
          window.setTimeout(installIslandGrassColorFix, delay);
        });
      }

      function apply() {
        window.ILYOS_BUILD = VERSION; document.title = 'ILYOS V76 — Animations';
        const badge = document.getElementById('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V76';
        if (window.kaykit3D) {
          const k = window.kaykit3D;
          k.minZoom = 6.4; k.maxZoom = 25;
          if (k.autoFit && typeof window.kaykitFitDistance === 'function' && typeof window.animateKayKitCameraTo === 'function') {
            const d = window.kaykitFitDistance(k.camera?.aspect || 1, k.viewMode || 'isometric');
            k.zoomDistance = d; window.animateKayKitCameraTo(k.viewMode || 'isometric', d, 320);
          }
        }
        installIslandGrassColorFix();
      }
      function compactPanels() {
        document.querySelectorAll('.left-panel,.right-panel').forEach(p => { p.style.removeProperty('height'); });
      }
      // V78 (passe fluidité) : plus de setTimeout(apply,500)/(apply,1600) —
      // un fit initial unique (apply() ci-dessous, synchrone au boot) suffit ;
      // un second/troisième auto-fit ne doit plus pouvoir démarrer une fois
      // le joueur déjà dans la partie. Le vrai refit caméra sur changement de
      // taille réel est déjà porté par kaykit3D.resizeObserver (ResizeObserver
      // sur .board-wrap, voir resizeKayKit3D()/js/game/kaykit3d.js), qui ne
      // refit QUE si l'aspect a réellement changé — jamais sur un simple
      // changement de qualité/DPR (voir applyQuality(), js/complete-polish.js).
      function boot() {
        apply();
        compactPanels();
        scheduleIslandGrassColorFix();

        const gameScreen = document.getElementById('gameScreen');
        if (gameScreen && 'MutationObserver' in window) {
          const observer = new MutationObserver(scheduleIslandGrassColorFix);
          observer.observe(gameScreen, { attributes: true, attributeFilter: ['class'] });
        }

        let resizeFrame = 0;
        window.addEventListener('resize', () => {
          if (resizeFrame) return;
          resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; apply(); });
        }, { passive: true });
        window.addEventListener('pageshow', scheduleIslandGrassColorFix, { passive: true });

        window.ILYOS_V70 = {
          version: VERSION,
          refit: apply,
          fixIslandGrassColors: installIslandGrassColorFix
        };
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
