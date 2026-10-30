import * as store from './db.js';
import {t} from './i18n.js';
import {s} from './story-i18n.js';
import {storyDraftKey} from './story.js';
import {manualErrorCode,importManualStory,manualEpisodeCount} from './manual-story.js';
import {manualWorkKey,assertManualWork} from './manual-work-contract.js';
import {newManualWork,prepareWork,restoreWorkSession,mapPlainWork,plainDestinations,refreshManualWork,workErrorCode} from './manual-work.js';
import {mw as m} from './manual-work-i18n.js';
export function createManualWorkUI({state,project,render,esc,button,toast,getProposal,setProposal}){
  let work=null,saved=null,session=null,open=false,preview=false,queue=Promise.resolve(),saveError=false,saving=0;
  const $=q=>document.querySelector(q),options=(values,selected)=>values.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');
  const hint=key=>{const el=$('#manual-save-status');if(el)el.textContent=m(key);};
  function persist(){
    const next=structuredClone(work);saving++;hint('savingWork');
    queue=queue.then(async()=>{if(saveError)throw Error();saved=await store.saveManualWork(next,saved,state.db);}).finally(()=>{saving--;hint(saveError?'saveFailed':saving?'savingWork':'savedWork');});
    queue.catch(()=>{saveError=true;hint('saveFailed');});return queue;
  }
  const canonical=async()=>({p:(await store.getProjects(state.db)).find(p=>p.id===work.projectId),proposal:(await store.getDraft(storyDraftKey(work.projectId),state.db))?.proposal??null});
  async function load(p,proposal){
    await queue.catch(()=>{});if(saveError&&work?.projectId===p.id)return;
    saved=await store.getDraft(manualWorkKey(p.id),state.db)??null;
    if(saved)assertManualWork(saved);work=saved?structuredClone(saved):newManualWork(p,proposal);saveError=false;queue=Promise.resolve();preview=!!work.text;open=!!work.text||!!work.prepared;
    try{session=restoreWorkSession(work);}catch{session=null;toast(m('invalidResponse'));}
  }
  function destinationLabel(row){return `${row.label.kind==='bible'?s('bible'):s('groupEpisode')+' '+row.label.episode}${row.label.kind==='scene'?' · '+s('groupScene')+' '+row.label.scene:''} · ${t(row.field)}`;}
  function view(){if(!work||work.projectId!==project().id)return '';
    return `<details id="manual-workflow" class="story-request panel" ${open?'open':''}><summary>${esc(m('title'))}</summary><form id="manual-story-form"><p>${esc(m('intro'))}</p>
    <div class="field"><label for="manual-idea">${esc(m('idea'))}</label><textarea id="manual-idea" rows="3" maxlength="5000" dir="auto">${esc(work.idea)}</textarea></div>
    <div class="field"><label for="manual-kind">${esc(m('kind'))}</label><select id="manual-kind">${options([['concept',m('concept',manualEpisodeCount(project()))],['episode',m('episode')]],work.kind)}</select></div>
    ${work.kind==='episode'?`<div class="field"><label for="manual-episode">${esc(m('episodeChoice'))}</label><select id="manual-episode">${options(project().episodes.filter(e=>!e.archived).map(e=>[e.id,`${e.number} · ${e.title}`]),work.episodeId)}</select></div>`:''}
    <fieldset><legend>${esc(m('cast'))}</legend>${project().characters.filter(c=>!c.archived).map(c=>`<label class="checkbox-option"><input type="checkbox" data-manual-character="${esc(c.id)}" ${work.characterIds.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</fieldset>
    <div class="field"><label for="manual-dialogue">${esc(m('dialogue'))}</label><select id="manual-dialogue">${options([['egyptian',m('egyptian')],['msa',m('msa')],['english',m('english')]],work.dialogueLanguage)}</select><p>${esc(m('languageHint'))}</p></div>
    <div class="field"><label for="manual-format">${esc(m('format'))}</label><select id="manual-format">${options([['plain',m('plain')],['structured',m('structured')]],work.format)}</select></div><p>${esc(m(work.format==='plain'?'plainScope':'structuredScope'))}</p><p>${esc(m('privacy'))}</p>
    ${button(m('prepare'),'story-manual-prepare','secondary')}${session?`<div class="field"><label for="manual-prompt">${esc(m('prompt'))}</label><textarea id="manual-prompt" rows="8" readonly dir="auto">${esc(session.prompt)}</textarea></div>${button(m('copy'),'story-manual-copy','secondary')}`:''}
    <p>${esc(m('pending'))}</p><div class="field"><label for="manual-response">${esc(m('response'))}</label><textarea id="manual-response" rows="8" maxlength="256000" dir="auto">${esc(work.text)}</textarea></div>${button(m('import'),'story-manual-import','primary')}
    <p id="manual-save-status" class="draft-status" aria-live="polite">${esc(m(saveError?'saveFailed':saving?'savingWork':'savedWork'))}</p>
    ${preview&&work.format==='plain'?`<section class="story-change" id="manual-raw-review"><div class="card-body"><h3>${esc(m('rawTitle'))}</h3><span class="badge">${esc(s(work.status.toLowerCase()))}</span><p>${esc(m('rawHint'))}</p><p id="manual-raw-preview" class="preserve" dir="auto">${esc(work.text)}</p>${work.status==='Rejected'?`<p>${esc(m('rawRejected'))}</p>`:`<div class="field"><label for="manual-destination">${esc(m('destination'))}</label><select id="manual-destination">${options([['',m('choose')],...plainDestinations(project()).map(row=>[row.key,destinationLabel(row)])],work.destination)}</select></div><div class="field"><label for="manual-excerpt">${esc(m('passage'))}</label><textarea id="manual-excerpt" maxlength="12000" rows="4" dir="auto">${esc(work.excerpt)}</textarea><p>${esc(m('passageHint'))}</p></div><p>${esc(m('preserveWarning'))}</p>${button(m('map'),'story-manual-map','secondary')}${button(m('rejectRaw'),'story-manual-reject','ghost')}`}</div></section>`:''}
    <p>${esc(m('latestHint'))}</p>${button(m('reviewLatest'),'story-manual-refresh','secondary')}</form></details>`;
  }
  async function prepare(revision=false){
    await queue;const {p,proposal}=await canonical();if(!p)throw Error();
    if(revision||!work.text)work=refreshManualWork(p,work,proposal);
    session=prepareWork(p,work,proposal,revision);work.prepared={id:session.id,revision};open=true;await persist();render();$('#manual-prompt')?.focus();toast(m('prepared'));
  }
  async function candidate(next,p){
    const updated={...structuredClone(work),draftFingerprint:JSON.stringify(next),mappedProposalId:next.id,prepared:null};
    try{saved=await store.saveManualWork(updated,saved,state.db,next);}catch(error){saveError=true;hint('saveFailed');throw error;}work=structuredClone(updated);session=null;await setProposal(next,p);render();$('.story-review')?.scrollIntoView({block:'start'});toast(m('mapped'));
  }
  async function handleAction(action){
    try{
      await queue;
      if(action==='story-manual-prepare')await prepare();
      if(action==='story-manual-copy'){if(!session)throw Error();try{await navigator.clipboard.writeText(session.prompt);toast(m('copied'));}catch{$('#manual-prompt')?.focus();$('#manual-prompt')?.select();toast(m('copyFallback'));}}
      if(action==='story-manual-import'){
        if(!work.text.trim()){toast(m('emptyText'));return;}
        if(work.format==='plain'){preview=true;open=true;await persist();render();$('#manual-raw-review')?.scrollIntoView({block:'start'});toast(m('unmapped'));}
        else{const {p,proposal}=await canonical();await candidate(importManualStory(p,session,work.text,proposal),p);}
      }
      if(action==='story-manual-map'){const {p,proposal}=await canonical();await candidate(mapPlainWork(p,work,proposal),p);}
      if(action==='story-manual-reject'){work.status='Rejected';await persist();render();}
      if(action==='story-manual-refresh'){const {p,proposal}=await canonical();work=refreshManualWork(p,work,proposal);session=null;await persist();state.projects[state.projects.findIndex(x=>x.id===p.id)]=p;render();toast(m('refreshDone'));}
    }catch(error){toast(m(saveError?'saveFailed':workErrorCode(error)||manualErrorCode(error)));}
  }
  document.addEventListener('input',event=>{
    const field={'manual-response':'text','manual-excerpt':'excerpt','manual-idea':'idea'}[event.target.id];if(!field||!work)return;
    work[field]=event.target.value;if(field==='idea'){session=null;work.prepared=null;}const previewEl=$('#manual-raw-preview');if(previewEl&&field==='text')previewEl.textContent=work.text;persist().catch(()=>{});
  });
  document.addEventListener('change',event=>{
    if(!work)return;const field={'manual-kind':'kind','manual-episode':'episodeId','manual-dialogue':'dialogueLanguage','manual-format':'format','manual-destination':'destination'}[event.target.id];
    if(!field&&!event.target.hasAttribute('data-manual-character'))return;
    if(field)work[field]=event.target.value;else work.characterIds=[...document.querySelectorAll('[data-manual-character]:checked')].map(el=>el.dataset.manualCharacter);
    if(field!=='destination'){session=null;work.prepared=null;}open=true;persist().catch(()=>{});render();
  });
  document.addEventListener('submit',e=>{if(e.target.id==='manual-story-form')e.preventDefault();});
  document.addEventListener('toggle',e=>{if(e.target.id==='manual-workflow')open=e.target.open;},true);
  async function proposalChanged(next){if(work?.mappedProposalId===next.id&&work.baseSnapshot===next.baseSnapshot){work.draftFingerprint=JSON.stringify(next);work.prepared=null;session=null;await persist();}}
  return {view,load,handleAction,proposalChanged,prepareRevision:()=>prepare(true)};
}
