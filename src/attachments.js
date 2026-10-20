'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
async function previewAttachment(team,input){
  let files;
  if(input.jobId){const job=team.state.jobs.find(j=>j.id===input.jobId);files=job?.attachments;}
  else if(input.roomId)files=team.room(input.roomId).log.find(l=>l.id===input.lineId)?.attachments;
  else if(input.botId)files=team.bot(input.botId).chat?.find(l=>l.id===input.lineId)?.attachments;
  if(!Number.isInteger(input.index)||input.index<0||!files?.[input.index])throw Error('只能预览用户已附加的文件。');
  const file=files[input.index];if(typeof file.path!=='string'||!path.isAbsolute(file.path)||! /\.(png|jpe?g|webp|gif)$/i.test(file.path))throw Error('此文件不支持图片预览。');
  const stat=await fs.stat(file.path);if(!stat.isFile()||stat.size>1024*1024)throw Error('图片预览限 1 MB；更大的图片仍会交给 PI 原生会话处理。');
  if(!team.pi.fs?.readPreview)throw Error('当前 PI 版本没有提供文件预览接口，请在原生会话查看。');
  const preview=await team.pi.fs.readPreview(file.path);
  if(preview?.kind!=='image'||typeof preview.dataUrl!=='string'||preview.dataUrl.length>1500000||!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(preview.dataUrl))throw Error('PI 未返回可显示的安全图片预览，请在原生会话查看。');
  return {name:file.name||path.basename(file.path),dataUrl:preview.dataUrl};
}
module.exports={previewAttachment};
