import test from 'node:test';
import assert from 'node:assert/strict';
import {createEconomy} from '../economy.mjs';
import {createProfile} from '../profile.mjs';
import {
  readAccounts, registerAccount, deleteAccount, renameAccount,
  readSession, loginAccount, loginGuest, logout, resolveStorageKey,
  makeAccountId, makeGuestKey,
} from '../account-session.mjs';

function memory(){return {values:new Map(),writes:[],getItem(key){return this.values.get(key)??null;},setItem(key,value){this.writes.push([key,value]);this.values.set(key,value);},removeItem(key){this.values.delete(key);}};}

test('registerAccount 写入索引并返回 id/昵称', () => {
  const storage = memory();
  const a = registerAccount(storage, '甜甜');
  assert.ok(a.id.startsWith('user-'));
  assert.equal(a.name, '甜甜');
  assert.ok(a.createdAt);
  assert.equal(readAccounts(storage).list.length, 1);
});

test('注册昵称留空自动叫小屋主人，超长截断', () => {
  const storage = memory();
  assert.equal(registerAccount(storage, '  ').name, '小屋主人');
  assert.equal(registerAccount(storage, 'X'.repeat(50)).name.length, 20);
});

test('deleteAccount 移除账号索引', () => {
  const storage = memory();
  const a = registerAccount(storage, 'A');
  registerAccount(storage, 'B');
  assert.equal(readAccounts(storage).list.length, 2);
  assert.equal(deleteAccount(storage, a.id), true);
  assert.equal(readAccounts(storage).list.length, 1);
  assert.equal(deleteAccount(storage, '不存在'), false);
});

test('renameAccount 只改昵称', () => {
  const storage = memory();
  const a = registerAccount(storage, '旧名');
  assert.equal(renameAccount(storage, a.id, '新名'), true);
  assert.equal(readAccounts(storage).list[0].name, '新名');
  assert.equal(renameAccount(storage, '不存在', 'X'), false);
});

test('loginAccount 建立账号会话，刷新不丢', () => {
  const storage = memory();
  const a = registerAccount(storage, '甜甜');
  loginAccount(storage, a.id);
  const session = readSession(storage);
  assert.deepEqual({ kind: session.kind, id: session.id }, { kind: 'account', id: a.id });
  // 同一 storage 再读（模拟刷新）会话仍在
  assert.deepEqual(readSession(storage), { kind: 'account', id: a.id });
});

test('resolveStorageKey 对账号会话返回其 id（整账号隔离）', () => {
  const storage = memory();
  const a = registerAccount(storage, 'A');
  const b = registerAccount(storage, 'B');
  loginAccount(storage, a.id);
  assert.equal(resolveStorageKey(storage), a.id);
  loginAccount(storage, b.id);
  assert.equal(resolveStorageKey(storage), b.id);
  assert.notEqual(a.id, b.id);
});

test('访客每次 resolveStorageKey 都不同（重进即重置）', () => {
  const storage = memory();
  loginGuest(storage);
  const first = resolveStorageKey(storage);
  const second = resolveStorageKey(storage);
  assert.ok(first.startsWith('pet-room-guest-'));
  assert.notEqual(first, second, '访客不以固定 key 持久化');
});

test('logout 清会话后 resolveStorageKey 回到随机访客', () => {
  const storage = memory();
  const a = registerAccount(storage, 'A');
  loginAccount(storage, a.id);
  assert.equal(resolveStorageKey(storage), a.id);
  logout(storage);
  const session = readSession(storage);
  assert.equal(session.kind, 'none');
  assert.ok(resolveStorageKey(storage).startsWith('pet-room-guest-'));
});

test('makeAccountId / makeGuestKey 唯一性', () => {
  const ids = new Set([...Array(50)].map(() => makeAccountId(1000, () => Math.random())));
  assert.equal(ids.size, 50);
  const guests = new Set([...Array(50)].map(() => makeGuestKey(1000, () => Math.random())));
  assert.equal(guests.size, 50);
});

test('损坏的索引/会话被当成空处理（不崩溃）', () => {
  const storage = memory();
  storage.values.set('pet-room-accounts-v1', 'not json{');
  storage.values.set('pet-room-session-v1', '{oops');
  assert.deepEqual(readAccounts(storage).list, []);
  assert.equal(readSession(storage).kind, 'none');
  assert.ok(resolveStorageKey(storage).startsWith('pet-room-guest-'));
});

test('记录会话的 guest 键不会把旧访客数据带回来', () => {
  const storage = memory();
  loginGuest(storage);
  const key1 = resolveStorageKey(storage);
  // 模拟业务键写入访客存档
  storage.setItem(key1 + '-account-v1', '{"balance":1}');
  const key2 = resolveStorageKey(storage);
  assert.notEqual(key1, key2);
  assert.equal(storage.getItem(key2 + '-account-v1'), null, '新访客看不到旧访客数据');
});

test('端到端：两个注册账号的存档（积分/昵称/宠物）完全隔离', () => {
  const storage = memory();
  const a = registerAccount(storage, '甜甜');
  const b = registerAccount(storage, '小虎');

  // 分别以两账号 id 为 storageKey 建业务模块（与 mountRoom 相同的派生规则）
  loginAccount(storage, a.id);
  const aKey = resolveStorageKey(storage);
  loginAccount(storage, b.id);
  const bKey = resolveStorageKey(storage);
  assert.notEqual(aKey, bKey);

  const ea = createEconomy({ storageAdapter: storage, storageKey: aKey + '-account-v1', initialBalance: 1500 });
  const eb = createEconomy({ storageAdapter: storage, storageKey: bKey + '-account-v1', initialBalance: 100 });
  const pa = createProfile({ storageAdapter: storage, storageKey: aKey + '-profile-v1' });
  pa.setName('甜甜');
  // 触发一次交易让初始余额落盘（createEconomy 仅在交易时落盘；reward 幂等，加 1 后再断言初始值）
  assert.equal(ea.reward({ eventId: 'seed-a', points: 1 }).ok, true);
  assert.equal(eb.reward({ eventId: 'seed-b', points: 1 }).ok, true);
  assert.equal(ea.getState().balance, 1501);
  assert.equal(eb.getState().balance, 101);

  // 重新按账号会话打开：数据各自仍在
  loginAccount(storage, a.id);
  const reloadA = createEconomy({ storageAdapter: storage, storageKey: resolveStorageKey(storage) + '-account-v1' });
  assert.equal(reloadA.getState().balance, 1501);
  const reloadAProfile = createProfile({ storageAdapter: storage, storageKey: resolveStorageKey(storage) + '-profile-v1' });
  assert.equal(reloadAProfile.getState().name, '甜甜');
});