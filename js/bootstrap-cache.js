/* ILYOS — gestion du cache publiée.
   Sur GitHub Pages uniquement, un Service Worker léger force les fichiers de
   code (HTML/JS/CSS) à être relus du réseau. Les assets lourds gardent le cache
   navigateur normal. Plus besoin de vider manuellement le stockage à chaque
   déploiement. */
(function installIlyosFreshnessWorker() {
  const VERSION = "ILYOS_20260906_CAMERA_UNE_AUTORITE";
  try {
    document.documentElement.dataset.ilyosBuild = VERSION;
    localStorage.setItem('ilyos-build-version', VERSION);

    if (!('serviceWorker' in navigator)) return;
    if (!/\.github\.io$/i.test(location.hostname)) return;

    /* IMPORTANT : ne jamais recharger automatiquement la toute première visite.
       Sur une machine neuve, le Service Worker s'installe pendant que le menu,
       Three.js et les modèles commencent à charger. L'ancien controllerchange
       faisait alors location.reload() au milieu de ce premier chargement : sur
       une connexion lente ou une machine moins rapide, cela pouvait donner un
       écran interrompu / un lancement incomplet. Le premier chargement est déjà
       frais puisqu'il n'a encore aucun cache ; le worker prendra naturellement
       la main pour les requêtes suivantes. */
    navigator.serviceWorker.register('./sw.js', {
      scope: './',
      updateViaCache: 'none'
    }).then(registration => {
      registration.update().catch(() => {});
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
  // Même raison que dans js/version-bootstrap.js : sans `async = false`, ces
  // scripts s'exécutent dans leur ordre d'arrivée, pas dans celui des appels.
  node.async = false;
  node.dataset.ilyosLoader = marker;
  document.head.appendChild(node);
}

(function loadIlyosHudPolishTargetedV1() {
  const VERSION = '20261105-cartes-clic';

  function install() {
    // Les onze anciennes feuilles des cartes et des piles, bout à bout dans leur ordre d'origine.
    ilyosLoadStyleOnce('cartes-hud', `./css/cartes-hud.css?v=${VERSION}`);

    ilyosLoadScriptOnce('deck-discard-hud-v11', `./js/deck-discard-hud-v1.js?v=${VERSION}`);
    ilyosLoadScriptOnce('discard-viewer-v11', `./js/deck-discard-viewer-v2.js?v=${VERSION}`);
    ilyosLoadScriptOnce('card-cycle-v10', `./js/card-cycle-animation-v10.js?v=${VERSION}-etroit`);
    ilyosLoadScriptOnce('hud-polish-targeted-v1', `./js/hud-polish-targeted-v1.js?v=${VERSION}`);
    ilyosLoadScriptOnce('hud-islands-reserve-discard-v13', `./js/hud-islands-reserve-discard-v13.js?v=${VERSION}-bulle`);

    /* Plus de script de départ caméra ici. camera-start-face-auto-v1.js
       recliquait VUE FACE puis AUTO à +45 ms et +520 ms ; le clic AUTO déclenche
       kaykitFollowCurrentPlayer(), qui redéplaçait aussitôt le point visé, et le
       cadrage d'ouverture dépendait de qui parlait en dernier. Le preset de
       js/version-bootstrap.js est désormais seul propriétaire du cadrage FACE,
       et le moteur lui demande son recul au lieu d'en recalculer un second
       (voir kaykitFitDistance dans js/game/kaykit3d.js). */

    /* Fiabilisation tactile : V2 neutralise le click natif du canvas après un
       touch et le rejoue une fois le drag OrbitControls stabilisé. */
    ilyosLoadScriptOnce('mobile-input-v2', `./js/mobile-input-v1.js?v=${VERSION}-consigne`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();