(function(root){
  class ProgressStore{
    constructor(name,cases){this.name=name;this.cases=cases;this.db=null;this.leaseId=null;}
    // HTTP on the local Wi-Fi network has no Web Locks. IndexedDB serializes this
    // lease and every wallet write; a stale owner cannot write after takeover.
    lease(mode='acquire',now=Date.now()){this.leaseId??=root.MiniGames.uid();return new Promise((resolve,reject)=>{const tx=this.db.transaction('game','readwrite'),s=tx.objectStore('game'),r=s.get('mobile-owner');let ok=false;r.onsuccess=()=>{const old=r.result;if(mode==='release'){if(old?.id===this.leaseId)s.delete('mobile-owner');ok=true;}else if(mode==='acquire'&&(!old||old.expires<=now||old.id===this.leaseId)||mode==='renew'&&old?.id===this.leaseId&&old.expires>now){s.put({id:this.leaseId,expires:now+12000},'mobile-owner');ok=true;}};tx.oncomplete=()=>resolve(ok);tx.onabort=tx.onerror=()=>reject(tx.error);});}
    open(onBlocked){return new Promise((resolve,reject)=>{const req=indexedDB.open(this.name,2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('game'))req.result.createObjectStore('game');};req.onblocked=()=>onBlocked?.();req.onerror=()=>reject(req.error);req.onsuccess=()=>{this.db=req.result;this.db.onversionchange=()=>this.db.close();resolve(this);};});}
    update(transform,selected=[]){return new Promise((resolve,reject)=>{const tx=this.db.transaction('game','readwrite'),store=tx.objectStore('game'),lease=this.leaseId?store.get('mobile-owner'):null,get=store.get('progress');let model,result,error;
      if(lease)lease.onsuccess=()=>{if(lease.result?.id!==this.leaseId||lease.result.expires<=Date.now()){error=Error('다른 탭이 이어받았어요. 새로고침해 주세요.');tx.abort();}};
      get.onsuccess=()=>{try{const previous=get.result;if(previous?.schemaVersion===1)store.put(previous,'progress-backup-v1');model=new root.TileState.Game(this.cases,previous||root.TileState.fresh(),{recover:false});model.selected=[...selected];result=transform(model);if(result?.then)throw Error('저장 트랜잭션 안에서는 비동기 작업을 할 수 없습니다.');store.put(model.data,'progress');}catch(e){error=e;tx.abort();}};
      tx.oncomplete=()=>resolve({model,result});tx.onabort=()=>reject(error||tx.error||Error('저장 실패'));tx.onerror=()=>reject(error||tx.error);
    });}
    initialize(){return this.update(g=>{if(['playing','countdown'].includes(g.data.status))g.interrupt('restore');g.recoverMini();});}
  }
  root.ProgressStore=ProgressStore;
})(globalThis);
