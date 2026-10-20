'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?!['node_modules','.git','dist'].includes(e.name)?walk(path.join(dir,e.name)):[]:/\.(?:js|mjs|cjs)$/.test(e.name)?[path.join(dir,e.name)]:[]);}
const files=walk(root);
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stderr||'Syntax check failed: '+file);process.exit(1);}}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
if(manifest.version!==pkg.version)throw Error('package.json and manifest.json versions differ');
console.log(`PASS: ${files.length} script syntax checks and matching versions (${manifest.version}).`);
