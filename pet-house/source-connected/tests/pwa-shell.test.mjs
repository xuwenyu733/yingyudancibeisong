import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 清单110：PWA 离线可装——site.webmanifest + sw.js + index.html 注册，全部随包发布。
test('PWA shell files exist and register correctly', () => {
  const webmanifest = readFileSync(new URL('../site.webmanifest', import.meta.url), 'utf8');
  const manifest = JSON.parse(webmanifest);
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name.includes('宠物小屋'), true);

  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(index.includes('rel="manifest"'), 'index.html 应链接 site.webmanifest');
  assert.ok(index.includes('serviceWorker'), 'index.html 应注册 service worker');

  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'./index.html'"), 'sw.js 预缓存壳应包含 entry 页面');
  assert.ok(sw.includes('stale-while-revalidate') || sw.includes('cached'), 'sw.js 有缓存回退策略');
});

test('release manifest includes PWA files (site.webmanifest & sw.js)', () => {
  // manifest.json 在 release 时由 scripts/release.mjs 全目录扫描重建，
  // 只排除 EXCLUDE 集合与生成产物。验证 EXCLUDE 不含 PWA 文件，确保它们会被纳入发布包。
  const release = readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8');
  const excludeMatch = release.match(/const EXCLUDE = new Set\(\[([^\]]+)\]\)/);
  assert.ok(excludeMatch, 'release.mjs 应有 EXCLUDE 集合');
  const excludeList = excludeMatch[1];
  assert.ok(!excludeList.includes('site.webmanifest'), 'site.webmanifest 不应被排除');
  assert.ok(!excludeList.includes('sw.js'), 'sw.js 不应被排除');
  // release 扫描逻辑确认会遍历根目录所有文件（含 .webmanifest/.js）
  assert.ok(release.includes('walkManifest'), 'release.mjs 有目录遍历逻辑');
});