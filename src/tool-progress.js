'use strict';
const {createHash}=require('node:crypto');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal=new Set(['completed','success','done','error','failed','failure']);
function observeTools(job,tools=[]){
  const rows=tools.filter(t=>t.id&&terminal.has(t.toolStatus||t.status));
  const state=job.toolWatch||{count:0};
  let at=0;
  if(state.lastId){at=rows.findIndex(t=>t.id===state.lastId)+1;if(!at)return false;}
  let changed=false;
  for(const t of rows.slice(at)){
    const status=t.toolStatus||t.status,name=String(t.toolName||'tool').slice(0,100);
    const detail=typeof t.content==='string'?t.content:JSON.stringify(t.content||'');
    const failed=['error','failed','failure'].includes(status)||t.isError===true;
    // Approval waits and unfinished calls are never failures. Hashes retain no
    // raw arguments, command lines or credentials in the persistent detector.
    const signature=hash([name,t.toolInput??t.arguments??t.input??null,detail]);
    state.count=failed?(state.signature===signature?state.count+1:1):0;
    state.signature=failed?signature:null;state.lastId=t.id;changed=true;
    if(state.count>=5){
      job.toolWarning={tool:name,count:state.count,at:new Date().toISOString(),message:'同一工具连续返回相同错误，请核对原生会话并换一种方法。未自动停止任务。'};
    }else if(job.toolWarning)delete job.toolWarning;
  }
  if(changed)job.toolWatch=state;
  return changed;
}
function receipt(team,job){
  const events=job.toolEvents||[],tools={};
  for(const e of events){const key=String(e.name||'tool');const row=tools[key]??={name:key,calls:0,failures:0};row.calls++;if(['error','failed','failure'].includes(e.status))row.failures++;}
  return {jobId:job.id,status:job.status,botName:team.botName(job.botId),startedAt:job.startedAt||job.at,endedAt:job.endedAt||null,toolCalls:job.toolCalls||0,tools:Object.values(tools),observedEvents:events.length,evidenceLimited:(job.toolCalls||0)>events.length,warning:job.toolWarning||null,result:team.vault.redact(String(job.result||job.error||'')).slice(-12000),files:'未独立核对文件变更；工具记录不等于变更凭据。',verification:'未独立验收成果；回合结束不代表外部操作成功。'};
}
module.exports={observeTools,receipt};
