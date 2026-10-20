// Service worker: keeps the whole app on the phone so it opens instantly and
// works with no signal. The build fills in the file list and a version hash;
// a new deploy installs a fresh cache and drops the old one. API calls are
// never cached: workout data lives in IndexedDB.
const VERSION = "3c52a2019335";
const FILES = ["/","/app/actions.js","/app/db.js","/app/exercises.js","/app/format.js","/app/haptics.js","/app/html.js","/app/icons.js","/app/keypad.js","/app/main.js","/app/model.js","/app/pages/bodyweight.js","/app/pages/history.js","/app/pages/progress.js","/app/pages/settings.js","/app/pages/split.js","/app/pages/today.js","/app/pages/workout.js","/app/picker.js","/app/plates.js","/app/router.js","/app/store.js","/app/styles.css","/app/sync.js","/app/theme.js","/app/timer.js","/app/ui.js","/icons/icon-180.png","/icons/icon-192.png","/icons/icon-512.png","/manifest.webmanifest","/vendor/@preact/signals-core/dist/signals-core.js","/vendor/@preact/signals-core/dist/signals-core.min.js","/vendor/@preact/signals-core/dist/signals-core.mjs","/vendor/@preact/signals-core/dist/signals-core.module.js","/vendor/@preact/signals/dist/signals.js","/vendor/@preact/signals/dist/signals.min.js","/vendor/@preact/signals/dist/signals.mjs","/vendor/@preact/signals/dist/signals.module.js","/vendor/@preact/signals/utils/dist/utils.js","/vendor/@preact/signals/utils/dist/utils.min.js","/vendor/@preact/signals/utils/dist/utils.mjs","/vendor/@preact/signals/utils/dist/utils.module.js","/vendor/htm/dist/htm.js","/vendor/htm/dist/htm.mjs","/vendor/htm/dist/htm.module.js","/vendor/htm/dist/htm.umd.js","/vendor/preact/compat/dist/compat.js","/vendor/preact/compat/dist/compat.mjs","/vendor/preact/compat/dist/compat.module.js","/vendor/preact/compat/dist/compat.umd.js","/vendor/preact/debug/dist/debug.js","/vendor/preact/debug/dist/debug.mjs","/vendor/preact/debug/dist/debug.module.js","/vendor/preact/debug/dist/debug.umd.js","/vendor/preact/devtools/dist/devtools.js","/vendor/preact/devtools/dist/devtools.mjs","/vendor/preact/devtools/dist/devtools.module.js","/vendor/preact/devtools/dist/devtools.umd.js","/vendor/preact/dist/preact.js","/vendor/preact/dist/preact.min.js","/vendor/preact/dist/preact.min.module.js","/vendor/preact/dist/preact.min.umd.js","/vendor/preact/dist/preact.mjs","/vendor/preact/dist/preact.module.js","/vendor/preact/dist/preact.umd.js","/vendor/preact/hooks/dist/hooks.js","/vendor/preact/hooks/dist/hooks.mjs","/vendor/preact/hooks/dist/hooks.module.js","/vendor/preact/hooks/dist/hooks.umd.js","/vendor/preact/jsx-runtime/dist/jsxRuntime.js","/vendor/preact/jsx-runtime/dist/jsxRuntime.mjs","/vendor/preact/jsx-runtime/dist/jsxRuntime.module.js","/vendor/preact/jsx-runtime/dist/jsxRuntime.umd.js","/vendor/preact/test-utils/dist/testUtils.js","/vendor/preact/test-utils/dist/testUtils.mjs","/vendor/preact/test-utils/dist/testUtils.module.js","/vendor/preact/test-utils/dist/testUtils.umd.js"];
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
