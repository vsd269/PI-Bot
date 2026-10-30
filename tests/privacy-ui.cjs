'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/privacy');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style></head><body><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';
const clone=v=>structuredClone(v);window.calls=[];
window.uiState={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',chat:[]},{id:'worker',name:'Worker',role:'Worker',workDir:'C:/private',sessions:{private:'session'},chat:[]},{id:'public',name:'Public',role:'Worker',chat:[]}],rooms:[{id:'room',name:'Public group',members:['chief','public'],adminId:'chief',log:[]}],jobs:[],asides:[],views:[],questions:[],prefs:{theme:'deepseek',motion:'normal'},memoryNews:{},botActivity:{},usageSummaries:{},schedules:{tasks:[]},executing:[],learningNews:{pending:[],running:[]}};
localStorage.setItem('pi-bot.selection',JSON.stringify({kind:'bot',id:'worker'}));localStorage.removeItem('pi-bot.sidebarCollapsed');
window.dispose=await mount(document.querySelector('#test'),async(channel,input={})=>{
 window.calls.push({channel,input});
 if(channel==='team.startup')return {phase:'ready'};
 if(channel==='team.bootstrap')return clone(window.uiState);
 if(channel==='team.state')return {cursor:'ui',state:clone(window.uiState)};
 if(channel==='team.models')return [{key:'mock/model',label:'测试模型',isDefault:true}];
 if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready',memoryCount:0};
 if(channel==='team.workspaces')return {current:'C:/workspace',projects:[]};
 if(channel==='team.appearance')return {base:'light'};
 if(channel==='team.updates')return {status:'current',current:'0.3.89',latest:'0.3.89'};
 if(channel==='team.bot.patch'){await new Promise(r=>setTimeout(r,70));if(window.failPatch)throw Error('测试保存失败，未更改设置');Object.assign(window.uiState.bots.find(b=>b.id===input.id),input.patch);return clone(window.uiState);}
 if(channel==='team.pin')return clone(window.uiState);
 if(channel==='team.learning'){if(input.action==='text'){const text='用户审阅后可共享的方法';return {text,next:text.length,total:text.length};}if(input.action==='answer'){window.uiState.learningNews.pending=[];return {applied:input.approve};}}
 throw Error('Unexpected UI test operation '+channel);
});
</script></body></html>`;
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{fs.mkdirSync(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;const results={},errors=[];
 try{browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1400,height:980}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#list [data-id="worker"]').waitFor();
 const settings=async()=>{await page.locator('#title').click();await page.locator('#edit').click();await page.locator('#bot-private').waitFor({state:'visible'});};
 await settings();assert.equal(await page.locator('#bot-private').getAttribute('aria-checked'),'false');assert((await page.locator('#bot-privacy-section').innerText()).includes('插件层隔离'));await page.locator('#bot-private').click();await page.waitForFunction(()=>window.uiState.bots[1].private===true);await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('#bot-private').getAttribute('aria-checked')==='true');assert.match(await page.locator('#bs-sub').innerText(),/私密 Bot/);results.toggleAndScopeCopy=true;await page.locator('#details-drawer').evaluate(async n=>{await Promise.allSettled(n.getAnimations({subtree:true}).filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished));});await page.screenshot({path:path.join(output,'private-setting.png'),animations:'disabled'});
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();await settings();assert.equal(await page.locator('#bot-private').getAttribute('aria-checked'),'true');results.reopenKeepsPrivate=true;
 await page.evaluate(()=>window.failPatch=true);await page.locator('#bot-private').click();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelector('#bot-private').disabled===false);assert.equal(await page.locator('#bot-private').getAttribute('aria-checked'),'true');assert.equal(await page.evaluate(()=>window.uiState.bots[1].private),true);await page.evaluate(()=>window.failPatch=false);results.failedSaveKeepsPriorState=true;
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.locator('#list [data-id="chief"]').click();await page.locator('#title').click();await page.locator('#edit').click();assert.equal(await page.locator('#bot-privacy-section').isVisible(),false);results.mainCannotToggle=true;
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.locator('#list [data-id="worker"]').click();await page.evaluate(()=>window.uiState.learningNews.pending=[{id:'private-skill',botId:'worker',kind:'skill',private:true,name:'reviewed-private-skill',reason:'复用方法',status:'pending',at:new Date().toISOString()}]);await page.locator('.pi-learning-card').getByRole('button').click();await page.getByText('这是私密 Bot 的经验提案。确认保存会将下方内容加入所有 Bot 都可读取的共享能力库；请先检查并确认愿意共享。',{exact:true}).waitFor();await page.getByRole('button',{name:'拒绝',exact:true}).click();await page.locator('.pi-learning-card').waitFor({state:'hidden'});results.privateSkillApprovalWarning=true;
 await page.locator('#new').click();await page.getByRole('option',{name:'新建群聊',exact:true}).click();const recipients=page.getByRole('listbox',{name:'收件人列表'});assert(!await recipients.getByText('Worker',{exact:true}).count());assert(await recipients.getByText('Public',{exact:true}).count());results.groupPickerExcludesPrivate=true;await page.getByRole('button',{name:'关闭新建聊天',exact:true}).click();
 await page.locator('#list [data-id="room"]').click();await page.locator('#title').click();await page.locator('#edit').click();assert.equal(await page.locator('#room-add-member').isVisible(),false);results.existingGroupExcludesPrivate=true;
 assert.deepEqual(errors,[]);results.passed=true;results.pageErrors=errors;await page.evaluate(()=>window.dispose());console.log(JSON.stringify(results,null,2));
 }catch(error){results.passed=false;results.error=error.stack;results.pageErrors=errors;console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
 finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r));}
})();
