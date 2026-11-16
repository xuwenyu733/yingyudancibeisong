import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 清单106：空闲省电——静止 60 秒后渲染帧率切到低档，任意交互立即恢复。
// frame 由 room.js 源码片段执行；idleFps/idleSince 是 room.js 顶层闭包变量，
// 通过 with(context) 暴露给提取片段，frame 内的赋值会写回 context 属性。
test('frame saves power and defers old companion writes during a server command', () => {
  const source = readFileSync(new URL('../room.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function frame(now){');
  const end = source.indexOf('  function visibility()', start);
  assert.ok(start >= 0 && end > start);

  const now = performance.now();
  const context = {options:{},visitorActors:{frame(){}},adaptive:{sample(){}},win:{performance:{now:()=>0}},activities:{active:false,frame(){}},studio:{frame(){}},
    frameId: 0, shouldRender: () => true, quality: { maxFPS: 60, autoDowngraded: false, profile: 'high' },
    lastRender: 0, previous: 0,
    actor: { state: 'idle', update() {} }, feel: { active: false, frame() {} }, ceremony: { active: false, frame() {} },
    nightActive: false, updateNight() {}, play:null,
    swipeState: null,
    commerceBusy: false, decoration: { active: false, pending: false }, inputAxis: () => ({ x: 0, z: 0 }),
    disposed: false, lastIdleCheck: Number.MAX_SAFE_INTEGER, ritualPoints: [], decorationReady: null,
    waterFx: { visible: false }, presentationPaused: true, renderScene() {}, capturePoster() {},
    metricsFrames: 0, lastMetrics: Number.MAX_SAFE_INTEGER, lowFpsStreak: 0, applyAutoDowngrade() {},
    updateStatus() {}, schedule() {}, sfx: { play() {} }, lastSnore: 0,
    forklift: null, sofaRoot: null, sleepZzz: null,
    frameId: 0,
    idleFps: false, idleSince: now,
    touchActivity() { if (this.idleFps) { this.idleFps = false; this.idleSince = 0; } else this.idleSince = now; },
  };
  const frame = new Function('context', `with(context){${source.slice(start, end)};return frame;}`)(context);

  // 1) 刚有活动：未超 60s → 不降帧
  frame(now);
  assert.equal(context.idleFps, false, '活跃后不应降帧');

  // 2) 静止超过 60s → 降帧（idleFps 置真）
  context.idleSince = now - 61000;
  frame(now + 1000);
  assert.equal(context.idleFps, true, '静止 60 秒后应降帧');

  // 3) 任意触摸活动 → 立即恢复
  context.touchActivity();
  assert.equal(context.idleFps, false, '触摸活动应立即恢复流畅');
  context.activities.active=true;context.idleSince=now-61000;frame(now+2000);
  assert.equal(context.idleFps,false,'家具互动仍在进行时不进入空闲降帧');

  // An old save's first frame used to write lastInteraction after the command's
  // preflight flush, making the confirmed server snapshot look like a conflict.
  let touches=0;context.activities.active=false;context.lastIdleCheck=0;
  context.companionStore={getState:()=>({lastInteraction:'2020-01-01T00:00:00.000Z'}),touch:()=>touches++};
  context.feel.react=()=>{};context.fx={say(){}};
  context.options.economyService={busy:true};context.presentationPaused=false;
  frame(now+3000);assert.equal(touches,0,'server command pauses automatic persistence even during animation');
  context.options.economyService.busy=false;context.presentationPaused=true;
  frame(now+4000);assert.equal(touches,0,'a paused life/shop panel does not trigger background writes');
  context.presentationPaused=false;frame(now+5000);
  assert.equal(touches,1,'deferred activity is saved once normal play resumes');
});
