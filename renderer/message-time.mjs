import {el} from './dom.mjs';
export function messageTime(value){
  if(value===undefined||value===null||value==='')return null;
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  return {iso:date.toISOString(),label:date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),full:date.toLocaleString('zh-CN')};
}
export function replyDuration(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return '';
  const seconds=Math.floor(value/1000);
  if(seconds<1)return '<1 秒';
  return seconds<60?seconds+' 秒':Math.floor(seconds/60)+' 分'+(seconds%60?' '+seconds%60+' 秒':'');
}
// Metadata changes only with persisted messages; streaming never needs a clock timer.
export function stampMessages(transcript,lines){
  const rows=new Map([...transcript.querySelectorAll('[data-line-id]')].map(node=>[node.dataset.lineId,node]));
  for(const line of lines){
    const row=rows.get(line.id);if(!row)continue;
    const time=messageTime(line.at),duration=!line.progress&&line.who!=='User'?replyDuration(line.durationMs):'';
    let meta=row.querySelector('.pi-message-meta'),took=row.querySelector('.pi-message-duration');
    if(time){
      if(!meta){meta=el('span','','pi-message-meta');meta.append(el('time'));}
      const clock=meta.querySelector('time');if(clock.dateTime!==time.iso){clock.textContent=time.label;clock.dateTime=time.iso;clock.title=time.full;}
      const target=row.querySelector('.bt-tools')||row;if(meta.parentElement!==target)target.append(meta);
    }else meta?.remove();
    if(duration){
      if(!took){took=el('span','','pi-message-duration');took.title='从开始处理到本次回复结束';(row.querySelector('.bt-group-name')||row).append(took);}
      const label='耗时 '+duration;if(took.textContent!==label)took.textContent=label;
    }else took?.remove();
  }
}
