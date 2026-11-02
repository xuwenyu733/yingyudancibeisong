# 版本记录（Changelog）

## v2.8.0（批次 1：纯前端体验批次）
> 只改前端/纯逻辑，不依赖宿主后端与美术资源；`room.js` 挂载版本号已同步。

### 新功能
- **补签卡（B1）**：`profile.makeUp(date, today)` 仅允许补「昨天」，不发经验/积分；`economy.spend({eventId, points, reason})` 幂等扣积分；每月限 3 次（`MAKEUP_LIMIT`），次月重置。房间 API 新增 `makeUpCheckIn()`（余额不足 `INSUFFICIENT_POINTS`，扣减失败自动挂账重试）。个人主页新增补签按钮，显示剩余次数与价格。
- **勋章解锁时间（B6）**：`evaluate(today)` 记录每枚勋章的解锁日期 `badgeUnlockedAt`；主页勋章墙点击任意勋章展开「描述 + 解锁日期」详情条（键盘 Enter/空格可触发）。
- **勋章搜索（B7）**：勋章墙顶部搜索框按名称/描述实时过滤，进度条保持全量统计。
- **周报点阵（B9）**：`buildStats` 新增 `weekly`（近 7 天含今天），主页显示「近 7 天签到 n/7」点阵（跨月衔接）。
- **快捷签到（D10）**：HUD 等级徽章旁新增快捷签到按钮，房间就绪即显示，今天未签时可直接签到（不开面板）。
- **日间/夜间主题（D4/F5）**：主页 header 新增 🌙/☀️ 切换，面板配色变量化（`--room-*`），选择记忆到 localStorage（`original-pet-room-theme`）。
- **骨架屏（D1）**：面板打开、数据未到时的脉动占位；数据到位自动撤下。

### 数据与工程
- **存档导出/导入（C6/C7）**：`archive.mjs` `exportArchive/importArchive`，格式 v1（`{format, version, exportedAt, meta, profile, economy}`），损坏/版本不符/超限均拒绝；房间 API `exportArchive()/importArchive()`（写入后需刷新页面生效，诚实提示 `relaunchRequired`）。
- **迁移框架（C8）**：`migrations.mjs` `registerMigration/migrationPlan/migrateState`，支持 `target` 参数，缺迁移 `NO_MIGRATION`，失败 `MIGRATION_FAILED` 不改动输入。
- **存储配额提示（C9）**：`storage.mjs` `estimateBytes/usageOf/quotaStatus/quotaMessage`，warn/full 时给出备份与导出建议文案。
- **音效模块（D2）**：`sfx.mjs` 8 组预设音效，无 AudioContext 环境静默 no-op，支持静音/音量/注入/`dispose()`。
- **i18n（F4）**：`i18n.mjs` 中/英双语包（HUD、签到、补签、主题、确认等 ~30 键），zh→en→key 回退 + `{n}` 占位。
- **mock 服务端持久化（C2）**：`createMockServer({filePath})` 启动加载、每次可写命令成功后落盘，重启继承余额与判重状态（写失败仅告警）。
- **自动降画质（E5 增强）**：`frame()` 每 500ms 测帧，连续 4 次 <45fps 时自动切低画质（pixelRatio=1、关阴影），`metrics.autoDowngraded` 上报。

### 测试（198 → 214）
- 新增 `tests/batch1.test.mjs` 16 项：补签全路径、spend 幂等、badgeUnlockedAt、周报、存档回环、迁移、配额、音效、i18n、mock 持久化、幂等审计（E2）、400 步随机模糊（E1，余额/等级/记录量守恒）、`room.d.ts` 同步审计（F1）、定时器 dispose 清理静态审计（E7/F7）。

### 文档
- `room.d.ts` 同步：`ProfileBadge.unlockedAt`、`MakeupsState`、`makeups/makeupCost/weekly`、`makeUpCheckIn/exportArchive/importArchive`、`metrics.autoDowngraded`。
- 新增 `scripts/release.mjs`（bump + 语法检查 + 全量测试 + manifest 重建 + 打包）。

### 说明与边界（诚实声明）
- 浏览器点击链路（补签、主题、快捷签到、勋章详情）已由 Node 层与挂载契约覆盖，浏览器内逐项点击测试由人工在预览页完成（当前环境无视觉回读）。
- 导入存档需要**刷新页面重新挂载**后生效（不做热替换）；补签的积分扣减若落盘失败，下次操作按 `eventId` 自动补扣、不会重复扣两次。
- 主题切换只覆盖主页面板的核心配色层（背景/卡片/边框/正文/强调色），商店与房间其余样式保持原样。
- 自动降画质是纯前端兜底，不影响存档数据。

## v2.7.0
- 修复 HUD 按钮重叠：商店按钮移入左上 topbar，右上角让位给等级徽章；徽章提示区压缩为单行。
- 徽章墙进度条、商店消费统计（`totalSpent`）、学习/等级/消费三类勋章判定。
- 见《改版说明.md》v2.7 章节。
