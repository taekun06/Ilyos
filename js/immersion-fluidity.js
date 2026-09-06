    (() => {
      'use strict';
      const VERSION = 'V76';
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
      const V67_EASE = 'cubic-bezier(.2,.75,.2,1)';
      const IMPACT_ANIMS = {
        move: { frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)', offset: .45 }, { transform: 'translateY(0)' }], duration: 420 },
        push: { frames: [{ transform: 'translateX(0)' }, { transform: 'translateX(2px)', offset: .3 }, { transform: 'translateX(-1px)', offset: .55 }, { transform: 'translateX(0)' }], duration: 520 },
        magic: { frames: [{ filter: 'none' }, { filter: 'saturate(1.18) brightness(1.06)', offset: .4 }, { filter: 'none' }], duration: 700 },
        crown: { frames: [{ filter: 'none' }, { filter: 'brightness(1.10) saturate(1.12)', offset: .42 }, { filter: 'none' }], duration: 850 }
      };
      function impact(type) {
        const cfg = IMPACT_ANIMS[type]; if (!cfg) return;
        const in3D = !!window.kaykit3D?.renderer;

        // En 3D, MOVE/PUSH se produisent souvent pendant un tween de caméra AUTO.
        // L'ancienne animation déplaçait le conteneur DOM entier de ±1/2 px en
        // même temps que Three.js déplaçait la caméra : visuellement cela faisait
        // une micro-saccade, surtout pendant le tour de l'IA. On garde le feedback
        // sans déplacer le viewport 3D.
        if (in3D && type === 'move') return;

        const safeCfg = in3D && type === 'push'
          ? {
              frames: [
                { filter: 'none' },
                { filter: 'brightness(1.035) saturate(1.04)', offset: .35 },
                { filter: 'none' }
              ],
              duration: 360
            }
          : cfg;

        document.querySelectorAll('#gameScreen .board-wrap, #gameScreen .board-shell').forEach(el => {
          el.__ilyosImpactAnim?.cancel();
          el.__ilyosImpactAnim = el.animate(safeCfg.frames, { duration: safeCfg.duration, easing: V67_EASE, fill: 'none' });
        });
      }
      function contextualHaptic(type) {
        if (!navigator.vibrate || reduced()) return;
        const patterns = { move: [10], push: [18, 30, 12], magic: [8, 22, 8], crown: [10, 35, 18], turn: [7] };
        try { navigator.vibrate(patterns[type] || [8]) } catch (_) { }
      }
      function wrapSfx() {
        if (typeof playSfx !== 'function' || playSfx.__v67) return; const original = playSfx;
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
      function washTurn() {
        ensureLayer();
        wash.__ilyosAnim?.cancel();
        wash.__ilyosAnim = wash.animate(
          [
            { opacity: 0, transform: 'translateX(-28%)', offset: 0 },
            { opacity: 1, offset: .35 },
            { opacity: 0, transform: 'translateX(28%)', offset: 1 }
          ],
          { duration: 760, easing: 'ease-out', fill: 'none' }
        );
      }
      function monitorTurn() {
        const player = document.querySelector('#gameScreen .active-player-name,#activePlayerName,.active-name')?.textContent?.trim() || '';
        const phase = document.getElementById('phaseLabel')?.textContent?.trim() || '';
        if (player && lastPlayer && player !== lastPlayer) {
          washTurn();
          announce(`Au tour de ${player}`, phase || 'Préparez votre stratégie', 900); contextualHaptic('turn');
        }
        if (phase && phase !== lastPhase && /couronne|point|victoire/i.test(phase)) announce(phase, '', 1050);
        lastPlayer = player || lastPlayer; lastPhase = phase || lastPhase;
      }
      function tuneRenderer() {
        const r = window.kaykit3D?.renderer; if (!r) return;
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
        document.title = 'ILYOS V76 — Animations';
        const badge = document.getElementById('ilyosBuildBadge'); if (badge) badge.textContent = 'VERSION V76';
        window.ILYOS_IMMERSION = { announce, impact, monitorTurn, version: VERSION };
        [400, 1200, 3000].forEach(delay => setTimeout(tuneRenderer, delay));
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();

    /* Passe visuelle Éther temporaire. Le fichier dédié ne modifie aucune règle
       et ne crée aucun mesh : il retune les objets Three.js déjà produits par
       kaykit3d.js avec les valeurs validées dans le laboratoire. */
    (() => {
      if (window.__ILYOS_ETHER_THEME_LOADER__) return;
      window.__ILYOS_ETHER_THEME_LOADER__ = true;
      const current = document.currentScript?.src || '';
      const script = document.createElement('script');
      script.src = current
        ? new URL('./ether-game-theme.js', current).href
        : './js/ether-game-theme.js';
      script.async = true;
      script.dataset.ilyosEtherTheme = 'true';
      document.head.appendChild(script);
    })();

    // Outil local opt-in : aucun panneau ni profil chargé en partie normale.
    if (new URLSearchParams(location.search).get('visualEditor') === '1') {
      const editor = document.createElement('script');
      editor.src = new URL('./visual-editor.js', document.currentScript.src).href;
      document.head.appendChild(editor);
    }
