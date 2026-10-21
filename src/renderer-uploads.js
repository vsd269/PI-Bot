'use strict';
const {randomUUID}=require('node:crypto');
// Only assemble a bounded request here; request.start still validates its channel.
class RendererUploads{
  constructor(){this.pending=new Map();}
  operation(input,dispatch){
    for(const [id,item] of this.pending)if(Date.now()-item.at>120000)this.pending.delete(id);
    if(input.action==='begin'){
      if(this.pending.size>=4||!Number.isInteger(input.length)||input.length<1||input.length>1024*1024)throw Error('消息过大或正在发送，请稍后重试。');
      const id=randomUUID();this.pending.set(id,{length:input.length,offset:0,bytes:0,chunks:[],at:Date.now()});return {id};
    }
    const item=this.pending.get(input.id);if(!item)throw Error('消息发送已取消或过期，请重试。');
    if(input.action==='cancel'){this.pending.delete(input.id);return {};}
    if(input.action==='chunk'){
      if(typeof input.chunk!=='string'||input.chunk.length<1||input.chunk.length>10000||input.offset!==item.offset||item.offset+input.chunk.length>item.length||item.bytes+Buffer.byteLength(input.chunk)>1024*1024)throw Error('消息分段无效或过大。');
      item.chunks.push(input.chunk);item.offset+=input.chunk.length;item.bytes+=Buffer.byteLength(input.chunk);item.at=Date.now();return {offset:item.offset};
    }
    if(input.action!=='finish')throw Error('未知消息发送操作。');
    this.pending.delete(input.id);if(item.offset!==item.length)throw Error('消息未发送完整，请重试。');
    const request=JSON.parse(item.chunks.join(''));if(!request||typeof request!=='object'||Array.isArray(request))throw Error('消息请求格式无效。');
    return dispatch(request);
  }
  clear(){this.pending.clear();}
}
module.exports={RendererUploads};
