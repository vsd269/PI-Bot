'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {linesOf}=require('./history');
function textOf(content){if(typeof content==='string')return content;if(Array.isArray(content))return content.map(p=>p.text||p.thinking||'').join('\n');return '';}
class HistoryIndex{
  constructor(team){this.team=team;this.rows=[];this.status={phase:'idle',count:0,sessions:0};this.file=path.join(team.data,'history-index.json');}
  async load(){try{const r=JSON.parse(await fs.readFile(this.file,'utf8'));if(r.version===1&&Array.isArray(r.rows)&&r.rows.length<=100000){this.rows=r.rows;this.status={phase:'ready',count:r.rows.length,at:r.at,sessions:r.sessions};}}catch{}}
  start(){if(this.running)return this.status;this.cancelled=false;this.status={phase:'indexing',count:0,sessions:0,errors:0};this.running=this.rebuild().catch(()=>{this.status.phase='error';}).finally(()=>{this.running=null;});return this.status;}
  async rebuild(){
    const rows=[],seen=new Set(),add=row=>{if(rows.length>=100000)throw Error('索引超过 100000 条。');const text=this.team.vault.redact(String(row.text||'')).slice(0,16000);if(text)rows.push({...row,text});};
    for(const kind of ['bot','room'])for(const item of [...(kind==='bot'?this.team.state.bots:this.team.state.rooms),...(this.team.state.archives||[]).filter(a=>a.kind===kind)])for(const line of linesOf(this.team,kind,item.id))add({kind,targetId:item.id,name:item.name,lineId:line.id,who:line.who,at:line.at,text:line.text,archived:!!item.lines});
    for(const bot of this.team.state.bots){
      const sessions=[...Object.entries(bot.sessions||{}).map(([roomId,sessionId])=>({sessionId,roomId})),...(bot.sessionArchive||[]),...this.team.state.jobs.filter(j=>j.botId===bot.id&&j.sessionId)];
      for(const session of sessions){if(this.cancelled||this.team.stopped){this.status.phase='cancelled';return;}if(!session.sessionId||seen.has(session.sessionId))continue;seen.add(session.sessionId);let before;
        try{for(let page=0;page<1000;page++){
          if(this.cancelled||this.team.stopped){this.status.phase='cancelled';return;}const r=await this.team.invoke('session/get',[{id:session.sessionId,messageLimit:100,contentLimit:16000,...(before===undefined?{}:{messageBefore:before})}]);const s=r.session;if(!s)break;
          for(const m of s.messages||[])add({kind:session.roomId&&session.roomId!=='private'?'room':'bot',targetId:session.roomId&&session.roomId!=='private'?session.roomId:bot.id,name:bot.name,sessionId:session.sessionId,lineId:m.id,who:m.toolName||m.role,at:m.timestamp||m.createdAt,text:[textOf(m.content),m.thinking,typeof m.toolResult==='string'?m.toolResult:''].filter(Boolean).join('\n')});
          this.status.count=rows.length;if(!s.hasMoreBefore)break;if(!Number.isInteger(s.messageStart)||before!==undefined&&s.messageStart>=before)throw Error('分页未前进。');before=s.messageStart;
        }}catch{this.status.errors++;}this.status.sessions=seen.size;
      }
    }
    const at=new Date().toISOString();await fs.writeFile(this.file+'.tmp',JSON.stringify({version:1,rows,at,sessions:seen.size}));await fs.rename(this.file+'.tmp',this.file);this.rows=rows;this.status={...this.status,phase:'ready',count:rows.length,at};
  }
  search(input){const terms=String(input.query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,16);if(!terms.length)return {results:[],status:this.status};const results=this.rows.filter(r=>(!input.kind||r.kind===input.kind)&&(!input.id||r.targetId===input.id)&&terms.every(t=>r.text.toLocaleLowerCase().includes(t))).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,100).map(r=>{const n=r.text.toLocaleLowerCase().indexOf(terms[0]);return {...r,text:this.team.vault.redact(r.text.slice(Math.max(0,n-100),n+500))};});return {results,status:this.status};}
  async close(){this.cancelled=true;await this.running;}
}
module.exports={HistoryIndex};
