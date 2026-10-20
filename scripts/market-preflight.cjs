'use strict';
// Local reproduction of the four observed submission blockers, not the full
// plugin-center audit. Always inspect the actual package that will be uploaded.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),manifest=require('../manifest.json');
const file=path.resolve(process.argv[2]||path.join(root,'dist',`${manifest.id}-${manifest.version}.piplug`));
const bytes=fs.readFileSync(file),entries=new Map();let at=0;
while(at+30<=bytes.length&&bytes.readUInt32LE(at)===0x04034b50){
 if(bytes.readUInt16LE(at+8)!==0)throw Error('Expected ZIP STORE');
 const size=bytes.readUInt32LE(at+18),len=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),name=bytes.subarray(at+30,at+30+len).toString('utf8'),start=at+30+len+extra;
 if(start+size>bytes.length)throw Error('Truncated ZIP');
 entries.set(name,bytes.subarray(start,start+size));at=start+size;
}
const packaged=JSON.parse(entries.get('manifest.json')),expected=`${packaged.id}-${packaged.version}.piplug`,findings=[];
if(path.basename(file)!==expected)findings.push({code:'PKG012',expected,actual:path.basename(file)});
for(const [name,data] of entries){
 if(!/\.(?:js|mjs|cjs)$/.test(name))continue;
 const source=data.toString('utf8');
 for(const match of source.matchAll(/\bimport\s*\((?!\s*['"`])/g))findings.push({code:'SEC003',file:name,line:source.slice(0,match.index).split('\n').length,detail:'non-literal import-like call'});
}
console.log(JSON.stringify({file,scope:'Observed PKG012 / SEC003 patterns only; not full platform approval',blockers:findings.length,findings},null,2));
if(findings.length)process.exitCode=1;
