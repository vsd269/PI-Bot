'use strict';
// Exercise the actual PI Desktop attachment boundary from a local SDK checkout.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{register}=require('node:module'),{pathToFileURL}=require('node:url');
const {stageAttachment}=require('../src/session-attachments'),{LongMessages}=require('../src/long-messages');
(async()=>{
  const source=process.env.PI_BOT_DESKTOP_SOURCE;if(!source)throw Error('Set PI_BOT_DESKTOP_SOURCE to the PI Desktop source checkout.');
  register(pathToFileURL(path.join(__dirname,'fixtures/pi-attachment-source-loader.mjs')));
  const {preparePromptAttachments}=await import(pathToFileURL(path.join(source,'apps/desktop/electron/main/prompt-attachments.ts')).href);
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pi-attachment-boundary-'))),team={data:path.join(root,'plugins/data/local.pi-bot')};
  try{
    await fs.mkdir(path.join(team.data,'uploaded-files'),{recursive:true});const original={path:path.join(team.data,'uploaded-files/资料.txt'),name:'资料.txt',kind:'file'};await fs.writeFile(original.path,'附件正文\n最后一句-END');
    await assert.rejects(preparePromptAttachments(root,'private',undefined,[original],true,''),/Attachment path is outside the session roots/);
    const staged=await stageAttachment(team,'private',original),accepted=await preparePromptAttachments(root,'private',undefined,[staged],true,'请阅读全文');assert.equal(await fs.readFile(accepted[0].fallbackPath,'utf8'),'附件正文\n最后一句-END');
    const full='长篇中文\n'.repeat(4000)+'全文结尾-END',message=await new LongMessages(team).prepare(full,'private');const long=await preparePromptAttachments(root,'private',undefined,message.attachments,true,message.text);assert.equal(await fs.readFile(long[0].fallbackPath,'utf8'),full);
    await assert.rejects(preparePromptAttachments(root,'other-session',undefined,[staged],true,''),/outside the session roots/);const forwarded=await stageAttachment(team,'other-session',staged);assert.equal((await preparePromptAttachments(root,'other-session',undefined,[forwarded],true,''))[0].message.name,original.name);
    const image={path:path.join(team.data,'uploaded-files/image.png'),name:'image.png',kind:'image'};const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8WQAAAAASUVORK5CYII=','base64');await fs.writeFile(image.path,bytes);const preparedImage=await preparePromptAttachments(root,'private',undefined,[await stageAttachment(team,'private',image)],true,'看这张图片');assert.deepEqual(Buffer.from(preparedImage[0].inlineData,'base64'),bytes);
    const privateFile={path:path.join(team.data,'private-data.json'),name:'private-data.json',kind:'file'};await fs.writeFile(privateFile.path,'private data');await assert.rejects(preparePromptAttachments(root,'private',undefined,[await stageAttachment(team,'private',privateFile)],true,''),/outside the session roots/);
    const largeFile={path:path.join(team.data,'uploaded-files/large.bin'),name:'large.bin',kind:'file'},large=await fs.open(largeFile.path,'w');await large.truncate(24*1024*1024);await large.write(Buffer.from('LARGE-END'),0,9,24*1024*1024-9);await large.close();const stagedLarge=await stageAttachment(team,'private',largeFile),nativeLarge=await preparePromptAttachments(root,'private',undefined,[stagedLarge],true,'');assert.equal((await fs.stat(nativeLarge[0].fallbackPath)).size,24*1024*1024);
    const stagedImage=await stageAttachment(team,'private',image),many=await preparePromptAttachments(root,'private',undefined,[...Array(20).fill(stagedImage),stagedLarge],true,'');assert.equal(many.length,21);assert.equal(many.filter(file=>file.message.kind==='image').length,20);
    console.log(JSON.stringify({passed:true,originalFailureReproduced:true,stagedAttachmentAccepted:true,fullLongTextReadable:true,sessionIsolationPreserved:true,forwardedAttachmentAccepted:true,imageBytesPreserved:true,fileOver20MiBAccepted:true,twentyImagesPlusFileAccepted:true,source},null,2));
  }finally{await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
})().catch(error=>{console.error(error);process.exitCode=1;});
