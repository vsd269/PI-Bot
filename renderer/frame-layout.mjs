// PI geometry only. The host's workspace panel remains owned by PI Desktop.
export const MIN_CHAT=420,RAIL_WIDTH=64,SIDEBAR_MIN=220,SIDEBAR_MAX=420;
export function frameLayout({viewport,width=280,collapsed=false,drawer=false,panel=false,panelWidth=320,requested=false}){
  width=Math.max(SIDEBAR_MIN,Math.min(SIDEBAR_MAX,width));
  let left=collapsed?'rail':viewport>=width+MIN_CHAT?'open':drawer?'drawer':'rail';
  let occupied=left==='open'?width:RAIL_WIDTH,panelState=panel?'shown':'none';
  if(panel&&viewport<occupied+MIN_CHAT+panelWidth){
    if(!requested)panelState='folded';
    else{if(left==='open'){left='rail';occupied=RAIL_WIDTH;}panelState=viewport<occupied+MIN_CHAT+panelWidth?'overlay':'shown';}
  }
  return {left,panel:panelState,width,room:Math.max(0,viewport-occupied)};
}
export function dragColumn(x){return x<(RAIL_WIDTH+SIDEBAR_MIN)/2?{collapsed:true,width:280}:{collapsed:false,width:Math.round(Math.max(SIDEBAR_MIN,Math.min(SIDEBAR_MAX,x)))};}
export function createFrameLayout({app,splitter,button,getPanel,getPanelWidth=()=>320,closePanel}){
  const storage=globalThis.localStorage;
  const read=(key,fallback)=>{try{return storage.getItem(key)??fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{storage.setItem(key,String(value));}catch{}};
  let width=Math.max(SIDEBAR_MIN,Math.min(SIDEBAR_MAX,Number(read('pi-bot.sidebarWidth',280))||280)),collapsed=read('pi-bot.sidebarCollapsed','false')==='true',drawer=false,requested=false,dragging=false,disposed=false,frame=0,applying=false;
  function apply(){
    if(disposed||applying)return;applying=true;
    try{
      const layout=frameLayout({viewport:app.getBoundingClientRect().width,width,collapsed,drawer,panel:getPanel(),panelWidth:getPanelWidth(),requested});
      if(layout.panel==='folded')closePanel();
      app.dataset.frameLayout=layout.left;
      app.toggleAttribute('data-sidebar-collapsed',layout.left==='rail');
      app.toggleAttribute('data-sidebar-drawer',layout.left==='drawer');
      app.toggleAttribute('data-details-docked',layout.panel==='shown');
      app.querySelector('.bt-side').classList.toggle('bt-rail',layout.left==='rail');
      app.style.setProperty('--pi-sidebar-width',width+'px');
      splitter.hidden=layout.left==='rail'&&!dragging;
      splitter.setAttribute('aria-valuemin',layout.left==='rail'?RAIL_WIDTH:SIDEBAR_MIN);splitter.setAttribute('aria-valuemax',SIDEBAR_MAX);splitter.setAttribute('aria-valuenow',layout.left==='rail'?RAIL_WIDTH:width);
      button.setAttribute('aria-label',layout.left==='rail'?'展开侧栏':'收起侧栏');button.title=button.getAttribute('aria-label');
    }finally{applying=false;}
  }
  function schedule(){if(!disposed&&!frame)frame=requestAnimationFrame(()=>{frame=0;drawer=false;requested=false;apply();});}
  function setCollapsed(value){collapsed=value;drawer=!value;save('pi-bot.sidebarCollapsed',value);apply();}
  splitter.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();dragging=true;splitter.setPointerCapture?.(event.pointerId);splitter.classList.add('dragging');app.setAttribute('data-column-resizing','');};
  splitter.onpointermove=event=>{if(!dragging)return;const next=dragColumn(event.clientX-app.getBoundingClientRect().left);collapsed=next.collapsed;if(!collapsed)width=next.width;drawer=!collapsed;apply();};
  const finish=()=>{if(!dragging)return;dragging=false;splitter.classList.remove('dragging');app.removeAttribute('data-column-resizing');save('pi-bot.sidebarWidth',width);save('pi-bot.sidebarCollapsed',collapsed);apply();};
  splitter.onpointerup=finish;splitter.onpointercancel=finish;splitter.onlostpointercapture=finish;
  const separatorKey=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();width=event.key==='Home'?SIDEBAR_MIN:event.key==='End'?SIDEBAR_MAX:Math.max(SIDEBAR_MIN,Math.min(SIDEBAR_MAX,width+(event.key==='ArrowLeft'?-16:16)));collapsed=false;save('pi-bot.sidebarWidth',width);save('pi-bot.sidebarCollapsed',false);apply();};
  splitter.tabIndex=0;splitter.setAttribute('aria-orientation','vertical');splitter.addEventListener('keydown',separatorKey);
  const outside=event=>{if(!app.hasAttribute('data-sidebar-drawer')||event.target.closest('.sidebar'))return;drawer=false;apply();};
  app.addEventListener('pointerdown',outside);
  const observer=new ResizeObserver(schedule);observer.observe(app);apply();
  return {setCollapsed,panelChanged(open){requested=open;apply();},dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);app.removeEventListener('pointerdown',outside);splitter.removeEventListener('keydown',separatorKey);splitter.onpointerdown=splitter.onpointermove=splitter.onpointerup=splitter.onpointercancel=splitter.onlostpointercapture=null;}};
}
