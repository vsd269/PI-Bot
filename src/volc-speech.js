// Volcengine ASR V3 binary WebSocket transport, adapted from the official protocol.
'use strict';
const {gzipSync,gunzipSync}=require('node:zlib');
const {randomUUID}=require('node:crypto');
const WebSocket=require('./vendor/ws');
const URL_DEFAULT='wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
const RESOURCE_DEFAULT='volc.seedasr.sauc.duration';
function volcUrl(value){
  const u=new URL(value||URL_DEFAULT);
  if(u.hostname==='openspeech.bytedance.com'&&/^\/api\/v3\/(?:sauc|auc)\/bigmodel/.test(u.pathname)){u.protocol='wss:';u.pathname='/api/v3/sauc/bigmodel_async';}
  if(u.username||u.password||u.hash||!['wss:','https:'].includes(u.protocol)&&!(['ws:','http:'].includes(u.protocol)&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('火山流式接口需使用 WSS 地址。');
  return u.href;
}
function packet(type,flags,payload,json=false){
  const bytes=gzipSync(json?Buffer.from(JSON.stringify(payload)):payload),size=Buffer.alloc(4);size.writeUInt32BE(bytes.length);
  return Buffer.concat([Buffer.from([0x11,(type<<4)|flags,json?0x11:0x01,0]),size,bytes]);
}
function responsePacket(raw){
  const b=Buffer.from(raw);if(b.length<8||b[0]>>4!==1)throw Error('火山引擎返回无效协议帧。');
  let at=(b[0]&15)*4;const type=b[1]>>4,flags=b[1]&15,serialization=b[2]>>4,compression=b[2]&15;let code=0,sequence=0;
  if(at<4||at+4>b.length)throw Error('火山协议帧不完整。');
  if(type===15){code=b.readUInt32BE(at);at+=4;}else if(flags&1){sequence=b.readInt32BE(at);at+=4;}
  if(at+4>b.length)throw Error('火山协议帧缺少长度。');const size=b.readUInt32BE(at);at+=4;
  if(size>256000||at+size>b.length||![0,1].includes(compression))throw Error('火山协议数据大小或压缩格式无效。');
  const payload=compression?gunzipSync(b.subarray(at,at+size),{maxOutputLength:256000}):b.subarray(at,at+size);
  const value=serialization===1?JSON.parse(payload.toString('utf8')):{message:payload.toString('utf8')};return {type,code,final:!!(flags&2)||sequence<0,value};
}
function volcError(status,message='',logid='',token=''){
  const clean=value=>String(value||'').split(token||'\u0000').join('[密钥已隐藏]').replace(/[\r\n]+/g,' ').slice(0,600);
  let explanation=status===403||status===401?'鉴权或服务授权未通过；请确认密钥属于语音服务控制台，且已开通所选 Resource ID。API Key 使用新版鉴权；Access Token 使用旧版 App ID 鉴权。':'';
  return Error('火山引擎'+(status?'返回 '+(status<1000?'HTTP ':'状态码 ')+status:'连接失败')+(message?'：'+clean(message):'')+(explanation?'；'+explanation:'')+(logid?'（Log ID：'+clean(logid)+'）':''));
}
function transcribeVolc(c,pcm,token,signal){
  if(signal?.aborted)return Promise.reject(Error('语音转写已取消。'));
  if(!token)return Promise.reject(Error('请填写火山语音服务的 API Key 或 Access Token。'));
  return new Promise((resolve,reject)=>{
    let settled=false,audioTimer,logid='',latest='',sentFinal=false;
    const headers={'X-Api-Resource-Id':c.resourceId,'X-Api-Connect-Id':randomUUID(),'X-Api-Request-Id':randomUUID(),'X-Api-Sequence':'-1',...(c.authMode==='apiKey'?{'X-Api-Key':token}:{'X-Api-App-Key':c.appId,'X-Api-Access-Key':token})};
    const ws=new WebSocket(volcUrl(c.url),{headers,handshakeTimeout:15000,maxPayload:256000,followRedirects:false});
    const finish=(error,text)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(audioTimer);signal?.removeEventListener('abort',abort);try{ws.terminate();}catch{}error?reject(error):resolve(String(text??latest).slice(0,32000));};
    const abort=()=>finish(Error('语音转写已取消。')),timer=setTimeout(()=>finish(volcError(0,'转写超时，请检查网络与服务授权。',logid,token)),90000);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
    ws.on('upgrade',res=>{logid=res.headers['x-tt-logid']||'';});
    ws.on('unexpected-response',(_req,res)=>{logid=res.headers['x-tt-logid']||'';let text='';res.on('data',b=>{if(text.length<8000)text+=b.toString('utf8');});res.on('end',()=>{let message=res.headers['x-api-message']||res.headers['x-api-status-message']||text;try{const v=JSON.parse(text);message=v.message||v.msg||v.error?.message||message;}catch{}finish(volcError(res.statusCode,message,logid,token));});res.on('error',()=>finish(volcError(res.statusCode,'响应读取失败。',logid,token)));});
    ws.on('error',()=>finish(volcError(0,'请检查网络和 WSS 地址。',logid,token)));
    ws.on('close',()=>{if(!settled)finish(volcError(0,'连接提前关闭，尚未收到最终识别结果。',logid,token));});
    ws.on('open',()=>{if(settled)return;try{
      ws.send(packet(1,0,{user:{uid:'pi-bot'},audio:{format:'pcm',rate:16000,bits:16,channel:1},request:{model_name:'bigmodel',enable_itn:true,enable_punc:true,show_utterances:true,result_type:'full'}},true));
      let offset=0;const send=()=>{if(settled||ws.readyState!==WebSocket.OPEN)return;try{const end=Math.min(pcm.length,offset+6400),final=end===pcm.length;ws.send(packet(2,final?2:0,pcm.subarray(offset,end)));offset=end;if(final)sentFinal=true;else audioTimer=setTimeout(send,200);}catch(e){finish(e);}};send();
    }catch(e){finish(e);}});
    ws.on('message',raw=>{if(settled)return;try{const {type,code,final,value}=responsePacket(raw);if(Number(code||value.code)===45000002&&sentFinal)return finish(null,'');if(type===15||Number(value.code)&&![0,1000,20000000].includes(Number(value.code)))return finish(volcError(code||value.code,value.message||value.error||'识别失败',logid,token));if(type!==9)return;const result=Array.isArray(value.result)?value.result[0]:value.result;if(typeof result?.text==='string')latest=result.text;if(final){if(!sentFinal)return finish(volcError(0,'服务提前结束识别。',logid,token));finish(null,latest);}}catch(e){finish(e);}});
  });
}
module.exports={volcUrl,transcribeVolc,volcError,packet,responsePacket,URL_DEFAULT,RESOURCE_DEFAULT};
