'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),{randomUUID}=require('node:crypto');
// A plugin-owned helper uses the Windows desktop microphone permission. It has
// no UI, network access, secrets or audio files. Requests are JSON on stdin.
class WindowsMicrophone {
  constructor(pi,integrations,{spawnProcess=spawn}={}){this.pi=pi;this.integrations=integrations;this.spawnProcess=spawnProcess;this.current=null;this.pending=new Map();this.child=null;this.buffer='';this.closed=false;}
  async ready(){
    if(this.closed)throw Error('麦克风服务已关闭。');if(this.boot)return this.boot;
    this.boot=new Promise((resolve,reject)=>{
      const child=this.child=this.spawnProcess(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-microphone.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const timeout=setTimeout(()=>{reject(Error('启动 Windows 录音超时，请重试。'));child.kill();},20000);child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');let diagnostic='';
      child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-1000);});
      child.stdout.on('data',data=>{this.buffer+=data;if(this.buffer.length>2700000){child.kill();return;}let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);let value;try{value=JSON.parse(line);}catch{continue;}if(value.type==='ready'){clearTimeout(timeout);resolve();}else this.event(value);}});
      const fail=error=>{clearTimeout(timeout);if(this.child!==child)return;this.child=null;this.boot=null;this.buffer='';reject(error);for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();if(this.current&&!['done','cancelled','error'].includes(this.current.status)){this.current.status='error';this.current.error=error.message;this.current.stream?.cancel();}};
      child.on('error',()=>fail(Error('无法启动 Windows 录音辅助程序。')));child.on('exit',()=>fail(Error('Windows 录音辅助程序已退出。'+(diagnostic?' 请检查本机 PowerShell / .NET 环境。':''))));
    });return this.boot;
  }
  write(value){if(!this.child?.stdin?.writable)throw Error('录音服务未就绪。');this.child.stdin.write(JSON.stringify(value)+'\n');}
  async request(type,input){await this.ready();if(this.pending.has(type))return this.pending.get(type).promise;let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});const timer=setTimeout(()=>{this.pending.delete(type);reject(Error('录音设备没有响应，请重试。'));this.child?.kill();},10000);this.pending.set(type,{promise,resolve,reject,timer});try{this.write(input);}catch(error){clearTimeout(timer);this.pending.delete(type);reject(error);}return promise;}
  event(value){if(value.id&&value.id!==this.current?.id)return;const pending=this.pending.get(value.type);if(pending){clearTimeout(pending.timer);this.pending.delete(value.type);pending.resolve(value);}const item=this.current;
    if(value.type==='error'){const error=Error(String(value.error||'无法使用麦克风。').slice(0,500));for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();if(item){item.status='error';item.error=error.message;}return;}
    if(!item)return;if(value.type==='listening')item.status='listening';if(value.type==='level'&&item.status==='listening')item.level=Math.min(1,Math.max(0,Number(value.level)||0));
    if(item.stream&&value.type==='pcm'&&['starting','listening','transcribing'].includes(item.status)){
      if(item.captureFinished)return;
      try{
        if(typeof value.audio!=='string'||value.audio.length>8600)throw Error('实时音频帧无效。');
        const bytes=Buffer.from(value.audio,'base64'),remaining=1760000-(item.streamBytes||0);
        if(bytes.length%2)throw Error('实时音频帧无效。');
        const chunk=bytes.subarray(0,Math.max(0,remaining));if(chunk.length){item.stream.push(chunk);item.streamBytes=(item.streamBytes||0)+chunk.length;}
        if(item.streamBytes>=1760000){item.captureFinished=true;item.status='transcribing';this.write({action:'finish'});}
      }catch(e){item.status='error';item.error=e.message;item.stream.cancel();if(this.child)this.write({action:'cancel'});}return;
    }
    if(item.stream&&value.type==='audio'&&!item.processing&&['listening','transcribing'].includes(item.status)){item.processing=true;item.status='transcribing';void item.stream.finish().then(text=>{if(this.current===item&&item.status!=='cancelled'){item.text=text;item.status='done';}},error=>{if(this.current===item&&item.status!=='cancelled'){item.error=error.message;item.status='error';}});return;}
    if(value.type==='audio'&&!item.processing&&['listening','transcribing'].includes(item.status)){if(item.test){item.status='done';return;}item.processing=true;item.status='transcribing';void this.transcribe(item,value.audio);}
  }
  async transcribe(item,encoded){let upload;try{if(typeof encoded!=='string'||encoded.length>2600000)throw Error('录音数据过大。');const bytes=Buffer.from(encoded,'base64');if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.readUInt32LE(24)!==16000||bytes.readUInt16LE(22)!==1)throw Error('录音格式无效。');if(bytes.length<=3244){if(this.current===item&&item.status!=='cancelled'){item.status='done';item.text='';}return;}upload=await this.integrations.speech({action:'begin',botId:item.botId});item.upload=upload.id;for(let offset=0;offset<encoded.length;offset+=48000){if(this.current!==item||item.status==='cancelled')return;await this.integrations.speech({action:'chunk',botId:item.botId,id:upload.id,offset,chunk:encoded.slice(offset,offset+48000)});}const result=await this.integrations.speech({action:'transcribe',botId:item.botId,id:upload.id});if(this.current===item&&item.status!=='cancelled'){item.status='done';item.text=result.text;}}catch(error){if(this.current===item&&item.status!=='cancelled'){item.status='error';item.error=error.message;}}finally{if(upload)await this.integrations.speech({action:'cancel',botId:item.botId,id:upload.id}).catch(()=>{});}}
  async devices(){const {names}=await this.request('devices',{action:'devices'});return (Array.isArray(names)?names:[]).map((label,i)=>({deviceId:'winmm:'+i+':'+Buffer.from(label).toString('base64'),label}));}
  async operation(input={}){
    if(input.action==='setup'||input.action==='devices')return {native:true,devices:await this.devices()};
    if(input.action==='begin'||input.action==='test'){
      if(this.starting||this.current&&!['done','cancelled','error'].includes(this.current.status))throw Error('麦克风正在使用，请先结束当前录音。');if(input.action==='begin')this.integrations.team.bot(input.botId);
      this.starting=true;
      try{const devices=await this.devices(),device=input.deviceId?devices.find(d=>d.deviceId===input.deviceId):null;if(input.deviceId&&!device)throw Error('所选麦克风已断开或顺序已变化，请重新选择设备。');
        const item=this.current={id:randomUUID(),botId:input.botId,test:input.action==='test',status:'starting',level:0};try{if(input.realtime===true&&!item.test)item.stream=await this.integrations.liveSpeech({onPartial:text=>{if(this.current===item)item.partial=text;},onError:error=>{if(this.current===item&&!['cancelled','done','error'].includes(item.status)){item.status='error';item.error=error.message;if(this.child)this.write({action:'cancel'});}}});await this.request('listening',{action:'start',id:item.id,device:device?devices.indexOf(device):-1,stream:!!item.stream});if(item.status==='error')throw Error(item.error);if(item.test)item.timer=setTimeout(()=>{if(this.current===item)void this.operation({action:'cancel',id:item.id}).catch(()=>{});},15000);}catch(error){item.stream?.cancel();item.status='error';item.error=error.message;throw error;}return {id:item.id};
      }finally{this.starting=false;}
    }
    const item=this.current;if(!item||input.id!==item.id)throw Error('录音已结束，请重新开启。');
    if(input.action==='read')return {status:item.status,level:item.level,text:item.text,partial:item.partial,error:item.error};
    if(input.action==='finish'){if(item.status==='listening'){item.status='transcribing';clearTimeout(item.timer);this.write({action:'finish'});}return {};}
    if(input.action==='cancel'){clearTimeout(item.timer);item.status='cancelled';item.stream?.cancel();item.text='';item.level=0;if(this.child)await this.request('cancelled',{action:'cancel'});if(item.upload)await this.integrations.speech({action:'cancel',botId:item.botId,id:item.upload}).catch(()=>{});return {};}
    throw Error('未知麦克风操作。');
  }
  panel(){throw Error('此版本使用 Windows 录音，无需独立麦克风窗口。');}
  async close(){this.closed=true;clearTimeout(this.current?.timer);if(this.current){this.current.status='cancelled';this.current.stream?.cancel();if(this.current.upload)await this.integrations.speech({action:'cancel',botId:this.current.botId,id:this.current.upload}).catch(()=>{});}const child=this.child;if(child)await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);resolve();};child.once('exit',done);timer=setTimeout(()=>{child.kill();done();},1500);try{child.stdin.end(JSON.stringify({action:'close'})+'\n');}catch{child.kill();done();}});}
}
module.exports={WindowsMicrophone};
