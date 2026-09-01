    (() => {
      'use strict';
      const VERSION = 'V76';
      let quality = 'high', ema = 60, qualityPill, flash, lastQualityChange = 0, lowSamples = 0, midSamples = 0, highSamples = 0;
      const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      function ensureUI() {
        if (!qualityPill) { qualityPill = document.createElement('div'); qualityPill.className = 'v69-quality-pill'; qualityPill.setAttribute('aria-hidden', 'true'); document.body.appendChild(qualityPill) }
        if (!flash) { flash = document.createElement('div'); flash.className = 'v69-action-flash'; document.body.appendChild(flash) }
      }
      function renderer() { return window.kaykit3D?.renderer || null }
      const QUALITY_DPR = { high: 1.5, balanced: 1.2, performance: .95 };
      const QUALITY_SHADOW = { high: 1024, balanced: 768, performance: 512 };
      /* BUDGET DE PIXELS — plafonner la SURFACE rendue, pas seulement le ratio.
         QUALITY_DPR ne bornait que la densité : la surface, elle, suivait la
         fenêtre sans limite. Un même réglage "performance" (ratio .95) demandait
         donc 1,1 Mpx dans une petite fenêtre et 3,3 Mpx en plein écran sur un
         2560 — le mode censé sauver les machines lentes ne bornait rien du tout
         là où elles souffrent le plus. Le jeu est limité par le remplissage
         (bloom rendu en MSAA 4x puis seuillé, flouté deux fois et composé,
         ombres douces échantillonnées par pixel), donc le coût suit la surface,
         pas la densité.

         Ces budgets sont choisis pour ne RIEN changer sur une machine à l'aise :
         en qualité élevée, 6 Mpx ne se déclenche pas avant l'équivalent d'un
         plein écran 2560x1440, et une fenêtre 1920x1080 (à densité 1 comme à
         1,5) reste exactement au ratio d'avant. Le budget ne mord que là où la
         machine peinait déjà — et sur les paliers dégradés, qu'un contrôleur de
         FPS n'atteint que si les images sont réellement trop lentes.

         Le HUD n'est pas concerné : il est en DOM/CSS, pas dans le canvas. Seul
         le plateau 3D est rééchantillonné, le texte et les icônes restent nets
         quel que soit le ratio. */
      const QUALITY_BUDGET_MPX = { high: 6, balanced: 2.8, performance: 1.5 };
      // Plancher : en dessous, le rééchantillonnage se voit franchement. Mieux
      // vaut rendre les armes sur la fluidité que livrer une bouillie.
      const PIXEL_RATIO_PLANCHER = .6;

      /* Mesure prise sur le CONTENEUR du canvas, pas sur le canvas lui-même :
         resizeKayKit3D() fixe la taille CSS du canvas dans un requestAnimationFrame,
         donc juste après un redimensionnement de fenêtre le canvas porte encore
         ses anciennes dimensions. Calculer le budget dessus donnait le ratio de
         la TAILLE PRÉCÉDENTE — le correctif ne servait à rien précisément au
         moment où on en avait besoin. Le conteneur, lui, a déjà reflué : c'est
         d'ailleurs sa mesure que resizeKayKit3D recopie ensuite sur le canvas. */
      function surfaceCanvasCss() {
        const canvas = window.kaykit3D?.renderer?.domElement;
        const rect = (canvas?.parentElement || canvas)?.getBoundingClientRect?.();
        const l = rect?.width || canvas?.clientWidth || window.innerWidth || 1;
        const h = rect?.height || canvas?.clientHeight || window.innerHeight || 1;
        return Math.max(1, l * h);
      }

      /* Ratio retenu = le plus contraignant des trois : la densité réelle de
         l'écran (jamais dépassée, inutile de rendre plus fin que l'affichage),
         le plafond du palier, et le budget de surface. */
      function pixelRatioPour(niveau) {
        const dpr = window.devicePixelRatio || 1;
        const plafondPalier = QUALITY_DPR[niveau] || QUALITY_DPR.balanced;
        const budget = (QUALITY_BUDGET_MPX[niveau] || QUALITY_BUDGET_MPX.balanced) * 1e6;
        const plafondBudget = Math.sqrt(budget / surfaceCanvasCss());
        return Math.max(PIXEL_RATIO_PLANCHER, Math.min(dpr, plafondPalier, plafondBudget));
      }

      function applyQuality(next, reason = 'auto') {
        if (next === quality && !reason.includes('init') && !reason.includes('resize')) return; quality = next; ensureUI();
        const r = renderer();
        if (r) r.setPixelRatio(pixelRatioPour(next));
        const shadow = window.kaykit3D?.scene?.getObjectByProperty?.('isDirectionalLight', true)?.shadow?.mapSize;
        if (shadow) { const size = QUALITY_SHADOW[next] || QUALITY_SHADOW.balanced; shadow.set(size, size) }
        document.documentElement.classList.toggle('v69-fps-low', next === 'performance');
        if (window.kaykit3D) window.kaykit3D.qualityMode = next;
        qualityPill.textContent = `Qualité ${next === 'high' ? 'élevée' : next === 'balanced' ? 'équilibrée' : 'performance'} · ${Math.round(ema)} i/s`;
        window.kaykit3D?.resize?.({ refitCamera: false });
      }

      function sceneBusyForQualitySwitch() {
        const k = window.kaykit3D;
        if (!k) return false;
        // Changer DPR + taille de shadow map peut provoquer une réallocation GPU.
        // Pendant un travelling AUTO ou une action animée, même une seule frame
        // coûteuse se lit comme une saccade caméra. On attend donc simplement
        // que la scène soit calme ; la mesure continue normalement.
        return !!k.cameraTween
          || !!k.userInteracting
          || (Array.isArray(k.visualSequences) && k.visualSequences.length > 0)
          || (Array.isArray(k.fxTweens) && k.fxTweens.length > 0)
          || (Array.isArray(k.crownFlights) && k.crownFlights.length > 0)
          || (Array.isArray(k.islandDrops) && k.islandDrops.length > 0);
      }

      function measureQuality() {
        if (document.hidden) return;
        const now = performance.now();
        const measured = window.ILYOS_PERF?.enabled ? window.ILYOS_PERF.report().fps : 0;
        if (measured > 0) ema = ema * .5 + measured * .5;
        lowSamples = ema < 38 ? lowSamples + 1 : 0;
        midSamples = ema >= 38 && ema < 51 ? midSamples + 1 : 0;
        highSamples = ema > 57 ? highSamples + 1 : 0;
        if (now - lastQualityChange > 6000) {
          let next = null;
          if (lowSamples >= 2) next = 'performance';
          else if (midSamples >= 3 && quality === 'high') next = 'balanced';
          else if (highSamples >= 5 && quality !== 'high') next = 'high';
          if (next && next !== quality && !sceneBusyForQualitySwitch()) {
            applyQuality(next);
            lastQualityChange = now;
            lowSamples = midSamples = highSamples = 0;
          }
        }
        if (qualityPill) qualityPill.textContent = `Qualité ${quality === 'high' ? 'élevée' : quality === 'balanced' ? 'équilibrée' : 'performance'} · ${Math.round(ema)} i/s`;
      }
      function actionFlash(type) {
        if (reduced()) return; ensureUI(); flash.style.background = type === 'push' ? 'radial-gradient(circle at 50% 55%,rgba(255,154,85,.28),transparent 40%)' : type === 'magic' ? 'radial-gradient(circle at 50% 55%,rgba(169,126,255,.28),transparent 40%)' : 'radial-gradient(circle at 50% 55%,rgba(255,255,255,.3),transparent 38%)';
        flash.__ilyosAnim?.cancel();
        flash.__ilyosAnim = flash.animate(
          [{ opacity: 0 }, { opacity: .8, offset: .25 }, { opacity: 0 }],
          { duration: 480, easing: 'ease-out', fill: 'none' }
        );
      }
      function hookSound() {
        if (typeof window.playSfx !== 'function' || window.playSfx.__v69) return; const original = window.playSfx;
        window.playSfx = function (type) { const out = original.apply(this, arguments); if (['move', 'push', 'magic', 'island', 'crown'].includes(type)) actionFlash(type); return out }; window.playSfx.__v69 = true
      }
      function improveButtons(roots) {
        const targets = roots && roots.length ? roots : [document];
        targets.forEach(root => {
          if (root.nodeType !== 1 && root.nodeType !== 9) return;
          const labelTargets = root.nodeType === 1 && root.matches?.('button:not([aria-label])') ? [root] : [];
          if (root.querySelectorAll) labelTargets.push(...root.querySelectorAll('button:not([aria-label])'));
          labelTargets.forEach(b => { const t = b.textContent.trim().replace(/\s+/g, ' '); if (t) b.setAttribute('aria-label', t) });

          const tabTargets = root.nodeType === 1 && root.matches?.('button,.action-card,.island-option') ? [root] : [];
          if (root.querySelectorAll) tabTargets.push(...root.querySelectorAll('button,.action-card,.island-option'));
          tabTargets.forEach(el => { if (!el.hasAttribute('tabindex') && !['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName)) el.tabIndex = 0 });
        });
      }
      function cleanupHiddenAnimations() {
        document.addEventListener('visibilitychange', () => { document.documentElement.classList.toggle('v69-page-hidden', document.hidden); if (!document.hidden) requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) });
      }
      function boot() {
        window.ILYOS_BUILD = VERSION; document.title = 'ILYOS V76 — Animations';
        const badge = document.getElementById('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V76';
        ensureUI(); hookSound(); improveButtons(); cleanupHiddenAnimations();
        const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4; applyQuality(cores >= 8 && mem >= 8 ? 'high' : cores >= 4 ? 'balanced' : 'performance', 'init');
        setInterval(measureQuality, 1000);
        /* Redimensionner la fenêtre change la SURFACE, donc le budget, mais pas
           le palier : applyQuality() sortait aussitôt sur son test d'égalité et
           la résolution restait calée sur la taille d'origine. On la recalcule
           ici, une fois le geste terminé — réallouer les tampons GPU à chaque
           pixel de déplacement de la poignée coûterait bien plus que ça ne
           rapporte. */
        let minuterieResize = 0, essaisResize = 0;
        function reappliquerApresResize() {
          /* Scène occupée : réessayer, surtout PAS abandonner. Changer le format
             de la fenêtre déclenche justement un travelling de recadrage
             (resizeKayKit3D -> animateKayKitCameraTo quand le rapport largeur/
             hauteur change), donc le premier essai tombe presque toujours
             pendant une animation. Une version antérieure renonçait alors sans
             rien reprogrammer : la résolution restait figée sur la taille
             précédente exactement dans le cas visé. Plafond d'essais pour ne pas
             boucler si une animation reste bloquée. */
          if (sceneBusyForQualitySwitch() && essaisResize < 12) {
            essaisResize++;
            minuterieResize = setTimeout(reappliquerApresResize, 260);
            return;
          }
          essaisResize = 0;
          applyQuality(quality, 'resize');
        }
        window.addEventListener('resize', () => {
          clearTimeout(minuterieResize);
          essaisResize = 0;
          minuterieResize = setTimeout(reappliquerApresResize, 260);
        }, { passive: true });
        let polishFrame = 0; let polishPendingNodes = [];
        new MutationObserver(records => {
          records.forEach(rec => { if (rec.addedNodes.length) polishPendingNodes.push(...rec.addedNodes) });
          if (polishFrame) return;
          polishFrame = requestAnimationFrame(() => {
            polishFrame = 0;
            const nodes = polishPendingNodes; polishPendingNodes = [];
            hookSound(); improveButtons(nodes);
          });
        }).observe(document.body, { subtree: true, childList: true });
        window.ILYOS_V69 = {
          version: VERSION, setQuality: applyQuality, getQuality: () => quality,
          getFPS: () => Math.round(ema),
          // Permet de vérifier en une ligne, depuis la console, ce que le budget
          // décide réellement pour la fenêtre courante.
          getPixelRatio: () => +(renderer()?.getPixelRatio() ?? 0).toFixed(3),
          getBudget: () => ({
            palier: quality,
            surfaceCssMpx: +(surfaceCanvasCss() / 1e6).toFixed(2),
            ratio: +pixelRatioPour(quality).toFixed(3),
            renduMpx: +(surfaceCanvasCss() * Math.pow(pixelRatioPour(quality), 2) / 1e6).toFixed(2),
            budgetMpx: QUALITY_BUDGET_MPX[quality]
          })
        };
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
