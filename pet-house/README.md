# 宠物小屋（学习小屋）完整版 v2.28.1

四位装修码版：前端 3D 宠物小屋 + MySQL 数据库后端。装修布置后可生成 **4 位装修码**分享给朋友，朋友输码即可查看/复制装修；含好友、城堡楼层、积分商城、成就勋章等功能。

## 目录结构

| 目录 | 说明 |
|---|---|
| `source-connected/` | 前端源码（宠物小屋 3D 房间，纯 JS + Three.js，无需 npm/CDN） |
| `backend/` | MySQL 数据库后端（Node.js，建库脚本 + schema + 迁移） |
| `deploy/` | Docker / Caddy / 备份等公网部署配置 |

> App 内嵌副本位于 `../uniapp-English/hybrid/html/room/`（由 `sync-room` 脚本从 `source-connected` 同步），两者不要直接改混。

## 快速开始（本机运行）

**前置条件**：Node.js 20+、MySQL 8（本机 3306 端口）。

```bash
# 1. 安装后端依赖
cd backend
npm install
cd ..

# 2. 初始化数据库（创建 pet_room 库 + 独立应用账号，不影响已有库）
#    双击：初始化数据库.cmd，按提示输入 MySQL 管理员(root)口令

# 3. 启动服务
#    双击：启动小屋.cmd（应用账号口令已用 Windows 加密保护，无需重复输入）
```

启动后浏览器打开：

- 小屋：http://127.0.0.1:8899/?storage=mysql
- 数据库目录（查装修码、积分记录等）：http://127.0.0.1:8899/database

## 装修码怎么用

1. 进入"装修"布置好后点"完成保存"，联网时自动弹出 4 位装修码；
2. 朋友进入"装修"→"输入装修码"→ 查看装修，缺的家具会显示价格，确认后一键补齐；
3. 每层独立一个码，号码稳定指向最近一次发布的装修。详见 `装修码使用与自检说明.md`。

## 升级已有数据库

旧版数据库请按顺序先跑：`升级楼层存档数据库.cmd` → `升级中文入口.cmd` → `升级好友数据库.cmd` → `升级装修码数据库.cmd`（每个脚本都会先备份再升级）。

## 公网部署

见 `互联网部署说明.md`（Docker + Caddy + HTTPS 配置已随包提供，需自备云服务器和域名）。

## 不入库的文件

`backend/app.local.json`、`backend/mysql.password.dpapi`、`*.password`、`node_modules/` 等运行时凭据与依赖已由 `backend/.gitignore` 排除，克隆后按上述步骤生成即可。
