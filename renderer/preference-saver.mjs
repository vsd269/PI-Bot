// Paint preferences immediately. Keep newer choices over in-flight saves and
// stale state refreshes, and undo only a failed choice, never the chat state.
export function createPreferenceSaver({getState,save,onChange,onBoundary}){
  const overrides=new Map(),confirmed=new Map();let pending,running,serial=0,closed=false;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function overlay(state){state.prefs={...state.prefs};for(const [key,item] of overrides)state.prefs[key]=item.value;return state;}
  function paint(){if(closed)return;overlay(getState());onChange();}
  function flush(){
    if(running)return;
    running=true;
    void (async()=>{
      while(pending){
        const item=pending;pending=null;
        try{
          const result=await save({...item.patch,compact:true});
          for(const key of Object.keys(item.patch)){
            const value=result.prefs[key];confirmed.set(key,{had:Object.hasOwn(result.prefs,key),value});
            const latest=overrides.get(key);if(latest?.serial===item.versions[key]){latest.value=value;latest.pending=false;}
          }
          for(const waiter of item.waiters)waiter.resolve(result);
        }catch(error){
          for(const key of Object.keys(item.patch))if(overrides.get(key)?.serial===item.versions[key]){
            overrides.delete(key);const before=confirmed.get(key),prefs=getState().prefs??={};
            if(before?.had)prefs[key]=before.value;else delete prefs[key];
          }
          for(const waiter of item.waiters)waiter.reject(error);
        }finally{if(!closed){onBoundary?.();paint();}}
      }
      running=false;
    })();
  }
  return {
    choose(patch){
      if(closed)return Promise.reject(Error('设置页面已关闭。'));
      const prefs=getState().prefs||{},version=++serial;
      pending??={patch:{},versions:{},waiters:[]};
      for(const [key,value] of Object.entries(patch)){
        if(!overrides.has(key))confirmed.set(key,{had:Object.hasOwn(prefs,key),value:prefs[key]});
        overrides.set(key,{value,serial:version,pending:true});pending.patch[key]=value;pending.versions[key]=version;
      }
      const result=new Promise((resolve,reject)=>pending.waiters.push({resolve,reject}));
      onBoundary?.();paint();flush();return result;
    },
    overlay,
    receive(state){
      for(const [key,item] of overrides)if(!item.pending&&same(state.prefs?.[key],item.value))overrides.delete(key);
      return overlay(state);
    },
    close(){closed=true;},
  };
}
