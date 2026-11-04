import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 清单106：空闲省电——静止 60 秒后渲染帧率切到低档，任意交互立即恢复。
// frame 由 room.js 源码片段执行；idleFps/idleSince 是 room.js 顶层闭包变量，
// 通过 with(context) 暴露给提取片段，frame 内的赋值会写回 context 属性。
test('frame drops to low fps after 60s idle and restores on activity', () => {
  const source = readFileSync(new URL('../room.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function frame(now){');
  const end = source.indexOf('  function visibility()', start);
  assert.ok(start >= 0 && end > start);

  const now = performance.now();
  const context = {
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
});