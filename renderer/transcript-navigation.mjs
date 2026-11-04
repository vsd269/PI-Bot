import {el,icon} from './dom.mjs';

// Track reply identities, not renders or streaming chunks. Existing history is
// the baseline on each selection; only replies arriving while detached count.
export function createTranscriptNavigation({scroller,transcript,composer}){
  const chip=el('div','','bt-news pi-bot-to-bottom'),jump=el('button','','bt-news-jump'),label=el('span'),dismiss=el('button','','bt-news-x');
  chip.hidden=true;chip.dataset.direction='down';jump.type=dismiss.type='button';
  const glyph=el('span','','bt-news-ico');glyph.append(icon('ArrowDownIcon'));jump.append(glyph,label);dismiss.append(icon('CloseIcon'));dismiss.setAttribute('aria-label','忽略新消息提示');chip.append(jump,dismiss);composer.append(chip);
  const divider=el('div','','pi-new-messages');divider.setAttribute('role','separator');divider.setAttribute('aria-label','新消息');divider.append(el('span','新消息'));
  const identity=line=>String(line.jobId||line.id),cursors=new Map();let currentIds=new Map();try{for(const row of JSON.parse(localStorage.getItem('pi-bot.read-cursors')||'[]').slice(-200))if(Array.isArray(row)&&typeof row[0]==='string'&&typeof row[1]==='string')cursors.set(row[0],row[1]);}catch{}
  let selection,known=new Set(),unread=new Set(),pinned=true,jumping=false,frame=0,closed=false,lastTop=0,boundary=null,latestId=null,linger=0,fade=0;
  const visible=()=>document.visibilityState==='visible'&&document.hasFocus();
  function remember(){if(!visible()||!pinned||!selection||!latestId||cursors.get(selection)===latestId)return;cursors.delete(selection);cursors.set(selection,latestId);while(cursors.size>200)cursors.delete(cursors.keys().next().value);try{localStorage.setItem('pi-bot.read-cursors',JSON.stringify([...cursors]));}catch{}}
  function clearDivider(){clearTimeout(linger);clearTimeout(fade);linger=fade=0;boundary=null;divider.remove();divider.classList.remove('pi-new-messages-fading');}
  function placeDivider(){const node=[...transcript.querySelectorAll('[data-line-id]')].find(n=>n.dataset.lineId===currentIds.get(boundary));if(node)node.before(divider);else divider.remove();}
  function readDivider(){
    if(!divider.isConnected||!visible())return;const a=divider.getBoundingClientRect(),b=scroller.getBoundingClientRect();
    if(a.top>=b.top&&a.bottom<=b.bottom){if(!linger&&!fade)linger=setTimeout(()=>{linger=0;if(!visible())return;divider.classList.add('pi-new-messages-fading');fade=setTimeout(clearDivider,480);},1200);}
    else if(linger){clearTimeout(linger);linger=0;}
  }
  const atBottom=()=>scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<=24;
  function paint(){
    chip.hidden=pinned||scroller.scrollHeight<=scroller.clientHeight+24;
    chip.dataset.unread=String(unread.size);dismiss.hidden=!unread.size;
    label.textContent=unread.size?unread.size+' 条新消息':'';
    jump.setAttribute('aria-label',unread.size?unread.size+' 条新消息 · 回到底部':'回到底部');
    jump.title=jump.getAttribute('aria-label');
  }
  function latest(){jumping=true;pinned=true;unread.clear();clearDivider();remember();scroller.scrollTo({top:scroller.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});paint();}
  jump.onclick=latest;dismiss.onclick=()=>{unread.clear();paint();};
  function onScroll(){const top=scroller.scrollTop;if(jumping&&top<lastTop-1)jumping=false;lastTop=top;if(jumping){if(!atBottom())return;jumping=false;}pinned=atBottom();if(pinned)unread.clear();remember();readDivider();paint();}
  const interrupt=()=>{jumping=false;};
  for(const event of ['wheel','pointerdown','keydown'])scroller.addEventListener(event,interrupt,{passive:true});
  scroller.addEventListener('scroll',onScroll,{passive:true});
  const onFocus=()=>{remember();readDivider();};window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
  const observer=new ResizeObserver(()=>{if(!frame&&!closed)frame=requestAnimationFrame(()=>{frame=0;if(pinned)scroller.scrollTop=scroller.scrollHeight;paint();});});
  observer.observe(scroller);observer.observe(transcript);
  return {
    beforeRender(key,lines,{unread:opensUnread=false}={}){
      const replies=lines.filter(l=>l.who!=='User'&&l.navigationReply!==false&&!l.activityOnly&&String(l.text||'').trim()),keys=new Set(replies.map(identity));currentIds=new Map(replies.map(l=>[identity(l),String(l.id)]));
      let focusBoundary=false;latestId=replies.length?identity(replies.at(-1)):null;
      if(key!==selection){
        clearDivider();selection=key;known=keys;unread.clear();pinned=true;jumping=false;
        const cursor=cursors.get(key),at=cursor?lines.findIndex(l=>l.who!=='User'&&identity(l)===cursor):-1;
        if(opensUnread||at>=0&&cursor!==latestId){
          const userAt=lines.findLastIndex(l=>l.who==='User'),start=at>=0?at:userAt;
          const first=start>=0?lines.slice(start+1).find(l=>l.who!=='User'&&keys.has(identity(l))):replies.at(-1);boundary=first?identity(first):null;
          if(boundary){focusBoundary=true;for(const row of lines.slice(lines.findIndex(l=>l.who!=='User'&&identity(l)===boundary)))if(row.who!=='User'&&keys.has(identity(row)))unread.add(identity(row));}
        }
      }
      else{if(!pinned||!visible())for(const id of keys)if(!known.has(id)){unread.add(id);if(!boundary)boundary=id;}for(const id of keys)known.add(id);}
      return {pinned,top:scroller.scrollTop,focusBoundary};
    },
    afterRender(view){placeDivider();scroller.scrollTop=view.pinned?scroller.scrollHeight:view.top;if(view.focusBoundary&&divider.isConnected){scroller.scrollTop+=divider.getBoundingClientRect().top-scroller.getBoundingClientRect().top-12;pinned=atBottom();}remember();readDivider();paint();},
    latest,
    reveal(node){jumping=false;pinned=false;node.scrollIntoView({block:'center',behavior:'instant'});lastTop=scroller.scrollTop;paint();},
    close(){closed=true;clearDivider();cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);scroller.removeEventListener('scroll',onScroll);for(const event of ['wheel','pointerdown','keydown'])scroller.removeEventListener(event,interrupt);chip.remove();}
  };
}
