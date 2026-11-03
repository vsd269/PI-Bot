'use strict';
const {createHash}=require('node:crypto');
const path=require('node:path');
const failure=new Set(['error','interrupted','needs_review','not_started']);
class Attention{
  constructor(team){this.team=team;}
  rows(){
    const t=this.team,rows=[],push=(kind,category,item,title,detail,extra={})=>rows.push({id:kind+':'+item.id,kind,category,sourceId:item.id,botId:item.botId,roomId:item.roomId,title:String(title||'').slice(0,180),detail:t.vault.redact(String(detail||'')).slice(0,500),at:item.endedAt||item.at||'',...extra});
    for(const q of t.state.questions||[])if(q.status==='pending')push('question','needs',q,t.botName(q.botId)+' 正在等你回答',q.text);
    for(const q of t.state.questions||[])if(q.deliveryPending&&q.deliveryError)push('answer','issues',q,'回答尚未交给 Bot',q.deliveryError,{sessionId:q.sessionId});
    for(const v of t.state.views||[])if(v.status==='pending')push('view','needs',v,v.title,'打开原聊天回答这张交互卡片。');
    for(const p of t.state.learning?.proposals||[])if(['pending','applying','conflict'].includes(p.status))push('proposal','needs',p,p.kind==='skill'?'工作经验建议':'项目规则建议',p.reason);
    for(const r of t.state.secretRequests||[])if(r.status==='pending')push('secret','needs',r,'需要配置密钥',r.reason);
    for(const j of t.state.jobs){
      if(j.toolWarning)push('tool_loop','issues',j,t.botName(j.botId)+' 的工具重复失败',j.toolWarning.tool+' · '+j.toolWarning.count+' 次：'+j.toolWarning.message,{sessionId:j.sessionId,active:t.active(j)});
      if(j.status==='waiting')push('approval','needs',j,t.botName(j.botId)+' 等待原生审批','请打开 PI 原生会话处理；此页面不能代替宿主审批。',{sessionId:j.sessionId});
      else if(failure.has(j.status))push('job','issues',j,t.botName(j.botId)+' 的任务需要核对',j.error||j.status,{sessionId:j.sessionId,errorCode:j.errorCode||'unknown',task:t.vault.redact(String(j.task||'')).slice(0,300)});
      else if(j.deliveryError&&!j.replyDelivered)push('delivery','issues',j,'结果尚未交回',j.deliveryError,{sessionId:j.sessionId});
      else if(j.status==='completed'&&!j.handoffRootId)push('completed','done',j,t.botName(j.botId)+' 已结束回合','执行结束；尚未独立验收成果。',{sessionId:j.sessionId,verification:'not_checked'});
    }
    for(const wait of t.state.fileWaits||[])if(wait.status==='error')push('file_wait','issues',wait,'文件等待需要核对',wait.error);
    for(const task of t.state.schedules||[])for(const run of task.runs||[])if(['failed','needs_review'].includes(run.status))push('schedule_run','issues',{...run,botId:task.targetKind==='bot'?task.targetId:undefined,roomId:task.targetKind==='room'?task.targetId:undefined},'自动化“'+task.title+'”需要核对',run.error||'执行状态尚未确认。');
    for(const batch of t.state.workBatches||[])if(batch.status==='needs_review')push('batch','issues',batch,'群聊结果回收需要核对',batch.error||'总控续跑状态未确认；未自动重新提交。');
    for(const room of t.state.rooms)if(room.planningClaim?.status==='needs_review'&&!(t.state.workBatches||[]).some(b=>b.planningId===room.planningClaim.planningId&&b.status==='needs_review'))push('planning','issues',{...room.planningClaim,roomId:room.id},'管理员规划需要核对','重启中断了规划，未自动再次提交。',{sessionId:room.planningClaim.sessionId});
    if(t.storeConflict)push('store','issues',{id:'team',at:t.storeConflict.at},'团队数据出现外部修改','双方版本已保留；请核对后选择保留当前插件数据。自动派发已暂停。',{localCopy:path.join(t.data,t.storeConflict.local),externalCopy:t.storeConflict.external?path.join(t.data,t.storeConflict.external):'外部文件已被删除'});
    for(const [i,d] of (t.state.diagnostics||[]).entries())push('diagnostic','issues',{id:createHash('sha256').update(JSON.stringify([i,d.at,d.message])).digest('hex').slice(0,24),at:d.at},'后台整理未完成',d.message);
    return rows.map(row=>({...row,version:createHash('sha256').update(JSON.stringify(row)).digest('hex')}));
  }
  list({category='needs',offset=0,limit=20}={}){
    if(!['needs','issues','done','all'].includes(category)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>30)throw Error('待处理分页参数无效。');
    const receipts=this.team.state.attentionReceipts||[],all=this.rows().filter(r=>!receipts.some(a=>a.id===r.id&&a.version===r.version));
    const counts=Object.fromEntries(['needs','issues','done'].map(k=>[k,all.filter(r=>r.category===k).length]));
    const rows=all.filter(r=>category==='all'||r.category===category).sort((a,b)=>String(b.at).localeCompare(String(a.at))||a.id.localeCompare(b.id));
    return {counts,total:rows.length,rows:rows.slice(offset,offset+limit),next:offset+limit<rows.length?offset+limit:null,note:'自动重试默认关闭；已查看不代表已修复或验收通过。'};
  }
  async operation(input={}){
    if(!input.action||input.action==='list')return this.list(input);
    if(input.action==='resolve_store'){
      if(input.confirm!==true)throw Error('需要先确认保留当前插件数据，外部版本会另存。');
      return this.team.resolveStoreConflict();
    }
    if(input.action!=='seen')throw Error('未知的待处理操作。');
    const row=this.rows().find(r=>r.id===input.id&&r.version===input.version);if(!row)throw Error('该项目状态已变化，请刷新后重试。');
    if(row.category==='needs'||row.kind==='store')throw Error('请先处理此项目，不能仅标为已查看。');
    const {StateEdit}=require('./state-edit'),edit=new StateEdit();edit.set(this.team.state,'attentionReceipts',[...(this.team.state.attentionReceipts||[]).filter(r=>r.id!==row.id),{id:row.id,version:row.version,at:new Date().toISOString()}].slice(-2000));await this.team.commitEdit(edit);return {saved:true};
  }
}
module.exports={Attention};
