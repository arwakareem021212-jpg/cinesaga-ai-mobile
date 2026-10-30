/** Shared strict text-only director contracts. No credentials, images, voice assets or identity writes. */
import {assertContractObject,assertContractArray,assertGenerationProvenance,safeStoryId,TEXT_FIELDS} from './story-contract.js';
const str=(maxLength=12000)=>({type:'string',maxLength});
const num=(minimum,maximum)=>({type:'integer',minimum,maximum});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const arr=(items,maxItems,minItems=0)=>({type:'array',items,minItems,maxItems});
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'};
const names=Object.fromEntries(['name','role','personality','goals','fears','relationships','knows','doesNotKnow','appearanceSuggestion'].map(k=>[k,str()]));
export const DIRECTOR_SCHEMA=obj({title:str(),premise:str(),worldRules:str(),timeline:str(),conflict:str(),ending:str(),continuityNotes:str(),
 characters:arr(obj({id,...names,firstEpisode:num(1,6)}),16,1),
 locations:arr(obj({id,...Object.fromEntries(['name','description','timeOfDay','lighting','atmosphere','purpose'].map(k=>[k,str()]))}),16,1),
 threads:arr(obj({id,question:str(),introducedEpisode:num(1,6),resolvedEpisode:num(0,6)}),24),
 episodes:arr(obj({number:num(1,6),...Object.fromEntries(['title','beginning','mainEvent','turningPoint','ending','continuedFrom','continuityFacts','unresolvedEvents','currentStates'].map(k=>[k,str()])),
 scenes:arr(obj({id,number:num(1,12),locationId:id,characterIds:arr(id,16,1),visual:str(),camera:str(2000),action:str(),narration:str(),timeline:num(1,7200),seconds:num(1,600),
 beats:arr(obj({atSeconds:num(0,600),action:str(2000)}),24,1),
 lines:arr(obj({id,characterId:id,text:str(2000),atSeconds:num(0,600),durationSeconds:num(1,600),emotion:{type:'string',enum:['neutral','curious','worried','fear','relief','determined','whisper','shouting']},delivery:str(2000)}),24,1)}),12)}),6,1)});
