'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Vault}=require('../src/vault');
function fixture(){
 const team={backups:{root:require('node:os').tmpdir()},state:{bots:[{id:'worker',name:'Worker'}]},bridge:{close:async()=>{}}};
 const vault=new Vault(team);let saves=0;
 // Isolate DPAPI persistence. Encryption under test is real scrypt + AES-GCM.
 vault.persist=async rows=>{vault.validate(rows);vault.entries=rows;saves++;};
 return {vault,saves:()=>saves};
}
test('renamed secret-transfer importer preserves encrypted export and both scopes',async()=>{
 const source=fixture().vault;source.entries=[{botId:'worker',name:'TEST_SECRET',value:'test-only-synthetic-value'},{botId:'@speech',name:'SPEECH_KEY',value:'test-only-speech-value'}];
 const text=await source.export({password:'test-only-migration-password'});
 assert(!text.includes('test-only-synthetic-value'));
 const {vault,saves}=fixture();assert.deepEqual(await vault.importTransfer({password:'test-only-migration-password',text}),{imported:2});assert.equal(saves(),1);
 assert.equal(vault.value('worker','TEST_SECRET'),'test-only-synthetic-value');assert.equal(vault.speechValue('SPEECH_KEY'),'test-only-speech-value');
});
test('bad password and modified encrypted transfer never persist entries',async()=>{
 const source=fixture().vault;source.entries=[{botId:'worker',name:'TEST_SECRET',value:'test-only-synthetic-value'}];
 const text=await source.export({password:'test-only-migration-password'}),{vault,saves}=fixture();
 await assert.rejects(vault.importTransfer({password:'wrong-test-password',text}),/迁移密码错误/);
 const data=JSON.parse(text),bytes=Buffer.from(data.data,'base64');bytes[0]^=1;data.data=bytes.toString('base64');
 await assert.rejects(vault.importTransfer({password:'test-only-migration-password',text:JSON.stringify(data)}),/迁移密码错误/);assert.equal(saves(),0);assert.deepEqual(vault.entries,[]);
});
test('chunked upload commits through the renamed method and removes staging on failure',async()=>{
 const {vault}=fixture(),{id}=await vault.transfer({action:'begin'});
 await vault.transfer({action:'chunk',id,chunk:'synthetic-transfer',offset:0});let actual;
 vault.importTransfer=async input=>{actual=input;return {imported:1};};
 assert.deepEqual(await vault.transfer({action:'commit',id,password:'test-password'}),{imported:1});assert.deepEqual(actual,{text:'synthetic-transfer',password:'test-password'});assert.equal(vault.uploads.size,0);
 const next=await vault.transfer({action:'begin'});vault.importTransfer=async()=>{throw Error('synthetic failure');};await assert.rejects(vault.transfer({action:'commit',id:next.id}),/synthetic failure/);assert.equal(vault.uploads.size,0);
});
test('renderer secret import channel remains compatible without import-like method names',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
 const main=fs.readFileSync(path.join(root,'main.js'),'utf8');assert(main.includes("case 'team.secret.import': return team.vault.importTransfer(input)"));
 for(const name of ['main.js','src/vault.js'])assert(!/\bimport\s*\((?!\s*['"`])/.test(fs.readFileSync(path.join(root,name),'utf8')));
});
