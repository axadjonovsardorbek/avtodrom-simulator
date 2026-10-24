// Offline cache. Models, sounds and hashed bundles never change under the same URL, so they
// are served from the cache first; the page itself is fetched from the network first so an
// update shows up on the next visit.
const CACHE = "avtodrom-v3";
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  // range requests (Safari asks for audio in pieces) go to the network: a whole cached file answered to one
  // leaves the sound silent
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  const immutable = url.origin === location.origin && /\/(models|audio|assets|icons)\/|\.mp3$/.test(url.pathname) || /fonts\.(gstatic|googleapis)\.com/.test(url.host);
  if (immutable) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.status === 200) c.put(req, res.clone()).catch(() => {});
      return res;
    }));
  } else if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; }).catch(() => caches.match(req)));
  }
});
