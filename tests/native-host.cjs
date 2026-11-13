const {fork}=require('node:child_process');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-bot-native-host-test-'));
const pluginPath=path.resolve(__dirname,'..');
const hostRoot=process.env.PI_BOT_TEST_HOST;if(!hostRoot)throw Error('Set PI_BOT_TEST_HOST to an extracted PI Desktop host directory.');
const child=fork(path.join(hostRoot,'out/main/plugin-host-process.js'),[],{silent:true});
let sequence=0;const pending=new Map(),registered=new Map();
child.stdout.on('data',b=>process.stdout.write(b));child.stderr.on('data',b=>process.stderr.write(b));
child.on('message',m=>{
  if(m.t==='call'){
    let value=null;
    if(m.api==='plugin.getDataPath')value=dir;
    else if(m.api==='app.setTheme')value=null;
    else if(m.api==='app.getAppearance')value={theme:'dark',base:'dark'};
    else if(m.api==='models.list')value=[{key:'mock/model',providerId:'mock',modelId:'model',isDefault:true}];
    else if(m.api==='agent.registerTool'){registered.set(m.args[0].name,m.args[0]);value=null;}
    else if(m.api==='agent.unregisterTool')registered.delete(m.args[0]);
    else if(m.api==='desktop.invoke'&&m.args[0].operation==='mcp/list')value={servers:[],statuses:[]};
    else if(m.api==='agent.complete')value={text:'',usage:{inputTokens:1,outputTokens:0,totalTokens:1}};
    child.send({t:'res',id:m.id,ok:true,value});
  }else if(m.t==='res'){
    const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.ok?p.resolve(m.value):p.reject(new Error(JSON.stringify(m.error)));
  }
});
function call(t,payload){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(new Error('Host IPC timeout: '+t)),15000);pending.set(id,{resolve,reject,timer});child.send({t,id,...payload});});}
async function panel(channel,payload={}){return call('call',{method:'panel.invoke',payload:{channel,payload}});}
async function renderer(channel,payload={}){const {id}=await call('call',{method:'renderer.call',payload:{method:'request.start',args:{channel,payload}}});let text='',offset=0;for(let n=0;n<500;n++){const result=await call('call',{method:'renderer.call',payload:{method:'request.read',args:{id,offset}}});if(result.pending){await new Promise(r=>setTimeout(r,5));continue;}if(result.error)throw Error(result.error);text+=result.chunk;offset=text.length;if(result.done)return JSON.parse(text);}throw Error('Renderer request timeout');}
(async()=>{
  try{
    const manifest=JSON.parse(fs.readFileSync(path.join(pluginPath,'manifest.json'),'utf8'));
    await call('init',{pluginId:manifest.id,pluginPath,main:'main.js',manifest});
    const state=await panel('team.state');assert.equal(state.bots[0].name,'Chief');assert.deepEqual(state.executionModes,['serial','parallel']);
    assert.equal((await renderer('team.theme',{theme:'light'})).theme,'light');
    await assert.rejects(()=>renderer('team.theme',{theme:'invalid'}),/Invalid appearance/);
    assert.ok(registered.has('message_bot'));assert.ok(registered.has('remember'));assert.ok(registered.has('recall'));assert.ok(registered.has('ask_user'));assert.ok(registered.has('read_group_chat'));assert.ok(registered.has('post_to_group'));
    assert.ok(registered.has('create_group'));assert.ok(registered.has('delete_group'));
    const team=await panel('team.bot.save',{name:'Worker',role:'Worker',instructions:'test'});assert.equal(team.bots.length,2);
    const appearance=await panel('team.bot.appearance',{botId:team.bots[0].id,avatar:{shape:'pi-bot'},color:'green'});assert.equal(appearance.avatar.shape,'pi-bot');assert.equal(appearance.color,'green');
    const m=await panel('team.memory.add',{botId:team.bots[0].id,text:'Keep answers concise.'});assert.equal(m.entries.length,1);
    const view=await panel('team.connectors');assert.equal(view.available,true);
    const {id}=await call('call',{method:'renderer.call',payload:{method:'request.start',args:{channel:'team.usage',payload:{}}}});
    let response;
    for(let i=0;i<20;i++){response=await call('call',{method:'renderer.call',payload:{method:'request.read',args:{id,offset:0}}});if(!response.pending)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(response.done,true);assert.ok(JSON.parse(response.chunk).total);
    const appearanceRequest=await call('call',{method:'renderer.call',payload:{method:'request.start',args:{channel:'team.bot.appearance',payload:{botId:team.bots[0].id,color:'blue'}}}});
    for(let n=0;n<20;n++){response=await call('call',{method:'renderer.call',payload:{method:'request.read',args:{id:appearanceRequest.id,offset:0}}});if(!response.pending)break;await new Promise(r=>setTimeout(r,10));}assert.equal(JSON.parse(response.chunk).color,'blue');
    const patched=await renderer('team.bot.patch',{id:team.bots[1].id,patch:{roleLabel:'Verifier'}});assert.equal(patched.bots[1].roleLabel,'Verifier');
    const backup=JSON.parse(await renderer('team.backup',{action:'export'}));backup.payload.team.bots[0].chat=[{id:'large',who:'User',text:'mock transcript '.repeat(7000),at:new Date().toISOString()}];backup.sha256=createHash('sha256').update(JSON.stringify(backup.payload)).digest('hex');const uploadText=JSON.stringify(backup);assert.ok(Buffer.byteLength(uploadText)>64000);
    const upload=await renderer('team.backup',{action:'begin'});for(let offset=0;offset<uploadText.length;offset+=6000)await renderer('team.backup',{action:'chunk',id:upload.id,offset,chunk:uploadText.slice(offset,offset+6000)});
    assert.equal((await renderer('team.backup',{action:'preview',id:upload.id})).bots,2);await renderer('team.backup',{action:'commit',id:upload.id});assert.equal((await renderer('team.backup',{action:'status'})).pending,true);await renderer('team.backup',{action:'cancel'});
    await call('call',{method:'lifecycle.unload',payload:{}});assert.equal(registered.size,0);
    console.log('PASS: PI-Desktop '+JSON.parse(fs.readFileSync(path.join(hostRoot,'package.json'),'utf8')).version+' installed plugin process loads, registers tools, handles panel and renderer RPC, and unloads.');
  }finally{
    child.kill();await new Promise(r=>setTimeout(r,100));await fsp.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
