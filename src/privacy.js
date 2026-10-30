'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const fold=value=>process.platform==='win32'?value.toLowerCase():value;
async function real(value){return path.resolve(await fs.realpath(value).catch(()=>value));}
async function overlap(a,b){if(!a||!b)return false;const [x,y]=await Promise.all([real(a),real(b)]);const nx=fold(path.normalize(x)),ny=fold(path.normalize(y));const within=(parent,child)=>{const relative=path.relative(parent,child);return !relative||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};return within(nx,ny)||within(ny,nx);}
function isPrivate(bot){return bot?.private===true;}
// Deleted private Bots retain protection for their files and memory archives.
const protectedBots=team=>[...team.state.bots.filter(isPrivate),...(team.state.archives||[]).filter(a=>a.kind==='bot'&&isPrivate(a.item)).map(a=>a.item)];
const canSee=(owner,target)=>owner.id===target.id||!isPrivate(target);
function privateError(bot,what='内容'){return new Error(`${bot.name} 是私密 Bot，其他 Bot 不能读取它的${what}。请让用户转交内容。`);}
function assertTarget(owner,target,what){if(!canSee(owner,target))throw privateError(target,what);}
function assertMessage(source,target){assertTarget(source,target,'聊天或任务');if(isPrivate(source)&&source.id!==target.id)throw new Error('私密 Bot 不会自动向其他 Bot 分享内容，请让用户在聊天中明确转交。');}
async function checkPublicDirectory(team,dir,except){if(dir)for(const other of protectedBots(team))if(other.id!==except&&await overlap(dir,other.workDir))throw new Error('工作目录与私密 Bot 或其已删除归档冲突，不能使用。');}
async function checkPrivateChange(team,bot,{private:flag,workDir,role=bot.role}={}){
  if(flag!==undefined&&typeof flag!=='boolean')throw new Error('私密 Bot 开关必须为布尔值。');
  const makes=flag===undefined?isPrivate(bot):flag===true;
  if(!makes){await checkPublicDirectory(team,workDir,bot.id);return;}
  if(role==='Administrator')throw new Error('主 Bot 不能设为私密 Bot。');
  const dir=workDir===undefined?bot.workDir:workDir;
  if(!dir||!path.isAbsolute(dir))throw new Error('私密 Bot 必须先设置独立的工作目录。');
  if(team.state.rooms.some(room=>room.members.includes(bot.id)))throw new Error('私密 Bot 不能加入群聊，请先从群聊移除。');
  const workspace=await team.pi.workspace.get();
  if(team.data&&await overlap(dir,team.data))throw new Error('私密 Bot 的工作目录不能与 PI Bot 共享数据目录重叠。');
  if(workspace?.path&&await overlap(dir,workspace.path))throw new Error('私密 Bot 的工作目录不能与 PI 当前工作区相同或互相包含。');
  for(const other of team.state.bots)if(other.id!==bot.id&&other.workDir&&await overlap(dir,other.workDir))throw new Error('私密 Bot 的工作目录不能与其他 Bot 工作目录相同或互相包含。');
  for(const room of team.state.rooms)if(room.workDir&&await overlap(dir,room.workDir))throw new Error('私密 Bot 的工作目录不能与群聊工作目录相同或互相包含。');
  await checkPublicDirectory(team,dir,bot.id);
}
function validatePrivateState(state){
  for(const bot of [...(state.bots||[]),...(state.archives||[]).filter(a=>a.kind==='bot').map(a=>a.item).filter(Boolean)]){
    if(bot.private!==undefined&&typeof bot.private!=='boolean')throw new Error('备份中的私密 Bot 标记无效。');
    if(isPrivate(bot)&&(bot.role==='Administrator'||typeof bot.workDir!=='string'||!path.isAbsolute(bot.workDir)))throw new Error('私密 Bot 必须是有独立工作目录的执行成员。');
  }
  for(const room of state.rooms||[])if(room.members.some(id=>state.bots.find(b=>b.id===id)?.private===true))throw new Error('备份中私密 Bot 不能加入群聊。');
}
function guardTool(team,name,args,owner){
  const self=owner.bot;
  const reference=name==='message_bot'?args.to:['update_bot','stop_bot','attach_capability','detach_capability'].includes(name)?args.bot:null;
  if(reference){const target=team.state.bots.find(b=>b.id===reference||b.name===reference);if(target)assertTarget(self,target);}
  if(!isPrivate(self))return;
  if(['message_bot','save_capability','delete_capability','create_bot','create_group','post_group','post_to_group','update_group','delete_group'].includes(name)||reference&&reference!==self.id&&reference!==self.name)throw new Error('私密 Bot 不会自动向团队分享或修改共享内容，请让用户明确转交或在设置中操作。');
}
function assertRun(team,bot,room,options={}){
  if(isPrivate(bot)&&room)throw new Error('私密 Bot 不能加入群聊。');
  if(options.fromBotId){const source=team.state.bots.find(b=>b.id===options.fromBotId)||protectedBots(team).find(b=>b.id===options.fromBotId);if(!source){if(isPrivate(bot))throw privateError(bot);return;}assertMessage(source,bot);}
  if(isPrivate(bot)&&(options.replyTo||options.parentJobId))throw new Error('私密 Bot 不能自动把结果返回给其他 Bot。');
}
function context(bot){return isPrivate(bot)?'Privacy: You are a private Bot. Keep your chats, memory and work in your own folder. Do not publish to shared memory, skills or other Bots. Ask the user to explicitly transfer anything they want shared. PI Desktop native tools retain host permissions; this is not an OS sandbox.\n':'';}
module.exports={isPrivate,canSee,privateError,assertTarget,assertMessage,assertRun,guardTool,context,checkPrivateChange,checkPublicDirectory,validatePrivateState,protectedBots,overlap};
