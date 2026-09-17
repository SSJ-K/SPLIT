// SPLIT service worker — caches the app shell so it opens offline / on slow VPN.
// Bump CACHE_VERSION whenever index.html changes so old shells get evicted.
const CACHE_VERSION = 'split-v1.7';
const SHELL = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: serve cache instantly, refresh in background,
// and tell the page when a newer copy has landed.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request).then(async res => {
        if (res && res.ok) {
          const fresh = res.clone();
          if (cached) {
            const [a, b] = await Promise.all([cached.clone().text(), fresh.clone().text()]);
            if (a !== b) {
              await cache.put(e.request, fresh);
              const clients = await self.clients.matchAll({ type: 'window' });
              clients.forEach(c => c.postMessage({ type: 'UPDATE_READY' }));
            }
          } else {
            await cache.put(e.request, fresh);
          }
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
