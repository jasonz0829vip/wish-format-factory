'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('Service Worker activation must delete only old format-factory cache versions',async()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../sw.js'),'utf8');
 const handlers={};
 const deleted=[];
 let claimed=0, awaited;
 const cacheKeys=['another-app-offline-v3','wish-factory-static-v16',
  'wish-factory-static-v17','wish-factory-static-v18',
  'wish-factory-static-v19','other-project-images-v1'];
 const scope='https://example.test/wish-format-factory/';
 const self={
  registration:{scope},
  location:{origin:'https://example.test'},
  clients:{claim:async()=>{claimed++;}},
  addEventListener(name,fn){handlers[name]=fn;}
 };
 const caches={
  keys:async()=>cacheKeys,
  delete:async key=>{deleted.push(key);return true;}
 };
 vm.runInNewContext(source,{self,caches,URL,Promise},{timeout:1500,filename:'sw.js'});
 assert.equal(typeof handlers.activate,'function');
 handlers.activate({waitUntil(p){awaited=p;}});
 assert.ok(awaited&&typeof awaited.then==='function');
 await awaited;
 deleted.sort();
 assert.deepEqual(deleted,['wish-factory-static-v16','wish-factory-static-v17','wish-factory-static-v18']);
 assert.equal(claimed,1);
 assert.ok(!deleted.includes('another-app-offline-v3'));
 assert.ok(!deleted.includes('other-project-images-v1'));
 assert.ok(!deleted.includes('wish-factory-static-v19'));
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
