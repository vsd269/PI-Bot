export function createClient(dispatch){
  const queues=[[],[],[]];let draining=false;
  async function drain(){
    if(draining)return;draining=true;
    try{for(;;){const task=queues.find(queue=>queue.length)?.shift();if(!task)break;
      try{task.resolve(await dispatch('plugin.call',{method:task.method,args:task.args}));}catch(error){task.reject(error);}
      // PI's bridge allows 10 calls/s. Preserve its brake, while giving sends
      // priority over the next history/avatar chunk of a background refresh.
      await new Promise(resolve=>setTimeout(resolve,125));
    }}finally{draining=false;}
  }
  const invoke=(method,args,priority)=>new Promise((resolve,reject)=>{queues[priority].push({method,args,resolve,reject});void drain();});
  return async(channel,payload)=>{
    const priority=(['team.private.send','team.group.send','team.view.answer','team.theme','team.prefs','team.capability.attach','team.bot.save','team.bot.delete','team.room.save','team.room.delete'].includes(channel)||channel==='team.microphone'&&['begin','finish','cancel'].includes(payload?.action))?0:channel==='team.state'?2:1;
    const {id}=await invoke('request.start',{channel,payload},priority);let offset=0,json='';
    for(;;){
      const result=await invoke('request.read',{id,offset},priority);
      if(result.pending){await new Promise(resolve=>setTimeout(resolve,300));continue;}
      if(result.error)throw new Error(result.error);
      json+=result.chunk;offset+=result.chunk.length;
      if(result.done)return JSON.parse(json);
    }
  };
}
