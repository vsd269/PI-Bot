'use strict';
const FUN_PATH='/api-ws/v1/inference',QWEN_PATH='/api-ws/v1/realtime',FLASH_PATH='/api/v1/services/aigc/multimodal-generation/generation';
function aliyunUrl(value,model){
  const flash=model.startsWith('fun-asr-flash-')&&!model.includes('realtime'),path=flash?FLASH_PATH:model.startsWith('fun-asr')?FUN_PATH:QWEN_PATH;
  let url;try{url=new URL(value||'wss://dashscope.aliyuncs.com'+path);}catch{throw Error('请填写完整的阿里云服务地址。');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.hash||!['wss:','https:',...(local?['ws:','http:']:[])].includes(url.protocol))throw Error('阿里云服务地址需使用 WSS 或 HTTPS；本机服务可使用 WS 或 HTTP。凭据请存入密钥库。');
  if((url.hostname==='dashscope.aliyuncs.com'||url.hostname==='dashscope-intl.aliyuncs.com'||url.hostname.endsWith('.maas.aliyuncs.com'))&&[FUN_PATH,QWEN_PATH,FLASH_PATH,'/compatible-mode/v1/chat/completions'].includes(url.pathname)){
    url.pathname=path;url.protocol=flash?'https:':'wss:';url.searchParams.delete('model');
  }
  if(flash?!['https:',...(local?['http:']:[])].includes(url.protocol):!['wss:',...(local?['ws:']:[])].includes(url.protocol))throw Error(flash?'此模型使用 HTTPS 录音转写接口。':'此实时模型使用 WSS 转写接口。');
  return url.href;
}
module.exports={aliyunUrl};
