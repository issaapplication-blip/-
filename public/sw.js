const CACHE = "rafig-v30-safe-shell";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/cv-payment-gate.js",
  "/ui-cleanup.js",
  "/install-pwa.js",
  "/rafig-approved-logo.svg",
  "/rafig-approved-logo.jpg",
  "/rafig-approved-logo-192.jpg",
  "/rafig-approved-logo-512.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation must always prefer the live server. This prevents a stale HTML shell
  // from producing the previous black-screen behavior after a deployment.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => response)
        .catch(() => caches.match("/").then(cached => cached || new Response(
          "RAFIQ is temporarily unavailable. Please refresh in a moment.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        )))
    );
    return;
  }

  // Static assets: network first, then cache fallback.
  event.respondWith(
    fetch(request, { cache: "no-store" })
      .then(response => {
        if (response.ok && APP_SHELL.includes(url.pathname)) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || new Response(
        "Resource temporarily unavailable",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      )))
  );
});
