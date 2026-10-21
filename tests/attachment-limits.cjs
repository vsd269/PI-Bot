'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const policy=require('../src/attachment-policy'),{AttachmentUploads}=require('../src/attachment-upload'),{stageAttachment}=require('../src/session-attachments'),{Team}=require('../src/team');
async function fixture(ctx){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pi-attachment-limits-'))),team={data:path.join(root,'plugins/data/local.pi-bot')};await fs.mkdir(path.join(team.data,'uploaded-files'),{recursive:true});const uploads=new AttachmentUploads(team);ctx.after(async()=>{await uploads.close();await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});return {team,uploads,root};}
const renderer=()=>import(pathToFileURL(path.join(__dirname,'../renderer/attachment-policy.mjs')).href);

test('browser and backend use the upstream 20-image, 20 MiB and 200 MiB policy',async()=>{
  const ui=await renderer();for(const key of ['MAX_IMAGES','MAX_IMAGE_BYTES','MAX_MESSAGE_IMAGE_BYTES'])assert.equal(ui[key],policy[key]);
  const image={name:'a.png',size:20*1024*1024};assert.doesNotThrow(()=>ui.checkAttachmentBatch([],Array(10).fill(image)));assert.throws(()=>ui.checkAttachmentBatch([],Array(11).fill(image)),/200 MB/);
  assert.doesNotThrow(()=>ui.checkAttachmentBatch([],Array.from({length:20},(_,i)=>({name:i+'.png',size:1}))));assert.throws(()=>ui.checkAttachmentBatch([],Array(21).fill({...image,size:1})),/20 张/);
  assert.throws(()=>ui.checkAttachmentBatch([],[{...image,size:image.size+1}]),/单张图片/);assert.throws(()=>ui.checkAttachmentBatch(Array(20).fill({...image,size:1}),[{...image,size:1}]),/20 张/);
});

test('ordinary files have no 20 MiB or eight-attachment admission limit',async ctx=>{
  const {uploads}=await fixture(ctx),ui=await renderer();const files=Array.from({length:30},(_,i)=>({name:i+'.mp4',size:3*1024*1024*1024}));assert.doesNotThrow(()=>ui.checkAttachmentBatch([],files));
  const {id}=await uploads.operation({action:'begin',name:'大视频.mp4',size:3*1024*1024*1024});assert.equal(uploads.pending.get(id).size,3*1024*1024*1024);assert.equal(uploads.pending.get(id).chunks,undefined);await uploads.operation({action:'cancel',id});assert.equal(uploads.pending.size,0);
  await assert.rejects(uploads.operation({action:'begin',name:'bad.bin',size:Number.MAX_SAFE_INTEGER+1}),/大小无效/);
});

test('a real file larger than 20 MiB uploads and stages without whole-file buffers',async ctx=>{
  const {team,uploads}=await fixture(ctx),{uploadFile}=await import(pathToFileURL(path.join(__dirname,'../renderer/attachment-upload.mjs')).href),size=24*1024*1024+17,bytes=Buffer.alloc(size,0x6b);bytes.write('完整文件尾部-END',size-24);
  let slices=0,maxRead=0,last=0;const file={name:'完整大文件.bin',size,type:'application/octet-stream',arrayBuffer(){assert.fail('must not read the entire file');},slice(start,end){slices++;maxRead=Math.max(maxRead,end-start);const value=bytes.subarray(start,Math.min(size,end));return {arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)};}};
  const uploaded=await uploadFile((channel,input)=>{assert.equal(channel,'team.attachment.upload');assert(Buffer.byteLength(JSON.stringify(input))<60000);return uploads.operation(input);},file,n=>{assert(n>=last);last=n;});
  assert(slices>1);assert(maxRead<=36000);assert.equal(last,100);assert.equal(uploaded.size,size);assert.equal(uploaded.kind,'file');assert.equal((await fs.stat(uploaded.path)).size,size);
  const staged=await stageAttachment(team,'large-session',uploaded);assert.equal(staged.size,size);const actual=createHash('sha256'),source=await fs.open(staged.path,'r');try{for await(const chunk of source.createReadStream())actual.update(chunk);}finally{await source.close().catch(()=>{});}assert.equal(actual.digest('hex'),createHash('sha256').update(bytes).digest('hex'));
});

