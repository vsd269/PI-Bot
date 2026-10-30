'use strict';
// Credentials live in the encrypted vault, not in configuration. Redact prose
// and execution output without rewriting IDs, model names, paths or Bot names
// when a short credential happens to be part of those configuration values.
const PROSE=new Set(['text','content','task','result','planReply','progress','thinking','error','detail','reason','answer','question','message','summary','before','description','prompt','referencesText','sourceUserContent']);
function cleanRecord(vault,value){
  if(Array.isArray(value))return value.map(v=>cleanRecord(vault,v));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='toolEvents'?vault.clean(v):PROSE.has(key)?vault.clean(v):cleanRecord(vault,v)]));
  return value;
}
function cleanState(vault,state){
  const copy=structuredClone(state);
  const bot=value=>{if(value.chat)value.chat=cleanRecord(vault,value.chat);for(const key of ['memory','legacyMemory'])if(typeof value[key]==='string')value[key]=vault.redact(value[key]);if(value.kickoff)value.kickoff=cleanRecord(vault,value.kickoff);};
  const room=value=>{if(value.log)value.log=cleanRecord(vault,value.log);if(value.reports)value.reports=cleanRecord(vault,value.reports);if(value.pausedRelays)value.pausedRelays=cleanRecord(vault,value.pausedRelays);};
  for(const value of copy.bots||[])bot(value);
  for(const value of copy.rooms||[])room(value);
  for(const key of ['jobs','questions','asides','secretRequests','completions','permissionRequests','diagnostics','learning'])if(copy[key])copy[key]=cleanRecord(vault,copy[key]);
  if(copy.memoryNews)copy.memoryNews=vault.clean(copy.memoryNews);
  for(const task of copy.schedules||[]){if(task.error)task.error=vault.redact(task.error);if(task.runs)task.runs=cleanRecord(vault,task.runs);}
  for(const entry of copy.archives||[]){entry.lines=cleanRecord(vault,entry.lines);entry.questions=cleanRecord(vault,entry.questions);if(entry.item)(entry.kind==='bot'?bot:room)(entry.item);}
  return copy;
}
module.exports={cleanState};
