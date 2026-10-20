import {leaveMenu,aboutContent} from './interaction-motion.mjs';
import {el,icon} from './dom.mjs';
import {detailUsageLabel} from './usage-label.mjs';
const folderName=value=>String(value).replace(/[\\/]+$/,'').split(/[\\/]/).pop()||value;
export function createDetailsPreview({app,body,tabs,getState,getSelection,call,patch,setPermission,openSettings,openNative,openBrowser,openMemory,openSchedules,openUsage,isActive}){
  let key='',tab='details',fingerprint='',menu=null,anchor=null,disposed=false;
  let models=null,workspaces=null,catalogPending=false,catalogAt=0;
  const previews=new Map(),pending=new Set();
  const permissionPending=new Map(),openAbout=new Set();
  const safe=action=>()=>Promise.resolve().then(action).catch(()=>{});
  function close(){leaveMenu(menu);menu=null;anchor?.setAttribute('aria-expanded','false');anchor=null;}
  function button(label,cls,action){const b=el('button',label,cls);b.type='button';b.onclick=safe(action);return b;}
  function section(label,node){const box=el('div');box.append(el('div',label,'bt-section-title'),node);return box;}
  function card(label,sub,action,aria){const b=button('','bt-model-trigger',action);b.dataset.wide='';b.setAttribute('aria-label',aria);b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');const copy=el('span','','bt-model-copy');copy.append(el('span',label,'bt-model-name'));if(sub)copy.append(el('span',sub,'bt-model-provider'));b.append(copy,el('span','⌄','bt-model-caret'));return b;}
  function showMenu(trigger,label){
    if(anchor===trigger){close();return null;}close();anchor=trigger;trigger.setAttribute('aria-expanded','true');menu=el('div','','bt-menu bt-model-menu pi-settings-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label',label);app.append(menu);
    const r=trigger.getBoundingClientRect(),width=Math.min(300,innerWidth-16),below=innerHeight-r.bottom;
    Object.assign(menu.style,{position:'fixed',width:width+'px',left:Math.max(8,Math.min(r.right-width,innerWidth-width-8))+'px',maxHeight:Math.max(100,Math.min(400,Math.max(below,r.top)-16))+'px'});
    if(below>250||below>=r.top)menu.style.top=r.bottom+4+'px';else menu.style.bottom=innerHeight-r.top+4+'px';return menu;
  }
  function choice(target,label,checked,action,sub=''){
    const b=button('','',()=>{close();return action();});b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(checked));const copy=el('span','','bt-folder-copy');copy.append(el('span',label,'bt-menu-label'));if(sub)copy.append(el('span',sub,'bt-folder-path'));b.append(copy,el('span',checked?'✓':'','bt-model-tick'+(checked?' bt-pop-in':'')));target.append(b);
  }
  function modelMenu(trigger,item){
    const target=showMenu(trigger,'选择模型');if(!target)return;
    choice(target,'使用 PI 默认模型',!item.modelKey,()=>patch(item.id,{modelKey:''}));
    if(models===null){target.append(el('div','模型读取失败，请重开详情重试','bt-note'));return;}
    let provider='';for(const model of models){const group=model.providerName||model.providerId||'PI 模型';if(provider!==group){provider=group;target.append(el('div',group,'bt-model-group'));}choice(target,model.alias||model.label||String(model.key).split('/').pop(),item.modelKey===model.key,()=>patch(item.id,{modelKey:model.key}));}
  }
  function folderMenu(trigger,item){
    const target=showMenu(trigger,'工作文件夹');if(!target)return;
    choice(target,'当前 PI 工作区',!item.workDir,()=>patch(item.id,{workDir:''}));
    const paths=[...new Set([item.workDir,workspaces?.current,...(workspaces?.projects||[]).map(p=>p.path)].filter(Boolean))];
    for(const path of paths)choice(target,folderName(path),item.workDir===path,()=>patch(item.id,{workDir:path}),path);
    target.append(button('输入路径…','',()=>{target.replaceChildren();const entry=el('input','','bt-folder-input'),use=button('使用此文件夹','',()=>{const value=entry.value.trim();if(value){close();return patch(item.id,{workDir:value});}});entry.value=item.workDir||'';entry.setAttribute('aria-label','完整文件夹路径');entry.placeholder='完整文件夹路径';entry.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();use.click();}};target.append(entry,use);entry.focus();}));
  }
  function load(item){
    const now=Date.now();if(!catalogPending&&now-catalogAt>30000){catalogPending=true;catalogAt=now;Promise.allSettled([call('team.models',{}),call('team.workspaces',{})]).then(([m,w])=>{catalogPending=false;if(disposed)return;models=m.status==='fulfilled'&&Array.isArray(m.value)?m.value:null;workspaces=w.status==='fulfilled'?w.value:null;renderCurrent();});}
    const saved=previews.get(item.id);if(!pending.has(item.id)&&(!saved||now-saved.at>15000)){pending.add(item.id);call('team.bot.preview',{botId:item.id}).then(value=>{if(!disposed){previews.set(item.id,{...value,at:Date.now()});renderCurrent();}},()=>{if(!disposed)previews.set(item.id,{at:Date.now(),permissionStatus:'unavailable'});}).finally(()=>pending.delete(item.id));}
  }
  function renderCurrent(){if(!isActive())return;const selection=getSelection();if(selection?.kind==='bot'){const item=getState().bots.find(b=>b.id===selection.id);if(item)render(item);} }
  function setTab(next){if(tab===next)return;close();tab=next;fingerprint='';renderCurrent();body.dataset.move='tab';}
  function render(item){
    if(disposed)return;const selection=getSelection();if(selection?.kind!=='bot'||selection.id!==item.id)return;
    if(key!==item.id){key=item.id;tab='details';fingerprint='';close();}
    load(item);const state=getState(),preview=previews.get(item.id),usage=state.usageSummaries?.['bot:'+item.id],tasks=(state.schedules?.tasks||[]).filter(t=>t.targetKind==='bot'&&t.targetId===item.id&&t.enabled);
    const next=JSON.stringify([item.modelKey,item.workDir,item.instructions,item.name,item.role,item.agentMode,item.permissionMode,permissionPending.get(item.id),preview?.permissionMode,preview?.permissionStatus,preview?.memoryCount,models,workspaces,usage,tasks,tab]);
    if(next===fingerprint)return;if(menu)return;fingerprint=next;
    tabs.hidden=false;tabs.replaceChildren();tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','机器人详情');
    for(const [value,label] of [['details','详情'],['browser','浏览器']]){const b=button(label,'bt-tab',()=>setTab(value));b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===value));b.setAttribute('aria-controls','detail-body');b.id='preview-tab-'+value;b.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setTab(event.key==='Home'?'details':event.key==='End'?'browser':tab==='details'?'browser':'details');tabs.querySelector('[aria-selected=true]')?.focus();}};tabs.append(b);}
    body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby','preview-tab-'+tab);body.replaceChildren();
    if(tab==='browser'){
      const box=el('div','','pi-browser-card');box.append(icon('GlobeIcon'),el('div','Bot 独立浏览器','pi-preview-heading'),el('div','此 Bot 单独保存登录状态，支持网页读取与操作。','bt-note'),button('打开独立浏览器','bt-soft bt-soft-sm',()=>openBrowser(item)),button('打开 PI 原生会话','bt-soft bt-soft-sm',()=>openNative(item)));body.append(box);return;
    }
    const model=models?.find(m=>m.key===item.modelKey)||(item.modelKey?null:models?.find(m=>m.isDefault)||models?.[0]);
    let modelButton;modelButton=card(model?.alias||model?.label||String(model?.key||'').split('/').pop()||(item.modelKey?item.modelKey.split('/').at(-1):models===null?'正在读取模型…':'使用 PI 默认模型'),model?.providerName||model?.providerId||'',()=>modelMenu(modelButton,item),'选择机器人模型');body.append(section('模型',modelButton));
    if(models===null&&!catalogPending)modelButton.querySelector('.bt-model-name').textContent='模型读取失败，点击重试';
    if(models===null)modelButton.onclick=safe(()=>{catalogAt=0;load(item);});
    const planner=item.role==='Administrator'&&item.agentMode!=='agent';
    const permissions=el('div','','bt-drawer-permission'),permission=el('div','','bt-seg pi-bot-permissions');permission.setAttribute('role','group');permission.setAttribute('aria-label','机器人权限');
    const selectedMode=permissionPending.get(item.id)??preview?.permissionMode??'inherit';
    async function choosePermission(value){
      if(permissionPending.has(item.id))return;permissionPending.set(item.id,value);renderCurrent();
      try{await setPermission(item.id,value);previews.delete(item.id);}
      finally{permissionPending.delete(item.id);fingerprint='';renderCurrent();}
    }
    for(const [value,label,hint] of [['ask','操作前询问','PI 原生审批模式；敏感操作需确认，并非文件系统只读沙箱。'],['accept-edits','自动接受编辑','PI 自动接受编辑；其他敏感工具仍按 PI 策略审批，并非工作目录隔离。'],['auto','自动批准','PI 自动批准工具操作，请仅为信任的任务启用。']]){
      const b=button(label,value==='auto'?'bt-perm-danger':'',()=>choosePermission(value));b.dataset.mode=value;b.title=hint;b.setAttribute('aria-pressed',String(selectedMode===value));b.disabled=permissionPending.has(item.id);permission.append(b);
    }
    const inherit=button(selectedMode==='inherit'?'当前：跟随 PI 设置':'恢复跟随 PI 设置','bt-more pi-permission-inherit',()=>choosePermission('inherit'));inherit.disabled=permissionPending.has(item.id);permissions.append(permission,inherit);permissions.append(el('div','此处显示当前私聊会话的权限。主动选择后应用到已有会话，由 PI 确认；新会话按 PI 默认权限开始，发消息不会自动改权限。','bt-note'));
    if(planner)permissions.append(el('div','管理员当前仅分派任务；执行任务时使用此权限。','bt-note'));
    body.append(section('权限',permissions));
    let folder;folder=card(item.workDir?folderName(item.workDir):'当前 PI 工作区','',()=>folderMenu(folder,item),'选择机器人工作文件夹');folder.title=item.workDir||workspaces?.current||'跟随 PI 当前工作区';body.append(section('工作文件夹',folder));
    if(item.instructions)body.append(section('说明',aboutContent(item.instructions,{open:openAbout.has(item.id),onToggle:value=>value?openAbout.add(item.id):openAbout.delete(item.id)})));else body.append(button('在 Bot 设置里添加说明','bt-more',()=>openSettings(item)));
    const memory=button('','bt-mem-row',()=>openMemory(item)),copy=el('span','','bt-mem-row-copy'),go=el('span','管理','bt-mem-row-go');copy.textContent=Number.isFinite(preview?.memoryCount)?preview.memoryCount?preview.memoryCount+' 条':'尚未保存':'查看记忆';go.append(icon('ChevronRightIcon'));memory.append(icon('MemoryIcon'),copy,go);body.append(section('记忆',memory));
    const usageRow=button('','bt-kv pi-preview-usage',openUsage),stats=detailUsageLabel(usage);usageRow.title=stats;usageRow.append(el('span',item.name),el('span',stats));body.append(section('用量',usageRow));
    const schedules=el('div','','bt-task-list');if(tasks.length){for(const task of tasks.slice(0,3)){const b=button('','bt-task-line',()=>openSchedules(item));b.append(icon('ClockIcon'),el('span',task.title,'bt-task-line-title'));schedules.append(b);}}else schedules.append(button('还没有定时任务，添加一个','bt-more',()=>openSchedules(item)));body.append(section('定时任务',schedules));
  }
  const outside=e=>{if(menu&&!e.composedPath().includes(menu)&&!e.composedPath().includes(anchor)){close();renderCurrent();}};
  const escape=e=>{if(e.key==='Escape'&&menu){e.preventDefault();e.stopPropagation();const prior=anchor;close();renderCurrent();prior?.focus();}};
  const scroll=e=>{if(menu&&!e.composedPath().includes(menu)){close();renderCurrent();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);app.addEventListener('scroll',scroll,true);
  return {render,close,reset(){key='';fingerprint='';close();},preview:id=>previews.get(id),dispose(){disposed=true;close();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);app.removeEventListener('scroll',scroll,true);}};
}
