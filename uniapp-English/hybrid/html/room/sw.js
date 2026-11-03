/* 宠物小屋离线服务工作者（清单110 PWA）：
 * 纯本地静态资源缓存策略——缓存优先回退到网络，安装时预缓存核心壳。
 * 本地模式可离线使用；联网账号、好友和MySQL同步需要服务器。
 * 只缓存静态文件，登录、私聊、存档和数据库接口不进入缓存。
 */
const CACHE = 'pet-room-v2280-mysql';

const SHELL = [
  './index.html',
  './room.css',
  './shop.css',
  './profile-upgrade.css',
  './themes.css',
  './companion-ui.css',
  './companion-fx.css',
  './estate-ui.css',
  './design-ui.css',
  './design-ui.js',
  './design-plan.mjs',
  './companion-tutorial.css',
  './moving-ceremony.css',
  './bootstrap.js',
  './creative-ui.css',
  './social.css',
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
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
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
