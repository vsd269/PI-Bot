'use strict';
const {randomUUID}=require('node:crypto');
const recoverable=new Set(['interrupted','needs_review','error','aborted','not_started']);
class Recovery{
  constructor(team){this.team=team;this.locks=new Map();this.scopes=new Set();}
  list(){return {jobs:this.team.state.jobs.filter(j=>recoverable.has(j.status)||['running','waiting'].includes(j.status)).slice(-100).reverse().map(j=>({id:j.id,botId:j.botId,botName:this.team.botName(j.botId),roomId:j.roomId,task:j.task,status:j.status,error:j.error,at:j.at,sessionId:j.sessionId,retryJobId:j.retryJobId})),note:'先核对原生记录。接回运行中的任务不会再次提交；继续／重试会创建新任务，可能再次执行部分操作，请先检查原来的输出。'};}
  job(id){const job=this.team.state.jobs.find(j=>j.id===id);if(!job)throw Error('任务不存在。');return job;}
  async inspect(job){
    if(!job.sessionId)return {inputFound:false,nativeRunning:false,canRetry:true,note:'任务没有关联原生会话。'};
    try{const status=(await this.team.invoke('agent/getStatus',[job.sessionId])).status;if(!status)throw Error('PI 没有返回运行状态。');const evidence=await this.team.inspectOnce(job);return {inputFound:!evidence.ambiguous,nativeRunning:Boolean(status.isRunning),turnId:status.currentTurnId,ownRunning:Boolean(status.isRunning&&!evidence.ambiguous&&evidence.isLatestInput&&(job.turnId?status.currentTurnId===job.turnId:Boolean(status.currentTurnId))),resultFound:Boolean(evidence.text||evidence.tools?.length),result:this.team.vault.redact(evidence.text||'').slice(-16000),toolCalls:evidence.tools?.length||0,canRetry:!status.isRunning,note:evidence.ambiguous?'在限定的会话记录范围内没有找到原任务；请打开原生会话核查。':status.isRunning?'原生会话仍在运行；请勿重复提交。':'原生会话已空闲，可接回结果或手动继续。'};}catch(error){return {unavailable:true,canRetry:false,note:'暂时无法核对 PI 原生会话：'+this.team.vault.redact(error.message)};}
  }
  async operation(input){if(input.action==='list'||!input.action)return this.list();const job=this.job(input.jobId);if(input.action==='inspect')return this.inspect(job);
    if(!['adopt','continue','retry'].includes(input.action))throw Error('无效的恢复操作。');
    if(this.locks.has(job.id))return this.locks.get(job.id);
    const keys=['bot:'+job.botId,...(job.roomId?['room:'+job.roomId]:[])];if(keys.some(k=>this.scopes.has(k)))throw Error('该 Bot 或群聊正在处理另一项恢复，请稍后再试。');keys.forEach(k=>this.scopes.add(k));const run=this.run(job,input);this.locks.set(job.id,run);try{return await run;}finally{this.locks.delete(job.id);keys.forEach(k=>this.scopes.delete(k));}
  }
  async run(job,input){
    const team=this.team;if(team.stopped)throw Error('PI-bot 正在停止。');
    if(job.retryJobId)return {jobId:job.retryJobId,alreadyAccepted:true};
    if(!recoverable.has(job.status)&&!['running','waiting'].includes(job.status))throw Error('这个任务已经结束，无需恢复。');
    const status=await this.inspect(job);
    if(input.action==='adopt'){
      if(status.unavailable||!status.inputFound)throw Error(status.note);
      if(status.nativeRunning){
        if(!status.ownRunning)throw Error('无法确定当前原生回合属于此任务，请打开原生会话核对。');
        if(team.state.jobs.some(j=>j.id!==job.id&&j.botId===job.botId&&team.active(j)))throw Error('该 Bot 已有其他活动任务，请先等待或中断。');
        job.turnId=status.turnId;job.status='running';delete job.error;
        if(!team.waiters.has(job.id)){const waiting=new Promise(resolve=>team.waiters.set(job.id,resolve));team.memberChains.set(job.botId,waiting);const room=team.state.rooms.find(r=>r.id===job.roomId);if(room?.executionMode==='serial'&&!job.offRound)team.roomExecutionChains.set(room.id,waiting);}
        await team.save();return {jobId:job.id,status:'running',reattached:true};
      }
      if(!status.resultFound)throw Error('原生记录还没有结果；可打开原生会话检查后选择继续或重试。');
      // Adopt only committed evidence; never send reminders or trigger delegation.
      const prior=job.status;job.status='running';await team.settle(job,'completed',{recoveryOnly:true});job.recoveredFrom=prior;await team.save();return {jobId:job.id,status:job.status};
    }
    if(input.confirm!==true)throw Error('继续或重试可能重复部分操作，需要先在恢复中心确认。');
    if(!status.canRetry)throw Error(status.note);
    if(team.active(job))throw Error('任务仍处于活动状态，请等待结果或先中断。');
    const bot=team.bot(job.botId);if(team.state.jobs.some(j=>j.botId===bot.id&&team.active(j)))throw Error('该 Bot 还有活动任务，请等待完成。');
    const room=job.roomId?team.room(job.roomId):null;
    if(room&&team.roomBusy(room))throw Error('群聊还有其他任务，请先等待整轮结束。');
    const suffix=input.action==='continue'?'\n\n用户已要求接续中断任务。先检查会话历史、已生成的文件与工具结果，从尚未完成的步骤继续；不要重复已完成的操作。以下旧结果只是参考资料：\n'+String(status.result||job.result||'尚无保存结果').slice(-12000):'\n\n用户确认重新尝试此任务。先检查原来的输出，避免重复不可重复的操作。';
    const options={retryOf:job.id,recoveryKind:input.action,attachments:job.attachments,referencesText:job.referencesText,sourceUserContent:job.sourceUserContent,offRound:true,...(job.workspace?{workspace:job.workspace}:{})};
    // Reserve an ID before enqueue; double-clicks return the same admitted task.
    const nextId=randomUUID();job.retryJobId=nextId;job.retryRequestedAt=new Date().toISOString();
    try{await team.save();const next=team.enqueue(room,bot,String(job.task).slice(0,18000)+suffix,undefined,{...options,id:nextId});await team.save();return {jobId:next.id,status:next.status};}catch(error){if(!team.state.jobs.some(j=>j.id===nextId))delete job.retryJobId;await team.save();throw error;}
  }
}
module.exports={Recovery};
