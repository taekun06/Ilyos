    (() => {
      'use strict';
      const VERSION = 'V76';
      let quality = 'high', last = performance.now(), frames = 0, ema = 60, qualityPill, flash, lastQualityChange = 0, lowSamples = 0, midSamples = 0, highSamples = 0;
      const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      function ensureUI() {
        if (!qualityPill) { qualityPill = document.createElement('div'); qualityPill.className = 'v69-quality-pill'; qualityPill.setAttribute('aria-hidden', 'true'); document.body.appendChild(qualityPill) }
        if (!flash) { flash = document.createElement('div'); flash.className = 'v69-action-flash'; document.body.appendChild(flash) }
      }
      function renderer() { return window.kaykit3D?.renderer || null }
      function applyQuality(next, reason = 'auto') {
        if (next === quality && !reason.includes('init')) return; quality = next; ensureUI();
        const r = renderer(); const dpr = devicePixelRatio || 1;
        const ratios = { high: 1.5, balanced: 1.25, performance: 1 };
        if (r) r.setPixelRatio(Math.min(dpr, ratios[next] || 1.25));
        const shadow = window.kaykit3D?.scene?.getObjectByProperty?.('isDirectionalLight', true)?.shadow?.mapSize;
        if (shadow) { const size = next === 'high' ? 1024 : next === 'balanced' ? 768 : 512; shadow.set(size, size) }
        document.documentElement.classList.toggle('v69-fps-low', next === 'performance');
        // Le moteur 3D lit ce mode pour alléger en priorité les particules, les
        // trails et la cadence d'animation des gardiens AU REPOS — jamais les
        // animations d'action, qui portent la lisibilité du jeu.
        if (window.kaykit3D) window.kaykit3D.qualityMode = next;
        qualityPill.textContent = `Qualité ${next === 'high' ? 'élevée' : next === 'balanced' ? 'équilibrée' : 'performance'} · ${Math.round(ema)} i/s`;
        window.dispatchEvent(new Event('resize'));
      }
      function monitor(now) {
        frames++; const span = now - last;
        if (span >= 1000) {
          const fps = frames * 1000 / span; ema = ema * .72 + fps * .28; frames = 0; last = now;
          if (!document.hidden) {
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
          }
          if (qualityPill) qualityPill.textContent = `Qualité ${quality === 'high' ? 'élevée' : quality === 'balanced' ? 'équilibrée' : 'performance'} · ${Math.round(ema)} i/s`;
        }
        requestAnimationFrame(monitor)
      }
      function actionFlash(type) {
        if (reduced()) return; ensureUI(); flash.style.background = type === 'push' ? 'radial-gradient(circle at 50% 55%,rgba(255,154,85,.28),transparent 40%)' : type === 'magic' ? 'radial-gradient(circle at 50% 55%,rgba(169,126,255,.28),transparent 40%)' : 'radial-gradient(circle at 50% 55%,rgba(255,255,255,.3),transparent 38%)';
        flash.classList.remove('play'); void flash.offsetWidth; flash.classList.add('play')
      }
      function hookSound() {
        if (typeof window.playSfx !== 'function' || window.playSfx.__v69) return; const original = window.playSfx;
        window.playSfx = function (type) { const out = original.apply(this, arguments); if (['move', 'push', 'magic', 'island', 'crown'].includes(type)) actionFlash(type); return out }; window.playSfx.__v69 = true
      }
      function improveButtons() {
        document.querySelectorAll('button:not([aria-label])').forEach(b => { const t = b.textContent.trim().replace(/\s+/g, ' '); if (t) b.setAttribute('aria-label', t) });
        document.querySelectorAll('button,.action-card,.island-option').forEach(el => { if (!el.hasAttribute('tabindex') && !['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName)) el.tabIndex = 0 })
      }
      function cleanupHiddenAnimations() {
        document.addEventListener('visibilitychange', () => { document.documentElement.classList.toggle('v69-page-hidden', document.hidden); if (!document.hidden) requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))) });
      }
      function boot() {
        window.ILYOS_BUILD = VERSION; document.title = 'ILYOS V76 — Animations';
        const badge = document.getElementById('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V76';
        ensureUI(); hookSound(); improveButtons(); cleanupHiddenAnimations();
        const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4; applyQuality(cores >= 8 && mem >= 8 ? 'high' : cores >= 4 ? 'balanced' : 'performance', 'init');
        requestAnimationFrame(monitor);
        let polishFrame = 0; new MutationObserver(() => { if (polishFrame) return; polishFrame = requestAnimationFrame(() => { polishFrame = 0; hookSound(); improveButtons() }) }).observe(document.body, { subtree: true, childList: true });
        window.ILYOS_V69 = { version: VERSION, setQuality: applyQuality, getQuality: () => quality, getFPS: () => Math.round(ema) };
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
