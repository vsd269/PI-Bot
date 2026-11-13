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
    const priority=(['team.job.cancel','team.group.stop','team.question.answer','team.pin','team.private.send','team.group.send','team.view.answer','team.theme','team.prefs','team.capability.attach','team.bot.save','team.bot.delete','team.room.save','team.room.delete'].includes(channel)||channel==='team.microphone'&&['begin','finish','cancel'].includes(payload?.action))?0:['team.state','team.apps'].includes(channel)?1:2;
    const request={channel,payload,acceptGzip:typeof DecompressionStream==='function'},encoded=JSON.stringify(request);let started;
    if(new TextEncoder().encode(encoded).length<=60000)started=await invoke('request.start',request,priority);
    else{
      const upload=await invoke('request.upload',{action:'begin',length:encoded.length},priority);
      try{
        for(let offset=0;offset<encoded.length;offset+=10000)await invoke('request.upload',{action:'chunk',id:upload.id,offset,chunk:encoded.slice(offset,offset+10000)},priority);
        started=await invoke('request.upload',{action:'finish',id:upload.id},priority);
      }catch(error){await invoke('request.upload',{action:'cancel',id:upload.id},priority).catch(()=>{});throw error;}
    }
    const {id}=started;let offset=0,json='',encoding;
    for(;;){
      const result=await invoke('request.read',{id,offset},priority);
      if(result.pending){await new Promise(resolve=>setTimeout(resolve,300));continue;}
      if(result.error){void invoke('request.read',{id,release:true},2).catch(()=>{});throw new Error(result.error);}
      encoding=result.encoding||encoding;json+=result.chunk;offset+=result.chunk.length;
      if(result.done){
        if(encoding==='gzip-base64'){
          const bytes=Uint8Array.from(atob(json),c=>c.charCodeAt(0));
          json=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        }
        const value=JSON.parse(json);
        // Keep legacy hosts working: release uses the existing read method.
        void invoke('request.read',{id,release:true},2).catch(()=>{});
        return value;
      }
    }
  };
}
