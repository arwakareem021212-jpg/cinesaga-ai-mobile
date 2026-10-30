/** Read-only scene identity preparation. Never changes bindings, approvals or image bytes. */
import {ATTRIBUTES,characterIdentity,getVersion,expectedVersionId,locksForMode,negativeInstructionsForBoard,identityContinuity} from './identity.js';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
export function reviewSceneConsistency(project,sceneId,overrides={}){
 const issues=[],characters=[],manual=[];const problem=(code,characterId='',field='')=>issues.push({code,characterId,field});
 const matches=project.episodes.flatMap(e=>e.scenes.filter(s=>s.id===sceneId).map(scene=>({episode:e,scene})));
 const scene=matches[0]?.scene;
 if(matches.length!==1||scene.archived||matches[0].episode.archived)problem('SCENE_UNAVAILABLE');
 if(!scene)return {sceneId,characters,issues,manual,status:'BLOCKED',generationStatus:'NOT_CONFIGURED',visualCheck:'NOT_CONFIGURED'};
 const ids=scene.characterIds||[];
 if(new Set(ids).size!==ids.length)problem('DUPLICATE_CHARACTER');
 if((scene.characterBindings||[]).some(b=>!ids.includes(b.characterId)))problem('BINDING_CONFLICT');
 const sources=[scene.identityOverrides||{},overrides];
 for(const source of sources){if(!plain(source)){problem('INVALID_OVERRIDE');continue;}for(const [id,values] of Object.entries(source)){
  if(!ids.includes(id)||!plain(values)){problem('INVALID_OVERRIDE',id);continue;}
  for(const [key,value] of Object.entries(values))if(!ATTRIBUTES.includes(key)||typeof value!=='string'||value.length>5000)problem('INVALID_OVERRIDE',id,ATTRIBUTES.includes(key)?key:'');
 }}
 for(const characterId of ids){
  const found=project.characters.filter(c=>c.id===characterId),c=found[0];
  if(found.length!==1||c.archived){problem('CHARACTER_UNAVAILABLE',characterId);continue;}
  const bindings=(scene.characterBindings||[]).filter(b=>b.characterId===characterId),binding=bindings[0],v=getVersion(c,binding?.appearanceVersionId);
  if(bindings.length!==1||!v){problem('BINDING_REQUIRED',characterId);continue;}
  if(v.status!=='Approved and locked'||v.board.status!=='Approved and locked')problem('APPROVAL_REQUIRED',characterId);
  const locks=locksForMode(v.board.lockMode,v.board.locks),attributes=structuredClone(v.board.attributes);
  if(binding.referenceBoardId!==v.board.id||binding.outfitVersionId!==v.outfitVersionId||expectedVersionId(project,c,matches[0].episode,scene)!==v.id)problem('BINDING_CONFLICT',characterId);
  const voice=characterIdentity(c).versions.find(version=>version.voiceVersionId===binding.voiceVersionId&&version.board.approvedAt);
  if(!voice)problem('VOICE_VERSION_MISMATCH',characterId);
  for(const key of ATTRIBUTES)if(locks[key]&&binding.lockedValues?.[key]!==attributes[key])problem('LOCK_CONFLICT',characterId,key);
  if(voice)attributes.voice=voice.board.attributes.voice;
  for(const source of sources)if(plain(source)&&plain(source[characterId]))for(const [key,value] of Object.entries(source[characterId])){
   if(!ATTRIBUTES.includes(key)||typeof value!=='string'||value.length>5000)continue;
   if((locks[key]||key==='voice')&&value!==(key==='voice'?attributes.voice:v.board.attributes[key]))problem(key==='voice'?'VOICE_PROTECTED':'LOCK_CONFLICT',characterId,key);
   else attributes[key]=value;
  }
  const refs=characterIdentity(c).references;
  const references=[];
  if(!v.board.referenceIds.length)problem('REFERENCE_REQUIRED',characterId);
  for(const id of v.board.referenceIds){const found=refs.filter(r=>r.id===id&&!r.archived);if(found.length!==1||!found[0].assetId)problem('REFERENCE_REQUIRED',characterId);else references.push({referenceId:id,assetId:found[0].assetId,kind:found[0].kind,primary:id===v.board.primaryReferenceId});}
  if(references.filter(r=>r.primary).length!==1)problem('PRIMARY_REQUIRED',characterId);
  characters.push({characterId,name:c.name,appearanceVersionId:v.id,versionNumber:v.number,referenceBoardId:v.board.id,outfitVersionId:binding.outfitVersionId,voiceVersionId:binding.voiceVersionId,locks,attributes,references,negativeInstructions:negativeInstructionsForBoard(v.board)});
 }
 for(const issue of identityContinuity(project).filter(i=>i.sceneId===sceneId)){
  if(issue.rule==='identity-regeneration')manual.push('REGENERATION_REQUIRED');else problem('BINDING_CONFLICT',issue.characterId||'');
 }
 if(scene.appearanceOverrides?.trim()||scene.clothingOverrides?.trim())manual.push('FREE_TEXT_REVIEW');
 return {sceneId,characters,issues,manual:[...new Set(manual)],status:issues.length?'BLOCKED':manual.length?'REVIEW_REQUIRED':'CONSISTENT_METADATA',generationStatus:'NOT_CONFIGURED',visualCheck:'NOT_CONFIGURED'};
}
export async function prepareSceneConsistency(project,sceneId,{overrides={},getAsset,getCurrentProject}={}){
 const snapshot=JSON.stringify(project),source=structuredClone(project),report=reviewSceneConsistency(source,sceneId,structuredClone(overrides));
 for(const character of report.characters)for(const reference of character.references){
  try{const asset=await getAsset?.(reference.assetId);
   if(!asset||asset.id!==reference.assetId||asset.projectId!==source.id||!(asset.blob instanceof Blob)||!['image/png','image/jpeg','image/webp','image/gif'].includes(asset.blob.type)||!asset.blob.size||asset.blob.size>8*1024*1024)throw Error();
   const data=await asset.blob.arrayBuffer(),b=new Uint8Array(data),ascii=(a,z)=>String.fromCharCode(...b.slice(a,z));
   const valid={'image/png':b[0]===137&&ascii(1,4)==='PNG','image/jpeg':b[0]===255&&b[1]===216&&b[2]===255,'image/gif':ascii(0,6)==='GIF87a'||ascii(0,6)==='GIF89a','image/webp':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'}[asset.blob.type];
   if(!valid)throw Error();
   if(typeof createImageBitmap==='function'){const bitmap=await createImageBitmap(asset.blob);bitmap.close();}
   reference.sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');reference.bytes=data.byteLength;
  }catch{report.issues.push({code:'IMAGE_UNAVAILABLE',characterId:character.characterId,field:''});}
 }
 if(getCurrentProject&&JSON.stringify(await getCurrentProject())!==snapshot)report.issues.push({code:'STALE_CONTEXT',characterId:'',field:''});
 report.status=report.issues.length?'BLOCKED':report.manual.length?'REVIEW_REQUIRED':'CONSISTENT_METADATA';
 return report;
}
