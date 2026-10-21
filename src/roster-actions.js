'use strict';
const {randomUUID}=require('node:crypto');
async function createBotFrom(team,creator,input){
  const brief=String(input.brief||'').trim();if(brief.length>8000)throw Error('首次背景最多 8000 字符。');
  const models=await team.models();
  const modelKey=input.modelKey||models.find(m=>m.key===creator.modelKey)?.key||models.find(m=>m.isDefault)?.key||models[0]?.key||'';
  const id=randomUUID();try{await team.upsertBot({...input,id:undefined,role:'Worker',modelKey},id);}catch(error){await team.rosterChange(async()=>{team.state.bots=team.state.bots.filter(b=>b.id!==id);await team.save().catch(()=>{});});throw error;}
  await team.rosterChange(async()=>{const bot=team.bot(id);bot.createdBy=creator.id;bot.kickoff={text:creator.name+' just created you for the user.'+(brief?' Why you exist: '+brief:'')+'\nGreet the user in one short message, then ask in one short question where to start. Write in the user language if known; otherwise Chinese. Follow your own instructions.',fromBotId:creator.id,fromName:creator.name};await team.save();});
  const bot=team.bot(id);await deliverKickoffs(team,models);return bot;
}
async function deliverKickoffs(team,models){
  return team.rosterChange(async()=>{if(team.stopped)return;if(!team.state.bots.some(b=>b.kickoff))return;models??=await team.models();if(!models.length)return;
  for(const bot of team.state.bots){const kickoff=bot.kickoff;if(!kickoff||bot.role==='Administrator'||bot.modelKey&&!models.some(m=>m.key===bot.modelKey))continue;const source='kickoff-'+bot.id;
    if(!team.state.jobs.some(j=>j.deliverySourceId===source))team.enqueue(null,bot,kickoff.text,undefined,{fromBotId:kickoff.fromBotId,fromName:kickoff.fromName,creationGreeting:true,deliverySourceId:source});
    await team.save();delete bot.kickoff;await team.save();
  }
  });
}
async function createGroupFrom(team,creator,input){
  const adminId=input.adminId===null?null:input.adminId||creator.id;
  const members=[...new Set([creator.id,...(input.members||[]),...(adminId?[adminId]:[])])];
  const id=randomUUID();try{await team.upsertRoom({...input,id:undefined,members,adminId},id);}catch(error){await team.rosterChange(async()=>{team.state.rooms=team.state.rooms.filter(r=>r.id!==id);await team.save().catch(()=>{});});throw error;}await team.rosterChange(async()=>{team.room(id).createdBy=creator.id;await team.save();});return team.room(id);
}
function archiveChat(team,kind,item){
  const {linesOf}=require('./history');
  const archive={kind,id:item.id,name:item.name,deletedAt:new Date().toISOString(),item:structuredClone(item),lines:structuredClone(linesOf(team,kind,item.id)),questions:structuredClone((team.state.questions||[]).filter(q=>kind==='room'?q.roomId===item.id:!q.roomId&&q.botId===item.id))};
  if(kind==='bot')archive.views=structuredClone((team.state.views||[]).filter(view=>view.botId===item.id));
  (team.state.archives??=[]).push(archive);return archive;
}
module.exports={createBotFrom,createGroupFrom,archiveChat,deliverKickoffs};
