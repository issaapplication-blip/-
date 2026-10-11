/* ==========================================================
   RAFIQ | رفيق — Service Worker
   Required for the install button to appear.
   ========================================================== */
self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

var CACHE = "rafig-v84-20261010";
var ASSETS = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/barcode.html",
  "/agent.html",
  "/app.html",
  "/admin.html",
  "/faq.html",
  "/services.html",
  "/caregivers.html",
  "/regions.html",
  "/guide.html",
  "/lebanon.html",
  "/elderly-care.html",
  "/patient-care.html",
  "/home-nursing.html",
  "/physiotherapy.html",
  "/manifest.webmanifest",
  "/install-app.js",
  "/install-pwa.js",
  "/i18n.js",
  "/js/rafiq-kb.js",
  "/js/rafiq-agent.js",
  "/js/rafiq-welcome.js",
  "/js/rafig-locations.js",
  "/assets/rafig-logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache each file separately so one 404 cannot break the whole install
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  // pages: network first, cache as offline fallback
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req, { cache: "no-store" }).catch(function () {
        return caches.match("/index.html").then(function (c) {
          return c || new Response(
            "RAFIQ is temporarily unavailable. Please refresh in a moment.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
          );
        });
      })
    );
    return;
  }

  // assets: network first, cache as fallback
  // Reuse the browser HTTP cache for static images to avoid repeated full downloads.
  var isStaticImage = /\.(?:png|jpe?g|webp|svg|ico)$/i.test(url.pathname);
  e.respondWith(
    fetch(req, { cache: isStaticImage ? "default" : "no-store" }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (k) {
          return k.put(req, copy);
        }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (c) {
        return c || new Response("unavailable", { status: 503 });
      });
    })
  );
});
