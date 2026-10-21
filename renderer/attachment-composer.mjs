import {uploadFile} from './attachment-upload.mjs';
import {checkAttachmentBatch} from './attachment-policy.mjs';

export function clipboardFiles(data){
  const files=Array.from(data?.files||[]);
  if(!files.length)for(const item of Array.from(data?.items||[])){if(item.kind==='file'){const file=item.getAsFile();if(file)files.push(file);}}
  return files;
}

export function createAttachmentComposer({input,picker,call,getTarget,getAttachments,add,notice,onBusy}){
  let closed=false,queue=Promise.resolve(),noticeTarget=null;const pending=new Map();
  const currentBusy=()=>Boolean(pending.get(getTarget()));
  function changed(){if(!closed){if(noticeTarget&&noticeTarget!==getTarget()){notice('');noticeTarget=null;}onBusy(currentBusy());}}
  async function enqueue(files){
    const target=getTarget();if(closed||!target||!files.length)return;
    pending.set(target,(pending.get(target)||0)+1);changed();
    const active=()=>!closed&&getTarget()===target;
    const task=queue.catch(()=>{}).then(async()=>{
      if(!active())return;
      checkAttachmentBatch(getAttachments(),files);
      noticeTarget=target;notice('正在添加 '+files.length+' 个文件…');
      for(const file of files){
        if(!active())return;
        const uploaded=await uploadFile(call,file,n=>{if(active())notice('正在添加 '+file.name+' · '+n+'%');},()=>!active());
        if(!active())return;add(uploaded);
      }
      if(active()){noticeTarget=null;notice('');input.focus();}
    });
    queue=task;
    try{await task;}catch(error){if(active()){noticeTarget=null;notice(error.message||'文件添加失败，请重试。');}}
    finally{const left=(pending.get(target)||1)-1;if(left)pending.set(target,left);else pending.delete(target);changed();}
  }
  const paste=event=>{
    const data=event.clipboardData,files=clipboardFiles(data);if(!files.length)return;
    // Word/browser selections can contain a generated image alongside editable
    // HTML/text. A copied native file or an image-only paste remains a file.
    if(data.getData('text/plain')&&Array.from(data.types||[]).includes('text/html')&&files.every(file=>file.type.startsWith('image/')))return;
    event.preventDefault();event.stopPropagation();void enqueue(files);
  };
  const choose=()=>void enqueue(Array.from(picker.files||[]));
  input.addEventListener('paste',paste);picker.addEventListener('change',choose);
  return {get busy(){return currentBusy();},sync:changed,dispose(){closed=true;input.removeEventListener('paste',paste);picker.removeEventListener('change',choose);pending.clear();}};
}
