(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.TileEngine;
  const registry=typeof module!=='undefined'?require('./minigames/catalog.js'):root.MiniGames.registry;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function money(value){if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('기존 점수가 안전한 정수 범위를 넘었습니다.');const n=BigInt(value);if(n<0n)throw Error('점수는 음수가 될 수 없습니다.');return String(n);}
  function fresh(){return {schemaVersion:2,cumulativeScore:'0',currentTarget:1,tutorialFlags:[],lastSettledRoundId:null,status:'ready',round:{roundId:uid(),target:1,accumulatedActualPenalty:'0',restarts:0},attempt:null,result:null,history:[],events:[],pendingMiniGame:null,pendingMiniGameId:null,miniGameHistory:[]};}
  function migrate(input,plugins=registry){const d=structuredClone(input);if(![1,2].includes(d.schemaVersion))throw Error('지원하지 않는 저장 버전입니다.');const legacy=d.schemaVersion===1;d.cumulativeScore=money(d.cumulativeScore);d.round.accumulatedActualPenalty=money(d.round.accumulatedActualPenalty);d.miniGameHistory??=[];d.pendingMiniGame??=null;d.pendingMiniGameId??=null;
    if(legacy&&d.status==='result'&&d.result){d.pendingMiniGame=plugins.create(d.result.roundId);d.pendingMiniGameId=d.pendingMiniGame.miniGameId;}
    if(d.pendingMiniGame?.status==='OFFERED')plugins.get(d.pendingMiniGame.type).prepareOffer?.(d.pendingMiniGame);
    d.schemaVersion=2;return d;
  }
  class Game{
    constructor(cases,data=fresh(),options={}){this.registry=options.registry||registry;this.cases=cases.filter(E.validCase);this.data=migrate(data,this.registry);this.selected=[];if(!this.cases.length)throw Error('검증된 문제 데이터가 없습니다.');if(options.recover!==false){if(this.data.status==='playing'||this.data.status==='countdown')this.interrupt('restore');this.recoverMini();}}
    recoverMini(){const o=this.data.pendingMiniGame;if(!o)return;const plugin=this.registry.get(o.type);if(plugin.resumeOnInterrupt){if(['SELECTING','REVEALING','DECIDING'].includes(o.status)&&plugin.recover(o))this.event('mini_resume',{miniGameId:o.miniGameId});return;}if(['COUNTDOWN','RUNNING','MEMORIZE','RECALL','QUESTION','FEEDBACK'].includes(o.status))this.mini('settle',{reason:'interrupted',elapsedMs:null});}
    event(type,extra={}){this.data.events.push({eventId:uid(),roundId:this.data.round.roundId,attemptId:this.data.attempt?.attemptId??null,type,at:new Date().toISOString(),...extra});}
    prepare(){const d=this.data;if(d.status!=='ready')return;const old=d.attempt;let pool=this.cases.filter(c=>c.target===d.currentTarget);let picked;
      if(old){const previous=pool.find(c=>c.caseId===old.caseId);if(!previous)throw Error('이전 문제의 검증 데이터가 없습니다.');pool=pool.filter(c=>c.caseId!==old.caseId&&c.isImpossible===previous.isImpossible&&c.difficultyBand===previous.difficultyBand);}
      else if(d.currentTarget<=3){picked=pool.find(c=>c.caseId===`t${d.currentTarget}-v${d.currentTarget===3?4:0}`);}
      else{const impossible=Math.random()<E.CONFIG.impossibleRate;pool=pool.filter(c=>c.isImpossible===impossible);}
      picked??=pool[Math.floor(Math.random()*pool.length)];if(!picked)throw Error('같은 난이도의 대체 문제가 없습니다.');
      const layout=picked.values.map((_,i)=>i);for(let i=layout.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[layout[i],layout[j]]=[layout[j],layout[i]];}
      d.attempt={attemptId:uid(),roundId:d.round.roundId,caseId:picked.caseId,layout,remainingMask:(1<<picked.values.length)-1,solvedExpressions:[],elapsedMs:0,status:'countdown'};d.status='countdown';this.selected=[];this.event(old?'restart':'prepare',{caseId:picked.caseId,restarts:d.round.restarts});
    }
    get case(){return this.cases.find(c=>c.caseId===this.data.attempt?.caseId);}
    start(){if(this.data.status!=='countdown')return;this.data.status='playing';this.data.attempt.status='playing';if(!this.data.tutorialFlags.includes(this.data.currentTarget))this.data.tutorialFlags.push(this.data.currentTarget);this.event('start');}
    select(id){if(this.data.status!=='playing'||!Number.isInteger(id)||id<0||id>=this.case.values.length||!(this.data.attempt.remainingMask&(1<<id))||this.selected.includes(id))return false;const isNumber=typeof this.case.values[id]==='number';if(isNumber!==(this.selected.length%2===0))return false;this.selected.push(id);return true;}
    undo(){if(this.data.status!=='playing')return;this.selected.pop();this.event('undo');}
    clear(){this.selected=[];this.event('clear_selection');}
    submit(){if(this.data.status!=='playing')return {ok:false,message:'먼저 시작해 주세요.'};let r;const values=this.selected.map(i=>this.case.values[i]);try{r=E.evaluate(values);}catch(e){this.event('expression_submit',{values,correct:false,invalid:true,reason:e.message});return {ok:false,message:e.message};}
      const correct=E.equal(r,this.data.currentTarget);this.event('expression_submit',{values,correct,numbers:(values.length+1)/2});if(!correct)return {ok:false,message:`계산 결과는 ${E.format(r)}이에요. 목표 ${this.data.currentTarget}을 만들어 주세요.`};
      const expression={ids:[...this.selected],values,numbers:(values.length+1)/2};let mask=0;this.selected.forEach(i=>mask|=1<<i);this.data.attempt.remainingMask&=~mask;this.data.attempt.solvedExpressions.push(expression);this.selected=[];return {ok:true,expression,points:E.CONFIG.expressionReward+E.CONFIG.comboUnit*(expression.numbers-2)**2};
    }
    declare(kind,seconds){const d=this.data,a=d.attempt;if(d.status!=='playing'||!['complete','impossible'].includes(kind))return {ignored:true};if(kind==='complete'&&!a.solvedExpressions.length||kind==='impossible'&&a.solvedExpressions.length)return {ignored:true};this.selected=[];
      if(E.hasSolution(this.case,a.remainingMask)){const requested=Math.floor(E.band(d.currentTarget).base*E.CONFIG.errorPenaltyRate),applied=BigInt(requested)<BigInt(d.cumulativeScore)?BigInt(requested):BigInt(d.cumulativeScore);d.cumulativeScore=String(BigInt(d.cumulativeScore)-applied);d.round.accumulatedActualPenalty=String(BigInt(d.round.accumulatedActualPenalty)+applied);this.event('declaration',{kind,correct:false,requestedDelta:String(-requested),appliedDelta:String(-applied),scoreAfter:d.cumulativeScore});return {ok:false,penalty:Number(applied),requested};}
      if(d.lastSettledRoundId===d.round.roundId)return {ignored:true};
      const details=E.reward(d.currentTarget,seconds,a.solvedExpressions,kind==='impossible');details.penalty=String(d.round.accumulatedActualPenalty);details.net=String(BigInt(details.total)-BigInt(details.penalty));d.cumulativeScore=String(BigInt(d.cumulativeScore)+BigInt(details.total));d.lastSettledRoundId=d.round.roundId;a.elapsedMs=seconds*1000;a.status='settled';
      d.result={...details,target:d.currentTarget,seconds,kind,roundId:d.round.roundId,expressions:a.solvedExpressions.length,restarts:d.round.restarts,maxRemovableTiles:this.case.maxRemovableTiles,removed:this.case.values.length-this.case.values.filter((_,i)=>a.remainingMask&(1<<i)).length};
      d.history.push(d.result);d.currentTarget++;d.status='result';d.pendingMiniGame=this.registry.create(d.round.roundId);d.pendingMiniGameId=d.pendingMiniGame.miniGameId;this.event('clear',{...d.result,appliedDelta:details.total,scoreAfter:d.cumulativeScore,miniGameId:d.pendingMiniGameId,miniGameType:d.pendingMiniGame.type});return {ok:true,result:d.result};
    }
    next(){const d=this.data;if(d.status==='result'&&d.pendingMiniGame){d.status='minigame';return;}if(d.status==='minigame'){if(!['SETTLED','SKIPPED'].includes(d.pendingMiniGame?.status))return;d.pendingMiniGame=null;d.pendingMiniGameId=null;}else if(d.status!=='result')return;if(d.currentTarget>20){d.status='finished';return;}d.round={roundId:uid(),target:d.currentTarget,accumulatedActualPenalty:'0',restarts:0};d.attempt=null;d.result=null;d.status='ready';this.selected=[];}
    mini(type,input={},eventId=uid()){
      const d=this.data,o=d.pendingMiniGame;if(d.events.some(e=>e.eventId===eventId))return;
      if(d.status!=='minigame'||!o)throw Error('진행할 미니게임이 없습니다.');
      if(input.miniGameId&&input.miniGameId!==o.miniGameId)throw Error('이미 지난 미니게임입니다.');
      let extra={};const plugin=this.registry.get(o.type);
      const finalize=result=>{const numerator=result.multiplierNumerator??result.multiplier,denominator=result.multiplierDenominator??1;if(!Number.isSafeInteger(numerator)||numerator<0||!Number.isSafeInteger(denominator)||denominator<=0)throw Error('잘못된 배당 결과입니다.');const total=BigInt(o.bet.stake)*BigInt(numerator);if(total%BigInt(denominator)!==0n)throw Error('지급액은 정수여야 합니다.');const payout=total/BigInt(denominator);d.cumulativeScore=String(BigInt(d.cumulativeScore)+payout);o.result={...result,multiplier:numerator/denominator,payout:String(payout),netChange:String(payout-BigInt(o.bet.stake))};o.status='SETTLED';o.settlement={payoutEventId:eventId,balanceAfter:d.cumulativeScore,settledAt:new Date().toISOString()};d.miniGameHistory.push(structuredClone(o));extra={...extra,...o.result};};
      if(type==='start'){
        this.registry.get(o.type).validate?.(o);
        if(o.status!=='OFFERED')throw Error('이미 사용한 기회입니다.');if(input.expectedBalance!==d.cumulativeScore)throw Error('잔액이 변경됐어요. 금액을 다시 선택해 주세요.');
        if(!/^\d+$/.test(String(input.stake)))throw Error('올바른 베팅 점수가 아닙니다.');const b=BigInt(input.stake),step=BigInt(o.config.betStep||100);if(b<step||b%step!==0n||b>BigInt(d.cumulativeScore))throw Error('100점 단위로 보유 점수 안에서 선택해 주세요.');
        o.bet={stake:String(b),balanceBefore:d.cumulativeScore,deductedEventId:eventId};d.cumulativeScore=String(BigInt(d.cumulativeScore)-b);o.status=plugin.startStatus||'COUNTDOWN';if(plugin.initialProgress)o.progress=plugin.initialProgress();extra={stake:String(b),balanceBefore:o.bet.balanceBefore};
      }else if(plugin.commands?.includes(type)){const transition=plugin.action(o,type,input,eventId);Object.assign(o,transition.op);extra=transition.extra;if(transition.result)finalize(transition.result);
      }else if(type==='running'){if(o.status!=='COUNTDOWN')throw Error('준비 상태가 아닙니다.');o.status=o.type==='number_memory'?'MEMORIZE':o.type==='reverse_tap'?'QUESTION':'RUNNING';
      }else if(type==='recall'){if(o.type!=='number_memory'||o.status!=='MEMORIZE')throw Error('기억 상태가 아닙니다.');o.status='RECALL';
      }else if(type==='feedback'){if(o.type!=='reverse_tap'||o.status!=='QUESTION')throw Error('답변 상태가 아닙니다.');o.status='FEEDBACK';
      }else if(type==='question'){if(o.type!=='reverse_tap'||o.status!=='FEEDBACK')throw Error('피드백 상태가 아닙니다.');o.status='QUESTION';
      }else if(type==='settle'){
        if(o.status==='SETTLED')return;if(!['COUNTDOWN','RUNNING','MEMORIZE','RECALL','QUESTION','FEEDBACK'].includes(o.status))throw Error('정산할 베팅이 없습니다.');if(o.status==='COUNTDOWN'&&input.reason!=='interrupted')throw Error('준비 중에는 정지할 수 없습니다.');
        if(o.type==='number_memory'&&o.status==='MEMORIZE'&&input.reason!=='interrupted')throw Error('공개 중에는 정산할 수 없습니다.');
        if(o.type==='reverse_tap'&&o.status==='FEEDBACK'&&input.reason!=='interrupted')throw Error('피드백 중에는 정산할 수 없습니다.');
        finalize(plugin.judge(o,input));
      }else if(type==='skip'){if(o.status!=='OFFERED')throw Error('시작한 베팅은 건너뛸 수 없습니다.');o.status='SKIPPED';d.miniGameHistory.push(structuredClone(o));
      }else throw Error('지원하지 않는 미니게임 명령입니다.');
      d.events.push({eventId,roundId:o.sourceRoundId,miniGameId:o.miniGameId,type:`mini_${type}`,at:new Date().toISOString(),scoreAfter:d.cumulativeScore,...extra});
    }
    interrupt(reason){if(!['playing','countdown'].includes(this.data.status))return false;this.event('interrupt',{reason});this.data.status='ready';this.data.round.restarts++;this.data.attempt.status='interrupted';this.selected=[];return true;}
  }
  const api={Game,fresh,migrate};if(typeof module!=='undefined')module.exports=api;else root.TileState=api;
})(globalThis);
