import {icons} from './upstream/icons-static.mjs';
// Additional original menu icons from the pinned upstream icons.mjs source.
const lineIcon=paths=>({tag:'svg',props:{width:20,height:20,viewBox:'0 0 20 20',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},children:paths.map(d=>({tag:'path',props:{d}}))});
const menuIcons={
  // Same cloud and arrow geometry as the pinned upstream CloudDownloadIcon.
  CloudDownloadIcon:lineIcon(['M6.5 15.25H5.75a3.25 3.25 0 0 1-.55-6.45 4.75 4.75 0 0 1 9.2-1.1 3.75 3.75 0 0 1 .1 7.55H13.5','M10 9.75v7','M7.75 14.5L10 16.75l2.25-2.25']),
  SidebarIcon:lineIcon(['M5.5 4h9A2.5 2.5 0 0 1 17 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 13.5v-7A2.5 2.5 0 0 1 5.5 4Z','M8 4v12']),
  SidePanelIcon:lineIcon(['M5 3.75h10A1.25 1.25 0 0 1 16.25 5v10A1.25 1.25 0 0 1 15 16.25H5A1.25 1.25 0 0 1 3.75 15V5A1.25 1.25 0 0 1 5 3.75Z','M12.25 3.75v12.5']),
  EyeIcon:lineIcon(['M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z','M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z']),
  EyeOffIcon:lineIcon(['M3 3l14 14','M8.6 5.2A8.2 8.2 0 0 1 10 5c4.7 0 7.5 5 7.5 5a12 12 0 0 1-2 2.6','M12.2 14.5A7.1 7.1 0 0 1 10 15c-4.7 0-7.5-5-7.5-5a12 12 0 0 1 3-3.4']),
  QwenIcon:{tag:'svg',props:{width:20,height:20,viewBox:'0 0 20 20','aria-hidden':true},children:[{tag:'circle',props:{cx:9,cy:9,r:5.5,fill:'none',stroke:'currentColor','stroke-width':2}},{tag:'path',props:{d:'M12.7 12.7 17 17',fill:'none',stroke:'currentColor','stroke-width':2,'stroke-linecap':'round'}},{tag:'circle',props:{cx:9,cy:9,r:1.5,fill:'currentColor'}}]},
  VolcengineIcon:{tag:'svg',props:{width:20,height:20,viewBox:'0 0 20 20','aria-hidden':true},children:[{tag:'path',props:{d:'M10 2c1.3 3.1 4.6 4.2 4.6 7.8A4.6 4.6 0 1 1 6 6.5c.8 1.2 1.8 1.7 2.7 2.1C8.5 6.1 9.4 4.3 10 2Z',fill:'currentColor'}},{tag:'path',props:{d:'M10 8.2c.8 1.1 2.1 1.8 2.1 3.4a2.1 2.1 0 1 1-4.2 0c0-.9.8-1.8 2.1-3.4Z',fill:'var(--bt-card)'}}]},
  OpenAIIcon:{tag:'svg',props:{width:20,height:20,viewBox:'0 0 20 20','aria-hidden':true},children:[{tag:'path',props:{d:'M10 3.1a3.1 3.1 0 0 1 5.4 2.1 3.1 3.1 0 0 1 1.2 5.9 3.1 3.1 0 0 1-3.2 4.9 3.1 3.1 0 0 1-5.4-2.1 3.1 3.1 0 0 1-1.2-5.9A3.1 3.1 0 0 1 10 3.1Z',fill:'none',stroke:'currentColor','stroke-width':1.6}},{tag:'path',props:{d:'m7.7 8.2 4.6 2.6m-4.6 1 4.6-2.6m-2.3-4.1v5.3m2.3 4.1V9.2',fill:'none',stroke:'currentColor','stroke-width':1.3,'stroke-linecap':'round'}}]},
  WhisperIcon:{tag:'svg',props:{width:20,height:20,viewBox:'0 0 20 20','aria-hidden':true},children:[{tag:'path',props:{d:'M3 10h1.5m2-3v6m2-8v10m2-7v4m2-6v8m2-5v2m2-1h1.5',fill:'none',stroke:'currentColor','stroke-width':1.8,'stroke-linecap':'round'}}]},
  CustomApiIcon:{tag:'svg',props:{width:20,height:20,viewBox:'0 0 20 20','aria-hidden':true},children:[{tag:'path',props:{d:'M4 5h12M4 10h12M4 15h12',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round'}},{tag:'circle',props:{cx:8,cy:5,r:1.8,fill:'currentColor'}},{tag:'circle',props:{cx:13,cy:10,r:1.8,fill:'currentColor'}},{tag:'circle',props:{cx:7,cy:15,r:1.8,fill:'currentColor'}}]},
  GithubIcon:{tag:'svg',props:{width:20,height:20,viewBox:'0 0 16 16',fill:'currentColor','aria-hidden':true},children:[{tag:'path',props:{d:'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z'}}]},
  VoiceIcon:lineIcon(['M3 8v4M6.5 5v10M10 2v16M13.5 5v10M17 8v4']),
  InfoIcon:lineIcon(['M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z','M10 9v5M10 6h.01']),
  KeyIcon:lineIcon(['M8.5 11.5a4 4 0 1 1 0-5.7 4 4 0 0 1 0 5.7Z','M8.5 11.5L15 18l2-2-2-2 1.5-1.5-2-2-1.5 1.5']),
  PlugIcon:lineIcon(['M7 2v4M13 2v4M5 6h10v2a5 5 0 0 1-10 0Z','M10 13v5']),
  SlidersIcon:lineIcon(['M3 6h3M10 6h7M3 14h7M14 14h3','M6 3v6M10 3v6M10 11v6M14 11v6']),
  FeedbackIcon:lineIcon(['M4 4.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z','M10 7v2.6M10 11.4h.01']),
  MicIcon:lineIcon(['M7 5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0Z','M4 9v1a6 6 0 0 0 12 0V9','M10 16v3M7 19h6']),
  GlobeIcon:lineIcon(['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z','M3 10h14','M10 3c2 2.2 2.9 4.5 2.9 7S12 14.8 10 17c-2-2.2-2.9-4.5-2.9-7S8 5.2 10 3z']),
  MemoryIcon:lineIcon(['M5 3h10v14H5Z','M8 6h4M8 9h4M8 12h2']),
  ArrowDownIcon:lineIcon(['M10 4v12','M5 11l5 5 5-5']),
  PinIcon:lineIcon(['M12.5 3l4.5 4.5-3 1.5-2.5 2.5.5 3.5-1.5 1.5L7 13 3.5 16.5','M7 13l-3.5-3.5L5 8l3.5.5L11 6l1.5-3']),
  UnreadIcon:lineIcon(['M10 3.5a4.5 4.5 0 0 0-4.5 4.5v3L4 13.5h12L14.5 11V8','M8.3 16a1.8 1.8 0 0 0 3.4 0','M15.5 3.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z']),
  StarLineIcon:lineIcon(['M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z']),
  HideIcon:lineIcon(['M3 3l14 14','M8.6 5.2A7.6 7.6 0 0 1 10 5c4.5 0 7 5 7 5a12.6 12.6 0 0 1-2 2.6M12.2 14.5A6.8 6.8 0 0 1 10 15c-4.5 0-7-5-7-5a12.4 12.4 0 0 1 3-3.4','M8.5 8.5a2 2 0 0 0 3 3'])
};
export function el(tag,content='',className=''){const node=document.createElement(tag);node.textContent=content;node.className=className;return node;}
export function icon(name){
  const make=({tag,props={},children=[]})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(props))if(key!=='key')node.setAttribute(['viewBox','preserveAspectRatio'].includes(key)?key:key.replace(/[A-Z]/g,x=>'-'+x.toLowerCase()),String(value));for(const child of children.flat())if(child&&typeof child==='object')node.append(make(child));return node;};
  const node=make(icons[name]||menuIcons[name]);if(name==='GlobeIcon'){node.setAttribute('width','16');node.setAttribute('height','16');}return node;
}
