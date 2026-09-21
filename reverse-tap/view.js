(function(root){
  'use strict';
  const E=root.ReverseEngine;
  root.ReverseView={mount(ctx){
    const op=ctx.opportunity,c=op.config,session=new E.Session(op.payload.questions,c),el=ctx.container;
    let disposed=false,locked=false,frame=0,countTimer=0,drainTimer=0,activePointer=null,transition=false,feedbackSaved=Promise.resolve(),openQueued=false,lastFrame=0;
    const keys=new Set(),timing={maxFrameMs:0,longFrameCount:0,maxInputDelayMs:0,displayDelaysMs:[]},countEnd=performance.now()+c.countdownMs;
    el.innerHTML=`<div class="reverse-topline"><span class="eyebrow">READ. SWITCH. TAP.</span><span>베팅 ${BigInt(op.bet.stake).toLocaleString()}점</span></div><h2>반대로 터치</h2><div class="reverse-meta"><span id="reverse-question">준비 중</span><b id="reverse-count">0 / ${c.questionCount} 성공</b></div><div class="reverse-card" id="reverse-card"><span id="reverse-rule">준비하세요</span><strong id="reverse-arrow">3</strong><small id="reverse-feedback">규칙과 화살표를 함께 보세요</small></div><div class="reverse-meter"><i id="reverse-meter"></i></div><div class="reverse-time"><span>문제당 ${c.answerLimitMs/1000}초</span><b id="reverse-time">—</b></div><div class="reverse-pad" aria-label="방향 선택">${E.DIRECTIONS.map(d=>`<button type="button" data-dir="${d}" aria-label="${E.LABEL[d]} 방향"><b>${E.SYMBOL[d]}</b><span>${E.LABEL[d]}</span></button>`).join('')}</div><div class="reverse-steps" aria-label="문제별 성공 표시">${Array.from({length:c.questionCount},(_,i)=>`<span data-step="${i}">${i+1}</span>`).join('')}</div><p class="reverse-note">그대로 = 같은 방향 · 반대로 = 반대 방향<br>버튼 또는 방향키 · 첫 오답이나 시간 초과에서 종료</p>`;
    const q=s=>el.querySelector(s),pad=q('.reverse-pad'),buttons=[...pad.querySelectorAll('button')];
    const enable=value=>buttons.forEach(b=>b.setAttribute('aria-disabled',String(!value)));
    function cleanup(){cancelAnimationFrame(frame);clearTimeout(countTimer);clearTimeout(drainTimer);}
    function payload(r){return {...r,timing:structuredClone(timing)};}
    function finish(r){if(disposed||locked||!r)return;locked=true;cleanup();enable(false);q('#reverse-feedback').textContent='기록 완료 · 결과 저장 중';ctx.settle(payload(r));}
    function fail(){if(!disposed&&!locked)finish(session.interrupt());}
    function open(){if(disposed||locked||openQueued||session.phase==='QUESTION')return;openQueued=true;const requested=performance.now();requestAnimationFrame(now=>{openQueued=false;if(disposed||locked||!session.open(now))return;timing.displayDelaysMs.push(now-requested);clearTimeout(drainTimer);drainTimer=0;transition=false;const question=session.question;q('#reverse-rule').textContent=question.mode==='SAME'?'그대로':'반대로';q('#reverse-card').className=`reverse-card ${question.mode==='SAME'?'same':'opposite'}`;q('#reverse-arrow').textContent=E.SYMBOL[question.direction];q('#reverse-feedback').textContent='';q('#reverse-question').textContent=`문제 ${session.correctCount+1} / ${c.questionCount}`;q('#reverse-meter').style.width='100%';enable(true);});}
    function feedback(){clearTimeout(drainTimer);drainTimer=0;enable(false);q('#reverse-feedback').textContent='✓ 정답!';q('#reverse-count').textContent=`${session.correctCount} / ${c.questionCount} 성공`;const step=q(`[data-step="${session.correctCount-1}"]`);step.textContent='✓';step.classList.add('done');feedbackSaved=ctx.command('feedback');feedbackSaved.catch(fail);}
    function tick(now){if(disposed||locked)return;if(lastFrame){const gap=now-lastFrame;timing.maxFrameMs=Math.max(timing.maxFrameMs,gap);if(gap>50)timing.longFrameCount++;}lastFrame=now;
      if(session.phase==='QUESTION'){const left=Math.max(0,c.answerLimitMs-(now-session.questionStart));q('#reverse-time').textContent=`${(left/1000).toFixed(2)}초`;q('#reverse-meter').style.width=`${left/c.answerLimitMs*100}%`;if(left===0&&!drainTimer)drainTimer=setTimeout(()=>{if(!disposed&&!locked)finish(session.timeout(performance.now()));},c.inputDrainMs);}
      else if(session.phase==='FEEDBACK'&&now>=session.feedbackEnd&&!transition){transition=true;feedbackSaved.then(()=>{if(!disposed&&!locked)return ctx.command('question');}).catch(fail);}
      frame=requestAnimationFrame(tick);
    }
    function choose(direction,event){if(disposed||locked||session.phase!=='QUESTION')return;const now=performance.now(),stamp=E.normalizeTimestamp(event.timeStamp,now,performance.timeOrigin),questionId=session.question.questionId;timing.maxInputDelayMs=Math.max(timing.maxInputDelayMs,now-stamp);const previous=session.phase,r=session.input(questionId,direction,stamp,now);if(r)finish(r);else if(previous==='QUESTION'&&session.phase==='FEEDBACK')feedback();}
    pad.onpointerdown=e=>{if(activePointer!==null||keys.size||e.button!==0||disposed||locked)return;activePointer=e.pointerId;pad.setPointerCapture(e.pointerId);e.preventDefault();const b=e.target.closest('[data-dir]');if(b)choose(b.dataset.dir,e);};
    pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=e=>{if(activePointer===e.pointerId)activePointer=null;};
    pad.onclick=e=>{if(e.detail===0&&activePointer===null&&!keys.size){const b=e.target.closest('[data-dir]');if(b)choose(b.dataset.dir,e);}};
    const keyDirection={ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT'};
    function keydown(e){const button=e.target.closest?.('[data-dir]'),direction=keyDirection[e.key]||(['Enter',' '].includes(e.key)&&button&&pad.contains(button)?button.dataset.dir:null);if(!direction)return;e.preventDefault();if(e.repeat||keys.has(e.key))return;const held=keys.size;keys.add(e.key);if(!held&&activePointer===null)choose(direction,e);}
    function keyup(e){if(keys.has(e.key)&&['Enter',' '].includes(e.key))e.preventDefault();keys.delete(e.key);}document.addEventListener('keydown',keydown);document.addEventListener('keyup',keyup);
    pad.onkeydown=e=>{if(e.repeat&&(e.key==='Enter'||e.key===' '))e.preventDefault();};
    function countdown(){if(disposed||locked)return;const left=countEnd-performance.now();if(left<=0){ctx.command('running').catch(fail);return;}q('#reverse-arrow').textContent=Math.ceil(left/1000);countTimer=setTimeout(countdown,Math.min(left,100));}
    function update(next){if(next.status==='QUESTION')open();}enable(false);if(ctx.actionContainer&&op.status==='COUNTDOWN')el.scrollIntoView({block:'start',behavior:'instant'});frame=requestAnimationFrame(tick);if(op.status==='COUNTDOWN')countdown();else if(op.status==='QUESTION')open();
    return {update,interruption:()=>payload(session.interrupt()),dispose(){disposed=true;cleanup();document.removeEventListener('keydown',keydown);document.removeEventListener('keyup',keyup);}};
  }};
})(globalThis);
