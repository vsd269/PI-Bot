import {morphHeight,createListMotion} from './interaction-motion.mjs';
import {el,icon} from './dom.mjs';

// Port of upstream NewChat: recipients first, then group admin and members.
// PI sessions use the plugin's existing room.save and outbox instead of DSH APIs.
export function createNewChat({host,trigger,getBots,avatar,openBot,openSettings,createRoom,send,onOpen,onError}){
  const pane=el('div','','bt-newchat pi-new-chat');
  pane.hidden=true;pane.setAttribute('role','dialog');pane.setAttribute('aria-label','新建聊天');
  const to=el('div','','bt-to'),label=el('span','发给：','bt-to-label'),tokens=el('span','','pi-recipients');
  const input=el('input');input.setAttribute('aria-label','收件人');
  const create=el('button','新建群聊','bt-send bt-to-create');create.type='button';
  const dismiss=el('button','×','bt-x');dismiss.type='button';dismiss.setAttribute('aria-label','关闭新建聊天');
  to.append(label,tokens,input,create,dismiss);
  const drop=el('div','','bt-drop'),list=el('div','','bt-drop-list');list.setAttribute('role','listbox');list.setAttribute('aria-label','收件人列表');drop.append(list);
  const error=el('div','','bt-error');error.setAttribute('role','alert');error.hidden=true;
  const composer=el('div','','bt-nc-compose'),card=el('div','','bt-nc-card'),plus=el('span','','bt-nc-plus');plus.append(icon('PlusIcon'));
  const message=el('textarea');message.rows=1;message.setAttribute('aria-label','新聊天消息');
  const submit=el('button','','bt-nc-send');submit.type='button';submit.setAttribute('aria-label','发送新聊天消息');submit.append(icon('ArrowUpIcon'));
  card.append(plus,message,submit);composer.append(card);pane.append(to,drop,el('div','','bt-nc-spacer'),error,composer);host.append(pane);
  let group=false,admin=null,picked=[],cursor=0,options=[],busy=false,epoch=0;
  const bots=()=>getBots(),byId=id=>bots().find(bot=>bot.id===id);
  function close(restoreFocus=false){epoch++;pane.hidden=true;trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();}
  function show(){if(!pane.hidden){close(true);return;}onOpen();group=false;admin=null;picked=[];cursor=0;busy=false;input.value='';message.value='';error.hidden=true;pane.hidden=false;trigger.setAttribute('aria-expanded','true');draw();input.focus();}
  function report(failure){error.textContent=failure.message||String(failure);error.hidden=false;onError?.(failure);}
  async function run(task){if(busy)return;const token=epoch;busy=true;error.hidden=true;draw();try{await task(token);}catch(failure){if(token===epoch)report(failure);}finally{if(token===epoch){busy=false;draw();}}}
  function startBot(){const name=input.value.trim();close();openSettings(name);}
  function pick(bot){if(group){if(admin===null)admin=bot.id;else picked.push(bot.id);input.value='';cursor=0;draw();input.focus();return;}const text=message.value;close();openBot(bot);if(text.trim())send({kind:'bot',id:bot.id},text);}
  async function makeGroup(token){if(!admin||!picked.length)return;const target=await createRoom({members:[admin,...picked],adminId:admin});if(token!==epoch)return;const text=message.value;close();openBot(target,'room');if(text.trim())send({kind:'room',id:target.id},text);}
  const listMotion=createListMotion(list);
  function draw(){morphHeight(drop,drawContent);}
  function drawContent(){
    const positions=listMotion.before();
    const choosing=group&&admin===null,wanted=input.value.trim().toLowerCase();
    input.placeholder=choosing?'选择群管理员':group?'想和谁聊…':'和谁聊…';
    tokens.replaceChildren();
    for(const id of [admin,...picked].filter(Boolean)){const bot=byId(id);if(!bot)continue;const chip=el('span','','bt-token'+(id===admin?' bt-token-admin':''));chip.append(avatar(bot,16,false,false),el('span',bot.name));if(id===admin){const star=el('span','','bt-admin-star');star.title='管理员';star.append(icon('StarLineIcon'));chip.append(star);}const remove=el('button','×');remove.type='button';remove.setAttribute('aria-label','移除 '+bot.name);remove.onclick=()=>{if(busy)return;if(id===admin)admin=null;else picked=picked.filter(value=>value!==id);draw();input.focus();};chip.append(remove);tokens.append(chip);}
    create.hidden=!group||admin===null;create.disabled=busy||!picked.length;create.textContent=busy?'正在创建…':'新建群聊';pane.setAttribute('aria-busy',String(busy));
    message.placeholder=admin?'发送给 '+[admin,...picked].map(byId).filter(Boolean).map(bot=>bot.name).join(' 和 '):'发送消息给 Bot';
    submit.disabled=busy||!message.value.trim()||!admin||!picked.length;
    input.disabled=message.disabled=busy;
    options=[];
    if(!group&&!wanted){options.push({label:'新建 Bot',ico:'PlusIcon',run:startBot},{label:'新建群聊',ico:'PeopleIcon',run:()=>{group=true;cursor=0;draw();input.focus();}});}
    for(const bot of bots().filter(bot=>(!group||!bot.private)&&bot.id!==admin&&!picked.includes(bot.id)&&(!wanted||[bot.name,bot.role].some(value=>String(value||'').toLowerCase().includes(wanted))))){options.push({label:bot.name,bot,hint:choosing?'设为管理员':group?'加入群聊':'',run:()=>pick(bot)});}
    if(!group&&wanted&&!bots().some(bot=>bot.name.toLowerCase()===wanted))options.push({label:'新建 Bot “'+input.value.trim()+'”',ico:'PlusIcon',run:startBot});
    cursor=Math.max(0,Math.min(cursor,options.length-1));list.replaceChildren();
    if(!options.length)list.append(el('div','没有匹配的 Bot','bt-hint'));
    options.forEach((option,index)=>{const button=el('button','','bt-option');button.type='button';button.dataset.id=option.bot?'bot:'+option.bot.id:option.label;button.disabled=busy;button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===cursor));if(option.bot)button.append(avatar(option.bot,22,false,false));else{const ico=el('span','','bt-option-icon');ico.append(icon(option.ico));button.append(ico);}button.append(el('span',option.label,'bt-option-label'));if(option.hint)button.append(el('span',option.hint,'bt-option-hint'));button.onmouseenter=()=>{cursor=index;for(const [i,row] of [...list.querySelectorAll('.bt-option')].entries())row.setAttribute('aria-selected',String(i===index));};button.onpointerdown=event=>event.preventDefault();button.onclick=()=>{if(!busy)option.run();};list.append(button);});
    listMotion.after(positions);drop.style.top=to.offsetHeight+'px';
  }
  input.oninput=()=>{cursor=0;draw();};
  input.onkeydown=event=>{if(event.isComposing||event.keyCode===229)return;if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();cursor=Math.max(0,Math.min(options.length-1,cursor+(event.key==='ArrowDown'?1:-1)));draw();list.querySelectorAll('.bt-option')[cursor]?.scrollIntoView({block:'nearest'});}else if(event.key==='Enter'){event.preventDefault();if(!busy)options[cursor]?.run();}else if(event.key==='Backspace'&&!input.value){if(picked.length)picked.pop();else admin=null;draw();}};
  message.oninput=()=>{message.style.height='34px';message.style.height=Math.min(140,message.scrollHeight)+'px';draw();};
  message.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(!event.repeat&&!submit.disabled)run(makeGroup);}};
  submit.onclick=create.onclick=()=>run(makeGroup);dismiss.onclick=()=>close(true);
  function escape(event){if(!pane.hidden&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}}
  window.addEventListener('keydown',escape,true);
  const resize=new ResizeObserver(()=>{if(!pane.hidden)drop.style.top=to.offsetHeight+'px';});resize.observe(to);
  return {show,close,dispose(){close();listMotion.dispose();resize.disconnect();window.removeEventListener('keydown',escape,true);pane.remove();}};
}
