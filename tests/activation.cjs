'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createActivation}=require('../src/activation');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('activation returns before migration completes and never exposes partial state',async()=>{
 const gate=deferred(),active={complete:true};let starts=0;
 const a=createActivation(async()=>{starts++;await gate.promise;return active;},async()=>{});
 assert.equal(a.begin(),undefined);a.begin();assert.equal(a.status().phase,'loading');
 let ready=false;const pending=a.ready().then(v=>{ready=true;return v;});await Promise.resolve();assert.equal(ready,false);assert.equal(starts,1);
 gate.resolve();assert.equal(await pending,active);assert.equal(a.status().phase,'ready');await a.close();
});
test('startup failure is actionable and retries only on explicit request',async()=>{
 let attempts=0;const a=createActivation(async()=>{if(++attempts===1)throw Error('请先停用旧版');return {ok:true};},async()=>{});
 await assert.rejects(a.ready(),/停用旧版/);assert.equal(a.status().phase,'error');assert.equal(attempts,1);
 assert.match(a.status().message,/停用旧版/);assert.equal(a.status({retry:true}).phase,'loading');assert.deepEqual(await a.ready(),{ok:true});await a.close();
});
test('closing during migration aborts it and disposes a late result exactly once',async()=>{
 const gate=deferred(),stopped=[];let signal;const a=createActivation(async s=>{signal=s;await gate.promise;return 'late';},async v=>stopped.push(v));
 a.begin();const pending=a.ready();await Promise.resolve();await a.close();assert.equal(signal.aborted,true);gate.resolve();await assert.rejects(pending,/停止/);
 assert.equal(a.status().phase,'closed');assert.deepEqual(stopped,['late']);await a.close();assert.deepEqual(stopped,['late']);await assert.rejects(a.ready(),/停止/);
});
test('closing ready activation stops resources once and cannot restart',async()=>{
 let stops=0;const a=createActivation(async()=>({}),async()=>{stops++;});await a.ready();await Promise.all([a.close(),a.close()]);assert.equal(stops,1);a.begin();assert.equal(a.status({retry:true}).phase,'closed');
});
test('aborted startup rejection remains closed without an unhandled failure',async()=>{
 const gate=deferred();const a=createActivation(async signal=>{await gate.promise;signal.throwIfAborted();},async()=>assert.fail('no resources'));
 a.begin();await Promise.resolve();await a.close();gate.resolve();await assert.rejects(a.ready(),/停止/);await Promise.resolve();assert.equal(a.status().phase,'closed');
});
test('partial Team shutdown does not checkpoint a default replacement roster',async()=>{
 const {Team}=require('../src/team');const t=new Team({events:{off:()=>assert.fail('no listener registered')}});let checkpoints=0;
 t.data='C:\\test';t.backups={root:'C:\\backup',checkpoint:async()=>checkpoints++};await t.close({checkpoint:false});assert.equal(checkpoints,0);
});
