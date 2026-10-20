import {el,icon} from './dom.mjs';
import {CHARACTERS,PICKER_SHAPES,PICKER_COLUMNS,CHARACTER_COLORS,SHAPES,hasShape,shapeOf,bodyOf,maskBox,holes,nextMarkSerial,lookOf,characterMarkup,MASK_ID,fnv1a} from './upstream/characters.mjs';
import {paintCss} from './upstream/inks.mjs';

// Uploaded avatars are centre-cropped to a small square so team.json stays light.
export async function avatarImage(file){
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片');
  if(file.size>25*1024*1024)throw new Error('请选择小于 25 MB 的图片');
  const bitmap=await createImageBitmap(file);
  const side=160,canvas=document.createElement('canvas');
  canvas.width=side;canvas.height=side;
  const context=canvas.getContext('2d');
  context.imageSmoothingQuality='high';
  const crop=Math.min(bitmap.width,bitmap.height);
  context.drawImage(bitmap,(bitmap.width-crop)/2,(bitmap.height-crop)/2,crop,crop,0,0,side,side);
  bitmap.close?.();
  // The host renderer RPC has a 64 KB envelope; keep uploaded images below it.
  for(const size of [160,128,96,64]){
    const scaled=document.createElement('canvas');scaled.width=scaled.height=size;scaled.getContext('2d').drawImage(canvas,0,0,size,size);
    for(const quality of [0.9,0.75,0.6,0.45]){const url=scaled.toDataURL('image/webp',quality);if(url.startsWith('data:image/webp')&&url.length<36000)return url;}
    const png=scaled.toDataURL('image/png');if(png.length<36000)return png;
  }
  throw new Error('这张图片太大，换一张试试');
}

// The selection ring follows the shape: a 1px line 3px outside it.
function shapeRing(shape,size){
  const def=shapeOf(shape),unit=def.size/size,id='pi-ring-'+nextMarkSerial();
  const markup=def.raster?'<rect x="-8" y="-8" width="'+(def.size+16)+'" height="'+(def.size+16)+'" rx="48" fill="none" stroke="currentColor" stroke-width="'+unit+'"/>':'<defs><mask id="'+id+'" '+maskBox(def.size)+'>'+holes(def,'<g stroke="#000" stroke-width="'+(6*unit)+'" stroke-linejoin="round">'+bodyOf(def,'#000',true)+'</g>')+'</mask></defs><g mask="url(#'+id+')" stroke="currentColor" stroke-width="'+(8*unit)+'" stroke-linejoin="round">'+bodyOf(def,'currentColor',true)+'</g>';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','bt-ring');svg.setAttribute('viewBox','0 0 '+def.size+' '+def.size);svg.setAttribute('aria-hidden','true');svg.innerHTML=markup;
  return svg;
}

export function mark(look,size,live=true,{id='',gaze=false,pokeable=false}={}){
  const span=el('span','','bt-mark');
  span.style.cssText='width:'+size+'px;height:'+size+'px';
  span.style.setProperty('--bt-size',size+'px');
  if(live){span.dataset.live='';span.dataset.fidget=['hop','sway','stretch','look'][fnv1a(id+':fidget')%4];span.style.setProperty('--bt-delay',-(fnv1a(id)%5000)/1000+'s');span.style.setProperty('--bt-fidget-delay',-(fnv1a(id+':when')%9000)/1000+'s');}
  if(id&&live)span.dataset.botId=id;
  if(gaze)span.dataset.gaze='';span.dataset.state='idle';span.dataset.shape=look.image?'image':look.shape;
  if(pokeable){span.dataset.poke='';let timer;span.addEventListener('click',()=>{clearTimeout(timer);if(matchMedia('(prefers-reduced-motion: reduce)').matches||span.closest('[data-bt-motion=quiet]'))return;span.classList.remove('bt-mark-poke');void span.offsetWidth;span.classList.add('bt-mark-poke');timer=setTimeout(()=>span.classList.remove('bt-mark-poke'),650);});span.addEventListener('animationend',event=>{if(/^bt-poke/.test(event.animationName)){clearTimeout(timer);span.classList.remove('bt-mark-poke');}});}
  if(look.image){const img=document.createElement('img');img.className='bt-mark-img';img.src=look.image;img.alt='';img.draggable=false;span.append(img);return span;}
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const box=shapeOf(look.shape).size;
  svg.setAttribute('viewBox','0 0 '+box+' '+box);
  svg.innerHTML=characterMarkup(look.shape,look.color).replaceAll(MASK_ID,'pi-mark-'+nextMarkSerial());
  span.append(svg);
  return span;
}

