'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
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
