(function(root){
  'use strict';
  const uid=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/2**32;
  class Registry{
    constructor(){this.entries=new Map();}
    register(plugin){
      if(!plugin.type||!plugin.title||typeof plugin.create!=='function'||typeof plugin.judge!=='function')throw Error('미니게임 등록 정보가 올바르지 않습니다.');
      if(this.entries.has(plugin.type))throw Error(`이미 등록된 종류: ${plugin.type}`);
      if(!Number.isFinite(plugin.weight)||plugin.weight<0)throw Error('추첨 가중치는 0 이상의 수여야 합니다.');
      this.entries.set(plugin.type,plugin);return this;
    }
    get(type){const entry=this.entries.get(type);if(!entry)throw Error(`미니게임 모듈을 찾을 수 없습니다: ${type}`);return entry;}
    list(){return [...this.entries.values()];}
    draw(rng=random){const entries=this.list().filter(p=>p.weight>0),total=entries.reduce((s,p)=>s+p.weight,0);if(!total)throw Error('사용 가능한 미니게임이 없습니다.');const value=rng();if(value<0||value>=1)throw Error('잘못된 추첨 값');let pick=value*total;for(const p of entries){pick-=p.weight;if(pick<0)return p;}return entries.at(-1);}
    create(sourceRoundId,rng){const plugin=this.draw(rng),payload=plugin.create();return {miniGameId:uid(),sourceRoundId,type:plugin.type,title:plugin.title,rulesVersion:payload.rulesVersion,config:payload.config,payload:payload.payload,status:'OFFERED',bet:null,result:null,settlement:null};}
  }
  const registry=new Registry();
  const api={Registry,registry,uid};if(typeof module!=='undefined')module.exports=api;else root.MiniGames=api;
})(globalThis);
