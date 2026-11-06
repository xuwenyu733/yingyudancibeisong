import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfx } from '../sfx.mjs';

function fakeContext() {
  let started = 0;
  const fakeGain = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return ctx.destination; } };
  const ctx = {
    state: 'running', currentTime: 0, destination: {},
    createOscillator() { return { type: '', frequency: { setValueAtTime() {} }, connect() { return fakeGain; }, start() { started += 1; }, stop() {} }; },
    createGain() { return fakeGain; },
    resume() {}, close() {},
    __started() { return started; },
  };
  return ctx;
}

test('playMelody 在无上下文/静音/释放时安全 no-op', () => {
  const silent = createSfx();
  assert.equal(silent.playMelody([523, 659]), false);
  silent.setMuted(true);
  silent.unlock();
  assert.equal(silent.playMelody([523]), false);
  silent.setMuted(false);
  const audible = createSfx({ audioContext: fakeContext() });
  assert.equal(audible.playMelody([]), false);
  assert.equal(audible.playMelody([0, -1, 880]), true);
  audible.dispose();
  assert.equal(audible.playMelody([440]), false);
});

test('playMelody 每个音符调度一个振荡器', () => {
  const ctx = fakeContext();
  const sfx = createSfx({ audioContext: ctx });
  assert.equal(sfx.playMelody([523.25, 659.25, 783.99], { gap: .06 }), true);
  assert.equal(ctx.__started(), 3);
});