'use strict';
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {StringDecoder}=require('node:string_decoder');
const {HttpMcpClient}=require('./remote-mcp');
const {endpoint}=require('./net');
const MAX=1024*1024;
class StdioClient{
  constructor(config,env){this.config=config;this.env=env;this.pending=new Map();this.serial=0;this.buffer='';this.decoder=new StringDecoder('utf8');this.closed=false;}
  async start(){
    this.child=spawn(this.config.command,this.config.args,{cwd:this.config.cwd||path.dirname(this.config.command),env:this.env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    this.child.stdin.on('error',()=>this.stop(Error('MCP 输入通道关闭。')));this.child.stderr.resume();
    this.child.on('error',()=>this.stop(Error('MCP 进程无法启动，请检查可执行文件和参数。')));
    this.child.on('exit',()=>this.stop(Error('MCP 进程已退出。')));
    this.child.stdout.on('data',chunk=>{this.buffer+=this.decoder.write(chunk);if(Buffer.byteLength(this.buffer)>MAX)return this.stop(Error('MCP 响应超过 1 MB。'));for(;;){const n=this.buffer.indexOf('\n');if(n<0)break;const line=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n+1);if(!line.trim())continue;let message;try{message=JSON.parse(line);}catch{return this.stop(Error('MCP 标准输出必须是逐行 JSON-RPC；日志应写入标准错误。'));}if(message.method){if(message.id!==undefined)this.send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Server initiated sampling, roots and elicitation are not supported.'}});continue;}const request=this.pending.get(message.id);if(!request)continue;this.pending.delete(message.id);request.cleanup();message.error?request.reject(Error('MCP 请求失败：'+String(message.error.message||'unknown').slice(0,1000))):request.resolve(message.result);}});
    const init=await this.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'PI-bot',version:'0.3.34'}});
    if(!init?.capabilities?.tools||!['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(init.protocolVersion))throw Error('MCP 未协商到支持工具的协议版本。');
    this.send({jsonrpc:'2.0',method:'notifications/initialized'});return this;
  }
  send(message){if(this.closed||!this.child||this.child.stdin.destroyed)throw Error('MCP 连接已关闭。');this.child.stdin.write(JSON.stringify(message)+'\n');}
  request(method,params,signal){if(signal?.aborted)return Promise.reject(Error('MCP 请求已取消。'));return new Promise((resolve,reject)=>{const id=++this.serial;let timer;const cancel=()=>{this.pending.delete(id);cleanup();try{this.send({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:id,reason:'Cancelled by PI-bot'}});}catch{}this.stop(Error('MCP 请求已取消；连接已关闭，请核查服务端操作结果。'));reject(Error('MCP 请求已取消。'));};const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};this.pending.set(id,{resolve,reject,cleanup});timer=setTimeout(()=>{this.pending.delete(id);cleanup();this.stop(Error('MCP 请求超时；连接已关闭，避免迟到的操作与后续请求重叠。'));reject(Error('MCP 请求超时，请检查服务端记录后再重试。'));},this.config.timeoutMs||30000);signal?.addEventListener('abort',cancel,{once:true});try{this.send({jsonrpc:'2.0',id,method,params});}catch(error){this.pending.delete(id);cleanup();reject(error);}});}
  stop(error=Error('MCP 连接已关闭。')){if(this.closed)return;this.closed=true;for(const item of this.pending.values()){item.cleanup();item.reject(error);}this.pending.clear();this.child?.kill();}
  async tools(signal){let cursor;const tools=[];for(let page=0;page<20;page++){const result=await this.request('tools/list',cursor?{cursor}:{},signal);if(!Array.isArray(result?.tools))throw Error('MCP 工具目录格式无效。');tools.push(...result.tools);if(tools.length>500)throw Error('MCP 工具数量超过 500。');if(!result.nextCursor)return tools;if(result.nextCursor===cursor)throw Error('MCP 工具分页未前进。');cursor=result.nextCursor;}throw Error('MCP 工具分页超过限制。');}
}
class McpBridge{
  constructor(team){this.team=team;this.clients=new Map();this.starting=new Map();this.revisions=new Map();this.botRevisions=new Map();}
  view(){return {servers:structuredClone(this.team.state.botConnectors||[]),note:'此处授权只约束 PI-bot 的 MCP 桥接工具；PI 原生全局 MCP 仍由 PI 的设置与审批管理。支持本地 stdio 和远程 Streamable HTTP；远程登录与令牌按 Bot 分开保存。'};}
  async save(input){
    if(!input||typeof input!=='object')throw Error('MCP 配置无效。');
    const prior=input.id?(this.team.state.botConnectors||[]).find(c=>c.id===input.id):null;if(input.id&&!prior)throw Error('MCP 配置不存在。');
    const name=String(input.name||'').trim();if(!name||name.length>100)throw Error('填写 1–100 字的连接器名称。');
    if(input.type==='http'){
      const url=endpoint(input.url);if(!Array.isArray(input.botIds)||input.botIds.length>1000||input.botIds.some(id=>typeof id!=='string'))throw Error('botIds 必须是 Bot ID 数组。');const botIds=[...new Set(input.botIds)];botIds.forEach(id=>this.team.bot(id));
      if(!Array.isArray(input.allowedTools)||input.allowedTools.length>500||input.allowedTools.some(v=>typeof v!=='string'||!v||v.length>200))throw Error('allowedTools 必须为工具名称数组。');
      if(input.tokenRef&&!/^[A-Z_][A-Z0-9_]{0,79}$/.test(input.tokenRef))throw Error('tokenRef 请填写 Bot 密钥名称。');
      let oauth;if(input.oauth){const c=input.oauth;if(typeof c.clientId!=='string'||c.clientId.length>1000||typeof (c.scope||'')!=='string'||(c.scope||'').length>1000)throw Error('OAuth 配置无效。');oauth={clientId:c.clientId,scope:c.scope||'',...(c.authorizationEndpoint?{authorizationEndpoint:endpoint(c.authorizationEndpoint)}:{}),...(c.tokenEndpoint?{tokenEndpoint:endpoint(c.tokenEndpoint)}:{})};}
      const config={id:prior?.id||randomUUID(),type:'http',name,url,botIds,allowedTools:[...new Set(input.allowedTools)],tokenRef:input.tokenRef||'',...(oauth?{oauth}:{}),enabled:input.enabled===true,timeoutMs:Math.min(90000,Math.max(1000,Number(input.timeoutMs)||30000)),...(prior?.url===url&&prior?.oauth?.clientId===oauth?.clientId?{expires:prior.expires}:{} )};
      const rows=this.team.state.botConnectors??=[];if(!prior&&rows.length>=100)throw Error('最多保存 100 个连接器。');for(const id of prior?.botIds||[])this.team.integrations?.login.cancel(id+':'+config.id);await this.disconnectServer(config.id);if(prior)rows.splice(rows.indexOf(prior),1,config);else rows.push(config);await this.team.save();return this.view();
    }
    if(typeof input.command!=='string'||!path.isAbsolute(input.command)||!Array.isArray(input.args)||input.args.length>100||input.args.some(a=>typeof a!=='string'||a.length>4096||a.includes('\0')))throw Error('请填写可执行文件的绝对路径和字符串参数数组。');
    if(process.platform==='win32'&&!/\.exe$/i.test(input.command))throw Error('Windows 请直接指定 .exe，例如 node.exe；不通过 shell 执行 cmd/bat。');
    if(!(await fs.stat(input.command)).isFile())throw Error('MCP 可执行文件不存在。');
    if(!Array.isArray(input.botIds)||input.botIds.length>1000||input.botIds.some(id=>typeof id!=='string'))throw Error('botIds 必须是 Bot ID 数组。');const botIds=[...new Set(input.botIds)];botIds.forEach(id=>this.team.bot(id));
    if(!Array.isArray(input.allowedTools)||input.allowedTools.length>500||input.allowedTools.some(x=>typeof x!=='string'||!x||x.length>200))throw Error('allowedTools 填写工具名称数组；["*"] 表示授权所有工具。');
    const refs=input.envRefs||{},env=input.env||{};for(const map of [refs,env]){if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>100)throw Error('MCP 环境变量格式无效。');for(const [key,value] of Object.entries(map))if(!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key)||typeof value!=='string'||value.length>4096||value.includes('\0'))throw Error('MCP 环境变量无效。');}
    for(const ref of Object.values(refs))if(!/^[A-Z_][A-Z0-9_]{0,79}$/.test(ref))throw Error('envRefs 中填写该 Bot 密钥管理里的密钥名称。');
    // Env references always use the calling Bot's vault namespace.
    const cwd=input.cwd?await this.team.directory(input.cwd):'';
    const config={id:prior?.id||randomUUID(),name,command:input.command,args:input.args,botIds,allowedTools:input.allowedTools,env,envRefs:refs,cwd,enabled:input.enabled===true,timeoutMs:Math.min(120000,Math.max(1000,Number(input.timeoutMs)||30000))};
    if(JSON.stringify(config).length>50000)throw Error('MCP 配置过大。');
    const rows=this.team.state.botConnectors??=[];if(!prior&&rows.length>=100)throw Error('最多保存 100 个连接器。');
    await this.disconnectServer(config.id);if(prior)rows.splice(rows.indexOf(prior),1,config);else rows.push(config);await this.team.save();return this.view();
  }
  async remove(id){for(const bot of this.team.state.bots)this.team.integrations?.login.cancel(bot.id+':'+id);await this.disconnectServer(id);this.team.state.botConnectors=(this.team.state.botConnectors||[]).filter(c=>c.id!==id);await this.team.save();return this.view();}
  authorized(botId,id){this.team.bot(botId);const c=(this.team.state.botConnectors||[]).find(c=>c.id===id);if(!c?.enabled||!c.botIds?.includes(botId))throw Error('这个 Bot 没有获得该 MCP 连接器授权。');return c;}
  async client(botId,id){if(this.team.stopped)throw Error('PI-bot 正在停止。');const c=this.authorized(botId,id),key=botId+':'+id,existing=this.clients.get(key);if(this.starting.has(key))return this.starting.get(key);if(existing&&!existing.closed)return existing;
    const run=(async()=>{const env={};for(const name of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])env[name]=process.env[name];Object.assign(env,c.env);for(const [name,ref] of Object.entries(c.envRefs||{}))env[name]=this.team.vault.value(botId,ref);const token=c.type==='http'?await this.team.integrations.login.token(botId,c):'';const revision=this.revisions.get(id)||0,botRevision=this.botRevisions.get(botId)||0;this.authorized(botId,id);const client=c.type==='http'?new HttpMcpClient(c,token):new StdioClient(c,env);this.clients.set(key,client);try{await client.start();if(this.team.stopped||(this.revisions.get(id)||0)!==revision||(this.botRevisions.get(botId)||0)!==botRevision||this.authorized(botId,id)!==c)throw Error('MCP 配置在启动期间发生变化，请重试。');return client;}catch(error){client.stop();this.clients.delete(key);throw Error(this.team.vault.redact(error.message));}})();
    this.starting.set(key,run);try{return await run;}finally{this.starting.delete(key);}
  }
  async discover(botId,id){const client=await this.client(botId,id);return this.team.vault.clean({serverId:id,tools:await client.tools()});}
  async list(botId,id,signal){const c=this.authorized(botId,id),client=await this.client(botId,id),tools=await client.tools(signal);return this.team.vault.clean({serverId:id,tools:tools.filter(t=>c.allowedTools.includes('*')||c.allowedTools.includes(t.name))});}
  async call(botId,{serverId,name,arguments:args={}},signal){const c=this.authorized(botId,serverId);if(typeof name!=='string'||!(c.allowedTools.includes('*')||c.allowedTools.includes(name)))throw Error('这个 MCP 工具未获授权。');if(!args||typeof args!=='object'||Array.isArray(args)||JSON.stringify(args).length>128000)throw Error('MCP 工具参数无效或过大。');const client=await this.client(botId,serverId);const tools=await client.tools(signal);if(!tools.some(t=>t.name===name))throw Error('MCP 服务端没有这个工具。');this.authorized(botId,serverId);const result=await client.request('tools/call',{name,arguments:args},signal);return this.team.vault.clean(result);}
  async disconnectServer(id){this.revisions.set(id,(this.revisions.get(id)||0)+1);for(const [key,client] of this.clients)if(key.endsWith(':'+id)){client.stop();this.clients.delete(key);}}
  async disconnectBot(id){this.botRevisions.set(id,(this.botRevisions.get(id)||0)+1);for(const [key,client] of this.clients)if(key.startsWith(id+':')){client.stop();this.clients.delete(key);}}
  async close(){for(const c of this.team.state.botConnectors||[])await this.disconnectServer(c.id);await Promise.allSettled([...this.starting.values()]);}
}
module.exports={McpBridge,StdioClient};
