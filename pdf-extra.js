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
async function resolveRequestedPages(file,requested=[],fromEnd=null){
 if(!fromEnd)return requested;
 const count=await countPages(file);
 const resolved=count-fromEnd+1;
 if(resolved<1||!Number.isInteger(resolved))throw new Error('文件只有 '+count+' 页，无法提取倒数第 '+fromEnd+' 页。');
 return [resolved];
}
async function modify(file,plan,basename,status){
 if(!window.PDFLib)throw new Error('PDF 编辑组件未加载');
 const source=await window.PDFLib.PDFDocument.load(await file.arrayBuffer());
 const pageCount=source.getPageCount();
 if(pageCount<1)throw new Error('PDF 没有页面');
 const pages=plan.fromEnd?[pageCount-plan.fromEnd+1]:(plan.pages||[]);
 if(pages.some(n=>!Number.isInteger(n)||n<1||n>pageCount))throw new Error('文件只有 '+pageCount+' 页，请检查页码。');
 const whole=Array.from({length:pageCount},(_,i)=>i+1);
 if(plan.op==='pdf_split'){
  const choices=pages.length?pages:whole;
  if(choices.length>100)throw new Error('一次最多拆分 100 页，请先选页码范围。');
  if(!window.JSZip)throw new Error('ZIP 打包组件未加载');
  const zip=new window.JSZip();
  for(const [i,n] of choices.entries()){
   if(status)status('拆分页面 '+(i+1)+'/'+choices.length+'（第 '+n+' 页）');
   const part=await window.PDFLib.PDFDocument.create();
   const [copy]=await part.copyPages(source,[n-1]);
   part.addPage(copy);
   zip.file(basename+'-第'+n+'页.pdf',await part.save());
  }
  return {name:basename+'-独立页面.zip',blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}})};
 }
 let keep=[];
 if(plan.op==='pdf_delete'){
  if(!pages.length)throw new Error('没有指定要删除的页码。');
  keep=whole.filter(n=>!pages.includes(n));
  if(!keep.length)throw new Error('不能删除全部页面；可以使用“按页拆分”单独导出。');
 }else if(plan.op==='pdf_reverse')keep=[...whole].reverse();
 else throw new Error('不认识该 PDF 修改操作');
 const result=await window.PDFLib.PDFDocument.create();
 const copied=await result.copyPages(source,keep.map(n=>n-1));
 copied.forEach(p=>result.addPage(p));
 return {name:basename+(plan.op==='pdf_delete'?'-删除指定页':'-倒序排列')+'.pdf',
   blob:new Blob([await result.save()],{type:'application/pdf'})};
}
window.WishPdf={countPages,extract,modify,resolveRequestedPages};
})();
