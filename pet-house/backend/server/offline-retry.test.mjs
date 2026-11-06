/** 断网重试验证：database-sync 适配器在本机离线时只写本地、
 * 打 pending 标记，连接恢复后按 revision 重试上传；409 进入冲突态并保留本机修改。
 * 不依赖真实 MySQL（仓库层已由 mysql.integration.test.mjs 覆盖），用可控 fetcher 模拟网络。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabaseStorage} from '../../source-connected/database-sync.mjs';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    map,
  };
}
const noopWin = { setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };

test('断网：本机修改只写本地并保持待上传，连接恢复后重试成功并确认 revision', async () => {
  const key = 'offline-verify-room';
  let online = false;
  const storage = fakeStorage();
  const statusLog = [];
  const fetcher = async (url, opts = {}) => {
    if (!online) return { ok: false, status: 0 };
    if ((opts.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => ({ ok: true, revision: 0, entries: null }) };
    }
    assert.equal(opts.method, 'PUT');
    const body = JSON.parse(opts.body);
    assert.equal(body.baseRevision, 0);
    assert.equal(body.entries[key + '-estate-v1'], JSON.stringify({ room: '团团的小屋' }));
    return { ok: true, status: 200, json: async () => ({ ok: true, revision: 1 }) };
  };

  const sync = await openDatabaseStorage({ storageKey: key, storage, fetcher, win: noopWin, onStatus: s => statusLog.push(s.state) });
  assert.equal(sync.state, 'offline', '服务不可达时应进入离线态');
  // 离线时的一次改动：必须立即落本机，且只打 pending 标记
  sync.adapter.setItem(key + '-estate-v1', JSON.stringify({ room: '团团的小屋' }));
  assert.equal(storage.getItem(key + '-estate-v1'), JSON.stringify({ room: '团团的小屋' }), '本机副本必须先行持久化');
  assert.equal(sync.pending, true, '应标记待上传');

  const failed = await sync.flush();
  assert.equal(failed.code, 'SYNC_OFFLINE', '网络未恢复时上传应失败');
  assert.equal(sync.pending, true, '上传失败后待上传标记必须保留');

  online = true; // 连接恢复
  const result = await sync.flush();
  assert.equal(result.ok, true, '连接恢复后重试应成功');
  assert.equal(result.revision, 1);
  assert.equal(sync.pending, false, '成功后清除待上传标记');
  assert.equal(sync.state, 'synced');
  assert.ok(statusLog.includes('offline') && statusLog.includes('pending') && statusLog.includes('synced'), '状态应经历 offline→pending→synced');
});

test('连接恢复后远端已有更新（revision 领先）：进入冲突态且本机修改保留', async () => {
  const key = 'conflict-window-room';
  const storage = fakeStorage();
  let mode = 'offline'; // offline → remote-updated（另一窗口已提交 revision 3）
  const fetcher = async (url, opts = {}) => {
    if (mode === 'offline') return { ok: false, status: 0 };
    return { ok: true, status: 200, json: async () => ({ ok: true, revision: 3, entries: { [key + '-estate-v1']: JSON.stringify({ room: '另一个窗口的改动' }) } }) };
  };
  const sync = await openDatabaseStorage({ storageKey: key, storage, fetcher, win: noopWin });
  sync.adapter.setItem(key + '-estate-v1', JSON.stringify({ room: '本窗口的改动' }));
  assert.equal(sync.pending, true);
  await sync.flush().catch(() => {}); // 此时仍离线，只确认失败不留脏状态
  mode = 'remote-updated'; // 连接恢复，但远端已被另一窗口推进到 revision 3
  const result = await sync.flush();
  assert.equal(result.code, 'SYNC_CONFLICT', '远端版本领先时应进入冲突态');
  assert.equal(sync.state, 'conflict');
  assert.equal(storage.getItem(key + '-estate-v1'), JSON.stringify({ room: '本窗口的改动' }), '冲突时本机修改必须保留');
  assert.equal(sync.adapter.getItem(key + '-estate-v1'), JSON.stringify({ room: '本窗口的改动' }));
});

test('本地storage不可写时：修改不落盘即失败，不产生半上传状态', async () => {
  const key = 'readonly-room';
  const storage = fakeStorage();
  const original = storage.setItem;
  storage.setItem = function (k, v) { throw new Error('QuotaExceeded'); };
  const sync = await openDatabaseStorage({ storageKey: key, storage, fetcher: () => Promise.resolve({ ok: false, status: 0 }), win: noopWin });
  assert.throws(() => sync.adapter.setItem(key + '-estate-v1', 'x'), undefined, '写失败必须抛错');
  storage.setItem = original;
  assert.equal(storage.getItem(key + '-estate-v1'), null, '写失败不应留下本地记录');
});

for(const reopen of [false,true])test(`服务器已保存但响应丢失：${reopen?'刷新后':'继续装修后'}确认上次内容并接续新修改`,async()=>{
 const key='lost-response-'+reopen,storage=fakeStorage();let remote={ok:true,revision:0,entries:null},lose=true;
 const fetcher=async(url,opts={})=>{if(opts.method!=='PUT')return{ok:true,json:async()=>structuredClone(remote)};const body=JSON.parse(opts.body);assert.equal(body.baseRevision,remote.revision);remote={ok:true,revision:remote.revision+1,entries:body.entries};if(lose){lose=false;throw new Error('response lost after commit');}return{ok:true,status:200,json:async()=>({ok:true,revision:remote.revision})};};
 let sync=await openDatabaseStorage({storageKey:key,storage,fetcher,win:noopWin});sync.adapter.setItem(key+'-estate-v1','第一套装修');assert.equal((await sync.flush()).code,'SYNC_OFFLINE');assert.equal(remote.revision,1);
 sync.adapter.setItem(key+'-estate-v1','备份后新建的装修');if(reopen){sync.dispose();sync=await openDatabaseStorage({storageKey:key,storage,fetcher,win:noopWin});}
 assert.equal((await sync.flush()).ok,true);assert.equal(sync.state,'synced');assert.equal(remote.revision,2);assert.equal(remote.entries[key+'-estate-v1'],'备份后新建的装修');assert.equal(JSON.parse(storage.getItem(key+'-mysql-sync-v1')).upload,undefined);sync.dispose();
});

test('丢失响应后若另一窗口已保存不同内容，仍保留冲突保护',async()=>{
 const key='lost-response-other-writer',storage=fakeStorage();let remote={ok:true,revision:0,entries:null},puts=0;
 const fetcher=async(url,opts={})=>{if(opts.method!=='PUT')return{ok:true,json:async()=>structuredClone(remote)};puts++;const body=JSON.parse(opts.body);remote={ok:true,revision:1,entries:body.entries};throw new Error('response lost');};
 const sync=await openDatabaseStorage({storageKey:key,storage,fetcher,win:noopWin});sync.adapter.setItem(key+'-estate-v1','我的装修');await sync.flush();sync.adapter.setItem(key+'-estate-v1','我的更新');remote={ok:true,revision:2,entries:{[key+'-estate-v1']:'另一窗口的不同装修'}};
 assert.equal((await sync.flush()).code,'SYNC_CONFLICT');assert.equal(puts,1);assert.equal(storage.getItem(key+'-estate-v1'),'我的更新');assert.equal(remote.entries[key+'-estate-v1'],'另一窗口的不同装修');sync.dispose();
});
