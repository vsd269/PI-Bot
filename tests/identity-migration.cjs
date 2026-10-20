'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),{EventEmitter}=require('node:events');
const {ID,LEGACY_ID,backupRoot}=require('../src/identity');
const {migrateIdentity,rebase}=require('../src/identity-migration');
const {LongMessages}=require('../src/long-messages'),{Backups,parseArchive}=require('../src/backups'),{Team}=require('../src/team'),{Vault,dpapi}=require('../src/vault');
const PENDING='.pi-bot-identity-migration.json';
async function write(file,bytes){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
async function snapshot(dir){const out={};for(const name of await fs.readdir(dir,{recursive:true})){const p=path.join(dir,name),s=await fs.lstat(p);if(s.isFile())out[name]=createHash('sha256').update(await fs.readFile(p)).digest('hex');}return out;}
async function fixture(ctx){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-bot-identity-test-')),data=path.join(temp,'plugins','data',ID),old=path.join(path.dirname(data),LEGACY_ID),oldBackups=backupRoot(old,LEGACY_ID);
 await fs.mkdir(data,{recursive:true});await fs.mkdir(oldBackups,{recursive:true});ctx.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const content='迁移完整长消息🙂'.repeat(4000),team={data:old,state:{version:1,bots:[{id:'admin',name:'Chief',role:'Administrator',modelKey:'',sessions:{private:'native-existing-session'}},{id:'worker',name:'Worker',role:'Worker',modelKey:'',sessions:{},chat:[{id:'message',text:content,attachments:[{path:path.join(old,'uploaded-files','pic.png'),name:'pic.png'}]}]}],rooms:[{id:'room',name:'Team',members:['admin','worker'],adminId:'admin',log:[]}],jobs:[],schedules:[],questions:[],archives:[],prefs:{appearance:'dark'},capabilities:{items:{}}}};
 const long=new LongMessages(team);await write(path.join(old,'team.json'),JSON.stringify(await long.pack(team.state)));
 for(const [name,value] of [['memory/worker/MEMORY.md','Remember this.'],['uploaded-files/pic.png','synthetic-image-bytes'],['skills/demo/SKILL.md','synthetic skill'],['browser-profiles/profile/Preferences','{"synthetic":true}']])await write(path.join(old,name),value);
 const backup=await new Backups(team).archive();backup.archive.pluginId=LEGACY_ID;await write(path.join(oldBackups,'2026-10-21-test.json'),JSON.stringify(backup.archive));
 await write(path.join(oldBackups,'secrets.dpapi'),'synthetic encrypted bytes');
 let plugins=[];const pi={__testHost:true,plugin:{getDataPath:async()=>data},desktop:{invoke:async({operation})=>{assert.equal(operation,'plugin/list');return {plugins};},listOperations:async()=>[]},events:new EventEmitter(),models:{list:async()=>[]}};
 return {temp,data,old,oldBackups,pi,content,team,setPlugins:rows=>plugins=rows};
}
test('copies full legacy data and encrypted vault; paths rebase without rewriting prose',async ctx=>{
 const f=await fixture(ctx),before=await snapshot(f.old),backupsBefore=await snapshot(f.oldBackups);assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');
 assert.deepEqual(await snapshot(f.old),before);assert.deepEqual(await snapshot(f.oldBackups),backupsBefore);
 const state=await new LongMessages({data:f.data}).restore(JSON.parse(await fs.readFile(path.join(f.data,'team.json'),'utf8')));
 assert.equal(state.bots[1].chat[0].text,f.content);assert.equal(state.bots[0].sessions.private,'native-existing-session');assert.equal(state.rooms[0].id,'room');assert.equal(state.prefs.appearance,'dark');
 assert.equal(state.bots[1].chat[0].attachments[0].path,path.join(f.data,'uploaded-files','pic.png'));
 for(const name of ['memory/worker/MEMORY.md','skills/demo/SKILL.md','uploaded-files/pic.png','browser-profiles/profile/Preferences'])assert.deepEqual(await fs.readFile(path.join(f.old,name)),await fs.readFile(path.join(f.data,name)));
 assert.deepEqual(await fs.readFile(path.join(backupRoot(f.data),'secrets.dpapi')),await fs.readFile(path.join(f.oldBackups,'secrets.dpapi')));
 const archive=parseArchive(await fs.readFile(path.join(backupRoot(f.data),'2026-10-21-test.json'),'utf8'));assert.equal(archive.pluginId,ID);assert.equal(archive.payload.team.bots[1].chat[0].attachments[0].path,path.join(f.data,'uploaded-files','pic.png'));
 assert.deepEqual(rebase({text:f.old,path:f.old+'-unrelated',cwd:f.old},f.old,f.data),{text:f.old,path:f.old+'-unrelated',cwd:f.data});
});
test('active old plugin blocks migration without creating partial new data',async ctx=>{
 const f=await fixture(ctx);f.setPlugins([{id:LEGACY_ID,enabled:true,status:'ready'}]);await assert.rejects(migrateIdentity(f.pi,f.data),/停用旧版/);assert.deepEqual(await fs.readdir(f.data),[]);
 f.setPlugins([{id:LEGACY_ID,enabled:false,status:'disabled'}]);assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');
});
test('cannot confirm old runtime state: fail without importing or enabling duplicate tasks',async ctx=>{
 const f=await fixture(ctx);f.pi.desktop.invoke=async()=>{throw Error('offline host');};await assert.rejects(migrateIdentity(f.pi,f.data),/无法确认/);assert.deepEqual(await fs.readdir(f.data),[]);
});
test('copy failure is retryable and never alters old files',async ctx=>{
 const f=await fixture(ctx),before=await snapshot(f.old),copy=fs.copyFile;ctx.mock.method(fs,'copyFile',async(...args)=>{if(args[0].endsWith('secrets.dpapi'))throw Error('SIMULATED_COPY_FAILURE');return copy(...args);});
 await assert.rejects(migrateIdentity(f.pi,f.data),/SIMULATED_COPY_FAILURE/);assert.deepEqual(await fs.readdir(f.data),[]);assert.deepEqual(await snapshot(f.old),before);
 ctx.mock.restoreAll();assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');assert.equal(await fs.readFile(path.join(backupRoot(f.data),'secrets.dpapi'),'utf8'),'synthetic encrypted bytes');
});
test('aborted background migration preserves originals and can resume on restart',async ctx=>{
 const f=await fixture(ctx),before=await snapshot(f.old),copy=fs.copyFile,controller=new AbortController();
 ctx.mock.method(fs,'copyFile',async(...args)=>{await copy(...args);controller.abort();});
 await assert.rejects(migrateIdentity(f.pi,f.data,{signal:controller.signal}),{name:'AbortError'});
 assert.deepEqual(await snapshot(f.old),before);assert.deepEqual(await fs.readdir(f.data),[]);
 ctx.mock.restoreAll();assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');
});
test('resumes after backups commit but before data commit without overwriting either',async ctx=>{
 const f=await fixture(ctx),rename=fs.rename;ctx.mock.method(fs,'rename',async(...args)=>{if(args[1]===f.data)throw Error('SIMULATED_COMMIT_FAILURE');return rename(...args);});
 await assert.rejects(migrateIdentity(f.pi,f.data),/SIMULATED_COMMIT_FAILURE/);const copied=await snapshot(backupRoot(f.data));
 ctx.mock.restoreAll();assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');assert.deepEqual(await snapshot(backupRoot(f.data)),copied);assert.equal(await fs.readFile(path.join(f.data,'memory/worker/MEMORY.md'),'utf8'),'Remember this.');
});
test('resumes after both commits if journal cleanup was interrupted',async ctx=>{
 const f=await fixture(ctx),remove=fs.rm;ctx.mock.method(fs,'rm',async(...args)=>{if(args[0]===path.join(path.dirname(f.data),PENDING))throw Error('SIMULATED_JOURNAL_FAILURE');return remove(...args);});
 await assert.rejects(migrateIdentity(f.pi,f.data),/SIMULATED_JOURNAL_FAILURE/);const before=await snapshot(f.data);
 ctx.mock.restoreAll();assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');assert.deepEqual(await snapshot(f.data),before);
});
test('new roster is authoritative: deleted Bot never returns on another startup',async ctx=>{
 const f=await fixture(ctx);await migrateIdentity(f.pi,f.data);const file=path.join(f.data,'team.json'),state=JSON.parse(await fs.readFile(file,'utf8'));state.bots=state.bots.filter(b=>b.id!=='worker');state.rooms=[];await fs.writeFile(file,JSON.stringify(state));
 assert.equal((await migrateIdentity(f.pi,f.data)).status,'existing');assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).bots.map(b=>b.id),['admin']);
});
test('existing new backup prevents importing legacy roster after reinstall',async ctx=>{
 const f=await fixture(ctx);await migrateIdentity(f.pi,f.data);const backup=backupRoot(f.data),state=structuredClone(f.team.state);state.bots=state.bots.filter(b=>b.id!=='worker');state.rooms=[];
 const archive=await new Backups({data:f.data,state}).archive();await write(path.join(backup,'2026-10-22-new.json'),archive.text);
 await fs.rm(f.data,{recursive:true});await fs.mkdir(f.data);assert.equal((await migrateIdentity(f.pi,f.data)).status,'existing');
 const t={data:f.data,file:path.join(f.data,'team.json')};t.longMessages=new LongMessages(t);await new Backups(t).prepare();assert.deepEqual(JSON.parse(await fs.readFile(t.file,'utf8')).bots.map(b=>b.id),['admin']);
});
test('damaged current legacy team can recover from validated legacy backup before commit',async ctx=>{
 const f=await fixture(ctx);await fs.writeFile(path.join(f.old,'team.json'),'{damaged');assert.equal((await migrateIdentity(f.pi,f.data)).status,'migrated');assert.equal(JSON.parse(await fs.readFile(path.join(f.data,'team.json'),'utf8')).bots.length,2);
 assert.equal(await fs.readFile(path.join(f.old,'team.json'),'utf8'),'{damaged');
});
test('unrecoverable corruption blocks migration and never creates a default replacement',async ctx=>{
 const f=await fixture(ctx);await fs.writeFile(path.join(f.old,'team.json'),'{damaged');await fs.writeFile(path.join(f.oldBackups,'2026-10-21-test.json'),'invalid');
 await assert.rejects(migrateIdentity(f.pi,f.data),/损坏/);assert.deepEqual(await fs.readdir(f.data),[]);
});
test('symbolic link cannot redirect the copy or commit outside the known data root',async ctx=>{
 const f=await fixture(ctx),outside=path.join(f.temp,'outside');await fs.mkdir(outside);await write(path.join(outside,'keep.txt'),'keep');
 await fs.symlink(outside,path.join(f.old,'link'),process.platform==='win32'?'junction':'dir');await assert.rejects(migrateIdentity(f.pi,f.data),/链接/);assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'keep');assert.deepEqual(await fs.readdir(f.data),[]);
});
test('malformed journal cannot choose a path to remove',async ctx=>{
 const f=await fixture(ctx);await write(path.join(path.dirname(f.data),PENDING),JSON.stringify({format:'pi-bot-identity-migration',from:LEGACY_ID,to:ID,phase:'copying',stage:'../outside',migrationId:'a'.repeat(36)}));await assert.rejects(migrateIdentity(f.pi,f.data),/日志无效/);assert.equal(await fs.readFile(path.join(f.old,'memory/worker/MEMORY.md'),'utf8'),'Remember this.');
});
test('actual Team load uses migrated state and remains stable on a second load',async ctx=>{
 const f=await fixture(ctx);await fs.rm(path.join(f.oldBackups,'secrets.dpapi'));
 for(let n=0;n<2;n++){const t=new Team(f.pi,{pollMs:60000,memoryReview:false});try{await t.load();assert.equal(t.state.rooms[0].name,'Team');assert.equal(t.state.bots[1].chat[0].text,f.content);assert.equal(t.backups.root,backupRoot(f.data));}finally{await t.close();}}
});
test('Windows DPAPI vault decrypts under the new identity without re-encrypting',{skip:process.platform!=='win32'},async ctx=>{
 const f=await fixture(ctx),rows=[{botId:'worker',name:'TEST_ONLY',value:'synthetic-migration-check'}],bytes=await dpapi('protect',Buffer.from(JSON.stringify(rows))),text=JSON.stringify({format:'pi-bot-dpapi',version:1,data:bytes.toString('base64')});
 await fs.writeFile(path.join(f.oldBackups,'secrets.dpapi'),text);await migrateIdentity(f.pi,f.data);
 const vault=await new Vault({backups:{root:backupRoot(f.data)}}).load();assert.equal(vault.error,null);assert.equal(vault.value('worker','TEST_ONLY'),'synthetic-migration-check');assert.equal(await fs.readFile(path.join(backupRoot(f.data),'secrets.dpapi'),'utf8'),text);
});
test('fresh installs and non-native dev data do not inspect unrelated directories',async ctx=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'pi-bot-fresh-test-'));ctx.after(()=>fs.rm(temp,{recursive:true,force:true}));const data=path.join(temp,'data',ID);await fs.mkdir(data,{recursive:true});
 const pi={desktop:{invoke:async()=>{throw Error('must not call');}}};assert.equal((await migrateIdentity(pi,data)).status,'fresh');assert.equal((await migrateIdentity(pi,path.join(temp,'dev'))).status,'not-native-layout');
});
