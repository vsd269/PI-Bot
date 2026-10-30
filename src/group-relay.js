'use strict';
const groupWork=require('./group-stop');
const {randomUUID}=require('node:crypto');
const limitOf=room=>Number.isInteger(room.relayLimit)&&room.relayLimit>=1&&room.relayLimit<=1000?room.relayLimit:Math.max(3,room.members.length*3);
function serial(team,room,run){
  team.relayWrites??=new Map();
  const task=(team.relayWrites.get(room.id)||Promise.resolve()).catch(()=>{}).then(run);
  team.relayWrites.set(room.id,task);return task;
}
function validateRelays(room,bots){
  if(room.workEpoch!==undefined&&(!Number.isSafeInteger(room.workEpoch)||room.workEpoch<0))throw Error('群聊工作代次无效。');
  if(room.relayLimit!=null&&(!Number.isInteger(room.relayLimit)||room.relayLimit<1||room.relayLimit>1000))throw Error('群聊自动交接上限需要为 1–1000。');
  if(room.pausedRelays!==undefined&&(!Array.isArray(room.pausedRelays)||room.pausedRelays.length>1000||room.pausedRelays.some(r=>!r||typeof r.id!=='string'||typeof r.botId!=='string'||typeof r.sourceJobId!=='string'||typeof r.task!=='string'||r.task.length>1000000||!r.options||typeof r.options!=='object'||Array.isArray(r.options))))throw Error('群聊待继续任务无效。');
}
async function delegate(team,room,job,ids,path){
  return serial(team,room,async()=>{
    if(job.delegated||job.cancelled||!groupWork.current(team,room,job.groupEpoch??0))return;
    const before=room.pausedRelays;
    room.pausedRelays=[...(before||[])];
    for(const id of ids){
      const key=job.id+':'+id;
      if(team.state.jobs.some(j=>j.relayKey===key)||room.pausedRelays.some(r=>r.key===key))continue;
      if(room.pausedRelays.length>=1000)throw Error('群聊待继续任务超过 1000 项，请先处理。');
      room.pausedRelays.push({id:randomUUID(),key,botId:id,sourceJobId:job.id,task:'群聊成员 '+team.botName(job.botId)+' 向你交接任务：\n'+job.result,blocked:path.includes(id),options:{attachments:job.attachments,referencesText:job.referencesText,offRound:true,fromBotId:job.botId,fromName:team.botName(job.botId),replyTo:job.botId,replyRoomId:room.id,hop:(job.hop||0)+1,mentionPath:path}});
    }
    job.delegated=true;
    try{await team.save();}catch(error){if(groupWork.current(team,room,job.groupEpoch??0)){room.pausedRelays=before;delete job.delegated;}throw error;}
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
    if(room.relayCount>=limitOf(room))break;
    if(relay.blocked&&!resumed)continue;
    const saved=relay.options,options={offRound:true,attachments:saved.attachments,referencesText:saved.referencesText,fromBotId:saved.fromBotId,fromName:saved.fromName,replyTo:saved.fromBotId,replyRoomId:room.id,hop:resumed?1:Math.min(40,Math.max(1,Number(saved.hop)||1)),mentionPath:resumed?[]:(Array.isArray(saved.mentionPath)?saved.mentionPath:[]).filter(id=>room.members.includes(id)).slice(0,40)};
    // The queued job and its relay key are persisted together; a retry finds it.
    let release,reject;const admission=new Promise((a,b)=>{release=a;reject=b;});admission.catch(()=>{});
    const priorQueue=room.pausedRelays,priorCount=room.relayCount;
    const job=team.enqueue(room,bot,relay.task,undefined,{...options,groupEpoch:generation,replyGroupEpoch:generation,relayKey:relay.key},admission);
    room.relayCount++;
    room.pausedRelays=room.pausedRelays.filter(r=>r!==relay);
    try{await team.save();release();}catch(error){if(groupWork.current(team,room,generation)){room.pausedRelays=priorQueue;room.relayCount=priorCount;}team.state.jobs=team.state.jobs.filter(j=>j!==job);reject(error);throw error;}
  }
  const pending=room.pausedRelays?.length||0;
  if(pending&&room.relayNoticeCount!==pending){team.log(room,'System','自动交接已暂停：'+pending+' 项待继续；重复循环已暂时停止。点击“继续”或发送消息恢复。');room.relayNoticeCount=pending;}else if(!pending)delete room.relayNoticeCount;
  await team.save();
  return {pending:room.pausedRelays?.length||0,limit:limitOf(room),sent:room.relayCount};
}
function resume(team,room){const generation=groupWork.epoch(room);return serial(team,room,async()=>{groupWork.assertCurrent(team,room,generation);room.relayCount=0;team.userSpoke();await team.save();groupWork.assertCurrent(team,room,generation);return drain(team,room,true,generation);});}
module.exports={limitOf,delegate,resume,validateRelays};
