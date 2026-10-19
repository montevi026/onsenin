// マップ画面：取扱事業者住所を地図（Leaflet + 地理院タイル）にプロット
// マウスオーバー → その事業者の御泉印書影を並べて表示
// クリック       → リスト画面の該当箇所へ移動

const JAPAN_CENTER = [36.2, 138.25];
let map;
let markers = [];

function showMessage(text) {
  const el = document.getElementById("map-message");
  el.textContent = text;
  el.hidden = false;
}

function setStatus(text) {
  document.getElementById("map-status").textContent = text;
}

// 住所ごとにまとめる（1事業者 = 1ピン）
function groupByAddress(items) {
  const groups = new Map();
  for (const it of sortItems(items)) {
    const addr = it.operator_address.trim();
    if (!addr) continue;
    if (!groups.has(addr)) {
      groups.set(addr, { address: addr, items: [], lat: null, lng: null, geoSource: null });
    }
    const g = groups.get(addr);
    g.items.push(it);
    if (g.lat == null && it.lat != null) {
      g.lat = it.lat;
      g.lng = it.lng;
      g.geoSource = it.geo_source;
    }
  }
  return [...groups.values()];
}

// 座標未取得の住所はサーバー経由で国土地理院の住所検索を行う（結果はサーバーに保存される）
async function geocode(address) {
  if (SITE.static) return null;  // 公開サイトでは publish.py が事前に座標を取得済み
  const res = await fetch("/api/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return res.ok ? res.json() : null;
}

// limit を指定すると、先頭から limit 件だけ表示して「ほか N 件」を添える
function infoContent(group, limit = group.items.length) {
  const first = group.items[0];
  const operators = [...new Set(group.items.map((it) => it.operator))].join(" / ");
  const musumes = [...new Set(group.items.map((it) => it.musume_name))];
  const oneMusume = musumes.length === 1;  // 全部同じ温泉むすめなら見出しに1回だけ出す
  const shown = group.items.slice(0, limit);
  const rest = group.items.length - shown.length;
  const cards = shown.map((it) => `
    <figure class="iw-card ${effectiveStatus(it) === "終了" ? "ended" : ""}">
      ${it.image_url
        ? `<img src="${it.image_url}" alt="">`
        : `<div class="iw-noimg">画像なし</div>`}
      <figcaption>
        ${oneMusume ? "" : `${escapeHtml(it.musume_name)}<br>`}
        ${escapeHtml(it.version)}
        ${statusBadge(effectiveStatus(it))}
      </figcaption>
    </figure>`).join("");
  return `
    <div class="iw">
      <div class="iw-head">
        <strong>${escapeHtml(operators)}</strong>
        <span>${escapeHtml(first.prefecture)}${oneMusume ? `・${escapeHtml(musumes[0])}` : ""}</span>
      </div>
      <div class="iw-sub">${escapeHtml(group.address)}</div>
      ${first.operator_hours ? `<div class="iw-sub">🕘 ${escapeHtml(first.operator_hours)}</div>` : ""}
      ${group.geoSource === "gsi_coarse" ? `<div class="iw-approx">📍 地図上の位置はおおよそです</div>` : ""}
      <div class="iw-cards">${cards}</div>
      <div class="iw-hint">${rest > 0 ? `ほか ${rest} 件（` : ""}クリックでリストの該当箇所へ${rest > 0 ? "）" : ""}${
        SITE.static ? "" : "<br>ピンをドラッグすると位置を修正できます"}</div>
    </div>`;
}

// ---------------------------------------------------------------- マウスオーバーの書影パネル
// 書影が多い事業者でも地図からはみ出さないよう、大きさと位置を調整して表示する。
const PANEL_MARGIN = 8;    // 地図の端との余白
const CARD_GAP = 10;       // 書影どうしの間隔
const PIN_HEIGHT = 40;     // ピンの高さ
const PIN_GAP = 8;         // ピンとパネルの間隔
const MIN_CARD_W = 50;     // 書影をここまでは縮める
let panel;

let panelPinned = false;  // 長押しで開いたパネルは、別の場所をタップするまで開いたままにする

function hidePanel() {
  panelPinned = false;
  if (panel) panel.hidden = true;
}

function setLayout(w, cols) {
  panel.style.setProperty("--card-w", `${w}px`);
  panel.style.setProperty("--cols", cols);
}

// maxW×maxH に収まる中で、書影がいちばん大きくなる幅と列数を探す（収まらなければ null）
function findLayout(n, maxW, maxH) {
  if (maxW < MIN_CARD_W + 24 || maxH < 120) return null;
  const colsFor = (w, limit) => Math.max(1, Math.min(n, limit,
    Math.floor((maxW - 24 + CARD_GAP) / (w + CARD_GAP))));
  const tries = [[150, 3], [150, Infinity]];  // 少ない枚数なら3列までで縦に並べる
  for (let w = 140; w >= MIN_CARD_W; w -= 10) tries.push([w, Infinity]);
  for (const [w, limit] of tries) {
    const cols = colsFor(w, limit);
    setLayout(w, cols);
    if (panel.offsetHeight <= maxH && panel.offsetWidth <= maxW) return { w, cols };
  }
  return null;
}

function showPanel(marker, group) {
  const container = map.getContainer();
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "iw-panel";
    container.appendChild(panel);
  }
  panel.hidden = false;
  panel.classList.remove("compact");
  panel.style.left = "0px";
  panel.style.top = "0px";
  panel.innerHTML = infoContent(group);

  const mapW = container.clientWidth;
  const mapH = container.clientHeight;
  const M = PANEL_MARGIN;
  const p = map.latLngToContainerPoint(marker.getLatLng());
  const n = group.items.length;

  // ピンの上・下・右・左の空きのうち、書影をいちばん大きく表示できる側を選ぶ
  const regions = [
    { side: "above", maxW: mapW - 2 * M, maxH: p.y - PIN_HEIGHT - PIN_GAP - M },
    { side: "below", maxW: mapW - 2 * M, maxH: mapH - p.y - PIN_GAP - M },
    { side: "right", maxW: mapW - p.x - 24 - M, maxH: mapH - 2 * M },
    { side: "left", maxW: p.x - 24 - M, maxH: mapH - 2 * M },
  ];
  let best = null;
  for (const r of regions) {
    const layout = findLayout(n, r.maxW, r.maxH);
    if (layout && (!best || layout.w > best.layout.w)) best = { ...r, layout };
  }
  if (!best) {
    // どの側にも収まらない場合は、ピンに重なっても地図全体を使う
    let limit = n;
    let layout = findLayout(n, mapW - 2 * M, mapH - 2 * M);
    if (!layout) {  // 住所・営業時間の行を省いた簡易表示にする
      panel.classList.add("compact");
      layout = findLayout(n, mapW - 2 * M, mapH - 2 * M);
    }
    while (!layout && limit > 1) {  // それでも無理なら、入る枚数だけ表示する
      limit = Math.max(1, Math.floor(limit * 0.8));
      panel.innerHTML = infoContent(group, limit);
      layout = findLayout(limit, mapW - 2 * M, mapH - 2 * M);
    }
    best = { side: "center", layout: layout || { w: MIN_CARD_W, cols: 1 } };
  }
  setLayout(best.layout.w, best.layout.cols);

  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const clampX = (x) => Math.min(Math.max(x, M), mapW - M - w);
  const clampY = (y) => Math.min(Math.max(y, M), mapH - M - h);
  const midY = clampY(p.y - PIN_HEIGHT / 2 - h / 2);
  const pos = {
    above: [clampX(p.x - w / 2), p.y - PIN_HEIGHT - PIN_GAP - h],
    below: [clampX(p.x - w / 2), p.y + PIN_GAP],
    right: [p.x + 24, midY],
    left: [p.x - 24 - w, midY],
    center: [clampX(p.x - w / 2), clampY(p.y - h / 2)],
  }[best.side];
  panel.style.left = `${pos[0]}px`;
  panel.style.top = `${pos[1]}px`;
}

