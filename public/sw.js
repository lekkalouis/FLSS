const CACHE_VERSION = "flss-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const APP_SHELL = "/index.html";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/app.js",
  "/register-sw.js",
  "/pos.html",
  "/stock.html",
  "/price-manager.html",
  "/pos.js",
  "/stock.js",
  "/price-manager.js",
  "/views/flocs.js",
  "/views/flocs.css",
  "/views/stock.js",
  "/views/stock.css",
  "/views/price-manager.js",
  "/views/price-manager.css",
  "/views/pos.js",
  "/views/pos.css",
  "/views/products.js",
  "/img/logo.png",
  "/img/download.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, API_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(APP_SHELL, responseClone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match(APP_SHELL);
        })
    );
    return;
  }

  if (url.pathname.startsWith("/api/v1")) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  event.respondWith(cacheFirstStatic(request));
});

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response(JSON.stringify({ error: "Offline and no cached API response available" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
}
