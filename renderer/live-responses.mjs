// Read-only presentation adapter for PI's published preload event channel.
// Durable session reads remain authoritative. No native store imports, client
// patches, credentials, tool approvals or model requests belong here.
import {nativeTargets} from './native-ownership.mjs';
export function createLiveResponses({getState,onChange,onEnded=()=>{},hasPending=()=>false,source=globalThis.piDesktop,now=()=>Date.now()}){
  const turns=new Map();let off,frame=0,closed=false,lastSync=0;
  const notify=()=>{if(!frame&&!closed)frame=setTimeout(()=>{frame=0;if(!closed)onChange();},40);};
  const key=(session,turn)=>session+'\0'+turn;
  function receive(envelope){
    const {sessionId,event,parentToolCallId}=envelope||{};let turnId=envelope?.turnId;
    if(closed||parentToolCallId||typeof sessionId!=='string'||!event)return;
    const state=getState(),jobs=nativeTargets(state);
    // Some PI events omit turnId. Attribute only to a unique, already accepted
    // owned turn, and reject timestamped events from before that admission.
    if(typeof turnId!=='string'){
      const candidates=jobs.filter(j=>j.sessionId===sessionId&&j.turnId);
      if(candidates.length!==1)return;
      const candidate=candidates[0];if(!Number.isFinite(envelope.ts)||envelope.ts<Date.parse(candidate.startedAt||candidate.at||''))return;
      turnId=candidate.turnId;
    }
    const job=jobs.find(j=>j.sessionId===sessionId&&j.turnId===turnId);
    const ended=(state.jobs||[]).find(j=>j.sessionId===sessionId&&j.turnId===turnId&&!['launching','running','waiting'].includes(j.status));
    if(ended&&!job)return;
    if(job&&!['launching','running','waiting'].includes(job.status))return;
    const owned=job||(state.bots||[]).some(b=>Object.values(b.sessions||{}).includes(sessionId));
    // A newly created session can emit before team.state reaches this window.
    // Keep a small, short-lived presentation buffer only during admissions;
    // it cannot be displayed until an exact owned job/turn matches it.
    if(!owned&&!hasPending()&&!jobs.some(j=>['queued','launching'].includes(j.status)))return;
    const id=key(sessionId,turnId);let turn=turns.get(id);
    if(!turn){turn={messages:new Map(),at:now()};turns.set(id,turn);}
    turn.at=now();
    for(const [k,value] of turns)if(now()-value.at>120000&&!jobs.some(j=>key(j.sessionId,j.turnId)===k&&['launching','running','waiting'].includes(j.status)))turns.delete(k);
    if(['message_start','message_update','message_end'].includes(event.type)){
      const msg=event.message;
      if(!msg||msg.role!=='assistant'||msg.parentToolCallId||typeof msg.id!=='string')return;
      // Native PI gives the finished row a durable ID. Replace only its named
      // provisional row, retaining the order of all preceding tool steps.
      const replaced=event.type==='message_end'&&event.replacesMessageId;
      if(replaced&&replaced!==msg.id&&turn.messages.has(replaced)){
        turn.messages=new Map([...turn.messages].filter(([id])=>id!==msg.id).map(([id,text])=>[id===replaced?msg.id:id,text]));
      }
      const previous=turn.messages.get(msg.id)??(event.stream==='delta'?(typeof msg.content==='string'?msg.content:''):'');
      let text=event.type==='message_update'&&event.stream==='delta'
        ?event.resetText?(event.deltaText||''):previous+(event.deltaText||'')
        :typeof msg.content==='string'?msg.content:Array.isArray(msg.content)?msg.content.filter(b=>b.type==='text').map(b=>b.text||'').join('\n'):previous;
      // Reasoning and tool arguments are deliberately never copied.
      if(typeof text!=='string')return;
      turn.messages.set(msg.id,text);
      if(text!==previous)notify();
    }
    if(['turn_end','agent_end','asktool_request','status'].includes(event.type)){
      if(owned)onEnded();
    }
    if(!owned&&now()-lastSync>500){lastSync=now();onEnded();}
  }
  try{const channel=source?.channels?.event?.agentMessage;if(channel&&typeof source.on==='function')off=source.on(channel,receive);}catch{/* Older PI versions retain transcript polling. */}
  return {
    receive,
    progress(job){
      if(!['launching','running','waiting'].includes(job.status))return '';
      const value=turns.get(key(job.sessionId,job.turnId));
      if(!value)return '';
      return [...value.messages.values()].join('\n').replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g,'').replace(/<function=[\w.-]+>[\s\S]*?(?:<\/function>|$)/g,'').trim();
    },
    planning(claim){
      if(!claim||!['submitting','accepted'].includes(claim.status))return '';
      const value=turns.get(key(claim.sessionId,claim.turnId));
      const text=value?[...value.messages.values()].join('\n'):'';
      const match=text.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)/);
      if(!match)return '';
      try{return JSON.parse('"'+match[1].replace(/[\u0000-\u001f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'"');}catch{return '';}
    },
    reconcile(){
      const jobs=nativeTargets(getState());
      for(const [id,turn] of turns){const job=jobs.find(j=>key(j.sessionId,j.turnId)===id);if(job?!['launching','running','waiting'].includes(job.status):now()-turn.at>120000)turns.delete(id);}
    },
    close(){closed=true;clearTimeout(frame);off?.();turns.clear();}
  };
}
