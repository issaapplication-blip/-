/* ==========================================================
   RAFIQ | رفيق — Service Worker
   Required for the install button to appear.
   ========================================================== */
self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

var CACHE = "rafig-v85-20261029";
var ASSETS = [
  "/",
  "/index.html",
  "/offline.html",
  "/404.html",
  "/complete.html",
  "/privacy.html",
  "/terms.html",
  "/consent.html",
  "/barcode.html",
  "/app.html",
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
  "/manifest.json",
  "/install-app.js",
  "/install-pwa.js",
  "/site-menu.js",
  "/cv-payment-gate.js",
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
      // Remove only RAFIQ-owned caches. Never clear unrelated apps on this origin.
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && /^(rafig|rafiq)-/i.test(k)) return caches.delete(k);
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

  // Never cache API responses or private/admin surfaces.
  if (url.pathname.indexOf("/api/") === 0) return;
  var privatePath = /^\/(?:admin(?:\.html|\/|\.js)?|agent\.html|dashboard\.html)(?:$|\/)/i.test(url.pathname);

  if (req.mode === "navigate") {
    if (privatePath) {
      e.respondWith(fetch(req, { cache: "no-store" }).catch(function () {
        return new Response("RAFIQ is temporarily unavailable. Please reconnect to access this page.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      }));
      return;
    }
    e.respondWith(
      fetch(req, { cache: "no-store" }).catch(function () {
        return caches.match("/offline.html").then(function (offline) {
          if (offline) return offline;
          return caches.match("/index.html").then(function (c) {
            return c || new Response(
              "RAFIQ is temporarily unavailable. Please refresh in a moment.",
              { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
            );
          });
        });
      })
    );
    return;
  }

  // Never cache scripts or responses used by private/admin screens.
  if (privatePath) return;

  e.respondWith(
    fetch(req, { cache: "no-store" }).then(function (res) {
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
