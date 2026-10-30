'use strict';
const groupWork=require('./group-stop');
async function deliverRoundReports(team,room,roundId){
  const generation=groupWork.epoch(room);
  for(const report of room.reports||[]){
    if(report.cancelled||report.groupStopped||!groupWork.current(team,room,generation))continue;
    if(report.replyDelivered||report.interrupted||roundId&&report.roundId!==roundId||!report.roundId&&!report.error)continue;
    const key='report:'+report.id;if(team.deliveries.has(key)){await team.deliveries.get(key);continue;}
    const run=(async()=>{
      const jobs=team.state.jobs.filter(j=>j.roomId===room.id&&j.roundId===report.roundId);
      if(jobs.some(j=>team.active(j)))return;
      if(jobs.some(j=>j.status==='needs_review'&&/^(No task result was recorded|Task input is outside the bounded evidence window)/.test(j.error||'')&&(j.reconcileAttempt||0)<6))return;
      report.result='[群聊 '+room.name+' 的讨论结果]\n'+(report.error?'派发失败：'+report.error:(report.planReply||'')+'\n'+jobs.map(j=>team.botName(j.botId)+' ['+j.status+']\n'+String(j.result||j.error||'未记录结果')).join('\n\n'));
      report.status=report.error?'error':'completed';await team.save();if(report.cancelled||report.groupStopped||!groupWork.current(team,room,generation))return;await team.deliverResult(report);
    })();team.deliveries.set(key,run);
    try{await run;}catch(error){report.deliveryError=String(error.message).slice(0,1000);throw error;}finally{team.deliveries.delete(key);}
  }
}
module.exports={deliverRoundReports};
