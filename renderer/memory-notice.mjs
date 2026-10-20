// Same timing and first-open semantics as upstream HeaderPill: old news is
// quiet; a new actual write stretches the header for 3.2 seconds.
export function createMemoryNotice({onChange,now=()=>Date.now()}){
  let initialized=false,timer,closed=false;const entries=new Map();
  return {
    update(news={}){
      for(const [id,entry] of Object.entries(news))if(entries.get(id)?.at!==entry.at)entries.set(id,{...entry,seen:initialized?now():0});
      for(const id of entries.keys())if(!Object.hasOwn(news,id))entries.delete(id);
      initialized=true;
    },
    latest(ids){
      const newest=ids.map(id=>({id,...entries.get(id)})).filter(e=>e.seen>0&&now()-e.seen<3200).sort((a,b)=>b.seen-a.seen)[0];
      clearTimeout(timer);if(newest&&!closed)timer=setTimeout(()=>{if(!closed)onChange();},Math.max(1,newest.seen+3200-now()));
      return newest;
    },
    close(){closed=true;clearTimeout(timer);entries.clear();}
  };
}
