import {mountCapabilityAssignment} from './capability-assignment.mjs';
import {createExtensions} from './extensions.mjs';
import {mountSkillImport} from './skill-import.mjs';
import {el} from './dom.mjs';
import {createAdvanced} from './advanced.mjs';
import {createSettingsShell} from './settings-shell.mjs';
import {createSettingsPages} from './settings-pages.mjs';
import {THEMES} from './upstream/themes.mjs';
import {luminance,isHex,INKS,ACCENT_INKS} from './upstream/inks.mjs';

export function applyPreferences(app,prefs={}){
  const dark=app.hasAttribute('data-ds-dark-theme'),mode=(THEMES[prefs.theme]||THEMES.deepseek)[dark?'dark':'light'];
  const alpha=(color,n)=>'rgba('+[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',')+','+n+')';
  const preset=ACCENT_INKS.map(id=>INKS[id]).find(pair=>pair[0].toLowerCase()===(prefs.accent||'').toLowerCase());const accent=dark&&preset?preset[1]:prefs.accent||mode.accent;
  const values={'--bt-main':mode.bg,'--bt-sidebar':mode.sidebar,'--bt-bubble':mode.bubble,'--bt-card':mode.card,'--bt-ink':mode.text,'--bt-ink-2':alpha(mode.text,.6),'--bt-ink-3':alpha(mode.text,.36),'--bt-line':alpha(mode.text,.08),'--bt-line-2':alpha(mode.text,.15),'--bt-user':mode.user,'--bt-user-ink':mode.userText,'--bt-accent':accent};
  Object.assign(values,{'--bt-hover':dark?'rgba(160,160,160,.12)':'rgba(119,119,119,.09)','--bt-active':dark?'rgba(160,160,160,.2)':'rgba(119,119,119,.17)','--bt-accent-ink':luminance(isHex(values['--bt-accent'])?values['--bt-accent']:mode.accent)>.45?'#141414':'#ffffff','--bt-tag-bg':alpha(mode.text,dark ? .09 : .06),'--bt-tag-ink':alpha(mode.text,.58)});
  for(const [key,value] of Object.entries(values))if(app.style.getPropertyValue(key)!==value)app.style.setProperty(key,value);
  if(app.dataset.btMotion!==(prefs.motion||'normal'))app.dataset.btMotion=prefs.motion||'normal';
}
const button=(text,run)=>{const b=el('button',text,'soft-button');b.type='button';b.onclick=()=>Promise.resolve().then(run).catch(error=>b.dispatchEvent(new CustomEvent('settings-error',{bubbles:true,detail:error})));return b;};
const input=(placeholder,value='')=>{const i=el('input');i.placeholder=placeholder;i.value=value;return i;};
const select=(choices,value)=>{const s=el('select');for(const [id,name] of choices){const o=el('option',name);o.value=id;s.append(o);}if(value!==undefined)s.value=value;return s;};
const label=(text,control)=>{const l=el('label',text);l.append(control);return l;};
const num=value=>Number.isFinite(value)?value.toLocaleString():'未记录';

