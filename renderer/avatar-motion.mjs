// State names and tool classification follow upstream mark.js.
export function toolState(name){return /^(message_bot|stop_bot|create_bot|update_bot|create_group|update_group|delete_group|post_to_group)$/.test(name)?'sending':/search|fetch|browse|read|grep|glob|list|recall/i.test(name)?'searching':'working';}
export function avatarState(state,id){
  if((state.questions||[]).some(q=>q.botId===id&&q.status==='pending'))return 'alert';
  const jobs=(state.jobs||[]).filter(j=>j.botId===id);
  if(jobs.some(j=>j.status==='waiting'))return 'alert';
  const job=jobs.find(j=>j.status==='running')||jobs.find(j=>j.status==='launching');
  if(job){if(job.currentTool&&['running','pending','waiting'].includes(job.currentToolStatus))return toolState(job.currentTool);return 'thinking';}
  if(state.bots?.find(b=>b.id===id)?.planning)return 'thinking';
  return state.botActivity?.[id]?.state==='waiting_teammates'?'waiting':'idle';
}
// One delegated gaze loop per mounted app; no per-avatar window listeners.
export function attachAvatarMotion(app){
  let frame=0,point=null;const previous=new Map(),settled=new Map();
  const reset=()=>{point=null;for(const node of app.querySelectorAll('[data-gaze]')){node.style.setProperty('--bt-gx','0');node.style.setProperty('--bt-gy','0');}};
  function draw(){frame=0;if(!point)return;for(const node of app.querySelectorAll('[data-gaze]')){const box=node.getBoundingClientRect();if(!box.width||!box.height)continue;const clamp=n=>Math.max(-1,Math.min(1,n)).toFixed(2);node.style.setProperty('--bt-gx',clamp((point.x-box.left-box.width/2)/160));node.style.setProperty('--bt-gy',clamp((point.y-box.top-box.height/2)/160));}}
  const move=event=>{point={x:event.clientX,y:event.clientY};if(!frame)frame=requestAnimationFrame(draw);};
  window.addEventListener('pointermove',move,{passive:true});document.documentElement.addEventListener('pointerleave',reset);
  function paint(id,value){for(const node of app.querySelectorAll('.bt-mark[data-bot-id]'))if(node.dataset.botId===id&&!node.hasAttribute('data-voice-state'))node.dataset.state=value;}
  function sync(state){
    const ids=new Set((state.bots||[]).map(b=>b.id));
    for(const [id,timer] of settled)if(!ids.has(id)){clearTimeout(timer);settled.delete(id);previous.delete(id);}
    for(const id of ids){const next=avatarState(state,id),prior=previous.get(id);previous.set(id,next);
      if(next!=='idle'){clearTimeout(settled.get(id));settled.delete(id);}
      else if(prior&&prior!=='idle'&&prior!=='alert'){clearTimeout(settled.get(id));settled.set(id,setTimeout(()=>{settled.delete(id);paint(id,'idle');},1800));}
      paint(id,next==='idle'&&settled.has(id)?'done':next);
    }
  }
  return {sync,dispose(){cancelAnimationFrame(frame);for(const timer of settled.values())clearTimeout(timer);settled.clear();previous.clear();window.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',reset);}};
}
