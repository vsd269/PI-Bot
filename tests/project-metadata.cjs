'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),repo='https://github.com/vsd269/PI-Bot';
test('project identity points to PI Bot and keeps the installed plugin identity',()=>{
 const manifest=JSON.parse(read('manifest.json')),pkg=JSON.parse(read('package.json'));
 assert.equal(manifest.id,'local.ds-bot');assert.equal(manifest.homepage,repo);assert.equal(manifest.version,pkg.version);assert.equal(pkg.repository.url,repo+'.git');
});
test('about, release and feedback links use PI Bot, with distinct upstream attribution',()=>{
 const source=read('renderer/settings-pages.mjs');assert(source.includes(`const REPO='${repo}'`));assert(source.includes("const UPSTREAM='https://github.com/Fei2411/DeepSeek-Bot'"));
 assert(source.includes("href('☆ Star',REPO)"));assert(source.includes("REPO+'/issues/new'"));assert(source.includes("REPO+'/releases'"));assert(source.includes("href('DeepSeek-Bot',UPSTREAM)"));
 assert(source.includes('版本 '+JSON.parse(read('manifest.json')).version));
});
test('original license, source provenance and vendored dependency license are preserved',()=>{
 assert(read('LICENSE').includes('Apache License'));assert(read('NOTICE').includes('Fei2411/DeepSeek-Bot'));assert(read('renderer/upstream/provenance.json').includes('d56c5850847b828dbc93e232fefcb81a94f80c89'));assert(read('src/vendor/ws/LICENSE').includes('Permission is hereby granted'));
});
