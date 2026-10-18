'use strict';
/* Headless Chromium: miniPaint loads fully local, edits pixels, exports PNG, then opens offline. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
let playwright;
try {playwright=require('playwright');} catch (_) {playwright=require('playwright-core');}
const root=path.resolve(__dirname,'..');
const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const name=pathname==='/'?'/index.html':pathname,absolute=path.resolve(root,'.'+name);
 if(!absolute.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.createReadStream(absolute).on('error',()=>{res.writeHead(404);res.end();}).once('open',()=>{res.writeHead(200,{'Content-Type':type[path.extname(absolute)]||'application/octet-stream','Cache-Control':'no-cache'});}).pipe(res);
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser=null;
 try{
  const options={headless:true,args:['--no-sandbox']};
  if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  browser=await playwright.chromium.launch(options);
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1366,height:900}});
  const page=await context.newPage();
  const errors=[],external=[],httpErrors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',req=>{const url=req.url();if(/^https?:/i.test(url)&&new URL(url).hostname!=='127.0.0.1')external.push(url);});
  page.on('response',res=>{if(res.status()>=400)httpErrors.push(res.status()+' '+res.url());});
  const address='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(address,{waitUntil:'domcontentloaded'});
  const original=Buffer.from(await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=120;c.height=80;
    const ctx=c.getContext('2d');ctx.fillStyle='#1260e4';ctx.fillRect(0,0,120,80);
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }));
  const openInput=()=>page.locator('#fileInput').setInputFiles({name:'测试照片.jpg.png',mimeType:'image/png',buffer:original});
  await openInput();
  const originalDigest=await page.evaluate(async()=>{
    // App copies the selected File into its own array, then clears the native input.
    const hash=await crypto.subtle.digest('SHA-256',await files[0].arrayBuffer());
    return Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');
  });
  await page.locator('.imageEditorFileButton').click();
  await page.waitForFunction(()=>{
    const el=document.getElementById('imageEditorStatus');
    return el&&el.textContent.includes('已加载')&&document.getElementById('imageEditorSave').disabled===false;
  },null,{timeout:45000});
  const initial=await page.evaluate(()=>{
    const w=document.getElementById('imageEditorFrame').contentWindow;
    return {layers:w.Layers.get_layers().length,dimensions:w.Layers.get_dimensions(),editorLoaded:!!w.Layers};
  });
  assert.equal(initial.editorLoaded,true);
  assert.ok(initial.layers>=1);
  assert.equal(initial.dimensions.width,120);
  assert.equal(initial.dimensions.height,80);
  await page.evaluate(async()=>{
    const w=document.getElementById('imageEditorFrame').contentWindow;
    const c=w.document.createElement('canvas');c.width=20;c.height=20;
    const ctx=c.getContext('2d');ctx.fillStyle='#f90000';ctx.fillRect(0,0,20,20);
    await w.Layers.insert({name:'QA red overlay',type:'image',data:c.toDataURL('image/png'),x:0,y:0,width:20,height:20});
  });
  await page.screenshot({path:process.env.IMAGE_EDITOR_SCREENSHOT||path.join(process.cwd(),'image-editor-ci.png')});
  await page.locator('#imageEditorSave').click();
  await page.waitForFunction(()=>document.querySelector('#result a.downloadLink')?.download.endsWith('-已编辑.png'),null,{timeout:25000});
  const exported=await page.evaluate(async()=>{
    const a=document.querySelector('#result a.downloadLink');
    const blob=await(await fetch(a.href)).blob();
    const bitmap=await createImageBitmap(blob);
    const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
    const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);
    return {name:a.download,mime:blob.type,bytes:blob.size,width:bitmap.width,height:bitmap.height,pixel:Array.from(ctx.getImageData(8,8,1,1).data)};
  });
  assert.equal(exported.mime,'image/png');assert.equal(exported.width,120);assert.equal(exported.height,80);
  assert.ok(exported.bytes>150);
  assert.ok(exported.pixel[0]>=220&&exported.pixel[1]<90&&exported.pixel[2]<90,'edited red pixel not found');
  const afterDigest=await page.evaluate(async()=>{
    // App copies the selected File into its own array, then clears the native input.
    const hash=await crypto.subtle.digest('SHA-256',await files[0].arrayBuffer());
    return Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');
  });
  assert.equal(afterDigest,originalDigest,'uploaded original image changed');
  const offlineReady=await page.evaluate(async()=>{
    const limit=new Promise((_,reject)=>setTimeout(()=>reject(new Error('SW offline precache timeout')),30000));
    return Promise.race([navigator.serviceWorker.ready.then(async()=>{
      const index=await caches.match(new URL('image-editor/index.html',document.baseURI));
      const bundle=await caches.match(new URL('image-editor/dist/bundle.js',document.baseURI));
      const icon=await caches.match(new URL('image-editor/images/icons/brush.svg',document.baseURI));
      return !!index&&!!bundle&&!!icon;
    }),limit]);
  });
  assert.ok(offlineReady,'miniPaint editor is not cached offline');
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:25000});
  await openInput();
  await page.locator('.imageEditorFileButton').click();
  await page.waitForFunction(()=>document.getElementById('imageEditorStatus')?.textContent.includes('已加载'),null,{timeout:30000});
  assert.equal(await page.locator('#imageEditorSave').isEnabled(),true);
  assert.deepEqual(external,[],'unexpected network outside localhost');
  assert.deepEqual(httpErrors,[],'local editor assets returned error');
  assert.deepEqual(errors,[],'browser JavaScript exception');
  console.log(JSON.stringify({status:'PASS',editor:'miniPaint v4.14.3',originalSize:original.length,initial,edited:exported,originalUnchanged:true,offlineOpen:true,externalRequests:external.length,httpErrors:0,browserErrors:0},null,2));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error('IMAGE E2E FAIL:',error.stack||error);process.exitCode=1;});
