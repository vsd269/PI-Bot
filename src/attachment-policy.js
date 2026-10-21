'use strict';
const fs=require('node:fs/promises');
const MAX_IMAGE_BYTES=20*1024*1024,MAX_IMAGES=20,MAX_MESSAGE_IMAGE_BYTES=200*1024*1024;
const imageFile=file=>file?.kind==='image'||/\.(png|jpe?g|webp|gif)$/i.test(file?.name||file?.path||'')||/^image\/(png|jpeg|webp|gif)$/i.test(file?.mimeType||file?.type||'');
function checkImageCount(files){if(files.filter(imageFile).length>MAX_IMAGES)throw Error('每条消息最多附加 20 张图片。');}
function checkImageSize(size){if(size>MAX_IMAGE_BYTES)throw Error('单张图片最多 20 MB。');}
async function checkImageFiles(files){
  checkImageCount(files);let total=0;
  for(const file of files.filter(imageFile)){const stat=await fs.stat(file.path);if(!stat.isFile())throw Error('附件必须是文件。');checkImageSize(stat.size);total+=stat.size;}
  if(total>MAX_MESSAGE_IMAGE_BYTES)throw Error('每条消息的图片合计最多 200 MB。');
}
module.exports={MAX_IMAGE_BYTES,MAX_IMAGES,MAX_MESSAGE_IMAGE_BYTES,imageFile,checkImageCount,checkImageSize,checkImageFiles};
