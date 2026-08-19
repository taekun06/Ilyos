/* ILYOS — gestion du cache publiée.
   Sur GitHub Pages uniquement, un Service Worker léger force les fichiers de
   code (HTML/JS/CSS) à être relus du réseau. Les assets lourds gardent le cache
   navigateur normal. Plus besoin de vider manuellement le stockage à chaque
   déploiement. */
(function installIlyosFreshnessWorker() {
  const VERSION = "ILYOS_20260819_CARD_CYCLE_V7_VERTICAL_CENTER";
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

/* HUD PIOCHE / DÉFAUSSE V1 — deux compteurs visibles ancrés sur Undo et Fin du tour. */
(function loadIlyosDeckDiscardHudV1() {
  const VERSION = '20260819-deck-discard-hud-v1';
  function install() {
    if (!document.querySelector('link[data-ilyos-deck-discard-hud]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `./css/deck-discard-hud-v1.css?v=${VERSION}`;
      style.dataset.ilyosDeckDiscardHud = 'style';
      document.head.appendChild(style);
    }
    if (!document.querySelector('script[data-ilyos-deck-discard-hud]')) {
      const script = document.createElement('script');
      script.src = `./js/deck-discard-hud-v1.js?v=${VERSION}`;
      script.dataset.ilyosDeckDiscardHud = 'script';
      document.head.appendChild(script);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

/* Cycle visuel des cartes V7 — centrage viewport + cartes/HUD plus verticaux. */
(function loadIlyosCardCycleV7() {
  const VERSION = '20260819-card-cycle-v7-vertical-center';

  function install() {
    if (!document.querySelector('link[data-ilyos-card-cycle-v7]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = `./css/card-cycle-animation-v7.css?v=${VERSION}`;
      style.dataset.ilyosCardCycleV7 = 'style';
      document.head.appendChild(style);
    }

    if (!document.querySelector('script[data-ilyos-card-cycle-v7]')) {
      const script = document.createElement('script');
      script.src = `./js/card-cycle-animation-v7.js?v=${VERSION}`;
      script.dataset.ilyosCardCycleV7 = 'script';
      document.head.appendChild(script);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
