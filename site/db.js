import {assertDirectorWork,directorKey,preserveDirectorHistory} from './director-contract.js';
import {approveDirector} from './story-director.js';
import { makeBackup, mergeProjects, validateBackup } from './model.js';
import { identityAssetReferences, assertIdentityEdits } from './identity.js';
import {assertStoryHistory,assertProposal,assertContractObject} from './story-contract.js';
import {assertManualWork,manualWorkKey} from './manual-work-contract.js';
import {assertAgentWork,agentWorkKey,assertOriginalPreserved} from './agent-contract.js';
import {assertBridgeWork,bridgeKey,preserveBridgeStory} from './chatgpt-bridge-contract.js';
import {approveBridge} from './chatgpt-bridge.js';

export const DB_NAME = 'cinesaga-ai-v1';
export const DB_VERSION = 1;
export const STORES = ['projects', 'drafts', 'settings', 'assets'];
let defaultDatabase;

/** Passing a name opens an independent handle; it never changes the app database. */
export function openDB(name = DB_NAME) {
  if (typeof name !== 'string' || !name.startsWith('cinesaga-ai')) return Promise.reject(new Error('Only CineSaga AI databases may be opened.'));
  if (name === DB_NAME && defaultDatabase) return defaultDatabase;
  const operation = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB is unavailable. Use a browser with local storage enabled.')); return; }
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('projects')) database.createObjectStore('projects', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('assets')) {
        const store = database.createObjectStore('assets', { keyPath: 'id' });
        store.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); if (name === DB_NAME) defaultDatabase = undefined; };
      resolve(database);
    };
    request.onerror = () => { if (name === DB_NAME) defaultDatabase = undefined; reject(request.error || new Error('Unable to open CineSaga local storage.')); };
    request.onblocked = () => { reject(new Error('Local storage is blocked by another CineSaga tab. Close that tab and reload.')); };
  });
  if (name === DB_NAME) defaultDatabase = operation;
  return operation;
}

async function transact(storeNames, mode, work, database) {
  const db = database || await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    let result;
    let failure;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(failure || transaction.error || new Error('A local storage operation failed.'));
    transaction.onabort = () => reject(failure || transaction.error || new Error('The local storage operation was cancelled.'));
    try { work(transaction, value => { result = value; }, error => { failure = error; transaction.abort(); }); } catch (error) { transaction.abort(); reject(error); }
  });
}
const readAll = (store, database) => transact([store], 'readonly', (tx, done) => { const request = tx.objectStore(store).getAll(); request.onsuccess = () => done(request.result); }, database);
const readOne = (store, id, database) => transact([store], 'readonly', (tx, done) => { const request = tx.objectStore(store).get(id); request.onsuccess = () => done(request.result); }, database);
const putOne = (store, value, database) => transact([store], 'readwrite', (tx, done) => { tx.objectStore(store).put(value); done(value); }, database);

