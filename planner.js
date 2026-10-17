/* 许愿解析器 v0.2：先抽取意图和参数，再按能力表规划流水线。无网络、无外部 AI。 */
(function(){
 'use strict';
 const ext=f=>String(f.name.split('.').pop()||'').toLowerCase();
 const registry=window.WishFormats;
 if(!registry)throw Error('格式注册表未加载：formats.js');
 const group={
  office:new Set([...registry.groups.word,...registry.groups.sheet,...registry.groups.slide]),
  text:new Set(registry.groups.text),
  archive:new Set(registry.groups.archive),
  pdf:new Set(registry.groups.pdf),
  xmind:new Set(registry.groups.xmind),
  image:new Set(registry.groups.image),
  audio:new Set(registry.groups.audio),
  video:new Set(registry.groups.video)
 };
 const cap={
  office:{convert:['pdf','docx','doc','odt','rtf','txt','html','markdown','xlsx','xls','ods','csv','pptx','ppt','odp','png','jpg','webp'],pages:['pdf','png','jpg','webp']},
  text:{convert:['pdf','html','txt','markdown','docx']},
  archive:{convert:['pdf','mp3','zip']},
  pdf:{convert:['docx','xlsx','png','jpg','webp','txt','markdown'],pages:['pdf','png','jpg','webp','txt','markdown'],merge:['pdf']},
  xmind:{convert:['markdown','png','jpg','svg','pdf']},
  image:{convert:['jpg','png','webp','pdf','txt','markdown'],merge:['pdf']},
  audio:{convert:['mp3','wav','m4a','ogg','flac']},
  video:{convert:['mp3','wav','m4a','ogg','flac','mp4','webm','gif']}
 };
 const labels={docx:'Word DOCX（可编辑）',doc:'Word DOC（旧版）',odt:'ODT（开放文档）',rtf:'RTF 富文本',xlsx:'Excel XLSX',xls:'Excel XLS（旧版）',ods:'ODS 表格',csv:'CSV 单表格',pptx:'PowerPoint PPTX',ppt:'PowerPoint PPT（旧版）',odp:'ODP 演示',zip:'ZIP（安全解包并列出文件）',html:'HTML 网页',txt:'TXT（纯文本）',pdf:'PDF',png:'PNG（清晰，推荐文档）',jpg:'JPG（文件较小，推荐照片）',
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
  const tokens=['markdown','docx','xlsx','pptx','webp','jpeg','odt','ods','odp','rtf','csv','html','jpg','png','pdf','svg','heic','mp3','wav','m4a','flac','ogg','mp4','webm','gif','zip','txt','doc','xls','ppt','md'];
  const re=new RegExp('(?:转成?|转换成?|转为|导出(?:为|成)?|保存(?:为|成)?|生成|输出(?:为|成)?|变成|弄成|得到|提取(?:成|为)?|识别(?:成|为)?)\\s*(?:一张|一些|几张|高清|无损|一份|几份|[\\s、]*)\\s*('+tokens.join('|')+')(?![a-z0-9])','ig');
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
  // Destructive Office requests must never fall through to extract-page execution.
  if(type==='office'&&/(?:删除|删掉|去掉|移除|剔除|删(?=[第前0-9一二两三四五六七八九十百]))/.test(s))
   return fail('当前不支持直接删除办公文档页面或幻灯片；为避免误操作，不能将“删除”理解为“提取”。可先转成 PDF 再删除指定页。');
  if(type==='office'&&/(?:合并|拼接|合成一份|汇总成一份|连成一份)/.test(s))
   return fail('当前不支持直接合并多份 Word、Excel 或 PPT；请先按需要转为 PDF，再合并 PDF。');
  const relativeMatch=s.match(/倒数第([0-9零〇一二两三四五六七八九十百]+)页/);
  const fromEnd=/最后一页|末页/.test(s)?1:relativeMatch?parseNum(relativeMatch[1]):null;
  const pages=fromEnd?[]:extractPages(s);
  if(['office','pdf'].includes(type)&&pages.length===0&&!fromEnd&&/(?:取|拿|截|导|留|保留|删|去掉|移除)/.test(s)){
   const m=s.replace(/\s+/g,'').match(new RegExp('('+numChunk+')页'));
   const n=m?parseNum(m[1]):NaN;
   if(Number.isInteger(n)&&n>0&&n<=100){
    const verb=/(?:删除|删掉|去掉|移除|剔除|删(?=[第前0-9一二两三四五六七八九十百]))/.test(s)?'删除':'提取';
    return {ok:false,needsChoice:true,kind:'page',title:'请确认页码',
      reason:'“'+m[1]+'页”不够明确：你指的是第'+n+'页，还是开头的'+n+'页？',
      options:[{value:'page:one:'+n,label:'只'+verb+'第'+n+'页'},{value:'page:first:'+n,label:verb+'前'+n+'页'}],recommended:'page:one:'+n};
   }
  }
  const merge=/合并|拼接|合成一份|汇总成一份|连成一份/.test(s);
  if(type==='pdf'&&merge&&selected.length<2)return fail('合并 PDF 至少需要选择两份文件。');
  const image=wantsImage(s);
  const text=wantsText(s);
  const compress=/压缩|缩小体积|减小体积|瘦身/.test(s);
  const requested=parseTarget(s)||
    (type==='pdf'&&/(?:转|导出|保存|输出|变成|转为|提取)[^。，,]{0,22}(?:excel|电子表格)/i.test(s)?'xlsx':null)||
    (type==='pdf'&&/(?:转|导出|保存|输出|变成|转为)[^。，,]{0,20}(?:word|Word|可编辑文档)/i.test(s)?'docx':null)||
    (type==='text'&&['md','markdown'].includes(ext(selected[0]))&&/(?:转|转换|导出|输出|保存|变成|转为)[^。，,]{0,20}(?:word|可编辑文档)/i.test(s)?'docx':null);
  let target=answer||requested;
  if(type==='archive'){
   if(selected.length!==1)return fail('一次请选择一份压缩包；内部文档会自动批量处理。');
   const mixIntent=/(?:按类型|按类别|按文件类型|分类整理|分类转换|混合整理|分别转换|分别处理|一键整理|各类分开)/.test(s)||
     (/(?:Word|docx|文档|Excel|xlsx|表格|PPT|pptx)/i.test(s)&&/(?:音视频|音频|视频|mp3)/i.test(s)&&/pdf/i.test(s));
   if(mixIntent){
    const recipeOptions=[
     {value:'recipe:balanced',label:'文档与图片→PDF；音视频→MP3；其他保留'},
     {value:'recipe:data',label:'Word/PPT→PDF；Excel→CSV；图片→WebP；音视频→MP3'}
    ];
    const automaticData=/(?:excel|xlsx|表格)[^。，,；;]{0,14}csv/i.test(s)&&
      /(?:图片|图像|照片)[^。，,；;]{0,14}webp/i.test(s);
    const recipe=String(answer||'').startsWith('recipe:')?String(answer).slice(7):(automaticData?'data':null);
    if(!recipe)return {ok:false,needsChoice:true,title:'选择混合文件处理规则',
      reason:'按类别处理使用确定的规则，不会让 AI 猜测不同文件的输出格式。未匹配的文件始终保留原件。',
      options:recipeOptions,recommended:'recipe:balanced'};
    if(!['balanced','data'].includes(recipe))return fail('未知混合处理规则');
    return {ok:true,op:'archive_mixed',target:'zip',recipe,
      title:recipe==='balanced'?'分类整理：文档 PDF + 音视频 MP3':'分类整理：办公 PDF/CSV + 图片 WebP + 音视频 MP3',
      detail:recipe==='balanced'?
       '文档及图片转 PDF，音视频转 MP3，其余原样保留；生成 ZIP 和逐文件报告。':
       'Word/PPT/文本转 PDF，Excel 转单工作表 CSV，图片转 WebP，音视频转 MP3；其余保留。',
      source:type,browser:false};
   }
   const isUnpack=/(?:解压|解开|拆包|查看里面|查看文件|看看里面|列出文件)/.test(s)&&!target;
   if(isUnpack)target='zip';
   if(!target)return chooser('选择压缩包处理方式','可解压并查看文件，也可以批量转换内部支持的文档，其他原样保留。',['pdf','mp3','zip'],'pdf',{type});
   if(!['pdf','mp3','zip'].includes(target))return fail('压缩包当前支持：内部文档转 PDF、音视频转 MP3、或安全解包。');
   if(/第[0-9一二三四五六七八九十]+页/.test(s))return fail('压缩包包含多个文件，请先解压并选择具体文件，再指定页码。');
   const unzip=target==='zip';
   return {ok:true,op:unzip?'archive_unpack':'archive_convert',target,
     title:unzip?'安全打开压缩包':'压缩包内批量转 '+target.toUpperCase(),
     detail:unzip?'读取内部文件，可下载解压后的各项内容。':'自动逐项识别并转换支持的文件；不能转换的原件完整保留，最终 ZIP 附处理报告。',
     source:type,browser:unzip&&ext(selected[0])==='zip'};
  }
  const textRequest=/(?:文字|文本|识别(?:文字|内容)|提取(?:内容|文字)|ocr)/i.test(s);
  const explicitOCR=/(?:ocr|扫描件|扫描版|扫描文档|扫描\s*(?:pdf|文件)|照片中|照片里|图片中|图片里|识别文字|文字识别|识别扫描)/i.test(s);
  if(['pdf','image'].includes(type)&&textRequest&&!target)return chooser(
   '选择文字输出格式',
   type==='pdf'?'会先提取 PDF 可复制文字，扫描页面再用离线 OCR 识别。首次 OCR 需联网下载中文＋英文模型。':'使用离线 OCR 识别图片文字，选择保存为 TXT 或 Markdown。',
   ['txt','markdown'],'txt',{type,pages,fromEnd}
  );
  const deleting=/(?:删除|删掉|去掉|移除|剔除|删(?=[第前0-9一二两三四五六七八九十百]))/.test(s);
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
  if(type==='office'&&registry.macros.has(ext(selected[0])))
   return fail('识别到含宏 Office 后缀，为安全起见不能自动处理；请先自行另存为不含宏的格式。');
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
   if(type==='office'){
    const family=registry.category(ext(selected[0]));
    const options=registry.targets[family]||['pdf'];
    return chooser('选择办公文档格式','可选择同类 Office 格式或 PDF；转图片先排版为 PDF。',options,'pdf',{type});
   }
   if(type==='pdf')return chooser('选择输出格式','可以转换为 DOCX、提取表格到 XLSX、导出图片，或指定页形成 PDF。',['docx','xlsx','png','jpg','webp'],'png',{type});
   if(type==='image')return chooser('选择输出格式','你可以选择图片格式，或把图片排成 PDF。',['jpg','png','webp','pdf'],'jpg',{type});
   if(type==='video')return chooser('选择音视频格式','可以提取声音，或转换视频格式。',['mp3','wav','mp4','webm','gif'],'mp3',{type});
  }
  if(!target)return fail('还没识别到可以执行的转换动作。请说要“转换”“合并”或“提取第几页”，并选目标格式。');
  if(!cap[type]||!(cap[type].convert||[]).includes(target)&&!((pages.length||fromEnd)&&(cap[type].pages||[]).includes(target))&&!(merge&&(cap[type].merge||[]).includes(target)))
   return fail('当前未支持 '+type.toUpperCase()+' → '+target.toUpperCase()+'；可选：'+(cap[type]?.convert||[]).map(x=>labels[x]||x).join('、')+'。');
  if((merge||pages.length)&&selected.length>1&&pages.length)return fail('指定页码时请先选一个文件，避免多个文件的页码混淆。');
  if(type==='pdf'&&selected.length>1&&!merge)return fail('批量转换多份 PDF 时，请先分别处理；若要合并，请输入“把这些 PDF 合并”。');
  if(merge&&type==='pdf'&&selected.length>1)return {ok:true,op:'merge_pdf',target:'pdf',title:'合并 '+selected.length+' 份 PDF',detail:'按上传顺序合并全部页面，本机浏览器执行。',browser:true,source:type};
  if(type==='pdf'&&['txt','markdown'].includes(target))return {
   ok:true,op:explicitOCR?'pdf_ocr':'pdf_text',target,
   title:explicitOCR?'PDF 扫描文字 OCR':'PDF → '+(target==='txt'?'TXT':'Markdown'),
   detail:explicitOCR?'使用本机 OCR 识别扫描 PDF 的文字；建议转换后校对数字与专有名词。':'优先提取 PDF 可复制文字；扫描版自动尝试离线 OCR。',
   browser:true,source:type,pages,fromEnd
  };
  if(type==='pdf'&&['docx','xlsx'].includes(target)){
   if(pages.length||fromEnd)return fail('PDF → 可编辑 Office 当前需先提取指定页为 PDF，再单独转换。');
   return {ok:true,op:target==='docx'?'pdf_to_docx':'pdf_tables_to_xlsx',target,
     title:target==='docx'?'PDF → 可编辑 Word':'PDF 表格 → 可编辑 Excel',
     detail:target==='docx'?
       '本机 pdf2docx 重建可编辑 Word；复杂排版可能变化。':
       '仅提取能检测到的 PDF 表格，保留行列与数据；不是全文档还原，其他正文、图片、公式不保留。未发现表格则明确拒绝。',
     browser:false,source:type};
  }
  if(type==='pdf'&&(pages.length||fromEnd))return {ok:true,op:'pdf_pages',target,title:fromEnd?'提取 PDF 倒数第 '+fromEnd+' 页':'提取 PDF 第 '+pages.join('、')+' 页',detail:'只处理所选页，自动检查页码是否存在。',browser:true,source:type,pages,fromEnd};
  if(type==='office'&&target&&!registry.canConvert(ext(selected[0]),target))return fail('当前 '+ext(selected[0]).toUpperCase()+' 不能可靠转换为 '+target.toUpperCase()+'；请选择同一文档类别的格式或 PDF。');
  if(type==='office'&&(pages.length||fromEnd))return {ok:true,op:'office_pages',target,title:fromEnd?'提取文档倒数第 '+fromEnd+' 页':'提取文档第 '+pages.join('、')+' 页',detail:'先用 Windows LibreOffice 排版生成 PDF，再提取页面'+(target==='pdf'?'。':'并转换为图片。')+'实际分页可能与 Microsoft Word 略有差异。',browser:false,source:type,pages,fromEnd};
  if(type==='office'){
   const images=['png','jpg','webp'].includes(target);
   return {ok:true,op:images?'office_images':'office_convert',target,
     title:'办公文档 → '+target.toUpperCase(),
     detail:images?'先用本机 LibreOffice 排版，再按页导出图片。':
      '通过本机 LibreOffice 真正转换；输出会校验文件结构。导出 CSV 仅保留单工作表，格式和公式可能丢失。',
     browser:false,source:type};
  }
  if(type==='text'){
   if(!['pdf','html','txt','markdown','docx'].includes(target)||!registry.canConvert(ext(selected[0]),target))return fail('这种文本目前不支持转换成 '+String(target).toUpperCase()+'；MD 可以转为 DOCX，TXT 可以转为 PDF/HTML/TXT/Markdown。');
   return {ok:true,op:'text_convert',target,title:'文本文件 → '+target.toUpperCase(),detail:'本机转换 Markdown / TXT，不联网，不执行文档中的代码。',browser:false,source:type};
  }
  if(type==='pdf')return {ok:true,op:'pdf_images',target,title:'PDF → '+target.toUpperCase(),detail:'在本机浏览器逐页转换，批量输出 ZIP。',browser:true,source:type};
  if(type==='xmind')return {ok:true,op:'xmind',target,title:'XMind → '+target.toUpperCase(),detail:'读取 XMind 原始主题结构，导出为图片、PDF 或 Markdown。原始排版和主题样式可能不同。',browser:true,source:type};
  if(type==='image'){
   if(['txt','markdown'].includes(target))return {ok:true,op:'image_ocr',target,
     title:'图片文字识别（OCR）',detail:'浏览器本机中文＋英文文字识别，首次加载离线模型约33MB，结果请校对。',
     browser:true,source:type};
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
