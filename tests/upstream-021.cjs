'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Team}=require('../src/team'),{Vault}=require('../src/vault'),{Handoffs}=require('../src/handoffs'),{createMemoryAdapter}=require('../src/memory');
const relay=require('../src/group-relay'),asides=require('../src/asides'),{checkedView,checkedAnswer}=require('../src/views'),{validateState,pausedState}=require('../src/backups');
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fixture(ctx){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-upstream-021-'));const t=new Team({__testHost:true,models:{list:async()=>[{key:'test/model',isDefault:true}]},agent:{complete:async()=>({text:'独立回答',usage:{inputTokens:10,outputTokens:5}})}});
  t.data=dir;t.file=path.join(dir,'team.json');t.queueCheckpoint=()=>{};t.handoffs=new Handoffs(t);
  t.state={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',sessions:{}},{id:'a',name:'Alpha',role:'Worker',sessions:{private:'native-a'},chat:[{id:'u',who:'User',text:'项目预算为300元。',at:new Date().toISOString()}]},{id:'b',name:'Bravo',role:'Worker',sessions:{}},{id:'c',name:'Charlie',role:'Worker',sessions:{}}],rooms:[{id:'room',name:'项目群',members:['chief','a','b','c'],adminId:'chief',log:[]}],jobs:[],views:[],asides:[],completions:[],questions:[],prefs:{}};
  for(const bot of t.state.bots)bot.modelKey='test/model';
  t.vault=new Vault({backups:{root:dir},bot:id=>t.bot(id),state:t.state,save:()=>t.save()});t.mentions=await import('../src/upstream/mentions.mjs');t.executed=[];t.execute=async job=>{t.executed.push(job.id);job.status='completed';};
  ctx.after(async()=>{await t.memory?.close();await Promise.allSettled([...t.background,...t.memberChains.values()]);await fs.rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});});return t;
}
const source=(t,text,options={})=>{const job={id:'source-'+t.state.jobs.length,botId:'a',result:text,status:'completed',...options};t.state.jobs.push(job);return job;};
test('unreadable memory blocks writes and prompt reads recover without freezing empty snapshots',async ctx=>{
  const t=await fixture(ctx),file=path.join(t.data,'memory/bots/a/MEMORY.md');await fs.mkdir(file,{recursive:true});t.memory=await createMemoryAdapter(t,{review:false});
  const result=await t.memory.tools.get('remember').execute({text:'不能覆盖旧文件。'},{agent:{id:'native-a'}});assert.match(result,/无法读取|could not be read/);assert((await fs.stat(file)).isDirectory());assert.match(t.memory.section(t.bot('a'),'native-a'),/could not be read/);
  await fs.rmdir(file);await fs.writeFile(file,'# Memory\n- 文件恢复后仍能读取。\n');assert.match(t.memory.section(t.bot('a'),'native-a'),/文件恢复后/);assert.equal((await t.memory.view('a')).entries.length,1);
});
test('unreadable memory directory is not treated as an empty topic list',async ctx=>{
  const t=await fixture(ctx),dir=path.join(t.data,'memory/bots/a');await fs.mkdir(path.dirname(dir),{recursive:true});await fs.writeFile(dir,'original bytes');t.memory=await createMemoryAdapter(t,{review:false});
  await assert.rejects(()=>t.memory.view('a'),/无法读取/);assert.equal(await fs.readFile(dir,'utf8'),'original bytes');assert(t.memory.section(t.bot('a'),'native-a'));
});
test('each group has a member-based default limit and independently preserves overflow',async ctx=>{
  const t=await fixture(ctx),room=t.room('room');assert.equal(relay.limitOf(room),12);room.relayLimit=1;
  const job=source(t,'@Bravo 和 @Charlie 请检查');await t.delegateMentions(room,job);assert.equal(room.relayCount,1);assert.equal(room.pausedRelays.length,1);assert(room.log.some(l=>l.text.includes('暂停')));
  const disk=JSON.parse(await fs.readFile(t.file,'utf8'));assert.equal(disk.rooms[0].pausedRelays.length,1);validateState(disk);
  await relay.resume(t,room);assert.equal(room.pausedRelays.length,0);const count=t.state.jobs.length;await relay.resume(t,room);assert.equal(t.state.jobs.length,count);
});
test('cycle protection keeps the blocked call for explicit user continuation',async ctx=>{
  const t=await fixture(ctx),room=t.room('room');await t.delegateMentions(room,source(t,'@Bravo 请继续'));const child=t.state.jobs.find(j=>j.relayKey);child.result='@Alpha 请核对';await t.delegateMentions(room,child);assert.equal(room.pausedRelays.length,1);assert(room.pausedRelays[0].blocked);await relay.resume(t,room);assert.equal(room.pausedRelays.length,0);assert(t.state.jobs.some(j=>j.botId==='a'&&j.relayKey));
});
test('concurrent duplicate delegation enqueues once and keeps source attachments',async ctx=>{
  const t=await fixture(ctx),room=t.room('room'),job=source(t,'@Bravo 请查看',{attachments:[{path:path.join(t.data,'file.txt')}],referencesText:'reference'});await Promise.all([t.delegateMentions(room,job),t.delegateMentions(room,job)]);const children=t.state.jobs.filter(j=>j.relayKey);assert.equal(children.length,1);assert.deepEqual(children[0].attachments,job.attachments);assert.equal(children[0].referencesText,'reference');
});
test('queued relay never executes before admission is durable; failure restores pending work',async ctx=>{
  const t=await fixture(ctx),room=t.room('room'),save=t.save.bind(t),blocked=gate();let calls=0;t.save=async()=>{calls++;if(calls===2){assert.equal(t.executed.length,0);await blocked.promise;throw Error('DISK_FAILURE');}return save();};
  const run=t.delegateMentions(room,source(t,'@Bravo 请检查')),failure=assert.rejects(run,/DISK_FAILURE/);while(calls<2)await new Promise(r=>setTimeout(r,1));blocked.resolve();await failure;assert.equal(room.pausedRelays.length,1);assert.equal(t.state.jobs.filter(j=>j.relayKey).length,0);assert.equal(t.executed.length,0);t.save=save;await relay.resume(t,room);assert.equal(room.pausedRelays.length,0);
});
test('another user message resumes saved relays and still coordinates the new request',async ctx=>{
  const t=await fixture(ctx),room=t.room('room');room.relayLimit=1;await t.delegateMentions(room,source(t,'@Bravo @Charlie 继续'));let coordinated='';t.coordinate=async(_room,text)=>{coordinated=text;};await t.sendGroup(room.id,'继续并检查结果',{clientMessageId:'human'});await t.roomChains.get(room.id);assert.equal(room.pausedRelays.length,0);assert.equal(coordinated,'继续并检查结果');
});
test('restored relay options cannot overwrite target Bot, group, job ID or safety flags',async ctx=>{
  const t=await fixture(ctx),room=t.room('room');room.pausedRelays=[{id:'p',key:'k',botId:'b',sourceJobId:'s',task:'检查',options:{botId:'chief',roomId:'evil',id:'evil',isHandoffReply:true,fromBotId:'a'}}];await relay.resume(t,room);const job=t.state.jobs[0];assert.equal(job.botId,'b');assert.equal(job.roomId,room.id);assert.notEqual(job.id,'evil');assert.equal(job.isHandoffReply,undefined);
});
test('side questions use independent text completion, preserve main history and account for usage',async ctx=>{
  const t=await fixture(ctx),before=JSON.stringify(t.bot('a')),jobs=t.state.jobs.length;let request;t.pi.agent.complete=async input=>{request=input;return {text:'预算是300元。',usage:{inputTokens:12,outputTokens:6}};};await t.submitMessage('bot','a','/btw 预算是多少？',{clientMessageId:'aside-client'});await Promise.all([...t.background]);assert.equal(t.state.asides[0].status,'answered');assert.match(request.messages[0].content,/300元/);assert.equal(request.tools,undefined);assert.equal(JSON.stringify(t.bot('a')),before);assert.equal(t.state.jobs.length,jobs);assert.equal(t.state.completions[0].kind,'btw');assert(!require('../src/history').linesOf(t,'bot','a').some(l=>l.text.includes('预算是多少')));
});
test('side question submission is idempotent; group use is rejected',async ctx=>{
  const t=await fixture(ctx),input={botId:'a',question:'进度？',clientMessageId:'same'};const results=await Promise.all([asides.ask(t,input),asides.ask(t,input)]);assert.equal(results[0].id,results[1].id);assert.equal(t.state.asides.length,1);assert.throws(()=>t.submitMessage('room','room','/btw 问题'),/仅用于 Bot 私聊/);
});
test('cancel and dismiss survive late completion and backup validation',async ctx=>{
  const t=await fixture(ctx),g=gate();t.pi.agent.complete=()=>g.promise;const reply=await asides.ask(t,{botId:'a',question:'临时问题'});await asides.operate(t,{id:reply.id,action:'cancel'});await asides.operate(t,{id:reply.id,action:'dismiss'});g.resolve({text:'迟到答案'});await Promise.all([...t.background]);assert.equal(t.state.asides[0].status,'cancelled');assert.equal(t.state.asides[0].dismissed,true);assert.equal(t.state.asides[0].answer,undefined);validateState(t.state);const paused=pausedState({...t.state,asides:[{...t.state.asides[0],status:'answering'}]});assert.equal(paused.asides[0].status,'cancelled');
});
test('calculator cards validate formulas, limit byte size and submit only declared inputs',()=>{
  const view={type:'stack',let:{total:'price * 2'},children:[{type:'slider',id:'price',label:'单价',min:0,max:100,step:1,value:10},{type:'metric',label:'合计',value:{'=':'total'}},{type:'chart',kind:'bar',categories:['合计'],series:[{values:[{'=':'total'}]}]},{type:'submit',id:'done',label:'确认'}]};const checked=checkedView('计算器',view);assert(checked.interactive);assert.equal(checkedAnswer(view,'done',{inputs:{price:30}}).inputs.price,30);assert.throws(()=>checkedAnswer(view,'done',{inputs:{price:200}}));assert.throws(()=>checkedAnswer(view,'done',{inputs:{unknown:1}}));const protocol=require('../src/upstream/views.cjs');assert.equal(protocol.resolve({'=':'total'},protocol.viewScope(view,{price:30})),60);assert.throws(()=>checkedView('bad',{type:'metric',label:'bad',value:{'=':'globalThis.process.exit()'}}));
});
test('layout preferences validate atomically and persist across file reload',async ctx=>{
  const t=await fixture(ctx);await t.preferences({compact:true,messageLayout:'flat',bubbleWidth:90,textWidth:75,showThinking:true});assert.equal(JSON.parse(await fs.readFile(t.file,'utf8')).prefs.textWidth,75);const before=JSON.stringify(t.state.prefs);await assert.rejects(()=>t.preferences({compact:true,messageLayout:'bubble',bubbleWidth:74}));assert.equal(JSON.stringify(t.state.prefs),before);
});
test('editing secret purpose preserves value and rejects nonexistent entries',async ctx=>{
  const t=await fixture(ctx);t.vault.entries=[{botId:'a',name:'API_TOKEN',value:'never-display-this-value'}];t.vault.persist=async entries=>{t.vault.entries=entries;};await t.vault.purpose({botId:'a',name:'API_TOKEN',purpose:'读取资料'});assert.equal(t.vault.entries[0].value,'never-display-this-value');assert.equal(t.vault.list('a').entries[0].purpose,'读取资料');assert.equal(t.vault.list('a').entries[0].value,undefined);await t.vault.purpose({botId:'a',name:'API_TOKEN',purpose:''});assert.equal(t.vault.entries[0].purpose,'');await assert.rejects(()=>t.vault.purpose({botId:'a',name:'UNKNOWN',purpose:'x'}));
});
test('secret replacement and encrypted transfer preserve purpose metadata',async ctx=>{
  const t=await fixture(ctx);t.vault.entries=[{botId:'a',name:'API_TOKEN',value:'test-only-original',purpose:'只读取资料'}];t.vault.persist=async entries=>{t.vault.validate(entries);t.vault.entries=entries;};await t.vault.set({botId:'a',name:'API_TOKEN',value:'test-only-replacement'});assert.equal(t.vault.entries[0].purpose,'只读取资料');const text=await t.vault.export({password:'test-password-only'});t.vault.entries=[];await t.vault.importTransfer({text,password:'test-password-only'});assert.equal(t.vault.entries[0].purpose,'只读取资料');assert.equal(t.vault.entries[0].value,'test-only-replacement');assert.throws(()=>t.vault.validate([{botId:'a',name:'API_TOKEN',value:'valid',purpose:123}]));
});
test('new operations are admitted through the actual renderer bridge allowlist',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../main.js'),'utf8'),allowlist=source.split('\n').find(line=>line.includes("if(!['team.updates'"));
  for(const op of ['team.group.continue','team.btw.start','team.btw.action','team.secret.purpose'])assert(allowlist.includes("'"+op+"'"),op);
});
test('pending relays survive Team restart and are removed with a deleted Bot',async ctx=>{
  const t=await fixture(ctx),room=t.room('room');room.relayLimit=1;await t.delegateMentions(room,source(t,'@Bravo @Charlie 检查'));const saved=JSON.parse(await fs.readFile(t.file,'utf8'));t.state=saved;await relay.resume(t,t.room('room'));assert.equal(t.room('room').pausedRelays.length,0);assert(t.state.jobs.some(j=>j.botId==='c'&&j.relayKey));
  t.room('room').pausedRelays=[{id:'gone',key:'gone:c',botId:'c',sourceJobId:'s',task:'never run',options:{fromBotId:'a'}}];t.state.bots=t.state.bots.filter(b=>b.id!=='c');require('../src/roster-cleanup').cleanupRoster(t.state);assert.equal(t.room('room').pausedRelays.length,0);
});
test('invalid aside action cannot silently cancel an active answer',async ctx=>{
  const t=await fixture(ctx),g=gate();t.pi.agent.complete=()=>g.promise;const card=await asides.ask(t,{botId:'a',question:'临时问题'});await assert.rejects(()=>asides.operate(t,{id:card.id,action:'invalid'}));assert.equal(t.state.asides[0].status,'answering');g.resolve({text:'正常回答'});await Promise.all([...t.background]);assert.equal(t.state.asides[0].status,'answered');
});
