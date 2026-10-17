/* Wish Format Factory: one shared source of truth for recognised extensions. */
(function(root,create){
 'use strict';
 const api=create();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.WishFormats=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const groups={
  word:['doc','docx','docm','dot','dotx','dotm','rtf','odt','ott'],
  sheet:['xls','xlsx','xlsm','xlsb','xlt','xltx','xltm','ods','ots','csv','tsv'],
  slide:['ppt','pptx','pptm','pps','ppsx','ppsm','pot','potx','potm','odp','otp'],
  text:['md','markdown','txt','text'],
  pdf:['pdf'],
  archive:['zip','7z','rar'],
  xmind:['xmind'],
  image:['png','jpg','jpeg','webp','heic','heif','bmp','gif','avif'],
  audio:['mp3','wav','m4a','aac','flac','ogg','opus','wma','aif','aiff'],
  video:['mp4','mov','m4v','webm','mkv','avi','wmv','mpg','mpeg','ts','mts','m2ts','3gp','flv']
 };
 const targets={
  word:['pdf','docx','doc','odt','rtf','txt','html','markdown','png','jpg','webp'],
  sheet:['pdf','xlsx','xls','ods','csv','png','jpg','webp'],
  slide:['pdf','pptx','ppt','odp','png','jpg','webp'],
  text:['pdf','html','txt','markdown','docx'],
  pdf:['pdf','docx','xlsx','png','jpg','webp','txt','markdown'],
  archive:['zip','pdf','mp3'],
  xmind:['markdown','png','jpg','svg','pdf'],
  image:['jpg','png','webp','pdf','txt','markdown'],
  audio:['mp3','wav','m4a','aac','flac','ogg','opus'],
  video:['mp3','wav','m4a','aac','flac','ogg','opus','mp4','mov','m4v','webm','gif']
 };
 const labels={
  word:'Word 文档',sheet:'Excel 表格',slide:'PowerPoint 演示',text:'MD/TXT 文本',
  pdf:'PDF',archive:'压缩文件',xmind:'XMind',image:'图片',audio:'音频',video:'视频'
 };
 const extensionToGroup=new Map();
 for(const [type,exts]of Object.entries(groups)){
  for(const e of exts){
   if(extensionToGroup.has(e))throw new Error('Duplicate extension: '+e);
   extensionToGroup.set(e,type);
  }
 }
 const officeTypes=new Set(['word','sheet','slide']);
 const audioTargets=new Set(['mp3','wav','m4a','aac','flac','ogg','opus']);
 const videoTargets=new Set(['mp4','mov','m4v','webm','gif']);
 const macros=new Set(['docm','dotm','xlsm','xltm','pptm','ppsm','potm']);
 function fileExt(value){
  const name=typeof value==='string'?value:String(value?.name||'');
  const m=name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?m[1]:'';
 }
 function category(value){
  const ext=typeof value==='string'&&/^[a-z0-9]+$/i.test(value)?value.toLowerCase():fileExt(value);
  return extensionToGroup.get(ext)||null;
 }
 function canConvert(from,to){
  const ext=typeof from==='string'&&/^[a-z0-9]+$/i.test(from)?from.toLowerCase():fileExt(from);
  if(macros.has(ext))return false; // Input is recognised, but conversion is deliberately blocked.
  if(to==='markdown'&&category(ext)==='word')return ext==='docx';
  if(to==='docx'&&category(ext)==='text')return ext==='md'||ext==='markdown';
  const group=category(from);return !!group&&targets[group].includes(String(to||'').toLowerCase());
 }
 return {groups,targets,labels,officeTypes,audioTargets,videoTargets,macros,fileExt,category,canConvert,recognised:[...extensionToGroup.keys()]};
});
