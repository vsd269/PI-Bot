'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {imageFile,checkImageSize,checkImageFiles}=require('./attachment-policy');
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};

function hostDataRoot(data){
  const plugin=path.resolve(data),parent=path.dirname(plugin),plugins=path.dirname(parent);
  // PI's plugin.getDataPath contract is <host-data>/plugins/data/<plugin-id>.
  // Refuse unknown layouts rather than guessing another profile or workspace.
  if(path.basename(parent)!=='data'||path.basename(plugins)!=='plugins'||!/^local\.(?:pi|ds)-bot$/.test(path.basename(plugin)))throw Error('无法确定 PI 会话附件目录，请更新 PI Desktop 后重试。');
  return path.dirname(plugins);
}
async function directory(root,parts){
  const realRoot=await fs.realpath(root);let current=realRoot;
  for(const part of parts){current=path.join(current,part);try{await fs.mkdir(current);}catch(error){if(error.code!=='EEXIST')throw error;}const stat=await fs.lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('会话附件目录无效，未写入文件。');}
  return current;
}
async function attachmentSource(team,filePath){
  const host=hostDataRoot(team.data),data=await fs.realpath(team.data),canonical=await fs.realpath(filePath),realHost=await fs.realpath(host);
  const relative=path.relative(path.join(realHost,'scratch'),canonical).split(path.sep);
  const ownScratch=relative.length===4&&/^[A-Za-z0-9_-]{1,200}$/.test(relative[0])&&relative[1]==='pi-bot-attachments'&&/^[a-f0-9]{64}$/.test(relative[2])&&/^[a-f0-9-]{36}-/.test(relative[3]);
  const managed=ownScratch||['uploaded-files','image-cache','message-files'].some(name=>inside(path.join(data,name),canonical));
  return {host,canonical,managed};
}
async function stageAttachment(team,sessionId,file){
  if(typeof sessionId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(sessionId))throw Error('会话附件的会话 ID 无效。');
  if(typeof file?.path!=='string'||!path.isAbsolute(file.path))throw Error('附件需要有效的本地文件路径。');
  const {host,canonical,managed}=await attachmentSource(team,file.path);
  // Stage only files PI Bot already manages. External/workspace references keep
  // their original path and remain subject to PI's native permission boundary.
  if(!managed)return {...file};
  const name=path.basename(String(file.name||path.basename(file.path)).replaceAll('\\','/')).replace(/[<>:\x22|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,180)||'attachment';
  const root=await directory(host,['scratch',sessionId,'pi-bot-attachments']),temporary=path.join(root,'.'+randomUUID()+'.part'),source=await fs.open(canonical,'r');let output;
  try{
    const stat=await source.stat();if(!stat.isFile())throw Error('附件必须是文件。');const image=imageFile(file);if(image)checkImageSize(stat.size);
    output=await fs.open(temporary,'wx');const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);let size=0;
    // Stream arbitrary files with bounded memory, preserving the original bytes.
    while(size<stat.size){const {bytesRead}=await source.read(buffer,0,Math.min(buffer.length,stat.size-size),null);if(!bytesRead)break;size+=bytesRead;if(image)checkImageSize(size);const chunk=buffer.subarray(0,bytesRead);hash.update(chunk);await output.writeFile(chunk);}
    if(size!==stat.size||(await source.stat()).size!==stat.size)throw Error('附件在添加时发生变化，请重新添加。');
    await output.close();output=null;
    const target=await directory(host,['scratch',sessionId,'pi-bot-attachments',hash.digest('hex')]);
    // A fresh name avoids trusting or overwriting a file edited by an earlier turn.
    const dest=path.join(target,randomUUID()+'-'+name);await fs.rename(temporary,dest);return {...file,path:dest,name,size};
  }finally{await source.close();await output?.close().catch(()=>{});await fs.rm(temporary,{force:true});}
}
async function stageAttachments(team,sessionId,files=[]){
  await checkImageFiles(files);
  const result=[];for(const file of files)result.push(await stageAttachment(team,sessionId,file));return result;
}
module.exports={hostDataRoot,attachmentSource,stageAttachment,stageAttachments};
