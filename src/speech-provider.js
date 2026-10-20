'use strict';
const {randomUUID}=require('node:crypto');
const {endpoint,jsonFetch,boundedFetch}=require('./net');
const {volcUrl,transcribeVolc,volcError}=require('./volc-speech');
const PROVIDERS=['openai','whisper','custom','qwen','volcengine'];
const QWEN_DEFAULT_URL='wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const {aliyunUrl}=require('./speech-urls');
const QWEN_DEFAULT_MODEL='fun-asr-realtime';
const VOLCENGINE_DEFAULT_MODEL='bigmodel';
const VOLCENGINE_MODEL_LABEL='豆包流式语音识别模型 2.0';
function speechConfig(c){
  const provider=c.provider||'openai';if(!PROVIDERS.includes(provider))throw Error('不支持的语音服务。');
  if(typeof c.model!=='string'||!c.model.trim()||c.model.length>200)throw Error('请填写语音模型。');
  if(provider==='volcengine'&&(c.authMode|| (c.appId?'legacy':'apiKey'))==='legacy'&&!/^[A-Za-z0-9_.-]{1,100}$/.test(c.appId||''))throw Error('火山引擎旧版鉴权需要 App ID。');
  const defaultProvider=PROVIDERS.includes(c.defaultProvider)?c.defaultProvider:provider;
  let model=c.model.trim();if(provider==='volcengine'&&model===VOLCENGINE_MODEL_LABEL)model=VOLCENGINE_DEFAULT_MODEL;
  const url=provider==='qwen'?aliyunUrl(c.url,model):provider==='volcengine'?volcUrl(c.url):endpoint(c.url);
  const authMode=c.authMode||(c.appId?'legacy':'apiKey');if(provider==='volcengine'&&!['legacy','apiKey'].includes(authMode))throw Error('火山引擎鉴权方式无效。');
  const resourceId=provider==='volcengine'&&new URL(url).protocol.includes('ws')&&(!c.resourceId||c.resourceId==='volc.bigasr.auc_turbo')?'volc.seedasr.sauc.duration':c.resourceId;
  if(provider==='volcengine'&&!/^[A-Za-z0-9_.-]{1,150}$/.test(resourceId||''))throw Error('请填写火山语音 Resource ID。');
  return {provider,url,model,keyRef:c.keyRef||'',language:String(c.language||'').slice(0,16),enabled:c.enabled!==false,defaultProvider,...(provider==='volcengine'?{appId:c.appId||'',resourceId,authMode}: {})};
}
function testWave(){const bytes=Buffer.alloc(44+32000);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(32000,40);return bytes;}
async function testSpeech(c,token,signal){const started=Date.now();const text=await transcribeAudio(c,testWave(),token,signal);return {ok:true,latencyMs:Date.now()-started,text:text.slice(0,300),provider:c.provider,model:c.model};}
async function transcribeAudio(c,bytes,token,signal){
  let text;const options={method:'POST',timeoutMs:90000,signal};
  if(c.provider==='qwen'){
    return c.model.startsWith('fun-asr-flash-')&&!c.model.includes('realtime')?await transcribeAliyunFlash(c,bytes,token,signal):await transcribeAliyunSocket(c,bytes,token,signal);
  }else if(c.provider==='volcengine'){
    if(new URL(c.url).protocol.includes('ws'))return transcribeVolc(c,pcmAudio(bytes),token,signal);
    const {response,text:body}=await boundedFetch(c.url,{...options,headers:{'Content-Type':'application/json',...(c.authMode==='apiKey'?{'X-Api-Key':token}:{'X-Api-App-Key':c.appId,'X-Api-Access-Key':token}),'X-Api-Resource-Id':c.resourceId,'X-Api-Request-Id':randomUUID(),'X-Api-Sequence':'-1'},body:JSON.stringify({user:{uid:'pi-bot'},audio:{data:bytes.toString('base64')},request:{model_name:c.model,enable_itn:true,enable_punc:true}})},256000);
    if(!response.ok){let detail='';try{const error=JSON.parse(body);detail=error.message||error.msg||error.code||'';}catch{}throw volcError(response.status,response.headers.get('x-api-message')||response.headers.get('x-api-status-message')||detail,response.headers.get('x-tt-logid'),token);}const code=response.headers.get('x-api-status-code');if(code&&code!=='20000000'){let detail='';try{const error=JSON.parse(body);detail=error.message||error.msg||'';}catch{}throw Error('火山引擎识别失败，状态码 '+code+(detail?'：'+detail:'')+'；请核对 App ID、Access Token 和服务授权。');}let value;try{value=JSON.parse(body);}catch{throw Error('火山引擎没有返回有效 JSON。');}text=value.result?.text;
  }else{
    const form=new FormData();form.append('file',new Blob([bytes],{type:'audio/wav'}),'speech.wav');form.append('model',c.model);if(c.language)form.append('language',c.language);
    const value=await jsonFetch(c.url,{...options,headers:token?{Authorization:'Bearer '+token}:{},body:form},256000);text=value.text;
  }
  if(typeof text!=='string')throw Error('语音服务未返回识别文字，请核对接口类型与模型。');return text.slice(0,32000);
}
// Aliyun wire formats follow the official Fun-ASR client/server events and
// Qwen-ASR-Realtime client/server events. The bundled ws supports handshake headers.
async function transcribeAliyunFlash(c,bytes,token,signal){
  const value=await jsonFetch(aliyunUrl(c.url,c.model),{method:'POST',timeoutMs:90000,signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-DashScope-SSE':'disable'},body:JSON.stringify({model:c.model,input:{messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:'data:audio/wav;base64,'+bytes.toString('base64')}}]}]},parameters:{format:'wav',sample_rate:'16000'}})},256000);
  if(value.code)throw Error('阿里云识别失败：'+value.code+' '+(value.message||''));
  const text=value.output?.text??value.output?.sentence?.text??(Array.isArray(value.output?.sentences)?value.output.sentences.map(s=>s.text||'').join(''):undefined);
  if(typeof text!=='string')throw Error('阿里云未返回识别文字，请核对模型与接口。');return text.slice(0,32000);
}
function pcmAudio(bytes){
  if(bytes.toString('ascii',0,4)!=='RIFF')return bytes;
  for(let at=12;at+8<=bytes.length;){const size=bytes.readUInt32LE(at+4);if(bytes.toString('ascii',at,at+4)==='data')return bytes.subarray(at+8,Math.min(bytes.length,at+8+size));at+=8+size+(size%2);}
  throw Error('录音 WAV 缺少音频数据。');
}
function transcribeAliyunSocket(c,bytes,token,signal){
  if(signal?.aborted)return Promise.reject(Error('语音转写已取消。'));
  const WebSocket=require('./vendor/ws'),fun=c.model.startsWith('fun-asr'),url=new URL(aliyunUrl(c.url,c.model));
  if(!fun)url.searchParams.set('model',c.model);
  const pcm=pcmAudio(bytes),taskId=randomUUID(),parts=new Map();
  return new Promise((resolve,reject)=>{
    let settled=false,sent=false;
    const ws=new WebSocket(url.href,{headers:{Authorization:'Bearer '+token},handshakeTimeout:15000,maxPayload:256000,followRedirects:false});
    const finish=(error,text)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);try{ws.terminate();}catch{}error?reject(error):resolve(String(text??'').slice(0,32000));};
    const abort=()=>finish(Error('语音转写已取消。')),timer=setTimeout(()=>finish(Error('阿里云转写超时，请检查网络、地域和服务授权。')),90000);
    const send=v=>ws.send(JSON.stringify(v));
    const audio=()=>{if(sent)return;sent=true;for(let at=0;at<pcm.length;at+=3200){const chunk=pcm.subarray(at,at+3200);if(fun)ws.send(chunk);else send({event_id:randomUUID(),type:'input_audio_buffer.append',audio:chunk.toString('base64')});}if(fun)send({header:{action:'finish-task',task_id:taskId,streaming:'duplex'},payload:{input:{}}});else{send({event_id:randomUUID(),type:'input_audio_buffer.commit'});send({event_id:randomUUID(),type:'session.finish'});}};
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
    ws.on('error',()=>finish(Error('阿里云连接失败，请检查网络、服务地址及 API Key 的地域与授权。')));
    ws.on('unexpected-response',(_req,res)=>{res.resume();finish(Error('阿里云连接返回 HTTP '+res.statusCode+'，请核对 API Key、地域和模型授权。'));});
    ws.on('close',()=>{if(!settled)finish(Error('阿里云转写连接提前关闭。'));});
    ws.on('open',()=>{if(settled)return;try{if(fun)send({header:{action:'run-task',task_id:taskId,streaming:'duplex'},payload:{task_group:'audio',task:'asr',function:'recognition',model:c.model,parameters:{format:'pcm',sample_rate:16000},input:{}}});else send({event_id:randomUUID(),type:'session.update',session:{input_audio_format:'pcm',sample_rate:16000,input_audio_transcription:c.language?{language:c.language}:{},turn_detection:null}});}catch(e){finish(e);}});
    ws.on('message',raw=>{if(settled)return;try{
      const v=JSON.parse(raw.toString('utf8')),event=v.header?.event||v.type;
      if(event==='task-failed'||event==='error'||event==='conversation.item.input_audio_transcription.failed')return finish(Error('阿里云识别失败：'+(v.header?.error_message||v.error?.message||v.message||'模型拒绝了请求。')));
      if(event==='task-started'||event==='session.updated')audio();
      if(event==='result-generated'){const sentence=v.payload?.output?.sentence;if(sentence&&!sentence.heartbeat&&sentence.sentence_end)parts.set(sentence.sentence_id??sentence.begin_time,sentence.text||'');}
      if(event==='conversation.item.input_audio_transcription.completed')parts.set(v.item_id||parts.size,v.transcript||'');
      if(event==='task-finished'||event==='session.finished')finish(null,[...parts.values()].join(''));
    }catch(e){finish(e);}});
  });
}
module.exports={speechConfig,transcribeAudio,testSpeech,QWEN_DEFAULT_URL,QWEN_DEFAULT_MODEL,VOLCENGINE_DEFAULT_MODEL,VOLCENGINE_MODEL_LABEL};
