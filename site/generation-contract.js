/** JSON-only provider-neutral boundary. No transport, credentials, storage or provider SDK. */
import {TASKS,TEXT_FIELDS,safeStoryId,assertStoryChanges,assertGenerationProvenance,assertUsage,assertContractObject,assertContractArray} from './story-contract.js';
export const JOB_STATES=Object.freeze(['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','NOT_CONFIGURED','BLOCKED']);
export const TERMINAL_STATES=Object.freeze(JOB_STATES.slice(2));
export const ZERO_USAGE=Object.freeze({inputTokens:0,outputTokens:0,costMicros:0,currency:'USD'});
export const FAILURE_CODES=Object.freeze(['NOT_CONFIGURED','ZERO_AUTHORIZATION','BUDGET_EXCEEDED','GENERATION_FAILED','INVALID_RESULT','CANCELLED']);
function object(value,keys){assertContractObject(value,keys);}
function text(value,max=12000){if(typeof value!=='string'||value.length>max)throw new Error('Invalid generation text.');}
function fields(value,keys){object(value,keys);for(const key of keys)text(value[key]);}
function list(value,check){assertContractArray(value,400);value.forEach(check);}
export function assertGenerationRequest(value) {
  object(value,['schemaVersion','requestId','projectId','sourceHash','request','revision','context']);
  if(value.schemaVersion!==1||!safeStoryId(value.requestId)||!safeStoryId(value.projectId)||!/^[a-f0-9]{64}$/.test(value.sourceHash)||!Number.isInteger(value.revision)||value.revision<0)throw new Error('Invalid generation request.');
  object(value.request,['task','episodeId','sceneId','characterId','instructions']);
  if(!TASKS.includes(value.request.task))throw new Error('Invalid story task.');
  for(const k of ['episodeId','sceneId','characterId'])if(value.request[k]!==undefined&&value.request[k]!==''&&!safeStoryId(value.request[k]))throw new Error('Invalid request target.');
  if(value.request.instructions!==undefined)text(value.request.instructions,2000);
  const c=value.context;
  object(c,['idea','language','dialect','mode','genre','audience','world','authorOnly','characters','priorEpisodes','priorScenes','events','unresolvedThreads','previousEnding','targets']);
  for(const k of ['idea','language','dialect','mode','genre','audience','previousEnding'])text(c[k]);
  if(!['ar','en'].includes(c.language))throw new Error('Invalid generation language.');
  fields(c.world,['rules','timeline','conflict']);fields(c.authorOnly,['intendedEnding','unrevealedSecrets','warning']);
  list(c.characters,ch=>{object(ch,['id','name','role','personality','relationships','goals','fears','firstEpisode','knows','doesNotKnow']);if(!safeStoryId(ch.id)||!Number.isInteger(ch.firstEpisode)||ch.firstEpisode<1)throw new Error('Invalid context character.');for(const k of ['name','role','personality','relationships','goals','fears','knows','doesNotKnow'])text(ch[k]);});
  const scene=s=>{object(s,['id','action','dialogue','narration','timeline']);if(!safeStoryId(s.id))throw new Error('Invalid context scene.');for(const k of ['action','dialogue'])text(s[k]);if(s.narration!==undefined)text(s.narration);if(typeof s.timeline!=='number'&&typeof s.timeline!=='string')throw new Error('Invalid timeline.');};
  list(c.priorEpisodes,e=>{object(e,['id','number','ending','currentStates','continuityFacts','scenes']);if(!safeStoryId(e.id)||!Number.isInteger(e.number))throw new Error('Invalid context episode.');for(const k of ['ending','currentStates','continuityFacts'])text(e[k]);list(e.scenes,scene);});
  list(c.priorScenes,scene);
  list(c.events,e=>{fields(e,['description','introducedEpisode','resolvedEpisode']);});
  list(c.unresolvedThreads,v=>text(v));
  list(c.targets,t=>{object(t,['kind','id','episodeId','values']);if(!Object.hasOwn(TEXT_FIELDS,t.kind)||!safeStoryId(t.id)||t.episodeId!==undefined&&!safeStoryId(t.episodeId))throw new Error('Invalid context target.');object(t.values,TEXT_FIELDS[t.kind]);Object.values(t.values).forEach(v=>text(v));});
  if(new TextEncoder().encode(JSON.stringify(value)).length>256000)throw new Error('Generation context is too large. Narrow the request.');
}
export function assertGenerationResult(value,request,jobId) {
  object(value,['schemaVersion','requestId','projectId','sourceHash','jobId','changes','provenance']);
  if(value.schemaVersion!==1||value.requestId!==request.requestId||value.projectId!==request.projectId||value.sourceHash!==request.sourceHash||value.jobId!==jobId)throw new Error('Generation result does not match its request.');
  assertGenerationProvenance(value.provenance);
  if(value.provenance.requestId!==value.requestId||value.provenance.jobId!==value.jobId)throw new Error('Generation provenance does not match its job.');
  assertStoryChanges(value.changes,request.request.task);
}
export function assertJobStatus(value) {
  object(value,['schemaVersion','jobId','requestId','state','usage','error']);
  if(value.schemaVersion!==1||!safeStoryId(value.jobId)||!safeStoryId(value.requestId)||!JOB_STATES.includes(value.state))throw new Error('Invalid generation job.');
  assertUsage(value.usage);
  if(value.error!==undefined){object(value.error,['code','message','retryable']);if(!FAILURE_CODES.includes(value.error.code)||value.error.retryable!==false||value.error.message!==safeFailure(value.error.code).message)throw new Error('Invalid safe failure.');}
  if(['FAILED','BLOCKED','NOT_CONFIGURED','CANCELLED'].includes(value.state)!==!!value.error)throw new Error('Invalid job failure state.');
}
export function assertCancellation(value){object(value,['jobId']);if(!safeStoryId(value.jobId))throw new Error('Invalid cancellation.');}
export function safeFailure(code){if(!FAILURE_CODES.includes(code))code='GENERATION_FAILED';return {code,message:'Generation stopped safely. No story content was approved.',retryable:false};}
const SAFE_STORY_ERRORS=Object.freeze({
  GENERATION_FAILED:'We could not prepare the proposal. Please try again. Your saved story is unchanged.',
  INVALID_RESULT:'The proposal could not be verified. Please prepare a new proposal. Your saved story is unchanged.',
  INVALID_REQUEST:'Check your story request and try again. Your saved story is unchanged.',
  CANCELLED:'Generation was cancelled. Your saved story is unchanged.',
  NOT_CONFIGURED:'Real AI providers are not configured. Use the local DEMO.',
  STORY_CHANGED:'This series changed. Prepare a fresh proposal using the saved story.',
  PROPOSAL_CHANGED:'The proposal changed during generation. Please try again.'
});
const controlledErrors=new WeakMap();
export function storyError(code='GENERATION_FAILED') {
  if(typeof code!=='string'||!Object.hasOwn(SAFE_STORY_ERRORS,code))code='GENERATION_FAILED';
  const error=new Error(SAFE_STORY_ERRORS[code]);
  Object.defineProperty(error,'code',{value:code,enumerable:true});controlledErrors.set(error,code);
  return error; // Never retain the original error, cause, stack or diagnostic properties.
}
const LEGACY_STALE_MESSAGES=new Set([
  'The series changed. Prepare a fresh proposal before approval or regeneration.',
  'The series changed. Prepare a fresh proposal.',
  'This series changed in another tab. Reload and review a fresh identity preview before saving.',
  'The series changed. Prepare a fresh story proposal.',
  'The selected story field changed.'
]);
export function storyErrorCode(error) {
  if(error&&typeof error==='object'&&controlledErrors.has(error))return controlledErrors.get(error);
  // Only exact legacy local messages retain stale guidance; arbitrary error text is never displayed.
  try{if(LEGACY_STALE_MESSAGES.has(error?.message))return 'STORY_CHANGED';}catch{}
  return 'GENERATION_FAILED';
}
export async function snapshotHash(snapshot){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
