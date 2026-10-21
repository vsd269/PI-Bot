'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.env.PI_BOT_UI_OUTPUT||path.join(root,'output/playwright/upstream-020'));
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style></head><body><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';
const at='2026-10-21T02:10:00Z';
window.calls=[];window.failAnswer=false;window.holdAnswer=false;window.xss=false;
window.uiState={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',modelKey:'mock/model',chat:[]},{id:'worker',name:'Worker',role:'Worker',modelKey:'mock/model',chat:[{id:'user',who:'User',text:'整理一下项目进度',at},{id:'reply',who:'Worker',text:'已完成检查，结果如下。',at,durationMs:1250}]}],rooms:[{id:'room',name:'项目讨论组',members:['chief','worker'],adminId:'chief',log:[{id:'room-user',who:'User',text:'本群的资料请独立记忆。',at}]}],jobs:[],questions:[],views:[{id:'display',botId:'worker',title:'项目进度',status:'displayed',at,view:{type:'stack',children:[{type:'text',text:'<img src=x onerror="window.xss=true">'},{type:'metric',label:'已通过检查',value:20,tone:'good'},{type:'table',columns:[{key:'item',label:'检查项目'},{key:'status',label:'状态'}],rows:[['群记忆隔离','通过'],['回答重试','通过']]},{type:'progress',label:'迁移进度',percent:85}]}},{id:'interactive',botId:'worker',title:'下一步怎么安排',status:'pending',at,view:{type:'stack',children:[{type:'options',id:'plan',multi:true,options:[{label:'更新文档',description:'整理迁移说明'},{label:'打包插件',description:'生成新的安装包'}]},{type:'confirm',id:'confirm',confirmLabel:'确认安排',cancelLabel:'暂不安排'},{type:'form',id:'form',fields:[{id:'project',label:'项目名称',placeholder:'填写项目名称'}],submitLabel:'提交项目'}]}}],prefs:{theme:'deepseek',motion:'normal'},memoryNews:{},usageSummaries:{},schedules:{tasks:[]},botActivity:{},executing:[]};
localStorage.setItem('pi-bot.selection',JSON.stringify({kind:'bot',id:'worker'}));
const clone=v=>structuredClone(v);
window.dispose=await mount(document.querySelector('#test'),async(channel,input={})=>{
window.calls.push({channel,input});
if(channel==='team.startup')return {phase:'ready'};
if(channel==='team.bootstrap')return clone(window.uiState);
if(channel==='team.state')return {cursor:'test',state:clone(window.uiState)};
if(channel==='team.models')return [{key:'mock/model',label:'测试模型',isDefault:true}];
if(channel==='team.workspaces')return {current:'C:/mock',projects:[]};
if(channel==='team.extensions')return {events:[],errors:[]};
if(channel==='team.updates')return {status:'latest',current:'0.3.82'};
if(channel==='team.appearance')return {base:'light'};
if(channel==='team.pin')return clone(window.uiState);
if(channel==='team.view.answer'){
 if(window.holdAnswer)await new Promise(resolve=>window.releaseAnswer=resolve);
 if(window.failAnswer)throw Error('模拟保存失败');
 const view=window.uiState.views.find(view=>view.id===input.id);Object.assign(view,{status:input.dismissed?'dismissed':'answered',action:input.action,values:clone(input.values||{}),deliveryPending:false});return {id:view.id,status:view.status};
}
if(channel==='team.memory.view')return {roomId:input.roomId,entries:[{scope:'group',text:'本群的验收使用中文报告。',added:'2026-10-21'}],sizes:{group:28},limits:{main:4000},summary:null};
if(channel==='team.memory.add')return {};
throw Error('Unexpected operation '+channel);
},()=>{},true);window.ready=true;
</script></body></html>`;
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);});});
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const results={},errors=[];
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1380,height:1000}});page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.locator('.pi-startup').waitFor({state:'detached'});await page.locator('[data-view-id="interactive"]').waitFor();
  const app=page.locator('.pi-bot-app'),card=page.locator('[data-view-id="interactive"]');
  assert.equal(await page.locator('[data-line-id="user"] time').count(),1);assert.match(await page.locator('[data-line-id="reply"] .pi-message-meta').innerText(),/耗时 1 秒/);assert.equal(await page.locator('[data-view-id="display"] img').count(),0);assert.equal(await page.evaluate(()=>window.xss),false);results.staticComponentsAndSafeText=true;
  const field=card.getByLabel('项目名称');await field.fill('PI Bot 迁移');await field.evaluate(node=>node.setSelectionRange(3,6));
  await page.evaluate(()=>{window.uiState.bots[1].chat[1].text+=' 追加一条状态。';});await page.getByText('已完成检查，结果如下。 追加一条状态。',{exact:true}).waitFor();assert.equal(await field.inputValue(),'PI Bot 迁移');assert(await field.evaluate(node=>node===node.getRootNode().activeElement));assert.equal(await field.evaluate(node=>node.selectionStart),3);results.draftAndFocusSurviveRefresh=true;
  await page.screenshot({path:path.join(output,'cards-light.png')});
  // A stalled save is visible immediately; a failure restores usable controls.
  await page.evaluate(()=>{window.holdAnswer=true;window.failAnswer=true;});await card.getByRole('button',{name:'提交项目',exact:true}).click();await card.locator('input[name="project"]').waitFor();assert.equal(await card.getAttribute('aria-busy'),'true');assert(await card.getByRole('button',{name:'提交项目',exact:true}).isDisabled());await page.evaluate(()=>window.releaseAnswer());await page.getByText('模拟保存失败',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('[data-view-id="interactive"]').getAttribute('aria-busy')==='false');assert.equal(await field.inputValue(),'PI Bot 迁移');assert(await card.getByRole('button',{name:'提交项目',exact:true}).isEnabled());results.saveFailureAndBusyFeedback=true;
  await page.evaluate(()=>{window.holdAnswer=false;window.failAnswer=false;});await card.getByRole('button',{name:'提交项目',exact:true}).click();await card.getByText('已回答',{exact:true}).waitFor();assert.equal(await field.inputValue(),'PI Bot 迁移');assert(await field.isDisabled());results.formSubmission=true;
  assert.equal(await card.getByText('已取消',{exact:true}).count(),0);
  // Create a fresh pending view, then submit a multi-selection.
  await page.evaluate(()=>{const view=window.uiState.views[1];view.id='options';view.status='pending';delete view.values;});const options=page.locator('[data-view-id="options"]');await options.waitFor();await options.getByLabel('更新文档整理迁移说明').check();await options.getByLabel('打包插件生成新的安装包').check();await options.getByRole('button',{name:'提交所选',exact:true}).click();await options.getByText('已回答',{exact:true}).waitFor();assert.equal(await options.locator('input:checked').count(),2);results.optionsSubmission=true;
  await page.evaluate(()=>{const view=window.uiState.views[1];view.id='confirm';view.status='pending';delete view.values;});const confirm=page.locator('[data-view-id="confirm"]');await confirm.waitFor();await confirm.getByRole('button',{name:'确认安排',exact:true}).click();await confirm.getByText('已确认',{exact:true}).waitFor();results.confirmSubmission=true;
  // Exercise the real group drawer and feature dialog with the room target.
  await page.locator('#dismiss').click();await page.locator('#list [data-id="room"]').click();await page.locator('#title').click();await page.getByRole('button',{name:'群聊记忆',exact:true}).click();await page.getByText('本群的验收使用中文报告。',{exact:true}).waitFor();const request=await page.evaluate(()=>window.calls.filter(call=>call.channel==='team.memory.view').at(-1));assert.equal(request.input.roomId,'room');assert.equal(request.input.botId,undefined);await page.screenshot({path:path.join(output,'group-memory-light.png')});results.groupMemoryEntryAndRouting=true;
  // Use host palette propagation for dark-mode visual verification.
  await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');window.uiState.prefs.appearanceMode='independent';window.uiState.prefs.appearance='dark';});await page.waitForTimeout(1300);await page.screenshot({path:path.join(output,'group-memory-dark.png')});
  // Every rendered card remains within a narrow host view.
  await page.setViewportSize({width:820,height:950});await page.locator('dialog[open]').evaluate(async node=>{await Promise.allSettled(node.getAnimations({subtree:true}).filter(animation=>animation.effect.getTiming().iterations!==Infinity).map(animation=>animation.finished));});
  const bounds=await page.locator('dialog[open]').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=821,JSON.stringify(bounds));
  const memoryText=page.locator('.pi-memory-panel>textarea'),textBounds=await memoryText.boundingBox();assert(textBounds.height>=80,JSON.stringify(textBounds));assert(textBounds.x>=bounds.x&&textBounds.x+textBounds.width<=bounds.x+bounds.width,JSON.stringify(textBounds));
  await memoryText.fill('验收报告使用中文。');await memoryText.scrollIntoViewIfNeeded();assert(await memoryText.isVisible());await page.screenshot({path:path.join(output,'group-memory-narrow.png')});results.narrowViewport=true;
  assert.deepEqual(errors,[]);results.pageErrors=errors;results.passed=true;console.log(JSON.stringify(results,null,2));await page.evaluate(()=>window.dispose());
 }catch(error){results.passed=false;results.error=error.stack;console.error(error);process.exitCode=1;}finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
})();
