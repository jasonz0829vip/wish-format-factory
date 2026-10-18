'use strict';
const byId = (id)=>document.getElementById(id);
const input = byId('fileInput'), wish = byId('wishInput'), runBtn=byId('runBtn');
let files=[], lastUrl=null, extraUrls=[], busy=false, currentPlan=null, choiceTarget='', choiceContext='';
const imageExt = new Set(window.WishFormats.groups.image);
const officeExt = new Set([...window.WishFormats.groups.word,...window.WishFormats.groups.sheet,...window.WishFormats.groups.slide]);
const textExt = new Set(window.WishFormats.groups.text);
const archiveExt = new Set(window.WishFormats.groups.archive);
const audioExt = new Set(window.WishFormats.groups.audio);
const videoExt = new Set(window.WishFormats.groups.video);
const mediaExt = new Set([...audioExt,...videoExt]);
const units=(n)=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B';
const ext=(f)=>String(f.name.split('.').pop()||'').toLowerCase();
const basename=(f)=>f.name.replace(/\.[^.]+$/,'');
const setStatus=(text,good)=>{byId('intentBadge').textContent=text;byId('intentBadge').classList.toggle('ready',!!good);};
function showMessage(head,desc,failed=false) {
 const box=byId('result');box.hidden=false;box.className='result'+(failed?' fail':'');box.replaceChildren();
 const h=document.createElement('h3');h.textContent=head;box.append(h);
 const p=document.createElement('p');p.textContent=desc;box.append(p);
 box.scrollIntoView({behavior:'smooth',block:'nearest'});return box;
}
function addDownload(name,blob,detail) {
 if(lastUrl)URL.revokeObjectURL(lastUrl);
 lastUrl=URL.createObjectURL(blob);
 const box=showMessage('✓ 转换成功',detail||('已生成 '+name+'，点击下载保存到设备。'));
 const a=document.createElement('a');a.className='downloadLink';a.href=lastUrl;a.download=name;a.textContent='↓ 下载 '+name;box.append(a);
 if(typeof File==='function'&&typeof navigator.canShare==='function'&&typeof navigator.share==='function'){
  try{
   const shareFile=new File([blob],name,{type:blob.type||'application/octet-stream'});
   if(navigator.canShare({files:[shareFile]})){
    const btn=document.createElement('button');btn.type='button';btn.className='downloadLink shareLink';
    btn.textContent='↗ 分享／保存到“文件”';
    btn.onclick=async()=>{
     try{await navigator.share({files:[shareFile],title:name});}
     catch(e){if(e.name!=='AbortError')showMessage('分享未完成','可直接点击上方下载链接，或在 Safari 预览页选择“分享 → 存储到文件”。',true);}
    };
    box.append(btn);
   }
  }catch(e){console.info('文件分享不可用，仍可直接下载');}
 }
 if(/iPhone|iPad|iPod/i.test(navigator.userAgent)){
  const hint=document.createElement('p');hint.className='iosSaveHint';
  hint.textContent='iPhone 提示：可使用“分享 → 存储到文件”；如果只看到预览，请点 Safari 分享按钮。';
  box.append(hint);
 }
}
function showUnpacked(items){
 const box=showMessage('✓ 已安全解压', '共 '+items.length+' 个文件。可以逐个下载，也能直接选择其中一个继续转换；原压缩包不会被修改。');
 const list=document.createElement('div');list.className='archiveFileList';
 items.forEach(({name,blob})=>{
  const row=document.createElement('div');row.className='archiveEntry';
  const label=document.createElement('span');label.className='archiveName';label.textContent=name;label.title=name;
  const url=URL.createObjectURL(blob);extraUrls.push(url);
  const link=document.createElement('a');link.href=url;link.download=name.split('/').pop();
  link.textContent='下载';link.className='archiveAction';
  const use=document.createElement('button');use.type='button';use.className='archiveAction';
  use.textContent='继续转换';use.onclick=()=>{
   const leaf=name.split('/').pop()||'文件';
   updateFiles([new File([blob],leaf,{type:blob.type||'application/octet-stream'})]);
   wish.value='';updatePlan();byId('dropZone').scrollIntoView({behavior:'smooth',block:'start'});wish.focus();
  };
  row.append(label,link,use);list.append(row);
 });
 box.append(list);
}
function errorMessage(e){const s=String(e&&e.message||e||'转换失败');return s.length>240?s.slice(0,240)+'…':s;}
/* Office 文件预览复用现有 LibreOffice→PDF 转换服务和 PDF.js 阅读器。
 * 只读预览不写回原 Office，不依赖第二套在线编辑器。
 */
