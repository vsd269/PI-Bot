import {nativeOwners,nativeTargets} from './native-ownership.mjs';
// Use the same published preload channels as PI's own question cards. A native
// answer resumes the original suspended tool; it must never start a new task.
export function createNativeQuestions({getState,getSelection=()=>null,onChange,onError=()=>{},source=globalThis.piDesktop,intervalMs=1500}){
  const entries=new Map(),inflight=new Set();let closed=false,timer,off;
  const channels=source?.channels;
  const available=typeof source?.invoke==='function'&&channels?.invoke?.pendingInteractive&&channels?.invoke?.askToolResolve;
  const key=r=>r.sessionId+'\0'+r.requestId;
  function receive(request){
    const owner=nativeOwners(getState()).get(request?.sessionId);
    if(!owner||typeof request.requestId!=='string'||!Array.isArray(request.questions)||!request.questions.length)return;
    const id=key(request),old=entries.get(id);
    if(old)return;
    const entry={request:structuredClone(request),owner,answers:[],at:new Date().toISOString(),status:'pending'};entries.set(id,entry);onChange();
  }
  async function sync(){
    if(closed||!available)return;
    const state=getState(),owners=nativeOwners(state),selected=getSelection();
    const sessions=new Set(nativeTargets(state).map(t=>t.sessionId));
    for(const [id,owner] of owners)if(selected&&(selected.kind==='room'?owner.roomId===selected.id:!owner.roomId&&owner.botId===selected.id))sessions.add(id);
    for(const [id,entry] of entries)if(!owners.has(entry.request.sessionId)){entries.delete(id);onChange();}
    await Promise.allSettled([...sessions].filter(id=>owners.has(id)&&!inflight.has(id)).map(async sessionId=>{
      inflight.add(sessionId);
      const baseline=[...entries].filter(([,e])=>e.request.sessionId===sessionId&&!e.sending).map(([id])=>id);
      try{
        const result=await source.invoke(channels.invoke.pendingInteractive,{sessionId});
        if(closed||!nativeOwners(getState()).has(sessionId))return;
        const requests=(result?.asks||[]).filter(r=>r.sessionId===sessionId),ids=new Set(requests.map(key));
        // Reconcile against the requests present when this read began. A live
        // request arriving during the read must survive an older empty reply.
        for(const id of baseline)if(!ids.has(id)){entries.delete(id);onChange();}
        requests.forEach(receive);
      }finally{inflight.delete(sessionId);}
    }));
  }
  function list(){
    const owners=nativeOwners(getState());
    return [...entries].filter(([,e])=>owners.has(e.request.sessionId)).flatMap(([id,e])=>e.request.questions.map((q,index)=>({
      id:'native:'+id+':'+index,native:true,nativeRequest:id,nativeIndex:index,...e.owner,
      text:String(q.question||''),options:(q.options||[]).map(o=>typeof o==='string'?{label:o}:o).filter(o=>o?.label),
      multiSelect:q.multiSelect===true,allowCustom:true,at:e.at,
      detail:e.request.questions.length>1?'问题 '+(index+1)+' / '+e.request.questions.length+' · 回答全部问题后继续原任务':'回答后继续原任务',
      status:e.status==='pending'?(index in e.answers?(e.answers[index]===null?'dismissed':'answered'):'pending'):e.status,
      selected:e.answers[index]||[],answer:e.answers[index]?.join('\n')||''
    })));
  }
  async function answer(input){
    const card=list().find(q=>q.id===input.id);if(!card)throw Error('原生问题已结束，请刷新会话。');
    const entry=entries.get(card.nativeRequest),owner=nativeOwners(getState()).get(entry.request.sessionId);
    if(!owner||entry.sending||entry.status!=='pending')throw Error('原生问题已处理或正在提交。');
    const previous=entry.answers.slice();
    if(input.rejectRequest===true)entry.answers=entry.request.questions.map(()=>null);
    else if(input.dismissed===true)entry.answers[card.nativeIndex]=null;
    else {
      const selected=[...new Set(input.selected||[])],custom=String(input.custom??input.text??'').trim();
      if(selected.some(label=>!card.options.some(o=>o.label===label))||!card.multiSelect&&selected.length>1)throw Error('无效的问题选项。');
      const values=[...selected,...(custom?[custom]:[])];if(!values.length||values.join('\n').length>8000)throw Error('请先选择选项或填写回答。');
      entry.answers[card.nativeIndex]=values;
    }
    if(!entry.request.questions.every((_,i)=>i in entry.answers)){onChange();return;}
    entry.sending=true;
    try{
      await source.invoke(channels.invoke.askToolResolve,{sessionId:entry.request.sessionId,requestId:entry.request.requestId,answers:entry.answers});
      if(closed)return;entry.status=entry.answers.every(a=>a===null)?'dismissed':'answered';onChange();
    }catch(error){entry.answers=previous;onChange();throw error;}finally{entry.sending=false;}
  }
  if(available){
    const channel=channels.event?.agentMessage;
    if(channel&&typeof source.on==='function')off=source.on(channel,envelope=>{if(!closed&&!envelope?.parentToolCallId&&envelope?.event?.type==='asktool_request'&&envelope.event.request?.sessionId===envelope.sessionId)receive(envelope.event.request);});
    timer=setInterval(()=>void sync().catch(onError),intervalMs);
  }
  return {list,answer,sync,receive,close(){closed=true;clearInterval(timer);off?.();entries.clear();}};
}
