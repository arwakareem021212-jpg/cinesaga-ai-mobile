/** Same-origin owner-session transport only. No provider URL, key, credential persistence or POST retry. */
import {assertDirectorRequest,captureDirector,newDirectorWork,approvedDirectorPlan,validateDirectorOutput} from './story-director.js';
import {assertDirectorTicket,assertDirectorCandidate,directorContext,rejectDirector} from './director-contract.js';
import {assertDirectorResult} from './director-result.js';
import {assertContractObject} from './story-contract.js';
import {assertJobStatus,snapshotHash} from './generation-contract.js';
const codes=new Set(['UNAUTHENTICATED','CSRF_REJECTED','NOT_CONFIGURED','NOT_FOUND','REQUEST_CONFLICT','INVALID_REQUEST','PRIVACY_REVIEW_REQUIRED','SAFETY_REVIEW_REQUIRED','PROTECTED_STORY','ZERO_AUTHORIZATION','BUDGET_EXCEEDED','RESULT_UNAVAILABLE']);
export class DirectorHTTPClient{
 #request;#csrf=null;
 constructor({request=(...args)=>fetch(...args)}={}){this.#request=request;}
 async #send(path,{method='GET',body,signal}={}){
  if(!/^\/api\/(?:auth\/session|director\/(?:capabilities|jobs(?:\/[A-Za-z0-9._:-]{1,128}(?:\/(?:result|cancel))?)?|requests\/[A-Za-z0-9._:-]{1,128}))$/.test(path))rejectDirector('INVALID_REQUEST');
  let response,value;try{response=await this.#request(path,{method,credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',headers:{'Accept':'application/json',...(method==='POST'?{'Content-Type':'application/json','X-CineSaga-CSRF':this.#csrf||''}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal});if(response.redirected||!response.headers.get('content-type')?.includes('application/json')||Number(response.headers.get('content-length')||0)>800000)rejectDirector('INVALID_RESULT');const raw=await response.text();if(raw.length>800000)rejectDirector('INVALID_RESULT');value=JSON.parse(raw);}catch{rejectDirector(signal?.aborted?'CANCELLED':'CONNECTION_INTERRUPTED');}
  if(!response.ok)rejectDirector(codes.has(value?.error)?value.error:value?.state==='NOT_CONFIGURED'?'NOT_CONFIGURED':'CONNECTION_INTERRUPTED');return value;
 }
 async session(signal){const s=await this.#send('/api/auth/session',{signal});assertContractObject(s,['authenticated','csrfToken','expiresAt']);if(s.authenticated!==true||typeof s.csrfToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(s.csrfToken)||!Number.isFinite(Date.parse(s.expiresAt)))rejectDirector('UNAUTHENTICATED');this.#csrf=s.csrfToken;}
 async capabilities(signal){await this.session(signal);const c=await this.#send('/api/director/capabilities',{signal});if(c.mode!=='fixture'||c.durable!==true||c.status!=='NOT_CONFIGURED'||c.model!=='gpt-6.1-sol'||c.limits?.enabled!==false||Object.values(c.limits||{}).some(x=>typeof x==='number'&&x!==0))rejectDirector('NOT_CONFIGURED');return c;}
 async submit(request,signal){assertDirectorRequest(request);await this.capabilities(signal);const job=await this.#send('/api/director/jobs',{method:'POST',body:request,signal});assertJobStatus(job);if(job.requestId!==request.requestId)rejectDirector('INVALID_RESULT');return job;}
 async lookup(ticket,signal){assertDirectorTicket(ticket);await this.session(signal);const job=await this.#send('/api/director/requests/'+ticket.requestId,{signal});assertJobStatus(job);if(job.requestId!==ticket.requestId||ticket.jobId&&job.jobId!==ticket.jobId)rejectDirector('INVALID_RESULT');return job;}
 async result(ticket,signal){const job=await this.lookup(ticket,signal);if(job.state!=='SUCCEEDED')return {job,result:null};const result=await this.#send('/api/director/jobs/'+job.jobId+'/result',{signal});assertDirectorResult(result,{...ticket,projectId:JSON.parse(ticket.baseSnapshot).id},job.jobId);return {job,result};}
 async cancel(ticket){const job=await this.lookup(ticket);const next=await this.#send('/api/director/jobs/'+job.jobId+'/cancel',{method:'POST',body:{}});assertJobStatus(next);return next;}
}
export async function prepareDirectorTicket(p,w,operation){
 if(w.job)rejectDirector('REQUEST_PENDING');const session=await captureDirector(p,w,operation),r=session.request;
 return {...session,ticket:{requestId:r.requestId,jobId:null,sourceHash:r.sourceHash,baseSnapshot:session.baseSnapshot,operation,episodeCount:r.episodeCount,episodeSeconds:r.episodeSeconds,target:r.target,plan:r.draftPlan,revision:(w.candidate?.revision??-1)+1}};
}
export async function recoveredDirectorCandidate(p,ticket,result){
 assertDirectorTicket(ticket);if(JSON.stringify(p)!==ticket.baseSnapshot||await snapshotHash(ticket.baseSnapshot)!==ticket.sourceHash)rejectDirector('STALE_CONTEXT');
 assertDirectorResult(result,{...ticket,projectId:p.id},ticket.jobId||result.jobId);
 const w=newDirectorWork(p);w.idea='Fictional recovered request';w.notes='Recover selected revision';w.target=ticket.target;if(ticket.plan)w.candidate={plan:ticket.plan};
 // Rebuild only the validation context. No new request or generation is dispatched.
 const request={schemaVersion:1,requestId:ticket.requestId,projectId:p.id,sourceHash:ticket.sourceHash,operation:ticket.operation,episodeCount:ticket.episodeCount,episodeSeconds:ticket.episodeSeconds,idea:w.idea,notes:w.notes,target:ticket.target,context:directorContext(p),approvedPlan:approvedDirectorPlan(p),draftPlan:ticket.plan};
 const plan=validateDirectorOutput(result.plan,request),candidate={id:crypto.randomUUID(),projectId:p.id,baseSnapshot:ticket.baseSnapshot,operation:result.operation,status:'Draft',revision:ticket.revision,createdAt:new Date().toISOString(),provenance:structuredClone(result.provenance),plan};assertDirectorCandidate(candidate,p.id);return candidate;
}
