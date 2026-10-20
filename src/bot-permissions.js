'use strict';
const {permissionModes}=require('./coordination');
const {configurePermission}=require('./permission-consent');
// PI's approval modes are not DSH's filesystem sandbox presets. Keep native
// meanings. These entry points run only after a user action in settings.
// A stored preference is never replayed by the chat/session startup path.
async function setBotPermission(team,{botId,permissionMode}){
  if(!permissionModes.includes(permissionMode))throw Error('无效的 PI 权限模式。');
  const bot=team.bot(botId);
  const idle=()=>{if(bot.planning||team.state.jobs.some(j=>j.botId===botId&&team.active(j)))throw Error('请等待该 Bot 完成任务后再修改权限。');};idle();
  const targets=[];
  for(const [key,id] of Object.entries(bot.sessions||{})){
    if(key!=='private'&&team.state.rooms.find(r=>r.id===key)?.permissionMode!=null)continue;
    if(targets.some(t=>t.id===id))continue;
    const session=(await team.invoke('session/get',[{id,messageLimit:1}])).session;
    if(!session)throw Error('原生会话不可用，权限未保存。');
    if((await team.invoke('agent/getStatus',[id])).status?.isRunning)throw Error('原生会话正在运行，请结束后再修改权限。');
    targets.push({id,mode:session.mode,permissionMode:session.permissionMode||'inherit'});
  }
  idle();const applied=[],prior=bot.permissionMode;
  try{
    for(const target of targets){idle();if(target.permissionMode!==permissionMode){await configurePermission(team,bot,target.id,permissionMode,undefined,target.mode);applied.push(target);}}
    idle();bot.permissionMode=permissionMode;await team.save();
  }catch(error){
    if(prior===undefined)delete bot.permissionMode;else bot.permissionMode=prior;
    const rollback=await Promise.allSettled(applied.map(target=>team.invoke('session/configure',[target.id,{mode:target.mode||'agent',permissionMode:target.permissionMode}],{confirm:true})));
    if(rollback.some(r=>r.status==='rejected'))throw Error('权限修改未完成，部分原生会话未能恢复，请在 PI 原生界面核对权限：'+error.message);
    throw error;
  }
  return team.snapshot();
}
// Apply a group choice now, to its existing native sessions. The caller is the
// explicit settings RPC, never a prompt, timer, roster save or model tool.
async function setRoomPermission(team,room,permissionMode){
  if(permissionMode!=null&&!permissionModes.includes(permissionMode))throw Error('无效的 PI 权限模式。');
  const idle=()=>{if(team.roomBusy(room))throw Error('请等待群聊任务完成后再修改权限。');};idle();
  const targets=[];
  for(const botId of room.members){
    const bot=team.bot(botId),id=bot.sessions?.[room.id];
    if(!id)continue;
    if(targets.some(target=>target.id===id))continue;
    const session=(await team.invoke('session/get',[{id,messageLimit:1}])).session;
    if(!session)throw Error('原生会话不可用，权限未保存。');
    if((await team.invoke('agent/getStatus',[id])).status?.isRunning)throw Error('原生会话正在运行，请结束后再修改权限。');
    const priorRecord=bot.groupPermissions?.[room.id],record=priorRecord?.sessionId===id?priorRecord:undefined;
    const current=session.permissionMode||'inherit';
    const desired=permissionMode??bot.permissionMode??record?.original??'inherit';
    if(!permissionModes.includes(desired))throw Error('Bot 权限设置无效，请重新选择。');
    targets.push({bot,id,mode:session.mode,current,desired,priorRecord,original:record?.original??current});
  }
  idle();const applied=[],hadMode=Object.hasOwn(room,'permissionMode'),priorMode=room.permissionMode;
  try{
    for(const target of targets){
      idle();
      if(target.current!==target.desired){
        await configurePermission(team,target.bot,target.id,target.desired,room,target.mode);
        applied.push(target);
      }
    }
    idle();room.permissionMode=permissionMode??null;
    for(const target of targets){
      if(permissionMode==null){if(target.bot.groupPermissions)delete target.bot.groupPermissions[room.id];}
      else{target.bot.groupPermissions??={};target.bot.groupPermissions[room.id]={sessionId:target.id,original:target.original,applied:target.desired};}
    }
    await team.save();
  }catch(error){
    if(hadMode)room.permissionMode=priorMode;else delete room.permissionMode;
    for(const target of targets){
      if(target.priorRecord){target.bot.groupPermissions??={};target.bot.groupPermissions[room.id]=target.priorRecord;}
      else if(target.bot.groupPermissions)delete target.bot.groupPermissions[room.id];
    }
    const rollback=await Promise.allSettled(applied.map(target=>team.invoke('session/configure',[target.id,{mode:target.mode||'agent',permissionMode:target.current}],{confirm:true})));
    if(rollback.some(result=>result.status==='rejected'))throw Error('群聊权限修改未完成，部分会话未能恢复，请在 PI 原生界面核对权限：'+error.message);
    throw error;
  }
  return team.snapshot();
}
module.exports={setBotPermission,setRoomPermission};
