/** Offline guardrails, not a semantic moderation service. No content or matched text in errors. */
export const DIRECTOR_SAFETY_VERSION='teen-story-v1';
export class DirectorSafetyError extends Error{constructor(code){super(code);this.code=code;}}
const normalized=s=>s.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي');
function textOnly(v,key=''){if(['id','requestId','projectId','sourceHash','jobId','characterId','characterIds','locationId'].includes(key))return '';if(typeof v==='string')return v+'\n';if(Array.isArray(v))return v.map(x=>textOnly(x,key)).join('');if(v&&typeof v==='object')return Object.entries(v).map(([k,x])=>textOnly(x,k)).join('');return '';}
export function assertTeenStorySafety(value){
 const raw=textOnly(value),s=normalized(raw);
 if(/data:|\b(?:sk-|api[_ -]?key\s*[:=]|bearer\s+)[a-z0-9_-]{8,}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:\+?[0-9٠-٩][\s()-]*){9,}|(?:my (?:home address|school address|password)|عنوان (?:بيتي|منزلي|مدرستي)|رقم (?:بطاقتي|جواز سفري)|كلمة (?:السر|مروري))\s*[:=]/i.test(s))throw new DirectorSafetyError('PRIVACY_REVIEW_REQUIRED');
 const unsafe=[/\b(?:explicit sexual|pornograph\w*|sexual roleplay|grooming instructions)\b/,/محتوي جنسي صريح|مشهد جنسي صريح|اباحي|تمثيل دور جنسي/,/\b(?:instructions|steps|how to)\b.{0,60}\b(?:suicide|self.harm|make a bomb|buy alcohol|buy drugs|gamble)\b/,/(?:خطوات|طريقة|ازاي).{0,60}(?:الانتحار|اؤذي نفسي|اوذي نفسي|صنع قنبلة|اشتري مخدرات|شراء مخدرات|القمار)/,/\b(?:graphic gore|detailed dismemberment|extreme dieting instructions|hide self.harm)\b/,/تفاصيل تقطيع الجثث|تعذيب دموي تفصيلي|اخفاء ايذاء النفس/];
 if(unsafe.some(re=>re.test(s)))throw new DirectorSafetyError('SAFETY_REVIEW_REQUIRED');
 if(/(?:ignore|bypass|disable).{0,45}(?:safety|age checks|guardian|spending limits)|(?:تجاهل|تخطي|عطل).{0,45}(?:السلامة|حدود الانفاق|موافقة ولي الامر)/.test(s))throw new DirectorSafetyError('SAFETY_REVIEW_REQUIRED');
 return {version:DIRECTOR_SAFETY_VERSION,decision:'ALLOW_LOCAL',semanticModerationVerified:false};
}
