/** Local file selection and gesture-safe copying; no network or storage. */
export const LOCAL_MEDIA_TYPES=Object.freeze({
 video:Object.freeze(['video/mp4','video/webm','video/quicktime']),
 audio:Object.freeze(['audio/wav','audio/x-wav','audio/mpeg','audio/ogg','audio/mp4','audio/x-m4a','audio/m4a','audio/aac'])
});
export function localMediaAllowed(file,kind){return file instanceof Blob&&!!LOCAL_MEDIA_TYPES[kind]?.includes(file.type)&&file.size>0&&file.size<=64*1024*1024;}
/** Invoke from the click itself, before awaiting storage. Failure leaves visible manual copy. */
export async function copyPreparedText(text,clipboard,{timeoutMs=2000}={}){
 if(typeof text!=='string'||!text)return false;
 let timer;try{return await Promise.race([Promise.resolve(clipboard.writeText(text)).then(()=>true,()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);}catch{return false;}finally{clearTimeout(timer);}
}
