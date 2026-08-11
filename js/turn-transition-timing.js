    (() => {
      const run = () => {
        if (typeof showTurnRibbon !== 'function' || showTurnRibbon.__v72) return;
        const original = showTurnRibbon;
        window.showTurnRibbon = function (player) {
          original(player);
          const el = document.getElementById('turnRibbon');
          if (!el) return;
          setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.classList.add('hidden'), 160) }, 650);
        };
        window.showTurnRibbon.__v72 = true;
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 0), { once: true }); else setTimeout(run, 0);
    })();
