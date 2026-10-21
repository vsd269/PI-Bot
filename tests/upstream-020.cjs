'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {Team}=require('../src/team'),{Vault}=require('../src/vault'),{createMemoryAdapter}=require('../src/memory');
const {checkedView,checkedAnswer,createView,answerView,deliverView,validateRecords,replyOf}=require('../src/views');
const {validateState,pausedState}=require('../src/backups'),{installTools}=require('../src/tools');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(ctx,{memory=false,review=false}={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-bot-0383-')),t=new Team({__testHost:true,models:{list:async()=>[]}});
  t.data=dir;t.file=path.join(dir,'team.json');t.queueCheckpoint=()=>{};
  t.state={version:1,bots:[{id:'admin',name:'Chief',role:'Administrator',modelKey:'test/model',sessions:{}},{id:'worker',name:'Worker',role:'Worker',modelKey:'test/model',sessions:{private:'private-worker',roomA:'native-A',roomB:'native-B'},chat:[]}],rooms:[{id:'roomA',name:'项目甲',members:['admin','worker'],adminId:'admin',log:[]},{id:'roomB',name:'项目乙',members:['admin','worker'],adminId:'admin',log:[]}],jobs:[],questions:[],views:[],schedules:[],archives:[],completions:[],prefs:{}};
  t.vault=new Vault({...t,backups:{root:dir}});t.models=async()=>[{key:'test/model',isDefault:true}];t.model=async()=>({key:'test/model'});
  t.mentions=await import('../src/upstream/mentions.mjs');
  t.modelCalls=[];t.complete=async(bot,system,messages,scope)=>{t.modelCalls.push({bot:bot.id,system,messages,scope});return {text:t.modelReply||JSON.stringify({changes:[]})};};
  t.receipts=[];t.submitMessage=async(kind,id,content,options)=>{if(!t.receipts.some(r=>r.options.clientMessageId===options.clientMessageId))t.receipts.push({kind,id,content,options});return {accepted:true};};
  if(memory)t.memory=await createMemoryAdapter(t,{review,reviewDelayMs:1});
  ctx.after(async()=>{await t.memory?.close();await Promise.allSettled([...t.background]);await fs.rm(dir,{recursive:true,force:true});});return t;
}
const optionView={type:'options',id:'pick',options:[{label:'方案甲'},{label:'方案乙'}]};
const formView={type:'form',id:'details',fields:[{id:'name',label:'项目名称'}]};
const create=(t,view=optionView)=>createView(t,{title:'请选择',view},{bot:t.bot('worker')},{sessionId:'private-worker'});
test('group remember defaults to group; private and other group cannot read it',async ctx=>{
  const t=await fixture(ctx,{memory:true});const out=await t.memory.tools.get('remember').execute({text:'项目甲固定使用紫杉目录。'},{agent:{id:'native-A'}});assert.match(out,/Saved to the group memory/);
  const view=await t.memory.endpoint('memory-view',{roomId:'roomA'});assert.equal(view.entries[0].scope,'group');assert.match(view.entries[0].text,/紫杉/);
  assert.equal((await t.memory.view('worker')).entries.length,0);assert.equal((await t.memory.endpoint('memory-view',{roomId:'roomB'})).entries.length,0);
  assert(!t.memory.section(t.bot('worker'),'private-worker').includes('紫杉'));assert(!t.memory.section(t.bot('worker'),'native-B').includes('紫杉'));assert(t.memory.section(t.bot('worker'),'native-A').includes('紫杉'));
  assert.equal((await fs.readFile(path.join(t.data,'memory/groups/roomA/MEMORY.md'),'utf8')).includes('紫杉'),true);
});
test('new group updates ownership maps; main Bot and direct UI can add group entries',async ctx=>{
  const t=await fixture(ctx,{memory:true});t.state.rooms.push({id:'newRoom',name:'新群',members:['admin','worker'],adminId:'admin',log:[]});
  await t.memory.add({roomId:'newRoom',text:'新群的目标是完成本地演示。'});const own=await t.memory.view('admin');assert(!own.entries.length);
  assert(t.memory.section(t.bot('admin'),'group-admin:newRoom:admin').includes('本地演示'));assert(t.memory.rt.state.rooms.newRoom);
});
test('group without an admin still has a member keeper and accepts panel entries',async ctx=>{
  const t=await fixture(ctx,{memory:true});t.state.rooms[0].adminId=null;await t.memory.add({roomId:'roomA',text:'项目甲使用二阶段验收。'});assert.equal((await t.memory.endpoint('memory-view',{roomId:'roomA'})).entries.length,1);
});
test('removed member cannot recall or write the previous group memory',async ctx=>{
  const t=await fixture(ctx,{memory:true});await t.memory.add({roomId:'roomA',text:'项目甲内部称呼为远山。'});t.state.rooms[0].members=['admin'];
  const recalled=await t.memory.tools.get('recall').execute({scope:'group',query:'远山'},{agent:{id:'native-A'}});assert(!recalled.includes('项目甲内部称呼'));
  const wrote=await t.memory.tools.get('remember').execute({text:'不应保存的成员记录。'},{agent:{id:'native-A'}});assert(!/^Saved to/.test(wrote));assert.equal(t.memory.section(t.bot('worker'),'native-A'),'');
});
test('automatic group review writes group only and runs with group model accounting',async ctx=>{
  const t=await fixture(ctx,{memory:true,review:true});t.modelReply=JSON.stringify({changes:[{op:'add',text:'项目甲的验收要求为中文报告。',team:true}]});
  t.state.rooms[0].log.push({who:'User',text:'以后本群的验收都使用中文报告。',at:new Date().toISOString()});t.memory.groupStatus(t.state.rooms[0],'admin','running');t.memory.groupStatus(t.state.rooms[0],'admin','idle');await wait(30);await t.memory.rt.drainMemory();
  assert.equal((await t.memory.endpoint('memory-view',{roomId:'roomA'})).entries.length,1);assert.equal((await t.memory.view('admin')).entries.length,0);assert.equal(t.modelCalls[0].scope.roomId,'roomA');
});
test('group panel ask uses group keeper and can update only that group',async ctx=>{
  const t=await fixture(ctx,{memory:true});t.modelReply=JSON.stringify({reply:'已更新',changes:[{op:'add',text:'项目甲周五交付。',team:true}]});
  await t.memory.endpoint('memory-ask',{roomId:'roomA',text:'请记住本群周五交付'});assert.equal((await t.memory.endpoint('memory-view',{roomId:'roomA'})).entries.length,1);assert.equal((await t.memory.view('admin')).entries.length,0);
});
test('group deletion archives memory after durable deletion without slowing response',async ctx=>{
  const t=await fixture(ctx,{memory:true});await t.memory.add({roomId:'roomA',text:'项目甲需要保留归档。'});await t.deleteRoom('roomA',true);await Promise.allSettled([...t.background]);
  const files=await fs.readdir(path.join(t.data,'memory/archive'));assert(files.some(name=>name.startsWith('group-roomA-')));assert(!t.state.rooms.some(room=>room.id==='roomA'));await assert.rejects(()=>t.memory.endpoint('memory-view',{roomId:'roomA'}),/Unknown group/);
});
test('failed group deletion preserves group memory and roster',async ctx=>{
  const t=await fixture(ctx,{memory:true});await t.memory.add({roomId:'roomA',text:'项目甲不能被错误删除。'});const save=t.save;t.save=async()=>{throw Error('DISK_FAILURE');};await assert.rejects(()=>t.deleteRoom('roomA',true),/DISK_FAILURE/);t.save=save;assert.equal((await t.memory.endpoint('memory-view',{roomId:'roomA'})).entries.length,1);
});
test('existing personal/team memory survives migration without guessing historical origin',async ctx=>{
  const t=await fixture(ctx);await fs.mkdir(path.join(t.data,'memory/bots/worker'),{recursive:true});await fs.writeFile(path.join(t.data,'memory/bots/worker/MEMORY.md'),'# Memory\n- 用户喜欢清楚的报告。\n');t.memory=await createMemoryAdapter(t,{review:false});assert.equal((await t.memory.view('worker')).entries[0].text,'用户喜欢清楚的报告。');assert.equal((await t.memory.endpoint('memory-view',{roomId:'roomA'})).entries.length,0);
});
test('all upstream component types validate; host and renderer use identical protocol',async()=>{
  const upstream=await import(pathToFileURL(path.resolve(__dirname,'../renderer/upstream/views.mjs')).href);const host=require('../src/upstream/views.cjs');
  const view={type:'stack',children:[{type:'text',text:'<img src=x onerror=alert(1)>'},{type:'metric',label:'完成量',value:3,tone:'good'},{type:'table',columns:[{key:'name',label:'名称'}],rows:[['样例']]},{type:'progress',percent:40},optionView,{type:'confirm',id:'ok'},formView]};
  assert(checkedView('交互卡片',view).interactive);for(const name of ['checkShownView','validateView','validateViewAnswer','normalizeView','viewSummary'])assert.equal(host[name].toString(),upstream[name].toString());
  assert.equal(checkedView('进度',{type:'progress',percent:'35'}).view.percent,35);
});
test('rejects invalid/overlarge/executable blueprints and credential forms before saving',async ctx=>{
  const t=await fixture(ctx);for(const view of [{type:'html',text:'bad'},{type:'text',text:'bad',onclick:'alert(1)'},{type:'text',text:'字'.repeat(4000)},{type:'progress',percent:101},{type:'form',id:'keys',fields:[{id:'apiKey',label:'密钥'}]}])await assert.rejects(()=>create(t,view));assert(!t.state.views.length);
  await assert.rejects(()=>createView(t,{title:'群卡',view:optionView},{bot:t.bot('worker'),room:t.state.rooms[0]},{}),/仅用于 Bot 私聊/);
});
test('static cards persist and await_reply must agree with the controls',async ctx=>{
  const t=await fixture(ctx);await create(t,{type:'text',text:'完成了'});assert.equal(t.state.views[0].status,'displayed');const disk=JSON.parse(await fs.readFile(t.file,'utf8'));assert.equal(disk.views[0].view.text,'完成了');
  await assert.rejects(()=>createView(t,{title:'错误等待',view:{type:'text',text:'a'},await_reply:true},{bot:t.bot('worker')},{}));await assert.rejects(()=>createView(t,{title:'错误等待',view:optionView,await_reply:false},{bot:t.bot('worker')},{}));
});
test('interactive answers are validated; repeated/concurrent submission delivers once',async ctx=>{
  const t=await fixture(ctx);await create(t);const id=t.state.views[0].id;await assert.rejects(()=>answerView(t,{id,action:'pick',values:{selected:['不存在']}}));
  const input={id,action:'pick',values:{selected:['方案甲']}};await Promise.all([answerView(t,input),answerView(t,input)]);await answerView(t,input);assert.equal(t.receipts.length,1);assert.equal(t.state.views[0].status,'answered');const reply=JSON.parse(t.receipts[0].content);assert.equal(reply.views[0].title,'请选择');assert.equal(reply.answers[0].values.selected[0],'方案甲');
});
test('save failure rolls back card creation and pending-card supersession',async ctx=>{
  const t=await fixture(ctx);await create(t);const previous=t.state.views[0];t.save=async()=>{throw Error('DISK_FAILURE');};await assert.rejects(()=>create(t,formView),/DISK_FAILURE/);assert.equal(t.state.views.length,1);assert.equal(previous.status,'pending');await assert.rejects(()=>answerView(t,{id:previous.id,action:'pick',values:{selected:['方案甲']}}),/DISK_FAILURE/);assert.equal(previous.status,'pending');assert.equal(t.receipts.length,0);
});
test('a failed delivery keeps the persisted answer retryable across restart',async ctx=>{
  const t=await fixture(ctx);await create(t,formView);const view=t.state.views[0],deliver=t.submitMessage;let failed=true;t.submitMessage=async(...args)=>{const value=await deliver(...args);if(failed){failed=false;throw Error('LINK_LOST');}return value;};
  await assert.rejects(()=>answerView(t,{id:view.id,action:'details',values:{fields:{name:'PI Bot'}}}),/LINK_LOST/);const disk=JSON.parse(await fs.readFile(t.file,'utf8'));assert.equal(disk.views[0].deliveryPending,true);assert.equal(disk.views[0].values.fields.name,'PI Bot');t.state=disk;await deliverView(t,t.state.views[0]);assert.equal(t.receipts.length,1);assert.equal(t.state.views[0].deliveryPending,false);
});
test('pending cards survive ordinary restart; backup restore pauses them',async ctx=>{
  const t=await fixture(ctx);await create(t);validateState(t.state);const disk=JSON.parse(await fs.readFile(t.file,'utf8'));assert.equal(disk.views[0].status,'pending');const paused=pausedState(t.state);assert.equal(paused.views[0].status,'interrupted');assert.equal(paused.views[0].deliveryPending,false);assert.equal(t.state.views[0].status,'pending');
});
test('dismissal and newer interactive card settle old controls without submitting',async ctx=>{
  const t=await fixture(ctx);await create(t);const first=t.state.views[0];await create(t,formView);assert.equal(first.status,'superseded');await assert.rejects(()=>answerView(t,{id:first.id,action:'pick',values:{selected:['方案甲']}}));await answerView(t,{id:t.state.views[1].id,dismissed:true});assert.equal(t.state.views[1].status,'dismissed');assert.equal(t.receipts.length,0);
});
test('malformed card backups and answers are refused',async ctx=>{
  const t=await fixture(ctx);await create(t);for(const patch of [{status:'bogus'},{botId:'deleted'},{view:{type:'script'}},{roomId:'roomA'},{status:'answered',action:'pick',values:{selected:['bad']}}])assert.throws(()=>validateRecords([{...t.state.views[0],...patch}],t.state.bots));assert.throws(()=>checkedAnswer(formView,'details',{fields:{unknown:'value'}}));assert.throws(()=>checkedAnswer(optionView,'pick',{selected:['方案甲','方案乙']}));
});
test('show_view is registered only for PI-owned private sessions',async ctx=>{
  const t=await fixture(ctx),tools=new Map();t.pi.agent={registerTool:async tool=>tools.set(tool.name,tool),unregisterTool:async()=>{}};const installed=await installTools(t);ctx.after(()=>installed.close());const tool=tools.get('show_view');assert(tool);await assert.rejects(()=>tool.execute({title:'x',view:optionView},{sessionId:'foreign'}),/PI-bot sessions only/);await assert.rejects(()=>tool.execute({title:'x',view:optionView},{sessionId:'native-A'}),/仅用于 Bot 私聊/);await tool.execute({title:'x',view:optionView},{sessionId:'private-worker'});assert.equal(t.state.views.length,1);
});
test('message times hide invalid dates; durations use actual measurements only',async()=>{
  const {messageTime,replyDuration}=await import(pathToFileURL(path.resolve(__dirname,'../renderer/message-time.mjs')).href);assert.equal(messageTime('bad'),null);assert.equal(messageTime(undefined),null);assert.equal(messageTime('2026-10-21T03:04:00Z').iso,'2026-10-21T03:04:00.000Z');assert.equal(replyDuration(undefined),'');assert.equal(replyDuration(-1),'');assert.equal(replyDuration(0),'<1 秒');assert.equal(replyDuration(68000),'1 分 8 秒');
});
test('long administrator policy cannot push group memory out of the compact plan prompt',async ctx=>{
  const t=await fixture(ctx,{memory:true});t.bot('admin').instructions='Policy detail. '.repeat(1500);await t.memory.add({roomId:'roomA',text:'本群专用验收代号为银杏。'});let prompt;
  t.nativePlan=async(room,bot,input)=>{prompt=input;return {text:JSON.stringify({reply:'收到',assignments:[]})};};t.applyAdminActions=async()=>{};await t.coordinate(t.state.rooms[0],'你好');assert(prompt.includes('本群专用验收代号为银杏'));assert(t.state.rooms[0].log[0].durationMs>=0);
});
test('a new user message supersedes only that Bot pending card after admission',async ctx=>{
  const t=await fixture(ctx);await create(t);const card=t.state.views[0];t.state.views.push({...structuredClone(card),id:'other-card',botId:'admin'});t.enqueue=(room,bot,task,round,options)=>{const job={id:'new-job',botId:bot.id,task,status:'queued',...options};t.state.jobs.push(job);return job;};
  await Team.prototype.submitMessage.call(t,'bot','worker','直接继续做吧',{clientMessageId:'user-1'});assert.equal(card.status,'superseded');assert.equal(t.state.views[1].status,'pending');
});
test('view answer keeps the full machine-readable card while the user sees a short answer',async ctx=>{
  const t=await fixture(ctx);await create(t,formView);await answerView(t,{id:t.state.views[0].id,action:'details',values:{fields:{name:'PI Bot'}}});const receipt=t.receipts[0];assert.equal(JSON.parse(receipt.content).views[0].view.type,'form');assert.match(receipt.options.sourceUserContent,/项目名称：PI Bot/);assert(!receipt.options.sourceUserContent.includes('answer_to_pending_view'));
});
test('deleting a Bot cleans live cards and retains their summary and original blueprint in archive',async ctx=>{
  const t=await fixture(ctx);await create(t);await t.deleteBot('worker',true);assert.equal(t.state.views.length,0);const archive=t.state.archives.find(item=>item.kind==='bot');assert(archive.lines.some(line=>line.text.includes('[交互卡片]')));assert.equal(archive.views[0].view.type,'options');validateState(t.state);
});
test('unchanged cards are not resent with each streaming state delta',async ctx=>{
  const t=await fixture(ctx);const {createStateSync}=require('../src/state-sync');const sync=createStateSync();t.state.views=Array.from({length:80},(_,index)=>({id:'v'+index,botId:'worker',title:'静态卡片',view:{type:'text',text:'资料'.repeat(1000)},status:'displayed',at:new Date().toISOString()}));t.state.jobs=[{id:'job',botId:'worker',progress:'第一段',status:'running'}];const first=sync(t.state);t.state.jobs[0].progress+=' 第二段';const delta=sync(t.state,first.cursor);assert(!Object.hasOwn(delta.patch,'views'));assert(Buffer.byteLength(JSON.stringify(delta))<1500);
});
