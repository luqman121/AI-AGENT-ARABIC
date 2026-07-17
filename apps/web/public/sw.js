/*
 * Wakil service worker — restricted allowlist cache policy (M1).
 *
 * MAY cache:    the offline fallback page and the versioned public shell
 *               assets listed below (fonts, icons).
 * NEVER caches: authenticated pages, RSC payloads, auth endpoints, server
 *               actions, API responses, project data, or anything with a
 *               query string. Offline mutations are never queued or replayed.
 */
const CACHE_VERSION = "wakil-shell-v1";
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = [
  OFFLINE_URL,
  "/fonts/cairo-arabic.woff2",
  "/fonts/cairo-latin.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableShellAsset(url) {
  return (
    url.origin === self.location.origin && url.search === "" && SHELL_ASSETS.includes(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Non-GET requests (server actions, auth posts) are never intercepted.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations are network-only; the offline fallback is the only substitute.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(CACHE_VERSION)
          .then((cache) => cache.match(OFFLINE_URL))
          .then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Only the fixed shell allowlist is served from cache.
  if (isCacheableShellAsset(url)) {
    event.respondWith(
      caches
        .open(CACHE_VERSION)
        .then((cache) => cache.match(request))
        .then((cached) => cached ?? fetch(request)),
    );
  }
  // Everything else (RSC, API, data) passes through untouched.
});
