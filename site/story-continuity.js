/** Read-only recorded-data review. No storage, providers, semantic inference or approval. */
import {assertProposal} from './story-contract.js';
import {ensureFresh} from './story.js';
import {storyError} from './generation-contract.js';
const text=v=>typeof v==='string'?v.trim():'';
const name=v=>text(v).normalize('NFC').toLowerCase();
const number=v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const active=items=>(items||[]).filter(item=>!item.archived);
const manual=['manualRoles','manualRelationships','manualDialogue','manualTimeline','manualThreads','manualKnowledge'];
function collect(project){
  const findings=[];
  const add=(code,severity,entity,evidence=[])=>findings.push({code,severity,entityId:entity.id,evidence:evidence.map(String)});
  const characters=active(project.characters),locations=active(project.locations),episodes=active(project.episodes);
  const refs=(ids,items,entity,code)=>{for(const id of ids||[])if(!items.some(item=>item.id===id))add(code,'error',entity,[id]);};
  const ordered=(items,owner)=>{
    const seen=new Set();let previous=0;
    for(const item of items){const n=number(item.number);
      if(n===null||!Number.isInteger(n)||n<1||seen.has(n))add('orderInvalid','error',item,[owner,String(item.number)]);
      else if(n<previous)add('orderMismatch','suggestion',item,[owner,n,previous]);
      seen.add(n);previous=n;
    }
  };
  const seenIds=new Set();
  for(const item of [...project.characters,...project.locations,...project.episodes,...project.episodes.flatMap(e=>e.scenes)]){
    if(seenIds.has(item.id))add('duplicateId','error',item,[item.id]);seenIds.add(item.id);
  }
  for(const c of characters){
    if(!text(c.role))add('roleMissing','suggestion',c,[c.name||c.id]);
    if(!text(c.relationships))add('relationshipsMissing','suggestion',c,[c.name||c.id]);
    if(!text(c.name)||characters.filter(other=>name(other.name)===name(c.name)).length>1)add('nameAmbiguous','suggestion',c,[c.name||c.id]);
  }
  ordered(episodes,project.title);let priorDay=null;
  for(const episode of episodes.slice().sort((a,b)=>a.number-b.number)){
    refs(episode.characterIds,characters,episode,'characterReference');refs(episode.locationIds,locations,episode,'locationReference');
    const start=number(episode.timelineStart);
    if(start!==null&&priorDay!==null&&start<priorDay)add('timelineReverse','suggestion',episode,[start,priorDay]);
    let day=start??priorDay;
    const scenes=active(episode.scenes);ordered(scenes,episode.title);
    for(const scene of scenes.slice().sort((a,b)=>a.number-b.number)){
      refs(scene.characterIds,characters,scene,'characterReference');
      if(scene.locationId)refs([scene.locationId],locations,scene,'locationReference');
      else add('locationMissing','suggestion',scene,[]);
      const nextDay=number(scene.timeline);
      if(nextDay!==null&&day!==null&&nextDay<day)add('timelineReverse','suggestion',scene,[nextDay,day]);
      if(nextDay!==null)day=nextDay;
      for(const id of scene.characterIds||[]){const c=characters.find(c=>c.id===id);if(c&&number(c.firstEpisode)>number(episode.number))add('introductionReview','suggestion',scene,[c.name,c.firstEpisode,episode.number]);}
      let unlabelled=false;
      for(const line of text(scene.dialogue).split('\n').filter(line=>line.trim())){
        // Only explicit Name: / Name： prefixes. No pronoun, nickname or speaker inference.
        const match=line.match(/^\s*([^:：]{1,100})[:：]\s*\S/);
        if(!match){unlabelled=true;continue;}
        const speaker=text(match[1]),matches=characters.filter(c=>name(c.name)===name(speaker));
        if(matches.length!==1)add('speakerUncertain','suggestion',scene,[speaker]);
        else if(!scene.characterIds.includes(matches[0].id))add('speakerOutsideCast','suggestion',scene,[speaker]);
      }
      if(unlabelled)add('dialogueUnlabelled','suggestion',scene,[]);
    }
    priorDay=day;
    for(const event of project.events||[]){
      const introduced=number(event.introducedEpisode),resolved=number(event.resolvedEpisode);
      if(introduced!==null&&introduced<Number(episode.number)&&(!resolved||resolved>Number(episode.number))&&text(event.description)&&!name(episode.unresolvedEvents).includes(name(event.description)))add('threadNotListed','suggestion',episode,[event.description,introduced]);
    }
  }
  for(const event of project.events||[]){
    const introduced=number(event.introducedEpisode),resolved=number(event.resolvedEpisode);
    if(resolved>0&&introduced!==null&&resolved<introduced)add('eventOrder','error',event,[event.description,introduced,resolved]);
  }
  return findings;
}
const key=f=>JSON.stringify([f.code,f.entityId,f.evidence]);
export function reviewStoryContinuity(project,proposal){
  assertProposal(proposal,project.id);
  try{ensureFresh(project,proposal);}catch{throw storyError('STORY_CHANGED');}
  const candidate=structuredClone(project),selected=proposal.changes.filter(c=>c.selected),extra=[];
  const add=(code,change,evidence)=>extra.push({code,severity:code==='roleChanged'||code==='relationshipsChanged'?'suggestion':'error',entityId:change.target.id,evidence,origin:'selected'});
  // An ephemeral overlay only. Actual approval continues through the existing guarded path.
  for(const change of selected){
    const target=change.target,episode=candidate.episodes.find(e=>e.id===target.episodeId&&!e.archived);
    const list=target.kind==='character'?candidate.characters:target.kind==='episode'?candidate.episodes:episode?.scenes;
    if(change.field==='$new'){
      if(!list||candidate.characters.some(c=>c.id===target.id)||candidate.locations.some(l=>l.id===target.id)||candidate.episodes.some(e=>e.id===target.id||e.scenes.some(s=>s.id===target.id))){add('targetReference',change,[target.id,target.episodeId||'']);continue;}
      list.push({id:target.id,archived:false,number:Math.max(0,...list.map(s=>Number(s.number)||0))+1,role:'',relationships:'',dialogue:'',timeline:'',characterIds:[],...(target.kind==='episode'?{scenes:[],locationIds:[]}:{}),...structuredClone(change.value)});
    }else{
      const item=target.kind==='bible'?(target.id===project.id?candidate.bible:null):list?.find(item=>item.id===target.id&&!item.archived);
      if(!item){add('targetReference',change,[target.id,target.episodeId||'']);continue;}
      if(item[change.field]!==change.before){add('fieldMismatch',change,[change.field]);continue;}
      item[change.field]=change.value;
      if(target.kind==='character'&&['role','relationships'].includes(change.field)&&change.before!==change.value)add(change.field==='role'?'roleChanged':'relationshipsChanged',change,[item.name||item.id,change.before,change.value]);
    }
  }
  const before=new Set(collect(project).map(key));
  const findings=[...collect(candidate).map(f=>({...f,origin:before.has(key(f))?'saved':'selected'})),...extra];
  const labels=new Map([[project.id,project.title],...candidate.characters.map(c=>[c.id,c.name||c.id]),...candidate.episodes.flatMap(e=>[[e.id,e.title||String(e.number)],...e.scenes.map(s=>[s.id,`${e.number} / ${s.number}`])])]);
  return {findings:findings.map(f=>({...f,where:labels.get(f.entityId)||f.entityId})),manual:[...manual]};
}
