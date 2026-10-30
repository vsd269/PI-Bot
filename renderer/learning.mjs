import {el} from './dom.mjs';
import {soft} from './settings-ui.mjs';
// Full proposal text is loaded on demand in bounded bridge-sized pieces.
export function createLearning({app,chat,call,refresh,notice}){
  const host=el('section','','pi-learning-suggestions');host.hidden=true;chat.append(host);
  let dialog,key='',disposed=false;
  async function text(id,part){let result='',offset=0;for(let i=0;i<4;i++){const chunk=await call('team.learning',{action:'text',id,part,offset});result+=chunk.text;if(chunk.next>=chunk.total)return result;if(chunk.next<=offset)throw Error('提案内容读取中断，请重试。');offset=chunk.next;}throw Error('提案内容超出预览范围。');}
  async function open(proposal){
    dialog?.remove();const view=el('dialog','','pi-learning-dialog');dialog=view;
    const title=el('h2',proposal.kind==='skill'?'保存工作经验为 Skill':'更新项目规则 AGENTS.md'),close=soft('关闭',()=>view.close()),head=el('header');head.append(title,close);
    const content=el('div','正在读取提案…','pi-learning-body'),status=el('p','','pi-learning-status');status.setAttribute('role','status');view.append(head,content,status);app.append(view);view.addEventListener('close',()=>{view.remove();if(dialog===view)dialog=null;});view.showModal();
    try{
      const [after,before]=await Promise.all([text(proposal.id,'content'),proposal.kind==='agents'?text(proposal.id,'before'):Promise.resolve('')]);
      if(disposed||dialog!==view)return;content.replaceChildren();
      content.append(el('p',proposal.reason));if(proposal.path)content.append(el('p',proposal.path,'pi-learning-path'));
      if(proposal.kind==='skill')content.append(el('h3',proposal.name),el('p',proposal.description||''));
      if(proposal.private&&proposal.kind==='skill')content.append(el('p','这是私密 Bot 的经验提案。确认保存会将下方内容加入所有 Bot 都可读取的共享能力库；请先检查并确认愿意共享。','pi-learning-status'));
      if(proposal.kind==='agents'){const previous=el('details');previous.append(el('summary','修改前'),el('pre',before||'（原文件不存在或为空）'));content.append(previous);}
      content.append(el('h3',proposal.kind==='skill'?'Skill 内容':'修改后'),el('pre',after));
      const actions=el('div','','bt-actions'),decline=soft('拒绝',()=>answer(false)),approve=soft(proposal.status==='applying'?'核对保存状态':'确认保存',()=>answer(true));decline.disabled=proposal.status==='applying';actions.append(decline,approve);content.append(actions);
      async function answer(approved){
        approve.disabled=decline.disabled=true;view.setAttribute('aria-busy','true');status.textContent=approved?'正在核对并保存…':'正在保存拒绝记录…';
        try{await call('team.learning',{action:'answer',id:proposal.id,approve:approved});view.close();notice(approved?(proposal.kind==='skill'?'Skill 已保存并分配给提出建议的 Bot。':'项目规则已保存。'):'已拒绝，未修改文件或能力。');await refresh();}
        catch(error){status.textContent=error.message||'保存未确认，请重试。';approve.disabled=false;decline.disabled=proposal.status==='applying';}
        finally{view.removeAttribute('aria-busy');}
      }
    }catch(error){if(dialog===view){content.textContent=error.message||'无法读取提案。';}}
  }
  function update(state,selected){
    const news=state.learningNews||{pending:[],running:[]},botId=selected?.kind==='bot'?selected.id:null,proposals=(news.pending||[]).filter(p=>p.botId===botId),running=(news.running||[]).includes(botId),review=news.reviews?.[botId];
    const next=JSON.stringify([botId,proposals,running,review]);if(next===key)return;key=next;host.hidden=!botId;if(!botId)return;host.replaceChildren();
    const head=el('div','','pi-learning-heading'),status=el('span',running?'正在复盘已完成的任务…':proposals.length?proposals.length+' 条工作经验建议待确认':'工作经验','pi-learning-label');status.setAttribute('role','status');
    const reviewButton=soft('复盘经验',async()=>{try{const result=await call('team.learning',{action:'review',botId});notice(result.busy?'已有经验复盘正在进行。':'正在复盘，生成的建议会显示在这里；不会自动写入。');await refresh();}catch(error){notice(error.message);}});reviewButton.disabled=running;head.append(status,reviewButton);host.append(head);
    if(review?.error)host.append(el('p','上次复盘未完成：'+review.error,'pi-learning-hint'));
    else if(review&&review.proposed===0)host.append(el('p','最近这次复盘没有发现需要新增的通用经验。','pi-learning-hint'));
    for(const p of proposals){const card=el('div','','pi-learning-card'),copy=el('div');copy.append(el('strong',p.kind==='skill'?'建议保存 Skill：'+p.name:'建议更新 AGENTS.md'),el('p',p.reason));card.append(copy,soft('查看并确认',()=>open(p)));host.append(card);}
  }
  return {update,dispose(){disposed=true;dialog?.remove();host.remove();}};
}
