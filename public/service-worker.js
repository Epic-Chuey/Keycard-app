// Minimal app-shell cache so Chrome/Safari consider this an installable PWA.
// Firestore data itself is fetched live (not cached here) so the dashboard
// is never stale.

const CACHE_NAME = "keycard-app-shell-v1";
const SHELL_FILES = ["/", "/index.html", "/app.js", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for everything so data/API calls are never served stale;
  // falls back to the cached shell only when offline.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
