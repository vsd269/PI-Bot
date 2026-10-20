'use strict';
// Validate the actual STORE ZIP, CRCs and source checksums without dependencies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),file=path.join(root,'dist',`PI-bot-${manifest.version}.piplug`),bytes=fs.readFileSync(file),entries=new Map();
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(data){let n=0xffffffff;for(const b of data)n=table[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
let at=0;
while(bytes.readUInt32LE(at)===0x04034b50){
 assert.equal(bytes.readUInt16LE(at+8),0,'PI packages require STORE');
 const size=bytes.readUInt32LE(at+18),length=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),name=bytes.subarray(at+30,at+30+length).toString('utf8'),start=at+30+length+extra,data=bytes.subarray(start,start+size);
 assert(!entries.has(name));assert(!name.includes('..')&&!name.startsWith('/'));assert.equal(size,bytes.readUInt32LE(at+22));assert.equal(crc(data),bytes.readUInt32LE(at+14),name);entries.set(name,data);at=start+size;
}
const checks=JSON.parse(entries.get('checksums.json')).files;
for(const [name,hash] of Object.entries(checks)){assert(entries.has(name),name);assert.equal(crypto.createHash('sha256').update(entries.get(name)).digest('hex'),hash,name);assert.deepEqual(entries.get(name),fs.readFileSync(path.join(root,name)),name);}
assert.equal(entries.size,Object.keys(checks).length+1);assert.equal(JSON.parse(entries.get('manifest.json')).version,manifest.version);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(root,'dist','SHA256SUMS.txt'),`${sha256}  ${path.basename(file)}\n`);
console.log(JSON.stringify({version:manifest.version,files:entries.size,verifiedFiles:Object.keys(checks).length,bytes:bytes.length,sha256},null,2));
