'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const FILE='avatar-library.json',MAX_ITEMS=300,MAX_IMAGE=40000,MAX_THUMBNAIL=4000;
const imagePattern=/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
function validateLibrary(value){
  if(!value||value.version!==1||!Array.isArray(value.items)||value.items.length>MAX_ITEMS)throw Error('共享头像库格式无效。');
  const ids=new Set();
  for(const item of value.items){
    if(!item||!safeId(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>80||/[\u0000-\u001f]/.test(item.name)||!imagePattern.test(item.image)||item.image.length>MAX_IMAGE||!imagePattern.test(item.thumbnail)||item.thumbnail.length>MAX_THUMBNAIL||!Number.isFinite(Date.parse(item.at)))throw Error('共享头像库中包含无效项目。');
    ids.add(item.id);
  }
  return value;
}
async function atomic(file,text){
  await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(tmp,text,'utf8');await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
class AvatarLibrary{
  constructor(team){this.team=team;this.file=path.join(team.data,FILE);this.items=[];this.revision=0;this.queue=Promise.resolve();}
  async load(){
    try{const value=JSON.parse(await fs.readFile(this.file,'utf8'));validateLibrary(value);this.items=value.items;this.revision=Number.isInteger(value.revision)&&value.revision>=0?value.revision:this.items.length;}
    catch(error){if(error.code!=='ENOENT')throw Error('共享头像库无法读取，原文件已保留：'+error.message);}
    return this;
  }
  async persist(){
    const prior=this.queue;let release;this.queue=new Promise(resolve=>release=resolve);
    try{await prior;this.revision++;await atomic(this.file,JSON.stringify({version:1,revision:this.revision,items:this.items}));this.team.queueCheckpoint?.(this.team.state);}
    catch(error){this.revision=Math.max(0,this.revision-1);throw error;}finally{release();}
  }
  find(id){return this.items.find(item=>item.id===id);}
  used(id){return this.team.state.bots.filter(bot=>bot.avatar?.libraryId===id).length;}
  list(input={}){
    const pageSize=12,total=this.items.length,pageCount=Math.max(1,Math.ceil(total/pageSize)),page=Math.max(0,Math.min(pageCount-1,Number.isInteger(input.page)?input.page:0));
    return {page,pageSize,pageCount,total,items:this.items.slice(page*pageSize,(page+1)*pageSize).map(({id,name,thumbnail,at})=>({id,name,thumbnail,at,used:this.used(id)}))};
  }
  image(id){
    const item=this.find(id);if(!item)throw Error('共享头像不存在，请刷新后重试。');
    return {id:item.id,image:item.image};
  }
  async add(input={}){
    if(this.items.length>=MAX_ITEMS)throw Error('共享头像库最多保存 300 个头像。');
    const name=String(input.name||'').trim(),image=input.image,thumbnail=input.thumbnail;
    if(!name||name.length>80||/[\u0000-\u001f]/.test(name))throw Error('请填写 1–80 个字符的头像名称。');
    if(!imagePattern.test(image)||image.length>MAX_IMAGE||!imagePattern.test(thumbnail)||thumbnail.length>MAX_THUMBNAIL)throw Error('头像图片无效或过大，请重新选择。');
    const item={id:randomUUID(),name,image,thumbnail,at:new Date().toISOString()};this.items.push(item);
    try{await this.persist();}catch(error){this.items=this.items.filter(entry=>entry!==item);throw error;}
    return {item:{id:item.id,name:item.name,thumbnail:item.thumbnail,at:item.at,used:0},total:this.items.length};
  }
  async remove(id){
    const index=this.items.findIndex(item=>item.id===id);if(index<0)throw Error('共享头像不存在。');
    const used=this.used(id);if(used)throw Error('这个头像正用于 '+used+' 个 Bot，请先更换这些 Bot 的头像。');
    const [item]=this.items.splice(index,1);
    try{await this.persist();}catch(error){this.items.splice(index,0,item);throw error;}
    return {deleted:id,total:this.items.length};
  }
  operation(input={}){
    if(input.action==='list')return this.list(input);
    if(input.action==='get')return this.image(input.id);
    if(input.action==='add')return this.add(input);
    if(input.action==='delete')return this.remove(input.id);
    throw Error('未知的共享头像操作。');
  }
  export(){return {version:1,revision:this.revision,items:structuredClone(this.items)};}
  async restore(value){
    if(value===undefined)return;
    validateLibrary(value);await atomic(this.file,JSON.stringify(value));this.items=structuredClone(value.items);this.revision=Number.isInteger(value.revision)?value.revision:this.items.length;
  }
}
module.exports={AvatarLibrary,validateLibrary,MAX_ITEMS,MAX_IMAGE,MAX_THUMBNAIL};
