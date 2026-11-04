// Retain the whole (bounded) image. Framing is presentation data, never a
// destructive edit, so an avatar can be repositioned after closing the editor.
const clamp=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function framing(avatar={}){
  return {zoom:clamp(avatar.zoom,1,4,1),focusX:clamp(avatar.focusX,0,1,.5),focusY:clamp(avatar.focusY,0,1,.5),crop:['circle','rounded','square'].includes(avatar.crop)?avatar.crop:'circle'};
}
export function frameRect(width,height,avatar={}){
  const f=framing(avatar),side=Math.min(width,height)/f.zoom;
  return {x:(width-side)*f.focusX,y:(height-side)*f.focusY,side};
}
export function paintFrame(container,image,avatar={}){
  const f=framing(avatar);
  container.dataset.crop=f.crop;
  const layout=()=>{
    if(!image.naturalWidth)return;
    const rect=frameRect(image.naturalWidth,image.naturalHeight,f);
    Object.assign(image.style,{width:image.naturalWidth/rect.side*100+'%',height:image.naturalHeight/rect.side*100+'%',left:-rect.x/rect.side*100+'%',top:-rect.y/rect.side*100+'%'});
  };
  image.onload=layout;layout();
}
export async function wholeAvatarImage(file){
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('请选择 PNG、JPEG、WebP 或 GIF 图片');
  if(file.size>25*1024*1024)throw Error('请选择小于 25 MB 的图片');
  const bitmap=await createImageBitmap(file);
  try{
    for(const edge of [640,480,320,240,160,96,64]){
      const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.88,.72,.55,.4]){const url=canvas.toDataURL('image/webp',quality);if(url.startsWith('data:image/webp')&&url.length<36000)return url;}
      const png=canvas.toDataURL('image/png');if(png.length<36000)return png;
    }
    throw Error('这张图片太大，换一张试试');
  }finally{bitmap.close?.();}
}
export async function framedAvatarImage(avatar){
  const bitmap=await createImageBitmap(await (await fetch(avatar.image)).blob());
  try{
    const rect=frameRect(bitmap.width,bitmap.height,avatar),canvas=document.createElement('canvas');canvas.width=canvas.height=160;
    canvas.getContext('2d').drawImage(bitmap,rect.x,rect.y,rect.side,rect.side,0,0,160,160);
    return canvas.toDataURL('image/webp',.85);
  }finally{bitmap.close?.();}
}
