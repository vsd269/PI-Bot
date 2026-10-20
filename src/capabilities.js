'use strict';
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {SkillImports,materialize}=require('./skill-import');
const {StateEdit}=require('./state-edit');
function expand(names,library){
  const result=new Set();
  for(const name of names||[]){const item=library[name];if(!item)throw new Error('能力不存在：'+name);if(item.kind==='pack')for(const child of item.items){if(!library[child]||library[child].kind==='pack')throw new Error('能力包引用了失效的能力：'+child);result.add(child);}else result.add(name);}
  return [...result].map(name=>library[name]);
}
class Capabilities{
  constructor(team){this.team=team;this.team.state.capabilities??={items:{}};this.imports=new SkillImports(this);}
  get library(){return this.team.state.capabilities.items;}
  view(){return {items:structuredClone(Object.values(this.library).map(({bundle,...item})=>({...item,...(bundle?{bundle:{id:bundle.id,fileCount:bundle.files.length,paths:bundle.files.map(f=>f.path)}}:{})}))),mcpIsolation:false,note:'支持导入 SKILL.md、Skill 文件夹和 ZIP/.skill 安装包，再按 Bot 分配。导入不会自动执行脚本；工具权限仍由 PI 管理。'};}
  check(item,caller){
    if(!caller)return;
    if(caller.role==='Administrator')return;
    const usedByOthers=this.team.state.bots.some(b=>b.id!==caller.id&&expand(b.capabilities||[],this.library).some(c=>c.name===item.name));
    if(item.createdBy!==caller.id||usedByOthers)throw new Error('只有创建者或管理员可修改此能力；被其他 Bot 使用时须由管理员修改。');
  }
  async save(input,caller){
    const name=String(input.name||'').trim();if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)||name.length>32)throw new Error('能力名称须为最多 32 个小写字母、数字和单连字符。');
    if(!['skill','mcp','pack'].includes(input.kind))throw new Error('请选择 Skill、原生 MCP 引用或能力包。');
    const previous=this.library[name];if(previous){this.check(previous,caller);if(previous.kind!==input.kind)throw new Error('已有能力不可变更类型。');}
    const item={name,kind:input.kind,description:String(input.description||'').slice(0,2000),createdBy:previous?.createdBy??caller?.id??null};
    if(item.kind==='skill'){
      item.content=String(input.content||'').trim();const max=previous?.bundle?128000:16000;if(!item.content||item.content.length>max)throw new Error('Skill 指令须为 1–'+max+' 字符。');
      if(previous?.bundle){item.bundle=structuredClone(previous.bundle);item.importedFrom=previous.importedFrom;if(previous.content!==item.content||previous.description!==item.description){item.bundle.id=randomUUID();item.bundle.files.find(f=>f.path==='SKILL.md').data=Buffer.from('---\nname: '+item.name+'\ndescription: '+JSON.stringify(item.description)+'\n---\n\n'+item.content+'\n').toString('base64');}await materialize(this.team,item);}
    }
    if(item.kind==='mcp'){
      const view=await this.team.connectors();if(!view.servers.some(s=>s.id===input.serverId))throw new Error('请选择已在 PI 中配置的 MCP 连接器。');item.serverId=input.serverId;
    }
    if(item.kind==='pack'){if(!Array.isArray(input.items))throw new Error('请选择能力包成员。');item.items=[...new Set(input.items)];for(const child of item.items)if(!this.library[child]||this.library[child].kind==='pack')throw new Error('能力包只能包含已保存的 Skill 和 MCP 引用。');}
    this.library[name]=item;await this.team.save();return this.view();
  }
  async remove(name,caller){const item=this.library[name];if(!item)throw new Error('能力不存在。');this.check(item,caller);delete this.library[name];for(const pack of Object.values(this.library))if(pack.kind==='pack')pack.items=pack.items.filter(n=>n!==name);for(const bot of this.team.state.bots)bot.capabilities=(bot.capabilities||[]).filter(n=>n!==name);await this.team.save();return this.view();}
  attach(input,caller){return this.team.rosterChange(()=>this.assign(input,caller));}
  async assign(input,caller){
    const ids=input.botIds===undefined?[input.botId]:input.botIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>this.team.state.bots.length||ids.some(id=>typeof id!=='string'||!id))throw Error('请至少选择一位现有 Bot。');
    const bots=[...new Set(ids)].map(id=>this.team.bot(id));
    if(caller&&bots.some(bot=>caller.id!==bot.id&&caller.role!=='Administrator'))throw Error('只有管理员可修改其他 Bot 的能力。');
    if(!Array.isArray(input.names)||input.names.some(name=>typeof name!=='string'))throw Error('请选择能力。');
    const names=[...new Set(input.names)],mode=input.mode||'replace';
    if(!['add','remove','replace'].includes(mode))throw Error('无效的分配方式。');
    if(mode!=='replace'&&!names.length)throw Error('请至少选择一项能力。');
    expand(names,this.library);
    // Validate the complete batch before changing any Bot. Keep unrelated skills
    // in add/remove modes and serialize with Bot creation/deletion.
    const assignments=bots.map(bot=>({bot,names:mode==='add'?[...new Set([...(bot.capabilities||[]),...names])]:mode==='remove'?(bot.capabilities||[]).filter(name=>!names.includes(name)):names.slice()}));
    for(const item of assignments)expand(item.names,this.library);
    const edit=new StateEdit();for(const item of assignments)edit.set(item.bot,'capabilities',item.names);
    await this.team.commitEdit(edit);
    return input.compact?{assignments:assignments.map(({bot,names})=>({botId:bot.id,names:names.slice()})),mode}:this.team.snapshot();
  }
  section(bot){
    const selected=expand(bot.capabilities||[],this.library);if(!selected.length)return '';
    const sections=selected.map(item=>item.kind==='skill'?(item.bundle?'Imported Skill '+item.name+' ('+item.description+'). Read its full instructions before using it with read_bot_skill or the native file tool. SKILL.md: '+path.join(this.team.data,'skills',item.bundle.id,'SKILL.md')+'\nResources: '+item.bundle.files.slice(0,60).map(f=>f.path).join(', ')+'\nSummary:\n'+item.content.slice(0,1800):'Skill '+item.name+' ('+item.description+'):\n'+item.content):'Requested native MCP capability: '+item.name+' (server '+item.serverId+'). Native PI configuration remains authoritative.');
    const text=sections.join('\n\n');if(text.length>48000)throw new Error('已分配的 Skill 指令总量超过 48000 字符，请减少能力。');return 'User-configured Bot capabilities:\n'+text;
  }
}
module.exports={Capabilities,expand};
