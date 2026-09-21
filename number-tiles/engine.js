(function(root){
  'use strict';
  const RULES_VERSION='rational-precedence-v1';
  const CONFIG={version:1,expressionReward:100,comboUnit:50,impossibleBonusRate:.25,errorPenaltyRate:.2,impossibleRate:.2,bands:[{from:1,to:10,tiles:9,base:1000,rate:10},{from:11,to:15,tiles:12,base:1400,rate:12},{from:16,to:20,tiles:16,base:1800,rate:15}]};
  const band=t=>CONFIG.bands.find(b=>t>=b.from&&t<=b.to);
  function gcd(a,b){a=a<0n?-a:a;while(b){const r=a%b;a=b;b=r;}return a;}
  function rat(n,d=1n){n=BigInt(n);d=BigInt(d);if(!d)throw Error('0으로 나눌 수 없어요.');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);return {n:n/g,d:d/g};}
  const add=(a,b)=>rat(a.n*b.d+b.n*a.d,a.d*b.d);
  const neg=a=>({n:-a.n,d:a.d});
  const mul=(a,b)=>rat(a.n*b.n,a.d*b.d);
  const div=(a,b)=>rat(a.n*b.d,a.d*b.n);
  function advance(sum,term,op,value){const b=rat(value);if(op==='+')return [add(sum,term),b];if(op==='−')return [add(sum,term),neg(b)];if(op==='×')return [sum,mul(term,b)];if(op==='÷')return [sum,div(term,b)];throw Error('알 수 없는 연산자');}
  function evaluate(values){if(values.length<3||values.length%2!==1)throw Error('숫자 2개 이상으로 수식을 완성해 주세요.');let sum=rat(0),term;
    for(let i=0;i<values.length;i++){if(i%2===0){if(!Number.isInteger(values[i])||values[i]<0)throw Error('숫자와 연산자를 번갈아 선택해 주세요.');if(i===0)term=rat(values[i]);else [sum,term]=advance(sum,term,values[i-1],values[i]);}else if(!['+','−','×','÷'].includes(values[i]))throw Error('올바른 연산자를 선택해 주세요.');}return add(sum,term);
  }
  const equal=(r,t)=>r.n===BigInt(t)*r.d;
  const format=r=>r.d===1n?String(r.n):`${r.n}/${r.d}`;
  const hash=values=>{let h=2166136261;for(const c of JSON.stringify([RULES_VERSION,values]))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);};
  // Enumerate every legal alternating sequence. The running term implements precedence,
  // including left-associative division; no implicit parentheses or floating point.
  function solve(values,target){const numbers=[],ops=[],found=new Map();let visited=0;
    values.forEach((v,i)=>(typeof v==='number'?numbers:ops).push(i));
    function walk(mask,sum,term,path,depth){visited++;if(depth>=2&&equal(add(sum,term),target)&&!found.has(mask))found.set(mask,path.slice());
      for(const o of ops){if(mask&(1<<o))continue;for(const n of numbers){if(mask&(1<<n)||values[o]==='÷'&&values[n]===0)continue;const next=advance(sum,term,values[o],values[n]);walk(mask|(1<<o)|(1<<n),next[0],next[1],[...path,o,n],depth+1);}}
    }
    for(const n of numbers)walk(1<<n,rat(0),rat(values[n]),[n],1);
    const masks=[...found.keys()];const memo=new Map();const pop=n=>{let c=0;while(n){n&=n-1;c++;}return c;};
    function removable(m){if(memo.has(m))return memo.get(m);let best=0;for(const s of masks)if((s&m)===s)best=Math.max(best,pop(s)+removable(m^s));memo.set(m,best);return best;}
    return {solutionMasks:masks,witnessExpressions:[...found.values()],maxRemovableTiles:removable((1<<values.length)-1),verification:{complete:true,visited}};
  }
  function validCase(c){return c.rulesVersion===RULES_VERSION&&c.contentHash===hash(c.values)&&c.verification?.complete===true&&Array.isArray(c.solutionMasks)&&Array.isArray(c.witnessExpressions)&&c.solutionMasks.length===c.witnessExpressions.length&&c.isImpossible===(c.solutionMasks.length===0)&&c.values.length===band(c.target)?.tiles;}
  const hasSolution=(c,remaining)=>c.solutionMasks.some(s=>(s&remaining)===s);
  function reward(target,seconds,expressions,impossible,penalty=0){const b=band(target),timePenalty=Math.min(b.base,Math.floor(b.rate*Math.max(0,seconds))),expression=expressions.length*CONFIG.expressionReward,combo=expressions.reduce((s,e)=>s+CONFIG.comboUnit*(e.numbers-2)**2,0),bonus=impossible?Math.floor(b.base*CONFIG.impossibleBonusRate):0;const total=b.base-timePenalty+expression+combo+bonus;return {base:b.base,timePenalty,expression,combo,bonus,penalty,total,net:total-penalty};}
  const api={RULES_VERSION,CONFIG,band,rat,evaluate,equal,format,hash,solve,validCase,hasSolution,reward};
  if(typeof module!=='undefined')module.exports=api;else root.TileEngine=api;
})(globalThis);
