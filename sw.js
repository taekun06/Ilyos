/* ILYOS — service worker.

   Deux politiques opposées, pour deux natures de fichiers :

   • LE CODE reste toujours réseau-frais (`no-store`). C'est volontaire :
     GitHub Pages ne permet pas de fixer les en-têtes de cache, et servir un
     `game.js` périmé casse la partie sans que personne comprenne pourquoi.

   • LES ASSETS (modèles 3D, textures, images, polices, audio) et le VENDOR
     (three.js, GLTFLoader, PeerJS) passent en cache-first. Ils ne changent
     jamais sans changer de nom, et ils pèsent l'essentiel du téléchargement.

   Pourquoi ce cache est nécessaire ici : le fichier `_headers` à la racine
   déclare `max-age=31536000, immutable` sur /assets/* et /vendor/*, mais il
   est au format Netlify — GitHub Pages l'ignore intégralement et sert ses
   propres en-têtes. Ces règles n'ont donc jamais eu le moindre effet en
   production. Le cache du service worker est le seul levier réellement
   disponible sur cet hébergeur.

   Conséquence : au second lancement, un duel ne retélécharge rien, et la
   partie reste jouable hors ligne une fois les modèles vus.

   Pour forcer le renouvellement d'un asset qui aurait changé SANS changer de
   nom, incrémenter ILYOS_ASSET_CACHE ci-dessous : l'ancien cache est alors
   supprimé à l'activation. */

const ILYOS_SW_VERSION = '2026-08-21-asset-cache-1';
const ILYOS_ASSET_CACHE = 'ilyos-assets-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Purge des versions précédentes du cache d'assets.
    const noms = await caches.keys();
    await Promise.all(
      noms.filter(nom => nom.startsWith('ilyos-assets-') && nom !== ILYOS_ASSET_CACHE)
        .map(nom => caches.delete(nom))
    );
    await self.clients.claim();
  })());
});

/* Chemins mis en cache. Le test porte sur « contient », pas « commence par » :
   le jeu est servi à la racine en local mais sous /Ilyos/ sur GitHub Pages. */
function estAssetCachable(url) {
  return url.pathname.includes('/assets/') || url.pathname.includes('/vendor/');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const destination = request.destination;
  const estCode = request.mode === 'navigate'
    || destination === 'document'
    || destination === 'script'
    || destination === 'style'
    || destination === 'worker'
    || /\.(?:html?|js|mjs|css)$/i.test(url.pathname);

  // Le code d'abord : un fichier de vendor a beau finir en .js, il est épinglé
  // et ne doit pas repasser par le réseau à chaque chargement.
  if (estCode && !estAssetCachable(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  if (!estAssetCachable(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(ILYOS_ASSET_CACHE);
    const enCache = await cache.match(request);
    if (enCache) return enCache;

    const reponse = await fetch(request);
    /* Seules les réponses complètes et valides sont conservées : une 206
       (requête par plage) ou une opaque mettrait en cache un fragment, et le
       modèle serait ensuite servi tronqué sans erreur visible. */
    if (reponse && reponse.status === 200 && reponse.type === 'basic') {
      cache.put(request, reponse.clone());
    }
    return reponse;
  })());
});
