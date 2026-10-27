'use strict';
const {Team}=require('./src/team');
const {randomUUID}=require('node:crypto');
const {botPreview}=require('./src/preview');
const {previewAttachment}=require('./src/attachments');
const {openMessageFile}=require('./src/message-files');
const {Microphone}=require('./src/microphone');
const {WindowsMicrophone}=require('./src/windows-microphone');
const updates=require('./src/updates').createUpdateChecker();
const {createActivation}=require('./src/activation');
const {migrateIdentity}=require('./src/identity-migration');
let activation;
let team,microphone,openRequested=false;
const requests=new Map();
const rendererUploads=new (require('./src/renderer-uploads').RendererUploads)();
const syncState=require('./src/state-sync').createStateSync();
async function onLoad(){
  activation=createActivation(async signal=>{
    const data=await pi.plugin.getDataPath();await migrateIdentity(pi,data,{signal});signal.throwIfAborted();
    const loaded=new Team(pi,{identityReady:true});
    try{await loaded.load();return {team:loaded,microphone:new (process.platform==='win32'?WindowsMicrophone:Microphone)(pi,loaded.integrations)};}
    catch(error){await loaded.close({checkpoint:false}).catch(()=>{});throw error;}
  },async active=>{await active.microphone.close();await active.team.close();});
  await pi.commands.register({id:'local.pi-bot.open',title:'PI-bot: Open team / 打开机器人团队',run:()=>{openRequested=true;}});
  await pi.services.register({id:'pi-bot-team-service',start:async()=>{},stop:async()=>activation?.close()});
  activation.begin();
}
async function onUnload(){await activation?.close();microphone=null;await Promise.allSettled([pi.commands.unregister('local.pi-bot.open'),pi.services.unregister('pi-bot-team-service')]);team=null;requests.clear();rendererUploads.clear();}
async function onPanelInvoke(channel,input={}){
  if(channel==='team.startup')return activation?.status({retry:input.retry===true})||{phase:'error',message:'PI Bot 尚未启动。'};
  if(channel==='team.updates')return updates.check({force:input.force===true});
  if(channel==='team.appearance')return pi.app.getAppearance();
  if(!activation)throw new Error('PI Bot 尚未启动。');
  const active=await activation.ready();team=active.team;microphone=active.microphone;
  switch(channel){
    case 'team.microphone': return microphone.operation(input);
    case 'microphone.panel': return microphone.panel(input);
    case 'team.skill.import': return team.capabilities.imports.operation(input);
    case 'team.extensions': return team.integrations.operation(input);
    case 'team.browser': return team.integrations.browser.operation(input);
    case 'team.speech': return team.integrations.speech(input);
    case 'team.mcp.login': return team.integrations.login.begin(input);
    case 'team.attachment.preview': return previewAttachment(team,input);
    case 'team.file.open': return openMessageFile(team,input);
    case 'team.state': {const state=team.snapshot();return input.sync?syncState(state,input.cursor):state;}
    case 'team.bootstrap': return require('./src/startup').startupSnapshot(team,input.selection);
    case 'team.workspaces': return team.workspaces();
      case 'team.models': return team.models();
    case 'team.bot.preview': return botPreview(team,input.botId);
    case 'team.bot.permission': return team.setBotPermission(input);
    case 'team.theme': {
      if(!['light','dark'].includes(input.theme))throw new Error('Invalid appearance mode.');
      await pi.app.setTheme(input.theme);
      return {theme:input.theme};
    }
    case 'team.backup': return team.backups.operation(input);
    case 'team.bot.patch': return team.patchSettings('bot',input);
    case 'team.room.patch': return team.patchSettings('room',input);
    case 'team.bot.save': return team.upsertBot(input);
    case 'team.bot.appearance': return team.setAppearance(input);
    case 'team.avatar.library': return team.avatars.operation(input);
    case 'team.memory.view': return team.memory.endpoint('memory-view',{botId:input.botId,roomId:input.roomId,summarize:input.summarize===true,regenerate:input.regenerate===true});
    case 'team.memory.add': return team.memory.add(input);
    case 'team.memory.forget': return team.memory.endpoint('memory-forget',input);
    case 'team.memory.ask': return team.memory.endpoint('memory-ask',input);
    case 'team.room.save': return team.upsertRoom(input);
    case 'team.group.send': return team.submitMessage('room',input.roomId,input.content,team.sendOptions(input));
    case 'team.group.continue': return require('./src/group-relay').resume(team,team.room(input.roomId));
    case 'team.btw.start': return require('./src/asides').ask(team,input);
    case 'team.btw.action': return require('./src/asides').operate(team,input);
    case 'team.private.send': return team.submitMessage('bot',input.botId,input.content,team.sendOptions(input));
    case 'team.history.search': return team.history(input);
    case 'team.transcript': return team.transcript(input);
    case 'team.pin': return team.pin(input);
    case 'team.react': return team.react(input);
    case 'team.prefs': return team.preferences(input);
    case 'team.bot.main': return team.setMain(input);
    case 'team.question.answer': return team.answerQuestion(input);
    case 'team.view.answer': return require('./src/views').answerView(team,input);
    case 'team.usage': {
      const view=team.usage(input);let catalog=[];
      try{catalog=await team.models();}catch{} // History remains usable offline.
      return require('./src/usage').labelUsageModels(view,catalog);
    }
    case 'team.attachment.upload': return team.integrations.files.operation(input);
    case 'team.plugins': return team.invoke('plugin/list');
    case 'team.github': return team.integrations.github.operation(input);
    case 'team.connectors': return team.connectors();
    case 'team.mcp.save': return team.bridge.save(input);
    case 'team.mcp.delete': return team.bridge.remove(input.id);
    case 'team.mcp.tools': return team.bridge.discover(input.botId,input.serverId);
    case 'team.secrets': return team.vault.list(input.botId);
    case 'team.secret.set': return team.vault.set(input);
    case 'team.secret.get': return {value:team.vault.reveal(input.botId,input.name)};
    case 'team.secret.delete': return team.vault.remove(input);
    case 'team.secret.purpose': return team.vault.purpose(input);
    case 'team.secret.export': return team.vault.export(input);
    case 'team.secret.transfer': return team.vault.transfer(input);
    case 'team.secret.import': return team.vault.importTransfer(input);
    case 'team.recovery': return team.recovery.operation(input);
    case 'team.capabilities': return team.capabilities.view();
    case 'team.capability.save': return team.capabilities.save(input);
    case 'team.capability.delete': return team.capabilities.remove(input.name);
    case 'team.capability.attach': return team.capabilities.attach(input);
    case 'team.schedules': return team.schedules.view();
    case 'team.schedule.save': return team.schedules.save(input);
    case 'team.schedule.toggle': return team.schedules.toggle(input.id,input.enabled);
    case 'team.schedule.delete': return team.schedules.remove(input.id);
    case 'team.job.cancel': return team.cancel(input.jobId);
    case 'team.bot.delete': return team.deleteBot(input.botId,input.compact===true);
    case 'team.bot.duplicate': return team.duplicateBot(input.botId);
    case 'team.room.delete': return team.deleteRoom(input.roomId,input.compact===true);
    case 'team.session.open': {
      if(!team.state.jobs.some(j=>j.sessionId===input.sessionId)&&!team.state.bots.some(bot=>Object.values(bot.sessions||{}).includes(input.sessionId)))throw new Error('This session does not belong to PI-bot.');
      return team.invoke('session/open',[input.sessionId]);
    }
    default: throw new Error('Unknown PI-bot operation.');
  }
}
function onRendererCall(method,args={}){
  if(method==='request.upload')return rendererUploads.operation(args,request=>onRendererCall('request.start',request));
  if(method==='mode.request'){const open=openRequested;openRequested=false;return {open};}
  if(method==='request.start'){
    if(args.channel==='team.bootstrap')return beginRequest(args);
    if(!['team.updates','team.startup','team.microphone','team.file.open','team.attachment.upload','team.plugins','team.github','team.bot.main','team.skill.import','team.extensions','team.browser','team.speech','team.mcp.login','team.secret.transfer','team.attachment.preview','team.mcp.save','team.mcp.delete','team.mcp.tools','team.secrets','team.secret.set','team.secret.get','team.secret.delete','team.secret.export','team.secret.import','team.recovery','team.bot.preview','team.bot.permission','team.theme','team.backup','team.bot.patch','team.room.patch','team.bot.appearance','team.avatar.library','team.bootstrap','team.state','team.models','team.workspaces','team.appearance','team.bot.save','team.memory.view','team.memory.add','team.memory.forget','team.memory.ask','team.room.save','team.group.send','team.group.continue','team.btw.start','team.btw.action','team.secret.purpose','team.private.send','team.job.cancel','team.session.open','team.bot.delete','team.bot.duplicate','team.room.delete','team.history.search','team.transcript','team.pin','team.react','team.prefs','team.question.answer','team.view.answer','team.usage','team.connectors','team.schedules','team.schedule.save','team.schedule.toggle','team.schedule.delete','team.capabilities','team.capability.save','team.capability.delete','team.capability.attach'].includes(args.channel))throw new Error('Unknown PI-bot operation.');
    return beginRequest(args);
  }
  if(method==='request.read'){
    const item=requests.get(args.id);if(!item)throw new Error('Request expired.');
    if(item.pending)return {pending:true};
    if(item.error){requests.delete(args.id);return {error:item.error};}
    // Serialized JSON contains no raw control characters. 14000 UTF-16 units
    // stay below PI's 64 KiB relay ceiling for CJK text and escaped quotes.
    const offset=Math.max(0,Number(args.offset)||0),chunk=item.json.slice(offset,offset+14000),done=offset+chunk.length>=item.json.length;
    if(done)requests.delete(args.id);return {chunk,done};
  }
  throw new Error('Unknown renderer method.');
}
function beginRequest(args){
  for(const [id,item] of requests)if(Date.now()-item.at>120000)requests.delete(id);
  if(requests.size>=100)throw new Error('Too many pending requests.');
  const id=randomUUID(),item={at:Date.now(),pending:true};requests.set(id,item);
  Promise.resolve().then(()=>onPanelInvoke(args.channel,args.payload)).then(value=>{item.json=JSON.stringify(value??null);item.pending=false;},error=>{item.error=error.message;item.pending=false;});
  return {id};
}
module.exports={onLoad,onUnload,onPanelInvoke,onRendererCall};
