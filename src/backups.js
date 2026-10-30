'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {validateIntegrations}=require('./integrations');
const {cleanupRoster}=require('./roster-cleanup');
const {endpoint}=require('./net');
const {validateBundle}=require('./skill-import');
const {validateRecords}=require('./views');
const {validateLibrary}=require('./avatar-library');
const {validatePrivateState}=require('./privacy');
const {validateRequests}=require('./message-requests');
const {validateLog}=require('./execution-log');
const {ID,LEGACY_ID,backupRoot}=require('./identity');
const MAX_BYTES=32*1024*1024;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
const memoryPath=value=>typeof value==='string'&&value.length<500&&/^memory\/(?:[a-zA-Z0-9_-]+\/)*[\p{L}\p{N}_. -]+\.(?:md|json)$/u.test(value)&&!value.split('/').some(p=>p==='..'||p==='.'||p.endsWith('.')||p.endsWith(' '));
function validateState(state){
  if(!state||state.version!==1||!['bots','rooms','jobs'].every(key=>Array.isArray(state[key]))||!state.bots.length||state.bots.length>1000||state.rooms.length>1000)throw Error('备份中的团队结构无效。');
  const ids=new Set(),names=new Set();
  for(const bot of state.bots){
    if(!safeId(bot.id)||ids.has(bot.id)||typeof bot.name!=='string'||!bot.name.trim()||bot.name.length>200||names.has(bot.name.toLowerCase())||!['Worker','Administrator'].includes(bot.role)||typeof bot.modelKey!=='string')throw Error('备份中的机器人配置无效。');
    ids.add(bot.id);names.add(bot.name.toLowerCase());
  }
  if(!state.bots.some(b=>b.role==='Administrator'))throw Error('团队至少需要一位主机器人。');
  const roomIds=new Set();
  for(const room of state.rooms){
    if(!safeId(room.id)||ids.has(room.id)||roomIds.has(room.id)||typeof room.name!=='string'||!Array.isArray(room.members)||!room.members.length||room.members.some(id=>!ids.has(id))||(room.adminId!=null&&!room.members.includes(room.adminId))||!Array.isArray(room.log))throw Error('备份中的群聊配置无效。');
    roomIds.add(room.id);
  }
  for(const key of ['schedules','questions','completions','archives'])if(state[key]!==undefined&&(!Array.isArray(state[key])||state[key].some(v=>!v||typeof v!=='object'||Array.isArray(v))))throw Error('备份中的任务或记录无效。');
  if(state.views!==undefined)validateRecords(state.views,state.bots);
  validateRequests(state);validateLog(state.executionLog);validatePrivateState(state);require('./learning').validateLearning(state);
  require('./asides').validateAsides(state);
  for(const room of state.rooms)require('./group-relay').validateRelays(room,state.bots);
  if(state.jobs.some(v=>!v||typeof v!=='object'||Array.isArray(v)))throw Error('备份中的任务记录无效。');
  const archiveIds=new Set();for(const entry of state.archives||[]){const key=entry.kind+':'+entry.id;if(!['bot','room'].includes(entry.kind)||!safeId(entry.id)||archiveIds.has(key)||typeof entry.name!=='string'||!Array.isArray(entry.lines)||entry.lines.some(l=>!l||typeof l!=='object'||Array.isArray(l)||typeof l.text!=='string'))throw Error('备份中的历史归档无效。');archiveIds.add(key);}
  if(state.prefs!==undefined&&(!state.prefs||typeof state.prefs!=='object'||Array.isArray(state.prefs)))throw Error('备份中的偏好设置无效。');
  for(const bot of state.bots)if(bot.chat!==undefined&&!Array.isArray(bot.chat)||bot.sessions!==undefined&&(!bot.sessions||typeof bot.sessions!=='object'||Array.isArray(bot.sessions))||bot.capabilities!==undefined&&!Array.isArray(bot.capabilities))throw Error('备份中的机器人记录无效。');
  if(state.capabilities!==undefined&&(!state.capabilities?.items||Array.isArray(state.capabilities.items)||typeof state.capabilities.items!=='object'))throw Error('备份中的能力库无效。');
  let skillBytes=0;for(const item of Object.values(state.capabilities?.items||{}))if(item.bundle){validateBundle(item.bundle);for(const f of item.bundle.files)skillBytes+=Buffer.byteLength(f.data,'base64');if(skillBytes>12*1024*1024)throw Error('备份中的 Skill 资源超过 12 MB。');}
  for(const bot of state.bots)if(bot.agentMode!==undefined&&!['planner','agent'].includes(bot.agentMode))throw Error('备份中的执行模式无效。');
  if(state.botConnectors!==undefined){
    if(!Array.isArray(state.botConnectors)||state.botConnectors.length>100)throw Error('备份中的 MCP 配置无效。');
    const seen=new Set();
    for(const c of state.botConnectors){
      if(c?.type==='http'){
        if(!safeId(c.id)||seen.has(c.id)||typeof c.name!=='string'||!c.name||c.name.length>100||!Array.isArray(c.botIds)||c.botIds.some(id=>!ids.has(id))||!Array.isArray(c.allowedTools)||c.allowedTools.length>500||c.allowedTools.some(v=>typeof v!=='string'||!v||v.length>200)||typeof c.enabled!=='boolean'||!Number.isFinite(c.timeoutMs)||c.timeoutMs<1000||c.timeoutMs>120000||c.tokenRef&&! /^[A-Z_][A-Z0-9_]{0,79}$/.test(c.tokenRef))throw Error('备份中的远程 MCP 配置无效。');
        endpoint(c.url);if(c.oauth){if(typeof c.oauth.clientId!=='string'||c.oauth.clientId.length>1000)throw Error('OAuth 配置无效。');if(c.oauth.authorizationEndpoint)endpoint(c.oauth.authorizationEndpoint);if(c.oauth.tokenEndpoint)endpoint(c.oauth.tokenEndpoint);}seen.add(c.id);continue;
      }
      if(!c||!safeId(c.id)||seen.has(c.id)||typeof c.name!=='string'||!c.name||c.name.length>100||typeof c.command!=='string'||!path.isAbsolute(c.command)||c.command.includes('\0')||!Array.isArray(c.args)||c.args.length>100||c.args.some(v=>typeof v!=='string'||v.length>4096||v.includes('\0'))||!Array.isArray(c.botIds)||c.botIds.some(id=>!ids.has(id))||!Array.isArray(c.allowedTools)||c.allowedTools.length>500||c.allowedTools.some(v=>typeof v!=='string'||!v||v.length>200)||typeof c.enabled!=='boolean'||!Number.isFinite(c.timeoutMs)||c.timeoutMs<1000||c.timeoutMs>120000||typeof c.cwd!=='string'||(c.cwd&&!path.isAbsolute(c.cwd)))throw Error('备份中的 MCP 配置无效。');
      seen.add(c.id);
      for(const map of [c.env,c.envRefs])if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>100||Object.entries(map).some(([k,v])=>! /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(k)||typeof v!=='string'||v.length>4096||v.includes('\0')))throw Error('备份中的 MCP 环境变量无效。');
      if(Object.values(c.envRefs).some(v=>! /^[A-Z_][A-Z0-9_]{0,79}$/.test(v)))throw Error('备份中的密钥引用无效。');
    }
  }
  if(state.secretRequests!==undefined&&(!Array.isArray(state.secretRequests)||state.secretRequests.length>10000||state.secretRequests.some(r=>!r||!safeId(r.id)||!ids.has(r.botId)||typeof r.name!=='string'||! /^[A-Z_][A-Z0-9_]{0,79}$/.test(r.name)||!['pending','provided','interrupted'].includes(r.status)||typeof r.reason!=='string'||r.reason.length>1000)))throw Error('备份中的密钥请求无效。');
  if(state.messageBotRequests!==undefined&&(!Array.isArray(state.messageBotRequests)||state.messageBotRequests.length>10000||state.messageBotRequests.some(r=>!r||!safeId(r.sourceBotId)||!safeId(r.targetBotId)||typeof r.requestId!=='string'||! /^[A-Za-z0-9._:-]{1,120}$/.test(r.requestId)||r.key!==r.sourceBotId+':'+r.requestId||! /^[a-f0-9]{64}$/.test(r.signature)||!['admitting','accepted','failed','interrupted'].includes(r.status)||!Number.isFinite(Date.parse(r.at))||r.jobId!==undefined&&!safeId(r.jobId))))throw Error('备份中的机器人消息请求记录无效。');
  if(state.integrations!==undefined)validateIntegrations(state.integrations,state.bots);
  return state;
}
function parseArchive(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>MAX_BYTES)throw Error('备份文件过大（最多 32 MB）。');
  let value;try{value=JSON.parse(text);}catch{throw Error('无法读取备份 JSON。');}
  if(value?.format!=='pi-bot-backup'||value.schema!==1||![ID,LEGACY_ID].includes(value.pluginId)||!value.payload||value.sha256!==hash(value.payload))throw Error('备份格式或校验值不正确。');
  validateState(value.payload.team);
  if(value.payload.avatarLibrary!==undefined)validateLibrary(value.payload.avatarLibrary);
  const files=value.payload.memory;
  if(!files||Array.isArray(files)||typeof files!=='object'||Object.keys(files).length>10000)throw Error('备份记忆文件无效。');
  for(const [name,content] of Object.entries(files))if(!memoryPath(name)||typeof content!=='string')throw Error('备份包含无效的记忆路径。');
  return value;
}
function pausedState(value){
  const state=structuredClone(value);
  for(const bot of state.bots){
    delete bot.kickoff;
    for(const [roomId,sessionId] of Object.entries(bot.sessions||{}))(bot.sessionArchive??=[]).push({roomId,sessionId,reason:'backup restore'});
    bot.sessions={};bot.sessionWorkspaces={};
  }
  for(const connector of state.botConnectors||[])connector.enabled=false;
  if(state.integrations){if(state.integrations.api)state.integrations.api.enabled=false;for(const c of state.integrations.commands||[])c.enabled=false;}
  for(const request of state.secretRequests||[])request.status='interrupted';
  for(const room of state.rooms){room.planning=false;room.sessions={};for(const report of room.reports||[])report.interrupted=true;}
  for(const job of state.jobs)if(['queued','launching','running','waiting','waiting_teammates'].includes(job.status)){job.status='interrupted';job.error='已从备份恢复；请检查原生会话后手动重新派发。';}
  for(const task of state.schedules||[]){task.enabled=false;task.status='needs_review';task.error='已恢复配置，请检查工作区、时间后手动启用。';}
  for(const question of state.questions||[]){question.deliveryPending=false;if(question.status==='pending')question.status='interrupted';}
  for(const aside of state.asides||[])if(aside.status==='answering'){aside.status='cancelled';aside.error='恢复备份已中止侧问。';}
  for(const view of state.views||[]){view.deliveryPending=false;if(view.status==='pending')view.status='interrupted';}
  for(const request of state.messageBotRequests||[])if(request.status==='admitting'){request.status='interrupted';request.error='备份恢复中断了请求；为避免重复派发，没有自动重试。';}
  return state;
}
async function atomic(file,text){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,text,'utf8');await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}}
class Backups{
  constructor(team){
    this.team=team;const data=team.data;
    // PI uninstalls plugins/data/<id>, so keep recovery outside that tree.
    // Arbitrary test/dev data roots keep their backups inside their own root.
    this.root=backupRoot(data);
    this.uploads=new Map();this.lastConfig='';this.lastAt=0;this.lastError=null;
  }
  async archive(state=this.team.state,reason='manual'){
    const memory={};let size=0;
    const walk=async dir=>{let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
      for(const entry of entries){if(entry.isSymbolicLink())continue;const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()){const rel=path.relative(this.team.data,file).split(path.sep).join('/');if(memoryPath(rel)){const info=await fs.stat(file);size+=info.size;if(size>MAX_BYTES)throw Error('记忆文件超过备份大小限制。');memory[rel]=await fs.readFile(file,'utf8');}}}};
    await walk(path.join(this.team.data,'memory'));
    const payload={team:this.team.vault?this.team.vault.cleanState(state):structuredClone(state),memory:this.team.vault?this.team.vault.clean(memory):memory,avatarLibrary:this.team.avatars?.export()||{version:1,revision:0,items:[]}},archive={format:'pi-bot-backup',schema:1,pluginId:ID,pluginVersion:require('../manifest.json').version,createdAt:new Date().toISOString(),reason,sha256:hash(payload),payload};
    const text=JSON.stringify(archive);if(Buffer.byteLength(text)>MAX_BYTES)throw Error('备份超过 32 MB，请另行复制完整数据目录。');return {archive,text};
  }
  configKey(state){return hash({bots:state.bots.map(({chat,sessions,sessionArchive,sessionWorkspaces,memory,...config})=>config),rooms:state.rooms.map(({log,sessions,planning,...config})=>config),integrations:state.integrations,prefs:state.prefs,botConnectors:state.botConnectors,capabilities:state.capabilities,schedules:(state.schedules||[]).map(({runs,nextAt,status,error,...config})=>config),messageBotRequests:(state.messageBotRequests||[]).map(({key,signature,status,jobId})=>[key,signature,status,jobId]),avatarLibraryRevision:this.team.avatars?.revision||0});}
  async checkpoint(state,reason='automatic',force=false){
    const key=this.configKey(state);if(!force&&key===this.lastConfig&&Date.now()-this.lastAt<300000)return;
    const {text}=await this.archive(state,reason);this.lastFileMs=Math.max(Date.now(),(this.lastFileMs||0)+1);const name=new Date(this.lastFileMs).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.json';
    await atomic(path.join(this.root,name),text);this.lastConfig=key;this.lastAt=Date.now();this.lastError=null;
    const files=await this.files();for(const old of files.slice(30))await fs.rm(path.join(this.root,old),{force:true});return name;
  }
  async files(){try{return (await fs.readdir(this.root)).filter(name=>/^\d{4}-[\w-]+\.json$/.test(name)).sort().reverse();}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  async read(id){if(!(await this.files()).includes(id))throw Error('备份不存在。');return parseArchive(await fs.readFile(path.join(this.root,id),'utf8'));}
  async status(){const list=[];for(const id of await this.files())try{const value=await this.read(id);list.push({id,at:value.createdAt,reason:value.reason,bots:value.payload.team.bots.length,rooms:value.payload.team.rooms.length});}catch{}
    let pending=false;try{await fs.access(path.join(this.root,'pending.json'));pending=true;}catch{}
    return {path:this.root,dataPath:this.team.data,items:list,error:this.lastError,pending,recovered:this.recovered||null};
  }
  async prepare(){
    let archive,reason;const pending=path.join(this.root,'pending.json');
    try{archive=parseArchive(await fs.readFile(pending,'utf8'));reason='手动恢复';}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!archive){
      let valid=false,currentExists=false,state,before;try{
        const text=await fs.readFile(this.team.file,'utf8');currentExists=true;
        const raw=JSON.parse(text);
        state=this.team.longMessages?await this.team.longMessages.restore(raw):raw;
        before=JSON.stringify(state);cleanupRoster(state);validateState(state);
        try{validateLibrary(JSON.parse(await fs.readFile(path.join(this.team.data,'avatar-library.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
        valid=true;
      }catch(e){if(currentExists||e.code!=='ENOENT'){this.lastError='原团队文件损坏，尝试独立备份。';await fs.mkdir(this.root,{recursive:true});await fs.copyFile(this.team.file,path.join(this.root,'damaged-'+Date.now()+'.txt'));}}
      if(valid){
        // An I/O failure while saving a valid migration is not corruption:
        // abort startup rather than rolling the roster back to an old backup.
        if(JSON.stringify(state)!==before){
          await fs.mkdir(this.root,{recursive:true});await fs.copyFile(this.team.file,path.join(this.root,'before-roster-migration-'+Date.now()+'.txt'));
          const packed=this.team.longMessages?await this.team.longMessages.pack(state):state;
          await atomic(this.team.file,JSON.stringify(packed));
        }
        return;
      }
      const files=await this.files();for(const id of files)try{archive=await this.read(id);reason='重装或数据文件丢失后自动恢复';break;}catch{}
      if(!archive){if(files.length||this.lastError)throw Error('现有数据或备份损坏，请先保留数据目录并从备份恢复。');return;}
    }
    // Build and verify a complete new tree before replacing memory. Keep the old
    // tree until commit succeeds; an interrupted restore is retried on next load.
    await atomic(pending,JSON.stringify(archive));
    const staging=path.join(this.team.data,'restore-'+randomUUID()),memory=path.join(this.team.data,'memory'),old=path.join(this.team.data,'memory-before-restore-'+randomUUID()),avatarFile=path.join(this.team.data,'avatar-library.json'),stagedAvatar=path.join(staging,'avatar-library.json'),oldAvatar=path.join(this.team.data,'avatar-library-before-restore-'+randomUUID());
    await fs.mkdir(path.join(staging,'memory'),{recursive:true});
    for(const [rel,content] of Object.entries(archive.payload.memory))await atomic(path.join(staging,...rel.split('/')),content);
    await atomic(stagedAvatar,JSON.stringify(archive.payload.avatarLibrary||{version:1,revision:0,items:[]}));
    let moved=false,movedAvatar=false,newMemory=false,newAvatar=false;
    try{
      try{await fs.rename(memory,old);moved=true;}catch(e){if(e.code!=='ENOENT')throw e;}
      try{await fs.rename(avatarFile,oldAvatar);movedAvatar=true;}catch(e){if(e.code!=='ENOENT')throw e;}
      await fs.rename(path.join(staging,'memory'),memory);newMemory=true;
      await fs.rename(stagedAvatar,avatarFile);newAvatar=true;
      await atomic(this.team.file,JSON.stringify(pausedState(archive.payload.team),null,2));
    }catch(error){
      if(newMemory)await fs.rm(memory,{recursive:true,force:true});
      if(moved)await fs.rename(old,memory);
      if(newAvatar)await fs.rm(avatarFile,{force:true});
      if(movedAvatar)await fs.rename(oldAvatar,avatarFile);
      await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});
      throw error;
    }
    await fs.rm(staging,{recursive:true,force:true});await fs.rm(pending,{force:true});
    this.recovered={at:new Date().toISOString(),reason};
  }
  idle(){if(this.team.state.rooms.some(r=>this.team.roomBusy(r))||this.team.state.jobs.some(j=>this.team.active(j))||this.team.state.schedules?.some(s=>s.status==='admitting')||this.team.schedules?.busy)throw Error('请等待当前任务完成后再恢复配置。');}
  async stage(value){
    this.idle();const archive=parseArchive(typeof value==='string'?value:JSON.stringify(value));
    await this.team.memory?.rt.drainMemory?.();this.idle();await this.team.writes;
    await this.checkpoint(this.team.state,'before-restore',true);await atomic(path.join(this.root,'pending.json'),JSON.stringify(archive));
    return {staged:true,bots:archive.payload.team.bots.length,rooms:archive.payload.team.rooms.length};
  }
  async operation(input={}){
    if(input.action==='status')return this.status();
    if(input.action==='create'){await this.team.memory?.rt.drainMemory?.();await this.team.writes;await this.checkpoint(this.team.state,'manual',true);return this.status();}
    if(input.action==='export'){await this.team.memory?.rt.drainMemory?.();await this.team.writes;return (await this.archive()).text;}
    if(input.action==='restore')return this.stage(await this.read(input.id));
    if(input.action==='cancel'){await fs.rm(path.join(this.root,'pending.json'),{force:true});return this.status();}
    for(const [id,item] of this.uploads)if(Date.now()-item.at>300000)this.uploads.delete(id);
    if(input.action==='begin'){if(this.uploads.size>=3)throw Error('已有备份正在上传。');const id=randomUUID();this.uploads.set(id,{text:'',at:Date.now(),offset:0});return {id};}
    const item=this.uploads.get(input.id);if(!item)throw Error('备份上传已过期，请重新选择文件。');
    if(input.action==='chunk'){if(typeof input.chunk!=='string'||input.chunk.length>7000||input.offset!==item.offset)throw Error('备份分片顺序不正确。');if(Buffer.byteLength(item.text)+Buffer.byteLength(input.chunk)>MAX_BYTES){this.uploads.delete(input.id);throw Error('备份文件过大。');}item.text+=input.chunk;item.offset+=input.chunk.length;item.at=Date.now();return {offset:item.offset};}
    if(input.action==='preview'){const value=parseArchive(item.text);return {bots:value.payload.team.bots.length,rooms:value.payload.team.rooms.length,at:value.createdAt};}
    if(input.action==='commit'){const result=await this.stage(item.text);this.uploads.delete(input.id);return result;}
    throw Error('未知备份操作。');
  }
}
module.exports={Backups,parseArchive,validateState,pausedState};
