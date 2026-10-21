'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const {BotBrowsers}=require('./bot-browser');
const {ImageCache}=require('./image-cache');
const {HistoryIndex}=require('./history-index');
const {McpLogin}=require('./remote-mcp');
const {endpoint,jsonFetch}=require('./net');
const {AttachmentUploads}=require('./attachment-upload');
const {GitHubConnector}=require('./github');
const {speechConfig,transcribeAudio,testSpeech}=require('./speech-provider');
const {openSpeechStream,isRealtime}=require('./speech-stream');
const {ttsConfig,synthesize}=require('./speech-output');
const secretName=v=>typeof v==='string'&&/^[A-Z_][A-Z0-9_]{0,79}$/.test(v);
function speechProfile(c){
  if(!c||c.keyRef&&!secretName(c.keyRef))throw Error('语音密钥名称无效。');
  const value=speechConfig(c);if(c.profiles){value.profiles={};for(const [provider,p] of Object.entries(c.profiles)){if(p.keyRef&&!secretName(p.keyRef))throw Error('语音密钥名称无效。');value.profiles[provider]=speechConfig({...p,provider});}}if(c.callProvider&&!['auto','qwen','volcengine'].includes(c.callProvider))throw Error('实时对话服务无效。');if(c.callModel&&!['fun-asr-realtime','qwen3-asr-flash-realtime'].includes(c.callModel))throw Error('实时对话模型无效。');if(c.interruption!==undefined&&!['speaker','headphones','off'].includes(c.interruption))throw Error('说话打断模式无效。');value.interruption=c.interruption||'speaker';value.callModel=c.callModel||'fun-asr-realtime';value.callProvider=c.callProvider||'auto';value.tts=ttsConfig(c.tts);return value;
}
function sharedSpeech(config,bots){
  if(config?.speechGlobal)return {config:config.speechGlobal,global:true};
  const rows=bots.map(b=>[b.id,config?.speech?.[b.id]]).filter(([,c])=>c);
  const [ownerId,c]=rows.find(([,c])=>c.enabled!==false)||rows[0]||[];
  return c?{config:c,ownerId,global:false}:null;
}
function validateIntegrations(config,bots){
  if(!config||typeof config!=='object'||Array.isArray(config)||JSON.stringify(config).length>100000)throw Error('扩展配置无效或过大。');
  const result={speech:{},images:{textOnlyModels:[]},commands:[],api:{enabled:false,botIds:[],port:0}};
  const ids=new Set(bots.map(b=>b.id));
  for(const [id,c] of Object.entries(config.speech||{})){
    if(!ids.has(id)||!c||typeof c.model!=='string'||!c.model.trim()||c.model.length>200||c.keyRef&&!secretName(c.keyRef))throw Error('语音配置中的 Bot、模型或密钥名称无效。');
    result.speech[id]=speechConfig(c);if(c.profiles){result.speech[id].profiles={};for(const [provider,profile] of Object.entries(c.profiles)){if(!['openai','whisper','custom','qwen','volcengine'].includes(provider)||profile.keyRef&&!secretName(profile.keyRef))throw Error('语音服务配置无效。');result.speech[id].profiles[provider]=speechConfig({...profile,provider});}}
  }
  if(config.speechGlobal)result.speechGlobal=speechProfile(config.speechGlobal);
  if(config.images?.textOnlyModels!==undefined){if(!Array.isArray(config.images.textOnlyModels)||config.images.textOnlyModels.length>100||config.images.textOnlyModels.some(k=>typeof k!=='string'||k.length>300))throw Error('textOnlyModels 必须为模型 key 数组。');result.images.textOnlyModels=[...new Set(config.images.textOnlyModels)];}
  if(!Array.isArray(config.commands||[])||(config.commands||[]).length>100)throw Error('命令配置无效。');const names=new Set();
  for(const c of config.commands||[]){
    if(!c||typeof c.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(c.id)||names.has(c.id)||typeof c.command!=='string'||!path.isAbsolute(c.command)||c.command.includes('\0')||process.platform==='win32'&&!/\.exe$/i.test(c.command)||!Array.isArray(c.args)||c.args.length>100||c.args.some(v=>typeof v!=='string'||v.length>4096||v.includes('\0'))||!Array.isArray(c.botIds)||c.botIds.some(id=>!ids.has(id)))throw Error('命令需指定唯一 ID、绝对可执行文件路径、参数数组和已存在的 Bot。');
    names.add(c.id);const envRefs=c.envRefs||{};if(Array.isArray(envRefs)||typeof envRefs!=='object'||Object.keys(envRefs).length>50||Object.entries(envRefs).some(([k,v])=>! /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(k)||!secretName(v)))throw Error('命令 envRefs 必须为环境变量到密钥名称的映射。');
    if(c.cwd&&(!path.isAbsolute(c.cwd)||c.cwd.includes('\0')))throw Error('命令工作目录需为绝对路径。');
    result.commands.push({id:c.id,name:String(c.name||c.id).slice(0,100),command:c.command,args:c.args,botIds:[...new Set(c.botIds)],envRefs,cwd:c.cwd||'',allowExtraArgs:c.allowExtraArgs===true,enabled:c.enabled===true,timeoutMs:Math.max(1000,Math.min(120000,Number(c.timeoutMs)||30000))});
  }
  if(config.api){const c=config.api;if(!Array.isArray(c.botIds)||c.botIds.some(id=>!ids.has(id))||!Number.isInteger(c.port)||c.port!==0&&(c.port<1024||c.port>65535))throw Error('API 需选择 Bot 和 0 或 1024–65535 的端口。');if(c.enabled===true&&(!ids.has(c.ownerId)||!c.botIds.length))throw Error('启用 API 前需选择密钥所属 Bot 和允许访问的 Bot。');result.api={enabled:c.enabled===true,botIds:[...new Set(c.botIds)],port:c.port,ownerId:c.ownerId||''};}
  return result;
}
class Integrations{
  constructor(team){this.team=team;this.files=new AttachmentUploads(team);this.github=new GitHubConnector(team);this.browser=new BotBrowsers(team);this.images=new ImageCache(team);this.index=new HistoryIndex(team);this.login=new McpLogin(team);this.uploads=new Map();this.children=new Set();this.commandOwners=new Map();this.commandsRunning=new Set();this.controllers=new Set();this.apiTail=Promise.resolve();this.settingsTail=Promise.resolve();this.apiSeen=new Map();this.events=[];}
  async load(){await this.index.load();try{const operations=await this.team.pi.desktop.listOperations?.();const rows=Array.isArray(operations)?operations:operations?.operations||[];this.operations=new Set(rows.map(o=>typeof o==='string'?o:o.id));}catch{this.operations=new Set();}this.operations??=new Set();const legacy=sharedSpeech(this.team.state.integrations,this.team.state.bots);if(legacy&&!legacy.global){try{await this.saveSpeech({scope:'global',config:legacy.config});}catch{this.record('speech','global_migration_failed');}}if(this.team.state.integrations?.api?.enabled)await this.configureApi().catch(()=>this.record('api','startup_failed'));}
  record(module,code){this.events.push({at:new Date().toISOString(),module,code});if(this.events.length>50)this.events.shift();}
  view(){const shared=sharedSpeech(this.team.state.integrations,this.team.state.bots),config={speech:{},images:{textOnlyModels:[]},commands:[],api:{enabled:false,botIds:[],port:0},...this.team.state.integrations,...(shared?{speechGlobal:shared.config}:{})};return {config:structuredClone(config),api:{running:!!this.server,address:this.apiAddress||null,error:this.apiError||null},index:this.index.status,capabilities:{isolatedBrowser:true,windowsOcr:process.platform==='win32',speechCapture:true,speechProviders:['openai','whisper','custom','qwen','volcengine'],midTurn:this.operations.has('agent/steer')}};}
  async migrateSpeechKeys(profile){
    const source=sharedSpeech(this.team.state.integrations,this.team.state.bots);if(!source?.ownerId)return;
    for(const c of [profile,...Object.values(profile.profiles||{}),profile.tts||{}])if(c.keyRef&&!this.team.vault.entries.some(e=>e.botId==='@speech'&&e.name===c.keyRef)){
      const entry=this.team.vault.entries.find(e=>e.botId===source.ownerId&&e.name===c.keyRef);if(entry)await this.team.vault.setSpeech({name:c.keyRef,value:this.team.vault.value(source.ownerId,c.keyRef)});
    }
  }

