import {reducedMotion,liveSprings,SPRING_LEAD,SPRING_TRAIL,SPRING_LIST,SPRING_SHAPE,QUICK_EDGES} from './upstream/motion.mjs';

// The vanilla renderer's equivalents of upstream useGlide/useFlip/useLinger.
// Keep velocity on a new target; CSS transitions on top would distort the spring.
const groups='.bt-seg,.bt-tabs,.bt-avedit-tabs,.bt-settings-nav,.bt-us-tabs,.bt-drop-list,.bt-palette-list,.pi-settings-segments';
const selected='[aria-pressed="true"],[aria-selected="true"],[aria-current="page"]';
const menuTimers=new WeakMap();
export function menuVisible(node,shown,{remove=false,immediate=false,delay=120}={}){
  if(!shown&&!immediate&&node.hasAttribute('data-leaving')&&menuTimers.has(node))return;
  clearTimeout(menuTimers.get(node));menuTimers.delete(node);
  if(shown){node.hidden=false;node.inert=false;delete node.dataset.leaving;return;}
  if(node.hidden||immediate||reducedMotion()){remove?node.remove():node.hidden=true;delete node.dataset.leaving;return;}
  node.inert=true;node.dataset.leaving='';
  menuTimers.set(node,setTimeout(()=>{remove?node.remove():node.hidden=true;delete node.dataset.leaving;menuTimers.delete(node);},delay));
}
export function leaveMenu(node,immediate=false){if(node)menuVisible(node,false,{remove:true,immediate});}

export function createInteractionMotion(app){
  const records=new Map();let frame=0,closed=false;
  const resize=new ResizeObserver(()=>schedule(true));let resizeOnly=true;
  function keyOf(node){
    if(node.dataset.motionKey)return node.dataset.motionKey;
    if(node.id)return node.id;
    const label=node.getAttribute('aria-label')||'',kind=[...node.classList].find(c=>/^(bt-seg|bt-tabs|bt-avedit-tabs|bt-settings-nav|bt-us-tabs|bt-drop-list|pi-settings-segments)$/.test(c));
    const page=node.matches('.bt-settings-nav')?'':node.closest('[data-page]')?.dataset.page||'',row=node.closest('.bt-set-row'),rowLabel=row?.querySelector('.bt-set-copy')?.textContent||'';
    return kind+':'+page+':'+label+':'+rowLabel;
  }
  function sync(jump=false){
    if(closed)return;const seen=new Set();
    for(const node of app.querySelectorAll(groups)){
      if(!node.getClientRects().length)continue;
      const key=keyOf(node);seen.add(key);let record=records.get(key);
      const vertical=node.matches('.bt-settings-nav,.bt-drop-list,.bt-palette-list'),quick=node.matches('.bt-drop-list,.bt-palette-list');
      if(!record){record={node:null,thumb:null,axis:vertical?'y':'x'};record.paint=({start,end})=>{record.position={start,end};const knob=record.thumb;if(!record.node?.isConnected||!knob)return;knob.style.transform=vertical?`translateY(${start}px)`:`translateX(${start}px)`;knob.style[vertical?'height':'width']=Math.max(0,end-start)+'px';};record.springs=liveSprings(record.paint);records.set(key,record);}
      const fresh=record.node!==node||record.thumb?.parentElement!==node;
      if(fresh){if(record.node)resize.unobserve(record.node);record.node=node;resize.observe(node);record.thumb=[...node.children].find(c=>c.matches('.bt-thumb,.pi-segment-thumb'));
        if(!record.thumb){record.thumb=document.createElement('span');record.thumb.className='bt-thumb';record.thumb.setAttribute('aria-hidden','true');node.prepend(record.thumb);}record.thumb.classList.add('bt-thumb');
        Object.assign(record.thumb.style,{left:vertical?'': '0px',top:vertical?'0px':'',transition:'opacity .14s ease'});
        if(record.position)record.paint(record.position);
      }
      const chosen=[...node.querySelectorAll(selected)].find(c=>c.closest(groups)===node&&!c.hidden),knob=record.thumb;
      if(!chosen){knob.dataset.hidden='';continue;}
      const start=vertical?chosen.offsetTop:chosen.offsetLeft,end=start+(vertical?chosen.offsetHeight:chosen.offsetWidth),before=record.springs.target();
      // Resize notifications do not restart an already moving thumb.
      if(before?.start===start&&before?.end===end&&!knob.hasAttribute('data-hidden')){node.dataset.glide='';continue;}
      const hidden=knob.hasAttribute('data-hidden');delete knob.dataset.hidden;const forward=!before||start>=before.start,lead=quick?QUICK_EDGES.lead:SPRING_LEAD,trail=quick?QUICK_EDGES.trail:SPRING_TRAIL;
      record.springs.set({start,end},forward?{start:trail,end:lead}:{start:lead,end:trail},!before||hidden||jump||reducedMotion());node.dataset.glide='';
    }
    for(const [key,record] of records)if(!seen.has(key)&&record.node){resize.unobserve(record.node);record.springs.stop();records.delete(key);}
    // Bounds memory when a long-running team visits many distinct controls.
    if(records.size>200)for(const [key,record] of records){if(!record.node)records.delete(key);if(records.size<=150)break;}
  }
  function schedule(jump=false){resizeOnly=resizeOnly&&jump;if(!frame&&!closed)frame=requestAnimationFrame(()=>{frame=0;const value=resizeOnly;resizeOnly=true;sync(value);});}
  const observer=new MutationObserver(()=>schedule(false));observer.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','aria-selected','aria-current','hidden']});
  schedule(true);
  return {sync,dispose(){closed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();for(const r of records.values())r.springs.stop();records.clear();for(const node of app.querySelectorAll('.bt-menu')){clearTimeout(menuTimers.get(node));menuTimers.delete(node);}}};
}

