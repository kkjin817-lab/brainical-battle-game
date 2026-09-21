(function(root){
  'use strict';
  const E=root.TimerEngine;
  class Store {
    constructor(name){this.name=name;this.db=null;}
    open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('progress');r.onsuccess=()=>{this.db=r.result;resolve(this);};r.onerror=()=>reject(r.error);});}
    read(){return new Promise((resolve,reject)=>{const t=this.db.transaction('progress','readonly'),r=t.objectStore('progress').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
    update(reducer){return new Promise((resolve,reject)=>{const tx=this.db.transaction('progress','readwrite'),store=tx.objectStore('progress'),get=store.get('state');let next,problem;
      get.onsuccess=()=>{try{next=reducer(get.result);store.put(next,'state');}catch(e){problem=e;tx.abort();}};
      tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(problem||tx.error||Error('저장하지 못했어요.'));tx.onerror=()=>reject(problem||tx.error);
    });}
    initialize(){return this.update(current=>current?E.upgradeOffered(current):E.fresh());}
    command(command){return this.update(current=>{if(!current||current.schemaVersion!==1)throw Error('저장 버전을 확인해 주세요.');return E.apply(current,command);});}
  }
  root.TimerStore=Store;
})(globalThis);
