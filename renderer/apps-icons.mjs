// Lucide 0.539.0 geometry, as used by the reference Apps panel.
// ISC license and copyright: assets/icons/LICENSE-Lucide.txt.
const glyphs={
  SearchIcon:[['path',{d:'m21 21-4.34-4.34'}],['circle',{cx:11,cy:11,r:8}]],
  ConnectorIcon:[['path',{d:'M8 3v4'}],['path',{d:'M16 3v4'}],['path',{d:'M6 7h12v2a6 6 0 0 1-12 0V7Z'}],['path',{d:'M12 15v6'}]],
  ServerIcon:[['rect',{width:20,height:8,x:2,y:2,rx:2,ry:2}],['rect',{width:20,height:8,x:2,y:14,rx:2,ry:2}],['line',{x1:6,x2:6.01,y1:6,y2:6}],['line',{x1:6,x2:6.01,y1:18,y2:18}]],
  RefreshIcon:[['path',{d:'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'}],['path',{d:'M21 3v5h-5'}],['path',{d:'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'}],['path',{d:'M8 16H3v5'}]],
  CloseIcon:[['path',{d:'M18 6 6 18'}],['path',{d:'m6 6 12 12'}]],
  ChevronRightIcon:[['path',{d:'m9 18 6-6-6-6'}]],
  ChevronDownIcon:[['path',{d:'m6 9 6 6 6-6'}]],
  CheckIcon:[['path',{d:'M20 6 9 17l-5-5'}]]
};
export function appIcon(name){
  if(!glyphs[name])return null;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  for(const [key,value] of Object.entries({width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':true}))svg.setAttribute(key,String(value));
  for(const [tag,attrs] of glyphs[name]){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));svg.append(node);}
  return svg;
}
