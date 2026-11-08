// Service worker: makes Lift Log work with no signal.
// Bump VERSION whenever you change any file, so phones pick up the update.
const VERSION = 'v6';
const CACHE = `liftlog-${VERSION}`;
// Exercise photos live in their own cache that survives app updates, so they're only downloaded once.
const PHOTOS = 'liftlog-photos-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './plans.js',
  './howto.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version gets fresh files.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('liftlog-') && k !== CACHE && k !== PHOTOS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/img/ex/')) {
    event.respondWith(caches.open(PHOTOS).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // App files: serve from cache straight away (fast + offline), refresh the cache in the background.
  const key = req.mode === 'navigate' ? './index.html' : req;
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req)
        .then(res => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    })
  );
});
