'use strict';
const path=require('node:path');
const ID='local.pi-bot',LEGACY_ID='local.ds-bot';
function backupRoot(data,id=ID){return path.basename(path.dirname(data))==='data'?path.join(path.dirname(path.dirname(data)),'backups',id):path.join(data,'recovery');}
module.exports={ID,LEGACY_ID,backupRoot};
