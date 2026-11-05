'use strict';
const {randomUUID}=require('node:crypto');
const {StateEdit}=require('./state-edit');
const MAX_DEPARTMENTS=100,MAX_NAME=60;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
function departmentName(value){
  if(typeof value!=='string')throw Error('请填写部门名称。');
  const name=value.trim().normalize('NFC');
  if(!name||name.length>MAX_NAME||/[\u0000-\u001f\u007f]/u.test(name))throw Error('部门名称需要 1–60 个字符，不能包含换行。');
  if(name==='群组聊天')throw Error('“群组聊天”是默认分类，请换一个部门名称。');
  return name;
}
function validateSidebarSections(state){
  const value=state.sidebarSections;
  for(const item of [...state.bots,...state.rooms])if(item.sidebarOrder!==undefined&&(!Number.isSafeInteger(item.sidebarOrder)||item.sidebarOrder<0||item.sidebarOrder>1000000))throw Error('会话排序配置无效。');
  if(value===undefined){if([...state.bots,...state.rooms].some(item=>item.departmentId!==undefined))throw Error('会话的部门不存在。');return;}
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.departments)||value.departments.length>MAX_DEPARTMENTS||typeof value.groupsCollapsed!=='boolean')throw Error('侧栏部门配置无效。');
  const ids=new Set(),names=new Set();
  for(const item of value.departments){
    if(!item||!safeId(item.id)||ids.has(item.id)||typeof item.collapsed!=='boolean'||departmentName(item.name)!==item.name||names.has(item.name.toLocaleLowerCase()))throw Error('侧栏部门配置无效。');
    ids.add(item.id);names.add(item.name.toLocaleLowerCase());
  }
  for(const item of [...state.bots,...state.rooms])if(item.departmentId!==undefined&&!ids.has(item.departmentId))throw Error('会话的部门不存在。');
}
async function sidebarSections(team,input={}){
  const {compareSidebarEntries}=await import('../renderer/sidebar-order.mjs');
  const edit=new StateEdit();let response;
  // Resolve references and mutate only inside the write queue. A failed save
  // rolls back this edit before another operation can see the tentative move.
  await team.save(()=>edit.rollback(),()=>{
    validateSidebarSections(team.state);
    const previous=team.state.sidebarSections||{departments:[],groupsCollapsed:false};
    const config=structuredClone(previous),action=input.action;
    const find=()=>{const section=config.departments.find(d=>d.id===input.departmentId);if(!section)throw Error('这个部门已被删除，请重新选择。');return section;};
    const unique=name=>{if(config.departments.some(d=>(action!=='rename'||d.id!==input.departmentId)&&d.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('已有同名部门。');return name;};
    const target=()=>{
      if(!['bot','room'].includes(input.kind)||!safeId(input.id))throw Error('请选择要移动的会话。');
      const item=(input.kind==='room'?team.state.rooms:team.state.bots).find(item=>item.id===input.id);
      if(!item)throw Error('这个会话已被移除。');
      if(input.kind==='bot'&&item.role==='Administrator')throw Error('主机器人固定在顶部，无需移至部门。');
      return item;
    };
    response={};
    if(action==='create'){
      if(config.departments.length>=MAX_DEPARTMENTS)throw Error('最多可以创建 100 个部门。');
      const section={id:randomUUID(),name:unique(departmentName(input.name)),collapsed:false};
      config.departments.push(section);
      if(input.kind!==undefined||input.id!==undefined){const item=target();edit.set(item,'departmentId',section.id);edit.delete(item,'sidebarOrder');response.placement={kind:input.kind,id:input.id,departmentId:section.id};}
      response.createdId=section.id;
    }else if(action==='move'){
      const item=target();if(input.departmentId!==null)find();
      if((item.departmentId||null)!==input.departmentId){
        if(input.departmentId===null)edit.delete(item,'departmentId');else edit.set(item,'departmentId',input.departmentId);
        edit.delete(item,'sidebarOrder');
        response.placement={kind:input.kind,id:input.id,departmentId:input.departmentId};
      }
      if(input.departmentId!==null)find().collapsed=false;
    }else if(action==='reorder'){
      const item=target();
      if(!['bot','room'].includes(input.targetKind)||!safeId(input.targetId)||typeof input.after!=='boolean')throw Error('无效的拖动位置。');
      const anchor=(input.targetKind==='room'?team.state.rooms:team.state.bots).find(row=>row.id===input.targetId);
      if(!anchor||input.targetKind==='bot'&&anchor.role==='Administrator')throw Error('主机器人固定在顶部，请选择其他位置。');
      if(item===anchor)throw Error('请选择其他会话作为排序位置。');
      if(!anchor.departmentId&&input.kind!==input.targetKind)throw Error('普通 Bot 和群聊各自保留默认分类，请拖到同类会话或部门。');
      if(Boolean(item.pinned)!==Boolean(anchor.pinned))throw Error('置顶会话保留在分类最上方，请在相同置顶状态的会话之间排序。');
      const departmentId=anchor.departmentId||null;
      const entries=[...team.state.bots.filter(b=>b.role!=='Administrator').map(item=>({kind:'bot',item})),...team.state.rooms.map(item=>({kind:'room',item}))]
        .filter(entry=>entry.item!==item&&(departmentId?entry.item.departmentId===departmentId:!entry.item.departmentId&&entry.kind===input.kind)).sort(compareSidebarEntries);
      const index=entries.findIndex(entry=>entry.item===anchor);if(index<0)throw Error('拖动目标已改变，请重试。');
      entries.splice(index+(input.after?1:0),0,{kind:input.kind,item});
      if(departmentId)edit.set(item,'departmentId',departmentId);else edit.delete(item,'departmentId');
      for(const [order,entry] of entries.entries())edit.set(entry.item,'sidebarOrder',order);
      response.placement={kind:input.kind,id:input.id,departmentId};
      response.order=entries.map(entry=>({kind:entry.kind,id:entry.item.id,sidebarOrder:entry.item.sidebarOrder}));
      if(departmentId)config.departments.find(d=>d.id===departmentId).collapsed=false;
    }else if(action==='rename')find().name=unique(departmentName(input.name));
    else if(action==='remove'){
      find();config.departments=config.departments.filter(d=>d.id!==input.departmentId);
      for(const item of [...team.state.bots,...team.state.rooms])if(item.departmentId===input.departmentId){edit.delete(item,'departmentId');edit.delete(item,'sidebarOrder');}
      response.removedDepartmentId=input.departmentId;
    }else if(action==='collapse'){
      if(typeof input.collapsed!=='boolean')throw Error('无效的折叠设置。');
      if(input.departmentId===null)config.groupsCollapsed=input.collapsed;else find().collapsed=input.collapsed;
    }else throw Error('无效的部门操作。');
    edit.set(team.state,'sidebarSections',config);response.sidebarSections=structuredClone(config);
  });
  return response;
}
module.exports={sidebarSections,validateSidebarSections};
