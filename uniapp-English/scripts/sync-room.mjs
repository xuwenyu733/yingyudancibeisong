import { cpSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src =
  (existsSync(join(root, 'room-v2')) && join(root, 'room-v2')) ||
  join('/Users/mac/Desktop/original-pet-room-v2.8.0')
const dest = join(root, 'hybrid', 'html', 'room')

if (!existsSync(src)) {
  console.error('缺少房间源目录:', src)
  process.exit(1)
}

const bootstrapBackup = join(root, 'scripts', 'bootstrap-app.template.js')
rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, {
  recursive: true,
  filter: (path) =>
    !path.includes(`${join('room-v2', 'tests')}`) &&
    !path.includes('/tests/') &&
    !path.includes('/examples/') &&
    !path.includes('/server-proto/') &&
    !path.endsWith('.png') &&
    !path.endsWith('.jpg'),
})

// 始终用仓库内 App 嵌入入口覆盖演示 bootstrap
const appBootstrap = join(dest, 'bootstrap-app.js')
if (existsSync(bootstrapBackup)) {
  cpSync(bootstrapBackup, appBootstrap)
}

const indexPath = join(dest, 'index.html')
writeFileSync(
  indexPath,
  `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f6e9c9">
  <title>杏橘狐 · 学习小屋</title>
  <link rel="stylesheet" href="./room.css">
  <link rel="stylesheet" href="./shop.css">
  <style>html,body,#app{width:100%;height:100%;margin:0}body{background:#f6e9c9}</style>
</head>
<body>
  <main id="app"></main>
  <script type="module" src="./bootstrap-app.js"></script>
</body>
</html>
`,
)

// 若刚被覆盖丢了 bootstrap-app，从本仓库 scripts 旁缓存恢复不了时提示
if (!existsSync(appBootstrap)) {
  console.warn('请确认 hybrid/html/room/bootstrap-app.js 存在（sync 后需保留 App 入口）')
} else {
  console.log('synced v2.8 room ->', dest)
  console.log('index bytes', readFileSync(indexPath).length)
}
