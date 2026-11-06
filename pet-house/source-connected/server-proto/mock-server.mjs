/** v2.6 服务端账本参考实现（纯 Node，内存态；可文件持久化，v2.7/batch1）。
 * 协议见 server-proto/proto.md。命令：creditLearning / checkin / purchase / expandRoom / query。
 * 幂等：creditLearning→eventId；checkin→date 业务判重；purchase/expandRoom→requestId 重放。
 * 独立运行：node server-proto/mock-server.mjs [port]
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SHOP = {
  'clover-planter': { name: '四叶草盆栽', price: 120 },
  'reading-shelf': { name: '阅读书架', price: 260 },
  'cloud-table': { name: '云朵小桌', price: 180 },
  'moon-ornament': { name: '月亮摆件', price: 220 },
  'star-lamp': { name: '星星夜灯', price: 240 },
  'mushroom-stool': { name: '蘑菇小凳', price: 150 },
  'beehive-ornament': { name: '蜂巢摆件', price: 210 },
  'rocket-toy': { name: '小火箭摆件', price: 260 },
  'rainbow-arch': { name: '彩虹拱门', price: 300 },
  'candy-tree': { name: '糖果小树', price: 180 },
  'tile-honey-grid': { name: '蜂蜜奶油砖', price: 90 },
  'tile-blush-checker': { name: '蜜桃棋盘砖', price: 160 },
  'tile-mint-diamond': { name: '薄荷菱花砖', price: 240 },
  'tile-blue-mosaic': { name: '海盐星花砖', price: 360 },
  'tile-sakura-terrazzo': { name: '樱花水磨石', price: 520 },
  'tile-walnut-parquet': { name: '胡桃人字拼', price: 720 },
  'tile-moon-marble': { name: '月辉金脉石', price: 1050 },
  'tile-royal-medallion': { name: '星宫鎏金拼花', price: 1500 },
  'wall-botanical-frame': { name: '晨光植物画', price: 80 },
  'wall-daisy-wreath': { name: '雏菊花环', price: 120 },
  'wall-rainbow-cloud': { name: '云端小彩虹', price: 180 },
  'wall-butterfly-duo': { name: '双蝶标本盒', price: 250 },
  'wall-moon-mobile': { name: '月眠星铃', price: 340 },
  'wall-forest-clock': { name: '林间布谷钟', price: 440 },
  'wall-ocean-triptych': { name: '潮汐三联画', price: 580 },
  'wall-sakura-fan': { name: '樱雨折扇', price: 760 },
  'wall-starlight-mirror': { name: '星芒鎏金镜', price: 980 },
  'wall-crystal-chandelier': { name: '极光水晶壁灯', price: 1250 },
  'wall-celestial-orrery': { name: '星河天仪', price: 1600 },
  'wall-phoenix-tapestry': { name: '凤羽流光屏', price: 2100 },
};
const EXPAND_PRICES = [0, 600, 1500];
const isId = v => typeof v === 'string' && /^[\w.-]{1,64}$/.test(v);
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const prevDay = date => { const t = new Date(`${date}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

export function createMockServer({ initialBalance = 1000, filePath = null } = {}) {
  const accounts = new Map(); // userId -> account
  const requestLog = new Map(); // `userId:requestId` -> result（purchase/expandRoom 幂等重放）

  // 文件持久化（可选）：启动时加载，每次可写命令成功后落盘；写失败只告警不影响内存响应。
  function loadPersistence() {
    if (!filePath || !existsSync(filePath)) return;
    try {
      const saved = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!saved || typeof saved !== 'object' || !Array.isArray(saved.accounts) || !Array.isArray(saved.requestLog)) return;
      for (const [userId, account] of saved.accounts) accounts.set(userId, account);
      for (const [key, value] of saved.requestLog) requestLog.set(key, value);
    } catch { /* 存档损坏时按全新账户启动 */ }
  }
  function persist() {
    if (!filePath) return;
    try { writeFileSync(filePath, JSON.stringify({ version: 1, accounts: [...accounts.entries()], requestLog: [...requestLog.entries()] })); }
    catch (error) { console.warn(`[mock-server] 持久化失败（不影响当前响应）：${error.message}`); }
  }
  loadPersistence();

  function accountFor(userId) {
    let account = accounts.get(userId);
    if (!account) {
      account = {
        balance: initialBalance, roomLevel: 0, maxRoomLevel:0, owned: [],
        learning: [], // {eventId, learned, reviewed, points, at}
        profile: { totalStudySeconds: 0, xp: 0, streakDays: 0, totalCheckIns: 0, lastCheckIn: null, checkInDates: [] },
      };
      accounts.set(userId, account);
    }
    return account;
  }
  const reply = (ok, code, message, data = null) => ({ ok, code, message, data });

  function handleCredit(account, params) {
    const { eventId, learned = 0, reviewed = 0 } = params || {};
    if (!isId(eventId)) return reply(false, 'INVALID_PARAMS', 'eventId 必须为非空短串');
    if (!Number.isInteger(learned) || learned < 0 || learned > 100 || !Number.isInteger(reviewed) || reviewed < 0 || reviewed > 100) {
      return reply(false, 'INVALID_PARAMS', 'learned/reviewed 必须为 0-100 整数');
    }
    if (account.learning.some(item => item.eventId === eventId)) return reply(false, 'ALREADY_APPLIED', '该学习事件已结算过');
    const points = learned * 2 + reviewed;
    account.balance += points;
    account.profile.xp += points;
    account.profile.totalStudySeconds += learned * 1200 + reviewed * 600; // 与本地语义对齐：新词20分钟、复习10分钟
    account.learning.push({ eventId, learned, reviewed, points, at: new Date().toISOString() });
    return reply(true, 'OK', '学习奖励已入账', { balance: account.balance, points, totalStudySeconds: account.profile.totalStudySeconds });
  }

  function handleCheckin(account, params) {
    const { date } = params || {};
    if (!isDate(date)) return reply(false, 'INVALID_PARAMS', 'date 必须为合法 YYYY-MM-DD');
    if (account.profile.lastCheckIn === date) return reply(false, 'ALREADY_CHECKED_IN', '今天已经签到过了');
    const streak = account.profile.lastCheckIn === prevDay(date) ? account.profile.streakDays + 1 : 1;
    const milestone = streak % 7 === 0;
    const points = 3 + Math.min(streak - 1, 29) + (milestone ? 10 : 0);
    const exp = 5 + 2 * Math.min(streak - 1, 29) + (milestone ? 20 : 0);
    account.balance += points;
    account.profile.xp += exp;
    account.profile.streakDays = streak;
    account.profile.totalCheckIns += 1;
    account.profile.lastCheckIn = date;
    account.profile.checkInDates.push(date);
    return reply(true, 'OK', `签到成功，连续第 ${streak} 天`, { balance: account.balance, streakDays: streak, points, exp });
  }

  function handlePurchase(account, params) {
    const { sku } = params || {};
    const item = SHOP[sku];
    if (!item) return reply(false, 'NOT_FOUND', '目录中不存在该商品');
    if (account.owned.includes(sku)) return reply(false, 'ALREADY_APPLIED', '已拥有该家具');
    if (account.balance < item.price) return reply(false, 'BALANCE_MIN', '积分不足');
    account.balance -= item.price;
    account.owned.push(sku);
    return reply(true, 'OK', `已兑换「${item.name}」`, { balance: account.balance, sku, price: item.price });
  }

  function handleExpand(account) {
    const next = (account.maxRoomLevel??account.roomLevel) + 1;
    if (next >= EXPAND_PRICES.length) return reply(false, 'ALREADY_APPLIED', '已是最大房间');
    const price = EXPAND_PRICES[next];
    if (account.balance < price) return reply(false, 'BALANCE_MIN', '积分不足');
    account.balance -= price;
    account.roomLevel = next;
    account.maxRoomLevel=next;
    return reply(true, 'OK', `扩建到 Lv.${next}`, { balance: account.balance, roomLevel: next, price });
  }

  // v2.10：在已解锁档位内随意切换大小（已解锁档位由 roomLevel 上限隐式表示）。
  function handleSetRoomLevel(account, params) {
    const level = Number(params?.level);
    if (!Number.isInteger(level) || level < 0 || level >= EXPAND_PRICES.length) return reply(false, 'INVALID_PARAMS', '目标房间档位无效');
    if (level > (account.maxRoomLevel??account.roomLevel)) return reply(false, 'LOCKED_ROOM_LEVEL', '尚未解锁该档位，请先扩建');
    if (level === account.roomLevel) return reply(false, 'SAME_ROOM_LEVEL', '已经是这个大小');
    account.roomLevel = level;
    return reply(true, 'OK', `切换为 Lv.${level}（免费）`, { balance: account.balance, roomLevel: level });
  }

  function handleQuery(account) {
    return reply(true, 'OK', '账户摘要', {
      balance: account.balance, roomLevel: account.roomLevel, maxRoomLevel:account.maxRoomLevel??account.roomLevel, owned: [...account.owned],
      streakDays: account.profile.streakDays, totalCheckIns: account.profile.totalCheckIns,
      totalStudySeconds: account.profile.totalStudySeconds, xp: account.profile.xp,
      checkInDates: [...account.profile.checkInDates], learningCount: account.learning.length,
    });
  }

  function dispatch(payload) {
    const { userId, command, params = {}, requestId } = payload || {};
    if (!isId(userId)) return reply(false, 'INVALID_PARAMS', 'userId 必须为非空短串');
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return reply(false, 'INVALID_PARAMS', 'params 必须为对象');
    const account = accountFor(userId);
    let result;
    switch (command) {
      case 'creditLearning': result = handleCredit(account, params); break;
      case 'checkin': result = handleCheckin(account, params); break;
      case 'purchase': {
        if (!isId(requestId)) return reply(false, 'INVALID_PARAMS', 'purchase 需要 requestId');
        const cacheKey = `${userId}:${requestId}:purchase`;
        const cached = requestLog.get(cacheKey);
        if (cached) return { ...cached, replayed: true };
        result = handlePurchase(account, params);
        if (result.ok) requestLog.set(cacheKey, JSON.parse(JSON.stringify(result)));
        break;
      }
      case 'expandRoom': {
        if (!isId(requestId)) return reply(false, 'INVALID_PARAMS', 'expandRoom 需要 requestId');
        const cacheKey = `${userId}:${requestId}:expandRoom`;
        const cached = requestLog.get(cacheKey);
        if (cached) return { ...cached, replayed: true };
        result = handleExpand(account);
        if (result.ok) requestLog.set(cacheKey, JSON.parse(JSON.stringify(result)));
        break;
      }
      case 'setRoomLevel': {
        if (!isId(requestId)) return reply(false, 'INVALID_PARAMS', 'setRoomLevel 需要 requestId');
        const cacheKey = `${userId}:${requestId}:setRoomLevel`;
        const cached = requestLog.get(cacheKey);
        if (cached) return { ...cached, replayed: true };
        result = handleSetRoomLevel(account, params);
        if (result.ok) requestLog.set(cacheKey, JSON.parse(JSON.stringify(result)));
        break;
      }
      case 'query': return handleQuery(account);
      default: return reply(false, 'NOT_FOUND', `未知命令：${command}`);
    }
    if (result?.ok) persist();
    return result;
  }

  let server = null;
  function start(port = 8787) {
    if (server) return Promise.resolve(server);
    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const payload = JSON.parse(body || '{}');
          const result = dispatch(payload);
          res.writeHead(result.ok ? 200 : 400);
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify(reply(false, 'INVALID_PARAMS', '请求体不是合法 JSON')));
        }
      });
    });
    return new Promise(resolve => server.listen(port, resolve));
  }
  function stop() {
    if (!server) return Promise.resolve();
    return new Promise(resolve => server.close(resolve));
  }
  function url() { return `http://127.0.0.1:${server?.address()?.port || 0}`; }

  return { dispatch, start, stop, url, get filePath() { return filePath; } };
}

