const CACHE='rono-offline-shell-v20-exam-levels';
const SHELL=['/','/offline-client.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  const isShell=url.origin===self.location.origin && (request.mode==='navigate'||SHELL.includes(url.pathname));
  const asset=['cdn.tailwindcss.com','cdnjs.cloudflare.com','cdn.jsdelivr.net'].includes(url.hostname);
  if(!isShell&&!asset)return;
  event.respondWith(fetch(request).then(response=>{if(response.ok||response.type==='opaque'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}return response;}).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(request)||(request.mode==='navigate'?await cache.match('/'):null)||Response.error();}));
});
