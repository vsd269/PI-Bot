import {el,icon} from './dom.mjs';

export function createChatSearch({app,call,getState,openChat,openArchived,avatar,cluster,transcript,header,reveal,notice}){
  const dialog=el('dialog','','bt-palette pi-search-dialog'),head=el('div','','bt-palette-head'),glyph=el('span','','bt-palette-glyph'),input=el('input'),clear=el('button','','bt-palette-clear'),list=el('div','','bt-palette-list'),status=el('div','','pi-search-status');
  dialog.setAttribute('aria-label','搜索 Bot、群聊和消息');input.placeholder='搜索 Bot、群聊、消息或附件名';input.setAttribute('aria-label','搜索 Bot、群聊和消息');input.setAttribute('role','combobox');input.setAttribute('aria-controls','pi-search-list');input.setAttribute('aria-expanded','true');input.setAttribute('autocomplete','off');list.id='pi-search-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','搜索结果');status.setAttribute('role','status');clear.type='button';clear.setAttribute('aria-label','清空搜索');glyph.append(icon('SearchIcon'));clear.append(icon('CloseIcon'));head.append(glyph,input,clear);dialog.append(head,list,status);app.append(dialog);
  let timer,generation=0,rows=[],cursor=0,disposed=false;
  const close=()=>{generation++;clearTimeout(timer);dialog.close();};
  function activate(index,scroll=true){cursor=Math.max(0,Math.min(index,rows.length-1));for(const [i,row] of rows.entries())row.node.setAttribute('aria-selected',String(i===cursor));const active=rows[cursor]?.node;if(active){input.setAttribute('aria-activedescendant',active.id);if(scroll)active.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
  function add(title,subtitle,mark,run){const node=el('button','','bt-palette-row'),lead=el('span','','bt-palette-lead'),copy=el('span','','bt-palette-text');node.type='button';node.tabIndex=-1;node.setAttribute('role','option');node.id='pi-search-'+rows.length;lead.append(mark);copy.append(el('span',title,'bt-palette-title'),el('span',subtitle,'bt-palette-sub'));node.append(lead,copy);const index=rows.length;node.onpointermove=()=>activate(index,false);node.onclick=()=>{close();Promise.resolve().then(run).catch(e=>notice(e.message||'无法打开搜索结果。'));};rows.push({node,run});list.append(node);}
  function names(){
    rows=[];list.replaceChildren();cursor=0;
    const q=input.value.trim().toLocaleLowerCase(),state=getState(),matches=[];
    for(const [kind,items] of [['bot',state.bots],['room',state.rooms]])for(const item of items){if(!q||[item.name,item.roleLabel,kind==='bot'?(item.role==='Administrator'?'管理员 主 Bot':'执行成员'):'群聊'].some(s=>String(s||'').toLocaleLowerCase().includes(q)))matches.push({kind,item});}
    if(matches.length)list.append(el('div','Bot 和群聊','bt-palette-section'));
    for(const {kind,item} of matches.slice(0,40))add(item.name,(item.hidden?'已隐藏 · ':'')+(kind==='room'?item.members.length+' 位成员':item.roleLabel|| (item.role==='Administrator'?'主 Bot':'Bot')),kind==='bot'?avatar(item,24,false,false):cluster(item),()=>openChat(kind,item.id));
    activate(0,false);clear.hidden=!input.value;return q;
  }
  async function search(){
    const ticket=++generation,q=names();status.replaceChildren();if(!q){status.textContent='↑ ↓ 选择 · Enter 打开 · Esc 关闭';return;}
    status.textContent='正在搜索消息和附件…';
    try{const result=await call('team.history.search',{query:q});if(disposed||ticket!==generation||!dialog.open)return;
      if(result.results?.length)list.append(el('div','消息与附件','bt-palette-section'));
      for(const hit of result.results||[])add(hit.name+' · '+hit.who,hit.text,icon('ChatsIcon'),()=>hit.archived?openArchived(hit):openChat(hit.kind,hit.targetId,hit.lineId));
      if(!rows.length){const empty=el('div','','bt-palette-empty');empty.append(el('span','没有找到结果','bt-palette-empty-label'),el('span','试试 Bot 名称、消息内容或附件名。','bt-palette-empty-hint'));list.append(empty);}
      activate(cursor,false);status.textContent=rows.length+' 条结果 · ↑ ↓ 选择 · Enter 打开';
    }catch{if(ticket!==generation||!dialog.open)return;status.replaceChildren(el('span','消息搜索失败，已保留 Bot 和群聊结果。'));const retry=el('button','重试');retry.type='button';retry.onclick=search;status.append(retry);}
  }
  input.oninput=()=>{++generation;clearTimeout(timer);names();status.textContent='正在搜索…';timer=setTimeout(search,180);};clear.onclick=()=>{input.value='';search();input.focus();};
  input.onkeydown=e=>{if(e.isComposing||e.keyCode===229)return;if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();if(e.key==='Enter')rows[cursor]?.node.click();else activate(cursor+(e.key==='ArrowDown'?1:-1));}};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{generation++;clearTimeout(timer);});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});

  const bar=el('div','','pi-chat-find'),find=el('input'),count=el('span','','pi-find-count'),prev=el('button','','bt-round'),next=el('button','','bt-round'),dismiss=el('button','','bt-round');bar.hidden=true;find.placeholder='在当前聊天中查找';find.setAttribute('aria-label','在当前聊天中查找');count.setAttribute('role','status');
  for(const [button,label,glyph] of [[prev,'上一个匹配','ChevronLeftIcon'],[next,'下一个匹配','ChevronRightIcon'],[dismiss,'关闭聊天查找','CloseIcon']]){button.type='button';button.title=label;button.setAttribute('aria-label',label);button.append(icon(glyph));}bar.append(icon('SearchIcon'),find,count,prev,next,dismiss);header.after(bar);
  let hits=[],at=0,frame=0,lastQuery='';const allKey='pi-bot-find',activeKey='pi-bot-find-active';
  function clean(){if(globalThis.CSS?.highlights){CSS.highlights.delete(allKey);CSS.highlights.delete(activeKey);}for(const n of transcript.querySelectorAll('[data-find-current]'))n.removeAttribute('data-find-current');}
  function showHit(scroll){clean();count.textContent=hits.length?(at+1)+' / '+hits.length:'无匹配';prev.disabled=next.disabled=!hits.length;if(!hits.length)return;const hit=hits[at];if(globalThis.CSS?.highlights&&globalThis.Highlight){CSS.highlights.set(allKey,new Highlight(...hits.map(h=>h.range)));CSS.highlights.set(activeKey,new Highlight(hit.range));}hit.line.setAttribute('data-find-current','');if(scroll)reveal(hit.range.startContainer.parentElement);}
  function scan(scroll=false){
    const q=find.value.trim().toLocaleLowerCase(),prior=hits[at],identity=prior&&[prior.line.dataset.lineId,prior.offset];hits=[];
    if(q)for(const line of transcript.querySelectorAll('[data-line-id]')){
      const bubble=line.querySelector('.bt-ububble,.bt-bubble');if(!bubble)continue;
      const walker=document.createTreeWalker(bubble,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('button,script,style,[hidden]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}),nodes=[];let node,text='';
      while(node=walker.nextNode()){nodes.push({node,start:text.length});text+=node.textContent;}
      let offset=0;const lower=text.toLocaleLowerCase();
      while(hits.length<1000&&(offset=lower.indexOf(q,offset))!==-1){const end=offset+q.length,startNode=nodes.findLast(n=>n.start<=offset),endNode=nodes.findLast(n=>n.start<end);if(startNode&&endNode){const range=document.createRange();range.setStart(startNode.node,offset-startNode.start);range.setEnd(endNode.node,end-endNode.start);hits.push({range,line,offset});}offset=end;}
      if(hits.length>=1000)break;
    }
    const kept=q===lastQuery&&identity?hits.findIndex(h=>h.line.dataset.lineId===identity[0]&&h.offset===identity[1]):-1;at=kept>=0?kept:0;lastQuery=q;if(!q){clean();count.textContent='';prev.disabled=next.disabled=true;return;}showHit(scroll);
  }
  function closeFind(){bar.hidden=true;clean();hits=[];cancelAnimationFrame(frame);frame=0;}
  function step(delta){if(hits.length){at=(at+delta+hits.length)%hits.length;showHit(true);}}
  find.oninput=()=>scan(true);find.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeFind();}if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1);}};prev.onclick=()=>step(-1);next.onclick=()=>step(1);dismiss.onclick=closeFind;
  const observer=new MutationObserver(()=>{if(!bar.hidden&&!frame)frame=requestAnimationFrame(()=>{frame=0;scan(false);});});observer.observe(transcript,{subtree:true,childList:true,characterData:true});
  return {open(query=''){if(!dialog.open)dialog.showModal();input.value=query;search();input.focus();input.select();},find(){bar.hidden=false;scan(false);find.focus();find.select();},closeFind,dispose(){disposed=true;close();closeFind();observer.disconnect();dialog.remove();bar.remove();}};
}
