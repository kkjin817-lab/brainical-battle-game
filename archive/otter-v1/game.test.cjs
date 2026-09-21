const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const elements = new Map();
const noop = () => {};
const context2d = new Proxy({}, {get: (_, key) => key === 'createLinearGradient' ? () => ({addColorStop: noop}) : noop, set: () => true});
function element(id) {
  if (!elements.has(id)) elements.set(id, {value: 'normal', textContent: '', style: {}, classList: {add: noop, remove: noop}, addEventListener: noop, setAttribute: noop, blur: noop, getContext: () => context2d});
  return elements.get(id);
}
const sandbox = vm.createContext({console, Math, document: {getElementById: element, addEventListener: noop}, window: {addEventListener: noop}, requestAnimationFrame: noop, HTMLSelectElement: class {}, HTMLButtonElement: class {}});
vm.runInContext(fs.readFileSync('game.js', 'utf8'), sandbox);
const run = code => vm.runInContext(code, sandbox);
assert.equal(run("countShells('player')"), 5);
assert.equal(run("countShells('ai')"), 5);
run('startRound(); update(3);');
assert.equal(run('mode'), 'playing');
run("player.x=shells[5].x; pickup(player,'player'); throwShell(player,'player');");
assert.equal(run("shells[5].state"), 'flying');
assert.ok(run('shells[5].vy') < 0);
run('togglePause();');
const paused = run('elapsed'); run('update(1);');
assert.equal(run('elapsed'), paused);
run('togglePause(); bounce(player);');
assert.equal(run('player.bounceCD'), 2.5);
run("shells[0].state='flying';shells[0].x=player.x;shells[0].y=player.y-70;shells[0].vy=420;shells[0].vx=0;shells[0].lastHitter='ai';update(1/60);");
assert.ok(run('shells[0].vy') < 0, 'belly bounce reflects incoming shells');
run("resetWorld();mode='playing';for(const s of shells){s.owner='ai';s.state='held';}for(let i=0;i<181;i++)update(1/60);");
assert.equal(run('mode'), 'finished');
assert.match(element('overlay-title').textContent, /챔피언/);
run("resetWorld();mode='playing';elapsed=59.99;ai.stun=2;player.stun=2;update(.02);");
assert.equal(run('mode'), 'finished');
assert.match(element('overlay-title').textContent, /공평/);
for (const difficulty of ['easy', 'normal', 'hard']) {
  element('difficulty').value=difficulty;
  run('startRound();update(3);');
  for(let i=0;i<3800 && run('mode')==='playing';i++) {
    run("keys.add('Space');keys.add('ShiftLeft');pointerX=450+Math.sin(elapsed*1.7)*280;update(1/60);");
    assert.equal(run("countShells('player')+countShells('ai')"),10);
    assert.ok(run('shells.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y))'));
  }
  assert.equal(run('mode'),'finished');
  run('render();');
}
console.log('PASS: pickup, throw, reflect, pause, empty-shore win, timed draw, all 3 AI levels, shell conservation, render smoke.');
