import {el,icon} from './dom.mjs';
import {appArtwork} from './app-catalog.mjs';

// Follow the sidebar's connected-first / popular-app fallback presentation.
// These pictures illustrate the entry point; they never imply an active grant.
const POPULAR=[{slug:'gmail',name:'Gmail'},{slug:'slack',name:'Slack'},{slug:'notion',name:'Notion'}];
export function renderSidebarApps(target,accounts=[],popular=true){
  const faces=[],seen=new Set();
  for(const account of [...accounts,...(popular?POPULAR:[])]){
    if(!account.slug||seen.has(account.slug))continue;
    seen.add(account.slug);faces.push(account);if(faces.length===3)break;
  }
  target.replaceChildren();
  for(const account of faces){
    const face=el('span','','pi-app-face'),img=el('img'),art=appArtwork(account);
    face.title=account.name||account.slug;img.alt='';img.draggable=false;img.referrerPolicy='no-referrer';
    let fallback=false;
    img.onerror=()=>{if(!fallback&&art.domain){fallback=true;img.src='https://www.google.com/s2/favicons?domain='+encodeURIComponent(art.domain)+'&sz=64';}else face.replaceChildren(icon('ConnectorIcon'));};
    img.src=art.logo;face.append(img);target.append(face);
  }
}

export function renderSidebarConnections(target,button,connection){
  if(Number.isFinite(connection.revision)){
    if(connection.revision<(target._connectionRevision??-1))return;
    target._connectionRevision=connection.revision;
  }
  const {configured,phase,accounts=[],error}=connection;
  const visible=accounts.filter(a=>a.status==='ACTIVE'||a.status==='UNKNOWN');
  const signature=JSON.stringify([configured,phase,visible,error]);
  if(target._connectionSignature===signature)return;
  target._connectionSignature=signature;
  renderSidebarApps(target,visible,!configured);
  target.dataset.connectionState=phase;
  if(button){
    const label=!configured?(error?'连接应用 · '+error:'连接应用'):
      phase==='ready'?'连接应用 · 已连接 '+accounts.filter(a=>a.status==='ACTIVE').length:
      phase==='error'?'连接应用 · 检查失败，将自动重试':'连接应用 · 正在检查已有连接';
    button.title=label;
  }
}
