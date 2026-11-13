import {el,icon as fallbackIcon} from './dom.mjs';
import {appIcon} from './apps-icons.mjs';
import {APP_PREVIEW,appArtwork,categoryName,rankedCategories,categorySections} from './app-catalog.mjs';
const icon=name=>appIcon(name)||fallbackIcon(name);
const btn=(text,run,cls='pi-apps-button')=>{const b=el('button',text,cls);b.type='button';b.onclick=run;return b;};
const link=(text,url)=>{const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
const normalize=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const HOME_CATEGORIES=['developer tools','analytics','model context protocol'];
let fontReady;
function loadAppsFont(){
  if(!fontReady)fontReady=Promise.all([
    new FontFace('PI Apps Geist','url("'+new URL('./assets/fonts/geist-latin-wght-normal.woff2',import.meta.url).href+'")',{weight:'100 900'}),
    new FontFace('PI Apps CJK','local("Microsoft YaHei"), local("PingFang SC"), local("Noto Sans CJK SC")',{unicodeRange:'U+2E80-9FFF,U+F900-FAFF,U+FF00-FFEF'})
  ].map(async font=>{try{document.fonts.add(await font.load());}catch{}}));
  return fontReady;
}
export function createApps({app,call,getState,onMcp,onChanged,avatar,readTimeoutMs=15000}){
  loadAppsFont();
  const dialog=el('dialog','','pi-apps-dialog'),head=el('header','','pi-apps-head'),title=el('h2','应用'),actions=el('div','','pi-apps-actions');
  const status=el('div','','pi-apps-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  const body=el('div','','pi-apps-body'),search=el('input'),searchBox=el('div','','pi-apps-search'),nav=el('div','','pi-apps-categories'),list=el('div','','pi-apps-grid'),setup=el('section','','pi-apps-setup');
  dialog.setAttribute('aria-label','连接应用');search.type='search';search.placeholder='搜索应用';search.setAttribute('aria-label','搜索应用');searchBox.append(icon('SearchIcon'),search);
  let categoryOptions=[],catalogItems=[],homeGroups=[],catalogExpanded=false,statusTimer,connection,settingsReady=false,categoriesReady=false,catalogOnline=false,catalogError=false,inventoryTicket=0,categoriesTicket=0,groupsKey='';
  const reads=new Set(),catalogCache=new Map();
  let ticket=0,session=0,view='catalog',query='',category='',nextCursor=null,configured=false,accounts=[],grants=[],searchTimer,pollTimer,pollUntil=0,disposed=false,busy=false;
  const current=t=>!disposed&&dialog.open&&t===ticket;
  const say=(text,error=false)=>{status.textContent=text;status.hidden=!text;status.dataset.error=String(error);clearTimeout(statusTimer);if(text&&!error)statusTimer=setTimeout(()=>status.hidden=true,2600);};
  const safe=run=>async event=>{event?.preventDefault();const s=session,b=event?.currentTarget;if(b?.disabled)return;if(b)b.disabled=true;try{await run();}catch(e){if(!disposed&&dialog.open&&s===session)say(e.message||'操作失败，请重试。',true);}finally{if(b?.isConnected)b.disabled=false;}};
  const api=input=>call('team.apps',input);
  function readApi(input){
    const label={status:'应用设置',accounts:'应用账号',categories:'应用分类',catalog:'应用目录'}[input.action]||'应用数据';
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);reads.delete(cancel);error?reject(error):resolve(value);};
      const cancel=()=>finish(Error('应用窗口已关闭。'));
      const timer=setTimeout(()=>finish(Error(label+'读取超时，请点击右上角刷新重试。')),readTimeoutMs);
      reads.add(cancel);Promise.resolve().then(()=>api(input)).then(value=>finish(null,value),error=>finish(error));
    });
  }
  const liveSession=s=>!disposed&&dialog.open&&s===session;
  const cancelReads=()=>{for(const cancel of [...reads])cancel();};
  const close=btn('',()=>dialog.close(),'pi-apps-icon');close.setAttribute('aria-label','关闭应用');close.append(icon('CloseIcon'));
  const refresh=btn('',safe(()=>reload(false)),'pi-apps-icon');refresh.setAttribute('aria-label','刷新应用');refresh.append(icon('RefreshIcon'));
  const connected=btn('已连接',()=>renderAccounts());connected.append(icon('ChevronRightIcon'));
  actions.append(connected,refresh,close);head.append(title,actions);
  const subtitle=el('p','只需连接一次应用或你自己的 MCP 服务器，再选择哪些机器人可以使用。','pi-apps-subtitle');
  const tools=el('div','','pi-apps-toolbar'),mcp=btn('MCP 服务器',()=>{dialog.close();onMcp();});mcp.prepend(icon('ServerIcon'));tools.append(searchBox,mcp);
  const pickCategory=id=>{category=id===category?'':id;view='catalog';categories(categoryOptions);loadCatalog().catch(e=>say(e.message,true));};
  function categories(items=[]){
    categoryOptions=items;nav.replaceChildren();const order=['developer tools','analytics','model context protocol','marketing automation','social'];
    const sorted=[...items].sort((a,b)=>{const rank=v=>{const n=order.findIndex(k=>normalize(k)===normalize(v.name));return n<0?99:n;};return rank(a)-rank(b);});
    const chip=(id,name)=>{const b=btn(name,()=>pickCategory(id),'pi-apps-chip');b.setAttribute('aria-pressed',String(id===category));return b;};nav.append(chip('','全部'));
    for(const item of sorted.slice(0,5))nav.append(chip(item.id,categoryName(item.name)));
    const pop=el('details','','pi-apps-more-categories'),summary=el('summary','更多'),menu=el('div','','pi-apps-category-menu');summary.append(icon('ChevronDownIcon'));pop.append(summary,menu);for(const item of sorted.slice(5))menu.append(btn(categoryName(item.name),()=>{pop.open=false;pickCategory(item.id);}));if(!menu.children.length)menu.append(btn('查看全部应用',()=>{pop.open=false;pickCategory('');}));nav.append(pop);
  }categories(HOME_CATEGORIES.concat(['marketing automation','social']).map(name=>({id:name,name})));
  const back=btn('‹ 全部应用',()=>{view='catalog';query=search.value='';category='';categories(categoryOptions);setup.hidden=true;loadCatalog().catch(e=>say(e.message,true));});back.classList.add('pi-apps-back');back.hidden=true;
  const more=btn('加载更多应用',safe(async()=>{await loadCatalog(true);}));more.hidden=true;more.classList.add('pi-apps-more');
  const mast=el('div','','pi-apps-mast');mast.append(head,subtitle,tools,nav);body.append(setup,back,list,more);dialog.append(mast,status,body);app.append(dialog);
  function keyForm(storage){
    setup.replaceChildren(el('strong',configured?'Composio 项目已配置':'填写自己的 Composio 项目密钥'));
    setup.append(el('p','每位用户使用自己的项目与额度。密钥只保存在本机加密库，不会发送给 Bot。','pi-apps-note'),link('打开 Composio 控制台','https://platform.composio.dev/'));
    const form=el('form'),key=el('input');key.type='password';key.autocomplete='off';key.placeholder='ak_…';key.setAttribute('aria-label','Composio 项目 API Key');key.spellcheck=false;
    const save=btn(configured?'更换项目密钥':'保存并验证',null);save.type='submit';save.disabled=storage==='unavailable';const row=el('div','','pi-apps-key-row');row.append(key,save);form.append(row);setup.append(form);
    if(storage==='unavailable')setup.append(el('p','当前系统无法使用加密密钥库。此版本使用 Windows 用户加密，未启用明文保存。','pi-apps-note'));
    form.onsubmit=safe(async()=>{if(busy)return;busy=true;save.disabled=true;say('正在验证并加密保存…');try{const t=ticket,s=await api({action:'saveKey',key:key.value});key.value='';if(!current(t))return;configured=s.configured;grants=s.grants;settingsReady=true;receive(s.connection,true);setup.hidden=true;keyForm(s.storage);view='catalog';await refreshParts(false);if(dialog.open&&!disposed&&view==='catalog'&&!catalogError)say('项目密钥已保存。现在可以连接应用并分配给 Bot。');}finally{busy=false;save.disabled=false;}});
    if(configured){const clear=btn('移除本机项目配置',safe(async()=>{if(clear.dataset.confirm!=='yes'){clear.dataset.confirm='yes';clear.textContent='确认移除（同时清除本机 Bot 分配）';say('移除本机配置不会撤销第三方授权；如需撤销，请先断开应用或在 Composio 控制台处理。');return;}const cleared=await api({action:'clear'});session++;ticket++;categoriesTicket++;inventoryTicket++;cancelReads();catalogCache.clear();connection=cleared.connection;configured=false;accounts=[];grants=[];updateConnected();clearTimeout(pollTimer);onChanged?.([],connection);keyForm();setup.hidden=false;list.replaceChildren(el('p','请先填写自己的项目密钥。','pi-apps-empty'));say('本机项目配置已移除。');}));setup.append(clear);}
  }
  function updateConnected(){const active=accounts.filter(a=>a.status==='ACTIVE'),verified=!connection||connection.phase==='ready';connected.replaceChildren();if(active.length){const logos=el('span','','pi-apps-connected-logos');logos.setAttribute('aria-hidden','true');for(const slug of [...new Set(active.map(a=>a.slug))].slice(0,4))logos.append(mark(catalogItems.find(c=>c.slug===slug)||{slug}));connected.append(logos);}connected.append(el('span',verified?(active.length?'已连接 '+active.length:'已连接'):connection.phase==='error'?'连接待检查':'正在检查连接'),icon('ChevronRightIcon'));}
  function receive(value,force=false){
    if(!value||disposed||dialog.open&&!force)return;
    if(Number.isFinite(value.revision)&&value.revision<(connection?.revision??-1))return;
    connection=value;configured=value.configured;accounts=value.accounts||[];updateConnected();
  }
  async function loadInventory(options={}){
    const s=session,n=++inventoryTicket;if(!configured)return;const r=await readApi({action:'accounts',...options});if(!liveSession(s)||n!==inventoryTicket)return;accounts=r.accounts;grants=r.grants;connection=r.connection;updateConnected();onChanged?.(accounts.filter(a=>a.status==='ACTIVE'),connection);if(view==='catalog')paintCatalog();else if(view==='connected')paintAccounts();
  }
  function mark(card){
    const box=el('span','','pi-apps-logo'),art=appArtwork(card),urls=[art.logo,art.domain?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(art.domain)+'&sz=64':null].filter(Boolean);let stage=0;
    const img=el('img');img.alt='';img.referrerPolicy='no-referrer';img.loading='lazy';
    const next=()=>{if(stage<urls.length)img.src=urls[stage++];else{img.remove();box.append(icon('ConnectorIcon'));box.dataset.missing='true';}};img.onerror=next;box.append(img);next();return box;
  }
  function configureProject(){setup.hidden=false;setup.scrollIntoView({block:'nearest'});setup.querySelector('input')?.focus();}
  function card(item){
    const row=el('article','','pi-apps-card'),copy=el('div','','pi-apps-copy'),name=el('div','','pi-apps-name'),description=el('span',item.description||'通过自己的 Composio 项目连接');name.append(el('strong',item.name||item.slug));description.title=description.textContent;copy.append(name,description);row.dataset.app=item.slug;row.append(mark(item),copy);
    const active=accounts.filter(a=>a.slug===item.slug&&a.status==='ACTIVE'),isBuiltIn=item.slug==='composio',usedIds=new Set(grants.filter(g=>g.slug===item.slug).flatMap(g=>g.botIds));
    if(active.length){const check=icon('CheckIcon');check.classList.add('pi-apps-connected-check');name.append(check);}
    if(avatar&&usedIds.size){const members=el('span','','pi-apps-used-by'),bots=getState().bots.filter(b=>usedIds.has(b.id));members.title='已分配给：'+bots.map(b=>b.name).join('、');for(const bot of bots.slice(0,3)){const holder=el('span');holder.append(avatar(bot,16,false,false));members.append(holder);}name.append(members);}
    const text=isBuiltIn?(configured?'已包含':'配置'):active.length?'管理':item.noAuth?'启用':'连接';
    const b=btn(text,()=>{if(isBuiltIn||!configured){configureProject();return;}active.length?accountPage(item):connectPage(item);});b.setAttribute('aria-label',isBuiltIn?'Composio 项目设置':(active.length?'管理 ':'连接 ')+(item.name||item.slug));if(isBuiltIn&&configured)b.classList.add('pi-apps-included');b.disabled=!settingsReady;row.append(b);return row;
  }
  function section(name,items,all){const node=el('section','','pi-apps-section'),heading=el('div','','pi-apps-section-head'),grid=el('div','','pi-apps-section-grid');heading.append(el('h3',name));if(all)heading.append(btn('查看全部',all,'pi-apps-view-all'));for(const item of items)grid.append(card(item));node.append(heading,grid);return node;}
  function paintCatalog(){
    list.replaceChildren();list.classList.remove('pi-apps-detail');const grouped=!query&&!category&&!catalogExpanded;
    if(grouped){const known=[...catalogItems,...APP_PREVIEW],active=[...new Set(accounts.filter(a=>a.status==='ACTIVE').map(a=>a.slug))].map(slug=>known.find(c=>c.slug===slug)||{slug,name:slug,description:'已保存的应用账号'});if(active.length)list.append(section('已连接',active.slice(0,4),()=>renderAccounts()));
      const groups=homeGroups.length?homeGroups:categorySections(catalogItems,rankedCategories(catalogItems));
      for(const group of groups)list.append(section(categoryName(group.name),group.cards.slice(0,4),()=>pickCategory(group.id||group.name)));
    }
    const heading=query?'搜索结果':category?categoryName(categoryOptions.find(c=>c.id===category)?.name||category):catalogOnline?'全部应用':'内置应用预览';list.append(section(heading,catalogItems,grouped?()=>{catalogExpanded=true;paintCatalog();}:null));
    if(!catalogItems.length)list.append(el('p','没有找到匹配的应用，请更换关键词。','pi-apps-empty'));
  }
  function previewCatalog(){
    const selected=categoryOptions.find(c=>c.id===category)?.name||category;
    return APP_PREVIEW.filter(c=>(!query||c.name.toLowerCase().includes(query.toLowerCase()))&&(!selected||c.categories.some(n=>normalize(n)===normalize(selected))));
  }
  function loadGroups(t=ticket){
    if(!current(t)||view!=='catalog'||query||category||!catalogOnline||!categoriesReady)return;
    const selections=HOME_CATEGORIES.map(name=>({name,option:categoryOptions.find(v=>normalize(v.name)===normalize(name))})).filter(v=>v.option);
    const key=JSON.stringify([t,selections.map(v=>v.option.id)]);if(groupsKey===key)return;groupsKey=key;
    for(const {name,option} of selections)void readApi({action:'catalog',category:option.id,limit:4}).then(r=>{
      if(!current(t)||view!=='catalog'||query||category)return;
      homeGroups=homeGroups.filter(v=>v.id!==option.id);if(r.items.length)homeGroups.push({id:option.id,name,cards:r.items.slice(0,4)});
      homeGroups.sort((a,b)=>HOME_CATEGORIES.indexOf(a.name)-HOME_CATEGORIES.indexOf(b.name));paintCatalog();
    }).catch(()=>{}); // Optional category sections must never block the directory.
  }
  async function loadCategories(){
    const s=session,n=++categoriesTicket;
    try{
      const r=await readApi({action:'categories'});if(!liveSession(s)||n!==categoriesTicket)return;
      const previous=categoryOptions.find(c=>c.id===category)?.name||category;
      const selected=category&&r.items.find(c=>c.id===category||normalize(c.name)===normalize(previous));
      const changed=selected&&selected.id!==category;if(selected)category=selected.id;
      categoriesReady=true;categories(r.items);
      if(view==='catalog'){if(changed)void loadCatalog();else loadGroups();}
    }catch{ /* Existing categories, search and connected accounts remain usable. */ }
  }
  async function loadCatalog(append=false){
    const t=++ticket,cacheKey=JSON.stringify([query.trim(),category]),cursor=append?nextCursor:null;
    view='catalog';back.hidden=true;nav.hidden=false;more.hidden=true;catalogError=false;groupsKey='';
    if(!append){
      catalogExpanded=false;nextCursor=null;homeGroups=[];
      const cached=catalogCache.get(cacheKey);catalogItems=cached?.items||previewCatalog();catalogOnline=!!cached;
    }
    paintCatalog();
    if(!configured){say('');return;}
    say(catalogOnline?'正在更新在线目录，当前列表仍可使用…':'正在更新在线目录，先显示已有连接和内置应用预览…');clearTimeout(statusTimer);
    try{
      const r=await readApi({action:'catalog',query:query.trim(),category,cursor});if(!current(t))return;
      catalogItems=append?[...catalogItems,...r.items]:r.items;catalogOnline=true;homeGroups=[];
      catalogCache.set(cacheKey,{items:[...catalogItems]});while(catalogCache.size>12)catalogCache.delete(catalogCache.keys().next().value);
      paintCatalog();nextCursor=r.nextCursor&&r.nextCursor!==cursor?r.nextCursor:null;more.hidden=!nextCursor;more.textContent='加载更多应用';say('');
      loadGroups(t);
    }catch(error){if(current(t)){catalogError=true;say(error.message||'应用目录读取失败，请刷新重试。',true);paintCatalog();if(append){nextCursor=cursor;more.hidden=!cursor;more.textContent='重试加载更多';}}}
  }
  async function refreshParts(cached){
    const s=session;
    if(!configured){if(view==='catalog')await loadCatalog();return;}
    void loadInventory({cached}).catch(error=>{if(liveSession(s)&&!catalogError)say(error.message||'应用账号检查失败，请刷新重试。',true);});
    void loadCategories();
    if(view==='catalog')await loadCatalog();else if(view==='connected')paintAccounts();
  }
  async function reload(cached=true,options={}){
    const s=session;catalogError=false;
    try{
      const r=await readApi({action:'status'});if(!liveSession(s))return;
      configured=r.configured;grants=r.grants;settingsReady=true;receive(r.connection,true);
      if(!configured){accounts=[];connection=r.connection;catalogCache.clear();updateConnected();}
      keyForm(r.storage);setup.hidden=!options.setup;
      if(view==='catalog')paintCatalog();else if(view==='connected')paintAccounts();
      await refreshParts(cached);
    }catch(error){if(liveSession(s)){say(error.message||'应用设置读取失败，请刷新重试。',true);if(view==='catalog')paintCatalog();}}
  }
  function subPage(name){ticket++;back.hidden=false;nav.hidden=true;more.hidden=true;list.replaceChildren();list.classList.add('pi-apps-detail');list.append(el('h3',name,'pi-apps-section-title'));view='detail';}
  function connectPage(item){
    const baseline=new Set(accounts.filter(a=>a.slug===item.slug&&a.status==='ACTIVE').map(a=>a.id));
    subPage('连接 '+(item.name||item.slug));const form=el('form','','pi-apps-connect-form'),label=el('label','账号备注（可选）'),alias=el('input');alias.maxLength=64;label.append(alias);
    const advanced=el('details'),summary=el('summary','自己的 OAuth 配置（可选）'),configLabel=el('label','Composio Auth Config ID'),config=el('input');config.placeholder='ac_…';configLabel.append(config);advanced.append(summary,el('p','部分应用需要先在自己的 Composio 项目中创建并启用 Auth Config。没有自定义配置时可留空。','pi-apps-note'),configLabel);
    const submit=btn(item.noAuth?'启用应用工具':'生成授权链接',null);submit.type='submit';form.append(el('p','在官方授权页面登录并核对访问范围。连接后还需选择可使用该账号的 Bot。','pi-apps-note'),label,advanced,submit);list.append(form);
    form.onsubmit=safe(async()=>{submit.disabled=true;const t=ticket;say('正在准备授权链接…');try{const r=await api({action:'connect',slug:item.slug,alias:alias.value,authConfigId:config.value.trim()});if(!current(t))return;if(r.noAuth){await loadInventory();accountPage(item);say('应用已启用。请选择可以使用的 Bot；调用计入自己的 Composio 项目。');return;}const url=new URL(r.url);if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='composio.dev'||url.hostname.endsWith('.composio.dev')))throw Error('授权链接无效。');form.querySelector('.pi-apps-auth')?.remove();const a=link('打开官方授权页面 ↗',url.href);a.className='pi-apps-auth';form.append(a,btn('我已授权，检查连接',safe(async()=>{await loadInventory();if(accounts.some(a=>a.slug===item.slug&&a.status==='ACTIVE'&&!baseline.has(a.id)))accountPage(item);else say('还未检测到可用账号，请完成授权后再检查。');})));say('授权链接已生成。请打开页面，完成授权后返回这里。');pollUntil=Date.now()+180000;poll(item,t,baseline);}finally{submit.disabled=false;}});
  }
  function poll(item,t,baseline){clearTimeout(pollTimer);pollTimer=setTimeout(async()=>{if(!current(t))return;if(Date.now()>pollUntil){say('自动检查已结束。完成授权后，请点击“我已授权，检查连接”。');return;}try{await loadInventory();if(!current(t))return;if(accounts.some(a=>a.slug===item.slug&&a.status==='ACTIVE'&&!baseline.has(a.id))){say('连接成功。请选择可使用此账号的 Bot。');accountPage(item);return;}}catch(e){if(current(t))say(e.message+' 自动检查已暂停；完成授权后可点击“我已授权，检查连接”重试。',true);return;}if(current(t))poll(item,t,baseline);},4000);}
  function renderAccounts(){ticket++;view='connected';back.hidden=false;nav.hidden=true;more.hidden=true;paintAccounts();}
  function paintAccounts(){list.replaceChildren();list.classList.add('pi-apps-detail');list.append(btn('Composio 项目设置',configureProject));if(!accounts.length)list.append(el('p','暂无已连接账号。连接应用后，在这里分配给 Bot。','pi-apps-empty'));for(const slug of [...new Set(accounts.map(a=>a.slug))]){const group=accounts.filter(a=>a.slug===slug);list.append(card({slug,name:slug,description:group.length+' 个账号 · '+group.map(a=>a.status).join(' / ')}));}}
  function accountPage(item){
    subPage((item.name||item.slug)+' · 账号与 Bot');
    for(const a of accounts.filter(a=>a.slug===item.slug)){
      const section=el('section','','pi-apps-account');section.append(el('strong',a.alias||a.slug),el('span',a.status==='ACTIVE'?'已连接':'状态：'+a.status,'pi-apps-note'));
      if(a.status==='ACTIVE'){
        const boxes=[],picker=el('div','','pi-apps-bots'),grant=grants.find(g=>g.accountId===a.id);for(const bot of getState().bots){const l=el('label'),c=el('input');c.type='checkbox';c.value=bot.id;c.checked=grant?.botIds.includes(bot.id)||false;boxes.push(c);l.append(c,document.createTextNode(bot.name));picker.append(l);}
        section.append(el('p','允许哪些 Bot 使用这个账号？','pi-apps-note'),btn('全选',()=>boxes.forEach(c=>c.checked=true)),btn('清空',()=>boxes.forEach(c=>c.checked=false)),picker,btn('保存 Bot 分配',safe(async()=>{const r=await api({action:'grant',accountId:a.id,botIds:boxes.filter(c=>c.checked).map(c=>c.value)});grants=r.grants;say('Bot 分配已保存，立即生效。');})));
      }
      const remove=btn('断开账号',safe(async()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='确认断开账号';return;}await api({action:'disconnect',accountId:a.id});await loadInventory();accountPage(item);say('账号已断开，Bot 分配已移除。');}));section.append(remove);list.append(section);
    }
    list.append(btn('添加另一个账号',()=>connectPage(item)),el('p','授权范围由第三方和 Composio 决定；Bot 调用修改类工具仍经过 PI Desktop 原生审批。','pi-apps-note'));
  }
  search.oninput=()=>{query=search.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadCatalog().catch(e=>say(e.message,true)),280);};
  dialog.addEventListener('close',()=>{ticket++;session++;cancelReads();clearTimeout(searchTimer);clearTimeout(pollTimer);clearTimeout(statusTimer);list.querySelectorAll('a.pi-apps-auth').forEach(n=>n.remove());setup.querySelector('input')&&(setup.querySelector('input').value='');});
  return {receive,async open(options={}){
    if(disposed)return;dialog.showModal();session++;ticket++;settingsReady=false;catalogError=false;categoriesReady=false;view='catalog';query=search.value='';category='';homeGroups=[];groupsKey='';
    catalogItems=catalogCache.get(JSON.stringify(['','']))?.items||APP_PREVIEW;catalogOnline=catalogCache.has(JSON.stringify(['','']));
    back.hidden=true;nav.hidden=false;more.hidden=true;setup.hidden=true;categories(categoryOptions);paintCatalog();
    say('正在检查应用设置，先显示已有连接和内置应用预览…');clearTimeout(statusTimer);
    await reload(true,options);
  },close(){disposed=true;ticket++;cancelReads();clearTimeout(searchTimer);clearTimeout(pollTimer);clearTimeout(statusTimer);dialog.remove();}};
}
