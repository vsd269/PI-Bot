import {el,icon} from './dom.mjs';

// Track reply identities, not renders or streaming chunks. Existing history is
// the baseline on each selection; only replies arriving while detached count.
export function createTranscriptNavigation({scroller,transcript,composer}){
  const chip=el('div','','bt-news pi-bot-to-bottom'),jump=el('button','','bt-news-jump'),label=el('span'),dismiss=el('button','','bt-news-x');
  chip.hidden=true;chip.dataset.direction='down';jump.type=dismiss.type='button';
  const glyph=el('span','','bt-news-ico');glyph.append(icon('ArrowDownIcon'));jump.append(glyph,label);dismiss.append(icon('CloseIcon'));dismiss.setAttribute('aria-label','忽略新消息提示');chip.append(jump,dismiss);composer.append(chip);
  let selection,known=new Set(),unread=new Set(),pinned=true,jumping=false,frame=0,closed=false,lastTop=0;
  const atBottom=()=>scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<=24;
  function paint(){
    chip.hidden=pinned||scroller.scrollHeight<=scroller.clientHeight+24;
    chip.dataset.unread=String(unread.size);dismiss.hidden=!unread.size;
    label.textContent=unread.size?unread.size+' 条新消息':'';
    jump.setAttribute('aria-label',unread.size?unread.size+' 条新消息 · 回到底部':'回到底部');
    jump.title=jump.getAttribute('aria-label');
  }
  function latest(){jumping=true;pinned=true;unread.clear();scroller.scrollTo({top:scroller.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});paint();}
  jump.onclick=latest;dismiss.onclick=()=>{unread.clear();paint();};
  function onScroll(){const top=scroller.scrollTop;if(jumping&&top<lastTop-1)jumping=false;lastTop=top;if(jumping){if(!atBottom())return;jumping=false;}pinned=atBottom();if(pinned)unread.clear();paint();}
  const interrupt=()=>{jumping=false;};
  for(const event of ['wheel','pointerdown','keydown'])scroller.addEventListener(event,interrupt,{passive:true});
  scroller.addEventListener('scroll',onScroll,{passive:true});
  const observer=new ResizeObserver(()=>{if(!frame&&!closed)frame=requestAnimationFrame(()=>{frame=0;if(pinned)scroller.scrollTop=scroller.scrollHeight;paint();});});
  observer.observe(scroller);observer.observe(transcript);
  return {
    beforeRender(key,lines){
      const keys=new Set(lines.filter(l=>l.who!=='User'&&l.navigationReply!==false&&String(l.text||'').trim()).map((l,i)=>String(l.id??l.at+':'+l.who+':'+i)));
      if(key!==selection){selection=key;known=keys;unread.clear();pinned=true;jumping=false;}
      else{if(!pinned)for(const id of keys)if(!known.has(id))unread.add(id);for(const id of keys)known.add(id);}
      return {pinned,top:scroller.scrollTop};
    },
    afterRender(view){scroller.scrollTop=view.pinned?scroller.scrollHeight:view.top;paint();},
    latest,
    reveal(node){jumping=false;pinned=false;node.scrollIntoView({block:'center',behavior:'instant'});lastTop=scroller.scrollTop;paint();},
    close(){closed=true;cancelAnimationFrame(frame);observer.disconnect();scroller.removeEventListener('scroll',onScroll);for(const event of ['wheel','pointerdown','keydown'])scroller.removeEventListener(event,interrupt);chip.remove();}
  };
}
