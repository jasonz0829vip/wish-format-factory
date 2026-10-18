'use strict';
/* Optional acceptance: load a supplied real PDF (RTX) or generate a PDF fixture (CI), then edit a deterministic 3-page PDF with bundled pdf-lib. */
const fs=require('node:fs'), path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pdf=process.argv[2];
if(pdf&&!fs.existsSync(pdf)){console.error('PDF test file not found: '+pdf);process.exit(2);}
let playwright;
try{playwright=require('playwright');}
catch(error){try{playwright=require('playwright-core');}catch(again){console.error('E2E unavailable: install/use an existing Playwright installation (not bundled).');process.exit(3);}}
const root=path.resolve(__dirname,'..');
const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const name=pathname==='/'?'/index.html':pathname;
 const absolute=path.resolve(root,'.'+name);
 if(!absolute.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.createReadStream(absolute).on('error',()=>{res.writeHead(404);res.end();}).once('open',()=>{res.writeHead(200,{'Content-Type':type[path.extname(absolute)]||'application/octet-stream','Cache-Control':'no-cache'});}).pipe(res);
});
async function run(){
 const before=pdf?crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex'):null;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const options={headless:true,args:['--no-sandbox']};
  if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  browser=await playwright.chromium.launch(options);
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900}});
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  if(pdf) await page.locator('#fileInput').setInputFiles(pdf);
  else {
    // The CI runner does not require a private Windows fixture or external download.
    const first=Buffer.from(await page.evaluate(async()=>{
      const doc=await window.PDFLib.PDFDocument.create();
      const p=doc.addPage([595,842]);p.drawText('CI initial PDF preview',{x:52,y:730,size:24});
      return Array.from(await doc.save());
    }));
    await page.locator('#fileInput').setInputFiles({name:'ci-one-page-qa.pdf',mimeType:'application/pdf',buffer:first});
  }
  await page.getByRole('button',{name:/预览.*(选页|选择页面)/}).click();
  await page.locator('#pdfPreviewCanvas').waitFor({state:'visible',timeout:25000});
  await page.waitForFunction(()=>document.getElementById('pdfPreviewCanvas').width>100&&document.getElementById('pdfPreviewStatus').textContent.includes('本机浏览器'),{timeout:30000});
  const initial=await page.locator('#pdfPreviewPage').textContent();
  const samplePages=Number((initial.match(/\/\s*(\d+)/)||[])[1]);
  assert.ok(samplePages>=1,'real PDF sample did not render: '+initial);
  console.log('REAL_PDF_PAGE_LABEL='+initial);
  await page.locator('#pdfPreviewExtract').click();
  await page.locator('#pdfPreviewDialog').waitFor({state:'hidden',timeout:20000});
  await page.locator('#result a.downloadLink').waitFor({state:'visible',timeout:20000});
  const extracted=await page.evaluate(async()=>{
    const link=document.querySelector('#result a.downloadLink');
    const blob=await (await fetch(link.href)).blob();
    const result=await window.PDFLib.PDFDocument.load(await blob.arrayBuffer());
    return {pages:result.getPageCount(),bytes:blob.size};
  });
  assert.equal(extracted.pages,1);
  const crafted=Buffer.from(await page.evaluate(async()=>{
    const doc=await window.PDFLib.PDFDocument.create();
    for(let n=1;n<=3;n++){
      const p=doc.addPage([595,842]);
      p.drawText('Local preview acceptance page '+n,{x:48,y:760,size:23});
    }
    return Array.from(await doc.save());
  }));
  await page.locator('#fileInput').setInputFiles({name:'local-three-page-qa.pdf',mimeType:'application/pdf',buffer:crafted});
  await page.locator('.pdfPreviewFileButton').click();
  await page.waitForFunction(()=>{
    const label=document.getElementById('pdfPreviewPage').textContent;
    const status=document.getElementById('pdfPreviewStatus').textContent;
    return label.includes('/ 3 ')&&status.includes('本机浏览器');
  },null,{timeout:30000});
  const total=3;
  await page.locator('#pdfPreviewNext').click();
  await page.waitForFunction(()=>document.getElementById('pdfPreviewPage').textContent.startsWith('第 2 /'));
  await page.locator('#pdfPreviewZoomIn').click();
  await page.waitForFunction(()=>document.getElementById('pdfPreviewZoomValue').textContent==='120%'&&document.getElementById('pdfPreviewStatus').textContent.includes('本机浏览器'),null,{timeout:30000});
  await page.screenshot({path:process.env.PREVIEW_SCREENSHOT||path.join(process.cwd(),'pdf-preview-acceptance.png')});
  await page.locator('#pdfPreviewDelete').click();
  await page.waitForFunction(()=>document.querySelector('#result a.downloadLink')?.download.includes('删除指定页'),null,{timeout:20000});
  const details=await page.evaluate(async()=>{
    const link=document.querySelector('#result a.downloadLink');
    const blob=await (await fetch(link.href)).blob();
    const result=await window.PDFLib.PDFDocument.load(await blob.arrayBuffer());
    return {name:link.download,bytes:blob.size,pages:result.getPageCount()};
  });
  assert.equal(details.pages,total-1);
  assert.ok(details.bytes>100);
  // Damaged or oversized PDF must fail visibly without creating a corrupt download.
  await page.locator('#fileInput').setInputFiles({name:'damaged.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid pdf contents')});
  await page.locator('.pdfPreviewFileButton').click();
  await page.waitForFunction(()=>document.getElementById('pdfPreviewStatus').textContent.includes('无法预览此 PDF'),null,{timeout:20000});
  assert.equal(await page.locator('#pdfPreviewExtract').isDisabled(),true);
  assert.equal(await page.locator('#pdfPreviewDelete').isDisabled(),true);
  await page.locator('#pdfPreviewClose').click();
  await page.locator('#pdfPreviewDialog').waitFor({state:'hidden'});
  await page.evaluate(async()=>{
    await window.WishPdfPreview.open({name:'oversized.pdf',size:51*1024*1024,arrayBuffer(){throw new Error('oversized input must not be read');}},{});
  });
  await page.waitForFunction(()=>document.getElementById('pdfPreviewStatus').textContent.includes('50MB'));
  assert.equal(await page.locator('#pdfPreviewExtract').isDisabled(),true);
  await page.locator('#pdfPreviewClose').click();
  await page.locator('#pdfPreviewDialog').waitFor({state:'hidden'});
  assert.ok(!failures.length,'Browser JS errors: '+failures.join('; '));
  const after=pdf?crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex'):null;
  if(pdf) assert.equal(after,before,'original PDF must remain unchanged');
  console.log(JSON.stringify({status:'PASS',realSamplePages:samplePages,extractedPages:extracted.pages,originalPages:total,editedPages:details.pages,download:details.name,bytes:details.bytes,originalUnchanged:pdf?(before===after):'generated in browser',damagedRejected:true,oversizedRejected:true,browserErrors:failures},null,2));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error('E2E FAIL:',error.stack||error);server.close();process.exitCode=1;});
