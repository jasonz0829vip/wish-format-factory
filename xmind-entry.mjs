import { parseXmind8Xml, parseXmind2020Json } from '@ljheee/xmind-parser';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
const clean=t=>String(t??'（未命名）').replace(/[\r\n\t]+/g,' ').replace(/[<>]/g,'').replace(/\s+/g,' ').trim()||'（未命名）';
function buildMarkdown(sheets){
 let md='',total=0;
 function walk(node,level){
  total++;if(total>600)throw new Error('思维导图超过 600 个主题，本版图片渲染有容量限制；请先拆分工作表。');
  md+=' '.repeat(Math.max(0,level)*2)+'- '+clean(node.data?.text)+'\n';
  for(const c of node.children||[])walk(c,level+1);
 }
 for(const s of sheets){
  md+='# '+clean(s.title||s.root?.data?.text)+'\n\n';
  if(s.root)walk(s.root,0);
  md+='\n';
 }
 if(!total)throw new Error('没有在 XMind 文件中找到主题');
 return md;
}
async function mapToSvg(markdown){
 const tr=new Transformer();
 const {root}=tr.transform(markdown);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
 svg.setAttribute('width','1600');
 svg.setAttribute('height','960');
 svg.style.cssText='position:fixed;left:-100000px;top:-100000px;width:1600px;height:960px;visibility:hidden;';
 document.body.appendChild(svg);
 try{
  const mm=Markmap.create(svg,{duration:0,autoFit:true,fitRatio:.92,scrollForPan:false,zoom:false,pan:false,maxWidth:330},root);
  await new Promise(resolve=>setTimeout(resolve,150));
  await mm.fit();
  await new Promise(resolve=>setTimeout(resolve,120));
  const clone=svg.cloneNode(true);
  clone.setAttribute('width','1600');clone.setAttribute('height','960');
  clone.setAttribute('viewBox','0 0 1600 960');
  clone.removeAttribute('style');
  // Markmap uses HTML foreignObject to lay out nodes; rasterising such SVG taints
  // canvas on browsers. Replace only label surfaces with native SVG text nodes.
  for(const block of clone.querySelectorAll('foreignObject')){
   const label=document.createElementNS('http://www.w3.org/2000/svg','text');
   const x=Number(block.getAttribute('x')||0)+2;
   const y=Number(block.getAttribute('y')||0)+15;
   label.setAttribute('x',String(x));label.setAttribute('y',String(y));
   label.setAttribute('font-size','16');label.setAttribute('font-family','system-ui, sans-serif');
   label.setAttribute('fill','#283346');
   label.textContent=String(block.textContent||'').replace(/\s+/g,' ').trim();
   block.replaceWith(label);
  }
  const markup=new XMLSerializer().serializeToString(clone);
  mm.destroy();
  return markup;
 }finally{svg.remove();}
}
async function imageOfSVG(markup,target){
 const svgFile=new Blob([markup],{type:'image/svg+xml;charset=utf-8'});
 if(target==='svg')return svgFile;
 const url=URL.createObjectURL(svgFile);
 try{
  const img=new Image();
  img.src=url;
  await img.decode();
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=960;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1600,960);ctx.drawImage(img,0,0,1600,960);
  const type=target==='jpg'?'image/jpeg':'image/png';
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('无法输出导图图片')),type,.92));
  if(target==='pdf'){
   const pdf=await window.PDFLib.PDFDocument.create();
   const data=await pdf.embedPng(await blob.arrayBuffer());const page=pdf.addPage([1000,600]);
   page.drawImage(data,{x:0,y:0,width:1000,height:600});
   return new Blob([await pdf.save()],{type:'application/pdf'});
  }
  if(blob.type!==type)throw new Error('图片格式不兼容');return blob;
 }finally{URL.revokeObjectURL(url);}
}
export async function convert(file,target='markdown'){
 const zip=await window.JSZip.loadAsync(await file.arrayBuffer());
 const json=zip.file('content.json');const xml=zip.file('content.xml');
 let sheets;
 if(json)sheets=parseXmind2020Json(await json.async('string'));
 else if(xml){
  const xmlText=await xml.async('string');
  sheets=await parseXmind8Xml(xmlText);
  if(!Array.isArray(sheets)||!sheets.length){
   // Native browser XML namespace handling differs from xmldom on some old XMind 8 archives.
   // Fallback is limited to the semantic topic hierarchy; rich style is not preserved.
   const doc=new DOMParser().parseFromString(xmlText,'application/xml');
   const children=(el,tag)=>Array.from(el?.children||[]).filter(x=>x.localName===tag);
   const label=el=>children(el,'title')[0]?.textContent?.trim()||'（未命名）';
   function topic(el){
    const nested=children(el,'children').flatMap(c=>children(c,'topics').flatMap(t=>children(t,'topic')));
    return {data:{text:label(el)},children:nested.map(topic)};
   }
   sheets=Array.from(doc.getElementsByTagName('*')).filter(x=>x.localName==='sheet').map(s=>({title:label(s),root:topic(children(s,'topic')[0])}));
  }
 }
 else throw new Error('这不是有效的 XMind 文件，未找到内容文件。');
 if(!Array.isArray(sheets)||!sheets.length)throw new Error('无法识别该 XMind 文件：没有工作表');
 const markdown=buildMarkdown(sheets);
 if(target==='markdown')return new Blob([markdown],{type:'text/markdown;charset=utf-8'});
 if(!['svg','png','jpg','pdf'].includes(target))throw new Error('XMind 暂未支持输出 '+target);
 const markup=await mapToSvg(markdown);
 return await imageOfSVG(markup,target);
}
