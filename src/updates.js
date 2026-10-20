'use strict';
// Independent public Releases check. No account token, installer or chat state involved.
const {jsonFetch}=require('./net');
const REPO='https://github.com/vsd269/PI-Bot';
const API='https://api.github.com/repos/vsd269/PI-Bot/releases/latest';
function version(value){
  const m=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value));
  if(!m||m.slice(1,4).some(n=>!Number.isSafeInteger(Number(n))))return null;
  return {numbers:m.slice(1,4).map(Number),pre:m[4]||'',text:m.slice(1,4).join('.')};
}
function newer(next,current){
  const a=version(next),b=version(current);if(!a||!b||a.pre)return false;
  for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return a.numbers[i]>b.numbers[i];
  return Boolean(b.pre);
}
function releaseInfo(release,current){
  const v=version(release?.tag_name);
  if(!v||v.pre||release.draft||release.prerelease)throw Error('发布信息不完整。');
  const tag=release.tag_name,notes=REPO+'/releases/tag/'+tag;
  if(release.html_url!==notes)throw Error('发布地址不匹配。');
  const names=['local.pi-bot-'+v.text+'.piplug','local.ds-bot-'+v.text+'.piplug','PI-bot-'+v.text+'.piplug'];
  const asset=names.map(name=>(release.assets||[]).find(a=>a.name===name&&a.state==='uploaded'&&a.size>0&&a.browser_download_url===REPO+'/releases/download/'+tag+'/'+name)).find(Boolean);
  if(!asset)throw Error('此版本尚未提供可安装的插件包。');
  return {status:newer(v.text,current)?'available':'current',current,latest:v.text,releaseUrl:notes,downloadUrl:asset.browser_download_url};
}
function createUpdateChecker({current=require('../manifest.json').version,fetchJSON=jsonFetch,now=Date.now}={}){
  let cached=null,pending=null,expires=0;
  return {check({force=false}={}){
    if(pending)return pending;
    if(!force&&cached&&now()<expires)return Promise.resolve({...cached});
    pending=(async()=>{
      try{
        const release=await fetchJSON(API,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'PI-Bot/'+current},timeoutMs:8000},512*1024);
        cached={...releaseInfo(release,current),checkedAt:now()};expires=now()+6*60*60*1000;
      }catch(error){
        cached={status:'error',current,checkedAt:now(),message:error.status===403||error.status===429?'GitHub 暂时限制了检查频率，请稍后重试。':error.status===404?'仓库尚未发布正式版本。':'暂时无法检查更新，请检查网络或稍后重试。'};
        expires=now()+15*60*1000;
      }
      return {...cached};
    })().finally(()=>{pending=null;});
    return pending;
  }};
}
module.exports={createUpdateChecker,releaseInfo,newer,version};
