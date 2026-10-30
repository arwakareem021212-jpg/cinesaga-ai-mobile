/** Provider capability declarations and a closed generation boundary. No external calls. */
import {characterIdentity,getVersion,identityContinuity} from './identity.js';
import {textEligibility} from './story.js';
import {reviewSceneConsistency} from './scene-consistency.js';
export const NOT_CONFIGURED='NOT_CONFIGURED';
export const DEFAULT_CAPABILITIES=Object.freeze({configured:false,maxCharacterReferenceImages:0,multipleCharacters:false,imageToVideo:false,characterReference:false,firstLastFrame:false,seed:false,audioDialogue:false,maxClipSeconds:0,identityConsistencyChecker:false});
export function checkCapabilities(capabilities={},requirements={}) {
  const c={...DEFAULT_CAPABILITIES,...capabilities},reasons=[];
  if(!c.configured)reasons.push('AI provider not connected yet.');
  if(requirements.characterReference&&!c.characterReference)reasons.push('Provider does not support locked character references.');
  if(Number(requirements.referenceCount||0)>c.maxCharacterReferenceImages)reasons.push(`Provider accepts ${c.maxCharacterReferenceImages} character reference images; ${requirements.referenceCount} are required.`);
  for(const key of ['multipleCharacters','imageToVideo','firstLastFrame','seed','audioDialogue','identityConsistencyChecker'])if(requirements[key]&&!c[key])reasons.push(`Provider capability is unavailable: ${key}.`);
  if(requirements.clipSeconds&&Number(requirements.clipSeconds)>c.maxClipSeconds)reasons.push(`Clip duration exceeds provider maximum of ${c.maxClipSeconds} seconds.`);
  return {allowed:reasons.length===0,status:!c.configured?NOT_CONFIGURED:reasons.length?'BLOCKED':'READY',reasons};
}
export function generationGate(project,scene,capabilities={},requirements={}) {
  const reasons=[],references=[];const characters=(scene?.characterIds||[]).map(id=>project?.characters.find(c=>c.id===id)).filter(Boolean);
  if(!scene||!project)reasons.push('Choose a storyboard scene with approved character bindings.');
  if(scene&&characters.length!==scene.characterIds.length)reasons.push('Scene contains an unknown character identity.');
  for(const character of characters){const binding=scene.characterBindings?.find(b=>b.characterId===character.id),version=getVersion(character,binding?.appearanceVersionId);
    if(!binding||version?.status!=='Approved and locked'||version?.board.status!=='Approved and locked')reasons.push(`${character.name}: an approved and locked reference board is required.`);
    else {references.push(...characterIdentity(character).references.filter(r=>!r.archived&&version.board.referenceIds.includes(r.id)));for(const [key,value] of Object.entries(requirements.characterOverrides?.[character.id]||{}))if(version.board.locks[key]&&version.board.attributes[key]!==value)reasons.push(`${character.name}: requested override conflicts with locked ${key}.`);}
  }
  if(project&&scene){const conflicts=identityContinuity(project).filter(issue=>issue.sceneId===scene.id&&issue.rule!=='identity-regeneration');if(conflicts.length)reasons.push(...conflicts.map(i=>`${i.message} ${i.evidence}`));}
  if(project&&scene)reasons.push(...reviewSceneConsistency(project,scene.id,requirements.characterOverrides||{}).issues.map(issue=>`Identity preparation blocked: ${issue.code}.`));
  const result=checkCapabilities(capabilities,{...requirements,audioDialogue:requirements.audioDialogue||!!(requirements.clipSeconds&&scene?.dialogue?.trim()),characterReference:characters.length>0,multipleCharacters:characters.length>1,referenceCount:references.length});
  return {...result,allowed:result.allowed&&!reasons.length,status:result.status===NOT_CONFIGURED?NOT_CONFIGURED:(reasons.length?'BLOCKED':result.status),reasons:[...reasons,...result.reasons],manualApprovalRequired:true};
}
class UnconfiguredProvider {
  get capabilities(){return {...DEFAULT_CAPABILITIES};}
  getCapabilities(){return this.capabilities;}
  validateRequirements(requirements={}){return checkCapabilities(this.capabilities,requirements);}
  async generate(request={}) {
    const gate=request.project?generationGate(request.project,request.scene,this.capabilities,request.requirements):this.validateRequirements(request.requirements);
    return {status:NOT_CONFIGURED,message:'AI provider not connected yet.',blocked:true,reasons:gate.reasons,capabilities:this.capabilities};
  }
}
export class TextStoryProvider extends UnconfiguredProvider {
  async generate(request={}) {
    const gate=textEligibility(request.project,request);
    return {status:NOT_CONFIGURED,message:'AI provider not connected yet.',blocked:true,reasons:['AI provider not connected yet.',...gate.reasons],capabilities:this.capabilities,manualApprovalRequired:true};
  }
}
export class ImageGenerationProvider extends UnconfiguredProvider {}
export class VideoGenerationProvider extends UnconfiguredProvider {}
export class VoiceGenerationProvider extends UnconfiguredProvider {}
export class MusicGenerationProvider extends UnconfiguredProvider {}
