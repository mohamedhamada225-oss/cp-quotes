/* Service worker: network-first with cache fallback, so the last downloaded version works offline. */
const CACHE_NAME = 'cpq-V6.4-20261120085504';
const CORE = ['./', 'index.html', 'version.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const NET_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => Promise.all(CORE.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => r.ok && c.put(u, r)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cpq-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    fetch(request, { cache: 'no-store' }).then((resp) => { clearTimeout(timer); resolve(resp); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const resp = await fromNetwork(req);
      if (resp && resp.ok && !url.search.includes('_=')) {
        const key = req.mode === 'navigate' ? 'index.html' : req;
        cache.put(key, resp.clone());
        if (req.mode === 'navigate') cache.put('./', resp.clone());
      }
      return resp;
    } catch (e) {
      const hit = (await cache.match(req, { ignoreSearch: true })) ||
        (req.mode === 'navigate' ? (await cache.match('index.html')) || (await cache.match('./')) : null);
      if (hit) return hit;
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
