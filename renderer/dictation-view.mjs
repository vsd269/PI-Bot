import {el,icon} from './dom.mjs';
import {createDictationWave} from './dictation-wave.mjs';
export function createDictationView({host,button,onStop,onCancel,enabled=()=>true}){
  const pill=el('div','','pi-dictation');pill.hidden=true;pill.setAttribute('aria-label','语音输入状态');
  const wave=el('div','','pi-dictation-wave');wave.setAttribute('aria-hidden','true');const bars=Array.from({length:17},()=>{const bar=el('i');wave.append(bar);return bar;});
  const label=el('span','','pi-dictation-label');label.setAttribute('role','status');const duration=el('span','','pi-dictation-duration'),hint=el('kbd','Alt V');
  const stop=el('button','','pi-dictation-stop');stop.type='button';stop.title='停止并转写';stop.setAttribute('aria-label','停止录音并转写');stop.append(el('i'));
  const cancel=el('button','','pi-dictation-cancel');cancel.type='button';cancel.title='取消（Esc）';cancel.setAttribute('aria-label','取消语音输入');cancel.append(icon('CloseIcon'));
  pill.append(wave,label,duration,hint,stop,cancel);host.append(pill);let phase='',since=0,seconds=-1;
  const waveform=createDictationWave(bars.length),motion=matchMedia('(prefers-reduced-motion: reduce)');
  stop.onclick=onStop;cancel.onclick=onCancel;
  const shortcut='语音输入（Alt+V；备用 Ctrl+Shift+Space）';button.title=shortcut;button.setAttribute('aria-keyshortcuts','Alt+V Control+Shift+Space');
  const keydown=event=>{
    if(!enabled()||event.repeat||event.isComposing||event.keyCode===229)return;
    const tree=host.getRootNode();
    // Host settings may suspend the entire plugin layer. An open dialog inside
    // this Bot also owns keyboard input until it closes.
    if(tree.host?.closest('[inert],[hidden]')||tree.querySelector('dialog[open]'))return;
    const primary=(event.code==='KeyV'||event.key?.toLowerCase()==='v')&&event.altKey&&!event.ctrlKey&&!event.shiftKey&&!event.metaKey;
    const legacy=(event.code==='Space'||event.key===' ')&&event.ctrlKey&&event.shiftKey&&!event.altKey&&!event.metaKey;
    const escape=event.key==='Escape'&&!!phase;
    if(!primary&&!legacy&&!escape)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(escape)onCancel();else void Promise.resolve(onStop()).catch(()=>{});
  };window.addEventListener('keydown',keydown,true);
  return {update(text,continuous,details={}){
    const next=continuous?'':details.phase||'';
    if(next!==phase){
      if(next==='listening'){since=performance.now();seconds=-1;waveform.reset();}phase=next;pill.dataset.phase=next;
      pill.hidden=!['starting','listening','transcribing'].includes(next);button.setAttribute('aria-pressed',String(!pill.hidden));button.dataset.voicePhase=next;button.title=next==='listening'?'停止并转写（Alt+V）':next==='transcribing'?'正在转写…':next==='starting'?'正在开启麦克风…':shortcut;button.setAttribute('aria-label',button.title);
      label.textContent={starting:'正在开启麦克风',listening:'正在录音',transcribing:'正在转写'}[next]||'';stop.hidden=next!=='listening';duration.hidden=next!=='listening';hint.hidden=next==='transcribing';
    }
    if(next==='listening'){
      const now=performance.now(),elapsed=Math.floor((now-since)/1000);if(elapsed!==seconds){seconds=elapsed;duration.textContent=Math.floor(elapsed/60)+':'+String(elapsed%60).padStart(2,'0');}
      waveform.frame(details.level,now,motion.matches).forEach((scale,i)=>{bars[i].style.transform=`scaleY(${scale.toFixed(4)})`;});
    }
  },dispose(){window.removeEventListener('keydown',keydown,true);pill.remove();}};
}
