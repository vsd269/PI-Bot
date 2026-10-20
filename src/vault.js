'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID,randomBytes,scryptSync,createCipheriv,createDecipheriv}=require('node:crypto');
const SPEECH_SCOPE='@speech';
const nameOf=value=>{if(typeof value!=='string'||! /^[A-Z_][A-Z0-9_]{0,79}$/.test(value))throw Error('密钥名称使用大写字母、数字和下划线，不能以数字开头。');return value;};
async function atomic(file,text){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,text,{mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}}
function dpapi(action,bytes){
  if(process.platform!=='win32')return Promise.reject(Error('密钥库需要 Windows 当前用户加密支持；没有启用明文回退。'));
  return new Promise((resolve,reject)=>{
    // Fixed script; secrets are passed only on stdin, never command arguments.
    const code="$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$v=[Convert]::FromBase64String([Console]::In.ReadToEnd());$o=[Security.Cryptography.ProtectedData]::"+(action==='protect'?'Protect':'Unprotect')+"($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($o))";
    const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='',done=false;const timer=setTimeout(()=>finish(Error('Windows 密钥加解密超时。')),15000);
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)child.kill();error?reject(error):resolve(value);};
    child.on('error',()=>finish(Error('无法启动 Windows 密钥加密组件。')));child.stdin.on('error',()=>{});child.stderr.resume();
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>3*1024*1024)finish(Error('密钥库超过大小限制。'));});
    child.on('exit',code=>code===0?finish(null,Buffer.from(output.trim(),'base64')):finish(Error('无法解锁密钥库。请使用原 Windows 账号，或导入密码加密的迁移文件。')));
    child.stdin.end(bytes.toString('base64'));
  });
}
class Vault{
  constructor(team){this.team=team;this.file=path.join(team.backups.root,'secrets.dpapi');this.entries=[];this.queue=Promise.resolve();this.error=null;this.uploads=new Map();}
  async load(){try{if((await fs.stat(this.file)).size>12*1024*1024)throw Error('密钥库超过大小限制。');const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(data.format!=='pi-bot-dpapi'||typeof data.data!=='string')throw Error('密钥库格式无效。');const parsed=JSON.parse((await dpapi('unprotect',Buffer.from(data.data,'base64'))).toString());this.validate(parsed);this.entries=parsed;}catch(e){if(e.code!=='ENOENT')this.error=e.message;}return this;}
  validate(entries){if(Buffer.byteLength(JSON.stringify(entries))>1024*1024)throw Error('密钥总量超过 1 MB。');if(!Array.isArray(entries)||entries.length>500||entries.some(e=>!e||typeof e.botId!=='string'||typeof e.name!=='string'||! /^[A-Z_][A-Z0-9_]{0,79}$/.test(e.name)||typeof e.value!=='string'||e.value.length<4||e.value.length>16000))throw Error('密钥数据无效。');const keys=new Set();for(const e of entries){const key=e.botId+':'+e.name;if(keys.has(key))throw Error('密钥数据包含重复项。');keys.add(key);}}
  async persist(entries){this.validate(entries);const encrypted=await dpapi('protect',Buffer.from(JSON.stringify(entries)));await atomic(this.file,JSON.stringify({format:'pi-bot-dpapi',version:1,data:encrypted.toString('base64')}));this.entries=entries;}
  change(run,allowLocked=false){const pending=this.queue.catch(()=>{}).then(async()=>{if(this.error&&!allowLocked)throw Error(this.error);return run();});this.queue=pending.catch(()=>{});return pending;}
  list(botId){if(botId)this.team.bot(botId);return {available:!this.error&&process.platform==='win32',error:this.error,entries:this.entries.filter(e=>!botId||e.botId===botId).map(({value,...metadata})=>metadata),requests:(this.team.state.secretRequests||[]).filter(r=>!botId||r.botId===botId)};}
  async set({botId,name,value}){this.team.bot(botId);nameOf(name);if(typeof value!=='string'||value.length<4||value.length>16000||value.includes('\0'))throw Error('密钥需要 4–16000 个字符，不能含空字符。');return this.change(async()=>{const next=this.entries.filter(e=>e.botId!==botId||e.name!==name);next.push({botId,name,value,updatedAt:new Date().toISOString()});await this.persist(next);await this.team.bridge?.disconnectBot(botId);for(const r of this.team.state.secretRequests||[])if(r.botId===botId&&r.name===name)r.status='provided';await this.team.save();return this.list(botId);});}
  async setSpeech({name,value}){nameOf(name);if(typeof value!=='string'||value.length<4||value.length>16000||value.includes('\0'))throw Error('密钥需要 4–16000 个字符。');return this.change(async()=>{await this.persist([...this.entries.filter(e=>e.botId!==SPEECH_SCOPE||e.name!==name),{botId:SPEECH_SCOPE,name,value,updatedAt:new Date().toISOString()}]);return {saved:true};});}
  speechValue(name){return this.value(SPEECH_SCOPE,name);}
  remove({botId,name}){this.team.bot(botId);nameOf(name);return this.change(async()=>{await this.persist(this.entries.filter(e=>e.botId!==botId||e.name!==name));await this.team.bridge?.disconnectBot(botId);return this.list(botId);});}
  value(botId,name){if(this.error)throw Error(this.error);nameOf(name);const entry=this.entries.find(e=>e.botId===botId&&e.name===name);if(!entry)throw Error('请先在该 Bot 的密钥管理中填写 '+name+'。');return entry.value;}
  reveal(botId,name){this.team.bot(botId);return this.value(botId,name);}
  redact(value){let text=String(value??'');for(const e of this.entries){const variants=[e.value,JSON.stringify(e.value).slice(1,-1),encodeURIComponent(e.value),Buffer.from(e.value).toString('base64')];for(const secret of new Set(variants))if(secret)text=text.split(secret).join('[密钥已隐藏]');}return text;}
  clean(value){if(typeof value==='string')return this.redact(value);if(Array.isArray(value))return value.map(v=>this.clean(v));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,this.clean(v)]));return value;}
  cleanState(value){return require('./state-redaction').cleanState(this,value);}
  async request(botId,{name,reason}){this.team.bot(botId);nameOf(name);if(this.entries.some(e=>e.botId===botId&&e.name===name))return {status:'provided',note:'已保存；工具只能通过引用使用，不返回密钥。'};const rows=this.team.state.secretRequests??=[];let item=rows.find(r=>r.botId===botId&&r.name===name&&r.status==='pending');if(!item){if(rows.filter(r=>r.status==='pending').length>=100)throw Error('待填写密钥过多，请先处理已有请求。');item={id:randomUUID(),botId,name,reason:this.redact(String(reason||'').slice(0,1000)),status:'pending',at:new Date().toISOString()};rows.push(item);await this.team.save();}return {status:'pending',requestId:item.id,note:'请提示用户到 Bot 设置 → 密钥管理填写。不要在聊天中索取或打印密钥。'};}
  async transfer(input){
    for(const [id,item] of this.uploads)if(Date.now()-item.at>300000)this.uploads.delete(id);
    if(input.action==='begin'){if(this.uploads.size>=3)throw Error('已有密钥文件正在上传。');const id=randomUUID();this.uploads.set(id,{text:'',offset:0,at:Date.now()});return {id};}
    const item=this.uploads.get(input.id);if(!item)throw Error('密钥文件上传已过期。');
    if(input.action==='cancel'){this.uploads.delete(input.id);return {cancelled:true};}
    if(input.action==='chunk'){if(typeof input.chunk!=='string'||input.chunk.length>6000||input.offset!==item.offset)throw Error('密钥分片顺序无效。');if(item.text.length+input.chunk.length>2*1024*1024){this.uploads.delete(input.id);throw Error('密钥文件超过 2 MB。');}item.text+=input.chunk;item.offset+=input.chunk.length;item.at=Date.now();return {offset:item.offset};}
    if(input.action==='commit'){try{return await this.importTransfer({text:item.text,password:input.password});}finally{this.uploads.delete(input.id);}}
    throw Error('无效的密钥上传操作。');
  }
  password(value){if(typeof value!=='string'||value.length<10||value.length>256)throw Error('迁移密码需要 10–256 个字符。');return value;}
  export({password}){return this.change(async()=>{this.password(password);const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);try{const data=Buffer.concat([cipher.update(JSON.stringify(this.entries.map(e=>({...e,botName:this.team.state.bots.find(b=>b.id===e.botId)?.name||''})))) ,cipher.final()]);return JSON.stringify({format:'pi-bot-secret-transfer',version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});}finally{key.fill(0);}});}
  importTransfer({password,text}){return this.change(async()=>{this.password(password);if(typeof text!=='string'||text.length>2*1024*1024)throw Error('密钥迁移文件超过大小限制。');let rows,key;try{const data=JSON.parse(text);if(data.format!=='pi-bot-secret-transfer'||data.version!==1)throw Error();const salt=Buffer.from(data.salt,'base64'),iv=Buffer.from(data.iv,'base64'),tag=Buffer.from(data.tag,'base64');if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error();key=scryptSync(password,salt,32);const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);rows=JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data,'base64')),decipher.final()]).toString());this.validate(rows);}catch{throw Error('迁移密码错误，或密钥文件损坏。');}finally{key?.fill(0);}const next=[...this.entries];for(const row of rows){const bot=row.botId===SPEECH_SCOPE?{id:SPEECH_SCOPE}:this.team.state.bots.find(b=>b.id===row.botId)||this.team.state.bots.find(b=>b.name===row.botName);if(!bot)throw Error('请先导入团队个人备份，找不到密钥所属 Bot：'+String(row.botName||row.botId).slice(0,200));const item={botId:bot.id,name:row.name,value:row.value,updatedAt:new Date().toISOString()};const index=next.findIndex(e=>e.botId===bot.id&&e.name===row.name);if(index<0)next.push(item);else next[index]=item;}if(this.error)await fs.copyFile(this.file,this.file+'.locked-'+Date.now());await this.persist(next);this.error=null;await this.team.bridge?.close();return {imported:rows.length};},true);}
}
module.exports={Vault,dpapi};
