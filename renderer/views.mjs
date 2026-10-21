import {el,icon} from './dom.mjs';
import {checkShownView} from './upstream/views.mjs';
const esc=value=>String(value??'');
export function createViews({app,getViews,answer,nameOf,onError}){
  const drafts=new Map(),sending=new Set();let closed=false;
  const draftOf=id=>{if(!drafts.has(id))drafts.set(id,{selected:[],fields:{}});return drafts.get(id);};
  const paintBusy=()=>{if(!closed)for(const card of app.querySelectorAll('[data-view-id]'))card.updateBusy?.();};
  async function submit(record,action,values,dismissed=false){if(sending.has(record.id))return;sending.add(record.id);paintBusy();try{await answer({id:record.id,action,values,...(dismissed?{dismissed:true}:{})});for(const key of drafts.keys())if(key.startsWith(record.id+':'))drafts.delete(key);}catch(error){onError(error);}finally{sending.delete(record.id);paintBusy();}}
  function render(record){
    const checked=checkShownView(record.title,record.view);if(checked.error)return el('div','卡片无法显示：'+checked.error,'message-error');
    const settled=record.status!=='pending',form=el('section','','bt-q pi-view-card'+(settled?' bt-q-settled':''));form.dataset.viewId=record.id;form.setAttribute('aria-label',record.title);
    const head=el('header','','pi-view-head');head.append(el('strong',nameOf(record.botId)+' · '+record.title));if(!settled){const close=el('button','','bt-q-x');close.type='button';close.setAttribute('aria-label','跳过卡片');close.append(icon('CloseIcon'));close.onclick=()=>submit(record,'',{},true);head.append(close);}form.append(head);
    const setBusy=()=>{form.setAttribute('aria-busy',String(sending.has(record.id)));for(const button of form.querySelectorAll('button'))button.disabled=sending.has(record.id);for(const input of form.querySelectorAll('input'))input.disabled=settled||sending.has(record.id);};form.updateBusy=setBusy;
    function node(value){
      if(value.type==='stack'){const stack=el('div','','pi-view-stack');for(const child of value.children)stack.append(node(child));return stack;}
      if(value.type==='text')return el('p',value.text,'pi-view-text');
      if(value.type==='metric'){const box=el('div','',`pi-view-metric${value.tone?' pi-view-'+value.tone:''}`);box.append(el('span',value.label),el('strong',esc(value.value)));return box;}
      if(value.type==='progress'){const box=el('div','','pi-view-progress');if(value.label)box.append(el('span',value.label));const track=el('div','','pi-view-track'),bar=el('span','','pi-view-bar');bar.style.width=value.percent+'%';track.append(bar);box.append(track,el('small',value.percent+'%'));return box;}
      if(value.type==='table'){const table=el('table','','pi-view-table'),head=el('tr');for(const column of value.columns)head.append(el('th',column.label));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');for(const cells of value.rows){const tr=el('tr');for(const [index,column] of value.columns.entries())tr.append(el('td',typeof cells[index]==='object'?JSON.stringify(cells[index]):cells[index]??''));tbody.append(tr);}table.append(tbody);const scroll=el('div','','pi-view-table-scroll');scroll.append(table);return scroll;}
      if(value.type==='options')return options(value);
      if(value.type==='confirm')return confirm(value);
      if(value.type==='form')return fields(value);
      return el('span');
    }
    function submitButton(label,run){const button=el('button',label,'bt-q-submit');button.type='button';button.onclick=()=>{run();setBusy();};return button;}
    function options(value){
      const draft=draftOf(record.id+':'+value.id);if(settled)draft.selected=record.action===value.id?record.values?.selected||[]:[];
      const box=el('fieldset','','pi-view-options');box.append(el('legend',value.multi?'可多选':'请选择一项'));
      for(const option of value.options){const label=el('label','','pi-view-option'),input=el('input');input.type=value.multi?'checkbox':'radio';input.name=record.id+'-'+value.id;input.dataset.viewAction=value.id;input.value=option.label;input.checked=draft.selected.includes(option.label);input.disabled=settled||sending.has(record.id);input.onchange=()=>{draft.selected=value.multi?(input.checked?[...draft.selected,option.label]:draft.selected.filter(item=>item!==option.label)):[option.label];};const caption=el('span','','pi-view-option-label');caption.append(el('strong',option.label));if(option.description)caption.append(el('small',option.description));label.append(input,caption);box.append(label);}
      if(!settled){const button=submitButton(value.multi?'提交所选':'提交',()=>{if(!draft.selected.length){onError(new Error('请先选择卡片选项。'));return;}submit(record,value.id,{selected:draft.selected});});box.append(button);}
      return box;
    }
    function confirm(value){const box=el('div','','pi-view-confirm');if(!settled){box.append(submitButton(value.confirmLabel||'确认',()=>submit(record,value.id,{confirmed:true})),submitButton(value.cancelLabel||'取消',()=>submit(record,value.id,{confirmed:false})));}else if(record.status==='answered'&&record.action===value.id)box.append(el('small',record.values?.confirmed?'已确认':'已取消'));else box.hidden=true;return box;}
    function fields(value){const draft=draftOf(record.id+':'+value.id),box=el('form','','pi-view-form');for(const field of value.fields){const label=el('label','','pi-view-field');label.append(el('span',field.label));const input=el('input');input.type='text';input.maxLength=2000;input.name=field.id;input.dataset.viewAction=value.id;input.placeholder=field.placeholder||'';input.value=settled?(record.action===value.id?record.values?.fields?.[field.id]||'':''):draft.fields[field.id]||'';input.disabled=settled||sending.has(record.id);input.oninput=()=>{draft.fields[field.id]=input.value;};label.append(input);box.append(label);}if(!settled){const button=el('button',value.submitLabel||'提交','bt-q-submit');button.type='submit';box.append(button);}box.onsubmit=event=>{event.preventDefault();submit(record,value.id,{fields:{...draft.fields}});};return box;}
    form.append(node(record.view));
    if(settled){const label={answered:'已回答',dismissed:'已跳过',superseded:'已被新消息替代',interrupted:'已中断',displayed:'展示完成'}[record.status];form.append(el('div',label||record.status,'pi-view-status'));if(record.deliveryPending){form.append(el('div',record.deliveryError?'回答已保存，等待重试派发：'+record.deliveryError:'回答已保存，正在派发…','bt-q-detail'));const retry=submitButton('重试派发',()=>submit(record,record.action,record.values));form.append(retry);}}
    setBusy();return form;
  }
  return {render,close(){closed=true;drafts.clear();},get closed(){return closed;}};
}
