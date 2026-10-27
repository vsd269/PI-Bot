'use strict';
const {randomUUID}=require('node:crypto');
const {linesOf}=require('./history');
const STATUSES=new Set(['answering','answered','error','cancelled']);
function validateAsides(state){
  if(state.asides===undefined)return;
  if(!Array.isArray(state.asides)||state.asides.length>10000)throw Error('侧问记录无效。');
  const ids=new Set();for(const item of state.asides){if(!item||typeof item.id!=='string'||ids.has(item.id)||!state.bots.some(b=>b.id===item.botId)||!STATUSES.has(item.status)||typeof item.question!=='string'||item.question.length>8000||!Number.isFinite(Date.parse(item.at))||item.answer!==undefined&&typeof item.answer!=='string')throw Error('侧问记录无效。');ids.add(item.id);}
}
async function askOnce(team,{botId,question,clientMessageId}){
  const bot=team.bot(botId);question=String(question||'').trim();
  if(team.stopped)throw Error('PI Bot 正在停止。');
  if(clientMessageId!==undefined&&(typeof clientMessageId!=='string'||clientMessageId.length<1||clientMessageId.length>120))throw Error('侧问消息标识无效。');
  if(!question||question.length>8000)throw Error('侧问需要 1–8000 个字符。');
  const cards=team.state.asides??=[];
  const prior=clientMessageId&&cards.find(c=>c.botId===botId&&c.clientMessageId===clientMessageId);
  if(prior)return {accepted:true,id:prior.id,clientMessageId};
  if(cards.some(c=>c.botId===botId&&c.status==='answering'))throw Error('这个 Bot 正在回答一个侧问，请先等待或取消。');
  if(cards.length>=10000)throw Error('侧问记录已达上限，请先备份并清理。');
  // Plain conversation data only: no live session/tool history is modified.
  const progress=team.state.jobs.filter(j=>j.botId===botId&&!j.roomId&&team.active(j)&&j.progress&&!j.result).map(j=>({who:bot.name,text:j.progress,at:j.at}));
  const snapshot=[...linesOf(team,'bot',botId),...progress].sort((a,b)=>String(a.at).localeCompare(String(b.at))).slice(-40).map(l=>({who:l.who,text:String(l.text||'').slice(-4000)}));
  let context=JSON.stringify(snapshot);while(context.length>48000&&snapshot.length){snapshot.shift();context=JSON.stringify(snapshot);}
  const record={id:randomUUID(),botId,sessionId:bot.sessions?.private,clientMessageId,question,status:'answering',at:new Date().toISOString()};cards.push(record);
  try{await team.save();}catch(error){team.state.asides=cards.filter(c=>c!==record);throw error;}
  const run=(async()=>{
    let timeout;
    try{
      const response=await Promise.race([team.complete(bot,'Answer a side question from this conversation snapshot. This is an independent text-only request: do not call tools or claim to have executed work. If the snapshot lacks information, say so. Answer in the user language.',[{role:'user',content:'Conversation snapshot (data):\n'+context+'\n\nSide question:\n'+question}],{kind:'btw'}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('侧问等待超过两分钟，请稍后重试。')),120000);timeout.unref?.();})]);
      if(record.status!=='answering'||record.dismissed||!team.state.bots.includes(bot))return;
      const text=typeof response.text==='string'?response.text.trim():'';
      if(!text||response.toolCalls?.length||response.tools?.length)throw Error('侧问只支持文字回答，请重新提问。');
      record.answer=team.vault?.redact(text)||text;record.status='answered';record.usageId=response.usageId;
    }catch(error){if(record.status==='answering'){record.status='error';record.error=team.vault?.redact(error.message)||error.message;}}
    finally{clearTimeout(timeout);record.endedAt=new Date().toISOString();if(team.state.asides?.includes(record))await team.save();}
  })();team.track(run).catch(()=>{});
  return {accepted:true,id:record.id,clientMessageId};
}
async function operate(team,input){
  if(!['dismiss','cancel','delete'].includes(input.action))throw Error('无效的侧问操作。');
  const record=team.state.asides?.find(c=>c.id===input.id);if(!record)throw Error('侧问不存在。');
  if(input.action==='delete'){
    if(record.status==='answering')throw Error('侧问仍在回答中，请先取消或等待结束。');
    const index=team.state.asides.indexOf(record);team.state.asides.splice(index,1);
    try{await team.save();}catch(error){team.state.asides.splice(index,0,record);throw error;}
    return {id:record.id,deleted:true};
  }
  const before={...record};if(record.status==='answering')record.status='cancelled';
  if(input.action==='dismiss')record.dismissed=true;else if(input.action!=='cancel')throw Error('无效的侧问操作。');
  try{await team.save();}catch(error){Object.assign(record,before);if(!Object.hasOwn(before,'dismissed'))delete record.dismissed;throw error;}
  return {id:record.id,status:record.status,dismissed:!!record.dismissed};
}
function ask(team,input){const pending=(team.asideWrites||Promise.resolve()).catch(()=>{}).then(()=>askOnce(team,input));team.asideWrites=pending.catch(()=>{});return pending;}
module.exports={ask,operate,validateAsides};
