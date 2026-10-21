export const defineTool=value=>value;
export const splitRef=ref=>{const index=typeof ref==='string'?ref.indexOf('/'):-1;return index>0?{provider:ref.slice(0,index),model:ref.slice(index+1)}:undefined;};
export const unquote=text=>String(text??'').trim().replace(/^["'“”「『《]+|["'“”」』》]+$/g,'').trim();
export const output={schema:{type:'string'},render:(_args,value)=>[{type:'text',text:String(value)}]};
export const speakerOf=line=>line.botId!==undefined&&['user','you'].includes(String(line.who??'').trim().toLowerCase())?`Bot "${line.who}"`:line.who;
