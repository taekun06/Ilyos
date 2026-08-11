    (() => {
      'use strict';
      const VERSION = 'V75.1';
      let layer, toast, wash, hideTimer, lastPlayer = '', lastPhase = '';
      const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
      function ensureLayer() {
        if (layer) return;
        layer = document.createElement('div'); layer.className = 'v67-event-layer'; layer.setAttribute('aria-live', 'polite');
        toast = document.createElement('div'); toast.className = 'v67-event-toast'; layer.appendChild(toast);
        wash = document.createElement('div'); wash.className = 'v67-turn-wash'; document.body.append(wash, layer);
      }
      function announce(title, subtitle = '', duration = 1150) {
        ensureLayer(); clearTimeout(hideTimer); toast.innerHTML = `<strong>${title}</strong>${subtitle ? `<span>${subtitle}</span>` : ''}`;
        requestAnimationFrame(() => toast.classList.add('show'));
        hideTimer = setTimeout(() => toast.classList.remove('show'), reduced() ? 500 : duration);
      }
      function impact(type) {
        const game = document.getElementById('gameScreen'); if (!game) return;
        const cls = 'v67-impact-' + type; game.classList.remove(cls); void game.offsetWidth; game.classList.add(cls);
        setTimeout(() => game.classList.remove(cls), type === 'crown' ? 900 : 720);
      }
      function contextualHaptic(type) {
        if (!navigator.vibrate || reduced()) return;
        const patterns = { move: [10], push: [18, 30, 12], magic: [8, 22, 8], crown: [10, 35, 18], turn: [7] };
        try { navigator.vibrate(patterns[type] || [8]) } catch (_) { }
      }
      function wrapSfx() {
        if (typeof playSfx !== 'function' || playSfx.__v67) return;
        const original = playSfx;
        playSfx = function (type) {
          const value = original.apply(this, arguments);
          if (['move', 'push', 'magic', 'crown', 'turn', 'island', 'victory'].includes(type)) {
            const visual = type === 'island' ? 'magic' : type;
            impact(visual); contextualHaptic(type);
            if (type === 'victory') announce('Victoire !', 'L’archipel célèbre votre triomphe', 1450);
          }
          return value;
        };
        playSfx.__v67 = true;
      }
      function monitorTurn() {
        const player = document.querySelector('#gameScreen .active-player-name,#activePlayerName,.active-name')?.textContent?.trim() || '';
        const phase = document.getElementById('phaseLabel')?.textContent?.trim() || '';
        if (player && lastPlayer && player !== lastPlayer) {
          ensureLayer(); wash.classList.remove('play'); void wash.offsetWidth; wash.classList.add('play');
          announce(`Au tour de ${player}`, phase || 'Préparez votre stratégie', 900); contextualHaptic('turn');
        }
        if (phase && phase !== lastPhase && /couronne|point|victoire/i.test(phase)) announce(phase, '', 1050);
        lastPlayer = player || lastPlayer; lastPhase = phase || lastPhase;
      }
      function tuneRenderer() {
        const r = window.kaykit3D?.renderer; if (!r) return;
        const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
        const maxRatio = (cores >= 8 && mem >= 8) ? 1.5 : (cores >= 4 ? 1.25 : 1);
        r.setPixelRatio(Math.min(devicePixelRatio || 1, maxRatio));
        if ('outputColorSpace' in r && window.THREE?.SRGBColorSpace) r.outputColorSpace = THREE.SRGBColorSpace;
      }
      function pauseInvisibleMedia() {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) { try { window.ambienceAudio?.pause?.() } catch (_) { } }
          else if (window.ambientEnabled) { try { window.startAmbient?.() } catch (_) { } }
        });
      }
      function boot() {
        ensureLayer(); wrapSfx(); tuneRenderer(); pauseInvisibleMedia();
        document.title = 'ILYOS V75.1 — Stable Netlify';
        const badge = document.getElementById('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V75.1';
        const game = document.getElementById('gameScreen');
        let immersionRefreshFrame = 0;
        const scheduleImmersionRefresh = () => {
          if (immersionRefreshFrame) return;
          immersionRefreshFrame = requestAnimationFrame(() => {
            immersionRefreshFrame = 0;
            wrapSfx();
            monitorTurn();
          });
        };
        if (game) new MutationObserver(scheduleImmersionRefresh).observe(game, { subtree: true, childList: true, characterData: true });
        window.addEventListener('resize', () => requestAnimationFrame(tuneRenderer), { passive: true });
        window.ILYOS_IMMERSION = { announce, impact, version: VERSION };
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
