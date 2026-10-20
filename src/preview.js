'use strict';
// Read existing sessions only. Opening the overview must never create a worker,
// start a model request or change its permission preset.
async function botPreview(team,botId){
  const bot=team.bot(botId);
  const sessionId=bot.sessions?.private||team.state.jobs.findLast(job=>job.botId===botId&&!job.roomId&&job.sessionId)?.sessionId||null;
  let permissionMode=null,permissionStatus=sessionId?'unavailable':'not-started';
  if(sessionId){try{const got=await team.invoke('session/get',[{id:sessionId,messageLimit:1}]);if(got.session){permissionMode=got.session.permissionMode??null;permissionStatus='available';}}catch{}}
  let memoryCount=null;
  try{const view=await team.memory.view(botId);memoryCount=Array.isArray(view.entries)?view.entries.length:null;}catch{}
  return {botId,sessionId,permissionMode,permissionStatus,memoryCount};
}
module.exports={botPreview};
