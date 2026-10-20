const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function panelCapture(call){
  // Serialize begin/abort so a late old begin cannot steal a resumed session.
  let startup=Promise.resolve(),release=Promise.resolve();
  return async({botId,signal,onTranscribing,realtime=false}={})=>{
    const previous=startup;let unlock;startup=new Promise(resolve=>unlock=resolve);
    let id='',ended=false,level=0,partial='',polling=false,error,lastRead=0;
    const cancel=()=>{if(!id)return release;const recordId=id;id='';release=call('team.microphone',{action:'cancel',id:recordId}).catch(()=>{});return release;};
    const abort=()=>{ended=true;void cancel();};
    const read=async()=>{
      if(signal?.aborted||!id)throw Error('录音已取消。');
      const value=await call('team.microphone',{action:'read',id});
      if(signal?.aborted||!id)throw Error('录音已取消。');
      level=value.level||0;partial=value.partial||'';
      if(value.error)throw Error(value.error);
      if(value.status==='cancelled')throw Error('录音已取消。');return value;
    };
    try{
      await previous;await release;if(signal?.aborted)throw Error('录音已取消。');
      signal?.addEventListener('abort',abort,{once:true});
      ({id}=await call('team.microphone',{action:'begin',botId,realtime,deviceId:localStorage.getItem('pi-bot.microphone-native')||''}));
      if(signal?.aborted||ended){await cancel();throw Error('录音已取消。');}
      for(const start=Date.now();;){const value=await read();if(value.status==='listening')break;if(Date.now()-start>30000)throw Error('麦克风开启超时，请检查录音设备后重试。');await delay(300);}
    }catch(e){signal?.removeEventListener('abort',abort);await cancel();throw e;}finally{unlock();}
    const refresh=async()=>{
      if(ended||polling||Date.now()-lastRead<100)return;polling=true;lastRead=Date.now();
      try{const value=await read();if(!ended&&['transcribing','done'].includes(value.status))onTranscribing?.();}catch(e){if(!ended)error=e;}finally{polling=false;}
    };
    return {
      partial:()=>partial,echoCancellation:false,
      level(){void refresh();if(error)throw error;return level;},
      cancel(){signal?.removeEventListener('abort',abort);abort();},
      async finish(){
        if(ended)return null;ended=true;
        try{
          await call('team.microphone',{action:'finish',id});
          for(const start=Date.now();;){const value=await read();if(value.status==='done'){id='';return {transcript:value.text||''};}if(Date.now()-start>110000)throw Error('录音转写超时，请重新尝试。');await delay(300);}
        }catch(e){await cancel();throw e;}finally{signal?.removeEventListener('abort',abort);}
      },
    };
  };
}
