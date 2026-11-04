import {el,icon} from './dom.mjs';
// CSV is data: prevent spreadsheet formula execution when exported/opened.
export function tableCsv(headers,rows){return [headers,...rows].map(row=>row.map(value=>'"'+String(value).replace(/^[\s\uFEFF]*[=+@-]/,value=>"'"+value).replaceAll('"','""')+'"').join(',')).join('\r\n');}
export function tableCells(line){
  const input=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,''),cells=[];let value='',ticks=0;
  for(let i=0;i<input.length;i++){const c=input[i];if(c==='\\'&&input[i+1]==='|'){value+='|';i++;continue;}if(c==='`'){let n=1;while(input[i+n]==='`')n++;ticks=ticks===n?0:ticks||n;value+='`'.repeat(n);i+=n-1;continue;}if(c==='|'&&!ticks){cells.push(value.trim());value='';}else value+=c;}
  cells.push(value.trim());return cells;
}
export function messageTable(headers,rows,inline){
  const card=el('section','','pi-message-table'),tools=el('div','','pi-table-tools'),searchBar=el('div','','pi-table-searchbar'),search=el('input'),count=el('span'),viewport=el('div','','pi-table-viewport'),feedback=el('span','','pi-table-feedback');
  card.setAttribute('aria-label','消息表格');search.type='search';search.placeholder='搜索表格';search.setAttribute('aria-label','搜索表格');count.setAttribute('role','status');feedback.setAttribute('role','status');searchBar.append(search,count);searchBar.hidden=rows.length<=8;
  let order=rows.map((_,i)=>i),sort=-1,descending=false;
  const csv=()=>tableCsv(headers,order.map(i=>rows[i]));
  function action(label,glyph,run){const b=el('button','','pi-table-action');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(glyph));b.onclick=run;tools.append(b);return b;}
  action('复制表格','CopyIcon',async()=>{try{await navigator.clipboard.writeText(csv());feedback.textContent='表格已复制';}catch{feedback.textContent='复制失败，请重试';}});
  action('下载表格','DownloadIcon',()=>{const url=URL.createObjectURL(new Blob(['\uFEFF',csv()],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='table.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  const expand=action('放大表格','ExpandIcon',()=>{
    const dialog=el('dialog','','pi-table-dialog'),head=el('header'),close=el('button','关闭','soft-button'),title=el('h2','表格'),large=messageTable(headers,order.map(i=>rows[i]),inline);large.querySelector('[aria-label="放大表格"]').remove();close.type='button';close.onclick=()=>dialog.close();head.append(title,close);dialog.append(head,large);card.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(expand.isConnected)expand.focus();});dialog.showModal();close.focus();
  });
  function paint(){
    const query=search.value.trim().toLocaleLowerCase();order=rows.map((_,i)=>i).filter(i=>rows[i].some(v=>String(v).toLocaleLowerCase().includes(query)));
    if(sort>=0)order.sort((a,b)=>(descending?-1:1)*String(rows[a][sort]||'').localeCompare(String(rows[b][sort]||''),undefined,{numeric:true}));
    count.textContent=order.length+' / '+rows.length+' 行 · '+headers.length+' 列';const table=el('table'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
    headers.forEach((value,i)=>{const th=el('th'),button=el('button');inline(button,value);button.type='button';button.title='按此列排序';button.onclick=()=>{descending=sort===i?!descending:false;sort=i;paint();};if(sort===i)th.setAttribute('aria-sort',descending?'descending':'ascending');th.append(button);tr.append(th);});thead.append(tr);
    for(const i of order){const tr=el('tr');for(let j=0;j<headers.length;j++){const td=el('td');inline(td,rows[i][j]||'');tr.append(td);}tbody.append(tr);}
    table.append(thead,tbody);viewport.replaceChildren(table);
  }
  search.oninput=paint;card.append(tools,searchBar,viewport,feedback);paint();return card;
}
