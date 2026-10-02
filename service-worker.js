/* LisinoraPrep Service Worker · 自动更新版（v5） */
const CACHE_NAME = 'lisinoraprep-v6';

// 预缓存的静态资源（首次安装时缓存一次）
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/vendor/supabase.js'
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

  // 全部同源 GET：network-first（先联网拿新版，失败才用缓存）
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => {
        return caches.match(req).then(cached => {
          if (cached) return cached;
          // 完全离线时，HTML 请求兜底到缓存的 index.html
          const accept = req.headers.get('accept') || '';
          if (accept.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});