'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/upstream-024');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style></head><body><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';
const at='2026-10-30T02:00:00Z',clone=v=>structuredClone(v);window.calls=[];window.xss=false;
window.uiState={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',modelKey:'mock/model',chat:[]},{id:'worker',name:'Worker',role:'Worker',modelKey:'mock/model',sessions:{private:'session'},chat:[]}],rooms:[{id:'room',name:'群聊停止测试',members:['chief','worker'],adminId:'chief',planning:true,log:[]}],jobs:[{id:'work',botId:'worker',roomId:'room',task:'本群运行任务',status:'running',at},{id:'other-private',botId:'worker',task:'独立私聊任务',status:'running',at}],asides:[],views:[],questions:[],prefs:{theme:'deepseek',motion:'normal'},memoryNews:{},botActivity:{},usageSummaries:{},schedules:{tasks:[]},executing:['worker'],learningNews:{pending:[{id:'skill',botId:'worker',kind:'skill',name:'test-skill',reason:'复用核对流程',description:'检查结构',status:'pending',at},{id:'agents',botId:'worker',kind:'agents',reason:'保存项目规则',path:'C:/project/AGENTS.md',status:'pending',at}],running:[]}};
const texts={skill:{content:'核对步骤。'.repeat(1500)},agents:{before:'# 项目规则\\n',content:'# 项目规则\\n\\n完成后核对实际文件。\\n<iframe onload="window.xss=true">原文测试</iframe>'}};
localStorage.setItem('pi-bot.selection',JSON.stringify({kind:'bot',id:'worker'}));localStorage.removeItem('pi-bot.sidebarCollapsed');localStorage.removeItem('pi-bot.sidebarWidth');
window.dispose=await mount(document.querySelector('#test'),async(channel,input={})=>{
 window.calls.push({channel,input});
 if(channel==='team.startup')return {phase:'ready'};
 if(channel==='team.bootstrap')return clone(window.uiState);
 if(channel==='team.state')return {cursor:'ui',state:clone(window.uiState)};
 if(channel==='team.models')return [{key:'mock/model',label:'测试模型',isDefault:true}];
 if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready',memoryCount:0};
 if(channel==='team.workspaces')return {current:'C:/project',projects:[]};
 if(channel==='team.appearance')return {base:'light'};
 if(channel==='team.office')return {available:true,version:'24.11.0'};
 if(channel==='team.updates')return {status:'current',current:'0.3.88',latest:'0.3.88'};
 if(channel==='team.prefs'){Object.assign(window.uiState.prefs,input);return clone(window.uiState);}
 if(channel==='team.group.stop'){await new Promise(r=>setTimeout(r,180));window.uiState.rooms[0].planning=false;window.uiState.jobs[0].status='aborted';return {requested:true};}
 if(channel==='team.learning'){
  if(input.action==='text'){const value=texts[input.id][input.part]||'';return {text:value.slice(input.offset,input.offset+6000),next:Math.min(value.length,input.offset+6000),total:value.length};}
  if(input.action==='answer'){await new Promise(r=>setTimeout(r,150));window.uiState.learningNews.pending=window.uiState.learningNews.pending.filter(p=>p.id!==input.id);return {applied:input.approve};}
  if(input.action==='review'){window.uiState.learningNews.running=['worker'];return {accepted:true};}
 }
 throw Error('Unexpected UI test operation '+channel);
});
</script></body></html>`;
const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));
});
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;const results={},errors=[];
 try{
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1400,height:920}});page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.pi-learning-card').first().waitFor();
  await page.locator('.pi-learning-card').filter({hasText:'test-skill'}).getByRole('button').click();await page.getByRole('button',{name:'确认保存',exact:true}).waitFor();assert.equal((await page.locator('.pi-learning-body pre').textContent()).length,7500);assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c.channel==='team.learning'&&c.input.id==='skill').map(c=>c.input.offset)),[0,6000]);await page.getByRole('button',{name:'拒绝',exact:true}).click();await page.locator('.pi-learning-card').filter({hasText:'test-skill'}).waitFor({state:'hidden'});results.chunkedPreviewAndDecline=true;
  await page.locator('.pi-learning-card').getByRole('button').click();await page.getByRole('button',{name:'确认保存',exact:true}).waitFor();assert((await page.locator('.pi-learning-body pre').last().textContent()).includes('<iframe'));assert.equal(await page.locator('.pi-learning-body iframe').count(),0);await page.screenshot({path:path.join(output,'learning-proposal.png')});await page.getByRole('button',{name:'确认保存',exact:true}).click();await page.locator('.pi-learning-card').waitFor({state:'hidden'});results.proposalApprovalAndSafeText=true;
  await page.getByRole('button',{name:'复盘经验',exact:true}).click();await page.getByText('正在复盘已完成的任务…',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'复盘经验',exact:true}).isDisabled());results.manualReviewStatus=true;
  await page.locator('#account').click();await page.locator('#bot-settings-item').click();const automatic=page.getByLabel('空闲时复盘工作经验',{exact:true});assert.equal(await automatic.inputValue(),'false');await automatic.selectOption('true');await page.waitForFunction(()=>window.uiState.prefs.learningReview===true);await page.getByRole('button',{name:'检查 Office 环境',exact:true}).click();await page.getByText('轻量 Office 工具可用 · Node.js 24.11.0。',{exact:false}).waitFor();results.officeEnvironmentSetting=true;await page.locator('dialog[open]').evaluate(n=>n.close());results.optInReviewSetting=true;
  await page.locator('#list [data-id="room"]').click();await page.locator('#title').click();const stop=page.getByRole('button',{name:'停止本群全部工作',exact:true});await stop.click();await page.waitForFunction(()=>window.calls.some(c=>c.channel==='team.group.stop'));await page.waitForFunction(()=>window.uiState.jobs[0].status==='aborted');assert.equal(await page.evaluate(()=>window.uiState.jobs[1].status),'running');await page.screenshot({path:path.join(output,'group-stop.png')});results.groupStopAndScope=true;
  await page.setViewportSize({width:900,height:920});await page.locator('#details-drawer').waitFor({state:'hidden'});assert.equal(await page.locator('.pi-bot-app').getAttribute('data-frame-layout'),'open');results.rightPanelFoldsFirst=true;
  await page.setViewportSize({width:560,height:920});await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-bot-app').dataset.frameLayout==='rail');let side=await page.locator('.sidebar').boundingBox();assert.equal(Math.round(side.width),64);await page.locator('#sidebar-hide').click();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-bot-app').dataset.frameLayout==='drawer');assert.equal(await page.locator('#test').evaluate(n=>localStorage.getItem('pi-bot.sidebarCollapsed')),'false');await page.screenshot({path:path.join(output,'sidebar-narrow.png')});await page.locator('.chat').click({position:{x:470,y:100}});await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-bot-app').dataset.frameLayout==='rail');results.narrowRailAndTemporaryDrawer=true;
  await page.setViewportSize({width:1400,height:920});await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('.pi-bot-app').dataset.frameLayout==='open');const splitter=page.getByRole('separator',{name:'调整侧栏宽度'});const box=await splitter.boundingBox();await page.mouse.move(box.x+3,box.y+100);await page.mouse.down();await page.mouse.move(110,box.y+100,{steps:6});await page.mouse.up();await page.waitForFunction(()=>localStorage.getItem('pi-bot.sidebarCollapsed')==='true');assert.equal(await page.locator('.pi-bot-app').getAttribute('data-frame-layout'),'rail');results.dragSnapAndPreference=true;
  assert.equal(await page.evaluate(()=>window.xss),false);assert.deepEqual(errors,[]);results.pageErrors=errors;results.passed=true;await page.evaluate(()=>window.dispose());console.log(JSON.stringify(results,null,2));
 }catch(error){results.passed=false;results.pageErrors=errors;results.error=error.stack;console.error(errors);console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
 finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r));}
})();
