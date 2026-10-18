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
  'wish-factory-static-v17','wish-factory-static-v18','other-project-images-v1'];
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
 assert.deepEqual(deleted,['wish-factory-static-v16','wish-factory-static-v17']);
 assert.equal(claimed,1);
 assert.ok(!deleted.includes('another-app-offline-v3'));
 assert.ok(!deleted.includes('other-project-images-v1'));
 assert.ok(!deleted.includes('wish-factory-static-v18'));
});
