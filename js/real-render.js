    (() => {
      'use strict';
      const VERSION = 'V75.1';
      function apply() {
        window.ILYOS_BUILD = VERSION; document.title = 'ILYOS V75.1 — Stable Netlify';
        const badge = document.getElementById('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V75.1';
        if (window.kaykit3D) {
          const k = window.kaykit3D;
          k.minZoom = 6.4; k.maxZoom = 25;
          if (k.autoFit && typeof window.kaykitFitDistance === 'function' && typeof window.animateKayKitCameraTo === 'function') {
            const d = window.kaykitFitDistance(k.camera?.aspect || 1, k.viewMode || 'isometric');
            k.zoomDistance = d; window.animateKayKitCameraTo(k.viewMode || 'isometric', d, 320);
          }
        }
      }
      function compactPanels() {
        document.querySelectorAll('.left-panel,.right-panel').forEach(p => { p.style.removeProperty('height'); });
      }
      function boot() { apply(); compactPanels(); setTimeout(apply, 500); setTimeout(apply, 1600); let resizeFrame = 0; window.addEventListener('resize', () => { if (resizeFrame) return; resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; apply() }) }, { passive: true }); window.ILYOS_V70 = { version: VERSION, refit: apply }; }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
