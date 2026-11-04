'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const {Team}=require(root+'/src/team'),{Vault}=require(root+'/src/vault'),{Backups,validateState,parseArchive}=require(root+'/src/backups'),{LongMessages}=require(root+'/src/long-messages');
const {Handoffs}=require(root+'/src/handoffs'),{Integrations}=require(root+'/src/integrations'),{WindowsMicrophone}=require(root+'/src/windows-microphone'),{startupSnapshot}=require(root+'/src/startup');
const {postToGroup}=require(root+'/src/group-actions');
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(ctx){
 const dir=await fs.mkdtemp(path.join(__dirname,'fixture-')),team=new Team({models:{list:async()=>[]}});
 team.data=dir;team.file=path.join(dir,'team.json');team.state={version:1,bots:[{id:'admin',name:'Chief',role:'Administrator',modelKey:'',sessions:{}},{id:'worker',name:'Worker',role:'Worker',modelKey:'',sessions:{},chat:[]}],rooms:[],jobs:[],schedules:[],questions:[],archives:[],unattended:{sent:0}};
 team.vault=new Vault({...team,backups:{root:dir}});team.handoffs=new Handoffs(team);team.longMessages=new LongMessages(team);team.queueCheckpoint=()=>{};
 team.mentions=await import(pathToFileURL(root+'/src/upstream/mentions.mjs').href);
 const effects=[];team.bridge={disconnectBot:async id=>effects.push('mcp:'+id)};team.memory={rt:{},archive:async id=>effects.push('memory:'+id)};
 team.integrations={operations:new Set(),record(){},github:{close:()=>effects.push('github')},browser:{stop:async id=>effects.push('browser:'+id)},configureApi:async()=>effects.push('api'),stopBot:async id=>effects.push('commands:'+id)};
 ctx.after(async()=>{await Promise.allSettled([...team.background]);await fs.rm(dir,{recursive:true,force:true});});return {team,dir,effects};
}
const command=(botIds=['worker'])=>({id:'cmd',command:process.execPath,args:[],botIds,envRefs:{},enabled:false});
const config=()=>({commands:[command()],api:{enabled:true,ownerId:'worker',botIds:['worker','admin'],port:0},speech:{worker:{provider:'qwen',model:'fun-asr-realtime'}},speechGlobal:{provider:'qwen',model:'fun-asr-realtime'}});
const disk=async t=>JSON.parse(await fs.readFile(t.file,'utf8'));
const restart=async t=>{const b=new Backups(t);await b.prepare();const state=await t.longMessages.restore(await disk(t));validateState(state);return {b,state};};
test('delete cleans commands, API and legacy speech; restart never resurrects Bot',async ctx=>{
 const {team:t,effects}=await fixture(ctx);t.state.integrations=config();await t.save();const b=new Backups(t);await b.checkpoint(t.state,'before-delete',true);
 await t.deleteBot('worker',true);await Promise.allSettled([...t.background]);validateState(t.state);
 assert.deepEqual(t.state.integrations.commands[0].botIds,[]);assert.equal(t.state.integrations.api.enabled,false);assert.equal(t.state.integrations.api.ownerId,'');assert.deepEqual(t.state.integrations.api.botIds,['admin']);assert.deepEqual(t.state.integrations.speech,{});assert.equal(t.state.integrations.speechGlobal.model,'fun-asr-realtime');
 const r=await restart(t);assert.deepEqual(r.state.bots.map(b=>b.id),['admin']);assert.equal(r.b.recovered,undefined);assert(effects.includes('memory:worker'));assert(effects.includes('browser:worker'));
});
test('upgrade migrates already-dangling references instead of loading older roster backup',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.integrations=config();t.state.github={ownerId:'worker'};await t.save();await new Backups(t).checkpoint(t.state,'old-valid',true);
 t.state.bots=t.state.bots.filter(b=>b.id!=='worker');t.state.secretRequests=[{id:'request',botId:'worker',name:'TOKEN',status:'pending',reason:'test'}];t.state.botConnectors=[];await t.save();
 const r=await restart(t);assert.deepEqual(r.state.bots.map(b=>b.id),['admin']);assert.equal(r.state.github,undefined);assert.deepEqual(r.state.secretRequests,[]);assert.equal(r.b.recovered,undefined);
 assert((await fs.readdir(r.b.root)).some(n=>n.startsWith('before-roster-migration-')));const second=await restart(t);assert.equal(second.b.recovered,undefined);
});
test('long archived bot message restores in full before semantic validation',async ctx=>{
 const {team:t}=await fixture(ctx);const text='完整段落🙂'.repeat(6000);t.bot('worker').chat=[{id:'m1',who:'Worker',text}];await t.deleteBot('worker',true);
 const raw=await disk(t);assert.equal(typeof raw.archives[0].lines[0].text,'object');const r=await restart(t);assert.equal(r.state.archives[0].lines[0].text,text);assert.equal(r.b.recovered,undefined);
 const b=new Backups(t);const {text:backup}=await b.archive(r.state);assert.equal(parseArchive(backup).payload.team.archives[0].lines[0].text,text);
});
test('deleting last worker archives empty room and its history, schedules and session mapping',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.rooms=[{id:'room',name:'Worker',named:false,members:['worker'],adminId:null,log:[{id:'message',text:'retain room history'}]}];t.state.schedules=[{id:'s',targetKind:'room',targetId:'room'}];t.state.questions=[{id:'q',roomId:'room'}];t.bot('admin').sessions.room='native';t.bot('admin').sessionWorkspaces={room:'C:/work'};t.bot('admin').groupPermissions={room:{sessionId:'native'}};
 await t.deleteBot('worker',true);assert.equal(t.state.rooms.length,0);assert.equal(t.state.schedules.length,0);assert.equal(t.state.questions.length,0);assert.equal(t.bot('admin').sessions.room,undefined);assert.equal(t.bot('admin').sessionWorkspaces.room,undefined);assert.equal(t.bot('admin').groupPermissions.room,undefined);assert.equal(t.state.archives.find(a=>a.kind==='room').lines[0].text,'retain room history');
 assert.equal((await restart(t)).state.rooms.length,0);
});
test('upgrade repairs old empty room without restoring deleted member',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.rooms=[{id:'room',name:'old',members:[],adminId:null,log:[{text:'old text'}]}];await t.save();const r=await restart(t);assert.equal(r.state.rooms.length,0);assert.equal(r.state.archives[0].lines[0].text,'old text');
});
test('actual corrupt roster still fails without a valid backup',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.bots[1].role='invalid';await t.save();await assert.rejects(()=>restart(t),/损坏/);
});
test('missing long-message file triggers real backup recovery and preserves damaged file',async ctx=>{
 const {team:t}=await fixture(ctx);const b=new Backups(t);await b.checkpoint(t.state,'good',true);t.bot('worker').chat=[{text:'X'.repeat(21001)}];await t.save();const raw=await disk(t);await fs.rm(path.join(t.data,'message-files',raw.bots[1].chat[0].text.$piBotText+'.txt'));
 const r=await restart(t);assert(r.b.recovered);assert((await fs.readdir(b.root)).some(n=>n.startsWith('damaged-')));
});
test('missing long-message file with no backup fails rather than silently starting a new roster',async ctx=>{
 const {team:t}=await fixture(ctx);t.bot('worker').chat=[{text:'X'.repeat(21001)}];await t.save();const raw=await disk(t);await fs.rm(path.join(t.data,'message-files',raw.bots[1].chat[0].text.$piBotText+'.txt'));await assert.rejects(()=>restart(t),/损坏/);
});
test('tampered long-message file is not accepted',async ctx=>{
 const {team:t}=await fixture(ctx);t.bot('worker').chat=[{text:'X'.repeat(21001)}];await t.save();const raw=await disk(t);await fs.writeFile(path.join(t.data,'message-files',raw.bots[1].chat[0].text.$piBotText+'.txt'),'Y'.repeat(21001));await assert.rejects(()=>restart(t),/损坏/);
});
for(const action of ['create','update','duplicate','delete'])test(action+' rolls back after simulated save failure and preserves concurrent chat',async ctx=>{
 const {team:t,effects}=await fixture(ctx);t.state.integrations=config();t.state.rooms=[{id:'room',name:'Worker',named:false,members:['worker'],adminId:null,log:[{text:'keep'}]}];const original=structuredClone(t.state);t.save=async()=>{t.bot('admin').chat=[{text:'new concurrent message'}];throw Error('DISK_FAILURE');};
 const run=action==='create'?()=>t.upsertBot({name:'New',role:'Worker',compact:true},'new'):action==='update'?()=>t.upsertBot({...t.bot('worker'),name:'Changed',compact:true}):action==='duplicate'?()=>t.duplicateBot('worker'):()=>t.deleteBot('worker',true);
 await assert.rejects(run,/DISK_FAILURE/);assert.deepEqual(t.state.bots.map(b=>b.id),original.bots.map(b=>b.id));assert.equal(t.bot('worker').name,'Worker');assert.equal(t.state.rooms[0].name,'Worker');assert.deepEqual(t.state.integrations,original.integrations);assert.equal(t.state.archives.length,0);assert.equal(t.bot('admin').chat[0].text,'new concurrent message');assert.deepEqual(effects,[]);
});
test('pending disk failure cannot leak a failed create into a later queued save',async ctx=>{
 const {team:t}=await fixture(ctx);await t.save();const entered=gate(),release=gate(),originalRename=fs.rename;let first=true;
 ctx.mock.method(fs,'rename',async(...args)=>{if(args[1]===t.file&&first){first=false;entered.resolve();await release.promise;throw Error('RENAME_FAILURE');}return originalRename(...args);});
 const creating=t.upsertBot({name:'New',role:'Worker',compact:true},'ghost');const failure=assert.rejects(creating,/RENAME_FAILURE/);await entered.promise;t.bot('admin').chat=[{text:'concurrent'}];const later=t.save();release.resolve();await failure;await later;
 const saved=await disk(t);assert(!saved.bots.some(b=>b.id==='ghost'));assert.equal(saved.bots[0].chat[0].text,'concurrent');
});
test('pending deletion failure cannot leak deleted roster into a queued save',async ctx=>{
 const {team:t,effects}=await fixture(ctx);t.state.integrations=config();await t.save();const entered=gate(),release=gate(),originalRename=fs.rename;let first=true;
 ctx.mock.method(fs,'rename',async(...args)=>{if(args[1]===t.file&&first){first=false;entered.resolve();await release.promise;throw Error('RENAME_FAILURE');}return originalRename(...args);});
 const removing=t.deleteBot('worker',true),failure=assert.rejects(removing,/RENAME_FAILURE/);await entered.promise;t.bot('admin').chat=[{text:'unrelated'}];const later=t.save();release.resolve();await failure;await later;
 const saved=await disk(t);assert(saved.bots.some(b=>b.id==='worker'));assert.equal(saved.bots[0].chat[0].text,'unrelated');assert.equal(saved.integrations.api.enabled,true);assert.deepEqual(effects,[]);
});
test('slow resource cleanup cannot hold visible deletion open',async ctx=>{
 const {team:t}=await fixture(ctx),release=gate();t.memory.archive=()=>release.promise;
 try{const result=await Promise.race([t.deleteBot('worker',true),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('blocked cleanup')),2000);timer.unref();})]);assert.deepEqual(result,{deleted:'worker'});}finally{release.resolve();}
});
test('updating a bot does not overwrite messages added while validating an avatar',async ctx=>{
 const {team:t}=await fixture(ctx),b=t.bot('worker'),modelGate=gate(),entered=gate();t.models=async()=>{entered.resolve();await modelGate.promise;return [{key:'new'}];};const updating=t.upsertBot({...b,modelKey:'new',compact:true});await entered.promise;b.chat.push({text:'concurrent'});modelGate.resolve();await updating;assert.equal(b.chat[0].text,'concurrent');
});
test('useful mutual mentions continue; new human message resets separate unattended budget',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.bots.push({id:'third',name:'Third',role:'Worker',modelKey:''});const room={id:'room',members:['worker','third'],log:[]};t.state.rooms=[room];t.enqueue=(room,bot,task,round,options)=>{const j={id:'j'+t.state.jobs.length,botId:bot.id,...options};t.state.jobs.push(j);return j;};
 await t.delegateMentions(room,{botId:'worker',result:'@Third 请继续'});assert.equal(t.state.jobs.length,1);const job=t.state.jobs[0];job.result='@Worker 已检查，请补齐缺少的附件';await t.delegateMentions(room,job);assert.equal(t.state.jobs.length,2);assert.equal(room.log.some(l=>l.text.includes('暂停')),false);
 t.state.unattended.sent=40;await assert.rejects(()=>t.admitBotMessage(),/暂停/);t.userSpoke();await t.admitBotMessage();assert.equal(t.state.unattended.sent,1);
});
test('legitimate A to B to C automatic handoff still works',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.bots=[{id:'a',name:'Alpha',role:'Worker'},{id:'b',name:'Bravo',role:'Worker'},{id:'c',name:'Charlie',role:'Worker'}];const room={id:'room',members:['a','b','c'],log:[]};t.state.rooms=[room];t.enqueue=(r,b,task,round,o)=>{const j={id:'j'+t.state.jobs.length,botId:b.id,...o};t.state.jobs.push(j);return j;};
 await t.delegateMentions(room,{id:'source',botId:'a',result:'@Bravo 检查'});t.state.jobs[0].result='@Charlie 完成';await t.delegateMentions(room,t.state.jobs[0]);assert.deepEqual(t.state.jobs.map(j=>j.botId),['b','c']);assert.deepEqual(t.state.jobs[1].mentionPath,['a','b']);
});
test('concurrent automatic admissions enforce a shared 40-message ceiling',async ctx=>{
 const {team:t}=await fixture(ctx);t.save=async()=>{};const outcomes=await Promise.allSettled(Array.from({length:60},()=>t.admitBotMessage()));assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,40);assert.equal(t.state.unattended.sent,40);
});
test('failed admission does not consume budget',async ctx=>{const {team:t}=await fixture(ctx);t.save=async()=>{throw Error('disk');};await assert.rejects(()=>t.admitBotMessage());assert.equal(t.state.unattended.sent,0);});
test('idle automatic handoffs show a pause in group without scheduling another job',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.bots.push({id:'b',name:'Bravo',role:'Worker'});const room={id:'room',members:['worker','b'],log:[],relayGuard:{idle:5,recent:[]}};t.state.rooms=[room];t.enqueue=()=>{throw Error('must not enqueue');};await t.delegateMentions(room,{id:'source',botId:'worker',result:'@Bravo 收到'});assert(room.log.some(l=>l.text.includes('暂停')));assert.equal(room.pausedRelays.length,1);
});
test('repeated cross-group posting stops before reserving a new round',async ctx=>{
 const {team:t}=await fixture(ctx);const r={id:'other',name:'Other',botRounds:0};await assert.rejects(()=>postToGroup(t,r,{message:'hi'},{bot:t.bot('admin')},{hop:40}),/暂停/);assert.equal(t.roomPending.size,0);assert.equal(r.botRounds,0);
});
function child(){const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();c.kill=()=>{};return c;}
for(const event of ['error','exit'])test('first microphone helper '+event+' rejects cleanly and permits retry',async()=>{
 const children=[];const mic=new WindowsMicrophone({}, {team:{bot:()=>{}}},{spawnProcess:()=>{const c=child();children.push(c);return c;}});
 const starting=mic.operation({action:'begin',botId:'worker'}),failure=assert.rejects(starting,/录音/);await new Promise(r=>setImmediate(r));assert.doesNotThrow(()=>children[0].emit(event,Error('mock')));await failure;assert.equal(mic.starting,false);assert.equal(mic.current,null);assert.equal(mic.pending.size,0);
 const retry=mic.ready();children[1].stdout.write('{"type":"ready"}\n');await retry;assert.equal(children.length,2);await mic.close();children[1].emit('exit',0);
});
test('microphone crash during capture marks recording as error and cancels stream',async()=>{
 const c=child(),mic=new WindowsMicrophone({}, {},{spawnProcess:()=>c});let cancelled=0;const ready=mic.ready();c.stdout.write('{"type":"ready"}\n');await ready;mic.current={status:'listening',stream:{cancel:()=>cancelled++}};c.emit('exit',1);assert.equal(mic.current.status,'error');assert.equal(cancelled,1);assert.equal(mic.child,null);
});
test('config keeps names, IDs, paths and model names while prose and tool output are redacted',async ctx=>{
 const {team:t}=await fixture(ctx);t.vault.entries=[{botId:'admin',name:'TOKEN',value:'Work'}];const b=t.bot('worker');b.modelKey='Worker-model';b.workDir='C:/Worker';b.instructions='Work exactly';b.chat=[{text:'Work',who:'Worker'}];b.memory='Work';t.state.jobs=[{id:'Worker-job',botId:'worker',modelKey:'Worker-model',task:'Work',result:'Work',toolEvents:[{stdout:'Work',detail:'Work'}]}];
 await t.save();for(const saved of [await disk(t),t.snapshot(),startupSnapshot(t,{kind:'bot',id:'worker'})]){assert.equal(saved.bots[1].name,'Worker');assert.equal(saved.bots[1].modelKey,'Worker-model');assert.equal(saved.bots[1].workDir,'C:/Worker');assert.equal(saved.bots[1].instructions,'Work exactly');assert.equal(saved.bots[1].chat[0].text,'[密钥已隐藏]');assert.equal(saved.jobs[0].task,'[密钥已隐藏]');assert.equal(saved.jobs[0].id,'Worker-job');}
 const {archive}=await new Backups(t).archive();assert.equal(archive.payload.team.bots[1].name,'Worker');assert.equal(archive.payload.team.jobs[0].result,'[密钥已隐藏]');assert.equal(archive.payload.team.jobs[0].toolEvents[0].stdout,'[密钥已隐藏]');validateState(archive.payload.team);
});
test('raw, URI and base64 secrets remain redacted from backup memory and archived chat',async ctx=>{
 const {team:t}=await fixture(ctx),secret='synthetic/key+123';t.vault.entries=[{botId:'admin',name:'TOKEN',value:secret}];const variants=[secret,encodeURIComponent(secret),Buffer.from(secret).toString('base64')];t.bot('worker').chat=variants.map(text=>({text}));await t.deleteBot('worker',true);await fs.mkdir(path.join(t.data,'memory'));await fs.writeFile(path.join(t.data,'memory','test.md'),variants.join(' '));const {archive,text}=await new Backups(t).archive();for(const v of variants)assert(!text.includes(v));assert.equal(archive.payload.team.archives[0].lines[0].text,'[密钥已隐藏]');assert(archive.payload.memory['memory/test.md'].includes('[密钥已隐藏]'));
});
test('integration settings cannot reintroduce a Bot deleted while the save was queued',async ctx=>{
 const {team:t}=await fixture(ctx);const i=new Integrations(t);i.configureApi=async()=>{};const old={commands:[command()],api:{enabled:false,botIds:['worker'],port:0}};const deleting=t.deleteBot('worker',true);const saving=i.save({config:old});await deleting;await assert.rejects(saving,/Bot/);assert(!t.state.integrations?.api?.botIds?.includes('worker'));
});
test('backup config fingerprint changes when integrations change',async ctx=>{const {team:t}=await fixture(ctx),b=new Backups(t);const before=b.configKey(t.state);t.state.integrations={commands:[command()]};assert.notEqual(b.configKey(t.state),before);});
test('a preceding write never sees a tentative roster whose later commit fails',async ctx=>{
 const {team:t}=await fixture(ctx),entered=gate(),release=gate(),originalRename=fs.rename;let writes=0;
 ctx.mock.method(fs,'rename',async(...args)=>{if(args[1]===t.file){writes++;if(writes===1){entered.resolve();await release.promise;}if(writes===2)throw Error('SECOND_WRITE_FAILURE');}return originalRename(...args);});
 const earlier=t.save();await entered.promise;const removing=t.deleteBot('worker',true),failure=assert.rejects(removing,/SECOND_WRITE_FAILURE/);assert(t.state.bots.some(b=>b.id==='worker'));release.resolve();await earlier;await failure;assert((await disk(t)).bots.some(b=>b.id==='worker'));assert(t.state.bots.some(b=>b.id==='worker'));
});
test('real memory adapter archives after commit with deleted owner metadata intact',async ctx=>{
 const {team:t}=await fixture(ctx);const {createMemoryAdapter}=require(root+'/src/memory');t.memory=await createMemoryAdapter(t,{review:false});ctx.after(()=>t.memory.close());
 await fs.mkdir(path.join(t.data,'memory','bots','worker'),{recursive:true});await fs.writeFile(path.join(t.data,'memory','bots','worker','MEMORY.md'),'Keep this memory');await t.deleteBot('worker',true);await Promise.allSettled([...t.background]);
 const dirs=await fs.readdir(path.join(t.data,'memory','archive'));assert.equal(dirs.length,1);assert.equal(await fs.readFile(path.join(t.data,'memory','archive',dirs[0],'MEMORY.md'),'utf8'),'Keep this memory');const journal=await fs.readFile(path.join(t.data,'memory','journal.jsonl'),'utf8');assert(journal.includes('Worker'));
});
test('committed deletion stops only commands and logins owned by that Bot',async ctx=>{
 const {team:t}=await fixture(ctx),i=new Integrations(t);const cancelled=[],loginCancelled=[];const a={cancelBotCommand:()=>cancelled.push('worker')},b={cancelBotCommand:()=>cancelled.push('admin')};i.commandOwners.set(a,'worker');i.commandOwners.set(b,'admin');i.login.pending=new Map([['worker:mcp',{}],['admin:mcp',{}]]);i.login.cancel=key=>loginCancelled.push(key);await i.stopBot('worker');assert.deepEqual(cancelled,['worker']);assert.deepEqual(loginCancelled,['worker:mcp']);
});
test('migration write failure never restores an older Bot roster over valid current data',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.integrations=config();await new Backups(t).checkpoint(t.state,'old',true);t.state.bots=t.state.bots.filter(b=>b.id!=='worker');await t.save();const rename=fs.rename;
 ctx.mock.method(fs,'rename',async(...args)=>{if(args[1]===t.file)throw Error('MIGRATION_DISK_FAILURE');return rename(...args);});await assert.rejects(()=>new Backups(t).prepare(),/MIGRATION_DISK_FAILURE/);assert(!(await disk(t)).bots.some(b=>b.id==='worker'));
});
test('full Team.load / close / load cycle preserves deletion and complete long archives',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.integrations={commands:[command()],api:{enabled:false,botIds:['worker'],port:0}};t.bot('worker').chat=[{id:'message',text:'完整历史'.repeat(6000)}];await new Backups(t).checkpoint(t.state,'before-delete',true);await t.deleteBot('worker',true);await Promise.allSettled([...t.background]);
 const pi={__testHost:true,plugin:{getDataPath:async()=>t.data},events:new EventEmitter(),models:{list:async()=>[]},desktop:{listOperations:async()=>[]}};
 for(let n=0;n<2;n++){const loaded=new Team(pi,{pollMs:60000,memoryReview:false});try{await loaded.load();assert.deepEqual(loaded.state.bots.map(b=>b.id),['admin']);assert.equal(loaded.state.archives[0].lines[0].text,'完整历史'.repeat(6000));assert.equal(loaded.backups.recovered,undefined);}finally{await loaded.close();}}
});

