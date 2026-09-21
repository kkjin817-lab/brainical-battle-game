(function (root) {
  'use strict';
  const CONFIG = Object.freeze({
    rulesVersion: 'timer-stop-v2', targetValuesMs: [1000,2000,3000,4000,5000,6000,7000,8000,9000,10000],
    exactMaxMs: 50, doubleMaxMs: 100, refundMaxMs: 200,
    multipliers: { exact: 3, double: 2, refund: 1, miss: 0 }, betStep: 100, countdownMs: 3000,
    inputDrainMs: 150
  });
  const uid = () => globalThis.crypto.randomUUID();
  const clone = v => structuredClone(v);
  function amount(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw Error('안전한 정수 또는 정수 문자열이 필요해요.');
    if (!/^-?\d+$/.test(String(value))) throw Error('점수는 정수여야 해요.');
    return BigInt(value);
  }
  function maxStake(balance, config = CONFIG) { const step = BigInt(config.betStep); return amount(balance) / step * step; }
  function validStake(stake, balance, config = CONFIG) {
    try { const b = amount(stake); return b >= BigInt(config.betStep) && b % BigInt(config.betStep) === 0n && b <= amount(balance); } catch { return false; }
  }
  function target(randomUint32 = () => crypto.getRandomValues(new Uint32Array(1))[0], config = CONFIG) {
    const n = config.targetValuesMs.length, limit = Math.floor(2 ** 32 / n) * n;
    let sample; do { sample = randomUint32(); } while (sample >= limit);
    return config.targetValuesMs[sample % n];
  }
  function judge(elapsedMs, targetMs, config = CONFIG, reason = 'stopped') {
    if (reason !== 'stopped') return { elapsedMs: null, signedErrorMs: null, absoluteErrorMs: null, multiplier: 0, endReason: reason };
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw Error('잘못된 측정 시간');
    const elapsed = Math.floor(elapsedMs), error = elapsed - targetMs, absolute = Math.abs(error);
    const multiplier = absolute <= config.exactMaxMs ? config.multipliers.exact : absolute <= config.doubleMaxMs ? config.multipliers.double : absolute <= config.refundMaxMs ? config.multipliers.refund : 0;
    return { elapsedMs: elapsed, signedErrorMs: error, absoluteErrorMs: absolute, multiplier, endReason: 'stopped' };
  }
  function calculate(balanceBefore, stake, result) {
    const s = amount(balanceBefore), b = amount(stake), payout = b * BigInt(result.multiplier);
    return { payout: String(payout), netChange: String(payout-b), balanceAfter: String(s-b+payout) };
  }
  // DOM timestamps may be relative to performance.timeOrigin or epoch milliseconds.
  function normalizeTimestamp(stamp, now, origin) {
    let t = Number(stamp); if (t > 1e12) t -= origin;
    if (!Number.isFinite(t) || t <= 0) t = now;
    return Math.min(t, now);
  }
  class TimerSession {
    constructor(startedAt, targetMs, config = CONFIG) { this.startedAt = startedAt; this.targetMs = targetMs; this.config = clone(config); this.result = null; this.timeoutPending = false; }
    elapsed(now) { return Math.max(0, Math.floor(now-this.startedAt)); }
    stop(eventTime) {
      if (this.result || eventTime < this.startedAt) return null;
      const elapsed = this.elapsed(eventTime);
      this.result = elapsed >= this.targetMs + this.config.refundMaxMs + 1 ? judge(null,this.targetMs,this.config,'timeout') : judge(elapsed,this.targetMs,this.config);
      return this.result;
    }
    deadline(now) { if (this.result || this.elapsed(now) < this.targetMs + this.config.refundMaxMs + 1) return false; this.timeoutPending = true; return true; }
    finishTimeout() { if (this.result) return this.result; if (!this.timeoutPending) return null; this.result = judge(null,this.targetMs,this.config,'timeout'); return this.result; }
  }
  function opportunity(sourceRoundId, targetMs = target(), config = CONFIG) {
    if (!config.targetValuesMs.includes(targetMs)) throw Error('목표 시간 범위 오류');
    return { miniGameId: uid(), sourceRoundId, type: 'timer_stop', targetMs, rulesVersion: config.rulesVersion, config: clone(config), status: 'OFFERED', bet: null, result: null, settlement: null };
  }
  function fresh(targetMs) { return { schemaVersion: 1, balance: '1076', opportunity: opportunity('test-round-1', targetMs), history: [], events: [], testRound: 1 }; }
  function upgradeOffered(original) {
    if(original.opportunity.status!=='OFFERED'||original.opportunity.rulesVersion===CONFIG.rulesVersion)return clone(original);
    const d=clone(original);d.opportunity.config=clone(CONFIG);d.opportunity.rulesVersion=CONFIG.rulesVersion;
    event(d,uid(),'offered_rules_updated',{rulesVersion:CONFIG.rulesVersion});return d;
  }
  function event(data, id, type, extra = {}) { data.events.push({ eventId: id, miniGameId: data.opportunity.miniGameId, type, at: new Date().toISOString(), ...extra }); }
  function apply(original, command) {
    if (original.events.some(e=>e.eventId===command.eventId)) return clone(original);
    const d = clone(original), o = d.opportunity;
    if (command.miniGameId && command.miniGameId !== o.miniGameId) throw Error('이미 지난 미니게임이에요. 화면을 다시 확인해 주세요.');
    switch (command.type) {
      case 'start':
        if (o.status !== 'OFFERED') throw Error('이미 사용한 기회예요.');
        if (command.expectedBalance !== d.balance) throw Error('보유 점수가 변경됐어요. 베팅을 다시 선택해 주세요.');
        if (!validStake(command.stake,d.balance,o.config)) throw Error('100점 단위로 보유 점수 안에서 선택해 주세요.');
        o.bet = { miniGameId:o.miniGameId,stake:String(amount(command.stake)),balanceBefore:d.balance,deductedEventId:command.eventId };
        d.balance = String(amount(d.balance)-amount(command.stake)); o.status='COUNTDOWN';
        event(d,command.eventId,'bet_started',{stake:o.bet.stake,balanceBefore:o.bet.balanceBefore,balanceAfter:d.balance,targetMs:o.targetMs}); break;
      case 'running':
        if (o.status !== 'COUNTDOWN') throw Error('시작할 수 없는 상태예요.');
        o.status='RUNNING'; event(d,command.eventId,'timer_started'); break;
      case 'settle': {
        if (o.status === 'SETTLED') return d;
        if (!['COUNTDOWN','RUNNING'].includes(o.status)) throw Error('정산할 베팅이 없어요.');
        if (!['stopped','timeout','interrupted'].includes(command.reason)) throw Error('잘못된 종료 사유');
        if (command.reason === 'stopped' && o.status !== 'RUNNING') throw Error('준비 중에는 정지할 수 없어요.');
        const reason = command.reason === 'stopped' && Math.floor(command.elapsedMs)>=o.targetMs+o.config.refundMaxMs+1 ? 'timeout' : command.reason;
        const result = judge(command.elapsedMs,o.targetMs,o.config,reason), money = calculate(o.bet.balanceBefore,o.bet.stake,result);
        o.result={...result,...money}; d.balance=String(amount(d.balance)+amount(money.payout)); o.status='SETTLED';
        o.settlement={miniGameId:o.miniGameId,payoutEventId:command.eventId,balanceAfter:d.balance,settledAt:new Date().toISOString()};
        d.history.push(clone(o));event(d,command.eventId,'settled',{...o.result,stake:o.bet.stake,balanceAfter:d.balance});break;
      }
      case 'skip':
        if (o.status!=='OFFERED') throw Error('이미 시작한 베팅은 건너뛸 수 없어요.');
        o.status='SKIPPED';d.history.push(clone(o));event(d,command.eventId,'skipped');break;
      case 'next':
        if (!['SETTLED','SKIPPED'].includes(o.status)) throw Error('현재 테스트를 먼저 끝내 주세요.');
        d.testRound++;d.opportunity=opportunity(`test-round-${d.testRound}`,command.targetMs);
        event(d,command.eventId,'test_opportunity_created',{targetMs:d.opportunity.targetMs});break;
      case 'fund':
        if (o.status!=='OFFERED') throw Error('준비 화면에서만 테스트 점수를 추가할 수 있어요.');
        d.balance=String(amount(d.balance)+1076n);event(d,command.eventId,'test_points_added',{amount:'1076',balanceAfter:d.balance});break;
      default: throw Error('알 수 없는 명령');
    }
    return d;
  }
  const api={CONFIG,uid,amount,maxStake,validStake,target,judge,calculate,normalizeTimestamp,TimerSession,opportunity,fresh,upgradeOffered,apply};
  if (typeof module!=='undefined') module.exports=api; else root.TimerEngine=api;
})(globalThis);
