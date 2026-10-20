import {leaveMenu} from './interaction-motion.mjs';
import {el} from './dom.mjs';
// The same compact trigger and grouped menu used by the upstream settings.
export function createSettingsPickers({app,$,workspaces}){
  let openMenu=null,trigger=null;
  const close=()=>{leaveMenu(openMenu);openMenu=null;trigger?.setAttribute('aria-expanded','false');trigger=null;};
  const triggerButton=(label)=>{const b=el('button','','bt-model-trigger');b.type='button';b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');b.setAttribute('aria-label',label);return b;};
  const text=(button,name,sub)=>{const copy=el('span','','bt-model-copy');copy.append(el('span',name,'bt-model-name'));if(sub)copy.append(el('span',sub,'bt-model-provider'));button.replaceChildren(copy,el('span','⌄','bt-model-caret'));};
  function show(button,label){
    close();trigger=button;button.setAttribute('aria-expanded','true');const menu=el('div','','bt-menu bt-model-menu pi-settings-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label',label);(button.closest('dialog[open]')||app).append(menu);openMenu=menu;
    const rect=button.getBoundingClientRect(),width=Math.min(300,innerWidth-16),below=innerHeight-rect.bottom;Object.assign(menu.style,{position:'fixed',width:width+'px',left:Math.max(8,Math.min(rect.right-width,innerWidth-width-8))+'px',maxHeight:Math.max(100,Math.min(400,Math.max(below,rect.top)-16))+'px'});
    if(below>250||below>=rect.top)menu.style.top=rect.bottom+4+'px';else menu.style.bottom=innerHeight-rect.top+4+'px';return menu;
  }
  function choice(menu,label,selected,run,sub=''){
    const b=el('button');b.type='button';b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(selected));const copy=el('span','','bt-folder-copy');copy.append(el('span',label,'bt-menu-label'));if(sub)copy.append(el('span',sub,'bt-folder-path'));const tick=el('span',selected?'✓':'','bt-model-tick'+(selected?' bt-pop-in':''));tick.setAttribute('aria-hidden','true');b.append(copy,tick);b.onclick=()=>{close();run();};menu.append(b);
  }
  const model=$('bot-model'),thinking=$('bot-thinking'),modelButton=triggerButton('选择模型与思考强度');model.after(modelButton);model.hidden=true;thinking.closest('label').hidden=true;
  const updateModel=()=>{const selected=model.selectedOptions[0];modelButton.disabled=!selected||selected.disabled;text(modelButton,selected?.textContent||'正在读取模型…',thinking.value&&thinking.value!=='off'?'思考强度 · '+thinking.value:'');modelButton.title=selected?.value||'使用 PI 默认模型';};
  modelButton.onclick=()=>{if(openMenu&&trigger===modelButton){close();return;}const menu=show(modelButton,'模型与思考强度');let provider='';
    for(const option of model.options){const name=option.dataset.provider||'PI 模型';if(name!==provider){provider=name;menu.append(el('div',provider,'bt-model-group'));}choice(menu,option.textContent,option.value===model.value,()=>{model.value=option.value;model.dispatchEvent(new Event('change'));updateModel();});}
    if(thinking.options.length>1){menu.append(el('div','','bt-menu-sep'),el('div','思考强度','bt-model-group'));for(const option of thinking.options)choice(menu,option.textContent,option.value===thinking.value,()=>{thinking.value=option.value;thinking.dispatchEvent(new Event('change'));updateModel();});}
  };
  model.addEventListener('change',updateModel);thinking.addEventListener('change',updateModel);
  const folderButtons=new Map();
  const folderName=value=>String(value).replace(/[\\/]+$/,'').split(/[\\/]/).pop()||value;
  for(const kind of ['bot','room']){
    const field=$(kind+'-work-dir'),button=triggerButton(kind==='bot'?'选择机器人工作文件夹':'选择群聊工作文件夹');field.after(button);field.hidden=true;field.closest('label').classList.remove('bt-bs-stack');folderButtons.set(kind,{field,button});
    button.onclick=async()=>{if(openMenu&&trigger===button){close();return;}const menu=show(button,'工作文件夹');choice(menu,'当前 PI 工作区',!field.value,()=>choose(''));
      const type=el('button','输入路径…');type.type='button';type.onclick=()=>{menu.replaceChildren();const back=el('button','‹ 返回'),entry=el('input','','bt-folder-input'),use=el('button','使用此文件夹');back.type=use.type='button';entry.value=field.value;entry.setAttribute('aria-label','完整文件夹路径');entry.placeholder='完整文件夹路径';back.onclick=()=>{close();button.click();};use.onclick=()=>{if(entry.value.trim())choose(entry.value.trim());};entry.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();use.click();}};menu.append(back,entry,use);entry.focus();};
      menu.append(type);
      function choose(value){close();field.value=value;field.dispatchEvent(new Event('blur'));updateFolders();}
      try{const view=await workspaces();if(menu!==openMenu)return;const paths=[...new Set([field.value,view.current,...(view.projects||[]).map(p=>p.path)].filter(Boolean))];if(paths.length){const group=el('div','文件夹','bt-model-group');type.before(group);for(const value of paths){const holder=el('div');choice(holder,folderName(value),field.value===value,()=>choose(value),value);type.before(...holder.children);}}}catch{}
    };
  }
  function updateFolders(){for(const {field,button} of folderButtons.values()){text(button,field.value?folderName(field.value):'当前 PI 工作区',field.value||'');button.title=field.value||'使用当前 PI 工作区';}}
  const outside=event=>{const nodes=event.composedPath();if(openMenu&&!nodes.includes(openMenu)&&!nodes.includes(trigger))close();};
  const escape=event=>{if(event.key==='Escape'&&openMenu){event.preventDefault();event.stopPropagation();const prior=trigger;close();prior?.focus();}};
  const scroll=event=>{if(openMenu&&!event.composedPath().includes(openMenu))close();};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);app.addEventListener('scroll',scroll,true);
  return {update(){updateModel();updateFolders();},close,dispose(){close();document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true);app.removeEventListener('scroll',scroll,true);}};
}
