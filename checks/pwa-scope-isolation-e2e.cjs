'use strict';
/* Real Chromium acceptance for production and nested PR preview on one origin.
 * No deployment, no external requests and no shared user documents.
 */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
let playwright;
try{playwright=require('playwright');}catch(_){playwright=require('playwright-core');}
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript',
 '.mjs':'text/javascript','.json':'application/json',
 '.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png',
 '.jpg':'image/jpeg','.wasm':'application/wasm'};
const prod='/wish-format-factory/';
const preview=prod+'preview/pr4/';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const p=decodeURIComponent(url.pathname);
 let file;
 if(p.startsWith(preview))file=p.slice(preview.length);
 else if(p.startsWith(prod))file=p.slice(prod.length);
 else{res.writeHead(404);res.end();return;}
 const target=path.resolve(root,file||'index.html');
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.createReadStream(target).on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end();})
  .once('open',()=>res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'}))
  .pipe(res);
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const options={headless:true,args:['--no-sandbox']};
  if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  browser=await playwright.chromium.launch(options);
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const errors=[];
  const makePage=async(url,workerPath)=>{
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(expected=>
    navigator.serviceWorker.controller?.scriptURL.endsWith(expected),
    workerPath,{timeout:35000});
   return page;
  };
  const host='http://127.0.0.1:'+server.address().port;
  const production=await makePage(host+prod,prod+'sw.js');
  const prodPrefix='wish-factory-'+encodeURIComponent(prod)+'-static-v';
  const prevPrefix='wish-factory-'+encodeURIComponent(preview)+'-static-v';
  await production.evaluate(async({prevPrefix,prodPrefix})=>{
   await caches.open(prevPrefix+'19');
   await caches.open('unrelated-private-docs-v1');
   await caches.open('wish-factory-static-v16');
   await caches.open(prodPrefix+'19');
  },{prevPrefix,prodPrefix});
  const draft=await makePage(host+preview,preview+'sw.js');
  let keys=await draft.evaluate(()=>caches.keys());
  assert.ok(keys.includes(prodPrefix+'20'),'production cache missing');
  assert.ok(keys.includes(prevPrefix+'20'),'draft cache missing');
  assert.ok(!keys.includes(prevPrefix+'19'),'draft old cache not cleaned');
  assert.ok(keys.includes(prodPrefix+'19'),'draft must not delete production old cache');
  assert.ok(keys.includes('wish-factory-static-v16'),'draft must not delete legacy main cache');
  assert.ok(keys.includes('unrelated-private-docs-v1'),'draft deleted another app cache');
  const ready=await draft.evaluate(async()=>{
   const scope=new URL('./',document.baseURI).pathname;
   const key='wish-factory-'+encodeURIComponent(scope)+'-static-v20';
   const c=await caches.open(key);
   return ['','app.js','pdf-preview.js','vendor/pdf.min.mjs'].every(Boolean)
     && !!(await c.match(new URL('./pdf-preview.js',document.baseURI)))
     && !!(await c.match(new URL('./vendor/pdf.min.mjs',document.baseURI)));
  });
  assert.ok(ready,'draft own cache not ready');
  await context.setOffline(true);
  await draft.reload({waitUntil:'domcontentloaded',timeout:30000});
  await production.reload({waitUntil:'domcontentloaded',timeout:30000});
  assert.ok(await draft.evaluate(()=>!!window.WishPdfPreview),'draft offline PDF preview unavailable');
  assert.ok(await production.evaluate(()=>!!window.WishPdfPreview),'production-path offline PDF preview unavailable');
  keys=await draft.evaluate(()=>caches.keys());
  assert.ok(keys.includes(prodPrefix+'20')&&keys.includes(prevPrefix+'20'));
  assert.deepEqual(errors,[],'JS errors during scope tests');
  console.log(JSON.stringify({
   status:'PASS',realServiceWorkers:2,sharedOrigin:true,
   isolatedCaches:true,productionCachePreserved:true,
   previewOldCacheRemoved:true,otherAppCachePreserved:true,
   productionOfflineReload:true,previewOfflineReload:true,
   browserErrors:errors.length
  },null,2));
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(e=>{console.error('SCOPE ISOLATION FAIL:',e.stack||e);process.exitCode=1;});
