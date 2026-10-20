'use strict';
const {endpoint,boundedFetch}=require('./net');
function ttsConfig(c={}){if(!['system','custom'].includes(c.provider||'system'))throw Error('朗读服务无效。');if(c.provider==='custom'){if(typeof c.model!=='string'||!c.model.trim()||c.model.length>200||typeof c.voice!=='string'||!c.voice.trim()||c.voice.length>200||! /^[A-Z_][A-Z0-9_]{0,79}$/.test(c.keyRef||''))throw Error('请填写朗读模型、音色及密钥名称。');return {provider:'custom',url:endpoint(c.url),model:c.model.trim(),voice:c.voice.trim(),keyRef:c.keyRef};}return {provider:'system',voice:String(c.voice||'').slice(0,500)};}
async function synthesize(config,text,token,signal){
 const c=ttsConfig(config);if(c.provider!=='custom')throw Error('请先选择自定义朗读接口。');if(typeof text!=='string'||!text.trim()||text.length>2000)throw Error('单段朗读需为 1–2000 个字符。');
 const {response,bytes}=await boundedFetch(c.url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,voice:c.voice,input:text,response_format:'mp3'}),signal,timeoutMs:45000},2*1024*1024);
 if(!response.ok)throw Error('朗读服务返回 HTTP '+response.status+'，请核对接口、模型、音色与密钥。');const mime=(response.headers.get('content-type')||'').split(';')[0];if(!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','audio/aac','audio/flac','application/octet-stream'].includes(mime)||!bytes.length)throw Error('朗读接口未返回可播放的音频。');return {dataUrl:'data:'+(mime==='application/octet-stream'?'audio/mpeg':mime)+';base64,'+bytes.toString('base64')};
}
module.exports={ttsConfig,synthesize};
