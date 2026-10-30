/** Local, unapproved scratch work. No new database store or schema version. */
import {assertContractObject,assertContractArray,safeStoryId} from './story-contract.js';
export const manualWorkKey=id=>`${id}:manual-story-work`;
const keys=['type','projectId','idea','kind','episodeId','characterIds','dialogueLanguage','format','text','excerpt','destination','status','baseSnapshot','draftFingerprint','prepared','mappedProposalId'];
export function assertManualWork(w,key=manualWorkKey(w?.projectId)){
  assertContractObject(w,keys);
  if(Object.keys(w).length!==keys.length||w.type!=='MANUAL_STORY_WORK'||!safeStoryId(w.projectId)||key!==manualWorkKey(w.projectId)||!['concept','episode'].includes(w.kind)||!['egyptian','msa','english'].includes(w.dialogueLanguage)||!['plain','structured'].includes(w.format)||!['Draft','Rejected'].includes(w.status))throw Error('Invalid manual work.');
  for(const [field,max] of [['idea',5000],['text',256000],['excerpt',12000],['destination',500],['baseSnapshot',5000000],['draftFingerprint',5000000]])if(typeof w[field]!=='string'||w[field].length>max)throw Error('Invalid manual work text.');
  if(new TextEncoder().encode(w.text).length>256000)throw Error('Manual text is too large.');
  for(const field of ['episodeId','mappedProposalId'])if(w[field]!==''&&!safeStoryId(w[field]))throw Error('Invalid manual work link.');
  assertContractArray(w.characterIds,100);if(new Set(w.characterIds).size!==w.characterIds.length||w.characterIds.some(id=>!safeStoryId(id)))throw Error('Invalid manual work cast.');
  if(w.prepared!==null){assertContractObject(w.prepared,['id','revision']);if(Object.keys(w.prepared).length!==2||!safeStoryId(w.prepared.id)||typeof w.prepared.revision!=='boolean')throw Error('Invalid manual prompt.');}
}
