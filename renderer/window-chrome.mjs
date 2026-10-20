// Cover the host titlebar with our own surface, retaining its real window
// controls above the plugin layer. No host program files or button handlers change.
export function attachWindowChrome(root) {
  root.dataset.piBotSurface='inactive';
  const style=document.createElement('style');style.dataset.piBotWindowChrome='';document.head.append(style);
  const app=root.shadowRoot.querySelector('.pi-bot-app');
  let stopped=false,frame=0,controls;
  const resize=new ResizeObserver(schedule);
  resize.observe(root);
  function update(){
    frame=0;if(stopped)return;
    const next=document.querySelector('.app-shell > .window-controls');
    if(next!==controls){resize.disconnect();resize.observe(root);controls=next;if(controls)resize.observe(controls);}
    const rect=controls?.getBoundingClientRect();
    const rootRect=root.getBoundingClientRect(),width=rect?.width>0?Math.max(0,Math.ceil(rootRect.right-rect.left)):0;
    if(app.style.getPropertyValue('--pi-window-controls-width')!==width+'px')app.style.setProperty('--pi-window-controls-width',width+'px');
    // The native app shell may isolate stacking contexts. Leave a real hole
    // in our surface so its window controls remain visible and clickable.
    // Use the control's viewport coordinate, not a percentage of a resizing
    // Bot surface. Relative notches jumped left for one frame on dock resize.
    const edge=Math.max(0,Math.floor((rect?.left||innerWidth)-rootRect.left))+'px',bottom=Math.ceil(rect?.bottom||46);
    const clip=width?`polygon(0 0,${edge} 0,${edge} ${bottom}px,100% ${bottom}px,100% 100%,0 100%)`:'none';
    if(root.style.clipPath!==clip)root.style.clipPath=clip;
    const palette=getComputedStyle(app),bg=palette.getPropertyValue('--bt-main').trim()||'#fcfcfc',ink=palette.getPropertyValue('--bt-ink').trim()||'#141414';
    // Only the exposed native dock and real controls inherit Bot colors.
    // No host theme preference is changed; closing Bot removes this CSS scope.
    const card=palette.getPropertyValue('--bt-card').trim()||bg,dark=app.hasAttribute('data-ds-dark-theme');
    const mix=n=>`color-mix(in srgb,${ink} ${n}%,${bg})`;
    const tokens={'--ds-bg-primary':bg,'--ds-bg-secondary':card,'--ds-bg-tertiary':mix(7),'--ds-bg-inset':mix(4),'--ds-bg-under':bg,'--ds-bg-dock':bg,'--ds-bg-dock-raised':bg,'--ds-bg-elevated':card,'--ds-bg-elevated-opaque':card,'--ds-bg-hover':mix(7),'--ds-bg-active':mix(12),'--ds-bg-chip':mix(6),'--ds-text-primary':ink,'--ds-text-secondary':mix(75),'--ds-text-muted':mix(60),'--ds-text-faint':mix(44),'--ds-border-default':mix(12),'--ds-border-subtle':mix(7),'--ds-border-strong':mix(20),'--ds-tile':mix(4),'--ds-tile-hover':mix(7),'--ds-tile-deep':mix(10),'--ds-raised':card,'--ds-accent':ink,'--ds-settings-field-bg':card,'--ds-field-inset-bg':mix(4),'--ds-placeholder-ink':mix(60)};
    const scope='body:has([data-pi-bot-surface="active"]) .app-shell';
    const css=`${scope} > .window-controls,${scope} .work-panel{${Object.entries(tokens).map(([key,value])=>key+':'+value).join(';')};color:${ink};color-scheme:${dark?'dark':'light'}}${scope} > .window-controls{background:${bg}}`;

    if(style.textContent!==css)style.textContent=css;
  }
  function schedule(){if(!stopped&&!frame)frame=requestAnimationFrame(update);}
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  const appearance=new MutationObserver(schedule);
  appearance.observe(app,{attributes:true,attributeFilter:['style','data-ds-dark-theme']});
  window.addEventListener('resize',schedule);update();
  return {
    update,
    setActive(value){root.dataset.piBotSurface=value?'active':'inactive';schedule();},
    close(){stopped=true;cancelAnimationFrame(frame);observer.disconnect();appearance.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);style.remove();delete root.dataset.piBotSurface;},
  };
}
