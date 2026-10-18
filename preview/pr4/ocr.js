/* v0.6 离线 OCR：Tesseract.js + 中文/英文 fast training data，全部同源加载 */
(function(){
'use strict';
let jsPromise=null,pdfPromise=null;
const url=s=>new URL(s,document.baseURI).href;
function ensureEngine(){
 if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
 if(jsPromise)return jsPromise;
 jsPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=url('vendor/ocr/tesseract.min.js');script.async=true;
  script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(new Error('OCR 加载失败：缺少本地 Tesseract 引擎'));
  script.onerror=()=>reject(new Error('OCR 识别组件尚未安装。请先联网使用一次 OCR，让浏览器缓存离线模型后再断网。'));
  document.head.append(script);
 }).catch(e=>{jsPromise=null;throw e;});
 return jsPromise;
}
function pdfjs(){
 if(!pdfPromise)pdfPromise=import(url('vendor/pdf.min.mjs')).then(mod=>{
  mod.GlobalWorkerOptions.workerSrc=url('vendor/pdf.worker.min.mjs');return mod;
 });
 return pdfPromise;
}
const notify=(callback,message)=>{if(callback)callback(message);};
async function newWorker(callback){
 const tess=await ensureEngine();
 try{
  return await tess.createWorker(['eng','chi_sim'],1,{
   workerPath:url('vendor/ocr/worker.min.js'),
   corePath:url('vendor/ocr/core/'),
   langPath:url('vendor/ocr/lang'),
   workerBlobURL:false,
   logger:e=>{if(e.status&&['loading language traineddata','initializing api','recognizing text'].includes(e.status))notify(callback,'OCR '+e.status+' '+Math.round((e.progress||0)*100)+'%');}
  });
 }catch(e){
  throw new Error('离线 OCR 初始化失败：'+String(e?.message||e)+'. 首次安装需要联网加载约 33MB OCR 资源。');
 }
}
function resultBlob(text,basename,target,single){
 if(!text.trim())throw new Error('OCR 没有识别出可读文字，建议使用更清晰的扫描图片。');
 const name=basename+(single?'-识别文字':'-OCR文字')+'.'+(target==='markdown'?'md':'txt');
 return {name,blob:new Blob([target==='txt'?'\uFEFF':'',text],{type:'text/plain;charset=utf-8'})};
}
async function recognizeImage(file,basename,target,status){
 if(!['txt','markdown'].includes(target))throw new Error('OCR 暂只能输出 TXT 或 Markdown。');
 notify(status,'准备离线中文＋英文 OCR 引擎…');
 const worker=await newWorker(status);
 try{
  notify(status,'正在识别图片文字…');
  const o=await worker.recognize(file);
  const text=String(o.data?.text||'').trim();
  if(!text)throw new Error('OCR 没有识别出文字，建议提高图片清晰度或对比度。');
  return resultBlob((target==='markdown'?'# '+basename+'\n\n':'')+text+'\n',basename,target,true);
 }finally{await worker.terminate();}
}
async function recognizePdf(file,pages=[],basename,target,status){
 if(!['txt','markdown'].includes(target))throw new Error('OCR 暂只能输出 TXT 或 Markdown。');
 notify(status,'读取扫描版 PDF…');
 const pdfModule=await pdfjs();
 const doc=await pdfModule.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,isEvalSupported:false}).promise;
 let worker;
 try{
  const pageList=pages.length?pages:Array.from({length:doc.numPages},(_,i)=>i+1);
  if(pageList.length>12)throw new Error('为保护手机内存，一次最多识别 12 页扫描 PDF，请先指定页面范围。');
  if(pageList.some(n=>!Number.isInteger(n)||n<1||n>doc.numPages))throw new Error('PDF 只有 '+doc.numPages+' 页，所选页码不存在。');
  worker=await newWorker(status);
  const texts=[];let recognized=0;
  for(const [i,n] of pageList.entries()){
   notify(status,'正在扫描识别第 '+n+' 页（'+(i+1)+'/'+pageList.length+'）…');
   const page=await doc.getPage(n);const a=page.getViewport({scale:1});
   const scale=Math.min(2.2,1850/Math.max(a.width,a.height),Math.sqrt(2600000/(a.width*a.height)));
   const vp=page.getViewport({scale:Math.max(.4,scale)});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
   const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('此设备图像内存不足，无法识别这一页。');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   await page.render({canvasContext:ctx,viewport:vp,background:'white'}).promise;
   const r=await worker.recognize(canvas);
   const content=String(r?.data?.text||'').trim();
   if(content)recognized++;
   texts.push((target==='markdown'?'## 第 '+n+' 页':'----- 第 '+n+' 页 -----')+'\n\n'+(content||'[这一页没有识别出文字]'));
   canvas.width=1;canvas.height=1;page.cleanup();
  }
  if(recognized===0)throw new Error('所有选定页面都没有识别出可读文字，请检查文件是否为空白或过于模糊。');
  return resultBlob(texts.join('\n\n')+'\n',basename,target,pageList.length===1);
 }finally{if(worker)await worker.terminate().catch(()=>{});await doc.destroy();}
}
window.WishOCR={recognizePdf,recognizeImage};
})();
