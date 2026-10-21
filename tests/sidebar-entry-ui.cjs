'use strict';
// Optional browser regression: PI_BOT_PLAYWRIGHT_MODULE can point to a local
// Playwright installation. The dependency-free npm test suite stays portable.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PI_BOT_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output', 'sidebar');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#242424;color:white;font:14px system-ui}
aside{position:fixed;inset:0 auto 0 0;width:306px;background:#080808}
.sidebar-body{height:100%;display:flex;flex-direction:column;padding:8px}
.sessions{flex:1;min-height:0;overflow:auto}.session{height:34px}
.sidebar-footer{position:relative;display:flex;align-items:center;gap:8px;min-height:40px;margin-top:auto;padding:7px 0 2px}
.footer-actions{display:flex;gap:0}.footer-action{width:32px;height:32px;padding:0;border:0;color:#999;background:transparent}
.footer-build{margin-left:auto;font-size:12px;color:#aaa}
</style></head><body><aside><div class="sidebar-body"><div class="sessions"></div><div class="sidebar-footer"><div class="footer-actions"><button class="footer-action" data-nav="settings">S</button><button class="footer-action" data-nav="plugins">P</button><button class="footer-action">C</button><button class="footer-action">N</button></div><span class="footer-build">v0.20.1</span></div></div></aside><script type="module">
import {mountSidebarEntry} from '/renderer/sidebar-entry.mjs';
import {mountLegacy} from '/tests/fixtures/sidebar-legacy.mjs';
import {characterMarkup,MAIN_LOOK,shapeOf,MASK_ID} from '/renderer/upstream/characters.mjs';
const mark=characterMarkup(MAIN_LOOK.shape,MAIN_LOOK.color).replaceAll(MASK_ID,'sidebar-test');
const markup='<span class="bt-mark"><svg viewBox="0 0 '+shapeOf(MAIN_LOOK.shape).size+' '+shapeOf(MAIN_LOOK.shape).size+'">'+mark+'</svg></span>';
window.clicks=0;window.otherClicks=0;window.frames=0;window.placements=[];
const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>{window.frames++;return raf(fn);};
const api={ui:{openLayer(){const element=document.createElement('div');element.className='plugin-layer';document.body.append(element);return {element,close(){element.remove();}};},injectStyle(css){const s=document.createElement('style');s.textContent=css;document.head.append(s);return()=>s.remove();}}};
window.start=()=>window.dock=mountSidebarEntry(api,{label:'PI Bot',markup,onClick(){window.clicks++;},onPlacement(value){window.placements.push(value);}});
window.startOther=()=>window.other=mountLegacy(api,{column:0,label:'Other plugin',markup:'\u2727',onClick(){window.otherClicks++;}});
window.addSessions=()=>{document.querySelector('.sessions').innerHTML=Array.from({length:100},(_,i)=>'<div class="session">Conversation '+i+'</div>').join('');};
window.ready=true;
</script></body></html>`;
const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
  if(process.env.PI_BOT_PEER_MODULE&&req.url==='/tests/fixtures/sidebar-legacy.mjs'){
    res.setHeader('Content-Type','text/javascript');return res.end("export {mountSidebarEntry as mountLegacy} from '/compatibility-peer.mjs';");
  }
  if(process.env.PI_BOT_PEER_MODULE&&req.url==='/compatibility-peer.mjs'){
    res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(process.env.PI_BOT_PEER_MODULE));
  }
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':'application/octet-stream');res.end(data);});
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1000,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
    page.setDefaultTimeout(10000);
    const button=page.getByRole('button',{name:'PI Bot',exact:true}),peer=page.locator('[aria-label="Other plugin"]');
    const aligned=async(column)=>page.waitForFunction(c=>{
      const b=document.querySelector('[aria-label="PI Bot"]'),f=document.querySelector('[data-nav="settings"]');
      const p=document.querySelector('[data-nav="plugins"]');if(!b||!f||!p)return false;
      const a=b.getBoundingClientRect(),r=f.getBoundingClientRect(),s=p.getBoundingClientRect();
      return Math.abs(a.left-r.left-c*(s.left-r.left))<1;
    },column);
    const reservationCount=()=>page.locator('[data-pi-sidebar-entry-space]').count();
    const noLoop=async()=>{await page.waitForTimeout(120);const before=await page.evaluate(()=>window.frames);await page.waitForTimeout(160);assert((await page.evaluate(()=>window.frames))-before<3,'layout observers must become idle');};
    const footerBefore=await page.locator('.sidebar-footer').boundingBox();
    await page.evaluate(()=>window.start());await aligned(0);assert.equal(await reservationCount(),1);await button.click();assert.equal(await page.evaluate(()=>window.clicks),1);
    await page.screenshot({path:path.join(output,'only-pi-bot.png')});
    await page.evaluate(()=>window.startOther());await aligned(1);assert.equal(await reservationCount(),1);await noLoop();
    const peerBounds=await peer.boundingBox(),botBounds=await button.boundingBox();assert(botBounds.x>=peerBounds.x+peerBounds.width);
    await page.screenshot({path:path.join(output,'both-plugins.png')});
    await page.evaluate(()=>window.other.close());await aligned(0);assert.equal(await reservationCount(),1);await noLoop();
    await page.screenshot({path:path.join(output,'other-disabled-compacted.png')});
    await page.evaluate(()=>window.startOther());await aligned(1);
    await page.evaluate(()=>window.other.hide(true));await aligned(0);
    await page.evaluate(()=>window.other.hide(false));await aligned(1);
    await peer.evaluate(n=>n.style.visibility='hidden');await aligned(0);
    await peer.evaluate(n=>n.style.visibility='visible');await aligned(1);
    await page.evaluate(()=>{window.dock.hide(true);});await button.waitFor({state:'hidden'});
    await page.evaluate(()=>{window.dock.hide(false);});await button.waitFor();await aligned(1);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pi-bot:mode',{detail:true})));await button.waitFor({state:'hidden'});await peer.waitFor({state:'hidden'});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pi-bot:mode',{detail:false})));await button.waitFor();await aligned(1);
    await page.evaluate(()=>window.addSessions());await aligned(1);
    const sessions=await page.locator('.sessions').boundingBox(),reserved=await page.locator('[data-pi-sidebar-entry-space]').boundingBox();
    assert(sessions.y+sessions.height<=reserved.y+1,'launcher row must not cover sessions');
    await page.evaluate(()=>window.dock.close());assert.equal(await button.count(),0);assert.equal(await reservationCount(),1);
    await peer.click();assert.equal(await page.evaluate(()=>window.otherClicks),1);await noLoop();
    await page.screenshot({path:path.join(output,'pi-bot-disabled-other-remains.png')});
    await page.evaluate(()=>window.other.close());assert.equal(await reservationCount(),0);
    assert.deepEqual(await page.locator('.sidebar-footer').boundingBox(),footerBefore);
    await page.evaluate(()=>window.startOther());await page.evaluate(()=>window.start());await aligned(1);
    await page.evaluate(()=>window.other.close());await aligned(0);
    await page.evaluate(()=>{window.dock.close();window.dock.close();});assert.equal(await reservationCount(),0);
    await page.evaluate(()=>window.start());await aligned(0);await noLoop();
    await page.setViewportSize({width:800,height:600});await aligned(0);
    await page.evaluate(()=>document.querySelector('aside').remove());await button.waitFor();await noLoop();
    const fallback=await button.boundingBox();assert(fallback.x>=0&&fallback.y>=0&&fallback.y+fallback.height<=600);
    await page.evaluate(()=>window.dock.close());assert.equal(await button.count(),0);assert.equal(await reservationCount(),0);
    assert.deepEqual(errors,[]);
    const result={pass:true,peerImplementation:process.env.PI_BOT_PEER_MODULE?'installed-plugin':'legacy-fixture',automaticCompaction:true,bothLoadOrders:true,reEnable:true,hiddenPeers:true,sharedReservationPreserved:true,lastUnloadCleansRow:true,chatListNotCovered:true,observersIdle:true,fallbackReachable:true,pageErrors:errors};
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
