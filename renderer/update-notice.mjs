import {el,icon} from './dom.mjs';
export const UPDATE_PREF='pi-bot.updateCheck';
export const UPDATE_EVENT='pi-bot:update-settings';
export const UPDATE_RESULT='pi-bot:update-result';
export function updatesEnabled(){try{return localStorage.getItem(UPDATE_PREF)!=='false';}catch{return true;}}
export function createUpdateNotice({host,before,call,openAbout}){
  let closed=false,epoch=0;
  const box=el('button','','bt-round bt-update pi-update-notice');box.type='button';box.id='update-check';box.hidden=true;
  box.append(icon('CloudDownloadIcon'));box.onclick=openAbout;host.insertBefore(box,before||null);
  function apply(result){
    if(closed)return;
    box.hidden=!updatesEnabled()||result.status!=='available';
    if(!box.hidden){box.dataset.version=result.latest;box.title='PI Bot '+result.latest+' 可更新';box.setAttribute('aria-label',box.title);}
  }
  async function check(){
    const token=++epoch;if(!updatesEnabled()){box.hidden=true;return;}
    try{
      const result=await call('team.updates',{});
      if(closed||token!==epoch)return;
      apply(result);
    }catch{} // A failed background check must never interrupt chat.
  }
  const change=()=>{box.hidden=true;void check();};window.addEventListener(UPDATE_EVENT,change);
  const result=event=>{epoch++;apply(event.detail||{});};window.addEventListener(UPDATE_RESULT,result);
  const initial=setTimeout(check,1500),timer=setInterval(check,6*60*60*1000);
  return {dispose(){closed=true;epoch++;clearTimeout(initial);clearInterval(timer);window.removeEventListener(UPDATE_EVENT,change);window.removeEventListener(UPDATE_RESULT,result);box.remove();}};
}
