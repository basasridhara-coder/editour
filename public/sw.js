// Slant PWA Service Worker (Enables Web Share Target & Native Installability)
const CACHE_NAME = 'slant-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through to network so all dynamic editorial data and API routes remain real-time
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
