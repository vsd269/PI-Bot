'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RendererRequests}=require('../src/renderer-requests'),{Team}=require('../src/team');
const gate=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:(v)=>resolve(v)};};
const tick=()=>new Promise(r=>setImmediate(r));

test('pending renderer requests survive two minutes and active long chunk reads retain their lease',async()=>{
  let now=0;const store=new RendererRequests({now:()=>now}),g=gate();
  const {id}=store.start({},()=>g.promise);await tick();now=125000;
  store.start({},()=>({other:true}));assert.deepEqual(store.read({id}),{pending:true});
  g.resolve({text:'中文'.repeat(24000)});await tick();let text='',offset=0,done=false;
  while(!done){now+=55000;store.start({},()=>null);const result=store.read({id,offset});assert.deepEqual(store.read({id,offset}),result);text+=result.chunk;offset+=result.chunk.length;done=result.done;}
  assert.equal(JSON.parse(text).text.length,48000);store.release(id);assert.throws(()=>store.read({id}),/失效/);
});
test('large Unicode responses negotiate gzip through the actual renderer client without data loss',async()=>{
  const {createClient}=await import('../renderer/rpc.mjs'),store=new RendererRequests(),value={text:'中文🙂\n"\\'.repeat(30000)};let reads=0;
  const client=createClient(async(_,{method,args})=>{if(method==='request.start')return store.start(args,()=>value);if(args.release)return store.release(args.id);reads++;return store.read(args);});
  assert.deepEqual(await client('team.state',{}),value);assert(reads<=2,'compressed state must not queue hundreds of chunks');
});
test('stop and native question operations precede queued history/catalog chunks',async()=>{
  const {createClient}=await import('../renderer/rpc.mjs'),g=gate(),entered=gate(),calls=[];
  const client=createClient(async(_,{method,args})=>{calls.push({method,args});if(method==='request.start'){if(args.channel==='team.state'){entered.resolve();await g.promise;}return {id:args.channel};}return {chunk:'{}',done:true};});
  const state=client('team.state',{});await entered.promise;const history=client('team.history.search',{}),stop=client('team.group.stop',{});g.resolve();await Promise.all([state,history,stop]);assert.equal(calls[1].args.channel,'team.group.stop');
});
test('application reads are not starved by an ongoing multi-chunk state response',async()=>{
  const {createClient}=await import('../renderer/rpc.mjs'),g=gate(),entered=gate(),calls=[];let chunks=0;
  const client=createClient(async(_,{method,args})=>{
    calls.push({method,args});
    if(method==='request.start'){if(args.channel==='team.state'){entered.resolve();await g.promise;}return {id:args.channel};}
    if(args.release)return {released:true};
    if(args.id==='team.state'&&++chunks<6)return {chunk:'',done:false};
    return {chunk:'{}',done:true};
  });
  const state=client('team.state',{});await entered.promise;
  const apps=client('team.apps',{action:'catalog'});g.resolve();await Promise.all([state,apps]);
  assert.equal(calls[1].args.channel,'team.apps','directory request must run before the remaining state chunks');
});
function state(){return {bots:[{id:'a',name:'管理员',role:'Administrator',sessions:{g:'plan'}},{id:'b',name:'成员',role:'Worker',sessions:{private:'private',g:'worker'}}],rooms:[{id:'g',adminId:'a',members:['a','b'],planning:true,log:[],planningClaim:{sessionId:'plan',turnId:'pt',planningId:'p',status:'accepted',at:'2026-11-13T00:00:00Z'}}],jobs:[{id:'j',botId:'b',roomId:'g',sessionId:'worker',turnId:'wt',status:'running',at:'2026-11-13T00:00:00Z'}],questions:[]};}
test('administrator planning streams before completion and never exposes raw assignments or unrelated turns',async()=>{
  const {createLiveResponses}=await import('../renderer/live-responses.mjs'),s=state(),live=createLiveResponses({getState:()=>s,onChange(){},source:{}});
  const emit=(sessionId,turnId,id,text)=>live.receive({sessionId,turnId,event:{type:'message_update',stream:'delta',message:{id,role:'assistant',content:''},deltaText:text}});
  emit('plan','pt','m','{"reply":"正在核对');assert.equal(live.planning(s.rooms[0].planningClaim),'正在核对');
  emit('plan','pt','m','文件","assignments":[{"botId":"b"}]}');assert.equal(live.planning(s.rooms[0].planningClaim),'正在核对文件');
  emit('worker','wt','w','执行中');assert.equal(live.progress(s.jobs[0]),'执行中');
  emit('worker','old','old','不能串入');assert.equal(live.progress(s.jobs[0]),'执行中');
  live.receive({sessionId:'worker',ts:Date.parse('2026-11-13T00:00:02Z'),event:{type:'message_update',stream:'delta',message:{id:'w',role:'assistant',content:''},deltaText:'继续'}});assert.equal(live.progress(s.jobs[0]),'执行中继续');
  live.receive({sessionId:'worker',parentToolCallId:'child',turnId:'wt',event:{type:'message_end',message:{id:'sub',role:'assistant',content:'子代理不重复显示'}}});assert.equal(live.progress(s.jobs[0]),'执行中继续');live.close();
});
async function nativeFixture(){
  const {createNativeQuestions}=await import('../renderer/native-questions.mjs'),s=state(),calls=[],pending=new Map(),callbacks=new Map();let fail=false;
  const source={channels:{invoke:{pendingInteractive:'pending',askToolResolve:'resolve'},event:{agentMessage:'message'}},on(channel,cb){callbacks.set(channel,cb);return()=>callbacks.delete(channel);},async invoke(channel,input){calls.push({channel,input});if(channel==='pending')return {asks:pending.get(input.sessionId)||[]};if(fail)throw Error('transport unavailable');pending.set(input.sessionId,[]);return {ok:true};}};
  const ui=createNativeQuestions({getState:()=>s,getSelection:()=>({kind:'room',id:'g'}),onChange(){},source,intervalMs:60000});
  const request={sessionId:'worker',requestId:'req',toolCallId:'tool',questions:[{question:'选颜色',options:[{label:'蓝色',description:'冷色调'},'红色']},{question:'补充说明',options:[],multiSelect:true}]};
  return {s,ui,calls,pending,callbacks,request,fail:v=>fail=v};
}
test('native questions restore from host, collect every answer and resolve the original tool only once',async()=>{
  const f=await nativeFixture();try{
    f.pending.set('worker',[f.request]);await f.ui.sync();let cards=f.ui.list();assert.equal(cards.length,2);assert.equal(cards[0].roomId,'g');assert.equal(cards[0].options[0].description,'冷色调');
    await f.ui.answer({id:cards[0].id,selected:['蓝色']});assert.equal(f.calls.filter(c=>c.channel==='resolve').length,0);
    await f.ui.answer({id:cards[1].id,text:'请先核对文件'});const resolutions=f.calls.filter(c=>c.channel==='resolve');assert.equal(resolutions.length,1);assert.deepEqual(resolutions[0].input,{sessionId:'worker',requestId:'req',answers:[['蓝色'],['请先核对文件']]});
    await f.ui.sync();assert.equal(f.ui.list().length,0);
  }finally{f.ui.close();}
});
test('native answer errors preserve pending choices; rejection sends nulls and unrelated sessions never appear',async()=>{
  const f=await nativeFixture();try{
    f.ui.receive({...f.request,sessionId:'unrelated'});assert.equal(f.ui.list().length,0);f.ui.receive(f.request);const cards=f.ui.list();
    await assert.rejects(()=>f.ui.answer({id:cards[0].id,selected:['不存在']}),/无效/);
    await f.ui.answer({id:cards[0].id,selected:['红色']});f.fail(true);await assert.rejects(()=>f.ui.answer({id:cards[1].id,text:'hello'}),/transport/);assert.equal(f.ui.list()[1].status,'pending');f.fail(false);
    await f.ui.answer({id:cards[1].id,rejectRequest:true});assert.deepEqual(f.calls.at(-1).input.answers,[null,null]);
  }finally{f.ui.close();}
});
test('live native question arriving during an older empty host read is preserved',async()=>{
  const {createNativeQuestions}=await import('../renderer/native-questions.mjs'),s=state(),g=gate();
  const ui=createNativeQuestions({getState:()=>s,onChange(){},source:{channels:{invoke:{pendingInteractive:'pending',askToolResolve:'resolve'}},invoke:()=>g.promise},intervalMs:60000});
  try{const reading=ui.sync();ui.receive({sessionId:'worker',requestId:'live',questions:[{question:'继续吗',options:['继续']}]});g.resolve({asks:[]});await reading;assert.equal(ui.list().length,1);}finally{ui.close();}
});
test('cancel interrupts exact native turn before disk saves and accepts already finished UI requests',async()=>{
  const t=new Team({}),g=gate(),calls=[];t.state.jobs=[{id:'j',botId:'b',sessionId:'native',turnId:'turn',status:'running'}];t.save=()=>g.promise;t.invoke=async(op,args)=>{calls.push({op,args});};
  const stopping=t.cancel('j');assert.equal(calls[0].op,'agent/abort');assert.deepEqual(calls[0].args,[{sessionId:'native',turnId:'turn'}]);g.resolve();await stopping;t.state.jobs[0].status='completed';assert.equal((await t.cancel('j')).alreadyFinished,true);assert.equal(calls.filter(c=>c.op==='agent/abort').length,1);
});
test('stale terminal jobs stop only their still-running native turn and never a replacement turn',async()=>{
  const t=new Team({}),calls=[];t.state.jobs=[{id:'j',status:'completed',sessionId:'s',turnId:'old'}];let turn='new';
  t.invoke=async(op,args)=>{calls.push({op,args});return op==='agent/getStatus'?{status:{isRunning:true,currentTurnId:turn}}:{aborted:true};};
  assert.equal((await t.cancel('j')).alreadyFinished,true);assert.equal(calls.filter(c=>c.op==='agent/abort').length,0);turn='old';assert.equal((await t.cancel('j')).requested,true);assert.equal(calls.filter(c=>c.op==='agent/abort').length,1);
});
test('group notices use administrator identity; group results do not mark private chats unread',()=>{
  const t=new Team({});t.state=state();t.log(t.state.rooms[0],'System','停止了');assert.equal(t.state.rooms[0].log[0].botId,'a');assert.equal(t.state.rooms[0].log[0].who,'管理员');
  t.publishResult(t.state.rooms[0],{id:'j',botId:'b',result:'完成',status:'completed'});assert.equal(t.state.rooms[0].unread,true);assert.equal(t.state.bots[1].unread,undefined);
});
test('@ administrator enters administrator planning even in everyone mode, never worker admission',async()=>{
  const t=new Team({});t.state=state();const room=t.state.rooms[0];room.planning=false;room.replyMode='everyone';room.executionMode='parallel';t.mentions=await import('../src/upstream/mentions.mjs');t.save=async()=>{};t.context=()=>'';t.vault={redact:v=>v};let planned=0;
  t.nativePlan=async()=>{planned++;return {text:JSON.stringify({reply:'由管理员处理',assignments:[]})};};t.applyAdminActions=async()=>{};
  await t.coordinate(room,'@管理员 请汇总当前进度');assert.equal(planned,1);assert.equal(t.state.jobs.length,1);assert(room.log.some(l=>l.text==='由管理员处理'));
});
test('read acknowledgements suppress stale polls but preserve new messages and manual unread',async ctx=>{
  const {createActiveRead}=await import('../renderer/active-read.mjs');const oldWindow=global.window,oldDocument=global.document;global.window=new EventTarget();global.document=new EventTarget();ctx.after(()=>{if(oldWindow===undefined)delete global.window;else global.window=oldWindow;if(oldDocument===undefined)delete global.document;else global.document=oldDocument;});
  let item={unread:true,chat:[{id:'one'}]},count=0;const g=gate();
  const read=createActiveRead({getSelection:()=>({kind:'bot',id:'b'}),getItem:()=>item,enabled:()=>true,acknowledge:()=>{count++;return g.promise;},onChange(){}});
  try{read.check();assert.equal(item.unread,true,'first render retains its unread navigation divider');await tick();assert.equal(item.unread,false);g.resolve();await tick();item={unread:true,chat:[{id:'one'}]};read.check();assert.equal(item.unread,false);assert.equal(count,1);
    item={unread:true,chat:[{id:'two'}]};read.check();await tick();assert.equal(count,2);read.manual();item.unread=true;read.check();assert.equal(item.unread,true);
  }finally{read.dispose();}
});
