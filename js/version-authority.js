    (() => {
      const VERSION = 'V75.1';
      const BUILD = 'ILYOS_V75_1_STABLE_NETLIFY_20260808';
      const sync = () => {
        window.ILYOS = window.ILYOS || {};
        window.ILYOS.version = VERSION;
        window.ILYOS.build = BUILD;
        window.ILYOS_BUILD = VERSION;
        document.title = 'ILYOS V75.1 — Stable Netlify';
        const badge = document.getElementById('ilyosBuildBadge');
        if (badge && badge.textContent !== 'VERSION V75.1') badge.textContent = 'VERSION V75.1';
      };
      sync();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
      window.addEventListener('pageshow', sync, { passive: true });
    })();
