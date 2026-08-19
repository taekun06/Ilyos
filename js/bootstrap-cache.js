/* ILYOS — gestion du cache publiée.
   Sur GitHub Pages uniquement, un Service Worker léger force les fichiers de
   code (HTML/JS/CSS) à être relus du réseau. Les assets lourds gardent le cache
   navigateur normal. Plus besoin de vider manuellement le stockage à chaque
   déploiement. */
(function installIlyosFreshnessWorker() {
  const VERSION = "ILYOS_20260819_CARD_CYCLE_V4";
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

/*
 * Cycle visuel des cartes V4.
 * Chargé dynamiquement pour rester totalement découplé du bundle game.js :
 * si l'effet doit être retiré, il suffit de supprimer ce loader et les deux
 * fichiers dédiés, sans toucher au moteur de jeu ni au HUD.
 */
(function loadIlyosCardCycleV4() {
  const VERSION = '20260819-card-cycle-v4';

  function install() {
    if (!document.querySelector('link[data-ilyos-card-cycle-v2]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `./css/card-cycle-animation-v2.css?v=${VERSION}`;
      style.dataset.ilyosCardCycleV2 = 'style';
      document.head.appendChild(style);
    }

    if (!document.querySelector('script[data-ilyos-card-cycle-v2]')) {
      const script = document.createElement('script');
      script.src = `./js/card-cycle-animation-v2.js?v=${VERSION}`;
      script.dataset.ilyosCardCycleV2 = 'script';
      document.head.appendChild(script);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