test('new user-created Bot immediately persists one greeting and a working choice card without a model request',async ctx=>{
 const {team:t}=await fixture(ctx);const result=await t.upsertBot({name:'新伙伴',role:'Worker',compact:true}),bot=t.bot(result.bot.id);assert.equal(bot.chat.length,1);assert(bot.chat[0].creationGreeting);assert(bot.chat[0].text.includes('新伙伴'));const q=t.state.questions.find(q=>q.botId===bot.id);assert(q.creationGreeting);assert(q.options.length>=3);assert.equal(q.allowCustom,true);assert.equal((await disk(t)).bots.find(b=>b.id===bot.id).chat.length,1);
 await t.upsertBot({...bot,name:'改名',compact:true});assert.equal(bot.chat.length,1);assert.equal(t.state.questions.filter(q=>q.botId===bot.id).length,1);
 const delivered=[];t.execute=async job=>{delivered.push(job.task);job.status='completed';};await require('../src/questions').answerQuestion(t,{id:q.id,selected:[q.options[0].label]});await Promise.allSettled([...t.memberChains.values()]);assert.equal(q.status,'answered');assert.equal(delivered.length,1);assert(delivered[0].includes(q.options[0].label));
});
test('greeting and choice card roll back together when creating a Bot fails to save',async ctx=>{
 const {team:t}=await fixture(ctx),before=t.state.bots.length;ctx.mock.method(t,'commitEdit',async edit=>{edit.rollback();throw Error('disk failed');});await assert.rejects(t.upsertBot({name:'不能留存',role:'Worker',compact:true}),/disk failed/);assert.equal(t.state.bots.length,before);assert.equal(t.state.questions.length,0);
});

