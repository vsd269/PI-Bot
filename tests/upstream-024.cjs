'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Team}=require('../src/team'),{Vault}=require('../src/vault'),{Handoffs}=require('../src/handoffs'),{Capabilities}=require('../src/capabilities');
const {Learning,validateLearning}=require('../src/learning'),groupWork=require('../src/group-stop'),{validateState}=require('../src/backups');
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(ctx){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-upstream-024-')),calls=[];
  const team=new Team({__testHost:true,models:{list:async()=>[{key:'mock/model',isDefault:true}]},workspace:{get:async()=>({path:dir})},agent:{complete:async input=>{calls.push(input);return {text:JSON.stringify(team.reviewAnswer||{skill:null,agents:null})};}}});
  team.data=dir;team.file=path.join(dir,'team.json');team.queueCheckpoint=()=>{};
  team.state={version:1,bots:[{id:'admin',name:'Chief',role:'Administrator',modelKey:'',sessions:{}},{id:'a',name:'Alpha',role:'Worker',modelKey:'',sessions:{private:'sa'},sessionWorkspaces:{private:dir,room:dir},workDir:dir,chat:[]},{id:'b',name:'Bravo',role:'Worker',modelKey:'',sessions:{},chat:[]}],rooms:[{id:'room',name:'项目群',members:['admin','a','b'],adminId:'admin',log:[]},{id:'other',name:'另一个群',members:['admin','a','b'],adminId:'admin',log:[]}],jobs:[],questions:[],views:[],asides:[],archives:[],completions:[],prefs:{}};
  team.vault=new Vault({state:team.state,backups:{root:dir},bot:id=>team.bot(id),save:()=>team.save()});team.handoffs=new Handoffs(team);team.capabilities=new Capabilities(team);team.learning=new Learning(team);await team.learning.load();
  team.mentions=await import('../src/upstream/mentions.mjs');team.invoke=async(operation,args)=>{calls.push({operation,args});return {};};
  team.memory={status(){},groupStatus(){},section(){return '';},rt:{}};
  ctx.after(async()=>{await team.learning.close();await Promise.allSettled([...team.background]);await team.writes;await fs.rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});});
  return {team,dir,calls};
}
function completed(team,dir){const job={id:'finished',botId:'a',task:'完成文档检查并核对结果',status:'completed',result:'已核对结构和链接，输出通过检查。',toolEvents:[{name:'check',status:'completed'}],at:'2026-10-30T02:00:00Z',endedAt:'2026-10-30T02:05:00Z',durationMs:300000,workDir:dir};team.state.jobs.push(job);return job;}
const skill={name:'document-review',description:'检查文档结构与结果',content:'先核对结构，再核对实际输出，记录尚未验证的内容。',reason:'下次可复用本次核对步骤。'};

