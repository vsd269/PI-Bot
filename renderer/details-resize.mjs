export function createDetailsResize({app,panel,onChange}){
  const min=260,max=520,key='pi-bot.detailsWidth';
  let preferred=320,dragging=false,pointer=null;
  try{preferred=Math.max(min,Math.min(max,Number(localStorage.getItem(key))||320));}catch{}
  const grip=document.createElement('div');grip.className='pi-details-splitter';grip.tabIndex=0;
  grip.setAttribute('role','separator');grip.setAttribute('aria-label','调整详情侧栏宽度');grip.setAttribute('aria-orientation','vertical');panel.append(grip);
  function apply(){
    app.style.setProperty('--pi-details-width',preferred+'px');
    grip.setAttribute('aria-valuemin',min);grip.setAttribute('aria-valuemax',max);grip.setAttribute('aria-valuenow',preferred);
    onChange?.();
  }
  function persist(){try{localStorage.setItem(key,String(preferred));}catch{}}
  const down=event=>{if(event.button!==0)return;event.preventDefault();dragging=true;pointer=event.pointerId;grip.setPointerCapture(pointer);app.setAttribute('data-column-resizing','');};
  const move=event=>{if(!dragging||event.pointerId!==pointer)return;preferred=Math.round(Math.max(min,Math.min(max,app.getBoundingClientRect().right-event.clientX)));apply();};
  const finish=()=>{if(!dragging)return;dragging=false;pointer=null;app.removeAttribute('data-column-resizing');persist();};
  const keydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();preferred=event.key==='Home'?min:event.key==='End'?max:Math.max(min,Math.min(max,preferred+(event.key==='ArrowLeft'?16:-16)));apply();persist();};
  grip.addEventListener('pointerdown',down);grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',finish);grip.addEventListener('pointercancel',finish);grip.addEventListener('lostpointercapture',finish);grip.addEventListener('keydown',keydown);apply();
  return {width:()=>preferred,dispose(){finish();grip.remove();}};
}
