'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {hostDataRoot,stageAttachment,stageAttachments}=require('../src/session-attachments');
const {LongMessages}=require('../src/long-messages'),{ImageCache}=require('../src/image-cache'),{AttachmentUploads}=require('../src/attachment-upload'),{RendererUploads}=require('../src/renderer-uploads'),{Team}=require('../src/team');
async function fixture(ctx){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pi-attachments-'))),data=path.join(root,'plugins','data','local.pi-bot');await fs.mkdir(path.join(data,'uploaded-files'),{recursive:true});ctx.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));return {root,data};}
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};

test('uploaded TXT, Word and PNG are copied intact into the owning native session',async ctx=>{
  const t=await fixture(ctx),uploads=new AttachmentUploads(t),files=[];
  for(const [name,bytes] of [['资料.txt',Buffer.from('开头\n全部中文内容\n最后一行')],['说明.docx',Buffer.from('PK\x03\x04word document fixture')],['照片.png',Buffer.from('PNG fixture')]]){
    const item=await uploads.operation({action:'begin',name,size:bytes.length});await uploads.operation({action:'chunk',id:item.id,offset:0,chunk:bytes.toString('base64')});const file=await uploads.operation({action:'finish',id:item.id});files.push({...file,kind:name.endsWith('.png')?'image':'file'});
  }
  const staged=await stageAttachments(t,'private-session',files);assert.equal(staged.length,3);
  for(let i=0;i<files.length;i++){assert(inside(path.join(t.root,'scratch','private-session'),staged[i].path));assert.deepEqual(await fs.readFile(staged[i].path),await fs.readFile(files[i].path));assert.equal(staged[i].name,files[i].name);}
  assert.equal(staged[2].kind,'image');assert(!inside(path.join(t.root,'scratch','private-session'),files[0].path));
});
test('cached images and forwarded attachments are restaged for each destination',async ctx=>{
  const t=await fixture(ctx),file=path.join(t.data,'uploaded-files/image.png');await fs.writeFile(file,'image bytes');const cached=await new ImageCache(t).capture({path:file,name:'image.png',kind:'image'});
  const first=await stageAttachment(t,'private',cached),second=await stageAttachment(t,'group',first);assert(inside(path.join(t.root,'scratch','group'),second.path));assert.deepEqual(await fs.readFile(second.path),await fs.readFile(file));
  await fs.writeFile(first.path,'changed by an earlier turn');const fresh=await stageAttachment(t,'private',cached);assert.notEqual(fresh.path,first.path);assert.equal(await fs.readFile(fresh.path,'utf8'),'image bytes');
});
test('long text reaches its exact end in a session-readable file and survives state restore',async ctx=>{
  const t=await fixture(ctx),long=new LongMessages(t),text='中文长消息\n'.repeat(3600)+'最后一句-END';const packed=await long.pack({text});assert.equal((await long.restore(packed)).text,text);
  const prepared=await long.prepare(text,'long-session');assert.equal(prepared.attachments.length,1);const file=prepared.attachments[0].path;assert(inside(path.join(t.root,'scratch','long-session'),file));assert.equal(await fs.readFile(file,'utf8'),text);assert(prepared.text.includes(file));assert(!prepared.text.includes(path.join(t.data,'message-files')));
  assert.deepEqual(await long.prepare('短消息','long-session'),{text:'短消息',attachments:[]});
});
test('attachment staging rejects traversal, unknown data layouts and oversized images',async ctx=>{
  const t=await fixture(ctx),file=path.join(t.data,'uploaded-files/source.txt');await fs.writeFile(file,'safe');await assert.rejects(stageAttachment(t,'../other',{path:file}),/会话 ID/);
  await assert.rejects(stageAttachment({...t,data:path.join(t.root,'unknown')},'valid',{path:file}),/无法确定/);assert.throws(()=>hostDataRoot(path.join(t.root,'plugins','data','unrelated')),/无法确定/);
  const image=path.join(t.data,'uploaded-files/source.png'),handle=await fs.open(image,'w');await handle.truncate(20*1024*1024+1);await handle.close();await assert.rejects(stageAttachment(t,'valid',{path:image,kind:'image'}),/20 MB/);
});
test('attachment staging refuses a redirected scratch directory',async ctx=>{
  const t=await fixture(ctx),outside=await fs.mkdtemp(path.join(os.tmpdir(),'pi-attachments-outside-'));ctx.after(()=>fs.rm(outside,{recursive:true,force:true}));await fs.symlink(outside,path.join(t.root,'scratch'),process.platform==='win32'?'junction':'dir');const file=path.join(t.data,'uploaded-files/source.txt');await fs.writeFile(file,'safe');await assert.rejects(stageAttachment(t,'valid',{path:file}),/目录无效/);assert.deepEqual(await fs.readdir(outside),[]);
});
test('arbitrary plugin data and symlinks to it are never copied into readable scratch',async ctx=>{
  const t=await fixture(ctx),file=path.join(t.data,'private-data.json');await fs.writeFile(file,'private data');const source={path:file,name:'private-data.json'};assert.deepEqual(await stageAttachment(t,'valid',source),source);
  const image={path:path.join(t.data,'private-image.png'),name:'private-image.png',kind:'image'};await fs.writeFile(image.path,'private image');assert.deepEqual(await new ImageCache(t).capture(image),image);assert.deepEqual(await stageAttachment(t,'valid',image),image);
  const linked=path.join(t.data,'uploaded-files','redirect');await fs.symlink(t.data,linked,process.platform==='win32'?'junction':'dir');const link={path:path.join(linked,'private-data.json'),name:'redirect.json'};assert.deepEqual(await stageAttachment(t,'valid',link),link);await assert.rejects(fs.stat(path.join(t.root,'scratch')),error=>error.code==='ENOENT');
});
for(const group of [false,true])test((group?'group':'private')+' execution sends staged files and preserves the full original request',async ctx=>{
  const t=await fixture(ctx),text='原文'.repeat(11000)+'TAIL',file=path.join(t.data,'uploaded-files/note.txt');await fs.writeFile(file,'附件末尾-END');let prompt;
  Object.assign(t,{state:{integrations:{}},settingWrites:Promise.resolve(),stopped:false,active:()=>true,session:async()=>group?'group-native':'private-native',model:async()=>({key:'test',input:['text','image']}),context:()=>'',waiters:new Map(),memory:null,
    invoke:async(operation,args)=>{if(operation==='agent/getStatus')return {status:{isRunning:false}};if(operation==='agent/prompt'){prompt=args[0];return {accepted:true,turnId:'turn'};}throw Error(operation);},save:async()=>{for(const resolve of t.waiters.values())resolve();}});
  t.longMessages=new LongMessages(t);t.integrations={images:new ImageCache(t)};const bot={id:'bot',name:'Bot',role:'Worker'},job={id:'job',botId:'bot',task:group?'请整理原始资料':text,sourceUserContent:group?text:undefined,attachments:[{path:file,name:'note.txt',kind:'file'}]};
  const room=group?{id:'group',name:'Group',log:[]}:null;t.state.rooms=room?[room]:[];
  await Team.prototype.execute.call(t,job,room,bot);assert.equal(prompt.attachments.length,2);for(const attached of prompt.attachments)assert(inside(path.join(t.root,'scratch',prompt.sessionId),attached.path));const original=prompt.attachments.find(f=>f.name!=='note.txt');assert.equal(await fs.readFile(original.path,'utf8'),text);assert(prompt.content.includes(original.path));assert(!prompt.content.includes(path.join(t.data,'message-files')));
});
test('large CJK requests cross the real renderer RPC as bounded chunks without content loss',async()=>{
  const {createClient}=await import(pathToFileURL(path.join(__dirname,'../renderer/rpc.mjs')).href),uploads=new RendererUploads(),calls=[];let received;
  const dispatch=async(_,{method,args})=>{assert(Buffer.byteLength(JSON.stringify({method,args}))<64*1024);calls.push(method);if(method==='request.upload')return uploads.operation(args,request=>{received=request;return {id:'accepted'};});if(method==='request.read')return {chunk:'{"accepted":true}',done:true};if(method==='request.start'){received=args;return {id:'accepted'};}throw Error(method);};
  const client=createClient(dispatch),text='中文'.repeat(15000)+'\n"\\\tEND😀';await client('team.private.send',{botId:'worker',content:text});assert.equal(received.payload.content,text);assert(calls.includes('request.upload'));calls.length=0;await client('team.group.send',{roomId:'room',content:'hello'});assert(!calls.includes('request.upload'));calls.length=0;await client('team.attachment.upload',{action:'chunk',id:'file',offset:0,chunk:'A'.repeat(48000)});assert(!calls.includes('request.upload'),'existing file chunks must retain the fast path');
});
test('large request assembly rejects missing or reordered chunks and clears on unload',()=>{
  const uploads=new RendererUploads(),start=uploads.operation({action:'begin',length:3});assert.throws(()=>uploads.operation({action:'chunk',id:start.id,offset:1,chunk:'a'}),/无效/);assert.throws(()=>uploads.operation({action:'finish',id:start.id},()=>assert.fail()),/完整/);
  for(let i=0;i<4;i++)uploads.operation({action:'begin',length:1});assert.throws(()=>uploads.operation({action:'begin',length:1}),/正在发送/);uploads.clear();assert.equal(uploads.pending.size,0);assert.throws(()=>uploads.operation({action:'begin',length:1024*1024+1}),/过大/);
});
test('chunk assembly cannot bypass the renderer channel allowlist',()=>{
  const {onRendererCall}=require('../main'),value=JSON.stringify({channel:'unknown.operation',payload:{}}),{id}=onRendererCall('request.upload',{action:'begin',length:value.length});onRendererCall('request.upload',{action:'chunk',id,offset:0,chunk:value});assert.throws(()=>onRendererCall('request.upload',{action:'finish',id}),/Unknown PI-bot operation/);
});
