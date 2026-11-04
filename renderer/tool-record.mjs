import {el,icon} from './dom.mjs';

const names={bash:'执行命令',shell:'执行命令',powershell:'执行命令',exec_command:'执行命令',read:'读取文件',read_file:'读取文件',write:'写入文件',write_file:'写入文件',edit:'编辑文件',edit_file:'编辑文件',apply_patch:'修改文件',glob:'查找文件',grep:'搜索内容',web_search:'搜索网页',web_fetch:'读取网页'};
const failed=new Set(['error','failed','failure','rejected']),done=new Set(['completed','success','done']),running=new Set(['running','pending','launching','started']);
const clip=value=>String(value??'').slice(0,16000);
function decode(value){for(let i=0;i<4&&typeof value==='string';i++){try{const parsed=JSON.parse(value);if(parsed===value)break;value=parsed;}catch{break;}}return value;}

// Decode saved tool envelopes for display only. Never interpret output as HTML
// or execute commands, and keep the original saved record available on demand.
export function describeTool(event){
  const raw=typeof event.detail==='string'?event.detail:JSON.stringify(event.detail??''),root=decode(raw),parts=[],paths=new Set();let exitCode,hasError=false,budget=100;
  const add=(label,value)=>{const text=clip(value).trim();if(text&&!parts.some(p=>p.label===label&&p.text===text))parts.push({label,text});};
  function visit(value,depth=0){
    if(depth>6||budget--<=0)return;value=decode(value);
    if(typeof value==='string'){add('输出',value);return;}
    if(Array.isArray(value)){for(const item of value.slice(0,30))visit(item,depth+1);return;}
    if(!value||typeof value!=='object')return;
    if(value.isError===true||value.ok===false||value.success===false)hasError=true;
    if(typeof value.exitCode==='number'){exitCode=value.exitCode;if(exitCode!==0)hasError=true;}
    if(typeof value.path==='string')paths.add(value.path);
    let recognized=false;
    for(const [field,label]of [['stdout','输出'],['stderr','错误／警告'],['error','错误'],['message','说明']])if(typeof value[field]==='string'&&value[field].trim()){add(label,value[field]);recognized=true;if(field==='error')hasError=true;}
    for(const field of ['text','content','output','result','details'])if(value[field]!==undefined){visit(value[field],depth+1);recognized=true;}
    if(!recognized&&exitCode===undefined&&!value.path)add('返回数据',JSON.stringify(value,null,2));
  }
  visit(root);
  const status=hasError||failed.has(event.status)?'failed':done.has(event.status)?'completed':running.has(event.status)?'running':event.status==='aborted'||event.status==='cancelled'?'cancelled':'unknown';
  const label={failed:'失败',completed:'已完成',running:'进行中',cancelled:'已停止',unknown:'状态未确认'}[status];
  const name=String(event.name||'工具'),title=names[name.toLowerCase()]||name;
  const summary=[...paths].slice(0,1).concat(exitCode!==undefined?['退出码 '+exitCode]:[]).join(' · ')||parts[0]?.text.split(/\r?\n/).find(s=>s.trim())||'暂无输出';
  return {name,title,status,label,summary:summary.slice(0,160),parts,raw,paths:[...paths],exitCode};
}

export function toolRecord(line,expanded){
  const tools=el('details','','thinking-block pi-tool-record');tools.dataset.key=line.id+':tools';tools.open=expanded.has(tools.dataset.key);
  tools.append(el('summary','工具记录 · '+line.toolEvents.length));
  const list=el('div','','pi-tool-list');
  for(const [index,event]of line.toolEvents.entries()){
    const info=describeTool(event),entry=el('details','','pi-tool-step'),summary=el('summary'),body=el('div','','pi-tool-body');
    entry.dataset.key=line.id+':tool:'+index;entry.dataset.status=info.status;entry.open=expanded.has(entry.dataset.key);
    const state=el('span',info.label,'pi-tool-state');summary.append(icon('ChevronRightIcon'),el('span',info.title,'pi-tool-title'),el('span',info.summary,'pi-tool-preview'),state);summary.title=info.title+' · '+info.label+' · '+info.summary;
    body.append(el('div','工具：'+info.name,'pi-tool-name'));
    if(info.parts.length)for(const part of info.parts){const section=el('section');section.append(el('div',part.label,'pi-tool-label'),el('pre',part.text));body.append(section);}
    else body.append(el('p',info.status==='running'?'正在等待工具返回。':'没有保存可显示的输出。'));
    const raw=el('details','','pi-tool-raw');raw.dataset.key=entry.dataset.key+':raw';raw.append(el('summary','原始记录'));let loaded=false;const loadRaw=()=>{if(raw.open&&!loaded){loaded=true;raw.append(el('pre',info.raw));}};raw.addEventListener('toggle',loadRaw);raw.open=expanded.has(raw.dataset.key);loadRaw();body.append(raw);
    entry.append(summary,body);list.append(entry);
  }
  tools.append(list);return tools;
}
