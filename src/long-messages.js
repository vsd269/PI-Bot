'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const KEYS=new Set(['text','task','result','planReply']);
class LongMessages{
  constructor(team){this.team=team;this.root=path.join(team.data,'message-files');this.stored=new Set();}
  async store(text){const hash=createHash('sha256').update(text).digest('hex'),file=path.join(this.root,hash+'.txt');if(!this.stored.has(hash)){await fs.mkdir(this.root,{recursive:true});try{await fs.writeFile(file,text,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}this.stored.add(hash);}return {hash,file};}
  async pack(value,key=''){
    if(typeof value==='string'&&KEYS.has(key)&&value.length>20000){const {hash}=await this.store(value);return {$piBotText:hash,length:value.length,preview:value.slice(0,2000)};}
    if(Array.isArray(value))return Promise.all(value.map(v=>this.pack(v)));
    if(value&&typeof value==='object'){const result={};for(const [k,v] of Object.entries(value))result[k]=await this.pack(v,k);return result;}return value;
  }
  async restore(value){
    if(value&&typeof value==='object'&&Object.hasOwn(value,'$piBotText')){if(!/^[a-f0-9]{64}$/.test(value.$piBotText)||!Number.isInteger(value.length)||value.length>10000000)throw Error('长消息引用无效。');const file=path.join(this.root,value.$piBotText+'.txt');const text=await fs.readFile(file,'utf8');if(text.length!==value.length||createHash('sha256').update(text).digest('hex')!==value.$piBotText)throw Error('长消息文件损坏，未使用截短内容替代。');this.stored.add(value.$piBotText);return text;}
    if(Array.isArray(value))return Promise.all(value.map(v=>this.restore(v)));
    if(value&&typeof value==='object'){const result={};for(const [k,v] of Object.entries(value))result[k]=await this.restore(v);return result;}return value;
  }
  async prepare(text){if(text.length<=20000)return {text,attachments:[]};const {file}=await this.store(text);return {text:'完整消息有 '+text.length+' 字，已作为只读附件提供。执行前请读取全文；不要仅根据以下预览工作。超过 2000 字的单行可用文件工具或 shell 分段读取。\n文件：'+file+'\n\n预览：\n'+text.slice(0,1000),attachments:[{path:file,name:'完整消息.txt',kind:'file'}]};}
}
module.exports={LongMessages};
