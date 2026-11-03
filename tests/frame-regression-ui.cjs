'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/frame-regression');
const html=`<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%}.window-controls{position:fixed;right:0;top:0;width:120px;height:46px;display:flex}.window-controls button{width:40px}
.app-work-panel-toggle{position:fixed;right:130px;top:0}.work-panel{position:fixed;right:0;top:46px;bottom:0;background:#ddd;width:var(--work-panel-width,320px)}
.work-panel-resize{position:absolute;left:-5px;top:0;bottom:0;width:10px;cursor:col-resize}
#layer{position:fixed;inset:0;pointer-events:none}#test{position:fixed;inset:0;width:100%;height:100%;pointer-events:auto}
</style><div class="app-shell"><div class="window-controls"><button>最小化</button><button>最大化</button><button>关闭</button></div><button class="app-work-panel-toggle" aria-pressed="false">原生工作区</button></div><div id="layer"><div id="test"></div></div><script type="module">
import {mount} from '/renderer/app.mjs';
import {attachWindowChrome} from '/renderer/window-chrome.mjs';
import {attachWorkspaceSidebar} from '/renderer/workspace-sidebar.mjs';
const at='2026-11-03T01:00:00Z',state={version:1,bots:[{id:'a',name:'测试 Bot',role:'Worker',modelKey:'mock',sessions:{private:'s'},chat:[{id:'u',who:'User',text:'你好',at},{id:'r',who:'测试 Bot',text:'测试回复，可选中复制。',at}]}],rooms:[{id:'g',name:'测试群',members:['a'],adminId:null,log:[]}],jobs:[],questions:[],views:[],asides:[],prefs:{theme:'deepseek',motion:'normal'},memoryNews:{},usageSummaries:{},schedules:{tasks:[]},botActivity:{},executing:[],learningNews:{pending:[],running:[]}};
localStorage.setItem('pi-bot.selection',JSON.stringify({kind:'bot',id:'a'}));
window.dispose=await mount(document.querySelector('#test'),async(channel,input)=>{
 if(channel==='team.startup')return {phase:'ready'};
 if(channel==='team.bootstrap')return structuredClone(state);
 if(channel==='team.state')return {cursor:'same',state:structuredClone(state)};
 if(channel==='team.appearance')return {base:'light'};
 if(channel==='team.models')return [{key:'mock',label:'测试模型',isDefault:true}];
 if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready',memoryCount:0};
 if(channel==='team.workspaces')return {current:'C:/test',projects:[]};
 if(channel==='team.apps')return {configured:false,storage:'encrypted',grants:[]};
 if(channel==='team.updates')return {status:'current',current:'0.3.92'};
 if(channel==='team.pin')return structuredClone(state);
 throw Error('Unexpected operation '+channel);
},()=>{},true);
const native=document.querySelector('.app-work-panel-toggle');native.onclick=()=>{
 const prior=document.querySelector('.work-panel');
 if(prior){native.setAttribute('aria-pressed','false');prior.classList.add('is-exiting');const w=prior.getBoundingClientRect().width;prior.animate([{width:w+'px',transform:'translateX(0)'},{width:'0px',transform:'translateX(8px)'}],{duration:300,fill:'both'}).finished.then(()=>prior.remove());return;}
 native.setAttribute('aria-pressed','true');const panel=document.createElement('aside');panel.className='work-panel';panel.innerHTML='<div class="work-panel-resize" role="separator" aria-label="原生工作区宽度"></div>';document.querySelector('.app-shell').append(panel);
 panel.animate([{width:'0px',transform:'translateX(8px)'},{width:'320px',transform:'translateX(0)'}],{duration:300}).finished.catch(()=>{});
 const grip=panel.firstElementChild;let dragging=false;grip.onpointerdown=e=>{dragging=true;grip.setPointerCapture(e.pointerId);};grip.onpointermove=e=>{if(dragging)panel.style.setProperty('--work-panel-width',Math.max(200,Math.min(550,innerWidth-e.clientX))+'px');};grip.onpointerup=()=>dragging=false;
};
window.chromeUI=attachWindowChrome(document.querySelector('#test'));window.chromeUI.setActive(true);
window.workspace=attachWorkspaceSidebar(document.querySelector('#test'));window.workspace.setActive(true);window.ready=true;
</script>`;
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{
 fs.mkdirSync(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;const results={},errors=[];
 try{
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);await page.locator('.pi-startup').waitFor({state:'detached'});
  const dragTo=async(locator,x)=>{const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+100);await page.mouse.down();await page.mouse.move(x,b.y+100,{steps:12});await page.mouse.up();};
  const side=page.locator('.sidebar'),splitter=page.getByRole('separator',{name:'调整侧栏宽度',exact:true});
  await dragTo(splitter,380);assert.equal(Math.round((await side.boundingBox()).width),380);let sb=await side.boundingBox(),gb=await splitter.boundingBox();assert(Math.abs(gb.x+gb.width/2-sb.x-sb.width)<2);
  await dragTo(splitter,240);assert.equal(Math.round((await side.boundingBox()).width),240);await dragTo(splitter,360);assert.equal(Math.round((await side.boundingBox()).width),360);results.leftGripTracksWidthAndCanDragRepeatedly=true;
  const title=page.locator('#title'),panel=page.locator('#details-drawer');await title.evaluate(n=>n.click());await page.waitForTimeout(70);let opening=await panel.evaluate(n=>({x:n.getBoundingClientRect().x,w:n.offsetWidth,r:n.parentElement.getBoundingClientRect().right,running:n.getAnimations().some(a=>a.playState==='running')}));assert(opening.running);assert(opening.x>opening.r-opening.w&&opening.x<opening.r);await page.waitForTimeout(300);
  const right=page.getByRole('separator',{name:'调整详情侧栏宽度',exact:true});await dragTo(right,1010);assert.equal(Math.round((await panel.boundingBox()).width),430);await dragTo(right,1110);assert.equal(Math.round((await panel.boundingBox()).width),330);await right.focus();await page.keyboard.press('ArrowLeft');assert.equal(Math.round((await panel.boundingBox()).width),346);results.rightResizeAndKeyboard=true;
  await page.locator('#close-details').evaluate(n=>n.click());await page.waitForTimeout(70);assert(await panel.isVisible());assert(await panel.evaluate(n=>n.getAnimations().some(a=>a.playState==='running')));await page.waitForTimeout(300);assert(await panel.isHidden());results.detailsOpenAndCloseAnimate=true;
  await title.evaluate(n=>n.click());await page.waitForTimeout(60);await page.locator('#close-details').evaluate(n=>n.click());await page.waitForTimeout(40);await title.evaluate(n=>n.click());await page.waitForTimeout(350);assert(await panel.isVisible());assert.equal(await title.getAttribute('aria-expanded'),'true');await page.locator('#close-details').click();await panel.waitFor({state:'hidden'});results.fastToggleKeepsFinalState=true;
  const drag=page.locator('[data-pi-bot-window-drag]');let db=await drag.boundingBox(),controls=await page.locator('.window-controls').boundingBox();assert(Math.abs(db.x-(await side.boundingBox()).width)<1);assert(db.x+db.width<=controls.x+1);assert.equal(await drag.evaluate(n=>n.getRootNode()===document),true);assert.equal(await drag.evaluate(n=>getComputedStyle(n).getPropertyValue('-webkit-app-region')),'drag');await page.locator('#sidebar-hide').click();await page.waitForTimeout(80);db=await drag.boundingBox();assert.equal(Math.round(db.x),64);await page.locator('#sidebar-hide').click();results.lightDomDragRegionAvoidsControlsAndTracksSidebar=true;
  await page.locator('.pi-workspace-toggle').click();await page.waitForTimeout(350);const nativeGrip=page.getByRole('separator',{name:'原生工作区宽度',exact:true});await dragTo(nativeGrip,1000);await page.waitForTimeout(60);assert.equal(Math.round((await page.locator('.work-panel').boundingBox()).width),440);assert.equal(await page.locator('#test').evaluate(n=>Math.round(n.getBoundingClientRect().right)),995);results.nativeResizeGripNotCovered=true;
  await page.locator('.pi-workspace-toggle').evaluate(n=>n.click());await page.waitForTimeout(75);const duringClose=await page.locator('#test').boundingBox();assert(duringClose.width>995&&duringClose.width<1440);await page.waitForTimeout(350);assert.equal(await page.locator('.work-panel').count(),0);assert.equal(Math.round((await page.locator('#test').boundingBox()).width),1440);results.nativeCloseFollowsAnimation=true;
  await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('.pi-startup').waitFor({state:'detached'});assert.equal(Math.round((await side.boundingBox()).width),360);await title.click();await page.waitForTimeout(350);assert.equal(Math.round((await panel.boundingBox()).width),346);results.savedWidthsRestore=true;
  await page.setViewportSize({width:560,height:900});await page.waitForTimeout(350);await title.click();await page.waitForTimeout(350);const narrow=await panel.boundingBox();assert(narrow.x>=0&&narrow.x+narrow.width<=561);results.narrowWindowBounds=true;await page.screenshot({path:path.join(output,'narrow.png')});
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#close-details').click();assert(await panel.isHidden());await title.click();assert(await panel.isVisible());results.reducedMotionRespected=true;
  await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(100);await page.screenshot({path:path.join(output,'resizable-panels.png')});
  await page.locator('#native').click();const apps=page.getByRole('dialog',{name:'连接应用'});await apps.waitFor();assert.equal(await apps.locator('.pi-apps-section').count(),4);await page.evaluate(()=>document.fonts.ready);assert(await page.evaluate(()=>[...document.fonts].some(f=>f.family.includes('PI Apps Geist')&&f.status==='loaded')));assert.equal(await apps.locator('.pi-apps-toolbar svg').first().getAttribute('viewBox'),'0 0 24 24');await apps.screenshot({path:path.join(output,'apps-in-full-renderer.png')});await page.getByRole('button',{name:'关闭应用',exact:true}).click();results.appsEntryInFullRenderer=true;
  await page.evaluate(()=>{window.workspace.close();window.chromeUI.close();window.dispose();});assert.equal(await drag.count(),0);assert.deepEqual(errors,[]);results.pageErrors=errors;results.passed=true;console.log(JSON.stringify(results,null,2));
 }catch(e){results.passed=false;results.error=e.stack;console.error(e);await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
 finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r));}
})();
