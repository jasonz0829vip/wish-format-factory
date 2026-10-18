/* Local-only ZIP browsing, without executing extracted content. */
(function(){
'use strict';
const LIMIT={files:80,total:100*1048576,single:30*1048576};
function validate(raw){
 if(!raw||typeof raw!=='string'||raw.length>500||raw.includes('\0'))throw Error('压缩包存在非法文件名');
 const s=raw.replace(/\\/g,'/');
 const parts=s.split('/');
 if(s.startsWith('/')||/^[A-Za-z]:/.test(s)||parts.some(x=>!x||x==='..'||x==='.'||x.includes(':')||/[<>|"?*]/.test(x)))
  throw Error('压缩包含危险文件路径：'+s.slice(0,100));
 return s;
}
async function open(file,progress){
 if(!window.JSZip)throw Error('ZIP 组件未就绪');
 if(!/\.zip$/i.test(file.name))throw Error('浏览器只能离线解压 ZIP；RAR/7Z 需要 Windows 引擎');
 if(file.size>90*1048576)throw Error('手机端 ZIP 文件大于 90MB；请使用 Windows 完整版');
 const zip=await window.JSZip.loadAsync(file,{createFolders:false});
 const selected=Object.values(zip.files).filter(x=>!x.dir);
 if(!selected.length)throw Error('ZIP 内没有文件');
 if(selected.length>LIMIT.files)throw Error('文件超过 '+LIMIT.files+' 个；请使用 Windows 完整版');
 const names=new Set();let expected=0;
 for(const x of selected){
  const safe=validate(x.unsafeOriginalName||x.name);x.__wishname=safe;
  if(names.has(safe.toLowerCase()))throw Error('压缩包包含重名文件，无法安全解包');
  names.add(safe.toLowerCase());
  const mode=typeof x.unixPermissions==='number'?x.unixPermissions:parseInt(x.unixPermissions,8);
  if(Number.isInteger(mode)&&(mode&0o170000)===0o120000)throw Error('压缩包含符号链接，已停止');
  const size=Number(x._data?.uncompressedSize);
  if(!Number.isSafeInteger(size)||size<0||size>LIMIT.single)throw Error('单个文件超过 30MB 限额');
  expected+=size;if(expected>LIMIT.total)throw Error('解压后超过 100MB；请使用 Windows 完整版');
 }
 const unpacked=[];
 for(const [idx,entry]of selected.entries()){
  if(progress)progress('解压 '+(idx+1)+' / '+selected.length+'：'+entry.__wishname);
  let bytes;
  try{bytes=await entry.async('uint8array')}catch(e){throw Error('无法解压，压缩包可能加密或损坏：'+entry.__wishname)}
  if(bytes.byteLength!==entry._data.uncompressedSize)throw Error('解压大小验证失败');
  unpacked.push({name:entry.__wishname,blob:new Blob([bytes])});
 }
 return unpacked;
}
window.WishZip={open};
})();
