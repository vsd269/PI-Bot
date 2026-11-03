'use strict';
const {randomUUID}=require('node:crypto');
const {admit}=require('./work-admission');
const groupWork=require('./group-stop');
function normalizeQuestion(args){
  const text=String(args.question||'').trim();if(!text||text.length>4000)throw Error('Question must have 1–4000 characters.');
  const rich=Array.isArray(args.options);
  const options=(rich?args.options:Array.isArray(args.choices)?args.choices:[]).map(o=>typeof o==='string'?{label:o}:o||{}).map(o=>({label:String(o.label||'').trim().slice(0,500),...(o.description?{description:String(o.description).trim().slice(0,2000)}:{})})).filter(o=>o.label).filter((o,i,a)=>a.findIndex(v=>v.label===o.label)===i).slice(0,rich?6:8);
  if(rich&&!options.length)throw Error('Give at least one option.');
  return {text,options,choices:options.map(o=>o.label),detail:String(args.detail||'').trim().slice(0,4000),multiSelect:args.multiSelect===true,allowCustom:rich?args.allowCustom===true:true};
}
async function createQuestion(team,args,owner,ctx){
  const source=team.state.jobs.findLast(j=>j.sessionId===ctx.sessionId&&(!ctx.turnId||j.turnId===ctx.turnId)&&team.active(j));
  const question={id:randomUUID(),botId:owner.bot.id,roomId:owner.room?.id,...(owner.room?{groupEpoch:ctx.groupEpoch??groupWork.epoch(owner.room)}:{}),sessionId:ctx.sessionId,...(source?{sourceJobId:source.id}:{}),...normalizeQuestion(args),status:'pending',at:new Date().toISOString()};
  team.state.questions.push(question);try{await team.save();}catch(error){team.state.questions=team.state.questions.filter(q=>q!==question);throw error;}
  return JSON.stringify({id:question.id,status:'waiting_for_user',note:'The answer arrives later as a new assignment. Continue independent work or end your turn; do not repeatedly ask.'});
}
function answerOf(question,input){
  if(input.dismissed===true)return {dismissed:true,text:'',selected:[],custom:''};
  const options=question.options||question.choices?.map(label=>({label}))||[];
  if(input.selected!==undefined&&(!Array.isArray(input.selected)||input.selected.some(v=>typeof v!=='string')))throw Error('无效的问题选项。');
  const selected=[...new Set(input.selected||[])];
  if(selected.some(label=>!options.some(o=>o.label===label))||!question.multiSelect&&selected.length>1)throw Error('无效的问题选项。');
  const custom=String(input.custom??input.text??'').trim();
  const text=[...selected,custom].filter(Boolean).join('\n');
  if(!text||text.length>8000)throw Error('Answer must contain 1–8000 characters.');
  return {text,selected,custom,dismissed:false};
}
async function deliverQuestion(team,question){
  if(!question.deliveryPending||team.stopped)return;
  const bot=team.bot(question.botId),room=question.roomId?team.room(question.roomId):null;
  if(room&&!room.members.includes(bot.id))throw Error('提问成员已离开原群聊，未向其他聊天转发回答。');
  if(room)groupWork.assertCurrent(team,room,question.groupEpoch??0);
  const origin=team.state.jobs.find(j=>j.id===question.sourceJobId);
  const source='question-'+question.id,text='User answer to '+question.text+'\n'+question.answer;
  if(bot.role==='Administrator'||room?.adminId===bot.id)await team.submitMessage(room?'room':'bot',room?.id||bot.id,text,{scheduleId:origin?.scheduleId,scheduleRunId:origin?.scheduleRunId,clientMessageId:source,...(room?{groupEpoch:question.groupEpoch??0}:{})});
  else if(!team.state.jobs.some(j=>j.deliverySourceId===source)){
    const batch=(team.state.workBatches||[]).find(b=>b.roomId===room?.id&&b.status==='running'&&b.jobIds.includes(origin?.id));
    await admit(team,{room,bot,task:text,roundId:origin?.roundId,key:'question:'+question.id,options:{scheduleId:origin?.scheduleId,scheduleRunId:origin?.scheduleRunId,deliverySourceId:source,offRound:Boolean(room),...(room?{groupEpoch:question.groupEpoch??0}:{})},change:(edit,job)=>{edit.set(question,'deliveryJobId',job.id);if(batch)edit.append(batch,'jobIds',job.id);}});
  }
  await team.save();question.deliveryPending=false;delete question.deliveryError;await team.save();
}
async function answerQuestion(team,input){
  const question=team.state.questions.find(q=>q.id===input.id);if(!question)throw Error('问题不存在。');
  const answer=answerOf(question,input),same=question.answer===answer.text&&Boolean(question.dismissed)===answer.dismissed;
  if(question.status!=='pending'&&!same)throw Error('问题已回答或不存在。');
  const key='question:'+question.id;if(team.deliveries.has(key))return team.deliveries.get(key);
  const run=(async()=>{
    if(question.status==='pending'){
      const before={...question};Object.assign(question,{status:answer.dismissed?'dismissed':'answered',answer:answer.text,selected:answer.selected,custom:answer.custom,dismissed:answer.dismissed,answeredAt:new Date().toISOString(),deliveryPending:!answer.dismissed});
      try{await team.save();}catch(error){for(const k of Object.keys(question))delete question[k];Object.assign(question,before);throw error;}
      team.userSpoke();if(question.roomId){const room=team.state.rooms.find(r=>r.id===question.roomId);if(room)room.botRounds=0;}
    }
    try{await deliverQuestion(team,question);}catch(error){question.deliveryError=String(error.message).slice(0,1000);throw error;}
    await team.save();return team.snapshot();
  })();team.deliveries.set(key,run);try{return await run;}finally{team.deliveries.delete(key);}
}
module.exports={normalizeQuestion,createQuestion,answerQuestion,deliverQuestion};
