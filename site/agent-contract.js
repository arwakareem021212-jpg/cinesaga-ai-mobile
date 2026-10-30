/** Local agent work and verbatim originals; additive records, no storage migration. */
import {assertContractObject,safeStoryId,TEXT_FIELDS} from './story-contract.js';
export const agentWorkKey=id=>`${id}:story-agent-work`;
const keys=['type','projectId','baseSnapshot','idea','dialogueLanguage','scenesPerEpisode','mode','originalText','status'];
export function assertAgentWork(w,key=agentWorkKey(w?.projectId)){
 assertContractObject(w,keys);
 if(Object.keys(w).length!==keys.length||w.type!=='STORY_AGENT_WORK'||!safeStoryId(w.projectId)||key!==agentWorkKey(w.projectId)||!['develop','original'].includes(w.mode)||!['Draft','Rejected'].includes(w.status)||!['egyptian','msa','english'].includes(w.dialogueLanguage)||!Number.isInteger(w.scenesPerEpisode)||w.scenesPerEpisode<1||w.scenesPerEpisode>5)throw Error('Invalid agent work.');
 for(const [field,max] of [['idea',2000],['originalText',256000],['baseSnapshot',5000000]])if(typeof w[field]!=='string'||w[field].length>max)throw Error('Invalid agent text.');
 if(new TextEncoder().encode(w.originalText).length>256000)throw Error('Original text is too large.');
}
export function assertOriginalStory(value){
 assertContractObject(value,['id','text','approvedAt','episodeCount']);
 if(Object.keys(value).length!==4||!safeStoryId(value.id)||typeof value.text!=='string'||!value.text.trim()||new TextEncoder().encode(value.text).length>256000||!Number.isFinite(Date.parse(value.approvedAt))||!Number.isInteger(value.episodeCount)||value.episodeCount<1||value.episodeCount>24)throw Error('Invalid original story.');
}
const pick=(item,fields)=>Object.fromEntries(fields.map(k=>[k,item[k]]));
// Identity/media changes remain possible; approved story text and its structure do not.
export function originalCanon(p){return JSON.stringify({idea:p.idea,title:p.title,episodeCount:p.config.episodeCount,bible:p.bible,characters:p.characters.map(c=>pick(c,['id','archived','firstEpisode',...TEXT_FIELDS.character])),episodes:p.episodes.map(e=>({...pick(e,['id','number','archived',...TEXT_FIELDS.episode]),scenes:e.scenes.map(s=>pick(s,['id','number','archived','characterIds','locationId','timeline',...TEXT_FIELDS.scene]))})),events:p.events});}
export function assertOriginalPreserved(previous,next){
 if(!previous?.originalStory)return;
 if(JSON.stringify(previous.originalStory)!==JSON.stringify(next?.originalStory)||originalCanon(previous)!==originalCanon(next))throw Error('The approved original story is protected.');
}
