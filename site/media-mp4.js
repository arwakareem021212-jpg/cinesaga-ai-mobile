/** Native local H.264/AAC export. No network, microphone, provider, file writes or source mutation. */
import {localMediaAllowed} from './mobile-support.js';
const TYPES=['video/mp4;codecs=avc1.42001f,mp4a.40.2','video/mp4;codecs=avc1.42E01E,mp4a.40.2'];
export class ExportError extends Error {constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new ExportError(code);};
export function mp4Capability(){const type=typeof MediaRecorder==='function'?TYPES.find(t=>MediaRecorder.isTypeSupported(t)):null;return {available:!!type&&typeof AudioContext==='function'&&typeof HTMLCanvasElement!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function',mime:type||null};}
export function exportTiming({videoDuration,audioDuration,offset=0,trim=0,length=null,muteOriginal=true}){
 if(![videoDuration,audioDuration,offset,trim].every(Number.isFinite)||videoDuration<=0||videoDuration>60||audioDuration<=0||audioDuration>120||Math.abs(offset)>10||trim<0||trim>=audioDuration||typeof muteOriginal!=='boolean'||(length!==null&&(!Number.isFinite(length)||length<=0||length>120)))fail('INVALID_TIMING');
 const selected=Math.min(length??audioDuration-trim,audioDuration-trim),start=Math.max(0,offset),sourceStart=trim+Math.max(0,-offset),duration=Math.max(0,Math.min(selected-Math.max(0,-offset),videoDuration-start));
 if(duration<=0)fail('NO_AUDIO_OVERLAP');
 return {videoDuration,audioDuration,offset,trim,length:selected,muteOriginal,start,sourceStart,duration};
}
/** Inspect ISO BMFF structure, not MIME/extension alone. No WebM fallback may pass this gate. */
export function inspectMP4(buffer){
 const b=new Uint8Array(buffer),v=new DataView(b.buffer,b.byteOffset,b.byteLength),ascii=(a,n)=>String.fromCharCode(...b.subarray(a,a+n));
 const boxes=(start,end)=>{const out=[];for(let p=start;p<end;){if(p+8>end)fail('INVALID_MP4');let size=v.getUint32(p),header=8;if(size===1){if(p+16>end)fail('INVALID_MP4');size=Number(v.getBigUint64(p+8));header=16;}if(size===0)size=end-p;if(!Number.isSafeInteger(size)||size<header||p+size>end)fail('INVALID_MP4');out.push({type:ascii(p+4,4),start:p+header,end:p+size});p+=size;}return out;};
 const top=boxes(0,b.length),ftyp=top.find(x=>x.type==='ftyp'),moov=top.find(x=>x.type==='moov');if(!ftyp||!moov||!top.some(x=>x.type==='mdat')||ftyp.end-ftyp.start<8)fail('INVALID_MP4');
 const tracks=[];for(const trak of boxes(moov.start,moov.end).filter(x=>x.type==='trak')){const mdia=boxes(trak.start,trak.end).find(x=>x.type==='mdia');if(!mdia)fail('INVALID_MP4');const children=boxes(mdia.start,mdia.end),hdlr=children.find(x=>x.type==='hdlr'),minf=children.find(x=>x.type==='minf');if(!hdlr||hdlr.start+12>hdlr.end||!minf)fail('INVALID_MP4');const stbl=boxes(minf.start,minf.end).find(x=>x.type==='stbl');if(!stbl)fail('INVALID_MP4');const stsd=boxes(stbl.start,stbl.end).find(x=>x.type==='stsd');if(!stsd||stsd.start+8>stsd.end)fail('INVALID_MP4');const entries=boxes(stsd.start+8,stsd.end);tracks.push({handler:ascii(hdlr.start+8,4),codecs:entries.map(x=>x.type)});}
 if(!tracks.some(t=>t.handler==='vide'&&t.codecs.includes('avc1'))||!tracks.some(t=>t.handler==='soun'&&t.codecs.includes('mp4a')))fail('INVALID_MP4');
 return {container:'MP4',brand:ascii(ftyp.start,4),tracks,bytes:b.length};
}
function eventReady(el,event,signal){return new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);el.removeEventListener(event,done);el.removeEventListener('error',bad);signal?.removeEventListener('abort',cancel);};const done=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new ExportError('DECODE_FAILED'));},cancel=()=>{cleanup();reject(new ExportError('CANCELLED'));};el.addEventListener(event,done,{once:true});el.addEventListener('error',bad,{once:true});signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(bad,15000);if(signal?.aborted)cancel();});}
export async function exportLocalMP4({videoFile,audioFile,offset=0,trim=0,length=null,muteOriginal=true,signal,onProgress=()=>{}}){
 const capability=mp4Capability();if(!capability.available)fail('ENCODER_UNAVAILABLE');
 if(!localMediaAllowed(videoFile,'video')||!localMediaAllowed(audioFile,'audio'))fail('INVALID_FILES');
 if(signal?.aborted)fail('CANCELLED');
 const context=new AudioContext({sampleRate:48000}),video=document.createElement('video'),audio=document.createElement('audio'),urls=[],tracks=[];let recorder,source,raf,timer,visibilityHandler;
 const notify=(phase,progress)=>{try{onProgress({phase,progress});}catch{/* UI observers cannot corrupt encoding. */}};
 try{
  // Called directly from the owner's click; no microphone permission is requested.
  await context.resume();if(context.state!=='running')fail('PLAYBACK_BLOCKED');
  video.playsInline=true;video.preload='auto';audio.preload='auto';
  const vr=eventReady(video,'loadeddata',signal),ar=eventReady(audio,'loadedmetadata',signal);video.src=URL.createObjectURL(videoFile);audio.src=URL.createObjectURL(audioFile);urls.push(video.src,audio.src);await Promise.all([vr,ar]);
  if(!Number.isFinite(video.duration)||video.videoWidth>3840||video.videoHeight>2160||!video.videoWidth)fail('INVALID_TIMING');
  const timing=exportTiming({videoDuration:video.duration,audioDuration:audio.duration,offset,trim,length,muteOriginal});
  notify('DECODING',0);const decoded=await context.decodeAudioData(await audioFile.arrayBuffer());if(signal?.aborted)fail('CANCELLED');if(Math.abs(decoded.duration-audio.duration)>.1)fail('DECODE_FAILED');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1280/video.videoWidth,720/video.videoHeight);canvas.width=Math.max(2,Math.floor(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.floor(video.videoHeight*scale/2)*2);const draw=canvas.getContext('2d',{alpha:false});if(!draw)fail('ENCODER_UNAVAILABLE');draw.drawImage(video,0,0,canvas.width,canvas.height);
  const destination=context.createMediaStreamDestination(),original=context.createMediaElementSource(video),originalGain=context.createGain(),addedGain=context.createGain();originalGain.gain.value=muteOriginal?0:.5;addedGain.gain.value=muteOriginal?1:.5;original.connect(originalGain).connect(destination);addedGain.connect(destination);
  source=context.createBufferSource();source.buffer=decoded;source.connect(addedGain);
  const stream=canvas.captureStream(30);for(const t of destination.stream.getAudioTracks())stream.addTrack(t);tracks.push(...stream.getTracks());
  recorder=new MediaRecorder(stream,{mimeType:capability.mime,videoBitsPerSecond:3500000,audioBitsPerSecond:128000});const chunks=[];let bytes=0;
  await new Promise((resolve,reject)=>{
   let settled=false,started=false,startTime=0,lastVideo=0,lastChange=performance.now();
   const finish=error=>{if(settled)return;settled=true;cancelAnimationFrame(raf);clearTimeout(timer);video.pause();try{source.stop();}catch{}if(recorder.state!=='inactive')recorder.stop();if(error)reject(error);else resolve();};
   const cancel=()=>finish(new ExportError('CANCELLED'));signal?.addEventListener('abort',cancel,{once:true});
   visibilityHandler=()=>{if(document.hidden)finish(new ExportError('KEEP_TAB_ACTIVE'));};document.addEventListener('visibilitychange',visibilityHandler);
   recorder.ondataavailable=e=>{if(e.data.size){bytes+=e.data.size;if(bytes>128*1024*1024){finish(new ExportError('OUTPUT_LIMIT'));return;}chunks.push(e.data);}};
   recorder.onerror=()=>finish(new ExportError('ENCODE_FAILED'));
   recorder.onstop=()=>{signal?.removeEventListener('abort',cancel);if(!settled){settled=true;resolve();}};
   video.onerror=()=>finish(new ExportError('DECODE_FAILED'));
   video.onended=()=>{cancelAnimationFrame(raf);clearTimeout(timer);try{source.stop();}catch{}if(recorder.state!=='inactive')recorder.stop();};
   const loop=()=>{if(settled)return;const now=performance.now();if(Math.abs(video.currentTime-lastVideo)>.01){lastVideo=video.currentTime;lastChange=now;}if(started&&(now-lastChange>2000||Math.abs((context.currentTime-startTime)-video.currentTime)>.25)){finish(new ExportError('PLAYBACK_STALLED'));return;}draw.drawImage(video,0,0,canvas.width,canvas.height);notify('ENCODING',Math.min(99,Math.floor(video.currentTime/timing.videoDuration*100)));raf=requestAnimationFrame(loop);};
   recorder.start(250);
   video.play().then(()=>{if(settled)return;started=true;startTime=context.currentTime-video.currentTime;const elapsed=video.currentTime,skip=Math.max(0,elapsed-timing.start),remaining=timing.duration-skip;if(remaining>0)source.start(context.currentTime+Math.max(0,timing.start-elapsed),timing.sourceStart+skip,remaining);loop();}).catch(()=>finish(new ExportError('PLAYBACK_BLOCKED')));
   timer=setTimeout(()=>finish(new ExportError('PLAYBACK_STALLED')),(timing.videoDuration+10)*1000);if(signal?.aborted)cancel();
  });
  if(signal?.aborted)fail('CANCELLED');notify('VERIFYING',99);const blob=new Blob(chunks,{type:'video/mp4'}),inspection=inspectMP4(await blob.arrayBuffer());
  const check=document.createElement('video'),url=URL.createObjectURL(blob);urls.push(url);try{const ready=eventReady(check,'loadeddata',signal);check.src=url;check.preload='auto';await ready;if(!Number.isFinite(check.duration)||Math.abs(check.duration-timing.videoDuration)>.35||check.videoWidth!==canvas.width||check.videoHeight!==canvas.height)fail('INVALID_MP4');}finally{check.removeAttribute('src');check.load();}
  notify('COMPLETE',100);return {blob,inspection,timing,width:canvas.width,height:canvas.height,mode:'LOCAL_EXPORT',approved:false};
 }catch(error){if(error instanceof ExportError)throw error;fail('ENCODE_FAILED');}
 finally{cancelAnimationFrame(raf);clearTimeout(timer);if(visibilityHandler)document.removeEventListener('visibilitychange',visibilityHandler);video.pause();audio.pause();try{source?.stop();}catch{}if(recorder?.state&&recorder.state!=='inactive')recorder.stop();tracks.forEach(t=>t.stop());video.removeAttribute('src');audio.removeAttribute('src');video.load();audio.load();urls.forEach(URL.revokeObjectURL);await context.close().catch(()=>{});}
}
