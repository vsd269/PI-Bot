'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Team}=require('../src/team'),{Handoffs}=require('../src/handoffs'),{Vault}=require('../src/vault');
const {admit,admitBatch,validateClaims}=require('../src/work-admission');
const {deliverQuestion,createQuestion}=require('../src/questions');
const {Recovery}=require('../src/recovery');
const {dispatchMessageBot}=require('../src/message-requests');
const barrier=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const drain=t=>Promise.allSettled([...t.memberChains.values()]);
async function fixture(ctx){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-reliable-')),t=new Team({__testHost:true,models:{list:async()=>[]}});
  t.data=dir;t.file=path.join(dir,'team.json');t.queueCheckpoint=()=>{};
  t.state={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',modelKey:''},{id:'a',name:'Alpha',role:'Worker',modelKey:'',chat:[]},{id:'b',name:'Bravo',role:'Worker',modelKey:''},{id:'c',name:'Charlie',role:'Worker',modelKey:''}],rooms:[{id:'room',name:'群聊',members:['chief','a','b','c'],adminId:'chief',log:[],workEpoch:0}],jobs:[],questions:[],views:[],completions:[],prefs:{}};
  t.vault=new Vault({state:t.state,backups:{root:dir}});t.handoffs=new Handoffs(t);t.executed=[];
  t.execute=async job=>{t.executed.push({id:job.id,disk:JSON.parse(await fs.readFile(t.file,'utf8'))});job.status='completed';};
  ctx.after(async()=>{await drain(t);await t.writes;await t.store?.close();await t.memory?.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});});return t;
}
function waiting(t,roomId){const root={id:'root',botId:'a',task:'汇总队友检查',status:'waiting_teammates',childIds:['child-1','child-2'],...(roomId?{roomId,groupEpoch:0,roundId:'round'}:{})};t.state.jobs.push(root,...['b','c'].map((botId,i)=>({id:'child-'+(i+1),botId,parentJobId:'root',task:'检查',status:'completed',result:'结果'+i,replyDelivered:true})));return root;}
test('all child results, claim and consumed IDs are durable before a single continuation starts',async ctx=>{
  const t=await fixture(ctx),root=waiting(t);await Promise.all([t.handoffs.resume(root),t.handoffs.resume(root),t.handoffs.resume(root)]);await drain(t);
  assert.equal(t.executed.length,1);const disk=t.executed[0].disk;assert.equal(disk.workClaims.length,1);assert.equal(disk.workClaims[0].jobId,root.resumeJobId);assert.deepEqual(disk.jobs[0].consumedChildren,['child-1','child-2']);assert(disk.jobs.find(j=>j.id===root.resumeJobId));validateClaims(disk);
});
test('failed continuation save rolls back consumption and cannot leak into a later save',async ctx=>{
  const t=await fixture(ctx),root=waiting(t);await t.save();const entered=barrier(),unblock=barrier(),rename=fs.rename;let once=true;
  ctx.mock.method(fs,'rename',async(from,to)=>{if(to===t.file&&once){once=false;entered.resolve();await unblock.promise;throw Error('disk unavailable');}return rename(from,to);});
  const failed=t.handoffs.resume(root);failed.catch(()=>{});await entered.promise;t.bot('a').chat.push({text:'并行消息'});const later=t.save();unblock.resolve();await assert.rejects(failed,/disk unavailable/);await later;await drain(t);
  assert.equal(t.executed.length,0);assert.equal(root.resumeJobId,undefined);assert.equal((root.consumedChildren||[]).length,0);const disk=JSON.parse(await fs.readFile(t.file));assert.equal(disk.jobs.length,3);assert.equal(disk.workClaims?.length||0,0);assert.equal(disk.bots[1].chat[0].text,'并行消息');
  await t.handoffs.resume(root);await drain(t);assert.equal(t.executed.length,1);
});
test('unfinished child prevents ALL continuation while errors return explicitly to the controller',async ctx=>{
  const t=await fixture(ctx),root=waiting(t);t.state.jobs[1].status='running';t.state.jobs[1].replyDelivered=false;await t.handoffs.resume(root);assert.equal(t.executed.length,0);
  t.state.jobs[1].status='error';t.state.jobs[1].error='配置需要修复';t.state.jobs[2].status='error';await t.handoffs.resume(root);await drain(t);assert.equal(t.executed.length,1);const task=t.state.jobs.at(-1).task;assert(task.includes('error'));assert(task.includes('不要自动重试'));
});
for(const status of ['aborted','interrupted','needs_review'])test(status+' child requires human review instead of automatic continuation',async ctx=>{const t=await fixture(ctx),root=waiting(t);t.state.jobs[1].status=status;await t.handoffs.resume(root);await drain(t);assert.equal(root.status,'needs_review');assert.equal(t.executed.length,0);});
test('group continuations retain their original group, round and stop generation',async ctx=>{
  const t=await fixture(ctx),root=waiting(t,'room');await t.handoffs.resume(root);await drain(t);const next=t.state.jobs.at(-1);assert.equal(next.roomId,'room');assert.equal(next.roundId,'round');assert.equal(next.groupEpoch,0);
  const other=await fixture(ctx),old=waiting(other,'room');other.room('room').workEpoch=1;await assert.rejects(()=>other.handoffs.resume(old),/停止/);await drain(other);assert.equal(other.executed.length,0);assert.equal(other.state.workClaims?.length||0,0);
});
test('a persisted claim after restart never generates a second submission',async ctx=>{
  const t=await fixture(ctx);const next=await admit(t,{bot:t.bot('b'),task:'任务',key:'one'});await drain(t);await t.save();
  const copy=await fixture(ctx);copy.state=JSON.parse(await fs.readFile(t.file));const again=await admit(copy,{bot:copy.bot('b'),task:'任务',key:'one'});await drain(copy);assert.equal(again.id,next.id);assert.equal(copy.executed.length,0);
});
test('missing claimed task needs review rather than silent recreation',async ctx=>{
  const t=await fixture(ctx);t.state.workClaims=[{key:'missing',jobId:'gone',status:'accepted',at:new Date().toISOString()}];await assert.rejects(()=>admit(t,{bot:t.bot('b'),task:'任务',key:'missing'}),/需要核对/);assert.equal(t.executed.length,0);
});
for(const reason of ['cancel','remove','privacy'])test(reason+' rechecked inside the serialized admission',async ctx=>{
  const t=await fixture(ctx),root=waiting(t),entered=barrier(),release=barrier();t.writes=entered.promise.then(()=>release.promise);const run=t.handoffs.resume(root);run.catch(()=>{});entered.resolve();
  if(reason==='cancel')root.cancelled=true;if(reason==='remove')t.state.bots=t.state.bots.filter(b=>b.id!=='a');if(reason==='privacy'){t.bot('a').private=true;root.fromBotId='b';}
  release.resolve();await assert.rejects(run);await drain(t);assert.equal(t.executed.length,0);
});
test('question delivery has durable admission and failed saves retain retryable answers',async ctx=>{
  const t=await fixture(ctx),q={id:'q',botId:'a',question:'选哪个',answer:'A',deliveryPending:true};t.state.questions.push(q);await t.save();const rename=fs.rename;let once=true;
  ctx.mock.method(fs,'rename',async(from,to)=>{if(to===t.file&&once){once=false;throw Error('answer save');}return rename(from,to);});
  await assert.rejects(()=>deliverQuestion(t,q),/answer save/);await drain(t);assert.equal(t.executed.length,0);assert.equal(q.deliveryPending,true);await deliverQuestion(t,q);await drain(t);assert.equal(t.executed.length,1);assert(t.executed[0].disk.workClaims.some(c=>c.key==='question:q'));
});
test('manual recovery persists its new task and retry link before execution',async ctx=>{
  const t=await fixture(ctx),old={id:'old',botId:'a',task:'原任务',status:'error'};t.state.jobs.push(old);const recovery=new Recovery(t);
  const [a,b]=await Promise.all([recovery.operation({action:'continue',jobId:'old',confirm:true}),recovery.operation({action:'continue',jobId:'old',confirm:true})]);await drain(t);assert.equal(a.jobId,b.jobId);assert.equal(t.executed.length,1);assert.equal(t.executed[0].disk.jobs[0].retryJobId,a.jobId);
});
test('group message_bot children attach to the source for automatic result collection',async ctx=>{
  const t=await fixture(ctx),root={id:'group-work',botId:'a',roomId:'room',sessionId:'native',turnId:'turn',status:'running',task:'总任务',groupEpoch:0};t.state.jobs.push(root);
  const result=JSON.parse(await dispatchMessageBot(t,{to:'Bravo',message:'检查一项',request_id:'group-child'},{bot:t.bot('a'),room:t.room('room')},{sessionId:'native',turnId:'turn',groupEpoch:0}));await drain(t);assert(root.childIds.includes(result.jobId));assert.equal(t.state.jobs.find(j=>j.id===result.jobId).parentJobId,root.id);
});
test('failed batch commit never starts any sibling or leaks a batch to later saves',async ctx=>{
  const t=await fixture(ctx);await t.save();const rename=fs.rename;let once=true;ctx.mock.method(fs,'rename',async(from,to)=>{if(to===t.file&&once){once=false;throw Error('batch failed');}return rename(from,to);});
  await assert.rejects(()=>admitBatch(t,{room:t.room('room'),assignments:[{botId:'a',task:'一'},{botId:'b',task:'二'}],request:'并行工作',adminId:'chief'}),/batch failed/);await t.save();await drain(t);assert.equal(t.executed.length,0);assert.equal(t.state.jobs.length,0);assert.equal(t.state.workBatches?.length||0,0);
});
async function finishedBatch(t){
  await admitBatch(t,{room:t.room('room'),assignments:[{botId:'a',task:'一'},{botId:'b',task:'二'}],request:'检查一和二',adminId:'chief'});await drain(t);return t.state.workBatches[0];
}
test('concurrent group result collection has one persisted planner claim',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t);let calls=0;
  t.nativePlan=async()=>{calls++;const disk=JSON.parse(await fs.readFile(t.file));assert.equal(disk.workBatches[0].status,'planning');return {text:JSON.stringify({reply:'检查完成',assignments:[]})};};
  await Promise.all([t.runSummary(t.room('room'),batch.id),t.runSummary(t.room('room'),batch.id)]);assert.equal(calls,1);assert.equal(batch.status,'completed');assert.deepEqual(batch.resultIds,batch.jobIds);
});
test('group follow-up and its source batch link commit before the new worker starts',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t);t.nativePlan=async()=>({text:JSON.stringify({reply:'还需检查第三项',assignments:[{botId:'c',task:'核对第三项'}]})});await t.runSummary(t.room('room'),batch.id);await drain(t);
  assert.equal(t.executed.length,3);const saved=t.executed[2].disk,source=saved.workBatches.find(b=>b.id===batch.id);assert.equal(source.status,'completed');assert(saved.workBatches.some(b=>b.id===source.nextBatchId&&b.depth===1));assert.equal(t.room('room').log.filter(l=>l.summary).length,1);
});
test('failed child never becomes automatic retry work from the planner',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t);t.state.jobs[0].status='error';t.nativePlan=async()=>({text:JSON.stringify({reply:'重试',assignments:[{botId:'a',task:'再执行'}]})});await assert.rejects(()=>t.runSummary(t.room('room'),batch.id),/人工确认/);assert.equal(batch.status,'needs_review');assert.equal(t.state.jobs.length,2);
});
test('stopped batch and planning-unknown batch cannot auto-submit another planner turn',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t);let calls=0;t.nativePlan=async()=>{calls++;throw Error('should not prompt');};t.room('room').workEpoch=1;await t.runSummary(t.room('room'),batch.id);assert.equal(calls,0);assert.equal(batch.status,'needs_review');batch.status='planning';t.room('room').workEpoch=0;await t.runSummary(t.room('room'),batch.id);assert.equal(calls,0);
});
test('native prompt receipt loss is visible and is not retried automatically',async ctx=>{
  const t=await fixture(ctx);t.execute=Team.prototype.execute.bind(t);t.session=async()=> 'native';t.model=async()=>({key:'p/m'});t.integrations={images:{prepare:async()=>({attachments:[]})}};t.longMessages={prepare:async text=>({text,attachments:[]}),pack:async value=>value};let calls=0;
  t.invoke=async name=>{if(name==='agent/getStatus')return {status:{isRunning:false}};if(name==='agent/prompt'){calls++;throw Error('receipt lost');}throw Error(name);};
  const job=await admit(t,{bot:t.bot('a'),task:'实际执行'});await drain(t);assert.equal(calls,1);assert.equal(job.status,'needs_review');assert.equal(job.errorCode,'native_submission_unknown');assert.equal(t.waiters.size,0);
});
test('external state edits preserve both versions, pause admission and survive restart',async ctx=>{
  const {StateFile}=require('../src/state-file'),t=await fixture(ctx);await t.save();t.store=new StateFile(t.file);await t.store.acquire();await t.store.load();
  const external={...t.state,bots:t.state.bots.filter(b=>b.id!=='c')};await fs.writeFile(t.file,JSON.stringify(external));
  await assert.rejects(()=>admit(t,{bot:t.bot('a'),task:'不能执行'}),e=>e.code==='PI_BOT_STORE_CONFLICT');await drain(t);assert.equal(t.executed.length,0);assert(t.storeConflict);assert.equal(JSON.parse(await fs.readFile(t.file)).bots.length,3);assert.equal(t.state.bots.length,4);
  const local=JSON.parse(await fs.readFile(path.join(t.data,t.storeConflict.local)));assert.equal(local.jobs.length,0);assert.equal(local.bots.length,4);await t.store.close();const reopened=new StateFile(t.file);await reopened.acquire();t.store=reopened;const recovered=JSON.parse(await reopened.load());assert.equal(recovered.bots.length,4);assert(reopened.conflict);
  await t.resolveStoreConflict();assert.equal(t.storeConflict,null);assert.equal(JSON.parse(await fs.readFile(t.file)).bots.length,4);assert((await fs.readdir(t.data)).some(f=>f.endsWith('-external.json')));
});
test('a second live writer cannot open the same team data',async ctx=>{
  const {StateFile}=require('../src/state-file'),t=await fixture(ctx);t.store=new StateFile(t.file);await t.store.acquire();const second=new StateFile(t.file);await assert.rejects(()=>second.acquire(),/另一份/);await second.close();assert(await fs.stat(t.file+'.lock'));
});
test('pending view is paginated, does not claim verification and stale acknowledgement fails',async ctx=>{
  const t=await fixture(ctx);for(let i=0;i<42;i++)t.state.jobs.push({id:'j'+i,botId:'a',task:'任务',status:'completed',at:new Date().toISOString()});t.state.jobs.push({id:'bad',botId:'a',task:'失败任务',status:'error',error:'错误',at:new Date().toISOString()});
  const page=t.attention.list({category:'done',limit:20});assert.equal(page.total,42);assert.equal(page.rows.length,20);assert.equal(page.next,20);assert(page.rows.every(r=>r.verification==='not_checked'));const issue=t.attention.list({category:'issues'}).rows[0];t.state.jobs.at(-1).error='已变化';await assert.rejects(()=>t.attention.operation({action:'seen',id:issue.id,version:issue.version}),/状态已变化/);const fresh=t.attention.list({category:'issues'}).rows[0];await t.attention.operation({action:'seen',id:fresh.id,version:fresh.version});assert.equal(t.attention.list({category:'issues'}).total,0);
});
test('memory review keeps valid changes despite malformed, oversized and unknown-entry neighbors',async ctx=>{
  const t=await fixture(ctx);t.models=async()=>[{key:'p/m',isDefault:true}];t.model=async()=>({key:'p/m'});t.complete=async()=>({text:JSON.stringify({changes:[null,{op:'add',text:'群报告优先使用中文。'},{op:'add',text:'长'.repeat(301)},{op:'remove',entry:9999}]})});t.memory=await require('../src/memory').createMemoryAdapter(t,{review:true,reviewDelayMs:1});
  const room=t.room('room');room.log.push({id:'memory-user',who:'User',text:'以后本群报告都用中文。',at:new Date().toISOString()});t.memory.groupStatus(room,'chief','running');t.memory.groupStatus(room,'chief','idle');await new Promise(r=>setTimeout(r,30));await t.memory.rt.drainMemory();const view=await t.memory.endpoint('memory-view',{roomId:'room'});assert.equal(view.entries.length,1);assert.equal(view.entries[0].text,'群报告优先使用中文。');assert(t.state.diagnostics.some(d=>d.message.includes('1,3,4')));assert(!JSON.stringify(t.state.diagnostics).includes('长'.repeat(100)));
});
test('quoted Bot names resolve without changing names or bypassing privacy',async ctx=>{
  const t=await fixture(ctx),{findBot}=require('../src/bot-reference');assert.equal(findBot(t,'“Bravo”').id,'b');assert.equal(t.bot('b').name,'Bravo');t.bot('b').private=true;await assert.rejects(()=>dispatchMessageBot(t,{to:'「Bravo」',message:'秘密',request_id:'private-test'},{bot:t.bot('a')},{sessionId:'s'}),/私密/);
});
test('oversized group notices reject before changing live room settings',async ctx=>{
  const t=await fixture(ctx),room=t.room('room');room.notice='原公告';await assert.rejects(()=>t.upsertRoom({...room,name:'不能改',notice:'字'.repeat(16001)}),/16000/);assert.equal(room.name,'群聊');assert.equal(room.notice,'原公告');
});
test('private planner assignments do not leave uncollectable group batches',async ctx=>{
  const t=await fixture(ctx);await admitBatch(t,{assignments:[{botId:'a',task:'独立任务'}],request:'私聊规划',adminId:'chief'});await drain(t);assert.equal(t.executed.length,1);assert.equal(t.state.workBatches?.length||0,0);assert.equal(t.state.jobs[0].batchId,undefined);
});
test('group without an administrator keeps its original worker result path',async ctx=>{
  const t=await fixture(ctx);t.room('room').adminId=null;await admitBatch(t,{room:t.room('room'),assignments:[{botId:'a',task:'原路径'}],request:'全体回答'});await drain(t);assert.equal(t.executed.length,1);assert.equal(t.state.workBatches?.length||0,0);
});
for(const status of ['interrupted','needs_review','aborted'])test(status+' group result is retained without another model submission',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t);t.state.jobs[0].status=status;let calls=0;t.nativePlan=async()=>{calls++;};await t.runSummary(t.room('room'),batch.id);assert.equal(calls,0);assert.equal(batch.status,'needs_review');assert.equal(t.state.jobs.length,2);
});
test('admission captures the original group generation before waiting for storage',async ctx=>{
  const t=await fixture(ctx),blocked=barrier();t.writes=blocked.promise;const run=admit(t,{room:t.room('room'),bot:t.bot('a'),task:'旧轮次'});run.catch(()=>{});t.room('room').workEpoch=1;blocked.resolve();await assert.rejects(run,/停止/);await drain(t);assert.equal(t.executed.length,0);
});
test('answer to an old administrator question cannot reopen a stopped group',async ctx=>{
  const t=await fixture(ctx),q={id:'old-question',botId:'chief',roomId:'room',groupEpoch:0,text:'是否继续',answer:'继续',deliveryPending:true};t.room('room').workEpoch=1;let calls=0;t.submitMessage=async()=>{calls++;};await assert.rejects(()=>deliverQuestion(t,q),/停止/);assert.equal(calls,0);assert.equal(q.deliveryPending,true);
});
test('a queued result delivery cannot cross a group stop',async ctx=>{
  const t=await fixture(ctx),job={id:'late-result',botId:'a',replyTo:'b',replyRoomId:'room',replyGroupEpoch:0,status:'completed',result:'旧结果'};t.state.jobs.push(job);const blocked=barrier();t.writes=blocked.promise;const run=t.deliverResult(job);run.catch(()=>{});await new Promise(r=>setImmediate(r));t.room('room').workEpoch=1;blocked.resolve();await assert.rejects(run,/停止/);await drain(t);assert.equal(t.executed.length,0);assert.equal(job.replyDelivered,undefined);
});
test('an old source batch cannot create a second follow-up chain',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t);batch.status='completed';batch.nextBatchId='already-linked';await assert.rejects(()=>admitBatch(t,{room:t.room('room'),assignments:[{botId:'c',task:'不能重复'}],request:batch.request,adminId:'chief',sourceBatch:batch}),/原批次已经改变/);await drain(t);assert.equal(t.executed.length,2);
});
test('answered question delivery errors remain visible in pending attention',async ctx=>{
  const t=await fixture(ctx);t.state.questions.push({id:'q-error',botId:'a',status:'answered',deliveryPending:true,deliveryError:'本群已停止'});assert(t.attention.list({category:'issues'}).rows.some(r=>r.kind==='answer'&&r.sourceId==='q-error'));
});
test('conflict resolution invalidates old group generations and an in-flight private planner',async ctx=>{
  const t=await fixture(ctx),{StateFile}=require('../src/state-file'),entered=barrier(),unblock=barrier();t.context=()=>'';t.complete=async()=>{entered.resolve();await unblock.promise;return {text:JSON.stringify({reply:'旧分派',assignments:[{botId:'a',task:'不能启动'}]})};};
  await t.save();t.store=new StateFile(t.file);await t.store.acquire();await t.store.load();const old=t.runPrivateChat('chief','测试',{acceptedInput:true});old.catch(()=>{});await entered.promise;await fs.writeFile(t.file,JSON.stringify({...t.state,prefs:{external:true}}));await assert.rejects(()=>t.save(),e=>e.code==='PI_BOT_STORE_CONFLICT');await t.resolveStoreConflict();assert.equal(t.room('room').workEpoch,1);unblock.resolve();await assert.rejects(old,/执行状态已改变/);await drain(t);assert.equal(t.executed.length,0);
});
test('administrator planning cannot submit before its own claim is saved',async ctx=>{
  const t=await fixture(ctx);await t.save();t.session=async()=> 'native';let prompts=0;t.invoke=async name=>{if(name==='agent/getStatus')return {status:{isRunning:false}};prompts++;throw Error('must not prompt');};
  const rename=fs.rename;let once=true;ctx.mock.method(fs,'rename',async(from,to)=>{if(to===t.file&&once){once=false;throw Error('planner claim save failed');}return rename(from,to);});await assert.rejects(()=>t.nativePlan(t.room('room'),t.bot('chief'),'规划','plan',Date.now()),/planner claim save failed/);assert.equal(prompts,0);
});
test('group collection waits for the user and for the admitted answer task',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t),original=t.state.jobs[0];original.sessionId='question-native';original.turnId='question-turn';original.status='running';
  await createQuestion(t,{question:'选择哪个方案',choices:['A','B']},{bot:t.bot('a'),room:t.room('room')},{sessionId:'question-native',turnId:'question-turn',groupEpoch:0});const q=t.state.questions.at(-1);assert.equal(q.sourceJobId,original.id);original.status='completed';let calls=0;t.nativePlan=async()=>{calls++;return {text:JSON.stringify({reply:'回答后的工作已交回',assignments:[]})};};
  await t.runSummary(t.room('room'),batch.id);assert.equal(calls,0);assert.equal(batch.status,'running');q.status='answered';q.answer='A';q.deliveryPending=true;t.execute=async job=>{job.status='running';t.executed.push({id:job.id,disk:JSON.parse(await fs.readFile(t.file))});};await deliverQuestion(t,q);await drain(t);assert(batch.jobIds.includes(q.deliveryJobId));assert(t.executed.at(-1).disk.workBatches[0].jobIds.includes(q.deliveryJobId));await t.runSummary(t.room('room'),batch.id);assert.equal(calls,0);const answer=t.state.jobs.find(j=>j.id===q.deliveryJobId);answer.status='completed';answer.result='已按方案A完成';await t.runSummary(t.room('room'),batch.id);assert.equal(calls,1);assert.equal(batch.status,'completed');assert(batch.resultIds.includes(answer.id));
});
test('group report waits for collection and all follow-up batches before returning upstream',async ctx=>{
  const t=await fixture(ctx),batch=await finishedBatch(t),room=t.room('room'),{deliverRoundReports}=require('../src/group-reports');const report={id:'report',roundId:batch.id,replyTo:'chief',botId:'chief',status:'running'};room.reports=[report];let deliveries=0;t.deliverResult=async r=>{deliveries++;r.replyDelivered=true;};
  await deliverRoundReports(t,room);assert.equal(deliveries,0);t.nativePlan=async()=>({text:JSON.stringify({reply:'还缺第三项',assignments:[{botId:'c',task:'第三项'}]})});await t.runSummary(room,batch.id);await drain(t);await deliverRoundReports(t,room);assert.equal(deliveries,0);const next=t.state.workBatches.find(b=>b.id===batch.nextBatchId);t.state.jobs.find(j=>j.id===next.jobIds[0]).result='第三项真实结果';t.nativePlan=async()=>({text:JSON.stringify({reply:'三项已汇总，尚未独立验收',assignments:[]})});await t.runSummary(room,next.id);await deliverRoundReports(t,room);await deliverRoundReports(t,room);assert.equal(deliveries,1);assert(report.result.includes('第三项真实结果'));assert(report.result.includes('三项已汇总'));assert.equal(report.status,'completed');
});
test('missing child evidence cannot leave a controller waiting silently',async ctx=>{
  const t=await fixture(ctx),root=waiting(t);t.state.jobs=t.state.jobs.filter(j=>j.id!=='child-1');await t.handoffs.resume(root);assert.equal(root.status,'needs_review');assert.equal(t.executed.length,0);assert(t.attention.list({category:'issues'}).rows.some(row=>row.sourceId==='root'));
});
test('long group planning preserves complete material through the existing attachment path',async ctx=>{
  const t=await fixture(ctx),long='完整原始资料。'.repeat(5000),evidence={text:JSON.stringify({reply:'已读取材料',assignments:[]}),replies:[{role:'assistant'}],usage:{operations:[]}};t.session=async()=> 'native';t.model=async()=>({key:'mock/model'});t.inspectOnce=async()=>evidence;t.inspect=async()=>evidence;
  t.longMessages={pack:async value=>value,prepare:async(text,session,name)=>{assert.equal(text,long);assert.equal(session,'native');assert.equal(name,'群聊规划资料.txt');return {text:'请读取全文附件',attachments:[{path:'mock/planning.txt',kind:'file'}]};}};let prompt;
  t.invoke=async(name,args)=>{if(name==='agent/getStatus')return {status:{isRunning:false}};if(name==='agent/prompt'){prompt=args[0];const disk=JSON.parse(await fs.readFile(t.file));assert.equal(disk.rooms[0].planningClaim.status,'submitting');return {accepted:true,turnId:'plan-turn'};}throw Error(name);};
  const result=await t.nativePlan(t.room('room'),t.bot('chief'),long,'planning-long',Date.now());assert.equal(result.text,evidence.text);assert(prompt.content.includes('请读取全文附件'));assert(prompt.content.length<5000);assert.equal(prompt.attachments[0].path,'mock/planning.txt');
});
