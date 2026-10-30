/** Shared, strict, text-only recovered-result boundary. A result is always an unapproved draft. */
import {assertContractObject,assertGenerationProvenance,safeStoryId} from './story-contract.js';
import {assertDirectorPlan,rejectDirector} from './director-contract.js';
import {assertTeenStorySafety} from './director-safety.js';
export function assertDirectorResult(result,request,jobId){
 assertContractObject(result,['schemaVersion','requestId','projectId','sourceHash','jobId','operation','episodeCount','status','plan','provenance']);
 if(Object.keys(result).length!==10||result.schemaVersion!==1||result.status!=='Draft'||!safeStoryId(result.jobId)||result.jobId!==jobId||result.requestId!==request.requestId||result.projectId!==request.projectId||result.sourceHash!==request.sourceHash||!['outline','script'].includes(result.operation)||!Number.isInteger(result.episodeCount)||result.episodeCount<1||result.episodeCount>6)rejectDirector('INVALID_RESULT');
 if(request.episodeCount!==undefined&&request.episodeCount!==result.episodeCount)rejectDirector('INVALID_RESULT');
 assertGenerationProvenance(result.provenance);if(result.provenance.jobId!==jobId||result.provenance.requestId!==result.requestId||result.provenance.mode!=='fixture'||result.provenance.provider!=='offline-fixture'||Object.values(result.provenance.usage).some(v=>typeof v==='number'&&v!==0))rejectDirector('INVALID_RESULT');
 assertDirectorPlan(result.plan,result.episodeCount,result.operation);assertTeenStorySafety(result.plan);return result;
}