export function createFeatures({app,call,getState,update,selectChat,onNative,notice,editEntity,avatar,cluster,assignCapabilities,savePreferences}){
  let generation=0,memoryTimer,disposeBody;
  const leave=()=>{disposeBody?.();disposeBody=null;clearTimeout(memoryTimer);};
  const shell=createSettingsShell({app,onNative,onLeave:leave,onNavigate:page=>pages.open(page).catch(e=>notice(e.message))}),{dialog,body}=shell;
  const originalNotice=notice;notice=value=>{originalNotice(value);if(dialog.open)shell.notify(value);};
  const goNative=()=>{dialog.close();onNative();};
  const routes={'通用':'general','外观与记忆设置':'general','能力库':'capabilities','能力':'capabilities','用量统计':'usage','用量':'usage','自动化任务':'schedules','定时任务':'schedules','Bot 密钥管理':'secrets','密钥':'secrets','连接器':'connectors','Bot MCP 授权':'connectors','关于 PI-bot':'about','备份与恢复':'about','扩展功能':'about','任务恢复中心':'about','反馈':'feedback'};
  const show=(name,options={})=>{generation++;shell.show(name,options.page||routes[name]||shell.route(),options);return generation;};
  dialog.addEventListener('close',()=>{generation++;});
  dialog.addEventListener('settings-error',event=>notice(event.detail.message||'操作失败。'));
  const info=text=>body.append(el('p',text,'feature-note'));
  async function preferences(){
    show('外观与记忆设置');const prefs=getState().prefs||{};
    const appearanceMode=select([['host','跟随 PI-Desktop'],['independent','PI-bot 独立外观']],prefs.appearanceMode||'host');
    const appearance=select([['light','浅色'],['dark','暗色']],prefs.appearance||'light');
    appearanceMode.setAttribute('aria-label','明暗模式同步');appearance.setAttribute('aria-label','PI-bot 独立明暗模式');
    const syncAppearance=()=>{appearance.disabled=appearanceMode.value!=='independent';};appearanceMode.onchange=syncAppearance;syncAppearance();
    const theme=select(Object.entries(THEMES).map(([id,t])=>[id,t.label]),prefs.theme||'deepseek');
    theme.setAttribute('aria-label','主题');
    const color=input('',prefs.accent||'#4d6bfe');color.type='color';
    const motion=select([['quiet','安静'],['normal','普通'],['lively','活泼']],prefs.motion||'normal');
    const review=el('input');review.type='checkbox';review.checked=prefs.memoryReview!==false;
    body.append(label('明暗模式同步',appearanceMode),label('PI-bot 独立明暗模式',appearance),label('主题',theme),label('强调色',color),label('头像动效',motion),label('自动提取用户记忆',review));
    info('明暗模式位于插件设置的“通用 → 外观”；可跟随 PI Desktop，也可独立选择浅色或深色。此选项随团队备份迁移。');
    info('自动记忆会调用 Bot 所选的模型，计入用量。只提取用户说过的内容；文件和网页中的指令不作为记忆指令。');
    body.append(button('保存',async()=>{await savePreferences({appearanceMode:appearanceMode.value,appearance:appearance.value,theme:theme.value,accent:color.value,motion:motion.value,memoryReview:review.checked});notice('设置已保存。');dialog.close();}),button('恢复主题强调色',async()=>{await savePreferences({accent:null});dialog.close();}));
  }
  const advanced=createAdvanced({body,show,call,getState,notice,download,isCurrent:token=>token===generation&&dialog.open});
  const extensions=createExtensions({body,show,call,getState,notice,download,isCurrent:token=>token===generation&&dialog.open});
  async function connectors(){
    const token=show('连接器');body.append(button('管理 Bot MCP 授权',()=>advanced.mcp()),button('管理 Bot 密钥',()=>advanced.secrets()));info('使用 PI 原生 MCP 连接器，执行成员继承原生会话的工具配置。此处读取真实状态；新增、登录与启停在 PI 原生 MCP 设置完成。');
    const view=await call('team.connectors');if(token!==generation)return;
    if(!view.servers.length)info('当前没有已配置的 MCP 连接器。');
    for(const server of view.servers){const status=view.statuses.find(s=>s.serverId===server.id);const row=el('section','','feature-card');row.append(el('strong',server.name),el('p',server.enabled===false?'已停用':status?.state||'状态未报告'),el('small',status?.tools!==undefined?'工具数：'+status.tools:''));if(status?.error)row.append(el('p',status.error));body.append(row);}
    body.append(button('刷新',connectors),button('返回 PI 配置连接器',()=>{dialog.close();onNative();}));
  }
  async function capabilities(editing,botId){
    const token=show('能力',{page:'capabilities'}),view=await call('team.capabilities');if(token!==generation)return;
    const shared=el('section','','bt-set-section'),toolbar=el('div','','pi-capability-toolbar'),list=el('div','','bt-set-card'),importArea=el('div');shared.append(el('h3','共享能力'),toolbar,list);body.append(shared);
    toolbar.append(button('添加能力',()=>capabilities({kind:'skill'},botId)),button('导入 Skill',()=>{importArea.hidden=!importArea.hidden;}));for(const b of toolbar.children)b.className='bt-soft bt-soft-sm';
    if(!view.items.length)list.append(el('div','还没有保存能力','pi-settings-empty'));
    for(const item of view.items){const card=el('div','','bt-connector'),head=el('div','','bt-connector-head'),copy=el('span','','bt-connector-text'),actions=el('div','','bt-connector-actions');copy.append(el('span',item.name,'bt-connector-name'),el('span',item.description||(item.kind==='pack'?'能力包 · '+item.items.join('、'):item.kind==='skill'?'Skill':'MCP'),'bt-connector-status'));const edit=button('编辑',()=>capabilities(item,botId)),remove=button('删除',async()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='再次点击删除';return;}await call('team.capability.delete',{name:item.name});await capabilities(undefined,botId);});edit.className=remove.className='bt-soft bt-soft-sm';actions.append(edit,remove);head.append(copy,actions);card.append(head);list.append(card);}
    importArea.hidden=true;body.append(importArea);const disposeImport=mountSkillImport({body:importArea,call,notice,isCurrent:()=>token===generation&&dialog.open,onImported:()=>capabilities(undefined,botId)});
    if(editing){
      const saved=Boolean(editing.name),form=el('form','','bt-set-card pi-capability-form'),name=input('例如 research-skill',editing.name),kind=select([['skill','Skill'],['pack','能力包'],['mcp','PI 原生 MCP 引用']],editing.kind||'skill'),description=input('用途描述',editing.description),fields=el('div'),content=el('textarea');content.value=editing.content||'';content.rows=5;name.required=true;name.maxLength=32;if(saved){name.disabled=true;kind.disabled=true;}
      const mcp=await call('team.connectors');if(token!==generation)return;const server=select(mcp.servers.map(s=>[s.id,s.name]),editing.serverId),children=el('fieldset');children.append(el('legend','选择能力包成员'));
      for(const item of view.items.filter(i=>i.kind!=='pack')){const cb=el('input');cb.type='checkbox';cb.value=item.name;cb.checked=(editing.items||[]).includes(item.name);children.append(label(item.name,cb));}
      const draw=()=>{fields.replaceChildren();if(kind.value==='skill')fields.append(label('Skill 指令',content));else if(kind.value==='mcp')fields.append(label('原生连接器',server));else fields.append(children);};kind.onchange=draw;draw();
      const save=el('button',saved?'保存修改':'添加能力','bt-soft bt-soft-sm');save.type='submit';form.append(label('名称',name),label('类型',kind),label('说明',description),fields,button('取消',()=>capabilities(undefined,botId)),save);body.append(form);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await call('team.capability.save',{name:name.value,kind:kind.value,description:description.value,content:content.value,serverId:server.value,items:[...children.querySelectorAll('input:checked')].map(i=>i.value)});await capabilities(undefined,botId);}catch(e){notice(e.message);}finally{save.disabled=false;}};
    }
    const assignment=mountCapabilityAssignment({body,items:view.items,getState,botId,isCurrent:()=>token===generation&&dialog.open,save:assignCapabilities});
    assignment.section.hidden=!botId;
    const showAssignment=button('批量分配',()=>{assignment.section.hidden=!assignment.section.hidden;if(!assignment.section.hidden)assignment.section.scrollIntoView({block:'start',behavior:'smooth'});});showAssignment.className='bt-soft bt-soft-sm';toolbar.append(showAssignment);
    disposeBody=()=>{disposeImport();assignment.dispose();};
    void installedPlugins(token);
  }
  async function usage(options={}){
    const token=show('用量统计');const now=Date.now();
    const range=select([['1','24 小时'],['7','7 天'],['30','30 天'],['90','90 天'],['365','一年'],['custom','自选日期']],String(options.days||30));
    const owner=select([['','全部 Bot'],...getState().bots.map(b=>[b.id,b.name])],options.botId||'');
    const from=input('',options.from||new Date(now-30*86400000).toLocaleDateString('sv-SE')),to=input('',options.to||new Date(now).toLocaleDateString('sv-SE'));from.type=to.type='date';
    const filters=el('div','','feature-filters');filters.append(range,owner,from,to,button('查看',()=>usage({days:range.value,botId:owner.value,from:from.value,to:to.value})));body.append(filters);
    const fromMs=options.days==='custom'?new Date(from.value+'T00:00:00').getTime():now-Number(options.days||30)*86400000;
    const toMs=options.days==='custom'?new Date(to.value+'T23:59:59').getTime():now;
    const view=await call('team.usage',{fromMs,toMs,botId:options.botId||undefined});if(token!==generation)return;
    const summary=el('div','','feature-card');summary.append(el('strong',num(view.total.tokens)+' tokens'),el('p','输出 '+num(view.total.outputTokens)+' tokens · '+view.total.records+' 条任务/调用记录'),el('small',view.total.incomplete?'部分记录没有报告 Token。':'已按报告的用量统计。'));body.append(summary);
    const rows=(name,data)=>{body.append(el('h3',name));const table=el('table','','feature-table');const head=el('tr');head.append(el('th','名称'),el('th','Token'),el('th','调用'));table.append(head);for(const row of data){const tr=el('tr');tr.append(el('td',row.name||row.id),el('td',num(row.tokens)),el('td',String(row.calls)));table.append(tr);}body.append(table);};
    rows('按 Bot',view.bots);rows('按模型',view.models);
    body.append(el('h3','每日用量'));const bars=el('div','','usage-bars'),max=Math.max(1,...view.days.map(d=>d.tokens||0));
    for(const day of view.days){const row=el('div','','usage-bar-row'),bar=el('span','','usage-bar');bar.style.width=Math.max(1,(day.tokens||0)/max*100)+'%';row.title=day.id+' · '+num(day.tokens);row.append(el('small',day.id),bar,el('small',num(day.tokens)));bars.append(row);}body.append(bars);info(view.coverage);
    body.append(button('导出统计 JSON',()=>download('PI-bot-usage.json',JSON.stringify(view,null,2),'application/json')));
  }
  async function schedules(editing,botId){
    const token=show('定时任务',{page:'schedules'});info('需要 PI-Desktop 保持运行、插件启用，并选中创建任务时的工作区。关闭期间不会连续补跑重复任务；派发中断时暂停并提示检查。');
    const view=await call('team.schedules');if(token!==generation)return;
    const state=getState();for(const task of view.tasks.filter(task=>!botId||task.targetKind==='bot'&&task.targetId===botId)){
      const card=el('section','','feature-card');card.append(el('strong',task.title),el('p',task.prompt),el('small',(task.enabled?'启用':'暂停')+' · '+task.status+' · 下次：'+(task.nextAt?new Date(task.nextAt).toLocaleString():'无')));
      if(task.error)card.append(el('p',task.error,'message-error'));
      card.append(el('p','工作区：'+task.workspace,'feature-note'),button('编辑',()=>schedules(task)),button(task.enabled?'暂停':'启用',async()=>{await call('team.schedule.toggle',{id:task.id,enabled:!task.enabled});await schedules();}));
      const remove=button('删除',async()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='再次点击确认删除';return;}await call('team.schedule.delete',{id:task.id});await schedules();});card.append(remove);
      if(task.runs?.length){const details=el('details');details.append(el('summary','最近派发记录'));for(const run of task.runs.slice(-10).reverse())details.append(el('p',new Date(run.at).toLocaleString()+' · '+run.status+(run.error?' · '+run.error:'')));card.append(details);}body.append(card);
    }
    if(!editing){const create=button('新建定时任务',()=>schedules('new',botId));create.className='bt-soft bt-soft-sm';body.append(create);if(!view.tasks.length){const empty=el('div','','bt-us-empty');empty.append(el('strong','还没有定时任务'),el('span','为 Bot 或群聊安排一项任务。'));body.append(empty);}return;}
    body.append(el('h3',editing?.id?'编辑任务':'新建任务'));
    const form=el('form','','feature-form'),name=input('任务名称',editing?.title),prompt=el('textarea');prompt.placeholder='具体任务、输入、输出和验收要求';prompt.value=editing?.prompt||'';prompt.rows=4;name.required=prompt.required=true;
    const choices=[...state.bots.map(b=>['bot:'+b.id,b.name]),...state.rooms.map(r=>['room:'+r.id,'群聊 · '+r.name])],target=select(choices,editing?.id?editing.targetKind+':'+editing.targetId:botId?'bot:'+botId:choices[0]?.[0]);
    const kind=select([['at','指定时间'],['every','固定间隔'],['daily','每天'],['weekly','每周']],editing?.when?.kind||'at');
    const when=el('div'),at=input('',editing?.when?.at?localISO(new Date(editing.when.at)):''),time=input('',editing?.when?.time||'09:00'),minutes=input('',String(editing?.when?.minutes||60)),zone=input('IANA 时区',editing?.when?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone);at.type='datetime-local';time.type='time';minutes.type='number';minutes.min=1;minutes.max=10080;
    const days=el('fieldset');days.append(el('legend','星期'));for(let n=1;n<=7;n++){const cb=el('input');cb.type='checkbox';cb.value=n;cb.checked=(editing?.when?.weekdays||[1]).includes(n);days.append(label(['','一','二','三','四','五','六','日'][n],cb));}
    const timing=()=>{when.replaceChildren();if(kind.value==='at')when.append(label('日期和时间',at));else if(kind.value==='every')when.append(label('每隔多少分钟',minutes));else{when.append(label('时刻',time),label('时区',zone));if(kind.value==='weekly')when.append(days);}};kind.onchange=timing;timing();
    const save=el('button',editing?.id?'保存修改':'创建任务','soft-button');save.type='submit';form.append(label('名称',name),label('发送给',target),label('任务内容',prompt),label('何时执行',kind),when,save);body.append(form);
    form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const [targetKind,targetId]=target.value.split(':');await call('team.schedule.save',{id:editing?.id,title:name.value,prompt:prompt.value,targetKind,targetId,when:{kind:kind.value,at:at.value?new Date(at.value).toISOString():null,time:time.value,minutes:Number(minutes.value),timeZone:zone.value,weekdays:[...days.querySelectorAll('input:checked')].map(i=>Number(i.value))}});await schedules();}catch{}finally{save.disabled=false;}};
  }
  async function history(query=''){
    const token=show('搜索聊天记录'),form=el('form'),q=input('搜索消息内容',query);const search=el('button','搜索','soft-button');search.type='submit';form.append(q,search);body.append(form);
    form.onsubmit=event=>{event.preventDefault();history(q.value).catch(()=>{});};q.focus();if(!query)return;
    const view=await call('team.history.search',{query});if(token!==generation)return;
    if(!view.results.length)info('没有匹配的消息。');
    for(const result of view.results){const row=el('section','','feature-card');row.append(button(result.name+(result.archived?' · 已归档':'')+' · '+result.who,()=>{if(result.archived)return archivedHistory(result);selectChat(result.kind,result.targetId,result.lineId);dialog.close();}),el('p',result.text),el('small',new Date(result.at).toLocaleString()));body.append(row);}
  }
  async function archivedHistory(result){
    const token=show(result.name+' · 已归档的聊天');info('删除前保存的历史，仅供阅读。');
    const view=await call('team.transcript',{kind:result.kind,id:result.targetId});if(token!==generation)return;
    let anchor;for(const line of view.lines||[]){const row=el('section','','feature-card');row.append(el('strong',line.who||''),el('p',line.text||''),el('small',new Date(line.at).toLocaleString()));if(line.id===result.lineId){anchor=row;row.dataset.searchMatch='true';}body.append(row);}
    anchor?.scrollIntoView({block:'center',behavior:'instant'});
  }
  async function memory(bot,{group=false}={}){
    if(!bot?.id){notice('请先保存机器人，再管理记忆。');return;}
    const target=group?{roomId:bot.id}:{botId:bot.id};
    const token=show(bot.name+(group?' · 群聊记忆':' · 长期记忆'));
    const panel=el('section','','pi-memory-panel');body.append(panel);
    if(group)panel.append(el('p','仅本群成员在此群聊中读取和更新这些记忆；不会自动写入其他群聊或私聊。历史上已保存到机器人或团队的条目不会被自动移动。','feature-note'));
    const summary=el('div','','feature-card'),entries=el('div'),text=el('textarea');text.placeholder='询问已保存的记忆，或说明要增加、纠正、删除的内容';text.rows=3;
    const scope=select(group?[['group','本群共享记忆']]:[['own','机器人记忆'],['team','团队共享记忆']]);const topic=input('主题（可留空）');
    const draw=async(regenerate=false)=>{
      clearTimeout(memoryTimer);const view=await call('team.memory.view',{...target,summarize:true,regenerate});if(token!==generation||!dialog.open)return;
      summary.replaceChildren(el('strong','记忆摘要'),el('p',view.summary?.text||(view.summarizing?'正在生成摘要…':'尚无摘要。')));if(view.error)summary.append(el('p',view.error,'message-error'));
      summary.append(el('small',group?'本群 '+view.sizes.group+' / '+view.limits.main+' 字符':'机器人 '+view.sizes.own+' / '+view.limits.main+' 字符；团队 '+view.sizes.team+' 字符'));
      entries.replaceChildren();for(const entry of view.entries){const row=el('section','','feature-card');row.append(el('small',({team:'团队',group:'本群',own:'机器人'}[entry.scope]||'机器人')+(entry.topic?' · '+entry.topic:'')+' · '+(entry.added||'')),el('p',entry.text));const remove=button('删除',async()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='确认删除';return;}await call('team.memory.forget',{...target,scope:entry.scope,text:entry.text,topic:entry.topic});await draw();});row.append(remove);entries.append(row);}
      if(!view.entries.length)entries.append(el('p','尚无记忆。'));
      if(view.summarizing)memoryTimer=setTimeout(()=>draw().catch(()=>{}),1200);
    };
    panel.append(summary,button('重新生成摘要',()=>draw(true)),entries,label('记忆范围',scope),label('主题',topic),text);
    panel.append(button('添加条目',async()=>{await call('team.memory.add',{...target,text:text.value,scope:scope.value,topic:topic.value||undefined});text.value='';await draw();}),button('询问或更新记忆',async()=>{const reply=await call('team.memory.ask',{...target,text:text.value});notice(reply.reply||reply.text||JSON.stringify(reply));text.value='';await draw();}));
    await draw();
  }
  async function backups(){
    const token=show('备份与恢复');
    info('更新保留原配置；卸载重装时，从独立备份找回 Bot、群聊、头像、记忆和插件聊天记录。自动保留最近 30 份备份。');
    const view=await call('team.backup',{action:'status'});if(token!==generation)return;
    info('本机独立备份：'+view.path);
    if(view.error)info('备份异常：'+view.error);
    if(view.recovered)info('本次启动已恢复：'+view.recovered.reason);
    if(view.pending){info('已准备恢复。请完整退出并重新打开 PI，旧任务不会自动重跑；定时任务将暂停，检查后可重新启用。');body.append(button('取消待恢复操作',async()=>{await call('team.backup',{action:'cancel'});await backups();}));}
    body.append(button('立即备份',async()=>{await call('team.backup',{action:'create'});await backups();notice('已生成独立备份。');}),button('导出备份文件',async()=>{const text=await call('team.backup',{action:'export'});download('PI-bot-个人备份-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',text,'application/json');}));
    body.append(button('单独导出／导入加密密钥',()=>advanced.secrets()));
    info('密钥不包含在普通个人备份中。迁移时另行导出加密密钥文件；本地 MCP 路径需要在新电脑检查后启用。');
    info('导出的个人备份含配置、记忆与插件聊天，请自行保管。新电脑安装插件后，在此导入个人备份；PI 模型账号、原生完整会话和电脑上的文件需要另行迁移。');
    const file=el('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','选择个人备份文件');const preview=el('section','','feature-card');preview.hidden=true;body.append(label('从文件恢复',file),preview);
    file.onchange=async()=>{
      const selected=file.files?.[0];if(!selected)return;preview.hidden=false;preview.replaceChildren(el('p','正在检查备份…'));
      try{
        if(selected.size>32*1024*1024)throw Error('备份文件最多 32 MB。');const text=await selected.text(),upload=await call('team.backup',{action:'begin'});
        for(let offset=0;offset<text.length;offset+=6000)await call('team.backup',{action:'chunk',id:upload.id,offset,chunk:text.slice(offset,offset+6000)});
        const checked=await call('team.backup',{action:'preview',id:upload.id});if(token!==generation)return;
        preview.replaceChildren(el('strong',checked.bots+' 个 Bot，'+checked.rooms+' 个群聊'),el('p','备份时间：'+new Date(checked.at).toLocaleString()),el('p','恢复将替换当前团队。会先备份当前数据，重启 PI 后生效。'));
        preview.append(button('确认恢复这份个人备份',async()=>{await call('team.backup',{action:'commit',id:upload.id});await backups();notice('备份已准备好，请完整退出并重新打开 PI。');}));
      }catch(error){preview.replaceChildren(el('p',error.message,'message-error'));}
    };
    body.append(el('h3','本机恢复点'));
    if(!view.items.length)info('还没有恢复点，点击“立即备份”创建。');
    for(const item of view.items){const row=el('section','','feature-card');row.append(el('strong',new Date(item.at).toLocaleString()),el('p',item.bots+' 个 Bot · '+item.rooms+' 个群聊'));
      const restore=button('恢复这份备份',async()=>{if(!restore.dataset.confirm){restore.dataset.confirm='yes';restore.textContent='再次点击确认替换当前团队';return;}await call('team.backup',{action:'restore',id:item.id});await backups();notice('已准备恢复，请完整退出并重新打开 PI。');});row.append(restore);body.append(row);}
  }
  // Every entry and return visit uses the same capability page. PI plugins
  // remain separate from imported Skills because the host controls their use.
  async function installedPlugins(ticket){
    const section=el('section','','bt-set-section pi-installed-plugins'),actions=el('div','','bt-actions'),list=el('div','','bt-set-card'),status=el('p','正在读取 PI 应用…','feature-note');
    section.append(el('h3','已安装的 PI 应用'),el('p','由 PI Desktop 管理安装和启停；与上方可分配给 Bot 的 Skill 能力库分别显示。','feature-note'),actions,list);
    const manage=button('管理 PI 应用',goNative),mcp=button('连接 MCP',()=>advanced.mcp());manage.className=mcp.className='bt-soft bt-soft-sm';actions.append(mcp,manage);list.append(status);body.append(section);
    const load=async()=>{
      status.textContent='正在读取 PI 应用…';list.replaceChildren(status);
      try{
        const result=await call('team.plugins');if(ticket!==generation||!dialog.open)return;
        const rows=Array.isArray(result)?result:result?.plugins||[];list.replaceChildren();
        const labels={ready:'可用',disabled:'已停用',enabled:'已启用',installed:'已安装',error:'异常'};
        for(const item of rows){const card=el('div','','bt-connector'),head=el('div','','bt-connector-head'),copy=el('span','','bt-connector-text'),value=item.status||(item.enabled===false?'disabled':'installed');copy.append(el('span',item.name||item.manifest?.name||item.id,'bt-connector-name'),el('span',[item.version||item.manifest?.version,labels[value]||value].filter(Boolean).join(' · '),'bt-connector-status'));head.append(copy);card.append(head);list.append(card);}
        if(!rows.length)list.append(el('div','暂无可显示的 PI 应用；可在 PI Desktop 设置中管理。','pi-settings-empty'));
      }catch{
        if(ticket!==generation||!dialog.open)return;
        const retry=button('重新读取',load);retry.className='bt-soft bt-soft-sm';status.textContent='暂时无法读取 PI 应用列表，请重试或前往 PI Desktop 设置查看。';list.replaceChildren(status,retry);
      }
    };
    await load();
  }
  async function plugins(){return capabilities();}
  function about(){show('关于 PI-bot');info('PI Bot 0.3.78 · 面向 PI-Desktop 插件接口适配。对照上游 0.1.7：Fei2411 / DeepSeek-Bot，保留原许可证和来源记录。');info('PI 适配保留自定义头像、侧栏入口和“PI 原生界面”返回入口。群聊保留串行与并行；主机器人可选只规划分派或在私聊直接执行。');info('使用 PI 原生 Agent 的上下文压缩和工具审批。新增按 Bot 授权的本地 MCP、Windows 加密密钥库、加密密钥迁移及任务恢复中心。MCP 授权约束本插件桥接入口，PI 原生全局工具仍由 PI 管理。恢复依据会话记录，不是执行中途的进程快照。扩展功能包含每 Bot 独立 Edge/Chrome 浏览器、语音转写与系统朗读、Windows OCR、完整会话索引和本机 Bot API。专属命令工具支持密钥环境变量；PI 原生 shell 保持由客户端管理。');const diagnostics=getState().diagnostics||[];body.append(button('导出诊断（不含聊天正文）',()=>download('PI-bot-diagnostics.json',JSON.stringify(diagnostics,null,2),'application/json')));}
  const pages=createSettingsPages({body,show,call,getState,update,savePreferences,notice,onNative:goNative,download,editEntity,avatar,cluster,isCurrent:token=>token===generation&&dialog.open,legacy:{preferences,capabilities,schedules,secrets:advanced.secrets,mcp:advanced.mcp,recovery:advanced.recovery,backups,extensions:extensions.extensions,history}});
  return {...advanced,...extensions,plugins,preferences:()=>pages.open('general'),connectors:()=>pages.open('connectors'),capabilities,usage:options=>pages.open('usage',options),schedules,secrets:botId=>pages.open('secrets',{botId}),history,archivedHistory,memory,backups,about:()=>pages.open('about'),settings:page=>pages.open(page||'general'),isSettingsOpen:shell.isOpen,presentEntity(kind,name,form,restore){show(name,{page:kind==='bot'?'bots':'groups',move:'in',back:()=>pages.open(kind==='bot'?'bots':'groups')});const wrap=el('div','','bt-settings-form');wrap.append(form);body.append(wrap);disposeBody=restore;},close(){extensions.dispose();shell.dispose();}};
}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function localISO(date){const pad=n=>String(n).padStart(2,'0');return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());}
