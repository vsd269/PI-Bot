export const MAX_IMAGE_BYTES=20*1024*1024,MAX_IMAGES=20,MAX_MESSAGE_IMAGE_BYTES=200*1024*1024;
export const imageFile=file=>file?.kind==='image'||/\.(png|jpe?g|webp|gif)$/i.test(file?.name||file?.path||'')||/^image\/(png|jpeg|webp|gif)$/i.test(file?.mimeType||file?.type||'');
export function checkAttachmentBatch(existing,files){
  for(const file of files)if(!Number.isSafeInteger(file.size)||file.size<0)throw Error('文件大小无效。');
  const images=[...existing,...files].filter(imageFile);
  if(images.length>MAX_IMAGES)throw Error('每条消息最多附加 20 张图片。');
  if(images.some(file=>file.size>MAX_IMAGE_BYTES))throw Error('单张图片最多 20 MB。');
  if(images.reduce((sum,file)=>sum+(file.size||0),0)>MAX_MESSAGE_IMAGE_BYTES)throw Error('每条消息的图片合计最多 200 MB。');
}
