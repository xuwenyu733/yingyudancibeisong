/** v2.8 一键发布脚本（F6）：版本号升级 → 语法检查 → 全量测试 → 重建 manifest.json → 打 zip。
 * 用法：
 *   node scripts/release.mjs            # 不 bump，直接校验 + 重建 manifest + 打包当前版本
 *   node scripts/release.mjs minor      # 升版本（major|minor|patch）后再校验打包
 * 产物：项目父目录 original-pet-room-v<版本>.zip
 * 注意：本脚本只用 Node + 内置模块写文件（绝不经过 PowerShell 重写源码，避免编码事故）。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { excludedFromRelease, releaseRollback } from './release-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated=full=>{
  const rel=path.relative(ROOT,full).split(path.sep).join('/');
  return excludedFromRelease(rel);
};
const read = p => readFileSync(p, 'utf8');
const write = (p, s) => writeFileSync(p, s);
const fail = message => { throw new Error(message); };
const transaction = releaseRollback(ROOT, ['room.js', 'archive.mjs', 'package.json', 'styles.css', 'manifest.json']);
let temporaryZip = null;
try {

// ---------- 1) 版本 ----------
const roomPath = path.join(ROOT, 'room.js');
const roomSrc = read(roomPath);
const match = roomSrc.match(/version:'(\d+\.\d+\.\d+)'/);
const current = match?.[1] || fail('room.js 里找不到 version:』x.y.z』 版本号');
const bumpType = process.argv[2];
let version = current;
if (bumpType) {
  const [a, b, c] = current.split('.').map(Number);
  if (bumpType === 'major') version = `${a + 1}.0.0`;
  else if (bumpType === 'minor') version = `${a}.${b + 1}.0`;
  else if (bumpType === 'patch') version = `${a}.${b}.${c + 1}`;
  else fail(`未知 bump 类型：${bumpType}（可选 major|minor|patch）`);
  if (version !== current) {
    const bumped = roomSrc.split(`version:'${current}'`).join(`version:'${version}'`);
    if (bumped === roomSrc) fail('room.js 版本号替换失败（应有两处）');
    write(roomPath, bumped);
    const arcPath = path.join(ROOT, 'archive.mjs');
    const arcSrc = read(arcPath);
    write(arcPath, arcSrc.split(`ARCHIVE_VERSION = '${current}'`).join(`ARCHIVE_VERSION = '${version}'`));
    const packagePath=path.join(ROOT,'package.json'),metadata=JSON.parse(read(packagePath));metadata.version=version;write(packagePath,JSON.stringify(metadata,null,2)+'\n');
    console.log(`✓ 版本 ${current} → ${version}（room.js ×2、archive.mjs、package.json）`);
  }
}

execFileSync(process.execPath,[path.join(ROOT,'scripts/sync-styles.mjs')],{cwd:ROOT});
// ---------- 2) 语法检查所有 JS ----------
console.log('语法检查所有 .js/.mjs …');
const jsFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === '.git' || entry === 'node_modules' || entry === '__pycache__' || generated(full)) continue;
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|mjs)$/.test(entry)) jsFiles.push(full);
  }
})(ROOT);
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
console.log(`✓ 语法通过 ${jsFiles.length} 个文件`);

// ---------- 3) 全量测试 ----------
console.log('全量测试 …');
const testGlob = path.join(ROOT, 'tests', '*.test.mjs');
execFileSync(process.execPath, ['--test', testGlob], { stdio: 'inherit', cwd: ROOT });

// ---------- 4) 重建 manifest.json ----------
console.log('重建 manifest.json …');
const sha = text => createHash('sha256').update(text).digest('hex');
const EXCLUDE = new Set(['manifest.json', 'test-results.txt', '.DS_Store']);
const files = [];
let totalBytes = 0;
(function walkManifest(dir) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE.has(entry) || entry === '.git' || entry === 'node_modules' || entry === '__pycache__' || entry.endsWith('.zip')) continue;
    const full = path.join(dir, entry);
    if(generated(full))continue;
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (statSync(full).isDirectory()) walkManifest(full);
    else {
      const bytes = statSync(full).size;
      const text = readFileSync(full);
      files.push({ file: rel, bytes, sha256: sha(text) });
      totalBytes += bytes;
    }
  }
})(ROOT);
files.sort((x, y) => x.file.localeCompare(y.file, 'zh-CN'));
write(path.join(ROOT, 'manifest.json'), JSON.stringify({ version, files, totalBytes }, null, 2) + '\n');
console.log(`✓ manifest.json：${files.length} 个文件，共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

// ---------- 5) 打 zip 到父目录 ----------
const zipName = `original-pet-room-v${version}.zip`;
const zipPath = path.join(path.dirname(ROOT), zipName);
temporaryZip = `${zipPath}.tmp-${process.pid}-${Date.now()}`;
console.log(`打包 ${zipName} …`);
// 严格按 manifest 打包，不能把测试目录里的 node_modules 或构建缓存带进发布包。
const psQuote=value=>`'${value.replaceAll("'","''")}'`;
const script=[
  "$ErrorActionPreference='Stop'",
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  'Add-Type -AssemblyName System.IO.Compression',
  `$taskManifest=Get-Content -Encoding UTF8 -Raw -LiteralPath ${psQuote(path.join(ROOT,'manifest.json'))} | ConvertFrom-Json`,
  `$taskStream=[IO.File]::Open(${psQuote(temporaryZip)},[IO.FileMode]::CreateNew)`,
  '$taskZip=[IO.Compression.ZipArchive]::new($taskStream,[IO.Compression.ZipArchiveMode]::Create)',
  "try { foreach($taskRel in (@('manifest.json') + @($taskManifest.files | ForEach-Object { $_.file }))) {",
  `[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,(Join-Path ${psQuote(ROOT)} $taskRel),$taskRel,[IO.Compression.CompressionLevel]::Optimal) | Out-Null`,
  '} } finally { $taskZip.Dispose(); $taskStream.Dispose() }',
].join('\n');
execFileSync('powershell.exe', ['-NoProfile','-Command',script],{stdio:'inherit'});
renameSync(temporaryZip, zipPath); temporaryZip = null;
const size = statSync(zipPath).size;
transaction.commit();
console.log(`✓ 已打包：${zipPath}（${(size / 1024 / 1024).toFixed(2)} MB）`);
} catch (error) {
  transaction.rollback();
  if (temporaryZip && existsSync(temporaryZip)) unlinkSync(temporaryZip);
  console.error(`✖ 发布未完成，源码和清单已恢复：${error.message}`);
  process.exitCode = 1;
}
