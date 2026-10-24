import {icon} from './dom.mjs';
// Optional adapter: use PI's own button/session navigation; never import its
// store, move native DOM or patch the client. Pressed != actually presented.
export function attachWorkspaceSidebar(root,{prepare=async()=>{},onError=()=>{},onLayout=()=>{}}={}){
  const header=root.shadowRoot.querySelector('.conversation-header'),button=document.createElement('button');
  button.type='button';button.className='bt-round pi-workspace-toggle';button.setAttribute('aria-label','展开工作区与终端');button.title='工作区与终端';button.append(icon('SidePanelIcon'));button.hidden=true;header.querySelector('.pi-header-actions').append(button);
  let active=false,requested=false,stopped=false,frame=0,panel,generation=0;
  const native=()=>document.querySelector('.app-shell .app-work-panel-toggle');
  // PI hides presentation on Settings/Plugins/Scheduled even when a session
  // exists and aria-pressed is true. These are public rendered route markers.
  const routeBlocked=()=>!!document.querySelector('.app-shell.settings-mode,.app-shell .app-chat-shell[hidden],.app-shell .main-pane > .main-titlebar');
  const visiblePanel=()=>{
    const node=document.querySelector('.app-shell .work-panel:not(.is-exiting):not(.is-exit-pending)');
    if(!node||node.closest('[hidden],[inert]'))return null;
    const box=node.getBoundingClientRect();
    return box.width>0&&box.height>0&&getComputedStyle(node).visibility!=='hidden'?node:null;
  };
  const resize=new ResizeObserver(schedule);
  function update(){
    frame=0;if(stopped)return;button.hidden=!native();
    const next=visiblePanel();if(next!==panel){resize.disconnect();panel=next;if(panel)resize.observe(panel);}
    const box=panel?.getBoundingClientRect(),shown=active&&requested&&box?.left>0;
    const width=shown?Math.round(box.left)+'px':'100%';if(root.style.width!==width){root.style.width=width;onLayout();}
    root.shadowRoot.querySelector('.pi-bot-app').toggleAttribute('data-native-workspace',!!shown);
    button.setAttribute('aria-expanded',String(!!shown));button.setAttribute('aria-label',shown?'收起工作区与终端':'展开工作区与终端');
    if(shown&&panel.getAnimations().some(animation=>animation.playState==='running'))schedule();
  }
  function schedule(){if(!stopped&&!frame)frame=requestAnimationFrame(update);}
  async function waitFor(check,token){
    const deadline=performance.now()+5000;
    while(!stopped&&active&&generation===token){
      if(check())return true;
      if(performance.now()>=deadline)return false;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    return false;
  }
  button.onclick=async()=>{
    if(button.disabled)return;
    const token=++generation;button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      let control=native();if(!control)throw Error('当前 PI 版本没有可用的工作区侧栏入口。');
      if(requested&&visiblePanel()){
        requested=false;if(control.getAttribute('aria-pressed')==='true')control.click();schedule();return;
      }
      // Preserve the instant path on a ready Chat route. Recover the route
      // as well as the session when necessary, without fetching team.state.
      if(control.disabled||routeBlocked()||(control.getAttribute('aria-pressed')==='true'&&!visiblePanel())){
        await prepare();
        if(stopped||!active||generation!==token)return;
        const ready=await waitFor(()=>native()&&!native().disabled&&!routeBlocked(),token);
        if(stopped||!active||generation!==token)return;
        if(!ready)throw Error('工作区尚未就绪，请先选择已有聊天记录的机器人或群聊后重试。');
        control=native();
      }
      root.dispatchEvent(new CustomEvent('pi-bot:workspace-open'));
      requested=true;
      if(control.getAttribute('aria-pressed')!=='true')control.click();
      schedule();
      // Session/open is acknowledged before React finishes switching routes;
      // wait for actual presentation instead of trusting its pressed state.
      const opened=await waitFor(()=>!!visiblePanel(),token);
      if(stopped||!active||generation!==token)return;
      if(!opened){requested=false;throw Error('PI 工作区未能展开，请返回 PI 原生界面检查该会话的工作区状态后重试。');}
      schedule();
    }catch(error){if(!stopped&&active&&generation===token){requested=false;schedule();onError(error.message);}}
    finally{button.disabled=false;button.removeAttribute('aria-busy');}
  };
  const closeForDetails=()=>{if(requested){requested=false;generation++;const control=native();if(control?.getAttribute('aria-pressed')==='true')control.click();schedule();}};root.addEventListener('pi-bot:details-open',closeForDetails);
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed','disabled','hidden','inert']});
  window.addEventListener('resize',schedule);update();
  return {
    setActive(value){active=value;if(!value){requested=false;generation++;}schedule();},
    close(){root.removeEventListener('pi-bot:details-open',closeForDetails);stopped=true;generation++;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);root.style.width='100%';button.remove();}
  };
}