function pinIcon(group, onSale) {
  const label = group.items.length > 1 ? group.items.length : "♨";
  const approx = group.geoSource === "gsi_coarse" ? " approx" : "";  // 位置がおおよそのピンは点線の枠
  return L.divIcon({
    className: "",
    html: `<div class="map-pin ${onSale ? "on" : "off"}${approx}"><span>${label}</span></div>`,
    iconSize: [32, 38],
    iconAnchor: [16, 38],
  });
}

// 手元の管理画面では、ピンをドラッグして位置を修正できる（その住所の全データに保存）
async function saveDraggedPosition(marker, group, onSale) {
  const pos = marker.getLatLng();
  const name = [...new Set(group.items.map((it) => it.operator))].join(" / ");
  if (!confirm(`「${name}」の位置をここに変更しますか？`)) {
    marker.setLatLng([group.lat, group.lng]);
    return;
  }
  try {
    await apiWrite("/api/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: group.address, lat: pos.lat, lng: pos.lng }),
    });
    group.lat = pos.lat;
    group.lng = pos.lng;
    group.geoSource = "manual";
    marker.setIcon(pinIcon(group, onSale));
  } catch (err) {
    alert(err.message);
    marker.setLatLng([group.lat, group.lng]);
  }
}

function addMarker(group) {
  // 発売中または発売前のものがあれば赤いピン（すべて終了なら灰色）
  const onSale = group.items.some((it) => effectiveStatus(it) !== "終了");
  const marker = L.marker([group.lat, group.lng], {
    icon: pinIcon(group, onSale),
    title: group.items[0].operator,
    draggable: !SITE.static,
  });
  marker.on("mouseover", () => {
    panelPinned = false;
    showPanel(marker, group);
  });
  marker.on("mouseout", () => {
    if (!panelPinned) hidePanel();
  });
  // スマホ：ピンを長押しすると書影一覧を表示する（短いタップは今までどおりリストへ移動）
  marker.on("contextmenu", (e) => {
    if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);  // 端末のメニューを出さない
    showPanel(marker, group);
    panelPinned = true;
  });
  marker.on("dragstart", hidePanel);
  marker.on("dragend", () => saveDraggedPosition(marker, group, onSale));
  marker.on("click", () => {
    location.href = `${LIST_URL}#addr=${encodeURIComponent(group.address)}`;
  });
  marker.onSale = onSale;
  marker.addTo(map);
  markers.push(marker);
}

