export function createStateSync(){
  let cursor,state;
  return {
    request(){return {sync:true,cursor};},
    receive(response){
      if(response.state)state=response.state;
      else{
        if(!state)throw Error('会话同步中，请稍后重试。');
        state={...state,...response.patch};
        for(const [key,change] of Object.entries(response.lists||{})){
          const rows=new Map((state[key]||[]).map(row=>[row.id,row]));
          for(const row of change.upsert)rows.set(row.id,row);
          for(const delta of change.update||[]){
            const row={...rows.get(delta.id),...delta.set};
            for(const key of delta.removed||[])delete row[key];
            rows.set(delta.id,row);
          }
          state[key]=change.ids.map(id=>rows.get(id));
          if(state[key].some(row=>!row)){cursor=undefined;throw Error('会话同步中，请稍后重试。');}
        }
        for(const key of response.removed||[])delete state[key];
      }
      cursor=response.cursor;
      // Appearance overlays and UI state may mutate their own objects. Never
      // let those edits change the acknowledged transport baseline.
      return structuredClone(state);
    }
  };
}
