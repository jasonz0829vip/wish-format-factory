const CACHE='wish-factory-static-v18';
const BASE=self.registration.scope;
const IMAGE_EDITOR_ASSETS=["image-editor/index.html","image-editor/dist/bundle.js","image-editor/images/favicon.png","image-editor/images/logo.svg","image-editor/images/logo-colors.png","image-editor/images/icons/animation.svg","image-editor/images/icons/arrow-down.svg","image-editor/images/icons/blur.svg","image-editor/images/icons/bold.svg","image-editor/images/icons/brush.svg","image-editor/images/icons/bulge_pinch.svg","image-editor/images/icons/clone.svg","image-editor/images/icons/crop.svg","image-editor/images/icons/delete.svg","image-editor/images/icons/desaturate.svg","image-editor/images/icons/erase.svg","image-editor/images/icons/external.png","image-editor/images/icons/fill.svg","image-editor/images/icons/gradient.png","image-editor/images/icons/grid.png","image-editor/images/icons/italic.svg","image-editor/images/icons/magic_erase.svg","image-editor/images/icons/media.svg","image-editor/images/icons/menu.svg","image-editor/images/icons/pencil.svg","image-editor/images/icons/pick_color.svg","image-editor/images/icons/refresh.svg","image-editor/images/icons/select.svg","image-editor/images/icons/selection.svg","image-editor/images/icons/shape.svg","image-editor/images/icons/sharpen.svg","image-editor/images/icons/strikethrough.svg","image-editor/images/icons/text.svg","image-editor/images/icons/underline.svg","image-editor/images/icons/undo.svg","image-editor/images/icons/view.svg"];
const ASSETS=['','style.css','app.js','formats.js','archive-browser.js','planner.js','pdf-extra.js','pdf-preview.js','ocr.js','manifest.webmanifest','logo.svg','apple-touch-icon.png','pwa-192.png','pwa-512.png','vendor/jszip.min.js','vendor/pdf-lib.min.js','vendor/heic2any.min.js','vendor/media-bundle.js','vendor/xmind-bundle.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs',...IMAGE_EDITOR_ASSETS].map(x=>new URL(x,BASE).href);
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
