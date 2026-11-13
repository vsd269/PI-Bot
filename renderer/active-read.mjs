// Acknowledge only the open, visible conversation. Do not overwrite fresh state
// with the older snapshot returned by an asynchronous acknowledgement.
export function createActiveRead({getSelection,getItem,enabled,acknowledge,onChange,getStamp}){
  const pending=new Set(),cooldown=new Map(),seenStamps=new Map();let manual='',closed=false;
  const key=()=>{const s=getSelection();return s?s.kind+':'+s.id:'';};
  const stamp=getStamp||(item=>JSON.stringify([item?.chat?.at(-1)?.id,item?.chat?.at(-1)?.at,item?.log?.at(-1)?.id,item?.log?.at(-1)?.at]));
  function check(){
    if(closed||!enabled())return;const selection=getSelection(),id=key(),item=getItem();
    if(!item?.unread||!id||id===manual)return;
    const seen=stamp(item);
    // A poll begun before the acknowledgement can return unread:true after
    // the save. Suppress that exact already-viewed content, never newer text.
    if(seenStamps.get(id)===seen){item.unread=false;return;}
    if(pending.has(id)||Date.now()<(cooldown.get(id)||0))return;
    pending.add(id);seenStamps.set(id,seen);
    while(seenStamps.size>128)seenStamps.delete(seenStamps.keys().next().value);
    queueMicrotask(()=>{if(!closed&&key()===id&&id!==manual&&getItem()&&stamp(getItem())===seen){getItem().unread=false;onChange();}});
    Promise.resolve().then(()=>acknowledge({...selection})).then(()=>{if(closed)return;const current=getItem();if(key()===id&&id!==manual&&current?.unread&&stamp(current)===seen){current.unread=false;onChange();}},()=>{seenStamps.delete(id);cooldown.set(id,Date.now()+10000);if(!closed&&key()===id&&getItem()){getItem().unread=true;onChange();}}).finally(()=>{pending.delete(id);check();});
  }
  const focus=()=>{manual='';check();},visibility=()=>{if(document.visibilityState==='visible')focus();};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
  return {check,selected(){manual='';check();},manual(target=getSelection()){manual=target?target.kind+':'+target.id:'';seenStamps.delete(manual);},dispose(){closed=true;seenStamps.clear();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);}};
}
