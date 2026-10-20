'use strict';
// One-time local identity change. Copy into a verified staging tree; never move
// or delete the legacy data. A journal and receipts resume either commit safely.
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {ID,LEGACY_ID,backupRoot}=require('./identity');
const {Backups,validateState,parseArchive}=require('./backups');
const {LongMessages}=require('./long-messages');
const PENDING='.pi-bot-identity-migration.json',RECEIPT='.pi-bot-identity-migrated.json';
const pending=new Map();
async function exists(file){try{await fs.lstat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function entries(dir){try{return await fs.readdir(dir);}catch(e){if(e.code==='ENOENT')return [];throw e;}}
async function atomic(file,value){const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(value));await fs.rename(temp,file);}
async function directory(dir){const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('迁移目录包含链接或不是文件夹，未修改原数据。');}
async function copyTree(from,to,signal){
  signal?.throwIfAborted();
  await fs.mkdir(to,{recursive:true});if(!await exists(from))return;
  await directory(from);
  for(const entry of await fs.readdir(from,{withFileTypes:true})){
    signal?.throwIfAborted();
    const source=path.join(from,entry.name),target=path.join(to,entry.name),stat=await fs.lstat(source);
    if(stat.isSymbolicLink())throw Error('旧数据包含符号链接，请先检查；未修改旧数据。');
    if(stat.isDirectory())await copyTree(source,target,signal);
    else if(stat.isFile())await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);
    else throw Error('旧数据包含特殊文件，未修改旧数据。');
  }
}
async function legacyInactive(pi){
  let result;try{result=await pi.desktop.invoke({operation:'plugin/list',args:[]});}catch{throw Error('请先在 PI 插件管理中停用旧版 PI Bot，再重启新版以迁移数据；暂不要卸载旧版。（无法确认旧版运行状态）');}
  const rows=Array.isArray(result)?result:result?.plugins;
  if(!Array.isArray(rows))throw Error('无法确认旧版 PI Bot 状态，请先停用旧版并重启 PI。');
  const old=rows.find(p=>p.id===LEGACY_ID);
  if(old&&(old.enabled===true||old.enabled!==false&&old.status!=='disabled'))throw Error('请先在 PI 插件管理中停用旧版 PI Bot，再重启新版。旧数据会自动迁移，暂不要卸载旧版。');
}
// Rebase structured file locations only. Chat prose, credentials, model names
// and external workspace paths remain byte-for-byte strings.
const PATH_KEYS=new Set(['path','file','workDir','cwd','command','home','dataPath']);
function rebase(value,from,to,key=''){
  if(typeof value==='string'&&PATH_KEYS.has(key)){
    const source=from.replaceAll('\\','/'),candidate=value.replaceAll('\\','/'),relative=path.relative(from,value);
    if(candidate===source||candidate.startsWith(source+'/'))return path.join(to,relative);
  }
  if(Array.isArray(value))return value.map(v=>rebase(v,from,to,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rebase(v,from,to,k)]));
  return value;
}
async function rebaseBackups(dir,from,to){
  for(const name of await entries(dir)){
    if(!/^\d{4}-[\w-]+\.json$/.test(name)&&name!=='pending.json')continue;
    const file=path.join(dir,name);let archive;
    // Keep damaged historical backups unchanged; normal recovery ignores them.
    try{archive=parseArchive(await fs.readFile(file,'utf8'));}catch{continue;}
    archive.payload.team=rebase(archive.payload.team,from,to);archive.pluginId=ID;
    archive.sha256=createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex');await atomic(file,archive);
  }
}
function stagePath(parent,name){if(!/^\.pi-bot-migrate-[a-f0-9-]{36}$/.test(name))throw Error('迁移日志无效，已停止以保留数据。');const result=path.resolve(parent,name);if(path.dirname(result)!==path.resolve(parent))throw Error('迁移路径无效。');return result;}
async function commitTree(source,target,receipt){
  if(await exists(target)){
    await directory(target);
    let previous;try{previous=JSON.parse(await fs.readFile(path.join(target,RECEIPT),'utf8'));}catch{}
    if(previous?.migrationId===receipt.migrationId)return;
    if((await entries(target)).length)throw Error('新版已有数据，未覆盖。请保留数据并检查迁移状态。');
    await fs.rmdir(target); // Empty directory only; never recursively remove a data tree.
  }
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(source,target);
}
async function run(pi,data,{signal}={}){
  signal?.throwIfAborted();
  if(path.basename(data)!==ID||path.basename(path.dirname(data))!=='data')return {status:'not-native-layout'};
  const parent=path.dirname(data),old=path.join(parent,LEGACY_ID),backups=backupRoot(data),oldBackups=backupRoot(old,LEGACY_ID),journal=path.join(parent,PENDING);
  await directory(parent);if(await exists(data))await directory(data);
  if(await exists(old))await directory(old);if(await exists(oldBackups))await directory(oldBackups);
  let job;try{job=JSON.parse(await fs.readFile(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('迁移日志无法读取，已保留全部数据，请勿卸载旧版。');}
  const oldExists=await exists(path.join(old,'team.json'))||(await entries(oldBackups)).some(n=>/^\d{4}-[\w-]+\.json$/.test(n));
  if(oldExists||job)await legacyInactive(pi);
  if(!job){
    if(await exists(path.join(data,'team.json'))||(await entries(backups)).length)return {status:'existing'};
    if(!oldExists)return {status:'fresh'};
    if((await entries(data)).length)throw Error('新版数据目录不为空，未覆盖。请先备份并检查数据。');
    job={format:'pi-bot-identity-migration',from:LEGACY_ID,to:ID,phase:'copying',stage:'.pi-bot-migrate-'+randomUUID(),migrationId:randomUUID()};await atomic(journal,job);
  }
  if(job.format!=='pi-bot-identity-migration'||job.from!==LEGACY_ID||job.to!==ID||!['copying','prepared'].includes(job.phase)||typeof job.migrationId!=='string'||! /^[a-f0-9-]{36}$/.test(job.migrationId))throw Error('迁移日志无效，未修改旧数据。');
  const stage=stagePath(parent,job.stage),stagedData=path.join(stage,'data'),stagedBackups=path.join(stage,'backups');
  if(job.phase==='copying'){
    // Only the exact scratch folder recorded in our validated journal is removed.
    if(await exists(stage)){await directory(stage);await fs.rm(stage,{recursive:true});}
    await copyTree(old,stagedData,signal);await copyTree(oldBackups,stagedBackups,signal);
    const team={data:stagedData,file:path.join(stagedData,'team.json')};team.longMessages=new LongMessages(team);
    const recovery=new Backups(team);recovery.root=stagedBackups;await recovery.prepare();
    const raw=JSON.parse(await fs.readFile(team.file,'utf8'));validateState(await team.longMessages.restore(raw));
    await atomic(team.file,rebase(raw,old,data));await rebaseBackups(stagedBackups,old,data);
    const receipt={migrationId:job.migrationId,from:LEGACY_ID,to:ID,at:new Date().toISOString()};
    await atomic(path.join(stagedData,RECEIPT),receipt);await atomic(path.join(stagedBackups,RECEIPT),receipt);
    signal?.throwIfAborted();job.phase='prepared';await atomic(journal,job);
  }
  const receipt={migrationId:job.migrationId};
  signal?.throwIfAborted();await commitTree(stagedBackups,backups,receipt);signal?.throwIfAborted();await commitTree(stagedData,data,receipt);
  if(await exists(stage)){await directory(stage);await fs.rm(stage,{recursive:true});}await fs.rm(journal);
  return {status:'migrated',from:LEGACY_ID,to:ID};
}
function migrateIdentity(pi,data,options){
  const key=path.resolve(data);if(pending.has(key))return pending.get(key);
  const task=run(pi,key,options).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
module.exports={migrateIdentity,rebase,stagePath};