const freezeSchema=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeSchema);Object.freeze(value);}return value;};
freezeSchema(DIRECTOR_SCHEMA);
export class DirectorError extends Error{constructor(code='DIRECTOR_FAILED'){super(code);this.code=code;}}
export const rejectDirector=code=>{throw new DirectorError(code);};
export function validateShape(value,schema){
 if(schema.type==='object'){assertContractObject(value,Object.keys(schema.properties));if(Object.keys(value).length!==schema.required.length)rejectDirector('INVALID_RESULT');for(const [k,s]of Object.entries(schema.properties))validateShape(value[k],s);}
 else if(schema.type==='array'){assertContractArray(value,schema.maxItems);if(value.length<schema.minItems)rejectDirector('INVALID_RESULT');value.forEach(v=>validateShape(v,schema.items));}
 else if(schema.type==='string'){if(typeof value!=='string'||value.length>(schema.maxLength??128)||schema.pattern&&!safeStoryId(value)||schema.enum&&!schema.enum.includes(value))rejectDirector('INVALID_RESULT');}
 else if(!Number.isInteger(value)||value<schema.minimum||value>schema.maximum)rejectDirector('INVALID_RESULT');
}
const norm=s=>String(s||'').normalize('NFKC').replace(/[\u064b-\u065f\u0670ـ]/g,'').trim();
export function protectedDirectorProject(p){return !!p?.originalStory||[p?.title,p?.bible?.title].some(s=>(() => {let h=14695981039346656037n;for(const c of norm(s))h=BigInt.asUintN(64,(h^BigInt(c.codePointAt(0)))*1099511628211n);return h.toString(16).padStart(16,'0')==='70f2ac776c9c42b4';})());}
export function assertDirectorPlan(plan,count,stage='script'){
 validateShape(plan,DIRECTOR_SCHEMA);if(new TextEncoder().encode(JSON.stringify(plan)).length>600000||plan.episodes.length!==count||!plan.title.trim()||!plan.premise.trim()||!plan.ending.trim())rejectDirector('INVALID_RESULT');
 const seen=new Set(),unique=id=>{if(seen.has(id))rejectDirector('INVALID_RESULT');seen.add(id);};
 const cast=new Map(plan.characters.map(c=>{unique(c.id);if(!c.name.trim()||c.firstEpisode>count)rejectDirector('INVALID_RESULT');return [c.id,c];})),places=new Set(plan.locations.map(l=>{unique(l.id);return l.id;}));
 for(const t of plan.threads){unique(t.id);if(t.introducedEpisode>count||t.resolvedEpisode>count||t.resolvedEpisode&&t.resolvedEpisode<t.introducedEpisode)rejectDirector('INVALID_RESULT');}
 for(const [ei,e]of plan.episodes.entries()){
  if(e.number!==ei+1||!e.title.trim()||ei&&e.continuedFrom!==plan.episodes[ei-1].ending||stage==='outline'&&e.scenes.length||stage!=='outline'&&!e.scenes.length)rejectDirector('INVALID_RESULT');
  let timeline=0;for(const [si,s]of e.scenes.entries()){
   unique(s.id);if(s.number!==si+1||!places.has(s.locationId)||s.characterIds.some(id=>!cast.has(id)||cast.get(id).firstEpisode>e.number)||new Set(s.characterIds).size!==s.characterIds.length||s.timeline<timeline)rejectDirector('INVALID_RESULT');timeline=s.timeline;
   for(const list of [s.beats,s.lines]){let last=-1;for(const row of list){if(row.atSeconds<last||row.atSeconds>=s.seconds)rejectDirector('INVALID_RESULT');last=row.atSeconds;}}
   for(const l of s.lines){unique(l.id);if(!s.characterIds.includes(l.characterId)||!l.text.trim()||l.atSeconds+l.durationSeconds>s.seconds)rejectDirector('INVALID_RESULT');}
  }
 }
 return plan;
}
const clone=v=>structuredClone(v);
export const directorKey=id=>`${id}:story-director-work`;
export function assertDirectorCandidate(c,projectId){
 assertContractObject(c,['id','projectId','baseSnapshot','operation','status','revision','createdAt','provenance','plan']);
 if(Object.keys(c).length!==9||!safeStoryId(c.id)||c.projectId!==projectId||!['outline','script'].includes(c.operation)||!['Draft','Rejected'].includes(c.status)||!Number.isInteger(c.revision)||c.revision<0||typeof c.baseSnapshot!=='string'||c.baseSnapshot.length>5000000||!Number.isFinite(Date.parse(c.createdAt)))rejectDirector('INVALID_RESULT');
 assertGenerationProvenance(c.provenance);assertDirectorPlan(c.plan,c.plan.episodes.length,c.operation);
}
export function assertDirectorWork(w,key=directorKey(w?.projectId)){
 assertContractObject(w,['type','projectId','idea','notes','target','candidate','versions','job']);
 if(![7,8].includes(Object.keys(w).length)||w.type!=='STORY_DIRECTOR_WORK'||!safeStoryId(w.projectId)||key!==directorKey(w.projectId)||typeof w.idea!=='string'||w.idea.length>2000||typeof w.notes!=='string'||w.notes.length>2000||typeof w.target!=='string'||w.target.length>200)rejectDirector('INVALID_REQUEST');
 if(w.job!==undefined&&w.job!==null)assertDirectorTicket(w.job);
 if(w.candidate!==null)assertDirectorCandidate(w.candidate,w.projectId);assertContractArray(w.versions,20);w.versions.forEach(c=>assertDirectorCandidate(c,w.projectId));if(new TextEncoder().encode(JSON.stringify(w)).length>8000000)rejectDirector('CONTEXT_TOO_LARGE');
}
export function assertDirectorTicket(j){
 assertContractObject(j,['requestId','jobId','sourceHash','baseSnapshot','operation','episodeCount','episodeSeconds','target','plan','revision']);
 if(Object.keys(j).length!==10||!safeStoryId(j.requestId)||j.jobId!==null&&!safeStoryId(j.jobId)||typeof j.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(j.sourceHash)||typeof j.baseSnapshot!=='string'||j.baseSnapshot.length>5000000||!['outline','script','revise'].includes(j.operation)||!Number.isInteger(j.episodeCount)||j.episodeCount<1||j.episodeCount>6||!Number.isInteger(j.episodeSeconds)||j.episodeSeconds<60||j.episodeSeconds>7200||typeof j.target!=='string'||j.target.length>200||!Number.isInteger(j.revision)||j.revision<0)rejectDirector('INVALID_REQUEST');
 if(j.operation==='revise'){assertDirectorPlan(j.plan,j.episodeCount,j.plan.episodes.every(e=>!e.scenes.length)?'outline':'script');if(!directorTargets(j.plan).some(x=>x.path===j.target))rejectDirector('INVALID_REQUEST');}else if(j.plan!==null)rejectDirector('INVALID_REQUEST');
}
export function assertDirectorHistory(p){
 if(p.directorHistory===undefined)return;assertContractArray(p.directorHistory,100);const ids=new Set();
 for(const h of p.directorHistory){assertContractObject(h,['id','candidateId','approvedAt','operation','revision','provenance','plan']);if(Object.keys(h).length!==7||!safeStoryId(h.id)||ids.has(h.id)||!Number.isFinite(Date.parse(h.approvedAt)))rejectDirector('INVALID_HISTORY');ids.add(h.id);assertDirectorCandidate({id:h.candidateId,projectId:p.id,baseSnapshot:'',status:'Draft',createdAt:h.approvedAt,...Object.fromEntries(['operation','revision','provenance','plan'].map(k=>[k,h[k]]))},p.id);}
}
export function preserveDirectorHistory(previous,next){for(const row of previous?.directorHistory||[])if(JSON.stringify(next.directorHistory?.find(h=>h.id===row.id))!==JSON.stringify(row))rejectDirector('INVALID_HISTORY');}
/** Approved text only; all identity, images, voice identity and unrelated data excluded. */
export function directorContext(p){return {bible:Object.fromEntries(TEXT_FIELDS.bible.map(k=>[k,p.bible[k]])),characters:p.characters.filter(c=>!c.archived).map(c=>({id:c.id,...Object.fromEntries(TEXT_FIELDS.character.map(k=>[k,c[k]])),firstEpisode:c.firstEpisode})),episodes:p.episodes.filter(e=>!e.archived).map(e=>({number:e.number,...Object.fromEntries(TEXT_FIELDS.episode.map(k=>[k,e[k]])),scenes:e.scenes.filter(s=>!s.archived).map(s=>({number:s.number,action:s.action,dialogue:s.dialogue,narration:s.narration}))})),events:p.events.map(e=>({description:e.description,introducedEpisode:Number(e.introducedEpisode),resolvedEpisode:Number(e.resolvedEpisode||0)}))};}
export const approvedDirectorPlan=p=>p.directorHistory?.at(-1)?.plan?clone(p.directorHistory.at(-1).plan):null;
export function assertNoPersonalData(text){if(/data:|\bsk-[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s()-]*){9,}/i.test(text))rejectDirector('PRIVACY_REVIEW_REQUIRED');}
export function directorTargets(plan){
 const rows=[{path:'',label:'القصة كاملة / Whole draft'}];
 function walk(v,path,label){if(typeof v==='string'){if(!['id','locationId','characterId','emotion'].includes(path.split('.').at(-1)))rows.push({path,label});return;}if(Array.isArray(v)){if(['characterIds'].includes(path.split('.').at(-1)))return;v.forEach((x,i)=>walk(x,`${path}.${i}`,`${label} ${i+1}`));}else if(v&&typeof v==='object'){if(path)rows.push({path,label});for(const [k,x]of Object.entries(v))walk(x,path?`${path}.${k}`:k,`${label} · ${k}`);}}
 walk(plan,'','');return rows;
}
export function directorAt(plan,path){return path?path.split('.').reduce((v,k)=>v[k],plan):plan;}
export function setDirectorAt(plan,path,value){if(!path)return clone(value);const out=clone(plan),parts=path.split('.'),key=parts.pop();directorAt(out,parts.join('.'))[key]=clone(value);return out;}
export function assertRevisionScope(before,after,target){if(!directorTargets(before).some(t=>t.path===target)||JSON.stringify(setDirectorAt(after,target,directorAt(before,target)))!==JSON.stringify(before))rejectDirector('SCOPE_CHANGED');}
