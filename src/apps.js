'use strict';
// User-owned Composio project. Credentials, session and grants stay together in
// the encrypted vault, outside team snapshots and ordinary backups.
const {randomUUID,createHash}=require('node:crypto');
const {boundedFetch}=require('./net');
const BASE='https://backend.composio.dev/api/v3.1';
const RECORD='COMPOSIO_PROJECT';
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
function trustedLink(value){
  let u;try{u=new URL(value);}catch{throw Error('授权服务没有返回有效链接。');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||!(u.hostname==='composio.dev'||u.hostname.endsWith('.composio.dev')))throw Error('授权服务返回的链接不可信。');
  return u.href;
}
function logo(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const publicId=slug=>'public_'+createHash('sha256').update(slug).digest('hex').slice(0,24);
function pageQuery(input,limit){const q=new URLSearchParams({limit:String(limit)});if(input.cursor){if(typeof input.cursor!=='string'||input.cursor.length>2000)throw Error('分页标识无效。');q.set('cursor',input.cursor);}return q;}
class Apps{
  constructor(team,{transport=boundedFetch}={}){this.team=team;this.transport=transport;this.tail=Promise.resolve();this.controllers=new Set();this.epoch=0;this.closed=false;}
  config(){
    if(this.closed||this.team.stopped)throw Error('应用连接已关闭。');
    let value;try{value=this.team.vault.value('@apps',RECORD);}catch(error){if(this.team.vault.error)throw error;return null;}
    let c;try{c=JSON.parse(value);}catch{throw Error('应用连接配置损坏，请重新填写项目密钥。');}
    if(!c||typeof c.key!=='string'||!/^ak_[a-zA-Z0-9_-]{8,500}$/.test(c.key)||!id(c.userId)||c.sessionId&&!id(c.sessionId)||!Array.isArray(c.grants)||c.grants.some(g=>!g||!id(g.accountId)||!id(g.slug)||!Array.isArray(g.botIds)||g.botIds.some(b=>typeof b!=='string')))throw Error('应用连接配置无效。');return c;
  }
  fingerprint(c){return createHash('sha256').update(JSON.stringify(c)).digest('hex');}
  current(c,epoch){if(this.closed||this.team.stopped||epoch!==this.epoch||this.fingerprint(this.config())!==this.fingerprint(c))throw Error('应用连接或 Bot 授权已更改，请重新操作。');}
  mutate(run){const task=this.tail.catch(()=>{}).then(async()=>{if(this.closed||this.team.stopped)throw Error('应用连接已关闭。');this.epoch++;return run();});this.tail=task.catch(()=>{});return task;}
  async persist(c){if(this.closed||this.team.stopped)throw Error('应用连接已关闭。');await this.team.vault.setApps({name:RECORD,value:JSON.stringify(c)});}
  status(){const c=this.config();return {configured:!!c,storage:this.team.vault.list().available?'encrypted':'unavailable',grants:(c?.grants||[]).map(g=>({...g,botIds:g.botIds.filter(v=>this.team.state.bots.some(b=>b.id===v))}))};}
  async api(c,path,{method='GET',body,signal,guard}={}){
    if(this.closed||this.team.stopped)throw Error('Composio 连接已关闭。');guard?.();
    const controller=new AbortController(),deadline=AbortSignal.timeout(30000);this.controllers.add(controller);
    let result;
    try{
      result=await this.transport(BASE+path,{method,headers:{'x-api-key':c.key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.any([controller.signal,deadline,signal].filter(Boolean)),timeoutMs:30000},2*1024*1024);
    }catch(error){
      const outcome=method==='GET'?'本次读取失败，原有连接和 Bot 分配未更改。':'操作未自动重试，请先检查服务端结果，避免重复提交。';
      if(controller.signal.aborted||signal?.aborted)throw Error('应用操作已取消；如已提交修改，请先检查应用中的结果。');
      if(error.code==='RESPONSE_TOO_LARGE')throw Object.assign(Error('Composio 返回的数据超过安全读取上限。'+outcome),{code:'APP_RESPONSE_TOO_LARGE'});
      if(deadline.aborted||error.name==='TimeoutError'||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(error.cause?.code||error.code))throw Object.assign(Error('Composio 请求超时，请检查网络后重试。'+outcome),{code:'APP_TIMEOUT'});
      throw Object.assign(Error('无法连接 Composio，请检查本机网络、代理设置或服务状态。'+outcome),{code:'APP_NETWORK'});
    }
    finally{this.controllers.delete(controller);}
    // Never echo transport errors or provider bodies: either may contain secrets.
    const {response,text}=result;
    if(!response.ok)throw Object.assign(Error(response.status===401?'Composio 项目密钥无效或已过期。':response.status===403?'Composio 拒绝访问，请检查项目权限、额度与应用授权配置。':response.status===429?'Composio 请求过于频繁或项目额度受限，请稍后再试。操作未自动重试。':`Composio 返回 HTTP ${response.status}。请检查控制台中的授权配置；操作未自动重试。`),{status:response.status});
    if(!text)return {};try{return JSON.parse(text);}catch{throw Error('Composio 响应格式无效。');}
  }
  async saveKey(input){return this.mutate(async()=>{
    const key=String(input.key||'').trim();if(!/^ak_[a-zA-Z0-9_-]{8,500}$/.test(key))throw Error('请填写 Composio 项目 API Key（以 ak_ 开头）。');
    const old=this.config();if(old?.key===key){await this.api(old,'/toolkits?limit=1');return this.status();}
    const c={key,userId:'pibot_'+randomUUID(),grants:[],authConfigs:{}};
    await this.api(c,'/toolkits?limit=1');await this.persist(c);return this.status();
  });}
  async clear(){return this.mutate(async()=>{await this.team.vault.removeApps(RECORD);return this.status();});}
  need(){const c=this.config();if(!c)throw Error('请先填写自己的 Composio 项目密钥。');return c;}
  async catalog(input={}){
    const c=this.need(),q=pageQuery(input,Math.max(1,Math.min(24,Math.floor(Number(input.limit)||24))));q.set('sort_by','usage');q.set('user_id',c.userId);if(input.query)q.set('search',String(input.query).slice(0,120));if(input.category)q.set('category',String(input.category).slice(0,80));
    const r=await this.api(c,'/toolkits?'+q);if(!Array.isArray(r.items))throw Error('应用目录格式无效。');
    return {items:r.items.filter(t=>id(t.slug)).slice(0,24).map(t=>({slug:t.slug,name:String(t.name||t.slug).slice(0,100),description:String(t.meta?.description||t.description||'').slice(0,140),logo:typeof (t.meta?.logo||t.logo)==='string'&&(t.meta?.logo||t.logo).length<=512?logo(t.meta?.logo||t.logo):null,noAuth:t.no_auth===true,categories:(t.meta?.categories||[]).map(v=>typeof v==='string'?v:v?.name).filter(v=>typeof v==='string').slice(0,3).map(v=>v.slice(0,40))})),nextCursor:typeof r.next_cursor==='string'&&r.next_cursor.length<=2000?r.next_cursor:null,total:r.total_items};
  }
  async categories(){const r=await this.api(this.need(),'/toolkits/categories');if(!Array.isArray(r.items))throw Error('应用分类格式无效。');return {items:r.items.filter(v=>id(v.id)&&typeof v.name==='string').slice(0,100).map(v=>({id:v.id,name:v.name.slice(0,80)}))};}
  async accounts(c=this.need(),signal){
    const items=(c.publicApps||[]).map(slug=>({id:publicId(slug),slug,status:'ACTIVE',alias:'无需账号授权的工具'})),seen=new Set();let cursor;
    for(let page=0;page<40;page++){
      const q=pageQuery({cursor},50);q.set('user_ids',c.userId);const r=await this.api(c,'/connected_accounts?'+q,{signal});if(!Array.isArray(r.items))throw Error('应用账号列表格式无效。');
      for(const a of r.items)if(id(a.id)&&id(a.toolkit?.slug))items.push({id:a.id,slug:a.toolkit.slug,status:String(a.status||'UNKNOWN').slice(0,40),alias:String(a.alias||'').slice(0,64)});
      if(!r.next_cursor)return [...new Map(items.map(a=>[a.id,a])).values()];if(seen.has(r.next_cursor))throw Error('应用账号分页未前进，请重试。');seen.add(r.next_cursor);cursor=r.next_cursor;
    }throw Error('应用账号列表超过分页上限。');
  }
  async inventory(){const c=this.need(),epoch=this.epoch,accounts=await this.accounts(c);this.current(c,epoch);return {accounts,...this.status()};}
  async connect(input){return this.mutate(async()=>{
    if(!id(input.slug))throw Error('应用标识无效。');let c=this.need();
    const toolkit=await this.api(c,'/toolkits/'+encodeURIComponent(input.slug));
    if(toolkit.no_auth===true){await this.persist({...c,publicApps:[...new Set([...(c.publicApps||[]),input.slug])]});return {noAuth:true};}
    // A custom OAuth configuration is chosen by the person in their project,
    // never by an agent. The default uses Composio's available managed auth.
    const configs={...(c.authConfigs||{})};if(input.authConfigId){if(!id(input.authConfigId))throw Error('Auth Config ID 无效。');configs[input.slug]=input.authConfigId;}
    let expired=false;if(c.sessionId)try{await this.api(c,'/tool_router/session/'+encodeURIComponent(c.sessionId));}catch(error){if(error.status!==404)throw error;expired=true;}
    if(!c.sessionId||expired||JSON.stringify(configs)!==JSON.stringify(c.authConfigs||{})){
      const r=await this.api(c,'/tool_router/session',{method:'POST',body:{user_id:c.userId,manage_connections:{enable:true,enable_wait_for_connections:true,enable_connection_removal:true},multi_account:{enable:true,max_accounts_per_toolkit:5,require_explicit_selection:true},...(Object.keys(configs).length?{auth_configs:configs}:{})}});
      if(!id(r.session_id))throw Error('Composio 没有返回会话标识。');c={...c,sessionId:r.session_id,authConfigs:configs};await this.persist(c);
    }
    const r=await this.api(c,'/tool_router/session/'+encodeURIComponent(c.sessionId)+'/link',{method:'POST',body:{toolkit:input.slug,...(input.alias?{alias:String(input.alias).slice(0,64)}:{})}});
    return {url:trustedLink(r.redirect_url)};
  });}
  async grant(input){return this.mutate(async()=>{
    const c=this.need();if(!id(input.accountId)||!Array.isArray(input.botIds)||input.botIds.length>500||input.botIds.some(v=>!this.team.state.bots.some(b=>b.id===v)))throw Error('请选择有效的账号和 Bot。');
    const account=(await this.accounts(c)).find(a=>a.id===input.accountId&&a.status==='ACTIVE');if(!account)throw Error('该账号尚未完成授权或已断开。');
    // Save success is the admission boundary; failed writes cannot activate grants.
    const grants=c.grants.filter(g=>g.accountId!==account.id);if(input.botIds.length)grants.push({accountId:account.id,slug:account.slug,botIds:[...new Set(input.botIds)]});await this.persist({...c,grants});return this.status();
  });}
  async disconnect(input){return this.mutate(async()=>{
    const c=this.need(),a=(await this.accounts(c)).find(a=>a.id===input.accountId);if(!a)throw Error('找不到属于本项目用户的账号。');
    // Revoke local admission first. A failed remote revoke stays unavailable to Bots.
    await this.persist({...c,grants:c.grants.filter(g=>g.accountId!==a.id)});
    if((c.publicApps||[]).some(slug=>publicId(slug)===a.id)){await this.persist({...c,grants:c.grants.filter(g=>g.accountId!==a.id),publicApps:c.publicApps.filter(slug=>publicId(slug)!==a.id)});return {disconnected:true};}
    await this.api(c,'/connected_accounts/'+encodeURIComponent(a.id)+'?revoke_on_delete=true',{method:'DELETE'});return {disconnected:true};
  });}
  authorized(c,botId,accountId){this.team.bot(botId);const grant=c.grants.find(g=>g.accountId===accountId&&g.botIds.includes(botId));if(!grant)throw Error('用户没有把该应用账号分配给当前 Bot。');return grant;}
  async tools(botId,input={},signal){
    const c=this.need(),epoch=this.epoch;if(!input.accountId)return {accounts:c.grants.filter(g=>g.botIds.includes(botId)).map(g=>({id:g.accountId,slug:g.slug}))};
    const g=this.authorized(c,botId,input.accountId),q=pageQuery(input,10);q.set('toolkit_slug',g.slug);q.set('include_deprecated','false');if(input.query)q.set('query',String(input.query).slice(0,160));const r=await this.api(c,'/tools?'+q,{signal});this.current(c,epoch);this.authorized(this.need(),botId,input.accountId);
    if(!Array.isArray(r.items))throw Error('应用工具列表格式无效。');return {tools:r.items.filter(t=>t.toolkit?.slug===g.slug).slice(0,10).map(t=>({name:t.slug,description:t.description,inputSchema:t.input_parameters,version:t.version})),nextCursor:r.next_cursor||null};
  }
  async call(botId,input,signal,beforeSend){
    const c=this.need(),epoch=this.epoch,g=this.authorized(c,botId,input.accountId);if(!id(input.name)||!input.arguments||typeof input.arguments!=='object'||Array.isArray(input.arguments)||JSON.stringify(input.arguments).length>100000)throw Error('工具名称或参数无效。');
    const tool=await this.api(c,'/tools/'+encodeURIComponent(input.name),{signal});if(tool.toolkit?.slug!==g.slug||typeof tool.version!=='string')throw Error('该工具不属于已分配的应用。');
    const isPublic=(c.publicApps||[]).some(slug=>publicId(slug)===input.accountId&&slug===g.slug);if(isPublic&&tool.no_auth!==true)throw Error('该工具需要账号授权，请先连接账号。');
    if(!(await this.accounts(c,signal)).some(a=>a.id===input.accountId&&a.slug===g.slug&&a.status==='ACTIVE'))throw Error('应用账号已失效，请重新授权。');
    const guard=()=>{signal?.throwIfAborted();beforeSend?.();this.current(c,epoch);this.authorized(this.need(),botId,input.accountId);};
    const result=await this.api(c,'/tools/execute/'+encodeURIComponent(input.name),{method:'POST',body:{...(isPublic?{}:{connected_account_id:input.accountId}),user_id:c.userId,version:tool.version,arguments:input.arguments},signal,guard});guard();
    // Never expose returned account secrets/session handles to an agent.
    return this.team.vault.clean({data:result.data,...(result.error===undefined?{}:{error:result.error}),successful:result.successful});
  }
  async operation(input={}){switch(input.action||'status'){case 'status':return this.status();case 'saveKey':return this.saveKey(input);case 'clear':return this.clear();case 'catalog':return this.catalog(input);case 'categories':return this.categories();case 'accounts':return this.inventory();case 'connect':return this.connect(input);case 'grant':return this.grant(input);case 'disconnect':return this.disconnect(input);default:throw Error('未知的应用连接操作。');}}
  async close(){this.closed=true;this.epoch++;for(const c of this.controllers)c.abort();await this.tail;}
}
module.exports={Apps,trustedLink};
