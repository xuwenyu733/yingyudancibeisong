# v2.6 · 服务端账本联调协议（原型）

把「体验积分」从本地 `localStorage` 账本迁到服务端的**对接契约**。本目录提供：

- `proto.md`（本文件）：HTTP 协议、命令、幂等与校验规则
- `mock-server.mjs`：纯 Node 参考实现（内存账本，可独立演示/测试）
- `mock-client.mjs`：把 `integration.mjs` 的消息桥命令转发成 HTTP 的客户端示例

> 原型目标：验证「桥接命令 → HTTP → 服务端校验/幂等/多用户」整条链路可行。
> 真实后端只需按同一协议实现；金额、积分规则以服务端为准，本地账本仅作离线兜底。

## 传输

- 端点：`POST /api/v1/command`，`Content-Type: application/json`
- 请求体：

```json
{
  "userId": "user-001",
  "command": "creditLearning | checkin | purchase | expandRoom | query",
  "params": { "...": "随命令而异" },
  "requestId": "消息桥 envelope 的 requestId（purchase/expandRoom 必填）"
}
```

- 响应体统一为 `{ ok, code, message, data }`；`ok:false` 时 `code` 为稳定错误码。

## 命令与幂等

| command | params | 幂等键 | 说明 |
|---|---|---|---|
| `creditLearning` | `eventId`, `learned`, `reviewed`, `checkIn?` | `eventId` | 学习积分入账；`learned*2 + reviewed*1` 积分，联动经验/时长 |
| `checkin` | `date` | `date` 业务判重 | 连续天数与本地一致：`3+min(d-1,29)` 积分、`5+2*min(d-1,29)` 经验，每满 7 天 +10/+20 |
| `purchase` | `sku` | `requestId` | 目录：clover-planter 120 / reading-shelf 260 / cloud-table 180 / moon-ornament 220 |
| `expandRoom` | — | `requestId` | 逐级扩建：600 / 1500 |
| `query` | — | — | 账户摘要 |

### 幂等语义

- `creditLearning`：同一 `eventId` 重复提交返回 `ALREADY_APPLIED`，积分/经验不重复增加。
- `checkin`：同一 `date` 重复签到返回 `ALREADY_CHECKED_IN`，奖励只发一次（同日重试安全）。
- `purchase`/`expandRoom`：同一 `requestId` 重复提交返回首次结果（重放），不重复扣款；跨 requestId 的相同 sku 由「已拥有」业务判重 → `ALREADY_APPLIED`。

### 校验

- `userId` / `requestId`：非空、`[\w.-]{1,64}`。
- `sku` 必须存在；`learned/reviewed` 为 0–100 整数；`date` 为合法 `YYYY-MM-DD`。
- 余额不足 → `BALANCE_MIN`；未知命令 → `NOT_FOUND`。

## 错误码

`OK / ALREADY_APPLIED / ALREADY_CHECKED_IN / INVALID_PARAMS / BALANCE_MIN / NOT_FOUND / BUSY / STORAGE_ERROR`

## 接入步骤（真实后端）

1. 按上述协议实现四个写命令 + 查询；积分规则可改，字段名保持不变。
2. 客户端：`mock-client.mjs` 的 `RoomServerClient` 换 baseUrl 即用；桥接层在 `integration.mjs` 的 `dispatch` 里把对应命令转发给 `RoomServerClient`（参考文件内注释）。
3. 鉴权：真实环境在请求头加 `Authorization: Bearer <token>`；`creditLearning` 仍只允许宿主受控调用（不开放给通用 room-command）。
4. 数据一致性：以服务端余额为准；本地账本保留为离线降级（未连上服务端时用本地缓存）。

## 独立运行

```bash
node server-proto/mock-server.mjs   # 启动 127.0.0.1:8787 并打印自检事务
node server-proto/mock-client.mjs 8787 user-001  # 走 HTTP 跑一轮：签到→学习→购买→扩建→查询
```
