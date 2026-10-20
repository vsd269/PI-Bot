'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const {linesOf}=require('./history');
// Only a user click on a saved message may request a local file. The host
// still enforces its own fs.read policy; no shell command is constructed.
async function openMessageFile(team,input){
  const kind=input.kind==='room'?'room':'bot',item=kind==='room'?team.room(input.id):team.bot(input.id);
  const line=linesOf(team,kind,input.id).find(l=>l.id===input.lineId);
  if(!line||typeof input.href!=='string'||input.href.length>4000||![...String(line.text||'').matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)].some(m=>m[1]===input.href))throw Error('只能打开当前消息中的文件链接。');
  let name;try{name=decodeURIComponent(input.href);}catch{throw Error('文件链接格式无效。');}
  if(/[\0\r\n]/.test(name)||/^[/\\]{2}/.test(name)||/^[a-z][\w+.-]*:/i.test(name)&&!path.isAbsolute(name))throw Error('此链接不是本地工作文件。');
  name=name.replace(/#L?\d+(?:-L?\d+)?$/,'').replace(/:\d+(?::\d+)?$/,'');
  const job=team.state.jobs.find(j=>j.id===(line.deliverySourceId||line.jobId||line.attachmentJobId)||line.id===j.id+':result');
  const origin=team.state.bots.find(b=>b.id===(job?.botId||line.botId||item.id));
  const workspace=await team.pi.workspace.get(),folder=item.workDir||origin?.sessionWorkspaces?.[job?.roomId||'private']||origin?.workDir||workspace?.path;
  if(!folder)throw Error('请先选择工作区。');
  const base=await fs.realpath(folder).catch(()=>fs.realpath(workspace?.path||''));let candidate=path.resolve(base,name),full;try{full=await fs.realpath(candidate);}catch{throw Error('文件链接指向的文件不存在。');}const relative=path.relative(base,full);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('文件链接超出这条消息的工作目录。');
  if(!/\.(?:txt|md|markdown|json|csv|tsv|log|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|svg|mp3|wav|mp4|webm|html?)$/i.test(full))throw Error('此文件类型请在工作区中查看。');
  if(!(await fs.stat(full)).isFile())throw Error('链接不是文件。');
  if(!team.pi.fs?.openDefault)throw Error('当前 PI 版本没有提供打开文件接口。');
  await team.pi.fs.openDefault(full);return {opened:true};
}
module.exports={openMessageFile};
