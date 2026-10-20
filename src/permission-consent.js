'use strict';
const labels={inherit:'跟随 PI 设置',ask:'操作前询问','accept-edits':'自动接受编辑',auto:'自动批准'};
// PI owns the actual approval. Explain it with a non-authorizing toast and a
// small plugin status card; neither replaces nor answers the native dialog.
async function configurePermission(team,bot,sessionId,mode,room,sessionMode='agent'){
  const request={sessionId,botId:bot.id,botName:bot.name,roomId:room?.id,mode,label:labels[mode]||mode};
  team.permissionRequests??=new Map();team.permissionRequests.set(sessionId,request);
  try{
    try{await team.pi.ui?.showToast?.('正在为「'+bot.name+'」应用「'+request.label+'」。PI 接下来的 session/configure 弹窗是在确认这项权限设置；允许一次后继续，拒绝则本次不执行。','info');}catch{/* Presentation cannot change authorization. */}
    // PI Desktop's native RPC requires the existing session mode on every
    // configure call, even when only the permission mode changes.
    return await team.invoke('session/configure',[sessionId,{mode:sessionMode||'agent',permissionMode:mode}],{confirm:true});
  }catch(error){
    throw Error('未能为「'+bot.name+'」应用「'+request.label+'」。请在 PI 的权限确认中允许后重试；若不需要此模式，可在机器人权限中选择“跟随 PI 设置”。'+(error?.message?'（'+String(error.message).slice(0,240)+'）':''));
  }finally{team.permissionRequests.delete(sessionId);}
}
module.exports={configurePermission};
