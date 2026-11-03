'use strict';
const {randomUUID}=require('node:crypto');
const {StateEdit}=require('./state-edit');
const privacy=require('./privacy');
function safeText(team,value,max=16000){
  return team.vault.redact(String(value||'')).slice(0,max)
    .replace(/\b(?:https?|file):\/\/[^\s<>"']+/gi,'[已移除链接]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\r\n,;，；"<>]+/g,'[已移除本地路径]')
    .replace(/(^|[\s(])\/(?:home|Users|tmp|var|etc|mnt|Volumes)\/[^\s"']+/g,'$1[已移除本地路径]')
    .replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]{8,}|github_pat_[\w]+)\b/g,'[已脱敏]')
    .replace(/((?:api[_ -]?key|token|secret|password|密码|密钥)\s*[:=：]\s*)[^\s,;，；]+/gi,'$1[已脱敏]').slice(0,max);
}
function parseTemplate(team,text){
  if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw Error('团队模板最多 1 MB。');
  let value;try{value=JSON.parse(text);}catch{throw Error('团队模板不是有效 JSON。');}
  if(value?.format!=='pi-bot-team-template'||value.schema!==1||!Array.isArray(value.bots)||!value.bots.length||value.bots.length>100||!Array.isArray(value.groups)||value.groups.length>100)throw Error('团队模板格式无效。');
  const keys=new Set(),bots=value.bots.map(b=>{
    if(!b||typeof b.key!=='string'||! /^[a-z0-9_-]{1,80}$/i.test(b.key)||keys.has(b.key)||typeof b.name!=='string'||!b.name.trim()||b.name.length>200||/[\r\n@`]/.test(b.name)||/^(?:user|you|all|everyone|所有人|全体)$/i.test(b.name.trim()))throw Error('模板中有无效或重名的角色键。');
    keys.add(b.key);return {key:b.key,name:safeText(team,b.name.trim(),200),role:b.role==='Administrator'?'Administrator':'Worker',roleLabel:safeText(team,b.roleLabel,200),instructions:safeText(team,b.instructions),color:typeof b.color==='string'?b.color.slice(0,80):'',shape:typeof b.shape==='string'?b.shape.slice(0,80):'',skillReferences:(Array.isArray(b.skillReferences)?b.skillReferences:[]).filter(n=>typeof n==='string'&&/^[a-z0-9_-]{1,100}$/i.test(n)).slice(0,100)};
  });
  const groupKeys=new Set(),groups=value.groups.map(g=>{
    if(!g||typeof g.key!=='string'||! /^[a-z0-9_-]{1,80}$/i.test(g.key)||groupKeys.has(g.key)||keys.has(g.key)||!Array.isArray(g.members)||!g.members.length||g.members.length>100||g.members.some(k=>!keys.has(k))||g.admin!==null&&g.admin!==undefined&&!g.members.includes(g.admin))throw Error('模板中有无效的群成员关系。');
    groupKeys.add(g.key);return {key:g.key,name:safeText(team,g.name,200)||'导入群聊',notice:safeText(team,g.notice),members:[...new Set(g.members)],admin:g.admin||null,executionMode:g.executionMode==='serial'?'serial':'parallel',replyMode:g.replyMode==='everyone'?'everyone':'admin'};
  });
  if(value.schedules!==undefined&&(!Array.isArray(value.schedules)||value.schedules.length>100))throw Error('团队模板最多包含 100 个自动化任务。');
  const schedules=(value.schedules||[]).map(s=>{
    const kind=s.targetKind==='room'?'room':'bot';if(!(kind==='room'?groupKeys:keys).has(s.target))throw Error('模板自动化的目标不存在。');
    const when=require('./schedules').validateWhen(s.when);return {title:safeText(team,s.title,120)||'导入任务',prompt:safeText(team,s.prompt,32000),targetKind:kind,target:s.target,when};
  });
  return {format:'pi-bot-team-template',schema:1,bots,groups,schedules};
}
class TeamTemplates{
  constructor(team){this.team=team;this.pending=new Map();}
  export(){
    const t=this.team,bots=t.state.bots.filter(b=>!privacy.isPrivate(b)),keys=new Map(bots.map((b,i)=>[b.id,'bot-'+(i+1)]));
    const groups=t.state.rooms.filter(r=>r.members.every(id=>keys.has(id))&&(!r.adminId||keys.has(r.adminId))).map((r,i)=>({key:'group-'+(i+1),name:safeText(t,r.name,200),notice:safeText(t,r.notice),members:r.members.map(id=>keys.get(id)),admin:keys.get(r.adminId)||null,executionMode:r.executionMode,replyMode:r.replyMode}));
    const groupKeys=new Map(t.state.rooms.filter(r=>r.members.every(id=>keys.has(id))&&(!r.adminId||keys.has(r.adminId))).map((r,i)=>[r.id,groups[i].key]));
    if(!bots.length||bots.length>100||groups.length>100)throw Error('团队模板需要 1–100 个非私密 Bot，最多 100 个群聊。');
    const value={format:'pi-bot-team-template',schema:1,bots:bots.map(b=>({key:keys.get(b.id),name:safeText(t,b.name,200),role:b.role,roleLabel:safeText(t,b.roleLabel,200),instructions:safeText(t,b.instructions),color:b.color,shape:b.avatar?.shape,skillReferences:(b.capabilities||[]).filter(n=>typeof n==='string')})),groups,schedules:(t.state.schedules||[]).filter(s=>(s.targetKind==='room'?groupKeys:keys).has(s.targetId)&&s.when?.kind!=='at').map(s=>({title:safeText(t,s.title,120),prompt:safeText(t,s.prompt,32000),targetKind:s.targetKind,target:(s.targetKind==='room'?groupKeys:keys).get(s.targetId),when:s.when}))};
    const clean=parseTemplate(t,JSON.stringify(value)),text=JSON.stringify(clean,null,2);
    if(Buffer.byteLength(text)>1024*1024)throw Error('团队模板超过 1 MB，请先精简角色说明。');
    return {text,summary:{bots:clean.bots.length,groups:clean.groups.length,schedules:clean.schedules.length},note:'仅导出非私密 Bot 的角色配置、群结构和周期任务。技能仅保留名称引用，图片头像、聊天、记忆、密钥、模型账户、授权和本地目录均不携带。提示词可能含个人资料，请在下载前检查。'};
  }
  async preview(text){
    for(const [key,item] of this.pending)if(item.expires<Date.now())this.pending.delete(key);
    if(this.pending.size>=10)throw Error('待确认模板过多，请关闭设置后稍后重试。');
    const value=parseTemplate(this.team,text),{hasShape,isColor}=await import('../renderer/upstream/characters.mjs');
    for(const bot of value.bots){if(!hasShape(bot.shape))bot.shape='';if(!isColor(bot.color))bot.color='';}
    const id=randomUUID();this.pending.set(id,{value,expires:Date.now()+600000});
    return {id,preview:value,note:'确认后创建全新团队配置；同名自动加序号。不带授权，技能不自动绑定，自动化默认暂停，工作目录需重新设置。'};
  }
  async commit(id,confirm){
    if(confirm!==true)throw Error('请先预览并确认导入团队配置。');
    const staged=this.pending.get(id);if(!staged||staged.expires<Date.now())throw Error('预览已过期，请重新选择模板。');
    // A double-click cannot create a second team; failed saves retain the preview.
    if(staged.promise)return staged.promise;
    const run=async()=>{
      const team=this.team,value=staged.value,map=new Map(),edit=new StateEdit();
      await team.save(()=>edit.rollback(),()=>{
        if(team.stopped||team.storeConflict)throw Error('插件已停止或团队数据冲突。');
        const names=new Set(team.state.bots.map(b=>b.name.toLowerCase()));
        for(const b of value.bots){let name=b.name,n=2;while(names.has(name.toLowerCase()))name=b.name.slice(0,185)+' '+n++;names.add(name.toLowerCase());const bot={id:randomUUID(),name,role:b.role,roleLabel:b.roleLabel,instructions:b.instructions,modelKey:'',workDir:'',agentMode:'planner',private:false,memory:'',sessions:{},capabilities:[],templateSkillReferences:b.skillReferences,thinkingLevel:'off',...(b.color?{color:b.color}:{}),...(b.shape?{avatar:{shape:b.shape}}:{})};map.set(b.key,bot.id);edit.append(team.state,'bots',bot);}
        const groupNames=new Set(team.state.rooms.map(r=>r.name.toLowerCase()));
        for(const g of value.groups){let name=g.name,n=2;while(groupNames.has(name.toLowerCase()))name=g.name.slice(0,185)+' '+n++;groupNames.add(name.toLowerCase());const room={id:randomUUID(),name,named:true,notice:g.notice,members:g.members.map(k=>map.get(k)),adminId:map.get(g.admin)||null,executionMode:g.executionMode,replyMode:g.replyMode,permissionMode:'inherit',workDir:'',log:[],sessions:{}};map.set(g.key,room.id);edit.append(team.state,'rooms',room);}
        for(const s of value.schedules)edit.append(team.state,'schedules',{id:randomUUID(),title:s.title,prompt:s.prompt,targetKind:s.targetKind,targetId:map.get(s.target),when:s.when,enabled:false,workspace:'',nextAt:null,status:'paused',runs:[]});
      });
      this.pending.delete(id);return {created:true,bots:value.bots.length,groups:value.groups.length,schedules:value.schedules.length};
    };
    staged.promise=run();try{return await staged.promise;}catch(e){delete staged.promise;throw e;}
  }
  operation(input={}){if(input.action==='export')return this.export();if(input.action==='preview')return this.preview(input.text);if(input.action==='commit')return this.commit(input.id,input.confirm);throw Error('未知的团队模板操作。');}
}
module.exports={TeamTemplates,parseTemplate,safeText};
