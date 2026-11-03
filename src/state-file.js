'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {sameOwner}=require('./process-identity');
const digest=bytes=>bytes===null?null:createHash('sha256').update(bytes).digest('hex');
async function read(file){try{return await fs.readFile(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function rename(from,to){
  for(let n=0;;n++)try{return await fs.rename(from,to);}catch(error){
    if(n>=5||!['EPERM','EBUSY','EACCES'].includes(error.code))throw error;
    await new Promise(resolve=>setTimeout(resolve,10*(n+1)));
  }
}
class StateFile{
  constructor(file){this.file=file;this.lock=file+'.lock';this.marker=file+'.conflict.json';this.token=randomUUID();}
  async acquire(){
    try{await this.claim();}catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=JSON.parse(await fs.readFile(this.lock,'utf8'));}catch{throw Error('团队数据锁无法确认，请关闭其他 PI Desktop 实例后检查 team.json.lock。');}
      if(!Number.isSafeInteger(owner.pid)||owner.pid<1)throw Error('团队数据锁无效，未启动另一份写入者。');
      const alive=await sameOwner(owner,(await fs.stat(this.lock)).mtimeMs);
      if(alive)throw Error('另一份 PI Bot 正在使用此团队数据。请关闭重复实例后重试。');
      // Serialize stale-owner cleanup; never unlink another contender's new lock.
      const guard=this.lock+'.reclaim';let handle;
      try{handle=await fs.open(guard,'wx');const current=JSON.parse(await fs.readFile(this.lock,'utf8'));if(current.token!==owner.token)throw Error('数据锁已改变，请重试。');await fs.unlink(this.lock);await this.claim();}
      catch(error){if(error.code==='EEXIST')throw Error('团队数据回收锁尚未确认释放，请关闭重复实例后检查 team.json.lock.reclaim；原数据未修改。');throw error;}
      finally{if(handle){await handle.close();await fs.rm(guard,{force:true});}}
    }
    const marker=await read(this.marker);
    if(marker){const value=JSON.parse(marker);if(!value||typeof value.local!=='string'||path.basename(value.local)!==value.local||!/^team-conflict-[a-z0-9-]+-local\.json$/.test(value.local))throw Error('团队冲突记录无效，原文件已保留。');this.conflict=value;}
  }
  async claim(){const h=await fs.open(this.lock,'wx');try{await h.writeFile(JSON.stringify({pid:process.pid,token:this.token,startedAt:Date.now()-process.uptime()*1000}));this.owned=true;}finally{await h.close();if(!this.owned)await fs.rm(this.lock,{force:true});}}
  async load(){const disk=await read(this.file);this.expected=digest(disk);this.committed=disk;return this.conflict?fs.readFile(path.join(path.dirname(this.file),this.conflict.local),'utf8'):disk?.toString('utf8');}
  async check(bytes){
    if(this.conflict)throw this.error();
    const current=await read(this.file);if(digest(current)===this.expected)return;
    const stem='team-conflict-'+randomUUID(),local=stem+'-local.json',external=stem+'-external.json';
    await fs.writeFile(path.join(path.dirname(this.file),local),this.committed??bytes,{flag:'wx'});
    if(current!==null)await fs.writeFile(path.join(path.dirname(this.file),external),current,{flag:'wx'});
    this.conflict={at:new Date().toISOString(),local,external:current===null?null:external};
    await fs.writeFile(this.marker,JSON.stringify(this.conflict),{flag:'wx'});throw this.error();
  }
  error(){return Object.assign(Error('团队数据被外部修改，已保留双方版本并暂停自动派发。请打开“待处理”核对。'),{code:'PI_BOT_STORE_CONFLICT'});}
  async write(bytes){
    await this.check(bytes);if(digest(bytes)===this.expected)return;const tmp=this.file+'.tmp';await fs.writeFile(tmp,bytes);
    await this.check(bytes);await rename(tmp,this.file);this.expected=digest(bytes);this.committed=Buffer.from(bytes);
  }
  async resolve(bytes){
    if(!this.conflict)return;
    const current=await read(this.file);if(current!==null)await fs.writeFile(path.join(path.dirname(this.file),'team-conflict-'+randomUUID()+'-external.json'),current,{flag:'wx'});
    const before=this.conflict;this.expected=digest(current);this.conflict=null;
    try{await this.write(bytes);await fs.rm(this.marker,{force:true});}catch(error){this.conflict=before;throw error;}
  }
  async close(){if(!this.owned)return;const raw=await read(this.lock);if(raw&&JSON.parse(raw).token===this.token)await fs.rm(this.lock,{force:true});this.owned=false;}
}
module.exports={StateFile,rename};
