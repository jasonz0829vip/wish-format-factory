'use strict';
/* Optional real-browser acceptance: node checks/pdf-preview-e2e.cjs <real-multipage-pdf> */
const fs=require('node:fs'), path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const pdf=process.argv[2];
if(!pdf||!fs.existsSync(pdf)){console.error('Usage: node checks/pdf-preview-e2e.cjs <existing multi-page PDF>');process.exit(2);}
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
 const before=crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const options={headless:true,args:['--no-sandbox']};
  if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;
  browser=await playwright.chromium.launch(options);
  const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:900}});
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#fileInput').setInputFiles(pdf);
  await page.getByRole('button',{name:/预览.*(选页|选择页面)/}).click();
  await page.locator('#pdfPreviewCanvas').waitFor({state:'visible',timeout:25000});
  await page.waitForFunction(()=>document.getElementById('pdfPreviewCanvas').width>100&&document.getElementById('pdfPreviewStatus').textContent.includes('本机浏览器'),{timeout:30000});
  const initial=await page.locator('#pdfPreviewPage').textContent();
  const total=Number((initial.match(/\/\s*(\d+)/)||[])[1]);
  assert.ok(total>=2,'sample must have multiple pages');
  await page.locator('#pdfPreviewNext').click();
  await page.waitForFunction(()=>document.getElementById('pdfPreviewPage').textContent.startsWith('第 2 /'));
  await page.locator('#pdfPreviewZoomIn').click();
  await page.waitForFunction(()=>document.getElementById('pdfPreviewZoomValue').textContent==='120%');
  await page.screenshot({path:process.env.PREVIEW_SCREENSHOT||path.join(path.dirname(pdf),'pdf-preview-acceptance.png')});
  await page.locator('#pdfPreviewDelete').click();
  const link=page.locator('#result a.downloadLink');
  await link.waitFor({state:'visible',timeout:20000});
  const details=await page.evaluate(async()=>{
    const a=document.querySelector('#result a.downloadLink');
    const blob=await (await fetch(a.href)).blob();
    const pdf=await window.PDFLib.PDFDocument.load(await blob.arrayBuffer());
    return {name:a.download,bytes:blob.size,pages:pdf.getPageCount()};
  });
  assert.equal(details.pages,total-1);
  assert.ok(details.bytes>100);
  assert.ok(!failures.length,'Browser JS errors: '+failures.join('; '));
  const after=crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex');
  assert.equal(after,before,'original PDF must remain unchanged');
  console.log(JSON.stringify({status:'PASS',originalPages:total,editedPages:details.pages,download:details.name,bytes:details.bytes,originalUnchanged:true,browserErrors:failures},null,2));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error('E2E FAIL:',error.stack||error);server.close();process.exitCode=1;});
