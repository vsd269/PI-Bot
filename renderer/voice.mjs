import {openCapture,base64Of,turnDetector} from './speech-capture.mjs';
import {playbackEchoGuard,meaningfulSpeech} from './voice-interruption.mjs';
const labels={starting:'正在开启麦克风…',listening:'正在聆听…',transcribing:'正在转写…',thinking:'正在思考…',speaking:'正在朗读…',paused:'已暂停',error:'语音已暂停'};
const activeStatuses=new Set(['queued','launching','running','waiting','waiting_teammates']);
export function createVoice({call,getTarget,getState=()=>({bots:[],rooms:[],jobs:[]}),insert,send,notice,onStatus,captureAudio=openCapture,makeDetector=turnDetector}){
  let recording=null,target=null,conversation=false,paused=false,starting=false,working=false,generation=0,frame,timer,recognition,disposed=false,phase='',caption='',waiting=null,pendingReply=null,configuration,captureAbort,captureContext=null,captureEpoch=0;
  const key=t=>t?.kind+':'+t?.id;
  const valid=token=>!disposed&&token===generation&&key(getTarget())===key(target);
  let ttsAudio=null,playResolve=null,playback=null,speechEpoch=0;const ttsRequests=new Set();
  const speechConfig=()=>configuration?.speechGlobal||Object.values(configuration?.speech||{})[0];
  const interruptionMode=()=>speechConfig()?.interruption||'speaker';
  function stopSpeech(){speechEpoch++;playback=null;window.speechSynthesis?.cancel();const audio=ttsAudio;ttsAudio=null;if(audio){audio.onended=audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();}playResolve?.(false);playResolve=null;for(const requestId of ttsRequests)void call('team.extensions',{action:'ttsCancel',requestId}).catch(()=>{});ttsRequests.clear();}
  function status(next,text=caption,level=0){phase=next;caption=text;const interruptible=next==='speaking'&&!!recording&&interruptionMode()!=='off';onStatus(interruptible?'正在朗读 · 说话可打断':labels[next]||'',conversation,{phase:next,caption:text,level,paused,interruptible,microphoneActive:!!recording});}
  function stopCapture(){captureEpoch++;captureAbort?.abort();captureAbort=null;cancelAnimationFrame(frame);clearTimeout(timer);recording?.cancel();recording=null;captureContext=null;const r=recognition;recognition=null;if(r){r.onend=null;r.onresult=null;r.onerror=null;r.abort();}}
  function halt(){generation++;conversation=false;paused=false;starting=false;working=false;waiting=null;pendingReply=null;configuration=null;stopCapture();stopSpeech();target=null;status('','');}
  function fail(error){if(disposed)return;stopCapture();stopSpeech();starting=false;working=false;const text=({blocked:'麦克风权限被阻止，请在 PI 中允许录音。',unavailable:'当前环境不能使用麦克风，请检查 PI 的录音权限。',failed:'无法开启麦克风，请检查录音设备。'})[error.kind]||error.message||String(error);notice(text);if(conversation){paused=true;status('error',text);}else halt();}
  function serviceBot(){const state=getState();if(target.kind==='bot')return target.id;const room=state.rooms.find(r=>r.id===target.id);const ids=[room?.adminId,...(room?.members||[])].filter(Boolean);return ids.find(id=>configuration?.speech?.[id])||ids[0];}
  async function transcribe(bytes,botId,token){
    const encoded=base64Of(bytes),upload=await call('team.speech',{action:'begin',botId});
    try{for(let at=0;at<encoded.length;at+=48000){if(!valid(token))throw Error('录音已取消。');await call('team.speech',{action:'chunk',botId,id:upload.id,offset:at,chunk:encoded.slice(at,at+48000)});}if(!valid(token))throw Error('录音已取消。');return await call('team.speech',{action:'transcribe',botId,id:upload.id});}catch(e){await call('team.speech',{action:'cancel',botId,id:upload.id}).catch(()=>{});throw e;}
  }
  function accept(text,token){
    if(!valid(token)||paused)return;working=false;text=String(text||'').trim();if(!text){if(conversation)void start();else status('','');return;}
    if(!conversation){insert(text);status('','');return;}
    const state=getState(),baseline=new Set([...state.jobs.map(j=>j.id),...state.bots.flatMap(b=>b.chat||[]).map(l=>l.id),...state.rooms.flatMap(r=>r.log||[]).map(l=>l.id)]);
    const entry=send(text,{...target});waiting={entry,messageId:entry?.id,baseline,at:Date.now(),seen:false};status('thinking',text);
  }
  async function finish(){
    if(!recording||working)return;cancelAnimationFrame(frame);clearTimeout(timer);const capture=recording,context=captureContext;recording=null;captureContext=null;working=true;const token=generation,botId=serviceBot();const watching=context?.guard&&!context.heardUser;
    if(!watching)status('transcribing');
    try{
      const bytes=await capture.finish(60);if(!valid(token))return;
      if(!bytes){working=false;if(conversation)void start();return;}
      const result=typeof bytes.transcript==='string'?{text:bytes.transcript}:await transcribe(bytes,botId,token);
      let text=result.text;
      if(context?.guard){
        text=context.heardUser?context.guard.result(text):context.guard.candidate(text);
        if(!context.heardUser&&(!meaningfulSpeech(text)||performance.now()-context.lastVoice>1800))text='';
      }
      working=false;
      if(!text?.trim()){if(conversation)void start();else status('','');return;}
      // A last ASR result can arrive after the 60-second rollover. It still
      // belongs to this utterance and must stop playback before being sent.
      if(playback)stopSpeech();accept(text,token);
    }catch(e){if(valid(token))fail(e);}finally{if(valid(token))working=false;}
  }
  async function start(){
    if(disposed||paused||starting||recording||recognition||working||waiting)return;
    if(!target){const selected=getTarget();if(!selected)throw Error('请先选择一个 Bot 或群聊。');target={...selected};}
    const token=generation,epoch=++captureEpoch,monitor=playback;starting=true;if(!playback)status('starting','');
    try{
      if(!configuration){const value=await call('team.extensions',{action:'get'});if(!valid(token))return;configuration=value.config;}
      const saved=configuration.speechGlobal||Object.values(configuration.speech||{}).find(c=>c.enabled!==false)||Object.values(configuration.speech||{})[0];if(!saved)throw Error('请先在语音设置中保存并使用一个转写服务。');const provider=saved.defaultProvider||saved.provider,profile=saved.profiles?.[provider]||saved;if(!conversation&&profile.enabled===false)throw Error('默认语音服务已停用，请在语音设置中启用并保存。');
      const abort=captureAbort=new AbortController();let capture;
      capture=await captureAudio({botId:serviceBot(),realtime:conversation,signal:abort.signal,onTranscribing:()=>{if(valid(token)&&recording===capture)void finish();}});
      if(!valid(token)||paused||epoch!==captureEpoch){capture.cancel();return;}
      recording=capture;const context=captureContext={guard:monitor?playbackEchoGuard(interruptionMode()==='headphones'||capture.echoCancellation===true?'':monitor.text):null,heardUser:false,lastVoice:-Infinity,loudSince:null,candidate:'',candidateSince:0,endedAt:0};
      const detector=makeDetector({quietMs:conversation?800:1200});status(playback?'speaking':'listening',playback?.text||'');
      const tick=()=>{
        if(recording!==capture)return;
        try{
          const level=capture.level(),now=performance.now(),partial=capture.partial?.()||'';
          if(level>=0.07){context.lastVoice=now;context.loudSince??=now;}else context.loudSince=null;
          let canFinish=true;
          if(context.guard&&!context.heardUser){
            canFinish=false;const candidate=context.guard.candidate(partial),mode=interruptionMode();
            if(!playback&&!context.endedAt)context.endedAt=now;
            // Do not infer speech from a speaker's volume alone. For headsets,
            // or a browser capture with confirmed AEC, VAD can react earlier.
            const fast=(mode==='headphones'||capture.echoCancellation===true)&&context.loudSince!==null&&now-context.loudSince>=180;
            if(candidate!==context.candidate){if(!context.candidate||!candidate.startsWith(context.candidate))context.candidateSince=now;context.candidate=candidate;}
            const recognized=meaningfulSpeech(candidate)&&now-context.lastVoice<1800&&now-context.candidateSince>=120;
            if(fast||recognized){context.guard.commit();context.heardUser=true;stopSpeech();detector(1,now);canFinish=true;status('listening',candidate,level);}
            // After the playback tail has passed, retain the current capture
            // and its prefix offset so the next utterance loses no first word.
            else if(context.endedAt&&now-context.endedAt>700&&!candidate){context.guard.commit();}
          }
          status(playback?'speaking':'listening',playback?.text||(context.guard?context.guard.result(partial):partial),level);
          if(conversation&&canFinish&&detector(level,now,context.guard?context.guard.result(partial):partial)==='done'){void finish();return;}
          frame=requestAnimationFrame(tick);
        }catch(error){if(valid(token))fail(error);}
      };
      // Leave room for the helper's last partial buffer and stream finalization.
      frame=requestAnimationFrame(tick);timer=setTimeout(finish,conversation?55000:60000);
    }catch(e){if(valid(token)&&epoch===captureEpoch)fail(e);}finally{if(token===generation&&epoch===captureEpoch)starting=false;}
  }
  function beginPlayback(text,after){
    stopSpeech();const item=playback={text,after,token:generation,epoch:speechEpoch};
    if(after){status('speaking',text);if(interruptionMode()!=='off')void start();}
    return item;
  }
  const ownsPlayback=item=>playback===item&&item.epoch===speechEpoch&&!disposed&&item.token===generation&&(!item.after||valid(item.token))&&!paused;
  function playbackEnded(item){if(!ownsPlayback(item))return;playback=null;if(conversation&&item.after){if(recording)status('listening','');else if(!starting&&!working)void start();}}
  function speak(text,after){
    const saved=configuration?.speechGlobal||Object.values(configuration?.speech||{})[0];if(saved?.tts?.provider==='custom'){void cloudSpeak(text,after);return;}
    const token=generation;if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){if(after)fail(Error('当前环境不支持系统语音朗读。'));else notice('当前环境不支持系统朗读。');return;}
    const clean=String(text).replace(/```[\s\S]*?```/g,'代码已省略').replace(/[#*_`]/g,'').slice(0,16000),u=new window.SpeechSynthesisUtterance(clean),item=beginPlayback(clean,after);u.lang=/[\u4e00-\u9fff]/.test(text)?'zh-CN':'en-US';const voice=window.speechSynthesis.getVoices?.().find(v=>v.voiceURI===saved?.tts?.voice);if(voice)u.voice=voice;
    u.onend=()=>playbackEnded(item);u.onerror=e=>{if(ownsPlayback(item)&&e.error!=='canceled'&&e.error!=='interrupted')fail(Error('系统朗读失败：'+e.error));};window.speechSynthesis.speak(u);
  }
  async function cloudSpeak(text,after){
    const clean=String(text).replace(/```[\s\S]*?```/g,'代码已省略').replace(/[#*_`]/g,'').slice(0,16000),item=beginPlayback(clean,after);
    const fetchPart=async at=>{if(!ownsPlayback(item))return null;const requestId=crypto.randomUUID();ttsRequests.add(requestId);try{return await call('team.extensions',{action:'ttsSpeak',requestId,text:clean.slice(at,at+220)});}finally{ttsRequests.delete(requestId);}};
    try{let next=fetchPart(0);for(let at=0;at<clean.length;at+=220){const result=await next;if(!ownsPlayback(item)||!result)return;next=at+220<clean.length?fetchPart(at+220):null;next?.catch(()=>{});const audio=ttsAudio=new Audio(result.dataUrl);const played=await new Promise((resolve,reject)=>{playResolve=resolve;audio.onended=()=>resolve(true);audio.onerror=()=>reject(Error('朗读音频无法播放。'));audio.play().catch(reject);});if(!ownsPlayback(item))return;playResolve=null;if(ttsAudio===audio)ttsAudio=null;audio.onended=audio.onerror=null;audio.removeAttribute('src');audio.load();if(!played)return;}playbackEnded(item);}
    catch(e){if(ownsPlayback(item))fail(e);}
  }
  function update(state){
    if(!conversation||!waiting)return;
    const w=waiting;if(w.entry?.delivery==='failed'){waiting=null;fail(Error(w.entry.error||'语音消息发送失败，请在聊天中重试。'));return;}let replies=[],pending=false,error='';
    if(target.kind==='bot'){
      const bot=state.bots.find(b=>b.id===target.id);if(!bot){halt();return;}
      const jobs=state.jobs.filter(j=>j.botId===target.id&&!j.roomId&&(w.messageId?j.clientMessageId===w.messageId:!w.baseline.has(j.id)));
      const lines=(bot.chat||[]).filter(l=>!w.baseline.has(l.id));w.seen||=jobs.length>0||lines.some(l=>l.clientMessageId===w.messageId);
      pending=bot.planning||jobs.some(j=>activeStatuses.has(j.status));replies=[...jobs.filter(j=>j.status==='completed').map(j=>j.result),...lines.filter(l=>l.who===bot.name&&l.coordinator).map(l=>l.text)].filter(Boolean);
      error=jobs.find(j=>['error','aborted','needs_review','not_started'].includes(j.status))?.error||'';
    }else{
      const room=state.rooms.find(r=>r.id===target.id);if(!room){halt();return;}const line=room.log?.find(l=>l.clientMessageId===w.messageId);w.seen||=!!line;
      const jobs=state.jobs.filter(j=>j.roomId===target.id&&!w.baseline.has(j.id));pending=room.planning||jobs.some(j=>activeStatuses.has(j.status));
      const lines=(room.log||[]).filter(l=>!w.baseline.has(l.id)&&l.who!=='User'&&l.who!=='System'&&!l.progress&&l.text);const summaries=lines.filter(l=>l.summary);replies=(summaries.length?summaries:lines.filter(l=>l.jobId||l.coordinator)).map(l=>l.who+'：'+l.text);
      error=jobs.find(j=>j.status==='error')?.error||'';
    }
    if(!w.seen){if(Date.now()-w.at>180000){waiting=null;fail(Error('语音消息未被接收，请检查聊天中的发送状态后重试。'));}return;}if(pending)return;if(!replies.length&&!error){if(Date.now()-w.at>180000){waiting=null;fail(Error('尚未收到回复，请检查会话执行状态。'));}return;}
    waiting=null;if(error&&!replies.length){fail(Error(error));return;}pendingReply=replies.join('\n\n');if(paused)return;const reply=pendingReply;pendingReply=null;speak(reply,true);
  }
  return {
    async toggle(){if(conversation){halt();return;}if(working)return;if(starting){halt();return;}if(recording){await finish();return;}if(recognition){recognition.stop();return;}await start();},
    async continuous(){if(conversation){halt();return;}halt();const selected=getTarget();if(!selected){notice('请先选择一个 Bot 或群聊。');return;}target={...selected};conversation=true;await start();},
    pause(){if(!conversation)return;paused=!paused;generation++;stopCapture();working=false;starting=false;stopSpeech();if(paused){status('paused');return;}configuration=null;if(waiting){status('thinking');update(getState());}else if(pendingReply){const reply=pendingReply;pendingReply=null;speak(reply,true);}else void start();},
    update,selectionChanged:halt,speak:async text=>{try{configuration??=(await call('team.extensions',{action:'get'})).config;speak(text,false);}catch(e){notice(e.message||String(e));}},stop:halt,dispose(){halt();disposed=true;}
  };
}
