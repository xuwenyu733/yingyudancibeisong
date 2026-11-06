/** v2.6 桥接转发客户端示例：把 integration.mjs 的消息桥命令转成 HTTP 请求。
 * 接入真实后端时只需改 baseUrl；幂等键语义见 proto.md。
 * 独立运行：node server-proto/mock-client.mjs [port] [userId]
 */
export class RoomServerClient {
  constructor({ baseUrl, userId, timeoutMs = 3000 } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.userId = userId;
    this.timeoutMs = timeoutMs;
  }

  async command(command, params = {}, requestId = undefined) {
    const payload = { userId: this.userId, command, params, requestId };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  creditLearning({ eventId, learned = 0, reviewed = 0 } = {}) {
    return this.command('creditLearning', { eventId, learned, reviewed });
  }
  checkin(date) { return this.command('checkin', { date }); }
  purchase(sku, requestId) { return this.command('purchase', { sku }, requestId); }
  expandRoom(requestId) { return this.command('expandRoom', {}, requestId); }
  /** v2.10：在已解锁档位内切换小屋大小（level 必须 ≤ 当前扩建到的档位） */
  setRoomLevel(level, requestId) { return this.command('setRoomLevel', { level }, requestId); }
  query() { return this.command('query', {}); }
}

// 独立自检：node server-proto/mock-client.mjs [port] [userId]
if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const port = Number(process.argv[2]) || 8787;
  const userId = process.argv[3] || 'user-001';
  const client = new RoomServerClient({ baseUrl: `http://127.0.0.1:${port}`, userId });
  const t = (label, r) => console.log(`  ${label}: ${r.code}${r.message ? ' · ' + r.message : ''}${r.data ? ' · ' + JSON.stringify(r.data) : ''}`);
  t('查询', await client.query());
  t('签到', await client.checkin('2026-11-03'));
  t('同日重复签到', await client.checkin('2026-11-03'));
  t('学习', await client.creditLearning({ eventId: 'demo-001', learned: 5, reviewed: 10 }));
  t('购买', await client.purchase('cloud-table', 'demo-buy-1'));
  t('同 requestId 重试购买', await client.purchase('cloud-table', 'demo-buy-1'));
  t('扩建', await client.expandRoom('demo-exp-1'));
  t('最终查询', await client.query());
  console.log('（HTTP 链路验证完成）');
}