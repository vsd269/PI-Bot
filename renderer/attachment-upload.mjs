import {base64Of} from './speech-capture.mjs';
export async function uploadFile(call,file,progress=()=>{},cancelled=()=>false){
  const upload=await call('team.attachment.upload',{action:'begin',name:file.name,size:file.size});
  try{const encoded=base64Of(new Uint8Array(await file.arrayBuffer()));for(let offset=0;offset<encoded.length;offset+=48000){if(cancelled())throw Error('已取消文件上传。');await call('team.attachment.upload',{action:'chunk',id:upload.id,offset,chunk:encoded.slice(offset,offset+48000)});progress(Math.round(Math.min(encoded.length,offset+48000)/encoded.length*100));}if(cancelled())throw Error('已取消文件上传。');return await call('team.attachment.upload',{action:'finish',id:upload.id});}catch(error){await call('team.attachment.upload',{action:'cancel',id:upload.id}).catch(()=>{});throw error;}
}
