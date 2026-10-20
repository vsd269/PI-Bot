'use strict';
const count=value=>Number.isFinite(value)&&value>=0?value:undefined;
function collectUsage(rows){
  const atoms=new Map();let incomplete=false;
  for(const row of rows){
    const u=row.usage;if(!u){if(row.role==='assistant')incomplete=true;continue;}
    const values=u.operations?.length?u.operations:[{...u,operationId:u.operationId||'message:'+row.id}];
    for(const value of values){
      if(count(value.totalTokens)===undefined){incomplete=true;continue;}
      const id=value.operationId,old=atoms.get(id);
      if(!old||value.totalTokens>old.totalTokens||(value.totalTokens===old.totalTokens&&value.cost&&value.costStatus!=='unknown'))atoms.set(id,value);
    }
    if(u.operations?.length&&u.totalTokens>u.operations.reduce((n,v)=>n+(v.totalTokens||0),0)){
      const sum=u.operations.reduce((n,v)=>n+(v.totalTokens||0),0);
      atoms.set('legacy:'+row.id,{operationId:'legacy:'+row.id,totalTokens:u.totalTokens-sum,costStatus:'unknown'});
    }
  }
  return {operations:[...atoms.values()],incomplete};
}
function summarizeUsage(records){
  const atoms=new Map();let incomplete=false,durationMs=0;
  for(const record of records){
    if(!record?.usage){incomplete=true;continue;}
    incomplete ||= !!record.usage.incomplete||record.usage.operations.length===0;
    durationMs+=count(record.durationMs)||0;
    for(const op of record.usage.operations){const old=atoms.get(op.operationId);if(!old||op.totalTokens>old.totalTokens||(op.totalTokens===old.totalTokens&&op.cost&&op.costStatus!=='unknown'))atoms.set(op.operationId,op);}
  }
  const values=[...atoms.values()];const known=values.length>0;
  const costKnown=known&&!incomplete&&values.every(v=>count(v.cost?.total)!==undefined&&v.costStatus!=='unknown');
  const sum=key=>known?values.reduce((n,v)=>n+(count(v[key])||0),0):null;
  return {tokens:known?values.reduce((n,v)=>n+v.totalTokens,0):null,inputTokens:sum('inputTokens'),cacheReadTokens:sum('cacheReadTokens'),cacheWriteTokens:sum('cacheWriteTokens'),cacheReadKnown:values.some(v=>count(v.cacheReadTokens)!==undefined),outputTokens:sum('outputTokens'),cost:costKnown?values.reduce((n,v)=>n+v.cost.total,0):null,costStatus:costKnown?(values.every(v=>v.costStatus==='reported')?'reported':'estimated'):'unknown',incomplete,durationMs};
}
function usageDashboard(team,input={}){
  const to=Number.isFinite(input.toMs)?input.toMs:Date.now(),from=Number.isFinite(input.fromMs)?input.fromMs:to-30*86400000;
  if(from>to||to-from>366*86400000)throw new Error('请选择不超过一年的有效时间范围。');
  const records=[...team.state.jobs,...(team.state.completions||[])].filter(r=>{
    const at=Date.parse(r.at);return at>=from&&at<=to&&(!input.botId||r.botId===input.botId)&&(!input.modelKey||r.modelKey===input.modelKey);
  });
  const calls=rows=>new Set(rows.flatMap(r=>(r.usage?.operations||[]).map(op=>op.operationId))).size;
  const groups=key=>{const values=new Map();for(const row of records){const id=key(row);if(!values.has(id))values.set(id,[]);values.get(id).push(row);}return [...values].map(([id,rows])=>({id,...summarizeUsage(rows),calls:calls(rows)}));};
  const buckets=new Map(),hourly=to-from<=2*86400000;for(const record of records){const date=new Date(record.at),key=hourly?new Date(Math.floor(date.getTime()/3600000)*3600000).toISOString():date.toLocaleDateString('sv-SE'),id=key+'\0'+record.botId+'\0'+(record.modelKey||'旧记录未注明模型');if(!buckets.has(id))buckets.set(id,{at:key,botId:record.botId,modelKey:record.modelKey||'旧记录未注明模型',rows:[]});buckets.get(id).rows.push(record);}
  const activityGroups=new Map();for(const record of [...team.state.jobs,...(team.state.completions||[])]){const at=Date.parse(record.at);if(at<to-366*86400000||at>to||input.botId&&record.botId!==input.botId||input.modelKey&&record.modelKey!==input.modelKey)continue;const id=new Date(record.at).toLocaleDateString('sv-SE');if(!activityGroups.has(id))activityGroups.set(id,[]);activityGroups.get(id).push(record);}
  return {fromMs:from,toMs:to,total:{...summarizeUsage(records),records:records.length,calls:calls(records)},bots:groups(r=>r.botId).map(row=>({...row,name:team.botName(row.id)})),models:groups(r=>r.modelKey||'旧记录未注明模型'),days:groups(r=>new Date(r.at).toLocaleDateString('sv-SE')).sort((a,b)=>a.id.localeCompare(b.id)),buckets:[...buckets.values()].map(({rows,...bucket})=>({...bucket,...summarizeUsage(rows)})),activity:[...activityGroups].map(([id,rows])=>({id,...summarizeUsage(rows)})),coverage:'仅统计 PI-bot 任务和管理员、记忆模型调用；未报告用量的记录显示缺失，费用未知时不估算。'};
}
// Keep provider-qualified IDs for accounting/filtering. Names are presentation
// metadata only; a removed provider must not make historical usage disappear.
function labelUsageModels(view,catalog=[]){
  const models=new Map(catalog.map(model=>[model.key,model]));
  return {...view,models:(view.models||[]).map(row=>{
    const model=models.get(row.id),key=String(row.id||''),slash=key.indexOf('/');
    const fallback=slash>=0?key.slice(slash+1):key;
    const name=[model?.alias,model?.label,model?.name,model?.modelId,fallback].find(value=>typeof value==='string'&&value.trim())?.trim()||'未注明模型';
    return {...row,name,providerName:model?.providerName||''};
  })};
}
module.exports={collectUsage,summarizeUsage,usageDashboard,labelUsageModels};
