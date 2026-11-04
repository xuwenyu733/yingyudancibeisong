import {
  cpSync,
  rmSync,
  existsSync,
  realpathSync,
  statSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// 优先使用仓库内 canonical 源 pet-house/source-connected（Windows/Linux 均可运行）
const repoSource = join(root, '..', 'pet-house', 'source-connected')
const desktopLatest = join(
  '/Users/mac/Desktop',
  '宠物小屋-四位装修码版-v2.28.1',
  'source-connected',
)
// 源候选必须真实存在且是目录：room-v2 在 Windows 克隆时可能被 git 还原成
// 75 字节的符号链接残留文件（内容为 Mac 桌面路径），此时不能作为源使用
const isDir = (p) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
const srcCandidate =
  (isDir(join(root, 'room-v2')) && join(root, 'room-v2')) ||
  (isDir(repoSource) && repoSource) ||
  (isDir(desktopLatest) && desktopLatest) ||
  join('/Users/mac/Desktop/original-pet-room-v2.8.0')
const dest = join(root, 'hybrid', 'html', 'room')

if (!isDir(srcCandidate)) {
  console.error('缺少房间源目录（需要包含 index.html/package.json 的目录）:', srcCandidate)
  process.exit(1)
}

// room-v2 常为指向桌面源的软链；必须解引用成真实目录副本，避免仓库提交软链
const src = realpathSync(srcCandidate)
const bootstrapBackup = join(root, 'scripts', 'bootstrap-app.template.js')
const hostMobileCss = join(root, 'scripts', 'host-mobile.css')

// 拷贝源 → dest 的共用函数（初始拷贝与容错重建均复用同一 filter）
const copyFilter = (path) => {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.includes('/tests/')) return false
  if (normalized.includes('/examples/')) return false
  if (normalized.includes('/server-proto/')) return false
  if (normalized.includes('/node_modules/')) return false
  if (normalized.endsWith('/tools')) return false
  if (normalized.includes('/tools/')) return false
  // 根目录预览大图可跳过，assets 内缩略图保留
  if (
    (normalized.endsWith('.png') || normalized.endsWith('.jpg')) &&
    !normalized.includes('/assets/')
  ) {
    return false
  }
  return true
}
function copyRoom() {
  cpSync(src, dest, { recursive: true, dereference: true, filter: copyFilter })
}

if (existsSync(dest)) {
  rmSync(dest, { recursive: true, force: true })
}
copyRoom()

// 始终用仓库内 App 嵌入入口覆盖演示 bootstrap；若 dest 目录在拷贝期间
// 被外部进程替换为非目录，重建后重试一次
const appBootstrap = join(dest, 'bootstrap-app.js')
const overwriteFromScripts = (fromFile, toFile) => {
  if (!existsSync(fromFile)) return
  try {
    copyFileSync(fromFile, toFile)
  } catch {
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true })
    }
    copyRoom()
    copyFileSync(fromFile, toFile)
  }
}
overwriteFromScripts(bootstrapBackup, appBootstrap)
overwriteFromScripts(hostMobileCss, join(dest, 'host-mobile.css'))

const indexPath = join(dest, 'index.html')
writeFileSync(
  indexPath,
  `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
  <meta name="theme-color" content="#f3eddd">
  <title>杏橘狐 · 学习小屋</title>
  <link rel="stylesheet" href="./room.css">
  <link rel="stylesheet" href="./shop.css">
  <link rel="stylesheet" href="./profile-upgrade.css">
  <link rel="stylesheet" href="./themes.css">
  <link rel="stylesheet" href="./companion-ui.css">
  <link rel="stylesheet" href="./companion-fx.css">
  <link rel="stylesheet" href="./estate-ui.css">
  <link rel="stylesheet" href="./companion-tutorial.css">
  <link rel="stylesheet" href="./moving-ceremony.css">
  <link rel="stylesheet" href="./creative-ui.css">
  <link rel="stylesheet" href="./social.css">
  <link rel="stylesheet" href="./design-ui.css">
  <link rel="stylesheet" href="./host-mobile.css">
  <style>html,body,#app{width:100%;height:100%;margin:0;overflow:hidden}body{background:#f3eddd}</style>
</head>
<body>
  <main id="app"></main>
  <script type="module" src="./bootstrap-app.js"></script>
</body>
</html>
`,
)

if (!existsSync(appBootstrap)) {
  console.warn('请确认 hybrid/html/room/bootstrap-app.js 存在（sync 后需保留 App 入口）')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'))
console.log(`synced pet-room v${pkg.version || '?'} ->`, dest)
console.log('from', src)
console.log('index bytes', readFileSync(indexPath).length)
