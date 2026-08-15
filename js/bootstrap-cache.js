    (function forceLatestIlyosVersion() {
      const VERSION = "ILYOS_20260815_MAIN_CACHE_1";
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
