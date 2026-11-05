import {el,icon} from './dom.mjs';
import {createContextMenu} from './context-menu.mjs';

// Categories only organize the sidebar. They never change group members,
// Bot permissions, tasks, or chat history.
export function createSidebarSections({app,list,getState,row,openRowMenu,save,onChange,notice:onNotice}){
  let closed=false,dialog=null,drag=null,suppressClickUntil=0,writes=Promise.resolve();
  const notice=value=>{if(!closed)onNotice(value);};
  const pendingCollapse=new Map();
  const config=()=>getState().sidebarSections||{departments:[],groupsCollapsed:false};
  const menu=createContextMenu({app,run:action=>{
    if(action.type==='create')return editName(null,action.target);
    if(action.type==='rename')return editName(action.departmentId);
    return change(action.input,action.message);
  },onError:error=>notice(error.message||String(error))});
  function receive(response){
    const state=getState();state.sidebarSections=response.sidebarSections;
    const itemAt=value=>(value.kind==='room'?state.rooms:state.bots).find(item=>item.id===value.id);
    if(response.removedDepartmentId)for(const item of [...state.bots,...state.rooms])if(item.departmentId===response.removedDepartmentId){delete item.departmentId;delete item.sidebarOrder;}
    if(response.placement){const item=itemAt(response.placement);if(item){if(response.placement.departmentId)item.departmentId=response.placement.departmentId;else delete item.departmentId;delete item.sidebarOrder;}}
    for(const value of response.order||[]){const item=itemAt(value);if(item)item.sidebarOrder=value.sidebarOrder;}
  }
  function change(input,message){
    const result=writes.catch(()=>{}).then(async()=>{
      const response=await save(input);if(closed)return;
      receive(response);onChange();if(message)notice(message);return response;
    });writes=result.catch(()=>{});return result;
  }
  function closeDialog(){if(dialog){dialog.close();dialog.remove();dialog=null;}}
  function editName(departmentId=null,target){
    closeDialog();const department=config().departments.find(d=>d.id===departmentId);
    if(departmentId&&!department)throw Error('这个部门已被删除。');
    const node=el('dialog','','pi-department-dialog'),form=el('form'),heading=el('h2',department?'重命名部门':'新建部门'),label=el('label','部门名称'),input=el('input'),hint=el('p',target?'创建后，会把当前会话移入这个部门。':'可以把 Bot 和群聊移到部门里，方便分类查找。','pi-department-hint'),status=el('p','','pi-department-status'),footer=el('footer'),cancel=el('button','取消'),submit=el('button',department?'保存':'创建');
    input.name='department';input.maxLength=60;input.required=true;input.value=department?.name||'';input.setAttribute('aria-label','部门名称');submit.type='submit';cancel.type='button';heading.id='pi-department-dialog-title';node.setAttribute('aria-labelledby',heading.id);status.setAttribute('role','status');label.append(input);footer.append(cancel,submit);form.append(heading,label,hint,status,footer);node.append(form);app.append(node);dialog=node;
    cancel.onclick=closeDialog;
    node.addEventListener('close',()=>{node.remove();if(dialog===node)dialog=null;});
    form.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;input.disabled=true;status.textContent='正在保存…';try{await change(department?{action:'rename',departmentId,name:input.value}:{action:'create',name:input.value,...target},department?'部门名称已更新。':'部门已创建。');if(node.isConnected)closeDialog();}catch(error){status.textContent=error.message||String(error);}finally{submit.disabled=false;input.disabled=false;}};
    node.showModal();input.focus();input.select();
  }
  const entry=(label,icon,action,extra={})=>({label,icon,action,...extra});
  function openMove(kind,id,source,x,y,keyboard=false){
    const item=(kind==='room'?getState().rooms:getState().bots).find(item=>item.id===id);if(!item)return;
    const target={kind,id},current=item.departmentId||null;
    menu.open({x,y,source,keyboard,label:'移至部门',groups:[
      [entry((current===null?'✓ ':'')+(kind==='room'?'群组聊天（默认）':'默认列表'),'FolderIcon',{input:{action:'move',...target,departmentId:null},message:'已移回默认分类。'},{disabled:current===null})],
      config().departments.map(section=>entry((section.id===current?'✓ ':'')+section.name,'FolderIcon',{input:{action:'move',...target,departmentId:section.id},message:'已移至“'+section.name+'”。'},{disabled:section.id===current})),
      [entry('新建部门…','PlusIcon',{type:'create',target})]
    ]});
  }
  function openSectionMenu(section,source,x,y,keyboard=false){
    menu.open({x,y,source,keyboard,label:section.name+' 部门操作',groups:[
      [entry('重命名部门','PencilIcon',{type:'rename',departmentId:section.id}),entry('新建部门…','PlusIcon',{type:'create'})],
      [entry('删除部门（保留会话）','TrashIcon',{input:{action:'remove',departmentId:section.id},message:'部门已删除，会话已移回默认分类。'},{danger:true})]
    ]});
  }
  function collapsed(id){return pendingCollapse.get(id)?.value??(id===null?config().groupsCollapsed:config().departments.find(d=>d.id===id)?.collapsed)??false;}
  function toggle(id){
    const pending={value:!collapsed(id)};pendingCollapse.set(id,pending);onChange();
    change({action:'collapse',departmentId:id,collapsed:pending.value}).catch(error=>notice('分类折叠未保存：'+error.message)).finally(()=>{if(pendingCollapse.get(id)===pending)pendingCollapse.delete(id);if(!closed)onChange();});
  }
  function clearDrop(){for(const node of list.querySelectorAll('[data-drop]'))delete node.dataset.drop;}
  function endDrag(){const active=Boolean(drag);drag=null;clearDrop();for(const node of list.querySelectorAll('[data-dragging]'))delete node.dataset.dragging;if(active&&!closed)onChange();}
  const dropError=error=>notice('没有移动会话：'+error.message);
  function decorateRow(entry){
    const node=row(entry.kind,entry.item),wrap=el('div','','pi-sidebar-row-wrap'),more=el('button','','pi-row-menu');
    more.type='button';more.draggable=false;more.setAttribute('aria-label',entry.item.name+' 操作');more.title='更多操作';more.append(icon('DotsIcon'));wrap.append(node,more);
    more.onclick=()=>{menu.close();const rect=more.getBoundingClientRect();openRowMenu(entry.kind,entry.item.id,more,rect.left,rect.bottom,true);};
    more.addEventListener('dragstart',event=>event.preventDefault());
    if(entry.kind==='bot'&&entry.item.role==='Administrator')return wrap;
    node.draggable=true;
    node.addEventListener('dragstart',event=>{if(!event.dataTransfer)return;menu.close();drag={kind:entry.kind,id:entry.item.id};node.dataset.dragging='';event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-pi-bot-sidebar',entry.kind+':'+entry.item.id);});
    node.addEventListener('dragend',endDrag);
    node.addEventListener('dragover',event=>{if(!drag||drag.id===entry.item.id&&drag.kind===entry.kind)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';clearDrop();node.dataset.drop=event.clientY<node.getBoundingClientRect().top+node.offsetHeight/2?'before':'after';});
    node.addEventListener('drop',event=>{if(!drag||!node.dataset.drop)return;event.preventDefault();event.stopPropagation();const input={action:'reorder',...drag,targetKind:entry.kind,targetId:entry.item.id,after:node.dataset.drop==='after'};suppressClickUntil=Date.now()+250;endDrag();change(input,'排序已保存。').catch(dropError);});
    return wrap;
  }
  function section(name,id,entries,custom){
    const wrap=el('section','','pi-sidebar-section'),header=el('div','','pi-section-header'),button=el('button','','pi-section-toggle'),count=el('span',String(entries.length),'pi-section-count'),body=el('div','','pi-section-rows'),isCollapsed=collapsed(id);
    wrap.dataset.sectionKey=id||'groups';wrap.toggleAttribute('data-collapsed',isCollapsed);button.type='button';button.setAttribute('aria-label',(isCollapsed?'展开':'收起')+name);button.setAttribute('aria-expanded',String(!isCollapsed));button.append(icon('ChevronRightIcon'),el('span',name,'pi-section-name'),count);button.onclick=()=>toggle(id);
    const unread=entries.filter(entry=>entry.item.unread).length;if(unread){const dot=el('span','','pi-section-unread');dot.title=unread+' 个会话未读';button.append(dot);}
    header.append(button);
    if(custom){const more=el('button','','pi-section-more');more.type='button';more.setAttribute('aria-label',name+' 部门操作');more.append(icon('DotsIcon'));more.onclick=()=>{const rect=more.getBoundingClientRect();openSectionMenu(custom,more,rect.left,rect.bottom,true);};header.append(more);header.oncontextmenu=event=>{event.preventDefault();openSectionMenu(custom,button,event.clientX,event.clientY);};}
    header.addEventListener('dragover',event=>{if(!drag)return;if(id===null&&drag.kind!=='room')return;event.preventDefault();event.dataTransfer.dropEffect='move';clearDrop();header.dataset.drop='into';});
    header.addEventListener('drop',event=>{if(!drag||header.dataset.drop!=='into')return;event.preventDefault();const input={action:'move',...drag,departmentId:id};suppressClickUntil=Date.now()+250;endDrag();change(input,'已移动到“'+name+'”。').catch(dropError);});
    body.append(...entries.map(decorateRow));if(!entries.length&&custom)body.append(el('p','右键会话 → 移至部门，也可直接拖到这里','pi-section-empty'));
    wrap.append(header,body);list.append(wrap);
  }
  function render(entries,{query=''}){
    const departments=config().departments,known=new Set(departments.map(d=>d.id));
    const unassigned=entries.filter(entry=>!known.has(entry.item.departmentId));
    for(const entry of unassigned.filter(entry=>entry.kind==='bot'))list.append(decorateRow(entry));
    const rooms=unassigned.filter(entry=>entry.kind==='room');if(rooms.length)section('群组聊天',null,rooms);
    for(const department of departments){const items=entries.filter(entry=>entry.item.departmentId===department.id);if(query&&!items.length)continue;section(department.name,department.id,items,department);}
    // Search must reveal matching chats even if their department is folded.
    if(query)for(const wrap of list.querySelectorAll('.pi-sidebar-section')){wrap.removeAttribute('data-collapsed');const toggle=wrap.querySelector('.pi-section-toggle');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','收起'+wrap.querySelector('.pi-section-name').textContent);}
  }
  const preventDragClick=event=>{if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}};
  list.addEventListener('click',preventDragClick,true);
  return {render,openMove,dragging:()=>Boolean(drag),reveal(kind,id){const item=(kind==='room'?getState().rooms:getState().bots).find(item=>item.id===id);if(!item||kind==='bot'&&item.role==='Administrator')return;const sectionId=item.departmentId||null;if((sectionId||kind==='room')&&collapsed(sectionId))toggle(sectionId);},newDepartment:()=>editName(),closeMenu:()=>menu.close(),dispose(){closed=true;endDrag();menu.dispose();closeDialog();list.removeEventListener('click',preventDragClick,true);}};
}
