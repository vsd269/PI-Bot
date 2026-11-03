'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {admit}=require('./work-admission');
const {StateEdit}=require('./state-edit');
const privacy=require('./privacy');
const local=p=>typeof p==='string'&&path.isAbsolute(p)&&!/^[/\\]{2}|^\\\\[?.]/.test(p)&&!p.includes('\0');
function validateWaits(state){
  if(state.fileWaits===undefined)return;
  if(!Array.isArray(state.fileWaits)||state.fileWaits.length>2000)throw Error('文件等待记录无效或过多。');
  const ids=new Set();for(const w of state.fileWaits){if(!w||typeof w.id!=='string'||ids.has(w.id)||w.id.length>120||typeof w.botId!=='string'||!local(w.root)||!local(w.workspace)||typeof w.relative!=='string'||!w.relative||w.relative.length>500||path.isAbsolute(w.relative)||/[:\0]/.test(w.relative)||typeof w.task!=='string'||!w.task||w.task.length>32000||!['exists','changed'].includes(w.kind)||!['waiting','triggered','cancelled','expired','error'].includes(w.status)||!Number.isFinite(w.expiresAt)||typeof w.private!=='boolean'||w.baseline!==null&&typeof w.baseline!=='string')throw Error('文件等待记录无效。');ids.add(w.id);}
}
async function probeFile(root,relative){
  if(!local(root)||typeof relative!=='string'||!relative||relative.length>500||path.isAbsolute(relative)||/[:\0]/.test(relative))throw Error('只支持工作目录内的本地相对文件路径。');
  const realRoot=await fs.realpath(root),file=path.resolve(realRoot,relative),rel=path.relative(realRoot,file);
  if(!local(realRoot)||!rel||rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel))throw Error('文件必须位于已授权工作目录内。');
  let cursor=realRoot;
  for(const part of rel.split(path.sep)){
    cursor=path.join(cursor,part);let stat;try{stat=await fs.lstat(cursor);}catch(e){if(e.code==='ENOENT')return {exists:false,fingerprint:null};throw e;}
    if(stat.isSymbolicLink())throw Error('文件等待不跟随符号链接或目录联接。');
    if(cursor===file){if(!stat.isFile())throw Error('等待目标必须是普通文件。');return {exists:true,fingerprint:[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':')};}
    if(!stat.isDirectory())throw Error('等待路径的父级不是目录。');
  }
}
class FileWaits{
  constructor(team){this.team=team;this.busy=false;}
  load(){this.team.state.fileWaits??=[];validateWaits(this.team.state);}
  arm(){clearTimeout(this.timer);if(this.closed||this.team.stopped||!(this.team.state.fileWaits||[]).some(w=>w.status==='waiting'))return;this.timer=setTimeout(()=>this.tick().catch(e=>{this.lastError=e.message;}).finally(()=>this.arm()),5000);this.timer.unref?.();}
  view(){const rows=this.team.state.fileWaits||[],active=rows.filter(w=>w.status==='waiting');return {waits:structuredClone([...active,...rows.filter(w=>w.status!=='waiting').slice(-100)]),total:rows.length,requiresRunningApp:true,lastError:this.lastError};}
  async context(wait){
    const team=this.team,bot=team.bot(wait.botId),workspace=await team.pi.workspace.get();
    if(workspace?.path!==wait.workspace)throw Error('请切回创建等待时的工作区。');
    if((bot.workDir||workspace.path)!==wait.root||privacy.isPrivate(bot)!==wait.private)throw Error('Bot 的目录或私密设置已改变，请重新创建等待。');
    if(bot.role==='Administrator'&&bot.agentMode!=='agent')throw Error('请选择能执行任务的 Bot，管理员规划模式不能直接执行。');
    if(privacy.isPrivate(bot))await privacy.checkPrivateChange(team,bot);else await privacy.checkPublicDirectory(team,wait.root,bot.id);
    return bot;
  }
  async create(input){
    const team=this.team;if(team.stopped||team.storeConflict)throw Error('插件已停止或团队数据存在冲突。');
    if((team.state.fileWaits||[]).filter(w=>w.status==='waiting').length>=100)throw Error('最多同时等待 100 个文件。');
    if((team.state.fileWaits||[]).length>=2000)throw Error('等待历史已满，请备份后清理已结束记录。');
    const bot=team.bot(input.botId),workspace=await team.pi.workspace.get(),hours=Number(input.hours||24);
    if(!workspace?.path||!Number.isFinite(hours)||hours<1/60||hours>720)throw Error('请选择工作区，到期时间应为 1 分钟至 30 天。');
    const task=String(input.task||'').trim(),relative=String(input.relative||'').trim();if(!task||task.length>32000)throw Error('请填写触发后的任务（最多 32000 字）。');
    const wait={id:randomUUID(),botId:bot.id,workspace:workspace.path,root:bot.workDir||workspace.path,private:privacy.isPrivate(bot),relative,task,kind:input.kind==='changed'?'changed':'exists',status:'waiting',at:new Date().toISOString(),expiresAt:Date.now()+hours*3600000};
    await this.context(wait);const baseline=await probeFile(wait.root,relative);wait.baseline=baseline.fingerprint;
    const edit=new StateEdit();await team.save(()=>edit.rollback(),()=>{if(team.stopped||team.storeConflict||!team.state.bots.includes(bot)||privacy.isPrivate(bot)!==wait.private)throw Error('Bot 状态已改变。');edit.append(team.state,'fileWaits',wait);});this.arm();return this.view();
  }
  async cancel(id){const wait=this.team.state.fileWaits.find(w=>w.id===id);if(!wait)throw Error('等待不存在。');if(wait.status!=='waiting')throw Error('此等待已经触发或结束，请到原聊天停止已派发任务。');const edit=new StateEdit();edit.set(wait,'status','cancelled');await this.team.commitEdit(edit);this.arm();return this.view();}
  tick(now=Date.now()){if(this.running)return this.running;this.running=this.runTick(now).finally(()=>{this.running=null;});return this.running;}
  async runTick(now=Date.now()){
    if(this.closed||this.busy||this.team.stopped||this.team.storeConflict)return;this.busy=true;
    try{for(const wait of this.team.state.fileWaits||[]){
      if(wait.status!=='waiting')continue;
      if(now>=wait.expiresAt){wait.status='expired';await this.team.save();continue;}
      try{
        const workspace=await this.team.pi.workspace.get();if(workspace?.path!==wait.workspace)continue;
        const bot=await this.context(wait),current=await probeFile(wait.root,wait.relative);
        if(!current.exists||wait.kind==='changed'&&current.fingerprint===wait.baseline)continue;
        await admit(this.team,{bot,task:'[用户创建的文件条件已满足：'+wait.relative+']\n'+wait.task,key:'file-wait:'+wait.id,options:{fileWaitId:wait.id,workspace:wait.workspace},check:()=>{if(wait.status!=='waiting'||!this.team.state.fileWaits.includes(wait)||Date.now()>=wait.expiresAt||privacy.isPrivate(bot)!==wait.private||(bot.workDir||wait.workspace)!==wait.root)throw Error('等待已取消、到期或目录已改变。');},change:(edit,job)=>{edit.set(wait,'status','triggered');edit.set(wait,'jobId',job.id);edit.set(wait,'triggeredAt',new Date().toISOString());}});
      }catch(error){
        if(wait.status!=='waiting'||this.closed||this.team.stopped)continue;
        wait.status='error';wait.error=this.team.vault.redact(String(error.message||error)).slice(0,500);await this.team.save();
      }
    }}finally{this.busy=false;}
  }
  async close(){this.closed=true;clearTimeout(this.timer);await this.running?.catch(()=>{});}
}
module.exports={FileWaits,probeFile,validateWaits};
