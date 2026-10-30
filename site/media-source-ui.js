/** Source choice reflects tested capability, never a promise that a provider is connected. */
import {getLanguage} from './i18n.js';
export function mediaSourceChoices(kind,action,attributes,{esc,button}){
 const ar=getLanguage()==='ar',image=kind==='image';
 const title=ar?(image?'مصدر الصورة':'مصدر الصوت'):(image?'Image source':'Audio source');
 const upload=ar?(image?'رفع صورتي':'رفع ملفي الصوتي'):(image?'Upload My Own Image':'Upload My Own Audio');
 const ai=ar?'توليد بالذكاء الاصطناعي — غير متصل':'Generate with AI — NOT_CONFIGURED';
 return `<fieldset class="media-source-choice"><legend>${esc(title)}</legend><div class="toolbar">${button(ai,'media-unavailable','secondary','disabled aria-disabled="true"')}${button(upload,action,'secondary',attributes)}</div></fieldset>`;
}
