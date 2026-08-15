    (() => {
      const VERSION = 'V76';
      const BUILD = 'ILYOS_V76_ANIMATION_20260813';
      const sync = () => {
        window.ILYOS = window.ILYOS || {};
        window.ILYOS.version = VERSION;
        window.ILYOS.build = BUILD;
        window.ILYOS_BUILD = VERSION;
        document.title = 'ILYOS V76 — Animations';
        const badge = document.getElementById('ilyosBuildBadge');
        if (badge && badge.textContent !== 'VERSION V76') badge.textContent = 'VERSION V76';
      };
      sync();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
      window.addEventListener('pageshow', sync, { passive: true });
    })();