async function previewOfficeFile(file,button){
 if(busy){setStatus('当前任务正在处理，请稍后再试',false);return;}
 busy=true;
 const oldLabel=button.textContent;
 button.disabled=true;
 button.textContent='正在生成预览…';
 runBtn.disabled=true;
 progress(true,'正在生成只读预览','使用已有 Windows LibreOffice 引擎，原文件不会被修改。');
 try{
  if(!file||!officeExt.has(ext(file))||!window.WishFormats.canConvert(file.name,'pdf'))
   throw new Error('此 Office 格式尚未通过安全预览检查');
  if(!window.WishPdfPreview)throw new Error('本地 PDF 阅读组件没有加载');
  if(file.size>25*1024*1024)throw new Error('Office 预览目前限 25MB，请先处理较小的文档');
  const rendered=await convertByWindows({target:'pdf',source:'office',op:'office_convert'},[file]);
  if(!rendered||!rendered.blob||rendered.blob.size<8)
   throw new Error('LibreOffice 未返回有效预览文件');
  const header=new TextDecoder('ascii').decode(await rendered.blob.slice(0,5).arrayBuffer());
  if(header!=='%PDF-')throw new Error('预览生成失败：Windows 服务返回的不是 PDF');
  const preview=new File([rendered.blob],basename(file)+'-只读预览.pdf',{type:'application/pdf'});
  await window.WishPdfPreview.open(preview,{readOnlyNote:'仅供浏览：由你自己的 Windows LibreOffice 生成 PDF 预览。不能在此修改原 '+ext(file).toUpperCase()+' 文件。'});
 }catch(e){
  if(e&&e.pair)showMessage('Office 预览需要配对','请先在 Windows 电脑打开 http://127.0.0.1:8790/api/pair，完成本地转换服务配对，再重试预览。',true);
  else showMessage('Office 预览未完成',errorMessage(e),true);
 }finally{
  progress(false);
  busy=false;
  button.textContent=oldLabel;
  button.disabled=false;
  updatePlan();
 }
}
function updateFiles(next) {
 if(busy){
  input.value='';
  setStatus('正在处理当前文件，完成后才能更换',false);
  return false;
 }
 const seen=new Map();for(const f of next)seen.set(f.name+'#'+f.size+'#'+f.lastModified,f);
 files=[...seen.values()].slice(0,20);
 input.value='';const wrap=byId('filesWrap'),list=byId('fileList');list.replaceChildren();
 wrap.hidden=!files.length;byId('fileCount').textContent=files.length+' 个';
 files.forEach((f,i)=>{
  const row=document.createElement('div');row.className='filepill';
  const name=document.createElement('span');name.className='filename';name.title=f.name;name.textContent=f.name;
  const size=document.createElement('span');size.className='size';size.textContent=units(f.size);
  const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','移除 '+f.name);x.onclick=()=>updateFiles(files.filter((_,j)=>j!==i));
  if(ext(f)==='pdf'){
   const preview=document.createElement('button');preview.type='button';
   preview.className='pdfPreviewFileButton';preview.textContent='预览 / 选页';
   preview.setAttribute('aria-label','预览 '+f.name+' 并选择页面');
   preview.onclick=()=>{
    if(!window.WishPdfPreview){showMessage('预览不可用','本地 PDF 阅读组件未加载，请刷新后重试。',true);return;}
    void window.WishPdfPreview.open(f,{
     onDelete:async page=>{
      const out=await window.WishPdf.modify(f,{op:'pdf_delete',pages:[page]},basename(f));
      addDownload(out.name,out.blob,'✓ 已从 '+f.name+' 删除第 '+page+' 页，原件未改变。');
     },
     onExtract:async page=>{
      const out=await window.WishPdf.extract(f,[page],basename(f),'pdf');
      addDownload(out.name,out.blob,'✓ 已从 '+f.name+' 提取第 '+page+' 页，原件未改变。');
     }
    });
   };
   row.append(name,size,preview,x);
  }else if(officeExt.has(ext(f))&&window.WishFormats.canConvert(f.name,'pdf')){
   const preview=document.createElement('button');preview.type='button';
   preview.className='officePreviewFileButton';preview.textContent='预览文档';
   preview.setAttribute('aria-label','只读预览 '+f.name);
   preview.onclick=()=>{void previewOfficeFile(f,preview);};
   row.append(name,size,preview,x);
  }else row.append(name,size,x);
  list.append(row);
 });
 updateQuickSuggestions();updatePlan();
 return true;
}
// 泛化的操作规划见 planner.js，执行层不再维护重复的关键词列表。
function updateQuickSuggestions(){
 const buttons=[...document.querySelectorAll('.suggestions button[data-idea]')];
 const e=files.length?ext(files[0]):'',n=files.length;
 let ideas=[
  ['转成 PDF','转成 PDF'],['转成图片','转成图片'],
  ['视频提取音频','从视频提取 MP3 音频'],['提取第六页','提取第六页']
 ];
 if(e==='pdf')ideas=n>=2?[
  ['合并 PDF','把这些 PDF 合并成一份'],
  ['逐页拆成 PDF','把 PDF 每页拆成独立文件'],
  ['转成图片','把 PDF 转成图片']
 ]:[
  ['提取指定页','单独导出第六页'],
  ['删除指定页','删除第六页'],
  ['每页拆成 PDF','把 PDF 每页拆成独立文件'],
  ['页面倒序','把页面顺序倒过来'],
  ['提取最后一页','提取最后一页'],
  ['提取文字','提取文字'],
  ['表格转 Excel','把 PDF 里的表格提取成 Excel'],
  ['扫描版 OCR','识别扫描 PDF 里的文字']
 ];
 else if(archiveExt.has(e))ideas=[
  ['分类整理','按文件类型分类整理压缩包'],
  ['转换文档 PDF','把压缩包里能转换的文档批量转成 PDF，其他保留'],
  ['音视频转 MP3','把压缩包里的音视频转换成 MP3，其他保留'],
  ['解压查看','解压里面的文件']
 ];
 else if(textExt.has(e))ideas=[
  ['转 PDF','把这个文本转成 PDF'],['转 HTML','把这个文本导出成 HTML'],['转 TXT','导出成 TXT'],['转 MD','导出成 Markdown'],
  ...(e==='md'||e==='markdown'?[['转 Word','把这个 Markdown 转成 DOCX']]:[])
 ];
 else if(officeExt.has(e))ideas=[
  ['转 PDF','把这个文件转成 PDF'],
  ['另存为其他格式','把这个文件转换成其他办公格式'],
  window.WishFormats.category(e)==='word'?
   ['转 Markdown','把这个 Word 转成 Markdown']:
   window.WishFormats.category(e)==='sheet'?
    ['转 CSV','把这个 Excel 导出成 CSV']:
    ['转 ODP','把这个 PPT 转成 ODP'],
  ['单独导出第二页','把第二页单独导出'],
  ['提取最后一页','提取最后一页'],
  ['转成图片','把这个文档转成图片']
 ];
 else if(e==='xmind')ideas=[
  ['转成图片','把思维导图转成图片'],
  ['导出大纲','转成 Markdown'],
  ['转成 PDF','转成 PDF']
 ];
 else if(imageExt.has(e))ideas=[
  ['转成图片','把图片转成其他图片格式'],
  ['压缩图片','把图片压缩一些'],
  ['图片识字','识别图片上的文字'],
  ['图片转 PDF',n>1?'把这些图片合成一个 PDF':'把图片转成 PDF']
 ];
 else if(videoExt.has(e))ideas=[
  ['提取音频','从视频提取 MP3 音频'],
  ['视频转 GIF','把视频转成 GIF'],
  ['视频压缩','把视频压缩成 MP4']
 ];
 else if(audioExt.has(e))ideas=[
  ['转成 MP3','转成 MP3'],
  ['转成 WAV','转成 WAV'],
  ['转成 FLAC','转成 FLAC']
 ];
 buttons.forEach((b,i)=>{
  const item=ideas[i];b.hidden=!item;
  if(item){b.textContent=item[0];b.dataset.idea=item[1];}
 });
}
function updatePlan(){
 byId('charCount').textContent=wish.value.length;
 const context=wish.value+'\n'+files.map(f=>f.name+'#'+f.size).join('|');
 if(context!==choiceContext){choiceContext=context;choiceTarget='';}
 const plan=window.WishPlanner.intent(wish.value,files,choiceTarget);currentPlan=plan;
 const node=byId('plan'),clarify=byId('clarify'),select=byId('formatChoice');node.hidden=!plan.ok;
 clarify.hidden=!plan.needsChoice;
 if(plan.needsChoice){
  byId('clarifyDesc').textContent=plan.reason;
  byId('choiceLabel').textContent=plan.kind==='page'?'你想提取哪些页？':'输出格式';
  select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='请选择输出格式';select.append(empty);
  for(const item of plan.options){const opt=document.createElement('option');opt.value=item.value;opt.textContent=item.label+(item.value===plan.recommended?' · 推荐':'');select.append(opt);}
  select.value=choiceTarget;setStatus('还需确认：请选择输出格式',false);
  if(!busy){runBtn.disabled=false;byId('runText').textContent='开始转换';}
 }else if(plan.ok){
  const hostname=location.hostname.toLowerCase();
  const hasLocalWindowsService=['localhost','127.0.0.1'].includes(hostname)||/^192\.168\./.test(hostname)||/^10\./.test(hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  const tailnetHost=location.protocol==='https:'&&hostname.endsWith('.ts.net');
  const requiresWindows=!plan.browser&&!hasLocalWindowsService&&!tailnetHost;
  byId('planTitle').textContent=plan.title;
  byId('planDetail').textContent=plan.detail+(requiresWindows?' 当前是独立网页版，尚未连接 Windows 本地转换引擎；请在 Windows 版完成此操作。':'');
  setStatus(requiresWindows?'需要 Windows 本地引擎':'✓ 已识别 '+plan.target.toUpperCase(),!requiresWindows);
  if(!busy){runBtn.disabled=requiresWindows;byId('runText').textContent=requiresWindows?'仅支持 Windows 版':'开始转换';}
 }else {setStatus(files.length?plan.reason:'等待你许愿…',false);if(!busy){runBtn.disabled=false;byId('runText').textContent='开始转换';}}
}
function progress(show,title,detail){byId('progress').hidden=!show;byId('progressTitle').textContent=title||'正在执行';byId('progressRate').textContent=show?'处理中':'';
 byId('progressDetail').textContent=detail||'';byId('progressFill').style.width=show?'62%':'0';}
async function imageBitmap(file){
 let input=file;
 try{return await createImageBitmap(input);}catch(e){
  if(['heic','heif'].includes(ext(file))&&window.heic2any){
   const converted=await window.heic2any({blob:file,toType:'image/jpeg',quality:.92});input=Array.isArray(converted)?converted[0]:converted;
   return await createImageBitmap(input);
  }
  const url=URL.createObjectURL(input);
  try {return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('此设备不能解码 '+file.name));img.src=url;});}
  finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
}
const canvasBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>{
 canvas.toBlob(b=>b?resolve(b):reject(new Error('浏览器无法编码 '+type)),type,quality);
});
async function convertImage(file,plan){
 const img=await imageBitmap(file);
 const naturalW=img.width||img.naturalWidth,naturalH=img.height||img.naturalHeight;
 if(!naturalW||!naturalH)throw new Error('无法读取图片尺寸');
 const factor=Math.min(1,8192/Math.max(naturalW,naturalH));
 const w=Math.max(1,Math.round((plan.width?Math.min(plan.width,naturalW):naturalW)*factor));
 const h=Math.max(1,Math.round(naturalH*w/naturalW));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{alpha:plan.target==='png'});
 if(!ctx)throw new Error('设备图像内存不足');
 if(plan.target==='jpg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}
 ctx.drawImage(img,0,0,w,h);if(typeof img.close==='function')img.close();
 const mime=plan.target==='jpg'?'image/jpeg':'image/'+plan.target;
 let q=plan.quality;
 let blob=await canvasBlob(canvas,mime,q);
 if(plan.maxBytes&&['jpg','webp'].includes(plan.target)){
  for(let i=0;i<5&&blob.size>plan.maxBytes;i++){q=Math.max(.15,q-.14);blob=await canvasBlob(canvas,mime,q);}
  if(blob.size>plan.maxBytes)throw new Error('无法在合理清晰度下压缩到目标大小，建议降低图片宽度');
 }
 if(blob.type!==mime)throw new Error('当前浏览器不支持编码 '+plan.target.toUpperCase());
 canvas.width=1;canvas.height=1;
 return {name:basename(file)+'.'+plan.target,blob};
}
async function bundle(entries,name) {
 if(entries.length===1)return {...entries[0]};
 if(!window.JSZip)throw new Error('本地 ZIP 组件尚未加载');
 const zip=new window.JSZip();
 entries.forEach(e=>zip.file(e.name,e.blob));
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
 return {name:name||'批量转换结果.zip',blob};
}
async function imagesToPdf(selected){
 if(!window.PDFLib)throw new Error('本地 PDF 组件尚未加载');
 const doc=await window.PDFLib.PDFDocument.create();
 for(let i=0;i<selected.length;i++){
  const image=await imageBitmap(selected[i]);const w=image.width||image.naturalWidth,h=image.height||image.naturalHeight;
  const canvas=document.createElement('canvas');canvas.width=Math.min(w,4096);
  canvas.height=Math.round(h*canvas.width/w);const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  if(image.close)image.close();
  const binary=await (await canvasBlob(canvas,'image/jpeg',.9)).arrayBuffer();
  const embedded=await doc.embedJpg(binary);const ratio=72/96;
  const p=doc.addPage([Math.max(1,embedded.width*ratio),Math.max(1,embedded.height*ratio)]);
  p.drawImage(embedded,{x:0,y:0,width:p.getWidth(),height:p.getHeight()});
 }
 return {name:selected.length===1?basename(selected[0])+'.pdf':'图片合集.pdf',blob:new Blob([await doc.save()],{type:'application/pdf'})};
}
async function mergePdfs(selected){
 if(!window.PDFLib)throw new Error('本地 PDF 组件尚未加载');
 const out=await window.PDFLib.PDFDocument.create();
 for(const file of selected){
  const loaded=await window.PDFLib.PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:false});
  const pages=await out.copyPages(loaded,loaded.getPageIndices());pages.forEach(p=>out.addPage(p));
 }
 if(out.getPageCount()===0)throw new Error('没有可合并的 PDF 页面');
 return {name:'合并结果.pdf',blob:new Blob([await out.save()],{type:'application/pdf'})};
}
async function convertInBrowser(plan){
 const outputs=[];
 if(plan.op==='archive_unpack'){
  if(!window.WishZip)throw Error('离线 ZIP 阅读器尚未就绪');
  return {unpacked:await window.WishZip.open(files[0],t=>progress(true,plan.title,t))};
 }
 if(plan.op==='pdf_text'||plan.op==='pdf_ocr'){
  const selected=await window.WishPdf.resolveRequestedPages(files[0],plan.pages||[],plan.fromEnd);
  const status=t=>progress(true,plan.title,t);
  if(plan.op==='pdf_ocr')return await window.WishOCR.recognizePdf(files[0],selected,basename(files[0]),plan.target,status);
  try{return await window.WishPdf.extractText(files[0],selected,basename(files[0]),plan.target,status);}
  catch(err){
   if(!/未发现可复制文字/.test(String(err.message||err)))throw err;
   progress(true,'检测到扫描版 PDF','正在启动离线中文＋英文 OCR，首次使用需联网下载语言包。');
   return await window.WishOCR.recognizePdf(files[0],selected,basename(files[0]),plan.target,status);
  }
 }
 if(plan.op==='image_ocr'){
  for(const [index,f] of files.entries()){
   progress(true,'正在识别图片文字','第 '+(index+1)+'/'+files.length+' 张：'+f.name);
   const res=await window.WishOCR.recognizeImage(f,basename(f),plan.target,t=>progress(true,'OCR 识别中',t));
   outputs.push(res);
  }
  return await bundle(outputs,'图片文字识别结果.zip');
 }
 if(plan.op==='pdf_pages'||plan.op==='pdf_images'){
  if(!window.WishPdf)throw new Error('PDF 页面处理模块还没加载');
  const selected=await window.WishPdf.resolveRequestedPages(files[0],plan.pages||[],plan.fromEnd);
  return await window.WishPdf.extract(files[0],selected,basename(files[0]),plan.target,t=>progress(true,plan.title,t));
 }
 if(['pdf_split','pdf_delete','pdf_reverse'].includes(plan.op)){
  if(files.length!==1)throw new Error('PDF 页面修改一次只能处理一个文件');
  return await window.WishPdf.modify(files[0],plan,basename(files[0]),t=>progress(true,plan.title,t));
 }
 if(plan.op==='xmind'){
  if(!window.WishXMind)throw new Error('离线 XMind 解析模块还没加载');
  for(const [index,f] of files.entries()){
   progress(true,'正在解析 XMind','文件 '+(index+1)+' / '+files.length+'：'+f.name);
   const blob=await window.WishXMind.convert(f,plan.target);
   outputs.push({name:basename(f)+'.'+(plan.target==='markdown'?'md':plan.target),blob});
  }
  return await bundle(outputs,'XMind 导出结果.zip');
 }
 if(plan.op==='merge_pdf')return await mergePdfs(files);
 if(plan.op==='image_pdf')return await imagesToPdf(files);
 if(plan.op==='image'){
  for(let i=0;i<files.length;i++){progress(true,'正在转换图片','正在处理 '+(i+1)+' / '+files.length+'：'+files[i].name);outputs.push(await convertImage(files[i],plan));}
  return await bundle(outputs,'批量图片转换.zip');
 }
 if(plan.op==='media_browser'){
  if(!window.WishMedia)throw new Error('离线音频模块尚未就绪，请刷新后重试');
  for(let i=0;i<files.length;i++){
   progress(true,'正在编码音频','正在处理 '+(i+1)+' / '+files.length+'：'+files[i].name);
   const b=await window.WishMedia.convert(files[i],plan.target);
   outputs.push({name:basename(files[i])+'.'+plan.target,blob:b});
  }
  return await bundle(outputs,'音频转换结果.zip');
 }
 throw new Error('此任务不能直接在浏览器离线完成');
}
async function convertByWindows(plan,selected){
 const host=location.hostname.toLowerCase();
 const isPrivate=host==='localhost'||host==='127.0.0.1'||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
 const viaPrivateTailnet=location.protocol==='https:'&&host.endsWith('.ts.net');
 if(!isPrivate&&!viaPrivateTailnet)throw new Error('当前是手机独立版：该任务需要你自己的 Windows 电脑引擎。文件不会上传给互联网网站。');
 const fd=new FormData();
 selected.forEach(f=>fd.append('files',f,f.name));fd.append('target',plan.target);
 if(['archive_convert','archive_unpack','archive_mixed'].includes(plan.op))fd.append('mode',plan.op);
 if(plan.op==='archive_mixed')fd.append('recipe',plan.recipe);
 const headers={};const code=localStorage.getItem('wish_pair')||'';
 if(code)headers['x-wish-key']=code;
 let response;
 try{response=await fetch(new URL('api/convert',document.baseURI),{method:'POST',body:fd,headers});}
 catch(e){throw new Error('Windows 本地转换服务不可访问。手机完全离线时暂时不能做 Word 转 PDF；请打开电脑或改用支持的浏览器本地格式。');}
 if(response.status===401){
  const err=new Error('请先配对运行转换器的 Windows 电脑。');err.pair=true;throw err;
 }
 if(!response.ok){let reason='未知失败';try{reason=(await response.json()).error||reason;}catch(e){}throw new Error(reason);}
 const isArchive=['archive_convert','archive_unpack','archive_mixed'].includes(plan.op);
 let name=isArchive?basename(selected[0])+'-处理结果.zip':
   selected.length>1?'批量转换结果.zip':basename(selected[0])+'.'+(plan.target==='markdown'?'md':plan.target);
 // Word with embedded images may return a ZIP holding Markdown plus media files.
 // Always follow the server-confirmed output extension; never label ZIP bytes as .md.
 const disposition=response.headers.get('content-disposition')||'';
 const utf8=disposition.match(/filename[*][ \t]*=[ \t]*UTF-8''([^;]+)/i);
 const fallback=disposition.match(/filename[ \t]*=[ \t]*"([^"]+)"/i);
 if(utf8||fallback){
  try{
   const confirmed=utf8?decodeURIComponent(utf8[1]):fallback[1];
   const actualExt=String(confirmed).split('.').pop().toLowerCase();
   if(['zip','docx','odt','rtf','doc','txt','html','xlsx','xls','ods','csv','pptx','ppt','odp','md'].includes(actualExt)){
    if(name.split('.').pop().toLowerCase()!==actualExt)name=basename(selected[0])+'.'+actualExt;
   }
  }catch(err){console.warn('File extension header unparseable');}
 }
 let detail;
 if(isArchive){
  const header=response.headers.get('X-Wish-Archive-Counts');
  try{
   if(header){
    const r=JSON.parse(decodeURIComponent(header));
    detail=(r.recipe==='balanced'?'规则：文档图片→PDF，音视频→MP3。':r.recipe==='data'?'规则：Word/PPT→PDF，Excel→CSV，图片→WebP，音视频→MP3。':'')+'压缩包包含 '+r.files+' 个文件；成功转换 '+r.converted+' 个，已是目标格式 '+r.already+
    ' 个，原样保留 '+r.retained+' 个，转换失败 '+r.failed+' 个。ZIP 内有完整转换报告，未转换的文件不会丢失。';
   }
  }catch(e){console.info('Compressed batch summary unavailable');}
 }
 const warn=response.headers.get('X-Wish-Warning');
 if(warn){
  try{detail=(detail?detail+'\n':'')+'注意：'+decodeURIComponent(warn)}
  catch(e){detail=(detail?detail+'\n':'')+'注意：此格式可能丢失部分布局、公式或样式。'}
 }
 if(!detail&&plan.target==='csv'&&plan.source==='office'){
  detail='✓ CSV 已生成。注意：CSV 只能表达单个工作表的数据，原工作簿的其他工作表、公式和样式不会完整保留，请留存原文件。';
 }
 if(!detail&&plan.op==='pdf_tables_to_xlsx'){
  detail='✓ 已生成可编辑 Excel。仅提取识别出的 PDF 表格，其他内容与原排版不保留；请核对金额、日期和行列。';
 }
 if(!detail&&plan.op==='pdf_to_docx'){
  detail='✓ 已生成可编辑 DOCX。PDF 反向重建可能改变图表、字体、表格及分页，请人工核对。';
 }
 if(!detail&&name.toLowerCase().endsWith('.zip')&&['markdown','html'].includes(plan.target)){
  detail='✓ 已完整打包：文档文字和伴随图片在同一个 ZIP 中，请一并解压使用，避免图片丢失。';
 }
 return {name,blob:await response.blob(),detail};
}
function showPair(plan){
 const box=showMessage('需要一次性配对','请在运行转换服务的 Windows 电脑上打开 http://127.0.0.1:8790/api/pair，复制显示的配对码。配对只授权给你自己的 Windows 转换服务。',true);
 const ip=document.createElement('input');ip.className='pairInput';ip.placeholder='输入配对码';ip.maxLength=16;ip.autocomplete='off';
 const button=document.createElement('button');button.textContent='保存并重试';button.className='pairButton';button.onclick=()=>{
  const code=ip.value.trim().toUpperCase();if(!/^[A-F0-9]{8,16}$/.test(code)){ip.focus();return;}
  localStorage.setItem('wish_pair',code);doConvert();
 };box.append(ip,button);
}
async function convertOfficePipeline(plan){
 if(files.length!==1)throw new Error('办公文档转图片或指定页码时，请每次选择一份文档。');
 const officePdf=await convertByWindows({...plan,target:'pdf'},files);
 const doc=new File([officePdf.blob],basename(files[0])+'.pdf',{type:'application/pdf'});
 progress(true,'PDF 已生成，正在提取页面','由 LibreOffice 排版完成，接下来执行指定页码转换。');
 const requested=await window.WishPdf.resolveRequestedPages(doc,plan.pages||[],plan.fromEnd);
 return await window.WishPdf.extract(doc,requested,basename(files[0]),plan.target,t=>progress(true,plan.title,t));
}
async function doConvert(){
 if(busy)return;
 let plan=window.WishPlanner.intent(wish.value,files,choiceTarget);
 if(!plan.ok&&plan.needsChoice){byId('formatChoice').focus();byId('clarify').scrollIntoView({behavior:'smooth',block:'center'});return;}
 const canUseOwnLocalAI = ['localhost','127.0.0.1'].includes(location.hostname)||/^192\.168\./.test(location.hostname)||/^10\./.test(location.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname);
 const viaPrivateTailnet=location.protocol==='https:'&&location.hostname.toLowerCase().endsWith('.ts.net');
 const safetyFailure=!plan.ok&&!plan.needsChoice&&/不支持|不能可靠|宏|安全|不能自动处理|页码/.test(String(plan.reason||''));
 if(!plan.ok&&!safetyFailure&&files.length&&wish.value.trim()&&(canUseOwnLocalAI||viaPrivateTailnet)){
  busy=true;runBtn.disabled=true;byId('runText').textContent='正在理解你的需求…';
  progress(true,'本地 AI 正在理解','本地模型首次唤醒可能需要一些时间。只发送中文指令及扩展名给本机模型，不发送文件内容，也不调用云端 AI。');
  try{
   const code=localStorage.getItem('wish_pair')||'';
   const headers={'content-type':'application/json'};if(code)headers['x-wish-key']=code;
   const resp=await fetch(new URL('api/interpret',document.baseURI),{method:'POST',headers,body:JSON.stringify({wish:wish.value,extension:ext(files[0])}),signal:AbortSignal.timeout(100000)});
   if(!resp.ok){const err=await resp.json().catch(()=>({}));throw new Error(err.error||'无法调用本地语言模型');}
   const data=await resp.json();const understood=String(data.normalized||'').trim();
   if(understood){
    const refined=window.WishPlanner.intent(understood,files,'');
    if(refined.ok||refined.needsChoice){wish.value=understood;choiceContext='';choiceTarget='';updatePlan();plan=window.WishPlanner.intent(wish.value,files,'');}
   }
  }catch(e){console.info('本地智能理解不可用，保留安全的能力表解析结果：',errorMessage(e));}
  finally{progress(false);busy=false;runBtn.disabled=false;byId('runText').textContent='开始转换';}
 }
 if(!plan.ok){if(plan.needsChoice){byId('formatChoice').focus();return;}showMessage('还不能开始',plan.reason,true);return;}
 if(lastUrl){URL.revokeObjectURL(lastUrl);lastUrl=null;}
 extraUrls.forEach(u=>URL.revokeObjectURL(u));extraUrls=[];
 byId('result').hidden=true;busy=true;runBtn.disabled=true;byId('runText').textContent='正在转换…';
 progress(true,plan.title,plan.detail);
 try{
  let output;
  if(plan.browser){
   try{output=await convertInBrowser(plan);}
   catch(browserError){
    if(!plan.serverFallback)throw browserError;
    progress(true,'浏览器未能完成，改用 Windows 引擎',errorMessage(browserError));
    output=await convertByWindows(plan,files);
   }
  }else if(['office_pages','office_images'].includes(plan.op))output=await convertOfficePipeline(plan);
  else output=await convertByWindows(plan,files);
  if(output&&output.unpacked){
   progress(false);showUnpacked(output.unpacked);return;
  }
  if(!output||!output.blob||output.blob.size===0)throw new Error('转换引擎没有生成有效文件');
  progress(false);
  addDownload(output.name,output.blob,output.detail||('✓ 已生成 '+output.name+'（'+units(output.blob.size)+'）。文件已经可以下载。'));
 }catch(e){progress(false);if(e.pair)showPair(plan);else showMessage('转换未完成',errorMessage(e),true);}
 finally{busy=false;runBtn.disabled=false;byId('runText').textContent='开始转换';updatePlan();}
}
input.onchange=()=>{
 const selected=[...input.files];if(!updateFiles(selected))return;
 if(!wish.value.trim()&&selected.length){
  const type=ext(selected[0]);
  wish.placeholder=officeExt.has(type)?'例如：把这份 Word 转成 PDF，或只导出第二页':
    type==='xmind'?'例如：把思维导图转成图片或 Markdown 大纲':
    imageExt.has(type)?'例如：把这张照片转成图片，请让我选择输出格式':
    type==='pdf'?'例如：删除第六页，或把所有页面拆成独立 PDF':
    archiveExt.has(type)?'例如：把压缩包里的 Word、Excel、PPT 批量转成 PDF，其他文件保留':
    textExt.has(type)?'例如：把这个 Markdown 转成 PDF、HTML、DOCX':
    videoExt.has(type)?'例如：提取声音、转换为 GIF 或压缩视频':
    audioExt.has(type)?'例如：把这段音频转成 MP3':'告诉我希望怎么处理这个文件';
 }
};
byId('formatChoice').onchange=e=>{
 const value=e.target.value;
 if(value.startsWith('page:')){
  const [,kind,count]=value.split(':');
  const pre=kind==='first'?'前'+count+'页':'第'+count+'页';
  const pattern=/[0-9零〇一二两三四五六七八九十百]+页/;
  wish.value=wish.value.replace(pattern,pre);
  choiceContext='';choiceTarget='';updatePlan();wish.focus();return;
 }
 choiceTarget=value;updatePlan();
};
wish.oninput=updatePlan;
runBtn.onclick=doConvert;
byId('dropZone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
['dragenter','dragover'].forEach(ev=>byId('dropZone').addEventListener(ev,e=>{e.preventDefault();byId('dropZone').classList.add('dragover');}));
['dragleave','drop'].forEach(ev=>byId('dropZone').addEventListener(ev,e=>{e.preventDefault();byId('dropZone').classList.remove('dragover');}));
byId('dropZone').addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files)updateFiles([...files,...e.dataTransfer.files]);});
document.querySelectorAll('[data-idea]').forEach(b=>b.onclick=()=>{wish.value=b.dataset.idea;updatePlan();wish.focus();});
byId('helpBtn').onclick=()=>byId('helpDialog').showModal();
if('serviceWorker'in navigator){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
function configureOfflineInstall(){
 const guide=byId('installGuide'), status=byId('offlineStatus'), help=byId('installHelp');
 const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
 const remote=location.protocol==='https:' && !['localhost','127.0.0.1'].includes(location.hostname);
 if(!mobile&&!remote)return;
 guide.hidden=false;
 const onHomeScreen=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
 if(onHomeScreen)help.textContent='已添加到主屏幕 · 使用帮助';
 help.onclick=()=>byId('helpDialog').showModal();
 if(!('serviceWorker' in navigator)||!('caches' in window)||!window.isSecureContext){
  status.textContent='当前浏览器或地址无法安装离线版，请使用 Safari 的 HTTPS 网址';return;
 }
 async function inspect(){
  try{
   const regs=await navigator.serviceWorker.getRegistrations();
   if(!regs.some(reg=>reg.scope===new URL('./',document.baseURI).href)){
    status.textContent='正在缓存应用组件…';return;
   }
   const all=await caches.keys();
   const key=all.find(x=>x.startsWith('wish-factory-static-v'));
   if(!key){status.textContent='正在准备离线资源，请保持网络连接…';return;}
   const cache=await caches.open(key);
   const mustHave=['','style.css','app.js','planner.js','pdf-extra.js','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs','vendor/xmind-bundle.js','vendor/media-bundle.js','vendor/jszip.min.js','vendor/pdf-lib.min.js'];
   const checks=await Promise.all(mustHave.map(x=>cache.match(new URL(x,document.baseURI).href)));
   const ready=checks.filter(Boolean).length;
   if(ready===mustHave.length){
    status.textContent='✓ 离线资源已缓存：可在本机处理图片、PDF、XMind 等支持的格式';
    status.style.color='#247c51';
   }else status.textContent='离线资源准备中（'+ready+'/'+mustHave.length+'），请保持网络连接';
  }catch(e){status.textContent='离线缓存尚未确认，请联网刷新后重试';}
 }
 window.addEventListener('load',()=>navigator.serviceWorker.ready.then(inspect).catch(()=>{}));
 navigator.serviceWorker.addEventListener('controllerchange',inspect);
 inspect();
}
configureOfflineInstall();
updateQuickSuggestions();updatePlan();
