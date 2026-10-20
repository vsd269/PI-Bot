import {el,icon} from './dom.mjs';
export const SETTINGS_PAGES=[['general','通用','GearIcon'],['bots','Bot','PeopleIcon'],['groups','群聊','ChatsIcon'],['connectors','连接器','ConnectorIcon'],['capabilities','能力','PlugIcon'],['schedules','定时任务','ClockIcon'],['usage','用量','GaugeIcon'],['secrets','密钥','KeyIcon'],['feedback','反馈','FeedbackIcon'],['about','关于 PI Bot','InfoIcon']];
// Same structure and CSS classes as upstream SettingsDialog (198px navigation,
// fixed header, independently scrolling content, wide Usage page).
export function createSettingsShell({app,onNavigate,onNative,onLeave}){
  const dialog=el('dialog','','feature-dialog bt-settings pi-settings'),nav=el('nav','','bt-settings-nav'),main=el('div','','bt-settings-main'),head=el('header','','bt-settings-head'),title=el('h2'),body=el('div','','feature-body bt-settings-scroll bt-settings-page'),back=el('button','','bt-icon-btn'),close=el('button','','bt-settings-close'),thumb=el('span','','bt-thumb');
  dialog.setAttribute('aria-label','PI Bot 设置');nav.setAttribute('aria-label','设置页面');thumb.setAttribute('aria-hidden','true');nav.append(thumb);nav.dataset.glide='';
  let route='general',revision=0,closeAnimation,disposed=false,depth=0,enterTimer;
  const buttons=new Map();
  for(const [id,label,glyph] of SETTINGS_PAGES){const b=el('button',label,'bt-settings-item');b.type='button';b.dataset.page=id;b.prepend(icon(glyph));b.onclick=()=>onNavigate(id);nav.append(b);buttons.set(id,b);}
  const native=el('button','PI-Desktop 设置','bt-settings-item bt-settings-shell');native.type='button';native.prepend(icon('SlidersIcon'));native.onclick=()=>{dialog.close();onNative();};nav.append(native);
  const status=el('div','','pi-settings-status');status.setAttribute('role','status');status.hidden=true;back.type=close.type='button';back.hidden=true;back.append(icon('ChevronLeftIcon'));close.append(icon('CloseIcon'));close.setAttribute('aria-label','关闭设置');close.onclick=closeDialog;head.append(back,title);main.append(head,status,body);dialog.append(nav,main,close);app.append(dialog);
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function selectRoute(page){route=page;dialog.dataset.page=page;dialog.toggleAttribute('data-wide',true);for(const [id,b] of buttons)id===page?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');}
  function show(name,page=route,options={}){
    const nextDepth=options.back?1:0,move=options.move||(nextDepth>depth?'in':nextDepth<depth?'out':'up');depth=nextDepth;
    revision++;closeAnimation?.cancel();onLeave?.();selectRoute(page);title.textContent=name;status.hidden=true;body.replaceChildren();body.scrollTop=0;body.dataset.move=move;back.hidden=!options.back;back.setAttribute('aria-label',page==='bots'?'返回 Bot 列表':page==='groups'?'返回群聊列表':'返回');back.onclick=options.back;
    if(!dialog.open){dialog.showModal();depth=nextDepth;dialog.dataset.entering='';clearTimeout(enterTimer);enterTimer=setTimeout(()=>{delete dialog.dataset.entering;},420);}
    return revision;
  }
  function closeDialog(){if(!dialog.open)return;const ticket=++revision;closeAnimation?.cancel();if(reduced()){dialog.close();return;}closeAnimation=dialog.animate([{opacity:1,transform:'translateY(0) scale(1)',filter:'blur(0)'},{opacity:0,transform:'translateY(6px) scale(.975)',filter:'blur(3px)'}],{duration:160,easing:'cubic-bezier(.4,0,1,1)',fill:'both'});closeAnimation.finished.then(()=>{if(ticket!==revision)return;dialog.close();closeAnimation.cancel();closeAnimation=null;},()=>{});}
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});dialog.addEventListener('close',()=>{revision++;onLeave?.();});
  return {dialog,body,title,show,closeDialog,notify(text){status.textContent=text;status.hidden=!text;},route:()=>route,isOpen:()=>dialog.open,dispose(){disposed=true;clearTimeout(enterTimer);revision++;closeAnimation?.cancel();onLeave?.();dialog.remove();}};
}
