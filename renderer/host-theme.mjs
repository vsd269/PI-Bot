// Resolve host appearance or the team's portable independent preference.
export function followHostTheme({app,button,invoke,getPreferences=()=>({}),savePreferences,onChange,onError}) {
  const host=document.documentElement,media=matchMedia('(prefers-color-scheme: dark)');
  let closed=false,saving=false,pending=null,desired=null,revision=0,configuration='';
  const prefs=()=>getPreferences()||{};
  const independent=()=>prefs().appearanceMode==='independent';
  const resolved=()=>['light','dark'].includes(host.dataset.theme)?host.dataset.theme:(media.matches?'dark':'light');
  function apply(value){if(closed)return;app.toggleAttribute('data-ds-dark-theme',value==='dark');onChange();}
  function update(){
    if(closed||desired)return;
    const p=prefs(),key=JSON.stringify([p.appearanceMode||'host',p.appearance||'light']);
    if(key===configuration)return;configuration=key;revision++;
    apply(independent()?(p.appearance==='dark'?'dark':'light'):resolved());
    if(button)button.title=independent()?'切换 PI-bot 独立外观':'切换外观（同步 PI-Desktop）';
  }
  const sync=()=>{revision++;if(!independent()&&!desired)apply(resolved());};
  const observer=new MutationObserver(sync);
  observer.observe(host,{attributes:true,attributeFilter:['data-theme']});
  media.addEventListener('change',sync);update();
  const initialRevision=revision;
  if(!['light','dark'].includes(host.dataset.theme))Promise.resolve().then(()=>invoke('team.appearance')).then(value=>{
    if(!closed&&!desired&&!independent()&&revision===initialRevision&&!host.dataset.theme)apply(['light','dark'].includes(value?.base)?value.base:resolved());
  }).catch(()=>{});
  async function flush(){
    if(saving||closed)return;saving=true;
    try{while(pending&&!closed){const entry=pending;pending=null;
      try{if(entry.own)await savePreferences({appearance:entry.value});else await invoke('team.theme',{theme:entry.value});}
      catch(error){if(!pending&&!closed)onError(error,entry.own);}
    }}finally{saving=false;if(!closed){desired=null;configuration=JSON.stringify([prefs().appearanceMode||'host',prefs().appearance||'light']);}}
  }
  if(button)button.onclick=()=>{if(closed)return;revision++;desired=app.hasAttribute('data-ds-dark-theme')?'light':'dark';pending={value:desired,own:independent()};apply(desired);flush();};
  const close=()=>{closed=true;pending=null;observer.disconnect();media.removeEventListener('change',sync);if(button)button.onclick=null;};
  close.update=update;
  return close;
}
