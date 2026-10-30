import * as model from './model.js';
import {bindScene} from './identity.js';
import {assertProposal,assertStoryChanges,TASKS} from './story-contract.js';
export {DEMO_LABEL,TASKS,TEXT_FIELDS,NEW_FIELDS} from './story-contract.js';
const clone=value=>structuredClone(value);
export const storyDraftKey=projectId=>`${projectId}:story-proposal`;
export const storySnapshot=project=>JSON.stringify(project);
export function textEligibility(project,request={}) {
  const reasons=[];
  if(project?.originalStory)reasons.push('The approved original story is protected from rewriting.');
  if(!project||!TASKS.includes(request.task))reasons.push('Choose a story request.');
  if(!project?.idea?.trim())reasons.push('Write a story idea first.');
  const episode=project?.episodes.find(e=>e.id===request.episodeId&&!e.archived);
  if(['episode','scenes','dialogue'].includes(request.task)&&!episode)reasons.push('Choose an active episode.');
  if(request.task==='dialogue'&&!episode?.scenes.some(s=>s.id===request.sceneId&&!s.archived))reasons.push('Choose an active scene.');
  if(request.task==='scenes'&&!request.sceneId&&!project?.locations.some(l=>!l.archived))reasons.push('Add a location before proposing a scene.');
  if(request.task==='scenes'&&request.sceneId&&!episode?.scenes.some(s=>s.id===request.sceneId&&!s.archived))reasons.push('Choose an active scene.');
  if(request.task==='characters'&&request.characterId&&!project?.characters.some(c=>c.id===request.characterId&&!c.archived))reasons.push('Choose an active character.');
  return {allowed:!reasons.length,reasons,manualApprovalRequired:true};
}
function timedKnowledge(text,episode,scene) {
  return String(text||'').split('\n').filter(line=>{const suffix=line.match(/\|\s*episode:(\d+)(?:\s*\|\s*scene:(\d+))?\s*$/i);return !suffix||Number(suffix[1])<episode||Number(suffix[1])===episode&&Number(suffix[2]||1)<=scene;}).join('\n');
}
/** Only saved canon enters context. Draft proposals, image bytes and API credentials never enter. */
export function buildStoryContext(project,request={}) {
  const gate=textEligibility(project,request);if(!gate.allowed)throw new Error(gate.reasons.join(' '));
  const episode=project.episodes.find(e=>e.id===request.episodeId),scene=episode?.scenes.find(s=>s.id===request.sceneId),episodeNumber=episode?.number||1,sceneNumber=scene?.number||1;
  const prior=project.episodes.filter(e=>!e.archived&&e.number<episodeNumber).sort((a,b)=>a.number-b.number);
  return {schemaVersion:1,projectId:project.id,sourceUpdatedAt:project.updatedAt,idea:project.idea,language:project.config.language,dialect:project.config.dialect,mode:project.config.controlMode,genre:project.config.genre,audience:project.config.audience,
    world:{rules:project.bible.worldRules,timeline:project.bible.timeline,conflict:project.bible.conflict},
    authorOnly:{intendedEnding:project.bible.ending,unrevealedSecrets:project.bible.unrevealedSecrets,warning:'Author plans are not character knowledge.'},
    characters:project.characters.filter(c=>!c.archived).map(c=>({id:c.id,name:c.name,role:c.role,personality:c.personality,relationships:c.relationships,goals:c.goals,fears:c.fears,firstEpisode:c.firstEpisode,knows:c.firstEpisode<=episodeNumber?timedKnowledge(c.knows,episodeNumber,sceneNumber):'',doesNotKnow:c.doesNotKnow})),
    priorEpisodes:prior.map(e=>({id:e.id,number:e.number,ending:e.ending,currentStates:e.currentStates,continuityFacts:e.continuityFacts,scenes:e.scenes.filter(s=>!s.archived).map(s=>({id:s.id,action:s.action,dialogue:s.dialogue,narration:s.narration,timeline:s.timeline}))})),
    priorScenes:(episode?.scenes||[]).filter(s=>!s.archived&&s.number<sceneNumber).map(s=>({id:s.id,action:s.action,dialogue:s.dialogue,timeline:s.timeline})),
    events:project.events.filter(e=>Number(e.introducedEpisode)<=episodeNumber).map(e=>({...clone(e),resolvedEpisode:Number(e.resolvedEpisode)>episodeNumber?0:e.resolvedEpisode})),
    unresolvedThreads:[...prior.map(e=>e.unresolvedEvents),episode?.unresolvedEvents||'',...project.events.filter(e=>Number(e.introducedEpisode)<=episodeNumber&&(!e.resolvedEpisode||e.resolvedEpisode>episodeNumber)).map(e=>e.description)].filter(Boolean),
    previousEnding:prior.at(-1)?.ending||'',
    target:clone(request),sceneBindings:clone(scene?.characterBindings||[]),limitations:'Recorded facts only. No semantic consistency or real AI assessment is claimed.'};
}
function targetOf(project,target) {
  if(target.kind==='bible')return target.id===project.id?project.bible:null;
  if(target.kind==='character')return project.characters.find(c=>c.id===target.id&&!c.archived);
  if(target.kind==='episode')return project.episodes.find(e=>e.id===target.id&&!e.archived);
  return project.episodes.find(e=>e.id===target.episodeId&&!e.archived)?.scenes.find(s=>s.id===target.id&&!s.archived);
}
export function createProposal(project,request,adapter,revision=0) {
  const baseSnapshot=storySnapshot(project),requestId=crypto.randomUUID(),jobId=crypto.randomUUID();
  const context=buildStoryContext(project,request),changes=adapter.generate({project:clone(project),context,request:clone(request),revision});
  const proposal={schemaVersion:1,id:crypto.randomUUID(),projectId:project.id,provider:'deterministic-demo',label:adapter.label,provenance:{mode:'demo',provider:'deterministic-demo',model:'local-template',promptVersion:'demo-v1',requestId,jobId,usage:{inputTokens:0,outputTokens:0,costMicros:0,currency:'USD'}},status:'Draft',createdAt:new Date().toISOString(),baseSnapshot,instructions:String(request.instructions||''),task:request.task,request:clone(request),revision,changes};
  assertProposal(proposal,project.id);ensureFresh(project,proposal);assertProposalScope(project,proposal);return proposal;
}
function assertProposalScope(project,proposal){
  const request=proposal.request;
  const gate=textEligibility(project,request);if(!gate.allowed)throw new Error(gate.reasons.join(' '));
  for(const change of proposal.changes){const target=change.target;
    if(target.kind==='bible'&&target.id!==project.id)throw new Error('Proposal exceeds the selected scope.');
    if(proposal.task==='characters'&&(request.characterId?target.id!==request.characterId||change.field==='$new':change.field!=='$new'))throw new Error('Proposal exceeds the selected character.');
    if(proposal.task==='episode'&&target.id!==request.episodeId)throw new Error('Proposal exceeds the selected episode.');
    if(['scenes','dialogue'].includes(proposal.task)&&(target.episodeId!==request.episodeId||(request.sceneId?target.id!==request.sceneId||change.field==='$new':change.field!=='$new')))throw new Error('Proposal exceeds the selected scene.');
  }
}
export function regenerateSelected(project,proposal,adapter) {
  if(proposal.provenance?.mode==='manual')throw new Error('Use a manual revision prompt for external candidates.');
  assertProposal(proposal,project.id);ensureFresh(project,proposal);
  if(proposal.status!=='Draft')throw new Error('Rejected proposals cannot be changed. Prepare a new proposal.');
  if(!proposal.changes.some(c=>c.selected))throw new Error('Select content to regenerate.');
  const revision=proposal.revision+1,fresh=createProposal(project,proposal.request,adapter,revision),result=clone(proposal);
  result.revision=revision;
  result.provenance=clone(fresh.provenance);
  result.changes=proposal.changes.map(change=>change.selected?{...clone(fresh.changes.find(c=>c.id===change.id)||change),selected:true}:clone(change));
  assertProposal(result,project.id);return result;
}
export function ensureFresh(project,proposal) {
  if(storySnapshot(project)!==proposal.baseSnapshot)throw new Error('The series changed. Prepare a fresh proposal before approval or regeneration.');
  if(project.storyHistory?.some(record=>record.proposalId===proposal.id))throw new Error('This proposal was already approved.');
}
export function approveProposal(project,proposal,{confirmed=false}={}) {
  assertProposal(proposal,project.id);ensureFresh(project,proposal);assertProposalScope(project,proposal);
  if(!confirmed||proposal.status!=='Draft')throw new Error('Explicit approval of a draft is required.');
  const changes=proposal.changes.filter(c=>c.selected);if(!changes.length)throw new Error('Select content to approve.');
  assertStoryChanges(changes,proposal.task);
  const next=clone(project);
  for(const change of changes){
    if(change.field==='$new'){
      if(change.target.kind==='character'){
        if(next.characters.some(c=>c.id===change.target.id))throw new Error('Character already exists.');
        next.characters.push({...model.newCharacter(),...clone(change.value),id:change.target.id});
      }else if(change.target.kind==='episode'){
        if(next.episodes.some(e=>e.id===change.target.id||e.number===change.value.number)||next.episodes.filter(e=>!e.archived).length>=24)throw new Error('Episode target changed.');
        next.episodes.push({...model.newEpisode(change.value.number,project.config.episodeMinutes),...clone(change.value),id:change.target.id});
      }else{
        const episode=next.episodes.find(e=>e.id===change.target.episodeId&&!e.archived);if(!episode||next.episodes.some(e=>e.scenes.some(s=>s.id===change.target.id)))throw new Error('Scene target changed.');
        if(!next.locations.some(l=>l.id===change.value.locationId&&!l.archived)||change.value.characterIds?.some(id=>!next.characters.some(c=>c.id===id&&!c.archived)))throw new Error('Scene links are invalid.');
        let scene={...model.newScene(Math.max(0,...episode.scenes.map(s=>s.number))+1),...clone(change.value),id:change.target.id};
        if(next.identitySchemaVersion)scene=bindScene(next,episode,scene);
        episode.scenes.push(scene);
      }
    }else{
      const target=targetOf(next,change.target);if(!target||target[change.field]!==change.before)throw new Error('The selected story field changed.');
      target[change.field]=change.value;
    }
  }
  next.title=next.bible.title;
  next.storyHistory ||= [];
  next.storyHistory.push({proposalId:proposal.id,provider:proposal.provider,label:proposal.label,...(proposal.provenance?{provenance:clone(proposal.provenance)}:{}),task:proposal.task,approvedAt:new Date().toISOString(),changes:clone(changes)});
  next.updatedAt=new Date(Math.max(Date.now(),Date.parse(project.updatedAt)+1)).toISOString();
  const validation=model.validateBackup(model.makeBackup([next]),{allowMissingAssets:true});if(!validation.valid)throw new Error(validation.errors.join(' '));
  return next;
}
export function proposalReview(project,proposal) {
  const candidate=approveProposal(project,proposal,{confirmed:true}),before=new Set(model.checkContinuity(project).map(i=>i.rule+'|'+i.evidence));
  return model.checkContinuity(candidate).filter(i=>!before.has(i.rule+'|'+i.evidence));
}
