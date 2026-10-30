import {assertAgentWork,assertOriginalStory,agentWorkKey} from './agent-contract.js';
import {DemoStoryAdapter} from './story-demo.js';
import {createProposalAsync} from './story-generation.js';
import {storySnapshot} from './story.js';
export {agentWorkKey};
export function newAgentWork(p){return {type:'STORY_AGENT_WORK',projectId:p.id,baseSnapshot:storySnapshot(p),idea:p.idea.length<=2000?p.idea:'',dialogueLanguage:'egyptian',scenesPerEpisode:3,mode:'develop',originalText:'',status:'Draft'};}
export function agentPlan(p,w){assertAgentWork(w);return {episodes:p.episodes.filter(e=>!e.archived).length,selectedEpisodes:p.config.episodeCount,scenes:p.episodes.filter(e=>!e.archived).reduce((sum,e)=>sum+Math.max(e.scenes.filter(s=>!s.archived).length,w.scenesPerEpisode),0),suggestedEpisodes:p.config.episodeCount,suggestedScenesPerEpisode:3,provider:'NOT_CONFIGURED',cost:0};}
export class AgentDemoAdapter extends DemoStoryAdapter {
 constructor({scenesPerEpisode=3,dialogueLanguage='egyptian'}={}){super();this.scenesPerEpisode=scenesPerEpisode;this.dialogueLanguage=dialogueLanguage;}
 generate(input){
  const project=structuredClone(input.project);if(project.originalStory)throw Error('Protected original.');
  project.idea=input.request.instructions.trim()||project.idea;
  const changes=super.generate({...input,project}),episodes=project.episodes.filter(e=>!e.archived),location=project.locations.find(l=>!l.archived);
  for(const e of episodes){const existing=e.scenes.filter(s=>!s.archived),seed=changes.find(c=>c.target.kind==='scene'&&c.target.episodeId===e.id&&c.field==='$new');
   for(let n=existing.length||1;n<this.scenesPerEpisode;n++){
    if(!location)throw Error('A location is required.');
    const id=`agent-${e.id}-${n+1}`,characterIds=project.characters.filter(c=>!c.archived&&c.firstEpisode<=e.number).map(c=>c.id);
    const ar=project.config.language==='ar',beat=ar?['يواجه البطل نتيجة اختياره.','يختبر الحليف الدليل ويطلب تفسيرًا.','ينتهي المشهد بقرار يمهّد لما بعده.']:['The protagonist faces the consequence of a choice.','An ally tests the clue and asks for an explanation.','A decision sets up the next scene.'];
    changes.push({id,target:{kind:'scene',id,episodeId:e.id},field:'$new',before:null,value:{...(seed?.value||{visual:ar?'نموذج مشهد تجريبي في المكان المحفوظ.':'Demo scene in the saved location.',narration:'',dialogue:'',locationId:location.id,characterIds,seconds:45,timeline:e.timelineStart||e.number}),action:beat[n%beat.length]},selected:true});
   }
  }
  for(const c of changes){if(c.target.kind!=='scene')continue;const e=project.episodes.find(e=>e.id===c.target.episodeId),scene=e.scenes.find(s=>s.id===c.target.id),speaker=project.characters.find(ch=>(scene?.characterIds||c.value.characterIds||[]).includes(ch.id))?.name||project.characters.find(ch=>!ch.archived&&ch.firstEpisode<=e.number)?.name||'Narrator';
   const text=this.dialogueLanguage==='egyptian'?`${speaker}: استنّى… خلّينا نفهم اللي حصل قبل ما ناخد القرار.`:this.dialogueLanguage==='msa'?`${speaker}: انتظر… لِنفهم ما حدث قبل اتخاذ القرار.`:`${speaker}: Wait… let us understand what happened before we decide.`;
   if(c.field==='$new')c.value.dialogue=text;else if(c.field==='dialogue')c.value=text;
  }
  return changes;
 }
}
export function adapterForAgentProposal(proposal){const match=proposal?.provenance?.promptVersion?.match(/^agent-v1-(egyptian|msa|english)-([1-5])$/);return match?new AgentDemoAdapter({dialogueLanguage:match[1],scenesPerEpisode:Number(match[2])}):null;}
export async function developAgentDraft(p,w,options={}){
 assertAgentWork(w);if(p.originalStory||!w.idea.trim()||w.projectId!==p.id||w.baseSnapshot!==storySnapshot(p))throw Error('Agent source changed or is protected.');
 const result=await createProposalAsync(p,{task:'complete',instructions:w.idea},new AgentDemoAdapter(w),options);
 result.provenance.promptVersion=`agent-v1-${w.dialogueLanguage}-${w.scenesPerEpisode}`;return result;
}
export function approveOriginalStory(p,w,{confirmed=false}={}){
 assertAgentWork(w);if(!confirmed||w.mode!=='original'||w.status!=='Draft'||p.originalStory||w.projectId!==p.id||w.baseSnapshot!==storySnapshot(p))throw Error('Explicit approval of a current original draft is required.');
 const originalStory={id:crypto.randomUUID(),text:w.originalText,approvedAt:new Date().toISOString(),episodeCount:p.config.episodeCount};assertOriginalStory(originalStory);
 return {...structuredClone(p),originalStory,updatedAt:new Date(Math.max(Date.now(),Date.parse(p.updatedAt)+1)).toISOString()};
}
