'use strict';
// One validation path for both appearance-only edits and the full Bot form.
function copyFraming(input,next){
  if(input.crop!==undefined){if(!['circle','rounded','square'].includes(input.crop))throw Error('头像形状无效。');next.crop=input.crop;}
  for(const [key,min,max] of [['zoom',1,4],['focusX',0,1],['focusY',0,1]]){
    if(input[key]===undefined)continue;
    if(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<min||input[key]>max)throw Error('头像位置或缩放无效。');
    next[key]=input[key];
  }
  if(!next.image&&Object.keys(next).some(key=>['crop','zoom','focusX','focusY'].includes(key)))throw Error('请先上传头像图片。');
  return next;
}
module.exports={copyFraming};