test('greeting seeds use the Bot name and prioritize explicit responsibilities',()=>{
 const {botGreeting}=require('../src/bot-greeting'),news=botGreeting({id:'n',name:'AI 资讯助手'}),code=botGreeting({id:'c',name:'编程助手'}),writer=botGreeting({id:'w',name:'AI 资讯助手',instructions:'负责写作与翻译'});
 assert(news.question.options.some(o=>o.label.includes('资讯')));assert(code.question.options.some(o=>o.label.includes('代码')));assert(writer.question.options.some(o=>o.label.includes('润色')));assert.notDeepEqual(news.question.options,code.question.options);assert(news.line.text.includes('AI 资讯助手'));
});

test('personalized greeting returns creation immediately, then persists model-specific choices without starting a job',async ctx=>{
 const {team:t}=await fixture(ctx),entered=gate(),release=gate();let requests=0;
 t.model=async()=>({key:'test'});t.pi.agent={complete:async input=>{requests++;assert.equal(input.thinkingLevel,'off');assert(input.messages[0].content.includes('天文助手'));entered.resolve();await release.promise;return {text:JSON.stringify({opening:'可以一起探索宇宙知识。',question:'想先探索哪一个天文话题？',options:['了解最近的天文观测新闻','解释恒星与行星的差别','制定一次观星准备清单']})};}};
 const result=await t.upsertBot({name:'天文助手',role:'Worker',compact:true});await entered.promise;const bot=t.bot(result.bot.id);assert.equal(bot.chat.length,1);assert.equal(t.state.jobs.length,0);
 release.resolve();await Promise.allSettled([...t.background]);assert.equal(requests,1);assert.equal(t.state.questions.at(-1).text,'想先探索哪一个天文话题？');assert(bot.chat[0].text.includes('天文助手'));assert((await disk(t)).questions.at(-1).options[2].label.includes('观星'));assert.equal(t.state.jobs.length,0);
});

