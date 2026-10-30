'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Team}=require('../src/team'),{Vault}=require('../src/vault'),{Handoffs}=require('../src/handoffs');
const {dispatchMessageBot,delegationStatus,reconcileRequests,validateRequests}=require('../src/message-requests');
const {ExecutionLog,history,validateLog,MAX_EVENTS}=require('../src/execution-log');
const {validateState,pausedState,Backups,parseArchive}=require('../src/backups');
const {Recovery}=require('../src/recovery');
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const disk=async t=>JSON.parse(await fs.readFile(t.file,'utf8'));
const input={to:'Bravo',message:'核对输出文件',request_id:'check-1'};
const context={sessionId:'native-a',turnId:'turn-a'};
const owner=t=>({bot:t.bot('a'),room:null});
const drain=t=>Promise.allSettled([...t.memberChains.values()]);
async function fixture(ctx){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-execution-'));
  const t=new Team({__testHost:true,models:{list:async()=>[]}});
  t.data=dir;t.file=path.join(dir,'team.json');t.queueCheckpoint=()=>{};
  t.state={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',modelKey:'',sessions:{}},{id:'a',name:'Alpha',role:'Worker',modelKey:'',sessions:{private:'native-a'},chat:[]},{id:'b',name:'Bravo',role:'Worker',modelKey:'',sessions:{},chat:[]}],rooms:[{id:'room',name:'协作群',members:['chief','a','b'],adminId:'chief',log:[]}],jobs:[],questions:[],views:[],asides:[],archives:[],completions:[],prefs:{}};
  t.vault=new Vault({backups:{root:dir},state:t.state,bot:id=>t.bot(id),save:()=>t.save()});t.handoffs=new Handoffs(t);t.executed=[];
  t.execute=async job=>{t.executed.push({id:job.id,saved:await disk(t)});job.status='completed';await t.save();};
  ctx.after(async()=>{await drain(t);await t.writes;await Promise.allSettled([...t.background]);await fs.rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});});
  return t;
}
function request(patch={}){return {key:'a:recover-1',requestId:'recover-1',sourceBotId:'a',targetBotId:'b',jobId:'child',signature:'a'.repeat(64),status:'admitting',at:'2026-10-30T01:00:00.000Z',...patch};}

test('concurrent dispatch persists one linked job and acceptance before its executor runs',async ctx=>{
  const t=await fixture(ctx),parent={id:'parent',botId:'a',sessionId:'native-a',turnId:'turn-a',status:'running',task:'核对任务'};t.state.jobs.push(parent);
  const [first,second]=await Promise.all([dispatchMessageBot(t,input,owner(t),context),dispatchMessageBot(t,input,owner(t),context)]);assert.equal(first,second);await drain(t);
  const result=JSON.parse(first);assert.equal(t.executed.length,1);const saved=t.executed[0].saved,child=saved.jobs.find(j=>j.id===result.jobId),receipt=saved.messageBotRequests[0];
  assert.equal(receipt.status,'accepted');assert.equal(receipt.jobId,child.id);assert.equal(child.messageRequestKey,receipt.key);assert.equal(child.parentJobId,parent.id);assert(saved.jobs[0].childIds.includes(child.id));
  const again=JSON.parse(await dispatchMessageBot(t,input,owner(t),context));assert.equal(again.duplicate,true);assert.equal(again.jobId,result.jobId);assert.equal(t.executed.length,1);assert.equal(t.state.unattended.sent,1);validateState(await disk(t));
});

test('conflicting retry is rejected while another owner may reuse the same request id',async ctx=>{
  const t=await fixture(ctx);await dispatchMessageBot(t,input,owner(t),context);
  await assert.rejects(()=>dispatchMessageBot(t,{...input,message:'另一份任务'},owner(t),context),/request_id/);
  await dispatchMessageBot(t,input,{bot:t.bot('chief'),room:null},{sessionId:'chief-session'});await drain(t);assert.equal(t.state.messageBotRequests.length,2);assert.equal(new Set(t.state.messageBotRequests.map(r=>r.key)).size,2);
});

