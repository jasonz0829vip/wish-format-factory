/* 许愿解析器 v0.2：先抽取意图和参数，再按能力表规划流水线。无网络、无外部 AI。 */
(function(){
 'use strict';
 const ext=f=>String(f.name.split('.').pop()||'').toLowerCase();
 const group={office:new Set(['doc','docx','rtf','odt','txt','xls','xlsx','ods','csv','ppt','pptx','odp']),
  pdf:new Set(['pdf']),xmind:new Set(['xmind']),
  image:new Set(['png','jpg','jpeg','webp','heic','heif','bmp','gif','avif']),
  audio:new Set(['mp3','wav','m4a','aac','flac','ogg','opus','wma']),
  video:new Set(['mp4','mov','avi','webm','mkv','wmv','m4v','mpeg','mpg'])};
 const cap={
  office:{convert:['pdf','png','jpg','webp'],pages:['pdf','png','jpg','webp']},
  pdf:{convert:['png','jpg','webp','txt','markdown'],pages:['pdf','png','jpg','webp','txt','markdown'],merge:['pdf']},
  xmind:{convert:['markdown','png','jpg','svg','pdf']},
  image:{convert:['jpg','png','webp','pdf'],merge:['pdf']},
  audio:{convert:['mp3','wav','m4a','ogg','flac']},
  video:{convert:['mp3','wav','m4a','ogg','flac','mp4','webm','gif']}
 };
 const labels={txt:'TXT（纯文本）',pdf:'PDF',png:'PNG（清晰，推荐文档）',jpg:'JPG（文件较小，推荐照片）',
  webp:'WebP（体积小）',svg:'SVG（矢量图）',markdown:'Markdown（结构化文本）',
  mp3:'MP3',wav:'WAV（无损）',m4a:'M4A',ogg:'OGG',flac:'FLAC',mp4:'MP4',webm:'WebM',gif:'GIF'};
 const cn={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
 function parseNum(s){
  s=String(s).trim();if(/^\d+$/.test(s))return Number(s);
  if(cn[s]!=null)return cn[s];
  if(s.includes('百')){
   const [b,rem]=s.split('百');return (cn[b]||1)*100+(rem?parseNum(rem):0);
  }
  if(s.includes('十')){
   const [t,r]=s.split('十');return (t?cn[t]||0:1)*10+(r?cn[r]||0:0);
  }
  return NaN;
 }
 const numChunk='[0-9零〇一二两三四五六七八九十百]+';
 function extractPages(command){
  let s=command.replace(/\s+/g,'');const pages=[];let matched=false;
  const push=n=>{if(Number.isInteger(n)&&n>0&&n<=9999&&!pages.includes(n))pages.push(n);};
  const range=new RegExp('第?('+numChunk+')(?:页)?(?:至|到|[-~～—–])第?('+numChunk+')页','g');
  s=s.replace(range,(_,a,b)=>{const x=parseNum(a),y=parseNum(b);if(Number.isInteger(x)&&Number.isInteger(y)&&x>0&&y>=x&&y-x<100){for(let i=x;i<=y;i++)push(i);matched=true;}return ' '});
  const first=new RegExp('前('+numChunk+')页','g');
  s=s.replace(first,(_,amount)=>{const n=parseNum(amount);if(Number.isInteger(n)&&n>0&&n<=100){for(let i=1;i<=n;i++)push(i);matched=true;}return ' '});
  const list=new RegExp('第('+numChunk+'(?:[、，,和及]'+numChunk+')+)页','g');
  s=s.replace(list,(_,fragment)=>{fragment.split(/[、，,和及]/).forEach(p=>push(parseNum(p)));matched=true;return ' '});
  const single=new RegExp('第('+numChunk+')页','g');let m;
  while((m=single.exec(s))){push(parseNum(m[1]));matched=true;}
  if(!matched){
   const p=s.match(new RegExp('(?:页码|页面)[:：]?('+numChunk+')'));
   if(p){push(parseNum(p[1]));matched=true;}
  }
  return matched?pages.sort((a,b)=>a-b):[];
 }
 function typeOfFile(f){const e=ext(f);return Object.keys(group).find(t=>group[t].has(e))||null;}
 function parseTarget(cmd){
  const normalized=cmd.toLowerCase();
  const tokens=['markdown','docx','xlsx','pptx','webp','jpeg','jpg','png','pdf','svg','md','heic','mp3','wav','m4a','flac','ogg','mp4','webm','gif','zip','txt'];
  const re=new RegExp('(?:转成?|转换成?|转为|导出(?:为|成)?|保存(?:为|成)?|生成|输出(?:为|成)?|变成|弄成|得到|提取成)\\s*(?:一张|一些|几张|高清|无损|一份|几份|[\\s、]*)\\s*('+tokens.join('|')+')(?![a-z0-9])','ig');
  const ms=[...normalized.matchAll(re)];let target=ms.length?ms.at(-1)[1]:null;
  if(!target&&/(?:格式|类型)(?:为|是|设成?|指定为?)?\s*[:：]?\s*/.test(normalized)){
   const fmt=normalized.match(new RegExp('(?:格式|类型)[^a-z0-9]{0,6}('+tokens.join('|')+')','i'));if(fmt)target=fmt[1];
  }
  if(!target){
   const explicit=normalized.match(new RegExp('(?:转|导出|要|输出)('+tokens.filter(x=>!['docx','xlsx','pptx','txt'].includes(x)).join('|')+')(?![a-z0-9])','i'));
   if(explicit&&/转|转换|提取|变|输出|导出|生成/.test(normalized))target=explicit[1];
  }
  if(target==='jpeg')target='jpg';if(target==='md')target='markdown';return target;
 }
 function wantsImage(s){return /(?:转|变|输出|导出|生成|保存|弄|转换)[^。，,]{0,8}(?:图片|图像|照片|一张图|图形)/.test(s);}
 function wantsText(s){return /(?:转|导出|输出|保存|生成)[^。，,]{0,8}(?:文字|文本|大纲)/.test(s);}
 function fail(reason){return {ok:false,reason};}
 function chooser(title,reason,options,recommended,extra){
  return {ok:false,needsChoice:true,title,reason,options:options.map(v=>({value:v,label:labels[v]||v})),recommended,...extra};
 }
 function parse(command,selected,answer){
  // Page noun normalization shared across Office/PDF commands. Models may say “第二张纸” instead of “第二页”.
  const s=String(command||'').trim().replace(/第([0-9零〇一二两三四五六七八九十百]+)张(?:纸|页面)?/g,'第$1页');
  if(!selected.length)return fail('请先选文件。');
  if(!s)return fail('告诉我想做什么，例如：“只导出第六页”或“转换成图片”。');
  if(s.length>250)return fail('请用 250 字以内描述需求。');
  const types=[...new Set(selected.map(typeOfFile))];
  if(types.includes(null)||types.length!==1)return fail('请把同一类文件放在一批转换；不同类型可分别处理。');
  const type=types[0];
  const relativeMatch=s.match(/倒数第([0-9零〇一二两三四五六七八九十百]+)页/);
  const fromEnd=/最后一页|末页/.test(s)?1:relativeMatch?parseNum(relativeMatch[1]):null;
  const pages=fromEnd?[]:extractPages(s);
  if(['office','pdf'].includes(type)&&pages.length===0&&!fromEnd&&/(?:取|拿|截|导|留|保留|删|去掉|移除)/.test(s)){
   const m=s.replace(/\s+/g,'').match(new RegExp('('+numChunk+')页'));
   const n=m?parseNum(m[1]):NaN;
   if(Number.isInteger(n)&&n>0&&n<=100){
    return {ok:false,needsChoice:true,kind:'page',title:'请确认页码',
      reason:'“'+m[1]+'页”不够明确：你指的是第'+n+'页，还是开头的'+n+'页？',
      options:[{value:'page:one:'+n,label:'只提取第'+n+'页'},{value:'page:first:'+n,label:'提取前'+n+'页'}],recommended:'page:one:'+n};
   }
  }
  const merge=/合并|拼接|合成一份|汇总成一份|连成一份/.test(s);
  if(type==='pdf'&&merge&&selected.length<2)return fail('合并 PDF 至少需要选择两份文件。');
  const image=wantsImage(s);
  const text=wantsText(s);
  const compress=/压缩|缩小体积|减小体积|瘦身/.test(s);
  const requested=parseTarget(s);
  let target=answer||requested;
  const deleting=/删除|删掉|去掉|移除|剔除/.test(s);
  const splitting=/逐页|每(?:一)?页(?:单独|独立|拆分|导出)?|拆成(?:独立|单独|一页一份|每页)|按页拆|分割|拆开|分别导出/.test(s);
  const reversing=/倒序|反转(?:页面|页码|顺序)|页面顺序倒过来|页序倒过来/.test(s);
  if(type==='pdf'&&(deleting||(splitting&&!image)||reversing)){
   if(selected.length!==1)return fail('PDF 页面修改一次请选择一份文件。');
   if(requested&&requested!=='pdf')return fail('删除、拆分、倒序操作目前输出 PDF；如需图片，请分两步执行。');
   if(deleting){
    if(!pages.length&&!fromEnd)return fail('请明确要删除哪些页，例如“删除第2页”或“删除第2到4页”。');
    return {ok:true,op:'pdf_delete',target:'pdf',title:'PDF 删除指定页',detail:'从原 PDF 删除所选页，输出新的 PDF，不修改原文件。',browser:true,source:type,pages,fromEnd};
   }
   if(reversing)return {ok:true,op:'pdf_reverse',target:'pdf',title:'PDF 页面倒序',detail:'颠倒整个 PDF 的页面顺序，不修改原文件。',browser:true,source:type};
   return {ok:true,op:'pdf_split',target:'pdf',title:pages.length?'所选页面分别导出 PDF':'PDF 按页拆分',detail:'每页生成独立 PDF，统一打包 ZIP；最多处理 100 页。',browser:true,source:type,pages,fromEnd};
  }
  if(!target&&text&&type==='xmind')target='markdown';
  if(!target&&/提取(?:音频|声音|音轨)|只要声音|只保留音频/.test(s)&&['video','audio'].includes(type))target='mp3';
  if(!target&&compress&&type==='image')target='webp';
  if(!target&&compress&&type==='video')target='mp4';
  if(!target&&merge&&type==='pdf')target='pdf';
  if(!target&&merge&&type==='image')target='pdf';
  if(type==='pdf'&&(!target||target==='pdf')&&/(文字|文本|提取(?:全部)?内容|markdown|txt)/i.test(s))return chooser('选择文字格式','PDF 可复制文字可导出为纯文本或 Markdown，扫描件需要 OCR。',['txt','markdown'],'txt',{type,pages,fromEnd});
  if(!target&&(pages.length||fromEnd)&&!image)target='pdf';
  if(!target&&/(?:转|转换|变|导出|生成|保存|输出|提取)/.test(s)){
   if(image){
    if(['video','audio'].includes(type))return fail('音视频抽取静态帧还未通过验收；视频目前可以转换 GIF，或提取 MP3/WAV 音频。');
    return chooser('选择图片格式','已识别为“转换成图片”。请选择需要的输出格式。',type==='xmind'?['png','jpg','svg']:['png','jpg','webp'],'png',{type,pages});
   }
   if(type==='xmind')return chooser('选择 XMind 输出格式','可以把思维导图导出为图片、PDF 或 Markdown 大纲。',['png','pdf','markdown','svg'],'png',{type});
   if(type==='office')return chooser('选择输出格式','这个文档可以转成 PDF，也可以将每页导出为图片。',['pdf','png','jpg'],'pdf',{type});
   if(type==='pdf')return chooser('选择输出格式','可以导出为图片，或指定页面形成新的 PDF。',['png','jpg','webp'],'png',{type});
   if(type==='image')return chooser('选择输出格式','你可以选择图片格式，或把图片排成 PDF。',['jpg','png','webp','pdf'],'jpg',{type});
   if(type==='video')return chooser('选择音视频格式','可以提取声音，或转换视频格式。',['mp3','wav','mp4','webm','gif'],'mp3',{type});
  }
  if(!target)return fail('还没识别到可以执行的转换动作。请说要“转换”“合并”或“提取第几页”，并选目标格式。');
  if(!cap[type]||!(cap[type].convert||[]).includes(target)&&!((pages.length||fromEnd)&&(cap[type].pages||[]).includes(target))&&!(merge&&(cap[type].merge||[]).includes(target)))
   return fail('当前未支持 '+type.toUpperCase()+' → '+target.toUpperCase()+'；可选：'+(cap[type]?.convert||[]).map(x=>labels[x]||x).join('、')+'。');
  if((merge||pages.length)&&selected.length>1&&pages.length)return fail('指定页码时请先选一个文件，避免多个文件的页码混淆。');
  if(type==='pdf'&&selected.length>1&&!merge)return fail('批量转换多份 PDF 时，请先分别处理；若要合并，请输入“把这些 PDF 合并”。');
  if(merge&&type==='pdf'&&selected.length>1)return {ok:true,op:'merge_pdf',target:'pdf',title:'合并 '+selected.length+' 份 PDF',detail:'按上传顺序合并全部页面，本机浏览器执行。',browser:true,source:type};
  if(type==='pdf'&&['txt','markdown'].includes(target))return {ok:true,op:'pdf_text',target,title:'PDF → '+(target==='txt'?'TXT':'Markdown'),detail:'使用 PDF.js 离线提取可复制文字；扫描件需要 OCR。',browser:true,source:type,pages,fromEnd};
  if(type==='pdf'&&(pages.length||fromEnd))return {ok:true,op:'pdf_pages',target,title:fromEnd?'提取 PDF 倒数第 '+fromEnd+' 页':'提取 PDF 第 '+pages.join('、')+' 页',detail:'只处理所选页，自动检查页码是否存在。',browser:true,source:type,pages,fromEnd};
  if(type==='office'&&(pages.length||fromEnd))return {ok:true,op:'office_pages',target,title:fromEnd?'提取文档倒数第 '+fromEnd+' 页':'提取文档第 '+pages.join('、')+' 页',detail:'先用 Windows LibreOffice 排版生成 PDF，再提取页面'+(target==='pdf'?'。':'并转换为图片。')+'实际分页可能与 Microsoft Word 略有差异。',browser:false,source:type,pages,fromEnd};
  if(type==='office')return {ok:true,op:target==='pdf'?'office':'office_images',target,title:'办公文档 → '+target.toUpperCase(),detail:'由 Windows LibreOffice 转为 PDF'+(target==='pdf'?'。':'，再导出每页图片。'),browser:false,source:type};
  if(type==='pdf')return {ok:true,op:'pdf_images',target,title:'PDF → '+target.toUpperCase(),detail:'在本机浏览器逐页转换，批量输出 ZIP。',browser:true,source:type};
  if(type==='xmind')return {ok:true,op:'xmind',target,title:'XMind → '+target.toUpperCase(),detail:'读取 XMind 原始主题结构，导出为图片、PDF 或 Markdown。原始排版和主题样式可能不同。',browser:true,source:type};
  if(type==='image'){
   if(target==='pdf')return {ok:true,op:'image_pdf',target,title:'图片 → PDF',detail:'在本机浏览器转换。',browser:true};
   let quality=.88;
   const q=s.match(/(?:质量|品质)\s*(\d{1,3})\s*%?/);if(q)quality=Math.min(1,Math.max(.1,Number(q[1])/100));
   const px=s.match(/(?:宽度|宽|缩放到)\s*(\d{3,5})\s*(?:px|像素)?/);
   const limit=s.match(/(?:不超过|小于|以内|压缩到|控制在|缩到)\s*(\d+(?:\.\d+)?)\s*(mb|m|kb|k)\b/i);
   return {ok:true,op:'image',target,quality,width:px?Math.min(8192,Number(px[1])):null,maxBytes:limit?Number(limit[1])*(limit[2].toLowerCase().startsWith('m')?1048576:1024):null,title:'图片 → '+target.toUpperCase(),detail:'浏览器本机转换，支持批量下载 ZIP。',browser:true,source:type};
  }
  if(['audio','video'].includes(type)){
   const lim=s.match(/(?:不超过|压缩到|控制在|小于)\s*\d+(?:\.\d+)?\s*(?:mb|m|kb)/i);
   if(lim&&type==='video')return fail('当前无法保证压缩后文件严格小于指定大小；可以先选择转 MP4 并压缩。');
   const browser=['mp3','wav'].includes(target);
   return {ok:true,op:browser?'media_browser':'media_server',target,title:'音视频 → '+target.toUpperCase(),detail:browser?'优先在当前设备浏览器转换，失败时再用 Windows FFmpeg。':'使用你自己的 Windows FFmpeg 转换。',browser,source:type,serverFallback:browser};
  }
  return fail('没有可靠的转换路径，暂不执行。');
 }
 window.WishPlanner={intent:parse,capabilities:cap,parsePages:extractPages,parseNum,typeOfFile};
})();
