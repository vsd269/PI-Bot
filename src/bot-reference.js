'use strict';
function findBot(team,value){
  const text=String(value??'').trim(),exact=team.state.bots.filter(bot=>bot.id===text||bot.name===text);
  if(exact.length===1)return exact[0];
  const pairs=[['"','"'],["'","'"],['“','”'],['‘','’'],['「','」'],['『','』'],['《','》']];
  const pair=pairs.find(([left,right])=>text.length>1&&text.startsWith(left)&&text.endsWith(right));
  const normalized=pair?text.slice(1,-1).trim():text,matches=team.state.bots.filter(bot=>bot.id===normalized||bot.name===normalized);
  if(matches.length!==1)throw Error('没有找到唯一的 Bot：'+text.slice(0,200));return matches[0];
}
module.exports={findBot};
