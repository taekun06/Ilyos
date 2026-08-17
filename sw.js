/* ILYOS — GitHub Pages freshness worker.
   Les fichiers de code restent toujours réseau-frais ; les gros assets 3D,
   textures, images et audio conservent le cache HTTP normal du navigateur. */
const ILYOS_SW_VERSION = '2026-08-17-code-freshness-1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const destination = request.destination;
  const isCode = request.mode === 'navigate'
    || destination === 'document'
    || destination === 'script'
    || destination === 'style'
    || destination === 'worker'
    || /\.(?:html?|js|mjs|css)$/i.test(url.pathname);

  if (!isCode) return;

  event.respondWith(
    fetch(request, { cache: 'no-store' })
  );
});
