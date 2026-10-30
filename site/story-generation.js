/** Offline asynchronous orchestration. Only the wire request may cross a future backend boundary. */
import {buildStoryContext,storySnapshot,approveProposal,ensureFresh} from './story.js';
import {assertProposal,TEXT_FIELDS,DEMO_LABEL,FIXTURE_LABEL,AI_LABEL} from './story-contract.js';
import {assertGenerationRequest,assertGenerationResult,snapshotHash,ZERO_USAGE,storyError} from './generation-contract.js';
const clone=v=>structuredClone(v);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function contextForWire(project,request){
  const c=buildStoryContext(project,request),targets=[];
  const add=(kind,item,episodeId)=>targets.push({kind,id:item.id,...(episodeId?{episodeId}:{}),values:Object.fromEntries(TEXT_FIELDS[kind].map(k=>[k,String(item[k]??'')]))});
  if(['complete','direction','bible'].includes(request.task))add('bible',{...project.bible,id:project.id});
  if(['complete','characters'].includes(request.task))project.characters.filter(ch=>!ch.archived&&(request.task==='complete'||ch.id===request.characterId)).forEach(ch=>add('character',ch));
  if(['complete','season','episode'].includes(request.task))project.episodes.filter(e=>!e.archived&&(request.task!=='episode'||e.id===request.episodeId)).forEach(e=>add('episode',e));
  if(['complete','scenes','dialogue'].includes(request.task))project.episodes.filter(e=>!e.archived&&(request.task==='complete'||e.id===request.episodeId)).forEach(e=>e.scenes.filter(s=>!s.archived&&(request.task==='complete'||s.id===request.sceneId)).forEach(s=>add('scene',s,e.id)));
  return {idea:c.idea,language:c.language,dialect:c.dialect,mode:c.mode,genre:c.genre,audience:c.audience,world:c.world,authorOnly:c.authorOnly,characters:c.characters,priorEpisodes:c.priorEpisodes,priorScenes:c.priorScenes,
    events:c.events.map(e=>({description:String(e.description||''),introducedEpisode:String(e.introducedEpisode||''),resolvedEpisode:String(e.resolvedEpisode||'')})),unresolvedThreads:c.unresolvedThreads,previousEnding:c.previousEnding,targets};
}
export async function captureGeneration(project,request,{revision=0,requestId=crypto.randomUUID()}={}) {
  try{
  // Capture both the saved canon and request synchronously BEFORE the first await.
  const baseSnapshot=storySnapshot(project),sourceProject=JSON.parse(baseSnapshot),selected=clone(request);
  const context=contextForWire(sourceProject,selected),sourceHash=await snapshotHash(baseSnapshot);
  const wire={schemaVersion:1,requestId,projectId:sourceProject.id,sourceHash,request:selected,revision,context};
  assertGenerationRequest(wire);
  return freeze({baseSnapshot,sourceProject,wire});
  }catch{throw storyError('INVALID_REQUEST');}
}
export function proposalFromResult(session,result,currentProject,expectedJobId) {
  let p;
  try{
  assertGenerationResult(result,session.wire,expectedJobId);
  // Only validated result fields may be cloned into a draft.
  p={schemaVersion:1,id:crypto.randomUUID(),projectId:session.wire.projectId,provider:result.provenance.provider,label:{demo:DEMO_LABEL,fixture:FIXTURE_LABEL,ai:AI_LABEL}[result.provenance.mode],provenance:clone(result.provenance),status:'Draft',createdAt:new Date().toISOString(),baseSnapshot:session.baseSnapshot,instructions:session.wire.request.instructions||'',task:session.wire.request.task,request:clone(session.wire.request),revision:session.wire.revision,changes:clone(result.changes)};
  assertProposal(p,p.projectId);
  }catch{throw storyError('INVALID_RESULT');}
  if(!currentProject||currentProject.id!==p.projectId)throw storyError('STORY_CHANGED');
  try{ensureFresh(currentProject,p);}catch{throw storyError('STORY_CHANGED');}
  // Dry validation uses the existing approval/identity/link guards; the returned series is discarded.
  try{approveProposal(session.sourceProject,p,{confirmed:true});}catch{throw storyError('INVALID_RESULT');}
  return p;
}
export async function createProposalAsync(project,request,adapter,{getCurrentProject=()=>project,signal,revision=0,requestId}={}) {
  if(adapter.label!==DEMO_LABEL)throw storyError('NOT_CONFIGURED');
  const cancelled=()=>{if(signal?.aborted)throw storyError('CANCELLED');};
  cancelled();const session=await captureGeneration(project,request,{revision,requestId});cancelled();
  let changes;
  try{changes=await adapter.generate({project:clone(session.sourceProject),context:buildStoryContext(session.sourceProject,session.wire.request),request:clone(session.wire.request),revision,signal});}
  catch{cancelled();throw storyError('GENERATION_FAILED');}
  cancelled();const jobId=crypto.randomUUID();
  const result={schemaVersion:1,requestId:session.wire.requestId,projectId:session.wire.projectId,sourceHash:session.wire.sourceHash,jobId,changes,provenance:{mode:'demo',provider:'deterministic-demo',model:'local-template',promptVersion:'demo-v1',requestId:session.wire.requestId,jobId,usage:{...ZERO_USAGE}}};
  let current;try{current=await getCurrentProject();}catch{throw storyError('GENERATION_FAILED');}
  cancelled();return proposalFromResult(session,result,current,jobId);
}
export async function regenerateSelectedAsync(project,proposal,adapter,options={}) {
  if(proposal.provenance?.mode==='manual')throw storyError('NOT_CONFIGURED');
  assertProposal(proposal,project.id);ensureFresh(project,proposal);
  if(proposal.status!=='Draft'||!proposal.changes.some(c=>c.selected))throw new Error('Select content in an active draft to regenerate.');
  const before=JSON.stringify(proposal),old=clone(proposal),revision=old.revision+1;
  const fresh=await createProposalAsync(project,old.request,adapter,{...options,revision});
  if(JSON.stringify(proposal)!==before)throw storyError('PROPOSAL_CHANGED');
  if(old.provenance?.promptVersion?.startsWith('agent-v1-'))fresh.provenance.promptVersion=old.provenance.promptVersion;
  const result={...old,revision,provider:fresh.provider,label:fresh.label,provenance:fresh.provenance,changes:old.changes.map(c=>c.selected?{...clone(fresh.changes.find(n=>n.id===c.id)||c),selected:true}:c)};
  assertProposal(result,project.id);return result;
}
