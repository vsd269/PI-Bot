import {base64Of} from './speech-capture.mjs';
export async function uploadFile(call,file,progress=()=>{},cancelled=()=>false){
  const upload=await call('team.attachment.upload',{action:'begin',name:file.name,size:file.size,mimeType:file.type});
  try{
    let offset=0;
    for(let start=0;start<file.size;start+=36000){
      if(cancelled())throw Error('已取消文件上传。');
      const chunk=base64Of(new Uint8Array(await file.slice(start,start+36000).arrayBuffer()));
      await call('team.attachment.upload',{action:'chunk',id:upload.id,offset,chunk});offset+=chunk.length;progress(Math.round(Math.min(file.size,start+36000)/file.size*100));
    }
    if(cancelled())throw Error('已取消文件上传。');return await call('team.attachment.upload',{action:'finish',id:upload.id});
  }catch(error){await call('team.attachment.upload',{action:'cancel',id:upload.id}).catch(()=>{});throw error;}
}
