const CACHE="rafig-v28-stable-shell";
const APP_SHELL=["/","/manifest.webmanifest","/cv-payment-gate.js","/ui-cleanup.js","/install-pwa.js","/rafig-approved-logo.svg","/rafig-approved-logo.jpg","/rafig-approved-logo-192.jpg","/rafig-approved-logo-512.jpg"];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(APP_SHELL).catch(()=>{}))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  const navigation=url.pathname==="/"||url.pathname==="/index.html";
  const fresh=["/","/index.html","/manifest.webmanifest","/cv-payment-gate.js","/ui-cleanup.js","/install-pwa.js","/rafig-approved-logo.svg","/rafig-approved-logo.jpg","/rafig-approved-logo-192.jpg","/rafig-approved-logo-512.jpg"].includes(url.pathname);

  event.respondWith(
    fetch(event.request,{cache:fresh?"no-store":"default"})
      .then(async response=>{
        if(response.ok){
          const cache=await caches.open(CACHE);
          await cache.put(event.request,response.clone()).catch(()=>{});
        }

        if(navigation){
          const html=await response.text();
          let out=html;
          if(!out.includes('src="/cv-payment-gate.js')) out=out.replace('</body>','<script src="/cv-payment-gate.js?v=23"></script></body>');
          if(!out.includes('src="/ui-cleanup.js')) out=out.replace('</body>','<script src="/ui-cleanup.js?v=28"></script></body>');
          if(!out.includes('src="/install-pwa.js')) out=out.replace('</body>','<script src="/install-pwa.js?v=18"></script></body>');
          return new Response(out,{status:response.status,statusText:response.statusText,headers:response.headers});
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(event.request);
        if(cached) return cached;
        if(navigation){
          const shell=await caches.match("/");
          if(shell) return shell;
        }
        return new Response("Service temporarily unavailable",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
      })
  );
});
