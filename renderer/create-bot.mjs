import {el,icon} from './dom.mjs';
import {avatarEditor,mark} from './avatar-editor.mjs';
import {lookOf,MAIN_LOOK} from './upstream/characters.mjs';
import {nameProblem} from './upstream/mentions.mjs';

// The upstream CreateBot is a conversation pane, separate from Bot settings.
export function createBotPage({host,getBots,models,create,onCreated,onOpen,onBack,notice}){
  const pane=el('section','','bt-create pi-create-bot');pane.hidden=true;
  pane.setAttribute('role','dialog');pane.setAttribute('aria-label','创建 Bot');
  const head=el('div','','bt-create-head'),back=el('button','','bt-icon-btn'),closeButton=el('button','','bt-icon-btn');
  for(const [button,label,ico] of [[back,'返回新建聊天','ChevronLeftIcon'],[closeButton,'关闭创建 Bot','CloseIcon']]){button.type='button';button.setAttribute('aria-label',label);button.append(icon(ico));}
  head.append(back,el('span','创建 Bot','bt-create-title'),closeButton);
  const body=el('div','','bt-create-body'),card=el('form','','bt-create-card');
  const preview=el('div','','bt-create-preview'),picture=el('span','','bt-create-pop'),title=el('span','','bt-create-name');preview.append(picture,title);
  const looks=el('div','','bt-create-looks'),nameField=el('label','','bt-field'),name=el('input','','bt-input');
  name.maxLength=200;name.setAttribute('aria-label','新 Bot 名称');nameField.append(el('span','名字','bt-field-label'),name);
  const modelField=el('label','','bt-field'),model=el('select','','bt-input');model.setAttribute('aria-label','新 Bot 模型');modelField.append(el('span','模型','bt-field-label'),model,el('span','Bot 会使用这个模型，以后可以在详情里修改。','bt-note'));
  const error=el('div','','bt-error');error.setAttribute('role','alert');error.hidden=true;
  const footer=el('div','','bt-create-foot'),cancel=el('button','后退','bt-soft'),submit=el('button','创建','bt-send bt-create-go');cancel.type='button';submit.type='submit';footer.append(cancel,submit);
  card.append(preview,el('div','形象','bt-create-step'),looks,nameField,modelField,error,footer);body.append(card);pane.append(head,body);host.append(pane);
  let draft,editor,revision=0,busy=false;
  function fallback(){let next='新 Bot',n=2;while(getBots().some(bot=>bot.name.toLowerCase()===next.toLowerCase()))next='新 Bot '+n++;return next;}
  function paint(){
    const finalName=name.value.trim()||name.placeholder;title.textContent=finalName;
    picture.replaceChildren(mark(lookOf(draft),88,true,{id:'new-bot',gaze:true,pokeable:true}));
    const problem=nameProblem(finalName)||(getBots().some(bot=>bot.name.toLowerCase()===finalName.toLowerCase())?'这个名字已被使用，请换一个。':'');
    error.textContent=problem||'';error.hidden=!problem;submit.disabled=busy||Boolean(problem);
  }
  function close(){revision++;pane.hidden=true;editor?.dispose();editor=null;looks.replaceChildren();}
  function backToChat(){if(busy)return;close();onBack();}
  function show(start=''){
    if(busy)return;
    notice('');onOpen();close();const token=revision;
    draft={role:'Worker',instructions:'',modelKey:'',avatar:{shape:MAIN_LOOK.shape},color:MAIN_LOOK.color};
    name.value=start;name.placeholder=fallback();model.replaceChildren();const option=el('option','使用 PI 默认模型');option.value='';model.append(option);model.disabled=false;
    editor=avatarEditor({bot:draft,anchor:looks,onClose:()=>{},onError:message=>notice(message),onSave:patch=>{Object.assign(draft,patch);paint();}});
    editor.node.setAttribute('role','group');editor.node.setAttribute('aria-label','新 Bot 形象');looks.append(editor.node);
    pane.hidden=false;paint();body.scrollTop=0;name.focus();
    models().then(catalog=>{
      if(pane.hidden||token!==revision)return;
      for(const item of catalog){const option=el('option',(item.alias||item.label||String(item.key).split('/').pop())+(item.providerName?' · '+item.providerName:''));option.value=item.key;option.title=item.key;model.append(option);}
    }).catch(()=>{if(!pane.hidden&&token===revision)notice('模型列表读取失败，仍可使用 PI 默认模型创建 Bot。');});
  }
  name.oninput=paint;back.onclick=cancel.onclick=backToChat;closeButton.onclick=()=>{if(!busy)close();};
  card.onsubmit=async event=>{
    event.preventDefault();if(busy)return;paint();if(submit.disabled)return;
    busy=true;submit.disabled=true;submit.textContent='创建中…';name.disabled=model.disabled=cancel.disabled=back.disabled=closeButton.disabled=true;looks.inert=true;
    const token=revision;
    try{
      const bot=await create({...draft,name:name.value.trim()||name.placeholder,modelKey:model.value});
      if(token!==revision)return;close();onCreated(bot);
    }catch(failure){if(token===revision){error.textContent=failure.message||String(failure);error.hidden=false;}}
    finally{busy=false;submit.textContent='创建';submit.disabled=false;name.disabled=model.disabled=cancel.disabled=back.disabled=closeButton.disabled=false;looks.inert=false;}
  };
  const escape=event=>{if(!pane.hidden&&event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();close();}};
  window.addEventListener('keydown',escape,true);
  return {show,close,isOpen:()=>!pane.hidden,dispose(){close();window.removeEventListener('keydown',escape,true);pane.remove();}};
}
