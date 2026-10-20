'use strict';
const {randomUUID}=require('node:crypto');
// ui.microphone belongs to an isolated PI panel, never to the host renderer.
class Microphone {
  constructor(pi,integrations){this.pi=pi;this.integrations=integrations;this.current=null;this.devices=[];this.selected='';this.lastSeen=0;}
  async operation(input={}){
    if(input.action==='setup'){await this.pi.ui.openPanel({title:'PI Bot · 麦克风'});return {devices:this.devices,selected:this.selected};}
    if(input.action==='begin'){
      this.integrations.team.bot(input.botId);if(this.current&&!['done','error','cancel'].includes(this.current.command))throw Error('麦克风正在使用，请先结束当前录音。');
      const item={id:randomUUID(),botId:input.botId,command:'start',status:'starting',level:0,at:Date.now(),chunks:[],length:0};this.current=item;
      try{if(Date.now()-this.lastSeen>2000)await this.pi.ui.openPanel({title:'PI Bot · 麦克风'});}catch(e){this.current=null;throw e;}return {id:item.id};
    }
    const item=this.current;if(!item||input.id!==item.id)throw Error('录音已结束，请重新开启。');
    if(input.action==='cancel'){item.command='cancel';item.chunks=[];return {};}
    if(input.action==='finish'){if(item.command==='start')item.command='finish';return {};}
    if(input.action==='read'){
      if(item.command==='cancel')return {status:'cancelled',level:0,error:'录音已取消。'};
      if(!item.processing&&!['done','error','cancel'].includes(item.command)&&Date.now()-Math.max(item.at,this.lastSeen)>15000){item.command='error';item.error='录音面板已关闭或没有响应，请重新开启语音。';}
      return {status:item.status,level:item.level,text:item.text,error:item.error};
    }
    throw Error('未知麦克风操作。');
  }
  async panel(input={}){
    this.lastSeen=Date.now();const item=this.current;
    if(input.action==='poll'){
      if(item&&Date.now()-item.at>180000&&!['done','error','cancel'].includes(item.command)){item.command='cancel';item.chunks=[];}
      return item?{id:item.id,command:item.command}:{command:'idle'};
    }
    if(input.action==='devices'){this.devices=(Array.isArray(input.devices)?input.devices:[]).slice(0,64).filter(d=>typeof d.deviceId==='string'&&typeof d.label==='string').map(d=>({deviceId:d.deviceId.slice(0,512),label:d.label.slice(0,200)}));this.selected=String(input.selected||'').slice(0,512);return {};}
    if(!item||item.id!==input.id||['cancel','done','error'].includes(item.command))return {cancelled:true};
    if(input.action==='status'){item.status=String(input.status||'').slice(0,32);item.level=Math.min(1,Math.max(0,Number(input.level)||0));if(input.error){item.error=String(input.error).slice(0,500);item.command='error';item.chunks=[];}return {};}
    if(input.action==='chunk'){
      if(item.command!=='finish'||typeof input.chunk!=='string'||input.chunk.length>48000||!/^[A-Za-z0-9+/=]*$/.test(input.chunk)||input.offset!==item.length||item.length+input.chunk.length>2600000)throw Error('录音数据无效或超过 60 秒。');item.chunks.push(input.chunk);item.length+=input.chunk.length;return {};
    }
    if(input.action==='complete'){
      if(item.command!=='finish'||item.processing)throw Error('录音已结束。');item.processing=true;item.status='transcribing';
      if(input.empty===true&&item.length===0){item.text='';item.status='done';item.command='done';return {};}
      try{
        const upload=await this.integrations.speech({action:'begin',botId:item.botId});
        try{let offset=0;for(const chunk of item.chunks){await this.integrations.speech({action:'chunk',botId:item.botId,id:upload.id,offset,chunk});offset+=chunk.length;}item.chunks=[];
          const result=await this.integrations.speech({action:'transcribe',botId:item.botId,id:upload.id});if(item.command==='finish'){item.text=result.text;item.status='done';item.command='done';}
        }catch(e){await this.integrations.speech({action:'cancel',botId:item.botId,id:upload.id}).catch(()=>{});throw e;}
      }catch(e){if(item.command==='finish'){item.error=e.message;item.command='error';item.status='error';}}finally{item.chunks=[];}return {};
    }
    throw Error('未知录音面板操作。');
  }
  async close(){if(this.current){this.current.command='cancel';this.current.chunks=[];}await Promise.resolve(this.pi.ui?.closePanel?.()).catch(()=>{});}
}
module.exports={Microphone};
