import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy } from '../economy.mjs';
import { createProfile } from '../profile.mjs';
import { createCompanionStore, COMPANION_SUFFIX } from '../companion-state.mjs';
import { exportArchive, importArchive, restoreArchive } from '../archive.mjs';

function memory() {
  return { values: new Map(), writes: [], getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { this.writes.push(key); this.values.set(key, value); }, removeItem(key) { this.values.delete(key); } };
}
const storageKey = 'child-a', companionKey = storageKey + COMPANION_SUFFIX;
function sample(includeCompanion = true) {
  const profile = createProfile({ storageAdapter: null }), economy = createEconomy({ storageAdapter: null, initialBalance: 1200 }), companion = createCompanionStore();
  profile.setName('甜甜'); companion.update({ petName: '糖糖', roomName: '彩虹小屋' }); companion.customize('sofa', { color: '#abcdef', sticker: 'heart' });
  return exportArchive({ profile: profile.getState(), economy: economy.getState(), meta: { source: 'test', ...(includeCompanion ? { companion: companion.getState() } : {}) } });
}
function seed(adapter) {
  const profile = createProfile({ storageAdapter: adapter, storageKey: storageKey + '-profile-v1' });
  const economy = createEconomy({ storageAdapter: adapter, storageKey: storageKey + '-account-v1', initialBalance: 100 });
  const companion = createCompanionStore({ adapter, key: companionKey });
  profile.setName('原昵称'); economy.reward({ eventId: 'seed', points: 1 }); companion.update({ petName: '原伙伴', roomName: '原房间' });
  return { profile, economy, companion };
}
const current = saved => ({ profile: saved.profile.getState(), economy: saved.economy.getState(), companion: saved.companion.getState() });

test('archive meta round trip validates companion and restores all three account keys', () => {
  const adapter = memory(), old = seed(adapter), archive = sample();
  assert.equal(archive.meta.companion.petName, '糖糖');
  const imported = importArchive(JSON.stringify(archive));
  assert.equal(imported.ok, true);
  assert.equal(imported.meta.source, 'test');
  assert.equal(imported.meta.companion.roomName, '彩虹小屋');
  assert.equal(Object.hasOwn(imported.meta.companion, 'valid'), false, '持久化数据不携带视图状态');
  const result = restoreArchive({ json: archive, storageAdapter: adapter, storageKey, expectedState: current(old) });
  assert.equal(result.ok, true);
  assert.equal(createProfile({ storageAdapter: adapter, storageKey: storageKey + '-profile-v1' }).getState().name, '甜甜');
  assert.equal(createEconomy({ storageAdapter: adapter, storageKey: storageKey + '-account-v1' }).getState().balance, 1200);
  const companion = createCompanionStore({ adapter, key: companionKey }).getState();
  assert.equal(companion.petName, '糖糖');
  assert.deepEqual(companion.furnitureStyles.sofa, { color: '#abcdef', sticker: 'heart' });
});

test('legacy archives without companion preserve the existing handbook and only write two keys', () => {
  const adapter = memory(); seed(adapter); const before = adapter.getItem(companionKey); adapter.writes.length = 0;
  assert.equal(restoreArchive({ json: sample(false), storageAdapter: adapter, storageKey }).ok, true);
  assert.equal(adapter.getItem(companionKey), before);
  assert.deepEqual(adapter.writes, [storageKey + '-profile-v1', storageKey + '-account-v1']);
});

test('invalid companion schema rejects import before any ledger is written', () => {
  for (const companion of [null, { version: 999 }, { version: 1, theme: 'unsupported' }, { version: 1, furnitureStyles: { sofa: { color: 'red' } } }]) {
    const adapter = memory(); seed(adapter); const before = new Map(adapter.values), writes = adapter.writes.length;
    const archive = sample(); archive.meta.companion = companion;
    assert.equal(importArchive(archive).code, 'ARCHIVE_INVALID');
    assert.equal(restoreArchive({ json: archive, storageAdapter: adapter, storageKey }).code, 'ARCHIVE_INVALID');
    assert.deepEqual(adapter.values, before);
    assert.equal(adapter.writes.length, writes);
  }
});

for (const writeBeforeThrow of [false, true]) test(`third key failure rolls back all three original values (write before throw: ${writeBeforeThrow})`, () => {
  const adapter = memory(); seed(adapter); const before = new Map(adapter.values), write = adapter.setItem.bind(adapter);
  let failed = false;
  adapter.setItem = (key, value) => {
    if (key === companionKey && !failed) {
      failed = true;
      if (writeBeforeThrow) write(key, value);
      throw new Error('third-key quota failure');
    }
    write(key, value);
  };
  const result = restoreArchive({ json: sample(), storageAdapter: adapter, storageKey });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'STORAGE_WRITE_FAILED');
  assert.deepEqual(adapter.values, before, '个人主页、积分及伙伴手册均还原');
});

test('third-key write failure also removes every newly created key during rollback', () => {
  const adapter = memory(), write = adapter.setItem.bind(adapter);
  adapter.setItem = (key, value) => { write(key, value); if (key === companionKey) throw new Error('failed after write'); };
  const result = restoreArchive({ json: sample(), storageAdapter: adapter, storageKey });
  assert.equal(result.code, 'STORAGE_WRITE_FAILED');
  assert.equal(adapter.values.size, 0);
});

test('provided companion expected state detects a stale handbook without writes', () => {
  const adapter = memory(), saved = seed(adapter), expectedState = current(saved);
  const newer = createCompanionStore({ adapter, key: companionKey });
  newer.update({ roomName: '别的窗口改的新名字' });
  const before = new Map(adapter.values), writes = adapter.writes.length;
  assert.equal(restoreArchive({ json: sample(), storageAdapter: adapter, storageKey, expectedState }).code, 'ARCHIVE_CONFLICT');
  assert.deepEqual(adapter.values, before);
  assert.equal(adapter.writes.length, writes);
});

test('callers providing only profile and economy expected state remain compatible with companion archives', () => {
  const adapter = memory(), saved = seed(adapter), expectedState = { profile: saved.profile.getState(), economy: saved.economy.getState() };
  assert.equal(restoreArchive({ json: sample(), storageAdapter: adapter, storageKey, expectedState }).ok, true);
  assert.equal(createCompanionStore({ adapter, key: companionKey }).getState().roomName, '彩虹小屋');
});

test('failed companion rollback reports recovery requirements while still restoring the other ledgers', () => {
  const adapter = memory(); seed(adapter); const before = new Map(adapter.values), write = adapter.setItem.bind(adapter);
  // Force rollback verification to fail rather than claiming a completed recovery.
  const read = adapter.getItem.bind(adapter); let afterWrite = false;
  adapter.setItem = (key, value) => { if (key === companionKey) { afterWrite = true; write(key, value); throw new Error('third-key failure'); } write(key, value); };
  adapter.getItem = key => key === companionKey && afterWrite ? 'external-change' : read(key);
  const result = restoreArchive({ json: sample(), storageAdapter: adapter, storageKey });
  assert.equal(result.code, 'STORAGE_ROLLBACK_FAILED');
  assert.equal(result.recoveryRequired, true);
  assert.equal(adapter.getItem(storageKey + '-profile-v1'), before.get(storageKey + '-profile-v1'));
  assert.equal(adapter.getItem(storageKey + '-account-v1'), before.get(storageKey + '-account-v1'));
});
