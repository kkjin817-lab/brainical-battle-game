/* Add a plugin here to include it in the stage-end weighted draw. Keep old types
   registered (weight: 0 to stop new offers) so saved opportunities still resolve. */
(function(root){
  const R=typeof module!=='undefined'?require('./registry.js'):root.MiniGames;
  const T=typeof module!=='undefined'?require('../../timer-stop/engine.js'):root.TimerEngine;
  const D=typeof module!=='undefined'?require('../../dice-roll/engine.js'):root.DiceEngine;
  const M=typeof module!=='undefined'?require('../../number-memory/engine.js'):root.MemoryEngine;
  const V=typeof module!=='undefined'?require('../../reverse-tap/engine.js'):root.ReverseEngine;
  const G=typeof module!=='undefined'?require('../../risky-vault/engine.js'):root.VaultEngine;
  R.registry.register({type:'number_memory',title:'순간 기억',weight:1,
    create(){return {rulesVersion:M.CONFIG.rulesVersion,config:structuredClone(M.CONFIG),payload:{layout:M.layout()}};},
    validate(op){if(!M.validLayout(op.payload.layout))throw Error('숫자 배치가 올바르지 않아 시작할 수 없어요.');},
    prepareOffer(op){if(op.rulesVersion==='memory-v1'){op.config.revealMs=M.CONFIG.revealMs;op.config.rulesVersion=M.CONFIG.rulesVersion;op.rulesVersion=M.CONFIG.rulesVersion;}},
    judge:M.judge,
    offer(op){return {target:`${op.config.revealMs/1000}초 동안 기억하세요`,description:'숫자 1~9의 위치를 기억하세요.<br>숫자가 가려지면 1부터 차례대로 터치하는 게임이에요.',instruction:`답변 시간 ${op.config.recallLimitMs/1000}초 · 첫 오답에서 종료돼요.`,rewards:['9개 · 5배','7–8개 · 2배','5–6개 · 1배','0–4개 · 0배']};},
    result(op){const r=op.result;return {title:{complete:'아홉 개, 모두 기억했어요!',wrong:'아쉽지만, 여기까지!',timeout:'답변 시간이 끝났어요',interrupted:'중단 종료'}[r.endReason],record:`${r.correctCount} / 9 정답`,detail:r.endReason==='interrupted'?'앱 중단은 정답 개수와 무관하게 0배예요.':`${r.multiplier}배 · ${r.elapsedRecallMs===null?'':(Math.ceil(r.elapsedRecallMs)/1000).toFixed(3)+'초'}${r.endReason==='wrong'?` · 숫자 ${r.correctCount+1}에서 오답`:''}`};},
    review(op){const r=op.result;return `<div class="memory-review"><p>숫자 위치 다시 보기 · ✓ 정답 / × 오답</p><div class="memory-board">${op.payload.layout.map((n,i)=>`<div class="${n<=r.correctCount?'correct':''} ${i===r.wrongCellId?'wrong':''}">${n}<small>${i===r.wrongCellId?'×':n<=r.correctCount?'✓':''}</small></div>`).join('')}</div></div>`;},
    mount(ctx){return root.MemoryView.mount(ctx);}
  });
  R.registry.register({type:'dice_roll',title:'주사위 굴리기',weight:1,
    create(){const c=structuredClone(D.CASES[Math.floor(Math.random()*D.CASES.length)]);if(!D.validate(c))throw Error('검증된 문제가 없습니다.');return {rulesVersion:D.CONFIG.rulesVersion,config:structuredClone(D.CONFIG),payload:c};},
    validate(op){if(!D.validate(op.payload))throw Error('문제 검증에 실패했어요. 베팅은 차감되지 않았어요.');},
    prepareOffer(op){op.config=structuredClone(D.CONFIG);op.rulesVersion=D.CONFIG.rulesVersion;},
    judge:D.judge,
    offer(op){return {target:'세 주사위의 윗면을 맞추세요',description:'주사위 A·B·C를 선택하고 방향 버튼이나 스와이프로 굴리세요.<br>중앙 목표 세 칸에 주사위를 놓고, 윗면 숫자를 맞추면 성공!',instruction:'제한 시간 60초 · 문제는 시작 후 공개돼요.',rewards:op.config.timeThresholdsMs.map((t,i)=>`${t/1000}초 이하 · ${op.config.multipliers[i]}배`)};},
    result(op){const r=op.result;return {title:{complete:'세 칸 모두 일치!',timeout:'시간이 다 됐어요',interrupted:'중단 종료',forfeit:'도전을 마쳤어요'}[r.endReason],record:r.elapsedMs===null?'완료 기록 없음':`${(Math.ceil(r.elapsedMs)/1000).toFixed(3)}초`,detail:`${r.matchedCount} / 3 일치 · ${r.moveCount}회 이동 · ${r.multiplier}배`};},
    mount(ctx){return root.DiceView.mount(ctx);}
  });
  R.registry.register({
    type:'timer_stop',title:'타이머 정지',weight:1,
    create(){return {rulesVersion:T.CONFIG.rulesVersion,config:structuredClone(T.CONFIG),payload:{targetMs:T.target()}};},
    prepareOffer(op){if(op.rulesVersion!==T.CONFIG.rulesVersion){op.config=structuredClone(T.CONFIG);op.rulesVersion=T.CONFIG.rulesVersion;if(!T.CONFIG.targetValuesMs.includes(op.payload.targetMs))op.payload.targetMs=T.target();}},
    judge(op,input){if(!['stopped','timeout','interrupted'].includes(input.reason))throw Error('잘못된 종료 사유');const reason=input.reason==='stopped'&&Math.floor(input.elapsedMs)>=op.payload.targetMs+op.config.refundMaxMs+1?'timeout':input.reason;return T.judge(input.elapsedMs,op.payload.targetMs,op.config,reason);},
    // View code is loaded only in the browser; the catalog is testable in Node.
    offer(op){const c=op.config;return {target:`${(op.payload.targetMs/1000).toFixed(3)}초`,description:'목표 시간에 정지 버튼을 누르는 게임이에요.<br>가까울수록 최대 3배! 목표를 확인하고 점수를 거세요.',instruction:'목표는 1~6초 · 3, 2, 1 뒤 타이머가 시작돼요.',rewards:[`±${(c.exactMaxMs/1000).toFixed(3)}초 · ${c.multipliers.exact}배`,`±${(c.doubleMaxMs/1000).toFixed(3)}초 · ${c.multipliers.double}배`,`±${(c.refundMaxMs/1000).toFixed(3)}초 · 원금 반환`]};},
    result(op){const r=op.result,sec=ms=>(ms/1000).toFixed(3);return {title:r.endReason==='interrupted'?'중단 종료':r.endReason==='timeout'?'시간 초과':r.multiplier===op.config.multipliers.exact?'정확!':r.multiplier===2?'성공!':r.multiplier===1?'원금 반환':'아쉬워요',record:r.elapsedMs===null?'정지 기록 없음':`${sec(r.elapsedMs)}초`,detail:r.absoluteErrorMs===null?'베팅 점수만 사용되었어요. 추가 차감은 없어요.':`${sec(r.absoluteErrorMs)}초 ${r.signedErrorMs<0?'빠름':r.signedErrorMs>0?'늦음':'· 일치'}`};},
    mount(context){return root.TimerStopView.mount(context);}
  });
  R.registry.register({type:'reverse_tap',title:'반대로 터치',weight:1,
    create(){return {rulesVersion:V.CONFIG.rulesVersion,config:structuredClone(V.CONFIG),payload:{questions:V.questions()}};},
    validate(op){if(!V.validate(op.payload.questions,op.config))throw Error('문제 규칙을 확인할 수 없어 시작하지 않았어요.');},
    judge:V.judge,
    offer(op){return {target:'같게, 또는 반대로',description:'‘그대로’는 화살표와 같은 방향, ‘반대로’는 반대 방향!<br>규칙을 보고 방향 버튼이나 방향키로 답하세요.',instruction:`총 ${op.config.questionCount}문제 · 문제당 ${op.config.answerLimitMs/1000}초<br>첫 오답이나 시간 초과에서 종료돼요.`,rewards:['10개 · 5배','7–9개 · 2배','5–6개 · 1배','0–4개 · 0배']};},
    result(op){const r=op.result;return {title:{complete:'열 번의 판단, 모두 정답!',wrong:'방향이 엇갈렸어요',timeout:'조금 늦었어요',interrupted:'중단 종료'}[r.endReason],record:`${r.correctCount} / ${op.config.questionCount} 성공`,detail:r.endReason==='interrupted'?'앱 중단은 성공 개수와 무관하게 0배예요.':`${r.multiplier}배 · ${r.endReason==='complete'?'모든 문제 성공':r.endReason==='timeout'?'답변 시간 초과':'첫 오답에서 종료'}`};},
    review(op){const r=op.result;if(!r.failedQuestionId)return '';const index=op.payload.questions.findIndex(q=>q.questionId===r.failedQuestionId),q=op.payload.questions[index],record=r.records.at(-1);return `<div class="reverse-review"><span>${index+1}번 문제 다시 보기</span><b>${q.mode==='SAME'?'그대로':'반대로'} ${V.SYMBOL[q.direction]}</b><p>선택: ${record.selectedDirection?V.SYMBOL[record.selectedDirection]+' '+V.LABEL[record.selectedDirection]:'미응답'}<br>정답: ${V.SYMBOL[q.expectedDirection]} ${V.LABEL[q.expectedDirection]}</p></div>`;},
    mount(ctx){return root.ReverseView.mount(ctx);}
  });
  R.registry.register({type:'risky_vault',title:'위험한 금고',weight:1,startStatus:'SELECTING',resumeOnInterrupt:true,
    create(){return {rulesVersion:G.CONFIG.rulesVersion,config:structuredClone(G.CONFIG),payload:{contents:G.generate()}};},
    validate(op){if(!G.validate(op.payload.contents,op.config))throw Error('금고 구성이 올바르지 않아 시작하지 않았어요.');},
    initialProgress:G.freshProgress,commands:G.COMMANDS,action:G.action,recover:G.recover,
    judge(){throw Error('금고는 저장된 개봉 결과 또는 받고 종료로만 정산합니다.');},
    offer(op){const c=op.config;return {target:'더 열까, 여기서 멈출까?',description:'금고를 열어 보물을 찾는 게임이에요.<br>보물을 찾으면 받고 종료하거나, 더 큰 배당에 도전하세요.',instruction:`보물 ${c.rows*c.cols-c.bombCount}개 · 폭탄 ${c.bombCount}개<br>폭탄이면 지급 0점 · 보물 ${c.autoFinishTreasures}개면 자동 종료`,rewards:c.payoutTiers.map((t,i)=>`${i+1}개 · ${t.numerator/t.denominator}배`),warning:'시간 제한 없이 천천히 결정하세요.<br>앱을 나가도 배치와 진행이 그대로 저장돼요.'};},
    result(op){const r=op.result;return {title:{bomb:'획득 실패 · 지급 0점',cashout:'현재 배당을 받았어요',complete:'보물 다섯 개, 금고 정복!'}[r.endReason],record:`보물 ${r.treasureCount}개 · ${r.multiplier}배`,detail:r.endReason==='bomb'?'폭탄을 열었어요. 베팅 점수는 추가로 차감하지 않아요.':r.endReason==='complete'?'최대 배당에 도달해 자동으로 정산했어요.':'선택한 배당으로 지급을 완료했어요.'};},
    review(op){return `<div class="vault-review"><p>정산 완료 · 전체 금고 확인</p><div class="vault-board">${op.payload.contents.map((v,i)=>`<div class="vault-review-cell ${v==='BOMB'?'bomb':'treasure'} ${op.progress.openedCellIds.includes(i)?'chosen':''}"><b>${v==='BOMB'?'✹':'◆'}</b><span>${v==='BOMB'?'폭탄':'보물'}${op.progress.openedCellIds.includes(i)?' ✓':''}</span></div>`).join('')}</div></div>`;},
    mount(ctx){return root.VaultView.mount(ctx);}
  });
  if(typeof module!=='undefined')module.exports=R.registry;
})(globalThis);
