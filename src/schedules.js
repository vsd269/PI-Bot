'use strict';
const {randomUUID}=require('node:crypto');

const formatters=new Map();
function clockParts(ms,zone){
  if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  const parts=formatters.get(zone).formatToParts(ms);
  const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${fields.year}-${fields.month}-${fields.day}`,time:`${fields.hour}:${fields.minute}`,day:((new Date(`${fields.year}-${fields.month}-${fields.day}T00:00:00Z`).getUTCDay()+6)%7)+1};
}
function validateWhen(value,now=Date.now()){
  const kind=value?.kind;
  if(kind==='at'){
    const at=Date.parse(value.at);if(!Number.isFinite(at)||at<=now)throw new Error('请选择未来的日期和时间。');
    return {kind,at:new Date(at).toISOString()};
  }
  if(kind==='every'){
    const minutes=Number(value.minutes);if(!Number.isInteger(minutes)||minutes<1||minutes>10080)throw new Error('重复间隔须为 1 分钟至 7 天。');
    return {kind,minutes};
  }
  if(!['daily','weekly'].includes(kind)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time||''))throw new Error('请选择有效的执行时间。');
  const timeZone=value.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone;
  clockParts(now,timeZone);
  const weekdays=[...new Set(value.weekdays||[])].map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=7).sort();
  if(kind==='weekly'&&!weekdays.length)throw new Error('至少选择一个星期。');
  return {kind,time:value.time,timeZone,...(kind==='weekly'?{weekdays}:{})};
}
function nextTime(when,after){
  if(when.kind==='at')return Date.parse(when.at)>after?Date.parse(when.at):null;
  if(when.kind==='every')return after+when.minutes*60000;
  // Walk instants instead of constructing local dates: missing and repeated DST
  // times follow the machine's IANA zone rules without inventing an offset.
  const start=Math.floor(after/60000)*60000+60000;
  const current=clockParts(after,when.timeZone);
  for(let at=start;at<=start+8*86400000;at+=60000){const p=clockParts(at,when.timeZone);if(p.date===current.date&&current.time>=when.time)continue;if(p.time===when.time&&(when.kind==='daily'||when.weekdays.includes(p.day)))return at;}
  throw new Error('无法计算下次执行时间。');
}
const ACTIVE=new Set(['admitting','dispatching','planning','running','queued','waiting_user','waiting_approval','waiting_teammates']);
function trimHistory(task){
  const ordinary=task.runs.filter(r=>['completed','skipped','cancelled','unknown'].includes(r.status));
  if(ordinary.length<=100)return false;
  const keep=new Set(ordinary.slice(-100));task.runs=task.runs.filter(r=>!ordinary.includes(r)||keep.has(r));return true;
}
function runOf(team,id){return (team.state.schedules||[]).flatMap(t=>t.runs||[]).find(r=>r.id===id);}
function markPlan(team,options,status,error){
  const run=runOf(team,options.scheduleRunId);if(!run||!options.schedulePlanId)return;
  const row=(run.plans??=[]).find(p=>p.id===options.schedulePlanId);
  if(row){row.status=status;if(error)row.error=team.vault.redact(String(error.message||error)).slice(0,500);}
}
class Schedules{
  constructor(team){this.team=team;this.busy=false;}
  async load(){
    this.team.state.schedules??=[];
    for(const task of this.team.state.schedules){
      task.runs??=[];
      if(task.status==='admitting'){task.status='needs_review';task.enabled=false;task.error='重启中断了派发；请检查聊天后再启用，避免重复执行。';}
      for(const run of task.runs){
        if(run.id&&(run.status==='admitting'||run.status==='dispatching'||run.plans?.some(p=>p.status==='pending'))){run.status='needs_review';run.error='重启中断了派发或规划确认，没有自动重发。';}
        else if(!run.id&&run.status==='dispatched'){run.status='unknown';run.error='旧版本仅记录派发，最终结果未追踪。';}
      }
    }
  }
  arm(){
    clearTimeout(this.timer);if(this.team.stopped||this.closed)return;
    const next=Math.min(...(this.team.state.schedules||[]).filter(t=>t.enabled&&t.nextAt&&t.status!=='waiting_workspace').map(t=>t.nextAt));
    // A bounded wall-clock check also catches sleep/resume and clock changes.
    const delay=this.busy?1000:Number.isFinite(next)?Math.max(250,Math.min(60000,next-Date.now())):60000;
    this.timer=setTimeout(()=>this.tick().catch(error=>{this.lastError=error.message;}).finally(()=>this.arm()),delay);this.timer.unref?.();
  }
  view(){return {available:true,requiresRunningApp:true,tasks:structuredClone(this.team.state.schedules||[]),lastError:this.lastError,overlapPolicy:'skip'};}
  reconcile(){
    let changed=false;
    for(const task of this.team.state.schedules||[])for(const run of task.runs||[]){
      if(!run.id||!ACTIVE.has(run.status)||!run.dispatched)continue;
      const jobs=this.team.state.jobs.filter(j=>j.scheduleRunId===run.id),ids=new Set(jobs.map(j=>j.id));
      const plans=run.plans||[],batches=(this.team.state.workBatches||[]).filter(b=>b.scheduleRunId===run.id);
      const questions=(this.team.state.questions||[]).filter(q=>ids.has(q.sourceJobId));
      const views=(this.team.state.views||[]).filter(v=>ids.has(v.sourceJobId));
      let status;
      if(plans.some(p=>p.status==='pending'))status='planning';
      else if(jobs.some(j=>j.status==='waiting')||views.some(v=>v.status==='pending'||v.deliveryPending))status='waiting_approval';
      else if(questions.some(q=>q.status==='pending'||q.deliveryPending))status='waiting_user';
      else if(jobs.some(j=>j.status==='waiting_teammates'))status='waiting_teammates';
      else if(jobs.some(j=>['running','launching'].includes(j.status))||batches.some(b=>b.status==='planning'))status='running';
      else if(jobs.some(j=>j.status==='queued'))status='queued';
      else if(jobs.some(j=>['needs_review','interrupted'].includes(j.status))||batches.some(b=>b.status==='needs_review'))status='needs_review';
      else if(plans.some(p=>p.status==='error')||jobs.some(j=>['error','not_started'].includes(j.status)))status='failed';
      else if(plans.some(p=>p.status==='cancelled')||jobs.some(j=>j.status==='aborted'||j.cancelled)||questions.some(q=>q.status==='dismissed')||views.some(v=>v.status==='dismissed'))status='cancelled';
      else if(jobs.some(j=>j.replyTo&&!j.replyDelivered))status='waiting_teammates';
      else if(batches.some(b=>b.status==='running'))status='running';
      else status='completed';
      if(run.status!==status){run.status=status;changed=true;if(!ACTIVE.has(status))run.endedAt=new Date().toISOString();}
      if(status==='failed'||status==='needs_review')run.error=run.error||jobs.find(j=>j.error)?.error||plans.find(p=>p.error)?.error||'任务或结果回收需要核对，请查看原聊天。';
      const linked=jobs.map(j=>j.id);if(JSON.stringify(linked)!==JSON.stringify(run.jobIds||[])){run.jobIds=linked;changed=true;}
    }
    for(const task of this.team.state.schedules||[])if(trimHistory(task))changed=true;
    return changed;
  }
  async save(input){
    const targetKind=input.targetKind==='room'?'room':'bot';targetKind==='room'?this.team.room(input.targetId):this.team.bot(input.targetId);
    const title=String(input.title||'').trim(),prompt=String(input.prompt||'').trim();
    if(!title||title.length>120||!prompt||prompt.length>32000)throw Error('请填写任务名称（最多 120 字）和任务内容（最多 32000 字）。');
    const workspace=await this.team.pi.workspace.get();if(!workspace?.path)throw Error('创建自动化任务前请先选择工作区。');
    const when=validateWhen(input.when),old=input.id?this.team.state.schedules.find(t=>t.id===input.id):null;
    if(input.id&&!old)throw Error('任务不存在。');if(old?.status==='admitting')throw Error('任务正在派发，请稍后编辑。');
    const {StateEdit}=require('./state-edit'),edit=new StateEdit(),task=old||{id:randomUUID(),runs:[]};
    for(const [k,v] of Object.entries({title,prompt,targetKind,targetId:input.targetId,when,workspace:workspace.path,enabled:input.enabled!==false,nextAt:nextTime(when,Date.now()),status:'scheduled'}))edit.set(task,k,v);
    edit.delete(task,'error');if(!old)edit.append(this.team.state,'schedules',task);
    await this.team.commitEdit(edit);this.arm();return this.view();
  }
  async toggle(id,enabled){
    const task=this.team.state.schedules.find(t=>t.id===id);if(!task)throw Error('任务不存在。');if(task.status==='admitting')throw Error('任务正在派发。');
    const {StateEdit}=require('./state-edit'),edit=new StateEdit();edit.set(task,'enabled',enabled===true);
    try{if(enabled){const next=nextTime(task.when,Date.now());if(!next)throw Error('一次性任务的时间已过，请编辑为未来时间。');edit.set(task,'nextAt',next);edit.set(task,'status','scheduled');edit.delete(task,'error');}await this.team.commitEdit(edit);}catch(e){edit.rollback();throw e;}
    this.arm();return this.view();
  }
  async remove(id){const task=this.team.state.schedules.find(t=>t.id===id);if(task?.status==='admitting'||task?.runs?.some(r=>ACTIVE.has(r.status)))throw Error('任务仍在执行或等待，请先停止原任务再删除。');const {StateEdit}=require('./state-edit'),edit=new StateEdit();edit.remove(this.team.state,'schedules',t=>t.id===id);await this.team.commitEdit(edit);this.arm();return this.view();}
  tick(now=Date.now()){if(this.running)return this.running;this.running=this.runTick(now).finally(()=>{this.running=null;});return this.running;}
  async runTick(now=Date.now()){
    if(this.closed||this.busy||this.team.stopped||this.team.storeConflict)return;this.busy=true;
    try{for(const task of this.team.state.schedules){
      if(this.closed||this.team.stopped)break;
      if(!task.enabled||!task.nextAt||task.nextAt>now)continue;
      this.reconcile();
      const scheduledAt=task.nextAt;
      if(task.runs.some(r=>ACTIVE.has(r.status))){task.runs.push({id:randomUUID(),at:new Date(now).toISOString(),scheduledAt,status:'skipped',error:'上一轮尚未结束，本次已跳过，避免重复堆积。'});trimHistory(task);task.nextAt=nextTime(task.when,Math.max(now,scheduledAt));if(!task.nextAt)task.enabled=false;await this.team.save();continue;}
      const target=task.targetKind==='room'?this.team.state.rooms.find(r=>r.id===task.targetId):this.team.state.bots.find(b=>b.id===task.targetId);
      if(!target){task.enabled=false;task.status='error';task.error='目标机器人或群聊已删除。';await this.team.save();continue;}
      const workspace=await this.team.pi.workspace.get();if(workspace?.path!==task.workspace){if(task.status!=='waiting_workspace'){task.status='waiting_workspace';task.error='请切回创建任务时的工作区：'+task.workspace;await this.team.save();}continue;}
      const run={id:randomUUID(),at:new Date(now).toISOString(),scheduledAt,status:'admitting',plans:[]};
      const {StateEdit}=require('./state-edit'),edit=new StateEdit();edit.append(task,'runs',run);edit.set(task,'status','admitting');
      // Admission receipt and stable ID must be durable before any prompt.
      await this.team.commitEdit(edit);
      try{
        const content='[自动化任务：'+task.title+']\n'+task.prompt,options={workspace:task.workspace,scheduleId:task.id,scheduleRunId:run.id};
        if(task.targetKind==='room')await this.team.sendGroup(task.targetId,content,options);else await this.team.privateChat(task.targetId,content,options);
        run.dispatched=true;run.status='running';task.status='scheduled';delete task.error;
        task.nextAt=nextTime(task.when,Math.max(now,scheduledAt));if(!task.nextAt){task.enabled=false;task.status='completed';}
        this.reconcile();
      }catch(error){run.status='needs_review';run.error=this.team.vault.redact(String(error.message||error)).slice(0,1000);task.enabled=false;task.status='error';task.error=run.error;}
      // Never discard active or unacknowledged failure receipts.
      trimHistory(task);
      await this.team.save();
    }}finally{this.busy=false;}
  }
  async close(){this.closed=true;clearTimeout(this.timer);await this.running?.catch(()=>{});}
}
module.exports={Schedules,validateWhen,nextTime,clockParts,runOf,markPlan,ACTIVE};
