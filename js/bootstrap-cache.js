/* ILYOS — gestion du cache publiée.
   Sur GitHub Pages uniquement, un Service Worker léger force les fichiers de
   code (HTML/JS/CSS) à être relus du réseau. Les assets lourds gardent le cache
   navigateur normal. Plus besoin de vider manuellement le stockage à chaque
   déploiement. */
(function installIlyosFreshnessWorker() {
  const VERSION = "ILYOS_20260817_CODE_FRESHNESS_1";
  try {
    document.documentElement.dataset.ilyosBuild = VERSION;
    localStorage.setItem('ilyos-build-version', VERSION);

    if (!('serviceWorker' in navigator)) return;
    if (!/\.github\.io$/i.test(location.hostname)) return;

    let reloadStarted = false;
    navigator.serviceWorker.register('./sw.js', {
      scope: './',
      updateViaCache: 'none'
    }).then(registration => {
      registration.update().catch(() => {});

      /* Première installation seulement : dès que le worker prend le contrôle,
         recharge automatiquement la page une fois. Les chargements suivants
         utilisent toujours le code réseau-frais, sans intervention manuelle. */
      if (!navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloadStarted) return;
          reloadStarted = true;
          location.reload();
        }, { once: true });
      }
    }).catch(error => {
      console.warn('[ILYOS] freshness worker indisponible', error);
    });
  } catch (_) { }
})();
