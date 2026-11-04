import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockServer } from '../server-proto/mock-server.mjs';
import { RoomServerClient } from '../server-proto/mock-client.mjs';

function withServer(initialBalance, fn) {
  return async () => {
    const server = createMockServer({ initialBalance });
    await server.start(0); // 随机端口
    try { await fn(new RoomServerClient({ baseUrl: server.url(), userId: 'user-001' }), server); }
    finally { await server.stop(); }
  };
}

test('server proto: creditLearning 幂等（eventId）且联动经验/时长', withServer(1000, async client => {
  const first = await client.creditLearning({ eventId: 'lesson-1', learned: 10, reviewed: 5 });
  assert.equal(first.ok, true);
  assert.equal(first.data.points, 25); // 10*2 + 5
  assert.equal(first.data.totalStudySeconds, 10 * 1200 + 5 * 600);
  const again = await client.creditLearning({ eventId: 'lesson-1', learned: 10, reviewed: 5 });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'ALREADY_APPLIED');
  const state = await client.query();
  assert.equal(state.data.balance, 1000 + 25); // 只入账一次
  assert.equal(state.data.xp, 25);
}));

test('server proto: checkin 同日判重、连续天数与本地一致', withServer(1000, async client => {
  const day1 = await client.checkin('2026-11-02');
  assert.equal(day1.ok, true);
  assert.equal(day1.data.points, 3); // 第 1 天
  const dup = await client.checkin('2026-11-02');
  assert.equal(dup.code, 'ALREADY_CHECKED_IN');
  const day2 = await client.checkin('2026-11-03');
  assert.equal(day2.data.streakDays, 2);
  assert.equal(day2.data.points, 4); // 3 + min(2-1,29)
  // 连签 11-04 … 11-07（连续第 3..6 天），11-08 凑满第 7 天
  for (let day = 4; day <= 7; day++) {
    const r = await client.checkin(`2026-11-0${day}`);
    assert.equal(r.ok, true);
    assert.equal(r.data.streakDays, day - 1);
  }
  const day7 = await client.checkin('2026-11-08');
  assert.equal(day7.data.streakDays, 7);
  assert.equal(day7.data.points, 3 + 6 + 10); // 满 7 天 +10
  const state = await client.query();
  assert.equal(state.data.totalCheckIns, 7);
  assert.deepEqual(state.data.checkInDates, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
}));

test('server proto: purchase/expandRoom 用 requestId 幂等重放', withServer(1000, async client => {
  const buy = await client.purchase('clover-planter', 'buy-1');
  assert.equal(buy.ok, true);
  assert.equal(buy.data.price, 120);
  const replay = await client.purchase('clover-planter', 'buy-1');
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.data.balance, 1000 - 120); // 不重复扣款
  const expand = await client.expandRoom('exp-1');
  assert.equal(expand.ok, true);
  assert.equal(expand.data.roomLevel, 1);
  assert.equal(expand.data.price, 600);
  const replayExpand = await client.expandRoom('exp-1');
  assert.equal(replayExpand.replayed, true);
  assert.equal(replayExpand.data.balance, 1000 - 120 - 600);
  // v2.10：已解锁档位内随意切换大小，requestId 幂等
  assert.equal((await client.setRoomLevel(1, 'none')).ok, false); // 当前就是 1 级 → SAME_ROOM_LEVEL（客户端未断言 code，仅确认不扣分）
  const shrink = await client.setRoomLevel(0, 'room-1');
  assert.equal(shrink.ok, true);
  assert.equal(shrink.data.roomLevel, 0);
  assert.equal(shrink.data.balance, 1000 - 120 - 600); // 切换免费
  const shrinkReplay = await client.setRoomLevel(0, 'room-1');
  assert.equal(shrinkReplay.replayed, true);
  assert.equal(shrinkReplay.data.balance, 1000 - 120 - 600);
  // 未解锁档位（当前最高已解锁 1 级）不能切换过去
  const locked = await client.setRoomLevel(2, 'room-2');
  assert.equal(locked.ok, false);
  assert.equal(locked.code, 'LOCKED_ROOM_LEVEL');
  assert.equal((await client.query()).data.balance, 1000 - 120 - 600); // 不扣分
  // 非法档位被拒绝
  assert.equal((await client.setRoomLevel(-1, 'room-bad-1')).code, 'INVALID_PARAMS');
  assert.equal((await client.setRoomLevel(1.5, 'room-bad-2')).code, 'INVALID_PARAMS');
}));

test('server proto: 多用户隔离 + 校验错误码', async () => {
  const server = createMockServer({ initialBalance: 1000 });
  await server.start(0);
  try {
    const a = new RoomServerClient({ baseUrl: server.url(), userId: 'user-a' });
    const b = new RoomServerClient({ baseUrl: server.url(), userId: 'user-b' });
    await a.purchase('clover-planter', 'buy-a');
    assert.equal((await b.query()).data.owned.length, 0); // 隔离
    assert.equal((await a.query()).data.owned.length, 1);
    // 相同 requestId 跨用户互不影响
    await b.purchase('clover-planter', 'buy-a');
    assert.equal((await b.query()).data.owned.length, 1);
    // 校验
    assert.equal((await clientCommand(server, { userId: '', command: 'query' })).code, 'INVALID_PARAMS');
    assert.equal((await clientCommand(server, { userId: 'u', command: 'purchase', params: { sku: 'ghost' }, requestId: 'x' })).code, 'NOT_FOUND');
    assert.equal((await clientCommand(server, { userId: 'u', command: 'creditLearning', params: { eventId: 'e', learned: 500 } })).code, 'INVALID_PARAMS');
    assert.equal((await clientCommand(server, { userId: 'u', command: 'unknown' })).code, 'NOT_FOUND');
    // 未知命令
    assert.equal((await clientCommand(server, { userId: 'u', command: 'unknown' })).code, 'NOT_FOUND');
  } finally {
    await server.stop();
  }
  // 余额不足（低余额独立服务）
  const poorServer = createMockServer({ initialBalance: 100 });
  await poorServer.start(0);
  try {
    const poor = new RoomServerClient({ baseUrl: poorServer.url(), userId: 'user-poor' });
    const denied = await poor.purchase('reading-shelf', 'buy-poor');
    assert.equal(denied.ok, false);
    assert.equal(denied.code, 'BALANCE_MIN');
    assert.equal((await poor.query()).data.balance, 100); // 未扣款
    // 扩建也不足
    assert.equal((await poor.expandRoom('exp-poor')).code, 'BALANCE_MIN');
  } finally {
    await poorServer.stop();
  }
});

async function clientCommand(server, payload) {
  const response = await fetch(`${server.url()}/api/v1/command`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  return response.json();
}