import {morphWidth,menuVisible} from './interaction-motion.mjs';
import {el} from './dom.mjs';
import {avatarState} from './avatar-motion.mjs';
const ACTIVE=['queued','launching','running','waiting','waiting_teammates'];
const rank={waiting:0,running:1,launching:2,queued:3,waiting_teammates:4};
const toolWords={read:'读取文件',Read:'读取文件',write:'写入文件',Write:'写入文件',edit:'修改文件',Edit:'修改文件',bash:'运行命令',Bash:'运行命令',shell:'运行命令',web_search:'搜索资料',message_bot:'联系成员',read_group_chat:'查看群聊',read_own_chat:'查看私聊'};
const phaseWords={starting:'正在启动',preparing:'准备执行',compacting:'整理上下文',recovering:'恢复会话',retrying:'等待重试','waiting-subagents':'等待子任务完成'};
export function activityLabel(job){
  if(!job)return '空闲';
  if(job.status==='waiting')return '等待你的批准';
  if(job.status==='waiting_teammates')return '等待队友交回结果';
  if(job.status==='queued')return '排队等待';
  if(job.status==='launching')return '正在启动';
  if(phaseWords[job.activityPhase])return phaseWords[job.activityPhase];
  if(job.currentTool&&['running','pending','waiting'].includes(job.currentToolStatus))return (toolWords[job.currentTool]||'使用 '+job.currentTool)+(job.toolCalls?' · '+job.toolCalls+' 次工具调用':'');
  const progress=String(job.progress||'').replace(/\s+/g,' ').trim();
  return progress?progress.slice(-120):'正在处理任务';
}
export function memberWork(state,room){
  return room.members.map(id=>{
    const active=state.jobs.filter(j=>j.botId===id&&ACTIVE.includes(j.status));
    const here=active.filter(j=>j.roomId===room.id).sort((a,b)=>rank[a.status]-rank[b.status]);
    const job=here[0]||active.sort((a,b)=>rank[a.status]-rank[b.status])[0];
    return {id,bot:state.bots.find(b=>b.id===id),job,here:here.length>0,queued:here.filter(j=>j.status==='queued').length};
  }).filter(entry=>entry.bot);
}
export function createMemberDock({composer,avatar,openGroup}){
  const dock=el('button','','pi-member-dock');dock.type='button';dock.hidden=true;composer.prepend(dock);let key='';
  return {render(state,selection){
    const room=selection?.kind==='room'?state.rooms.find(r=>r.id===selection.id):null;
    const entries=room?memberWork(state,room).filter(e=>e.here):state.jobs.filter(j=>j.botId===selection?.id&&j.roomId&&ACTIVE.includes(j.status)).map(job=>({id:job.botId,bot:state.bots.find(b=>b.id===job.botId),job,room:state.rooms.find(r=>r.id===job.roomId)})).filter(e=>e.bot&&e.room);
    const sorted=entries.sort((a,b)=>rank[a.job.status]-rank[b.job.status]),next=JSON.stringify([selection,sorted.map(e=>[e.id,e.bot.name,e.bot.avatar,e.bot.color,e.room?.name,e.job.id,e.job.status,e.job.activityPhase,e.job.currentTool,e.job.currentToolStatus,e.job.toolCalls,e.job.progress])]);
    if(next===key)return;const previousWidth=dock.getBoundingClientRect().width;key=next;if(!sorted.length){menuVisible(dock,false,{delay:160});return;}menuVisible(dock,true);dock.replaceChildren();
    const faces=el('span','','pi-member-faces');for(const entry of sorted.slice(0,3))faces.append(avatar(entry.bot,20,avatarState(state,entry.bot.id),false));
    const asks=sorted.filter(e=>e.job.status==='waiting'),workers=sorted.filter(e=>e.job.status!=='waiting'),copy=el('span','','pi-member-dock-copy');
    if(asks.length)copy.append(el('span',(room?'':'在 '+asks[0].room.name+' · ')+asks.slice(0,2).map(e=>e.bot.name).join('、')+(asks.length>2?' 等 '+asks.length+' 位':'')+' 等待你的批准','pi-member-waiting'));
    if(workers.length){const first=workers[0];copy.append(el('span',(room?first.bot.name:'在 '+first.room.name)+' · '+activityLabel(first.job)+(workers.length>1?' +'+(workers.length-1):'')));}
    dock.append(faces,copy,el('span','›'));morphWidth(dock,()=>{},previousWidth);dock.setAttribute('aria-label',room?'查看群聊工作状态':'查看正在执行的群聊');
    dock.onclick=()=>openGroup(room?.id||sorted[0].room.id);
  },dispose(){menuVisible(dock,false,{immediate:true});for(const animation of dock.getAnimations())animation.cancel();dock.remove();}};
}
