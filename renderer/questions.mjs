import {el,icon} from './dom.mjs';
export function createQuestions({app,getQuestions,answer,nameOf,onError}){
  const drafts=new Map(),sending=new Set();let closed=false;
  const optionsOf=q=>q.options||q.choices?.map(label=>({label}))||[];
  const stateOf=q=>{if(!drafts.has(q.id))drafts.set(q.id,{custom:'',selected:[]});return drafts.get(q.id);};
  async function submit(q,input){
    if(sending.has(q.id))return;sending.add(q.id);paintBusy(q.id,true);
    try{await answer({id:q.id,...input});drafts.delete(q.id);}catch(error){onError(error);}finally{sending.delete(q.id);if(!closed)paintBusy(q.id,false);}
  }
  function paintBusy(id,busy){for(const card of app.querySelectorAll('[data-question-id]'))if(card.dataset.questionId===id){card.setAttribute('aria-busy',String(busy));for(const button of card.querySelectorAll('button'))button.disabled=busy;card.update?.();}}
  function render(q){
    const settled=q.status!=='pending',options=optionsOf(q),draft=stateOf(q);
    const card=el('form','','bt-q question-card'+(settled?' bt-q-settled':''));card.dataset.questionId=q.id;
    card.setAttribute('aria-label',q.text);const head=el('div','','bt-q-head'),text=el('div','','bt-q-text');text.append(el('strong',nameOf(q.botId)+' 向你提问','bt-q-detail'),el('p',q.text,'bt-q-title'));if(q.detail)text.append(el('div',q.detail,'bt-q-detail'));head.append(text);card.append(head);
    if(settled){
      if(q.status==='dismissed')card.append(el('div','已跳过','bt-q-detail'));
      else{const rows=el('div','','bt-q-list'),chosen=[...(q.selected||[]),...(q.custom?[q.custom]:[])];for(const label of chosen.length?chosen:[q.answer||'已回答']){const row=el('div','','bt-q-opt'),body=el('span','','bt-q-body'),check=el('span','','bt-q-check');body.append(el('span',label,'bt-q-label'));check.append(icon('CheckIcon'));row.append(body,check);rows.append(row);}card.append(rows);}
      if(q.deliveryPending){card.append(el('div',q.deliveryError?'回答已保存，等待重试派发：'+q.deliveryError:'回答已保存，正在派发…','bt-q-detail'));const retry=el('button','重试派发','bt-q-submit');retry.type='button';retry.onclick=()=>submit(q,{text:q.answer});card.append(retry);}return card;
    }
    const dismiss=el('button','','bt-q-x');dismiss.type='button';dismiss.setAttribute('aria-label','跳过问题');dismiss.append(icon('CloseIcon'));dismiss.onclick=()=>submit(q,{dismissed:true});head.append(dismiss);
    const rows=el('div','','bt-q-list');rows.setAttribute('role','group');card.append(rows);
    const controls=[];let custom,send;
    const update=()=>{controls.forEach((b,i)=>{const selected=draft.selected.includes(options[i].label);if(q.multiSelect){b.setAttribute('aria-pressed',String(selected));b.querySelector('.bt-q-check').hidden=!selected;}});if(send)send.disabled=sending.has(q.id)||!draft.selected.length&&!draft.custom.trim();};
    const choose=label=>{if(sending.has(q.id))return;if(q.multiSelect){draft.selected=draft.selected.includes(label)?draft.selected.filter(v=>v!==label):[...draft.selected,label];update();}else submit(q,{selected:[label]});};
    options.forEach((option,i)=>{const pick=el('button','','bt-q-opt');pick.type='button';pick.setAttribute('aria-label',option.label);pick.setAttribute('aria-keyshortcuts',String.fromCharCode(97+i));pick.append(el('span',String.fromCharCode(65+i),'bt-key'));const body=el('span','','bt-q-body');body.append(el('span',option.label,'bt-q-label'));if(option.description)body.append(el('span',option.description,'bt-q-desc'));pick.append(body);if(q.multiSelect){const check=el('span','','bt-q-check');check.append(icon('CheckIcon'));pick.append(check);}pick.onclick=()=>choose(option.label);controls.push(pick);rows.append(pick);});
    if(q.allowCustom===true||!q.options){const wrap=el('div','','bt-q-custom'),field=el('label','','bt-q-field');custom=el('textarea','','bt-q-input');custom.rows=1;custom.placeholder='输入自己的回答';custom.setAttribute('aria-label','自己的回答');custom.value=draft.custom;custom.oninput=()=>{draft.custom=custom.value;update();};custom.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();card.requestSubmit();}};field.append(custom);wrap.append(field);card.append(wrap);}
    if(q.multiSelect||custom){const foot=el('div','','bt-q-foot');send=el('button','回答','bt-q-submit');send.type='submit';foot.append(send);card.append(foot);}
    card.onsubmit=e=>{e.preventDefault();if(draft.selected.length||draft.custom.trim())submit(q,{selected:draft.selected,custom:draft.custom});};
    card.pick=choose;card.customInput=custom;card.update=update;update();if(sending.has(q.id))queueMicrotask(()=>paintBusy(q.id,true));return card;
  }
  function onKey(event){
    if(event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.key.length!==1)return;
    const typing=node=>node?.matches?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    if(event.composedPath().some(typing)||typing(app.getRootNode().activeElement)||[...app.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')].some(node=>!node.hidden&&node.getClientRects().length))return;
    const q=getQuestions().find(q=>q.status==='pending');if(!q)return;const card=[...app.querySelectorAll('[data-question-id]')].find(n=>n.dataset.questionId===q.id);if(!card)return;
    const index=event.key.toUpperCase().charCodeAt(0)-65,options=optionsOf(q);
    if(index>=0&&index<options.length){event.preventDefault();card.pick(options[index].label);}else if(index===options.length&&card.customInput){event.preventDefault();card.customInput.focus();}
  }
  app.addEventListener('keydown',onKey);
  return {render,close(){closed=true;drafts.clear();app.removeEventListener('keydown',onKey);}};
}
