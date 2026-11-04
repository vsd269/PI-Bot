import {el,icon} from './dom.mjs';
import {appArtwork} from './app-catalog.mjs';

// Follow the sidebar's connected-first / popular-app fallback presentation.
// These pictures illustrate the entry point; they never imply an active grant.
const POPULAR=[{slug:'gmail',name:'Gmail'},{slug:'slack',name:'Slack'},{slug:'notion',name:'Notion'}];
export function renderSidebarApps(target,accounts=[]){
  const faces=[],seen=new Set();
  for(const account of [...accounts,...POPULAR]){
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
