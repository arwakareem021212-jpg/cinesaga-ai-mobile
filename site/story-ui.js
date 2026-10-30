import {createDirectorUI} from './story-director-ui.js';
import {createBridgeUI} from './chatgpt-bridge-ui.js';
import {bt} from './chatgpt-bridge-i18n.js';
import * as story from './story.js';
import * as store from './db.js';
import {assertProposal} from './story-contract.js';
import {DemoStoryAdapter} from './story-demo.js';
import {createProposalAsync,regenerateSelectedAsync} from './story-generation.js';
import {s,storyErrorMessage} from './story-i18n.js';
import {getLanguage,t} from './i18n.js';
import {reviewStoryContinuity} from './story-continuity.js';
import {continuityText} from './continuity-i18n.js';
import {createManualWorkUI} from './manual-work-ui.js';
import {m} from './manual-story-i18n.js';
import {createAgentUI} from './story-agent-ui.js';
import {adapterForAgentProposal} from './story-agent.js';

export function createStoryUI({state,project,render,esc,button,tag,toast}) {
  const bridgeUI=createBridgeUI({state,project,render,esc,button,toast});let legacyOpen=false;
  const directorUI=createDirectorUI({state,project,render,esc,button,toast});
  const adapter=new DemoStoryAdapter(),$=selector=>document.querySelector(selector);
  let proposal=null,owner='',editing=false,pending=Promise.resolve(),busy=false;
  const manualUI=createManualWorkUI({state,project,render,esc,button,toast,getProposal:()=>proposal,setProposal:async(next,fresh)=>{proposal=next;owner=fresh.id;editing=false;state.projects[state.projects.findIndex(p=>p.id===fresh.id)]=fresh;}});
  const agentUI=createAgentUI({state,project,render,esc,button,toast,getProposal:()=>proposal,setProposal:async(next,fresh)=>{proposal=next;owner=fresh.id;editing=false;state.projects[state.projects.findIndex(p=>p.id===fresh.id)]=fresh;}});
  let request={task:'direction',episodeId:'',sceneId:'',characterId:'',instructions:''},mode='Direct with me',directTask='direction';
  const status=()=>project()?.storyHistory?.some(h=>h.proposalId===proposal?.id)?'Approved':proposal?.status;
  const provenanceLabel=record=>record?.provenance?.mode==='manual'?m('candidateLabel'):record?.provenance?.mode&&record.provenance.mode!=='demo'?record.label:s('demo');
  const latestSource=id=>async()=>(await store.getProjects(state.db)).find(p=>p.id===id);
  const message=storyErrorMessage;
  async function persistDraft(){if(!proposal)return;assertProposal(proposal,proposal.projectId);const value=structuredClone(proposal);pending=pending.catch(()=>{}).then(()=>store.saveDraft(story.storyDraftKey(value.projectId),{type:'STORY_PROPOSAL',projectId:value.projectId,proposal:value},state.db));await pending;await manualUI.proposalChanged(value);const hint=$('#story-save-status');if(hint)hint.textContent=s('savedDraft');}
  async function load(){await pending;const p=project();owner=p.id;proposal=null;editing=false;mode=p.config.controlMode;request={task:mode==='Create for me'?'complete':'direction',episodeId:p.episodes.find(e=>!e.archived)?.id||'',sceneId:'',characterId:p.characters.find(c=>!c.archived)?.id||'',instructions:''};const saved=await store.getDraft(story.storyDraftKey(p.id),state.db);if(saved?.type==='STORY_PROPOSAL'){assertProposal(saved.proposal,p.id);if(project()?.id===p.id){proposal=saved.proposal;request={...request,...proposal.request};mode=request.task==='complete'?'Create for me':'Direct with me';}}directTask=request.task==='complete'?'direction':request.task;await manualUI.load(p,proposal);await agentUI.load(p);await directorUI.load(p);await bridgeUI.load(p);}
  const options=(values,selected)=>values.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');
  function requestForm(){const p=project(),episode=p.episodes.find(e=>e.id===request.episodeId),task=mode==='Create for me'?'complete':request.task;
    return `<details class="story-request panel" ${!proposal||status()!=='Draft'?'open':''}><summary>${esc(s('newRequest'))}</summary><form id="story-request-form"><div class="field"><label for="story-mode">${esc(s('mode'))}</label><select id="story-mode" name="mode">${options([['Create for me',t('createforme')],['Direct with me',t('directwithme')]],mode)}</select></div>${mode==='Direct with me'?`<div class="field"><label for="story-task">${esc(s('task'))}</label><select id="story-task" name="task">${options(story.TASKS.filter(k=>k!=='complete').map(k=>[k,s(k)]),task)}</select></div>`:''}${['episode','scenes','dialogue'].includes(task)?`<div class="field"><label for="story-episode">${esc(s('chooseEpisode'))}</label><select id="story-episode" name="episodeId" required>${options(p.episodes.filter(e=>!e.archived).map(e=>[e.id,`${e.number} · ${e.title}`]),request.episodeId)}</select></div>`:''}${['scenes','dialogue'].includes(task)?`<div class="field"><label for="story-scene">${esc(s('chooseScene'))}</label><select id="story-scene" name="sceneId" ${task==='dialogue'?'required':''}>${options([...(task==='scenes'?[['',s('newScene')]]:[['',t('choose')]]),...(episode?.scenes||[]).filter(sc=>!sc.archived).map(sc=>[sc.id,`${sc.number} · ${sc.visual.slice(0,55)}`])],request.sceneId)}</select>${task==='dialogue'&&!episode?.scenes.some(sc=>!sc.archived)?`<p>${esc(s('noScene'))}</p>`:''}</div>`:''}${task==='characters'?`<div class="field"><label for="story-character">${esc(s('chooseCharacter'))}</label><select id="story-character" name="characterId">${options([['',s('newCharacter')],...p.characters.filter(c=>!c.archived).map(c=>[c.id,c.name])],request.characterId)}</select></div>`:''}<div class="field"><label for="story-instructions">${esc(s('instructions'))}</label><textarea id="story-instructions" name="instructions" rows="3" maxlength="2000" dir="auto" placeholder="${esc(s('instructionsHint'))}">${esc(request.instructions)}</textarea></div><p class="text-muted">${esc(s('scope'))}</p>${proposal?`<p class="text-muted">${esc(s('newReplaces'))}</p>`:''}<button type="submit" class="button primary">${esc(s('prepare'))}</button></form></details>`;
  }
  function targetName(change){const p=project(),target=change.target;if(target.kind==='bible')return s('bible');if(target.kind==='character')return p.characters.find(c=>c.id===target.id)?.name||s('newCharacter');const episode=p.episodes.find(e=>e.id===(target.episodeId||target.id));return `${s('groupEpisode')} ${episode?.number||(target.kind==='episode'?change.value?.number:null)||'—'}${target.kind==='scene'?' · '+s('groupScene')+' '+(episode?.scenes.find(sc=>sc.id===target.id)?.number||'+'):''}`;}
  const display=value=>Array.isArray(value)?value.map(id=>project().characters.find(c=>c.id===id)?.name||id).join(', '):String(value??'');
  function editor(change,index){const fields=change.field==='$new'?Object.entries(change.value):[[change.field,change.value]];return fields.map(([key,value])=>`<div class="field"><label for="story-value-${index}-${key}">${esc(t(key))}</label>${['characterIds','locationId','timeline','seconds','firstEpisode','number'].includes(key)?`<p class="preserve">${esc(key==='locationId'?project().locations.find(l=>l.id===value)?.name||value:display(value))}</p>`:`<textarea id="story-value-${index}-${key}" data-story-index="${index}" data-story-field="${key}" rows="3" maxlength="12000" dir="auto">${esc(value)}</textarea>`}</div>`).join('');}
  function valueView(value){return value&&typeof value==='object'?Object.entries(value).map(([key,item])=>`<div class="detail-block"><h4>${esc(t(key))}</h4><p class="preserve" dir="auto">${esc(key==='locationId'?project().locations.find(l=>l.id===item)?.name||item:display(item))}</p></div>`).join(''):`<p class="preserve" dir="auto">${esc(value??s('noPrevious'))}</p>`;}
  function changeView(change,index,readOnly=false){return `<details class="story-change" ${index===0?'open':''}><summary><span>${esc(targetName(change))} · ${esc(change.field==='$new'?s('newContent'):t(change.field))}</span>${!readOnly?`<label class="story-include"><input type="checkbox" data-story-select="${index}" ${change.selected?'checked':''}><span>${esc(s('include'))}</span></label>`:''}</summary><div class="story-comparison"><section><h4>${esc(s('before'))}</h4>${valueView(change.before)}</section><section><h4>${esc(s('after'))}</h4>${editing&&!readOnly?editor(change,index):valueView(change.value)}</section></div></details>`;}
  function contextView(){if(!proposal)return '';let context;try{context=story.buildStoryContext(JSON.parse(proposal.baseSnapshot),proposal.request);}catch{return '';}
    return `<details class="panel story-context"><summary>${esc(s('context'))}</summary><p>${esc(s('contextHint'))}</p><h3>${esc(s('world'))}</h3><p class="preserve" dir="auto">${esc(context.world.rules)}</p><h3>${esc(s('previous'))}</h3><p class="preserve" dir="auto">${esc(context.previousEnding||t('none'))}</p><h3>${esc(s('threads'))}</h3><p class="preserve" dir="auto">${esc(context.unresolvedThreads.join('\n')||t('none'))}</p><h3>${esc(s('knowledge'))}</h3>${context.characters.map(c=>`<p class="preserve" dir="auto"><strong>${esc(c.name)}</strong>: ${esc(c.knows||s('knowledgeEmpty'))}</p>`).join('')}<h3>${esc(s('author'))}</h3><p>${esc(s('authorHint'))}</p><p class="preserve" dir="auto">${esc(context.authorOnly.intendedEnding)}\n${esc(context.authorOnly.unrevealedSecrets)}</p></details>`;
  }
  function continuityView(){
    const ct=key=>continuityText(key,getLanguage());
    let content;
    try{
      const review=reviewStoryContinuity(project(),proposal);
      const group=(severity,title)=>{const items=review.findings.filter(f=>f.severity===severity);return `<details class="continuity-group" ${severity==='error'&&items.length?'open':''}><summary>${esc(ct(title))} (${items.length})</summary>${!items.length&&severity==='error'?`<p>${esc(ct('none'))}</p>`:''}<ul>${items.slice(0,50).map(f=>`<li data-continuity-code="${esc(f.code)}"><strong>${esc(ct(f.code))}</strong><p><span class="badge">${esc(ct(f.origin))}</span> <bdi>${esc(f.where)}</bdi></p>${f.evidence.length?`<details><summary>${esc(ct('details'))}</summary><ul>${f.evidence.map(value=>`<li dir="auto">${esc(value)}</li>`).join('')}</ul></details>`:''}</li>`).join('')}</ul>${items.length>50?`<p>${esc(ct('more'))}</p>`:''}</details>`;};
      content=`<p>${esc(ct('intro'))}</p>${group('error','errors')}${group('suggestion','suggestions')}<details class="continuity-manual"><summary>${esc(ct('checklist'))}</summary><ul>${review.manual.map(key=>`<li>${esc(ct(key))}</li>`).join('')}</ul></details>`;
    }catch(error){content=`<p>${esc(message(error))}</p>`;}
    return `<section class="story-continuity-review" aria-label="${esc(ct('title'))}"><h3>${esc(ct('title'))}</h3>${content}</section>`;
  }
  function legacyView(){const p=project(),active=owner===p.id&&proposal,readOnly=status()!=='Draft';let error='',warnings=[];
    if(active&&!readOnly)try{if(proposal.changes.some(c=>c.selected))warnings=story.proposalReview(p,proposal);}catch(e){error=message(e);}
    const visibleChanges=active?(status()==='Approved'?p.storyHistory.find(record=>record.proposalId===proposal.id).changes:proposal.changes):[];
    const count=visibleChanges.filter(c=>c.selected).length;
    return `<section class="story-workshop"><div class="section-heading"><div><div class="eyebrow">${esc(s('demo'))}</div><h2>${esc(s('story'))}</h2><p>${esc(s('intro'))}</p></div></div><aside class="story-demo-note"><strong>${esc(s('demo'))}</strong><p>${esc(s('demoHint'))}</p><small>${esc(s('unconfigured'))}</small></aside>${directorUI.view()}${!p.originalStory?requestForm():''}${agentUI.view()}${!p.originalStory?manualUI.view():''}${active?`<section class="story-review" aria-label="${esc(s('review'))}"><div class="section-heading"><div><h2>${esc(s('review'))}</h2><span class="badge gold">${esc(provenanceLabel(proposal))}</span><p>${esc(s(proposal.task))} · <span id="story-selection-count">${count}</span> ${esc(s('selected'))}</p></div>${tag(s(status().toLowerCase()))}${!readOnly?button(s(editing?'preview':'edit'),'story-edit','secondary'):''}</div><p class="text-muted">${esc(s('protected'))}</p><div class="story-change-list">${visibleChanges.map((change,index)=>changeView(change,index,readOnly)).join('')}</div>${!readOnly?`<div class="story-review-notes" role="status">${error?`<p class="story-error">${esc(error)}</p>${button(s('refresh'),'story-refresh','secondary')}`:''}${warnings.length?`<details class="story-warnings"><summary>${esc(s('warnings'))} (${warnings.length})</summary><p>${esc(s('warningsHint'))}</p><ul>${warnings.map(w=>`<li>${esc(getLanguage()==='ar'?s('validation'):w.message)} <span dir="auto">${esc(w.evidence)}</span></li>`).join('')}</ul></details>`:''}</div>${continuityView()}<div class="story-approval"><label class="checkbox-option"><input type="checkbox" id="story-confirm" ${error||!count?'disabled':''}>${esc(s('reviewed'))}</label><div class="story-approval-actions">${button(s('approve'),'story-approve','primary','disabled')}${button(proposal.provenance?.mode==='manual'?m('reviseSelected'):s('regenerate'),'story-regenerate','secondary',error||!count?'disabled':'')}${button(s('reject'),'story-reject','ghost')}</div><p id="story-save-status" class="draft-status" aria-live="polite">${esc(s('savedDraft'))}</p></div>`:''}</section>${contextView()}`:''}<details class="panel story-history"><summary>${esc(s('history'))} (${p.storyHistory?.length||0})</summary><p>${esc(s('historyHint'))}</p>${(p.storyHistory||[]).slice().reverse().map(record=>`<details><summary>${esc(s(record.task))} · ${esc(new Date(record.approvedAt).toLocaleDateString(getLanguage()==='ar'?'ar-EG':'en-GB'))} · ${esc(provenanceLabel(record))}</summary>${record.changes.map((change,index)=>changeView(change,index,true)).join('')}</details>`).join('')}</details></section>`;
  }
  function view(){return `<section class="story-workshop">${bridgeUI.view()}<details id="story-previous-tools" class="panel" ${legacyOpen?'open':''}><summary>${esc(bt('other'))}</summary>${legacyView()}</details></section>`;}
  document.addEventListener('toggle',e=>{if(e.target.id==='story-previous-tools')legacyOpen=e.target.open;},true);
  function showLegacy(){legacyOpen=true;$('#story-previous-tools')?.setAttribute('open','');}
  function captureRequest(){const form=$('#story-request-form');if(!form)return;const data=new FormData(form);mode=String(data.get('mode'));for(const key of ['task','episodeId','sceneId','characterId','instructions'])if(data.has(key))request[key]=String(data.get(key));if(data.has('task'))directTask=String(data.get('task'));request.task=mode==='Create for me'?'complete':directTask;}
  async function prepareComplete(){await load();request.task='complete';mode='Create for me';proposal=await createProposalAsync(project(),request,adapter,{getCurrentProject:latestSource(project().id)});await persistDraft();render();}
  async function handleAction(el){if(el.dataset.action.startsWith('story-bridge-'))return bridgeUI.action(el.dataset.action,el.dataset.id);showLegacy();if(el.dataset.action.startsWith('story-director-'))return directorUI.action(el.dataset.action);if(el.dataset.action.startsWith('story-agent-')){await pending;return agentUI.action(el.dataset.action);}if(busy)return;const action=el.dataset.action;busy=true;try{
    await pending;
    if(action.startsWith('story-manual-'))await manualUI.handleAction(action);
    if(action==='story-edit'){editing=!editing;render();}
    if(action==='story-refresh'){const fresh=(await store.getProjects(state.db)).find(p=>p.id===state.currentId);if(fresh){state.projects[state.projects.findIndex(p=>p.id===fresh.id)]=fresh;await load();render();}}
    if(action==='story-reject'){proposal={...proposal,status:'Rejected'};await persistDraft();editing=false;render();toast(s('rejectedToast'));}
    if(action==='story-regenerate'){if(proposal.provenance?.mode==='manual')await manualUI.prepareRevision();else{proposal=await regenerateSelectedAsync(project(),proposal,adapterForAgentProposal(proposal)||adapter,{getCurrentProject:latestSource(project().id)});await persistDraft();render();toast(s('regenerated'));}}
    if(action==='story-approve'){
      const source=project(),saved=story.approveProposal(source,proposal,{confirmed:!!$('#story-confirm')?.checked});
      await store.saveProject(saved,state.db,source.updatedAt,proposal.baseSnapshot);
      state.projects[state.projects.findIndex(p=>p.id===saved.id)]=saved;editing=false;render();toast(s('approvedToast'));
    }
  }catch(error){toast(message(error));}finally{busy=false;}}
  document.addEventListener('submit',async event=>{if(event.target.id!=='story-request-form')return;event.preventDefault();showLegacy();if(busy)return;busy=true;const submit=event.submitter;if(submit)submit.disabled=true;try{
    captureRequest();await pending;const id=project().id,fresh=(await store.getProjects(state.db)).find(p=>p.id===id);if(!fresh)throw new Error('Series no longer exists.');
    state.projects[state.projects.findIndex(p=>p.id===id)]=fresh;proposal=await createProposalAsync(fresh,request,adapter,{getCurrentProject:latestSource(id)});owner=id;editing=false;await persistDraft();if(project()?.id===id){render();$('.story-review')?.scrollIntoView({block:'start'});}
  }catch(error){if(submit)submit.disabled=false;toast(message(error));}finally{busy=false;}});
  document.addEventListener('change',event=>{
    if(event.target.closest('#story-request-form')){showLegacy();const wasOpen=event.target.closest('details').open;captureRequest();if(event.target.id==='story-episode')request.sceneId='';render();$('#story-request-form').closest('details').open=wasOpen;}
    if(event.target.hasAttribute('data-story-select')&&proposal&&status()==='Draft'){
      proposal.changes[Number(event.target.dataset.storySelect)].selected=event.target.checked;persistDraft().catch(e=>toast(message(e)));render();
    }
    if(event.target.id==='story-confirm'){const approve=$('[data-action="story-approve"]');if(approve)approve.disabled=!event.target.checked;}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='story-instructions')request.instructions=event.target.value;
    if(!event.target.hasAttribute('data-story-index')||!proposal||status()!=='Draft')return;
    const change=proposal.changes[Number(event.target.dataset.storyIndex)],field=event.target.dataset.storyField;
    if(change.field==='$new')change.value[field]=event.target.value;else change.value=event.target.value;
    const approve=$('[data-action="story-approve"]');if(approve)approve.disabled=true;const confirm=$('#story-confirm');if(confirm)confirm.checked=false;
    const review=$('.story-continuity-review');if(review)review.outerHTML=continuityView();
    persistDraft().catch(e=>toast(message(e)));
  });
  return {view,load,handleAction,prepareComplete};
}