for(const changed of ['answered','message','renamed','deleted'])test('late greeting response preserves '+changed+' Bot interaction',async ctx=>{
 const {team:t}=await fixture(ctx),result=await t.upsertBot({name:'天文助手',role:'Worker',compact:true}),bot=t.bot(result.bot.id),question=t.state.questions.at(-1),line=bot.chat[0],original=line.text,release=gate(),entered=gate();
 t.complete=async()=>{entered.resolve();await release.promise;return {text:JSON.stringify({opening:'新的问候',question:'新的问题',options:['观察月球','观察太阳','观察恒星']})};};
 const run=require('../src/bot-greeting').personalizeGreeting(t,bot,{line,question});await entered.promise;
 if(changed==='answered')question.status='answered';else if(changed==='message'){bot.chat.push({id:'other-message',who:'User',text:'另一件事',at:new Date().toISOString()});require('../src/views').supersedeViews(t,bot.id);}else if(changed==='renamed')bot.name='新名字';else t.state.bots=t.state.bots.filter(row=>row!==bot);
 release.resolve();await run;assert.equal(line.text,original);
});

test('invalid generated greeting retains the usable local card and failed save rolls back refinement',async ctx=>{
 const {parseGreeting,personalizeGreeting}=require('../src/bot-greeting');assert.equal(parseGreeting('{bad'),null);assert.equal(parseGreeting(JSON.stringify({opening:'x',question:'y',options:['重复','重复','重复']})),null);
 const {team:t}=await fixture(ctx),result=await t.upsertBot({name:'天文助手',role:'Worker',compact:true}),bot=t.bot(result.bot.id),question=t.state.questions.at(-1),line=bot.chat[0],original=structuredClone({line,question});
 t.complete=async()=>({text:'not JSON'});await personalizeGreeting(t,bot,{line,question});assert.deepEqual({line,question},original);
 t.complete=async()=>({text:JSON.stringify({opening:'一起了解宇宙。',question:'想观察什么？',options:['观察月球','观察恒星','研究星系']})});t.save=async(rollback,prepare)=>{prepare();rollback();throw Error('DISK_FAILURE');};await assert.rejects(personalizeGreeting(t,bot,{line,question}),/DISK_FAILURE/);assert.deepEqual({line,question},original);
});


