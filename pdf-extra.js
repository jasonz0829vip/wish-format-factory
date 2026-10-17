/* PDF 页操作与图片输出，依赖离线缓存的 pdf-lib + pdfjs-dist。 */
(function(){
'use strict';
let pdfJsPromise;
function pdfjs(){
 if(!pdfJsPromise)pdfJsPromise=import('./vendor/pdf.min.mjs').then(mod=>{
  mod.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',document.baseURI).href;
  return mod;
 });
 return pdfJsPromise;
}
async function countPages(file){
 const mod=await pdfjs();const bytes=new Uint8Array(await file.arrayBuffer());
 const task=mod.getDocument({data:bytes,useSystemFonts:true});const doc=await task.promise;const n=doc.numPages;await doc.destroy();return n;
}
async function extract(file,pages,basename,target='pdf',status){
 if(!['pdf','png','jpg','webp'].includes(target))throw new Error('不能把 PDF 页面直接导出为 '+target);
 const pageList=pages&&pages.length?pages:[];
 if(target==='pdf'){
  if(!window.PDFLib)throw new Error('PDF 组件未加载');
  const input=await window.PDFLib.PDFDocument.load(await file.arrayBuffer());
  const count=input.getPageCount();const picks=pageList.length?pageList:Array.from({length:count},(_,i)=>i+1);
  if(picks.some(n=>n<1||n>count))throw new Error('PDF 只有 '+count+' 页，所选页码超出了范围。');
  const output=await window.PDFLib.PDFDocument.create();
  const copied=await output.copyPages(input,picks.map(n=>n-1));
  copied.forEach(p=>output.addPage(p));
  const name=pageList.length===1?basename+'-第'+picks[0]+'页.pdf':basename+'-提取页面.pdf';
  return {name,blob:new Blob([await output.save()],{type:'application/pdf'})};
 }
 const mod=await pdfjs();
 const task=mod.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true,isEvalSupported:false});
 const doc=await task.promise;
 try{
  const picks=pageList.length?pageList:Array.from({length:doc.numPages},(_,i)=>i+1);
  if(picks.length>100)throw new Error('当前单次最多导出 100 页图片，请先指定页码范围。');
  if(picks.some(n=>n<1||n>doc.numPages))throw new Error('PDF 只有 '+doc.numPages+' 页，所选页码超出范围。');
  const outputs=[];
  for(const [index,n] of picks.entries()){
   if(status)status('正在渲染第 '+n+' 页（'+(index+1)+'/'+picks.length+'）');
   const page=await doc.getPage(n);const normal=page.getViewport({scale:1});
   const width=normal.width, height=normal.height;
   const scale=Math.min(2,1800/Math.max(width,height),Math.sqrt(3e6/(width*height)));
   const viewport=page.getViewport({scale:Math.max(.2,scale)});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const ctx=canvas.getContext('2d',{alpha:target==='png'});
   if(!ctx)throw new Error('浏览器内存不足，无法渲染第 '+n+' 页');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   await page.render({canvasContext:ctx,viewport,background:'white'}).promise;
   const mime=target==='jpg'?'image/jpeg':'image/'+target;
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('编码图片失败')),mime,.9));
   if(blob.type!==mime)throw new Error('此浏览器不支持 '+target.toUpperCase()+' 图片编码');
   outputs.push({name:basename+'-第'+n+'页.'+target,blob});
   canvas.width=1;canvas.height=1;page.cleanup();
  }
  if(outputs.length===1)return outputs[0];
  if(!window.JSZip)throw new Error('ZIP 打包组件未加载');
  const zip=new window.JSZip();
  outputs.forEach(({name,blob})=>zip.file(name,blob));
  return {name:basename+'-图片页面.zip',blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}})};
 }finally{await doc.destroy();}
}
window.WishPdf={countPages,extract};
})();
