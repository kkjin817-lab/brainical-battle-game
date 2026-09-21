/* Theme and rules live separately so the creek can become another world later. */
const THEME = {
  water: '#a7d7cb', deepWater: '#89c6bc', bank: '#d3dfb5', grass: '#94b783',
  player: '#e98b55', opponent: '#4c8e80', fur: '#87654d', belly: '#dfc5a0',
  shell: '#fff2d9', shellStroke: '#cda87a', name: '수달의 조개 쟁탈전'
};
const RULES = { width: 900, height: 720, left: 108, right: 792, playerY: 597, aiY: 123,
  roundSeconds: 60, emptySeconds: 3, shellCount: 10, playerSpeed: 480,
  throwSpeed: 420, throwCooldown: .34, bounceCooldown: 2.5, bounceDuration: .48,
  currentPeriod: 8, currentForce: 155 };
const LEVELS = { easy: { speed: 225, delay: .73, reflect: .12 }, normal: { speed: 305, delay: .48, reflect: .46 }, hard: { speed: 390, delay: .34, reflect: .78 } };
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const ui = Object.fromEntries(['player-count','ai-count','timer','phase','current-label','overlay','overlay-kicker','overlay-title','overlay-copy','overlay-hint','start','pause','ability-text','ability-fill','announcement','difficulty','sound'].map(id => [id, document.getElementById(id)]));
const keys = new Set();
let pointerX = null, mode = 'ready', shells = [], particles = [], elapsed = 0, worldTime = 0, lastTime = 0;
let player, ai, emptyPlayer = 0, emptyAI = 0, countdown = 0, messageTime = 0, level = LEVELS.normal;
let soundEnabled = false, audioContext, lastHUD = '';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function makeOtter(y) { return { x: 450, y, direction: 0, held: null, throwCD: 0, bounceCD: 0, bounce: 0, stun: 0, shot: 0, think: .5 }; }
function resetWorld() {
  player = makeOtter(RULES.playerY); ai = makeOtter(RULES.aiY); shells = []; particles = [];
  elapsed = 0; emptyPlayer = 0; emptyAI = 0; pointerX = null; keys.clear();
  for (let i = 0; i < RULES.shellCount; i++) {
    const owner = i < RULES.shellCount / 2 ? 'ai' : 'player';
    shells.push({ x: 185 + (i % 5) * 132, y: owner === 'player' ? RULES.playerY - 42 : RULES.aiY + 42, vx: 0, vy: 0, owner, state: 'rest', spin: i * 1.7, lastHitter: null });
  }
  lastHUD = ''; updateHUD();
}
function startRound() {
  resetWorld(); level = LEVELS[ui.difficulty.value]; countdown = 2.7; mode = 'countdown';
  ui.overlay.classList.add('hidden'); ui.pause.disabled = false; ui.difficulty.disabled = true;
  ui.pause.innerHTML = '일시정지 <kbd>P</kbd>'; ui.phase.textContent = 'ROUND 01';
  if (soundEnabled) initAudio();
}
function initAudio() { try { audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch { soundEnabled = false; } }
function playSound(freq, duration = .08, type = 'sine', volume = .035) {
  if (!soundEnabled || !audioContext) return;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(freq * .6, audioContext.currentTime + duration);
  gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
}
function burst(x, y, color, n = 9) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, speed = 30 + Math.random() * 140; particles.push({ x, y, vx: Math.cos(a)*speed, vy: Math.sin(a)*speed, life: .4 + Math.random()*.25, max: .65, color, r: 2 + Math.random()*4 }); }
}
function announce(text, duration = 1) { ui.announcement.textContent = text; messageTime = duration; }
function countShells(owner) { return shells.filter(s => s.owner === owner).length; }
function pickup(otter, owner) {
  if (otter.held || otter.stun > 0) return;
  const near = shells.filter(s => s.owner === owner && s.state === 'rest' && Math.abs(s.x-otter.x) < 43).sort((a,b) => Math.abs(a.x-otter.x)-Math.abs(b.x-otter.x))[0];
  if (near) { near.state = 'held'; otter.held = near; if (owner === 'player') playSound(720, .06); }
}
function throwShell(otter, owner) {
  if (!otter.held || otter.throwCD > 0 || otter.stun > 0) return;
  const s = otter.held; otter.held = null; s.state = 'flying'; s.x = otter.x;
  s.y = otter.y + (owner === 'player' ? -52 : 52);
  s.vx = otter.direction * 180; s.vy = (owner === 'player' ? -1 : 1) * RULES.throwSpeed;
  s.lastHitter = owner; otter.throwCD = owner === 'player' ? RULES.throwCooldown : level.delay; otter.shot = .18;
  burst(s.x, s.y, '#effff2', 5); playSound(owner === 'player' ? 490 : 340);
}
function bounce(otter) {
  if (otter.bounceCD > 0 || otter.stun > 0) return;
  otter.bounce = RULES.bounceDuration; otter.bounceCD = RULES.bounceCooldown;
  burst(otter.x, otter.y, '#fdf7bd', 12); playSound(210, .14, 'triangle');
}
function settle(s, owner) {
  s.state = 'rest'; s.owner = owner; s.vx = 0; s.vy = 0;
  s.y = owner === 'player' ? RULES.playerY - 42 : RULES.aiY + 42;
  s.x = clamp(s.x, RULES.left + 25, RULES.right - 25); s.lastHitter = null;
}
function updateOtter(otter, dt) {
  for (const prop of ['throwCD','bounceCD','bounce','stun','shot']) otter[prop] = Math.max(0, otter[prop] - dt);
}
function currentDirection() { return Math.floor(elapsed / RULES.currentPeriod) % 2 === 0 ? 1 : -1; }
function update(dt) {
  if (mode === 'countdown') {
    countdown -= dt; ui.announcement.textContent = countdown > .7 ? String(Math.ceil(countdown - .7)) : '시작!';
    if (countdown <= 0) { mode = 'playing'; announce('시작!', .55); } return;
  }
  if (mode !== 'playing') return;
  elapsed = Math.min(RULES.roundSeconds, elapsed + dt);
  if (messageTime > 0) { messageTime -= dt; if (messageTime <= 0) ui.announcement.textContent = ''; }
  updateOtter(player, dt); updateOtter(ai, dt);
  let dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  if (dir === 0 && pointerX !== null && Math.abs(pointerX - player.x) > 5) dir = clamp((pointerX - player.x) / 35, -1, 1);
  player.direction = dir;
  if (player.stun <= 0) player.x = clamp(player.x + dir * RULES.playerSpeed * dt, RULES.left + 30, RULES.right - 30);
  pickup(player, 'player');
  if (keys.has('Space')) throwShell(player, 'player');
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) bounce(player);
  const targets = shells.filter(s => s.owner === 'ai' && s.state === 'rest').sort((a,b) => Math.abs(a.x-ai.x)-Math.abs(b.x-ai.x));
  const threats = shells.filter(s => s.state === 'flying' && s.vy < 0 && s.y < 295 && s.y > ai.y - 10).sort((a,b) => a.y-b.y);
  ai.think -= dt;
  if (ai.think <= 0) { ai.wantsBounce = Math.random() < level.reflect; ai.think = .35; }
  let goal = targets[0]?.x ?? 450;
  if (ai.held) goal = clamp(player.x + Math.sin(elapsed*2)*110, RULES.left+40, RULES.right-40);
  if (threats[0] && ai.wantsBounce && ai.bounceCD <= 0) { goal = threats[0].x; if (Math.abs(goal-ai.x)<75 && threats[0].y<210) bounce(ai); }
  ai.direction = Math.abs(goal-ai.x) > 8 ? Math.sign(goal-ai.x) : 0;
  if (ai.stun <= 0) ai.x = clamp(ai.x + ai.direction * Math.min(level.speed*dt, Math.abs(goal-ai.x)), RULES.left+30, RULES.right-30);
  pickup(ai, 'ai'); throwShell(ai, 'ai');
  for (const s of shells) {
    s.spin += dt * (s.state === 'flying' ? 6 : .5);
    if (s.state === 'held') { const o = s.owner === 'player' ? player : ai; s.x=o.x; s.y=o.y + (s.owner === 'player' ? -27 : 27); continue; }
    if (s.state !== 'flying') continue;
    const oldY = s.y;
    if (Math.abs(s.y-360) < 112) s.vx = clamp(s.vx + currentDirection()*RULES.currentForce*dt, -290, 290);
    s.x += s.vx*dt; s.y += s.vy*dt;
    if (s.x < RULES.left+14 || s.x > RULES.right-14) { s.x=clamp(s.x,RULES.left+14,RULES.right-14); s.vx*=-.88; burst(s.x,s.y,'#effff3',4); }
    s.owner = s.y >= 360 ? 'player' : 'ai';
    const target = s.vy > 0 ? player : ai, targetOwner = s.vy > 0 ? 'player' : 'ai';
    const hitY = target.y + (s.vy > 0 ? -24 : 24), crossed = (oldY-hitY)*(s.y-hitY)<=0;
    const inBounce = Math.abs(s.y-target.y)<94 && Math.abs(s.x-target.x)<79;
    if (target.bounce > 0 && inBounce && s.lastHitter !== targetOwner) {
      s.vy = (targetOwner === 'player' ? -1 : 1)*RULES.throwSpeed*1.18; s.vx = (s.x-target.x)*3.5 + target.direction*90;
      s.lastHitter = targetOwner; burst(s.x,s.y,'#fff5b4',15); playSound(890,.14,'triangle'); if (targetOwner==='player') announce('통통! 완벽한 배치기',.7); continue;
    }
    if (crossed && Math.abs(s.x-target.x)<39 && s.lastHitter !== targetOwner && target.stun<=0) {
      target.stun=.56; burst(target.x,target.y,'#fff7d5',10); playSound(110,.13,'triangle');
      settle(s,targetOwner); s.x=clamp(target.x+(Math.random()>.5 ? 60 : -60),RULES.left+25,RULES.right-25); continue;
    }
    if (s.y < 67) { burst(s.x,80,'#eaffef'); settle(s,'ai'); }
    if (s.y > 653) { burst(s.x,640,'#eaffef'); settle(s,'player'); }
  }
  for (const p of particles) { p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=Math.exp(-dt*3); p.vy*=Math.exp(-dt*3); }
  particles=particles.filter(p=>p.life>0);
  emptyPlayer = countShells('player') === 0 ? emptyPlayer+dt : 0;
  emptyAI = countShells('ai') === 0 ? emptyAI+dt : 0;
  updateHUD();
  if (emptyPlayer>=RULES.emptySeconds) finish('win','물가를 깨끗하게 비우고 3초를 버텼어요!');
  else if (emptyAI>=RULES.emptySeconds) finish('lose','이웃이 먼저 물가를 비우고 3초를 버텼어요.');
  else if (elapsed>=RULES.roundSeconds) { const a=countShells('player'), b=countShells('ai'); finish(a<b?'win':a>b?'lose':'draw', `내 물가 ${a}개 · 이웃 물가 ${b}개. ${a===b?'이번에는 사이좋게 무승부예요.':'조개가 더 적은 쪽이 승리했어요.'}`); }
}
function updateHUD() {
  const a=countShells('player'), b=countShells('ai'), time=Math.ceil(RULES.roundSeconds-elapsed), cd=Math.ceil(player.bounceCD*10)/10;
  const signature=`${a},${b},${time},${cd},${currentDirection()}`; if (signature===lastHUD) return; lastHUD=signature;
  ui['player-count'].textContent=a; ui['ai-count'].textContent=b; ui.timer.textContent=String(time).padStart(2,'0');
  ui['current-label'].textContent=currentDirection()>0?'물살이 오른쪽으로 흐르고 있어요 →':'← 물살이 왼쪽으로 흐르고 있어요';
  ui['ability-text'].textContent=cd>0?`${cd.toFixed(1)}초 후 다시 통통!`:'배치기 준비 완료';
  ui['ability-fill'].style.width=`${(1-player.bounceCD/RULES.bounceCooldown)*100}%`;
  document.getElementById('bounce').textContent=cd>0?`배치기 ${cd.toFixed(1)}`:'배치기';
}
function showOverlay(kicker,title,copy,button,hint) {
  ui['overlay-kicker'].textContent=kicker; ui['overlay-title'].textContent=title; ui['overlay-copy'].textContent=copy;
  ui.start.textContent=button; ui['overlay-hint'].textContent=hint; ui.overlay.classList.remove('hidden');
}
function finish(result,copy) {
  mode='finished'; keys.clear(); pointerX=null; ui.announcement.textContent=''; ui.pause.disabled=true; ui.difficulty.disabled=false;
  const titles={win:'오늘의 개울 챔피언!',lose:'이웃 수달이 한 수 위!',draw:'아주 공평한 조개 나눔.'};
  showOverlay(result==='win'?'A CLEAN LITTLE VICTORY':result==='lose'?'ONE MORE SPLASH?':'A FRIENDLY DRAW',titles[result],copy,'한 판 더 하기 ↗','다른 난이도로도 도전해 보세요');
  ui.phase.textContent='ROUND COMPLETE'; playSound(result==='win'?880:330,.4,'triangle');
}
let resumeMode='playing';
function togglePause() {
  if (mode==='playing'||mode==='countdown') { resumeMode=mode; mode='paused'; keys.clear(); pointerX=null; ui.announcement.textContent=''; showOverlay('TAKE A LITTLE BREATH','잠깐, 물멍 시간.','준비되면 다시 개울로 돌아가세요.','계속하기 ↗','P 또는 Esc 키로도 계속할 수 있어요'); ui.pause.innerHTML='계속하기 <kbd>P</kbd>'; }
  else if (mode==='paused') { mode=resumeMode; ui.overlay.classList.add('hidden'); ui.pause.innerHTML='일시정지 <kbd>P</kbd>'; }
}
function ellipse(x,y,rx,ry,color,angle=0) { ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);ctx.fillStyle=color;ctx.fill(); }
function line(x1,y1,x2,y2,color,width=2) { ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke(); }
function drawShell(x,y,r=15,spin=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(spin)*.2);
  ellipse(1,5,r+2,r*.55,'#38685a20');
  ctx.beginPath();ctx.moveTo(0,r*.75);ctx.bezierCurveTo(-r*1.5,0,-r*.95,-r,0,-r);ctx.bezierCurveTo(r*.95,-r,r*1.5,0,0,r*.75);ctx.fillStyle=THEME.shell;ctx.fill();ctx.strokeStyle=THEME.shellStroke;ctx.lineWidth=1.6;ctx.stroke();
  for (let i=-1;i<=1;i++) {ctx.beginPath();ctx.moveTo(0,r*.58);ctx.quadraticCurveTo(i*r*.6,-r*.1,i*r*.55,-r*.73);ctx.strokeStyle='#d7b995';ctx.lineWidth=1.3;ctx.stroke();}
  ctx.restore();
}
function drawOtter(o,isPlayer) {
  const bob=Math.sin(worldTime*3+ (isPlayer?0:2))*2;
  ctx.save();ctx.translate(o.x,o.y+bob); if (!isPlayer) ctx.rotate(Math.PI);
  const tilt=o.stun>0?Math.sin(worldTime*50)*.09:o.direction*.07;ctx.rotate(tilt);
  if (o.bounce>0) { ellipse(0,-8,76,65,'#fdf6b238'); ctx.beginPath();ctx.ellipse(0,-8,76,65,0,0,Math.PI*2);ctx.strokeStyle='#fff6b5';ctx.lineWidth=4;ctx.stroke(); }
  ellipse(0,17,44,41,'#38685a24');
  ellipse(0,42,13,32,THEME.fur,-.12);
  ellipse(-26,23,12,21,'#70533f',.6);ellipse(26,23,12,21,'#70533f',-.6);
  ellipse(0,10,o.bounce>0?37:32,43,THEME.fur);ellipse(0,14,23,30,THEME.belly);
  ellipse(-29,-3,12,22,THEME.fur,-.6-(o.shot>0?.6:0));ellipse(29,-3,12,22,THEME.fur,.6+(o.shot>0?.6:0));
  ellipse(-23,-39,10,11,THEME.fur);ellipse(23,-39,10,11,THEME.fur);ellipse(-23,-40,5,6,'#be9778');ellipse(23,-40,5,6,'#be9778');
  ellipse(0,-28,33,28,THEME.fur);ellipse(0,-19,25,17,THEME.belly);
  const scarf=isPlayer?THEME.player:THEME.opponent;
  ctx.fillStyle=scarf;ctx.beginPath();ctx.roundRect(-24,-5,48,9,5);ctx.fill();
  ctx.beginPath();ctx.moveTo(17,0);ctx.lineTo(30,15);ctx.lineTo(17,18);ctx.lineTo(9,2);ctx.fill();
  if (o.stun>0) { for (const x of [-12,12]) {line(x-3,-32,x+3,-26,'#302e26');line(x+3,-32,x-3,-26,'#302e26');} }
  else {ellipse(-12,-29,3.1,3.6,'#302e26');ellipse(12,-29,3.1,3.6,'#302e26');ellipse(-11,-30,1,1,'white');ellipse(13,-30,1,1,'white');}
  ellipse(-17,-20,5,2.8,'#c98f72');ellipse(17,-20,5,2.8,'#c98f72');ellipse(0,-22,5,3.5,'#473e31');
  line(0,-19,0,-15,'#76614c',1.2);line(0,-15,-4,-13,'#76614c',1.2);line(0,-15,4,-13,'#76614c',1.2);
  for (const side of [-1,1]) {line(side*18,-19,side*35,-23,'#6a5441',1);line(side*19,-15,side*36,-14,'#6a5441',1);}
  if(o.held) drawShell(0,-1,17,0);
  ctx.restore();
  if(isPlayer) {ctx.fillStyle='#fcf9e9';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('YOU',o.x,o.y+88);}
}
function drawBank(side) {
  ctx.fillStyle=THEME.bank;ctx.beginPath();const edge=side==='left'?83:817;
  ctx.moveTo(side==='left'?0:900,0);ctx.lineTo(edge,0);
  for(let y=0;y<=750;y+=30) ctx.lineTo(edge+Math.sin(y*.016)*12,y);
  ctx.lineTo(side==='left'?0:900,720);ctx.closePath();ctx.fill();
  for(let i=0;i<17;i++) {
    const y=25+i*44,x=side==='left'?30+Math.sin(i*5)*22:870+Math.cos(i*4)*18;
    if(i%4===0) {ellipse(x,y,16,10,'#afbf9a',-.3);ellipse(x-3,y-3,12,7,'#c6d0b3',-.3);}
    else {for(let j=-1;j<=1;j++)line(x,y+5,x+j*6,y-7-Math.abs(j)*3,THEME.grass,2);}
    if(i%5===2) {ellipse(x+12,y+4,3,3,'#f5f0cb');ellipse(x+12,y+4,1,1,'#d5b45f');}
  }
}
function drawWater() {
  ctx.fillStyle=THEME.water;ctx.fillRect(0,0,900,720);
  const grad=ctx.createLinearGradient(0,0,0,720);grad.addColorStop(0,'#a4d4c7');grad.addColorStop(.5,'#84c6bd');grad.addColorStop(1,'#b6dfcd');ctx.fillStyle=grad;ctx.fillRect(80,0,740,720);
  ctx.fillStyle='#ecfff10e';ctx.beginPath();ctx.moveTo(85,256);ctx.bezierCurveTo(290,210,580,324,817,259);ctx.lineTo(820,454);ctx.bezierCurveTo(550,503,320,390,81,461);ctx.fill();
  for(let i=0;i<57;i++) {
    const x=110+((i*137+worldTime*(i%3+1)*7*currentDirection())%680+680)%680,y=35+(i*97)%650;
    ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+12,y+5,x+25,y);ctx.strokeStyle=i%3===0?'#f1fff44c':'#5daba330';ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.setLineDash([5,14]);line(109,360,791,360,'#e6fff24d',2);ctx.setLineDash([]);
  for(let i=0;i<5;i++){const x=260+i*95+Math.sin(worldTime)*5,d=currentDirection();line(x-d*6,345,x+d*3,351,'#eaffee55',2);line(x+d*3,351,x-d*6,357,'#eaffee55',2);}
  drawBank('left');drawBank('right');
  for(const [x,y,r] of [[115,304,18],[779,452,16],[116,473,12]]) {ellipse(x,y,r,r*.65,'#73a88a',-.2);line(x,y,x+r,y-4,'#a7c6a0',1);ellipse(x-5,y-3,4,3,'#f5efd4');}
  ctx.fillStyle='#396f6545';ctx.textAlign='center';ctx.font='600 10px sans-serif';ctx.letterSpacing='2px';ctx.fillText('NEIGHBOR’S SHORE',450,62);ctx.fillText('YOUR LITTLE SHORE',450,699);ctx.letterSpacing='0px';
}
function drawEmptyMeter(o,progress) {
  if(progress<=0)return;
  ctx.beginPath();ctx.arc(o.x,o.y,64,-Math.PI/2,-Math.PI/2+Math.PI*2*progress/RULES.emptySeconds);ctx.strokeStyle='#fff4a4';ctx.lineWidth=6;ctx.stroke();
  ctx.fillStyle='#244640';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(`빈 물가 유지! ${(RULES.emptySeconds-progress).toFixed(1)}초`,450,o===player?492:222);
}
function render() {
  ctx.clearRect(0,0,900,720);drawWater();
  for(const s of shells)if(s.state==='rest')drawShell(s.x,s.y,15,s.spin);
  drawOtter(ai,false);drawOtter(player,true);
  for(const s of shells)if(s.state==='flying'){ellipse(s.x-s.vx*.026,s.y-s.vy*.026,9,6,'#fff7df4d');drawShell(s.x,s.y,15,s.spin);}
  for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ellipse(p.x,p.y,p.r,p.r,p.color);}ctx.globalAlpha=1;
  drawEmptyMeter(player,emptyPlayer);drawEmptyMeter(ai,emptyAI);
}
function frame(time) { const dt=Math.min((time-lastTime)/1000||0,1/30);lastTime=time;if(mode!=='paused')worldTime+=dt;update(dt);render();requestAnimationFrame(frame); }
const handledKeys=new Set(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','ShiftLeft','ShiftRight','KeyP','Escape','Enter']);
window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement && (e.code==='Space'||e.code==='Enter'))return;
  if(handledKeys.has(e.code))e.preventDefault();
  if(!e.repeat&&(e.code==='KeyP'||e.code==='Escape')){togglePause();return;}
  if(!e.repeat&&e.code==='Enter'&&(mode==='ready'||mode==='finished')){startRound();return;}
  if(mode==='playing'){keys.add(e.code);if(['ArrowLeft','ArrowRight','KeyA','KeyD'].includes(e.code))pointerX=null;}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();if(mode==='playing'||mode==='countdown')togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='playing'||mode==='countdown'))togglePause();});
