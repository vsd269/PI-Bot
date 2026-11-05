'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function reactionsFixture(){
  const {createReactions}=await import('../renderer/reactions.mjs'),requests=[],errors=[];let paints=0;
  const ui=createReactions({save:input=>{const g=gate();requests.push({input,...g});return g.promise;},onChange:()=>paints++,onError:e=>errors.push(e.message)});
  const ack=index=>{const req=requests[index];req.resolve({...req.input});};
  return {ui,requests,errors,ack,paints:()=>paints};
}
const target={kind:'bot',id:'a'},line={id:'r',reaction:null};

test('reaction add/remove paints before saving and serializes the latest explicit choice',async()=>{
  const {ui,requests,ack}=await reactionsFixture();ui.toggle(target,line,'👍');
  assert.equal(ui.value(target,line),'👍');assert.equal(requests.length,1);assert.equal(requests[0].input.reaction,'👍');
  ui.toggle(target,line,'👍');assert.equal(ui.value(target,line),null);assert.equal(requests.length,1);
  ack(0);await turn();assert.equal(ui.value(target,line),null);assert.equal(requests.length,2);assert.equal(requests[1].input.reaction,null);
  ack(1);await turn();assert.equal(ui.value(target,line),null);
});

test('reaction feedback survives polls started before save completion and then yields to fresh state',async()=>{
  const {ui,ack}=await reactionsFixture(),read=ui.beginRead();ui.toggle(target,line,'❤️');ui.receive(read);assert.equal(ui.value(target,line),'❤️');
  ack(0);await turn();ui.receive(read);assert.equal(ui.value(target,line),'❤️');
  ui.receive(ui.beginRead());assert.equal(ui.value(target,{...line,reaction:'😮'}),'😮');
});

test('rapid emoji changes coalesce while different chats and identical message ids stay independent',async()=>{
  const {ui,requests,ack}=await reactionsFixture(),room={kind:'room',id:'a'};
  ui.toggle(target,line,'👍');ui.toggle(target,line,'😂');ui.toggle(target,line,'❤️');ui.toggle(room,line,'🙏');
  assert.equal(requests.length,2);assert.equal(ui.value(target,line),'❤️');assert.equal(ui.value(room,line),'🙏');
  ack(0);await turn();assert.equal(requests.length,3);assert.equal(requests[2].input.reaction,'❤️');
  ack(1);ack(2);await turn();assert.equal(ui.value(target,line),'❤️');assert.equal(ui.value(room,line),'🙏');
});

test('failed additions/removals restore confirmed state without discarding a newer choice',async()=>{
  const {ui,requests,errors,ack}=await reactionsFixture();ui.toggle(target,line,'👍');requests[0].reject(Error('disk full'));await turn();assert.equal(ui.value(target,line),null);
  ui.toggle(target,line,'❤️');ack(1);await turn();ui.toggle(target,line,'❤️');requests[2].reject(Error('read only'));await turn();assert.equal(ui.value(target,line),'❤️');
  ui.toggle(target,line,'😂');ui.toggle(target,line,'🙏');requests[3].reject(Error('busy'));await turn();assert.equal(ui.value(target,line),'🙏');assert.equal(requests[4].input.reaction,'🙏');ack(4);await turn();assert.deepEqual(errors,['disk full','read only','busy']);
});

test('closing reactions suppresses late UI updates while finishing the final queued choice',async()=>{
  const {ui,requests,ack,paints}=await reactionsFixture();ui.toggle(target,line,'👍');ui.toggle(target,line,'👍');const before=paints();ui.close();ack(0);await turn();assert.equal(requests[1].input.reaction,null);ack(1);await turn();assert.equal(paints(),before);
});
test('tool display unwraps nested host JSON without duplicating stdout or hiding failed exit codes',async()=>{
  const {describeTool}=await import('../renderer/tool-record.mjs');
  const output={commandShellId:'windows-powershell',exitCode:2,stdout:'第一行\n第二行',stderr:'找不到文件'};
  const info=describeTool({name:'Bash',status:'success',detail:JSON.stringify({content:[{type:'text',text:JSON.stringify(output)}],details:output})});
  assert.equal(info.title,'执行命令');assert.equal(info.status,'failed');assert.equal(info.label,'失败');assert.equal(info.exitCode,2);
  assert.deepEqual(info.parts,[{label:'输出',text:'第一行\n第二行'},{label:'错误／警告',text:'找不到文件'}]);assert.match(info.summary,/退出码 2/);assert.match(info.raw,/commandShellId/);
  assert.equal(describeTool({name:'Read',status:'unknown',detail:'没有状态'}).status,'unknown');
  assert.equal(describeTool({name:'Read',status:'success',detail:JSON.stringify({isError:true,content:[{text:'权限不足'}]})}).status,'failed');
  assert.equal(describeTool({name:'Bash',status:'completed',detail:JSON.stringify({exitCode:0,stderr:'warning'})}).status,'completed');
});
test('tool display retains unknown data and truncated plain text as inert text',async()=>{
  const {describeTool}=await import('../renderer/tool-record.mjs');
  const source='<img src=x onerror=alert(1)>\\n数据';
  assert.equal(describeTool({name:'Custom',status:'running',detail:source}).parts[0].text,source);
  const info=describeTool({name:'Custom',status:'unknown',detail:JSON.stringify({found:3,items:['a','b']})});
  assert.match(info.parts[0].text,/"found": 3/);assert.equal(info.title,'Custom');
});
test('working phrases follow real job states including approval, tools and terminal removal',async()=>{
  const {workingLabel}=await import('../renderer/working-status.mjs');
  assert.equal(workingLabel({status:'waiting',currentTool:'Bash',currentToolStatus:'running'}),'等待你的批准');
  assert.equal(workingLabel({status:'running',activityPhase:'thinking'}),'正在仔细思考');
  assert.equal(workingLabel({status:'running',currentTool:'Bash',currentToolStatus:'running'}),'正在执行命令');
  assert.equal(workingLabel({status:'running',currentTool:'Bash',currentToolStatus:'success',progress:'部分文字'}),'正在回复');
  assert.equal(workingLabel({status:'running'}),'正在处理');
});

test('live status and composer work share the same active states and conversation scope',async()=>{
  const {isWorkingStatus,workingJobs}=await import('../renderer/working-status.mjs');
  const phases=['queued','launching','running','waiting','waiting_teammates'];
  const jobs=phases.map((status,i)=>({id:'private-'+i,botId:'a',status}));
  const state={jobs:[...jobs,{id:'resume',botId:'a',status:'running',handoffRootId:'private-4'},{id:'other-bot',botId:'b',status:'running'},{id:'group',botId:'a',roomId:'g',status:'running'},{id:'other-group',botId:'a',roomId:'h',status:'waiting'},{id:'done',botId:'a',status:'completed'}]};
  for(const status of phases)assert.equal(isWorkingStatus(status),true);
  for(const status of ['completed','aborted','error','interrupted','needs_review','not_started',undefined])assert.equal(isWorkingStatus(status),false);
  assert.deepEqual(workingJobs(state,{kind:'bot',id:'a'}).map(j=>j.id),[...jobs.map(j=>j.id),'resume']);
  assert.deepEqual(workingJobs(state,{kind:'room',id:'g'}).map(j=>j.id),['group']);
  assert.deepEqual(workingJobs(state,{kind:'bot',id:'missing'}),[]);
  assert.deepEqual(workingJobs(state,null),[]);
});
