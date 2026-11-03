'use strict';
// Real application renderer and real isolated backend; no user data or live model.
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PI_BOT_PLAYWRIGHT_MODULE||'playwright');
const {Team}=require('../src/team'),{Vault}=require('../src/vault'),{FileWaits}=require('../src/file-waits'),{Schedules}=require('../src/schedules'),{TeamTemplates}=require('../src/team-templates');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/work-upgrade');
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body,#test{height:100%;margin:0}</style></head><body><div id="test"></div><script type="module">
import {mount} from '/renderer/app.mjs';window.calls=[];
window.dispose=await mount(document.querySelector('#test'),async(channel,input={})=>{window.calls.push({channel,input});const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,input})});const value=await response.json();if(value.error)throw Error(value.error);return value.result;});
</script></body></html>`;
(async()=>{
  await fs.mkdir(output,{recursive:true});const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-work-ui-')),t=new Team({__testHost:true,workspace:{get:async()=>({path:dir})}});t.data=dir;t.file=path.join(dir,'team.json');t.queueCheckpoint=()=>{};
  const at=new Date().toISOString();t.state={version:1,bots:[{id:'chief',name:'Chief',role:'Administrator',modelKey:'',chat:[]},{id:'worker',name:'Worker',role:'Worker',modelKey:'',chat:[]}],rooms:[],jobs:[{id:'done',botId:'worker',task:'核对文档',status:'completed',at,toolCalls:2,toolEvents:[{name:'read_file',status:'completed'}],result:'已保存结果'}],questions:[],views:[],asides:[],completions:[],prefs:{theme:'deepseek',motion:'quiet'},memoryNews:{},botActivity:{},usageSummaries:{},schedules:[],executing:[],learningNews:{pending:[],running:[]}};
  t.vault=new Vault({state:t.state,backups:{root:dir}});t.fileWaits=new FileWaits(t);t.fileWaits.load();t.schedules=new Schedules(t);t.templates=new TeamTemplates(t);let failWait=true,delay=0;
  const rpc=async(channel,input={})=>{
    if(channel==='team.fileWaits'){if(input.action==='create'){if(failWait){failWait=false;throw Error('模拟保存失败，请重试');}await new Promise(r=>setTimeout(r,200));return t.fileWaits.create(input);}if(input.action==='cancel')return t.fileWaits.cancel(input.id);if(delay)await new Promise(r=>setTimeout(r,delay));return t.fileWaits.view();}
    if(channel==='team.template')return t.templates.operation(input);
    if(channel==='team.job.cancel'){assert.equal(input.jobId,'loop');t.state.jobs.find(j=>j.id==='loop').status='aborted';return {requested:true};}
    if(channel==='team.schedules')return t.schedules.view();
    if(channel==='team.attention')return t.attention.operation(input);
    if(channel==='team.recovery')return { ...(input.action==='receipt'?require('../src/tool-progress').receipt(t,t.state.jobs[0]):{jobs:[]}) };
    if(channel==='team.backup')return {path:dir,items:[]};
    if(channel==='team.startup')return {phase:'ready'};
    if(channel==='team.bootstrap')return t.state;
    if(channel==='team.state')return input.sync?{cursor:'ui',state:t.state}:t.state;
    if(channel==='team.models')return [{key:'mock/model',label:'测试模型',isDefault:true}];
    if(channel==='team.bot.preview')return {permissionMode:'inherit',permissionStatus:'ready',memoryCount:0};
    if(channel==='team.workspaces')return {current:dir,projects:[]};
    if(channel==='team.appearance')return {base:'light'};
    if(channel==='team.updates')return {status:'current',current:'0.3.91',latest:'0.3.91'};
    if(channel==='team.office')return {available:true,version:'24.11.0'};
    throw Error('Unexpected UI operation '+channel);
  };
  const server=http.createServer(async(req,res)=>{try{if(req.url==='/rpc'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const {channel,input}=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');try{res.end(JSON.stringify({result:await rpc(channel,input)}));}catch(e){res.end(JSON.stringify({error:e.message}));}return;}if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.statusCode=404;return res.end();}const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}});
  let browser,page;const results={},errors=[];
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1400,height:920}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#account').click();await page.locator('#bot-settings-item').click();await page.locator('[data-page="schedules"].bt-settings-item').click();
    await page.getByRole('heading',{name:'文件条件等待',exact:true}).waitFor();await page.getByText('新建文件等待',{exact:true}).click();await page.getByLabel('工作目录内的相对文件路径').fill('outputs/report.txt');await page.getByLabel('条件满足后执行的任务').fill('核对实际文件内容。');await page.getByRole('button',{name:'创建文件等待',exact:true}).click();await page.locator('.pi-settings-status').getByText('模拟保存失败，请重试',{exact:true}).waitFor();assert.equal(t.state.fileWaits.length,0);
    await page.getByRole('button',{name:'创建文件等待',exact:true}).click();await page.getByRole('button',{name:'正在保存…',exact:true}).waitFor();assert(await page.getByRole('button',{name:'正在保存…',exact:true}).isDisabled());await page.getByRole('button',{name:'取消等待',exact:true}).waitFor();assert.equal(t.state.fileWaits.length,1);assert.equal(t.state.jobs.length,1);results.waitCreationErrorAndBusyState=true;
    await page.screenshot({path:path.join(output,'file-waits.png'),animations:'disabled'});await page.getByRole('button',{name:'取消等待',exact:true}).click();await page.getByText('已取消',{exact:true}).waitFor();assert.equal(t.state.fileWaits[0].status,'cancelled');results.cancelWait=true;
    delay=350;await page.locator('[data-page="general"].bt-settings-item').click();await page.locator('[data-page="schedules"].bt-settings-item').click();await page.locator('[data-page="general"].bt-settings-item').click();await page.waitForTimeout(450);assert.equal(await page.locator('dialog[open]').getAttribute('data-page'),'general');assert.equal(await page.getByRole('heading',{name:'文件条件等待',exact:true}).count(),0);delay=0;results.noLatePageOverwrite=true;
    await page.locator('[data-page="about"].bt-settings-item').click();await page.locator('.bt-set-row').filter({has:page.getByText('备份与恢复',{exact:true})}).getByRole('button',{name:'打开',exact:true}).click();await page.getByRole('heading',{name:'团队配置模板',exact:true}).waitFor();
    await page.getByRole('button',{name:'预览导出团队模板',exact:true}).click();await page.getByRole('button',{name:'下载已检查的模板',exact:true}).waitFor();const json=await page.getByLabel('检查团队模板配置').inputValue();const parsed=JSON.parse(json);assert.equal(parsed.bots.length,2);assert.equal(parsed.jobs,undefined);
    await page.getByLabel('选择团队模板文件').setInputFiles({name:'team.json',mimeType:'application/json',buffer:Buffer.from(json)});await page.getByRole('button',{name:'读取并预览模板',exact:true}).click();await page.getByRole('button',{name:'确认创建这套团队配置',exact:true}).waitFor();assert.equal(t.state.bots.length,2);await page.screenshot({path:path.join(output,'template-preview.png'),animations:'disabled'});await page.getByRole('button',{name:'确认创建这套团队配置',exact:true}).click();await page.getByText(/已创建 2 个 Bot/).waitFor();assert.equal(t.state.bots.length,4);assert.equal(t.state.jobs.length,1);results.templatePreviewAndExplicitImport=true;
    await page.locator('[data-page="attention"].bt-settings-item').click();await page.getByRole('button',{name:'已完成待查看 · 1',exact:true}).click();await page.getByRole('button',{name:'工作摘要',exact:true}).click();await page.getByText('未独立核对文件变更；工具记录不等于变更凭据。',{exact:true}).waitFor();assert((await page.locator('.work-receipt').textContent()).includes('记录有截断'));results.honestReceipt=true;
    t.state.jobs.push({id:'loop',botId:'worker',task:'重复失败任务',status:'running',at,toolWarning:{tool:'read_file',count:5,message:'请核对',at}});await page.getByRole('button',{name:'刷新',exact:true}).click();await page.getByRole('button',{name:'运行异常 · 1',exact:true}).click();await page.getByRole('button',{name:'停止此任务',exact:true}).click();assert.equal(t.state.jobs.find(j=>j.id==='loop').status,'aborted');results.scopedLoopStop=true;
    assert.deepEqual(errors,[]);results.passed=true;results.pageErrors=errors;await page.evaluate(()=>window.dispose());console.log(JSON.stringify(results,null,2));
  }catch(error){results.passed=false;results.error=error.stack;results.pageErrors=errors;console.error(error);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
  finally{await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser?.close();await new Promise(r=>server.close(r));t.stopped=true;t.fileWaits.close();t.schedules.close();await t.writes;await fs.rm(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
})();
