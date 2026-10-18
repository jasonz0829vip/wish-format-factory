'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Service Worker activation migrates only legacy production and current-scope old caches',async()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../sw.js'),'utf8');
 const events={};
 const path1='/wish-format-factory/';
 const scope='https://example.test'+path1;
 const mainPrefix='wish-factory-'+encodeURIComponent(path1)+'-static-v';
 const previewPrefix='wish-factory-'+encodeURIComponent('/wish-format-factory/preview/pr4/')+'-static-v';
 const oldKeys=['another-app-offline-v3','wish-factory-static-v16','wish-factory-static-v18',
   mainPrefix+'19',mainPrefix+'20',previewPrefix+'18','other-project-images-v1'];
 const deleted=[];
 const self={registration:{scope},location:{origin:'https://example.test'},
   clients:{claim:async()=>{}},addEventListener(n,f){events[n]=f;}};
 const caches={keys:async()=>oldKeys,delete:async key=>{deleted.push(key);return true;}};
 vm.runInNewContext(source,{self,caches,URL,Promise,encodeURIComponent},{timeout:1500,filename:'sw.js'});
 let pending;events.activate({waitUntil(p){pending=p;}});await pending;
 assert.deepEqual(deleted.sort(),['wish-factory-static-v16','wish-factory-static-v18',mainPrefix+'19'].sort());
 assert.ok(!deleted.includes(mainPrefix+'20'));
 assert.ok(!deleted.includes(previewPrefix+'18'));
 assert.ok(!deleted.includes('another-app-offline-v3'));
});

test('Service Worker preview scope cannot delete production, legacy or other draft caches',async()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../sw.js'),'utf8');
 const events={};
 const root='/wish-format-factory/';
 const sub='/wish-format-factory/preview/pr4/';
 const scope='https://example.test'+sub;
 const prod='wish-factory-'+encodeURIComponent(root)+'-static-v';
 const mine='wish-factory-'+encodeURIComponent(sub)+'-static-v';
 const other='wish-factory-'+encodeURIComponent('/wish-format-factory/preview/pr5/')+'-static-v';
 const keys=['wish-factory-static-v16',prod+'20',mine+'19',mine+'20',other+'19','another-app-v1'];
 const deleted=[];
 const self={registration:{scope},location:{origin:'https://example.test'},
   clients:{claim:async()=>{}},addEventListener(n,f){events[n]=f;}};
 const caches={keys:async()=>keys,delete:async key=>{deleted.push(key);return true;}};
 vm.runInNewContext(source,{self,caches,URL,Promise,encodeURIComponent},{timeout:1500,filename:'sw.js'});
 let pending;events.activate({waitUntil(p){pending=p;}});await pending;
 assert.deepEqual(deleted,[mine+'19']);
 assert.equal(deleted.includes(prod+'20'),false);
 assert.equal(deleted.includes('wish-factory-static-v16'),false);
 assert.equal(deleted.includes(other+'19'),false);
});

test('UI offline readiness inspects current scope cache, never another app or preview scope',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../app.js'),'utf8');
 assert.match(app,/const scopePath=new URL\('\.\/'\,document\.baseURI\)\.pathname/);
 assert.match(app,/const cachePrefix='wish-factory-'\+encodeURIComponent\(scopePath\)\+'-static-v'/);
 assert.doesNotMatch(app,/all\.find\(x=>x\.startsWith\('wish-factory-static-v'\)\)/);
});

test('Service Worker only intercepts approved app assets, never user files or unrelated apps',async()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../sw.js'),'utf8');
 const listeners={};
 const seen=[];
 const BASE='https://example.test/wish-format-factory/';
 const self={
  registration:{scope:BASE},
  location:{origin:'https://example.test'},
  addEventListener(name,fn){listeners[name]=fn;}
 };
 const caches={match:async request=>{seen.push(request.url);return {from:'static-cache'};}};
 vm.runInNewContext(source,{self,caches,URL,Promise},{timeout:1500,filename:'sw.js'});
 const intercepted=async(url,method='GET')=>{
  let pending=null;
  listeners.fetch({request:{url,method,mode:'same-origin'},respondWith(value){pending=value;}});
  if(pending)await pending;
  return pending!==null;
 };
 assert.equal(await intercepted(BASE+'pdf-preview.js'),true);
 assert.equal(await intercepted(BASE+'index.html'),true);
 assert.equal(await intercepted(BASE+'vendor/ocr/lang/chi_sim.traineddata.gz'),true);
 assert.equal(await intercepted(BASE+'vendor/ocr/core/tesseract-core-simd-lstm.wasm'),true);
 assert.equal(await intercepted(BASE+'api/convert'),false);
 assert.equal(await intercepted(BASE+'private-finance.pdf'),false);
 assert.equal(await intercepted(BASE+'uploaded-contract.docx'),false);
 assert.equal(await intercepted('https://example.test/another-app/config.json'),false);
 assert.equal(await intercepted('https://elsewhere.test/wish-format-factory/app.js'),false);
 assert.equal(await intercepted(BASE+'pdf-preview.js','POST'),false);
 assert.equal(seen.length,4);
});
