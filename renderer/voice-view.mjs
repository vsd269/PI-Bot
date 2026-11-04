import {el,icon} from './dom.mjs';
// A call leaves the chat usable. Expanding the transcript never restarts capture.
export function createVoiceView({host,getTarget,getState,avatar,cluster,onPause,onClose,onSetup}){
  const pane=el('section','','pi-call'),bar=el('div','','pi-call-bar'),face=el('span','','pi-call-avatar'),info=el('div','','pi-call-info'),name=el('strong'),status=el('span','','pi-call-status'),wave=el('span','','pi-call-wave'),body=el('div','','pi-call-transcript'),caption=el('p','','pi-call-caption');
  pane.hidden=true;pane.setAttribute('role','region');pane.setAttribute('aria-label','语音对话');status.setAttribute('role','status');body.hidden=true;body.setAttribute('role','log');body.setAttribute('aria-label','通话文字记录');
  for(let i=0;i<5;i++)wave.append(el('i'));info.append(name,status);
  function button(label,glyph,action){const b=el('button','','pi-call-control');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(glyph));b.onclick=action;return b;}
  const setup=button('语音设置','SlidersIcon',()=>{onClose();onSetup();}),toggle=button('展开通话文字','TranscriptIcon',()=>{body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));toggle.setAttribute('aria-label',body.hidden?'展开通话文字':'收起通话文字');toggle.title=toggle.getAttribute('aria-label');if(!body.hidden)body.scrollTop=body.scrollHeight;}),pause=button('暂停聆听','MicIcon',onPause),end=button('结束语音对话','CallEndIcon',onClose);
  end.classList.add('pi-call-end');toggle.setAttribute('aria-expanded','false');bar.append(face,wave,info,setup,toggle,pause,end);pane.append(bar,body);host.append(pane);let markKey='',turnKey=null;
  return {update(text,active,details={}){
    pane.hidden=!active;if(!active){markKey=turnKey=null;body.replaceChildren();body.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','展开通话文字');toggle.title='展开通话文字';return;}
    const target=getTarget(),state=getState(),item=(target?.kind==='room'?state.rooms:state.bots).find(v=>v.id===target?.id);if(!item)return;
    const key=JSON.stringify([target,item.avatar,item.color,item.members]);if(markKey!==key){markKey=key;face.replaceChildren(target.kind==='room'?cluster(item,36,false):avatar(item,36,false,false));}
    name.textContent=item.name;status.textContent=text;pane.dataset.phase=details.phase||'';wave.style.setProperty('--level',Math.min(1,Math.max(0,details.level||0)));pause.setAttribute('aria-pressed',String(!!details.paused));pause.setAttribute('aria-label',details.paused?'恢复聆听':'暂停聆听');pause.title=pause.getAttribute('aria-label');if(pause.classList.contains('is-muted')!==!!details.paused){pause.classList.toggle('is-muted',!!details.paused);pause.replaceChildren(icon(details.paused?'MicOffIcon':'MicIcon'));}
    const turns=details.transcript||[],nearBottom=body.scrollHeight-body.scrollTop-body.clientHeight<60;
    if(turns!==turnKey){turnKey=turns;body.replaceChildren();for(const turn of turns){const row=el('div','','pi-call-turn pi-call-'+turn.role);row.append(el('small',turn.role==='user'?'你':item.name),el('p',turn.text));body.append(row);}body.append(caption);}
    caption.textContent=details.caption||'';caption.hidden=!caption.textContent||['thinking','speaking'].includes(details.phase);if(nearBottom)body.scrollTop=body.scrollHeight;
  },dispose(){pane.remove();}};
}