ui.start.addEventListener('click',()=>{mode==='paused'?togglePause():startRound();ui.start.blur();});
ui.pause.addEventListener('click',()=>{togglePause();ui.pause.blur();});
ui.sound.addEventListener('click',()=>{soundEnabled=!soundEnabled;if(soundEnabled)initAudio();ui.sound.textContent=`소리 ${soundEnabled?'ON':'OFF'}`;ui.sound.setAttribute('aria-pressed',String(soundEnabled));ui.sound.setAttribute('aria-label',soundEnabled?'소리 끄기':'소리 켜기');ui.sound.blur();});
function point(e){const r=canvas.getBoundingClientRect();return clamp((e.clientX-r.left)/r.width*900,RULES.left+30,RULES.right-30);}
canvas.addEventListener('pointermove',e=>{if(mode==='playing'&&(e.pointerType==='mouse'||e.buttons))pointerX=point(e);});
canvas.addEventListener('pointerdown',e=>{if(mode!=='playing')return;e.preventDefault();canvas.setPointerCapture(e.pointerId);pointerX=point(e);keys.add('Space');});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>keys.delete('Space'));
canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(mode==='playing')bounce(player);});
for(const [id,key] of [['left','ArrowLeft'],['right','ArrowRight'],['throw','Space'],['bounce','ShiftLeft']]){
  const button=document.getElementById(id);
  button.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;button.setPointerCapture(e.pointerId);pointerX=null;keys.add(key);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(key));
}
resetWorld();requestAnimationFrame(frame);
