'use strict';
// A bounded, metadata-only history of committed transitions; not tool checkpoints.
const MAX_EVENTS=512;
const fields=new Set(['seq','at','entity','id','status','botId','roomId','taskId','fromBotId']);
function validateLog(log){
  if(log===undefined)return;
  if(!log||log.version!==1||!Number.isSafeInteger(log.sequence)||log.sequence<0||!Array.isArray(log.events)||log.events.length>MAX_EVENTS)throw Error('Invalid execution log');
  let previous=0;
  for(const event of log.events){
    if(!event||Object.keys(event).some(key=>!fields.has(key))||!['job','message'].includes(event.entity)||!Number.isSafeInteger(event.seq)||event.seq<=previous||event.seq>log.sequence||typeof event.at!=='string'||!Number.isFinite(Date.parse(event.at))||typeof event.id!=='string'||!event.id||event.id.length>260||typeof event.status!=='string'||event.status.length>80)throw Error('Invalid execution event');
    for(const key of ['botId','roomId','taskId','fromBotId'])if(event[key]!==undefined&&(typeof event[key]!=='string'||event[key].length>120))throw Error('Invalid execution event reference');
    previous=event.seq;
  }
  if(log.events.length&&previous!==log.sequence)throw Error('Incomplete execution log');
}
function tracked(state){
  const rows=new Map();
  for(const job of state.jobs||[])if(typeof job.id==='string'&&typeof job.status==='string')rows.set('job:'+job.id,{entity:'job',id:job.id,status:job.status,botId:job.botId,roomId:job.roomId,fromBotId:job.fromBotId,delivered:job.replyDelivered===true});
  for(const request of state.messageBotRequests||[])rows.set('message:'+request.key,{entity:'message',id:request.key,status:request.status,botId:request.targetBotId,fromBotId:request.sourceBotId,taskId:request.jobId});
  return rows;
}
class ExecutionLog{
  constructor(){this.previous=new Map();}
  restore(state){validateLog(state.executionLog);this.previous=tracked(state);}
  prepare(snapshot){
    const old=snapshot.executionLog||{version:1,sequence:0,events:[]};
    const log={version:1,sequence:old.sequence,events:[...old.events]},next=tracked(snapshot),at=new Date().toISOString();
    const append=(row,status)=>{const {delivered,...metadata}=row;log.events.push({...Object.fromEntries(Object.entries(metadata).filter(([,value])=>value!==undefined)),status,at,seq:++log.sequence});};
    for(const [key,row] of next){
      const prior=this.previous.get(key);
      if(!prior||prior.status!==row.status)append(row,row.status);
      if(row.delivered&&!prior?.delivered)append(row,'reply_delivered');
    }
    log.events=log.events.slice(-MAX_EVENTS);snapshot.executionLog=log;
    return {log,next};
  }
  commit(proposal){this.previous=proposal.next;}
}
function history(state,{jobId,limit=40}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('记录条数须为 1–100。');
  const log=state.executionLog||{sequence:0,events:[]},rows=log.events.filter(event=>!jobId||event.entity==='job'&&event.id===jobId||event.taskId===jobId);
  // Leave ample headroom for PI's 64 KiB plugin-call response envelope.
  const events=[];let bytes=0;const selected=rows.slice(-limit);
  for(let i=selected.length-1;i>=0;i--){const size=Buffer.byteLength(JSON.stringify(selected[i]))+1;if(bytes+size>24*1024)break;events.unshift(selected[i]);bytes+=size;}
  return {sequence:log.sequence,events,retained:log.events.length,limit:MAX_EVENTS,responseTruncated:events.length<selected.length,note:'仅保留最近 512 条已保存的状态变化；单次返回最多 100 条且受字节上限约束。不记录正文或密钥。任务完成状态不代表成果已通过独立验收。'};
}
module.exports={ExecutionLog,validateLog,history,MAX_EVENTS};
