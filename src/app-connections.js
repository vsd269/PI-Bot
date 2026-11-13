'use strict';

// Read-only account discovery belongs to the plugin lifecycle, not the dialog.
// Keep the cache in memory; the vault remains the authority for all grants.
class AppConnections {
  constructor(apps,{now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
    this.apps=apps;this.now=now;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.started=false;this.closed=false;this.revision=0;this.key=null;
    this.phase='disabled';this.accounts=[];this.checkedAt=null;this.nextAt=0;this.failures=0;
  }
  sync() {
    let config=null,error='';
    try{config=this.apps.config();}catch{error='无法读取应用配置，请在连接应用中检查密钥库。';}
    const key=error?'locked':this.apps.fingerprint(config);
    if(key!==this.key){
      this.key=key;this.config=config;this.error=error;this.accounts=[];this.checkedAt=null;
      this.failures=0;this.nextAt=0;this.phase=error?'error':config?'pending':'disabled';this.revision++;
      this.inflight?.controller.abort();this.inflight=null;this.clearTimer(this.timer);this.timer=null;
      this.schedule(0);
    }
    return config;
  }
  schedule(delay) {
    if(!this.started||this.closed||this.apps.team.stopped||this.apps.team.storeConflict)return;
    this.clearTimer(this.timer);
    // Also notice a vault import/unlock made outside the application dialog.
    this.timer=this.setTimer(()=>{this.timer=null;this.refresh().catch(()=>{});},this.config?delay:30000);
    this.timer?.unref?.();
  }
  start() {if(this.closed||this.started)return;this.started=true;this.sync();this.schedule(0);}
  view() {
    if(!this.closed)this.sync();
    const saved=(this.config?.grants||[]).map(g=>({id:g.accountId,slug:g.slug,status:'UNKNOWN',alias:''}));
    return {configured:!!this.config,phase:this.phase,revision:this.revision,checkedAt:this.checkedAt,
      accounts:structuredClone(this.checkedAt===null?saved:this.accounts),error:this.error||null};
  }
  refresh({cached=false}={}) {
    if(this.closed||this.apps.team.stopped)return Promise.reject(Error('应用连接已关闭。'));
    if(this.apps.team.storeConflict)return Promise.reject(Error('团队数据存在冲突，应用自动检查已暂停。'));
    const c=this.sync(),key=this.key;
    if(!c){this.schedule(30000);return this.error?Promise.reject(Error(this.error)):Promise.resolve({accounts:[],...this.apps.status()});}
    if(this.inflight?.key===key)return this.inflight.promise;
    if(cached&&this.phase==='ready'&&this.now()-this.checkedAt<60000)
      return Promise.resolve({accounts:structuredClone(this.accounts),...this.apps.status()});
    this.clearTimer(this.timer);this.timer=null;
    const epoch=this.apps.epoch,flight={key,controller:new AbortController()};
    this.phase=this.checkedAt===null?'loading':'refreshing';this.error='';this.revision++;
    const current=()=>!this.closed&&this.key===key&&this.inflight===flight;
    this.inflight=flight;
    flight.promise=(async()=>{
      try{
        const accounts=await this.apps.accounts(c,flight.controller.signal);
        this.apps.current(c,epoch);
        if(!current())throw Error('应用连接已更改，请重新检查。');
        this.accounts=accounts;this.checkedAt=this.now();this.phase='ready';this.error='';this.failures=0;
        this.nextAt=this.now()+300000;this.revision++;
        return {accounts:structuredClone(accounts),...this.apps.status()};
      }catch(error){
        if(current()){
          this.phase='error';this.error=error.message;this.failures++;
          // Only repeat GET discovery. Never replay authorizations or tools.
          const delay=[401,403].includes(error.status)?300000:Math.min(300000,15000*2**Math.min(this.failures-1,5));
          this.nextAt=this.now()+delay;this.revision++;
        }
        throw error;
      }finally{
        if(current()){this.inflight=null;this.schedule(Math.max(0,this.nextAt-this.now()));}
      }
    })();
    return flight.promise;
  }
  changed(){this.sync();}
  close(){this.closed=true;this.started=false;this.clearTimer(this.timer);this.timer=null;this.inflight?.controller.abort();this.inflight=null;}
}
module.exports={AppConnections};
