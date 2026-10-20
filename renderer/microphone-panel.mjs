import {openCapture,base64Of} from './speech-capture.mjs';
const $=id=>document.getElementById(id),call=input=>window.pluginBridge.invoke('microphone.panel',input);
const selection=$('devices');selection.value='';let capture,id='',testMode=false,testing=false,stopped=false,processing=false;
let testTimer;
function note(error){return error?.kind==='blocked'?'录音权限被阻止。请在 PI 插件权限中允许麦克风，并检查 Windows“允许桌面应用访问麦克风”。':error?.kind==='missing'?'所选麦克风已断开，请检测并选择其他设备。':error?.kind==='failed'?'无法打开麦克风，请检查设备是否被其他应用独占。':error.message||String(error);}
async function devices(authorize=false){
  let stream;try{if(authorize)stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});const list=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');const prior=selection.value||localStorage.getItem('pi-bot.microphone')||'';selection.replaceChildren(new Option('系统默认麦克风',''));list.forEach((d,i)=>selection.append(new Option(d.label||'麦克风 '+(i+1),d.deviceId)));if(prior&&!list.some(d=>d.deviceId===prior))selection.append(new Option('上次选择的麦克风（请检测确认）',prior));selection.value=prior;await call({action:'devices',devices:list.map(d=>({deviceId:d.deviceId,label:d.label})),selected:selection.value});return list;}finally{stream?.getTracks().forEach(t=>t.stop());}}
function release(){clearTimeout(testTimer);capture?.cancel();capture=null;$('stop').hidden=true;selection.disabled=false;$('test').disabled=false;$('meter').style.width='0';}
async function start(recordId){release();id=recordId;testMode=!id;selection.disabled=true;$('test').disabled=true;capture=await openCapture({deviceId:selection.value});await devices();$('stop').hidden=false;$('status').textContent=testMode?'请说话，观察音量条是否变化。测试音频不会上传。':'正在录音…';if(id)await call({action:'status',id,status:'listening',level:0});else testTimer=setTimeout(()=>{release();testMode=false;$('status').textContent='麦克风测试已结束。';},15000);}
async function finish(){const current=capture,recordId=id;capture=null;processing=true;try{const bytes=await current.finish(60);if(id!==recordId)return;$('status').textContent='正在转写…';const encoded=base64Of(bytes||new Uint8Array());for(let offset=0;offset<encoded.length;offset+=48000){if(id!==recordId)return;await call({action:'chunk',id:recordId,offset,chunk:encoded.slice(offset,offset+48000)});}await call({action:'complete',id:recordId,empty:!bytes});if(id===recordId)$('status').textContent='已完成，等待下一次录音。';}catch(e){if(id===recordId){$('status').textContent=note(e);await call({action:'status',id:recordId,status:'error',error:note(e)}).catch(()=>{});}}finally{if(id===recordId){processing=false;release();}}}
$('detect').onclick=async()=>{if(capture||testing)return;testing=true;try{const list=await devices(true);$('status').textContent='检测到 '+list.length+' 个输入设备。请选择后测试。';}catch(e){$('status').textContent=note(e);}finally{testing=false;}};
selection.onchange=()=>{localStorage.setItem('pi-bot.microphone',selection.value);void devices().catch(()=>{});};
$('test').onclick=async()=>{if(testing)return;testing=true;try{await start('');}catch(e){release();$('status').textContent=note(e);}finally{testing=false;}};
$('stop').onclick=async()=>{const active=id;release();testMode=false;id='';$('status').textContent='麦克风已停止。';if(active)await call({action:'status',id:active,status:'error',error:'录音已在麦克风面板中停止，请重新开启语音。'});};
async function tick(){try{
  if(stopped)return;const command=await call({action:'poll'});
  if(command.command==='start'&&(command.id!==id||!capture)&&!processing&&!testing){try{await start(command.id);}catch(e){release();id=command.id;await call({action:'status',id,status:'error',error:note(e)});$('status').textContent=note(e);}}
  else if(command.id===id&&command.command==='finish'&&capture&&!processing)void finish();
  else if(!testMode&&(capture||processing)&&(command.id!==id||command.command==='cancel'||command.command==='error')){id='';processing=false;release();}
  if(capture){const level=capture.level();$('meter').style.width=Math.round(level*100)+'%';if(id)await call({action:'status',id,status:'listening',level});}
}catch(e){release();$('status').textContent=note(e);if(id)await call({action:'status',id,status:'error',error:note(e)}).catch(()=>{});}finally{if(!stopped)setTimeout(tick,250);}}
window.addEventListener('pagehide',()=>{stopped=true;release();});void devices().catch(()=>{});void tick();