test('later queued saves cannot retain a job whose admission rename failed',async ctx=>{
  const t=await fixture(ctx),entered=gate(),resume=gate(),rename=fs.rename;let rejected=false;
  const parent={id:'parent',botId:'a',sessionId:'native-a',turnId:'turn-a',status:'running',task:'父任务'};t.state.jobs.push(parent);await t.save();
  ctx.mock.method(fs,'rename',async(from,to,...rest)=>{if(to===t.file&&!rejected){const next=JSON.parse(await fs.readFile(from,'utf8'));if(next.messageBotRequests?.[0]?.status==='accepted'){rejected=true;entered.resolve();await resume.promise;throw Error('FINAL_RENAME_FAILURE');}}return rename(from,to,...rest);});
  const outcome=dispatchMessageBot(t,input,owner(t),context).then(()=>null,e=>e);await entered.promise;
  t.bot('a').chat.push({text:'并行聊天不能丢失'});const later=t.save();resume.resolve();assert.match((await outcome).message,/FINAL_RENAME_FAILURE/);await later;await drain(t);
  const saved=await disk(t);assert.equal(t.executed.length,0);assert.equal(saved.jobs.length,1);assert.deepEqual(saved.jobs[0].childIds||[],[]);assert.equal(saved.bots[1].chat[0].text,'并行聊天不能丢失');assert.equal(saved.messageBotRequests[0].status,'failed');
  const duplicate=JSON.parse(await dispatchMessageBot(t,input,owner(t),context));assert.equal(duplicate.accepted,false);assert.equal(duplicate.duplicate,true);assert.equal(t.executed.length,0);
});

test('reservation save failure cannot start an executor',async ctx=>{
  const t=await fixture(ctx),rename=fs.rename;let fail=true;
  ctx.mock.method(fs,'rename',async(from,to,...rest)=>{if(to===t.file&&fail){fail=false;throw Error('RESERVATION_FAILURE');}return rename(from,to,...rest);});
  await assert.rejects(()=>dispatchMessageBot(t,input,owner(t),context),/RESERVATION_FAILURE/);await drain(t);assert.equal(t.state.jobs.length,0);assert.equal(t.executed.length,0);assert.equal((await disk(t)).messageBotRequests[0].status,'failed');
});

test('unattended limit failure produces a durable failed receipt and no task',async ctx=>{
  const t=await fixture(ctx);t.state.unattended={sent:40};await assert.rejects(()=>dispatchMessageBot(t,input,owner(t),context),/40/);assert.equal(t.state.jobs.length,0);assert.equal(t.executed.length,0);assert.equal((await disk(t)).messageBotRequests[0].status,'failed');
});

for(const reason of ['stopped','aborted','target_removed','membership_removed','parent_cancelled'])test(reason+' during admission prevents launch',async ctx=>{
  const t=await fixture(ctx),entered=gate(),resume=gate(),parent={id:'parent',botId:'a',sessionId:'native-a',turnId:'turn-a',status:'running',task:'父任务'};t.state.jobs.push(parent);
  t.admitBotMessage=async()=>{entered.resolve();await resume.promise;};const own=reason==='membership_removed'?{bot:t.bot('a'),room:t.room('room')}:owner(t),controller=new AbortController();
  const outcome=dispatchMessageBot(t,input,own,{...context,signal:controller.signal}).then(()=>null,e=>e);await entered.promise;
  if(reason==='stopped')t.stopped=true;if(reason==='aborted')controller.abort();if(reason==='target_removed')t.state.bots=t.state.bots.filter(b=>b.id!=='b');if(reason==='membership_removed')t.room('room').members=t.room('room').members.filter(id=>id!=='b');if(reason==='parent_cancelled')parent.cancelled=true;
  resume.resolve();assert(await outcome instanceof Error);await drain(t);assert.equal(t.executed.length,0);assert.equal(t.state.jobs.length,1);
});

test('same request after a restart returns its saved receipt without enqueueing again',async ctx=>{
  const t=await fixture(ctx),reply=JSON.parse(await dispatchMessageBot(t,input,owner(t),context));await drain(t);
  const restored=await fixture(ctx);restored.state=await disk(t);restored.executionLog.restore(restored.state);reconcileRequests(restored.state);
  const duplicate=JSON.parse(await dispatchMessageBot(restored,input,owner(restored),context));assert.equal(duplicate.duplicate,true);assert.equal(duplicate.jobId,reply.jobId);assert.equal(restored.executed.length,0);
  const result=delegationStatus(restored,owner(restored),input.request_id);assert.equal(result.executionStatus,'completed');assert.equal(result.verification,'not_independently_verified');assert.throws(()=>delegationStatus(restored,{bot:restored.bot('b')},input.request_id),/没有找到/);
});

