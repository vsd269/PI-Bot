import {el} from './dom.mjs';
export function createAttention({body,show,call,isCurrent,selectChat,close,notice,recovery}){
  const action=(label,run)=>{const b=el('button',label,'soft-button');b.type='button';b.onclick=async()=>{if(b.disabled)return;b.disabled=true;const prior=b.textContent;b.textContent='正在处理…';try{await run();}catch(error){notice(error.message||'处理未完成，请重试。');}finally{if(b.isConnected){b.disabled=false;b.textContent=b.dataset.restLabel||prior;}}};return b;};
  async function open(category='needs',offset=0){
    const ticket=show('待处理',{page:'attention'}),loading=el('p','正在读取…');loading.setAttribute('role','status');body.append(loading);
    let result;try{result=await call('team.attention',{category,offset,limit:20});}catch(error){if(isCurrent(ticket)){loading.textContent=error.message||'读取失败，请重试。';body.append(action('重新读取',()=>open(category,offset)));}return;}if(!isCurrent(ticket))return;body.replaceChildren();
    if(offset&&offset>=result.total)return open(category,Math.max(0,Math.floor((result.total-1)/20)*20));
    const tabs=el('div','','bt-actions');for(const [key,label] of [['needs','需要我处理'],['issues','运行异常'],['done','已完成待查看']]){const b=action(label+' · '+result.counts[key],()=>open(key));b.setAttribute('aria-pressed',String(key===category));tabs.append(b);}body.append(tabs,el('p',result.note,'feature-note'));
    if(!result.rows.length)body.append(el('p','当前没有这类项目。','feature-note'));
    for(const row of result.rows){
      const card=el('section','','feature-card'),controls=el('div','','bt-actions');card.append(el('strong',row.title),el('p',row.detail));if(row.at&&Number.isFinite(Date.parse(row.at)))card.append(el('small',new Date(row.at).toLocaleString()));
      if(row.task)card.append(el('p',row.task));
      if(row.botId||row.roomId)controls.append(action('打开原聊天',()=>{selectChat(row.roomId?'room':'bot',row.roomId||row.botId);close();}));
      if(row.sessionId)controls.append(action('打开原生会话',()=>call('team.session.open',{sessionId:row.sessionId})));
      if(['job','delivery','batch'].includes(row.kind))controls.append(action('核对与恢复',()=>recovery()));
      if(row.kind==='store'){
        card.append(el('p','当前插件副本：'+row.localCopy),el('p','外部副本：'+row.externalCopy));
        const keep=action('保留当前插件数据',async()=>{if(keep.dataset.confirm!=='yes'){keep.dataset.confirm='yes';keep.dataset.restLabel='再次点击确认保留';notice('请核对数据目录里的双方副本，再次点击以保留当前插件数据；未完成任务会暂停。');return;}const saved=await call('team.attention',{action:'resolve_store',confirm:true});notice(saved.note);await open('issues');});controls.append(keep);
      }else if(row.category!=='needs')controls.append(action('标为已查看',async()=>{await call('team.attention',{action:'seen',id:row.id,version:row.version});await open(category,offset);}));
      card.append(controls);body.append(card);
    }
    const pager=el('div','','bt-actions');if(offset)pager.append(action('上一页',()=>open(category,Math.max(0,offset-20))));if(result.next!==null)pager.append(action('下一页',()=>open(category,result.next)));pager.append(action('刷新',()=>open(category,offset)));body.append(pager);
  }
  return {open};
}
