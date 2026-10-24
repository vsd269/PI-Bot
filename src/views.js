'use strict';
const {randomUUID}=require('node:crypto');
const {StateEdit}=require('./state-edit');
const {checkShownView,normalizeView,validateViewAnswer,viewSummary,viewBytes,VIEW_BYTE_LIMIT}=require('./upstream/views.cjs');
const STATES=new Set(['displayed','pending','answered','dismissed','superseded','interrupted']);
const secretField=/(?:api[\s_-]*key|password|passwd|secret|token|密钥|密码|口令|令牌)/i;
function checkSecrets(node){
  if(['slider','number','choice','toggle'].includes(node.type)&&secretField.test([node.id,node.label].join(' ')))throw Error('凭据请使用 request_secret，不要通过卡片收集。');
  if(node.type==='form'&&node.fields.some(field=>secretField.test([field.id,field.label,field.placeholder].join(' '))))throw Error('密钥、令牌和密码请使用 request_secret，不要通过交互卡片收集。');
  for(const child of node.children||[])checkSecrets(child);
}
function checkedView(title,input){
  if(viewBytes(title,input)>VIEW_BYTE_LIMIT)throw Error('卡片内容不能超过 8 KB。');
  const view=normalizeView(input),checked=checkShownView(title,view);
  if(checked.error)throw Error(checked.error);checkSecrets(view);
  return {title:checked.title,view,interactive:checked.interactive};
}
function checkedAnswer(view,action,values){
  if(typeof action!=='string'||!values||typeof values!=='object'||Array.isArray(values))throw Error('无效的卡片回答。');
  if(Buffer.byteLength(JSON.stringify(values),'utf8')>16384)throw Error('卡片回答过长。');
  const find=node=>node.id===action?node:(node.children||[]).map(find).find(Boolean),node=find(view);
  if(node?.type==='options'&&(!Array.isArray(values.selected)||values.selected.some(label=>!node.options.some(o=>o.label===label))||!node.multi&&values.selected.length!==1))throw Error('请选择卡片中的有效选项。');
  const answer=validateViewAnswer(view,action,values);if(answer.error)throw Error(answer.error);
  return answer;
}
function validateRecords(records,bots){
  if(!Array.isArray(records)||records.length>10000)throw Error('备份中的交互卡片无效。');
  const ids=new Set(),botIds=new Set(bots.map(bot=>bot.id));
  for(const record of records){
    if(!record||typeof record.id!=='string'||!record.id||ids.has(record.id)||!botIds.has(record.botId)||record.roomId||!STATES.has(record.status)||!Number.isFinite(Date.parse(record.at)))throw Error('备份中的交互卡片无效。');
    ids.add(record.id);const checked=checkedView(record.title,record.view);
    if(record.status==='pending'&&!checked.interactive||record.status==='displayed'&&checked.interactive)throw Error('备份中的卡片状态无效。');
    if(record.status==='answered')checkedAnswer(record.view,record.action,record.values);
    if(record.deliveryPending&&record.status!=='answered')throw Error('备份中的卡片派发状态无效。');
  }
}
async function createView(team,args,owner,ctx){
  if((team.state.views?.length||0)>=10000)throw Error('卡片记录已达上限，请先归档或备份历史。');
  if(owner.room)throw Error('交互卡片仅用于 Bot 私聊；群聊中请直接提问。');
  if(!team.state.bots.some(bot=>bot.id===owner.bot.id))throw Error('该 Bot 已被删除。');
  const checked=checkedView(args.title,args.view);
  if(checked.interactive&&args.await_reply===false||!checked.interactive&&args.await_reply===true)throw Error(checked.interactive?'交互卡片需要用户回答；请勿设置 await_reply: false。':'展示卡片没有可提交的控件；请设置 await_reply: false。');
  const record={id:randomUUID(),botId:owner.bot.id,sessionId:ctx?.sessionId,title:checked.title,view:checked.view,status:checked.interactive?'pending':'displayed',at:new Date().toISOString()};
  const edit=new StateEdit();
  if(checked.interactive)for(const prior of team.state.views||[])if(prior.botId===record.botId&&prior.status==='pending')edit.set(prior,'status','superseded');
  edit.append(team.state,'views',record);try{await team.save();}catch(error){edit.rollback();throw error;}
  if(checked.interactive&&typeof ctx?.concludeTurn==='function')await ctx.concludeTurn();
  return JSON.stringify({id:record.id,status:checked.interactive?'waiting_for_user':'displayed',note:checked.interactive?'The card is on screen. End this turn now. The submitted answer arrives later as a new user message; never poll or wait for it.':'The view is on screen.'});
}
function replyOf(record){return JSON.stringify({kind:'answer_to_pending_view',tool:'show_view',views:[{id:record.id,title:record.title,view:record.view}],answers:[{id:record.id,action:record.action,values:record.values}]});}
function replyDisplay(record){
  const values=record.values||{},labels={};const visit=node=>{if(node.type==='form')for(const field of node.fields)labels[field.id]=field.label;for(const child of node.children||[])visit(child);};visit(record.view);
  const answer=Array.isArray(values.selected)?values.selected.join('、'):typeof values.confirmed==='boolean'?values.confirmed?'确认':'取消':Object.entries(values.fields||{}).map(([id,text])=>(labels[id]||id)+'：'+text).join('\n');
  return '已回答「'+record.title+'」\n'+answer;
}
async function deliverView(team,record){
  if(!record.deliveryPending||team.stopped)return;
  const key='view-delivery:'+record.id;if(team.deliveries.has(key))return team.deliveries.get(key);
  const delivery=deliverOnce(team,record);team.deliveries.set(key,delivery);try{return await delivery;}finally{team.deliveries.delete(key);}
}
async function deliverOnce(team,record){
  if(record.roomId||!team.state.bots.some(bot=>bot.id===record.botId))throw Error('原 Bot 已不存在，未向其他聊天转发回答。');
  const source='view-'+record.id;
  await team.submitMessage('bot',record.botId,replyOf(record),{clientMessageId:source,deliverySourceId:source,sourceUserContent:replyDisplay(record)});
  // Keep the retry flag in memory if persisting the acknowledgement fails.
  record.deliveryPending=false;delete record.deliveryError;
  try{await team.save();}catch(error){record.deliveryPending=true;throw error;}
}
async function answerView(team,input){
  const record=(team.state.views||[]).find(view=>view.id===input.id);if(!record)throw Error('卡片不存在。');
  const values=input.dismissed===true?undefined:checkedAnswer(record.view,input.action,input.values);
  const same=record.status==='answered'&&record.action===input.action&&JSON.stringify(record.values)===JSON.stringify(values)||record.status==='dismissed'&&input.dismissed===true;
  if(record.status!=='pending'&&!same)throw Error('该卡片已结束或被新消息替代。');
  const key='view:'+record.id;if(team.deliveries.has(key))return team.deliveries.get(key);
  const run=(async()=>{
    if(record.status==='pending'){
      const before={...record};Object.assign(record,{status:input.dismissed===true?'dismissed':'answered',answeredAt:new Date().toISOString(),deliveryPending:input.dismissed!==true});
      if(values){record.action=input.action;record.values=values;}
      try{await team.save();}catch(error){for(const key of Object.keys(record))delete record[key];Object.assign(record,before);throw error;}
      team.userSpoke();
    }
    try{await deliverView(team,record);}catch(error){record.deliveryError=String(error.message).slice(0,1000);await team.save().catch(()=>{});throw error;}
    return {id:record.id,status:record.status,deliveryPending:record.deliveryPending};
  })();team.deliveries.set(key,run);try{return await run;}finally{team.deliveries.delete(key);}
}
function supersedeViews(team,botId,options={}){
  const edit=new StateEdit();
  if(!options.fromBotId&&!String(options.clientMessageId||'').startsWith('view-'))for(const view of team.state.views||[])if(view.botId===botId&&view.status==='pending')edit.set(view,'status','superseded');
  return edit;
}
module.exports={checkedView,checkedAnswer,validateRecords,createView,answerView,deliverView,supersedeViews,viewSummary,replyOf,replyDisplay};
