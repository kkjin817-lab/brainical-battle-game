(function(root){
  'use strict';
  const CONFIG={rulesVersion:'vault-v1',rows:4,cols:3,bombCount:3,autoFinishTreasures:5,revealMs:350,betStep:100,payoutTiers:[{numerator:1,denominator:1},{numerator:3,denominator:2},{numerator:2,denominator:1},{numerator:3,denominator:1},{numerator:5,denominator:1}]};
  const COMMANDS=['vault_open','vault_revealed','vault_continue','vault_cashout'];
  function validConfig(c){return Number.isInteger(c.rows)&&c.rows>0&&Number.isInteger(c.cols)&&c.cols>0&&Number.isInteger(c.bombCount)&&c.bombCount>0&&c.bombCount<c.rows*c.cols&&Number.isInteger(c.autoFinishTreasures)&&c.autoFinishTreasures>0&&c.autoFinishTreasures<=c.rows*c.cols-c.bombCount&&Array.isArray(c.payoutTiers)&&c.payoutTiers.length===c.autoFinishTreasures&&c.payoutTiers.every(t=>Number.isSafeInteger(t.numerator)&&t.numerator>0&&Number.isSafeInteger(t.denominator)&&t.denominator>0&&BigInt(c.betStep)*BigInt(t.numerator)%BigInt(t.denominator)===0n);}
  function validate(contents,c=CONFIG){try{return validConfig(c)&&Array.isArray(contents)&&contents.length===c.rows*c.cols&&contents.every(x=>x==='TREASURE'||x==='BOMB')&&contents.filter(x=>x==='BOMB').length===c.bombCount;}catch{return false;}}
  function generate(random=()=>crypto.getRandomValues(new Uint32Array(1))[0],c=CONFIG){if(!validConfig(c))throw Error('금고 설정 오류');const a=Array.from({length:c.rows*c.cols},(_,i)=>i<c.bombCount?'BOMB':'TREASURE');for(let i=a.length-1;i>0;i--){const n=i+1,limit=Math.floor(2**32/n)*n;let sample;do{sample=random();}while(sample>=limit);const j=sample%n;[a[i],a[j]]=[a[j],a[i]];}return a;}
  const freshProgress=()=>({openedCellIds:[],treasureCount:0,lastOpenedCellId:null,pendingReveal:null,version:0,selections:[]});
  function tier(k,c=CONFIG){return k>0?c.payoutTiers[k-1]:{numerator:0,denominator:1};}
  function payout(stake,k,c=CONFIG){const t=tier(k,c);return BigInt(stake)*BigInt(t.numerator)/BigInt(t.denominator);}
  function risk(k,c=CONFIG){const remaining=c.rows*c.cols-k;return {remaining,treasures:remaining-c.bombCount,bombs:c.bombCount,bombProbability:c.bombCount/remaining,treasureProbability:(remaining-c.bombCount)/remaining};}
  function result(op,reason){const p=op.progress,t=reason==='bomb'?{numerator:0,denominator:1}:tier(p.treasureCount,op.config);return {endReason:reason,treasureCount:p.treasureCount,multiplierNumerator:t.numerator,multiplierDenominator:t.denominator,multiplier:t.numerator/t.denominator,openedCellIds:[...p.openedCellIds],lastOpenedCellId:p.lastOpenedCellId};}
  function verifyProgress(op){const p=op.progress,a=op.payload.contents;if(!validate(a,op.config)||!p||!Array.isArray(p.openedCellIds)||new Set(p.openedCellIds).size!==p.openedCellIds.length||p.openedCellIds.some(i=>!Number.isInteger(i)||i<0||i>=a.length)||p.treasureCount!==p.openedCellIds.filter(i=>a[i]==='TREASURE').length||!Number.isSafeInteger(p.version)||p.version<0)throw Error('저장된 금고 진행을 확인할 수 없습니다.');}
  // Pure transition: the caller commits the returned state and payout atomically.
  function action(original,type,input,eventId){if(!COMMANDS.includes(type))throw Error('금고 동작 오류');verifyProgress(original);if(!['SELECTING','REVEALING','DECIDING'].includes(original.status))throw Error('이미 종료된 기회입니다.');if(input.expectedVersion!==original.progress.version)throw Error('진행이 변경됐어요. 새로고침해 최신 상태를 확인해 주세요.');const op=structuredClone(original),p=op.progress,c=op.config;let end=null;
    if(type==='vault_open'){
      if(!Number.isInteger(input.cellId)||input.cellId<0||input.cellId>=op.payload.contents.length)throw Error('금고 위치 오류');
      if(p.openedCellIds.includes(input.cellId))return {op,extra:{ignored:true}};
      if(op.status!=='SELECTING')throw Error('하나 더 열기를 먼저 선택해 주세요.');
      const content=op.payload.contents[input.cellId];p.openedCellIds.push(input.cellId);p.lastOpenedCellId=input.cellId;p.pendingReveal={cellId:input.cellId,content,selectionEventId:eventId};p.selections.push({...p.pendingReveal});if(content==='BOMB')end='bomb';else{p.treasureCount++;if(p.treasureCount===c.autoFinishTreasures)end='complete';else op.status='REVEALING';}
    }else if(type==='vault_revealed'){if(op.status!=='REVEALING')throw Error('개봉 연출 상태가 아닙니다.');p.pendingReveal=null;op.status='DECIDING';
    }else if(type==='vault_continue'){if(op.status!=='DECIDING')throw Error('종료 또는 계속을 고르는 상태가 아닙니다.');op.status='SELECTING';
    }else{if(!['SELECTING','DECIDING'].includes(op.status)||p.treasureCount<1)throw Error('보물을 찾은 뒤 종료할 수 있어요.');end='cashout';}
    p.version++;return {op,result:end?result(op,end):null,extra:{cellId:type==='vault_open'?input.cellId:null,version:p.version,treasureCount:p.treasureCount}};
  }
  function recover(op){verifyProgress(op);if(op.status==='REVEALING'){op.status='DECIDING';op.progress.pendingReveal=null;op.progress.version++;return true;}return false;}
  const api={CONFIG,COMMANDS,validate,generate,freshProgress,tier,payout,risk,action,recover,verifyProgress};if(typeof module!=='undefined')module.exports=api;else root.VaultEngine=api;
})(globalThis);
