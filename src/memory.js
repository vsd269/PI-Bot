'use strict';
const {randomUUID}=require('node:crypto');
const {linesOf}=require('./history');
async function createMemoryAdapter(team,{review=true,reviewDelayMs=2000}={}){
  const upstream=await import('./upstream/memory.mjs');
  const hooks=new Map(),effects=[],tools=new Map(),registrations=[];let section;
  const chatOwners=new Map(),groupOwners=new Map(),chatOf=id=>'bot:'+id;
  const adminSession=(room,botId)=>'group-admin:'+room.id+':'+botId;
  const sync=()=>{chatOwners.clear();groupOwners.clear();for(const bot of team.state.bots){chatOwners.set(chatOf(bot.id),bot.id);for(const [key,id] of Object.entries(bot.sessions||{})){if(key==='private')chatOwners.set(id,bot.id);else if(team.state.rooms.some(r=>r.id===key&&r.members.includes(bot.id)))groupOwners.set(id,{botId:bot.id,roomId:key});}}for(const room of team.state.rooms)for(const botId of room.members)if(rt.botOf(botId))groupOwners.set(adminSession(room,botId),{botId,roomId:room.id});rt.state.rooms=Object.fromEntries(team.state.rooms.map(r=>[r.id,{id:r.id,admin:r.adminId,members:r.members}]));};
  const roomOf=id=>{const room=team.state.rooms.find(r=>r.id===id);if(!room)return;const sessions={},segments={};for(const botId of room.members){const bot=team.state.bots.find(b=>b.id===botId);if(!bot)continue;sessions[bot.id]=bot.sessions?.[id]||adminSession(room,bot.id);segments[bot.id]=[{sessionId:adminSession(room,bot.id)},...(bot.sessionArchive||[]).filter(s=>s.roomId===id)];}return {...room,sessions,segments,admin:room.adminId,seq:room.log.length,log:room.log.map((line,i)=>({...line,botId:line.botId||team.state.bots.find(b=>b.name===line.who)?.id,seq:i+1}))};};
  const rt={home:team.data,config:{memoryReview:review,memoryReviewDelayMs:reviewDelayMs,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},state:{rooms:{}},chatOwners,groupOwners,pastOwners:new Map(),chatOf,
    botOf:id=>team.state.bots.find(b=>b.id===id),findBot:name=>team.state.bots.find(b=>b.id===name||b.name===name),isMain:id=>team.state.bots.some(b=>b.id===id&&b.role==='Administrator'),roomOf,
    selfOf:id=>{sync();return chatOwners.get(id)||groupOwners.get(id)?.botId;},isBotSession:id=>{sync();return chatOwners.has(id)||groupOwners.has(id);},groupSessionsOf:id=>{sync();return [...groupOwners].filter(([,owner])=>owner.botId===id).map(([session])=>session);},
    partsOf:id=>[{sessionId:chatOf(id)}],load:async()=>sync(),readOnly:()=>team.stopped?'Plugin stopping':undefined,redactSecrets:text=>team.vault?.redact(text)||text,clock:time=>new Date(time).toLocaleString('zh-CN'),uiLanguage:()=> 'Chinese (简体中文)',
    desiredModel:async bot=>{try{return (await team.model(bot)).key;}catch{return await rt.defaultModel();}},defaultModel:async()=>{const models=await team.models();return (models.find(m=>m.isDefault)||models[0])?.key;},warn:(message,...args)=>{team.state.diagnostics??=[];team.state.diagnostics.push({at:new Date().toISOString(),message:String(message).replace(/%[sd]/g,()=>String(args.shift()??'')).slice(0,1000)});team.state.diagnostics=team.state.diagnostics.slice(-100);},
    async completeMemory(route,system,text,tag){const room=roomOf(tag?.sessionId);const bot=rt.botOf(room?.admin||rt.selfOf(tag?.sessionId))||(room&&room.members.map(rt.botOf).find(Boolean));if(!bot)throw new Error('Unknown memory owner');return (await team.complete(bot,system,[{role:'user',content:text}],{kind:'memory',...(room?{roomId:room.id}:{}),modelKey:route.provider+'/'+route.model})).text;},
    async *partLines(sessionId){
      const bot=rt.botOf(rt.selfOf(sessionId));if(!bot)return;
      const owner=groupOwners.get(sessionId),room=owner&&roomOf(owner.roomId);
      const rows=room?room.log:linesOf(team,'bot',bot.id);
      team.state.memorySequence??={};const sequences=team.state.memorySequence;let top=Math.max(0,...Object.values(sequences));
      const lines=rows.map((line,index)=>{const key=line.id||bot.id+':legacy:'+index;sequences[key]??=++top;return {seq:room?line.seq:sequences[key],who:line.who==='User'?'user':line.who===bot.name?'you':'bot',text:line.text};});
      for(const line of lines.sort((a,b)=>b.seq-a.seq))yield line;
    },
    async *eventsBackwards(sessionId,signal){for await(const line of rt.partLines(sessionId,signal))yield line;},historyEntry:event=>({text:event.text,answer:event.who!=='user'}),
    ctx:{
      effect:fn=>{const cleanup=fn();if(typeof cleanup==='function')effects.push(cleanup);},
      systemPrompt:{section:value=>{section=value;return ()=>{section=null;};}},
      on:(name,fn)=>hooks.set(name,fn),
      tools:{register:tool=>{
        tools.set(tool.name,tool);
        if(!team.pi.agent?.registerTool || team.pi.__testHost)return;
        const properties={},required=[];
        for(const [name,spec] of Object.entries(tool.parameters||{})){const {required:needed,...rest}=spec;properties[name]=rest;if(needed)required.push(name);}
        registrations.push(team.pi.agent.registerTool({name:tool.name,description:tool.description,risk:tool.name==='recall'?'low':'medium',schema:{type:'object',properties,required,additionalProperties:false},execute:(args,ctx)=>tool.execute(args,{agent:{id:ctx?.sessionId}})}));
      }},
    },
  };
  sync();upstream.install(rt);await Promise.all(registrations);
  const view=async(botId,options={})=>{sync();const value=await rt.memoryEndpoint('memory-view',{botId,...options});const bot=rt.botOf(botId);if(bot)bot.memory=value.entries.filter(e=>e.scope==='own').map(e=>'- '+e.text).join('\n');return value;};
  for(const bot of team.state.bots){
    if(bot.memory&&!bot.memoryMigrated){bot.legacyMemory=bot.memory;const current=await view(bot.id);if(!current.entries.some(e=>e.scope==='own'))for(const line of bot.legacyMemory.split('\n').map(s=>s.replace(/^\s*-\s*/, '').trim()).filter(Boolean)){const result=await tools.get('remember').execute({text:line,scope:'own'},{agent:{id:chatOf(bot.id)}});if(!/^Saved to|^Already in/.test(result))rt.warn('Legacy memory migration: %s',result);}}
    bot.memoryMigrated=true;await view(bot.id);
  }
  const status=(id,value)=>{sync();if(team.state.prefs?.memoryReview===false)return;try{hooks.get('agent/status')?.({agent:{id},status:value});}catch{}};
  const target=input=>{if(input.roomId!==undefined){const room=roomOf(input.roomId);if(!room)throw new Error('Unknown group chat');return {roomId:room.id};}if(!rt.botOf(input.botId))throw new Error('Unknown Bot');return {botId:input.botId};};
  return {
    section(bot,id){sync();const sessionId=id||chatOf(bot.id);return section?.text({agent:{id:sessionId}})||'';},
    async endpoint(name,input){sync();const value=await rt.memoryEndpoint(name,{...input,...target(input)});if(name==='memory-forget'||name==='memory-ask'){if(!input.roomId)await view(input.botId);await team.save();}return value;},
    view,
    async add(input){sync();const owner=target(input),room=owner.roomId&&roomOf(owner.roomId);const keeper=room?rt.botOf(room.admin)||room.members.map(rt.botOf).find(Boolean):rt.botOf(owner.botId);if(!keeper)throw new Error('群聊没有可用的记忆管理成员。');const result=await tools.get('remember').execute({text:input.text,scope:room?'group':input.scope==='team'?'team':'own',topic:input.topic},{agent:{id:room?adminSession(room,keeper.id):chatOf(keeper.id)}});if(!/^Saved to|^Already in/.test(result))throw new Error(result);if(!room)await view(keeper.id);await team.save();return rt.memoryEndpoint('memory-view',owner);},
    status,groupStatus(room,botId,value){status(adminSession(room,botId),value);},
    archive:(id,deletedBot)=>rt.archiveBotMemory(id,deletedBot),archiveGroup:room=>rt.archiveGroupMemory(room),tools,rt,
    async close(){for(const cleanup of effects)cleanup();await rt.drainMemory?.();for(const name of tools.keys())await team.pi.agent?.unregisterTool?.(name);}
  };
}
module.exports={createMemoryAdapter};
