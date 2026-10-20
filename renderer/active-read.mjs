// Acknowledge only the open, visible conversation. Do not overwrite fresh state
// with the older snapshot returned by an asynchronous acknowledgement.
export function createActiveRead({getSelection,getItem,enabled,acknowledge,onChange,getStamp}){
  const pending=new Set(),cooldown=new Map();let manual='',closed=false;
  const key=()=>{const s=getSelection();return s?s.kind+':'+s.id:'';};
  const stamp=getStamp||(item=>JSON.stringify([item?.chat?.at(-1)?.id,item?.chat?.at(-1)?.at,item?.log?.at(-1)?.id,item?.log?.at(-1)?.at]));
  function check(){
    if(closed||!enabled())return;const selection=getSelection(),id=key(),item=getItem();
    if(!item?.unread||!id||id===manual||pending.has(id)||Date.now()<(cooldown.get(id)||0))return;
    const seen=stamp(item);pending.add(id);
    Promise.resolve().then(()=>acknowledge({...selection})).then(()=>{if(closed)return;const current=getItem();if(key()===id&&id!==manual&&current?.unread&&stamp(current)===seen){current.unread=false;onChange();}},()=>{cooldown.set(id,Date.now()+10000);}).finally(()=>pending.delete(id));
  }
  const focus=()=>{manual='';check();},visibility=()=>{if(document.visibilityState==='visible')focus();};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
  return {check,selected(){manual='';check();},manual(target=getSelection()){manual=target?target.kind+':'+target.id:'';},dispose(){closed=true;window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);}};
}