// 独立自检：node server-proto/mock-server.mjs [port] [filePath(可选，持久化)]
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const server = createMockServer({ filePath: process.argv[3] || null });
  const port = Number(process.argv[2]) || 8787;
  await server.start(port);
  console.log(`mock 服务端已启动：http://127.0.0.1:${port}${server.filePath ? ` · 持久化到 ${server.filePath}` : ''}`);
  const t = (label, r) => console.log(`  ${label}: ${r.code}${r.message ? ' · ' + r.message : ''}${r.data ? ' · ' + JSON.stringify(r.data) : ''}`);
  t('初始查询', server.dispatch({ userId: 'user-001', command: 'query' }));
  t('学习', server.dispatch({ userId: 'user-001', command: 'creditLearning', params: { eventId: 'lesson-1', learned: 10, reviewed: 5 } }));
  t('同日重复学习', server.dispatch({ userId: 'user-001', command: 'creditLearning', params: { eventId: 'lesson-1', learned: 10, reviewed: 5 } }));
  t('签到', server.dispatch({ userId: 'user-001', command: 'checkin', params: { date: '2026-11-02' } }));
  t('同日重复签到', server.dispatch({ userId: 'user-001', command: 'checkin', params: { date: '2026-11-02' } }));
  t('购买', server.dispatch({ userId: 'user-001', command: 'purchase', params: { sku: 'clover-planter' }, requestId: 'r-1' }));
  t('同 requestId 重试购买', server.dispatch({ userId: 'user-001', command: 'purchase', params: { sku: 'clover-planter' }, requestId: 'r-1' }));
  t('扩建', server.dispatch({ userId: 'user-001', command: 'expandRoom', params: {}, requestId: 'r-e1' }));
  t('切换回初始小屋', server.dispatch({ userId: 'user-001', command: 'setRoomLevel', params: { level: 0 }, requestId: 'r-s0' }));
  t('同 requestId 重试切换', server.dispatch({ userId: 'user-001', command: 'setRoomLevel', params: { level: 0 }, requestId: 'r-s0' }));
  t('再次扩建', server.dispatch({ userId: 'user-001', command: 'expandRoom', params: {}, requestId: 'r-e2' }));
  t('最终查询', server.dispatch({ userId: 'user-001', command: 'query' }));
  await server.stop();
  console.log(server.filePath ? `（状态已持久化到 ${server.filePath}，重启后继承）` : '（以上为内存态演示，关闭即释放）');
}
