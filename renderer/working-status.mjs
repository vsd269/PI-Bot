import {el} from './dom.mjs';

const active=new Set(['queued','launching','running','waiting','waiting_teammates']);
const tools={read:'正在读取文件',read_file:'正在读取文件',write:'正在写入文件',write_file:'正在写入文件',edit:'正在修改文件',apply_patch:'正在修改文件',bash:'正在执行命令',shell:'正在执行命令',exec_command:'正在执行命令',web_search:'正在搜索资料',message_bot:'正在联系队友'};
export function workingLabel(job){
  if(job.status==='waiting')return '等待你的批准';
  if(job.status==='waiting_teammates')return '等待队友交回结果';
  if(job.status==='queued')return '正在排队';
  if(job.status==='launching')return '正在准备';
  const phases={planning:'正在安排分工',thinking:'正在仔细思考',reasoning:'正在仔细思考',compacting:'正在整理上下文',recovering:'正在恢复会话',retrying:'正在等待重试','waiting-subagents':'正在等待子任务'};
  if(phases[job.activityPhase])return phases[job.activityPhase];
  if(job.currentTool&&['running','pending','waiting'].includes(job.currentToolStatus))return tools[job.currentTool.toLowerCase()]||'正在调用工具';
  if(job.progress)return '正在回复';
  return '正在处理';
}
export function createWorkingStatus({transcript,avatar}){
  const node=el('div','','pi-working-status');node.setAttribute('role','status');let key='';
  return {update(state,selection,{pending=false,liveProgress=()=>''}={}){
    const room=selection?.kind==='room'?state.rooms.find(r=>r.id===selection.id):null;
    const jobs=state.jobs.filter(j=>active.has(j.status)&&(room?j.roomId===room.id:selection?.kind==='bot'&&j.botId===selection.id&&!j.roomId));
    const rank={waiting:0,running:1,launching:2,queued:3,waiting_teammates:4},seen=new Set();
    const rows=jobs.sort((a,b)=>rank[a.status]-rank[b.status]).filter(j=>{if(seen.has(j.botId))return false;seen.add(j.botId);return true;}).map(job=>({bot:state.bots.find(b=>b.id===job.botId),job})).filter(r=>r.bot);
    if(room?.planning&&!rows.some(r=>r.bot.id===room.adminId)){const admin=state.bots.find(b=>b.id===room.adminId);if(admin)rows.unshift({bot:admin,job:{status:'running',activityPhase:'planning'}});}
    if(!room&&!rows.length&&pending){const bot=state.bots.find(b=>b.id===selection?.id);if(bot)rows.push({bot,job:{status:'queued'}});}
    const next=JSON.stringify(rows.map(r=>[r.bot.id,r.bot.avatar,r.bot.color,r.bot.name,workingLabel({...r.job,progress:liveProgress(r.job)||r.job.progress})]));
    if(next!==key){key=next;node.replaceChildren();for(const row of rows){const line=el('div','','pi-working-line'),label=workingLabel({...row.job,progress:liveProgress(row.job)||row.job.progress});line.append(avatar(row.bot,28,false,false),el('span',(room?row.bot.name+' · ':'')+label,'pi-working-label'));line.title=label+(row.job.currentTool?' · '+row.job.currentTool:'');node.append(line);}}
    if(rows.length)transcript.append(node);else node.remove();
  },dispose(){node.remove();}};
}
