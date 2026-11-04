import {uploadFile} from './attachment-upload.mjs';
import {checkAttachmentBatch,imageFile} from './attachment-policy.mjs';

// Preview bytes and browser URLs never enter the model request or saved state.
const localDraft=new WeakMap(),localPreviews=new Map();
export const attachmentDraftInfo=file=>localDraft.get(file);
export const attachmentLocalPreview=file=>localPreviews.get(file.path)?.previewUrl||localPreviews.get(file.sourcePath)?.previewUrl;
export function releaseAttachmentDraft(file){const info=localDraft.get(file);if(info?.previewUrl)URL.revokeObjectURL(info.previewUrl);if(localPreviews.get(file.path)===info)localPreviews.delete(file.path);localDraft.delete(file);}

export function clipboardFiles(data){
  const files=Array.from(data?.files||[]);
  if(!files.length)for(const item of Array.from(data?.items||[])){if(item.kind==='file'){const file=item.getAsFile();if(file)files.push(file);}}
  return files;
}

export function createAttachmentComposer({input,picker,call,getTarget,getAttachments,add,notice,onBusy,onChange=()=>{},dropTarget=input}){
  let closed=false,queue=Promise.resolve();const pending=new Map(),owned=new Set();
  const currentBusy=()=>Boolean(pending.get(getTarget()));
  function changed(){if(!closed)onBusy(currentBusy()||getAttachments().some(file=>localDraft.get(file)?.error));}
  async function enqueue(files){
    const target=getTarget();if(closed||!target||!files.length)return;
    try{checkAttachmentBatch(getAttachments(),files);}catch(error){notice(error.message);return;}
    const list=getAttachments(),items=files.map(file=>{
      const item={path:'',name:file.name,size:file.size,kind:imageFile(file)?'image':'file',mimeType:file.type};
      localDraft.set(item,{file,uploading:true,progress:0,previewUrl:imageFile(file)?URL.createObjectURL(file):''});owned.add(item);return item;
    });
    pending.set(target,(pending.get(target)||0)+1);
    for(const item of items)add(item);
    changed();
    const active=()=>!closed&&getTarget()===target;
    const task=queue.catch(()=>{}).then(async()=>{
      if(!active())return;
      for(const item of items){
        if(!active())return;
        if(!list.includes(item))continue;
        const info=localDraft.get(item);if(!info)continue;
        try{
          const uploaded=await uploadFile(call,info.file,n=>{info.progress=n;if(active())onChange();},()=>!active()||!list.includes(item));
          if(!active()||!list.includes(item))continue;
          Object.assign(item,uploaded);info.uploading=false;info.file=null;delete info.error;
          if(info.previewUrl){localPreviews.set(item.path,info);while(localPreviews.size>40){const [path,old]=localPreviews.entries().next().value;URL.revokeObjectURL(old.previewUrl);old.previewUrl='';localPreviews.delete(path);}}
          onChange();
        }catch(error){if(active()&&list.includes(item)){info.uploading=false;info.error=error.message||'添加失败';onChange();}}
      }
      if(active())input.focus();
    });
    queue=task;
    try{await task;}finally{
      if(!active())for(const item of items)if(!item.path){const index=list.indexOf(item);if(index>=0)list.splice(index,1);releaseAttachmentDraft(item);owned.delete(item);}
      const left=(pending.get(target)||1)-1;if(left)pending.set(target,left);else pending.delete(target);if(!closed){onChange();changed();}
    }
  }
  const paste=event=>{
    const data=event.clipboardData,files=clipboardFiles(data);if(!files.length)return;
    // Word/browser selections can contain a generated image alongside editable
    // HTML/text. A copied native file or an image-only paste remains a file.
    if(data.getData('text/plain')&&Array.from(data.types||[]).includes('text/html')&&files.every(file=>file.type.startsWith('image/')))return;
    event.preventDefault();event.stopPropagation();void enqueue(files);
  };
  const choose=()=>{const files=Array.from(picker.files||[]);picker.value='';void enqueue(files);};
  const drop=event=>{const files=clipboardFiles(event.dataTransfer);if(!files.length)return;event.preventDefault();void enqueue(files);};
  const over=event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();};
  input.addEventListener('paste',paste);picker.addEventListener('change',choose);
  dropTarget.addEventListener('drop',drop);dropTarget.addEventListener('dragover',over);
  return {get busy(){return currentBusy()||getAttachments().some(file=>!file.path||localDraft.get(file)?.error);},sync:changed,retry(item){const info=localDraft.get(item);if(!info||info.uploading)return;const list=getAttachments(),index=list.indexOf(item);if(index<0)return;list.splice(index,1);releaseAttachmentDraft(item);owned.delete(item);void enqueue([info.file]);},dispose(){closed=true;input.removeEventListener('paste',paste);picker.removeEventListener('change',choose);dropTarget.removeEventListener('drop',drop);dropTarget.removeEventListener('dragover',over);pending.clear();for(const item of owned)releaseAttachmentDraft(item);owned.clear();}};
}
