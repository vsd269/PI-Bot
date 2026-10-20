'use strict';
// Undo only the fields/rows changed by this operation, not concurrent chat work.
class StateEdit {
  constructor(){this.undo=[];}
  set(object,key,value){const had=Object.hasOwn(object,key),before=object[key];object[key]=value;this.undo.push(()=>{if(object[key]===value){if(had)object[key]=before;else delete object[key];}});}
  delete(object,key){if(!Object.hasOwn(object,key))return;const before=object[key];delete object[key];this.undo.push(()=>{if(!Object.hasOwn(object,key))object[key]=before;});}
  remove(object,key,predicate){const rows=object[key];if(!Array.isArray(rows))return;const removed=rows.flatMap((item,index)=>predicate(item)?[{item,index}]:[]);if(!removed.length)return;object[key]=rows.filter(item=>!predicate(item));this.undo.push(()=>{const current=object[key]??=[];for(const {item,index} of removed)if(!current.includes(item))current.splice(Math.min(index,current.length),0,item);});}
  append(object,key,item){(object[key]??=[]).push(item);this.undo.push(()=>{object[key]=object[key].filter(row=>row!==item);});}
  rollback(){for(const undo of this.undo.splice(0).reverse())undo();}
}
module.exports={StateEdit};
