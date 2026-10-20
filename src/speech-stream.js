'use strict';
const WS=require('./vendor/ws'),{randomUUID}=require('node:crypto');
const {packet,responsePacket,volcError}=require('./volc-speech');
const {aliyunUrl}=require('./speech-urls');
function isRealtime(c){return c?.enabled!==false&&(c?.provider==='qwen'&&(c.model==='fun-asr-realtime'||c.model==='qwen3-asr-flash-realtime')||c?.provider==='volcengine'&&/^wss?:/.test(c.url));}
// Audio arrives from the microphone while it is being captured. No WAV upload
// or second recognition request is made when the user finishes speaking.
function openSpeechStream(c,token,{onPartial=()=>{},onError=()=>{}}={}){
 if(!isRealtime(c))throw Error('语音对话请选择 Fun-ASR 实时、千问实时或豆包 2.0 流式识别，并保存配置。');
 if(!token)throw Error('请先保存实时语音服务的密钥。');
 const volc=c.provider==='volcengine',fun=c.model==='fun-asr-realtime',taskId=randomUUID(),url=new URL(volc?c.url:aliyunUrl(c.url,c.model));if(!volc&&!fun)url.searchParams.set('model',c.model);
 const headers=volc?{'X-Api-Resource-Id':c.resourceId,'X-Api-Request-Id':taskId,'X-Api-Connect-Id':taskId,'X-Api-Sequence':'-1',...(c.authMode==='apiKey'?{'X-Api-Key':token}:{'X-Api-App-Key':c.appId,'X-Api-Access-Key':token})}:{Authorization:'Bearer '+token};
 const ws=new WS(url.href,{headers,handshakeTimeout:15000,maxPayload:256000,followRedirects:false});
 let readyYes,readyNo,doneYes,doneNo,settled=false,started=false,ending=false,sentEnd=false,bytes=0,queued=0,latest='',logid='',finishTimer;
 const queue=[],parts=new Map(),ready=new Promise((y,n)=>{readyYes=y;readyNo=n;}),done=new Promise((y,n)=>{doneYes=y;doneNo=n;});ready.catch(()=>{});done.catch(()=>{});
 const timeout=setTimeout(()=>fail(Error('实时语音连接超时，请检查网络或重新开始通话。')),90000);
 function finish(error){if(settled)return;settled=true;clearTimeout(timeout);clearTimeout(finishTimer);queue.length=0;try{ws.terminate();}catch{}if(error){readyNo(error);doneNo(error);onError(error);}else{readyYes();doneYes(latest.slice(0,32000));}}
 function fail(error){finish(error);}
 const json=v=>ws.send(JSON.stringify(v));
 function drain(){if(!started||settled)return;try{while(queue.length&&ws.bufferedAmount<64000){const b=queue.shift();queued-=b.length;if(volc)ws.send(packet(2,0,b));else if(fun)ws.send(b);else json({event_id:randomUUID(),type:'input_audio_buffer.append',audio:b.toString('base64')});}if(queue.length){finishTimer=setTimeout(drain,20);return;}if(ending&&!sentEnd){sentEnd=true;if(volc)ws.send(packet(2,2,Buffer.alloc(0)));else if(fun)json({header:{action:'finish-task',task_id:taskId,streaming:'duplex'},payload:{input:{}}});else{json({event_id:randomUUID(),type:'input_audio_buffer.commit'});json({event_id:randomUUID(),type:'session.finish'});}}}catch(e){fail(e);}}
 function begin(){if(started||settled)return;started=true;readyYes();drain();}
 function partial(text){latest=String(text||'').slice(0,32000);onPartial(latest);}
 ws.on('upgrade',res=>{logid=res.headers['x-tt-logid']||'';});
 ws.on('unexpected-response',(_req,res)=>{logid=res.headers['x-tt-logid']||'';let body='';res.on('data',b=>{if(body.length<8000)body+=b.toString();});res.on('end',()=>fail(volc?volcError(res.statusCode,res.headers['x-api-message']||body,logid,token):Error('阿里云实时连接返回 HTTP '+res.statusCode+'，请核对密钥、模型与地域授权。')));res.on('error',()=>fail(Error('实时语音响应读取失败。')));});
 ws.on('error',()=>fail(Error('实时语音连接失败，请检查网络、服务地址和密钥授权。')));ws.on('close',()=>{if(!settled)fail(Error('实时语音连接提前关闭，未收到最终转写结果。'));});
 ws.on('open',()=>{try{if(volc){ws.send(packet(1,0,{user:{uid:'pi-bot'},audio:{format:'pcm',rate:16000,bits:16,channel:1},request:{model_name:'bigmodel',enable_itn:true,enable_punc:true,result_type:'full'}},true));begin();}else if(fun)json({header:{action:'run-task',task_id:taskId,streaming:'duplex'},payload:{task_group:'audio',task:'asr',function:'recognition',model:c.model,parameters:{format:'pcm',sample_rate:16000},input:{}}});else json({event_id:randomUUID(),type:'session.update',session:{input_audio_format:'pcm',sample_rate:16000,input_audio_transcription:c.language?{language:c.language}:{},turn_detection:null}});}catch(e){fail(e);}});
 ws.on('message',raw=>{if(settled)return;try{
  if(volc){const r=responsePacket(raw),code=Number(r.code||r.value.code||0);if(r.type===15||code&&![1000,20000000].includes(code)){if(code===45000002&&sentEnd)return finish();return fail(volcError(code,r.value.message||r.value.error||'识别失败',logid,token));}if(r.type!==9)return;const result=Array.isArray(r.value.result)?r.value.result[0]:r.value.result;if(typeof result?.text==='string')partial(result.text);if(r.final){if(!sentEnd)return fail(Error('火山服务提前结束识别。'));finish();}return;}
  const v=JSON.parse(raw.toString()),event=v.header?.event||v.type;
  if(['task-failed','error','conversation.item.input_audio_transcription.failed'].includes(event)){const detail=String(v.header?.error_message||v.error?.message||v.message||'请求失败').split(token).join('[密钥已隐藏]').slice(0,500);return fail(Error('阿里云实时识别失败：'+detail));}
  if(event==='task-started'||event==='session.updated')begin();
  if(event==='result-generated'){const s=v.payload?.output?.sentence;if(s&&!s.heartbeat){const id=s.sentence_id??s.begin_time??'current';if(s.sentence_end)parts.set(id,s.text||'');partial([...parts.values()].join('')+(s.sentence_end?'':s.text||''));}}
  if(event==='conversation.item.input_audio_transcription.text')partial([...parts.values()].join('')+(v.text||'')+(v.stash||''));
  if(event==='conversation.item.input_audio_transcription.completed'){parts.set(v.item_id||parts.size,v.transcript||'');partial([...parts.values()].join(''));}
  if(event==='task-finished'||event==='session.finished'){if(!sentEnd)return fail(Error('实时服务提前结束识别。'));finish();}
 }catch(e){fail(e);}});
 return {ready,push(pcm){if(settled)throw Error('实时语音连接已关闭。');if(ending)throw Error('实时录音已结束。');const b=Buffer.from(pcm);if(b.length%2||b.length>6400||bytes+b.length>1920000||queued+b.length>256000){const e=Error('实时音频超过长度或网络缓冲限制，请重新开始。');fail(e);throw e;}bytes+=b.length;queued+=b.length;queue.push(b);drain();},finish(){if(!ending){ending=true;drain();}return done;},cancel(){fail(Error('实时语音已取消。'));}};
}
module.exports={isRealtime,openSpeechStream};
