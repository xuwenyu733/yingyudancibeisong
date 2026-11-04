// v2.17（F6）：存档备份——自动保留最近几次完整存档，支持导出/恢复/删除。
import test from 'node:test';
import assert from 'node:assert/strict';
import { addBackup, removeBackup, findBackup, readBackups, parseBackups, MAX_BACKUPS, MAX_BACKUP_BYTES, BACKUP_KEY_SUFFIX } from '../backup.mjs';

function memory() {
  const values = new Map(), writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null, setItem(key, value) { writes.push([key, value]); values.set(key, value); }, removeItem(key) { values.delete(key); } };
}
const key = 'demo-backups-v1';
const sampleArchive = (n) => ({ format: 1, version: '2.17.0', exportedAt: '2025-01-01T00:00:00.000Z', profile: { name: `存档${n}` }, economy: { balance: n } });
const fixedNow = () => new Date('2025-01-01T00:00:00.000Z');

test('addBackup keeps only the newest MAX_BACKUPS and newest-first order', () => {
  const storage = memory();
  for (let i = 1; i <= 5; i++) {
    const result = addBackup({ adapter: storage, key, archive: sampleArchive(i), note: `备份${i}`, now: new Date(Date.parse('2025-01-01T00:00:00.000Z') + i * 1000) });
    assert.equal(result.ok, true);
  }
  const list = readBackups(storage, key);
  assert.equal(list.ok, true);
  assert.equal(list.backups.length, MAX_BACKUPS);
  assert.deepEqual(list.backups.map(entry => entry.note), ['备份5', '备份4', '备份3']);
  assert.equal(storage.values.has(key), true);
});

test('removeBackup removes one entry and survives reload round trip', () => {
  const storage = memory();
  addBackup({ adapter: storage, key, archive: sampleArchive(1), note: 'a', now: fixedNow() });
  addBackup({ adapter: storage, key, archive: sampleArchive(2), note: 'b', now: new Date(Date.parse('2025-01-01T00:00:01.000Z')) });
  const first = readBackups(storage, key).backups[1]; // note 'a'
  const removed = removeBackup(storage, key, first.id);
  assert.equal(removed.ok, true);
  const list = readBackups(storage, key);
  assert.deepEqual(list.backups.map(entry => entry.note), ['b']);
  assert.equal(findBackup(storage, key, first.id), null);
  assert.equal(storage.writes.length, 3); // 两次 add + 一次 remove，全部落盘
});

test('corrupt backup lists are ignored without crashing', () => {
  const storage = memory();
  storage.values.set(key, '{broken');
  const list = readBackups(storage, key);
  assert.equal(list.ok, true);
  assert.deepEqual(list.backups, []);
  // 坏列表也可以继续追加（重新写入干净列表）
  const added = addBackup({ adapter: storage, key, archive: sampleArchive(1), note: 'recover', now: fixedNow() });
  assert.equal(added.ok, true);
  assert.equal(readBackups(storage, key).backups[0].note, 'recover');
});

test('parseBackups filters invalid entries and keeps valid JSON archives', () => {
  const parsed = parseBackups(JSON.stringify([
    { id: 'bk-1', at: '2025-01-01T00:00:00.000Z', note: 'ok', archive: { profile: {}, economy: {} } },
    { id: 'bad-date', at: 'not-a-date', note: 'bad', archive: {} },
    { id: 'bad-archive', at: '2025-01-01T00:00:00.000Z', note: 'x', archive: 'not-json' },
  ]));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.backups.length, 1);
  assert.equal(parsed.backups[0].id, 'bk-1');
  assert.equal(parsed.backups[0].archive.economy.balance === undefined, true);
});

test('backup key suffix and size guard', () => {
  assert.equal(BACKUP_KEY_SUFFIX, '-backups-v1');
  const storage = memory();
  const huge = { payload: 'x'.repeat(1800 * 1024) };
  const result = addBackup({ adapter: storage, key, archive: huge, note: 'too-big', now: fixedNow() });
  assert.equal(result.ok, false);
  assert.equal(storage.values.has(key), false);
});

test('large backups evict the oldest by encoded bytes and always retain the newest recovery point', () => {
  const storage = memory();
  for (let index = 1; index <= 5; index++) {
    const archive = { ...sampleArchive(index), payload: '宠'.repeat(200000) };
    const result = addBackup({ adapter: storage, key, archive, note: `large-${index}`, now: new Date(2026, 9, index) });
    assert.equal(result.ok, true, `第 ${index} 份大档必须仍可写入`);
    assert.ok(new TextEncoder().encode(storage.getItem(key)).byteLength <= MAX_BACKUP_BYTES);
  }
  const backups = readBackups(storage, key).backups;
  assert.equal(backups.length, 2);
  assert.deepEqual(backups.map(entry => entry.note), ['large-5', 'large-4']);
  assert.equal(backups[0].archive.economy.balance, 5);
});

test('an individually oversized backup leaves existing recovery points intact', () => {
  const storage = memory();
  assert.equal(addBackup({ adapter: storage, key, archive: sampleArchive(1), now: fixedNow() }).ok, true);
  const before = storage.getItem(key);
  assert.equal(addBackup({ adapter: storage, key, archive: { payload: 'x'.repeat(MAX_BACKUP_BYTES) }, now: fixedNow() }).ok, false);
  assert.equal(storage.getItem(key), before);
});
