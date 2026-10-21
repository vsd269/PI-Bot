import {pathToFileURL} from 'node:url';
import path from 'node:path';
const source=process.env.PI_BOT_DESKTOP_SOURCE;
export async function resolve(specifier,context,next){
  if(specifier==='@pi-desktop/shared'){
    const modules=['errors','attachment-formats','attachment-limits','composer-trigger','inline-attachments'];
    const code=modules.map(name=>'export * from '+JSON.stringify(pathToFileURL(path.join(source,'packages/shared/src',name+'.ts')).href)+';').join('\n');
    return {url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true};
  }
  try{return await next(specifier,context);}catch(error){if((specifier.startsWith('./')||specifier.startsWith('../'))&&specifier.endsWith('.js'))return next(specifier.slice(0,-3)+'.ts',context);throw error;}
}
