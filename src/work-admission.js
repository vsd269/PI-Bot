'use strict';
const {randomUUID}=require('node:crypto');
const {StateEdit}=require('./state-edit');
const groupWork=require('./group-stop');
const privacy=require('./privacy');
// One writer claims work in the same snapshot as the job and its source links.
// A persisted claim is never replayed blindly after a restart.
function validateClaims(state){
  if(state.workClaims===undefined)return;
  const seen=new Set();
  if(!Array.isArray(state.workClaims)||state.workClaims.length>20000)throw Error('续跑领取记录无效。');
  for(const r of state.workClaims){
    if(!r||typeof r.key!=='string'||!r.key||r.key.length>500||seen.has(r.key)||typeof r.jobId!=='string'||!r.jobId||r.jobId.length>120||!['accepted','interrupted'].includes(r.status)||!Number.isFinite(Date.parse(r.at)))throw Error('续跑领取记录无效。');
    seen.add(r.key);
  }
}
function validateBatches(state){
  if(state.workBatches===undefined)return;
  if(!Array.isArray(state.workBatches)||state.workBatches.length>20000)throw Error('任务批次记录无效。');
  const seen=new Set();
  for(const b of state.workBatches){
    if(!b||typeof b.id!=='string'||!b.id||b.id.length>120||seen.has(b.id)||!Array.isArray(b.jobIds)||b.jobIds.length>1000||b.jobIds.some(id=>typeof id!=='string'||!id||id.length>120)||new Set(b.jobIds).size!==b.jobIds.length||typeof b.request!=='string'||b.request.length>1000000||!['running','planning','completed','needs_review'].includes(b.status)||!Number.isInteger(b.depth)||b.depth<0||b.depth>2||b.groupEpoch!==undefined&&(!Number.isSafeInteger(b.groupEpoch)||b.groupEpoch<0)||b.roomId!==undefined&&(typeof b.roomId!=='string'||!b.roomId||b.roomId.length>120)||b.adminId!==undefined&&(typeof b.adminId!=='string'||!b.adminId||b.adminId.length>120))throw Error('任务批次记录无效。');
    seen.add(b.id);
  }
}
async function admit(team,{room=null,bot,task,roundId,options={},key,check,change}){
  if(room)options={...options,groupEpoch:options.groupEpoch??groupWork.epoch(room)};
  let release,job,duplicate=false;const gate=new Promise(resolve=>{release=resolve;}),edit=new StateEdit();
  try{
    await team.save(()=>edit.rollback(),()=>{
      if(team.stopped||team.storeConflict)throw Error('插件已停止或数据存在冲突，未启动任务。');
      if(!team.state.bots.includes(bot)||room&&(!team.state.rooms.includes(room)||!room.members.includes(bot.id)))throw Error('任务成员或原群聊已移除。');
      if(room)groupWork.assertCurrent(team,room,options.groupEpoch??groupWork.epoch(room));
      privacy.assertRun(team,bot,room,options);check?.();
      if(key){
        const existing=(team.state.workClaims||[]).find(row=>row.key===key);
        if(existing){job=team.state.jobs.find(row=>row.id===existing.jobId);if(!job)throw Error('任务已经领取，但执行记录需要核对；没有重新提交。');duplicate=true;return;}
        if((team.state.workClaims||[]).length>=20000)throw Error('任务领取记录已满，请先备份并清理历史。');
      }
      job=team.enqueue(room,bot,task,roundId,{...options,id:options.id||randomUUID()},gate);
      edit.undo.push(()=>{job.cancelled=true;team.state.jobs=team.state.jobs.filter(row=>row!==job);});
      if(options.parentJobId){
        const parent=team.state.jobs.find(row=>row.id===options.parentJobId);
        if(!parent||parent.cancelled)throw Error('原任务已停止或移除。');
        if(!(parent.childIds||[]).includes(job.id))edit.append(parent,'childIds',job.id);
      }
      if(key)edit.append(team.state,'workClaims',{key,jobId:job.id,status:'accepted',at:new Date().toISOString()});
      change?.(edit,job);
    });
    release(!duplicate);return job;
  }catch(error){edit.rollback();release(false);throw error;}
}
async function admitBatch(team,{room=null,assignments,roundId=randomUUID(),options={},request,adminId,depth=0,sourceBatch}){
  if(!assignments.length)return [];
  if(room)options={...options,groupEpoch:options.groupEpoch??groupWork.epoch(room)};
  // Private planner assignments keep their existing path; only a group with
  // its own administrator has a result-collection batch.
  const collectResults=Boolean(room&&adminId);
  const edit=new StateEdit(),jobs=[];let release;const gate=new Promise(resolve=>{release=resolve;});
  try{
    await team.save(()=>edit.rollback(),()=>{
      if(team.stopped||team.storeConflict)throw Error('插件已停止或数据存在冲突。');
      if(room)groupWork.assertCurrent(team,room,options.groupEpoch??groupWork.epoch(room));
      if(collectResults&&(team.state.workBatches||[]).length>=20000)throw Error('任务批次记录已满，请先备份并清理历史。');
      if(sourceBatch&&(sourceBatch.status!=='planning'||sourceBatch.nextBatchId||!team.state.workBatches?.includes(sourceBatch)))throw Error('原批次已经改变，没有重复分派后续工作。');
      for(const assignment of assignments){
        const bot=team.bot(assignment.botId);
        if(room&&!room.members.includes(bot.id))throw Error('执行成员已经离开群聊。');
        const job=team.enqueue(room,bot,assignment.task,roundId,{...options,...(collectResults?{batchId:roundId}:{}),clientMessageId:undefined,sourceUserContent:request},gate);jobs.push(job);
        edit.undo.push(()=>{job.cancelled=true;team.state.jobs=team.state.jobs.filter(j=>j!==job);});
      }
      if(collectResults)edit.append(team.state,'workBatches',{id:roundId,roomId:room.id,adminId,scheduleRunId:options.scheduleRunId,groupEpoch:options.groupEpoch,jobIds:jobs.map(j=>j.id),request,status:'running',depth,at:new Date().toISOString()});
      if(sourceBatch){edit.set(sourceBatch,'nextBatchId',roundId);edit.set(sourceBatch,'status','completed');edit.set(sourceBatch,'resultIds',sourceBatch.jobIds.slice());}
    });
    release(true);return jobs;
  }catch(error){edit.rollback();release(false);throw error;}
}
module.exports={admit,admitBatch,validateClaims,validateBatches};
