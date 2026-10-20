// Keep previews through stale snapshots and commit the newest choice after any
// in-flight save. Appearance requests never carry the model or settings form.
export function createAppearanceSaver({save,onSaved,onError,delayMs=180}){
  const pending=new Map(),overrides=new Map();let timer,running,closed=false;
  function flush(){
    clearTimeout(timer);if(running)return running;
    running=(async()=>{
      while(pending.size){
        const [botId,item]=pending.entries().next().value;
        try{const result=await save({botId,...item.patch});if(pending.get(botId)===item){pending.delete(botId);onSaved?.(result);}}
        catch(error){if(pending.get(botId)===item){pending.delete(botId);overrides.delete(botId);onError?.(error);}}
      }
    })().finally(()=>{running=null;});
    return running;
  }
  return {
    choose(botId,patch){if(closed)return;const item={patch:{...overrides.get(botId),...patch}};pending.set(botId,item);overrides.set(botId,item.patch);clearTimeout(timer);timer=setTimeout(flush,delayMs);},
    overlay(state){for(const [id,patch] of overrides){const bot=state.bots.find(b=>b.id===id);if(!bot)continue;const matches=Object.entries(patch).every(([key,value])=>JSON.stringify(bot[key]??null)===JSON.stringify(value??null));if(!pending.has(id)&&matches)overrides.delete(id);else Object.assign(bot,patch);}return state;},
    flush,
    close(){closed=true;return flush();},
  };
}
