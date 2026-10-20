import {el,icon} from './dom.mjs';

// Like the supplied upstream composer, quote a short excerpt at the insertion
// point. Quoted source text is never substituted for the user's own draft.
export function insertQuote(input,text,insertion){
  const excerpt=String(text||'').replace(/\s+/g,' ').trim();if(!excerpt)return false;
  const quote='> '+(excerpt.length>200?excerpt.slice(0,200)+'…':excerpt)+'\n\n';
  const start=Math.min(input.value.length,insertion?.start??input.selectionStart??input.value.length),end=Math.max(start,Math.min(input.value.length,insertion?.end??input.selectionEnd??start));
  input.setRangeText(quote,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return true;
}
export function userQuote(text,render){
  const source=String(text||''),match=source.match(/^((?:>[^\n]*(?:\n|$))+)(\n?)([\s\S]*)$/);
  if(!match)return render(source);
  const wrap=el('span'),quote=el('blockquote','','pi-user-quote');quote.append(render(match[1].replace(/^> ?/gm,'').trimEnd()));wrap.append(quote,render(match[3]));return wrap;
}
export function createTextQuote({app,transcript,input,enabled}){
  const pill=el('button','加入输入框','pi-selection-quote');pill.type='button';pill.prepend(icon('ReplyIcon'));pill.hidden=true;pill.title='加入输入框（Ctrl+L）';app.append(pill);let selectedText='',insertion;
  const saveCaret=()=>{const root=transcript.getRootNode(),selection=root.getSelection?.()||window.getSelection();if(selection&&!selection.isCollapsed&&transcript.contains(selection.anchorNode))return;insertion={start:input.selectionStart,end:input.selectionEnd};};
  transcript.addEventListener('pointerdown',saveCaret,true);
  for(const type of ['select','input','keyup','pointerup'])input.addEventListener(type,saveCaret);
  function capture(){
    const root=transcript.getRootNode(),selection=root.getSelection?.()||window.getSelection();
    if(!enabled()||!selection||selection.isCollapsed||!transcript.contains(selection.anchorNode)||!transcript.contains(selection.focusNode)){pill.hidden=true;selectedText='';return;}
    selectedText=selection.toString().trim().slice(0,32000);if(!selectedText){pill.hidden=true;return;}
    const r=selection.getRangeAt(0).getBoundingClientRect();pill.hidden=false;const base=app.getBoundingClientRect();pill.style.left=Math.max(8,Math.min(r.left-base.left+(r.width-pill.offsetWidth)/2,base.width-pill.offsetWidth-8))+'px';pill.style.top=Math.max(8,r.top-base.top-pill.offsetHeight-8)+'px';
  }
  function quote(){capture();if(!selectedText)return false;const text=selectedText;pill.hidden=true;selectedText='';return insertQuote(input,text,insertion);}
  pill.onpointerdown=e=>e.preventDefault();pill.onclick=quote;
  document.addEventListener('selectionchange',capture);transcript.addEventListener('pointerup',capture);const hide=()=>{pill.hidden=true;};window.addEventListener('resize',hide);transcript.parentElement.addEventListener('scroll',hide,{passive:true});
  return {quote,dispose(){document.removeEventListener('selectionchange',capture);transcript.removeEventListener('pointerup',capture);transcript.removeEventListener('pointerdown',saveCaret,true);for(const type of ['select','input','keyup','pointerup'])input.removeEventListener(type,saveCaret);window.removeEventListener('resize',hide);transcript.parentElement.removeEventListener('scroll',hide);pill.remove();}};
}
const RECENT_KEY='pi-bot.recentEmoji',DEFAULT_EMOJI=['👍','❤️','😂','😮','😢','🙏'];
export function recentEmoji(){try{return [...new Set([...JSON.parse(localStorage.getItem(RECENT_KEY)||'[]').filter(e=>DEFAULT_EMOJI.includes(e)),...DEFAULT_EMOJI])].slice(0,6);}catch{return [...DEFAULT_EMOJI];}}
export function rememberEmoji(emoji){try{localStorage.setItem(RECENT_KEY,JSON.stringify([emoji,...recentEmoji().filter(e=>e!==emoji)].slice(0,6)));}catch{}}

export function createChatShortcuts({enabled,isModal,actions}){
  const keydown=e=>{
    if(!enabled()||e.defaultPrevented||e.repeat||e.isComposing||e.keyCode===229)return;
    const key=String(e.key||'').toLowerCase(),mod=(e.ctrlKey||e.metaKey)&&!e.altKey;
    // An open settings, browser or new-chat dialog owns its own keyboard input.
    if(isModal())return;
    let run;
    if(mod&&key==='k'||mod&&e.shiftKey&&key==='f')run=actions.search;
    else if(mod&&!e.shiftKey&&key==='f')run=actions.find;
    else if(mod&&!e.shiftKey&&key==='b')run=actions.sidebar;
    else if(mod&&!e.shiftKey&&key==='n')run=actions.newChat;
    else if(mod&&!e.shiftKey&&key===',')run=actions.settings;
    else if(mod&&!e.shiftKey&&key==='l')run=()=>{if(!actions.quote())actions.focus();};
    else if(mod&&!e.shiftKey&&key==='i')run=actions.focus;
    else if(mod&&!e.shiftKey&&key==='enter')run=actions.send;
    else if(!mod&&e.altKey&&!e.shiftKey&&['arrowup','arrowdown'].includes(key))run=()=>actions.move(key==='arrowup'?-1:1);
    else if(mod&&!e.shiftKey&&/^[1-9]$/.test(key))run=()=>actions.index(Number(key)-1);
    if(!run)return;e.preventDefault();e.stopImmediatePropagation();run();
  };
  window.addEventListener('keydown',keydown,true);return ()=>window.removeEventListener('keydown',keydown,true);
}
