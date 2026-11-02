'use strict';
// Real renderer + Attention backend; PI Desktop/session calls are simulated.
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const {Team}=require('../src/team'),{Vault}=require('../src/vault'),{StateFile}=require('../src/state-file');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/attention');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style></head><body><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';
window.calls=[];window.xss=false;
window.dispose=await mount(document.querySelector('#test'),async(channel,input={})=>{
  window.calls.push({channel,input});
  const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,input})});
  const value=await response.json();if(value.error)throw Error(value.error);return value.result;
});
</script></body></html>`;
(async()=>{
  await fs.mkdir(output,{recursive:true});const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-attention-ui-')),t=new Team({__testHost:true});t.data=dir;t.file=path.join(dir,'team.json');t.queueCheckpoint=()=>{};
  const at='2026-11-03T02:00:00Z';t.state={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',chat:[]},{id:'worker',name:'Worker',role:'Worker',chat:[],sessions:{private:'native-ui'}}],rooms:[],jobs:[{id:'approval',botId:'worker',task:'待原生审批',status:'waiting',sessionId:'native-ui',at},{id:'failure',botId:'worker',task:'核对结果',status:'error',error:'测试错误 <img src=x onerror="window.xss=true">',sessionId:'native-ui',at}],questions:[{id:'question',botId:'worker',text:'请选择下一步 <img src=x onerror="window.xss=true">',status:'pending',at}],views:[],asides:[],completions:[],prefs:{theme:'deepseek',motion:'quiet'},memoryNews:{},botActivity:{},usageSummaries:{},schedules:[],executing:[],learningNews:{pending:[],running:[]}};
  for(let i=0;i<42;i++)t.state.jobs.push({id:'done-'+i,botId:'worker',task:'完成任务 '+i,status:'completed',at});
  t.backups={root:dir};t.vault=new Vault(t);await t.save();t.store=new StateFile(t.file);await t.store.acquire();await t.store.load();
  let failedList=false,listDelay=0,seenCalls=0,resolveCalls=0;
  const rpc=async(channel,input)=>{
    if(channel==='team.attention'){
      if(input.action==='seen'){seenCalls++;await new Promise(r=>setTimeout(r,200));}
      if(input.action==='resolve_store')resolveCalls++;
      if(!input.action||input.action==='list'){if(listDelay)await new Promise(r=>setTimeout(r,listDelay));if(failedList){failedList=false;throw Error('测试读取失败，请重试');}}
      return t.attention.operation(input);
    }
    if(channel==='team.startup')return {phase:'ready'};
    if(channel==='team.bootstrap')return t.state;
    if(channel==='team.state')return {cursor:'ui',state:t.state};
    if(channel==='team.models')return [{key:'mock/model',label:'测试模型',isDefault:true}];
    if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready',memoryCount:0};
    if(channel==='team.workspaces')return {current:'C:/project',projects:[]};
    if(channel==='team.appearance')return {base:'light'};
    if(channel==='team.updates')return {status:'current',current:'0.3.90',latest:'0.3.90'};
    if(channel==='team.session.open')return {opened:true};
    if(channel==='team.office')return {available:true,version:'24.11.0'};
    throw Error('Unexpected UI operation '+channel);
  };
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.url==='/rpc'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);const {channel,input}=JSON.parse(Buffer.concat(chunks).toString());
        res.setHeader('Content-Type','application/json');try{res.end(JSON.stringify({result:await rpc(channel,input)}));}catch(error){res.end(JSON.stringify({error:error.message}));}return;
      }
      if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
      const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.statusCode=404;return res.end();}
      const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(bytes);
    }catch{res.statusCode=404;res.end();}
  });
  let browser,page;const results={},errors=[];
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1400,height:920}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#account').click();await page.locator('#bot-settings-item').click();await page.locator('[data-page="attention"].bt-settings-item').click();
    await page.getByRole('button',{name:'需要我处理 · 2',exact:true}).waitFor();assert.equal(await page.locator('.feature-body .feature-card').count(),2);
    assert.equal(await page.locator('.feature-body img').count(),0);assert.equal(await page.locator('.feature-body').getByRole('button',{name:'批准',exact:true}).count(),0);
    await page.getByRole('button',{name:'打开原生会话',exact:true}).click();assert(await page.evaluate(()=>window.calls.some(c=>c.channel==='team.session.open'&&c.input.sessionId==='native-ui')));results.pendingAndNativeApproval=true;
    await page.getByRole('button',{name:'已完成待查看 · 42',exact:true}).click();await page.getByText('执行结束；尚未独立验收成果。',{exact:true}).first().waitFor();assert.equal(await page.locator('.feature-body .feature-card').count(),20);await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByRole('button',{name:'上一页',exact:true}).waitFor();await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelectorAll('.feature-body .feature-card').length===2);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);results.paginationAndHonestVerification=true;
    const seen=page.getByRole('button',{name:'标为已查看',exact:true}).first();await seen.click();await page.getByRole('button',{name:'正在处理…',exact:true}).waitFor();assert(await page.getByRole('button',{name:'正在处理…',exact:true}).isDisabled());await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelectorAll('.feature-body .feature-card').length===1);assert.equal(seenCalls,1);
    await page.getByRole('button',{name:'标为已查看',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#test').shadowRoot.querySelectorAll('.feature-body .feature-card').length===20);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);results.immediateFeedbackAndLastPageFallback=true;
    await page.getByRole('button',{name:'运行异常 · 1',exact:true}).click();await page.getByRole('button',{name:'核对与恢复',exact:true}).waitFor();assert.equal(await page.locator('.feature-body img').count(),0);await page.waitForTimeout(450);await page.screenshot({path:path.join(output,'attention-issues.png'),animations:'disabled'});results.safeErrorText=true;
    const external={...t.state,bots:t.state.bots.filter(b=>b.id!=='worker')};await fs.writeFile(t.file,JSON.stringify(external));await assert.rejects(()=>t.store.write(JSON.stringify(t.state)),e=>e.code==='PI_BOT_STORE_CONFLICT');t.storeConflict=t.store.conflict;
    await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByText('团队数据出现外部修改',{exact:true}).waitFor();await page.waitForTimeout(450);await page.screenshot({path:path.join(output,'attention-conflict.png'),animations:'disabled'});const keep=page.getByRole('button',{name:'保留当前插件数据',exact:true});await keep.click();await page.getByRole('button',{name:'再次点击确认保留',exact:true}).waitFor();assert.equal(resolveCalls,0);await page.getByRole('button',{name:'再次点击确认保留',exact:true}).click();await page.getByText('团队数据出现外部修改',{exact:true}).waitFor({state:'hidden'});assert.equal(resolveCalls,1);assert.equal(t.state.jobs.find(j=>j.id==='approval').status,'needs_review');results.conflictRequiresTwoClicksAndPausesWork=true;
    failedList=true;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.locator('.feature-body').getByText('测试读取失败，请重试',{exact:true}).waitFor();await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.getByRole('button',{name:'刷新',exact:true}).waitFor();results.retryAfterReadFailure=true;
    listDelay=300;await page.getByRole('button',{name:'刷新',exact:true}).click();await page.locator('[data-page="general"].bt-settings-item').click();await page.waitForTimeout(400);assert.equal(await page.locator('dialog[open]').getAttribute('data-page'),'general');assert.equal(await page.getByRole('button',{name:'需要我处理 · 2',exact:true}).count(),0);results.noLatePageReplacement=true;
    assert.equal(await page.evaluate(()=>window.xss),false);assert.deepEqual(errors,[]);results.pageErrors=errors;results.passed=true;await page.evaluate(()=>window.dispose());console.log(JSON.stringify(results,null,2));
  }catch(error){results.passed=false;results.error=error.stack;results.pageErrors=errors;console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r));await t.writes;await t.store.close();await fs.rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
})();