  save(input){const run=this.settingsTail.catch(()=>{}).then(()=>this.team.rosterChange(()=>this.saveOnce(input)));this.settingsTail=run.catch(()=>{});return run;}
  async saveOnce(input){const config=validateIntegrations(input.config,this.team.state.bots);if(config.speechGlobal)await this.migrateSpeechKeys(config.speechGlobal);for(const c of config.commands){if(!(await fs.stat(c.command)).isFile())throw Error('命令可执行文件不存在。');if(c.cwd)await this.team.directory(c.cwd);}if(config.api.enabled)this.team.vault.value(config.api.ownerId,'PIBOT_API_TOKEN');const previous=this.team.state.integrations;this.team.state.integrations=config;try{await this.team.save();}catch(e){this.team.state.integrations=previous;throw e;}for(const child of this.children)child.kill();await this.configureApi();return this.view();}
  saveSpeech(input){
    const run=this.settingsTail.catch(()=>{}).then(()=>this.team.rosterChange(async()=>{
      const previous=this.team.state.integrations;
      let next;
      if(input.scope==='global'){
        const profile=speechProfile(input.config);await this.migrateSpeechKeys(profile);
        next=validateIntegrations({...previous,speechGlobal:profile},this.team.state.bots);
      }else{this.team.bot(input.botId);next=validateIntegrations({...previous,speech:{...previous?.speech,[input.botId]:input.config}},this.team.state.bots);}
      this.team.state.integrations=next;try{await this.team.save();}catch(error){this.team.state.integrations=previous;throw error;}return this.view();
    }));this.settingsTail=run.catch(()=>{});return run;
  }
  async apiToken({botId}){this.team.bot(botId);const token=randomBytes(32).toString('base64url');await this.team.vault.set({botId,name:'PIBOT_API_TOKEN',value:token});return {token,note:'只在此处显示；请保存到调用方。API 仅监听本机。'};}
  async speech(input){
    const {action,botId}=input;this.team.bot(botId);for(const [id,item] of this.uploads)if(item.at<Date.now()-180000)this.uploads.delete(id);
    if(action==='begin'){if(this.uploads.size>=4)throw Error('语音任务过多。');const id=randomUUID();this.uploads.set(id,{botId,at:Date.now(),chunks:[],length:0});return {id};}
    const item=this.uploads.get(input.id);if(!item||item.botId!==botId)throw Error('录音上传已过期。');if(action==='cancel'){this.uploads.delete(input.id);return {};}
    if(action==='chunk'){if(typeof input.chunk!=='string'||input.chunk.length>48000||! /^[A-Za-z0-9+/=]*$/.test(input.chunk)||input.offset!==item.length||item.length+input.chunk.length>2600000)throw Error('录音数据格式或长度无效（最多 60 秒）。');item.chunks.push(input.chunk);item.length+=input.chunk.length;return {offset:item.length};}
    if(action!=='transcribe')throw Error('未知语音操作。');this.uploads.delete(input.id);const bytes=Buffer.from(item.chunks.join(''),'base64');
    if(bytes.length<44||bytes.length>1920044||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==16000||bytes.readUInt16LE(34)!==16||bytes.readUInt32LE(40)!==bytes.length-44)throw Error('请使用 60 秒以内的 16kHz 单声道 PCM16 WAV。');
    const shared=sharedSpeech(this.team.state.integrations,this.team.state.bots),saved=shared?.config;if(!saved)throw Error('请先在语音设置中保存并使用统一转写服务。');const provider=saved.defaultProvider||saved.provider,c=saved.profiles?.[provider]||saved;if(c.enabled===false)throw Error('默认语音模型已停用，请在扩展功能中启用它。');const token=c.keyRef?this.speechSecret(c.keyRef):'';
    const controller=new AbortController();this.controllers.add(controller);try{return {text:this.team.vault.redact(await transcribeAudio(c,bytes,token,controller.signal))};}finally{this.controllers.delete(controller);}

  }
  async speechTest(input){
    const botId=input.botId;if(input.scope!=='global')this.team.bot(botId);const c=speechConfig(input.config||{});const token=String(input.secret||'')||(c.keyRef?(input.scope==='global'?this.speechSecret(c.keyRef):this.team.vault.value(botId,c.keyRef)):'');
    const controller=new AbortController();this.controllers.add(controller);try{return await testSpeech(c,token,controller.signal);}finally{this.controllers.delete(controller);}
  }
  async liveSpeech({onPartial,onError}={}){
    const saved=sharedSpeech(this.team.state.integrations,this.team.state.bots)?.config;if(!saved)throw Error('请先保存统一语音服务。');const choice=saved.callProvider||'auto',preferred=saved.profiles?.[saved.defaultProvider||saved.provider]||saved;
    const realtime=base=>base?.provider==='qwen'?speechConfig({...base,model:saved.callModel||'fun-asr-realtime'}):base;const c=choice==='auto'?[preferred,...Object.values(saved.profiles||{})].map(realtime).find(isRealtime):realtime(saved.profiles?.[choice]||(saved.provider===choice?saved:null));if(!isRealtime(c))throw Error('请在语音设置中配置并保存阿里云实时模型或豆包 2.0；录音文件模型不能用于实时对话。');
    const controller=new AbortController();const stream=openSpeechStream(c,this.speechSecret(c.keyRef),{onPartial:text=>onPartial?.(this.team.vault.redact(text)),onError:error=>onError?.(Error(this.team.vault.redact(error.message)))}),abort=()=>stream.cancel();this.controllers.add(controller);controller.signal.addEventListener('abort',abort,{once:true});
    const release=()=>{this.controllers.delete(controller);controller.signal.removeEventListener('abort',abort);};try{await stream.ready;}catch(e){release();stream.cancel();throw e;}
    return {push:bytes=>stream.push(bytes),async finish(){try{return await stream.finish();}finally{release();}},cancel(){release();stream.cancel();}};
  }
  async tts(input){
    this.ttsRequests??=new Map();if(input.action==='ttsCancel'){this.ttsRequests.get(input.requestId)?.abort();return {};}
    if(typeof input.requestId!=='string'||input.requestId.length>100||this.ttsRequests.size>=2||this.ttsRequests.has(input.requestId))throw Error('朗读请求无效或正在处理中。');
    const c=sharedSpeech(this.team.state.integrations,this.team.state.bots)?.config?.tts,controller=new AbortController();this.controllers.add(controller);this.ttsRequests.set(input.requestId,controller);try{return await synthesize(c,input.text,this.speechSecret(c?.keyRef),controller.signal);}finally{this.controllers.delete(controller);this.ttsRequests.delete(input.requestId);}
  }
  speechSecret(name){
    if(this.team.vault.entries.some(e=>e.botId==='@speech'&&e.name===name))return this.team.vault.speechValue(name);
    const source=sharedSpeech(this.team.state.integrations,this.team.state.bots);if(source?.ownerId)return this.team.vault.value(source.ownerId,name);
    throw Error('请在统一语音设置中填写 '+name+'。');
  }
  async command(botId,input,signal){
    this.team.bot(botId);const c=this.team.state.integrations?.commands?.find(c=>c.id===input.id&&c.enabled&&c.botIds.includes(botId));if(!c)throw Error('该 Bot 未获命令授权。');const extra=input.args||[];if(!Array.isArray(extra)||extra.length>100||extra.some(v=>typeof v!=='string'||v.length>4096||v.includes('\0'))||extra.length&&!c.allowExtraArgs)throw Error('附加参数未获授权或格式无效。');
    if(signal?.aborted||this.team.stopped)throw Error('命令已取消。');if(this.commandsRunning.has(botId))throw Error('此 Bot 已有命令在执行。');this.commandsRunning.add(botId);
    try{const env={};for(const name of ['SystemRoot','WINDIR','PATH','Path','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[name])env[name]=process.env[name];for(const [name,ref] of Object.entries(c.envRefs))env[name]=this.team.vault.value(botId,ref);
      return await new Promise((resolve,reject)=>{
        const child=spawn(c.command,[...c.args,...extra],{cwd:c.cwd||path.dirname(c.command),env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});this.children.add(child);this.commandOwners.set(child,botId);let out=[],err=[],size=0,reason='',settled=false;
        const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);this.children.delete(child);this.commandOwners.delete(child);error?reject(error):resolve(this.team.vault.clean({exitCode:child.exitCode,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8'),...(reason?{interrupted:reason,note:'未自动重跑，请核对实际操作结果。'}:{})}));};
        let killTimer;const kill=why=>{reason=why;if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();killTimer??=setTimeout(()=>finish(Error('命令终止超时，请核对执行状态。')),5000);};const abort=()=>kill('cancelled'),timer=setTimeout(()=>kill('timeout'),c.timeoutMs);child.cancelBotCommand=abort;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
        for(const [stream,chunks] of [[child.stdout,out],[child.stderr,err]])stream.on('data',b=>{size+=b.length;if(size>64000)kill('output_limit');else chunks.push(b);});child.on('error',()=>finish(Error('命令进程无法启动。')));child.on('close',()=>finish());
      });
    }finally{this.commandsRunning.delete(botId);}
  }
  async stopBot(botId){
    for(const [child,owner] of this.commandOwners)if(owner===botId)child.cancelBotCommand?.();
    for(const key of this.login.pending.keys())if(key.startsWith(botId+':'))this.login.cancel(key);
  }
  configureApi(){const p=this.apiTail.catch(()=>{}).then(()=>this.startApi());this.apiTail=p.catch(()=>{});return p;}
  async startApi(){
    await this.stopApi();const c=this.team.state.integrations?.api;if(!c?.enabled||this.team.stopped)return;this.team.vault.value(c.ownerId,'PIBOT_API_TOKEN');this.apiError=null;
    const server=http.createServer(async(req,res)=>{
      const reply=(code,value)=>{if(res.destroyed)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
      try{
        if(req.headers.origin||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return reply(403,{error:'Loopback requests only'});
        const config=this.team.state.integrations?.api;if(!config?.enabled)return reply(503,{error:'disabled'});const expected=this.team.vault.value(config.ownerId,'PIBOT_API_TOKEN'),provided=String(req.headers.authorization||'').replace(/^Bearer /,'');const a=Buffer.from(expected),b=Buffer.from(provided);if(a.length!==b.length||!timingSafeEqual(a,b))return reply(401,{error:'Unauthorized'});
        if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||''))return reply(403,{error:'Invalid Host'});
        const u=new URL(req.url,'http://127.0.0.1');if(req.method==='GET'&&u.pathname==='/v1/bots')return reply(200,{bots:this.team.state.bots.filter(b=>config.botIds.includes(b.id)).map(b=>({id:b.id,name:b.name}))});
        const match=/^\/v1\/bots\/([a-zA-Z0-9_-]+)\/(messages|jobs)$/.exec(u.pathname);if(!match||!config.botIds.includes(match[1]))return reply(404,{error:'Not found'});
        if(req.method==='GET'&&match[2]==='jobs')return reply(200,this.team.vault.clean({jobs:this.team.state.jobs.filter(j=>j.botId===match[1]&&!j.roomId).slice(-30).map(j=>({id:j.id,status:j.status,result:j.result,error:j.error}))}));
        if(req.method!=='POST'||match[2]!=='messages'||!String(req.headers['content-type']||'').startsWith('application/json'))return reply(405,{error:'Use JSON POST'});
        const now=Date.now();for(const [key,at] of this.apiSeen)if(now-at>60000)this.apiSeen.delete(key);if(this.apiSeen.size>=30)return reply(429,{error:'30 submissions per minute'});this.apiSeen.set(randomUUID(),now);
        let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>40000){reply(413,{error:'Body too large'});req.destroy();return;}chunks.push(chunk);}const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof value.content!=='string'||!value.content.trim()||value.content.length>32000||typeof value.messageId!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(value.messageId))return reply(400,{error:'content and stable messageId (16-80 letters/digits/hyphens) are required'});
        const accepted=await this.team.submitMessage('bot',match[1],value.content,{clientMessageId:value.messageId});reply(202,accepted);
      }catch{reply(400,{error:'Request failed; inspect PI-bot status before retrying with the same messageId.'});}
    });server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=16;
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(c.port,'127.0.0.1',resolve);});this.server=server;this.apiAddress='http://127.0.0.1:'+server.address().port;server.on('error',()=>{this.apiError='API 监听器异常，请检查端口。';});}catch{server.close();this.apiError='API 端口不可用，请更换端口后保存。';throw Error(this.apiError);}
  }
  async stopApi(){const s=this.server;this.server=null;this.apiAddress=null;if(s){s.closeAllConnections?.();await new Promise(r=>s.close(r));}}
  diagnostic(){return {plugin:'PI-bot',version:require('../manifest.json').version,at:new Date().toISOString(),platform:process.platform,node:process.versions.node,counts:{bots:this.team.state.bots.length,rooms:this.team.state.rooms.length,jobs:this.team.state.jobs.length},features:this.view().capabilities,index:{phase:this.index.status.phase,count:this.index.status.count,errors:this.index.status.errors||0},mcp:{local:(this.team.state.botConnectors||[]).filter(c=>c.type!=='http').length,remote:(this.team.state.botConnectors||[]).filter(c=>c.type==='http').length},api:{running:!!this.server},events:this.events};}
  async operation(input){switch(input.action){case 'get':return this.view();case 'save':return this.save(input);case 'speechTest':return this.speechTest(input);case 'speechSave':return this.saveSpeech(input);case 'ttsSpeak':case 'ttsCancel':return this.tts(input);case 'speechSecretSet':return this.team.vault.setSpeech(input);case 'speechSecretGet':return {value:this.speechSecret(input.name)};case 'apiToken':return this.apiToken(input);case 'index':this.index.start();return this.view();case 'cancelIndex':this.index.cancelled=true;return this.view();case 'search':return this.index.search(input);case 'diagnostics':return this.diagnostic();case 'pruneImages':return this.images.prune();default:throw Error('未知扩展操作。');}}
  async close(){for(const c of this.controllers)c.abort();this.uploads.clear();await this.files.close();this.login.close();this.github.close();for(const child of this.children)child.kill();await this.settingsTail;await this.apiTail;await this.stopApi();await this.index.close();await this.browser.close();}
}
module.exports={Integrations,validateIntegrations};
