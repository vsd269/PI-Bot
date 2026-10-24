import {el,icon} from './dom.mjs';
import {checkShownView,viewInputs,inputDefault,viewScope,resolve,asText} from './upstream/views.mjs';
import {chart,inputWidget,htmlWidget} from './view-widgets.mjs';
const esc=value=>String(value??'');
export function createViews({app,getViews,answer,nameOf,onError}){
  const drafts=new Map(),sending=new Set();let closed=false;
  const draftOf=id=>{if(!drafts.has(id))drafts.set(id,{selected:[],fields:{}});return drafts.get(id);};
  const paintBusy=()=>{if(!closed)for(const card of app.querySelectorAll('[data-view-id]'))card.updateBusy?.();};
  async function submit(record,action,values,dismissed=false){if(sending.has(record.id))return;sending.add(record.id);paintBusy();try{const inputs=drafts.get(record.id+':inputs');if(inputs&&viewInputs(record.view).length)values={...values,inputs:Object.fromEntries(viewInputs(record.view).map(input=>[input.id,inputs[input.id]]))};await answer({id:record.id,action,values,...(dismissed?{dismissed:true}:{})});for(const key of drafts.keys())if(key.startsWith(record.id+':'))drafts.delete(key);}catch(error){onError(error);}finally{sending.delete(record.id);paintBusy();}}
  function render(record){
    const checked=checkShownView(record.title,record.view);if(checked.error)return el('div','卡片无法显示：'+checked.error,'message-error');
    const settled=record.status!=='pending',form=el('section','','bt-q pi-view-card'+(settled?' bt-q-settled':''));form.dataset.viewId=record.id;form.setAttribute('aria-label',record.title);
    const head=el('header','','pi-view-head');head.append(el('strong',nameOf(record.botId)+' · '+record.title));if(!settled){const close=el('button','','bt-q-x');close.type='button';close.setAttribute('aria-label','跳过卡片');close.append(icon('CloseIcon'));close.onclick=()=>submit(record,'',{},true);head.append(close);}form.append(head);
    const values=draftOf(record.id+':inputs');for(const input of viewInputs(record.view))if(!Object.hasOwn(values,input.id))values[input.id]=inputDefault(input);if(settled&&record.values?.inputs)Object.assign(values,record.values.inputs);const updates=[];const lookup=()=>viewScope(record.view,values);const val=value=>resolve(value,lookup(),'');const refresh=()=>updates.forEach(update=>update());const bind=(box,update)=>{updates.push(update);update();return box;};
    const setBusy=()=>{form.setAttribute('aria-busy',String(sending.has(record.id)));for(const button of form.querySelectorAll('button'))button.disabled=sending.has(record.id);for(const input of form.querySelectorAll('input,select'))input.disabled=(input.dataset.localInput==='true'?settled&&checked.interactive:settled)||sending.has(record.id);};form.updateBusy=setBusy;
    function node(value){
      if(value.type==='stack'||value.type==='row'){const stack=el('div','',value.type==='row'?'pi-view-row':'pi-view-stack');for(const child of value.children)stack.append(node(child));return stack;}
      if(value.type==='text'||value.type==='callout'){const text=el('p','',value.type==='callout'?'pi-view-callout':'pi-view-text');return bind(text,()=>{text.textContent=asText(val(value.text));text.dataset.tone=asText(val(value.tone));});}
      if(['slider','number','choice','toggle'].includes(value.type)){const control=inputWidget(value,values,{disabled:settled&&checked.interactive||sending.has(record.id),onInput:refresh});control.querySelector('input,select').dataset.localInput='true';return control;}
      if(value.type==='chart'){const box=el('div');return bind(box,()=>box.replaceChildren(chart(value,lookup())));}
      if(value.type==='html')return htmlWidget(value,app);
      if(value.type==='sources'){const list=el('ul','','pi-view-sources');for(const item of value.items){const a=el('a',item.label),li=el('li');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li);}return list;}
      if(value.type==='submit')return submitButton(value.label||'提交',()=>submit(record,value.id,{inputs:{...Object.fromEntries(viewInputs(record.view).map(input=>[input.id,values[input.id]]))}}));
      if(value.type==='metric'){const box=el('div','','pi-view-metric'),metric=el('strong');box.append(el('span',value.label),metric);if(value.caption)box.append(el('small',value.caption));return bind(box,()=>{metric.textContent=asText(val(value.value));box.className='pi-view-metric pi-view-'+asText(val(value.tone));});}
      if(value.type==='progress'){const box=el('div','','pi-view-progress'),track=el('div','','pi-view-track'),bar=el('span','','pi-view-bar'),label=el('small');if(value.label)box.append(el('span',value.label));track.append(bar);box.append(track,label);return bind(box,()=>{const percent=value.percent!==undefined?Number(val(value.percent)):Number(val(value.value))/Number(val(value.max))*100;const n=Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):0;bar.style.width=n+'%';label.textContent=value.valueLabel!==undefined?asText(val(value.valueLabel)):asText(Number(n.toFixed(1)))+'%';});}
      if(value.type==='table'){const scroll=el('div','','pi-view-table-scroll');return bind(scroll,()=>{const table=el('table','','pi-view-table'),head=el('tr');for(const column of value.columns)head.append(el('th',column.label));const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');for(const cells of value.rows){const tr=el('tr');for(const [index,column] of value.columns.entries())tr.append(el('td',asText(val(cells[index]??''))));tbody.append(tr);}table.append(tbody);scroll.replaceChildren(table);});}
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
