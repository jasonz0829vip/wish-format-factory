'use strict';
const byId = (id)=>document.getElementById(id);
const input = byId('fileInput'), wish = byId('wishInput'), runBtn=byId('runBtn');
let files=[], lastUrl=null, busy=false, currentPlan=null, choiceTarget='', choiceContext='';
const imageExt = new Set(['jpg','jpeg','png','webp','heic','heif','bmp','gif','avif']);
const officeExt = new Set(['doc','docx','rtf','odt','txt','xls','xlsx','ods','csv','ppt','pptx','odp']);
const audioExt = new Set(['mp3','m4a','wav','flac','aac','ogg','opus','wma']);
const videoExt = new Set(['mp4','mov','webm','mkv','avi','wmv','m4v','mpg','mpeg']);
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
}
function errorMessage(e){const s=String(e&&e.message||e||'转换失败');return s.length>240?s.slice(0,240)+'…':s;}
function updateFiles(next) {
 const seen=new Map();for(const f of next)seen.set(f.name+'#'+f.size+'#'+f.lastModified,f);
 files=[...seen.values()].slice(0,20);
 input.value='';const wrap=byId('filesWrap'),list=byId('fileList');list.replaceChildren();
 wrap.hidden=!files.length;byId('fileCount').textContent=files.length+' 个';
 files.forEach((f,i)=>{
  const row=document.createElement('div');row.className='filepill';
  const name=document.createElement('span');name.className='filename';name.title=f.name;name.textContent=f.name;
  const size=document.createElement('span');size.className='size';size.textContent=units(f.size);
  const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','移除 '+f.name);x.onclick=()=>updateFiles(files.filter((_,j)=>j!==i));
  row.append(name,size,x);list.append(row);
 });
 updatePlan();
}
// 泛化的操作规划见 planner.js，执行层不再维护重复的关键词列表。
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
 }else if(plan.ok){
  byId('planTitle').textContent=plan.title;byId('planDetail').textContent=plan.detail;
  setStatus('✓ 已识别 '+plan.target.toUpperCase(),true);
 }else setStatus(files.length?plan.reason:'等待你许愿…',false);
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
 if(plan.op==='pdf_pages'||plan.op==='pdf_images'){
  if(!window.WishPdf)throw new Error('PDF 页面处理模块还没加载');
  return await window.WishPdf.extract(files[0],plan.pages||[],basename(files[0]),plan.target,t=>progress(true,plan.title,t));
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
 if(!isPrivate)throw new Error('当前是手机独立版：该任务需要你自己的 Windows 电脑引擎。文件不会上传给互联网网站。');
 const fd=new FormData();
 selected.forEach(f=>fd.append('files',f,f.name));fd.append('target',plan.target);
 const headers={};const code=localStorage.getItem('wish_pair')||'';
 if(code)headers['x-wish-key']=code;
 let response;
 try{response=await fetch(new URL('api/convert',document.baseURI),{method:'POST',body:fd,headers});}
 catch(e){throw new Error('Windows 本地转换服务不可访问。手机完全离线时暂时不能做 Word 转 PDF；请打开电脑或改用支持的浏览器本地格式。');}
 if(response.status===401){
  const err=new Error('请先配对运行转换器的 Windows 电脑。');err.pair=true;throw err;
 }
 if(!response.ok){let reason='未知失败';try{reason=(await response.json()).error||reason;}catch(e){}throw new Error(reason);}
 const name=selected.length>1?'批量转换结果.zip':basename(selected[0])+'.'+plan.target;
 return {name,blob:await response.blob()};
}
function showPair(plan){
 const box=showMessage('需要一次性配对','请在 RTX3070 上打开 http://127.0.0.1:8790/api/pair，复制显示的配对码。配对只授权给你自己的 Windows 转换服务。',true);
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
 return await window.WishPdf.extract(doc,plan.pages||[],basename(files[0]),plan.target,t=>progress(true,plan.title,t));
}
async function doConvert(){
 if(busy)return;
 let plan=window.WishPlanner.intent(wish.value,files,choiceTarget);
 if(!plan.ok&&plan.needsChoice){byId('formatChoice').focus();byId('clarify').scrollIntoView({behavior:'smooth',block:'center'});return;}
 const canUseOwnLocalAI = ['localhost','127.0.0.1'].includes(location.hostname)||/^192\.168\./.test(location.hostname)||/^10\./.test(location.hostname)||/^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname);
 if(!plan.ok&&files.length&&wish.value.trim()&&canUseOwnLocalAI){
  busy=true;runBtn.disabled=true;byId('runText').textContent='正在理解你的需求…';
  progress(true,'本地语言模型正在理解','只有中文指令及源文件扩展名会交给这台 Windows 电脑的本地模型，不传文件内容。');
  try{
   const code=localStorage.getItem('wish_pair')||'';
   const headers={'content-type':'application/json'};if(code)headers['x-wish-key']=code;
   const resp=await fetch(new URL('api/interpret',document.baseURI),{method:'POST',headers,body:JSON.stringify({wish:wish.value,extension:ext(files[0])}),signal:AbortSignal.timeout(20000)});
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
  if(!output||!output.blob||output.blob.size===0)throw new Error('转换引擎没有生成有效文件');
  progress(false);
  addDownload(output.name,output.blob, '✓ 已生成 '+output.name+'（'+units(output.blob.size)+'）。文件已经可以下载。');
 }catch(e){progress(false);if(e.pair)showPair(plan);else showMessage('转换未完成',errorMessage(e),true);}
 finally{busy=false;runBtn.disabled=false;byId('runText').textContent='开始转换';}
}
input.onchange=()=>{const selected=[...input.files];updateFiles(selected);if(!wish.value.trim()&&selected.length){const type=ext(selected[0]);wish.value=officeExt.has(type)?'把这个文件转成 PDF':type==='xmind'?'把思维导图转成图片':imageExt.has(type)?'把图片转成 JPG':videoExt.has(type)?'从视频提取 MP3 音频':audioExt.has(type)?'转成 MP3':'';updatePlan();}};
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
updatePlan();
