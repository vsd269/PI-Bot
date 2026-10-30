'use strict';
const groupWork=require('./group-stop');
const {createHash,randomUUID}=require('node:crypto');
const privacy=require('./privacy');
const {StateEdit}=require('./state-edit');
const states=new Set(['admitting','accepted','failed','interrupted']);
function validateRequests(state){
  if(state.messageBotRequests===undefined)return;
  const rows=state.messageBotRequests,keys=new Set();
  if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid message bot request ledger');
  for(const row of rows){
    if(!row||typeof row!=='object'||typeof row.key!=='string'||!row.key||row.key.length>260||keys.has(row.key)||typeof row.signature!=='string'||!row.signature||row.signature.length>512||!states.has(row.status))throw Error('Invalid message bot request ledger');
    for(const key of ['jobId','sourceBotId','targetBotId','sourceJobId'])if(row[key]!==undefined&&(typeof row[key]!=='string'||!row[key]||row[key].length>120))throw Error('Invalid message bot request reference');
    if(row.kind!==undefined&&!['worker','planner'].includes(row.kind))throw Error('Invalid message bot request kind');
    keys.add(row.key);
  }
}
function reconcileRequests(state){
  validateRequests(state);
  for(const request of state.messageBotRequests||[])if(request.status==='admitting'){
    const child=state.jobs.find(job=>job.id===request.jobId&&job.messageRequestKey===request.key);
    if(child){request.status='accepted';delete request.error;}
    else{request.status='interrupted';request.error='请求尚未确认；没有自动重新派发。请核对原任务。';}
  }
}
function delegationStatus(team,owner,requestId){
  if(typeof requestId!=='string'||! /^[A-Za-z0-9._:-]{1,120}$/.test(requestId))throw Error('请提供原派发请求的 request_id。');
  const record=(team.state.messageBotRequests||[]).find(row=>row.key===owner.bot.id+':'+requestId);
  if(!record)throw Error('没有找到此 Bot 的派发请求。');
  const job=team.state.jobs.find(row=>row.id===record.jobId);
  const planner=record.kind==='planner'&&record.status==='accepted';
  return {requestId,status:record.status,jobId:record.jobId,executionStatus:job?.status||(planner?'planner_returned':record.status==='accepted'?'needs_review':record.status),replyDelivered:job?.replyDelivered===true,verification:'not_independently_verified',note:planner?'管理员规划回合已返回；这不表示其分派任务已完成或成果已验收。':!job&&record.status==='accepted'?'派发已接收，但没有可关联的执行记录；请核对原会话。':'这是已保存的任务状态，不代表外部操作只执行一次或成果已通过验收。'};
}
async function dispatchMessageBot(team,args,owner,ctx){
  const matches=team.state.bots.filter(bot=>bot.name===args.to||bot.id===args.to);if(matches.length!==1)throw Error('No unique Bot named '+args.to);const target=matches[0];
  if(target.id===owner.bot.id)throw Error('Cannot message yourself.');
  privacy.assertMessage(owner.bot,target);
  const content=String(args.message||'').trim();if(!content||content.length>1000000)throw Error('Message must have 1–1000000 characters.');
  if(owner.room&&!owner.room.members.includes(target.id))throw Error('群聊中的任务只能交给本群成员，请先把该 Bot 加入群聊。');
  if(owner.room&&(target.id===owner.room.adminId||target.role==='Administrator'))throw Error('该成员是群聊规划管理员，请在群聊中直接说明需要其汇总的内容。');
  const requestId=args.request_id;if(typeof requestId!=='string'||! /^[A-Za-z0-9._:-]{1,120}$/.test(requestId))throw Error('request_id must be 1–120 letters, digits, dots, underscores, colons or hyphens.');
  const replyTo=args.reply_to==='user'?null:owner.bot.id;
  const signature=createHash('sha256').update(JSON.stringify([target.id,content,replyTo,owner.room?.id||null,ctx.sessionId])).digest('hex');
  const key=owner.bot.id+':'+requestId,admissionKey='message_bot:'+key,running=team.messageAdmissions.get(admissionKey);
  if(running){if(running.signature!==signature)throw Error('request_id 已用于另一条消息，请为新任务使用不同编号。');return running.promise;}
  team.state.messageBotRequests??=[];
  const previous=team.state.messageBotRequests.find(row=>row.key===key);
  if(previous){
    if(previous.signature!==signature)throw Error('request_id 已用于另一条消息，请为新任务使用不同编号。');
    return JSON.stringify({accepted:previous.status==='accepted',duplicate:true,jobId:previous.jobId,status:previous.status,...(previous.status==='accepted'?{}:{error:previous.error||'请求未完成，请核对队列；没有自动重新派发。'})});
  }
  // A duplicate must not be rejected by ancestry which changed after admission.
  const source=team.state.jobs.findLast(job=>job.sessionId===ctx.sessionId&&(!ctx.turnId||job.turnId===ctx.turnId)&&team.active(job));
  team.handoffs.check(source,target.id);const parent=!owner.room&&replyTo?team.handoffs.root(source):null;
  if(team.state.messageBotRequests.length>=10000)throw Error('消息去重记录已达上限，请先备份并升级 PI Bot。');
  if(team.stopped||ctx.signal?.aborted)throw Error('PI-bot is stopping.');
  const planner=!owner.room&&target.role==='Administrator'&&target.agentMode!=='agent';
  const record={key,requestId,kind:planner?'planner':'worker',sourceBotId:owner.bot.id,targetBotId:target.id,sourceJobId:source?.id,...(planner?{}:{jobId:randomUUID()}),signature,status:'admitting',at:new Date().toISOString()};
  team.state.messageBotRequests.push(record);
  const promise=(async()=>{
    let release,child;
    const admission=new Promise(resolve=>{release=resolve;});
    try{
      await team.save();await team.admitBotMessage();
      if(team.stopped||ctx.signal?.aborted)throw Error('PI-bot is stopping.');
      if(source?.cancelled)throw groupWork.stoppedError();if(owner.room)groupWork.assertCurrent(team,owner.room,ctx.groupEpoch??groupWork.epoch(owner.room));
      const options={...(owner.room?{groupEpoch:ctx.groupEpoch??groupWork.epoch(owner.room),replyGroupEpoch:ctx.groupEpoch??groupWork.epoch(owner.room)}:{}),id:record.jobId,messageRequestKey:key,attachments:source?.attachments,referencesText:source?.referencesText,fromBotId:owner.bot.id,fromName:owner.bot.name,replyTo,sourceSessionId:ctx.sessionId,replyRoomId:owner.room?.id,...(parent?{parentJobId:parent.id}:{})};
      let result;
      if(planner){
        // Planner completions have no worker job; never pretend they have a checkpoint.
        const {id,messageRequestKey,...planningOptions}=options;
        result=await team.privateChat(target.id,content,planningOptions);delete record.jobId;record.status='accepted';await team.save();
      }else{
        const edit=new StateEdit();
        await team.save(()=>edit.rollback(),()=>{
          if(team.stopped||ctx.signal?.aborted||!team.state.bots.includes(target)||!team.state.bots.includes(owner.bot)||owner.room&&(!team.state.rooms.includes(owner.room)||!owner.room.members.includes(target.id))||parent&&(parent.cancelled||!team.state.jobs.includes(parent)))throw Error('派发目标已移除或执行已停止。');
          child=team.enqueue(owner.room||null,target,content,undefined,{...options,...(owner.room?{offRound:true}:{})},admission);
          edit.undo.push(()=>{child.cancelled=true;child.status='interrupted';team.state.jobs=team.state.jobs.filter(job=>job!==child);});
          if(parent){const had=parent.childIds?.includes(child.id);team.handoffs.attach(source,child);if(!had)edit.undo.push(()=>{parent.childIds=(parent.childIds||[]).filter(id=>id!==child.id);});}
          edit.set(record,'status','accepted');
        });
        result={jobId:child.id};
      }
      release(true);
      return JSON.stringify({accepted:true,...result,activity:team.handoffs.activity(target),note:owner.room?'Work stays in this group. Results return here.':'End your turn after delegating; all child results return automatically before your final result is delivered upstream.'});
    }catch(error){
      record.status='failed';record.error=team.vault?.redact?team.vault.redact(String(error.message||error)).slice(0,500):'派发未完成，请核对队列。';
      await team.save().catch(()=>{});throw error;
    }finally{release(false);}
  })();
  const admission={signature,promise};team.messageAdmissions.set(admissionKey,admission);
  try{return await promise;}finally{if(team.messageAdmissions.get(admissionKey)===admission)team.messageAdmissions.delete(admissionKey);}
}
module.exports={dispatchMessageBot,delegationStatus,validateRequests,reconcileRequests};
