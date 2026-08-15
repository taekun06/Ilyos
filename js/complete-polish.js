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
      // V78 (passe fluidité) : nouveaux profils — DPR/shadow map affinés,
      // AUCUN profil ne limite le renderer en FPS (le throttle "performance"
      // qui plafonnait à ~30 i/s a été retiré de animateKayKit3D, voir
      // js/game/kaykit3d.js). Le mode performance reste plus léger via DPR/
      // shadow map réduits et les mixers Idle à 30 Hz (déjà géré dans
      // updateKayKitCharacters) — jamais en sautant des frames de rendu.
      const QUALITY_DPR = { high: 1.5, balanced: 1.2, performance: .95 };
      const QUALITY_SHADOW = { high: 1024, balanced: 768, performance: 512 };
      function applyQuality(next, reason = 'auto') {
        if (next === quality && !reason.includes('init')) return; quality = next; ensureUI();
        const r = renderer(); const dpr = devicePixelRatio || 1;
        if (r) r.setPixelRatio(Math.min(dpr, QUALITY_DPR[next] || QUALITY_DPR.balanced));
        const shadow = window.kaykit3D?.scene?.getObjectByProperty?.('isDirectionalLight', true)?.shadow?.mapSize;
        if (shadow) { const size = QUALITY_SHADOW[next] || QUALITY_SHADOW.balanced; shadow.set(size, size) }
        document.documentElement.classList.toggle('v69-fps-low', next === 'performance');
        // Le moteur 3D lit ce mode pour alléger en priorité les particules, les
        // trails et la cadence d'animation des gardiens AU REPOS — jamais les
        // animations d'action, qui portent la lisibilité du jeu.
        if (window.kaykit3D) window.kaykit3D.qualityMode = next;
        qualityPill.textContent = `Qualité ${next === 'high' ? 'élevée' : next === 'balanced' ? 'équilibrée' : 'performance'} · ${Math.round(ema)} i/s`;
        // V78 : plus de faux `resize` — un changement de DPR/qualité ne doit
        // jamais simuler un changement de taille de fenêtre. resizeKayKitRenderer
        // (js/game/kaykit3d.js, exposé via window.kaykit3D.resize) met à jour
        // uniquement renderer.setSize()/camera.aspect si le conteneur a
        // réellement changé de taille ; refitCamera:false garantit qu'un
        // changement de qualité ne refit jamais la caméra.
        window.kaykit3D?.resize?.({ refitCamera: false });
      }
      // V78 (passe fluidité) : échantillonnage ~1×/s via setInterval au lieu
      // d'une boucle requestAnimationFrame(monitor) dédiée qui tournait à
      // chaque frame pour ne faire un vrai travail qu'une fois par seconde.
      // FPS lu uniquement depuis window.ILYOS_PERF, qui l'échantillonne aux
      // vrais appels renderer.render() (voir js/game/kaykit3d.js,
      // animateKayKit3D) — jamais mesuré quand document.hidden.
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
          if (next && next !== quality) { applyQuality(next); lastQualityChange = now; lowSamples = midSamples = highSamples = 0; }
        }
        if (qualityPill) qualityPill.textContent = `Qualité ${quality === 'high' ? 'élevée' : quality === 'balanced' ? 'équilibrée' : 'performance'} · ${Math.round(ema)} i/s`;
      }
      function actionFlash(type) {
        // V78 (passe fluidité) : Web Animations API au lieu de classList.toggle
        // + `void offsetWidth` — chaque appel à .animate() redémarre nativement,
        // sans lecture de layout forcée. Mêmes keyframes/durée/easing que
        // @keyframes v69-flash (480ms ease-out) : timing inchangé.
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
        // roots absent (appel initial au boot) : scan complet, une seule fois.
        // roots fourni (depuis le MutationObserver) : ne traite QUE les noeuds
        // reellement ajoutes depuis le dernier passage (et leurs descendants) —
        // avant, la moindre mutation DOM ailleurs sur la page (toast, modale,
        // surbrillance...) redeclenchait un `querySelectorAll` sur TOUT le
        // document, deux fois, a chaque frame ou une mutation etait detectee.
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