// The avatar editor: the Bot tab picks a character and colour, the Upload tab takes
// a photo, and Reset returns to the look the Bot id gives. Every choice saves.
export function avatarEditor({bot,onSave,onError,onClose,anchor}){
  const box=el('div','','bt-avedit');
  box.setAttribute('role','dialog');box.setAttribute('aria-label','头像编辑');
  let tab=lookOf(bot).image?'upload':'bot',over=false,page=0;
  const pageSize=36;
  const shapeButtons=new Map(),colorButtons=new Map();
  function choose(patch){
    bot={...bot,...patch};
    const look=lookOf(bot);
    for(const [id,button] of shapeButtons){button.setAttribute('aria-pressed',String(!look.image&&look.shape===id));const prior=button.querySelector('.bt-mark');if(!shapeOf(id).raster&&prior?.dataset.color!==look.color){const next=mark({shape:id,color:look.color},36);next.dataset.color=look.color;next.removeAttribute('data-live');prior?.replaceWith(next);}}
    for(const [color,button] of colorButtons)button.setAttribute('aria-pressed',String(look.color===color));
    syncPalette(look);
    try{Promise.resolve(onSave(patch)).catch(fail);}catch(error){fail(error);}
  }
  const top=el('div','','bt-avedit-top');
  const tabs=el('div','','bt-avedit-tabs');
  tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','头像来源');
  tabs.append(el('span','','bt-thumb'));
  const tabButtons={};
  for(const [id,label] of [['bot','图标'],['upload','上传']]){
    const button=el('button',label,'bt-avedit-tab');
    button.type='button';button.setAttribute('role','tab');
    button.onclick=()=>{tab=id;draw();};
    tabButtons[id]=button;tabs.append(button);
  }
  const reset=el('button','重置','bt-avedit-tab bt-avedit-reset');
  reset.type='button';reset.title='恢复默认形象';
  reset.onclick=()=>{choose({avatar:null,color:null});tab='bot';draw();};
  top.append(tabs,reset);
  const body=el('div');
  let palette,artworkNote;
  function syncPalette(look){
    const fixed=Boolean(shapeOf(look.shape).raster);
    if(palette)palette.hidden=fixed;
    if(artworkNote)artworkNote.hidden=!fixed;
  }
  box.append(top,body);
  const file=document.createElement('input');
  file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif';file.hidden=true;
  file.onchange=()=>{const chosen=file.files?.[0];file.value='';if(chosen)upload(chosen);};
  box.append(file);
  function fail(error){onError(error?.message||String(error));}
  function upload(chosen){if(!chosen)return;avatarImage(chosen).then(image=>{choose({avatar:{...(bot.avatar??{}),image}});tab='upload';draw();}).catch(fail);}
  function draw(){
    const look=lookOf(bot),hasPhoto=Boolean(look.image);
    for(const [id,button] of Object.entries(tabButtons))button.setAttribute('aria-selected',String(tab===id));
    body.replaceChildren();
    palette=null;artworkNote=null;
    shapeButtons.clear();colorButtons.clear();
    if(tab==='bot'){
      const shapes=[...PICKER_SHAPES,...Object.keys(SHAPES).filter(id=>!Object.hasOwn(CHARACTERS,id))];
      if(!shapes.includes(look.shape))shapes.push(look.shape);
      const pageCount=Math.max(1,Math.ceil(shapes.length/pageSize));
      page=Math.min(page,pageCount-1);
      const visible=shapes.slice(page*pageSize,(page+1)*pageSize);
      const grid=el('div','','bt-shapes');
      grid.setAttribute('role','group');grid.setAttribute('aria-label','角色形象');
      for(let index=0;index<visible.length;index+=PICKER_COLUMNS){
        const row=el('div','','bt-shape-row');
        for(const id of visible.slice(index,index+PICKER_COLUMNS)){
          const label=shapeOf(id).label||id;
          const button=el('button','','bt-shape');
          button.type='button';button.title=label;button.setAttribute('aria-label',label);
          button.setAttribute('aria-pressed',String(!hasPhoto&&look.shape===id));
          const preview=mark({shape:id,color:look.color},36);preview.dataset.color=look.color;preview.removeAttribute('data-live');
          button.append(shapeRing(id,36),preview);
          shapeButtons.set(id,button);button.onclick=()=>choose({avatar:{shape:id}});
          row.append(button);
        }
        grid.append(row);
      }
      const colors=el('div','','bt-colors');palette=colors;
      colors.setAttribute('role','group');colors.setAttribute('aria-label','角色颜色');
      for(const color of CHARACTER_COLORS){
        const button=el('button','','bt-color');
        button.type='button';button.title=color==='deepseek'?'PI 蓝':color;button.setAttribute('aria-label',button.title);
        button.setAttribute('aria-pressed',String(look.color===color));
        const swatch=el('span');swatch.style.background=paintCss(color);button.append(swatch);
        colorButtons.set(color,button);button.onclick=()=>choose({color});
        colors.append(button);
      }
      const pages=el('div','','bt-avatar-pages');
      const previous=el('button','上一页','bt-soft bt-soft-sm');
      previous.type='button';previous.disabled=page===0;previous.setAttribute('aria-label','上一页头像');
      previous.onclick=()=>{page=Math.max(0,page-1);draw();};
      const indicator=el('span',`${page+1} / ${pageCount}`,'bt-avatar-page-indicator');
      indicator.setAttribute('aria-live','polite');
      const next=el('button','下一页','bt-soft bt-soft-sm');
      next.type='button';next.disabled=page>=pageCount-1;next.setAttribute('aria-label','下一页头像');
      next.onclick=()=>{page=Math.min(pageCount-1,page+1);draw();};
      pages.append(previous,indicator,next);
      body.append(grid,colors,pages);syncPalette(look);
    }else{
      const zone=el('div','','bt-dropzone');
      zone.toggleAttribute('data-over',over);
      zone.ondragover=event=>{event.preventDefault();over=true;zone.toggleAttribute('data-over',true);};
      zone.ondragleave=()=>{over=false;zone.toggleAttribute('data-over',false);};
      zone.ondrop=event=>{event.preventDefault();over=false;zone.toggleAttribute('data-over',false);upload(event.dataTransfer.files?.[0]);};
      if(hasPhoto){const img=document.createElement('img');img.src=look.image;img.alt='';zone.append(img);}
      zone.append(el('div',hasPhoto?'拖入、粘贴或选择新图片':'拖入、粘贴或选择一张图片'));
      const actions=el('div','','bt-actions');
      actions.style.justifyContent='center';
      const browse=el('button',hasPhoto?'替换':'选择图片','bt-soft bt-soft-sm');
      browse.type='button';browse.onclick=()=>file.click();
      actions.append(browse);
      if(hasPhoto){
        const remove=el('button','移除图片','bt-soft bt-soft-sm');
        remove.type='button';
        remove.onclick=()=>{choose({avatar:hasShape(bot.avatar?.shape)?{shape:bot.avatar.shape}:null});draw();};
        actions.append(remove);
      }
      zone.append(actions);
      body.append(zone);
    }
  }
  function onPaste(event){
    if(tab!=='upload')return;
    const item=[...(event.clipboardData?.files??[])].find(entry=>entry.type.startsWith('image/'));
    if(item){event.preventDefault();upload(item);}
  }
  function onKey(event){if(event.key==='Escape'){event.stopPropagation();onClose();}}
  // composedPath also works when the editor lives inside PI's shadow root.
  function onDown(event){const path=event.composedPath();if(!path.includes(box)&&!path.includes(anchor))onClose();}
  window.addEventListener('paste',onPaste);
  window.addEventListener('keydown',onKey,true);
  window.addEventListener('pointerdown',onDown,true);
  draw();
  return {node:box,dispose(){window.removeEventListener('paste',onPaste);window.removeEventListener('keydown',onKey,true);window.removeEventListener('pointerdown',onDown,true);}};
}

export function avatarTrigger(bot,onOpen,size=64,live=true){
  const anchor=el('div','','bt-avatar-anchor');
  const trigger=el('button','','bt-avatar-trigger');
  trigger.type='button';trigger.title='更换头像';trigger.setAttribute('aria-label','更换头像');trigger.setAttribute('aria-expanded','false');
  trigger.append(mark(lookOf(bot),size,live));
  const pencil=el('span','','bt-avatar-pencil');pencil.setAttribute('aria-hidden','true');pencil.append(icon('PencilIcon'));
  trigger.append(pencil);
  trigger.onclick=()=>onOpen(anchor,trigger);
  anchor.append(trigger);
  return anchor;
}