const savedTime = value => { const time = Date.parse(value); return Number.isFinite(time) ? time : 0; };
export async function getProjects(database) { return (await readAll('projects', database)).sort((a, b) => savedTime(b.updatedAt) - savedTime(a.updatedAt)); }
export async function saveProject(project, database, expectedUpdatedAt, expectedSnapshot) {
  const validation = validateBackup(makeBackup([project]), { allowMissingAssets: true });
  if (!validation.valid) throw new Error(`Project could not be saved: ${validation.errors.join(' ')}`);
  const record = structuredClone(project);
  const references = [...new Set([...record.characters, ...record.locations].map(entity => entity.referenceImageId).filter(Boolean).concat(identityAssetReferences(record)))];
  const db = database || await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects', 'assets'], 'readwrite');
    let failure;
    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(failure || transaction.error || new Error('Project could not be saved.'));
    transaction.onabort = () => reject(failure || transaction.error || new Error('Project save was cancelled.'));
    let pending = references.length + 1;
    const commit = () => { if (--pending === 0) transaction.objectStore('projects').put(record); };
    const previous = transaction.objectStore('projects').get(record.id);
    previous.onsuccess = () => { try { if(expectedUpdatedAt!==undefined&&previous.result?.updatedAt!==expectedUpdatedAt)throw new Error('This series changed in another tab. Reload and review a fresh identity preview before saving.');if(expectedSnapshot!==undefined&&JSON.stringify(previous.result)!==expectedSnapshot)throw new Error('The series changed. Prepare a fresh story proposal.');assertIdentityEdits(previous.result,record);assertStoryHistory(previous.result,record);preserveDirectorHistory(previous.result,record);assertOriginalPreserved(previous.result,record);preserveBridgeStory(previous.result,record);commit(); } catch(error) { failure=error;transaction.abort(); } };
    for (const id of references) {
      const request = transaction.objectStore('assets').get(id);
      request.onsuccess = () => {
        if (!request.result || request.result.projectId !== record.id) {
          failure = new Error('Reference image is missing or belongs to another series.');
          transaction.abort();
          return;
        }
        commit();
      };
    }
  });
}
export async function deleteProject(id, database) {
  return transact(['projects', 'assets', 'drafts'], 'readwrite', tx => {
    tx.objectStore('projects').delete(id);
    const assets = tx.objectStore('assets');
    const request = assets.index('projectId').openCursor(IDBKeyRange.only(id));
    request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    const drafts = tx.objectStore('drafts');
    const draftRequest = drafts.openCursor();
    draftRequest.onsuccess = () => { const cursor = draftRequest.result; if (cursor) { if (cursor.value.value?.projectId === id || cursor.key.startsWith(`${id}:`)) cursor.delete(); cursor.continue(); } };
  }, database);
}
export async function getSetting(key, database) { return (await readOne('settings', key, database))?.value; }
export async function setSetting(key, value, database) { return putOne('settings', { key, value, updatedAt: new Date().toISOString() }, database); }
export async function saveDraft(key, value, database) {
  if(value?.type==='CHATGPT_BRIDGE_WORK')throw Error('Use the bridge compare-and-swap store.');
  if(value?.type==='STORY_DIRECTOR_WORK')throw Error('Use the director compare-and-swap store.');
  if(value?.type==='STORY_AGENT_WORK')assertAgentWork(value,key);
  if(value?.type==='MANUAL_STORY_WORK')assertManualWork(value,key);
  if(value?.type==='STORY_PROPOSAL'){
    assertContractObject(value,['type','projectId','proposal']);assertProposal(value.proposal,value.projectId);
    if(key!==`${value.projectId}:story-proposal`)throw new Error('Invalid story draft key.');
  }
  return putOne('drafts', { key, value, updatedAt: new Date().toISOString() }, database);
}
export async function getDraft(key, database) { return (await readOne('drafts', key, database))?.value; }
/** Imported text and its explicit approval commit atomically in existing stores. */
export async function saveBridgeWork(value,expected,database,approved=null){
 assertBridgeWork(value);if(approved&&!validateBackup(makeBackup([approved]),{allowMissingAssets:true}).valid)throw Error('Invalid bridge approval.');const next=structuredClone(value),key=bridgeKey(value.projectId);
 return transact(['drafts','projects'],'readwrite',(tx,done,fail)=>{const drafts=tx.objectStore('drafts'),read=drafts.get(key);read.onsuccess=()=>{if(JSON.stringify(read.result?.value??null)!==JSON.stringify(expected??null)){fail(Error('Bridge work changed.'));return;}const source=tx.objectStore('projects').get(value.projectId);source.onsuccess=()=>{try{const p=source.result;if(!p)throw Error('Missing series.');if(approved){if(value.status!=='Draft'||JSON.stringify(p)!==value.baseSnapshot||read.result?.value?.status!=='Draft')throw Error('Stale bridge approval.');const projected=approveBridge(p,value,{confirmed:true,approvedAt:approved.bridgeStory?.approvedAt});projected.updatedAt=approved.updatedAt;if(JSON.stringify(projected)!==JSON.stringify(approved))throw Error('Bridge approval exceeded its source.');assertIdentityEdits(p,approved);assertStoryHistory(p,approved);assertOriginalPreserved(p,approved);preserveDirectorHistory(p,approved);preserveBridgeStory(p,approved);tx.objectStore('projects').put(structuredClone(approved));}drafts.put({key,value:next,updatedAt:new Date().toISOString()});done(next);}catch(e){fail(e);}};};},database);
}
/** Director drafts and explicit approval commit together; no schema/store migration. */
export async function saveDirectorWork(value,expected,database,approvedProject=null){
 assertDirectorWork(value);const next=structuredClone(value),key=directorKey(value.projectId);
 if(approvedProject){const validation=validateBackup(makeBackup([approvedProject]),{allowMissingAssets:true});if(!validation.valid)throw Error('Invalid director approval.');}
 return transact(['projects','drafts','assets'],'readwrite',(tx,done,fail)=>{
  const drafts=tx.objectStore('drafts'),previous=drafts.get(key);previous.onsuccess=()=>{
   if(JSON.stringify(previous.result?.value??null)!==JSON.stringify(expected??null)){fail(Error('Director work changed.'));return;}
   const source=tx.objectStore('projects').get(value.projectId);source.onsuccess=()=>{try{
    const p=source.result;if(!p)throw Error('Director source missing.');
    const old=previous.result?.value;for(let i=0;i<(old?.versions.length||0);i++)if(JSON.stringify(next.versions[i])!==JSON.stringify(old.versions[i]))throw Error('Director draft history changed.');
    if(old?.job&&next.job){const a={...old.job,jobId:null},b={...next.job,jobId:null};if(JSON.stringify(a)!==JSON.stringify(b)||old.job.jobId&&old.job.jobId!==next.job.jobId)throw Error('Director request changed.');}
    if(approvedProject&&(old?.job||next.job))throw Error('Director request still pending.');
    if(next.candidate?.status==='Draft'&&(!old?.candidate||next.candidate.id!==old.candidate.id||next.candidate.revision!==old.candidate.revision)&&JSON.stringify(p)!==next.candidate.baseSnapshot)throw Error('Director source changed.');
    const commit=()=>{drafts.put({key,value:next,updatedAt:new Date().toISOString()});if(approvedProject)tx.objectStore('projects').put(structuredClone(approvedProject));done(next);};
    if(!approvedProject){commit();return;}
    if(!old?.candidate||old.candidate.status!=='Draft'||approvedProject.id!==p.id||JSON.stringify(p)!==old.candidate.baseSnapshot||approvedProject.directorHistory?.at(-1)?.candidateId!==old.candidate.id||JSON.stringify(approvedProject.directorHistory.at(-1).plan)!==JSON.stringify(old.candidate.plan))throw Error('Director approval changed.');
    const projection=value=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key])=>!['directorHistory','updatedAt'].includes(key))));
    if(projection(approveDirector(p,old.candidate,{confirmed:true}))!==projection(approvedProject))throw Error('Director approval exceeded its plan.');
    assertIdentityEdits(p,approvedProject);assertStoryHistory(p,approvedProject);assertOriginalPreserved(p,approvedProject);preserveDirectorHistory(p,approvedProject);preserveBridgeStory(p,approvedProject);
    const refs=[...new Set([...approvedProject.characters,...approvedProject.locations].map(c=>c.referenceImageId).filter(Boolean).concat(identityAssetReferences(approvedProject)))];let count=refs.length;if(!count){commit();return;}
    for(const id of refs){const r=tx.objectStore('assets').get(id);r.onsuccess=()=>{if(r.result?.projectId!==p.id){fail(Error('Director image reference missing.'));return;}if(!--count)commit();};}
   }catch(e){fail(e);}};
  };
 },database);
}
/** Atomically saves agent scratch work and, optionally, a reviewed generation result. */
export async function saveAgentWork(value,expected,database,candidate=null,expectedProposal=null){
  assertAgentWork(value);if(candidate)assertProposal(candidate,value.projectId);
  const next=structuredClone(value),key=agentWorkKey(value.projectId);
  return transact(['drafts','projects'],'readwrite',(tx,done,fail)=>{
    const drafts=tx.objectStore('drafts'),read=drafts.get(key);
    read.onsuccess=()=>{
      if(JSON.stringify(read.result?.value??null)!==JSON.stringify(expected??null)){fail(Error('Agent work changed.'));return;}
      const source=tx.objectStore('projects').get(value.projectId);
      source.onsuccess=()=>{
        if(!source.result){fail(Error('Series missing.'));return;}
        const commit=()=>{drafts.put({key,value:next,updatedAt:new Date().toISOString()});if(candidate)drafts.put({key:`${value.projectId}:story-proposal`,value:{type:'STORY_PROPOSAL',projectId:value.projectId,proposal:structuredClone(candidate)},updatedAt:new Date().toISOString()});done(next);};
        if(!candidate){commit();return;}
        if(source.result.originalStory||JSON.stringify(source.result)!==candidate.baseSnapshot){fail(Error('Agent source changed.'));return;}
        const prior=drafts.get(`${value.projectId}:story-proposal`);prior.onsuccess=()=>{if(JSON.stringify(prior.result?.value?.proposal??null)!==JSON.stringify(expectedProposal)){fail(Error('Proposal changed.'));return;}commit();};
      };
    };
  },database);
}
/** Compare-and-swap prevents an older Workshop tab overwriting newer scratch work. */
export async function saveManualWork(value,expected,database,candidate=null){
  assertManualWork(value);if(candidate)assertProposal(candidate,value.projectId);
  const next=structuredClone(value),key=manualWorkKey(value.projectId);
  return transact(['drafts','projects'],'readwrite',(tx,done,fail)=>{
    const drafts=tx.objectStore('drafts'),read=drafts.get(key);
    read.onsuccess=()=>{
      if(JSON.stringify(read.result?.value??null)!==JSON.stringify(expected??null)){fail(new Error('Manual work changed in another tab.'));return;}
      const commit=()=>{drafts.put({key,value:next,updatedAt:new Date().toISOString()});if(candidate)drafts.put({key:`${value.projectId}:story-proposal`,value:{type:'STORY_PROPOSAL',projectId:value.projectId,proposal:structuredClone(candidate)},updatedAt:new Date().toISOString()});done(next);};
      const project=tx.objectStore('projects').get(value.projectId);
      project.onsuccess=()=>{
        if(!project.result){fail(new Error('Manual work series no longer exists.'));return;}
        if(!candidate){commit();return;}
        if(JSON.stringify(project.result)!==candidate.baseSnapshot){fail(new Error('Manual review source changed.'));return;}
        const previous=drafts.get(`${value.projectId}:story-proposal`);previous.onsuccess=()=>{
          if(JSON.stringify(previous.result?.value?.proposal??null)!==expected?.draftFingerprint){fail(new Error('Manual proposal changed.'));return;}
          commit();
        };
      };
    };
  },database);
}
export async function deleteDraft(key, database) { return transact(['drafts'], 'readwrite', tx => tx.objectStore('drafts').delete(key), database); }
export async function saveAsset(asset, database) {
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
  if (!asset || !safeId(asset.id) || !safeId(asset.projectId) || !(asset.blob instanceof Blob)) throw new Error('An image asset requires a safe ID, project ID, and local Blob.');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(asset.blob.type)) throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
  if (asset.blob.size > 10 * 1024 * 1024) throw new Error('Reference images must be 10 MB or smaller.');
  await validateImageBlob(asset.blob);
  const record = { ...asset, type: asset.blob.type, name: String(asset.name || 'Reference image') };
  const db = database || await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['projects', 'assets'], 'readwrite');
    let failure;
    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(failure || transaction.error || new Error('Reference image could not be saved.'));
    transaction.onabort = () => reject(failure || transaction.error || new Error('Image save was cancelled.'));
    const request = transaction.objectStore('projects').get(record.projectId);
    request.onsuccess = () => {
      if (!request.result) { failure = new Error('Save the series before attaching a reference image.'); transaction.abort(); return; }
      const assets = transaction.objectStore('assets');
      const prior = assets.get(record.id);
      prior.onsuccess = () => {
        if (prior.result) { failure = new Error('Original uploaded files are immutable. Save the new image with a new identifier.'); transaction.abort(); return; }
        assets.put(record);
      };
    };
  });
}
export async function validateImageBlob(blob) {
  const bytes=new Uint8Array(await blob.slice(0,16).arrayBuffer()),text=String.fromCharCode(...bytes);
  const matches={'image/png':bytes[0]===137&&text.slice(1,8)==='PNG\r\n\x1a\n','image/jpeg':bytes[0]===255&&bytes[1]===216&&bytes[2]===255,'image/gif':text.startsWith('GIF87a')||text.startsWith('GIF89a'),'image/webp':text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'};
  if(!matches[blob.type])throw new Error('Image bytes do not match the declared supported image type.');
  return true;
}
export async function getAsset(id, database) { return readOne('assets', id, database); }
export async function getAssets(projectId, database) {
  if (projectId === undefined || projectId === null) return readAll('assets', database);
  return transact(['assets'], 'readonly', (tx, done) => { const request = tx.objectStore('assets').index('projectId').getAll(projectId); request.onsuccess = () => done(request.result); }, database);
}
export async function clearAll(database) { return transact(STORES, 'readwrite', tx => { for (const store of STORES) tx.objectStore(store).clear(); }, database); }
/** First identity edit saves the untouched series snapshot. Schema stays at v1. */
export async function backupBeforeIdentity(projectId,database) {
  return transact(['projects','settings'],'readwrite',(tx,done)=>{
    const settings=tx.objectStore('settings'),key=`identity-baseline:${projectId}`,request=settings.get(key);
    request.onsuccess=()=>{if(request.result){done(request.result.value);return;}const original=tx.objectStore('projects').get(projectId);original.onsuccess=()=>{if(!original.result)return;const value={schemaVersion:DB_VERSION,createdAt:new Date().toISOString(),project:original.result};settings.put({key,value,updatedAt:value.createdAt});done(value);};};
  },database);
}

const blobDataURL = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
});
function dataURLBlob(dataURL) {
  const [header, body] = dataURL.split(',');
  const type = header.slice(5, header.indexOf(';'));
  const raw = atob(body);
  const bytes = Uint8Array.from(raw, character => character.charCodeAt(0));
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Imported reference image exceeds 10 MB.');
  return new Blob([bytes], { type });
}
export async function exportBackup(database) {
  const db = database || await openDB();
  // Snapshot every store within one read transaction before converting image Blobs.
  const rows = await transact(STORES, 'readonly', (tx, done) => {
    const result = {};
    for (const store of STORES) { const request = tx.objectStore(store).getAll(); request.onsuccess = () => { result[store] = request.result; done(result); }; }
  }, db);
  const result = makeBackup(rows.projects);
  result.assets = await Promise.all(rows.assets.map(async asset => ({ id: asset.id, projectId: asset.projectId, name: asset.name, type: asset.type || asset.blob.type, dataUrl: await blobDataURL(asset.blob) })));
  result.drafts = rows.drafts;
  result.settings = rows.settings;
  const validation = validateBackup(result);
  if (!validation.valid) throw new Error(`Backup validation failed: ${validation.errors.join(' ')}`);
  return result;
}
export async function importBackup(backup, mode, database) {
  if (!['merge', 'replace', 'Merge', 'Replace'].includes(mode)) throw new Error('Choose Merge or Replace.');
  const validation = validateBackup(backup);
  if (!validation.valid) throw new Error(`Invalid CineSaga backup: ${validation.errors.join(' ')}`);
  const incoming = structuredClone(backup);
  const assets = (incoming.assets || []).map(asset => ({ id: asset.id, projectId: asset.projectId, name: asset.name, type: asset.type, blob: dataURLBlob(asset.dataUrl) }));
  await Promise.all(assets.map(asset=>validateImageBlob(asset.blob)));
  const priorAssets=mode.toLowerCase()==='merge'?await getAssets(null,database):[];
  for(const asset of assets){const previous=priorAssets.find(record=>record.id===asset.id);if(previous&&previous.projectId===asset.projectId){const [a,b]=await Promise.all([previous.blob.arrayBuffer(),asset.blob.arrayBuffer()]);const left=new Uint8Array(a),right=new Uint8Array(b);if(left.length!==right.length||left.some((value,index)=>value!==right[index]))throw new Error('Merge cannot overwrite an original uploaded image. Import the reference with a new identifier.');}}
  return transact(STORES, 'readwrite', (tx, done, fail) => {
    const guard=tx.objectStore('projects').getAll();
    guard.onsuccess=()=>{
    try{for(const old of guard.result){const next=incoming.projects.find(p=>p.id===old.id);if(next||mode.toLowerCase()==='replace'){assertOriginalPreserved(old,next);preserveDirectorHistory(old,next);preserveBridgeStory(old,next);}}}catch(error){fail(error);return;}
    const replace = mode.toLowerCase() === 'replace';
    if (replace) {
      for (const store of STORES) tx.objectStore(store).clear();
      for (const project of incoming.projects) tx.objectStore('projects').put(project);
      for (const asset of assets) tx.objectStore('assets').put(asset);
      for (const row of incoming.drafts || []) tx.objectStore('drafts').put(row);
      for (const row of incoming.settings || []) tx.objectStore('settings').put(row);
      done({ projects: incoming.projects.length, assets: assets.length });
    } else {
      const projectStore = tx.objectStore('projects');
      const request = projectStore.getAll();
      request.onsuccess = () => {
        const existing = request.result;
        const acceptedIds = new Set(incoming.projects.filter(project => { const previous = existing.find(p => p.id === project.id); return !previous || savedTime(project.updatedAt) >= savedTime(previous.updatedAt); }).map(project => project.id));
        const assetStore = tx.objectStore('assets');
        const assetRequest = assetStore.getAll();
        assetRequest.onsuccess = () => {
          const existingAssets = new Map(assetRequest.result.map(asset => [asset.id, asset]));
          for (const asset of assets) {
            const prior = existingAssets.get(asset.id);
            if (acceptedIds.has(asset.projectId) && prior && prior.projectId !== asset.projectId) { fail(new Error('Merge would overwrite an image belonging to another series. Import was cancelled.')); return; }
          }
          const merged = mergeProjects(existing, incoming.projects);
          for (const project of merged) projectStore.put(project);
          let assetCount = 0;
          for (const asset of assets) if (acceptedIds.has(asset.projectId)) { assetStore.put(asset); assetCount++; }
          for (const field of ['drafts', 'settings']) for (const row of incoming[field] || []) {
            const store = tx.objectStore(field);
            const read = store.get(row.key);
            read.onsuccess = () => { if (!read.result || savedTime(row.updatedAt) >= savedTime(read.result.updatedAt)) store.put(row); };
          }
          done({ projects: merged.length, assets: assetCount });
        };
      };
    }
    };
  }, database);
}
