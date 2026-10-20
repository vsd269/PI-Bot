import {leaveMenu} from './interaction-motion.mjs';
import {el,icon} from './dom.mjs';

// Upstream context-menu.js opens at the pointer and clamps to the viewport.
// Keep listeners scoped to mount so reloading the plugin never duplicates them.
export function createContextMenu({app,run,onError}){
  let menu=null,origin=null;
  const close=(restoreFocus=false)=>{leaveMenu(menu);menu=null;if(restoreFocus&&origin?.isConnected)origin.focus({preventScroll:true});origin=null;};
  function open({x,y,label,groups,source,keyboard=false}){
    close();origin=source;menu=el('div','','bt-menu pi-context-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label',label);
    for(const [index,group] of groups.filter(g=>g.length).entries()){
      if(index){const line=el('div','','bt-menu-sep');line.setAttribute('role','separator');menu.append(line);}
      for(const item of group){
        const button=el('button','',item.danger?'bt-danger':'');button.type='button';button.tabIndex=-1;button.setAttribute('role','menuitem');button.append(icon(item.icon),el('span',item.label,'bt-menu-label'));
        button.onclick=()=>{
          if(item.danger&&!button.dataset.confirm){button.dataset.confirm='yes';button.querySelector('.bt-menu-label').textContent='再次点击确认删除';button.focus({preventScroll:true});return;}
          close();Promise.resolve().then(()=>run(item.action)).catch(onError);
        };menu.append(button);
      }
    }
    menu.addEventListener('contextmenu',event=>event.preventDefault());
    app.append(menu);const width=menu.offsetWidth,height=menu.offsetHeight;Object.assign(menu.style,{left:Math.max(8,Math.min(x,innerWidth-width-8))+'px',top:Math.max(8,Math.min(y,innerHeight-height-8))+'px'});
    if(keyboard)menu.querySelector('button')?.focus({preventScroll:true});
  }
  const outside=event=>{if(menu&&!event.composedPath().includes(menu))close();};
  const key=event=>{
    if(!menu)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const buttons=[...menu.querySelectorAll('button')],active=event.composedPath().find(n=>buttons.includes(n)),index=buttons.indexOf(active);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(index+1)%buttons.length:(index<0?buttons.length-1:(index-1+buttons.length)%buttons.length);buttons[next]?.focus({preventScroll:true});
  };
  const scroll=event=>{if(menu&&!event.composedPath().includes(menu))close();};
  const resized=()=>close();
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',scroll,true);app.addEventListener('scroll',scroll,true);window.addEventListener('resize',resized);
  return {open,close,dispose(){close();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',scroll,true);app.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resized);}};
}

export function revealScrollThumb(node){
  let timer;
  const scroll=()=>{node.dataset.scrolling='';clearTimeout(timer);timer=setTimeout(()=>{delete node.dataset.scrolling;},800);};
  node.addEventListener('scroll',scroll,{passive:true});
  return ()=>{clearTimeout(timer);node.removeEventListener('scroll',scroll);delete node.dataset.scrolling;};
}
