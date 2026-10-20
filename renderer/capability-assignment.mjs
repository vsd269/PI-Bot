import {el} from './dom.mjs';
import {soft,choose} from './settings-ui.mjs';

// One batch request and one durable save, regardless of how many Bots are picked.
export function mountCapabilityAssignment({body,items,getState,botId,save,isCurrent}){
  const section=el('section','','bt-set-section pi-capability-assignment'),card=el('div','','bt-set-card pi-assignment-card');
  const heading=el('h3','批量分配能力'),intro=el('p','勾选多位 Bot 和多项能力，一次保存即可。默认仅添加，不影响它们原有的能力。','feature-note');
  const grid=el('div','','pi-assignment-grid'),botBox=el('fieldset','','pi-assignment-options'),skillBox=el('fieldset','','pi-assignment-options');
  const selectedBots=new Set(botId?[botId]:[]),selectedSkills=new Set(),botInputs=[],skillInputs=[],counts=new Map();let busy=false,disposed=false;
  function choices(box,title,allLabel,clearLabel,selectAll,clear){
    const legend=el('legend',title),tools=el('div','','pi-selection-tools');
    tools.append(soft(allLabel,selectAll),soft(clearLabel,clear));box.append(legend,tools);
  }
  choices(botBox,'选择 Bot','全选 Bot','清空 Bot',()=>{for(const b of botInputs){b.checked=true;selectedBots.add(b.value);}changed();},()=>{selectedBots.clear();for(const b of botInputs)b.checked=false;changed();});
  choices(skillBox,'选择能力','全选能力','清空能力',()=>{for(const b of skillInputs){b.checked=true;selectedSkills.add(b.value);}changed();},()=>{selectedSkills.clear();for(const b of skillInputs)b.checked=false;changed();});
  for(const bot of getState().bots){
    const check=el('input'),row=el('label','','pi-assignment-option');check.type='checkbox';check.value=bot.id;check.checked=selectedBots.has(bot.id);check.setAttribute('aria-label','分配给 '+bot.name);
    check.onchange=()=>{check.checked?selectedBots.add(bot.id):selectedBots.delete(bot.id);changed();};row.append(check,el('span',bot.name));botBox.append(row);botInputs.push(check);
  }
  for(const item of items){
    const check=el('input'),row=el('label','','pi-assignment-option'),copy=el('span','','pi-assignment-copy'),count=el('small','','pi-assignment-count');check.type='checkbox';check.value=item.name;check.setAttribute('aria-label','分配能力 '+item.name);
    check.onchange=()=>{check.checked?selectedSkills.add(item.name):selectedSkills.delete(item.name);changed();};copy.append(el('span',item.name),count);row.append(check,copy);skillBox.append(row);skillInputs.push(check);counts.set(item.name,count);
  }
  if(!items.length)skillBox.append(el('p','先添加能力或完成 Skill 导入，再进行分配。','feature-note'));
  if(!botInputs.length)botBox.append(el('p','请先创建 Bot。','feature-note'));
  const mode=choose('能力分配方式',[['add','添加选中能力'],['remove','移除选中能力']],'add',changed),modeLabel=el('label','分配方式','pi-assignment-mode'),summary=el('p','','pi-assignment-summary'),actions=el('div','','pi-assignment-actions'),status=el('div','','pi-inline-status');
  modeLabel.append(mode);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
  const commit=soft('保存分配',async()=>{
    if(busy||!selectedBots.size||!selectedSkills.size)return;busy=true;lock();section.setAttribute('aria-busy','true');commit.textContent='正在保存…';message('正在保存能力分配，请稍候。','pending');
    const ids=[...selectedBots],names=[...selectedSkills],operation=mode.value;
    try{
      await save({botIds:ids,names,mode:operation,compact:true});
      if(disposed||!isCurrent())return;
      refreshCounts();commit.textContent='已保存';message('✓ 已保存：'+ids.length+' 位 Bot '+(operation==='remove'?'移除':'添加')+'了 '+names.length+' 项能力，将在下一次任务中使用。','success');
    }catch(error){if(!disposed&&isCurrent()){commit.textContent='重新保存';message('保存失败：'+(error.message||'请重试。'),'error');}}
    finally{busy=false;if(!disposed){section.removeAttribute('aria-busy');lock();}}
  });
  commit.classList.add('pi-action-primary');actions.append(commit,status);grid.append(botBox,skillBox);card.append(intro,grid,modeLabel,summary,actions);section.append(heading,card);body.append(section);
  function message(text,kind){status.hidden=false;status.textContent=text;status.dataset.kind=kind;status.setAttribute('role',kind==='error'?'alert':'status');}
  function refreshCounts(){const bots=getState().bots.filter(b=>selectedBots.has(b.id));for(const [name,count]of counts){const assigned=bots.filter(b=>(b.capabilities||[]).includes(name)).length;count.textContent=bots.length?'已分配给所选 '+assigned+' / '+bots.length+' 位 Bot':'选择 Bot 后查看分配情况';}}
  function lock(){botBox.disabled=skillBox.disabled=mode.disabled=busy;commit.disabled=busy||!selectedBots.size||!selectedSkills.size;}
  function changed(){if(busy)return;status.hidden=true;commit.textContent='保存分配';summary.textContent='已选 '+selectedBots.size+' 位 Bot · '+selectedSkills.size+' 项能力';refreshCounts();lock();}
  changed();return {section,dispose(){disposed=true;}};
}
