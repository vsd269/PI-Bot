// Keep reaction feedback local while the durable write is in flight. Reads
// started before a write finishes cannot undo its feedback when they arrive.
export function createReactions({save,onChange,onError}){
  const entries=new Map();let boundary=0,closed=false;
  const key=(target,lineId)=>JSON.stringify([target.kind,target.id,lineId]);
  const paint=()=>{if(!closed)onChange();};
  async function flush(entry){
    if(entry.running)return;
    entry.running=true;
    let sent;
    do{
      sent=entry.version;const reaction=entry.desired;
      try{
        const result=await save({...entry.target,lineId:entry.lineId,reaction,compact:true});
        if(result?.kind!==entry.target.kind||result.id!==entry.target.id||result.lineId!==entry.lineId||result.reaction!==reaction)throw Error('表情保存结果无效，请重试。');
        entry.confirmed=result.reaction;
        if(sent===entry.version)entry.desired=entry.confirmed;
      }catch(error){
        if(sent===entry.version)entry.desired=entry.confirmed;
        if(!closed)onError(error);
      }
      entry.boundary=++boundary;
      paint();
    }while(sent!==entry.version);
    entry.running=false;
  }
  return {
    toggle(target,line,emoji){
      if(closed||!target?.id||!line?.id)return;
      const id=key(target,line.id);
      let entry=entries.get(id);
      if(!entry){entry={target:{kind:target.kind,id:target.id},lineId:line.id,confirmed:line.reaction||null,desired:line.reaction||null,version:0,running:false,boundary:Infinity};entries.set(id,entry);}
      entry.desired=entry.desired===emoji?null:emoji;entry.version++;
      paint();void flush(entry);
    },
    value(target,line){const entry=target&&entries.get(key(target,line.id));return entry?entry.desired:line.reaction;},
    beginRead(){return boundary;},
    receive(readBoundary){
      for(const [id,entry] of entries)if(!entry.running&&readBoundary>=entry.boundary)entries.delete(id);
    },
    // Finish already accepted choices, but never repaint a disposed view.
    close(){closed=true;},
  };
}
