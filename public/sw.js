self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting()});
const CACHE = "rafig-v49-approved-svg-20260922";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/install-pwa.js",
  "/rafig-approved-logo.svg?v=1",
  "/rafig-approved-logo-192.svg?v=1",
  "/rafig-approved-logo-512.svg?v=1",
  "/manifest.webmanifest?v=27"
];

self.addEventListener("install",e=>e.waitUntil(
  caches.open(CACHE)
    .then(c=>c.addAll(APP_SHELL))
    .then(()=>self.skipWaiting())
    .catch(()=>self.skipWaiting())
));

self.addEventListener("activate",e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

self.addEventListener("fetch",e=>{
  const r=e.request;
  if(r.method!=="GET")return;
  const u=new URL(r.url);
  if(u.origin!==self.location.origin)return;

  if(r.mode==="navigate"){
    e.respondWith(
      fetch(r,{cache:"no-store"}).catch(()=>
        caches.match("/").then(c=>c||new Response(
          "RAFIQ is temporarily unavailable. Please refresh in a moment.",
          {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}
        ))
      )
    );
    return;
  }

  e.respondWith(
    fetch(r,{cache:"no-store"}).then(x=>{
      if(x.ok&&APP_SHELL.includes(u.pathname+u.search)){
        const c=x.clone();
        caches.open(CACHE).then(k=>k.put(r,c)).catch(()=>{});
      }
      return x;
    }).catch(()=>
      caches.match(r).then(c=>c||new Response(
        "Resource temporarily unavailable",
        {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}
      ))
    )
  );
});
