// Automatic memory writes need an exact excerpt from a fresh user statement.
// This is conservative source validation, not proof of the model's interpretation.
export function validEvidence(change,lines){
  if(typeof change?.evidence!=='string'||change.evidence.trim().length<4||change.evidence.length>600)return false;
    const quote=change.evidence.trim();
    if(/[“”「」"]/.test(quote))return false;
  return lines.filter(l=>l.who==='user').some(line=>{
    const text=String(line.text||'').replace(/^User: /,'');
    const at=text.indexOf(quote);if(at<0)return false;
    if(/```|^\s*>|(?:以下|下面|引用|转述|原文|日志|网页|文档|他说|她说|它说)|(?:quoted|pasted|he said|she said|log:)/im.test(text))return false;
    const before=text.slice(0,at),after=text.slice(at+quote.length);
    // Reject evidence inside Chinese/English quoted text, including multiline quotes.
    if((before.match(/[“”"]/g)||[]).length%2||before.lastIndexOf('「')>before.lastIndexOf('」'))return false;
    const start=Math.max(before.lastIndexOf('。'),before.lastIndexOf('！'),before.lastIndexOf('\n'))+1;
    const end=after.search(/[。！\n]/);const sentence=text.slice(start,end<0?text.length:at+quote.length+end+1);
    return !/[?？]|(?:如果|假如|假设|倘若|要是|是否|是不是|会不会|能不能|例如|举例)|[吗么呢][。！\s]*$|\b(?:if|suppose|hypothetical|imagine|what if|for example)\b/i.test(sentence);
  });
}
