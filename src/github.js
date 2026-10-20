'use strict';
const {jsonFetch}=require('./net');
const {HttpMcpClient}=require('./remote-mcp');
const NAME='PIBOT_GITHUB_TOKEN';
class GitHubConnector{
  constructor(team){this.team=team;this.revision=0;this.error='';this.operations=Promise.resolve();}
  view(){const c=this.team.state.github;let ready=false;try{ready=!!c&&!!this.team.vault.value(c.ownerId,NAME);}catch{}return {connected:ready,login:c?.login||'',error:this.error};}
  operation(input={}){
    if(!['connect','retry','disconnect'].includes(input.action))return Promise.resolve(this.view());
    const run=this.operations.catch(()=>{}).then(()=>this.perform(input));this.operations=run;return run;
  }
  async perform(input={}){
    if(input.action==='disconnect'){const c=this.team.state.github;this.close();delete this.team.state.github;if(c&&this.team.state.bots.some(b=>b.id===c.ownerId))await this.team.vault.remove({botId:c.ownerId,name:NAME});await this.team.save();return this.view();}
    if(!['connect','retry'].includes(input.action))return this.view();
    const owner=this.team.state.github?.ownerId||this.team.state.bots.find(b=>b.role==='Administrator')?.id||this.team.state.bots[0]?.id;
    this.team.bot(owner);const token=input.action==='connect'?String(input.token||'').trim():this.team.vault.value(owner,NAME);
    if(token.length<4||token.length>16000||/[\s\0]/.test(token))throw Error('请输入有效的 GitHub Personal Access Token。');
    const revision=++this.revision;this.client?.stop();this.client=null;
    try{const user=await jsonFetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'PI-Bot','X-GitHub-Api-Version':'2022-11-28'},timeoutMs:15000},256000);
      if(typeof user.login!=='string'||!user.login)throw Error('GitHub 未返回账号。');if(revision!==this.revision||this.team.stopped)throw Error('连接已取消。');
      await this.team.vault.set({botId:owner,name:NAME,value:token});if(revision!==this.revision||this.team.stopped){await this.team.vault.remove({botId:owner,name:NAME});throw Error('连接已取消。');}this.team.state.github={ownerId:owner,login:user.login};this.error='';await this.team.save();return this.view();
    }catch(error){this.error=error.status===401?'令牌无效或已过期。':error.message;throw Error(this.error);}
  }
  async connection(){
    if(!this.view().connected)throw Error('请在设置 → 连接器连接 GitHub。');
    const c=this.team.state.github,token=this.team.vault.value(c.ownerId,NAME);
    if(this.client&&!this.client.closed&&this.client.token===token)return this.client;
    if(!this.starting){const revision=this.revision;this.starting=(async()=>{const client=new HttpMcpClient({url:'https://api.githubcopilot.com/mcp/',timeoutMs:30000,github:true},token);try{await client.start();if(revision!==this.revision||this.team.stopped)throw Error('连接已撤销。');this.client=client;return client;}catch(e){client.stop();this.error=e.message;throw e;}})().finally(()=>{this.starting=null;});}return this.starting;
  }
  async list(signal){const client=await this.connection();return {tools:await client.tools(signal)};}
  async call(input,signal){if(typeof input.name!=='string'||input.name.length>200)throw Error('GitHub 工具名称无效。');const client=await this.connection(),tools=await client.tools(signal);if(!tools.some(t=>t.name===input.name))throw Error('GitHub 没有这个工具。');return client.request('tools/call',{name:input.name,arguments:input.arguments||{}},signal);}
  close(){this.revision++;this.client?.stop();this.client=null;}
}
module.exports={GitHubConnector};
