// v2.17（F3）：每种房型独立保存布局。
// 验证 economy 层的槽位读写、切换时继承/恢复、别名同步与旧档回填。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEconomy, ROOM_TIERS } from '../economy.mjs';

function memory() {
  const values = new Map(), writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null, setItem(key, value) { writes.push([key, value]); values.set(key, value); } };
}
const plainLayout = (value = 1) => ({ version: 3, furniture: { table: { position: [value, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] } }, definitions: {}, lampSupport: null });
const levelKeys = () => ROOM_TIERS.map(tier => String(tier.level));

test('expansion saves the previous room layout and lets the new room inherit the arrangement', () => {
  const storage = memory(), economy = createEconomy({ storageAdapter: storage, initialBalance: 5000 });
  economy.purchase('cloud-table', { layout: plainLayout(1), requestId: 'buy:1' });
  economy.expand({ layout: plainLayout(2), requestId: 'expand:1' });
  assert.equal(economy.getState().roomLevel, 1);
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(2)); // 扩建前的房型保存了扩建时点布置
  assert.deepEqual(economy.getRoomLayout(1), plainLayout(2)); // 新房型第一次进入：沿用当前布置
  assert.deepEqual(economy.getLayout(), plainLayout(2));      // 别名与当前房级槽位一致
  const raw = JSON.parse(storage.values.get('original-pet-room-account-v1'));
  assert.ok(Object.hasOwn(raw, 'layouts'));
  assert.deepEqual(raw.layouts['0'], plainLayout(2));
  assert.deepEqual(raw.layouts['1'], plainLayout(2));
});

test('switching rooms restores each room type its own saved layout', () => {
  const storage = memory(), economy = createEconomy({ storageAdapter: storage, initialBalance: 5000 });
  // 房型 0：布置成 plainLayout(1)，再微调为 plainLayout(2)
  economy.purchase('cloud-table', { layout: plainLayout(1), requestId: 'buy:1' });
  economy.setLayout(plainLayout(2));
  // 扩建到房型 1：离开时保存 slot0=3，新房型第一次进入沿用当前布置 slot1=3
  economy.expand({ layout: plainLayout(3), requestId: 'expand:1' });
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(3));
  assert.deepEqual(economy.getRoomLayout(1), plainLayout(3));
  // 在房型 1 里布置成 plainLayout(4)
  economy.setLayout(plainLayout(4));
  assert.deepEqual(economy.getRoomLayout(1), plainLayout(4));
  // 切回房型 0：离开时保存 slot1=4（当前布置），恢复房型 0 自己保存的布局 slot0=3
  economy.setRoomLevel(0, { layout: plainLayout(4), requestId: 'room:0' });
  assert.deepEqual(economy.getRoomLayout(1), plainLayout(4));
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(3));
  assert.deepEqual(economy.getLayout(), plainLayout(3));
  // 再次切到房型 1：恢复房型 1 自己的布局 4，而不是房型 0 的 3
  economy.setRoomLevel(1, { layout: plainLayout(3), requestId: 'room:1' });
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(3));
  assert.deepEqual(economy.getLayout(), plainLayout(4));
});

test('switching without a layout restores the target room layout and keeps the alias in sync', () => {
  const storage = memory(), economy = createEconomy({ storageAdapter: storage, initialBalance: 5000 });
  economy.expand({ layout: plainLayout(2), requestId: 'expand:1' });
  economy.setLayout(plainLayout(3)); // 房型 1 布置
  economy.setRoomLevel(0, { layout: plainLayout(3), requestId: 'room:0' }); // 回房型 0：恢复 slot0=2
  assert.deepEqual(economy.getLayout(), plainLayout(2));
  // 回放路径：同一 requestId 再次用于 set-room → 幂等 unchanged，布局不变
  const replay = economy.setRoomLevel(0, { requestId: 'room:0' });
  assert.equal(replay.ok, true);
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(2));
  assert.deepEqual(economy.getLayout(), plainLayout(2));
  // 无校验布局的“宿主导航”切换：目标房型自己的布局被恢复
  economy.setRoomLevel(1, { requestId: 'nav:1' });
  assert.equal(economy.getState().roomLevel, 1);
  assert.deepEqual(economy.getLayout(), plainLayout(3));
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(2)); // 离开房型 0 时槽位以别名回填
});

