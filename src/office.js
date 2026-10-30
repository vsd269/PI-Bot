'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {execFile}=require('node:child_process');
const CLI=path.join(__dirname,'vendor','office','office.mjs');
const GUIDE=path.join(__dirname,'vendor','office','GUIDE.md');
function candidates(env=process.env){
  // Do not mistake the PI/Electron executable for a Node interpreter.
  if(env.PI_BOT_OFFICE_NODE)return [env.PI_BOT_OFFICE_NODE];
  let sea=true;try{sea=require('node:sea').isSea();}catch{}
  const nodes=[];
  if(!process.versions.electron&&!sea&&process.release?.name==='node')nodes.push(process.execPath);
  const name=process.platform==='win32'?'node.exe':'node';
  for(const folder of String(env.PATH||env.Path||'').split(path.delimiter)){
    const clean=folder.replace(/^"|"$/g,'');if(path.isAbsolute(clean))nodes.push(path.join(clean,name));
  }
  return [...new Set(nodes)];
}
function probe(node){return new Promise(resolve=>{
  execFile(node,['-p','JSON.stringify({node:process.versions.node,electron:!!process.versions.electron,sea:require("node:sea").isSea()})'],{encoding:'utf8',timeout:2500,maxBuffer:4096,windowsHide:true},(error,stdout)=>{
    if(error)return resolve(null);
    try{const info=JSON.parse(stdout.trim());resolve(!info.electron&&!info.sea&&Number(info.node.split('.')[0])>=20?info.node:null);}catch{resolve(null);}
  });
});}
async function detectOffice({env=process.env,probeNode=probe}={}){
  if(!(await fs.stat(CLI).catch(()=>null))?.isFile())return {available:false,reason:'Office 工具文件缺失，请重新安装 PI Bot。'};
  for(const node of candidates(env)){
    if(!path.isAbsolute(node)||!(await fs.stat(node).catch(()=>null))?.isFile())continue;
    const version=await probeNode(node);if(version)return {available:true,node,version,cli:CLI,guide:GUIDE};
  }
  return {available:false,reason:env.PI_BOT_OFFICE_NODE?'指定的 PI_BOT_OFFICE_NODE 不是可用的独立 Node.js 20+。':'未找到独立 Node.js 20+。安装 Node.js 并重启 PI Desktop，或设置 PI_BOT_OFFICE_NODE 为 node 的绝对路径。',cli:CLI,guide:GUIDE};
}
let cached;
async function officeTools({refresh=false}={}){
  if(refresh||!cached||Date.now()-cached.at>60000){const result=detectOffice();cached={at:Date.now(),result};}
  const runtime=await cached.result;
  return {...runtime,execution:'通过 PI 原生文件/命令工具执行，保留会话权限确认；此工具只提供环境和说明，不读取或修改用户文档。',limits:'不含完整排版渲染、PDF 导出或 Excel 公式重算环境；.doc/.xls/.ppt 旧格式需先转换。',...(runtime.available?{instructions:await fs.readFile(GUIDE,'utf8')}:{} )};
}
module.exports={officeTools,detectOffice,candidates,CLI,GUIDE};
