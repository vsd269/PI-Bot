export function nativeTargets(state){
  const targets=(state.jobs||[]).filter(j=>['launching','running','waiting'].includes(j.status)&&j.sessionId);
  for(const room of state.rooms||[]){const c=room.planningClaim;if(room.planning&&c&&['submitting','accepted'].includes(c.status))targets.push({...c,id:'planning:'+c.planningId,botId:room.adminId,roomId:room.id,status:c.turnId?'running':'launching',planning:true});}
  for(const bot of state.bots||[]){const c=bot.privatePlanningClaim;if(bot.planning&&c&&['submitting','accepted'].includes(c.status))targets.push({...c,id:'planning:'+c.planningId,botId:bot.id,status:c.turnId?'running':'launching',planning:true});}
  return targets;
}
export function nativeOwners(state){
  const owners=new Map(),ambiguous=new Set();
  const add=(sessionId,owner)=>{if(!sessionId)return;const old=owners.get(sessionId);if(old&&(old.botId!==owner.botId||old.roomId!==owner.roomId))ambiguous.add(sessionId);else owners.set(sessionId,owner);};
  for(const bot of state.bots||[])for(const [scope,sessionId] of Object.entries(bot.sessions||{})){
    if(scope==='private')add(sessionId,{botId:bot.id});
    else if((state.rooms||[]).some(r=>r.id===scope&&r.members.includes(bot.id)))add(sessionId,{botId:bot.id,roomId:scope});
  }
  for(const target of nativeTargets(state))add(target.sessionId,{botId:target.botId,roomId:target.roomId});
  for(const sessionId of ambiguous)owners.delete(sessionId);
  return owners;
}
