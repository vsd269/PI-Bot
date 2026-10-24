'use strict';
// First paint must not transfer every archived turn/tool payload through the
// rate-limited renderer bridge. This is a read-only preview, never persisted.
function startupSnapshot(team,selection){
  const source=team.state;
  const selected=(selection?.kind==='room'?source.rooms:source.bots).find(item=>item.id===selection?.id);
  const target=selected?selection:source.rooms[0]?{kind:'room',id:source.rooms[0].id}:source.bots[0]?{kind:'bot',id:source.bots[0].id}:null;
  const short=value=>typeof value==='string'&&value.length>2000?value.slice(0,2000)+'…（正在载入完整内容）':value;
  const line=value=>({...value,text:short(value.text),thinking:undefined,toolEvents:undefined});
  const jobs=source.jobs.filter(job=>target?.kind==='room'?job.roomId===target.id:job.botId===target?.id&&!job.roomId).slice(-12);
  for(const job of source.jobs)if(team.active(job)&&!jobs.includes(job))jobs.push(job);
  const bots=source.bots.map(({chat,sessionArchive,...bot})=>({...bot,chat:chat?.slice(bot.id===target?.id?-12:-1).map(line)}));
  const rooms=source.rooms.map(({log,reports,...room})=>({...room,log:log?.slice(room.id===target?.id?-24:-1).map(line)}));
  return team.vault.cleanState({bots,rooms,jobs:jobs.map(({toolEvents,thinking,...job})=>({...job,task:short(job.task),result:short(job.result),progress:short(job.progress)})),prefs:source.prefs,questions:source.questions||[],views:(source.views||[]).filter(v=>v.botId===target?.id).slice(-8),asides:(source.asides||[]).filter(v=>v.botId===target?.id&&!v.dismissed).slice(-8),memoryNews:team.memory?.rt.memoryNews?.()||{},startupPreview:true});
}
module.exports={startupSnapshot};
