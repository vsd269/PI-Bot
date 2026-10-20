import {el,icon} from './dom.mjs';
// Observe the scroll viewport, not unread counts: the hint only appears when
// a currently rendered unread conversation is below the visible list.
export function sidebarUnread(list){
 const button=el('button','','pi-sidebar-unread');button.type='button';button.hidden=true;button.append(icon('ArrowDownIcon'),el('span','更多未读消息'));list.parentElement.append(button);
 let frame=0,closed=false,next=null;
 const update=()=>{frame=0;if(closed)return;const box=list.getBoundingClientRect();next=[...list.querySelectorAll('[data-id]')].find(row=>row.querySelector('.bt-unread')&&row.getBoundingClientRect().top>=box.bottom-1);button.hidden=!next||box.height===0;};
 const schedule=()=>{if(!frame&&!closed)frame=requestAnimationFrame(update);};
 button.onclick=()=>{if(next)list.scrollTo({top:list.scrollTop+next.getBoundingClientRect().top-list.getBoundingClientRect().top-12,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 list.addEventListener('scroll',schedule,{passive:true});const size=new ResizeObserver(schedule),changes=new MutationObserver(schedule);size.observe(list);changes.observe(list,{childList:true,subtree:true});schedule();
 return ()=>{closed=true;cancelAnimationFrame(frame);size.disconnect();changes.disconnect();list.removeEventListener('scroll',schedule);button.remove();};
}
