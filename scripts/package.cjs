const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const names=[...fs.readdirSync(root).filter(name=>/\.(md|svg)$/.test(name)||['LICENSE','NOTICE','main.js','manifest.json'].includes(name)),...walk(path.join(root,'src')).map(p=>path.relative(root,p)),...walk(path.join(root,'renderer')).map(p=>path.relative(root,p))].map(p=>p.split(path.sep).join('/')).sort();
const files=names.map(name=>({name,bytes:fs.readFileSync(path.join(root,name))}));
const checksums=Buffer.from(JSON.stringify({algorithm:'sha256',files:Object.fromEntries(files.map(f=>[f.name,crypto.createHash('sha256').update(f.bytes).digest('hex')]))},null,2)+'\n');
fs.writeFileSync(path.join(root,'checksums.json'),checksums);files.push({name:'checksums.json',bytes:checksums});
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const byte of bytes)n=table[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
let offset=0;const records=[],central=[];
for(const file of files){
  // PI host-core only accepts ZIP method 0 (STORE), including local headers.
  // A standard deflated ZIP is readable by Windows but rejected by PI.
  const name=Buffer.from(file.name),compressed=file.bytes,checksum=crc(file.bytes),local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(file.bytes.length,22);local.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50,0);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(0,10);entry.writeUInt16LE(0x21,14);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(file.bytes.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
  central.push(entry,name);records.push(local,name,compressed);offset+=local.length+name.length+compressed.length;
}
const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);
const bytes=Buffer.concat([...records,index,end]),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
fs.mkdirSync(out,{recursive:true});const file=path.join(out,`PI-bot-${manifest.version}.piplug`);fs.writeFileSync(file,bytes);
const report={file,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),files:files.map(f=>f.name)};fs.writeFileSync(path.join(out,'package-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({file,size:report.size,sha256:report.sha256,fileCount:files.length},null,2));
