# admin-English

统一运营后台（`ADMIN` / `SUPER_ADMIN` 同一站点，按角色显示菜单）。

## 启动

```bash
# 根目录
npm run dev:admin

# 或
npm run dev --prefix admin-English
```

默认端口：`http://127.0.0.1:5181`  
API：`VITE_API_BASE=http://127.0.0.1:3010/api`

## 开发账号

登录页不预填密码，账号见下表（仅本地开发）：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| `admin` | `Admin123!` | ADMIN（词库/用户/订单；套餐/任务/商城只读） |
| `superadmin` | `SuperAdmin123!` | SUPER_ADMIN（全部能力；操作审计） |

登录失败会按用户名限流（15 分钟内最多 8 次）。写操作会记入 `AdminAuditLog`。
