import {
 Input, ALL_FORMATS, BlobSource, Output, BufferTarget, Mp3OutputFormat,
 WavOutputFormat, Conversion, canEncodeAudio
} from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
let registered=false;
export async function convert(file,target='mp3'){
 if(target!=='mp3'&&target!=='wav')throw new Error('手机本地音频暂只支持 MP3 / WAV');
 if(target==='mp3'&&!registered){
  if(!(await canEncodeAudio('mp3')))registerMp3Encoder();
  registered=true;
 }
 const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
 const output=new Output({
   format:target==='mp3'?new Mp3OutputFormat():new WavOutputFormat(),
   target:new BufferTarget()
 });
 const conversion=await Conversion.init({
   input,output,tracks:'all',video:{discard:true},
   audio:{codec:target==='mp3'?'mp3':'pcm-s16'}
 });
 if(!conversion.isValid)throw new Error('当前浏览器无法解码或编码此音视频格式');
 await conversion.execute();
 if(!output.target.buffer||output.target.buffer.byteLength<32)throw new Error('音频编码没有产生有效输出');
 return new Blob([output.target.buffer],{type:target==='mp3'?'audio/mpeg':'audio/wav'});
}
