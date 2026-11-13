'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Apps}=require('../src/apps'),{Integrations}=require('../src/integrations');
const KEY='ak_startup_test_only_123456';
const response=(data,status=200)=>({response:{ok:status>=200&&status<300,status},text:JSON.stringify(data)});
const account={id:'ca_exa',toolkit:{slug:'exa'},status:'ACTIVE',alias:'搜索',state:{auth:{access_token:'must-not-leak'}}};
const flush=()=>new Promise(r=>setImmediate(r));
function clock(){
  let now=1000;const timers=new Set();
  return {options:{now:()=>now,setTimer:(fn,ms)=>{const t={fn,at:now+ms,unref(){}};timers.add(t);return t;},clearTimer:t=>timers.delete(t)},
    get count(){return timers.size;},get delay(){return Math.min(...[...timers].map(t=>t.at-now));},
    async tick(ms=0){now+=ms;for(const t of [...timers])if(t.at<=now){timers.delete(t);t.fn();}await flush();}};
}
function fixture(configured=true){
  const timer=clock(),calls=[];let config=configured?{key:KEY,userId:'pibot_saved_user',sessionId:'trs_saved',grants:[{accountId:'ca_exa',slug:'exa',botIds:['a']}]}:null;
  const team={state:{bots:[{id:'a',name:'已分配'},{id:'b',name:'未分配'}]},bot(id){const b=this.state.bots.find(b=>b.id===id);if(!b)throw Error('missing bot');return b;}};
  team.vault={value(){if(!config)throw Error('not configured');return JSON.stringify(config);},list:()=>({available:true}),clean:x=>x,setApps:async({value})=>config=JSON.parse(value),removeApps:async()=>config=null};
  let handler=async(url)=>{
    if(url.includes('/connected_accounts?'))return response({items:[account]});
    if(url.includes('/toolkits?'))return response({items:[]});
    if(url.includes('/tools?'))return response({items:[{slug:'EXA_SEARCH',toolkit:{slug:'exa'},version:'test',input_parameters:{type:'object'}}]});
    if(url.includes('/tools/execute/'))return response({successful:true,data:{ok:true}});
    if(url.includes('/tools/'))return response({slug:'EXA_SEARCH',toolkit:{slug:'exa'},version:'test'});
    throw Error('unexpected request');
  };
  const apps=new Apps(team,{connectionOptions:timer.options,transport:async(url,options)=>{calls.push({url,options});return handler(url,options);}});
  return {apps,team,timer,calls,get config(){return config;},set config(v){config=v;},get handler(){return handler;},set handler(v){handler=v;}};
}
test('startup restores saved accounts and grants without opening the dialog or creating auth sessions',async t=>{
  const f=fixture(),before=JSON.stringify(f.config);t.after(()=>f.apps.close());
  f.apps.start();assert.equal(f.apps.connections.view().phase,'pending');assert.equal(f.calls.length,0);
  await f.timer.tick();const view=f.apps.connections.view();assert.equal(view.phase,'ready');assert.equal(view.accounts[0].slug,'exa');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'GET');assert(f.calls[0].url.includes('user_ids=pibot_saved_user'));
  assert.equal(JSON.stringify(f.config),before);assert(!JSON.stringify(view).includes(KEY));assert(!JSON.stringify(view).includes('trs_saved'));assert(!JSON.stringify(view).includes('must-not-leak'));
  assert.equal(f.timer.delay,300000);
});
test('integration startup does not wait for a slow application service',async t=>{
  const f=fixture();t.after(()=>f.apps.close());let release;f.handler=()=>new Promise(r=>release=r);
  const integration={apps:f.apps,index:{load:async()=>{}},team:{state:{bots:[]},pi:{desktop:{listOperations:async()=>[]}}}};
  await Integrations.prototype.load.call(integration);await f.timer.tick();assert.equal(f.apps.connections.view().phase,'loading');
  release(response({items:[account]}));await flush();assert.equal(f.apps.connections.view().phase,'ready');
});
test('Bot tool discovery and execution work before any application dialog or inventory request',async t=>{
  const f=fixture();t.after(()=>f.apps.close());assert.deepEqual(await f.apps.tools('a'),{accounts:[{id:'ca_exa',slug:'exa'}]});
  assert.deepEqual(await f.apps.tools('b'),{accounts:[]});assert.match(f.apps.context('a'),/list_app_tools/);assert.equal(f.apps.context('b'),'');assert(!f.apps.context('a').includes(KEY));
  assert.equal((await f.apps.tools('a',{accountId:'ca_exa'})).tools[0].name,'EXA_SEARCH');
  assert.equal((await f.apps.call('a',{accountId:'ca_exa',name:'EXA_SEARCH',arguments:{query:'isolated test'}})).successful,true);
  await assert.rejects(f.apps.call('b',{accountId:'ca_exa',name:'EXA_SEARCH',arguments:{}}),/没有/);
});
test('unconfigured startup performs no network request and detects a later vault import',async t=>{
  const f=fixture(false);t.after(()=>f.apps.close());f.apps.start();await f.timer.tick(30000);assert.equal(f.calls.length,0);assert.equal(f.apps.connections.view().phase,'disabled');
  f.config={key:KEY,userId:'pibot_imported',grants:[{accountId:'ca_exa',slug:'exa',botIds:['a']}]};await f.timer.tick(30000);assert.equal(f.apps.connections.view().phase,'ready');assert.equal(f.calls.length,1);
});
test('network failures back off and recover automatically without dropping saved grants',async t=>{
  const f=fixture();t.after(()=>f.apps.close());const prior=f.handler,before=JSON.stringify(f.config);f.handler=async()=>{throw Error('offline '+KEY);};f.apps.start();await f.timer.tick();
  assert.equal(f.apps.connections.view().phase,'error');assert.equal(f.timer.delay,15000);assert(!f.apps.connections.view().error.includes(KEY));assert.equal(JSON.stringify(f.config),before);
  await f.timer.tick(15000);assert.equal(f.timer.delay,30000);f.handler=prior;await f.timer.tick(30000);
  assert.equal(f.apps.connections.view().phase,'ready');assert.equal(f.timer.delay,300000);assert.equal(JSON.stringify(f.config),before);assert(f.calls.every(c=>c.options.method==='GET'));
});
test('credential failures avoid fast retry loops and never silently reauthorize',async t=>{
  const f=fixture();t.after(()=>f.apps.close());f.handler=async()=>response({},401);f.apps.start();await f.timer.tick();assert.equal(f.timer.delay,300000);await f.timer.tick(30000);assert.equal(f.calls.length,1);assert.equal(f.apps.connections.view().phase,'error');
});
test('manual opening shares an in-flight startup read and reuses a fresh result',async t=>{
  const f=fixture();t.after(()=>f.apps.close());let release;f.handler=()=>new Promise(r=>release=r);f.apps.start();await f.timer.tick();
  const pending=f.apps.inventory({cached:true});assert.equal(f.calls.length,1);release(response({items:[account]}));await pending;
  await f.apps.inventory({cached:true});assert.equal(f.calls.length,1);f.handler=async()=>response({items:[account]});await f.apps.inventory();assert.equal(f.calls.length,2);
});
test('clearing or replacing a project discards late results from the previous project',async t=>{
  for(const mode of ['clear','replace']){
    const f=fixture();t.after(()=>f.apps.close());let release;const prior=f.handler;
    f.handler=(url,o)=>url.includes('/connected_accounts?')?new Promise(r=>release=r):prior(url,o);f.apps.start();await f.timer.tick();
    if(mode==='clear')await f.apps.clear();else await f.apps.saveKey({key:'ak_another_test_project'});
    release(response({items:[account]}));await flush();const view=f.apps.connections.view();assert.deepEqual(view.accounts,[]);assert.equal(view.phase,mode==='clear'?'disabled':'pending');assert.equal(view.checkedAt,null);
  }
});
test('revoked remote accounts disappear on background refresh while local grants remain explicit',async t=>{
  const f=fixture();t.after(()=>f.apps.close());f.apps.start();await f.timer.tick();f.handler=async()=>response({items:[{...account,status:'EXPIRED'}]});await f.timer.tick(300000);
  assert.equal(f.apps.connections.view().accounts[0].status,'EXPIRED');assert.equal(f.config.grants.length,1);
});
test('transient refresh failure retains last verified metadata without claiming a fresh connection',async t=>{
  const f=fixture();t.after(()=>f.apps.close());f.apps.start();await f.timer.tick();const at=f.apps.connections.view().checkedAt;f.handler=async()=>{throw Error('offline');};await f.timer.tick(300000);
  const view=f.apps.connections.view();assert.equal(view.phase,'error');assert.equal(view.checkedAt,at);assert.equal(view.accounts[0].slug,'exa');
});
test('shutdown cancels the discovery request and removes every background retry',async()=>{
  const f=fixture();let aborted=false;f.handler=(_url,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true}));
  f.apps.start();await f.timer.tick();await f.apps.close();await flush();assert(aborted);assert.equal(f.timer.count,0);await f.timer.tick(600000);assert.equal(f.calls.length,1);
});
test('locked vault and conflicted team do not trigger network or weaken permissions',async t=>{
  const f=fixture();t.after(()=>f.apps.close());f.team.vault.error='locked';f.team.vault.value=()=>{throw Error('locked');};f.apps.start();await f.timer.tick(30000);assert.equal(f.calls.length,0);assert.equal(f.apps.connections.view().phase,'error');
  const g=fixture();t.after(()=>g.apps.close());g.team.storeConflict={};g.apps.start();await g.timer.tick();assert.equal(g.calls.length,0);await assert.rejects(g.apps.inventory(),/冲突/);
});
