/* ILYOS — gestion du cache publiée.
   Sur GitHub Pages uniquement, un Service Worker léger force les fichiers de
   code (HTML/JS/CSS) à être relus du réseau. Les assets lourds gardent le cache
   navigateur normal. Plus besoin de vider manuellement le stockage à chaque
   déploiement. */
(function installIlyosFreshnessWorker() {
  const VERSION = "ILYOS_20260819_CARD_CYCLE_V9_HUD_CLICK_POSITION";
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

function ilyosLoadStyleOnce(marker, href) {
  if (document.querySelector(`link[data-ilyos-loader="${marker}"]`)) return;
  const node = document.createElement('link');
  node.rel = 'stylesheet';
  node.href = href;
  node.dataset.ilyosLoader = marker;
  document.head.appendChild(node);
}

function ilyosLoadScriptOnce(marker, src) {
  if (document.querySelector(`script[data-ilyos-loader="${marker}"]`)) return;
  const node = document.createElement('script');
  node.src = src;
  node.dataset.ilyosLoader = marker;
  document.head.appendChild(node);
}

(function loadIlyosV9HudAndCards() {
  const VERSION = '20260819-v9-hud-click-position';

  function install() {
    ilyosLoadStyleOnce('deck-discard-base-v9', `./css/deck-discard-hud-v1.css?v=${VERSION}`);
    ilyosLoadStyleOnce('card-cycle-v7-base-v9', `./css/card-cycle-animation-v7.css?v=${VERSION}`);
    ilyosLoadStyleOnce('card-cycle-v8-overrides-v9', `./css/card-cycle-animation-v8.css?v=${VERSION}`);

    ilyosLoadScriptOnce('deck-discard-hud-v9', `./js/deck-discard-hud-v1.js?v=${VERSION}`);
    ilyosLoadScriptOnce('discard-viewer-v9', `./js/deck-discard-viewer-v2.js?v=${VERSION}`);
    ilyosLoadScriptOnce('card-cycle-v9', `./js/card-cycle-animation-v8.js?v=${VERSION}`);

    /* Départ de partie en VUE FACE + caméra AUTO — inchangé. */
    ilyosLoadScriptOnce('camera-start-face-auto-v9', `./js/camera-start-face-auto-v1.js?v=${VERSION}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();