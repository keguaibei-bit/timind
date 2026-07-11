/**
 * Timind Service Worker
 * 策略：
 *   1. 静态资源（HTML/CSS/JS/字体）—— Cache-First，离线可秒开
 *   2. CDN 资源（Chart.js）—— Stale-While-Revalidate，尽量离线可用
 *   3. 其它请求 —— 网络优先，失败回退缓存
 * 通过 SW_VERSION 升级触发新缓存 + 清理旧版本缓存
 */

var SW_VERSION = 'timind-v1.1.0';
var STATIC_CACHE = 'timind-static-' + SW_VERSION;
var RUNTIME_CACHE = 'tmind-runtime-' + SW_VERSION;

// 预缓存清单：应用核心文件
var PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './css/base.css',
    './css/themes.css',
    './js/state.js',
    './js/storage.js',
    './js/router.js',
    './js/app.js',
    './js/timer/TimerEngine.js',
    './js/timer/CountdownMode.js',
    './js/timer/CountUpMode.js',
    './js/timer/PomodoroMode.js',
    './js/gamification/LevelSystem.js',
    './js/gamification/BadgeSystem.js',
    './js/gamification/RewardEngine.js',
    './js/gamification/Confetti.js',
    './js/reports/WeeklyChart.js',
    './js/reports/CategoryChart.js',
    './js/reports/ReportGenerator.js',
    './js/utils/Notification.js',
    './js/utils/AudioUtils.js',
    './js/utils/DemoDataInjector.js',
    './js/utils/DemoHelper.js',
    './js/utils/Effects.js',
    // 本地音效资源（若存在则缓存，不存在不报错）
    './assets/sounds/complete.mp3',
    './assets/sounds/break-start.mp3',
    './assets/sounds/levelup.mp3',
    // 图标占位
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// CDN 资源：Chart.js（Stale-While-Revalidate）
var CDN_URLS = [
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// 需要走 CDN 缓存的域名白名单
var CDN_HOSTS = [
    'cdn.jsdelivr.net',
    'unpkg.com',
    'cdnjs.cloudflare.com'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(function (cache) {
            // 使用 addAll 的容错版本：单个资源失败不会阻断整个安装
            return Promise.all(
                PRECACHE_URLS.map(function (url) {
                    return cache.add(url).catch(function (err) {
                        console.warn('[SW] 预缓存失败（可忽略，可能是不存在的资源）:', url, err);
                    });
                })
            ).then(function () {
                return Promise.all(
                    CDN_URLS.map(function (url) {
                        return cache.add(url).catch(function (err) {
                            console.warn('[SW] CDN 预缓存失败:', url, err);
                        });
                    })
                );
            });
        }).then(function () {
            // 新 SW 安装完成立即进入激活态，便于清理旧缓存
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (cacheNames) {
            return Promise.all(
                cacheNames.map(function (cacheName) {
                    // 清理非当前版本的缓存（含旧版本静态/运行时缓存）
                    if (cacheName !== STATIC_CACHE && cacheName !== RUNTIME_CACHE) {
                        console.log('[SW] 清理旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                    return null;
                })
            );
        }).then(function () {
            // 立即接管所有页面
            return self.clients.claim();
        })
    );
});

function isCDN(url) {
    for (var i = 0; i < CDN_HOSTS.length; i++) {
        if (url.indexOf(CDN_HOSTS[i]) > -1) {
            return true;
        }
    }
    return false;
}

// 静态资源 Cache-First
function cacheFirstStrategy(request, cache) {
    return cache.match(request).then(function (cachedResponse) {
        if (cachedResponse) {
            return cachedResponse;
        }
        return fetch(request).then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        }).catch(function () {
            return cachedResponse;
        });
    });
}

// CDN 资源 Stale-While-Revalidate
function swrStrategy(request, cache) {
    return cache.match(request).then(function (cachedResponse) {
        var fetchPromise = fetch(request).then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        }).catch(function () {
            return cachedResponse;
        });
        // 优先返回缓存，后台静默更新
        return cachedResponse || fetchPromise;
    });
}

// 运行时缓存 Network-First（适合 API 或动态内容）
function networkFirstStrategy(request, cache) {
    return fetch(request).then(function (networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(function () {
        return cache.match(request);
    });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;

    // 仅拦截 GET 请求
    if (request.method !== 'GET') {
        return;
    }

    var url = new URL(request.url);

    // 跨域 CDN 资源走 SWR
    if (url.origin !== self.location.origin) {
        if (isCDN(request.url)) {
            event.respondWith(
                caches.open(RUNTIME_CACHE).then(function (cache) {
                    return swrStrategy(request, cache);
                })
            );
        }
        return;
    }

    // 同源静态资源走 Cache-First
    event.respondWith(
        caches.open(STATIC_CACHE).then(function (cache) {
            return cacheFirstStrategy(request, cache);
        }).catch(function () {
            // 最后兜底：尝试网络
            return fetch(request);
        })
    );
});

// 监听来自页面的消息（如手动触发更新检查）
self.addEventListener('message', function (event) {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data === 'CHECK_UPDATE') {
        self.registration.update();
    }
});
