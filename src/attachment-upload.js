'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
class AttachmentUploads{
  constructor(team){this.team=team;this.pending=new Map();}
  async operation(input){
    for(const [id,item] of this.pending)if(Date.now()-item.at>1200000)this.pending.delete(id);
    if(input.action==='begin'){if(this.pending.size>=4)throw Error('请等待文件上传完成。');if(typeof input.name!=='string'||!input.name.trim()||input.name.length>200||/[\\/<>:\x22|?*\x00-\x1f]/.test(input.name)||/[. ]$/.test(input.name)||!Number.isInteger(input.size)||input.size<1||input.size>20*1024*1024)throw Error('文件名无效或超过 20 MB。');const id=randomUUID();this.pending.set(id,{name:input.name,size:input.size,chunks:[],length:0,at:Date.now()});return {id};}
    const item=this.pending.get(input.id);if(!item)throw Error('上传已取消或过期。');
    if(input.action==='cancel'){this.pending.delete(input.id);return {};}
    if(input.action==='chunk'){if(typeof input.chunk!=='string'||input.chunk.length>48000||!/^[A-Za-z0-9+/=]*$/.test(input.chunk)||input.offset!==item.length||item.length+input.chunk.length>Math.ceil(item.size/3)*4)throw Error('文件上传分段无效。');item.chunks.push(input.chunk);item.length+=input.chunk.length;item.at=Date.now();return {offset:item.length};}
    if(input.action!=='finish')throw Error('未知文件上传操作。');this.pending.delete(input.id);const bytes=Buffer.from(item.chunks.join(''),'base64');if(bytes.length!==item.size)throw Error('文件数据不完整。');
    const root=path.join(this.team.data,'uploaded-files',input.id);await fs.mkdir(root,{recursive:true});const file=path.join(root,item.name);await fs.writeFile(file,bytes,{flag:'wx'});return {path:file,name:item.name};
  }
  close(){this.pending.clear();}
}
module.exports={AttachmentUploads};
