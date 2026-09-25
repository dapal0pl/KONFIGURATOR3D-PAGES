const APP_CACHE = "konfigurator3d-app-v6";
const MODEL_CACHE = "konfigurator3d-models-v3";
const OWNED_CACHE_PREFIX = "konfigurator3d-";
const ACTIVE_CACHES = new Set([APP_CACHE, MODEL_CACHE]);
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/model-catalog.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith(OWNED_CACHE_PREFIX) && !ACTIVE_CACHES.has(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/models/")) {
    event.respondWith(
      caches.open(MODEL_CACHE).then(async (cache) => {
        const cached = event.request.cache === "reload" ? undefined : await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/index.html")));
    return;
  }

  event.respondWith(
    caches.open(APP_CACHE).then(async (cache) => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw error;
      }
    }),
  );
});
