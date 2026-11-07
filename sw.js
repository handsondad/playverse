// Network first, cache as fallback: online players always get the latest files,
// and any page played once keeps working offline. No file list to maintain.
const CACHE_NAME = "playverse-v1";

// Pages opened before the worker was active are not cached by the fetch handler,
// so the home screen is fetched up front.
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./src/home/main.js",
  "./src/home/styles.css",
  "./src/shared/pwa.js",
  "./configs/game-manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function offlinePage() {
  const home = new URL("./index.html", self.registration.scope).href;
  const icon = new URL("./icons/icon.svg", self.registration.scope).href;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>暂时离线</title>
<link rel="icon" href="${icon}" type="image/svg+xml" /></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff3dd;font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#3d3327;text-align:center">
<main style="padding:24px"><h1>这个游戏还没有离线保存</h1><p>联网时打开玩一次，之后没有网络也能玩。</p>
<p><a href="${home}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#66a2df;color:#fff;text-decoration:none;font-weight:700">返回首页</a></p></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
    if (request.mode === "navigate") {
      return offlinePage();
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }
  event.respondWith(networkFirst(request));
});
