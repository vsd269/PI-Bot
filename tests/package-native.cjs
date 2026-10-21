'use strict';
// Optional PI host-core installer check, always in a new temporary data root.
const {spawn}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
(async()=>{
  const root=path.resolve(__dirname,'..'),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  const host=process.env.PI_BOT_HOST_CORE;if(!host)throw Error('Set PI_BOT_HOST_CORE to the PI Desktop host-core executable.');
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'pi-bot-installer-'));
  const child=spawn(host,[],{env:{...process.env,PI_DESKTOP_DATA_DIR:data},stdio:['pipe','pipe','pipe'],windowsHide:true});
  const pending=new Map();let serial=0,buffer='',stderr='';
  child.stderr.on('data',b=>stderr=(stderr+b).slice(-2000));
  child.on('error',error=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();});
  child.on('exit',()=>{for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Native host exited before replying'));}pending.clear();});
  child.stdout.on('data',b=>{buffer+=b;for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let msg;try{msg=JSON.parse(line);}catch{continue;}const item=pending.get(msg.id);if(!item)continue;pending.delete(msg.id);clearTimeout(item.timer);msg.error?item.reject(Error(JSON.stringify(msg.error))):item.resolve(msg.result);}});
  function rpc(method,params){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('timeout '+method+' '+stderr));},20000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
  try{
    const handshake=await rpc('app.handshake',{protocolVersion:11});
    const file=path.join(root,'dist',`${manifest.id}-${manifest.version}.piplug`),sha=createHash('sha256').update(await fs.readFile(file)).digest('hex');
    await rpc('plugins.installFromPackage',{path:file,enable:true,grantedPermissions:manifest.permissions,expectedShasum:sha});
    const installed=path.join(data,'plugins','installed',manifest.id),loaded=JSON.parse(await fs.readFile(path.join(installed,'manifest.json'),'utf8'));
    assert.equal(loaded.version,manifest.version);assert.equal(loaded.id,manifest.id);
    const checks=JSON.parse(await fs.readFile(path.join(installed,'checksums.json'),'utf8'));
    for(const [name,expected] of Object.entries(checks.files)){
      const target=path.resolve(installed,name);assert(target.startsWith(path.resolve(installed)+path.sep));
      assert.equal(createHash('sha256').update(await fs.readFile(target)).digest('hex'),expected,name);
    }
    const result={pass:true,hostVersion:handshake.version,version:manifest.version,id:manifest.id,filesVerified:Object.keys(checks.files).length,isolatedProfile:true};
    await fs.mkdir(path.join(root,'output'),{recursive:true});await fs.writeFile(path.join(root,'output','native-installer.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{
    for(const item of pending.values())clearTimeout(item.timer);
    child.stdin.end();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);});
    assert.equal(path.dirname(path.resolve(data)),path.resolve(os.tmpdir()));assert(path.basename(data).startsWith('pi-bot-installer-'));
    await fs.rm(data,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
