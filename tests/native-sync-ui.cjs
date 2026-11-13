'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright'),{RendererRequests}=require('../src/renderer-requests');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/native-sync');
const at=new Date().toISOString(),state={version:1,bots:[{id:'a',name:'Chief',role:'Administrator',chat:[],sessions:{g:'plan'},color:'green'},{id:'b',name:'Worker',role:'Worker',chat:[{id:'old',who:'Worker',text:'历史中文资料'.repeat(15000),at}],sessions:{g:'worker',private:'private'},unread:true,color:'blue'}],rooms:[{id:'g',name:'同步验证群',adminId:'a',members:['a','b'],planning:true,log:[{id:'user',who:'User',text:'请核对文件并生成报告',at},{id:'plan-line',who:'Chief',botId:'a',coordinator:true,planning:true,progress:true,planningId:'p',text:'正在分析并分派任务…',at}],planningClaim:{sessionId:'plan',turnId:'pt',status:'accepted',planningId:'p',at}}],jobs:[],questions:[],views:[],asides:[],prefs:{theme:'deepseek',motion:'quiet'},memoryNews:{},usageSummaries:{},schedules:{tasks:[]},botActivity:{},executing:[]};
const calls=[],nativeCalls=[],pending=new Map(),store=new RendererRequests(),errors=[],results={};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';import {createClient} from '/renderer/rpc.mjs';
const listeners=new Set();window.emit=e=>listeners.forEach(fn=>fn(e));
window.piDesktop={channels:{invoke:{pendingInteractive:'pi-desktop/agent/pendingInteractive',askToolResolve:'pi-desktop/agent/askTool/resolve'},event:{agentMessage:'pi-desktop/agent/event/message'}},on:(channel,fn)=>{listeners.add(fn);return()=>listeners.delete(fn);},invoke:async(channel,input)=>{const r=await fetch('/native',{method:'POST',body:JSON.stringify({channel,input})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;}};
const client=createClient(async(_,{method,args})=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;});
localStorage.setItem('pi-bot.selection',JSON.stringify({kind:'room',id:'g'}));
window.dispose=await mount(document.querySelector('#test'),client,()=>{},true);window.ready=true;
</script></html>`;
async function operation(channel,input){
  calls.push({channel,input});
  if(channel==='team.startup')return {phase:'ready'};
  if(channel==='team.bootstrap')return structuredClone(state);
  if(channel==='team.state')return {cursor:'ui',state:structuredClone(state)};
  if(channel==='team.appearance')return {base:'light'};
  if(channel==='team.models')return [{key:'mock',label:'隔离测试模型',isDefault:true}];
  if(channel==='team.workspaces')return {current:'C:/isolated',projects:[]};
  if(channel==='team.updates')return {status:'current',current:'0.3.108'};
  if(channel==='team.pin'){const item=(input.kind==='room'?state.rooms:state.bots).find(v=>v.id===input.id);item.unread=input.unread;return {id:input.id,unread:item.unread};}
  if(channel==='team.attachment.preview')return {dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='};
  if(channel==='team.group.stop'){state.rooms[0].planning=false;state.jobs.forEach(j=>j.status='aborted');return {requested:true};}
  if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready'};
  throw Error('Unexpected operation '+channel);
}
const server=http.createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('content-type','text/html;charset=utf-8');return res.end(html);}
  if(req.url==='/rpc'||req.url==='/native'){
    let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);let result;
    if(req.url==='/rpc'){const {method,args}=data;if(method==='request.start')result=store.start(args,()=>operation(args.channel,args.payload||{}));else if(method==='request.read')result=args.release?store.release(args.id):store.read(args);else throw Error(method);}
    else {nativeCalls.push(data);if(data.channel.endsWith('/pendingInteractive'))result={asks:pending.get(data.input.sessionId)||[]};else {pending.set(data.input.sessionId,[]);result={ok:true};}}
    res.setHeader('content-type','application/json');return res.end(JSON.stringify({result}));
  }
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));
}catch(e){res.setHeader('content-type','application/json');res.end(JSON.stringify({error:e.message}));}});
(async()=>{
  fs.mkdirSync(output,{recursive:true});let browser,page;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,executablePath:process.env.PI_BOT_CHROMIUM_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1280,height:860}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#transcript').getByText('正在分析并分派任务…',{exact:true}).waitFor();
    const begin=Date.now();await page.evaluate(()=>emit({sessionId:'plan',turnId:'pt',event:{type:'message_update',stream:'delta',message:{id:'pm',role:'assistant',content:''},deltaText:'{"reply":"我正在核对文件'}}));await page.getByText('我正在核对文件',{exact:true}).waitFor();assert(Date.now()-begin<1500);assert.equal(state.rooms[0].log[1].text,'正在分析并分派任务…','durable transcript intentionally has no partial text');results.planningStreamsBeforePersistence=true;
    await page.evaluate(()=>emit({sessionId:'plan',turnId:'pt',event:{type:'message_update',stream:'delta',message:{id:'pm',role:'assistant',content:''},deltaText:'，稍后生成报告","assignments":[]}'}}));await page.getByText('我正在核对文件，稍后生成报告',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'planning-stream.png')});
    await page.locator('#content').fill('@');await page.locator('.mention-picker').getByRole('button',{name:'Chief',exact:true}).waitFor();await page.locator('.mention-picker').getByRole('button',{name:'Chief',exact:true}).click();assert.equal(await page.locator('#content').inputValue(),'@Chief ');await page.locator('#content').fill('');results.administratorMention=true;
    const request={sessionId:'plan',requestId:'native-question',toolCallId:'ask',questions:[{question:'请选择输出格式',options:[{label:'Markdown',description:'生成可编辑的文本报告'},{label:'PDF',description:'适合打印和分享'}]}]};pending.set('plan',[request]);await page.evaluate(request=>emit({sessionId:'plan',turnId:'pt',event:{type:'asktool_request',request}}),request);
    const card=page.locator('.question-card').filter({hasText:'请选择输出格式'});await card.waitFor();await card.getByText('生成可编辑的文本报告',{exact:true}).waitFor();await card.getByRole('button',{name:'Markdown',exact:true}).click();assert.equal(await card.getByRole('button',{name:'Markdown',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await card.getByRole('button',{name:'Markdown',exact:true}).locator('.bt-q-check').isVisible(),true);assert.equal(nativeCalls.filter(c=>c.channel.endsWith('/resolve')).length,0);await page.screenshot({path:path.join(output,'native-question.png'),animations:'disabled'});await card.getByRole('button',{name:'提交回答',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#test').shadowRoot.querySelector('.question-card[aria-busy="true"]'));assert.deepEqual(nativeCalls.find(c=>c.channel.endsWith('/resolve')).input,{sessionId:'plan',requestId:'native-question',answers:[['Markdown']]});assert.equal(calls.filter(c=>c.channel==='team.question.answer'||c.channel==='team.group.send').length,0);results.nativeQuestionResumesOriginalTool=true;
    state.jobs.push({id:'wj',botId:'b',roomId:'g',sessionId:'worker',turnId:'wt',status:'running',at,startedAt:at,task:'生成报告'});await page.locator('.pi-working-label').filter({hasText:'Worker'}).waitFor();
    await page.evaluate(()=>emit({sessionId:'worker',turnId:'wt',event:{type:'message_update',stream:'delta',message:{id:'wm',role:'assistant',content:''},deltaText:'报告第一段已经开始输出'}}));await page.getByText('报告第一段已经开始输出',{exact:true}).waitFor();results.workerStreamsBeforePersistence=true;
    state.rooms[0].log.push({id:'legacy-system',who:'System',text:'已请求停止本群全部工作',at},{id:'image',who:'User',text:'查看图片',at,attachments:[{name:'demo.png',path:'demo.png'}]});
    await page.locator('[data-line-id="legacy-system"] .bt-group-name').getByText('Chief · 管理员',{exact:true}).waitFor();assert.equal(await page.locator('[data-line-id="legacy-system"]').getByText('System',{exact:true}).count(),0);await page.locator('.pi-image-expand svg').waitFor({state:'attached'});results.legacyNoticesAndExpandIcon=true;
    await page.locator('#list [data-id="b"]').click();await page.locator('#list [data-id="b"] .bt-unread').waitFor({state:'detached'});for(let i=0;i<60&&state.bots[1].unread;i++)await new Promise(r=>setTimeout(r,50));assert.equal(state.bots[1].unread,false);state.bots[1].unread=true;await page.waitForTimeout(2800);assert.equal(await page.locator('#list [data-id="b"] .bt-unread').count(),0);results.staleUnreadSuppressed=true;
    await page.locator('#list [data-id="g"]').click();await page.screenshot({path:path.join(output,'group-stream-and-notice.png')});assert.deepEqual(errors,[]);results.pageErrors=errors;results.passed=true;await page.evaluate(()=>dispose());console.log(JSON.stringify(results,null,2));
  }catch(error){results.passed=false;results.error=error.stack;results.pageErrors=errors;console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r));}
})();
