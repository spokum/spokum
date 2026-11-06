self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    (async function () {
      try {
        if ('caches' in self) {
          const keys = await caches.keys();
          await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }
        await self.registration.unregister();
        await self.clients.claim();
      } catch (err) {}
    })()
  );
});
self.addEventListener('fetch', function (e) {
});
