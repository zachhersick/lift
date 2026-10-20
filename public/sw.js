// Service worker: keeps the whole app on the phone so it opens instantly and
// works with no signal. The build fills in the file list and a version hash;
// a new deploy installs a fresh cache and drops the old one. API calls are
// never cached: workout data lives in IndexedDB.
const VERSION = "__VERSION__";
const FILES = [/*__FILES__*/];
const CACHE = `lift-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.length ? FILES : ["/"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("lift-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(caches.match("/", { cacheName: CACHE }).then((cached) => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((cached) => cached || fetch(request)));
});
