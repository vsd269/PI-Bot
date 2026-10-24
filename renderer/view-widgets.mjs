import {el} from './dom.mjs';
import {resolve,asText,choiceValue} from './upstream/views.mjs';
const palette=['#4d6bfe','#ee9347','#38a879','#a376da','#479ccc','#dd799c','#c3a12c','#29a6ad'];
const svgNode=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
function download(name,text,type){const a=el('a');a.download=name;a.href=URL.createObjectURL(new Blob([text],{type}));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
const csv=value=>'"'+(typeof value==='number'?String(value):String(value).replace(/^[\s\uFEFF]*[=+@-]/,"'$&")).replaceAll('"','""')+'"';
export function chart(node,lookup){
  const box=el('figure','','pi-chart'),series=node.series.map(s=>({...s,values:s.values.map(v=>Number(resolve(v,lookup,0))||0)}));box.style.margin='0';
  const categories=node.categories.map(String),kind=node.kind||'bar',width=600,height=280,pad=50;
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':node.caption||'数据图表'});const title=svgNode('title');title.textContent=node.caption||'数据图表';svg.append(title);
  const titleFor=(shape,text)=>{const t=svgNode('title');t.textContent=text;shape.append(t);return shape;};
  const values=series.flatMap(s=>s.values),low=Math.min(0,...values),high=Math.max(0,...values),range=high-low||1;
  const y=v=>height-pad-(v-low)/range*(height-pad*2),x=i=>pad+(i+.5)*(width-2*pad)/categories.length;
  const text=(label,x,y,attrs={})=>{const t=svgNode('text',{x,y,fill:'var(--bt-ink-2)','font-size':11,...attrs});t.textContent=label;return t;};
  const line=(x1,y1,x2,y2)=>svgNode('line',{x1,y1,x2,y2,stroke:'var(--bt-line-2)'});
  if(kind==='donut'){
    const vals=series[0].values.map(v=>Math.max(0,v)),total=vals.reduce((a,b)=>a+b,0);let angle=-Math.PI/2;
    if(total===0)svg.append(text('暂无正值数据',300,140,{'text-anchor':'middle'}));
    vals.forEach((v,i)=>{if(!v)return;const next=angle+v/total*Math.PI*2,cx=300,cy=130,r=96,inner=58;let path;
      if(v===total){path=svgNode('circle',{cx,cy,r:77,fill:'none',stroke:palette[i%palette.length],'stroke-width':38});}
      else {const point=(a,r)=>`${cx+Math.cos(a)*r} ${cy+Math.sin(a)*r}`,large=next-angle>Math.PI?1:0;path=svgNode('path',{d:`M ${point(angle,r)} A ${r} ${r} 0 ${large} 1 ${point(next,r)} L ${point(next,inner)} A ${inner} ${inner} 0 ${large} 0 ${point(angle,inner)} Z`,fill:palette[i%palette.length]});}
      svg.append(titleFor(path,`${categories[i]}：${v} ${node.unit||''}`));angle=next;
    });
  }else if(kind==='hbar'){
    const labelWidth=120,plot=width-labelWidth-pad,row=(height-30)/categories.length,baseline=labelWidth+(0-low)/range*plot;
    categories.forEach((label,i)=>{svg.append(text(label.slice(0,12),labelWidth-8,15+i*row+row/2,{'text-anchor':'end'}));series.forEach((s,j)=>{const end=labelWidth+(s.values[i]-low)/range*plot,h=Math.max(1,row*.65/series.length),rect=svgNode('rect',{x:Math.min(end,baseline),y:15+i*row+j*h,width:Math.abs(end-baseline),height:h-1,rx:2,fill:palette[j%palette.length]});svg.append(titleFor(rect,`${label} · ${s.name||'数值'}：${s.values[i]} ${node.unit||''}`));});});
  }else{
    for(let i=0;i<=4;i++){const v=low+range*i/4,at=y(v);svg.append(line(pad,at,width-pad,at),text(asText(Number(v.toPrecision(4))),pad-8,at+4,{'text-anchor':'end'}));}
    categories.forEach((label,i)=>{if(categories.length<=12||i%Math.ceil(categories.length/12)===0)svg.append(text(label.slice(0,9),x(i),height-24,{'text-anchor':'middle'}));});
    series.forEach((s,j)=>{
      const color=palette[j%palette.length];
      if(kind==='bar'){const w=(width-pad*2)/categories.length*.72/series.length;s.values.forEach((v,i)=>{const r=svgNode('rect',{x:x(i)-w*series.length/2+j*w,y:Math.min(y(0),y(v)),width:Math.max(1,w-2),height:Math.abs(y(v)-y(0)),rx:2,fill:color});svg.append(titleFor(r,`${categories[i]} · ${s.name||'数值'}：${v} ${node.unit||''}`));});}
      else{const points=s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');if(kind==='area')svg.append(svgNode('polygon',{points:`${x(0)},${y(0)} ${points} ${x(categories.length-1)},${y(0)}`,fill:color,opacity:.16}));svg.append(svgNode('polyline',{points,fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round'}));s.values.forEach((v,i)=>svg.append(titleFor(svgNode('circle',{cx:x(i),cy:y(v),r:4,fill:color}),`${categories[i]} · ${s.name||'数值'}：${v} ${node.unit||''}`)));}
    });
  }
  box.append(svg);const legend=el('div','','pi-chart-legend');(kind==='donut'?categories:series.map((s,i)=>s.name||'数列 '+(i+1))).forEach((label,i)=>{const item=el('span'),dot=el('i');dot.style.background=palette[i%palette.length];item.append(dot,document.createTextNode(label));legend.append(item);});box.append(legend);
  if(node.caption)box.append(el('figcaption',node.caption));
  const details=el('details'),summary=el('summary','查看数据表'),table=el('table','','pi-view-table'),header=el('tr');header.append(el('th','项目'));series.forEach((s,i)=>header.append(el('th',s.name||'数列 '+(i+1))));table.append(header);categories.forEach((label,i)=>{const row=el('tr');row.append(el('th',label));series.forEach(s=>row.append(el('td',asText(s.values[i])+(node.unit||''))));table.append(row);});details.append(summary,table);box.append(details);
  const actions=el('div','','bt-actions'),exportData=el('button','导出 CSV','bt-soft bt-soft-sm'),exportSvg=el('button','保存图表','bt-soft bt-soft-sm');exportData.type=exportSvg.type='button';exportData.onclick=()=>download('PI-Bot-chart.csv','\ufeff'+[['项目',...series.map((s,i)=>s.name||'数列 '+(i+1))],...categories.map((c,i)=>[c,...series.map(s=>s.values[i])])].map(r=>r.map(csv).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  exportSvg.onclick=()=>{const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');for(const node of copy.querySelectorAll('[fill],[stroke]'))for(const attr of ['fill','stroke'])if(node.getAttribute(attr)?.startsWith('var('))node.setAttribute(attr,node.getAttribute(attr).includes('ink')?'#555555':'#dddddd');download('PI-Bot-chart.svg',new XMLSerializer().serializeToString(copy),'image/svg+xml');};actions.append(exportData,exportSvg);box.append(actions);return box;
}
export function inputWidget(node,values,{disabled,onInput}){
  const label=el('label','','pi-view-control'),caption=el('span',node.label),output=el('output');let input;
  if(node.type==='choice'){input=el('select');node.options.forEach((option,i)=>{const o=el('option',option.label);o.value=String(i);if(choiceValue(option)===values[node.id])o.selected=true;input.append(o);});}
  else{input=el('input');input.type=node.type==='toggle'?'checkbox':node.type==='slider'?'range':'number';if(node.type==='toggle')input.checked=values[node.id];else{input.value=values[node.id];for(const key of ['min','max','step'])if(node[key]!==undefined)input[key]=String(node[key]);}}
  input.name=node.id;input.setAttribute('aria-label',node.label);input.disabled=disabled;input.dataset.viewAction=node.id;
  const paint=()=>output.textContent=asText(values[node.id])+(node.unit?' '+node.unit:'');paint();
  const change=()=>{const value=node.type==='choice'?choiceValue(node.options[Number(input.value)]):node.type==='toggle'?input.checked:input.valueAsNumber;if(typeof value==='number'&&!Number.isFinite(value))return;values[node.id]=value;paint();onInput();};
  input.addEventListener(node.type==='choice'||node.type==='toggle'?'change':'input',change);label.append(caption,input,output);return label;
}
export const FRAME_POLICY="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
export function htmlWidget(node,host){
  const frame=el('iframe','','pi-view-frame');frame.title=node.summary;frame.setAttribute('sandbox','');frame.referrerPolicy='no-referrer';frame.style.height=Math.max(24,Math.min(node.height||200,1200))+'px';
  const colors=getComputedStyle(host),ink=colors.getPropertyValue('--bt-ink').trim(),bg=colors.getPropertyValue('--bt-main').trim();
  const safe=value=>value.replace(/[<>{};]/g,'');
  // Static HTML only in PI: formulas and native controls provide interactivity.
  // Remove navigation and embedded documents before creating the sandbox.
  const doc=new DOMParser().parseFromString(node.html,'text/html');
  for(const n of doc.querySelectorAll('script,iframe,frame,object,embed,meta,base,link,form,foreignObject,animate,set'))n.remove();
  for(const n of doc.querySelectorAll('*'))for(const attr of [...n.attributes])if(/^on/i.test(attr.name)||['href','xlink:href','action','formaction','srcdoc','target','srcset','ping'].includes(attr.name.toLowerCase())||attr.name.toLowerCase()==='src'&&!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(attr.value))n.removeAttribute(attr.name);
  frame.srcdoc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+FRAME_POLICY+'"><style>html,body{margin:0;padding:8px;box-sizing:border-box;background:'+safe(bg)+';color:'+safe(ink)+';font:14px/1.6 system-ui}*{box-sizing:border-box}img,svg,canvas{max-width:100%}</style></head><body>'+doc.body.innerHTML+'</body></html>';
  return frame;
}
