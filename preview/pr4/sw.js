const BASE=self.registration.scope;
// CacheStorage is shared by all Service Worker scopes of the same origin.
// Namespacing prevents a draft preview from evicting the production PWA.
const SCOPE_PATH=new URL(BASE).pathname;
const CACHE_PREFIX='wish-factory-'+encodeURIComponent(SCOPE_PATH)+'-static-v';
const CACHE=CACHE_PREFIX+'20';
// Production was previously using unscoped v16 caches. Migrate those only
// from the ordinary application scope, never from nested preview instances.
const LEGACY_PREFIX='wish-factory-static-v';
const MIGRATE_LEGACY=SCOPE_PATH==='/'||SCOPE_PATH==='/wish-format-factory/';
const ASSETS=['','style.css','app.js','formats.js','archive-browser.js','planner.js','pdf-extra.js','pdf-preview.js','ocr.js','manifest.webmanifest','logo.svg','apple-touch-icon.png','pwa-192.png','pwa-512.png','vendor/jszip.min.js','vendor/pdf-lib.min.js','vendor/heic2any.min.js','vendor/media-bundle.js','vendor/xmind-bundle.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs'].map(x=>new URL(x,BASE).href);
// OCR assets are lazy-cached on demand; eagerly caching 30+ MB of language data
// would make the initial PWA install unnecessarily heavy.
const OCR_ASSETS=[
 'vendor/ocr/tesseract.min.js','vendor/ocr/worker.min.js',
 'vendor/ocr/core/tesseract-core-lstm.wasm',
 'vendor/ocr/core/tesseract-core-lstm.wasm.js',
 'vendor/ocr/core/tesseract-core-simd-lstm.wasm',
 'vendor/ocr/core/tesseract-core-simd-lstm.wasm.js',
 'vendor/ocr/core/tesseract-core-simd.wasm',
 'vendor/ocr/core/tesseract-core-simd.wasm.js',
 'vendor/ocr/core/tesseract-core.wasm',
 'vendor/ocr/core/tesseract-core.wasm.js',
 'vendor/ocr/lang/eng.traineddata.gz','vendor/ocr/lang/chi_sim.traineddata.gz'
].map(x=>new URL(x,BASE).href);
// Never intercept/cache arbitrary GET responses, even from the same origin:
// shared development servers may expose user documents or other applications.
const STATIC_ALLOWLIST=new Set([...ASSETS,...OCR_ASSETS,new URL('index.html',BASE).href]);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith(CACHE_PREFIX)&&k!==CACHE)||(MIGRATE_LEGACY&&k.startsWith(LEGACY_PREFIX))).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const r=event.request;
 const url=new URL(r.url);
 if(r.method!=='GET'||url.origin!==self.location.origin)return;
 const canonical=url.origin+url.pathname;
 if(!STATIC_ALLOWLIST.has(canonical))return;
 event.respondWith(caches.match(r,{ignoreSearch:true}).then(cached=>{
  if(cached)return cached;
  return fetch(r).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(r,clone));}return resp;}).catch(()=>r.mode==='navigate'?caches.match(new URL('',BASE).href):Response.error());
 }));
});
