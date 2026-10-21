'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {imageFile,checkImageSize}=require('./attachment-policy');
class AttachmentUploads{
  constructor(team){this.team=team;this.pending=new Map();this.tail=Promise.resolve();this.closed=false;}
  operation(input){const run=this.tail.catch(()=>{}).then(()=>this.operationOnce(input));this.tail=run.catch(()=>{});return run;}
  async discard(id){const item=this.pending.get(id);if(!item)return;this.pending.delete(id);await item.handle?.close().catch(()=>{});await fs.rm(item.root,{recursive:true,force:true,maxRetries:3,retryDelay:50});}
  async operationOnce(input){
    if(this.closed)throw Error('文件上传已停止。');
    for(const [id,item] of this.pending)if(Date.now()-item.at>1200000)await this.discard(id);
    if(input.action==='begin'){
      if(this.pending.size>=4)throw Error('请等待文件上传完成。');
      if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200||/[\\/<>:\x22|?*\x00-\x1f]/.test(input.name)||/[. ]$/.test(input.name)||!Number.isSafeInteger(input.size)||input.size<0)throw Error('文件名或大小无效。');
      const image=imageFile(input);if(image)checkImageSize(input.size);
      const id=randomUUID(),root=path.join(this.team.data,'uploaded-files',id),partial=path.join(root,'.'+id+'.part');
      await fs.mkdir(root,{recursive:true});let handle;
      try{handle=await fs.open(partial,'wx');}catch(error){await fs.rm(root,{recursive:true,force:true});throw error;}
      this.pending.set(id,{name:input.name,size:input.size,kind:image?'image':'file',...(image&&input.mimeType?{mimeType:input.mimeType}:{}),root,partial,handle,length:0,bytes:0,at:Date.now()});return {id};
    }
    const item=this.pending.get(input.id);if(!item)throw Error('上传已取消或过期。');
    if(input.action==='cancel'){await this.discard(input.id);return {};}
    if(input.action==='chunk'){
      if(typeof input.chunk!=='string'||!input.chunk.length||input.chunk.length>48000||input.chunk.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.chunk)||input.offset!==item.length)throw Error('文件上传分段无效。');
      const bytes=Buffer.from(input.chunk,'base64');
      if(bytes.toString('base64')!==input.chunk||item.bytes+bytes.length>item.size||input.chunk.includes('=')&&item.bytes+bytes.length!==item.size)throw Error('文件上传分段无效。');
      try{await item.handle.writeFile(bytes);}catch(error){await this.discard(input.id);throw error;}
      item.length+=input.chunk.length;item.bytes+=bytes.length;item.at=Date.now();return {offset:item.length};
    }
    if(input.action!=='finish')throw Error('未知文件上传操作。');
    if(item.bytes!==item.size){await this.discard(input.id);throw Error('文件数据不完整。');}
    const file=path.join(item.root,item.name);
    try{await item.handle.close();item.handle=null;await fs.rename(item.partial,file);}catch(error){await this.discard(input.id);throw error;}
    this.pending.delete(input.id);return {path:file,name:item.name,size:item.bytes,kind:item.kind,...(item.mimeType?{mimeType:item.mimeType}:{})};
  }
  async close(){this.closed=true;await this.tail;for(const id of this.pending.keys())await this.discard(id);}
}
module.exports={AttachmentUploads};
