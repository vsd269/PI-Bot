'use strict';
const groupWork=require('./group-stop');
const {randomUUID,createHash}=require('node:crypto');
const {admit}=require('./work-admission');
// Ordinary work has no relay-count ceiling. Only consecutive zero-tool,
// acknowledgement/repeated replies are parked; user continuation resets this.
const IDLE_RELAY_LIMIT=6;
const ACK=/^(?:(?:收到|好的|好|明白了|明白|了解了|了解|没问题|谢谢|多谢|感谢|辛苦了|辛苦|不客气|不用谢|完毕|完成|好嘞|行|ok|okay|gotit|understood|noted|thanks|thankyou|youarewelcome|yourewelcome|welcome|np|noproblem|roger|ack|done|allgood|soundsgood))+$/i;
function nextGuard(team,room,job){
  const raw=String(job.result||''),members=room.members.map(id=>team.state.bots.find(b=>b.id===id)).filter(Boolean),spans=team.mentions.mentionSpans(raw,members);let text=raw;
  for(const span of [...spans].reverse())text=text.slice(0,span.start)+text.slice(span.end);
  const body=text.toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,''),digest=createHash('sha256').update(body).digest('hex'),previous=room.relayGuard||{idle:0,recent:[]},recent=previous.recent||[];
  const worked=Number(job.toolCalls)>0||Boolean(job.toolEvents?.length),idle=!worked&&(!body||body.length<=100&&ACK.test(body)||recent.some(row=>row.botId===job.botId&&row.digest===digest));
  return {idle:idle?Math.min(IDLE_RELAY_LIMIT,(previous.idle||0)+1):0,recent:[...recent,{botId:job.botId,digest}].slice(-32)};
}
function serial(team,room,run){
  team.relayWrites??=new Map();
  const task=(team.relayWrites.get(room.id)||Promise.resolve()).catch(()=>{}).then(run);
  team.relayWrites.set(room.id,task);return task;
}
function validateRelays(room,bots){
  if(room.workEpoch!==undefined&&(!Number.isSafeInteger(room.workEpoch)||room.workEpoch<0))throw Error('群聊工作代次无效。');
  if(room.relayLimit!=null&&(!Number.isInteger(room.relayLimit)||room.relayLimit<1||room.relayLimit>1000))throw Error('群聊自动交接上限需要为 1–1000。');
  if(room.relayGuard!==undefined&&(!room.relayGuard||!Number.isInteger(room.relayGuard.idle)||room.relayGuard.idle<0||room.relayGuard.idle>IDLE_RELAY_LIMIT||!Array.isArray(room.relayGuard.recent)||room.relayGuard.recent.length>32||room.relayGuard.recent.some(row=>!row||typeof row.botId!=='string'||row.botId.length>120||typeof row.digest!=='string'||!/^[a-f0-9]{64}$/.test(row.digest))))throw Error('群聊空转保护记录无效。');
  if(room.pausedRelays!==undefined&&(!Array.isArray(room.pausedRelays)||room.pausedRelays.length>1000||room.pausedRelays.some(r=>!r||typeof r.id!=='string'||typeof r.botId!=='string'||typeof r.sourceJobId!=='string'||typeof r.task!=='string'||r.task.length>1000000||!r.options||typeof r.options!=='object'||Array.isArray(r.options))))throw Error('群聊待继续任务无效。');
}
async function delegate(team,room,job,ids,path){
  return serial(team,room,async()=>{
    if(job.delegated||job.cancelled||!ids.length||!groupWork.current(team,room,job.groupEpoch??0))return;
    const before=room.pausedRelays,beforeGuard=room.relayGuard;
    room.relayGuard=nextGuard(team,room,job);
    room.pausedRelays=[...(before||[])];
    for(const id of ids){
      const key=job.id+':'+id;
      if(team.state.jobs.some(j=>j.relayKey===key)||room.pausedRelays.some(r=>r.key===key))continue;
      if(room.pausedRelays.length>=1000)throw Error('群聊待继续任务超过 1000 项，请先处理。');
      room.pausedRelays.push({id:randomUUID(),key,botId:id,sourceJobId:job.id,task:'群聊成员 '+team.botName(job.botId)+' 向你交接任务：\n'+job.result,blocked:room.relayGuard.idle>=IDLE_RELAY_LIMIT,options:{scheduleId:job.scheduleId,scheduleRunId:job.scheduleRunId,attachments:job.attachments,referencesText:job.referencesText,offRound:true,fromBotId:job.botId,fromName:team.botName(job.botId),replyTo:job.botId,replyRoomId:room.id,hop:(job.hop||0)+1,mentionPath:path}});
    }
    job.delegated=true;
    try{await team.save();}catch(error){if(groupWork.current(team,room,job.groupEpoch??0)){room.pausedRelays=before;room.relayGuard=beforeGuard;delete job.delegated;}throw error;}
    return drain(team,room,false);
  });
}
async function drain(team,room,resumed,generation=groupWork.epoch(room)){
  room.relayCount??=0;
  for(const relay of [...(room.pausedRelays||[])]){
    if(!groupWork.current(team,room,generation))break;
    const bot=team.state.bots.find(b=>b.id===relay.botId&&room.members.includes(b.id)&&b.id!==room.adminId&&b.role!=='Administrator');
    if(!bot){room.pausedRelays=room.pausedRelays.filter(r=>r!==relay);continue;}
    const existing=team.state.jobs.find(j=>j.relayKey===relay.key);
    if(existing){room.pausedRelays=room.pausedRelays.filter(r=>r!==relay);continue;}
    if(relay.blocked&&!resumed)continue;
    const saved=relay.options,options={scheduleId:saved.scheduleId,scheduleRunId:saved.scheduleRunId,offRound:true,attachments:saved.attachments,referencesText:saved.referencesText,fromBotId:saved.fromBotId,fromName:saved.fromName,replyTo:saved.fromBotId,replyRoomId:room.id,hop:resumed?1:Math.min(40,Math.max(1,Number(saved.hop)||1)),mentionPath:resumed?[]:(Array.isArray(saved.mentionPath)?saved.mentionPath:[]).filter(id=>room.members.includes(id)).slice(0,40)};
    // The queued job and its relay key are persisted together; a retry finds it.
    const priorQueue=room.pausedRelays,priorCount=room.relayCount;
    try{
      await admit(team,{room,bot,task:relay.task,key:'relay:'+relay.key,options:{...options,groupEpoch:generation,replyGroupEpoch:generation,relayKey:relay.key},
        check:()=>groupWork.assertCurrent(team,room,generation),
        change:(edit)=>{edit.set(room,'relayCount',room.relayCount+1);edit.set(room,'pausedRelays',room.pausedRelays.filter(r=>r!==relay));}
      });
    }catch(error){if(groupWork.current(team,room,generation)){room.pausedRelays=priorQueue;room.relayCount=priorCount;}throw error;}
  }
  const pending=room.pausedRelays?.length||0;
  if(pending&&room.relayNoticeCount!==pending){team.log(room,'System','自动交接已暂停：'+pending+' 项待继续；检测到连续无工具操作的确认或重复内容，已暂时阻止空转。点击“继续”或发送消息恢复。');room.relayNoticeCount=pending;}else if(!pending)delete room.relayNoticeCount;
  await team.save();
  return {pending:room.pausedRelays?.length||0,sent:room.relayCount};
}
function resume(team,room){const generation=groupWork.epoch(room);return serial(team,room,async()=>{groupWork.assertCurrent(team,room,generation);room.relayCount=0;delete room.relayGuard;team.userSpoke();await team.save();groupWork.assertCurrent(team,room,generation);return drain(team,room,true,generation);});}
module.exports={IDLE_RELAY_LIMIT,delegate,resume,validateRelays};
