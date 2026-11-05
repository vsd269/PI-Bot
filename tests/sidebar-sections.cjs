'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Team}=require('../src/team'),{sidebarSections:operate,validateSidebarSections}=require('../src/sidebar-sections'),{Backups,parseArchive,validateState,pausedState}=require('../src/backups'),{startupSnapshot}=require('../src/startup');
async function fixture(ctx){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-sidebar-')),team=new Team({});
  team.data=root;team.file=path.join(root,'team.json');team.queueCheckpoint=()=>{};
  team.state={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',modelKey:'',chat:[]},...['a','b','c'].map(id=>({id,name:id,role:'Worker',modelKey:'',chat:[]}))],rooms:[{id:'room',name:'项目群',members:['chief','a'],adminId:'chief',log:[]}],jobs:[],prefs:{}};
  ctx.after(async()=>{await team.writes;await fs.rm(root,{force:true,recursive:true,maxRetries:4});});return team;
}
test('departments persist, startup/backup restore keep Bot and group classification',async ctx=>{
  const team=await fixture(ctx),created=await operate(team,{action:'create',name:' 测试部门 ',kind:'bot',id:'a'}),id=created.createdId;
  await operate(team,{action:'move',kind:'room',id:'room',departmentId:id});await operate(team,{action:'collapse',departmentId:id,collapsed:true});await operate(team,{action:'collapse',departmentId:null,collapsed:true});
  const saved=JSON.parse(await fs.readFile(team.file,'utf8'));validateState(saved);assert.equal(saved.bots.find(b=>b.id==='a').departmentId,id);assert.equal(saved.rooms[0].departmentId,id);assert.equal(saved.sidebarSections.departments[0].collapsed,true);
  const restarted=new Team({});restarted.state=saved;restarted.vault={cleanState:structuredClone};assert.deepEqual(startupSnapshot(restarted).sidebarSections,saved.sidebarSections);
  team.vault={cleanState:structuredClone,clean:structuredClone};const backups=new Backups(team),{text}=await backups.archive();const restored=pausedState(parseArchive(text).payload.team);assert.deepEqual(restored.sidebarSections,saved.sidebarSections);assert.equal(restored.rooms[0].departmentId,id);
  assert.notEqual(backups.configKey(saved),backups.configKey({...saved,sidebarSections:{...saved.sidebarSections,groupsCollapsed:false}}));
});
test('rename uses stable IDs; remove department preserves all chats, tasks, members and privacy',async ctx=>{
  const team=await fixture(ctx),created=await operate(team,{action:'create',name:'部门',kind:'bot',id:'a'}),id=created.createdId;
  team.bot('a').private=true;team.bot('a').chat.push({text:'private history'});team.state.jobs.push({id:'job',botId:'a',status:'running'});
  await operate(team,{action:'move',kind:'room',id:'room',departmentId:id});await operate(team,{action:'rename',departmentId:id,name:'新名称'});assert.equal(team.bot('a').departmentId,id);
  const before=structuredClone({bots:team.state.bots,rooms:team.state.rooms,jobs:team.state.jobs});for(const item of [...before.bots,...before.rooms])delete item.departmentId;
  await operate(team,{action:'remove',departmentId:id});assert.deepEqual({bots:team.state.bots,rooms:team.state.rooms,jobs:team.state.jobs},before);assert.equal(team.state.sidebarSections.departments.length,0);
});
test('move out, empty departments and duplicate names are handled explicitly',async ctx=>{
  const team=await fixture(ctx),{createdId:id}=await operate(team,{action:'create',name:'Design'});
  await assert.rejects(operate(team,{action:'create',name:'design',departmentId:id}),/同名/);
  await operate(team,{action:'move',kind:'bot',id:'a',departmentId:id});await operate(team,{action:'move',kind:'bot',id:'a',departmentId:null});assert(!Object.hasOwn(team.bot('a'),'departmentId'));assert.equal(team.state.sidebarSections.departments.length,1);
});
test('invalid names, deleted references and moving administrators fail without state changes',async ctx=>{
  const team=await fixture(ctx);await operate(team,{action:'create',name:'部门'});const before=structuredClone(team.state);
  for(const input of [{action:'create',name:'\n'},{action:'create',name:'x'.repeat(61)},{action:'create',name:'a\nb'},{action:'create',name:'群组聊天'},{action:'move',kind:'bot',id:'chief',departmentId:null},{action:'move',kind:'bot',id:'a',departmentId:'missing'},{action:'move',kind:'other',id:'a',departmentId:null},{action:'collapse',departmentId:null,collapsed:'false'},{action:'rename',departmentId:'missing',name:'a'}])await assert.rejects(operate(team,input));
  assert.deepEqual(team.state,before);
});
test('failed queued create/move rolls back before the next successful operation',async ctx=>{
  const team=await fixture(ctx);let writes=0;team.store={write:async()=>{if(writes++===0)throw Error('disk full');}};
  const [first,second]=await Promise.allSettled([operate(team,{action:'create',name:'失败部门',kind:'bot',id:'a'}),operate(team,{action:'create',name:'成功部门',kind:'bot',id:'b'})]);
  assert.equal(first.status,'rejected');assert.equal(second.status,'fulfilled');assert(!Object.hasOwn(team.bot('a'),'departmentId'));assert.deepEqual(team.state.sidebarSections.departments.map(d=>d.name),['成功部门']);validateSidebarSections(team.state);
});
test('failed removal restores only category fields and preserves concurrent chat activity',async ctx=>{
  const team=await fixture(ctx),{createdId:id}=await operate(team,{action:'create',name:'部门',kind:'bot',id:'a'});
  team.store={write:async()=>{team.bot('a').chat.push({text:'arrived while saving'});throw Error('write failed');}};
  await assert.rejects(operate(team,{action:'remove',departmentId:id}),/write failed/);assert.equal(team.bot('a').departmentId,id);assert.equal(team.state.sidebarSections.departments[0].id,id);assert.equal(team.bot('a').chat.at(-1).text,'arrived while saving');
});
test('concurrent rename/moves merge and deleted departments cannot be assigned again',async ctx=>{
  const team=await fixture(ctx),{createdId:id}=await operate(team,{action:'create',name:'部门'});
  await Promise.all([operate(team,{action:'rename',departmentId:id,name:'重命名'}),operate(team,{action:'move',kind:'bot',id:'a',departmentId:id}),operate(team,{action:'move',kind:'room',id:'room',departmentId:id})]);
  assert.equal(team.state.sidebarSections.departments[0].name,'重命名');assert.equal(team.bot('a').departmentId,id);assert.equal(team.state.rooms[0].departmentId,id);
  const results=await Promise.allSettled([operate(team,{action:'remove',departmentId:id}),operate(team,{action:'move',kind:'bot',id:'b',departmentId:id})]);assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(team.bot('a').departmentId,undefined);
});
test('drag order is durable and new messages do not reorder manually arranged conversations',async ctx=>{
  const team=await fixture(ctx),{compareSidebarEntries}=await import('../renderer/sidebar-order.mjs');
  await operate(team,{action:'reorder',kind:'bot',id:'c',targetKind:'bot',targetId:'a',after:false});team.bot('a').chat.push({at:'2099-01-01'});
  assert.deepEqual(team.state.bots.filter(b=>b.role!=='Administrator').map(item=>({item})).sort(compareSidebarEntries).map(e=>e.item.id),['c','a','b']);
  await operate(team,{action:'move',kind:'bot',id:'c',departmentId:null});assert.equal(team.bot('c').sidebarOrder,0);
  const saved=JSON.parse(await fs.readFile(team.file,'utf8'));validateSidebarSections(saved);assert.equal(saved.bots.find(b=>b.id==='c').sidebarOrder,0);
  const {createdId:id}=await operate(team,{action:'create',name:'团队',kind:'bot',id:'a'});await operate(team,{action:'move',kind:'room',id:'room',departmentId:id});
  await operate(team,{action:'reorder',kind:'bot',id:'b',targetKind:'room',targetId:'room',after:true});assert.equal(team.bot('b').departmentId,id);assert.equal(team.bot('b').sidebarOrder,2);
});
test('invalid drag, pinned boundaries and write failure leave the order intact',async ctx=>{
  const team=await fixture(ctx);team.bot('a').pinned=true;const before=structuredClone(team.state);
  for(const input of [{kind:'bot',id:'b',targetKind:'bot',targetId:'chief',after:false},{kind:'bot',id:'b',targetKind:'room',targetId:'room',after:false},{kind:'bot',id:'b',targetKind:'bot',targetId:'a',after:false},{kind:'bot',id:'b',targetKind:'bot',targetId:'b',after:false}])await assert.rejects(operate(team,{action:'reorder',...input}));
  team.store={write:async()=>{throw Error('disk failure');}};await assert.rejects(operate(team,{action:'reorder',kind:'bot',id:'c',targetKind:'bot',targetId:'b',after:false}));assert.deepEqual(team.state,before);
});
test('backup validation accepts old data and rejects corrupt departments/orders',async ctx=>{
  const team=await fixture(ctx);validateState(team.state);const {createdId:id}=await operate(team,{action:'create',name:'部门',kind:'bot',id:'a'});validateState(team.state);
  for(const mutate of [s=>s.sidebarSections.departments.push({...s.sidebarSections.departments[0]}),s=>s.bots[1].departmentId='missing',s=>s.sidebarSections.groupsCollapsed='yes',s=>s.bots[1].sidebarOrder=-1,s=>s.sidebarSections.departments[0].name='bad\nname']){const bad=structuredClone(team.state);mutate(bad);assert.throws(()=>validateState(bad));}
  assert.equal(team.bot('a').departmentId,id);
});
