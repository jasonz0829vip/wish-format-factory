const CACHE='wish-factory-static-v8';
const BASE=self.registration.scope;
const ASSETS=['','style.css','app.js','planner.js','pdf-extra.js','manifest.webmanifest','logo.svg','apple-touch-icon.png','pwa-192.png','pwa-512.png','vendor/jszip.min.js','vendor/pdf-lib.min.js','vendor/heic2any.min.js','vendor/media-bundle.js','vendor/xmind-bundle.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs'].map(x=>new URL(x,BASE).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const r=event.request;
 if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin||new URL(r.url).pathname.includes('/api/'))return;
 event.respondWith(caches.match(r,{ignoreSearch:true}).then(cached=>{
  if(cached)return cached;
  return fetch(r).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(r,clone));}return resp;}).catch(()=>r.mode==='navigate'?caches.match(new URL('',BASE).href):Response.error());
 }));
});