test('setLayout always writes the current room-type slot and the alias', () => {
  const economy = createEconomy({ storageAdapter: null, initialBalance: 5000 });
  economy.expand({ layout: plainLayout(2), requestId: 'expand:1' });
  economy.setLayout(plainLayout(9));
  assert.deepEqual(economy.getLayout(), plainLayout(9));
  assert.deepEqual(economy.getRoomLayout(1), plainLayout(9)); // 写入当前房型槽位
  assert.deepEqual(economy.getRoomLayout(0), plainLayout(2)); // 其它房型不受影响
});

test('per-room layouts survive a reload through parseAccount round trip', () => {
  const storage = memory(), economy = createEconomy({ storageAdapter: storage, initialBalance: 5000 });
  economy.purchase('cloud-table', { layout: plainLayout(1), requestId: 'buy:1' });
  economy.expand({ layout: plainLayout(2), requestId: 'expand:1' });
  economy.setLayout(plainLayout(3)); // 房型 1 布置
  economy.setRoomLevel(0, { layout: plainLayout(3), requestId: 'room:0' }); // 回到房型 0
  const loaded = createEconomy({ storageAdapter: storage, initialBalance: 0 });
  assert.equal(loaded.getState().valid, true);
  assert.deepEqual(loaded.getRoomLayout(0), plainLayout(2));
  assert.deepEqual(loaded.getRoomLayout(1), plainLayout(3));
  assert.deepEqual(loaded.getLayout(), plainLayout(2)); // 当前房级 0 的别名与槽位一致
});

test('legacy saves without layouts backfill the current room slot and stay loadable', () => {
  const legacy = JSON.stringify({ version: 1, balance: 10, roomLevel: 1, maxRoomLevel: 1, owned: [], layout: plainLayout(7), claims: { learning: [], requests: [] }, totalSpent: 0, petOwned: ['apricot-fox'], activePet: 'apricot-fox' });
  const storage = { values: new Map([['original-pet-room-account-v1', legacy]]), getItem: key => legacy, setItem() {} };
  const economy = createEconomy({ storageAdapter: storage });
  assert.equal(economy.getState().valid, true);
  assert.deepEqual(economy.getRoomLayout(1), plainLayout(7));
  assert.deepEqual(economy.getRoomLayout(0), null);
  assert.deepEqual(economy.getLayout(), plainLayout(7));
});

test('invalid layouts objects are rejected without overwriting the saved account', () => {
  const storage = memory();
  const good = createEconomy({ storageAdapter: storage, initialBalance: 1000 });
  good.purchase('cloud-table', { layout: plainLayout(1), requestId: 'buy:1' });
  const saved = storage.values.get('original-pet-room-account-v1');
  const raw = JSON.parse(saved);
  let deep = {}; let node = deep;
  for (let i = 0; i < 30; i++) { node.a = {}; node = node.a; } // 超过 copyJSON 深度上限
  raw.layouts = { '0': deep };
  storage.values.set('original-pet-room-account-v1', JSON.stringify(raw));
  const blocked = createEconomy({ storageAdapter: storage });
  assert.equal(blocked.getState().valid, false);
  assert.equal(blocked.getState().error?.code, 'INVALID_STATE');
  const invalid = JSON.stringify(raw);
  assert.equal(storage.values.get('original-pet-room-account-v1'), invalid); // 坏档不被覆盖、不被修写
});

test('layouts keys outside the room tiers are rejected', () => {
  const raw = JSON.stringify({ version: 1, balance: 0, roomLevel: 0, owned: [], layout: null, layouts: { '9': null }, claims: { learning: [], requests: [] } });
  const blocked = createEconomy({ storageAdapter: { getItem: () => raw, setItem() {} } });
  assert.equal(blocked.getState().valid, false);
  assert.equal(blocked.getState().error?.code, 'INVALID_STATE');
  assert.deepEqual(levelKeys().sort(), ['0', '1', '2'].sort());
});