test('unanswered greeting survives other work, persistence and backup restore until explicit dismissal',async ctx=>{
 const {team:t}=await fixture(ctx),result=await t.upsertBot({name:'持续开场助手',role:'Worker',compact:true}),q=t.state.questions.find(q=>q.botId===result.bot.id);
 require('../src/views').supersedeViews(t,result.bot.id);await t.save();assert.equal(q.status,'pending');
 const saved=(await restart(t)).state;assert.equal(saved.questions.find(v=>v.id===q.id).status,'pending');
 const {pausedState}=require('../src/backups');const restored=pausedState(saved);assert.equal(restored.questions.find(v=>v.id===q.id).status,'pending');
 await require('../src/questions').answerQuestion(t,{id:q.id,dismissed:true});require('../src/views').supersedeViews(t,result.bot.id);await t.save();assert.equal((await restart(t)).state.questions.find(v=>v.id===q.id).status,'dismissed');
});

test('dictation on a file model falls back without selecting the call provider or changing its model',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.integrations={speechGlobal:{provider:'qwen',defaultProvider:'qwen',model:'qwen3-asr-flash',callProvider:'qwen',callModel:'fun-asr-realtime',profiles:{qwen:{provider:'qwen',model:'qwen3-asr-flash'}}}};
 const integration=new Integrations(t);assert.equal(await integration.liveSpeech({mode:'dictation'}),null);assert.equal(t.state.integrations.speechGlobal.profiles.qwen.model,'qwen3-asr-flash');
});

