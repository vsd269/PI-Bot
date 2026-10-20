import {morphHeight} from './interaction-motion.mjs';
import {el,icon} from './dom.mjs';
import {soft,row,section,choose,segments,href,textInput} from './settings-ui.mjs';
import {THEMES} from './upstream/themes.mjs';
import {ACCENT_INKS,INKS} from './upstream/inks.mjs';
import {createUsagePage} from './settings-usage.mjs';
// PI Bot project links; upstream attribution is kept separately.
const REPO='https://github.com/vsd269/PI-Bot';
const UPSTREAM='https://github.com/Fei2411/DeepSeek-Bot';
export function createSettingsPages({body,show,call,getState,update,savePreferences,notice,onNative,download,editEntity,avatar,cluster,isCurrent,legacy}){
  const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){notice(e.message||'操作失败。');}};
  const savePrefs=safe(async patch=>savePreferences?savePreferences(patch):update(await call('team.prefs',patch)));
  const usage=createUsagePage({body,show,call,getState,isCurrent,notice,avatar});
  let feedbackDraft='';
  function general(){
    show('通用',{page:'general'});const prefs=getState().prefs||{};
    const appearance=choose('明暗模式',[['host','跟随 PI Desktop'],['light','浅色'],['dark','深色']],prefs.appearanceMode==='independent'?prefs.appearance||'light':'host',safe(async value=>{
      await savePrefs(value==='host'?{appearanceMode:'host'}:{appearanceMode:'independent',appearance:value});
      const current=getState().prefs||{};appearance.value=current.appearanceMode==='independent'?current.appearance||'light':'host';
    }));
    const theme=choose('主题',Object.entries(THEMES).map(([id,t])=>[id,t.label]),prefs.theme||'deepseek',safe(async theme=>{await savePrefs({theme});}));
    const swatches=el('div','','bt-swatches'),colors=[['主题强调色',null],...ACCENT_INKS.map(id=>[id==='charcoal'?'黑色':id,INKS[id][0]])];
    for(const [name,color] of colors){const b=soft('',safe(async()=>{await savePrefs({accent:color});for(const n of swatches.querySelectorAll('button'))n.setAttribute('aria-pressed',String(n===b));customLabel.dataset.on='false';}));b.className='bt-swatch'+(color?'':' bt-swatch-default');b.title=name;b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',String(color?(prefs.accent||'').toLowerCase()===color.toLowerCase():!prefs.accent));if(color)b.style.background=color;swatches.append(b);}
    const customLabel=el('label','','bt-swatch bt-swatch-custom'),color=textInput('自定义强调色','','color');color.value=prefs.accent||'#4d6bfe';customLabel.title='自定义强调色';customLabel.append(color);customLabel.dataset.on=String(!!prefs.accent&&!ACCENT_INKS.some(id=>INKS[id][0].toLowerCase()===prefs.accent.toLowerCase()));color.onchange=safe(async()=>{await savePrefs({accent:color.value});for(const n of swatches.querySelectorAll('button'))n.setAttribute('aria-pressed','false');customLabel.dataset.on='true';});swatches.append(customLabel);
    body.append(section('外观',row('明暗模式','统一在此设置浅色、深色或跟随客户端。',appearance),row('主题','整个团队的配色。',theme),row('强调色','私聊气泡跟随 Bot 颜色；选择黑色可关闭。群聊使用主题气泡。',swatches)),section('模式',row('经典 Agent 模式','',soft('切换',()=>onNative()))));
    const shortcuts=el('details','','pi-shortcuts');shortcuts.append(el('summary','键盘快捷键'));
    for(const [name,key] of [['搜索 Bot、群聊、消息和附件','Ctrl+K'],['查找当前聊天','Ctrl+F'],['收起 / 展开左侧栏','Ctrl+B'],['新建聊天','Ctrl+N'],['打开设置','Ctrl+,'],['引用选中文字 / 聚焦输入框','Ctrl+L'],['聚焦输入框','Ctrl+I'],['切换上一 / 下一会话','Alt+↑ / ↓'],['打开第 1–9 个会话','Ctrl+1–9'],['发送 / 换行','Enter / Shift+Enter'],['语音输入','Alt+V']]){const entry=el('div','','pi-shortcut-row');entry.append(el('span',name),el('kbd',key));shortcuts.append(entry);}body.append(shortcuts);
  }
  function mainBots(){
    const state=getState(),mains=state.bots.filter(b=>b.role==='Administrator'),first=mains[0],candidates=state.bots.filter(b=>b.role!=='Administrator');
    const setMain=safe(async input=>{update(await call('team.bot.main',input));bots();});
    const card=section('主 Bot',row('主 Bot',first?'排在侧栏最上面。选另一个 Bot 就会把主 Bot 交给它，'+first.name+' 随之不再是主 Bot。':'',choose('主 Bot',state.bots.map(b=>[b.id,b.name]),first?.id,id=>setMain({id,enabled:true,replace:first?.id,primary:true}))));
    const list=card.querySelector('.bt-set-card');for(const bot of mains.slice(1))list.append(row(bot.name,'也是主 Bot。',soft('移到最前',()=>setMain({id:bot.id,enabled:true,primary:true})),soft('移除主 Bot 身份',()=>setMain({id:bot.id,enabled:false}))));
    if(candidates.length)list.append(row('添加主 Bot','主 Bot 可以创建和修改 Bot，并管理所有群聊。',choose('添加主 Bot',[['','选择一个 Bot…'],...candidates.map(b=>[b.id,b.name])],'',id=>id&&setMain({id,enabled:true}))));return card;
  }
  function bots(){
    show('Bot',{page:'bots'});const state=getState(),motion=state.prefs?.motion||'normal',actions=el('div','','bt-actions');actions.append(soft('新 Bot',()=>editEntity('bot'), 'PlusIcon'));
    const list=section('Bot · '+state.bots.length);for(const bot of state.bots){const r=el('button','','bt-set-row');r.type='button';const who=el('span','','bt-set-bot');who.append(avatar(bot,28,false,false),el('span',bot.name,'bt-row-title'));if(bot.roleLabel)who.append(el('span',bot.roleLabel,'bt-tag'));if(bot.role==='Administrator')who.append(el('span','主 Bot','bt-tag'));if(bot.hidden)who.append(el('span','已隐藏','bt-tag'));const chevron=el('span','','bt-chevron');chevron.append(icon('ChevronRightIcon'));r.append(who,chevron);r.onclick=()=>editEntity('bot',bot);list.querySelector('.bt-set-card').append(r);}
    body.append(mainBots(),section('动画',row('Bot 动画','',segments('Bot 动画',[['quiet','安静'],['normal','正常'],['lively','活泼']],motion,v=>savePrefs({motion:v})))),actions,list);
  }
  function groups(){
    show('群聊',{page:'groups'});const state=getState(),actions=el('div','','bt-actions'),create=soft('新建群聊',()=>editEntity('room'),'PlusIcon');create.disabled=state.bots.length<2;actions.append(create);const list=section('群聊 · '+state.rooms.length),card=list.querySelector('.bt-set-card');
    for(const room of state.rooms){const b=el('button','','bt-set-row');b.type='button';const who=el('span','','bt-set-bot'),admin=state.bots.find(b=>b.id===room.adminId);who.append(cluster(room,28,false),el('span',room.name,'bt-row-title'),el('span',room.members.length+' 位成员','bt-tag'));if(admin)who.append(el('span','✦ '+admin.name,'bt-tag bt-tag-admin'));const chevron=el('span','','bt-chevron');chevron.append(icon('ChevronRightIcon'));b.append(who,chevron);b.onclick=()=>editEntity('room',room);card.append(b);}
    if(!state.rooms.length)card.append(row('还没有群聊','群聊让多位 Bot 和你一起完成一件事。'));body.append(actions,list);
  }
  async function connectors(){
    const ticket=show('连接器',{page:'connectors'}),view=await call('team.github',{action:'status'});if(!isCurrent(ticket))return;
    const list=section(''),card=list.querySelector('.bt-set-card'),line=connector('GitHub',view.connected?'已连接 · '+view.login:'仓库、Issue 和 PR',safe(()=>view.connected?disconnect():login()),view.connected?'断开':'连接');
    line.querySelector('.bt-connector-mark').replaceChildren(icon('GithubIcon'));card.append(line);body.append(list);
    if(view.error){body.append(el('p',view.error,'bt-error'));if(view.connected)body.append(soft('重新连接',safe(async()=>{await call('team.github',{action:'retry'});await connectors();})));}
    const permissions=el('details','','pi-github-permissions');permissions.append(el('summary','GitHub 令牌：仓库和权限怎么选？'),el('p','推荐使用 Fine-grained token，仓库选择“仅选定的仓库”，勾选需要 Bot 工作的项目。“所有仓库”也能使用，但会涵盖当前和未来的仓库，通常没必要。'),el('p','只查看代码：Contents → Read-only；查看问题和 PR 时，再加 Issues / Pull requests → Read-only。Metadata 为必需读取权限。'),el('p','需要改代码、创建 PR 或处理 Issue 时，再将对应的 Contents、Pull requests、Issues 调为 Read and write。无需开启仓库管理、删除或工作流权限，除非确实要让 Bot 做这些事。'),href('GitHub 官方令牌说明','https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens'));body.append(permissions);
    async function disconnect(){await call('team.github',{action:'disconnect'});await connectors();}
    function login(){
      if(card.querySelector('form'))return;
      const form=el('form','','pi-github-login'),token=textInput('GitHub Personal Access Token','github_pat_… / ghp_…','password');token.autocomplete='new-password';
      const note=el('p','使用 Personal Access Token 连接。只授予所需仓库与权限；Bot 通过 GitHub MCP 调用工具，令牌不会传给模型。','feature-note');
      const link=href('创建 GitHub 令牌','https://github.com/settings/personal-access-tokens/new'),actions=el('div','','bt-actions'),submit=soft('连接',safe(async()=>{submit.disabled=true;const value=token.value;token.value='';try{await call('team.github',{action:'connect',token:value});await connectors();}finally{submit.disabled=false;}}));submit.type='submit';
      actions.append(soft('取消',()=>morphHeight(card,()=>form.remove())),submit);form.append(note,link,row('访问令牌','加密保存在当前 Windows 用户的密钥库。',token),actions);form.onsubmit=e=>e.preventDefault();morphHeight(card,()=>card.append(form));token.focus();
    }
    const guide=section('接入其他应用',row('Notion','可通过 Notion 官方远程 MCP 配置，再完成网页登录授权；配置与状态见下方其他连接器。',soft('配置 Notion',()=>legacy.mcp(undefined,{type:'http',name:'Notion',url:'https://mcp.notion.com/mcp',botIds:[],allowedTools:[],enabled:false})),href('官方接入说明','https://developers.notion.com/docs/get-started-with-mcp')),row('邮箱 · Gmail / Outlook / 其他邮箱','可配置对应的 MCP 服务；需要服务商账号授权，部分服务还需自己的 OAuth 应用。当前未内置邮箱一键登录。',soft('配置邮箱 MCP',()=>legacy.mcp())),row('其他应用','接入兼容的本地或远程 MCP 服务，分别选择授权的 Bot 和工具。',soft('配置 MCP',()=>legacy.mcp())));guide.classList.add('pi-connector-guide');body.append(guide);
    const advanced=el('details','','pi-connector-advanced'),summary=el('summary','已配置的其他连接器 · 本地 / 远程 MCP');advanced.append(summary);body.append(advanced);
    advanced.addEventListener('toggle',safe(async()=>{if(!advanced.open||advanced.dataset.loaded)return;advanced.dataset.loaded='';const native=await call('team.connectors');if(!isCurrent(ticket))return;
      for(const server of native.servers||[])advanced.append(connector(server.name,'PI 原生 MCP',()=>onNative(),'管理'));
      for(const server of native.bridge?.servers||[])advanced.append(connector(server.name,(server.enabled?'已启用':'已停用')+' · Bot 独立授权',()=>legacy.mcp(undefined,server),'管理'));
      advanced.append(soft('添加本地 / 远程 MCP',()=>legacy.mcp()));}));
  }
  function connector(name,hint,run,text){const c=el('div','','bt-connector'),head=el('div','','bt-connector-head'),mark=el('span','','bt-connector-mark'),copy=el('span','','bt-connector-text');mark.append(icon('ConnectorIcon'));copy.append(el('span',name,'bt-connector-name'),el('span',hint,'bt-connector-status'));head.append(mark,copy,soft(text,run));c.append(head);return c;}
  async function secrets(options={}){
    const token=show('密钥',{page:'secrets'}),bots=getState().bots,view=await call('team.secrets',{});if(!isCurrent(token))return;
    const entries=view.entries.map(e=>({...e,bot:bots.find(b=>b.id===e.botId)||{id:e.botId,name:'已移除的 Bot'}})),text=el('p','Bot 请求过的密钥。模型不会收到密钥明文；密钥由 Windows 当前用户加密保存，供已授权的 MCP 与命令工具使用。','bt-secret-about'),list=section('密钥 · '+entries.length),card=list.querySelector('.bt-set-card');
    if(!entries.length)card.append(row('还没有密钥。Bot 需要时，会在对话里弹出一张卡片。',''));
    for(const item of entries){const line=row(item.name,item.bot.name+' · 已加密保存',soft('管理',()=>legacy.secrets(item.bot.id)));card.append(line);}
    const actions=el('div','','bt-actions');actions.append(soft('添加密钥',()=>{const form=el('form','','pi-secret-add'),name=textInput('密钥名称','NAME，例如 GITHUB_TOKEN'),value=textInput('密钥值','输入密钥','password'),target=choose('密钥所属 Bot',bots.map(b=>[b.id,b.name]),options.botId||bots[0]?.id);value.autocomplete='new-password';name.oninput=()=>name.value=name.value.toUpperCase();const save=soft('保存密钥',safe(async()=>{const secret=value.value;value.value='';await call('team.secret.set',{botId:target.value,name:name.value.trim(),value:secret});await secrets(options);}));save.type='submit';form.onsubmit=e=>{e.preventDefault();};form.append(row('Bot','',target),row('名称','',name),row('值','',value),row('','',soft('取消',()=>form.remove()),save));card.append(form);name.focus();}),soft('加密导入／导出',()=>legacy.secrets(options.botId)));body.append(text,list,actions);
  }
  async function feedback(){
    const token=show('反馈',{page:'feedback'}),what=el('textarea','','bt-input bt-input-area');what.placeholder='例如：我在群聊里问 Writer，它显示出错了。';what.setAttribute('aria-label','发生了什么');what.value=feedbackDraft;what.maxLength=4000;what.oninput=()=>feedbackDraft=what.value;
    const report=el('div','','bt-set-row bt-set-paste bt-fb-what'),copy=el('label','','bt-set-copy');copy.append(el('span','发生了什么？'),el('span','你做了什么、期望什么、实际发生了什么。','bt-set-hint'));report.append(copy,what);
    const preview=el('div','','bt-set-row bt-fb-preview'),pre=el('pre');pre.tabIndex=0;preview.append(pre);preview.hidden=true;let diagnostic;
    const load=async()=>{const data=await call('team.extensions',{action:'diagnostics'});diagnostic=JSON.stringify(data,null,2);pre.textContent=diagnostic;return data;};
    const issue=href('在 GitHub 上报告',REPO+'/issues/new');issue.className='bt-fb-primary bt-about-link';issue.onclick=()=>{issue.href=REPO+'/issues/new?title='+encodeURIComponent('[PI Desktop 适配] '+(what.value.slice(0,70)||'问题反馈'))+'&body='+encodeURIComponent('PI Bot 0.3.78（PI-Desktop 适配版）\n\n'+what.value+'\n\n请在提交前检查内容；如有需要，将诊断信息复制到此处。');};
    body.append(section('报告问题',report,row('诊断信息','版本、系统和最近的错误；不包含聊天正文或密钥。',soft('查看',()=>{preview.hidden=!preview.hidden;}),soft('复制',safe(async()=>{await load();try{await navigator.clipboard.writeText(diagnostic);notice('已复制诊断信息。');}catch{preview.hidden=false;notice('请在下方选中文字复制。');}}))),preview,row('GitHub issue','打开问题草稿，检查后由你提交。',issue)));
    try{const data=await load();if(!isCurrent(token))return;const errors=[...(data.events||[]),...(data.errors||[])].slice(-8).reverse(),list=section('最近的错误 · '+errors.length);if(!errors.length)list.querySelector('.bt-set-card').append(row('暂无错误。',''));for(const entry of errors){const r=row(entry.message||entry.text||entry.error||entry.event||(entry.module&&entry.code?entry.module+' / '+entry.code:'诊断事件'),entry.at||entry.time||'');r.classList.add('bt-fb-entry');r.prepend(el('span','','bt-fb-dot'));list.querySelector('.bt-set-card').append(r);}body.append(list);const actions=el('div','','bt-actions');actions.append(soft('下载诊断',()=>download('PI-bot-diagnostics.json',diagnostic,'application/json')));body.append(actions);}catch(e){if(isCurrent(token))notice(e.message);}
  }
  function about(){
    show('关于 PI Bot',{page:'about'});const hero=el('div','','bt-about-hero'),copy=el('div','','bt-about-copy');copy.append(el('span','PI Bot','bt-about-name'),el('span','版本 0.3.78','bt-about-version'));const star=href('☆ Star',REPO);star.classList.add('bt-star');hero.append(avatar({avatar:{shape:'pi-bot'},color:'deepseek'},52,false,false),copy,star);
    body.append(hero,el('p','源自 DeepSeek-Bot，适配 PI-Desktop。','bt-about-ask'),section('更新',row('PI Bot','本地安装的适配版，通过插件包更新。',soft('管理插件',()=>onNative())),row('PI-Desktop','客户端版本与更新由 PI-Desktop 管理。',soft('打开设置',()=>onNative()))),section('链接',row('源代码','github.com/vsd269/PI-Bot',href('打开',REPO)),row('发布说明','PI Bot 的版本更新与安装包',href('打开',REPO+'/releases')),row('报告问题','PI Bot 的问题反馈',soft('打开',()=>feedback())),row('上游项目','基于 DeepSeek-Bot 学习与适配，保留原作者署名和 Apache-2.0 许可证。',href('DeepSeek-Bot',UPSTREAM))));
    body.append(section('PI 扩展',row('备份与恢复','Bot、群聊、记忆与 Skill 资源。',soft('打开',legacy.backups)),row('扩展功能','语音、浏览器、OCR、索引与 Bot API。',soft('打开',legacy.extensions)),row('任务恢复中心','核对、继续或重试未完成任务。',soft('打开',legacy.recovery)),row('外观同步与记忆','PI 外观跟随和自动记忆选项。',soft('打开',legacy.preferences)),row('聊天历史','搜索 Bot 和群聊记录。',soft('打开',()=>legacy.history()))));
  }
  const handlers={general,bots,groups,connectors,capabilities:()=>legacy.capabilities(),schedules:()=>legacy.schedules(),usage:usage.open,secrets,feedback,about};
  return {open:async(page,options)=>{await(handlers[page]||general)(options);}};
}
