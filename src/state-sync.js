'use strict';
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const collections=new Set(['bots','rooms','jobs']);

// Cache fingerprints only. Every delta is against the requesting window's
// exact cursor, so concurrent windows and lost replies cannot mix baselines.
function createStateSync(){
  const cache=new Map();
  return (state,cursor)=>{
    const fields={},rows={};
    for(const [key,value] of Object.entries(state)){
      if(value===undefined)continue;
      fields[key]=hash(value);
      if(collections.has(key))rows[key]=new Map(value.map(row=>[row.id,{hash:hash(row),fields:Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined).map(([k,v])=>[k,hash(v)]))}]));
    }
    const next=hash(fields),prior=cache.get(cursor);
    cache.set(next,{fields,rows});
    while(cache.size>8)cache.delete(cache.keys().next().value);
    if(!prior)return {cursor:next,state};
    const patch={},lists={};
    for(const [key,value] of Object.entries(state)){
      if(!Object.hasOwn(fields,key)||fields[key]===prior.fields[key])continue;
      if(rows[key]){
        const upsert=[],update=[];
        for(const row of value){
          const old=prior.rows[key]?.get(row.id),current=rows[key].get(row.id);
          if(!old){upsert.push(row);continue;}
          if(old.hash===current.hash)continue;
          update.push({id:row.id,set:Object.fromEntries(Object.entries(row).filter(([k,v])=>v!==undefined&&current.fields[k]!==old.fields[k])),removed:Object.keys(old.fields).filter(k=>!Object.hasOwn(current.fields,k))});
        }
        lists[key]={ids:value.map(row=>row.id),upsert,update};
      }else patch[key]=value;
    }
    return {cursor:next,patch,lists,removed:Object.keys(prior.fields).filter(key=>!Object.hasOwn(fields,key))};
  };
}
module.exports={createStateSync};
