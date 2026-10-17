// This Service Worker is DEPRECATED and self-unregisters.
// It was causing stale cache issues — users couldn't see updates.
self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    (async function () {
      try {
        // Clear all caches
        if ('caches' in self) {
          const keys = await caches.keys();
          await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }
        // Unregister self
        await self.registration.unregister();
        // Take control immediately
        await self.clients.claim();
      } catch (err) {}
    })()
  );
});
// Pass-through fetch — never serve from cache
self.addEventListener('fetch', function (e) {
  // Do nothing — let the browser handle the request normally
});
