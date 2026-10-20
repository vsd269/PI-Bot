'use strict';
const TERMINAL=new Set(['completed','error','aborted','interrupted','not_started','needs_review']);
class Handoffs{
  constructor(team){this.team=team;}
  find(id){return this.team.state.jobs.find(j=>j.id===id)||this.team.state.rooms.flatMap(r=>r.reports||[]).find(r=>r.id===id);}
  root(job){return job?.handoffRootId?this.find(job.handoffRootId):job;}
  children(job){return (job.childIds||[]).map(id=>this.find(id)).filter(Boolean);}
  pending(job){return this.children(job).filter(j=>!TERMINAL.has(j.status)&&!j.replyDelivered);}
  check(source,targetId){
    let parent=this.root(source);const seen=new Set();
    while(parent&&!seen.has(parent.id)){seen.add(parent.id);if(parent.botId===targetId)throw Error('该 Bot 正在等待这件任务的结果。请结束本回合，结果会自动交回；不要向等待你的上游重复派发。');parent=parent.parentJobId?this.find(parent.parentJobId):null;}
  }
  attach(source,child){const root=this.root(source);if(!root)return;child.parentJobId=root.id;root.childIds??=[];if(!root.childIds.includes(child.id))root.childIds.push(child.id);}
  async settled(job){
    const root=this.root(job);if(!root)return false;
    if(job!==root&&root.cancelled){job.replyDelivered=true;return true;}
    if(job!==root){root.result=job.result||root.result;root.error=job.error;root.status=job.status;root.endedAt=job.endedAt;root.thinking=job.thinking;root.toolEvents=job.toolEvents;job.replyDelivered=true;}
    if(root.cancelled||root.status!=='completed')return false;
    if(!root.childIds?.length)return false;
    if(this.pending(root).length){root.status='waiting_teammates';delete root.endedAt;return true;}
    if(this.children(root).some(child=>!(root.consumedChildren||[]).includes(child.id))){root.status='waiting_teammates';delete root.endedAt;await this.resume(root);return true;}
    const results=this.children(root).map(child=>'['+this.team.botName(child.botId)+' 的交回结果]\n'+(child.result||child.error||child.status||'未记录回复')).join('\n\n');
    root.result=(root.result||'任务已结束，没有文字回复。')+(results?'\n\n'+results:'');
    return false;
  }
  async returned(child){
    if(!child.parentJobId)return false;const parent=this.find(child.parentJobId);
    if(!parent||parent.cancelled||['aborted','error','interrupted','not_started','needs_review'].includes(parent.status)){delete child.parentJobId;return false;}
    const previous=child.replyDelivered;child.replyDelivered=true;try{await this.team.save();}catch(e){child.replyDelivered=previous;throw e;}if(parent.status==='waiting_teammates'&&!this.pending(parent).length)await this.resume(parent);return true;
  }
  async resume(root){
    if(root.status!=='waiting_teammates'||root.cancelled||this.team.stopped||this.pending(root).length)return;
    const children=this.children(root),unread=children.filter(c=>!(root.consumedChildren||[]).includes(c.id));if(!unread.length)return;
    if(this.team.state.jobs.some(j=>j.handoffRootId===root.id&&this.team.active(j)))return;
    const target=this.team.state.bots.find(b=>b.id===root.botId);if(!target)return;
    const text='继续原任务：'+root.task+'\n\n你交给队友的工作已全部交回。核对实际结果后完成原任务；可以继续分派必要的后续工作。最终答复会自动连同队友结果交回原请求者，不要给等待结果的上游发新消息。\n\n'+unread.map(c=>'['+this.team.botName(c.botId)+' · '+(c.status||'completed')+']\n'+(c.result||c.error||'未记录文字回复')).join('\n\n');
    const job=this.team.enqueue(null,target,text,undefined,{attachments:root.attachments,referencesText:root.referencesText,handoffRootId:root.id,isHandoffReply:true,fromBotId:root.fromBotId,fromName:root.fromName});
    root.consumedChildren=[...new Set([...(root.consumedChildren||[]),...unread.map(c=>c.id)])];root.resumeJobId=job.id;await this.team.save();
  }
  async recover(){
    for(const root of this.team.state.jobs.filter(j=>j.status==='waiting_teammates')){
      const continuation=this.find(root.resumeJobId);if(continuation&&['interrupted','error','aborted'].includes(continuation.status)){root.status='needs_review';root.error='任务交接后的续跑被中断。请在恢复中心检查会话后继续，未自动重跑工具。';await this.team.deliverResult(root);continue;}
      await this.resume(root);
    }
  }
  activity(bot){
    const jobs=this.team.state.jobs.filter(j=>j.botId===bot.id),active=jobs.filter(j=>['running','waiting','launching'].includes(j.status)),job=active.find(j=>j.status==='waiting')||active[0],waiting=jobs.filter(j=>j.status==='waiting_teammates');
    const questions=(this.team.state.questions||[]).filter(q=>q.botId===bot.id&&q.status==='pending');
    return {state:job?(job.status==='waiting'?'waiting_approval':job.activityPhase==='compacting'?'context_transition':'working'):waiting.length?'waiting_teammates':bot.planning?'working':'idle',...(job?{jobId:job.id,scope:job.roomId?this.team.state.rooms.find(r=>r.id===job.roomId)?.name||job.roomId:'private',durationMs:job.startedAt?Date.now()-Date.parse(job.startedAt):0,requester:job.fromBotId?this.team.botName(job.fromBotId):'User',tool:job.currentTool||'',task:job.task.slice(0,250)}:{}),waitingFor:[...new Set(waiting.flatMap(j=>this.pending(j).map(c=>this.team.botName(c.botId))))],pendingQuestions:questions.length,unreadMessages:jobs.filter(j=>j.fromBotId&&j.status==='queued').map(j=>({from:this.team.botName(j.fromBotId),workId:j.parentJobId||null}))};
  }
}
module.exports={Handoffs};
