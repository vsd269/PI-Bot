'use strict';
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {endpoint,boundedFetch,jsonFetch}=require('./net');
async function rpcResponse(url,options,id){
  const {timeoutMs=30000,...rest}=options,response=await fetch(url,{...rest,redirect:'error',signal:AbortSignal.any([rest.signal,AbortSignal.timeout(timeoutMs)].filter(Boolean))});
  if(!response.ok){await response.body?.cancel();return {response,messages:[]};}
  const reader=response.body?.getReader();if(!reader)throw Error('MCP 响应为空。');const decoder=new TextDecoder();let buffer='',size=0;const stream=response.headers.get('content-type')?.includes('text/event-stream');
  try{for(;;){const {done,value}=await reader.read();if(value){size+=value.length;if(size>2*1024*1024)throw Error('MCP 响应过大。');buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,'');}
    if(stream){for(;;){const at=buffer.indexOf('\n\n');if(at<0)break;const block=buffer.slice(0,at);buffer=buffer.slice(at+2);const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;const m=JSON.parse(data);if(m.id===id)return {response,messages:[m]};}}
    if(done){if(stream)throw Error('MCP 事件流结束但未返回结果。');return {response,messages:[JSON.parse(buffer)]};}
  }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
class HttpMcpClient{
  constructor(config,token){this.config=config;this.token=token;this.serial=0;this.controllers=new Set();this.closed=false;}
  async request(method,params,signal){
    if(this.closed)throw Error('MCP 连接已关闭。');const id=++this.serial,controller=new AbortController();this.controllers.add(controller);
    try{
      const headers={...(this.config.github?{'X-MCP-Toolsets':'context,repos,issues,pull_requests'}:{}),'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(this.token?{Authorization:'Bearer '+this.token}:{}),...(this.session?{'Mcp-Session-Id':this.session}:{}),...(this.protocol?{'MCP-Protocol-Version':this.protocol}:{})};
      const {response,messages}=await rpcResponse(this.config.url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal,timeoutMs:this.config.timeoutMs},id);
      if(response.status===401)throw Error('远程 MCP 需要登录，或访问令牌已过期。请重新连接。');if(!response.ok)throw Error('远程 MCP 返回 HTTP '+response.status+'；未自动重试，请核对服务端操作结果。');
      const session=response.headers.get('mcp-session-id');if(session){if(session.length>512||/[\r\n]/.test(session))throw Error('远程 MCP 会话标识无效。');this.session=session;}
      const message=messages.find(m=>m.id===id);if(!message)throw Error('远程 MCP 没有返回对应请求的结果。');if(message.error)throw Error('远程 MCP 请求失败：'+String(message.error.message||'unknown').slice(0,500));return message.result;
    }finally{this.controllers.delete(controller);}
  }
  async start(){const init=await this.request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'PI-bot',version:'0.3.35'}});if(!init?.capabilities?.tools||!['2025-03-26','2025-06-18','2025-11-25','2024-11-05'].includes(init.protocolVersion))throw Error('远程 MCP 不支持兼容的工具协议。');this.protocol=init.protocolVersion;
    const {response}=await boundedFetch(this.config.url,{method:'POST',headers:{...(this.config.github?{'X-MCP-Toolsets':'context,repos,issues,pull_requests'}:{}),'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':this.protocol,...(this.token?{Authorization:'Bearer '+this.token}:{}),...(this.session?{'Mcp-Session-Id':this.session}:{})},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),timeoutMs:this.config.timeoutMs});if(!response.ok)throw Error('MCP 初始化通知失败。');return this;}
  async tools(signal){const rows=[];let cursor;for(let page=0;page<20;page++){const r=await this.request('tools/list',cursor?{cursor}:{},signal);if(!Array.isArray(r?.tools))throw Error('MCP 工具目录无效。');rows.push(...r.tools);if(rows.length>500)throw Error('MCP 工具超过 500。');if(!r.nextCursor)return rows;if(r.nextCursor===cursor)throw Error('MCP 工具分页未前进。');cursor=r.nextCursor;}throw Error('MCP 分页超过限制。');}
  stop(){this.closed=true;for(const c of this.controllers)c.abort();this.controllers.clear();}
}
function tokenNames(serverId){const suffix=createHash('sha256').update(serverId).digest('hex').slice(0,20).toUpperCase();return {access:'MCP_ACCESS_'+suffix,refresh:'MCP_REFRESH_'+suffix};}
class McpLogin{
  constructor(team){this.team=team;this.pending=new Map();this.refreshing=new Map();}
  config(botId,serverId){return this.team.bridge.authorized(botId,serverId);}
  async token(botId,c){if(c.tokenRef)return this.team.vault.value(botId,c.tokenRef);const refs=tokenNames(c.id);if(c.oauth&&c.expires?.[botId]&&c.expires[botId]<Date.now()+60000){const key=botId+':'+c.id;if(!this.refreshing.has(key)){const promise=this.refresh(botId,c,refs).finally(()=>this.refreshing.delete(key));this.refreshing.set(key,promise);}await this.refreshing.get(key);}try{return this.team.vault.value(botId,refs.access);}catch{return '';}}
  async refresh(botId,c,refs){let value;try{value=this.team.vault.value(botId,refs.refresh);}catch{throw Error('远程 MCP 登录已过期，请重新登录。');}const tokens=await jsonFetch(endpoint(c.oauth.tokenEndpoint),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:value,client_id:c.oauth.clientId,resource:c.url}).toString()});await this.store(botId,c,tokens);}
  async store(botId,c,tokens){if(typeof tokens.access_token!=='string'||tokens.access_token.length<4||tokens.access_token.length>16000||tokens.token_type?.toLowerCase()!=='bearer')throw Error('授权服务器返回了无效令牌。');if(this.team.stopped||this.config(botId,c.id)!==c)throw Error('连接器已撤销。');const refs=tokenNames(c.id);await this.team.vault.set({botId,name:refs.access,value:tokens.access_token});if(tokens.refresh_token)await this.team.vault.set({botId,name:refs.refresh,value:tokens.refresh_token});(c.expires??={})[botId]=Date.now()+Math.max(30,Math.min(31536000,Number(tokens.expires_in)||3600))*1000;await this.team.save();}
  async discover(c,redirect){
    const resource=new URL(c.url);const protectedUrl=new URL('/.well-known/oauth-protected-resource'+(resource.pathname==='/'?'':resource.pathname),resource);
    const protectedMeta=await jsonFetch(protectedUrl.href,{},256000);const issuer=endpoint(protectedMeta.authorization_servers?.[0]);const base=new URL(issuer);const metadata=await jsonFetch(new URL('/.well-known/oauth-authorization-server'+(base.pathname==='/'?'':base.pathname),base).href,{},256000);
    if(metadata.issuer&&new URL(metadata.issuer).href!==base.href)throw Error('OAuth 发行方不匹配。');if(metadata.code_challenge_methods_supported&&!metadata.code_challenge_methods_supported.includes('S256'))throw Error('授权服务器不支持 PKCE S256。');
    let clientId=c.oauth?.clientId;if(!clientId){if(!metadata.registration_endpoint)throw Error('该连接器需要手动填写 OAuth clientId。');const registered=await jsonFetch(endpoint(metadata.registration_endpoint),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'PI-bot',redirect_uris:[redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})});clientId=registered.client_id;}
    if(typeof clientId!=='string'||clientId.length>1000)throw Error('OAuth 客户端标识无效。');return {authorizationEndpoint:endpoint(metadata.authorization_endpoint),tokenEndpoint:endpoint(metadata.token_endpoint),clientId,scope:c.oauth?.scope||''};
  }
  async begin({botId,serverId}){
    const c=this.config(botId,serverId);if(c.type!=='http')throw Error('只有远程 HTTP MCP 需要网页登录。');const key=botId+':'+serverId;this.cancel(key);if(this.pending.size>=4)throw Error('请先完成已有的登录。');
    const state=randomBytes(24).toString('base64url'),verifier=randomBytes(40).toString('base64url');let timer;
    const server=http.createServer(async(req,res)=>{
      try{if(req.method!=='GET'||!req.url?.startsWith('/callback?')){res.writeHead(404).end();return;}const u=new URL(req.url,'http://127.0.0.1');if(u.searchParams.get('state')!==state){res.writeHead(400).end('Invalid state');return;}if(u.searchParams.has('error'))throw Error('用户取消了授权。');const code=u.searchParams.get('code');if(!code||code.length>4096)throw Error('授权码无效。');
        const item=this.pending.get(key);if(!item||item.exchanging){res.writeHead(409).end();return;}item.exchanging=true;
        const tokens=await jsonFetch(c.oauth.tokenEndpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:item.redirect,client_id:c.oauth.clientId,code_verifier:verifier,resource:c.url}).toString()});await this.store(botId,c,tokens);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}).end('PI-bot 登录成功，可以关闭此页面。');this.cancel(key);
      }catch{res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end('登录失败，请返回 PI-bot 重新登录。');this.cancel(key);}
    });
    try{
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const redirect='http://127.0.0.1:'+server.address().port+'/callback';
      // Fixed-client providers must allow loopback ports (RFC 8252). DCR registers this exact redirect.
      const oauth=c.oauth?.authorizationEndpoint&&c.oauth?.tokenEndpoint&&c.oauth?.clientId?c.oauth:await this.discover(c,redirect);c.oauth=oauth;await this.team.save();
      timer=setTimeout(()=>this.cancel(key),180000);timer.unref?.();this.pending.set(key,{server,timer,redirect});
      const url=new URL(endpoint(oauth.authorizationEndpoint));url.searchParams.set('response_type','code');url.searchParams.set('client_id',oauth.clientId);url.searchParams.set('redirect_uri',redirect);url.searchParams.set('state',state);url.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256');url.searchParams.set('resource',c.url);if(oauth.scope)url.searchParams.set('scope',oauth.scope);
      return {url:url.href,expiresIn:180};
    }catch(error){clearTimeout(timer);server.close();throw error;}
  }
  cancel(key){const p=this.pending.get(key);if(p){clearTimeout(p.timer);p.server.close();p.server.closeAllConnections?.();this.pending.delete(key);}}
  close(){for(const key of this.pending.keys())this.cancel(key);}
}
module.exports={HttpMcpClient,McpLogin,tokenNames};
