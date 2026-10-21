import {createUpdateNotice} from './update-notice.mjs';
import {createInteractionMotion,createListMotion,menuVisible,aboutContent} from './interaction-motion.mjs';
import {uploadFile} from './attachment-upload.mjs';
import {createVoiceView} from './voice-view.mjs';
import {createVoice} from './voice.mjs';
import {createDictationView} from './dictation-view.mjs';
import {createMicrophoneSettings} from './microphone-settings.mjs';
import {panelCapture} from './microphone-client.mjs';
import {lookOf,defaultColor,MAIN_LOOK} from './upstream/characters.mjs';
import {inkText} from './upstream/inks.mjs';
import {clusterSeats} from './upstream/cluster.mjs';
import {el,icon} from './dom.mjs';
import {mark,avatarTrigger,avatarEditor} from './avatar-editor.mjs';
import {createFeatures,applyPreferences} from './features.mjs';
import {applyChatColors} from './chat-colors.mjs';
import {createChatSearch} from './chat-search.mjs';
import {createChatShortcuts,createTextQuote,insertQuote,userQuote,recentEmoji,rememberEmoji} from './chat-interactions.mjs';
import {createActiveRead} from './active-read.mjs';
import {mentionSpans} from './upstream/mentions.mjs';
import {markdown} from './markdown.mjs';
import {createAppearanceSaver} from './appearance-saver.mjs';
import {createPreferenceSaver} from './preference-saver.mjs';
import {createSettingsPickers} from './settings-pickers.mjs';
import {createContextMenu,revealScrollThumb} from './context-menu.mjs';
import {followHostTheme} from './host-theme.mjs';
import {createTranscriptNavigation} from './transcript-navigation.mjs';
import {createOutbox} from './outbox.mjs';
import {createNewChat} from './new-chat.mjs';
import {createBotPage} from './create-bot.mjs';
import {createDrawerMotion} from './drawer-motion.mjs';
import {createDetailsPreview} from './details-preview.mjs';
import {createQuestions} from './questions.mjs';
import {createViews} from './views.mjs';
import {activityLabel,memberWork,createMemberDock} from './member-status.mjs';
import {botSettingsMarkup,roomSettingsMarkup} from './settings-markup.mjs';
import {attachAvatarMotion} from './avatar-motion.mjs';
import {sidebarUnread} from './sidebar-unread.mjs';
import {createLiveResponses} from './live-responses.mjs';
import {createStateSync} from './state-sync.mjs';
import {createMemoryNotice} from './memory-notice.mjs';
import {preserveTextSelection} from './text-selection.mjs';
import {stampMessages} from './message-time.mjs';
const statuses={queued:'等待本成员',launching:'启动中',running:'执行中',waiting:'待工具审批',waiting_teammates:'等待队友交回',completed:'已结束',not_started:'未执行',needs_review:'待检查',error:'失败',aborted:'已中断',interrupted:'启动被中断'};
function readable(value){try{const parsed=JSON.parse(value);if(typeof parsed.reply==='string')return parsed.reply;}catch{}return value;}
function avatar(bot,size=36,working=false,live=true,options={}){const span=mark(lookOf(bot),size,live,{id:bot?.id||'',...options});if(working)span.dataset.state=typeof working==='string'?working:'working';return span;}
const markup=[
  '<div class="pi-bot-app"><aside class="sidebar"><div class="bt-side-top"><button id="sidebar-hide" class="bt-round" title="收起侧栏" aria-label="收起侧栏"></button><span class="bt-brand" id="brand"><span style="font-weight:600;font-size:14px">PI Bot</span></span><button id="search-toggle" class="bt-round" title="搜索会话" aria-label="搜索会话"></button><button id="new" class="bt-round" title="新建" aria-label="新建"></button></div><div id="new-menu" class="bt-menu" role="menu" hidden><button id="add-bot" role="menuitem"><span class="bt-menu-label">创建机器人</span></button><button id="add-room" role="menuitem"><span class="bt-menu-label">创建群聊</span></button></div><label class="sidebar-search" id="search-wrap" hidden><input id="search" placeholder="搜索机器人和群聊" aria-label="搜索机器人和群聊"></label><div class="bt-side"><div class="bt-list" id="list" aria-label="机器人和群聊"></div><div id="settings-menu" class="bt-menu bt-menu-up bt-account-menu" role="menu" aria-label="设置" hidden><button id="usage-item" class="bt-menu-item" role="menuitem"></button><button id="connectors-item" class="bt-menu-item" role="menuitem"></button><button id="automation-item" class="bt-menu-item" role="menuitem"></button><button id="bot-settings-item" class="bt-menu-item" role="menuitem"></button><button id="general-item" class="bt-menu-item" role="menuitem">外观与记忆设置</button><button id="history-item" class="bt-menu-item" role="menuitem">搜索聊天记录</button><button id="capabilities-item" class="bt-menu-item" role="menuitem">能力库</button><button id="recovery-item" class="bt-menu-item" role="menuitem">任务恢复中心</button><button id="secrets-item" class="bt-menu-item" role="menuitem">Bot 密钥管理</button><button id="backup-item" class="bt-menu-item" role="menuitem">备份与恢复</button><button id="extensions-item" class="bt-menu-item" role="menuitem">扩展功能</button><button id="about-item" class="bt-menu-item" role="menuitem">关于 PI-bot</button></div><div class="bt-side-foot"><button id="account" class="bt-round" title="设置" aria-label="设置"></button><button id="native" class="bt-return" title="连接插件"><span>连接插件</span></button></div></div></aside>',
  '<section class="conversation"><header class="conversation-header"><button id="sidebar-show" class="bt-round pi-sidebar-show" aria-label="展开侧栏" title="展开侧栏" hidden></button><div class="bt-head"><button id="title" class="bt-pill" aria-label="查看会话详情" aria-expanded="false"></button></div><div class="pi-header-actions" role="group" aria-label="聊天工具"></div></header><div id="permission-context" class="pi-permission-context" role="status" hidden></div><div id="chat" class="chat"><div id="transcript" class="transcript" aria-live="polite"></div></div><div class="composer-wrap"><form id="send" class="composer" data-composer-card><button type="button" id="plus" class="bt-plus" aria-label="添加" title="添加" aria-expanded="false"></button><div id="attachments-draft" class="attachments-draft" hidden></div><textarea id="content" placeholder="发送消息" aria-label="消息" required rows="1"></textarea><button type="button" id="dictate" class="bt-round pi-composer-voice bt-mic" aria-label="语音输入" title="语音输入"></button><button type="button" id="continuous-voice" class="bt-round pi-composer-voice pi-call-button bt-voice" aria-label="语音对话" title="语音对话"></button><button type="submit" class="send-button _primary" id="submit" disabled aria-label="发送消息"></button></form><div class="bt-menu bt-menu-up bt-plus-menu" id="plus-menu" role="menu" aria-label="添加" hidden><button id="attach" role="menuitem"><span class="bt-menu-label">添加文件</span></button><button id="reference" role="menuitem"><span class="bt-menu-label">引用对话</span></button><button id="schedule" role="menuitem"><span class="bt-menu-label">定时任务</span></button></div></div><aside class="details-drawer bt-panel-view" id="details-drawer" hidden><div class="bt-drawer-top" id="detail-top"><button id="edit" class="bt-round" title="编辑会话" aria-label="编辑会话" data-info-row="settings"></button><button id="detail-browser" class="bt-round" title="打开浏览器" aria-label="打开浏览器"></button><button id="share" class="bt-round" title="复制会话" aria-label="复制会话"></button><button id="close-details" class="bt-round" aria-label="关闭详情"></button></div><div class="bt-drawer-id" id="detail-id"></div><div id="detail-tabs" class="bt-tabs"></div><div class="bt-drawer-body" id="detail-body"></div><div id="settings-body" class="bt-drawer-body bt-set-body" hidden></div></aside><aside class="task-drawer" id="task-drawer" hidden><div class="bt-drawer-top"><button id="close-tasks" class="bt-round" aria-label="关闭任务"></button></div><h2>执行任务</h2><div id="jobs"></div></aside></section>',
  '<div id="notice" class="notice" role="status" hidden><span id="notice-text"></span><button id="dismiss" aria-label="关闭提示">×</button></div>',
  botSettingsMarkup,
  '<dialog id="memory-dialog"><form method="dialog" class="memory-form"><header><button id="memory-close" type="button" aria-label="返回设置">‹</button><h2>长期记忆</h2></header><div id="memory-list"></div><textarea id="memory-new" placeholder="告诉机器人要长期记住什么…" aria-label="新增记忆"></textarea><footer><button type="button" id="memory-add">添加记忆</button><button value="cancel">关闭</button></footer></form></dialog>',
  roomSettingsMarkup
].join('');
export async function mount(target,invoke,onNative,embedded=false){
  const shadow=target.attachShadow({mode:'open'});
  const styles=[];
  for(const file of ['upstream/style.css','upstream/settings-pages.css','style.css']){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL(file,import.meta.url).href;styles.push(new Promise(resolve=>{link.onload=resolve;link.onerror=resolve;}));shadow.append(link);}
  const container=el('div');container.style.cssText='height:100%;visibility:hidden';container.innerHTML=markup;shadow.append(container);
  Promise.all(styles).then(()=>{container.style.visibility='';});
  const $=id=>shadow.getElementById(id),app=container.firstElementChild,stopAvatarMotion=attachAvatarMotion(app),interactionMotion=createInteractionMotion(app),listMotion=createListMotion($('list'));
  const startup=el('div','','pi-startup');startup.setAttribute('role','status');startup.innerHTML='<span class="pi-startup-dot" aria-hidden="true"></span><span>正在载入机器人与会话…</span>';app.append(startup);app.setAttribute('aria-busy','true');
  if(embedded)app.setAttribute('data-pi-window','');
  app.querySelector('.bt-side-top').setAttribute('aria-label','PI Bot 顶栏');
  const splitter=document.createElement('div');splitter.className='pi-bot-splitter';splitter.setAttribute('role','separator');splitter.setAttribute('aria-label','调整侧栏宽度');container.append(splitter);
  if(embedded)splitter.style.top='46px';
  const savedWidth=Math.max(220,Math.min(420,Number(localStorage.getItem('pi-bot.sidebarWidth'))||280));app.style.setProperty('--pi-sidebar-width',savedWidth+'px');
  let dragging=false;
  splitter.onpointerdown=event=>{dragging=true;splitter.setPointerCapture?.(event.pointerId);splitter.classList.add('dragging');};
  splitter.onpointermove=event=>{if(!dragging)return;const rect=app.getBoundingClientRect();const width=Math.max(220,Math.min(420,event.clientX-rect.left));app.style.setProperty('--pi-sidebar-width',width+'px');localStorage.setItem('pi-bot.sidebarWidth',String(Math.round(width)));};
  splitter.onpointerup=()=>{dragging=false;splitter.classList.remove('dragging');};
  let editing=false,settingsRequest=false,settingsFormKind=null;const expandedDetails=new Set(),openRoomAbout=new Set();let transcriptSelection='';
  let streamShape='';
  let state={bots:[],rooms:[],jobs:[]},selected=null,refreshing=false,closed=false,chatKey='',animationSelection='',seenLines=new Set(),listKey='',titleKey='',chosenAvatar='',booting=true;
  try{selected=JSON.parse(localStorage.getItem('pi-bot.selection')||'null');}catch{}
  const notice=value=>{$('notice-text').textContent=value;$('notice').hidden=!value;};
  async function call(channel,payload){try{return await invoke(channel,payload);}catch(error){notice(error.message||String(error));throw error;}}
  const bot=id=>state.bots.find(b=>b.id===id),current=()=>selected?.kind==='room'?state.rooms.find(r=>r.id===selected.id):bot(selected?.id);
  const liveResponses=createLiveResponses({getState:()=>state,hasPending:()=>outbox.lines(selected).some(e=>e.delivery==='sending'||e.delivery==='received'),onChange:()=>{if(!booting&&!closed)render();},onEnded:()=>refresh().catch(()=>{})});
  const memoryNotice=createMemoryNotice({onChange:()=>{if(!closed)render();}});let memoryTarget=null;
  let attachmentsDraft=[],referencesDraft=[],answerSending=false;
  const chatQuestions=()=>(state.questions||[]).filter(q=>['pending','answered','dismissed'].includes(q.status)&&(selected?.kind==='room'?q.roomId===selected.id:!q.roomId&&q.botId===selected?.id));
  const questionsUI=createQuestions({app,getQuestions:chatQuestions,answer:async input=>{await call('team.question.answer',input);await refresh();},nameOf:id=>bot(id)?.name||'Bot',onError:error=>notice(error.message||String(error))});
  const composerDrafts=new Map(),selectionKey=value=>value?value.kind+':'+value.id:'';
  const outbox=createOutbox({send:entry=>invoke(entry.target.kind==='room'?'team.group.send':'team.private.send',{[entry.target.kind==='room'?'roomId':'botId']:entry.target.id,content:entry.content,attachments:entry.attachments,references:entry.references,clientMessageId:entry.id}),onChange:()=>{if(!closed){render();refresh().catch(()=>{});}}});
  const features=createFeatures({app,call,getState:()=>state,update:value=>{state=value;render();},savePreferences:patch=>preferenceSaver.choose(patch),selectChat:select,onNative,notice,avatar,cluster,assignCapabilities:input=>rosterMutation(async()=>{
    const result=await call('team.capability.attach',input);
    for(const item of result.assignments||[]){const target=bot(item.botId);if(target)target.capabilities=item.names;}
    render();return result;
  }),editEntity:(kind,value)=>{settingsRequest=true;return kind==='bot'?editBot(value):editRoom(value);}});
  const voice=createVoice({call,captureAudio:embedded?panelCapture(call):undefined,getTarget:()=>selected,getState:()=>state,notice,insert:text=>{$('content').value+=($('content').value?'\n':'')+text;$('content').dispatchEvent(new Event('input'));$('content').focus();},send:(text,target)=>outbox.submit(target,text,[],[]),onStatus:(text,continuous,details)=>{dictationView?.update(text,continuous,details);$('continuous-voice').setAttribute('aria-pressed',String(continuous));voiceView?.update(text,continuous,details);}});
  const dictationView=createDictationView({host:app.querySelector('.composer-wrap'),button:$('dictate'),onStop:()=>voice.toggle(),onCancel:()=>voice.stop(),enabled:()=>!closed&&!target.inert&&target.getBoundingClientRect().width>0&&getComputedStyle(target).display!=='none'});
  const microphoneSettings=createMicrophoneSettings({host:app,call,notice});const openMicrophone=()=>void microphoneSettings.open();app.addEventListener('pi-microphone-setup',openMicrophone);
  let voiceView=createVoiceView({host:app.querySelector('.conversation'),getTarget:()=>selected,getState:()=>state,avatar,cluster,onPause:()=>voice.pause(),onClose:()=>voice.stop(),onSetup:()=>features.extensions(selected?.kind==='bot'?selected.id:undefined).catch(()=>{})});
  const chatViews=()=>(state.views||[]).filter(view=>!view.roomId&&selected?.kind==='bot'&&view.botId===selected.id);
  const viewsUI=createViews({app,getViews:chatViews,answer:async input=>{await call('team.view.answer',input);await refresh();},nameOf:id=>bot(id)?.name||'Bot',onError:error=>notice(error.message||String(error))});
  const voiceMode=event=>{if(event.detail===false){voice.stop();microphoneSettings.close();}};window.addEventListener('pi-bot:mode',voiceMode);
  $('dictate').onclick=()=>voice.toggle();$('continuous-voice').onclick=()=>voice.continuous();
  $('extensions-item').onclick=()=>{menuVisible($('settings-menu'),false);features.extensions(selected?.kind==='bot'?selected.id:undefined).catch(()=>{});};
  const contextMenu=createContextMenu({app,run:contextAction,onError:error=>notice(error.message||String(error))});
  function setSidebar(collapsed){app.toggleAttribute('data-sidebar-collapsed',collapsed);app.querySelector('.bt-side').classList.toggle('bt-rail',collapsed);$('sidebar-show').hidden=true;splitter.hidden=collapsed;$('sidebar-hide').setAttribute('aria-label',collapsed?'展开侧栏':'收起侧栏');$('sidebar-hide').title=collapsed?'展开侧栏':'收起侧栏';localStorage.setItem('pi-bot.sidebarCollapsed',String(collapsed));}
  $('sidebar-hide').append(icon('SidebarIcon'));$('sidebar-show').append(icon('SidebarIcon'));
  $('sidebar-hide').onclick=()=>setSidebar(!app.hasAttribute('data-sidebar-collapsed'));$('sidebar-show').onclick=()=>setSidebar(false);setSidebar(localStorage.getItem('pi-bot.sidebarCollapsed')==='true');
  const stopScrollReveal=revealScrollThumb($('list'));
  const listArea=el('div','','pi-sidebar-list-area');$('list').before(listArea);listArea.append($('list'));const stopUnread=sidebarUnread($('list'));
  const drawer=createDrawerMotion({panel:$('details-drawer'),conversation:app.querySelector('.conversation'),trigger:$('title'),onClose:()=>detailsPreview.close()});
  const detailsPreview=createDetailsPreview({app,body:$('detail-body'),tabs:$('detail-tabs'),getState:()=>state,getSelection:()=>selected,isActive:()=>!editing&&drawer.isOpen(),call,
    patch:async(id,patch)=>{state=appearanceSaver.overlay(await call('team.bot.patch',{id,patch}));render();},
    setPermission:async(botId,permissionMode)=>{state=appearanceSaver.overlay(await call('team.bot.permission',{botId,permissionMode}));render();},
    openSettings:item=>editBot(item),openNative:openBotNative,openBrowser:item=>features.openBrowser(item),openMemory:item=>features.memory(item),openSchedules:item=>features.schedules(undefined,item.id),openUsage:()=>features.usage()});
  async function openBotNative(item){const cached=detailsPreview.preview(item.id),sessionId=item.sessions?.private||cached?.sessionId||state.jobs.findLast(j=>j.botId===item.id&&!j.roomId&&j.sessionId)?.sessionId;if(!sessionId){notice('请先向该 Bot 发送一次任务，再打开原生会话。');return;}await call('team.session.open',{sessionId});onNative();}
  const transcriptNavigation=createTranscriptNavigation({scroller:$('chat'),transcript:$('transcript'),composer:app.querySelector('.composer-wrap')});
  const interactive=()=>!closed&&!target.inert&&!target.closest('[hidden],[inert]')&&target.getBoundingClientRect().width>0&&getComputedStyle(target).display!=='none';
  const activeRead=createActiveRead({getSelection:()=>selected,getItem:current,getStamp:item=>JSON.stringify([item?.chat?.at(-1),item?.log?.at(-1),state.jobs.filter(j=>selected?.kind==='room'?j.roomId===selected.id:j.botId===selected?.id&&!j.roomId).map(j=>[j.id,j.status,j.endedAt,j.result?.length])]),enabled:()=>!booting&&interactive()&&document.visibilityState==='visible'&&document.hasFocus(),acknowledge:({kind,id})=>invoke('team.pin',{kind,id,unread:false}),onChange:()=>render()});
  const chatSearch=createChatSearch({app,call:invoke,getState:()=>state,openChat:select,openArchived:hit=>features.archivedHistory(hit),avatar,cluster,transcript:$('transcript'),header:app.querySelector('.conversation-header'),reveal:node=>transcriptNavigation.reveal(node),notice});
  const textQuote=createTextQuote({app,transcript:$('transcript'),input:$('content'),enabled:()=>interactive()&&!features.isSettingsOpen()});
  const memberDock=createMemberDock({composer:app.querySelector('.composer-wrap'),avatar,openGroup:id=>{if(selected?.kind!=='room'||selected.id!==id)select('room',id);if(editing)closeSettings();drawer.set(true);renderDetails();}});
  let detailHeaderKey='',detailRoomKey='';
  let renamingTarget=null;
  const chatLines=(kind,item)=>{
    if(kind==='room'){
      const lines=[...(item?.log||[])];
      for(const job of state.jobs.filter(j=>j.roomId===item?.id)){
        const text=liveResponses.progress(job);if(!text)continue;
        const index=lines.findIndex(l=>l.jobId===job.id);
        const prior=index<0?{}:lines[index];
        const line={...prior,id:prior.id||job.id+':result',jobId:job.id,botId:job.botId,who:bot(job.botId)?.name||'Bot',at:prior.at||job.startedAt||job.at,text,progress:true};
        if(index<0)lines.push(line);else lines[index]=line;
      }
      return lines;
    }
    return [...(item?.chat||[]),...state.jobs.filter(j=>j.botId===item?.id&&!j.roomId&&!j.handoffRootId).flatMap(j=>{
      const partial=liveResponses.progress(j)||j.progress;
      return [{id:j.id+':input',who:j.fromName||'User',attachmentJobId:j.id,attachments:j.attachments,text:j.sourceUserContent||j.task,at:j.at,reaction:j.reactions?.[j.id+':input']},{id:j.id+':result',who:item.name,navigationReply:Boolean(j.result||partial||j.error),text:j.result||partial||j.error||statuses[j.status],progress:Boolean(partial&&!j.result&&['launching','running','waiting'].includes(j.status)),at:j.endedAt||j.at,durationMs:j.durationMs,status:j.status,thinking:j.thinking,toolEvents:j.toolEvents,reaction:j.reactions?.[j.id+':result']}];
    })].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  };
  const busy=id=>Boolean(bot(id)?.planning)||state.jobs.some(j=>j.botId===id&&['running','waiting','launching'].includes(j.status));
  function cluster(room,size=24,live=false){
    const people=room.members.map(bot).filter(Boolean),seats=clusterSeats(Math.min(people.length,4),size),wrap=el('span','','bt-cluster');
    wrap.style.cssText='width:'+size+'px;height:'+size+'px';
    seats.forEach(([x,y,s],index)=>{const seat=el('span');seat.style.cssText='left:'+x+'px;top:'+y+'px;width:'+s+'px;height:'+s+'px';
      if(people.length>4&&index===3){seat.className='bt-cluster-more';seat.textContent='+'+(people.length-3);Object.assign(seat.style,{width:s*.92+'px',height:s*.92+'px',margin:s*.04+'px',fontSize:Math.max(8,Math.round(s*.36))+'px'});}else seat.append(avatar(people[index],s,false,live));wrap.append(seat);});return wrap;
  }
  function select(kind,id,lineId){botCreator.close();chatSearch.closeFind();voice.selectionChanged();contextMenu.close();renamingTarget=null;detailsPreview.reset();if(editing)closeSettings();composerDrafts.set(selectionKey(selected),{content:$('content').value,attachments:attachmentsDraft,references:referencesDraft});selected={kind,id};localStorage.setItem('pi-bot.selection',JSON.stringify(selected));chatKey='';listKey='';const saved=composerDrafts.get(selectionKey(selected));$('content').value=saved?.content||'';attachmentsDraft=saved?.attachments||[];referencesDraft=saved?.references||[];$('content').style.height='30px';hideMentions();renderDraft();render();$('content').style.height=Math.min(150,$('content').scrollHeight)+'px';$('chat').scrollTop=$('chat').scrollHeight;if(lineId){const node=[...$('transcript').querySelectorAll('[data-line-id]')].find(n=>n.dataset.lineId===lineId);if(node)transcriptNavigation.reveal(node);}activeRead.selected();}
  function preview(kind,item){const active=state.jobs.filter(j=>['waiting','running','launching','queued','waiting_teammates'].includes(j.status)&&(kind==='room'?j.roomId===item.id:j.botId===item.id));const job=active.find(j=>j.status==='waiting')||active.find(j=>j.status==='running')||active[0];if(job?.status==='waiting_teammates')return '等 '+(state.botActivity?.[item.id]?.waitingFor||[]).join('、')+' 交回';if(job)return (kind==='room'?bot(job.botId)?.name+' · ':job.roomId?'在 '+(state.rooms.find(r=>r.id===job.roomId)?.name||'群聊')+' · ':'')+activityLabel(job);if(kind==='room')return item.log?.at(-1)?.text||'群聊';const last=state.jobs.filter(j=>j.botId===item.id).at(-1);return last?(last.result||last.error||statuses[last.status]):item.role==='Administrator'?'管理员 · 只分派与汇总':'执行成员';}
  function row(kind,item,tile=false){const button=el('button','','bt-'+(tile?'tile':'row'));button.type='button';button.dataset.id=item.id;button.setAttribute('aria-label',item.name);button.title=item.name;if(selected?.id===item.id)button.setAttribute('aria-current','page');button.onclick=()=>select(kind,item.id);button.oncontextmenu=event=>{event.preventDefault();const rect=button.getBoundingClientRect(),keyboard=event.clientX===0&&event.clientY===0;openRowMenu(kind,item.id,button,keyboard?rect.left+16:event.clientX,keyboard?rect.bottom:event.clientY,keyboard);};button.onkeydown=event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=button.getBoundingClientRect();openRowMenu(kind,item.id,button,rect.left+16,rect.bottom,true);}};button.append(kind==='room'?cluster(item,36):avatar(item,tile?60:36,busy(item.id)));if(kind==='bot'&&item.role==='Administrator'){const badge=el('span','','bt-badge bt-badge-admin');badge.setAttribute('role','img');badge.setAttribute('aria-label','管理员');badge.innerHTML='<svg viewBox="0 0 10 10" aria-hidden="true"><path fill="white" d="M5 .6l1.3 2.8 3 .3-2.3 2 .7 3L5 7.2 2.3 8.7l.7-3L.7 3.7l3-.3z"/></svg>';button.firstElementChild.append(badge);}if(tile){button.append(el('span',item.name,'bt-tile-name'),el('span',state.jobs.some(j=>j.botId===item.id&&j.status==='waiting')?'待审批':'管理员','bt-chip'));}else{const body=el('span','','bt-row-body');body.append(el('span',(item.pinned?'📌 ':'')+item.name,'bt-row-name'),el('span',preview(kind,item).replace(/\s+/g,' ').slice(0,100),'bt-row-preview'));button.append(body);}if(item.unread){const dot=el('span','','bt-unread');dot.setAttribute('aria-label','未读');button.append(dot);}const waiting=kind==='bot'&&state.botActivity?.[item.id]?.state==='waiting_teammates';if(waiting){button.dataset.waitingTeammates='';button.querySelector('.bt-mark')?.setAttribute('data-state','waiting');}return button;}
  function openRowMenu(kind,id,source,x,y,keyboard=false){
    const item=kind==='room'?state.rooms.find(r=>r.id===id):bot(id);if(!item)return;
    const main=kind==='bot'&&item.role==='Administrator',tile=main&&state.bots.find(b=>b.role==='Administrator')?.id===id;
    const entry=(label,ico,action,danger=false)=>({label,icon:ico,action:{kind,id,type:action},danger});
    const groups=[
      [...(tile?[]:[entry(item.pinned?'取消置顶':'置顶','PinIcon','pin')]),entry('标为未读','UnreadIcon','unread')],
      kind==='bot'?[entry('重命名 Bot','PencilIcon','rename'),entry('编辑 Bot','GearIcon','edit'),entry('复制 Bot','DuplicateIcon','duplicate'),...(!main?[entry('设为主机器人','StarLineIcon','main')]:state.bots.filter(b=>b.role==='Administrator').length>1?[entry('取消主机器人身份','StarLineIcon','main')]:[])]:[entry('群聊设置','GearIcon','edit'),entry('重命名群聊','PencilIcon','rename')],
      [entry('复制会话 ID','CopyIcon','copy')],
      main?[]:[entry(item.hidden?'在侧栏显示':'从侧栏隐藏','HideIcon','hide'),entry(kind==='room'?'删除群聊':'删除 Bot','TrashIcon','delete',true)]
    ];
    for(const id of ['new-menu','settings-menu','plus-menu'])menuVisible($(id),false);$('plus').setAttribute('aria-expanded','false');
    contextMenu.open({x,y,groups,source,keyboard,label:item.name+' 操作'});
  }
  async function contextAction({kind,id,type}){
    const item=kind==='room'?state.rooms.find(r=>r.id===id):bot(id);if(!item)throw Error('这个会话已被移除。');
    if(type==='unread')activeRead.manual({kind,id});
    if(type==='edit'){if(editing)closeSettings();return kind==='bot'?editBot(item):editRoom(item);}
    if(type==='rename'){
      select(kind,id);renamingTarget={kind,id};drawer.set(true);renderDetails();const field=$('detail-id').querySelector('input');field?.focus();field?.select();return;
    }
    if(type==='copy'){await navigator.clipboard.writeText(kind==='bot'?(item.sessions?.private||item.id):item.id);notice('会话 ID 已复制。');return;}
    if(type==='duplicate'){const before=new Set(state.bots.map(b=>b.id));state=await call('team.bot.duplicate',{botId:id});const copy=state.bots.find(b=>!before.has(b.id));if(copy)select('bot',copy.id);else render();return;}
    if(type==='main')state=await call('team.bot.patch',{id,patch:{role:item.role==='Administrator'?'Worker':'Administrator'}});
    else if(type==='pin'||type==='hide'||type==='unread')state=await call('team.pin',{kind,id,...(type==='pin'?{pinned:!item.pinned}:type==='hide'?{hidden:!item.hidden}:{unread:true})});
    else if(type==='delete')return kind==='bot'?removeBotFromUI(id):removeRoomFromUI(id);
    state=appearanceSaver.overlay(state);render();
  }
  function render(){
    if(closed)return;state=preferenceSaver.overlay(state);liveResponses.reconcile();memoryNotice.update(state.memoryNews);stopTheme.update();applyPreferences(app,state.prefs);
    if(!current()){selected=state.rooms[0]?{kind:'room',id:state.rooms[0].id}:state.bots[0]?{kind:'bot',id:state.bots[0].id}:null;}
    const item=current(),query=$('search').value.trim().toLowerCase();
    updateChatColors();
    activeRead.check();
    const nextList=JSON.stringify([state.bots,state.rooms.map(r=>[r.id,r.name,r.members,r.pinned,r.hidden,r.unread,r.log?.at(-1)]),state.jobs.map(j=>[j.id,j.status,j.result,j.error,j.progress,j.currentTool,j.currentToolStatus,j.activityPhase,j.toolCalls]),selected,query]);
    if(nextList!==listKey){
      const beforeList=listMotion.before();listKey=nextList;$('list').replaceChildren();
      const chiefs=state.bots.filter(b=>b.role==='Administrator'),chief=chiefs[0];
      if(chief&&!query){const wrap=el('div','','bt-tile-wrap');for(const admin of chiefs)wrap.append(row('bot',admin,true));$('list').append(wrap);}
      const entries=[...state.bots.filter(b=>!chiefs.includes(b)||query).map(item=>({kind:'bot',item})),...state.rooms.map(item=>({kind:'room',item}))].filter(e=>(query||!e.item.hidden)&&e.item.name.toLowerCase().includes(query));
      entries.sort((a,b)=>Number(Boolean(b.item.pinned))-Number(Boolean(a.item.pinned))||String(b.item.log?.at(-1)?.at||b.item.chat?.at(-1)?.at||'').localeCompare(String(a.item.log?.at(-1)?.at||a.item.chat?.at(-1)?.at||'')));
      for(const entry of entries)$('list').append(row(entry.kind,entry.item));listMotion.after(beforeList);
    }
    const news=memoryNotice.latest(item?[item.id]:[]);memoryTarget=news?.id||null;
    $('title').setAttribute('aria-label',news?'记忆已更新，打开 '+item.name+' 的记忆':'查看会话详情');$('title').toggleAttribute('data-memory',Boolean(news));
    const nextTitle=JSON.stringify([news?.at,selected,item?.name,item?.avatar,item?.color,item?.members?.map(id=>{const b=bot(id);return [id,b?.avatar,b?.color];})]);
    if(nextTitle!==titleKey){titleKey=nextTitle;$('title').replaceChildren();if(item){$('title').append(selected.kind==='room'?cluster(item):avatar(item,24,busy(item.id)),el('span',item.name,'bt-pill-name'));}
      else $('title').textContent='PI-bot';
      if(news){const note=el('span','','pi-memory-notice');note.setAttribute('role','status');note.append(icon('MemoryIcon'),el('span','记忆已更新'));$('title').append(note);}
      const go=el('span','','bt-pill-go');go.append(icon('GoArrow'));$('title').append(go);}
    const requests=(state.permissionRequests||[]).filter(r=>selected?.kind==='room'?r.roomId===selected.id:r.botId===selected?.id);$('permission-context').hidden=!requests.length;$('permission-context').textContent=requests.map(r=>'正在等待 PI 确认：'+r.botName+' · '+r.label+'。允许一次后继续，拒绝则停止这次启动。').join('\n');
    $('edit').hidden=!item;$('content').placeholder=item?'发送给 '+item.name:'选择一个机器人或群聊';
    voice.update(state);
    $('submit').disabled=!item||!$('content').value.trim();
    if(drawer.isOpen()&&!editing)renderDetails();
    memberDock.render(state,selected);
    outbox.reconcile(state);
    const lines=[...chatLines(selected?.kind,item),...outbox.lines(selected)].sort((a,b)=>String(a.at).localeCompare(String(b.at))).map(line=>({...line,text:readable(line.text)}));
    const questions=chatQuestions(),views=chatViews();
    const nextChat=JSON.stringify([selected,lines,item?.planning,questions,views,state.bots.map(b=>[b.id,b.name,b.avatar,b.color])]);
    const nextShape=JSON.stringify([selected,lines.map(l=>l.progress?{...l,text:null}:l),item?.planning,questions,views,state.bots.map(b=>[b.id,b.name,b.avatar,b.color])]);
    const restoreSelection=nextChat!==chatKey&&transcriptSelection===selected?.kind+':'+selected?.id?preserveTextSelection($('transcript')):()=>{};
    if(nextChat!==chatKey&&nextShape===streamShape){
      const scrollView=transcriptNavigation.beforeRender(selected?.kind+':'+selected?.id,lines);
      for(const line of lines.filter(l=>l.progress)){
        const wrap=[...$('transcript').querySelectorAll('[data-line-id]')].find(n=>n.dataset.lineId===line.id),bubble=wrap?.querySelector('.bt-bubble');
        if(bubble)bubble.replaceChildren(markdown(line.text,mentionMarkup,href=>call('team.file.open',{kind:selected.kind,id:selected.id,lineId:line.id,href}).catch(()=>{})));
      }
      chatKey=nextChat;transcriptNavigation.afterRender(scrollView);
    }else if(nextChat!==chatKey){streamShape=nextShape;
      const animationKey=selected?.kind+':'+selected?.id,freshConversation=animationSelection!==animationKey;if(freshConversation){seenLines.clear();animationSelection=animationKey;}const active=shadow.activeElement,focus=active?.closest?.('[data-question-id],[data-view-id]'),focusState=focus&&active.matches('textarea,input')?{id:focus.dataset.questionId,viewId:focus.dataset.viewId,name:active.name,action:active.dataset.viewAction,value:active.value,start:active.selectionStart,end:active.selectionEnd}:null;const scroller=$('chat');chatKey=nextChat;const selection=selected?.kind+':'+selected?.id;const scrollView=transcriptNavigation.beforeRender(selection,lines);if(transcriptSelection===selection){for(const node of $('transcript').querySelectorAll('details[data-key]')){if(node.open)expandedDetails.add(node.dataset.key);else expandedDetails.delete(node.dataset.key);}}else{expandedDetails.clear();transcriptSelection=selection;}$('transcript').replaceChildren();
      if(!lines.length&&!questions.length&&!views.length){const empty=el('div','','empty-state');empty.append(avatar(item?.role?item:state.bots.find(b=>b.role==='Administrator'),72),el('h1',item?.name||'PI-bot'),el('p',selected?.kind==='room'?'发送任务，让管理员分工给执行成员。也可以 @成员名 或 @all。':'发送消息，开始与机器人协作。'));$('transcript').append(empty);}
      if(lines.length)$('transcript').append(el('div',new Date(lines[0].at).toLocaleString(),'bt-time-sep'));
      for(const line of [...lines,...questions.map(question=>({question,at:question.at})),...views.map(view=>({view,at:view.at}))].sort((a,b)=>String(a.at).localeCompare(String(b.at)))){
        if(line.view){$('transcript').append(viewsUI.render(line.view));continue;}
        if(line.question){$('transcript').append(questionsUI.render(line.question));continue;}
        if(line.who==='User'){const wrap=el('div','','bt-urow'),bubble=el('div','','bt-ububble');wrap.dataset.lineId=line.id;if(!freshConversation&&!seenLines.has(line.jobId||line.id))wrap.dataset.btEnter='new'; bubble.append(foldMessage(line.text,()=>userQuote(line.text,mentionMarkup),false,1500));appendAttachments(bubble,line);wrap.append(bubble);if(line.delivery){const status=el('div',line.delivery==='failed'?'发送失败':line.delivery==='received'?'已接收':'发送中…','delivery-status');if(line.delivery==='failed'){status.title=line.error||'';const retry=el('button','重试');retry.type='button';retry.onclick=()=>outbox.retry(line.id);const remove=el('button','删除');remove.type='button';remove.title='移除这条发送失败的本地消息';remove.onclick=()=>outbox.discard(line.id);status.append(retry,remove);status.classList.add('message-error');}wrap.append(status);}else wrap.append(messageActions(line.text,line));if(line.reaction)bubble.append(reactionPill(line));$('transcript').append(wrap);continue;}
        const wrap=el('div','','bt-group-msg'),author=bot(line.botId)||state.bots.find(b=>b.name===line.who);wrap.dataset.lineId=line.id;if(!freshConversation&&!seenLines.has(line.jobId||line.id))wrap.dataset.btEnter='new';const nameLine=el('div','','bt-group-name');nameLine.style.color=inkTextOf(author);nameLine.append(line.who+(line.coordinator?' · 管理员':''));wrap.append(nameLine);const msg=el('div','','bt-msg-line');const bubble=el('div','','bt-bubble');bubble.append(foldMessage(line.text,()=>markdown(line.text,mentionMarkup,href=>call('team.file.open',{kind:selected.kind,id:selected.id,lineId:line.id,href}).catch(()=>{})),Boolean(line.progress),selected?.kind==='bot'&&line.who===item.name?20000:1500));const assigned=assignmentMarkup(line);if(assigned)bubble.append(assigned);msg.append(messageAvatar(author|| (selected?.kind==='bot'?item:null)),bubble);if(!line.progress)msg.append(messageActions(line.text,line));wrap.append(msg);if(line.thinking){const details=el('details','','thinking-block');details.dataset.key=line.id+':thinking';details.open=expandedDetails.has(details.dataset.key);details.append(el('summary','思考过程'),Object.assign(el('div',line.thinking),{className:'pi-reasoning-lines'}));wrap.append(details);}if(line.toolEvents?.length){const tools=el('details','','thinking-block');tools.dataset.key=line.id+':tools';tools.open=expandedDetails.has(tools.dataset.key);tools.append(el('summary','工具记录 · '+line.toolEvents.length));for(const event of line.toolEvents){const entry=el('div');entry.append(el('div',event.name+' · '+event.status));if(event.detail)entry.append(el('pre',event.detail));tools.append(entry);}wrap.append(tools);}if(line.reaction)bubble.append(reactionPill(line));if(line.status)wrap.append(el('div',statuses[line.status]||line.status,'message-status'+(['error','not_started','needs_review'].includes(line.status)?' message-error':'')));$('transcript').append(wrap);
      }
      if(item?.planning)$('transcript').append(el('div','管理员正在安排分工…','typing-line'));
      if(focusState){const card=[...$('transcript').querySelectorAll('[data-question-id],[data-view-id]')].find(n=>focusState.viewId?n.dataset.viewId===focusState.viewId:n.dataset.questionId===focusState.id),field=focusState.viewId?[...(card?.querySelectorAll('input')||[])].find(n=>n.name===focusState.name&&n.dataset.viewAction===focusState.action&&(focusState.start!==null||n.value===focusState.value)):card?.querySelector('textarea');if(field){field.focus({preventScroll:true});if(focusState.start!==null)field.setSelectionRange(focusState.start,focusState.end);}}
      seenLines=new Set(lines.map(line=>line.jobId||line.id));transcriptNavigation.afterRender(scrollView);
    }
    stampMessages($('transcript'),lines);restoreSelection();
    if(!$('task-drawer').hidden)renderJobs();
    stopAvatarMotion.sync(state);
  }
  function foldMessage(text,full,streaming=false,limit=1500){
    text=String(text||'');if(streaming||text.length<=limit&&text.split('\n').length<=25)return full();
    const box=el('div','','pi-long-message'),content=el('div'),toggle=el('button','','pi-long-toggle');toggle.type='button';let opened=false;
    function paint(){content.replaceChildren(opened?full():markdown(text.split('\n').slice(0,10).join('\n').slice(0,600)+'…',mentionMarkup));toggle.textContent=opened?'收起':'显示全部 · '+text.length.toLocaleString()+' 字';}
    toggle.onclick=()=>{opened=!opened;paint();};paint();box.append(content,toggle);return box;
  }
  function appendAttachments(target,line){for(const [index,file] of (line.attachments||[]).entries()){const row=el('div','','message-attachment'),b=el('button',file.name||file.path,'soft-button');b.type='button';row.append(b);if(/\.(png|jpe?g|webp|gif)$/i.test(file.path||'')){b.title='点击通过 PI 文件接口预览图片';b.onclick=async()=>{const prior=row.querySelector('img');if(prior){prior.hidden=!prior.hidden;return;}b.disabled=true;try{const result=await call('team.attachment.preview',{jobId:line.attachmentJobId,roomId:selected.kind==='room'?selected.id:undefined,botId:selected.kind==='bot'?selected.id:undefined,lineId:line.id,index});if(!row.isConnected)return;const image=el('img','','attachment-preview');image.alt=result.name;image.src=result.dataUrl;image.loading='lazy';row.append(image);}catch(error){notice(error.message||'图片预览失败。');}finally{if(b.isConnected)b.disabled=false;}};}else{b.title='复制文件路径';b.onclick=()=>navigator.clipboard.writeText(file.path).catch(()=>{});}target.append(row);}}
  function messageAvatar(author,size=22,working=false){
    if(!author)return avatar(null,size,false,false);
    const lead=el('button','','bt-lead');lead.type='button';
    const group=selected?.kind==='room';
    lead.setAttribute('aria-label',group?'打开 '+author.name+' 的私聊':'打开 '+author.name+' 的设置');
    lead.title=lead.getAttribute('aria-label');lead.append(avatar(author,size,false,false));
    lead.onclick=()=>{if(!bot(author.id))return;if(group){closeDetails();select('bot',author.id);}else{editBot(bot(author.id)).catch(()=>{});}};
    return lead;
  }
  function renderJobs(){
    $('jobs').replaceChildren();const jobs=state.jobs.filter(j=>selected?.kind==='room'?j.roomId===selected.id:j.botId===selected?.id);
    if(!jobs.length)$('jobs').append(el('p','还没有执行任务。'));
    for(const job of [...jobs].reverse()){const box=el('div','','job');box.append(el('strong',bot(job.botId)?.name||'成员'),el('span',statuses[job.status]||job.status,'badge'),el('p',job.task.slice(0,200)),el('small',job.error||((job.toolCalls!==undefined?'工具调用 '+job.toolCalls+' 次 · ':'')+new Date(job.at).toLocaleString())));const actions=el('div','','actions');if(job.sessionId){const open=el('button','打开执行会话','soft-button');open.onclick=async()=>{try{await call('team.session.open',{sessionId:job.sessionId});onNative();}catch{}};actions.append(open);}if(['queued','launching','running','waiting'].includes(job.status)){const stop=el('button','中断','soft-button');stop.onclick=async()=>{try{await call('team.job.cancel',{jobId:job.id});await refresh();}catch{}};actions.append(stop);}box.append(actions);$('jobs').append(box);}
  }
  const appearanceSaver=createAppearanceSaver({save:input=>call('team.bot.appearance',input),onSaved:value=>{const b=bot(value.id);if(b)Object.assign(b,value);},onError:()=>{notice('头像未保存成功，请重选后重试。');}});
  const stateSync=createStateSync();let refreshAgain=false,refreshEpoch=0,rosterPending=0;
  const deletingBots=new Set(),deletingRooms=new Set();
  async function rosterMutation(task){
    rosterPending++;refreshEpoch++;
    try{return await task();}finally{rosterPending--;refreshEpoch++;if(!rosterPending)refresh().catch(()=>{});}
  }
  async function removeBotFromUI(id){
    if(deletingBots.has(id))return;
    const item=bot(id);if(!item)return;
    if(item.role==='Administrator'){notice('请先移除主机器人身份。');return;}
    if(state.rooms.some(room=>room.adminId===id)){notice('请先更换群管理员。');return;}
    deletingBots.add(id);
    const priorSelected=selected,priorRooms=state.rooms.filter(room=>room.members.includes(id)).map(room=>({id:room.id,members:[...room.members],name:room.name}));
    state.bots=state.bots.filter(bot=>bot.id!==id);
    for(const room of state.rooms){room.members=room.members.filter(member=>member!==id);if(room.named===false)room.name=room.members.map(id=>bot(id)?.name||'已移除成员').join('、').slice(0,200);}
    if(editing&&draft?.id===id)closeSettings();
    if(selected?.kind==='bot'&&selected.id===id){selected=null;closeDetails();}
    render();
    try{await rosterMutation(()=>call('team.bot.delete',{botId:id,compact:true}));}
    catch(error){
      if(!bot(id))state.bots.push(item);
      for(const old of priorRooms){const room=state.rooms.find(room=>room.id===old.id);if(room)Object.assign(room,old);}
      selected=priorSelected;notice(error.message||'删除失败，请重试。');render();
    }finally{deletingBots.delete(id);}
  }
  async function removeRoomFromUI(id){
    if(deletingRooms.has(id))return;
    const index=state.rooms.findIndex(room=>room.id===id),item=state.rooms[index];if(!item)return;
    if(item.planning||state.jobs.some(job=>job.roomId===id&&['queued','launching','running','waiting','waiting_teammates'].includes(job.status))){notice('请等待群聊任务完成后再删除。');return;}
    deletingRooms.add(id);const priorSelected=selected;
    state.rooms=state.rooms.filter(room=>room.id!==id);
    if(editing&&roomDraft?.id===id)closeSettings();
    if(selected?.kind==='room'&&selected.id===id){selected=null;closeDetails();}
    render();const fallback=selected;
    try{await rosterMutation(()=>call('team.room.delete',{roomId:id,compact:true}));}
    catch(error){
      if(!state.rooms.some(room=>room.id===id))state.rooms.splice(index,0,item);
      if(selected===fallback)selected=priorSelected;
      notice(error.message||'删除群聊失败，请重试。');render();
    }finally{deletingRooms.delete(id);}
  }
  function createRoomFromUI(input){return rosterMutation(async()=>{
    const {room}=await call('team.room.save',{...input,compact:true});
    if(!room?.id)throw Error('群聊没有创建成功，请重试。');
    state.rooms=state.rooms.filter(item=>item.id!==room.id);state.rooms.push(room);render();return room;
  });}
  const botCreator=createBotPage({host:app.querySelector('.conversation'),getBots:()=>state.bots,models:()=>call('team.models'),notice,
    onOpen:()=>{if(editing)closeSettings();closeDetails();contextMenu.close();},
    onBack:()=>newChat.show(),
    create:input=>rosterMutation(async()=>{const result=await call('team.bot.save',{...input,compact:true});state.bots=state.bots.filter(bot=>bot.id!==result.bot.id);state.bots.push(result.bot);render();return result.bot;}),
    onCreated:item=>select('bot',item.id)
  });
  async function refresh(){if(closed||booting||rosterPending)return;if(refreshing){refreshAgain=true;return;}refreshing=true;try{do{refreshAgain=false;const epoch=refreshEpoch,response=await call('team.state',stateSync.request());if(closed)return;if(epoch!==refreshEpoch||rosterPending){refreshAgain=!rosterPending;continue;}state=preferenceSaver.receive(appearanceSaver.overlay(stateSync.receive(response)));render();}while(refreshAgain&&!closed);}finally{refreshing=false;}}
  async function bootstrap(retry=false){
    notice('');startup.innerHTML='<span class="pi-startup-dot" aria-hidden="true"></span><span>正在载入机器人与会话…</span>';
    try{
      let progress=await invoke('team.startup',{retry});
      while(progress.phase==='loading'||progress.phase==='idle'){
        if(closed)return;startup.lastElementChild.textContent=progress.message;await new Promise(resolve=>setTimeout(resolve,600));if(closed)return;progress=await invoke('team.startup',{});
      }
      if(progress.phase!=='ready')throw Error(progress.message||'PI Bot 尚未就绪。');
      let value;try{value=await invoke('team.bootstrap',{selection:selected});}catch{value=await invoke('team.state');}
      if(closed)return;state=appearanceSaver.overlay(value);render();startup.remove();app.removeAttribute('aria-busy');booting=false;activeRead.check();
      if(value.startupPreview)refresh().catch(()=>{});
    }catch(error){if(closed)return;startup.replaceChildren(el('span',error.message||'会话载入失败，请重试。'));const retry=el('button','重新加载','soft-button');retry.onclick=()=>{retry.disabled=true;bootstrap(true);};startup.append(retry);notice(error.message||String(error));}
  }
  let draft=null,roomDraft=null,editorDispose=null,confirming=null,sessionToken=0,modelsReady=false;
  const fieldSavers=new Map();let settingPending=0;
  function renderHero(){
    const anchor=$('avatar-anchor');if(!anchor||!draft)return;
    const trigger=avatarTrigger(draft,()=>{$('avatar-anchor').querySelector('.bt-avedit')?closeAvatarEditor():openAvatarEditor();},64,false);
    trigger.querySelector('.bt-avatar-trigger').setAttribute('aria-expanded',String(Boolean(anchor.querySelector('.bt-avedit'))));
    const old=[...anchor.children].find(node=>node.classList.contains('bt-avatar-anchor'));
    if(old)old.replaceWith(trigger);else anchor.prepend(trigger);
    $('bs-name').textContent=draft.name||'新机器人';
    $('bs-sub').textContent=[draft.roleLabel,draft.role==='Administrator'?(draft.agentMode==='agent'?'主机器人 · 原生 Agent':'主机器人 · 只分派与汇总'):''].filter(Boolean).join(' · ')||'Bot';
  }
  function openAvatarEditor(){
    if(!draft)return;
    closeAvatarEditor();
    const editor=avatarEditor({bot:draft,onSave:saveAvatar,onError:notice,onClose:closeAvatarEditor,anchor:$('avatar-anchor')});
    editorDispose=editor.dispose;
    $('avatar-anchor').append(editor.node);
    $('avatar-anchor').querySelector('.bt-avatar-trigger')?.setAttribute('aria-expanded','true');
  }
  function closeAvatarEditor(){
    const anchor=$('avatar-anchor');if(!anchor)return;
    anchor.querySelector('.bt-avedit')?.remove();
    editorDispose?.();editorDispose=null;
    anchor.querySelector('.bt-avatar-trigger')?.setAttribute('aria-expanded','false');
  }
  let appearanceFrame;
  function saveAvatar(patch){
    if(!draft)return;
    draft={...draft,avatar:patch.avatar===undefined?(draft.avatar??null):patch.avatar,color:patch.color===undefined?(draft.color??null):patch.color};
    if(draft.id){
      const b=bot(draft.id);if(b)Object.assign(b,{avatar:draft.avatar,color:draft.color});
      appearanceSaver.choose(draft.id,patch);
    }
    renderHero();
    clearTimeout(appearanceFrame);appearanceFrame=setTimeout(()=>{chatKey='';render();},80);
  }
  async function openBotSettings(value,openEditor){
    modelsReady=false;
    draft=value?{...value}:{name:'',role:'Worker',instructions:'',memory:'',modelKey:'',avatar:null,color:null};
    const token=String((Number(sessionToken)||0)+1);sessionToken=Number(token);
    $('bot-id').value=draft.id||'';
    $('bot-name').value=draft.name||'';
    $('bot-role').value=draft.role||'Worker';
    $('bot-instructions').value=draft.instructions||'';$('bot-role-label').value=draft.roleLabel||'';
    $('bot-memory').value=draft.memory||'';
    $('bot-model').replaceChildren();
    const pending=el('option','正在读取模型…');pending.value='';pending.disabled=true;$('bot-model').append(pending);pickers.update();
    confirming=null;
    $('bot-delete').querySelector('.bt-bs-label').textContent='删除机器人';
    $('bot-delete').removeAttribute('data-confirm');
    renderHero();
    openSettings('bot');syncBotControls();
    if(openEditor)openAvatarEditor();
    $('bot-work-dir').value=draft.workDir||'';resetInline('bot');pickers.update();fillDirectories().catch(()=>{});
    try{
      const models=await call('team.models');
      if(sessionToken!==Number(token))return;
      $('bot-model').replaceChildren();
      const option=el('option','使用 PI 默认模型');option.value='';$('bot-model').append(option);
      for(const model of models){const opt=el('option',(model.providerName?model.providerName+' / ':'')+(model.alias||model.label||String(model.key).split('/').pop()));opt.value=model.key;opt.title=model.key;opt.dataset.provider=model.providerName||model.providerId||'PI 模型';$('bot-model').append(opt);}
      if(draft.modelKey&&!models.some(m=>m.key===draft.modelKey)){const unavailable=el('option','模型不可用 · '+draft.modelKey);unavailable.value=draft.modelKey;$('bot-model').append(unavailable);}
      $('bot-model').value=draft.modelKey||'';
      const fillThinking=(level=draft.thinkingLevel||'off')=>{const current=models.find(m=>m.key===$('bot-model').value)||models.find(m=>m.isDefault)||models[0];$('bot-thinking').replaceChildren();for(const value of [...new Set(['off',...(current?.thinkingLevels||[])])]){const option=el('option',value==='off'?'关闭':value);option.value=value;$('bot-thinking').append(option);}$('bot-thinking').value=level;};fillThinking();$('bot-model').onchange=()=>{fillThinking('off');saveBotPatch({modelKey:$('bot-model').value,thinkingLevel:$('bot-thinking').value}).catch(()=>{$('bot-model').value=draft.modelKey||'';fillThinking();pickers.update();});};modelsReady=true;pickers.update();
    }catch{}
  }
  async function fillDirectories(){
    const view=await call('team.workspaces');if(closed)return;
    const paths=[...new Set([view.current,...(view.projects||[]).map(p=>p.path)].filter(Boolean))];
    $('work-directories').replaceChildren(...paths.map(value=>{const option=el('option');option.value=value;return option;}));
  }
  function editBot(value){if(!value?.id){settingsRequest=false;return botCreator.show(value?.name||'');}return openBotSettings(value,false);}
  async function openMemoryPanel(){try{await features.memory(draft||current());}catch{}}
  $('memory-open').onclick=openMemoryPanel;
  $('bot-mcp').onclick=()=>features.mcp(draft?.id).catch(()=>{});
  $('bot-secrets').onclick=()=>features.secrets(draft?.id).catch(()=>{});
  $('recovery-item').onclick=()=>{menuVisible($('settings-menu'),false);features.recovery().catch(()=>{});};
  $('secrets-item').onclick=()=>{menuVisible($('settings-menu'),false);features.secrets().catch(()=>{});};
  $('bot-agent-mode').onchange=()=>saveBotPatch({agentMode:$('bot-agent-mode').value}).catch(()=>{$('bot-agent-mode').value=draft.agentMode||'planner';});
  $('bot-capabilities').onclick=()=>features.capabilities(undefined,draft?.id).catch(()=>{});

  function switchValue(id,value){$(id).setAttribute('aria-checked',String(Boolean(value)));}
  function syncBotControls(){
    if(!draft)return;const exists=Boolean(draft.id),main=draft.role==='Administrator';
    $('bot-agent-mode').value=draft.agentMode||'planner';$('bot-agent-mode').closest('label').hidden=!main;
    switchValue('bot-main',main);switchValue('bot-pinned',draft.pinned);switchValue('bot-hidden',draft.hidden);
    $('bot-main').disabled=main&&state.bots.filter(b=>b.role==='Administrator').length===1;
    $('bot-main').title=$('bot-main').disabled?'团队至少保留一位主机器人，请先将另一位设为主机器人。':'';
    for(const id of ['bot-abilities-section','bot-memory-section','bot-tasks-section','bot-manage-section'])$(id).hidden=!exists;
    $('bot-sidebar-section').hidden=!exists||main;$('bot-footer').hidden=exists;$('bot-save-status').textContent=exists?'修改后自动保存':'';
    $('bot-delete').hidden=main;
    $('memory-count').textContent='管理记忆条目';
  }
  async function saveBotPatch(patch){
    if(!draft?.id){Object.assign(draft,patch);$('bot-role').value=draft.role||'Worker';renderHero();syncBotControls();return;}
    const id=draft.id,token=sessionToken;settingPending++;$('bot-save-status').textContent='正在保存…';
    try{state=appearanceSaver.overlay(await call('team.bot.patch',{id,patch}));if(token===sessionToken&&draft?.id===id){Object.assign(draft,patch);renderHero();syncBotControls();pickers.update();}render();}
    catch(error){throw error;}
    finally{settingPending--;if(token===sessionToken)$('bot-save-status').textContent=settingPending?'正在保存…':'修改后自动保存';}
  }
  async function saveRoomPatch(patch){
    if(!roomDraft?.id){Object.assign(roomDraft,patch);syncRoomControls();return;}
    const id=roomDraft.id,token=sessionToken;settingPending++;$('room-save-status').textContent='正在保存…';
    try{state=await call('team.room.patch',{id,patch});if(token===sessionToken&&roomDraft?.id===id){roomDraft=structuredClone(state.rooms.find(r=>r.id===id));syncRoomControls();}render();}
    finally{settingPending--;if(token===sessionToken)$('room-save-status').textContent=settingPending?'正在保存…':'修改后自动保存';}
  }
  function inline(id,kind,key){
    const node=$(id);let saved=node.value;
    fieldSavers.set(id,()=>{saved=node.value;});
    const commit=async()=>{if(!$(kind+'-id').value)return;const value=node.value,prior=saved,token=sessionToken;if(value===saved)return;if(node.required&&!value.trim()){node.value=prior;return;}saved=value;
      try{await (kind==='bot'?saveBotPatch:saveRoomPatch)({[key]:value});}
      catch{if(sessionToken===token&&node.value===value){node.value=prior;saved=prior;}$(kind+'-save-status').textContent='保存失败，请修改后重试。';}
    };
    node.addEventListener('blur',commit);node.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();node.value=saved;node.blur();}else if(event.key==='Enter'&&node.tagName!=='TEXTAREA'){event.preventDefault();node.blur();}});
  }
  function resetInline(kind){for(const [id,reset] of fieldSavers)if(id.startsWith(kind+'-'))reset();}
  for(const [id,key] of Object.entries({'bot-name':'name','bot-role-label':'roleLabel','bot-instructions':'instructions','bot-work-dir':'workDir'}))inline(id,'bot',key);
  for(const [id,key] of Object.entries({'room-name':'name','room-notice':'notice','room-work-dir':'workDir'}))inline(id,'room',key);
  $('bot-thinking').onchange=()=>{if(modelsReady)saveBotPatch({thinkingLevel:$('bot-thinking').value}).catch(()=>{$('bot-thinking').value=draft.thinkingLevel||'off';});};
  $('bot-main').onclick=()=>saveBotPatch({role:draft.role==='Administrator'?'Worker':'Administrator'}).then(()=>{$('bot-role').value=draft.role;}).catch(()=>{});
  async function flags(kind,key){const item=kind==='bot'?draft:roomDraft;if(!item?.id)return;try{state=await call('team.pin',{kind,id:item.id,[key]:!item[key]});Object.assign(item,kind==='bot'?bot(item.id):state.rooms.find(r=>r.id===item.id));kind==='bot'?syncBotControls():syncRoomControls();render();}catch{}}
  for(const kind of ['bot','room'])for(const key of ['pinned','hidden'])$(kind+'-'+key).onclick=()=>flags(kind,key);
  $('bot-schedules').onclick=()=>features.schedules(undefined,draft?.id).catch(()=>{});
  const pickers=createSettingsPickers({app,$,workspaces:()=>call('team.workspaces')});
  function editRoom(value){
    sessionToken++;roomDraft=value?structuredClone(value):{name:'',notice:'',workDir:'',members:state.bots.map(b=>b.id),adminId:state.bots.find(b=>b.role==='Administrator')?.id??null,executionMode:'parallel',replyMode:'admin',permissionMode:'inherit'};
    $('room-id').value=roomDraft.id||'';$('room-name').value=roomDraft.named===false?'':roomDraft.name;$('room-notice').value=roomDraft.notice||'';$('room-work-dir').value=roomDraft.workDir||'';
    confirming=null;$('room-delete').querySelector('.bt-bs-label').textContent='删除群聊';$('room-delete').removeAttribute('data-confirm');
    $('room-add-picker').hidden=true;openSettings('room');syncRoomControls();resetInline('room');fillDirectories().catch(()=>{});
  }
  function syncRoomControls(){
    const value=roomDraft;if(!value)return;const admin=bot(value.adminId),members=value.members.map(bot).filter(Boolean);
    $('room-avatar').replaceChildren(cluster(value,64,false));$('rs-name').textContent=value.name||'新建群聊';$('rs-sub').textContent=members.length+' 位成员 · '+(admin?'管理员 '+admin.name:'无管理员');
    $('room-admin').replaceChildren();const none=el('option','无管理员');none.value='';$('room-admin').append(none);for(const b of members){const opt=el('option',b.name);opt.value=b.id;$('room-admin').append(opt);}$('room-admin').value=value.adminId||'';
    $('room-member-count').textContent=members.length;$('room-members').replaceChildren();
    for(const member of members){const row=el('div','','bt-set-row bt-bs-row bt-gs-member'),who=el('button','','bt-gs-who');who.type='button';who.append(avatar(member,26,false,false),el('span',member.name,'bt-row-title'));who.onclick=()=>{closeSettings();select('bot',member.id);};row.append(who);
      const leads=value.adminId===member.id;if(leads)who.append(el('span','管理员','bt-tag'));
      const lead=el('button',leads?'取消':'设为管理员','bt-mini');lead.type='button';lead.setAttribute('aria-label',leads?'取消 '+member.name+' 的群管理员':'将 '+member.name+' 设为群管理员');lead.onclick=()=>saveRoomPatch({adminId:leads?null:member.id}).catch(()=>{});row.append(lead);
      if(members.length>2){const remove=el('button','×','bt-x');remove.type='button';remove.setAttribute('aria-label','从群聊移除 '+member.name);remove.onclick=()=>saveRoomPatch({members:value.members.filter(id=>id!==member.id),...(leads?{adminId:null}:{})}).catch(()=>{});row.append(remove);}$('room-members').append(row);
    }
    $('room-execution').value=value.executionMode;$('room-reply').value=admin?value.replyMode:'everyone';
    switchValue('room-uniform-permissions',value.permissionMode!=null);$('room-permission-mode').value=value.permissionMode||'ask';$('room-permission-row').hidden=value.permissionMode==null;
    for(const button of $('room-form').querySelectorAll('[data-reply]')){button.setAttribute('aria-pressed',String(button.dataset.reply===$('room-reply').value));button.disabled=button.dataset.reply==='admin'&&!admin;}
    $('room-reply-hint').textContent=($('room-reply').value==='admin'?'普通消息先交给管理员，由它 @成员分派。':'普通消息交给所有执行成员。')+' @提及始终决定谁回复。';
    $('room-admin-hint').textContent=admin?admin.name+' 管理群聊，负责分派与汇总，不作为本群的执行成员。':'未设置管理员，普通消息由所有执行成员回复。';
    switchValue('room-pinned',value.pinned);switchValue('room-hidden',value.hidden);
    $('room-sidebar-section').hidden=!value.id;$('room-manage-section').hidden=!value.id;$('room-footer').hidden=Boolean(value.id);$('room-save-status').textContent=value.id?'修改后自动保存':'';
    pickers.update();
    const outside=state.bots.filter(b=>!value.members.includes(b.id));$('room-add-member').hidden=!outside.length;
    const picker=$('room-add-picker');picker.replaceChildren();for(const b of outside){const add=el('button','','bt-set-row bt-bs-row bt-gs-pick');add.type='button';add.append(avatar(b,26,false,false),el('span',b.name,'bt-set-copy'),el('span','添加','bt-set-hint'));add.onclick=()=>{picker.hidden=true;saveRoomPatch({members:[...roomDraft.members,b.id]}).catch(()=>{});};picker.append(add);}
  }
  $('room-add-member').onclick=()=>{$('room-add-picker').hidden=!$('room-add-picker').hidden;};
  $('room-execution').onchange=()=>saveRoomPatch({executionMode:$('room-execution').value}).catch(()=>syncRoomControls());
  $('room-uniform-permissions').onclick=()=>saveRoomPatch({permissionMode:roomDraft.permissionMode==null?'ask':null}).catch(()=>syncRoomControls());
  $('room-permission-mode').onchange=()=>saveRoomPatch({permissionMode:$('room-permission-mode').value}).catch(()=>syncRoomControls());
  $('room-permission-apply').onclick=()=>saveRoomPatch({permissionMode:$('room-permission-mode').value}).catch(()=>syncRoomControls());
  for(const button of $('room-form').querySelectorAll('[data-reply]'))button.onclick=()=>saveRoomPatch({replyMode:button.dataset.reply}).catch(()=>syncRoomControls());
  for(const [id,name] of Object.entries({'new':'PlusIcon','add-bot':'PlusIcon','add-room':'ChatsIcon','search-toggle':'SearchIcon',edit:'GearIcon','detail-browser':'GlobeIcon',plus:'PlusIcon',dictate:'MicIcon','continuous-voice':'VoiceIcon',reference:'ChatsIcon',schedule:'ClockIcon',attach:'PaperclipIcon',submit:'ArrowUpIcon',share:'ShareIcon','close-details':'CloseIcon','close-tasks':'CloseIcon'}))$(id).prepend(icon(name));
  for(const id of ['bot-duplicate','bot-delete','room-delete'])$(id).querySelector('.bt-chevron').append(icon('ChevronRightIcon'));
  const brand=el('span','','bt-brand-whale');brand.append(avatar({avatar:{shape:MAIN_LOOK.shape},color:MAIN_LOOK.color},22,false,false));$('brand').prepend(brand);
  $('native').title='连接应用';$('native').setAttribute('aria-label','连接应用');$('native').firstElementChild.textContent='连接应用';const appMarks=el('span','','pi-connected-apps');appMarks.setAttribute('aria-hidden','true');appMarks.append(icon('GithubIcon'),icon('SlidersIcon'));$('native').append(appMarks);$('search-wrap').prepend(icon('SearchIcon'));$('account').append(avatar({avatar:{shape:MAIN_LOOK.shape},color:MAIN_LOOK.color},20,false,false));
  $('native').onclick=()=>{if(editing)closeSettings();features.plugins().catch(()=>{});};$('dismiss').onclick=()=>notice('');
  $('add-bot').onclick=()=>{$('new-menu').hidden=true;editBot();};$('add-room').onclick=()=>{$('new-menu').hidden=true;editRoom();};$('search-toggle').title='搜索 Bot、群聊和消息（Ctrl+K）';$('search-toggle').setAttribute('aria-label','搜索 Bot、群聊和消息');$('search-toggle').onclick=()=>chatSearch.open();$('search').oninput=render;
  const editCurrent=()=>{const value=current();if(value)selected.kind==='room'?editRoom(value):editBot(value);};$('edit').onclick=editCurrent;
  function closeSettings(){if(settingsFormKind){features.settings(settingsFormKind==='bot'?'bots':'groups').catch(()=>{});return;}pickers.close();detailsPreview.reset();sessionToken++;editing=false;closeAvatarEditor();for(const kind of ['bot','room']){const form=$(kind+'-form');if(form)$(kind+'-dialog').append(form);}$('settings-body').hidden=true;$('detail-top').hidden=false;$('detail-id').hidden=false;$('detail-tabs').hidden=false;$('detail-body').hidden=false;for(const id of ['detail-top','detail-id','detail-tabs','detail-body'])$(id).dataset.move='in';renderDetails();}
  function openSettings(kind){
    if(settingsRequest){settingsRequest=false;const form=$(kind+'-form'),name=kind==='bot'?draft?.name||'新 Bot':roomDraft?.name||'新建群聊';features.presentEntity(kind,name,form,()=>{pickers.close();sessionToken++;closeAvatarEditor();$(kind+'-dialog').append(form);editing=false;settingsFormKind=null;});settingsFormKind=kind;editing=true;return;}
    detailsPreview.close();editing=true;drawer.set(true);for(const id of ['detail-top','detail-id','detail-tabs','detail-body'])$(id).hidden=true;for(const other of ['bot','room']){const form=$(other+'-form');if(form)$(other+'-dialog').append(form);}const body=$('settings-body');body.dataset.move='in';body.hidden=false;body.replaceChildren();const head=el('div','','bt-subhead'),back=el('button','','bt-icon-btn');back.type='button';back.setAttribute('aria-label','返回详情');back.append(icon('ChevronLeftIcon'));back.onclick=closeSettings;head.append(back,el('span',kind==='bot'?'机器人设置':'群聊设置','bt-subhead-title'));const close=el('button','','bt-icon-btn');close.type='button';close.setAttribute('aria-label','关闭设置');close.append(icon('CloseIcon'));close.onclick=()=>{closeSettings();closeDetails();};head.append(close);const form=$(kind+'-form');if(form)body.append(head,form);else body.append(head);}
  function renderDetails(){
    const item=current();if(!item)return;
    if(renamingTarget?.id===item.id&&$('detail-id').querySelector('input'))return;
    const idBox=$('detail-id'),nextHeader=JSON.stringify([selected,item.name,item.role,item.roleLabel,item.avatar,item.color,item.members?.map(id=>{const b=bot(id);return [id,b?.avatar,b?.color];}),renamingTarget]);
    if(nextHeader!==detailHeaderKey){detailHeaderKey=nextHeader;idBox.replaceChildren();
    if(selected.kind==='room')idBox.append(cluster(item,64));
    else idBox.append(avatar(item,64,busy(item.id),true,{gaze:true,pokeable:true}));
    if(renamingTarget?.id===item.id){
      const target={...renamingTarget},field=el('input','','pi-detail-rename');field.value=item.named===false?'':item.name;field.maxLength=200;field.required=target.kind==='bot';field.setAttribute('aria-label',target.kind==='room'?'重命名群聊':'重命名 Bot');let saving=false,cancelled=false;
      const commit=async()=>{if(saving||cancelled)return;const name=field.value.trim();if(target.kind==='bot'&&!name){renamingTarget=null;renderDetails();return;}if(name===item.name){renamingTarget=null;renderDetails();return;}saving=true;field.disabled=true;try{state=appearanceSaver.overlay(await call('team.'+target.kind+'.patch',{id:target.id,patch:{name}}));renamingTarget=null;render();}catch{saving=false;field.disabled=false;field.focus();}};
      field.onblur=()=>{commit().catch(()=>{});};field.onkeydown=event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();cancelled=true;renamingTarget=null;renderDetails();}else if(event.key==='Enter'){event.preventDefault();commit().catch(()=>{});}};idBox.append(field);
    }else {const name=el('button',item.name,'bt-drawer-name');name.type='button';name.setAttribute('aria-label','重命名 '+item.name);name.onclick=()=>{renamingTarget={...selected};renderDetails();const field=idBox.querySelector('input');field?.focus();field?.select();};idBox.append(name);}
    if(selected.kind==='room'||selected.kind==='bot')idBox.append(el('div',selected.kind==='room'?'群聊':item.roleLabel||(item.role==='Administrator'?'管理员 · 只分派':'执行成员'),'bt-drawer-role'));
    }
    stopAvatarMotion.sync(state);
    $('detail-browser').hidden=selected.kind!=='bot';
    $('detail-tabs').hidden=selected.kind!=='bot';
    if(selected.kind==='bot'){detailRoomKey='';delete $('detail-body').dataset.room;detailsPreview.render(item);return;}
    detailsPreview.reset();
    const work=memberWork(state,item),roomKey=JSON.stringify([item.id,item.notice,item.workDir,item.permissionMode,item.pinned,work.map(e=>[e.id,e.bot.name,e.bot.avatar,e.bot.color,e.job?.id,e.job?.status,e.job?.currentTool,e.job?.currentToolStatus,e.job?.activityPhase,e.job?.progress,e.job?.toolCalls,e.here])]);
    if(roomKey===detailRoomKey&&$('detail-body').dataset.room===item.id)return;detailRoomKey=roomKey;$('detail-body').dataset.room=item.id;
    const body=$('detail-body');body.removeAttribute('role');body.removeAttribute('aria-labelledby');body.replaceChildren();
    body.append(el('div','群公告','bt-section-title'),aboutContent(item.notice||'尚未填写',{open:openRoomAbout.has(item.id),onToggle:value=>value?openRoomAbout.add(item.id):openRoomAbout.delete(item.id)}));
    const folder=el('button','工作目录：'+(item.workDir||'跟随 PI 当前工作区'),'bt-more');folder.onclick=()=>editRoom(item);body.append(folder);
    const permissions={inherit:'跟随 PI 设置',ask:'操作前询问','accept-edits':'自动接受编辑',auto:'自动批准'};
    const permission=el('button','权限：'+(item.permissionMode!=null?'所有成员 · '+permissions[item.permissionMode]:'成员各自的 PI 权限'),'bt-more');permission.type='button';permission.onclick=()=>editRoom(item);body.append(permission);
    const groupMemory=el('button','群聊记忆','bt-more');groupMemory.type='button';groupMemory.onclick=()=>features.memory(item,{group:true}).catch(error=>notice(error.message));body.append(groupMemory);
    if(selected.kind==='room'){
      const members=el('div','','bt-members');
      members.append(el('div','成员 · '+item.members.length,'bt-section-title'));
      for(const entry of work){const {id,bot:member,job,here}=entry,line=el('div','','pi-member-row'),who=el('button','','bt-member-name'),copy=el('span','','pi-member-copy'),name=el('span',member.name);who.type='button';if(id===item.adminId)name.append(el('span','管理员','bt-tag'));copy.append(name,el('span',job?(here?'':'其他会话 · ')+activityLabel(job):member.planning?'正在安排分工':'空闲','pi-member-action'));who.append(avatar(member,26),copy);who.onclick=()=>{select('bot',id);renderDetails();};line.append(who);
        if(here&&job){const stop=el('button','停止','bt-mini');stop.type='button';stop.setAttribute('aria-label','停止 '+member.name+' 的群聊任务');stop.onclick=async()=>{stop.disabled=true;try{await call('team.job.cancel',{jobId:job.id});await refresh();}catch{stop.disabled=false;}};line.append(stop);}
        if(here&&job?.status==='waiting'&&job.sessionId){const approval=el('button','在 PI 中处理审批 ›','pi-member-approval');approval.type='button';approval.onclick=async()=>{try{await call('team.session.open',{sessionId:job.sessionId});onNative();}catch{}};line.append(approval);}members.append(line);}
      body.append(members);
    }
    const pin=el('button',item.pinned?'取消置顶':'置顶聊天','bt-more');pin.onclick=async()=>{try{state=await call('team.pin',{kind:selected.kind,id:item.id,pinned:!item.pinned});render();}catch{}};body.append(pin);
    const tasks=el('button','执行任务','bt-more');tasks.onclick=()=>{$('task-drawer').hidden=false;$('task-drawer').querySelector('h2').textContent='执行任务';renderJobs();};body.append(tasks);
  }
  function memberToken(member){
    const token=el('button','','bt-token');token.type='button';token.title=member.name;
    token.dataset.botId=member.id;token.setAttribute('aria-label','打开机器人：'+member.name);
    token.append(avatar(member,16,false,false),el('span',member.name));token.style.color=inkTextOf(member);
    token.onclick=()=>select('bot',member.id);return token;
  }
  function assignmentMarkup(line){
    if(!line.coordinator||!Array.isArray(line.assignedBotIds))return null;
    const ids=[...new Set(line.assignedBotIds)],members=ids.map(id=>({id,member:bot(id)}));
    if(!members.length)return null;
    const row=el('div','','bt-assignment-members');row.setAttribute('aria-label','本次分派成员');
    row.append(el('span','已分派给','bt-assignment-label'));
    for(const {id,member} of members){if(member)row.append(memberToken(member));else{const missing=el('span','已移除成员','bt-chip');missing.dataset.botId=id;row.append(missing);}}
    return row;
  }
  function mentionMarkup(text){
    const wrap=el('span'),source=String(text??'');let last=0;
    for(const span of mentionSpans(source,state.bots)){wrap.append(document.createTextNode(source.slice(last,span.start)));if(span.all)wrap.append(document.createTextNode(source.slice(span.start,span.end)));else{wrap.append(memberToken(span.bot));}last=span.end;}
    wrap.append(document.createTextNode(source.slice(last)));return wrap;
  }

  function inkTextOf(botValue){const color=botValue?.color||(botValue?.role==='Administrator'?'deepseek':defaultColor(String(botValue?.id||'')));return inkText(color);}
  function reactionPill(line){const pill=el('button',line.reaction,'bt-react pi-reaction-pill');pill.type='button';pill.title='点击移除我的表情回应';pill.setAttribute('aria-label','移除表情 '+line.reaction);const target={...selected};pill.onclick=async()=>{try{state=await call('team.react',{kind:target.kind,id:target.id,lineId:line.id,emoji:line.reaction});render();}catch{}};return pill;}
  function messageActions(text,line){
    const row=el('div','','bt-tools');
    const react=el('button','','bt-tool');react.type='button';react.title='添加反应';react.setAttribute('aria-label','添加反应');react.setAttribute('aria-expanded','false');react.append(icon('SmileIcon'));
    const reply=el('button','','bt-tool');reply.type='button';reply.title='回复';reply.setAttribute('aria-label','回复这条消息');reply.append(icon('ReplyIcon'));
    const more=el('button','','bt-tool');more.type='button';more.title='更多';more.setAttribute('aria-label','更多消息操作');more.setAttribute('aria-expanded','false');more.append(icon('DotsIcon'));
    const reactionBar=el('div','','bt-react-strip');reactionBar.hidden=true;
    for(const emoji of recentEmoji()){const b=el('button',emoji);b.type='button';b.setAttribute('aria-label',emoji);b.onclick=async()=>{reactionBar.hidden=true;react.setAttribute('aria-expanded','false');if(!line?.id)return;try{state=await call('team.react',{kind:selected.kind,id:selected.id,lineId:line.id,emoji});rememberEmoji(emoji);render();}catch{}};reactionBar.append(b);}
    const moreMenu=el('div','','bt-menu');moreMenu.hidden=true;moreMenu.setAttribute('role','menu');moreMenu.setAttribute('aria-label','消息操作');
    const copy=el('button','','bt-menu-item');copy.type='button';copy.setAttribute('role','menuitem');copy.append(icon('CopyIcon'),el('span','复制','bt-menu-label'));copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);notice('已复制');}catch(error){notice(error.message||String(error));}moreMenu.hidden=true;more.setAttribute('aria-expanded','false');};
    const download=el('button','','bt-menu-item');download.type='button';download.setAttribute('role','menuitem');download.append(icon('DownloadIcon'),el('span','下载','bt-menu-label'));download.onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download='message.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);moreMenu.hidden=true;more.setAttribute('aria-expanded','false');};
    const read=el('button','朗读 / Read aloud','bt-menu-item');read.type='button';read.setAttribute('role','menuitem');read.onclick=()=>{voice.speak(text);moreMenu.hidden=true;};const stopRead=el('button','停止朗读','bt-menu-item');stopRead.type='button';stopRead.onclick=()=>voice.stop();moreMenu.append(copy,download,read,stopRead);row.append(react,reply,more,reactionBar,moreMenu);
    react.onclick=()=>{reactionBar.hidden=!reactionBar.hidden;moreMenu.hidden=true;react.setAttribute('aria-expanded',String(!reactionBar.hidden));more.setAttribute('aria-expanded','false');};
    more.onclick=()=>{moreMenu.hidden=!moreMenu.hidden;reactionBar.hidden=true;more.setAttribute('aria-expanded',String(!moreMenu.hidden));react.setAttribute('aria-expanded','false');};
    reply.onclick=()=>insertQuote($('content'),text);
    return row;
  }
  function closeDetails(){drawer.set(false);}
  $('detail-browser').onclick=()=>{const item=current();if(selected?.kind==='bot'&&item)features.openBrowser(item).catch(()=>{});};
  $('title').onclick=()=>{if(memoryTarget&&current()){features.memory(current(),{group:selected?.kind==='room'}).catch(error=>notice(error.message));return;}if(editing)closeSettings();drawer.set(!drawer.isOpen());if(drawer.isOpen())renderDetails();};$('close-details').onclick=closeDetails;$('close-tasks').onclick=()=>{$('task-drawer').hidden=true;};
  $('share').onclick=async()=>{const item=current();const lines=chatLines(selected.kind,item);try{await navigator.clipboard.writeText(lines.map(l=>'**'+l.who+':** '+readable(l.text)).join('\n\n'));}catch(error){notice(error.message);}};
  function setPlus(open){
    const node=$('plus-menu'),anchor=$('plus'),r=anchor.getBoundingClientRect();anchor.setAttribute('aria-expanded',String(open));
    node.style.left=Math.min(r.left,window.innerWidth-210)+'px';node.style.top='auto';node.style.bottom=(window.innerHeight-r.top+8)+'px';menuVisible(node,open);
  }
  function showLocalPanel(title,text){$('task-drawer').hidden=false;$('task-drawer').querySelector('h2').textContent=title;$('jobs').replaceChildren(el('p',text));}
  const newChat=createNewChat({host:app.querySelector('.conversation'),trigger:$('new'),getBots:()=>state.bots,avatar,
    onOpen:()=>{notice('');if(editing)closeSettings();closeDetails();contextMenu.close();$('plus-menu').hidden=true;},
    openBot:(item,kind='bot')=>select(kind,item.id),openSettings:name=>editBot({name,role:'Worker',instructions:'',memory:'',modelKey:'',avatar:null,color:null}),
    createRoom:async input=>{try{return await createRoomFromUI(input);}catch(error){notice('');throw error;}},
    send:(target,content)=>{outbox.submit(target,content,[],[]);transcriptNavigation.latest();}
  });
  $('list').addEventListener('click',()=>newChat.close());
  $('new').onclick=newChat.show;$('plus').onclick=()=>setPlus($('plus').getAttribute('aria-expanded')!=='true');
  shadow.addEventListener('click',event=>{if(!event.composedPath().includes($('plus'))&&!event.composedPath().includes($('plus-menu'))){setPlus(false);}if(!event.composedPath().includes($('account'))&&!event.composedPath().includes($('settings-menu')))menuVisible($('settings-menu'),false);if(!event.composedPath().includes($('new'))&&!event.composedPath().includes($('new-menu')))$('new-menu').hidden=true;});
  const menuKey=event=>{if(event.key!=='Escape')return;for(const [id,trigger] of [['plus-menu','plus'],['settings-menu','account']]){const menu=$(id);if(!menu.hidden&&!menu.hasAttribute('data-leaving')){event.preventDefault();event.stopPropagation();if(id==='plus-menu')setPlus(false);else menuVisible(menu,false);$(trigger).focus();return;}}};
  document.addEventListener('keydown',menuKey,true);
  const filePicker=el('input');filePicker.type='file';filePicker.multiple=true;filePicker.hidden=true;app.append(filePicker);
  let uploadRevision=0;
  $('attach').onclick=()=>{setPlus(false);filePicker.value='';filePicker.click();};
  filePicker.onchange=async()=>{const files=[...filePicker.files||[]],targetKey=selectionKey(selected),ticket=++uploadRevision;try{if(files.length+attachmentsDraft.length>8)throw Error('最多附加 8 个文件。');for(const file of files){if(file.size>20*1024*1024)throw Error('单个文件最多 20 MB。');const uploaded=await uploadFile(call,file,n=>notice('正在添加 '+file.name+' · '+n+'%'),()=>closed||ticket!==uploadRevision||selectionKey(selected)!==targetKey);if(closed||selectionKey(selected)!==targetKey)return;attachmentsDraft.push(uploaded);renderDraft();}notice('');$('content').focus();}catch(error){if(!closed)notice(error.message);}};
  $('schedule').onclick=()=>{setPlus(false);features.schedules().catch(()=>{});};

  function renderDraft(){const box=$('attachments-draft');box.replaceChildren();box.hidden=!attachmentsDraft.length&&!referencesDraft.length;for(const [kind,values] of [['file',attachmentsDraft],['chat',referencesDraft]])values.forEach((value,index)=>{const chip=el('button',(kind==='file'?value.name||value.path:value.name)+' ×','draft-chip');chip.type='button';chip.onclick=()=>{values.splice(index,1);renderDraft();};box.append(chip);});}
  $('reference').onclick=()=>{const menu=$('plus-menu');if(menu.querySelector('.reference-form'))return;const form=el('form','','reference-form'),picker=el('select');for(const [kind,items] of [['bot',state.bots],['room',state.rooms]])for(const item of items){const option=el('option',item.name);option.value=kind+':'+item.id;picker.append(option);}const add=el('button','引用');add.type='submit';form.append(picker,add);menu.append(form);form.onsubmit=event=>{event.preventDefault();if(referencesDraft.length>=5){notice('最多引用 5 个聊天。');return;}const [kind,id]=picker.value.split(':');if(!referencesDraft.some(r=>r.kind===kind&&r.id===id))referencesDraft.push({kind,id,name:picker.selectedOptions[0].textContent});renderDraft();setPlus(false);form.remove();};};
  function updateChatColors(){applyChatColors($('transcript'),selected?.kind==='bot'?current():null,state.prefs,app.hasAttribute('data-ds-dark-theme'));}
  const preferenceSaver=createPreferenceSaver({getState:()=>state,save:input=>invoke('team.prefs',input),onBoundary:()=>{refreshEpoch++;},onChange:()=>{stopTheme.update();applyPreferences(app,state.prefs);updateChatColors();}});
  const stopTheme=followHostTheme({app,invoke,getPreferences:()=>state.prefs,savePreferences:input=>preferenceSaver.choose(input),onChange:()=>{applyPreferences(app,state.prefs);updateChatColors();},onError:(error,own)=>notice((own?'保存 PI-bot 外观失败：':'同步 PI-Desktop 外观失败：')+error.message)});
  for(const [id,label,ico] of [['usage-item','用量','GaugeIcon'],['connectors-item','连接器','ConnectorIcon'],['automation-item','自动化任务','ClockIcon'],['bot-settings-item','Bot 设置','GearIcon']]){$(id).append(icon(ico),el('span',label,'bt-menu-label'));}
  for(const id of ['general-item','history-item','capabilities-item','recovery-item','secrets-item','backup-item','extensions-item','about-item'])$(id).hidden=true;
  const menuSeparator=el('div','','bt-menu-sep'),classic=el('button','切换经典 Agent 模式','bt-menu-item');classic.type='button';classic.setAttribute('role','menuitem');classic.prepend(icon('SwitchIcon'));classic.onclick=()=>{menuVisible($('settings-menu'),false);onNative();};$('settings-menu').append(menuSeparator,classic);
  $('account').onclick=()=>{const menu=$('settings-menu'),r=$('account').getBoundingClientRect();menuVisible(menu,menu.hidden||menu.hasAttribute('data-leaving'));menu.style.left=Math.max(8,r.left)+'px';menu.style.bottom=(innerHeight-r.top+6)+'px';};$('bot-settings-item').onclick=()=>{menuVisible($('settings-menu'),false);features.settings('general').catch(()=>{});};$('usage-item').onclick=()=>{menuVisible($('settings-menu'),false);features.usage().catch(()=>{});};$('connectors-item').onclick=()=>{menuVisible($('settings-menu'),false);features.connectors().catch(()=>{});};$('automation-item').onclick=()=>{menuVisible($('settings-menu'),false);features.schedules().catch(()=>{});};
  $('general-item').onclick=()=>{menuVisible($('settings-menu'),false);features.preferences();};$('history-item').onclick=()=>{menuVisible($('settings-menu'),false);features.history($('search').value).catch(()=>{});};$('capabilities-item').onclick=()=>{menuVisible($('settings-menu'),false);features.capabilities().catch(()=>{});};$('backup-item').onclick=()=>{menuVisible($('settings-menu'),false);features.backups().catch(()=>{});};$('about-item').onclick=()=>{menuVisible($('settings-menu'),false);features.about();};
  for(const button of shadow.querySelectorAll('[data-close]'))button.onclick=closeSettings;
  const botPayload=()=>({id:$('bot-id').value||undefined,name:$('bot-name').value,role:$('bot-role').value,agentMode:$('bot-agent-mode').value,avatar:draft?.avatar??null,color:draft?.color??null,modelKey:$('bot-model').value,workDir:$('bot-work-dir').value,thinkingLevel:$('bot-thinking').value,instructions:$('bot-instructions').value,roleLabel:$('bot-role-label').value,memory:$('bot-memory').value});
  $('bot-form').onsubmit=async event=>{event.preventDefault();if($('bot-id').value)return;if(!modelsReady){notice('模型信息尚未读取成功，请稍后再保存设置。');return;}try{const wasNew=!$('bot-id').value;const name=$('bot-name').value.trim();await appearanceSaver.flush();state=await call('team.bot.save',botPayload());if(wasNew){const saved=[...state.bots].reverse().find(b=>b.name===name);if(saved)selected={kind:'bot',id:saved.id};}closeSettings();render();}catch{}};
  $('room-form').onsubmit=async event=>{event.preventDefault();if(roomDraft?.id)return;try{const saved=await createRoomFromUI({...roomDraft,name:$('room-name').value,notice:$('room-notice').value,workDir:$('room-work-dir').value,executionMode:$('room-execution').value,replyMode:$('room-reply').value});if(saved)selected={kind:'room',id:saved.id};closeSettings();render();}catch{}};
  $('bot-duplicate').onclick=async()=>{const id=$('bot-id').value;if(!id)return;try{state=await call('team.bot.duplicate',{botId:id});const copy=[...state.bots].reverse().find(b=>b.id!==id&&b.name.startsWith(draft?.name||''));if(copy)selected={kind:'bot',id:copy.id};closeSettings();render();}catch{}};
  $('bot-delete').onclick=async()=>{const id=$('bot-id').value;if(!id)return;const label=$('bot-delete').querySelector('.bt-bs-label');if(confirming!=='bot'){confirming='bot';label.textContent='再次点击确认删除';$('bot-delete').setAttribute('data-confirm','');return;}confirming=null;await removeBotFromUI(id);};
  $('room-delete').onclick=async()=>{const id=$('room-id').value;if(!id)return;const label=$('room-delete').querySelector('.bt-bs-label');if(confirming!=='room'){confirming='room';label.textContent='再次点击确认删除';$('room-delete').setAttribute('data-confirm','');return;}confirming=null;await removeRoomFromUI(id);};
  const mentionPicker=el('div','','mention-picker');mentionPicker.hidden=true;$('content').closest('.composer-wrap').append(mentionPicker);let mentionRange=null;
  function hideMentions(){mentionPicker.hidden=true;mentionRange=null;}
  function pickMention(name){const field=$('content');if(!mentionRange)return;field.value=field.value.slice(0,mentionRange.start)+'@'+name+' '+field.value.slice(mentionRange.end);field.selectionStart=field.selectionEnd=mentionRange.start+name.length+2;hideMentions();field.dispatchEvent(new Event('input'));field.focus();}
  $('content').oninput=()=>{const field=$('content');$('submit').disabled=!current()||!field.value.trim();field.style.height='30px';field.style.height=Math.min(150,field.scrollHeight)+'px';const before=field.value.slice(0,field.selectionStart),match=/(?:^|\s)@([^@\n]*)$/.exec(before);if(!match||selected?.kind!=='room'){hideMentions();return;}const room=current(),query=match[1].toLowerCase(),members=room.members.map(bot).filter(b=>b&&b.role!=='Administrator'&&b.id!==room.adminId&&b.name.toLowerCase().startsWith(query));mentionPicker.replaceChildren();if(!members.length&&!('all'.startsWith(query))){hideMentions();return;}mentionRange={start:before.length-match[1].length-1,end:field.selectionStart};for(const member of members){const choice=el('button',member.name);choice.type='button';choice.prepend(avatar(member,20,false,false));choice.onmousedown=e=>e.preventDefault();choice.onclick=()=>pickMention(member.name);mentionPicker.append(choice);}if('all'.startsWith(query)){const all=el('button','@all · 全部执行成员');all.type='button';all.onclick=()=>pickMention('all');mentionPicker.append(all);}mentionPicker.hidden=false;};
  let composing=false;
  $('content').addEventListener('compositionstart',()=>{composing=true;});$('content').addEventListener('compositionend',()=>{composing=false;});
  $('content').onkeydown=event=>{if(event.isComposing||composing||event.keyCode===229)return;if(!mentionPicker.hidden&&event.key==='Escape'){event.preventDefault();hideMentions();return;}if(!mentionPicker.hidden&&(event.key==='Enter'||event.key==='Tab')){event.preventDefault();mentionPicker.querySelector('button')?.click();return;}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(!event.repeat)$('send').requestSubmit();}};
  $('send').onsubmit=async event=>{event.preventDefault();if(answerSending)return;if(!selected||!current()||composing||!$('content').value.trim())return;const target={...selected},content=$('content').value,attachments=attachmentsDraft,references=referencesDraft;const question=chatQuestions().find(q=>q.status==='pending');if(question&&!attachments.length&&!references.length){answerSending=true;try{await call('team.question.answer',{id:question.id,text:content});if(selectionKey(selected)===selectionKey(target)&&$('content').value===content){$('content').value='';$('content').style.height='30px';}await refresh();}catch{}finally{answerSending=false;}return;}$('content').value='';$('content').style.height='30px';attachmentsDraft=[];referencesDraft=[];hideMentions();renderDraft();notice('');outbox.submit(target,content,attachments,references);transcriptNavigation.latest();$('content').focus();};
  const visibleChats=()=>[...$('list').querySelectorAll('[data-id]')].map(n=>({kind:state.rooms.some(r=>r.id===n.dataset.id)?'room':'bot',id:n.dataset.id}));
  const stopShortcuts=createChatShortcuts({enabled:interactive,isModal:()=>Boolean(app.querySelector('dialog[open],.pi-new-chat:not([hidden]),.bt-avedit')),actions:{search:()=>chatSearch.open(),find:()=>chatSearch.find(),sidebar:()=>setSidebar(!app.hasAttribute('data-sidebar-collapsed')),newChat:()=>newChat.show(),settings:()=>features.settings('general').catch(()=>{}),quote:()=>textQuote.quote(),focus:()=>$('content').focus(),send:()=>$('send').requestSubmit(),move:delta=>{const chats=visibleChats(),index=chats.findIndex(c=>c.kind===selected?.kind&&c.id===selected?.id),next=chats[(index+delta+chats.length)%chats.length];if(next)select(next.kind,next.id);},index:index=>{const next=visibleChats()[index];if(next)select(next.kind,next.id);}}});
  const updateNotice=createUpdateNotice({host:app.querySelector('.bt-side-top'),before:$('search-toggle'),call:invoke,openAbout:()=>features.settings('about').catch(()=>{})});
  bootstrap();let lastRefresh=0;const timer=setInterval(()=>{const active=state.jobs.some(j=>['queued','launching','running','waiting'].includes(j.status));if(Date.now()-lastRefresh>=(active?450:2400)){lastRefresh=Date.now();refresh().catch(()=>{});}},500);
  const dispose=()=>{closed=true;updateNotice.dispose();stopShortcuts();chatSearch.dispose();textQuote.dispose();activeRead.dispose();liveResponses.close();memoryNotice.close();document.removeEventListener('keydown',menuKey,true);stopAvatarMotion.dispose();memberDock.dispose();listMotion.dispose();window.removeEventListener('pi-bot:mode',voiceMode);voice.dispose();voiceView.dispose();dictationView.dispose();microphoneSettings.dispose();app.removeEventListener('pi-microphone-setup',openMicrophone);clearInterval(timer);clearTimeout(appearanceFrame);drawer.dispose();detailsPreview.dispose();newChat.dispose();botCreator.dispose();preferenceSaver.close();stopTheme();questionsUI.close();viewsUI.close();transcriptNavigation.close();closeAvatarEditor();pickers.dispose();contextMenu.dispose();stopScrollReveal();stopUnread();appearanceSaver.close().catch(()=>{});try{features.close();}finally{interactionMotion.dispose();target.replaceChildren();}};
  dispose.workspaceSession=()=>{if(!selected)return null;const item=selected?.kind==='bot'?state.bots.find(b=>b.id===selected.id):null;return item?.sessions?.private||state.jobs.findLast(j=>(selected?.kind==='room'?j.roomId===selected.id:j.botId===selected?.id)&&j.sessionId)?.sessionId||null;};
  return dispose;
}
