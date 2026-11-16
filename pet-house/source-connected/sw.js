/* 宠物小屋离线服务工作者（清单110 PWA）：
 * 纯本地静态资源缓存策略——缓存优先回退到网络，安装时预缓存核心壳。
 * 本地模式可离线使用；联网账号、好友和MySQL同步需要服务器。
 * 只缓存静态文件，登录、私聊、存档和数据库接口不进入缓存。
 */
const CACHE = 'pet-room-v2420-mobile-feedback';

const SHELL = [
  './index.html',
  './register-worker.js',
  './economy-client.mjs',
  './visible-ticker.mjs',
  './request-id.mjs',
  './recovery-preview.mjs',
  './furniture-groups.mjs',
  './inventory-key.mjs',
  './pet-preview.js',
  './room.css?v=2.30.8',
  './shop.css',
  './profile-upgrade.css',
  './themes.css?v=2.30.5',
  './companion-ui.css',
  './companion-fx.css',
  './estate-ui.css',
  './design-ui.css',
  './room-access.css',
  './room-access.mjs',
  './room-navigation.css?v=2.30.8',
  './room-navigation.js',
  './responsive-layout.mjs',
  './responsive-layout.css?v=2.42.0',
  './pet-settings-ui.js',
  './database-recovery.mjs',
  './database-recovery-ui.js',
  './database-sync.mjs',
  './demo-app.js',
  './room-landscape.mjs?v=2.42.0',
  './room-landscape.css?v=2.42.0',
  './life-ui.css?v=2.30.8',
  './life-ui.js',
  './garden-scenery.js',
  './studio.css?v=2.42.0',
  './studio-art.mjs',
  './studio-scene.js',
  './furniture-activity.mjs',
  './furniture-play-ui.js',
  './furniture-hints-ui.js',
  './activity-content.mjs',
  './adaptive-quality.mjs',
  './placement-assist.mjs',
  './visual-style.mjs',
  './cozy-props.mjs',
  './blueprint-progress.mjs',
  './craft-ui.js',
  './studio-ui.js',
  './life-stage.js',
  './adventure.css?v=2.42.0',
  './adventure-ui.js',
  './room-adventures.mjs',
  './life-client.mjs',
  './life-catalog.mjs',
  './life-engine.mjs',
  './life-photo.mjs',
  './protected-entry.js?v=2.42.0',
  './host-credits.mjs',
  './design-ui.js',
  './design-plan.mjs',
  './companion-tutorial.css',
  './moving-ceremony.css',
  './bootstrap.js?v=2.42.0',
  './creative-ui.css',
  './social.css',
  './visitor.css',
  './visitor-ui.js',
  './visitor-scene.mjs',
  './visitor-avatar.mjs',
  './visit-interactions.mjs',
  './visit-sync.mjs',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try { await cache.addAll(SHELL); } catch { /* 预缓存失败不影响 SW 安装，后续按需缓存 */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pet-room-v') && k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 只缓存同源本地资源，不拦截第三方
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/database')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) {
      // 后台静默更新（stale-while-revalidate）
      fetch(request).then(response => {
        if (response && response.ok) cache.put(request, response.clone());
      }).catch(() => { /* 离线时忽略网络失败 */ });
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      // 离线且未缓存时，导航请求回退到首页壳
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
