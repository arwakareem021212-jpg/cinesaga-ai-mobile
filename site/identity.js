/** Additive Phase 2 identity records. This module never writes storage or calls a provider. */
export const IDENTITY_VERSION = 1;
export const ATTRIBUTES = ['face','skinTone','hair','eyes','ageRange','body','clothing','accessories','colors','artStyle','voice'];
export const MODES = ['all','identity','identity-outfit','custom'];
export const BOARD_STATUSES = ['Draft','Awaiting approval','Approved and locked','Needs revision','Archived'];
export const NEGATIVES = ['Do not change face','Do not change hair','Do not change outfit','Do not add accessories','Do not alter age','Do not change art style'];
const LOCK_NEGATIVES = {face:'Do not change face',skinTone:'Do not change skin tone',hair:'Do not change hair',eyes:'Do not change eye appearance',ageRange:'Do not alter age',body:'Do not change body proportions',clothing:'Do not change outfit',accessories:'Do not add accessories',colors:'Do not change approved colors',artStyle:'Do not change art style',voice:'Do not change voice identity'};
// Locks are authoritative. Resolve legacy fixed defaults without rewriting saved history.
export function negativeInstructionsForBoard(board) {
  const locks=locksForMode(board.lockMode,board.locks),known=new Set(Object.values(LOCK_NEGATIVES));
  return [...Object.entries(LOCK_NEGATIVES).filter(([key])=>locks[key]).map(([,text])=>text),...(board.negativeInstructions||[]).filter(text=>!known.has(text))];
}
export const SCOPES = ['scene','episode','future','series'];
const clone = value => structuredClone(value);
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const approved = version => version?.status === 'Approved and locked' && version.board?.status === 'Approved and locked';
export function locksForMode(mode='all', custom={}) {
  if (!MODES.includes(mode)) throw new Error('Unknown identity lock mode.');
  const identity = ['face','skinTone','hair','eyes','ageRange','body','voice'];
  return Object.fromEntries(ATTRIBUTES.map(key=>[key,mode==='all'||(mode==='custom'?custom[key]===true:identity.includes(key)||(mode==='identity-outfit'&&['clothing','accessories'].includes(key)))]));
}
export function characterIdentity(character) { return character.identity || {schemaVersion:1,defaultVersionId:'',versions:[],references:[],history:[]}; }
export function getVersion(character,versionId) {return characterIdentity(character).versions.find(v=>v.id===versionId);}
export function duplicateCharacterIdentity(character) {
  if(!character.identity)return undefined;
  const source=currentVersion(character),references=characterIdentity(character).references.map(r=>({...clone(r),id:id()}));
  const result={schemaVersion:1,defaultVersionId:'',references,versions:[],history:[]};
  if(source){const version=clone(source),oldRefs=characterIdentity(character).references;version.id=id();version.number=1;version.createdAt=now();version.previousVersionId='';version.status='Draft';version.reason='Copied character appearance; requires separate approval.';version.board.id=id();version.board.status='Draft';delete version.board.approvedAt;version.outfitVersionId=id();version.voiceVersionId=id();version.board.referenceIds=source.board.referenceIds.map(rid=>references[oldRefs.findIndex(r=>r.id===rid)]?.id).filter(Boolean);version.board.primaryReferenceId=references[oldRefs.findIndex(r=>r.id===source.board.primaryReferenceId)]?.id||'';result.versions=[version];}
  return result;
}
export function currentVersion(character) {const identity=characterIdentity(character);return getVersion(character,identity.defaultVersionId)||identity.versions.at(-1);}
export function createAppearanceDraft(character,{replacement=false,sourceVersionId,attributes={},reason='',keep=[],lockMode,customLocks}={}) {
  const identity=characterIdentity(character);
  // Revisions have one source snapshot. A rollback can make it older than the latest approved version.
  const sourceId=sourceVersionId??(identity.defaultVersionId||currentVersion(character)?.id);
  const previous=replacement?identity.versions.filter(approved).slice().sort((a,b)=>a.number-b.number).at(-1)||currentVersion(character):getVersion(character,sourceId);
  const mode=lockMode??(!replacement?previous?.board.lockMode:undefined)??'all';
  const locks=customLocks??(!replacement?previous?.board.locks:undefined)??{};
  const referenceIds=replacement?[]:(previous?.board.referenceIds||[]).filter(rid=>identity.references.some(ref=>ref.id===rid&&!ref.archived&&safeId(ref.assetId)));
  const primaryReferenceId=!replacement&&referenceIds.includes(previous?.board.primaryReferenceId)?previous.board.primaryReferenceId:'';
  const baseline = {face:character.appearance||'',skinTone:'',hair:'',eyes:'',ageRange:character.ageRange||'',body:'',clothing:character.clothing||'',accessories:'',colors:'',artStyle:'',voice:character.voice||'Existing voice identity'};
  const values=Object.fromEntries(ATTRIBUTES.map(key=>[key,replacement?(key==='voice'?(previous?.board.attributes.voice||baseline.voice):'From the new reference image'):(previous?.board.attributes[key]??baseline[key]) ]));
  for(const key of keep)if(ATTRIBUTES.includes(key))values[key]=previous?.board.attributes[key]||baseline[key];
  for(const key of ATTRIBUTES)if(typeof attributes[key]==='string')values[key]=attributes[key];
  const board={id:id(),status:'Draft',attributes:values,lockMode:mode,locks:locksForMode(mode,locks),referenceIds,primaryReferenceId,negativeInstructions:clone(!replacement&&previous?.board.negativeInstructions||[])};
  board.negativeInstructions=negativeInstructionsForBoard(board);
  return {id:id(),number:Math.max(0,...identity.versions.map(v=>v.number))+1,createdAt:now(),previousVersionId:previous?.id||'',reason,status:'Draft',outfitVersionId:id(),voiceVersionId:previous?.voiceVersionId||id(),voiceReplaced:false,board};
}
export function addReference(character,{assetId,kind='portrait',name=''}) {
  if(!safeId(assetId)||!['portrait','body','side','additional'].includes(kind))throw new Error('Invalid local reference.');
  return {id:id(),assetId,kind,originalName:name,createdAt:now(),archived:false};
}
export function approveAppearance(character,draft) {
  const result=clone(draft),identity=characterIdentity(character);
  if(approved(getVersion(character,draft.id)))throw new Error('Approved appearance versions are immutable. Create a revision.');
  const refs=identity.references.filter(r=>result.board.referenceIds.includes(r.id)&&!r.archived);
  if(!refs.some(r=>r.id===result.board.primaryReferenceId))throw new Error('Choose an active primary reference before approval.');
  if(!ATTRIBUTES.every(key=>typeof result.board.attributes[key]==='string'))throw new Error('Every appearance attribute must be recorded.');
  result.board.locks=locksForMode(result.board.lockMode,result.board.locks);
  result.board.negativeInstructions=negativeInstructionsForBoard(result.board);
  if(!Object.values(result.board.locks).some(Boolean))throw new Error('Select at least one identity lock.');
  result.board.approvedAt=now();result.board.status='Approved and locked';result.status='Approved and locked';
  return result;
}
export function allScenes(project) {return project.episodes.flatMap(episode=>episode.scenes.map(scene=>({episode,scene})));}
function inScope(project,item,scope) {
  if(scope.type==='series')return true;
  if(scope.type==='scene')return item.scene.id===scope.sceneId;
  if(scope.type==='episode')return item.episode.id===scope.episodeId;
  if(scope.type==='future')return item.episode.number>=Number(scope.fromEpisodeNumber);
  return false;
}
function validateScope(project,characterId,scope) {
  if(!SCOPES.includes(scope?.type))throw new Error('Choose a replacement scope.');
  if(scope.type==='scene'&&!allScenes(project).some(item=>item.scene.id===scope.sceneId&&item.scene.characterIds.includes(characterId)))throw new Error('Choose a scene containing this character.');
  if(scope.type==='episode'&&!project.episodes.some(e=>e.id===scope.episodeId))throw new Error('Choose an episode.');
  if(scope.type==='future'&&!project.episodes.some(e=>e.number===Number(scope.fromEpisodeNumber)))throw new Error('Choose the first affected episode.');
}
export function affectedScenes(project,characterId,scope) {
  validateScope(project,characterId,scope);
  return allScenes(project).filter(item=>item.scene.characterIds.includes(characterId)&&inScope(project,item,scope));
}
export function expectedVersionId(project,character,episode,scene) {
  const identity=characterIdentity(character);
  let expected=identity.defaultVersionId;
  for(const change of identity.history)if(change.status==='applied'&&inScope(project,{episode,scene},change.scope))expected=change.toVersionId;
  return expected;
}
export function makeBinding(character,version) {
  return {characterId:character.id,appearanceVersionId:version?.id||'',outfitVersionId:version?.outfitVersionId||'',voiceVersionId:version?.voiceVersionId||'',referenceBoardId:version?.board.id||'',lockedValues:clone(version?.board.attributes||{})};
}
export function bindScene(project,episode,scene) {
  const result=clone(scene),existing=scene.characterBindings||[];
  result.characterBindings=result.characterIds.map(characterId=>{
    const character=project.characters.find(c=>c.id===characterId),previous=existing.find(b=>b.characterId===characterId);
    return previous||makeBinding(character||{id:characterId},character?getVersion(character,expectedVersionId(project,character,episode,scene)):null);
  });
  return result;
}
export function planReplacement(project,characterId,version,scope,{reason='',replaceVoice=false}={}) {
  const character=project.characters.find(c=>c.id===characterId);if(!character)throw new Error('Character not found.');
  const targets=affectedScenes(project,characterId,scope);
  return {id:id(),createdAt:now(),characterId,fromVersionId:currentVersion(character)?.id||'',toVersionId:version.id,scope:clone(scope),reason,replaceVoice,affectedSceneIds:targets.map(x=>x.scene.id),affected:targets.map(({episode,scene})=>({episodeId:episode.id,episodeNumber:episode.number,sceneId:scene.id,sceneNumber:scene.number,oldVersionId:scene.characterBindings?.find(b=>b.characterId===characterId)?.appearanceVersionId||'',generated:['Generated','Approved','GENERATED','APPROVED','REGENERATION_REQUIRED'].includes(scene.imageStatus)||['Generated','Approved','GENERATED','APPROVED','REGENERATION_REQUIRED'].includes(scene.videoStatus)})),preserved:['Story identity','Story role','Relationships','Dialogue','Actions','Episode history',...(!replaceVoice?['Voice']:[])],status:'preview'};
}
function markRegeneration(project,scene,characterId) {
  const generated = value => ['Generated','Approved','GENERATED','APPROVED','REGENERATION_REQUIRED'].includes(value);
  for(const key of ['imageStatus','videoStatus'])if(generated(scene[key]))scene[key]='REGENERATION_REQUIRED';
  for(const asset of scene.generatedAssets||[])if(!asset.characterIds||asset.characterIds.includes(characterId))asset.status='REGENERATION_REQUIRED';
  for(const asset of [...(project.generatedAssets||[]),...(project.visualResults||[])])if(asset.sceneId===scene.id&&(!asset.characterId||asset.characterId===characterId)&&(!asset.characterIds||asset.characterIds.includes(characterId))) {asset.status='REGENERATION_REQUIRED';if(asset.qualityGate)asset.qualityGate.manual={status:'PENDING',reason:'Character appearance changed.',reviewedAt:null};}
}
export function applyReplacement(project,characterId,version,plan,{confirmation='',kind='replacement'}={}) {
  if(plan.characterId!==characterId||plan.toVersionId!==version.id)throw new Error('Replacement preview does not match this character version.');
  if(plan.scope.type==='series'&&confirmation!=='REPLACE CHARACTER')throw new Error('Type REPLACE CHARACTER for an entire-series replacement.');
  const result=clone(project),character=result.characters.find(c=>c.id===characterId);
  if(!character)throw new Error('Character not found.');
  const identity=character.identity ||= clone(characterIdentity(character));
  let target=getVersion(character,version.id);
  if(!target){target=clone(version);identity.versions.push(target);}
  if(!approved(target))throw new Error('Only an approved and locked reference board can be applied.');
  const targets=affectedScenes(result,characterId,plan.scope);
  if(JSON.stringify(targets.map(x=>x.scene.id).sort())!==JSON.stringify([...plan.affectedSceneIds].sort()))throw new Error('Affected scenes changed. Review a fresh preview.');
  const record={...clone(plan),kind,status:'applied',createdAt:now(),previousBindings:[]};delete record.affected;delete record.preserved;
  for(const {scene} of targets){
    const prior=scene.characterBindings?.find(b=>b.characterId===characterId);
    record.previousBindings.push({sceneId:scene.id,binding:prior?clone(prior):null});
    const binding=makeBinding(character,target);
    if(!plan.replaceVoice&&prior?.voiceVersionId)binding.voiceVersionId=prior.voiceVersionId;
    scene.characterBindings=[...(scene.characterBindings||[]).filter(b=>b.characterId!==characterId),binding];
    markRegeneration(result,scene,characterId);
  }
  if(!identity.defaultVersionId||plan.scope.type==='series')identity.defaultVersionId=target.id;
  identity.history.push(record);result.identitySchemaVersion=IDENTITY_VERSION;
  return result;
}
export function approveInitial(project,characterId,version) {
  const result=clone(project),character=result.characters.find(c=>c.id===characterId);
  const identity=character.identity ||= clone(characterIdentity(character));
  const approvedVersion=approveAppearance(character,version),at=identity.versions.findIndex(v=>v.id===version.id);
  if(at>=0)identity.versions[at]=approvedVersion;else identity.versions.push(approvedVersion);
  const initial=!identity.defaultVersionId;
  if(initial)identity.defaultVersionId=approvedVersion.id;
  result.identitySchemaVersion=1;
  for(const {episode,scene} of allScenes(result))if(initial&&scene.characterIds.includes(characterId)&&!scene.characterBindings?.some(b=>b.characterId===characterId&&b.appearanceVersionId)){
    const old=scene.characterBindings||[];scene.characterBindings=[...old.filter(b=>b.characterId!==characterId),makeBinding(character,approvedVersion)];
  }
  return result;
}
export function newQualityGate() {return {automatedComparison:'NOT_CONFIGURED',scores:{identity:null,outfit:null,color:null,style:null},manual:{status:'PENDING',reason:'',reviewedAt:null}};}
export function reviewQualityGate(gate,decision,reason='') {
  if(!['APPROVED','REJECTED','APPROVED_WITH_EXCEPTION'].includes(decision))throw new Error('Choose a manual review decision.');
  if(decision==='APPROVED_WITH_EXCEPTION'&&!reason.trim())throw new Error('Explain the approval exception.');
  const result=clone(gate||newQualityGate());result.automatedComparison='NOT_CONFIGURED';result.scores={identity:null,outfit:null,color:null,style:null};result.manual={status:decision,reason:reason.trim(),reviewedAt:now()};return result;
}
export function identityContinuity(project) {
  const issues=[];if(!project.identitySchemaVersion)return issues;
  const issue=(rule,message,evidence,episode,scene,characterId='')=>{const key=`identity-${rule}:${episode.id}:${scene.id}:${characterId}`;issues.push({id:key,rule:`identity-${rule}`,message,evidence,episodeId:episode.id,sceneId:scene.id,suggestion:'Review the Character Identity board, version scope, and scene binding. Reapply the approved version explicitly; no story changes are made automatically.',ignoredReason:project.ignoredIssues?.[key]||''});};
  for(const {episode,scene} of allScenes(project).filter(x=>!x.scene.archived&&!x.episode.archived)){
    for(const characterId of scene.characterIds){
      const character=project.characters.find(c=>c.id===characterId),bindings=(scene.characterBindings||[]).filter(b=>b.characterId===characterId),binding=bindings[0];
      if(!binding?.appearanceVersionId){issue('missing','Scene is missing an appearance version.',`Character ID: ${characterId}; scene ${scene.number} has no appearance binding.`,episode,scene,characterId);continue;}
      const version=character&&getVersion(character,binding.appearanceVersionId);
      if(bindings.length!==1||!version||binding.referenceBoardId!==version?.board.id){issue('conflict','Character identity conflict.',`Character ${characterId}; version ${binding.appearanceVersionId}; board ${binding.referenceBoardId}.`,episode,scene,characterId);continue;}
      if(!approved(version))issue('board','Scene uses an unapproved reference board.',`Board ${version.board.id}: ${version.board.status}.`,episode,scene,characterId);
      if(binding.outfitVersionId!==version.outfitVersionId)issue('outfit','Scene uses the wrong outfit version.',`Expected ${version.outfitVersionId}; recorded ${binding.outfitVersionId}.`,episode,scene,characterId);
      const expected=expectedVersionId(project,character,episode,scene);
      if(expected&&binding.appearanceVersionId!==expected){issue('scope','Old character version is used outside its scope.',`Expected ${expected}; recorded ${binding.appearanceVersionId}.`,episode,scene,characterId);issue('propagation','Replacement has not propagated to this scene.',`Scene ${scene.id} must use approved version ${expected}.`,episode,scene,characterId);}
      const activeRefs=characterIdentity(character).references.filter(r=>version.board.referenceIds.includes(r.id)&&!r.archived);
      if(!activeRefs.some(r=>r.id===version.board.primaryReferenceId))issue('board','Approved board is missing an active primary reference.',`Board ${version.board.id}; primary ${version.board.primaryReferenceId}.`,episode,scene,characterId);
      const locked=ATTRIBUTES.filter(key=>version.board.locks[key]&&binding.lockedValues?.[key]!==version.board.attributes[key]);
      if(locked.length)issue('locked','A locked attribute changed in this scene.',`Changed locked attributes: ${locked.join(', ')}.`,episode,scene,characterId);
      const overrides=scene.identityOverrides?.[characterId]||{};
      const conflict=ATTRIBUTES.filter(key=>version.board.locks[key]&&Object.hasOwn(overrides,key)&&overrides[key]!==version.board.attributes[key]);
      for(const [source,key] of [['appearanceOverrides','face'],['clothingOverrides','clothing']]){
        const text=String(scene[source]||'').split('\n').find(line=>line.split(':')[0].trim().toLowerCase()===character.name.trim().toLowerCase());
        if(text&&version.board.locks[key]&&text.slice(text.indexOf(':')+1).trim()!==version.board.attributes[key])conflict.push(key);
      }
      if(conflict.length)issue('locked','Scene instructions conflict with locked attributes.',`Locked attributes overridden: ${[...new Set(conflict)].join(', ')}.`,episode,scene,characterId);
    }
    if([scene.imageStatus,scene.videoStatus,...(scene.generatedAssets||[]).map(a=>a.status),...(project.generatedAssets||[]).filter(a=>a.sceneId===scene.id).map(a=>a.status),...(project.visualResults||[]).filter(a=>a.sceneId===scene.id).map(a=>a.status)].includes('REGENERATION_REQUIRED'))issue('regeneration','An affected asset requires regeneration.',`Episode ${episode.number}, scene ${scene.number}; no regeneration has occurred.`,episode,scene);
  }
  return issues;
}
export function identityAssetReferences(project) {
  return [...project.characters.flatMap(c=>characterIdentity(c).references.map(r=>r.assetId)),...(project.visualResults||[]).map(r=>r.assetId)].filter(Boolean);
}
export function assertIdentityEdits(previous,next) {
  if(!previous)return;
  for(const oldCharacter of previous.characters){
    const character=next.characters.find(c=>c.id===oldCharacter.id);if(!character){if(oldCharacter.identity?.versions.some(approved))throw new Error('Archive characters instead of removing approved identity history.');continue;}
    for(const entry of characterIdentity(oldCharacter).history)if(JSON.stringify(characterIdentity(character).history.find(h=>h.id===entry.id))!==JSON.stringify(entry))throw new Error('Replacement history is immutable. Add a scoped rollback instead.');
    for(const reference of characterIdentity(oldCharacter).references){const nextReference=characterIdentity(character).references.find(r=>r.id===reference.id);const cleanRef=value=>{const result=clone(value);delete result.archived;return result;};if(!nextReference||JSON.stringify(cleanRef(reference))!==JSON.stringify(cleanRef(nextReference)))throw new Error('Original reference records cannot be removed or overwritten. Archive them instead.');}
    for(const old of characterIdentity(oldCharacter).versions.filter(v=>approved(v)||v.board?.approvedAt)){
      const version=getVersion(character,old.id);if(!version)throw new Error('Previous approved appearance versions cannot be removed.');
      const clean=value=>{const result=clone(value);delete result.status;delete result.board.status;return result;};
      if(JSON.stringify(clean(old))!==JSON.stringify(clean(version)))throw new Error('Approved appearance versions are immutable. Create a new appearance version.');
    }
    const locked=currentVersion(oldCharacter);if(!approved(locked))continue;
    if(oldCharacter.referenceImageId!==character.referenceImageId)throw new Error('The approved character reference is locked. Add references or replace the character through Character Identity.');
    for(const [field,attribute] of [['appearance','face'],['clothing','clothing'],['ageRange','ageRange'],['voice','voice']])if(locked.board.locks[attribute]&&oldCharacter[field]!==character[field])throw new Error('This character attribute is locked. Use Character Identity to create a revision or replacement.');
  }
  const previousConflicts=new Set(identityContinuity(previous).filter(issue=>issue.rule==='identity-locked').map(issue=>issue.id+'|'+issue.evidence));
  const newConflict=identityContinuity(next).find(issue=>issue.rule==='identity-locked'&&!previousConflicts.has(issue.id+'|'+issue.evidence));
  if(newConflict)throw new Error(`${newConflict.message} ${newConflict.evidence}`);
}
/** Validate optional additive records. Legacy projects require no conversion or startup writes. */
export function validateIdentity(project) {
  const errors=[],assetReferences=[],globalVersionIds=new Set(),boardIds=new Set();
  const fail=message=>errors.push(message),validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
  if(project.identitySchemaVersion!==undefined&&project.identitySchemaVersion!==1)fail('Unsupported additive identity schema.');
  for(const c of project.characters||[]){if(!c.identity)continue;const data=c.identity;
    if(data.schemaVersion!==1||!Array.isArray(data.versions)||!Array.isArray(data.references)||!Array.isArray(data.history)){fail('Invalid character identity structure.');continue;}
    const references=new Map(),versions=new Map();
    for(const r of data.references){if(!r||!safeId(r.id)||!safeId(r.assetId)||references.has(r.id)||!['portrait','body','side','additional'].includes(r.kind)||typeof r.archived!=='boolean'||!validDate(r.createdAt)){fail('Invalid character reference record.');continue;}references.set(r.id,r);assetReferences.push({assetId:r.assetId,projectId:project.id,path:`Character ${c.id} reference`});}
    for(const v of data.versions){
      if(!v||!safeId(v.id)||globalVersionIds.has(v.id)||!Number.isInteger(v.number)||v.number<1||!validDate(v.createdAt)||!BOARD_STATUSES.includes(v.status)||!safeId(v.outfitVersionId)||!safeId(v.voiceVersionId)){fail('Invalid appearance version.');continue;}
      globalVersionIds.add(v.id);versions.set(v.id,v);
      const b=v.board;
      if(!b||!safeId(b.id)||boardIds.has(b.id)||b.status!==v.status||!MODES.includes(b.lockMode)||!b.attributes||!b.locks||!Array.isArray(b.referenceIds)||!Array.isArray(b.negativeInstructions)){fail('Invalid reference board.');continue;}
      boardIds.add(b.id);
      if(!ATTRIBUTES.every(key=>typeof b.attributes[key]==='string'&&typeof b.locks[key]==='boolean'))fail('Every identity attribute and lock must be recorded.');
      if(b.referenceIds.some(rid=>!references.has(rid))||new Set(b.referenceIds).size!==b.referenceIds.length)fail('Reference board has invalid reference links.');
      if(b.primaryReferenceId&&!b.referenceIds.includes(b.primaryReferenceId))fail('Primary reference must belong to this reference board.');
      if(v.status==='Approved and locked'&&!b.primaryReferenceId)fail('Approved board requires a primary reference.');
      if(b.lockMode!=='custom'&&JSON.stringify(b.locks)!==JSON.stringify(locksForMode(b.lockMode)))fail('Locks do not match the selected lock mode.');
    }
    if(data.defaultVersionId&&!versions.has(data.defaultVersionId))fail('Default appearance version is missing.');
    const numbers=new Set();for(const v of versions.values()){if(numbers.has(v.number))fail('Appearance version numbers must be unique.');numbers.add(v.number);if(v.previousVersionId&&(!versions.has(v.previousVersionId)||versions.get(v.previousVersionId).number>=v.number))fail('Invalid previous appearance-version link.');}
    for(const h of data.history){if(!h||!safeId(h.id)||h.characterId!==c.id||!versions.has(h.toVersionId)||(h.fromVersionId&&!versions.has(h.fromVersionId))||!SCOPES.includes(h.scope?.type)||!Array.isArray(h.affectedSceneIds)||!Array.isArray(h.previousBindings)||!validDate(h.createdAt)||h.status!=='applied'||!['replacement','rollback'].includes(h.kind)||typeof h.reason!=='string'){fail('Invalid character replacement history.');continue;}
      if(h.affectedSceneIds.some(sceneId=>!allScenes(project).some(x=>x.scene.id===sceneId&&x.scene.characterIds.includes(c.id))))fail('Replacement history references an unknown scene or character.');
      if(h.scope.type==='scene'&&!allScenes(project).some(x=>x.scene.id===h.scope.sceneId))fail('Replacement scope references an unknown scene.');
      if(h.scope.type==='episode'&&!project.episodes.some(e=>e.id===h.scope.episodeId))fail('Replacement scope references an unknown episode.');
      if(h.scope.type==='future'&&(!Number.isInteger(h.scope.fromEpisodeNumber)||!project.episodes.some(e=>e.number===h.scope.fromEpisodeNumber)))fail('Replacement scope has an invalid first episode.');
      for(const previous of h.previousBindings)if(!h.affectedSceneIds.includes(previous.sceneId)||previous.binding&&((previous.binding.appearanceVersionId&&!versions.has(previous.binding.appearanceVersionId))||previous.binding.characterId!==c.id))fail('Replacement history contains an invalid previous binding.');
    }
  }
  const sceneIds=new Set(allScenes(project).map(x=>x.scene.id));
  for(const {scene} of allScenes(project))if(scene.characterBindings!==undefined){
    if(!Array.isArray(scene.characterBindings)){fail('Scene bindings must be an array.');continue;}
    const seen=new Set();for(const b of scene.characterBindings){const c=project.characters.find(c=>c.id===b?.characterId),v=c&&getVersion(c,b.appearanceVersionId);if(!b||!c||!scene.characterIds.includes(b.characterId)||seen.has(b.characterId)){fail('Invalid scene character identity.');continue;}seen.add(b.characterId);if(b.appearanceVersionId&&(!v||b.referenceBoardId!==v.board.id||!characterIdentity(c).versions.some(version=>version.outfitVersionId===b.outfitVersionId)||!characterIdentity(c).versions.some(version=>version.voiceVersionId===b.voiceVersionId)))fail('Invalid scene appearance, outfit, voice or reference-board version link.');if(!b.lockedValues||typeof b.lockedValues!=='object'||Array.isArray(b.lockedValues))fail('Invalid scene locked attribute snapshot.');}
  }
  for(const result of project.visualResults||[]){if(!safeId(result.id)||!sceneIds.has(result.sceneId)||!project.characters.some(c=>c.id===result.characterId&&getVersion(c,result.appearanceVersionId))||!safeId(result.assetId)){fail('Invalid local visual result.');continue;}assetReferences.push({assetId:result.assetId,projectId:project.id,path:'Local visual result'});const gate=result.qualityGate;if(!gate||gate.automatedComparison!=='NOT_CONFIGURED'||!gate.scores||!['identity','outfit','color','style'].every(key=>Object.hasOwn(gate.scores,key)&&gate.scores[key]===null)||Object.values(gate.scores).some(score=>score!==null)||!['PENDING','APPROVED','REJECTED','APPROVED_WITH_EXCEPTION'].includes(gate.manual?.status)||typeof gate.manual?.reason!=='string'||gate.manual.status!=='PENDING'&&!validDate(gate.manual.reviewedAt)||gate.manual.status==='APPROVED_WITH_EXCEPTION'&&!gate.manual.reason.trim())fail('Visual comparison is not configured; scores must remain null and explicit manual review is required.');}
  return {errors,assetReferences};
}
