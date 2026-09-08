const CACHE = "rafig-v7-final-logo-20260908";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/rafig-logo.svg",
  "/rafig-final-logo-20260908.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const refreshPath =
    url.pathname === "/" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".svg");

  event.respondWith(
    fetch(event.request, { cache: refreshPath ? "no-store" : "default" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
