'use strict';
/*
 * One-shot, bounded read/convert/verify smoke for already-running Windows wish-factory.
 * Uses Node built-ins only. Does not install or deploy anything; never prints pairing keys.
 * Usage: node checks/verify-live-windows-converter.cjs
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');

function findRunningRoot(){
  try{
    const cmd="$port = Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($port) { (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $port.OwningProcess)).CommandLine }";
    const line=execFileSync('powershell.exe',['-NoProfile','-Command',cmd],{encoding:'utf8',timeout:4500,windowsHide:true});
    const found=line.match(/([A-Za-z]:\\[^"'\r\n]*?\\server\.cjs)/i);
    if(found)return path.dirname(found[1]);
  }catch(_){/* fallback below */}
  const home=process.env.USERPROFILE||os.homedir();
  const candidate=path.join(home,'MobileTools','wish-factory');
  return fs.existsSync(path.join(candidate,'server.cjs'))?candidate:null;
}
async function main(){
  const root=findRunningRoot();
  const device=os.hostname();
  if(!root){
    console.log(JSON.stringify({device,status:'BLOCKED',reason:'Running 8790 service root not detected; no files changed'}));
    process.exitCode=2;return;
  }
  const sample=path.join(root,'NativeFormatTests','test1.xlsb');
  if(!fs.existsSync(sample)){
    console.log(JSON.stringify({device,status:'BLOCKED',reason:'No existing small XLSB acceptance fixture; no files changed'}));
    process.exitCode=2;return;
  }
  const sampleInfo=fs.statSync(sample);
  if(!sampleInfo.isFile()||sampleInfo.size<100||sampleInfo.size>6*1024*1024)
    throw new Error('Known sample missing or outside bounded size');
  const bytes=fs.readFileSync(sample);
  const before=crypto.createHash('sha256').update(bytes).digest('hex');
  let key='';
  const keyPath=path.join(root,'pair-key.txt');
  if(fs.existsSync(keyPath)){
    const localSecret=fs.readFileSync(keyPath,'utf8').trim();
    if(/^[^\r\n]{4,200}$/.test(localSecret))key=localSecret;
  }
  const form=new FormData();
  form.append('files',new Blob([bytes],{type:'application/octet-stream'}),'test1.xlsb');
  form.append('target','pdf');
  const start=performance.now();
  const headers=key?{'x-wish-key':key}:{};
  let result;
  try{
    result=await fetch('http://127.0.0.1:8790/api/convert',{
      method:'POST',headers,body:form,signal:AbortSignal.timeout(35000)
    });
  }catch(error){
    console.log(JSON.stringify({device,status:'BLOCKED',reason:'Existing converter not reachable',errorType:error.name}));
    process.exitCode=2;return;
  }
  if(!result.ok){
    console.log(JSON.stringify({device,status:'BLOCKED',reason:result.status===401?'Local pairing required':'Existing converter refused fixture',httpStatus:result.status}));
    process.exitCode=2;return;
  }
  const output=Buffer.from(await result.arrayBuffer());
  const elapsedMs=Math.round(performance.now()-start);
  const valid=output.length>250&&output.subarray(0,5).toString('ascii')==='%PDF-';
  const unchanged=crypto.createHash('sha256').update(fs.readFileSync(sample)).digest('hex')===before;
  const report={device,status:valid&&unchanged?'PASS':'FAIL',
    backend:'existing local 8790',realInput:'test1.xlsb',
    inputBytes:bytes.length,outputBytes:output.length,pdfMagicValid:valid,
    sourceSHA256Unchanged:unchanged,elapsedMs,newDependencies:0,
    deployedApplicationUnchanged:true,pairingKeyExposed:false};
  console.log(JSON.stringify(report));
  if(!valid||!unchanged)process.exitCode=1;
}
main().catch(error=>{
  console.log(JSON.stringify({status:'FAIL',errorType:error.name,message:String(error.message||'').slice(0,140)}));
  process.exitCode=1;
});
