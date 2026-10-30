/** Provider-independent text contracts. Never grant a proposal write access to identity/media. */
export const DEMO_LABEL = 'DEMO / NOT REAL AI';
export const TASKS = ['complete','direction','bible','characters','season','episode','scenes','dialogue'];
export const TEXT_FIELDS = Object.freeze({
  bible:['title','premise','genreTone','ending','worldRules','timeline','conflict','revealedSecrets','unrevealedSecrets','importantObjects','continuityNotes'],
  character:['name','role','personality','goals','fears','relationships','knows','doesNotKnow'],
  episode:['title','beginning','mainEvent','turningPoint','ending','continuedFrom','continuityFacts','unresolvedEvents','currentStates'],
  scene:['visual','action','dialogue','narration']
});
export const NEW_FIELDS = Object.freeze({character:[...TEXT_FIELDS.character,'firstEpisode'],episode:[...TEXT_FIELDS.episode,'number'],scene:[...TEXT_FIELDS.scene,'locationId','characterIds','seconds','timeline']});
const allowed={complete:['bible','character','episode','scene'],direction:['bible'],bible:['bible'],characters:['character'],season:['episode'],episode:['episode'],scenes:['scene'],dialogue:['scene']};
export const safeStoryId = value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
/** Only JSON data properties are accepted; getters/symbols/hidden diagnostics are not fields. */
export function assertContractObject(value,keys) {
  if(!plain(value)||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!keys.includes(key)||!Object.getOwnPropertyDescriptor(value,key)?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')))throw new Error('Unexpected story properties.');
}
export function assertContractArray(value,max) {
  if(!Array.isArray(value)||value.length>max||Reflect.ownKeys(value).length!==value.length+1||Reflect.ownKeys(value).some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))))throw new Error('Invalid story list.');
}
export const FIXTURE_LABEL='FIXTURE / NOT REAL AI';
export const AI_LABEL='AI GENERATED / REQUIRES APPROVAL';
export const MANUAL_LABEL='MANUAL EXTERNAL / REQUIRES APPROVAL';
/** Manual provenance is accepted only in local proposal/history records, never provider API results. */
export function assertManualProvenance(value){
  assertContractObject(value,['jobId','mode','model','promptVersion','provider','requestId','usage']);
  if(Object.keys(value).length!==7||value.mode!=='manual'||value.provider!=='manual-external'||value.model!=='unverified-source'||value.promptVersion!=='manual-story-v1'||!safeStoryId(value.requestId)||!safeStoryId(value.jobId))throw new Error('Invalid manual provenance.');
  assertUsage(value.usage);if(value.usage.costMicros||value.usage.inputTokens||value.usage.outputTokens)throw new Error('Manual import cannot claim API usage.');
}
export function assertUsage(value) {
  assertContractObject(value,['costMicros','currency','inputTokens','outputTokens']);
  if(!plain(value)||Object.keys(value).sort().join(',')!=='costMicros,currency,inputTokens,outputTokens'||value.currency!=='USD'||['inputTokens','outputTokens','costMicros'].some(key=>!Number.isSafeInteger(value[key])||value[key]<0))throw new Error('Invalid generation usage.');
}
export function assertGenerationProvenance(value) {
  assertContractObject(value,['jobId','mode','model','promptVersion','provider','requestId','usage']);
  if(!plain(value)||Object.keys(value).sort().join(',')!=='jobId,mode,model,promptVersion,provider,requestId,usage'||!['demo','fixture','ai'].includes(value.mode)||['provider','model','promptVersion','requestId','jobId'].some(key=>!safeStoryId(value[key])))throw new Error('Invalid generation provenance.');
  if(value.mode==='demo'&&(value.provider!=='deterministic-demo'||value.model!=='local-template')||value.mode==='fixture'&&value.provider!=='offline-fixture'||value.mode==='ai'&&!['openai','anthropic','google'].includes(value.provider))throw new Error('Invalid generation provider.');
  assertUsage(value.usage);
  if(value.mode!=='ai'&&(value.usage.costMicros||value.usage.inputTokens||value.usage.outputTokens))throw new Error('Offline generation cannot claim billable usage.');
}
function assertRecordProvider(record) {
  // Historical DEMO records remain valid byte-for-byte, with no backfill or migration.
  if(record.provenance===undefined){if(record.provider!=='deterministic-demo'||record.label!==DEMO_LABEL)throw new Error('Invalid historical story provider.');return;}
  if(record.provenance?.mode==='manual'){assertManualProvenance(record.provenance);if(record.provider!=='manual-external'||record.label!==MANUAL_LABEL)throw new Error('Invalid manual record.');return;}
  assertGenerationProvenance(record.provenance);
  const label={demo:DEMO_LABEL,fixture:FIXTURE_LABEL,ai:AI_LABEL}[record.provenance.mode];
  if(record.provider!==record.provenance.provider||record.label!==label)throw new Error('Story provenance does not match its label.');
}
export function assertStoryValue(kind,field,value) {
  if(!TEXT_FIELDS[kind]?.includes(field)||typeof value!=='string'||value.length>12000)throw new Error('Invalid or protected story field.');
}
export function assertNewStoryValue(kind,value) {
  assertContractObject(value,NEW_FIELDS[kind]||[]);
  if(!plain(value)||!NEW_FIELDS[kind]||Object.keys(value).some(key=>!NEW_FIELDS[kind].includes(key)))throw new Error('New story content contains protected fields.');
  for(const [key,item] of Object.entries(value)){
    if(TEXT_FIELDS[kind].includes(key)){assertStoryValue(kind,key,item);continue;}
    if(key==='characterIds'){assertContractArray(item,100);if(new Set(item).size!==item.length||item.some(id=>!safeStoryId(id)))throw new Error('Invalid character links.');}
    else if(key==='locationId'){if(item!==''&&!safeStoryId(item))throw new Error('Invalid location link.');}
    else if(!Number.isFinite(item)||item<0||item>7200||key==='firstEpisode'&&(!Number.isInteger(item)||item<1)||key==='number'&&(!Number.isInteger(item)||item<1||item>24))throw new Error('Invalid story number.');
  }
  if(kind==='character'&&!value.name?.trim()||kind==='scene'&&(!value.visual?.trim()||!value.locationId))throw new Error('New story content is incomplete.');
  if(kind==='episode'&&(!value.title?.trim()||!Number.isInteger(value.number)))throw new Error('New episode is incomplete.');
}
export function assertStoryChanges(changes,task) {
  assertContractArray(changes,400);
  if(!TASKS.includes(task)||!Array.isArray(changes)||!changes.length||changes.length>400)throw new Error('Choose a valid story request.');
  const seen=new Set();
  for(const change of changes){
    assertContractObject(change,['id','target','field','before','value','selected']);
    assertContractObject(change.target,['kind','id','episodeId']);
    if(!plain(change)||!safeStoryId(change.id)||seen.has(change.id)||!plain(change.target)||!allowed[task].includes(change.target.kind)||!safeStoryId(change.target.id)||change.target.episodeId!==undefined&&!safeStoryId(change.target.episodeId))throw new Error('Invalid story target.');
    seen.add(change.id);
    if(change.field==='$new'){
      if(!['complete','characters','scenes','season'].includes(task)||change.before!==null)throw new Error('This request cannot add content.');
      assertNewStoryValue(change.target.kind,change.value);
    }else{
      assertStoryValue(change.target.kind,change.field,change.before);assertStoryValue(change.target.kind,change.field,change.value);
      if(task==='direction'&&!['title','premise','conflict','ending'].includes(change.field)||task==='dialogue'&&!['dialogue','narration'].includes(change.field))throw new Error('Change exceeds the selected text scope.');
    }
    if(typeof change.selected!=='boolean')throw new Error('Story selection must be explicit.');
    const targetKey=JSON.stringify(change.target)+':'+change.field;if(seen.has(targetKey))throw new Error('Duplicate story field.');seen.add(targetKey);
  }
}
export function assertProposal(proposal,projectId) {
  assertContractObject(proposal,['schemaVersion','id','projectId','provider','label','provenance','status','createdAt','baseSnapshot','instructions','task','request','revision','changes']);
  assertContractObject(proposal.request,['task','episodeId','sceneId','characterId','instructions']);
  if(!plain(proposal)||proposal.schemaVersion!==1||proposal.projectId!==projectId||!safeStoryId(proposal.id)||!['Draft','Rejected'].includes(proposal.status)||typeof proposal.baseSnapshot!=='string'||proposal.baseSnapshot.length>5000000||typeof proposal.instructions!=='string'||proposal.instructions.length>2000||!plain(proposal.request)||proposal.request.task!==proposal.task||!Number.isInteger(proposal.revision)||proposal.revision<0||!Number.isFinite(Date.parse(proposal.createdAt)))throw new Error('Invalid story proposal.');
  assertRecordProvider(proposal);
  assertStoryChanges(proposal.changes,proposal.task);
}
export function validateStoryRecords(project) {
  const errors=[];
  if(project.storyHistory!==undefined){
    try{assertContractArray(project.storyHistory,2000);}catch{return ['Invalid text approval history.'];}
    const seen=new Set();
    for(const record of project.storyHistory){try{
      assertContractObject(record,['proposalId','provider','label','provenance','task','approvedAt','changes']);
      if(!plain(record)||!safeStoryId(record.proposalId)||seen.has(record.proposalId)||!Number.isFinite(Date.parse(record.approvedAt)))throw new Error('Invalid text approval history.');
      assertRecordProvider(record);
      seen.add(record.proposalId);assertStoryChanges(record.changes,record.task);
    }catch(error){errors.push(error.message);}}
  }
  return errors;
}
export function assertStoryHistory(previous,next) {
  for(const record of previous?.storyHistory||[])if(JSON.stringify(next.storyHistory?.find(item=>item.proposalId===record.proposalId))!==JSON.stringify(record))throw new Error('Text approval history is immutable. Create a new proposal.');
}
