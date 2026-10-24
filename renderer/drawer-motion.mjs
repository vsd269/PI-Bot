// Upstream bt-pane-in slide: 300ms, with the existing page view transitions.
export function createDrawerMotion({panel,conversation,trigger,onClose}){
  let opened=false,animation=null,revision=0,disposed=false;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  function set(next){
    if(disposed||next===opened)return;
    if(next)panel.getRootNode().host?.dispatchEvent(new CustomEvent('pi-bot:details-open'));
    const ticket=++revision,wasHidden=panel.hidden;
    const from=wasHidden?'translateX(100%)':getComputedStyle(panel).transform;
    animation?.cancel();opened=next;
    trigger.setAttribute('aria-expanded',String(next));
    conversation.toggleAttribute('data-details-open',next);
    panel.hidden=false;panel.inert=!next;panel.setAttribute('aria-hidden',String(!next));
    panel.style.transform=next?'translateX(0)':'translateX(100%)';
    if(!next){onClose?.();if(panel.contains(panel.getRootNode().activeElement))trigger.focus();}
    if(reduce.matches){panel.hidden=!next;return;}
    // Commit the unhidden geometry before starting: otherwise the first paint
    // can land at the final transform when the panel was display:none.
    panel.getBoundingClientRect();
    animation=panel.animate([{transform:from==='none'?'translateX(0)':from},{transform:panel.style.transform}],{duration:300,easing:'cubic-bezier(.2,0,0,1)',fill:'both'});
    animation.finished.then(()=>{if(ticket===revision&&!disposed){panel.hidden=!opened;animation?.cancel();animation=null;}},()=>{});
  }
  return {set,isOpen:()=>opened,dispose(){disposed=true;revision++;animation?.cancel();}};
}
