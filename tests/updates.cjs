'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createUpdateChecker,newer,releaseInfo,version}=require('../src/updates');
const repo='https://github.com/vsd269/PI-Bot';
function release(v='0.3.80'){const tag='v'+v,name='PI-bot-'+v+'.piplug';return {tag_name:tag,html_url:repo+'/releases/tag/'+tag,draft:false,prerelease:false,assets:[{name,state:'uploaded',size:100,browser_download_url:repo+'/releases/download/'+tag+'/'+name}]};}
test('version ordering handles numeric components and never promotes prereleases',()=>{
 assert(newer('0.3.100','0.3.99'));assert(newer('1.0.0','0.99.99'));assert(!newer('0.3.9','0.3.79'));assert(!newer('0.3.79','0.3.79'));assert(!newer('0.3.80-beta.1','0.3.79'));assert(newer('0.3.79','0.3.79-beta.1'));assert.equal(version('0.03.80'),null);assert.equal(version('garbage'),null);
});
test('offers only complete stable releases with an own-repository package',()=>{
 assert.equal(releaseInfo(release(),'0.3.79').status,'available');assert.equal(releaseInfo(release('0.3.78'),'0.3.79').status,'current');
 for(const mutate of [r=>r.draft=true,r=>r.prerelease=true,r=>r.html_url='https://evil.test',r=>r.assets=[],r=>r.assets[0].browser_download_url='https://evil.test/install.piplug',r=>r.assets[0].size=0,r=>r.assets[0].state='new',r=>r.tag_name='v0.3.80-beta']){const r=release();mutate(r);assert.throws(()=>releaseInfo(r,'0.3.79'));}
});
test('canonical marketplace asset is preferred while older Releases remain readable',()=>{
 const old=release(),canonical=structuredClone(old.assets[0]);canonical.name='local.ds-bot-0.3.80.piplug';canonical.browser_download_url=repo+'/releases/download/v0.3.80/'+canonical.name;
 assert(releaseInfo(old,'0.3.79').downloadUrl.endsWith('/PI-bot-0.3.80.piplug'));
 old.assets.push(canonical);assert(releaseInfo(old,'0.3.79').downloadUrl.endsWith('/local.ds-bot-0.3.80.piplug'));
 old.assets=[canonical];assert.equal(releaseInfo(old,'0.3.79').status,'available');
 canonical.browser_download_url='https://evil.test/'+canonical.name;assert.throws(()=>releaseInfo(old,'0.3.79'));
});
test('concurrent callers share a bounded public request and six-hour cache',async()=>{
 let count=0,finish,clock=0;
 const checker=createUpdateChecker({current:'0.3.79',now:()=>clock,fetchJSON:async(url,options,max)=>{count++;assert.equal(url,'https://api.github.com/repos/vsd269/PI-Bot/releases/latest');assert.equal(options.timeoutMs,8000);assert(!options.headers.Authorization);assert.equal(max,512*1024);await new Promise(r=>finish=r);return release();}});
 const a=checker.check(),b=checker.check({force:true});assert.equal(a,b);assert.equal(count,1);finish();assert.equal((await a).status,'available');assert.equal((await b).latest,'0.3.80');await checker.check();assert.equal(count,1);
 clock=6*60*60*1000+1;const c=checker.check();assert.equal(count,2);finish();await c;
 const d=checker.check({force:true});assert.equal(count,3);finish();await d;
});
test('network failures never report latest; manual retry bypasses failure cache',async()=>{
 let count=0,clock=0;
 const checker=createUpdateChecker({current:'0.3.79',now:()=>clock,fetchJSON:async()=>{if(++count<3)throw Object.assign(Error('private request detail'),{status:429});return release();}});
 const a=await checker.check();assert.equal(a.status,'error');assert(!JSON.stringify(a).includes('private request detail'));await checker.check();assert.equal(count,1);
 const b=await checker.check({force:true});assert.equal(b.status,'error');clock=15*60*1000+1;assert.equal((await checker.check()).status,'available');assert.equal(count,3);
});
test('the updater bridge is whitelisted and independent of bootstrap and transcript',()=>{
 const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
 const main=fs.readFileSync(path.join(root,'main.js'),'utf8'),app=fs.readFileSync(path.join(root,'renderer/app.mjs'),'utf8');
 assert(main.includes("case 'team.updates': return updates.check"));assert(main.includes("if(!['team.updates'"));assert(app.includes('updateNotice.dispose()'));assert(!fs.readFileSync(path.join(root,'src/updates.js'),'utf8').includes('team.snapshot'));
});
