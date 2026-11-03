'use strict';
const fs=require('node:fs/promises');
const {execFile}=require('node:child_process');
async function processStarted(pid){
  if(!Number.isSafeInteger(pid)||pid<1)return null;
  try{
    if(pid===process.pid)return Date.now()-process.uptime()*1000;
    if(process.platform==='win32'){
      const command='[Console]::Write((Get-CimInstance Win32_Process -Filter "ProcessId = '+pid+'").CreationDate.ToUniversalTime().ToString("o"))';
      const text=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:4000,maxBuffer:4096},(error,stdout)=>error?reject(error):resolve(stdout.trim())));
      const at=Date.parse(text);return Number.isFinite(at)?at:null;
    }
    if(process.platform==='linux'){
      const [stat,uptime]=await Promise.all([fs.readFile('/proc/'+pid+'/stat','utf8'),fs.readFile('/proc/uptime','utf8')]);
      const ticks=Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[19]);
      // Linux USER_HZ is 100 for /proc process statistics.
      return Date.now()-Number(uptime.split(' ')[0])*1000+ticks*10;
    }
    return null;
  }catch{return null;}
}
async function sameOwner(owner,lockTime,probe=processStarted,alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='ESRCH'?false:null;}}){
  const running=alive(owner.pid);if(running===false)return false;
  let started;try{started=await probe(owner.pid);}catch{return true;}
  if(started===null)return true; // Unknown is never permission to steal a lock.
  if(Number.isFinite(owner.startedAt))return Math.abs(started-owner.startedAt)<3000;
  return !(Number.isFinite(lockTime)&&started>lockTime+3000);
}
module.exports={processStarted,sameOwner};