test('startup reconciliation binds only the reserved job with the same request key',()=>{
  for(const matching of [true,false]){const state={jobs:[{id:'child',messageRequestKey:matching?'a:recover-1':'a:different',status:'queued'}],messageBotRequests:[request()]};reconcileRequests(state);assert.equal(state.messageBotRequests[0].status,matching?'accepted':'interrupted');assert.equal(state.jobs.length,1);}
  const legacy={jobs:[],messageBotRequests:[request({jobId:undefined})]};reconcileRequests(legacy);assert.equal(legacy.messageBotRequests[0].status,'interrupted');assert.equal(legacy.jobs.length,0);
});

test('real Team.load reconciles interrupted admission and never replays a queued worker',async ctx=>{
  const t=await fixture(ctx);t.state.jobs=[{id:'child',botId:'b',task:'重启前已接收',status:'queued',messageRequestKey:'a:recover-1'}];t.state.messageBotRequests=[request(),request({key:'a:orphan',requestId:'orphan',jobId:'absent'})];await t.save();
  const {EventEmitter}=require('node:events');const pi={__testHost:true,plugin:{getDataPath:async()=>t.data},events:new EventEmitter(),models:{list:async()=>[]},desktop:{listOperations:async()=>[]}};
  const loaded=new Team(pi,{pollMs:60000,memoryReview:false});loaded.identityReady=true;let executions=0;loaded.execute=async()=>{executions++;};
  try{await loaded.load();assert.equal(executions,0);assert.equal(loaded.state.jobs.length,1);assert.equal(loaded.state.jobs[0].status,'interrupted');assert.equal(loaded.state.messageBotRequests[0].status,'accepted');assert.equal(loaded.state.messageBotRequests[1].status,'interrupted');const status=delegationStatus(loaded,{bot:loaded.bot('a')},'recover-1');assert.equal(status.executionStatus,'interrupted');assert.equal(status.verification,'not_independently_verified');validateState(await disk(t));}finally{await loaded.close();}
});

test('accepted receipt with missing task is reported for review without inventing completion',async ctx=>{
  const t=await fixture(ctx);t.state.messageBotRequests=[request({status:'accepted'})];const result=delegationStatus(t,owner(t),'recover-1');assert.equal(result.executionStatus,'needs_review');assert.equal(result.replyDelivered,false);assert.equal(result.verification,'not_independently_verified');
});

test('planner compatibility does not leak a reserved job id or claim a worker checkpoint',async ctx=>{
  const t=await fixture(ctx);let calls=0;t.privateChat=async(id,content,options)=>{calls++;assert.equal(id,'chief');assert(!Object.hasOwn(options,'id'));assert(!Object.hasOwn(options,'messageRequestKey'));return {text:'管理员已完成规划'};};
  const args={...input,to:'Chief'};assert.equal(JSON.parse(await dispatchMessageBot(t,args,owner(t),context)).accepted,true);assert.equal(JSON.parse(await dispatchMessageBot(t,args,owner(t),context)).duplicate,true);assert.equal(calls,1);assert.equal(t.state.jobs.length,0);
  assert.equal(delegationStatus(t,owner(t),input.request_id).executionStatus,'planner_returned');assert.equal(t.state.messageBotRequests[0].jobId,undefined);validateState(await disk(t));
});

test('request validation rejects duplicate keys and malformed backups but accepts old data',async ctx=>{
  const t=await fixture(ctx);validateState(t.state);t.state.messageBotRequests=[request(),request()];assert.throws(()=>validateState(t.state),/ledger/);
  assert.throws(()=>validateRequests({messageBotRequests:[request({kind:'unknown'})]}),/kind/);
  t.state.messageBotRequests=[request({key:'forged'})];assert.throws(()=>validateState(t.state),/请求记录/);
});

test('committed history has monotonic bounded metadata, no text and no unchanged duplicates',()=>{
  const log=new ExecutionLog(),state={jobs:[],messageBotRequests:[]};log.restore(state);
  for(let index=0;index<MAX_EVENTS+21;index++){state.jobs[0]={id:'job',botId:'b',status:index%2?'running':'queued',task:'正文不可写入事件',error:'token-should-not-be-logged',result:'答案'};const proposal=log.prepare(state);log.commit(proposal);}
  assert.equal(state.executionLog.sequence,MAX_EVENTS+21);assert.equal(state.executionLog.events.length,MAX_EVENTS);validateLog(state.executionLog);assert(!JSON.stringify(state.executionLog).includes('token-should-not-be-logged'));assert(!JSON.stringify(state.executionLog).includes('正文'));assert(!JSON.stringify(state.executionLog).includes('答案'));
  const previous=state.executionLog.sequence,proposal=log.prepare(state);log.commit(proposal);assert.equal(state.executionLog.sequence,previous);
  state.jobs[0].replyDelivered=true;log.commit(log.prepare(state));assert.equal(state.executionLog.events.at(-1).status,'reply_delivered');assert.equal(history(state,{jobId:'job',limit:2}).events.length,2);assert.throws(()=>history(state,{limit:101}));
});