test('empty ordinary files remain byte-for-byte attachments',async ctx=>{
  const {team,uploads}=await fixture(ctx),{id}=await uploads.operation({action:'begin',name:'空文件.txt',size:0});const file=await uploads.operation({action:'finish',id}),staged=await stageAttachment(team,'empty-session',file);assert.equal(file.size,0);assert.equal((await fs.stat(staged.path)).size,0);
});

test('image limits cannot be bypassed through the backend or MIME-only names',async ctx=>{
  const {team,uploads}=await fixture(ctx);await assert.rejects(uploads.operation({action:'begin',name:'too-large.png',size:policy.MAX_IMAGE_BYTES+1}),/单张图片/);await assert.rejects(uploads.operation({action:'begin',name:'without-extension',mimeType:'image/png',size:policy.MAX_IMAGE_BYTES+1}),/单张图片/);
  const file={path:path.join(team.data,'uploaded-files','a.png'),kind:'image'},handle=await fs.open(file.path,'w');await handle.truncate(policy.MAX_IMAGE_BYTES);await handle.close();await policy.checkImageFiles(Array(10).fill(file));await assert.rejects(policy.checkImageFiles(Array(11).fill(file)),/200 MB/);await assert.rejects(policy.checkImageFiles(Array(21).fill(file)),/20 张/);
});

test('send validation accepts 20 images plus ordinary files but refuses a 21st image',()=>{
  const image={path:path.resolve('image.png')},ordinary={path:path.resolve('document.pdf')},send=input=>Team.prototype.sendOptions.call({},input);
  assert.equal(send({attachments:[...Array(20).fill(image),...Array(12).fill(ordinary)]}).attachments.length,32);assert.throws(()=>send({attachments:Array(21).fill(image)}),/20 张/);assert.throws(()=>send({attachments:{}}),/附件列表/);
});

test('upload cancellation, failed completion and shutdown remove partial files',async ctx=>{
  const {uploads}=await fixture(ctx);const first=await uploads.operation({action:'begin',name:'partial.bin',size:6}),root=uploads.pending.get(first.id).root;
  await uploads.operation({action:'chunk',id:first.id,offset:0,chunk:Buffer.from('abc').toString('base64')});await assert.rejects(uploads.operation({action:'finish',id:first.id}),/不完整/);await assert.rejects(fs.stat(root),{code:'ENOENT'});
  const second=await uploads.operation({action:'begin',name:'cancel.bin',size:6}),secondRoot=uploads.pending.get(second.id).root;await uploads.operation({action:'cancel',id:second.id});await assert.rejects(fs.stat(secondRoot),{code:'ENOENT'});
  const third=await uploads.operation({action:'begin',name:'close.bin',size:6}),thirdRoot=uploads.pending.get(third.id).root;await uploads.close();await assert.rejects(fs.stat(thirdRoot),{code:'ENOENT'});await assert.rejects(uploads.operation({action:'begin',name:'late.bin',size:1}),/已停止/);
});

test('disk-backed uploads enforce canonical chunks and preserve concurrent ordering',async ctx=>{
  const {uploads}=await fixture(ctx),{id}=await uploads.operation({action:'begin',name:'ordered.bin',size:6});
  for(const chunk of ['AB==','A','????','YQ=='])await assert.rejects(uploads.operation({action:'chunk',id,offset:0,chunk}),/分段无效/);
  await assert.rejects(uploads.operation({action:'chunk',id,offset:4,chunk:'YWJj'}),/分段无效/);await Promise.all([uploads.operation({action:'chunk',id,offset:0,chunk:'YWJj'}),uploads.operation({action:'chunk',id,offset:4,chunk:'ZGVm'})]);const file=await uploads.operation({action:'finish',id});assert.equal(await fs.readFile(file.path,'utf8'),'abcdef');
});

test('expired uploads release their handles and partial directories',async ctx=>{
  const {uploads}=await fixture(ctx),{id}=await uploads.operation({action:'begin',name:'expired.bin',size:6}),item=uploads.pending.get(id);item.at=0;const next=await uploads.operation({action:'begin',name:'next.bin',size:0});assert(!uploads.pending.has(id));await assert.rejects(fs.stat(item.root),{code:'ENOENT'});await uploads.operation({action:'cancel',id:next.id});
});
