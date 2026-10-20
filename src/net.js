'use strict';
// Bounded transport shared by opt-in integrations. Never follow a credentialed redirect.
function endpoint(value){
  let url;try{url=new URL(value);}catch{throw Error('请填写完整的服务地址。');}
  if(url.username||url.password||url.hash||!['http:','https:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error('服务地址需使用 HTTPS；本机服务可使用 HTTP。凭据请存入密钥库。');
  return url.href;
}
async function boundedFetch(url,options={},max=2*1024*1024){
  const {timeoutMs=30000,...rest}=options;
  const response=await fetch(url,{...rest,redirect:'error',signal:rest.signal?AbortSignal.any([rest.signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
  if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw Error('服务响应过大。');}
  const reader=response.body?.getReader();let size=0;const chunks=[];
  if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('服务响应过大。');chunks.push(Buffer.from(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks);return {response,text:bytes.toString('utf8'),bytes};
}
async function jsonFetch(url,options={},max){const {response,text}=await boundedFetch(url,options,max);if(!response.ok)throw Object.assign(Error('服务返回 HTTP '+response.status),{status:response.status});try{return JSON.parse(text);}catch{throw Error('服务没有返回有效 JSON。');}}
module.exports={endpoint,boundedFetch,jsonFetch};
