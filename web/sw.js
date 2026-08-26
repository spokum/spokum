const VERSION = 'spokum-v5';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/ui.js',
  './js/util.js',
  './js/icons.js',
  './js/backend/local.js',
  './js/backend/remote.js',
  './js/backend/supabase.js',
  './js/games/index.js',
  './js/views/auth.js',
  './js/views/feed.js',
  './js/views/chats.js',
  './js/views/games.js',
  './js/views/settings.js',
  './js/views/profile.js',
  './js/views/admin.js',
  './js/views/mod.js',
  './js/views/stories.js',
  './js/views/safe.js',
  './vendor/supabase.js',
  './fonts/inter-cyrillic-400.woff2',
  './fonts/inter-cyrillic-500.woff2',
  './fonts/inter-cyrillic-600.woff2',
  './fonts/inter-cyrillic-700.woff2',
  './fonts/inter-latin-400.woff2',
  './fonts/inter-latin-500.woff2',
  './fonts/inter-latin-600.woff2',
  './fonts/inter-latin-700.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE.map((path) => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.endsWith('/config.js')) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)));
    return;
  }
  const isModuleCdn = url.hostname === 'esm.sh' || url.hostname === 'cdn.jsdelivr.net';

  if (!sameOrigin && !isModuleCdn) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: sameOrigin });
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        network.catch(() => {});
        return cached;
      }

      const response = await network;
      if (response) return response;

      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    })
  );
});
