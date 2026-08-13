    (function forceLatestIlyosVersion() {
      const VERSION = "ILYOS_V76_20260813_ANIM";
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(reg => reg.unregister()));
        }
        const previous = localStorage.getItem('ilyos-build-version');
        if (previous !== VERSION) {
          localStorage.setItem('ilyos-build-version', VERSION);
          sessionStorage.setItem('ilyos-force-refresh-done', VERSION);
        }
        document.documentElement.dataset.ilyosBuild = VERSION;
      } catch (_) { }
    })();