test('a failed write cannot advance the committed history sequence',async ctx=>{
  const t=await fixture(ctx);t.state.jobs.push({id:'one',botId:'a',task:'任务',status:'queued'});await t.save();const before=structuredClone(t.state.executionLog),rename=fs.rename;let once=true;
  ctx.mock.method(fs,'rename',async(from,to,...rest)=>{if(to===t.file&&once){once=false;throw Error('LOG_RENAME_FAILURE');}return rename(from,to,...rest);});
  t.state.jobs[0].status='running';await assert.rejects(()=>t.save(),/LOG_RENAME_FAILURE/);assert.deepEqual(t.state.executionLog,before);assert.deepEqual((await disk(t)).executionLog,before);await t.save();assert.equal(t.state.executionLog.sequence,before.sequence+1);assert.equal(t.state.executionLog.events.at(-1).status,'running');
});

test('loading legacy state never fabricates historical events',()=>{
  const state={jobs:[{id:'old',botId:'b',status:'completed'}]},log=new ExecutionLog();log.restore(state);log.commit(log.prepare(state));assert.deepEqual(state.executionLog.events,[]);state.jobs[0].status='interrupted';log.commit(log.prepare(state));assert.equal(state.executionLog.events.length,1);
});

test('history remains outside regular UI state and is available through recovery only on demand',async ctx=>{
  const t=await fixture(ctx);t.integrations={operations:new Set()};await dispatchMessageBot(t,input,owner(t),context);await drain(t);
  const snapshot=t.snapshot();assert(!Object.hasOwn(snapshot,'executionLog'));assert(!Object.hasOwn(snapshot,'messageBotRequests'));const job=t.state.jobs[0];const view=await new Recovery(t).operation({action:'history',jobId:job.id});assert(view.events.some(e=>e.status==='accepted'));assert(view.events.some(e=>e.entity==='job'));assert.match(view.note,/不代表/);await assert.rejects(()=>new Recovery(t).operation({action:'history',jobId:'missing'}),/不存在/);
});

test('backup round trip preserves receipt and history while pausing tasks without replay',async ctx=>{
  const t=await fixture(ctx);await dispatchMessageBot(t,input,owner(t),context);await drain(t);t.state.jobs[0].status='running';await t.save();
  const parsed=parseArchive((await new Backups(t).archive()).text),restored=pausedState(parsed.payload.team);validateState(restored);assert.equal(restored.jobs[0].status,'interrupted');assert.deepEqual(restored.executionLog,t.state.executionLog);assert.equal(restored.messageBotRequests[0].status,'accepted');const log=new ExecutionLog();log.restore(restored);log.commit(log.prepare(restored));assert.equal(restored.jobs.length,1);
});

test('invalid execution history cannot silently enter a validated backup',async ctx=>{
  const t=await fixture(ctx);await t.save();t.state.executionLog={version:1,sequence:2,events:[{entity:'job',id:'j',status:'running',at:'2026-10-30T01:00:00Z',seq:1}]};assert.throws(()=>validateState(t.state),/execution log/);assert.throws(()=>validateLog({version:1,sequence:1,events:[{entity:'job',id:'j',status:'running',at:'2026-10-30T01:00:00Z',seq:1,text:'不允许的正文'}]}),/execution event/);
});

test('history responses fit the host bridge even with maximum multibyte identifiers',()=>{
  const events=Array.from({length:100},(_,i)=>({entity:'job',id:'任'.repeat(260),botId:'机'.repeat(120),roomId:'群'.repeat(120),taskId:'事'.repeat(120),fromBotId:'源'.repeat(120),status:'执'.repeat(80),at:'2026-10-30T01:00:00Z',seq:i+1}));
  const state={executionLog:{version:1,sequence:100,events}};validateLog(state.executionLog);const result=history(state,{limit:100});assert(result.events.length>0);assert(result.responseTruncated);assert(Buffer.byteLength(JSON.stringify(result))<32*1024);assert.equal(result.events.at(-1).seq,100);
});
