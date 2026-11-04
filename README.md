# 英语单词闯关 · 宠物小屋（yingyudancibeisong）

小学生背单词闯关赚积分，用积分装扮 3D 宠物小屋。

## 模块速览

| 模块 | 是什么 | 端口 | 启动方式 |
|---|---|---|---|
| backend-English | 后端：登录/闯关/积分/会员/支付 | 3010 | 根目录 `npm run dev:server` |
| frontend-English | 电脑端网页 | 5174 | 根目录 `npm run dev:frontend` |
| admin-English | 运营后台 | 5181 | 根目录 `npm run dev:admin` |
| uniapp-English | 手机 App（内嵌小屋） | 5173 | 根目录 `npm run dev:mp` |
| pet-house | 完整版小屋（MySQL 存档） | 8899 | 双击 `pet-house\启动小屋.cmd` |
| archive/hamster-room | 小屋老原型（已归档） | 8766 | 双击其 `StartPreview.cmd` |

## 快速开始

根目录先 `npm install`，再按上表启动对应模块。
后端首次运行需初始化数据库：`npm run prisma:generate` + `npm run db:push`

## 完整版小屋怎么跑

1. 本机装好 MySQL 并启动服务
2. 改 `pet-house/backend/app.local.json` 的账号密码（此文件不上传 GitHub）
3. 双击 `pet-house\启动小屋.cmd`
4. 打开 http://127.0.0.1:8899/?storage=mysql
   （不想连数据库也能玩：?storage=local）

## 运营后台账号（仅本地）

`admin / Admin123!`（普通管理员）　`superadmin / SuperAdmin123!`（全部权限+审计）

## 常见问题

- 网页接口报错 → 先确认后端 3010 已启动，并用 localhost 访问
- App 里还是旧小屋 → 用 HBuilderX 重新打包安装
