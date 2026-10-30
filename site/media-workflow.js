/** Local preparation only. No provider transport, persistence or approval side effects. */
import {prepareSceneConsistency} from './scene-consistency.js';
export const MEDIA_PROVIDERS=Object.freeze(Object.fromEntries(['runway','elevenlabs','sync'].map(id=>[id,Object.freeze({status:'NOT_CONFIGURED',configured:false})])));
export const MEDIA_POLICY=Object.freeze({paidAuthorized:false,maxSpendMicros:0,automaticRetries:0});
export class MediaError extends Error {constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new MediaError(code);};
const codes=['INVALID_REQUEST','IDENTITY_BLOCKED','IMAGE_REQUIRED','IMAGE_APPROVAL_REQUIRED','INVALID_MEDIA','STALE_CONTEXT','CANCELLED','NOT_CONFIGURED','PLAYBACK_FAILED'];
export const safeMediaCode=error=>codes.includes(error?.code)?error.code:'INVALID_REQUEST';
export async function mediaHash(value){const bytes=value instanceof Blob?await value.arrayBuffer():new TextEncoder().encode(JSON.stringify(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
export async function inspectSceneImage(blob){
 if(!(blob instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size||blob.size>8*1024*1024)fail('IMAGE_REQUIRED');
 const b=new Uint8Array(await blob.arrayBuffer()),ascii=(x,y)=>String.fromCharCode(...b.slice(x,y));
 if(!({'image/png':b[0]===137&&ascii(1,4)==='PNG','image/jpeg':b[0]===255&&b[1]===216&&b[2]===255,'image/webp':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'}[blob.type]))fail('INVALID_MEDIA');
 if(typeof createImageBitmap==='function'){try{const bitmap=await createImageBitmap(blob);if(bitmap.width>8192||bitmap.height>8192){bitmap.close();fail('INVALID_MEDIA');}bitmap.close();}catch{fail('INVALID_MEDIA');}}
 return {sha256:await mediaHash(blob),bytes:blob.size,mime:blob.type};
}
/** Explicit review receipt scoped to this exact source and bytes; local preparation, not production approval. */
export async function approveSceneImage(project,sceneId,image,{confirmed=false,getAsset,getCurrentProject}={}){
 if(confirmed!==true)fail('IMAGE_APPROVAL_REQUIRED');
 const p=structuredClone(project),sourceHash=await mediaHash(p),identity=await prepareSceneConsistency(p,sceneId,{getAsset,getCurrentProject});
 if(identity.issues.some(x=>x.code==='STALE_CONTEXT'))fail('STALE_CONTEXT');
 if(identity.issues.length)fail('IDENTITY_BLOCKED');
 const meta=await inspectSceneImage(image);
 if(getCurrentProject&&await mediaHash(await getCurrentProject())!==sourceHash)fail('STALE_CONTEXT');
 return {status:'APPROVED_FOR_LOCAL_PREPARATION',projectId:p.id,sceneId,sourceHash,imageSha256:meta.sha256};
}
export async function prepareMediaPlan(project,sceneId,options,{getAsset,getCurrentProject}={}){
 const source=structuredClone(project),sourceHash=await mediaHash(source);
 if(!options||Object.keys(options).some(k=>!['image','imageApproval','motionDescription','speakerId','speechText','dialogueLanguage','emotion','attributionConfirmed'].includes(k)))fail('INVALID_REQUEST');
 const o={speakerId:'',speechText:'',dialogueLanguage:'egyptian',emotion:'neutral',attributionConfirmed:false,motionDescription:'',...options};
 if(typeof o.motionDescription!=='string'||o.motionDescription.length>1000)fail('INVALID_REQUEST');
 if(!['egyptian','msa','en'].includes(o.dialogueLanguage)||!['neutral','fear','shouting'].includes(o.emotion)||typeof o.speechText!=='string'||typeof o.speakerId!=='string'||typeof o.attributionConfirmed!=='boolean')fail('INVALID_REQUEST');
 const scene=source.episodes.flatMap(e=>e.scenes).find(s=>s.id===sceneId&&!s.archived);
 if(!scene)fail('INVALID_REQUEST');
 const identity=await prepareSceneConsistency(source,sceneId,{getAsset,getCurrentProject});
 if(identity.issues.some(x=>x.code==='STALE_CONTEXT'))fail('STALE_CONTEXT');
 if(identity.issues.length)fail('IDENTITY_BLOCKED');
 const image=await inspectSceneImage(o.image),speaker=identity.characters.find(c=>c.characterId===o.speakerId);
 if(o.speechText&&(!speaker||!o.attributionConfirmed||o.speechText.length>5000||!scene.dialogue?.includes(o.speechText)))fail('INVALID_REQUEST');
 if(getCurrentProject&&await mediaHash(await getCurrentProject())!==sourceHash)fail('STALE_CONTEXT');
 const receipt=o.imageApproval;
 if(!receipt||Object.getPrototypeOf(receipt)!==Object.prototype||Object.keys(receipt).sort().join(',')!=='imageSha256,projectId,sceneId,sourceHash,status'||receipt.status!=='APPROVED_FOR_LOCAL_PREPARATION'||receipt.projectId!==source.id||receipt.sceneId!==sceneId||receipt.sourceHash!==sourceHash||receipt.imageSha256!==image.sha256)fail('IMAGE_APPROVAL_REQUIRED');
 return {version:1,mode:'PREPARATION_ONLY',status:'NOT_CONFIGURED',approved:false,projectId:source.id,sceneId,sourceHash,image,
  imageSource:'USER_UPLOAD',imageApproval:structuredClone(receipt),motion:{description:o.motionDescription,action:scene.action||'',camera:scene.camera||'',visual:scene.visual||'',requestedSeconds:scene.seconds},
  identity:identity.characters,manualReview:[...identity.manual,'SCENE_IMAGE_LIKENESS','PROVIDER_IDENTITY_LIMITATIONS','OWNER_OUTPUT_REVIEW'],
  speech:o.speechText?{text:o.speechText,characterId:speaker.characterId,voiceVersionId:speaker.voiceVersionId,voiceDescription:speaker.attributes.voice,dialogueLanguage:o.dialogueLanguage,emotion:o.emotion,providerVoiceStatus:'NOT_CONFIGURED'}:null,
  lipSync:{status:'NOT_CONFIGURED',requires:'Owner-reviewed video, voice performance and suitable visible face'},policy:{...MEDIA_POLICY}};
}
/** Only exercises lifecycle; never produces or claims generated video/speech. Session memory only. */
export class MediaFixtureJobs {
 #jobs=new Map();#keys=new Map();
 async start(plan,{currentHash,wait=()=>new Promise(r=>setTimeout(r,120)),onStatus=()=>{}}={}){
  if(plan?.mode!=='PREPARATION_ONLY'||plan.status!=='NOT_CONFIGURED'||plan.approved!==false)fail('INVALID_REQUEST');
  const snapshot=structuredClone(plan),key=await mediaHash(snapshot);
  if(this.#keys.has(key))return this.get(this.#keys.get(key));
  const job={id:crypto.randomUUID(),mode:'DEMO / NOT REAL AI',kind:'LIFECYCLE_TEST_ONLY',status:'QUEUED',progress:0,result:null,error:null};
  this.#keys.set(key,job.id);this.#jobs.set(job.id,job);
  const notify=()=>{try{onStatus(this.get(job.id));}catch{/* Observer failures cannot change job state. */}};
  notify();
  try{for(const progress of [25,60,90]){await wait();if(job.status==='CANCELLED')return this.get(job.id);if(await currentHash()!==snapshot.sourceHash)fail('STALE_CONTEXT');if(job.status==='CANCELLED')return this.get(job.id);job.status='RUNNING';job.progress=progress;notify();}
   if(job.status==='CANCELLED')return this.get(job.id);
   if(await currentHash()!==snapshot.sourceHash)fail('STALE_CONTEXT');
   if(job.status==='CANCELLED')return this.get(job.id);
   job.status='COMPLETED';job.progress=100;job.result={mode:job.mode,approved:false,sourceHash:snapshot.sourceHash,mediaProduced:false};
  }catch(error){if(job.status!=='CANCELLED'){job.status='FAILED';job.error=safeMediaCode(error);job.result=null;}}
  notify();return this.get(job.id);
 }
 get(id){const j=this.#jobs.get(id);return j?structuredClone(j):null;}
 cancel(id){const j=this.#jobs.get(id);if(j&&['QUEUED','RUNNING'].includes(j.status)){j.status='CANCELLED';j.error='CANCELLED';j.result=null;}return this.get(id);}
}
/** Positive offset delays audio. Preview only: no muxing, dubbing or lip modification. */
export function audioPosition(videoTime,offset,audioDuration){if(![videoTime,offset,audioDuration].every(Number.isFinite)||Math.abs(offset)>10||audioDuration<=0)fail('INVALID_MEDIA');const time=videoTime-offset;return {time:Math.max(0,Math.min(time,audioDuration)),active:time>=0&&time<audioDuration};}