test('native dictation sends PCM before finish and waits for the confirmed final text',async()=>{
 const {WindowsMicrophone}=require('../src/windows-microphone');let options,pushed=0,finish;const final=new Promise(resolve=>finish=resolve),mic=new WindowsMicrophone({}, {team:{bot(){}},liveSpeech:async o=>{options=o;return {push:b=>pushed+=b.length,finish:()=>final,cancel(){}};}});
 mic.devices=async()=>[];mic.request=async type=>{if(type==='listening')mic.current.status='listening';return {};};mic.write=()=>{};
 const {id}=await mic.operation({action:'begin',botId:'b',realtime:true,mode:'dictation'});assert.equal(options.mode,'dictation');options.onPartial('未确认的片段');mic.event({id,type:'pcm',audio:Buffer.alloc(3200).toString('base64')});assert.equal(pushed,3200);assert.equal((await mic.operation({action:'read',id})).status,'listening');await mic.operation({action:'finish',id});mic.event({id,type:'audio'});assert.equal((await mic.operation({action:'read',id})).status,'transcribing');finish('完整的最终转写');await new Promise(r=>setImmediate(r));const result=await mic.operation({action:'read',id});assert.equal(result.status,'done');assert.equal(result.text,'完整的最终转写');
});

test('upgrade restores only auto-dismissed greeting cards and preserves explicit close across real loads',async ctx=>{
 const {team:t}=await fixture(ctx);await t.upsertBot({name:'待选助手',role:'Worker',compact:true});await t.upsertBot({name:'已关闭助手',role:'Worker',compact:true});await t.upsertBot({name:'备份中断开场',role:'Worker',compact:true});const [old,closed,interrupted]=t.state.questions;interrupted.status='interrupted';Object.assign(old,{status:'dismissed',dismissed:true});await require('../src/questions').answerQuestion(t,{id:closed.id,dismissed:true});await t.save();
 const pi={__testHost:true,plugin:{getDataPath:async()=>t.data},events:new EventEmitter(),models:{list:async()=>[]},desktop:{listOperations:async()=>[]}};
 for(let i=0;i<2;i++){const loaded=new Team(pi,{pollMs:60000,memoryReview:false});try{await loaded.load();assert.equal(loaded.state.questions.find(q=>q.id===old.id).status,'pending');assert.equal(loaded.state.questions.find(q=>q.id===closed.id).status,'dismissed');assert.equal(loaded.state.questions.find(q=>q.id===interrupted.id).status,'pending');}finally{await loaded.close();}}
});
