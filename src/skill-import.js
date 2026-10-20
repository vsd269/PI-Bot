'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {inflateRawSync}=require('node:zlib');
const {randomUUID,createHash}=require('node:crypto');
const MAX=8*1024*1024,MAX_FILES=256,MAX_CONTENT=128000;
const safeName=name=>typeof name==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)&&name.length<=32;
function resourcePath(value){
  if(typeof value!=='string'||!value||value.length>500||value.includes('\\')||/[\x00-\x1f:]/.test(value)||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Skill 包含不安全的文件路径。');return value;
}
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function unzip(bytes){
  if(bytes.length>MAX||bytes.length<22)throw Error('Skill 压缩包无效或超过 8 MB。');let end=-1;
  for(let n=bytes.length-22;n>=Math.max(0,bytes.length-65557);n--)if(bytes.readUInt32LE(n)===0x06054b50&&n+22+bytes.readUInt16LE(n+20)===bytes.length){end=n;break;}
  if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw Error('请选择普通 ZIP 或 .skill 压缩包，不支持分卷。');
  const count=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16),length=bytes.readUInt32LE(end+12);if(count>MAX_FILES||count!==bytes.readUInt16LE(end+8)||start+length!==end)throw Error('压缩包文件过多或目录无效。');
  const files=[],seen=new Set();let at=start,total=0;
  for(let n=0;n<count;n++){
    if(at+46>end||bytes.readUInt32LE(at)!==0x02014b50)throw Error('ZIP 文件目录损坏。');
    const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),hash=bytes.readUInt32LE(at+16),packed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),nl=bytes.readUInt16LE(at+28),el=bytes.readUInt16LE(at+30),cl=bytes.readUInt16LE(at+32),offset=bytes.readUInt32LE(at+42),mode=bytes.readUInt32LE(at+38)>>>16;
    if(at+46+nl+el+cl>end||flags&1||![0,8].includes(method)||(mode&0xf000)===0xa000)throw Error('不支持加密压缩包、特殊压缩格式或符号链接。');
    const nameBytes=bytes.subarray(at+46,at+46+nl),name=new TextDecoder('utf-8',{fatal:true}).decode(nameBytes);at+=46+nl+el+cl;
    if(name.endsWith('/')){resourcePath(name.slice(0,-1));continue;}resourcePath(name);if(name.startsWith('__MACOSX/')||name.endsWith('/.DS_Store'))continue;
    if(seen.has(name.toLowerCase()))throw Error('压缩包中有重名文件。');seen.add(name.toLowerCase());total+=size;if(total>MAX)throw Error('Skill 解压后的总大小限 8 MB。');
    if(offset+30>start||bytes.readUInt32LE(offset)!==0x04034b50||bytes.readUInt16LE(offset+8)!==method)throw Error('ZIP 文件头损坏。');const localNameLength=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),body=offset+30+localNameLength+localExtra;
    if(!bytes.subarray(offset+30,offset+30+localNameLength).equals(nameBytes)||body+packed>start)throw Error('ZIP 文件路径或内容不一致。');
    let data;try{data=method===0?Buffer.from(bytes.subarray(body,body+packed)):inflateRawSync(bytes.subarray(body,body+packed),{maxOutputLength:Math.min(MAX,size)+1});}catch{throw Error('Skill 压缩内容损坏或过大。');}
    if(data.length!==size||crc(data)!==hash)throw Error('Skill 文件校验失败，请重新选择完整压缩包。');files.push({path:name,data:data.toString('base64')});
  }
  if(at!==end)throw Error('ZIP 目录长度不正确。');return files;
}
function validateFiles(files){
  if(!Array.isArray(files)||!files.length||files.length>MAX_FILES)throw Error('Skill 需包含 1–256 个文件。');let total=0;const seen=new Set();
  for(const f of files){resourcePath(f?.path);if(seen.has(f.path.toLowerCase()))throw Error('Skill 文件名重复。');seen.add(f.path.toLowerCase());if(typeof f.data!=='string'||f.data.length>Math.ceil(MAX/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw Error('Skill 文件编码无效。');total+=Buffer.byteLength(f.data,'base64');if(total>MAX)throw Error('Skill 文件总大小限 8 MB。');}
  return total;
}
function scalar(value){value=value.trim();if(value.startsWith('"')){try{return JSON.parse(value);}catch{return value.slice(1,-1);}}if(value.startsWith("'"))return value.slice(1,-1).replace(/''/g,"'");return value.replace(/\s+#.*$/,'');}
function frontmatter(text){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');const meta={};if(!text.startsWith('---\n'))return {meta,content:text.trim()};const end=text.indexOf('\n---',4);if(end<0)throw Error('SKILL.md 的 YAML 元数据缺少结束标记。');const lines=text.slice(4,end).split('\n');
  for(let n=0;n<lines.length;n++){const m=/^(name|description):\s*(.*)$/.exec(lines[n]);if(!m)continue;let value=m[2];if(/^[>|][+-]?$/.test(value)){const mode=value[0],parts=[];while(n+1<lines.length&&(/^[ \t]+/.test(lines[n+1])||!lines[n+1].trim()))parts.push(lines[++n].trim());value=parts.join(mode==='>'?' ':'\n').trim();}else value=scalar(value);if(typeof value==='string')meta[m[1]]=value;}
  return {meta,content:text.slice(end+4).trim()};
}
function slug(value,fallback='local-skill'){let result=String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');if(!/^[a-z]/.test(result))result='skill-'+result;if(result==='skill-'||!result)result=fallback;if(result.length>32)result=result.slice(0,24).replace(/-$/,'')+'-'+createHash('sha256').update(result).digest('hex').slice(0,6);return result;}
function unique(name,used){let result=name,n=2;while(used.has(result)){const suffix='-'+n++;result=name.slice(0,32-suffix.length).replace(/-$/,'')+suffix;}used.add(result);return result;}
function parseSkills(files,sourceName,library={}){
  validateFiles(files);let roots=files.filter(f=>/(^|\/)SKILL\.md$/i.test(f.path));if(!roots.length&&files.length===1&&/\.md$/i.test(files[0].path)){files=[{...files[0],path:'SKILL.md'}];roots=files;}
  if(!roots.length)throw Error('未找到 SKILL.md，请选择 Skill 文件、含 SKILL.md 的文件夹，或 ZIP/.skill 安装包。');if(roots.length>30)throw Error('一次最多导入 30 个 Skill。');
  const used=new Set(Object.keys(library)),items=[];for(const entry of roots){const prefix=entry.path.slice(0,-8),doc=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(entry.data,'base64')),{meta,content}=frontmatter(doc);if(!content||content.length>MAX_CONTENT)throw Error('SKILL.md 正文须为 1–128000 字符。');
    const wanted=meta.name||prefix.split('/').filter(Boolean).at(-1)||sourceName.replace(/\.(?:zip|skill|md)$/i,''),name=unique(slug(wanted),used);
    const resources=files.filter(f=>f.path.startsWith(prefix)&&!roots.some(other=>other!==entry&&other.path.startsWith(prefix)&&other.path.length<entry.path.length&&f.path.startsWith(other.path.slice(0,-8)))&&!roots.some(other=>other!==entry&&other.path.startsWith(prefix)&&f.path.startsWith(other.path.slice(0,-8)))).map(f=>({path:f===entry?'SKILL.md':f.path.slice(prefix.length),data:f.data}));
    const item={name,kind:'skill',description:(meta.description||'从本地导入的 Skill').slice(0,2000),content,createdBy:null,bundle:{version:1,id:randomUUID(),files:resources},importedFrom:String(sourceName).slice(0,200)};validateBundle(item.bundle);items.push(item);
  }return items;
}
function validateBundle(bundle){if(!bundle||bundle.version!==1||typeof bundle.id!=='string'||! /^[a-f0-9-]{36}$/.test(bundle.id))throw Error('Skill 资源标识无效。');validateFiles(bundle.files);if(!bundle.files.some(f=>f.path==='SKILL.md'))throw Error('Skill 资源缺少 SKILL.md。');}
async function materialize(team,item){
  validateBundle(item.bundle);const root=path.join(team.data,'skills',item.bundle.id);await fs.mkdir(root,{recursive:true});
  for(const file of item.bundle.files){const dest=path.join(root,...file.path.split('/'));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,Buffer.from(file.data,'base64'));}return root;
}
class SkillImports{
  constructor(capabilities){this.capabilities=capabilities;this.team=capabilities.team;this.uploads=new Map();this.tail=Promise.resolve();}
  async restore(){for(const item of Object.values(this.capabilities.library))if(item.bundle)await materialize(this.team,item);}
  async operation(input){
    for(const [id,u] of this.uploads)if(Date.now()-u.at>600000)this.uploads.delete(id);
    if(input.action==='begin'){if(this.uploads.size>=2)throw Error('已有 Skill 在导入，请完成或取消后再试。');if(!['zip','files'].includes(input.format))throw Error('请选择 Skill 文件或压缩包。');const id=randomUUID();this.uploads.set(id,{at:Date.now(),format:input.format,name:String(input.name||'local-skill').slice(0,200),text:'',items:null});return {id};}
    const upload=this.uploads.get(input.id);if(!upload)throw Error('导入已过期，请重新选择文件。');
    if(input.action==='cancel'){this.uploads.delete(input.id);return {};}
    if(input.action==='chunk'){if(upload.items||typeof input.chunk!=='string'||input.chunk.length>6000||input.offset!==upload.text.length||upload.text.length+input.chunk.length>12*1024*1024)throw Error('Skill 文件过大或上传顺序不正确。');upload.text+=input.chunk;upload.at=Date.now();return {offset:upload.text.length};}
    if(input.action==='preview'){
      let files;if(upload.format==='zip'){if(! /^[A-Za-z0-9+/=\r\n]+$/.test(upload.text))throw Error('Skill 压缩包编码无效。');files=unzip(Buffer.from(upload.text,'base64'));}else {try{files=JSON.parse(upload.text);}catch{throw Error('Skill 文件数据无效。');}}
      upload.items=parseSkills(files,upload.name,this.capabilities.library);upload.text='';return {skills:upload.items.map(i=>({name:i.name,description:i.description,files:i.bundle.files.length,characters:i.content.length})),canCreatePack:upload.items.length>1};
    }
    if(input.action==='commit'){
      if(upload.committing)return upload.committing;const run=this.tail.catch(()=>{}).then(()=>this.commit(upload,input));this.tail=run.catch(()=>{});upload.committing=run;try{const result=await run;this.uploads.delete(input.id);return result;}catch(error){upload.committing=null;throw error;}
    }
    throw Error('未知 Skill 导入操作。');
  }
  async commit(upload,input){
    if(!upload.items)throw Error('请先解析并检查 Skill。');const lib=this.capabilities.library,used=new Set(Object.keys(lib)),items=structuredClone(upload.items);for(const item of items)item.name=unique(item.name,used);
    if(input.createPack===true){const name=unique(slug(input.packName||upload.name.replace(/\.(?:zip|skill)$/i,''),'local-pack'),used);items.push({name,kind:'pack',description:'从本地安装包导入的能力组合',items:items.map(i=>i.name),createdBy:null});}
    const resources=[...Object.values(lib),...items].reduce((sum,i)=>sum+(i.bundle?i.bundle.files.reduce((n,f)=>n+Buffer.byteLength(f.data,'base64'),0):0),0);if(resources>12*1024*1024)throw Error('能力库导入资源总大小限 12 MB，请移除不需要的 Skill 后重试。');
    for(const item of items)if(item.bundle)await materialize(this.team,item);
    for(const item of items)lib[item.name]=item;try{await this.team.save();}catch(error){for(const item of items)delete lib[item.name];throw error;}
    return {imported:items.map(i=>({name:i.name,kind:i.kind})),...this.capabilities.view()};
  }
}
module.exports={SkillImports,unzip,frontmatter,parseSkills,validateBundle,materialize,resourcePath,safeName};
