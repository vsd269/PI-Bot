'use strict';
const MAX_UNATTENDED_MESSAGES=40;
const permissionModes=['inherit','ask','accept-edits','auto'];
const hasPending=value=>Array.isArray(value)?value.length>0:typeof value==='number'?value>0:value===true;
function activityOf(status,evidence={}){
  const tools=evidence.tools||[],last=tools.at(-1),pending=tools.findLast(t=>['running','pending','waiting'].includes(t.toolStatus||t.status));
  return {waiting:hasPending(status.pendingToolConfirmations)||hasPending(status.pendingInteractiveRequests),tool:(pending||last)?.toolName||'',toolStatus:(pending||last)?.toolStatus||(pending||last)?.status||'',phase:status.activity?.phase||''};
}
function pageLines(rows,args={}){
  const end=Number.isInteger(args.before)?Math.max(0,Math.min(args.before,rows.length)):rows.length;
  const limit=Math.max(1,Math.min(Number.isInteger(args.limit)?args.limit:50,100));
  const terms=String(args.query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if(args.around){
    const anchor=String(args.around),exact=rows.findIndex(r=>r.id===anchor),matches=exact>=0?[exact]:rows.flatMap((r,i)=>String(r.text||'').includes(anchor)?[i]:[]);
    if(matches.length!==1)throw Error('历史锚点不存在或不唯一，请使用消息 ID。');
    const start=Math.max(0,Math.min(matches[0]-Math.floor(limit/2),rows.length-limit)),stop=Math.min(rows.length,start+limit);
    return {rows:rows.slice(start,stop).map((r,i)=>({...r,...(start+i===matches[0]?{matched:true}:{}),text:String(r.text||'').slice(0,8000)})),before:start,hasMore:start>0,after:stop,hasMoreAfter:stop<rows.length,anchor:rows[matches[0]].id};
  }
  if(terms.length){
    const context=Math.max(0,Math.min(Number.isInteger(args.context)?args.context:2,5)),matchLimit=Math.min(limit,Math.max(1,Math.floor(100/(context*2+1)))),matches=[];let index=end;
    while(index>0&&matches.length<matchLimit){const candidate=--index,line=rows[candidate];if(terms.every(term=>String(line.text||'').toLocaleLowerCase().includes(term)))matches.unshift(candidate);}
    const selected=new Map();
    for(const match of matches)for(let i=Math.max(0,match-context);i<=Math.min(end-1,match+context);i++)selected.set(i,{...rows[i],...(i===match?{matched:true}:{}),text:String(rows[i].text||'').slice(0,8000)});
    return {rows:[...selected].sort(([a],[b])=>a-b).map(([,line])=>line),before:index,hasMore:index>0,context};
  }
  const selected=[];let index=end;
  while(index>0&&selected.length<limit){const line=rows[--index];selected.unshift({...line,text:String(line.text||'').slice(0,8000)});}
  return {rows:selected,before:index,hasMore:index>0};
}
module.exports={MAX_UNATTENDED_MESSAGES,permissionModes,activityOf,pageLines};
