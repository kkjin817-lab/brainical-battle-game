(function(root){
  const T=root.TimerEngine,sec=ms=>(Math.floor(ms)/1000).toFixed(3),points=n=>BigInt(n).toLocaleString('ko-KR');
  root.TimerStopView={mount(ctx){
    let op=ctx.opportunity,session=null,frame=0,countTimer=0,deadlineTimer=0,drainTimer=0,disposed=false,locked=false,countEnd=performance.now()+op.config.countdownMs;
    const el=ctx.container;el.innerHTML=`<h2>타이머 정지</h2><div class="mini-target"><span>목표 시간</span><strong>${sec(op.payload.targetMs)}초</strong></div><div class="mini-clock-ring"><div><span id="mini-clock-label">준비</span><strong id="mini-clock">3</strong><small id="mini-clock-unit">잠시 후 시작해요</small></div></div><p class="mini-copy" id="mini-runtime-hint">준비가 끝나면 정지 버튼이 열려요.</p><button id="mini-stop" class="primary" disabled>준비 중</button>`;
    const q=s=>el.querySelector(s),button=q('#mini-stop');
    if(ctx.actionTop!==null&&ctx.actionTop!==undefined){const offset=button.getBoundingClientRect().top-ctx.actionContainer.getBoundingClientRect().top;button.style.marginTop=`${Math.max(0,ctx.actionTop-offset)}px`;const spacer=document.createElement('div');spacer.style.height='48px';spacer.setAttribute('aria-hidden','true');el.append(spacer);}
    function clear(){cancelAnimationFrame(frame);clearTimeout(countTimer);clearTimeout(deadlineTimer);clearTimeout(drainTimer);}
    function dispose(){disposed=true;clear();document.removeEventListener('keydown',key);}
    function finish(result){if(locked||disposed)return;locked=true;clear();button.disabled=true;button.textContent='기록 저장 중';q('#mini-clock').textContent=result.elapsedMs===null?'—.———':sec(result.elapsedMs);q('#mini-runtime-hint').textContent='기록이 고정됐어요. 점수를 정산하고 있어요.';ctx.settle({reason:result.endReason,elapsedMs:result.elapsedMs});}
    function stop(event){if(disposed||locked||!session||op.status!=='RUNNING')return;const result=session.stop(T.normalizeTimestamp(event.timeStamp,performance.now(),performance.timeOrigin));if(result)finish(result);}
    function key(event){if(event.repeat||!['Space','Enter'].includes(event.code)||!session||locked)return;event.preventDefault();stop(event);}
    button.onpointerdown=e=>{if(e.button===0){e.preventDefault();stop(e);}};button.onclick=e=>{e.preventDefault();if(e.detail===0)stop(e);};button.oncontextmenu=e=>e.preventDefault();document.addEventListener('keydown',key);
    function tick(){if(disposed||locked||!session)return;const elapsed=session.elapsed(performance.now());q('#mini-clock').textContent=sec(Math.min(elapsed,op.payload.targetMs+op.config.refundMaxMs+1));el.querySelector('.mini-clock-ring').style.setProperty('--sweep',`${Math.min(1,elapsed/op.payload.targetMs)*360}deg`);frame=requestAnimationFrame(tick);}
    function deadline(){if(disposed||locked)return;const remaining=op.payload.targetMs+op.config.refundMaxMs+1-session.elapsed(performance.now());deadlineTimer=setTimeout(()=>{if(disposed||locked)return;if(!session.deadline(performance.now())){deadline();return;}cancelAnimationFrame(frame);q('#mini-clock').textContent=sec(op.payload.targetMs+op.config.refundMaxMs+1);q('#mini-runtime-hint').textContent='마감 전 입력을 확인하고 있어요.';drainTimer=setTimeout(()=>{if(!locked&&!disposed)finish(session.finishTimeout());},op.config.inputDrainMs);},Math.max(0,remaining));}
    function run(){if(session||disposed)return;session=new T.TimerSession(performance.now(),op.payload.targetMs,op.config);q('#mini-clock-label').textContent='경과 시간';q('#mini-clock-unit').textContent='초';q('#mini-clock').textContent='0.000';q('#mini-runtime-hint').textContent='버튼에 닿는 순간, 시간이 멈춰요.';button.disabled=false;button.textContent='■ 지금 정지';tick();deadline();}
    function countdown(){if(disposed||locked)return;const remain=countEnd-performance.now();if(remain<=0){ctx.command('running').catch(()=>{if(!disposed)finish(T.judge(null,op.payload.targetMs,op.config,'interrupted'));});return;}q('#mini-clock').textContent=String(Math.ceil(remain/1000));countTimer=setTimeout(countdown,Math.min(100,remain));}
    function update(next){op=next;if(op.status==='RUNNING')run();}
    if(op.status==='COUNTDOWN')countdown();else run();return {dispose,update};
  }};
})(globalThis);
