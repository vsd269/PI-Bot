'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');
const load=file=>import(pathToFileURL(path.join(__dirname,'../renderer',file)).href);
function environment(ctx){
  const old=new Map(['window','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  globalThis.window={speechSynthesis:{cancel(){},getVoices:()=>[],speak(u){window.lastSpeech=u;}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  return ()=>{for(const [k,v] of old)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];};
}
test('dictation streams during capture, inserts only final recognition, and ignores a cancelled late result',async ctx=>{
  const restore=environment(ctx);const {createVoice}=await load('voice.mjs');let inserted=[],options,resolve;
  const voice=createVoice({call:async()=>({config:{speechGlobal:{provider:'qwen',model:'fun-asr-realtime'}}}),getTarget:()=>({kind:'bot',id:'b'}),insert:t=>inserted.push(t),send(){},notice:e=>{throw Error(e);},onStatus(){},captureAudio:async o=>{options=o;return {cancel(){},level:()=>0,finish:()=>new Promise(r=>resolve=r)};}});ctx.after(()=>{voice.dispose();restore();});
  await voice.toggle();assert.equal(options.mode,'dictation');assert.equal(options.realtime,true);const finish=voice.toggle();assert.deepEqual(inserted,[]);resolve({transcript:'完整的最终结果'});await finish;assert.deepEqual(inserted,['完整的最终结果']);
  await voice.toggle();const late=voice.toggle();voice.stop();resolve({transcript:'已取消的迟到结果'});await late;assert.deepEqual(inserted,['完整的最终结果']);
});
test('voice conversation collects user and assistant turns once, including a reply received while paused',async ctx=>{
  const restore=environment(ctx);const {createVoice}=await load('voice.mjs');const state={bots:[{id:'b',name:'助手',chat:[]}],rooms:[],jobs:[]};let last,options;
  const voice=createVoice({call:async()=>({config:{speechGlobal:{provider:'qwen',model:'fun-asr-realtime',interruption:'off'}}}),getTarget:()=>({kind:'bot',id:'b'}),getState:()=>state,insert(){},send:text=>{state.jobs.push({id:'j',botId:'b',clientMessageId:'m',status:'running'});return {id:'m'};},notice:e=>{throw Error(e);},onStatus:(label,active,details)=>last=details,captureAudio:async o=>{options=o;return {cancel(){},level:()=>0,finish:async()=>({transcript:'你好'})};}});ctx.after(()=>{voice.dispose();restore();});
  await voice.continuous();assert.equal(options.mode,'call');options.onTranscribing();await new Promise(r=>setImmediate(r));assert.deepEqual(last.transcript.map(t=>t.text),['你好']);voice.pause();Object.assign(state.jobs[0],{status:'completed',result:'你好，有什么能帮你？'});voice.update(state);voice.update(state);voice.pause();assert.deepEqual(last.transcript.map(t=>[t.role,t.text]),[['user','你好'],['assistant','你好，有什么能帮你？']]);assert(window.lastSpeech.text.includes('你好'));
});
test('table parsing preserves escaped separators and code, and CSV neutralizes formulas',async()=>{
  const {tableCells,tableCsv}=await load('message-table.mjs');assert.deepEqual(tableCells('| one \\| two | `a|b` |'),['one | two','`a|b`']);assert.deepEqual(tableCells('a | b'),['a','b']);const csv=tableCsv(['列'],[['=HYPERLINK("x")'],[' +SUM(1)'],['普通文本']]);assert(csv.includes('"\'=HYPERLINK(""x"")"'));assert(csv.includes('"\' +SUM(1)"'));assert(csv.includes('普通文本'));
});
