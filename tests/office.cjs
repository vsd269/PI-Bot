'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {CLI,detectOffice,candidates}=require('../src/office');
const fixture=name=>path.join(__dirname,'office-fixtures',name);
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
function cli(...args){const r=spawnSync(process.execPath,[CLI,...args,'--json'],{encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024,windowsHide:true});assert(!r.error,r.error?.message);const result=JSON.parse(r.stdout);return {...result,exitCode:r.status};}
async function temp(ctx){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-office-'));ctx.after(()=>fs.rm(dir,{recursive:true,force:true,maxRetries:4}));return dir;}
test('bundled Office CLI retains exact upstream bytes and dependency license',async()=>{
  const provenance=require('../src/vendor/office/PROVENANCE.json');assert.equal(digest(await fs.readFile(CLI)),provenance.sha256);assert.match(await fs.readFile(path.join(path.dirname(CLI),'LICENSE-xmldom'),'utf8'),/Permission is hereby granted/);
});
test('Office finds standalone Node and an invalid explicit override never silently falls back',async()=>{
  const result=await detectOffice();assert.equal(result.available,true);assert(Number(result.version.split('.')[0])>=20);assert(path.isAbsolute(result.node));
  const missing=await detectOffice({env:{PI_BOT_OFFICE_NODE:path.join(os.tmpdir(),'nonexistent-pi-node.exe')}});assert.equal(missing.available,false);assert.match(missing.reason,/PI_BOT_OFFICE_NODE/);assert.deepEqual(candidates({PI_BOT_OFFICE_NODE:'relative-node'}),['relative-node']);
});
test('Word edit produces a checked new file and preserves original bytes',async ctx=>{
  const dir=await temp(ctx),source=fixture('sample.docx'),before=digest(await fs.readFile(source)),target=path.join(dir,'edited.docx'),ops=path.join(dir,'ops.json');
  const read=cli('docx','read',source);assert.equal(read.ok,true);assert.match(read.data.blocks.find(b=>b.id==='p2').text,/north region/);
  await fs.writeFile(ops,JSON.stringify([{replace:{find:'north region',with:'南方区域'}},{set_cell:{table:1,row:2,col:2,text:'99'}}]));
  assert.equal(cli('docx','edit',source,'-o',target,'--ops','@'+ops).exitCode,0);
  const changed=cli('docx','read',target);assert.match(changed.data.blocks.find(b=>b.id==='p2').text,/南方区域/);assert.equal(changed.data.blocks.find(b=>b.id==='t1').rows[1][1].text,'99');assert.deepEqual(cli('check',target,'--against',source).data.findings,[]);assert.equal(digest(await fs.readFile(source)),before);
});
test('an invalid Word operation writes no partial output',async ctx=>{
  const dir=await temp(ctx),target=path.join(dir,'invalid.docx');const result=cli('docx','edit',fixture('sample.docx'),'-o',target,'--ops',JSON.stringify([{delete:{paragraphs:['p1']}},{insert:{after:'p999',text:'invalid'}}]));assert.equal(result.ok,false);assert.equal(result.exitCode,2);assert.equal(await fs.stat(target).catch(()=>null),null);
});
test('PPT inventory, slide duplication/reorder and package validation run locally',async ctx=>{
  const dir=await temp(ctx),source=fixture('sample.pptx'),target=path.join(dir,'slides.pptx'),before=digest(await fs.readFile(source));assert.equal(cli('pptx','inventory',source).data.slides.length,3);
  assert.equal(cli('pptx','slides',source,'-o',target,'--order','3,1,1').ok,true);const read=cli('pptx','inventory',target);assert.equal(read.data.slides.length,3);assert.match(JSON.stringify(read.data.slides[0]),/First box/);assert.deepEqual(cli('check',target,'--against',source).data.findings,[]);const layout=cli('pptx','layout',target);assert.equal(layout.ok,true);assert.equal(layout.exitCode,1);assert(layout.data.findings.length>0);assert.equal(digest(await fs.readFile(source)),before);
});
test('Excel reads formulas and cached values; unpack/pack roundtrip remains valid',async ctx=>{
  const dir=await temp(ctx),source=fixture('sample.xlsx'),unpacked=path.join(dir,'unpacked'),target=path.join(dir,'repacked.xlsx');const inventory=cli('xlsx','inventory',source);assert.equal(inventory.data.sheets[0].name,'Sheet1');assert.equal(inventory.data.sheets[0].formulas,3);const read=cli('xlsx','read',source,'--sheet','Sheet1','--range','A1:D5');assert.equal(read.ok,true);assert.match(JSON.stringify(read),/SUM/);
  assert.equal(cli('unpack',source,unpacked).ok,true);assert.equal(cli('pack',unpacked,target,'--against',source).ok,true);assert.deepEqual(cli('check',target,'--against',source).data.findings,[]);assert.deepEqual(cli('xlsx','read',target,'--sheet','Sheet1','--range','A1:D5').data,read.data);
});
