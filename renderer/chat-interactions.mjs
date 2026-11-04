import {el,icon} from './dom.mjs';
import {createContextMenu} from './context-menu.mjs';

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
export function createTextQuote({app,transcript,input,invoke,enabled,onError=()=>{}}){
  const pill=el('button','引用','pi-selection-quote');pill.type='button';pill.prepend(icon('QuoteIcon'));pill.hidden=true;pill.title='引用选中文字（Ctrl+L）';pill.setAttribute('aria-label','引用选中文字');app.append(pill);let selectedText='',insertion,menuOpen=false,generation=0;
  const getSelection=()=>transcript.getRootNode().getSelection?.()||window.getSelection();
  const menu=createContextMenu({app,run:action=>{menuOpen=false;return action();},onError});
  let hostLocale='',disposed=false;
  const language=()=>{const value=document.documentElement.lang||hostLocale;return /^zh(?:-|_|$)/i.test(value&&!/^(auto|system)$/i.test(value)?value:navigator.language||'en')?'zh':'en';};
  const words=()=>language()==='zh'?['撤销','重做','剪切','复制','粘贴','粘贴并匹配样式','全选']:['Undo','Redo','Cut','Copy','Paste','Paste and Match Style','Select All'];
  function localize(){const zh=language()==='zh';pill.lastChild.textContent=zh?'引用':'Quote';pill.title=zh?'引用选中文字（Ctrl+L）':'Quote selected text (Ctrl+L)';pill.setAttribute('aria-label',zh?'引用选中文字':'Quote selected text');}
  const localeChanged=()=>{localize();menuOpen=false;menu.close();};
  const localeObserver=new MutationObserver(localeChanged);localeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  const refreshLocale=()=>{if(!invoke)return;Promise.resolve().then(()=>invoke('team.appearance')).then(value=>{if(!disposed){hostLocale=value?.locale||'';localize();}}).catch(()=>{});};
  localize();refreshLocale();window.addEventListener('focus',refreshLocale);
  const saveCaret=()=>{const root=transcript.getRootNode(),selection=root.getSelection?.()||window.getSelection();if(selection&&!selection.isCollapsed&&transcript.contains(selection.anchorNode))return;insertion={start:input.selectionStart,end:input.selectionEnd};};
  transcript.addEventListener('pointerdown',saveCaret,true);
  for(const type of ['select','input','keyup','pointerup'])input.addEventListener(type,saveCaret);
  function capture(){
    const root=transcript.getRootNode(),selection=root.getSelection?.()||window.getSelection();
    if(menuOpen){pill.hidden=true;return;}
    if(!enabled()||!selection||selection.isCollapsed||!transcript.contains(selection.anchorNode)||!transcript.contains(selection.focusNode)){pill.hidden=true;selectedText='';return;}
    selectedText=selection.toString().trim().slice(0,32000);if(!selectedText){pill.hidden=true;return;}
    const r=selection.getRangeAt(0).getBoundingClientRect();pill.hidden=false;const base=app.getBoundingClientRect();pill.style.left=Math.max(8,Math.min(r.left-base.left+(r.width-pill.offsetWidth)/2,base.width-pill.offsetWidth-8))+'px';pill.style.top=Math.max(8,r.top-base.top-pill.offsetHeight-8)+'px';
  }
  function quote(){capture();if(!selectedText)return false;const text=selectedText;pill.hidden=true;selectedText='';return insertQuote(input,text,insertion);}
  pill.onpointerdown=e=>e.preventDefault();pill.onclick=quote;
  const item=(label,shortcut,action,disabled=false)=>({label,shortcut,action,disabled,icon:'CopyIcon'});
  function context(event){
    if(!enabled())return;
    const field=event.target.closest('textarea,input'),bubble=event.target.closest('.bt-bubble,.bt-ububble');
    if(field&&field!==input||field!==input&&!bubble)return;
    event.preventDefault();event.stopPropagation();const selection=getSelection(),text=field===input?input.value.slice(input.selectionStart,input.selectionEnd):selection&&!selection.isCollapsed&&transcript.contains(selection.anchorNode)&&transcript.contains(selection.focusNode)?selection.toString():'';
    const caret=field===input?{start:input.selectionStart,end:input.selectionEnd}:insertion,original=input.value,token=++generation,valid=()=>generation===token&&input.value===original&&enabled();
    const editing=field===input&&!input.disabled&&!input.readOnly,labels=words();
    if(editing){input.focus({preventScroll:true});input.setSelectionRange(caret.start,caret.end);}
    const groups=[
      [item(labels[0],'Ctrl+Z',()=>edit('undo'),!editing||!document.queryCommandEnabled('undo')),item(labels[1],'Ctrl+Y',()=>edit('redo'),!editing||!document.queryCommandEnabled('redo'))],
      [item(labels[2],'Ctrl+X',async()=>{await navigator.clipboard.writeText(text);if(valid())edit('delete');},!editing||!text),item(labels[3],'Ctrl+C',()=>navigator.clipboard.writeText(text),!text),item(labels[4],'Ctrl+V',()=>paste(false),!editing),item(labels[5],'Ctrl+Shift+V',()=>paste(true),!editing)],
      [item(labels[6],'Ctrl+A',()=>{if(field===input){input.focus();input.select();}else{const range=document.createRange();range.selectNodeContents(bubble);const selected=getSelection();selected.removeAllRanges();selected.addRange(range);capture();}},field===input?!input.value:!bubble.textContent)]
    ];
    function edit(command){input.focus({preventScroll:true});input.setSelectionRange(caret.start,caret.end);document.execCommand(command);input.dispatchEvent(new Event('input',{bubbles:true}));}
    async function paste(plainOnly){
      const data=new DataTransfer();
      if(plainOnly)data.setData('text/plain',await navigator.clipboard.readText());
      else if(navigator.clipboard.read){const values=await navigator.clipboard.read();for(const value of values){const image=value.types.find(t=>t.startsWith('image/'));if(image)data.items.add(new File([await value.getType(image)],'pasted-image.'+(image.split('/')[1]||'png'),{type:image}));else if(value.types.includes('text/plain'))data.setData('text/plain',await(await value.getType('text/plain')).text());}}
      else data.setData('text/plain',await navigator.clipboard.readText());
      if(!valid())return;input.focus({preventScroll:true});input.setSelectionRange(caret.start,caret.end);
      const handled=!plainOnly&&!input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
      if(!handled&&data.getData('text/plain')){document.execCommand('insertText',false,data.getData('text/plain'));input.dispatchEvent(new Event('input',{bubbles:true}));}
    }
    const source=field===input?input:bubble,rect=source.getBoundingClientRect(),keyboard=!event.clientX&&!event.clientY;
    menuOpen=true;pill.hidden=true;menu.open({x:keyboard?rect.left+16:event.clientX,y:keyboard?rect.bottom:event.clientY,label:language()==='zh'?'文字操作':'Text actions',className:'pi-text-menu',groups,source,keyboard});
  }
  const releaseMenu=event=>{if(!event.composedPath().some(n=>n?.classList?.contains('pi-context-menu')))menuOpen=false;};
  const menuKey=event=>{if(event.key==='Escape'||event.key==='Tab')menuOpen=false;};
  app.addEventListener('contextmenu',context);document.addEventListener('pointerdown',releaseMenu,true);document.addEventListener('keydown',menuKey,true);
  document.addEventListener('selectionchange',capture);transcript.addEventListener('pointerup',capture);const hide=()=>{pill.hidden=true;};window.addEventListener('resize',hide);transcript.parentElement.addEventListener('scroll',hide,{passive:true});
  return {quote,close(){generation++;menuOpen=false;menu.close();hide();},dispose(){disposed=true;generation++;localeObserver.disconnect();window.removeEventListener('focus',refreshLocale);menu.dispose();app.removeEventListener('contextmenu',context);document.removeEventListener('pointerdown',releaseMenu,true);document.removeEventListener('keydown',menuKey,true);document.removeEventListener('selectionchange',capture);transcript.removeEventListener('pointerup',capture);transcript.removeEventListener('pointerdown',saveCaret,true);for(const type of ['select','input','keyup','pointerup'])input.removeEventListener(type,saveCaret);window.removeEventListener('resize',hide);transcript.parentElement.removeEventListener('scroll',hide);pill.remove();}};
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
