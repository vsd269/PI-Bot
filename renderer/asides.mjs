import {el,icon} from './dom.mjs';
import {markdown} from './markdown.mjs';
export function renderAside(record,{act,onError}){
  const card=el('section','','pi-view-card pi-btw-card');card.dataset.btwId=record.id;card.setAttribute('aria-label','临时侧问');
  const head=el('header','','pi-view-head'),close=el('button','','bt-q-x');close.type='button';close.setAttribute('aria-label','关闭侧问');close.append(icon('CloseIcon'));
  const action=async(button,kind)=>{button.disabled=true;try{await act({id:record.id,action:kind});}catch(error){onError(error);}finally{button.disabled=false;}};
  close.onclick=()=>action(close,'dismiss');head.append(el('strong','临时侧问 · /btw'),close);card.append(head,el('p',record.question,'pi-view-text'));
  if(record.answer){const text=el('div','','pi-btw-answer');text.append(markdown(record.answer));card.append(text);}
  const status=el('p',({answering:'正在回答… 主任务继续运行',answered:'已回答 · 不写入主对话上下文',cancelled:'已取消',error:record.error||'回答失败'})[record.status],'pi-view-status');status.setAttribute('role','status');card.append(status);
  if(record.status==='answering'){const cancel=el('button','取消回答','bt-soft bt-soft-sm');cancel.type='button';cancel.onclick=()=>action(cancel,'cancel');card.append(cancel);}
  return card;
}
