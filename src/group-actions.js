'use strict';
const {randomUUID}=require('node:crypto');
const {deliverRoundReports}=require('./group-reports');
const {MAX_UNATTENDED_MESSAGES}=require('./coordination');
async function postToGroup(team,room,args,owner,ctx={}){
  if(owner.bot.role!=='Administrator'&&room.adminId!==owner.bot.id)throw Error('只有群管理员或主机器人可以发起群讨论。');
  if(owner.room?.id===room.id)throw Error('你正在这个群聊中发言，请直接回复，避免重复派发。');
  const text=String(args.message||'').trim();if(!text||text.length>1000000)throw Error('Message must have 1–1000000 characters.');
  const source=ctx.sessionId&&team.state.jobs.findLast(j=>j.sessionId===ctx.sessionId&&team.active(j)),hop=(source?.hop||ctx.hop||0)+1;
  if(hop>MAX_UNATTENDED_MESSAGES)throw Error('自动群聊交接次数过多，已暂停。请检查结果，再发一条消息继续。');
  const release=team.reserveRoom(room.id);room.botRounds=(room.botRounds||0)+1;
  try{await team.admitBotMessage();}catch(error){room.botRounds--;release();throw error;}
  const report=args.report_back===true?{id:'group-report-'+randomUUID(),botId:room.adminId||owner.bot.id,replyTo:owner.bot.id,replyRoomId:owner.room?.id,hop,at:new Date().toISOString()}:null;
  if(report){report.status='running';(room.reports??=[]).push(report);if(source)team.handoffs.attach(source,report);}
  team.log(room,owner.bot.name,text,{botId:owner.bot.id});const line=room.log.at(-1);room.unread=true;
  try{await team.save();}catch(error){room.log=room.log.filter(l=>l!==line);if(report)room.reports=room.reports.filter(r=>r!==report);room.botRounds--;release();throw error;}
  const chain=(team.roomChains.get(room.id)||Promise.resolve()).catch(()=>{}).then(()=>team.coordinate(room,text,{attachments:source?.attachments,referencesText:source?.referencesText,fromBotId:owner.bot.id,fromName:owner.bot.name,hop,reportId:report?.id})).finally(release);team.roomChains.set(room.id,chain);
  team.track(chain.catch(async error=>{team.log(room,'System',error.message);if(report)report.error=String(error.message).slice(0,2000);await team.save();await deliverRoundReports(team,room).catch(()=>{});})).catch(()=>{});
  return 'Posted to '+room.name+(report?'; the completed round also returns to this conversation.':'; results stay in the group.');
}
module.exports={postToGroup};
