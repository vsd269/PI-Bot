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
test('mutual mentions stop before scheduling a cycle; new human message resets budget',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.bots.push({id:'third',name:'Third',role:'Worker',modelKey:''});const room={id:'room',members:['worker','third'],log:[]};t.state.rooms=[room];t.enqueue=(room,bot,task,round,options)=>{const j={id:'j'+t.state.jobs.length,botId:bot.id,...options};t.state.jobs.push(j);return j;};
 await t.delegateMentions(room,{botId:'worker',result:'@Third 请继续'});assert.equal(t.state.jobs.length,1);const job=t.state.jobs[0];job.result='@Worker 请继续';await t.delegateMentions(room,job);assert.equal(t.state.jobs.length,1);assert(room.log.some(l=>l.text.includes('停止')));
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
test('exhausted automatic handoffs show a pause in group without scheduling another job',async ctx=>{
 const {team:t}=await fixture(ctx);t.state.bots.push({id:'b',name:'Bravo',role:'Worker'});const room={id:'room',members:['worker','b'],log:[],relayLimit:6,relayCount:6};t.state.rooms=[room];t.enqueue=()=>{throw Error('must not enqueue');};await t.delegateMentions(room,{id:'source',botId:'worker',result:'@Bravo 请继续'});assert(room.log.some(l=>l.text.includes('暂停')));assert.equal(room.pausedRelays.length,1);
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
