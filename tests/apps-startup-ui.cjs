'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const {Apps}=require('../src/apps'),{RendererRequests}=require('../src/renderer-requests'),{createStateSync}=require('../src/state-sync');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/apps-startup'),requests=new RendererRequests(),sync=createStateSync();
const state={version:1,bots:[{id:'a',name:'Chief',role:'Administrator',chat:[],sessions:{},color:'green'}],rooms:[],jobs:[],questions:[],views:[],asides:[],prefs:{theme:'deepseek',motion:'quiet'},memoryNews:{},usageSummaries:{},schedules:{tasks:[]},botActivity:{},executing:[]};
let config={key:'ak_isolated_ui_test_only',userId:'pibot_test',grants:[{accountId:'ca_exa',slug:'exa',botIds:['a']}]},release,fail=false;
const gate=new Promise(r=>release=r),network=[],calls=[],errors=[],results={};
const team={state,vault:{value(){if(!config)throw Error('not configured');return JSON.stringify(config);},list:()=>({available:true}),removeApps:async()=>config=null},bot:id=>state.bots.find(b=>b.id===id)};
const response=data=>({response:{ok:true,status:200},text:JSON.stringify(data)});
const apps=new Apps(team,{transport:async(url,options)=>{
  network.push({url,method:options.method});
  if(url.includes('/connected_accounts?')){await gate;if(fail)throw Error('isolated offline');return response({items:[{id:'ca_exa',toolkit:{slug:'exa'},status:'ACTIVE',alias:'搜索'}]});}
  if(url.includes('/toolkits/categories'))return response({items:[]});
  if(url.includes('/toolkits?'))return response({items:[{slug:'exa',name:'Exa',description:'搜索工具'}]});
  throw Error('unexpected test transport');
}});
const snapshot=()=>({...structuredClone(state),appConnections:apps.connections.view()});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';import {createClient} from '/renderer/rpc.mjs';
const client=createClient(async(_,{method,args})=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;});
window.remount=async()=>{window.dispose?.();const host=document.createElement('div');host.id='test';document.querySelector('#test').replaceWith(host);window.dispose=await mount(host,client,()=>{},true);};
await window.remount();window.ready=true;
</script></html>`;
async function operation(channel,input){
  calls.push({channel,input});
  if(channel==='team.startup')return {phase:'ready'};
  if(channel==='team.bootstrap')return snapshot();
  if(channel==='team.state')return sync(snapshot(),input.cursor);
  if(channel==='team.appearance')return {base:'light'};
  if(channel==='team.models')return [{key:'mock',label:'隔离测试模型',isDefault:true}];
  if(channel==='team.workspaces')return {current:'C:/isolated',projects:[]};
  if(channel==='team.updates')return {status:'current',current:'0.3.109'};
  if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready'};
  if(channel==='team.apps')return apps.operation(input);
  if(channel==='team.pin'){state.bots[0].unread=input.unread;return {id:'a',unread:input.unread};}
  throw Error('Unexpected operation '+channel);
}
const server=http.createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('content-type','text/html;charset=utf-8');return res.end(html);}
  if(req.url==='/rpc'){
    let text='';for await(const part of req)text+=part;const {method,args}=JSON.parse(text);let result;
    if(method==='request.start')result=requests.start(args,()=>operation(args.channel,args.payload||{}));
    else if(method==='request.read')result=args.release?requests.release(args.id):requests.read(args);
    else throw Error(method);
    res.setHeader('content-type','application/json');return res.end(JSON.stringify({result}));
  }
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))throw Error('path');
  res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));
}catch(error){res.setHeader('content-type','application/json');res.end(JSON.stringify({error:error.message}));}});
(async()=>{
  fs.mkdirSync(output,{recursive:true});let browser,page;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));apps.start();browser=await chromium.launch({headless:true,executablePath:process.env.PI_BOT_CHROMIUM_EXECUTABLE||undefined});
    page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#4d6bfe"/></svg>'}));
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.locator('#test .pi-bot-app:not([aria-busy])').waitFor();
    assert.equal(await page.locator('.pi-apps-dialog').evaluate(n=>n.open),false);assert.match(await page.locator('#native').getAttribute('title'),/正在检查/);
    assert.equal(calls.filter(c=>c.channel==='team.apps').length,0);assert.equal(network.length,1);results.backgroundStartsWithoutDialog=true;
    release();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps')?.dataset.connectionState==='ready');
    assert.match(await page.locator('#native').getAttribute('title'),/已连接 1/);assert.equal(await page.locator('.pi-connected-apps .pi-app-face').count(),1);assert.equal(await page.locator('.pi-connected-apps .pi-app-face').getAttribute('title'),'exa');
    await page.screenshot({path:path.join(output,'startup-connected.png')});results.sidebarRestoredWithoutClick=true;
    const old=apps.connections.view();await page.locator('#native').click();await page.getByRole('dialog',{name:'连接应用'}).getByText('已连接 1',{exact:true}).waitFor();
    assert.equal(network.filter(c=>c.url.includes('/connected_accounts?')).length,1);results.openReusesStartupResult=true;
    await page.getByRole('button',{name:'关闭应用',exact:true}).click();await page.evaluate(()=>window.remount());await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps')?.dataset.connectionState==='ready');
    assert.equal(await page.locator('.pi-apps-dialog').evaluate(n=>n.open),false);assert.match(await page.locator('#native').getAttribute('title'),/已连接 1/);results.switchBackRestoresConnection=true;
    fail=true;await assert.rejects(apps.inventory());await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps')?.dataset.connectionState==='error');assert.match(await page.locator('#native').getAttribute('title'),/自动重试/);
    fail=false;await apps.inventory();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps')?.dataset.connectionState==='ready');results.offlineAndRecoveryAppearWithoutDialog=true;
    await apps.clear();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps')?.dataset.connectionState==='disabled');
    await page.evaluate(async value=>{const {renderSidebarConnections}=await import('/renderer/sidebar-apps.mjs');renderSidebarConnections(document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps'),document.querySelector('#test').shadowRoot.querySelector('#native'),value);},old);
    assert.equal(await page.locator('.pi-connected-apps').getAttribute('data-connection-state'),'disabled');results.oldSnapshotCannotRestoreClearedConnection=true;
    assert.deepEqual(errors,[]);results.pageErrors=errors;results.passed=true;console.log(JSON.stringify(results,null,2));
  }catch(error){results.passed=false;results.error=error.stack;results.backend=apps.connections.view();results.calls=calls;results.network=network;results.pageErrors=errors;results.dom=await page?.evaluate(()=>({phase:document.querySelector('#test').shadowRoot.querySelector('.pi-connected-apps')?.dataset.connectionState,title:document.querySelector('#test').shadowRoot.querySelector('#native')?.title})).catch(()=>null);console.error(error);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{release();await apps.close();await page?.evaluate(()=>window.dispose?.()).catch(()=>{});await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));}
})();
