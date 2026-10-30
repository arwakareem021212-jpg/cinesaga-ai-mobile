import * as model from './model.js';
import {bindScene} from './identity.js';
import {snapshotHash,ZERO_USAGE} from './generation-contract.js';
import {FIXTURE_LABEL,assertContractObject,safeStoryId,assertGenerationProvenance,assertContractArray} from './story-contract.js';
import {assertTeenStorySafety} from './director-safety.js';
import {directorContext,approvedDirectorPlan,protectedDirectorProject,assertDirectorPlan,assertDirectorCandidate,assertDirectorWork,assertNoPersonalData,directorTargets,directorAt,setDirectorAt,assertRevisionScope,rejectDirector} from './director-contract.js';
export * from './director-contract.js';
const clone=v=>structuredClone(v);
const episodeCast=(plan,e)=>e.scenes.length?[...new Set(e.scenes.flatMap(s=>s.characterIds))]:plan.characters.filter(c=>c.firstEpisode<=e.number).map(c=>c.id);
const episodePlaces=(plan,e)=>e.scenes.length?[...new Set(e.scenes.map(s=>s.locationId))]:plan.locations.map(l=>l.id);
/** Do not replay an older director plan over canon edited in another existing editor. Media edits are independent. */
export function assertDirectorCanon(p){
 const plan=approvedDirectorPlan(p);if(!plan)return;
 const equal=(actual,expected,keys)=>{if(!actual||keys.some(k=>JSON.stringify(actual[k])!==JSON.stringify(expected[k])))rejectDirector('CANON_CHANGED');};
 equal(p,{title:plan.title},['title']);equal(p.bible,plan,['title','premise','worldRules','timeline','conflict','ending','continuityNotes']);
 for(const c of plan.characters)equal(p.characters.find(x=>x.id===c.id),c,['name','role','personality','goals','fears','relationships','knows','doesNotKnow','firstEpisode']);
 for(const l of plan.locations)equal(p.locations.find(x=>x.id===l.id),l,['name','description','timeOfDay','lighting','atmosphere','purpose']);
 for(const e of plan.episodes){const actual=p.episodes.find(x=>!x.archived&&x.number===e.number);equal(actual,{...e,characterIds:episodeCast(plan,e),locationIds:episodePlaces(plan,e)},['title','beginning','mainEvent','turningPoint','ending','continuedFrom','continuityFacts','unresolvedEvents','currentStates','characterIds','locationIds']);for(const s of e.scenes)equal(actual.scenes.find(x=>!x.archived&&x.id===s.id),{...s,dialogue:s.lines.map(l=>`${plan.characters.find(c=>c.id===l.characterId).name}: ${l.text}`).join('\n')},['number','locationId','characterIds','visual','camera','action','narration','seconds','timeline','dialogue']);}
 for(const t of plan.threads)equal(p.events.find(x=>x.id===t.id),{description:t.question,introducedEpisode:t.introducedEpisode,resolvedEpisode:t.resolvedEpisode},['description','introducedEpisode','resolvedEpisode']);
}
export function directorEligible(p){return !protectedDirectorProject(p)&&(!p.storyHistory?.length||!!p.directorHistory?.length)&&(!p.episodes.some(e=>e.scenes.length)||!!p.directorHistory?.length);}
export function newDirectorWork(p){return {type:'STORY_DIRECTOR_WORK',projectId:p.id,idea:p.idea.slice(0,2000),notes:'',target:'premise',candidate:null,versions:[]};}
export const DIRECTOR_BACKEND=Object.freeze({status:'NOT_CONFIGURED',submit:'/api/director/jobs',statusPath:'/api/director/jobs/:id',result:'/api/director/jobs/:id/result',cancel:'/api/director/jobs/:id/cancel',model:'gpt-6.1-sol'});
function privacyText(value,key=''){if(['id','requestId','projectId','sourceHash','locationId','characterId','characterIds'].includes(key))return '';if(typeof value==='string')return value+'\n';if(Array.isArray(value))return value.map(v=>privacyText(v,key)).join('');if(value&&typeof value==='object')return Object.entries(value).map(([k,v])=>privacyText(v,k)).join('');return '';}
export function assertDirectorRequest(r){
 assertContractObject(r,['schemaVersion','requestId','projectId','sourceHash','operation','episodeCount','episodeSeconds','idea','notes','target','context','approvedPlan','draftPlan']);
 if(Object.keys(r).length!==13||r.schemaVersion!==1||!safeStoryId(r.requestId)||!safeStoryId(r.projectId)||!['outline','script','revise'].includes(r.operation)||typeof r.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(r.sourceHash)||!Number.isInteger(r.episodeCount)||r.episodeCount<1||r.episodeCount>6||!Number.isInteger(r.episodeSeconds)||r.episodeSeconds<60||r.episodeSeconds>7200||typeof r.idea!=='string'||!r.idea.trim()||r.idea.length>2000||typeof r.notes!=='string'||r.notes.length>2000||typeof r.target!=='string'||r.target.length>200)rejectDirector('INVALID_REQUEST');
 // Context has exactly the same projection as the approved local story, never the full project.
 assertContractObject(r.context,['bible','characters','episodes','events']);
 const fieldStrings=o=>{if(Object.values(o).some(v=>typeof v!=='string'||v.length>12000))rejectDirector('INVALID_REQUEST');};
 assertContractObject(r.context.bible,['title','premise','genreTone','ending','worldRules','timeline','conflict','revealedSecrets','unrevealedSecrets','importantObjects','continuityNotes']);fieldStrings(r.context.bible);
 if(protectedDirectorProject({bible:r.context.bible}))rejectDirector('PROTECTED_STORY');
 const list=(a,fn,max=100)=>{assertContractArray(a,max);for(const v of a)fn(v);};
 list(r.context.characters,c=>{assertContractObject(c,['id','name','role','personality','goals','fears','relationships','knows','doesNotKnow','firstEpisode']);if(!safeStoryId(c.id)||!Number.isInteger(c.firstEpisode))rejectDirector('INVALID_REQUEST');fieldStrings(Object.fromEntries(Object.entries(c).filter(([k])=>!['id','firstEpisode'].includes(k))));});
 list(r.context.episodes,e=>{assertContractObject(e,['number','title','beginning','mainEvent','turningPoint','ending','continuedFrom','continuityFacts','unresolvedEvents','currentStates','scenes']);if(!Number.isInteger(e.number))rejectDirector('INVALID_REQUEST');fieldStrings(Object.fromEntries(Object.entries(e).filter(([k])=>!['number','scenes'].includes(k))));list(e.scenes,s=>{assertContractObject(s,['number','action','dialogue','narration']);if(!Number.isInteger(s.number))rejectDirector('INVALID_REQUEST');fieldStrings({action:s.action,dialogue:s.dialogue,narration:s.narration});});},24);
 list(r.context.events,e=>{assertContractObject(e,['description','introducedEpisode','resolvedEpisode']);if(typeof e.description!=='string'||!Number.isInteger(e.introducedEpisode)||!Number.isInteger(e.resolvedEpisode))rejectDirector('INVALID_REQUEST');});
 for(const plan of [r.approvedPlan,r.draftPlan])if(plan!==null)assertDirectorPlan(plan,r.episodeCount,plan.episodes.every(e=>!e.scenes.length)?'outline':'script');
 if(r.operation==='script'&&!r.approvedPlan||r.operation==='revise'&&(!r.draftPlan||!r.notes.trim()||!directorTargets(r.draftPlan).some(t=>t.path===r.target)))rejectDirector('INVALID_REQUEST');
 const wire=JSON.stringify(r);if(new TextEncoder().encode(wire).length>256000)rejectDirector('CONTEXT_TOO_LARGE');assertNoPersonalData(privacyText(r));if(/data:|\bsk-[A-Za-z0-9_-]{8,}/i.test(wire))rejectDirector('PRIVACY_REVIEW_REQUIRED');
}
export async function captureDirector(p,w,operation){
 assertDirectorWork(w);if(!directorEligible(p)||w.projectId!==p.id||p.config.episodeCount>6)rejectDirector('PROTECTED_STORY');
 assertDirectorCanon(p);
 const baseSnapshot=JSON.stringify(p),source=clone(p),request={schemaVersion:1,requestId:crypto.randomUUID(),projectId:p.id,sourceHash:await snapshotHash(baseSnapshot),operation,episodeCount:p.config.episodeCount,episodeSeconds:p.config.episodeMinutes*60,idea:w.idea,notes:operation==='revise'?w.notes:'',target:operation==='revise'?w.target:'',context:directorContext(source),approvedPlan:approvedDirectorPlan(source),draftPlan:operation==='revise'?clone(w.candidate?.plan||approvedDirectorPlan(source)):null};
 assertDirectorRequest(request);assertTeenStorySafety(request);return {baseSnapshot,request};
}
export function validateDirectorOutput(plan,request){
 assertDirectorRequest(request);const stage=request.operation==='outline'?'outline':request.operation==='script'?'script':request.draftPlan.episodes.every(e=>!e.scenes.length)?'outline':'script';assertDirectorPlan(plan,request.episodeCount,stage);if(plan.episodes.some(e=>e.scenes.reduce((n,s)=>n+s.seconds,0)>request.episodeSeconds))rejectDirector('INVALID_RESULT');
 if(request.operation==='script'){const withoutScenes=p=>({...clone(p),episodes:p.episodes.map(e=>({...clone(e),scenes:[]}))});if(JSON.stringify(withoutScenes(plan))!==JSON.stringify(withoutScenes(request.approvedPlan)))rejectDirector('SCOPE_CHANGED');}
 if(request.operation==='revise')assertRevisionScope(request.draftPlan,plan,request.target);
 assertNoPersonalData(privacyText(plan));assertTeenStorySafety(plan);return clone(plan);
}
export function fixtureDirectorPlan(r){
 assertDirectorRequest(r);if(r.operation==='revise'){
  const old=directorAt(r.draftPlan,r.target);let next=clone(old);
  if(typeof old==='string')next=/أهد|اهد|calm/i.test(r.notes)?'بالراحة… خلّينا نفكّر سوا، أكيد هنلاقي حل.':`${old}\n[مراجعة FIXTURE للطلب: ${r.notes}]`;
  else {const revise=v=>{if(v&&typeof v==='object'){if(Object.hasOwn(v,'text')){v.text='بالراحة… إحنا مع بعض، خلّينا نجرّب خطوة صغيرة.';v.emotion='relief';v.delivery='بنبرة هادئة ومطمئنة، دون تغيير هوية الصوت';}else if(Object.hasOwn(v,'action'))v.action+=' — مراجعة تجريبية هادئة';Object.values(v).forEach(revise);}};revise(next);}
  return validateDirectorOutput(setDirectorAt(r.draftPlan,r.target,next),r);
 }
 if(r.operation==='script'){
  const plan=clone(r.approvedPlan);for(const e of plan.episodes){const count=2+e.number%2;e.scenes=Array.from({length:count},(_,i)=>({id:`director-scene-${r.projectId}-${e.number}-${i+1}`,number:i+1,locationId:plan.locations[i%plan.locations.length].id,characterIds:plan.characters.map(c=>c.id),visual:'مشهد تجريبي بإضاءة سينمائية دافئة، الشخصيات حول خريطة ورقية.',camera:i?'لقطة متوسطة تتبع الإشارة على الخريطة':'لقطة عامة هادئة تتقدم نحو الطاولة',action:i?'تختبر ليلى الإشارة بينما يثبت عمر المصباح.':'تفتح ليلى الخريطة ويتأمل عمر العلامة.',narration:'عينة ثابتة لاختبار خط التأليف، وليست كتابة AI.',timeline:e.number,seconds:30,beats:[{atSeconds:0,action:'دخول وملاحظة الدليل'},{atSeconds:12,action:'استجابة وقرار يمهّد للخطوة التالية'}],lines:[{id:`director-line-${r.projectId}-${e.number}-${i}-1`,characterId:plan.characters[0].id,text:'استنّى يا عمر… العلامة دي ماكنتش هنا امبارح.',atSeconds:2,durationSeconds:6,emotion:'curious',delivery:'دهشة خفيفة وسؤال واضح؛ لا تغيير لهوية الصوت'},{id:`director-line-${r.projectId}-${e.number}-${i}-2`,characterId:plan.characters[1].id,text:'طب خلّينا نمشي ورا الدليل سوا، من غير ما نستعجل.',atSeconds:10,durationSeconds:7,emotion:'determined',delivery:'ثقة هادئة ووقفة قبل آخر جملة'}]}));}return validateDirectorOutput(plan,r);
 }
 const key=`director-${r.projectId}`,character=(id,name,role)=>({id:`${key}-${id}`,name,role,personality:'فضولي ومتعاون',goals:'فهم سر الخريطة وحماية الصداقة',fears:'التسرع في الحكم',relationships:id==='c1'?'صديقة عمر وشريكته في حل اللغز':'صديق ليلى ويساعدها في اختبار الأدلة',knows:'توجد خريطة ورقية قديمة',doesNotKnow:'سبب تغير العلامات',appearanceSuggestion:'اقتراح نصي فقط: تصميم شخصية ثلاثية الأبعاد؛ يحتاج اعتماد هوية منفصلًا',firstEpisode:1});
 const plan={title:'خريطة الفوانيس — FIXTURE',premise:`نموذج اختبار ثابت للفكرة: ${r.idea}`,worldRules:'العلامات تتغير بعد اختبار دليل؛ لا معرفة بلا حدث يعلّم الشخصية.',timeline:'الحلقات متتابعة في أيام متتالية.',conflict:'كيف تكتمل الخريطة مع اختلاف وجهتي نظر الصديقين؟',ending:'يدرك الصديقان أن تعاون أصحاب القرية يكمل الخريطة ويضيء الفانوس.',continuityNotes:'FIXTURE / NOT REAL AI — هذه القيم مصطنعة للتحقق من العقود، وليست تقييمًا للفكرة.',characters:[character('c1','ليلى','قارئة الخريطة وصاحبة المبادرة'),character('c2','عمر','صانع الفوانيس وشريك البحث')],locations:[{id:`${key}-place1`,name:'ورشة الفوانيس',description:'ورشة خيالية فيها خرائط وورق ملون.',timeOfDay:'قبل الغروب',lighting:'ضوء دافئ',atmosphere:'غموض لطيف',purpose:'اكتشاف الدليل واختباره'},{id:`${key}-place2`,name:'ساحة القرية',description:'ساحة خيالية تلتقي فيها طرق القرية.',timeOfDay:'المساء',lighting:'فوانيس دافئة',atmosphere:'فضول وتعاون',purpose:'اختبار نتيجة الاختيار'}],threads:[{id:`${key}-thread1`,question:'لماذا تتغير الخريطة؟',introducedEpisode:1,resolvedEpisode:r.episodeCount}],episodes:[]};
 for(let n=1;n<=r.episodeCount;n++){const ending=n===r.episodeCount?plan.ending:`تظهر علامة جديدة تقود إلى خطوة الحلقة ${n+1}.`;plan.episodes.push({number:n,title:`خطوة الفانوس ${n}`,beginning:n===1?'تجد ليلى الخريطة في الورشة.':plan.episodes.at(-1).ending,mainEvent:`يختبر الصديقان الدليل رقم ${n}.`,turningPoint:'يفهمان أن الاستماع للآخر يغيّر طريقة الاختبار.',ending,continuedFrom:n===1?'':plan.episodes.at(-1).ending,continuityFacts:'الدليل لا يُفهم قبل اختباره.',unresolvedEvents:n===r.episodeCount?'':'سبب تغير العلامات',currentStates:'الصديقان يثقان ببعضهما خطوة أخرى.',scenes:[]});}return validateDirectorOutput(plan,r);
}
export class DirectorFixtureAdapter{
 mode='fixture';async generate(request,{signal}={}){await new Promise(r=>setTimeout(r,25));if(signal?.aborted)rejectDirector('CANCELLED');return {plan:fixtureDirectorPlan(request),provenance:{mode:'fixture',provider:'offline-fixture',model:'director-fixture-v1',promptVersion:'director-v1',requestId:request.requestId,jobId:crypto.randomUUID(),usage:{...ZERO_USAGE}}};}
}
export class DirectorBackendClient{
 status='NOT_CONFIGURED';async generate(){rejectDirector('NOT_CONFIGURED');}
 // Descriptors only: future authenticated same-origin HTTP binding, no credentials or transport here.
 describe(request){assertDirectorRequest(request);return {method:'POST',path:DIRECTOR_BACKEND.submit,cache:'no-store',redirect:'error',credentials:'same-origin',body:JSON.stringify(request)};}
}
export async function generateDirector(p,w,operation,{adapter=new DirectorBackendClient(),getCurrentProject=()=>p,signal}={}){
 const capturedWork=JSON.stringify(w),session=await captureDirector(p,w,operation);if(signal?.aborted)rejectDirector('CANCELLED');
 let output;try{output=await adapter.generate(clone(session.request),{signal});}catch(e){if(signal?.aborted)rejectDirector('CANCELLED');if(e?.code==='NOT_CONFIGURED')rejectDirector('NOT_CONFIGURED');rejectDirector('DIRECTOR_FAILED');}
 if(signal?.aborted)rejectDirector('CANCELLED');if(JSON.stringify(await getCurrentProject())!==session.baseSnapshot||JSON.stringify(w)!==capturedWork)rejectDirector('STALE_CONTEXT');
 assertContractObject(output,['plan','provenance']);assertGenerationProvenance(output.provenance);if(output.provenance.mode!=='fixture'||output.provenance.requestId!==session.request.requestId)rejectDirector('INVALID_RESULT');
 const plan=validateDirectorOutput(output.plan,session.request),candidate={id:crypto.randomUUID(),projectId:p.id,baseSnapshot:session.baseSnapshot,operation:plan.episodes.every(e=>!e.scenes.length)?'outline':'script',status:'Draft',revision:(w.candidate?.revision??-1)+1,createdAt:new Date().toISOString(),provenance:clone(output.provenance),plan};assertDirectorCandidate(candidate,p.id);return candidate;
}
export function editDirectorCandidate(candidate,path,text){
 assertDirectorCandidate(candidate,candidate.projectId);if(candidate.status!=='Draft'||typeof text!=='string'||!directorTargets(candidate.plan).some(t=>t.path===path)||typeof directorAt(candidate.plan,path)!=='string')rejectDirector('INVALID_REQUEST');
 const next=clone(candidate);next.plan=setDirectorAt(next.plan,path,text);next.revision++;assertDirectorCandidate(next,next.projectId);assertTeenStorySafety(next.plan);return next;
}
export function approveDirector(p,c,{confirmed=false}={}){
 assertDirectorCandidate(c,p.id);if(!confirmed||c.status!=='Draft'||!directorEligible(p)||JSON.stringify(p)!==c.baseSnapshot||p.directorHistory?.some(h=>h.candidateId===c.id))rejectDirector('STALE_CONTEXT');
 assertDirectorCanon(p);
 assertTeenStorySafety(c.plan);
 const next=clone(p),plan=c.plan,owned=approvedDirectorPlan(p);
 for(const ch of plan.characters){let current=next.characters.find(x=>x.id===ch.id);if(current&&!owned?.characters.some(x=>x.id===ch.id)){if(['name','role','personality','goals','fears','relationships','knows','doesNotKnow','firstEpisode'].some(k=>current[k]!==ch[k]))rejectDirector('PROTECTED_STORY');continue;}if(!current){current={...model.newCharacter(),id:ch.id};next.characters.push(current);}for(const key of ['name','role','personality','goals','fears','relationships','knows','doesNotKnow','firstEpisode'])current[key]=ch[key];}
 for(const place of plan.locations){let current=next.locations.find(x=>x.id===place.id);if(current&&!owned?.locations.some(x=>x.id===place.id))rejectDirector('PROTECTED_STORY');if(!current){current={...model.newLocation(),id:place.id};next.locations.push(current);}for(const key of ['name','description','timeOfDay','lighting','atmosphere','purpose'])current[key]=place[key];}
 for(const key of ['title','premise','worldRules','timeline','conflict','ending','continuityNotes'])next.bible[key]=plan[key];next.title=plan.title;
 for(const e of plan.episodes){const target=next.episodes.find(x=>!x.archived&&x.number===e.number);if(!target)rejectDirector('INVALID_RESULT');for(const key of ['title','beginning','mainEvent','turningPoint','ending','continuedFrom','continuityFacts','unresolvedEvents','currentStates'])target[key]=e[key];target.timelineStart=e.number;target.characterIds=episodeCast(plan,e);target.locationIds=episodePlaces(plan,e);
  for(const s of e.scenes){let scene=target.scenes.find(x=>x.id===s.id);if(!scene){scene={...model.newScene(s.number),id:s.id};target.scenes.push(scene);}Object.assign(scene,{number:s.number,locationId:s.locationId,characterIds:clone(s.characterIds),visual:s.visual,camera:s.camera,action:s.action,narration:s.narration,seconds:s.seconds,timeline:s.timeline,dialogue:s.lines.map(l=>`${plan.characters.find(c=>c.id===l.characterId).name}: ${l.text}`).join('\n')});if(next.identitySchemaVersion&&!scene.characterBindings?.length)Object.assign(scene,bindScene(next,target,scene));}
 }
 for(const t of plan.threads){const previous=next.events.find(x=>x.id===t.id);const value={id:t.id,description:t.question,introducedEpisode:t.introducedEpisode,resolvedEpisode:t.resolvedEpisode};if(previous)Object.assign(previous,value);else next.events.push(value);}
 next.directorHistory??=[];next.directorHistory.push({id:crypto.randomUUID(),candidateId:c.id,approvedAt:new Date().toISOString(),operation:c.operation,revision:c.revision,provenance:clone(c.provenance),plan:clone(plan)});next.updatedAt=new Date(Math.max(Date.now(),Date.parse(p.updatedAt)+1)).toISOString();
 if(!model.validateBackup(model.makeBackup([next]),{allowMissingAssets:true}).valid)rejectDirector('INVALID_RESULT');return next;
}
export function directorLabel(record){return record?.provenance?.mode==='fixture'?FIXTURE_LABEL:'NOT_CONFIGURED';}
