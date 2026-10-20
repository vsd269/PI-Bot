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
class Schedules{
  constructor(team){this.team=team;this.busy=false;}
  async load(){
    this.team.state.schedules??=[];
    for(const task of this.team.state.schedules)if(task.status==='admitting'){task.status='needs_review';task.enabled=false;task.error='重启中断了派发；请检查聊天后再启用，避免重复执行。';}
    this.timer=setInterval(()=>this.tick().catch(error=>{this.lastError=error.message;}),10000);this.timer.unref?.();
  }
  view(){return {available:true,requiresRunningApp:true,tasks:structuredClone(this.team.state.schedules||[]),lastError:this.lastError};}
  async save(input){
    const targetKind=input.targetKind==='room'?'room':'bot';
    targetKind==='room'?this.team.room(input.targetId):this.team.bot(input.targetId);
    const title=String(input.title||'').trim(),prompt=String(input.prompt||'').trim();
    if(!title||title.length>120||!prompt||prompt.length>32000)throw new Error('请填写任务名称（最多 120 字）和任务内容（最多 32000 字）。');
    const workspace=await this.team.pi.workspace.get();if(!workspace?.path)throw new Error('创建自动化任务前请先选择工作区。');
    const when=validateWhen(input.when);
    const old=input.id?this.team.state.schedules.find(t=>t.id===input.id):null;
    if(input.id&&!old)throw new Error('任务不存在。');
    if(old?.status==='admitting')throw new Error('任务正在派发，请稍后编辑。');
    const task=old||{id:randomUUID(),runs:[]};
    Object.assign(task,{title,prompt,targetKind,targetId:input.targetId,when,workspace:workspace.path,enabled:input.enabled!==false,nextAt:nextTime(when,Date.now()),status:'scheduled'});delete task.error;
    if(!old)this.team.state.schedules.push(task);await this.team.save();return this.view();
  }
  async toggle(id,enabled){const task=this.team.state.schedules.find(t=>t.id===id);if(!task)throw new Error('任务不存在。');if(task.status==='admitting')throw new Error('任务正在派发。');task.enabled=enabled===true;if(task.enabled){task.nextAt=nextTime(task.when,Date.now());if(!task.nextAt)throw new Error('一次性任务的时间已过，请编辑为未来时间。');task.status='scheduled';delete task.error;}await this.team.save();return this.view();}
  async remove(id){const task=this.team.state.schedules.find(t=>t.id===id);if(task?.status==='admitting')throw new Error('任务正在派发。');this.team.state.schedules=this.team.state.schedules.filter(t=>t.id!==id);await this.team.save();return this.view();}
  async tick(now=Date.now()){
    if(this.busy||this.team.stopped)return;this.busy=true;
    try{for(const task of this.team.state.schedules){
      if(!task.enabled||!task.nextAt||task.nextAt>now)continue;
      const target=task.targetKind==='room'?this.team.state.rooms.find(r=>r.id===task.targetId):this.team.state.bots.find(b=>b.id===task.targetId);
      if(!target){task.enabled=false;task.status='error';task.error='目标机器人或群聊已删除。';await this.team.save();continue;}
      const workspace=await this.team.pi.workspace.get();
      if(workspace?.path!==task.workspace){task.status='waiting_workspace';task.error='请切回创建任务时的工作区：'+task.workspace;continue;}
      // Persist admission before dispatch. A crash leaves a visible review item;
      // it never silently submits the same scheduled instruction twice.
      const scheduledAt=task.nextAt;task.status='admitting';await this.team.save();
      try{
        const content='[自动化任务：'+task.title+']\n'+task.prompt;
        if(task.targetKind==='room')await this.team.sendGroup(task.targetId,content,{workspace:task.workspace,scheduleId:task.id});
        else await this.team.privateChat(task.targetId,content,{workspace:task.workspace,scheduleId:task.id});
        task.runs.push({at:new Date(now).toISOString(),scheduledAt,status:'dispatched'});task.runs=task.runs.slice(-100);
        task.status='scheduled';delete task.error;task.nextAt=nextTime(task.when,Math.max(now,scheduledAt));if(!task.nextAt){task.enabled=false;task.status='completed';}
      }catch(error){task.runs.push({at:new Date(now).toISOString(),status:'error',error:error.message});task.enabled=false;task.status='error';task.error=error.message;}
      await this.team.save();
    }}finally{this.busy=false;}
  }
  close(){clearInterval(this.timer);}
}
module.exports={Schedules,validateWhen,nextTime,clockParts};
