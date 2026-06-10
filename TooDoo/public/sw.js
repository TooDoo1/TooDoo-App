/* Minimal service worker — replaced by Workbox on `npm run build:web` when workbox-cli is installed. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* Passthrough only: never cache API or image responses (avoids stale/broken PWA loads). */
self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/orders') ||
    event.request.url.includes('/business') ||
    event.request.url.includes('railway.app') ||
    event.request.url.includes('picsum.photos')
  ) {
    return;
  }
});
