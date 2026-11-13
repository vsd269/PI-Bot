'use strict';
const {randomUUID}=require('node:crypto');
const {gzipSync}=require('node:zlib');
// Lease by last access, not creation time: a live operation or a large reply
// may legitimately outlast two minutes. Finished reads remain retryable.
class RendererRequests {
  constructor({now=()=>Date.now(),idleMs=30*60*1000}={}){this.items=new Map();this.now=now;this.idleMs=idleMs;}
  start(args,run){
    const now=this.now();for(const [id,item] of this.items)if(now-item.at>(item.pending?this.idleMs:60000))this.items.delete(id);
    if(this.items.size>=100)throw Error('Too many pending requests.');
    const id=randomUUID(),item={at:now,pending:true};this.items.set(id,item);
    Promise.resolve().then(run).then(value=>{
      const json=JSON.stringify(value??null);
      if(args.acceptGzip&&json.length>48000){item.json=gzipSync(json,{level:1}).toString('base64');item.encoding='gzip-base64';}
      else item.json=json;
      item.pending=false;item.at=this.now();
    }).catch(error=>{item.error=String(error?.message||error);item.pending=false;item.at=this.now();});
    return {id};
  }
  read(args){
    const item=this.items.get(args.id);if(!item)throw Error('请求已失效，请刷新会话；已提交的任务不会自动重发。');
    item.at=this.now();if(item.pending)return {pending:true};
    if(item.error)return {error:item.error};
    const offset=Math.max(0,Number(args.offset)||0),chunk=item.json.slice(offset,offset+14000);
    return {chunk,done:offset+chunk.length>=item.json.length,...(item.encoding?{encoding:item.encoding}:{})};
  }
  release(id){this.items.delete(id);return {released:true};}
  clear(){this.items.clear();}
}
module.exports={RendererRequests};