function applyFilter() {
  const onlyOnSale = document.getElementById("only-on-sale").checked;
  for (const m of markers) {
    if (!onlyOnSale || m.onSale) m.addTo(map); else m.remove();
  }
}

async function main() {
  map = L.map("map").setView(JAPAN_CENTER, 5);
  L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", {
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>',
    minZoom: 5,
    maxZoom: 18,
  }).addTo(map);
  map.on("movestart zoomstart click", hidePanel);  // 地図を動かす・別の場所をタップすると閉じる

  const groups = groupByAddress(await fetchItems());
  const failed = [];

  for (const [i, g] of groups.entries()) {
    if (g.lat == null) {
      setStatus(`住所を検索中… ${i + 1} / ${groups.length}`);
      const loc = await geocode(g.address);
      if (!loc) {
        failed.push(g.address);
        continue;
      }
      g.lat = loc.lat;
      g.lng = loc.lng;
      g.geoSource = loc.geo_source;
    }
    addMarker(g);
  }

  if (markers.length > 1) {
    map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [60, 60], maxZoom: 13 });
  } else if (markers.length === 1) {
    map.setView(markers[0].getLatLng(), 12);
  }

  setStatus(`${markers.length} 地点`);
  if (failed.length) {
    showMessage(`住所から位置を特定できなかった事業者があります：${failed.join("、")}`);
  }
}

document.getElementById("only-on-sale").addEventListener("change", applyFilter);
main().catch((err) => showMessage(err.message));
