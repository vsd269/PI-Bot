'use strict';
// A generation is captured when work is admitted, not when a delayed callback
// happens to run. Stopping one group invalidates its old admission chains.
const epoch=room=>Number.isSafeInteger(room?.workEpoch)?room.workEpoch:0;
const stoppedError=()=>Object.assign(new Error('本群的这轮工作已停止。'),{code:'PI_BOT_GROUP_STOPPED'});
function current(team,room,value){return !team.stopped&&team.state.rooms.includes(room)&&epoch(room)===value&&!room.stoppingWork;}
function assertCurrent(team,room,value){if(!current(team,room,value))throw stoppedError();}
async function stop(team,id){
  team.groupStops??=new Map();
  if(team.groupStops.has(id))return team.groupStops.get(id);
  const room=team.room(id);room.workEpoch=epoch(room)+1;room.stoppingWork=true;
  const jobs=team.state.jobs.filter(j=>j.roomId===id&&team.active(j));
  for(const job of jobs){job.cancelled=true;job.groupStopped=true;}
  for(const report of room.reports||[])if(!report.replyDelivered){report.cancelled=true;report.groupStopped=true;report.error='用户已停止本群工作。';report.status='aborted';}
  room.pausedRelays=[];room.relayCount=0;delete room.relayNoticeCount;
  for(const line of room.log||[])if(line.planning&&line.progress)Object.assign(line,{text:'已停止本轮任务分派。',progress:false,planning:false,status:'aborted'});
  const run=(async()=>{
    const errors=[];
    try{
      try{await team.save();}catch(error){errors.push(error);}
      const plan=team.groupPlans?.get(id);
      const operations=jobs.map(job=>team.cancel(job.id));
      if(plan?.turnId)operations.push(team.invoke('agent/abort',[{sessionId:plan.sessionId,turnId:plan.turnId}]));
      for(const result of await Promise.allSettled(operations))if(result.status==='rejected')errors.push(result.reason);
      for(const report of room.reports||[])if(!report.replyDelivered&&!['completed','error','aborted'].includes(report.status)){report.cancelled=true;report.error='用户已停止本群工作。';report.status='aborted';}
      team.log(room,'System','已请求停止本群全部工作；已完成的文件修改不会撤销。',{kind:'notice'});
    }finally{
      room.stoppingWork=false;
      // A pending prompt can still return later; its captured generation will
      // abort that exact turn and will never dispatch more work.
      if(!team.groupPlans?.has(id))room.planning=false;
      try{await team.save();}catch(error){errors.push(error);}
    }
    if(errors.length)throw new Error('已阻止本群继续派发，但部分停止请求未确认，请检查成员状态后重试。');
    return {requested:true,stopped:jobs.length};
  })();
  team.groupStops.set(id,run);
  try{return await run;}finally{if(team.groupStops.get(id)===run)team.groupStops.delete(id);}
}
module.exports={epoch,current,assertCurrent,stoppedError,stop};
