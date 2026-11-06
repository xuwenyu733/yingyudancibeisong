import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEconomy } from '../economy.mjs';
import { createProfile } from '../profile.mjs';
import { createCompanionStore } from '../companion-state.mjs';
import { planInteraction } from '../interaction-framework.mjs';

// Run the delivered room entry point against the actual three ledgers. Replace
// only audiovisual effects, which must not be repeated for retried events.
const source = readFileSync(new URL('../room.js', import.meta.url), 'utf8');
const start = source.indexOf('  function creditLearning('), end = source.indexOf('  const LEVEL_NAMES', start);
assert.ok(start >= 0 && end > start, 'room learning source boundaries changed');
const learningSource = source.slice(start, end);
function memory() {
  return { values: new Map(), blocked: false, getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { if (this.blocked) throw new Error('quota'); this.values.set(key, value); } };
}
function fixture(adapter = memory()) {
  const economy = createEconomy({ storageAdapter: adapter, storageKey: 'learning-account', initialBalance: 0 });
  const profile = createProfile({ storageAdapter: adapter, storageKey: 'learning-profile' });
  const companionStore = createCompanionStore({ adapter, key: 'learning-companion' });
  const effects = { reaction: [], sounds: [], bubbles: [], notifications: [], syncs: 0 };
  const context = {
    economy, profile, companionStore, lifecycle: 'ready', disposed: false,
    tradeFailure: (code, message) => ({ ok: false, code, message }),
    updateStatus() {},
    evaluateBadges: () => profile.evaluate(economy.getState(), '2026-10-28'),
    notify(type, detail) {
      effects.notifications.push({ type, detail });
      // The production notify path now routes action sounds through the shared plan.
      for (const sound of planInteraction(type, detail).sounds) context.sfx.play(sound);
    },
    feel: { react: name => effects.reaction.push(name) },
    sfx: { play: name => effects.sounds.push(name) },
    fx: { say: text => effects.bubbles.push(text) },
    syncCompanion: () => effects.syncs++,
  };
  const creditLearning = new Function('context', `with(context){${learningSource}\nreturn creditLearning;}`)(context);
  return { economy, profile, companionStore, effects, creditLearning, adapter, context };
}

test('the real room learning path credits points, study time and garden growth once per event ID', () => {
  const room = fixture(), event = { eventId: 'lesson-one', learned: 1, reviewed: 0 };
  assert.equal(room.creditLearning(event).ok, true);
  assert.equal(room.economy.getState().balance, 10);
  assert.equal(room.profile.getState().totalStudySeconds, 1200);
  assert.equal(room.companionStore.getState().learningSeconds, 1200);
  assert.deepEqual(room.effects.reaction, ['clap'], '首次学习应鼓掌一次');
  assert.deepEqual(room.effects.sounds, ['clap'], '首次学习应经交互计划播放一次鼓掌音效');
  const effects = structuredClone(room.effects);
  const repeated = room.creditLearning(event);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.code, 'ALREADY_CLAIMED');
  assert.equal(room.economy.getState().balance, 10);
  assert.equal(room.profile.getState().totalStudySeconds, 1200);
  assert.equal(room.companionStore.getState().learningSeconds, 1200);
  assert.deepEqual(room.effects, effects, '重复事件不能重放鼓掌、气泡、音效或学习奖励通知');
  const loaded = fixture(room.adapter);
  assert.equal(loaded.creditLearning(event).code, 'ALREADY_CLAIMED');
  assert.equal(loaded.profile.getState().totalStudySeconds, 1200);
  assert.equal(loaded.companionStore.getState().learningSeconds, 1200);
  assert.deepEqual(loaded.effects.reaction, []);
  assert.deepEqual(loaded.effects.sounds, []);
  assert.equal(loaded.creditLearning({ eventId: 'review-two', reviewed: 1 }).ok, true);
  assert.equal(loaded.profile.getState().totalStudySeconds, 1800);
  assert.equal(loaded.companionStore.getState().learningSeconds, 1800);
  assert.deepEqual(loaded.effects.reaction, ['clap']);
  assert.deepEqual(loaded.effects.sounds, ['clap']);
});

test('failed learning credits cannot advance study time or garden and can retry once storage recovers', () => {
  const room = fixture(); room.adapter.blocked = true;
  const event = { eventId: 'retry-after-quota', learned: 1 };
  assert.equal(room.creditLearning(event).ok, false);
  assert.equal(room.economy.getState().balance, 0);
  assert.equal(room.profile.getState().totalStudySeconds, 0);
  assert.equal(room.companionStore.getState().learningSeconds, 0);
  assert.deepEqual(room.effects.sounds, []);
  room.adapter.blocked = false;
  assert.equal(room.creditLearning(event).ok, true);
  assert.equal(room.economy.getState().balance, 10);
  assert.equal(room.profile.getState().totalStudySeconds, 1200);
  assert.equal(room.companionStore.getState().learningSeconds, 1200);
  assert.equal(room.creditLearning(event).code, 'ALREADY_CLAIMED');
  assert.equal(room.profile.getState().totalStudySeconds, 1200);
  assert.deepEqual(room.effects.sounds, ['clap'], '存储恢复后仅首次成功学习播放鼓掌，重试不能叠加');
  assert.deepEqual(room.effects.reaction, ['clap']);
  assert.equal(room.effects.notifications.filter(event => event.type === 'learning-reward').length, 1);
});
