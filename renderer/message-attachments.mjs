import {el,icon} from './dom.mjs';
import {attachmentLocalPreview} from './attachment-composer.mjs';

// Keep preview bytes outside transcript/state. Authorization always refers to
// the saved message, never a path supplied by this renderer.
export function createMessageAttachments({host,call}){
  const cache=new Map(),pending=new Map(),queue=[];let active=0,closed=false,viewer=null,observer;
  const callbacks=new WeakMap(),observed=new Set();
  function close(){if(!viewer)return;viewer.close();viewer.remove();viewer=null;}
  function expand(src,name){close();viewer=el('dialog','','pi-image-dialog');viewer.setAttribute('aria-label','图片预览：'+name);const head=el('header'),label=el('span',name),exit=el('button','','bt-round');exit.type='button';exit.setAttribute('aria-label','关闭图片预览');exit.append(icon('CloseIcon'));exit.onclick=close;head.append(label,exit);const image=el('img');image.src=src;image.alt=name;viewer.append(head,image);viewer.addEventListener('click',event=>{if(event.target===viewer)close();});viewer.addEventListener('cancel',event=>{event.preventDefault();close();});host.append(viewer);viewer.showModal();}
  async function load(key,context){
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    if(pending.has(key))return pending.get(key);
    const result=new Promise((resolve,reject)=>{queue.push({context,key,resolve,reject});drain();});pending.set(key,result);return result;
  }
  function drain(){while(!closed&&active<2&&queue.length){const task=queue.shift();active++;Promise.resolve().then(()=>call('team.attachment.preview',task.context)).then(result=>{
      if(closed)return task.resolve(null);
      if(typeof result?.dataUrl!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(result.dataUrl))throw Error('无法显示图片预览。');
      cache.set(task.key,result.dataUrl);
      let size=0;for(const value of cache.values())size+=value.length;
      while(cache.size>1&&(cache.size>40||size>32*1024*1024)){const [key,value]=cache.entries().next().value;size-=value.length;cache.delete(key);}
      task.resolve(result.dataUrl);
    }).catch(task.reject).finally(()=>{pending.delete(task.key);active--;drain();});}}
  if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);observed.delete(entry.target);callbacks.get(entry.target)?.();}},{rootMargin:'200px'});
  function append(target,line,selection){
    for(const node of observed)if(!node.isConnected){observer.unobserve(node);observed.delete(node);}
    const gallery=el('div','','pi-message-gallery');
    for(const [index,file] of (line.attachments||[]).entries()){
      const name=file.name||'图片',row=el('div','','message-attachment');
      if(/\.(png|jpe?g|webp|gif)$/i.test(file.path||file.name||'')){
        const button=el('button','','pi-message-image'),image=el('img','','attachment-preview'),hint=el('span','正在载入图片…','pi-image-hint'),zoom=el('span','','pi-image-expand');zoom.append(icon('ExpandIcon'));
        button.type='button';button.setAttribute('aria-label','查看图片：'+name);button.title='点击放大 '+name;image.alt=name;zoom.setAttribute('aria-hidden','true');button.append(image,hint,zoom);row.append(button);gallery.append(row);
        const context={...(line.attachmentJobId?{jobId:line.attachmentJobId}:selection.kind==='room'?{roomId:selection.id}:{botId:selection.id}),lineId:line.id,index},key=JSON.stringify([context,file.path,file.size]);let source='',loading=false;
        const paint=src=>{source=src;image.src=src;image.onload=()=>{hint.hidden=true;button.dataset.ready='';button.removeAttribute('aria-busy');};image.onerror=()=>{source='';image.removeAttribute('src');delete button.dataset.ready;hint.hidden=false;hint.textContent='图片无法显示，点击重试';button.removeAttribute('aria-busy');cache.delete(key);};};
        const start=async()=>{if(closed||loading||source)return;loading=true;hint.textContent='正在载入图片…';button.setAttribute('aria-busy','true');try{const src=await load(key,context);if(src&&!closed&&button.isConnected)paint(src);}catch(error){if(!closed&&button.isConnected){hint.textContent='图片不可用，点击重试';button.title=error.message;button.removeAttribute('aria-busy');}}finally{loading=false;}};
        button.onclick=()=>source?expand(source,name):start();
        const local=attachmentLocalPreview(file);if(local)paint(local);else if(cache.has(key))paint(cache.get(key));else if(observer){callbacks.set(button,start);observed.add(button);observer.observe(button);}else queueMicrotask(start);
      }else{const button=el('button',file.name||file.path,'soft-button');button.type='button';button.title='复制文件路径';button.onclick=()=>navigator.clipboard.writeText(file.path).catch(()=>{});row.append(button);gallery.append(row);}
    }
    if(gallery.childNodes.length)target.append(gallery);
  }
  return {append,close,dispose(){closed=true;close();observer?.disconnect();observed.clear();for(const task of queue.splice(0))task.resolve(null);cache.clear();pending.clear();}};
}
