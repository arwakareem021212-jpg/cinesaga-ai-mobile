import {TEXT_FIELDS,MANUAL_LABEL,assertProposal} from './story-contract.js';
import {assertManualWork} from './manual-work-contract.js';
import {prepareManualStory,prepareManualRevision} from './manual-story.js';
import {approveProposal,storySnapshot} from './story.js';
const errors=new WeakMap();
function fail(code){const e=Error('Manual review could not be completed.');errors.set(e,code);throw e;}
export const workErrorCode=e=>errors.get(e);
export function newManualWork(p,proposal=null){return {type:'MANUAL_STORY_WORK',projectId:p.id,idea:p.idea,kind:'concept',episodeId:p.episodes.find(e=>!e.archived)?.id||'',characterIds:p.characters.filter(c=>!c.archived).map(c=>c.id),dialogueLanguage:'egyptian',format:'plain',text:'',excerpt:'',destination:'',status:'Draft',baseSnapshot:storySnapshot(p),draftFingerprint:JSON.stringify(proposal),prepared:null,mappedProposalId:''};}
export function checkWorkFresh(p,w,proposal=null){assertManualWork(w);if(!p||p.id!==w.projectId||storySnapshot(p)!==w.baseSnapshot)fail('workStale');if(JSON.stringify(proposal)!==w.draftFingerprint)fail('workDraftChanged');}
/** Rebind only when the owner explicitly requests a fresh review. Never approves. */
export function refreshManualWork(p,w,proposal=null){assertManualWork(w);if(p.id!==w.projectId)fail('workStale');return {...structuredClone(w),baseSnapshot:storySnapshot(p),draftFingerprint:JSON.stringify(proposal),prepared:null,mappedProposalId:'',destination:'',excerpt:'',status:'Draft'};}
export function prepareWork(p,w,proposal=null,revision=false){
  checkWorkFresh(p,w,proposal);
  const options={kind:revision?(proposal.request.episodeId?'episode':'concept'):w.kind,episodeId:revision?proposal.request.episodeId:w.episodeId,characterIds:w.characterIds,dialogueLanguage:w.dialogueLanguage,idea:w.idea,format:w.format};
  return revision?prepareManualRevision(p,proposal,options):prepareManualStory(p,options,proposal);
}
/** Rebuild targets from captured canon, never deserialize provider-supplied mappings. */
export function restoreWorkSession(w){
  assertManualWork(w);if(!w.prepared)return null;
  const p=JSON.parse(w.baseSnapshot),proposal=JSON.parse(w.draftFingerprint),session=prepareWork(p,w,proposal,w.prepared.revision);
  session.prompt=session.prompt.replaceAll(session.id,w.prepared.id);session.id=w.prepared.id;return session;
}
export function plainDestinations(p){
  const rows=[],add=(target,field,label)=>rows.push({key:JSON.stringify({target,field}),target,field,label});
  for(const field of TEXT_FIELDS.bible)add({kind:'bible',id:p.id},field,{kind:'bible'});
  for(const e of p.episodes.filter(e=>!e.archived)){
    for(const field of TEXT_FIELDS.episode)add({kind:'episode',id:e.id},field,{kind:'episode',episode:e.number});
    for(const sc of e.scenes.filter(s=>!s.archived))for(const field of TEXT_FIELDS.scene)add({kind:'scene',id:sc.id,episodeId:e.id},field,{kind:'scene',episode:e.number,scene:sc.number});
  }return rows;
}
export function mapPlainWork(p,w,proposal=null){
  checkWorkFresh(p,w,proposal);if(w.status!=='Draft')fail('workRejected');
  const row=plainDestinations(p).find(r=>r.key===w.destination);if(!row)fail('chooseDestination');
  const text=w.excerpt.trim()?w.excerpt:w.text;if(!text.trim())fail('emptyText');if(text.length>12000)fail('choosePassage');
  const target=row.target.kind==='bible'?p.bible:row.target.kind==='episode'?p.episodes.find(e=>e.id===row.target.id):p.episodes.find(e=>e.id===row.target.episodeId).scenes.find(s=>s.id===row.target.id);
  const change={id:crypto.randomUUID(),target:structuredClone(row.target),field:row.field,before:target[row.field],value:text,selected:true};
  const provenance={mode:'manual',provider:'manual-external',model:'unverified-source',promptVersion:'manual-story-v1',requestId:crypto.randomUUID(),jobId:crypto.randomUUID(),usage:{inputTokens:0,outputTokens:0,costMicros:0,currency:'USD'}};
  let next;
  if(w.mappedProposalId&&proposal?.id===w.mappedProposalId&&proposal.status==='Draft'&&proposal.provenance?.mode==='manual'){
    next=structuredClone(proposal);const index=next.changes.findIndex(c=>JSON.stringify(c.target)===JSON.stringify(row.target)&&c.field===row.field);
    if(index<0)next.changes.push(change);else next.changes[index]={...change,id:next.changes[index].id};next.revision++;next.provenance=provenance;
  }else next={schemaVersion:1,id:crypto.randomUUID(),projectId:p.id,provider:'manual-external',label:MANUAL_LABEL,provenance,status:'Draft',createdAt:new Date().toISOString(),baseSnapshot:w.baseSnapshot,instructions:'Owner-selected destination for external text.',task:'complete',request:{task:'complete',instructions:'Owner-selected destination for external text.'},revision:0,changes:[change]};
  try{assertProposal(next,p.id);approveProposal(p,next,{confirmed:true});}catch{fail('invalidDestination');}return next;
}
