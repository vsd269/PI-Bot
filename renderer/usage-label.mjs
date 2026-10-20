// PI inputTokens is uncached input; cache writes also belong in the input
// denominator. Unknown cache telemetry must not be presented as a zero hit.
export function cacheHitLabel(usage={}){
  const input=(usage.inputTokens||0)+(usage.cacheReadTokens||0)+(usage.cacheWriteTokens||0);
  if(!usage.cacheReadKnown||input<=0)return null;
  return Math.round((usage.cacheReadTokens||0)/input*100)+'%';
}
export function detailUsageLabel(usage){
  if(!Number.isFinite(usage?.tokens))return '暂无记录';
  const tokens=usage.tokens>=1000?(usage.tokens/1000).toFixed(1)+'k':String(usage.tokens),hit=cacheHitLabel(usage);
  let text=tokens+' tok · 缓存命中'+(hit===null?'未上报':' '+hit);
  if(Number.isFinite(usage.cost))text+=' · $'+usage.cost.toFixed(4);
  return text;
}
