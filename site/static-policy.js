/** Public static release: local assets/Blob reads only. No story requests leave this browser. */
export function createStaticFetch(original,base,files){
 const root=new URL(base),allowed=new Set(files.map(name=>new URL(name,root).href));
 const denied=()=>new Response('{"error":"NOT_CONFIGURED","status":"NOT_CONFIGURED","paidAuthorization":0}',{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 return function(input,init={}){
  try{const value=typeof input==='string'?input:input instanceof URL?input.href:input.url,url=new URL(value,root),method=String(init.method||input?.method||'GET').toUpperCase();
   if(method!=='GET'&&method!=='HEAD')return Promise.resolve(denied());
   if(url.protocol==='blob:'&&url.origin===root.origin)return original(input,init);
   if(url.origin!==root.origin||url.username||url.password||url.search||!allowed.has(url.href))return Promise.resolve(denied());
   // No caller-supplied body, auth headers or cookies are forwarded to a static host.
   return original(url.href,{method,credentials:'omit',cache:'no-cache',redirect:'error',...(init.signal?{signal:init.signal}:{})});
  }catch{return Promise.resolve(denied());}
 };
}
