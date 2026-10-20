// Keep local feedback independent of the model/bridge latency. A stable ID
// reconciles acknowledgements and makes retries safe, even if a reply is lost.
export function createOutbox({send,onChange}){
  const entries=new Map();
  async function deliver(entry){
    if(entry.delivery==='sending')return;
    entry.delivery='sending';delete entry.error;onChange();
    try{await send(entry);if(entries.has(entry.id)){entry.delivery='received';onChange();}}
    catch(error){if(entries.has(entry.id)){entry.delivery='failed';entry.error=error.message||String(error);onChange();}}
  }
  return {
    submit(target,content,attachments=[],references=[]){
      const entry={id:crypto.randomUUID(),clientMessageId:null,target:{...target},content,attachments:structuredClone(attachments),references:structuredClone(references),at:new Date().toISOString()};
      entry.clientMessageId=entry.id;entries.set(entry.id,entry);void deliver(entry);return entry;
    },
    retry(id){const entry=entries.get(id);if(entry?.delivery==='failed')void deliver(entry);},
    discard(id){if(entries.get(id)?.delivery!=='failed')return false;entries.delete(id);onChange();return true;},
    reconcile(state){
      const accepted=new Set([...state.rooms.flatMap(r=>r.log||[]),...state.bots.flatMap(b=>b.chat||[]),...state.jobs].map(row=>row.clientMessageId).filter(Boolean));
      for(const id of accepted)entries.delete(id);
    },
    lines(target){return [...entries.values()].filter(e=>e.target.kind===target?.kind&&e.target.id===target?.id).map(e=>({id:e.id,clientMessageId:e.id,who:'User',text:e.content,at:e.at,delivery:e.delivery,error:e.error}));}
  };
}
