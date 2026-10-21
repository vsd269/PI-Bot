'use strict';
const {StateEdit}=require('./state-edit');
const {archiveChat}=require('./roster-actions');
// Also runs on older team files before recovery validation. Only dangling
// roster references are migrated; malformed configuration must still fail.
function cleanupRoster(state,edit=new StateEdit()){
  const ids=new Set(state.bots.map(bot=>bot.id));
  for(const connector of state.botConnectors||[])edit.remove(connector,'botIds',id=>!ids.has(id));
  edit.remove(state,'secretRequests',request=>!ids.has(request.botId));
  edit.remove(state,'views',view=>!ids.has(view.botId)||Boolean(view.roomId));
  const config=state.integrations;
  if(config&&typeof config==='object'){
    if(config.speech&&typeof config.speech==='object')for(const id of Object.keys(config.speech))if(!ids.has(id))edit.delete(config.speech,id);
    for(const command of config.commands||[])if(command&&Array.isArray(command.botIds)){edit.remove(command,'botIds',id=>!ids.has(id));if(!command.botIds.length&&command.enabled)edit.set(command,'enabled',false);}
    if(config.api&&Array.isArray(config.api.botIds)){
      edit.remove(config.api,'botIds',id=>!ids.has(id));
      if(config.api.ownerId&&!ids.has(config.api.ownerId)){edit.set(config.api,'ownerId','');if(config.api.enabled)edit.set(config.api,'enabled',false);}
      if(!config.api.botIds.length&&config.api.enabled)edit.set(config.api,'enabled',false);
    }
  }
  if(state.github?.ownerId&&!ids.has(state.github.ownerId))edit.delete(state,'github');
  for(const room of [...state.rooms]){
    if(!Array.isArray(room.members))continue;
    edit.remove(room,'members',id=>!ids.has(id));
    if(!room.members.length&&room.adminId==null){
      // Keep all history when removing a room whose final member was deleted.
      if(!(state.archives||[]).some(a=>a.kind==='room'&&a.id===room.id)){
        const archive=archiveChat({state,room:id=>state.rooms.find(r=>r.id===id)},'room',room);edit.undo.push(()=>{state.archives=state.archives.filter(a=>a!==archive);});
      }
      edit.remove(state,'rooms',r=>r===room);
      edit.remove(state,'schedules',t=>t.targetKind==='room'&&t.targetId===room.id);
      edit.remove(state,'questions',q=>q.roomId===room.id);
      for(const bot of state.bots){
        if(bot.sessions?.[room.id]){edit.append(bot,'sessionArchive',{roomId:room.id,sessionId:bot.sessions[room.id],workDir:bot.sessionWorkspaces?.[room.id]});edit.delete(bot.sessions,room.id);}
        if(bot.sessionWorkspaces)edit.delete(bot.sessionWorkspaces,room.id);
        if(bot.groupPermissions)edit.delete(bot.groupPermissions,room.id);
      }
    }else if(room.named===false){const name=room.members.map(id=>state.bots.find(b=>b.id===id)?.name||'已移除成员').join('、').slice(0,200);if(room.name!==name)edit.set(room,'name',name);}
  }
  return edit;
}
module.exports={cleanupRoster};
