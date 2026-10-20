import {el} from './dom.mjs';

// Construct nodes directly: model output never becomes executable HTML.
export function markdown(text,plain=value=>document.createTextNode(value),openFile){
  const root=el('div'),lines=String(text??'').split('\n');
  function inline(target,value){
    const pattern=/`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^\s)]+)\)|~~([^~\n]+)~~|\*([^*\n]+)\*/g;let last=0;
    for(const match of value.matchAll(pattern)){
      target.append(plain(value.slice(last,match.index)));
      if(match[1])target.append(el('code',match[1]));
      else if(match[2]){const strong=el('strong');strong.append(plain(match[2]));target.append(strong);}
      else if(match[5]||match[6]){const node=el(match[5]?'del':'em');node.append(plain(match[5]||match[6]));target.append(node);}
      else if(/^https?:\/\//i.test(match[4])){const a=el('a',match[3]);a.href=match[4];a.target='_blank';a.rel='noopener noreferrer';target.append(a);}
      else if(openFile&&!/^[a-z][\w+.-]*:/i.test(match[4])){const b=el('button',match[3],'pi-file-link');b.type='button';b.title=match[4];b.onclick=()=>openFile(match[4]);target.append(b);}
      else target.append(plain(match[0]));
      last=match.index+match[0].length;
    }
    target.append(plain(value.slice(last)));
  }
  let index=0;
  while(index<lines.length){
    const line=lines[index];
    if(/^\s*```/.test(line)){const code=[];index++;while(index<lines.length&&!/^\s*```/.test(lines[index]))code.push(lines[index++]);index++;const pre=el('pre'),block=el('div','','markdown-code'),copy=el('button','复制代码','soft-button');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.join('\n'));copy.textContent='已复制';}catch{copy.textContent='复制失败';}};pre.append(el('code',code.join('\n')));block.append(copy,pre);root.append(block);continue;}
    if(!line.trim()){index++;continue;}
    const heading=/^(#{1,6})\s+(.+)$/.exec(line);
    if(heading){const node=el('h'+heading[1].length);inline(node,heading[2]);root.append(node);index++;continue;}
    const listItem=/^\s*(?:[-*]|\d+[.)])\s+/;
    if(listItem.test(line)){const ordered=/^\s*\d+/.test(line),list=el(ordered?'ol':'ul');if(ordered)list.start=Number(line.match(/\d+/)[0]);while(index<lines.length&&listItem.test(lines[index])&&/^\s*\d+/.test(lines[index])===ordered){const li=el('li'),value=lines[index++].replace(listItem,''),task=/^\[([ xX])\]\s+/.exec(value);if(task){const cb=el('input');cb.type='checkbox';cb.disabled=true;cb.checked=task[1]!==' ';li.append(cb);inline(li,value.slice(task[0].length));}else inline(li,value);list.append(li);}root.append(list);continue;}
    if(line.includes('|')&&index+1<lines.length&&/^\s*\|?\s*:?-{3,}/.test(lines[index+1])){const table=el('table','','feature-table'),cells=l=>l.replace(/^\s*\||\|\s*$/g,'').split('|');const header=el('tr');for(const value of cells(line)){const th=el('th');inline(th,value.trim());header.append(th);}table.append(header);index+=2;let count=0;while(index<lines.length&&lines[index].includes('|')&&count++<100){const tr=el('tr');for(const value of cells(lines[index++])){const td=el('td');inline(td,value.trim());tr.append(td);}table.append(tr);}root.append(table);continue;}
    const quote=/^>\s?/.test(line),paragraph=el(quote?'blockquote':'div','','message-paragraph'),parts=[];
    while(index<lines.length&&lines[index].trim()&&!/^\s*```|^#{1,6}\s|^\s*(?:[-*]|\d+[.)])\s+/.test(lines[index])){
      if((/^>\s?/.test(lines[index]))!==quote)break;parts.push(lines[index++].replace(quote?/^>\s?/:/^$/,''));
    }
    inline(paragraph,parts.join('\n'));root.append(paragraph);
  }
  return root;
}
