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
      function applyQuality(next, reason = 'auto') {
        if (next === quality && !reason.includes('init')) return; quality = next; ensureUI();
        const r = renderer(); const dpr = devicePixelRatio || 1;
        /* Le palier fixe le PLAFOND ; la densité tenable, elle, dépend de la
           taille de la fenêtre et se décide dans js/game/kaykit3d.js
           (kaykitDensiteRendu, « budget de pixels »). Appliquer le plafond tel
           quel demandait 3,2 millions de pixels par image sur une fenêtre de
           portable et 8,3 sur un écran externe, pour la même scène qu'un
           téléphone rend en 0,7 — c'est ce grand écart qui rendait le jeu plus
           lourd sur ordinateur que sur mobile. Repli sur l'ancien calcul si le
           moteur n'expose pas encore ce point d'entrée. */
        /* LE PALIER SE DÉCIDE ICI, SES CONSÉQUENCES 3D SE DÉCIDENT LÀ-BAS.

           Ce script sait mesurer des images par seconde ; il ne connaît ni la
           scène, ni les ombres, ni le post-traitement. Il fixait donc la densité
           et rétrécissait la carte d'ombres, sans jamais pouvoir éteindre les
           deux postes réellement lourds — la passe d'ombres et les cinq passes
           de bloom — qui tournaient encore au palier le plus bas, sur les
           machines qui en avaient le moins les moyens.

           kaykit3D.appliquerQualite (js/game/kaykit3d.js) porte désormais tout
           le paquet. Repli sur l'ancien calcul si le moteur n'expose pas encore
           ce point d'entrée. */
        const plafond = QUALITY_DPR[next] || QUALITY_DPR.balanced;
        if (window.kaykit3D?.appliquerQualite) {
          window.kaykit3D.appliquerQualite(next);
        } else if (window.kaykit3D?.appliquerDensite) {
          window.kaykit3D.appliquerDensite(plafond);
        } else if (r) r.setPixelRatio(Math.min(dpr, plafond));
        if (!window.kaykit3D?.appliquerQualite) {
          const shadow = window.kaykit3D?.scene?.getObjectByProperty?.('isDirectionalLight', true)?.shadow?.mapSize;
          if (shadow) { const size = QUALITY_SHADOW[next] || QUALITY_SHADOW.balanced; shadow.set(size, size) }
          if (window.kaykit3D) window.kaykit3D.qualityMode = next;
        }
        document.documentElement.classList.toggle('v69-fps-low', next === 'performance');
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
        window.ILYOS_V69 = { version: VERSION, setQuality: applyQuality, getQuality: () => quality, getFPS: () => Math.round(ema) };
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
