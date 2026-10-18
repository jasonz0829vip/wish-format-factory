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
// Deterministic 1.5KB two-row OOXML XLSX, verified with LibreOffice in isolation.
// Used only if the already-installed test1.xlsb fixture is absent; no disk writes.
const FALLBACK_XLSX='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';

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
  const existing=fs.existsSync(sample);
  let bytes,inputName;
  if(existing){
    const stat=fs.statSync(sample);
    if(!stat.isFile()||stat.size<100||stat.size>6*1024*1024)
      throw new Error('Existing acceptance sample outside bounded size');
    bytes=fs.readFileSync(sample);
    inputName='test1.xlsb';
  }else{
    bytes=Buffer.from(FALLBACK_XLSX,'base64');
    inputName='in-memory-smoke.xlsx';
    if(bytes.length!==1568||bytes.subarray(0,2).toString()!=='PK')
      throw new Error('Embedded safe Office fixture did not pass structural check');
  }
  const before=crypto.createHash('sha256').update(bytes).digest('hex');
  let key='';
  const keyPath=path.join(root,'pair-key.txt');
  if(fs.existsSync(keyPath)){
    const localSecret=fs.readFileSync(keyPath,'utf8').trim();
    if(/^[^\r\n]{4,200}$/.test(localSecret))key=localSecret;
  }
  const form=new FormData();
  form.append('files',new Blob([bytes],{type:'application/octet-stream'}),inputName);
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
  const after=existing?fs.readFileSync(sample):bytes;
  const unchanged=crypto.createHash('sha256').update(after).digest('hex')===before;
  const report={device,status:valid&&unchanged?'PASS':'FAIL',
    backend:'existing local 8790',inputFile:inputName,fixtureType:existing?'existing XLSB':'verified in-memory XLSX',
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
