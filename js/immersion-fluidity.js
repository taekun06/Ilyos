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
      // V78 (passe fluidité) : Web Animations API au lieu de classList.toggle +
      // `void offsetWidth` — chaque appel à .animate() démarre une animation
      // fraîche nativement, sans lecture de layout forcée pour "relancer" une
      // classe CSS. Mêmes keyframes/durées/easing que @keyframes
      // v67MoveImpact/PushImpact/MagicImpact/CrownImpact (index.html) :
      // aucun changement perceptible.
      const V67_EASE = 'cubic-bezier(.2,.75,.2,1)';
      const IMPACT_ANIMS = {
        move: { frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)', offset: .45 }, { transform: 'translateY(0)' }], duration: 420 },
        push: { frames: [{ transform: 'translateX(0)' }, { transform: 'translateX(2px)', offset: .3 }, { transform: 'translateX(-1px)', offset: .55 }, { transform: 'translateX(0)' }], duration: 520 },
        magic: { frames: [{ filter: 'none' }, { filter: 'saturate(1.18) brightness(1.06)', offset: .4 }, { filter: 'none' }], duration: 700 },
        crown: { frames: [{ filter: 'none' }, { filter: 'brightness(1.10) saturate(1.12)', offset: .42 }, { filter: 'none' }], duration: 850 }
      };
      function impact(type) {
        const cfg = IMPACT_ANIMS[type]; if (!cfg) return;
        document.querySelectorAll('#gameScreen .board-wrap, #gameScreen .board-shell').forEach(el => {
          el.__ilyosImpactAnim?.cancel();
          el.__ilyosImpactAnim = el.animate(cfg.frames, { duration: cfg.duration, easing: V67_EASE, fill: 'none' });
        });
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
      // Même conversion WAAPI que impact() ci-dessus, pour @keyframes
      // v67TurnWash (opacity 0→1→0 à 0%/35%/100%, transform -28%→28%, 760ms
      // ease-out) — offsets identiques, transform interpolé en continu entre
      // les deux seuls points où il est défini, exactement comme en CSS.
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
      // V78 (passe fluidité) : js/complete-polish.js est désormais l'autorité
      // UNIQUE pour qualityMode/DPR/shadow maps (voir applyQuality()) — ce
      // fichier ne recalcule plus son propre setPixelRatio() en concurrence
      // (c'était appelé indépendamment à chaque resize, écrasant parfois la
      // valeur que le contrôleur de qualité venait de poser). Seule la
      // configuration colorimétrique, qui n'a pas d'équivalent ailleurs, est
      // conservée — appliquée une fois, pas à chaque resize.
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
        // V78 (passe fluidité) : plus de MutationObserver sur tout #gameScreen.
        // wrapSfx()/monitorTurn() sont désormais appelés explicitement depuis
        // le cycle de rendu déjà existant (renderAll(), js/game/ui.js) via ce
        // hook — monitorTurn() garde sa propre garde interne (joueur/phase
        // inchangés ⇒ rien ne se passe). Aucun polling ajouté.
        window.ILYOS_IMMERSION = { announce, impact, monitorTurn, version: VERSION };
        // Rattrapage borné (pas un polling continu) : Three.js/KayKit se
        // charge de façon asynchrone, le renderer peut ne pas encore exister
        // au premier appel de tuneRenderer() ci-dessus.
        [400, 1200, 3000].forEach(delay => setTimeout(tuneRenderer, delay));
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
    })();
