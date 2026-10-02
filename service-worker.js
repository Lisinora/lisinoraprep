/* LisinoraPrep Service Worker · 自动更新版 */
const CACHE_NAME = 'lisinoraprep-v4';

// 需要预缓存的静态资源（首次安装时缓存一次）
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  // 立即激活，不等旧 SW 退出
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  // 清掉所有旧版本缓存
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // 只处理 GET
  if (req.method !== 'GET') return;

  // 只处理同源请求（跳过 Supabase、CDN 等跨域）
  try {
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
  } catch (e) { return; }

  // HTML 页面请求：Network-first（先联网，失败才用缓存）
  const isHTML = req.headers.get('accept') && req.headers.get('accept').includes('text/html');
  const isIndex = req.url.endsWith('/') || req.url.endsWith('/index.html');

  if (isHTML || isIndex) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 其他静态资源：Cache-first（先缓存，加快加载）
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});