const APP_CACHE = "konfigurator3d-app-v8";
const APP_CACHE_PREFIX = "konfigurator3d-app-";
const LEGACY_MODEL_CACHE = "konfigurator3d-models-v3";
const MODEL_CACHE_PREFIX = "konfigurator3d-models-generation-";
const CATALOG_METADATA_CACHE = "konfigurator3d-model-catalog-metadata-v1";
const CATALOG_READY_PATH = "/__konfigurator3d-model-catalog-ready__";
const ACTIVE_CATALOG_PATH = "/__konfigurator3d-active-model-catalog__";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/model-catalog.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== APP_CACHE)
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
      event.request.cache === "reload"
        ? fetch(event.request)
        : findReadyModelResponse(event.request).then((cached) => cached ?? fetch(event.request)),
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

async function findReadyModelResponse(request) {
  const metadata = await caches.open(CATALOG_METADATA_CACHE);
  const activeResponse = await metadata.match(ACTIVE_CATALOG_PATH);
  if (activeResponse) {
    try {
      const receipt = await activeResponse.json();
      const cacheNames = await caches.keys();
      if (typeof receipt.cacheName === "string" && receipt.cacheName.startsWith(MODEL_CACHE_PREFIX) && cacheNames.includes(receipt.cacheName)) {
        const cache = await caches.open(receipt.cacheName);
        const readyResponse = await cache.match(CATALOG_READY_PATH);
        const ready = readyResponse ? await readyResponse.json() : null;
        if (ready?.catalogVersion === receipt.catalogVersion && ready?.signature === receipt.catalogSignature) {
          const cached = await cache.match(request);
          if (cached) return cached;
        }
      }
    } catch {
      // Uszkodzony wskaźnik nie aktywuje niezweryfikowanej generacji.
    }
  }

  return caches.open(LEGACY_MODEL_CACHE).then((cache) => cache.match(request));
}
