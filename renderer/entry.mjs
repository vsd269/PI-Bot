import {createElement as h,useEffect,useState} from 'react';
import {mount} from './app.mjs';
import {createClient} from './rpc.mjs';
import {characterMarkup,MAIN_LOOK,shapeOf,MASK_ID,nextMarkSerial} from './upstream/characters.mjs';
import {RETURN_CSS} from './upstream/return-style.mjs';
import {mountSidebarEntry} from './sidebar-entry.mjs';
import {attachWindowChrome} from './window-chrome.mjs';
let layer,dispose,mode=false,alive=false,root,checkTimer;
let dock,chrome,showBot=()=>{};
const placementListeners=new Set();
function FallbackReturn(){const [placed,setPlaced]=useState(dock?.placed??false);useEffect(()=>{placementListeners.add(setPlaced);setPlaced(dock?.placed??false);return()=>placementListeners.delete(setPlaced)},[]);return placed?null:h('button',{type:'button',className:'pi-bot-return',onClick:showBot,title:'PI-bot','aria-label':'PI-bot'},h('span',{className:'bt-mark'},h('svg',{viewBox:'0 0 '+shapeOf(MAIN_LOOK.shape).size+' '+shapeOf(MAIN_LOOK.shape).size,dangerouslySetInnerHTML:{__html:characterMarkup(MAIN_LOOK.shape,MAIN_LOOK.color).replaceAll(MASK_ID,'pi-return-fallback')}})))};
export async function onLoad(pi){
  alive=true;
  layer=pi.ui.openLayer();
  root=document.createElement('div');
  root.style.cssText='position:fixed;inset:0;height:100dvh;width:100%;pointer-events:none;background:var(--ds-bg-primary,#fcfcfc);display:none';
  layer.element.append(root);
  const setMode=value=>{mode=value;root.style.setProperty('display',mode?'block':'none','important');root.style.setProperty('visibility',mode?'visible':'hidden','important');root.style.pointerEvents=mode?'auto':'none';root.inert=!mode;chrome?.setActive(mode);window.dispatchEvent(new CustomEvent('pi-bot:mode',{detail:mode}));};
  showBot=()=>setMode(true);
  const dispatch=(action,payload)=>pi.dispatch(action,payload);
  const client=createClient(dispatch);dispose=await mount(root,client,()=>setMode(false),true);
  chrome=attachWindowChrome(root);
  setMode(false);
  if(!alive){dispose();return;}
  pi.ui.injectStyle(RETURN_CSS);
  const mark=characterMarkup(MAIN_LOOK.shape,MAIN_LOOK.color).replaceAll(MASK_ID,'pi-return-'+nextMarkSerial());
  dock=mountSidebarEntry(pi,{label:'PI-bot',markup:`<span class="bt-mark"><svg viewBox="0 0 ${shapeOf(MAIN_LOOK.shape).size} ${shapeOf(MAIN_LOOK.shape).size}">${mark}</svg></span>`,onClick:showBot,onPlacement:value=>placementListeners.forEach(listener=>listener(value))});
  // The independent launcher and command remain usable if a host release
  // removes or renames this optional composer slot.
  try { pi.slots?.register?.({slot:'composerControl',positions:['left'],component:FallbackReturn}); } catch(error) { console.warn('[PI-bot] Optional composer slot unavailable:',error); }
  checkTimer=setInterval(async()=>{try{const result=await pi.dispatch('plugin.call',{method:'mode.request'});if(alive&&result.open)setMode(true);}catch{}},1800);
}
export function onUnload(){alive=false;clearInterval(checkTimer);showBot=()=>{};placementListeners.clear();for(const cleanup of [()=>dock?.close(),()=>chrome?.close(),()=>window.dispatchEvent(new CustomEvent('pi-bot:mode',{detail:false})),()=>dispose?.(),()=>layer?.close()]){try{cleanup();}catch(error){console.warn('[PI-bot] Cleanup failed:',error);}}dock=chrome=dispose=layer=root=undefined;mode=false;}