export function createListMotion(list){
  const animations=new Set();let baseline=false;
  const positions=()=>new Map([...list.querySelectorAll('[data-id]')].map(n=>[n.dataset.id,n.offsetTop]));
  return {before:positions,after(before){const moving=baseline&&!reducedMotion();baseline=true;if(!moving)return;
    for(const node of list.querySelectorAll('[data-id]')){const old=before.get(node.dataset.id);let animation;
      if(old===undefined)animation=node.animate([{opacity:0,filter:'blur(4px)'},{opacity:1,filter:'blur(0)'}],{duration:180,easing:'ease-out'});
      else if(Math.abs(old-node.offsetTop)>.5)animation=node.animate([{transform:`translateY(${old-node.offsetTop}px)`},{transform:'none'}],{duration:SPRING_LIST.duration,easing:SPRING_LIST.easing});
      if(animation){animation.id='bt-list-flip';animations.add(animation);animation.finished.then(()=>animations.delete(animation),()=>animations.delete(animation));}
    }
  },dispose(){for(const animation of animations)animation.cancel();animations.clear();}};
}

export function morphWidth(node,mutate,from=node.getBoundingClientRect().width){
  for(const a of node.getAnimations())if(a.id==='bt-morph')a.cancel();mutate();const to=node.getBoundingClientRect().width;
  if(from>0&&to>0&&Math.abs(from-to)>=1&&!reducedMotion())node.animate([{width:from+'px'},{width:to+'px'}],{id:'bt-morph',duration:SPRING_SHAPE.duration,easing:SPRING_SHAPE.easing});
}

// Match upstream useMorph: take the visible height before cancelling a prior
// animation so a quick reversal does not jump to the old target.
export function morphHeight(node,mutate){
  const from=node.getBoundingClientRect().height;
  for(const animation of node.getAnimations())if(animation.id==='bt-morph')animation.cancel();
  mutate();const to=node.offsetHeight;
  if(from>0&&to>0&&Math.abs(from-to)>=1&&!reducedMotion()){
    node.dataset.morph='';
    const animation=node.animate([{height:from+'px'},{height:to+'px'}],{id:'bt-morph',duration:SPRING_SHAPE.duration,easing:SPRING_SHAPE.easing});
    const finish=()=>{if(!node.getAnimations().some(other=>other.id==='bt-morph'&&other!==animation))delete node.dataset.morph;};
    animation.finished.then(finish,finish);
  }
}

// Upstream details-drawer About uses useMorph when five clamped lines expand.
export function aboutContent(text,{open=false,onToggle=()=>{}}={}){
  const wrap=document.createElement('div'),body=document.createElement('div');body.className='bt-about';body.textContent=text;body.toggleAttribute('data-open',open);wrap.append(body);
  if(String(text).length>240||String(text).split('\n').length>5){const more=document.createElement('button');more.type='button';more.className='bt-more';more.textContent=open?'收起':'显示更多';more.setAttribute('aria-expanded',String(open));more.onclick=()=>{
    morphHeight(body,()=>{const open=!body.hasAttribute('data-open');body.toggleAttribute('data-open',open);more.textContent=open?'收起':'显示更多';more.setAttribute('aria-expanded',String(open));onToggle(open);});
  };wrap.append(more);}return wrap;
}
