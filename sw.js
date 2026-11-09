// 御泉印WEB（公開サイト）のサービスワーカー
// ページ・データは「通信できればいつも最新を取得し、圏外のときは前回の内容を表示する」。
// 書影は一度見たものを保存して使い回し、裏で最新に差し替える。
// 地図タイルなど、ほかのサイトのファイルは扱わない。
const CACHE = "onsenin-v3";
const CORE = ["./", "index.html", "map.html", "gallery.html", "style.css", "common.js",
  "list.js", "map.js", "gallery.js", "vendor/jszip.min.js", "data/items.json", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// items.json?v=… のような付加情報は除いた URL で保存する（古い版が溜まらないように）
const cacheKey = (req) => {
  const url = new URL(req.url);
  url.search = "";
  return url.href;
};

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // ブラウザに一時保存された古いファイルを使わず、必ずサーバーに最新か確認する
    const res = req.mode === "navigate"
      ? await fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
      : await fetch(req, { cache: "no-cache" });
    if (res.ok) cache.put(cacheKey(req), res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey(req));
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match(new URL("index.html", self.registration.scope).href)) || Response.error();
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(cacheKey(req));
  const update = fetch(req).then((res) => {
    if (res.ok) cache.put(cacheKey(req), res.clone());
    return res;
  });
  if (hit) {
    update.catch(() => {});
    return hit;
  }
  return update;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.url.endsWith(".xlsx")) return;  // Excel はダウンロードのたびに最新を取得する
  e.respondWith(req.destination === "image" ? staleWhileRevalidate(req) : networkFirst(req));
});
