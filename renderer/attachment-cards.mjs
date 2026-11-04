import {el,icon} from './dom.mjs';
import {attachmentDraftInfo} from './attachment-composer.mjs';
const sizeText=n=>n>=1024*1024?(n/1024/1024).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':(n||0)+' B';
export function attachmentCard(file,{remove,retry}={}){
  const info=attachmentDraftInfo(file),image=file.kind==='image',card=el('div','','draft-chip pi-attachment-card');card.title=file.name;
  const preview=el('div','','pi-attachment-media');
  if(image&&info?.previewUrl){const img=el('img');img.src=info.previewUrl;img.alt=file.name;preview.append(img);}
  else{preview.append(icon('FileIcon'),el('span',file.name||'文件','pi-attachment-name'));}
  const status=el('div',info?.error?'添加失败':info?.uploading?'正在添加 · '+info.progress+'%':sizeText(file.size),'pi-attachment-size');status.setAttribute('role','status');
  const foot=el('div','','pi-attachment-kind');foot.append(icon(image?'ImageIcon':'FileIcon'),el('span',image?'IMAGE':/\.(mp3|wav|m4a|ogg|flac|aac|opus)$/i.test(file.name)?'AUDIO':/\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)?'VIDEO':'FILE'));
  card.append(preview,status,foot);
  card.setAttribute('aria-busy',String(info?.uploading===true));
  if(info?.error){card.dataset.error='';status.title=info.error;const button=el('button','重试','pi-attachment-retry');button.type='button';button.onclick=retry;card.append(button);}
  const close=el('button','','pi-attachment-remove');close.type='button';close.setAttribute('aria-label',(file.name||'文件')+' ×');close.title='移除文件';close.append(icon('CloseIcon'));close.onclick=remove;card.append(close);return card;
}
