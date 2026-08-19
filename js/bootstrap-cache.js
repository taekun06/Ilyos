/* ILYOS — gestion du cache publiée.
   Sur GitHub Pages uniquement, un Service Worker léger force les fichiers de
   code (HTML/JS/CSS) à être relus du réseau. Les assets lourds gardent le cache
   navigateur normal. Plus besoin de vider manuellement le stockage à chaque
   déploiement. */
(function installIlyosFreshnessWorker() {
  const VERSION = "ILYOS_20260819_HUD_POLISH_TARGETED_V1B";
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

(function loadIlyosHudPolishTargetedV1() {
  const VERSION = '20260819-hud-polish-targeted-v1b';

  function install() {
    ilyosLoadStyleOnce('deck-discard-base-v10', `./css/deck-discard-hud-v1.css?v=${VERSION}`);
    ilyosLoadStyleOnce('card-cycle-v7-base-v10', `./css/card-cycle-animation-v7.css?v=${VERSION}`);
    ilyosLoadStyleOnce('card-cycle-v8-overrides-v10', `./css/card-cycle-animation-v8.css?v=${VERSION}`);
    ilyosLoadStyleOnce('card-cycle-v10-polish', `./css/card-cycle-animation-v10.css?v=${VERSION}`);
    ilyosLoadStyleOnce('hud-polish-targeted-v1', `./css/hud-polish-targeted-v1.css?v=${VERSION}`);
    ilyosLoadStyleOnce('hud-polish-targeted-v1-final', `./css/hud-polish-targeted-v1-final.css?v=${VERSION}`);

    ilyosLoadScriptOnce('deck-discard-hud-v10', `./js/deck-discard-hud-v1.js?v=${VERSION}`);
    ilyosLoadScriptOnce('discard-viewer-v10', `./js/deck-discard-viewer-v2.js?v=${VERSION}`);
    ilyosLoadScriptOnce('card-cycle-v10', `./js/card-cycle-animation-v10.js?v=${VERSION}`);
    ilyosLoadScriptOnce('hud-polish-targeted-v1', `./js/hud-polish-targeted-v1.js?v=${VERSION}`);

    /* Départ de partie en VUE FACE + caméra AUTO — inchangé. */
    ilyosLoadScriptOnce('camera-start-face-auto-v10', `./js/camera-start-face-auto-v1.js?v=${VERSION}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