test('stop-all invalidates queued admissions and preserves unrelated group/private work',async ctx=>{
  const {team:t}=await fixture(ctx),block=gate();t.memberChains.set('a',block.promise);
  const job=t.enqueue(t.room('room'),t.bot('a'),'本群任务'),other={id:'other-job',roomId:'other',botId:'b',status:'running',task:'其他群'},own={id:'private-job',botId:'b',status:'running',task:'私聊'};t.state.jobs.push(other,own);
  t.room('room').pausedRelays=[{id:'relay'}];await groupWork.stop(t,'room');
  assert.equal(job.status,'aborted');assert.equal(job.cancelled,true);assert.equal(other.cancelled,undefined);assert.equal(own.cancelled,undefined);assert.deepEqual(t.room('room').pausedRelays,[]);
  block.resolve();await t.memberChains.get('a');assert.equal(job.turnId,undefined);assert.equal(groupWork.epoch(t.room('room')),1);
});
test('stop-all drops a queued user message before it reaches the planner',async ctx=>{
  const {team:t}=await fixture(ctx),block=gate();t.roomChains.set('room',block.promise);let planned=0;t.coordinate=async()=>{planned++;};
  await t.sendGroup('room','你好',{clientMessageId:'queued-before-stop'});await groupWork.stop(t,'room');block.resolve();await t.roomChains.get('room').catch(()=>{});assert.equal(planned,0);
});
test('a planner accepted after stop aborts that exact native turn',async ctx=>{
  const {team:t,calls}=await fixture(ctx),prompt=gate(),started=gate();t.session=async()=> 'planning-session';
  t.invoke=async(operation,args)=>{calls.push({operation,args});if(operation==='agent/prompt'){started.resolve();return prompt.promise;}return {};};
  const run=t.nativePlan(t.room('room'),t.bot('admin'),'plan','p',Date.now());await started.promise;await groupWork.stop(t,'room');prompt.resolve({accepted:true,turnId:'late-turn'});
  await assert.rejects(run,error=>error.code==='PI_BOT_GROUP_STOPPED');assert(calls.some(c=>c.operation==='agent/abort'&&c.args[0].turnId==='late-turn'));assert.equal(t.groupPlans.size,0);
});
test('a late completed plan cannot enqueue assignments after stop',async ctx=>{
  const {team:t}=await fixture(ctx),answer=gate(),started=gate();t.nativePlan=async()=>{started.resolve();return answer.promise;};
  const run=t.coordinate(t.room('room'),'你好');await started.promise;await groupWork.stop(t,'room');answer.resolve({text:JSON.stringify({reply:'交给成员',assignments:[{botId:'a',task:'执行'}]})});await run;
  assert.equal(t.state.jobs.length,0);assert.equal(t.room('room').log.some(l=>l.text==='交给成员'),false);
});
test('stop during slow session creation never sends a worker prompt',async ctx=>{
  const {team:t,calls}=await fixture(ctx),session=gate(),started=gate();t.session=async()=>{started.resolve();return session.promise;};
  const job=t.enqueue(t.room('room'),t.bot('a'),'执行');await started.promise;await groupWork.stop(t,'room');session.resolve('late-session');await t.memberChains.get('a');
  assert.equal(job.status,'aborted');assert.equal(calls.some(c=>c.operation==='agent/prompt'),false);
});
test('failed native abort is reported and the group generation remains invalidated',async ctx=>{
  const {team:t}=await fixture(ctx);t.state.jobs.push({id:'live',botId:'a',roomId:'room',task:'run',status:'running',sessionId:'s',turnId:'turn'});t.invoke=async()=>{throw Error('host unavailable');};
  await assert.rejects(groupWork.stop(t,'room'),/未确认/);assert.equal(t.state.jobs[0].cancelled,true);assert.equal(groupWork.current(t,t.room('room'),0),false);
});
test('new human work can be admitted after stop; old relays cannot restart',async ctx=>{
  const {team:t}=await fixture(ctx),room=t.room('room'),old={id:'done',botId:'a',roomId:'room',status:'completed',result:'@Bravo 后续检查',groupEpoch:0};t.state.jobs.push(old);await groupWork.stop(t,'room');await t.delegateMentions(room,old);assert.equal(t.state.jobs.length,1);
  t.execute=async job=>{job.status='completed';};const next=t.enqueue(room,t.bot('a'),'新任务');await t.memberChains.get('a');assert.equal(next.groupEpoch,1);assert.equal(next.status,'completed');
});
test('sidebar layout folds the right panel first, preserves chat space and supports user overlay',async()=>{
  const {frameLayout,dragColumn}=await import('../renderer/frame-layout.mjs');
  assert.equal(frameLayout({viewport:1200,panel:true}).panel,'shown');assert.equal(frameLayout({viewport:900,panel:true}).panel,'folded');assert.equal(frameLayout({viewport:900,panel:true}).left,'open');
  assert.deepEqual(frameLayout({viewport:900,panel:true,requested:true}),{left:'rail',panel:'shown',width:280,room:836});assert.equal(frameLayout({viewport:600,panel:true,requested:true}).panel,'overlay');assert.equal(frameLayout({viewport:600}).left,'rail');assert.equal(frameLayout({viewport:600,drawer:true}).left,'drawer');assert.equal(frameLayout({viewport:1500,collapsed:true}).left,'rail');assert.equal(dragColumn(100).collapsed,true);assert.equal(dragColumn(170).width,220);assert.equal(dragColumn(900).width,420);
});
test('learning creates preview-only proposals; refusal changes neither files nor capabilities',async ctx=>{
  const {team:t,dir,calls}=await fixture(ctx);completed(t,dir);await fs.writeFile(path.join(dir,'AGENTS.md'),'# 项目规则\n');t.reviewAnswer={skill,agents:{reason:'核对输出',edits:[{op:'append',text:'完成后核对真实输出文件。'}]}};
  await t.learning.review('a',{manual:true});assert.equal(calls.filter(c=>c.system).length,1);assert.equal(t.learning.news().pending.length,2);assert.equal(t.capabilities.library[skill.name],undefined);assert.equal(await fs.readFile(path.join(dir,'AGENTS.md'),'utf8'),'# 项目规则\n');
  for(const p of [...t.learning.news().pending])await t.learning.answer({id:p.id,approve:false});assert.equal(t.learning.news().pending.length,0);assert.equal(t.capabilities.library[skill.name],undefined);assert.equal(await fs.readFile(path.join(dir,'AGENTS.md'),'utf8'),'# 项目规则\n');validateState(JSON.parse(await fs.readFile(t.file,'utf8')));
});
test('approving a Skill saves and assigns it atomically and is idempotent',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0];
  await Promise.all([t.learning.answer({id:p.id,approve:true}),t.learning.answer({id:p.id,approve:true})]);assert.equal(t.capabilities.library[skill.name].content,skill.content);assert.deepEqual(t.bot('a').capabilities,[skill.name]);assert.equal(t.data,dir);assert.equal(t.learning.data.proposals[0].status,'applied');validateState(t.state);
});
test('Skill collision after proposal is never overwritten',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill};await t.learning.review('a',{manual:true});t.capabilities.library[skill.name]={name:skill.name,kind:'skill',content:'用户后来保存的指令',description:'user'};
  await assert.rejects(t.learning.answer({id:t.learning.news().pending[0].id,approve:true}),/已变化/);assert.equal(t.capabilities.library[skill.name].content,'用户后来保存的指令');
});
test('failed Skill persistence rolls back assignment and proposal status',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0],save=t.save;t.save=async()=>{throw Error('disk full');};
  await assert.rejects(t.learning.answer({id:p.id,approve:true}),/disk full/);assert.equal(t.capabilities.library[skill.name],undefined);assert.equal(t.bot('a').capabilities,undefined);assert.equal(t.learning.data.proposals[0].status,'pending');t.save=save;
});
test('AGENTS approval checks original content and writes once under duplicate clicks',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={agents:{reason:'保持核对习惯',edits:[{op:'append',text:'完成后核对真实文件。'}]}};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0];assert.equal(await fs.stat(path.join(dir,'AGENTS.md')).catch(()=>null),null);
  await Promise.all([t.learning.answer({id:p.id,approve:true}),t.learning.answer({id:p.id,approve:true})]);const content=await fs.readFile(path.join(dir,'AGENTS.md'),'utf8');assert.equal(content.split('完成后核对真实文件。').length,2);assert.equal(t.learning.data.proposals[0].status,'applied');assert.equal((await fs.readdir(dir)).some(n=>n.endsWith('.tmp')),false);
});
test('AGENTS changed after proposal is not overwritten',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);const file=path.join(dir,'AGENTS.md');await fs.writeFile(file,'旧内容');t.reviewAnswer={agents:{edits:[{op:'append',text:'新增规则'}]}};await t.learning.review('a',{manual:true});await fs.writeFile(file,'用户修改后的内容');await assert.rejects(t.learning.answer({id:t.learning.news().pending[0].id,approve:true}),/已被修改/);assert.equal(await fs.readFile(file,'utf8'),'用户修改后的内容');
});
test('AGENTS persistence uncertainty reconciles the saved file without duplicate append',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={agents:{edits:[{op:'append',text:'只出现一次'}]}};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0],save=t.save;let once=true;t.save=async function(...args){if(once&&this.learning.data.proposals[0].status==='applied'){once=false;throw Error('final save failed');}return save.apply(this,args);};
  await assert.rejects(t.learning.answer({id:p.id,approve:true}),/final save/);assert.equal(t.learning.data.proposals[0].status,'applying');await t.learning.answer({id:p.id,approve:true});assert.equal((await fs.readFile(path.join(dir,'AGENTS.md'),'utf8')).split('只出现一次').length,2);assert.equal(t.learning.data.proposals[0].status,'applied');
});
test('a Bot moved to another folder cannot approve a stale project proposal',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={agents:{edits:[{op:'append',text:'核对结果'}]}};await t.learning.review('a',{manual:true});const moved=path.join(dir,'moved');await fs.mkdir(moved);t.bot('a').sessionWorkspaces.private=moved;
  await assert.rejects(t.learning.answer({id:t.learning.news().pending[0].id,approve:true}),/目录已变化/);assert.equal(await fs.stat(path.join(dir,'AGENTS.md')).catch(()=>null),null);
});
test('secret-looking proposals are rejected and never saved as reusable Skills',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill:{...skill,content:'token: sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'}};await assert.rejects(t.learning.review('a',{manual:true}),/敏感/);assert.equal(t.learning.data.proposals.length,0);assert.equal(t.capabilities.library[skill.name],undefined);
});
test('automatic review is opt-in, idle-only and throttled',async ctx=>{
  const {team:t,dir,calls}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill};t.learning.lastActivity=0;
  await t.learning.tick();assert.equal(calls.length,0);t.state.prefs.learningReview=true;t.learning.lastActivity=Date.now();await t.learning.tick();assert.equal(calls.length,0);
  t.learning.lastActivity=0;await t.learning.tick();assert.equal(calls.filter(c=>c.system).length,1);await t.learning.tick();assert.equal(calls.filter(c=>c.system).length,1);
});
test('proposal text uses bounded bridge chunks, while the normal snapshot omits full contents',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill:{...skill,content:'汉'.repeat(8000)}};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0];
  const chunk=await t.learning.operation({action:'text',id:p.id,part:'content',offset:0});assert.equal(chunk.text.length,6000);assert(Buffer.byteLength(JSON.stringify(chunk))<64000);assert.equal(t.snapshot().learning,undefined);assert(!JSON.stringify(t.snapshot()).includes('汉'.repeat(100)));assert.equal(t.snapshot().learningNews.pending.length,1);
});
test('backup validation rejects malformed proposal destinations',()=>{
  assert.throws(()=>validateLearning({learning:{proposals:[{id:'x',botId:'a',kind:'agents',status:'pending',reason:'x',content:'x',folder:'relative',path:'C:/elsewhere',before:'',base:'bad',existed:false}],declined:[],reviews:{}}}),/路径/);
});
test('the real renderer bridge admits stop-all and learning routes',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../main.js'),'utf8'),list=source.match(/if\(!\[(.*?)\]\.includes\(args.channel\)\)/s)[1];assert(list.includes("'team.group.stop'"));assert(list.includes("'team.learning'"));assert(list.includes("'team.office'"));
});
test('relay save failure after stop never restores the cleared relay queue',async ctx=>{
  const {team:t}=await fixture(ctx),room=t.room('room'),block=gate(),started=gate(),save=t.save;let n=0;
  t.save=async function(){if(++n===2){started.resolve();await block.promise;throw Error('relay disk failure');}return save.call(this);};
  const job={id:'relay-source',roomId:room.id,botId:'a',groupEpoch:0,status:'completed',result:'检查后续任务'};t.state.jobs.push(job);
  const run=require('../src/group-relay').delegate(t,room,job,['b'],[]);run.catch(()=>{});await started.promise;await groupWork.stop(t,room.id);block.resolve();await assert.rejects(run,/relay disk failure/);assert.deepEqual(room.pausedRelays,[]);assert.equal(room.relayCount,0);
});
test('AGENTS rejects explicit folder changes even when an old session folder remains',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={agents:{edits:[{op:'append',text:'核对真实文件'}]}};await t.learning.review('a',{manual:true});const moved=path.join(dir,'new-workspace');await fs.mkdir(moved);t.bot('a').workDir=moved;
  await assert.rejects(t.learning.answer({id:t.learning.news().pending[0].id,approve:true}),/目录已变化/);assert.equal(await fs.stat(path.join(dir,'AGENTS.md')).catch(()=>null),null);
});
test('AGENTS cannot be applied when its owner disappears during confirmation',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={agents:{edits:[{op:'append',text:'核对结果'}]}};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0],save=t.save;
  t.save=async function(){await save.call(this);if(this.learning.data.proposals[0]?.status==='applying')this.state.bots=this.state.bots.filter(b=>b.id!=='a');};
  await assert.rejects(t.learning.answer({id:p.id,approve:true}),/Bot/);assert.equal(await fs.stat(path.join(dir,'AGENTS.md')).catch(()=>null),null);assert.equal((await fs.readdir(dir)).some(name=>name.endsWith('.tmp')),false);
});
test('AGENTS symlinks are not read or replaced during review',async ctx=>{
  const {team:t,dir}=await fixture(ctx),target=path.join(dir,'external.md');await fs.writeFile(target,'do not touch');
  try{await fs.symlink(target,path.join(dir,'AGENTS.md'),'file');}catch(error){if(error.code==='EPERM')return ctx.skip('Windows account cannot create file symlinks');throw error;}
  await assert.rejects(t.learning.agentsFile(dir),/不是普通/);assert.equal(await fs.readFile(target,'utf8'),'do not touch');
});
test('Skill approval respects another Bot newly using the Skill through a pack',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.capabilities.library[skill.name]={...skill,kind:'skill',createdBy:'a',content:'旧版本'};t.reviewAnswer={skill};await t.learning.review('a',{manual:true});
  t.capabilities.library['shared-pack']={name:'shared-pack',kind:'pack',items:[skill.name]};t.bot('b').capabilities=['shared-pack'];
  await assert.rejects(t.learning.answer({id:t.learning.news().pending[0].id,approve:true}),/其他 Bot|管理员/);assert.equal(t.capabilities.library[skill.name].content,'旧版本');
});
test('proposal approval serializes with concurrent capability edits',async ctx=>{
  const {team:t,dir}=await fixture(ctx);completed(t,dir);t.reviewAnswer={skill};await t.learning.review('a',{manual:true});const p=t.learning.news().pending[0],block=gate(),started=gate(),save=t.save;let n=0;
  t.save=async function(){if(++n===1){started.resolve();await block.promise;}return save.call(this);};
  const approval=t.learning.answer({id:p.id,approve:true});await started.promise;const update=t.capabilities.save({...skill,kind:'skill',content:'用户后续更新'},t.bot('admin'));block.resolve();await Promise.all([approval,update]);assert.equal(t.capabilities.library[skill.name].content,'用户后续更新');assert.equal(t.learning.data.proposals[0].status,'applied');
});
test('backup rejects malformed review and declined metadata',()=>{
  assert.throws(()=>validateLearning({learning:{proposals:[],declined:[],reviews:{x:{at:1,error:{bad:true}}}}}),/复盘记录/);
  assert.throws(()=>validateLearning({learning:{proposals:[],declined:[{kind:'agents',fingerprint:'bad',at:new Date().toISOString()}],reviews:{}}}),/拒绝记录/);
});
test('a worker prompt accepted after stop aborts exactly that turn and releases its waiter',async ctx=>{
  const {team:t,calls}=await fixture(ctx),started=gate(),prompt=gate();t.session=async()=> 'worker-session';t.model=async()=>({key:'mock/model'});
  t.integrations={operations:new Set(),images:{prepare:async()=>({text:'',attachments:[]})}};t.longMessages=new (require('../src/long-messages').LongMessages)(t);t.inspect=async()=>({text:'',replies:[],tools:[]});
  t.invoke=async(operation,args)=>{calls.push({operation,args});if(operation==='agent/prompt'){started.resolve();return prompt.promise;}if(operation==='agent/abort'){const job=t.state.jobs.find(j=>j.turnId===args[0].turnId);if(job)await t.settle(job,'aborted');return {};}return {status:{isRunning:false}};};
  const job=t.enqueue(t.room('room'),t.bot('a'),'检查文档');await started.promise;await groupWork.stop(t,'room');prompt.resolve({accepted:true,turnId:'late-worker-turn'});await t.memberChains.get('a');
  assert(calls.some(c=>c.operation==='agent/abort'&&c.args[0].sessionId==='worker-session'&&c.args[0].turnId==='late-worker-turn'));assert.equal(job.cancelled,true);assert.equal(job.status,'aborted');assert.equal(t.waiters.size,0);
});
test('stopping while worker launch is being persisted does not leave a launching task',async ctx=>{
  const {team:t}=await fixture(ctx),started=gate(),block=gate(),save=t.save;let blocked=false;t.session=async()=> 'worker-session';t.model=async()=>({key:'mock/model'});t.integrations={operations:new Set(),images:{prepare:async()=>({text:'',attachments:[]})}};t.longMessages=new (require('../src/long-messages').LongMessages)(t);
  t.save=async function(){if(!blocked&&this.state.jobs[0]?.status==='launching'){blocked=true;started.resolve();await block.promise;}return save.call(this);};
  const job=t.enqueue(t.room('room'),t.bot('a'),'检查文档');await started.promise;await groupWork.stop(t,'room');block.resolve();await t.memberChains.get('a');assert.equal(job.status,'aborted');assert.equal(job.turnId,undefined);
});
test('stop blocks a group report already waiting on persistence from being delivered',async ctx=>{
  const {team:t}=await fixture(ctx),room=t.room('room'),started=gate(),block=gate(),save=t.save;let once=true,delivered=0;room.reports=[{id:'report',roundId:'round',status:'running',replyTo:'a'}];t.deliverResult=async()=>{delivered++;};
  t.save=async function(){if(once){once=false;started.resolve();await block.promise;}return save.call(this);};
  const run=require('../src/group-reports').deliverRoundReports(t,room,'round');await started.promise;await groupWork.stop(t,'room');block.resolve();await run;assert.equal(delivered,0);assert.equal(room.reports[0].status,'aborted');
});
