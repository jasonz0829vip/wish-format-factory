'use strict';
/* Browser contract for the Office preview bridge: simulated Windows conversion endpoint.
 * This test confirms correct routing, read-only UI, PDF header validation and input preservation.
 * It does NOT claim to test the actual Windows LibreOffice backend.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let playwright;
try{playwright=require('playwright');}catch(_){playwright=require('playwright-core');}
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
let pdfFixture=null,badResponse=false,delayMs=0,callCount=0,requestBodies=[];
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/api/convert' && req.method==='POST'){
   let chunks=[];
   req.on('data',v=>chunks.push(v));req.on('end',()=>{
     const raw=Buffer.concat(chunks).toString('utf8');requestBodies.push(raw.slice(0,1600));callCount++;
     if(!/name="target"/.test(raw)||!/\r\npdf\r\n/.test(raw)){
       res.writeHead(422,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Expected PDF target'}));return;
     }
     const buf=badResponse?Buffer.from('NOT-PDF-FAIL'):pdfFixture;
     const send=()=>{
       res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="office-preview.pdf"'});
       res.end(buf);
     };
     if(delayMs) setTimeout(send,delayMs);
     else send();
   });return;
 }
 const name=pathname==='/'?'/index.html':pathname,absolute=path.resolve(root,'.'+name);
 if(!absolute.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.createReadStream(absolute).on('error',()=>{res.writeHead(404);res.end();}).once('open',()=>{
   res.writeHead(200,{'Content-Type':mime[path.extname(absolute)]||'application/octet-stream','Cache-Control':'no-cache'});
 }).pipe(res);
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const options={headless:true,args:['--no-sandbox']};
  if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  browser=await playwright.chromium.launch(options);
  const page=await browser.newPage({viewport:{width:1200,height:830},acceptDownloads:true});
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  pdfFixture=Buffer.from(await page.evaluate(async()=>{
    const doc=await window.PDFLib.PDFDocument.create();
    const page=doc.addPage([595,842]);page.drawText('OFFICE PREVIEW READ ONLY',{x:40,y:760,size:22});
    return Array.from(await doc.save());
  }));
  assert.equal(pdfFixture.subarray(0,5).toString('ascii'),'%PDF-');
  const extList=['docx','xlsx','pptx'];
  const hashes={};
  for(const ext of extList){
    const contents=Buffer.from('isolated-ui-route-check-'+ext);
    hashes[ext]=crypto.createHash('sha256').update(contents).digest('hex');
    await page.locator('#fileInput').setInputFiles({name:'合同预览.'+ext,mimeType:'application/octet-stream',buffer:contents});
    await page.locator('.officePreviewFileButton').click();
    await page.waitForFunction(()=>{
      const d=document.getElementById('pdfPreviewDialog');
      return d.open && document.getElementById('pdfPreviewStatus').textContent.includes('不能在此修改原');
    },null,{timeout:30000});
    assert.equal(await page.locator('#pdfPreviewExtract').isDisabled(),true,'preview is read-only');
    assert.equal(await page.locator('#pdfPreviewDelete').isDisabled(),true,'preview is read-only');
    assert.match(await page.locator('#pdfPreviewFilename').textContent(),/只读预览\.pdf/);
    const onPage=await page.locator('#pdfPreviewPage').textContent();
    assert.match(onPage,/1\s*\/\s*1/);
    if(ext==='docx')await page.screenshot({path:process.env.OFFICE_PREVIEW_SCREENSHOT||path.join(process.cwd(),'office-preview-ci.png')});
    const digest=await page.evaluate(async()=>{
      const b=await files[0].arrayBuffer();
      const h=await crypto.subtle.digest('SHA-256',b);
      return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('');
    });
    assert.equal(digest,hashes[ext],'original '+ext+' modified');
    await page.locator('#pdfPreviewClose').click();
    await page.locator('#pdfPreviewDialog').waitFor({state:'hidden'});
  }
  assert.equal(callCount,3,'expected one own-Windows route call per office type');
  for(const ext of extList)assert.ok(requestBodies.some(s=>s.includes('合同预览.'+ext)),'missing upload route '+ext);
  await page.locator('#fileInput').setInputFiles({name:'unsafe.docm',mimeType:'application/octet-stream',buffer:Buffer.from('macro')});
  assert.equal(await page.locator('.officePreviewFileButton').count(),0,'macro-enabled files must never expose preview');
  assert.equal(callCount,3,'macro file unexpectedly submitted');
  // Large-file errors must be visible; they must not turn into unhandled promise rejections.
  await page.evaluate(()=>{
    const large=new File([new Uint8Array(25*1024*1024+1)],'过大文件.docx',{type:'application/octet-stream'});
    updateFiles([large]);
  });
  await page.locator('.officePreviewFileButton').click();
  await page.waitForFunction(()=>document.querySelector('#result h3')?.textContent==='Office 预览未完成');
  assert.match(await page.locator('#result').textContent(),/25MB/);
  assert.equal(callCount,3,'oversized file should never reach the backend');
  assert.equal(await page.locator('.officePreviewFileButton').isEnabled(),true,'retry remains available');

  // While the converter is busy, the selected input must stay stable.
  delayMs=1150;
  await page.locator('#fileInput').setInputFiles({name:'处理中原文.docx',mimeType:'application/octet-stream',buffer:Buffer.from('fixed-upload')});
  await page.locator('.officePreviewFileButton').click();
  await page.waitForFunction(()=>busy&&document.querySelector('.officePreviewFileButton')?.disabled===true);
  await page.locator('#fileInput').setInputFiles({name:'恶意中途替换.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('changed-upload')});
  assert.equal(await page.evaluate(()=>files[0].name),'处理中原文.docx','file list changed while preview was running');
  assert.match(await page.locator('#intentBadge').textContent(),/正在处理当前文件/);
  await page.waitForFunction(()=>document.getElementById('pdfPreviewDialog').open &&
      document.getElementById('pdfPreviewStatus').textContent.includes('不能在此修改原'),null,{timeout:30000});
  assert.equal(await page.evaluate(()=>files[0].name),'处理中原文.docx');
  assert.equal(callCount,4,'exactly one request during delayed preview');
  await page.locator('#pdfPreviewClose').click();
  await page.locator('#pdfPreviewDialog').waitFor({state:'hidden'});
  delayMs=0;

  badResponse=true;
  await page.locator('#fileInput').setInputFiles({name:'bad-server.docx',mimeType:'application/octet-stream',buffer:Buffer.from('sample')});
  await page.locator('.officePreviewFileButton').click();
  await page.waitForFunction(()=>document.getElementById('result')?.textContent.includes('返回的不是 PDF'),null,{timeout:20000});
  assert.match(await page.locator('#result').textContent(),/返回的不是 PDF/);
  assert.equal(await page.locator('#pdfPreviewDialog').getAttribute('open'),null);
  assert.deepEqual(pageErrors,[]);
  console.log(JSON.stringify({status:'PASS',oversizeRejected:true,inflightFileSwitchBlocked:true,engines:'mocked PDF conversion route + genuine PDF.js renderer',officeTypes:extList,readOnly:true,sourceUnchanged:true,macroDenied:true,invalidBackendResponseRejected:true,apiCalls:callCount,browserErrors:pageErrors.length},null,2));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error('OFFICE PREVIEW E2E FAIL:',e.stack||e);process.exitCode=1;});
