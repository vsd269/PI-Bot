// Cover the host titlebar with our own surface, retaining its real window
// controls above the plugin layer. No host program files or button handlers change.
export function attachWindowChrome(root) {
  root.dataset.piBotSurface='inactive';
  const style=document.createElement('style');style.dataset.piBotWindowChrome='';document.head.append(style);
  const app=root.shadowRoot.querySelector('.pi-bot-app');
  // Electron's draggable region lives outside the clipped Shadow DOM surface.
  const drag=document.createElement('div');drag.dataset.piBotWindowDrag='';drag.setAttribute('aria-hidden','true');
  drag.style.cssText='position:fixed;display:none;pointer-events:none;user-select:none;';root.parentElement.append(drag);
  let stopped=false,frame=0,controls,segmentsKey='';
  const resize=new ResizeObserver(schedule);
  resize.observe(root);
  function update(){
    frame=0;if(stopped)return;
    const next=document.querySelector('.app-shell > .window-controls');
    if(next!==controls){resize.disconnect();resize.observe(root);resize.observe(app.querySelector('.conversation-header'));controls=next;if(controls)resize.observe(controls);}
    const rect=controls?.getBoundingClientRect();
    const rootRect=root.getBoundingClientRect(),width=rect?.width>0?Math.max(0,Math.ceil(rootRect.right-rect.left)):0;
    const conversation=app.querySelector('.conversation').getBoundingClientRect(),start=Math.max(rootRect.left,conversation.left),end=Math.min(rootRect.right,rect?.left||rootRect.right);
    const header=app.querySelector('.conversation-header'),headerRect=header.getBoundingClientRect(),height=headerRect.height||60,dragWidth=Math.max(0,end-start);
    Object.assign(drag.style,{left:start+'px',top:rootRect.top+'px',width:dragWidth+'px',height:height+'px',display:root.dataset.piBotSurface==='active'&&end>start?'block':'none'});
    // Electron consumes native rectangular drag regions. Build separate real
    // rectangles beside controls rather than relying on CSS clipping holes.
    const holes=[];
    for(const node of header.querySelectorAll('button,a,input')){
      const box=node.getBoundingClientRect();if(box.width<=0||box.height<=0)continue;
      const l=Math.max(0,box.left-start-2),r=Math.min(dragWidth,box.right-start+2),t=Math.max(0,box.top-rootRect.top-2),b=Math.min(height,box.bottom-rootRect.top+2);
      if(r>l&&b>t)holes.push([l,r]);
    }
    holes.sort((a,b)=>a[0]-b[0]);const segments=[];let cursor=0;
    for(const [l,r] of holes){if(l>cursor)segments.push([cursor,l-cursor]);cursor=Math.max(cursor,r);}if(cursor<dragWidth)segments.push([cursor,dragWidth-cursor]);
    const nextSegments=JSON.stringify(segments);
    if(segmentsKey!==nextSegments){segmentsKey=nextSegments;drag.replaceChildren(...segments.map(([left,width])=>{const node=document.createElement('div');node.dataset.piBotWindowDragSegment='';node.style.cssText=`position:absolute;top:0;bottom:0;left:${left}px;width:${width}px;pointer-events:auto;-webkit-app-region:drag;app-region:drag;`;return node;}));}
    const headerInset=Math.max(0,Math.ceil(headerRect.right-(rect?.left||rootRect.right)))+'px';
    if(app.style.getPropertyValue('--pi-header-controls-inset')!==headerInset)app.style.setProperty('--pi-header-controls-inset',headerInset);
    if(app.style.getPropertyValue('--pi-window-controls-width')!==width+'px')app.style.setProperty('--pi-window-controls-width',width+'px');
    // The native app shell may isolate stacking contexts. Leave a real hole
    // in our surface so its window controls remain visible and clickable.
    // Use the control's viewport coordinate, not a percentage of a resizing
    // Bot surface. Relative notches jumped left for one frame on dock resize.
    const edge=Math.max(0,Math.floor((rect?.left||innerWidth)-rootRect.left))+'px',bottom=Math.max(0,Math.ceil((rect?.bottom||rootRect.top+52)-rootRect.top));
    const clip=width?`polygon(0 0,${edge} 0,${edge} ${bottom}px,100% ${bottom}px,100% 100%,0 100%)`:'none';
    if(root.style.clipPath!==clip)root.style.clipPath=clip;
    const palette=getComputedStyle(app),bg=palette.getPropertyValue('--bt-main').trim()||'#fcfcfc',ink=palette.getPropertyValue('--bt-ink').trim()||'#141414';
    // Only the exposed native dock and real controls inherit Bot colors.
    // No host theme preference is changed; closing Bot removes this CSS scope.
    const card=palette.getPropertyValue('--bt-card').trim()||bg,dark=app.hasAttribute('data-ds-dark-theme');
    const mix=n=>`color-mix(in srgb,${ink} ${n}%,${bg})`;
    const tokens={'--ds-bg-primary':bg,'--ds-bg-secondary':card,'--ds-bg-tertiary':mix(7),'--ds-bg-inset':mix(4),'--ds-bg-under':bg,'--ds-bg-dock':bg,'--ds-bg-dock-raised':bg,'--ds-bg-elevated':card,'--ds-bg-elevated-opaque':card,'--ds-bg-hover':mix(7),'--ds-bg-active':mix(12),'--ds-bg-chip':mix(6),'--ds-text-primary':ink,'--ds-text-secondary':mix(75),'--ds-text-muted':mix(60),'--ds-text-faint':mix(44),'--ds-border-default':mix(12),'--ds-border-subtle':mix(7),'--ds-border-strong':mix(20),'--ds-tile':mix(4),'--ds-tile-hover':mix(7),'--ds-tile-deep':mix(10),'--ds-raised':card,'--ds-accent':ink,'--ds-settings-field-bg':card,'--ds-field-inset-bg':mix(4),'--ds-placeholder-ink':mix(60)};
    // Host icons carry inline calc(size * font-scale) dimensions. Override those
    // boxes explicitly; retain Lucide paths and native maximize/restore updates.
    const scope='body:has([data-pi-bot-surface="active"]) .app-shell';
    const css=`${scope}{--ds-window-controls-width:138px}${scope} > .window-controls,${scope} .work-panel{${Object.entries(tokens).map(([key,value])=>key+':'+value).join(';')};color:${ink};color-scheme:${dark?'dark':'light'}}${scope} > .window-controls{background:${bg};width:138px;height:51px;padding:0;gap:0;align-items:stretch}${scope} > .window-controls > .window-control-btn{width:46px;min-width:46px;flex:1 1 46px;height:51px;padding:0;border:0;border-radius:0;box-shadow:none;color:${mix(78)};background:transparent}${scope} > .window-controls > .window-control-btn:hover{background:${mix(8)}}${scope} > .window-controls > .window-control-close:hover{background:#e81123;color:#fff}${scope} > .window-controls .window-control-btn svg{width:16px!important;height:16px!important;min-width:16px;flex-shrink:0;stroke-width:1.5}${scope} > .window-controls .window-control-btn:nth-child(2) svg{width:12px!important;height:12px!important;min-width:12px;stroke-width:1.5}`;

    if(style.textContent!==css)style.textContent=css;
  }
  function schedule(){if(!stopped&&!frame)frame=requestAnimationFrame(update);}
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  const appearance=new MutationObserver(schedule);
  appearance.observe(app,{attributes:true,attributeFilter:['style','data-ds-dark-theme','data-frame-layout','data-sidebar-collapsed','data-sidebar-drawer','data-details-docked']});
  window.addEventListener('resize',schedule);update();
  return {
    update,
    setActive(value){root.dataset.piBotSurface=value?'active':'inactive';schedule();},
    close(){stopped=true;cancelAnimationFrame(frame);observer.disconnect();appearance.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);style.remove();drag.remove();delete root.dataset.piBotSurface;},
  };
}
