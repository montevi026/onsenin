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
    if (!groups.has(addr)) groups.set(addr, { address: addr, items: [], lat: null, lng: null });
    const g = groups.get(addr);
    g.items.push(it);
    if (g.lat == null && it.lat != null) {
      g.lat = it.lat;
      g.lng = it.lng;
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

function infoContent(group) {
  const first = group.items[0];
  const operators = [...new Set(group.items.map((it) => it.operator))].join(" / ");
  const cards = group.items.map((it) => `
    <figure class="iw-card ${it.status === "終了" ? "ended" : ""}">
      ${it.image_url
        ? `<img src="${it.image_url}" width="150" alt="">`
        : `<div class="iw-noimg">画像なし</div>`}
      <figcaption>
        ${escapeHtml(it.musume_name)}<br>
        ${escapeHtml(it.version)}
        <span class="badge ${it.status === "発売中" ? "on" : "off"}">${escapeHtml(it.status)}</span>
      </figcaption>
    </figure>`).join("");
  return `
    <div class="iw">
      <div class="iw-head">
        <strong>${escapeHtml(operators)}</strong>
        <span>${escapeHtml(first.prefecture)}</span>
      </div>
      <div class="iw-sub">${escapeHtml(group.address)}</div>
      ${first.operator_hours ? `<div class="iw-sub">🕘 ${escapeHtml(first.operator_hours)}</div>` : ""}
      <div class="iw-cards">${cards}</div>
      <div class="iw-hint">クリックでリストの該当箇所へ</div>
    </div>`;
}

function addMarker(group) {
  const onSale = group.items.some((it) => it.status === "発売中");
  const label = group.items.length > 1 ? group.items.length : "♨";
  const icon = L.divIcon({
    className: "",
    html: `<div class="map-pin ${onSale ? "on" : "off"}"><span>${label}</span></div>`,
    iconSize: [32, 38],
    iconAnchor: [16, 38],
    tooltipAnchor: [0, -38],
  });
  const marker = L.marker([group.lat, group.lng], { icon, title: group.items[0].operator });
  marker.bindTooltip(infoContent(group), {
    direction: "top",
    className: "iw-tooltip",
    opacity: 1,
  });
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
      Object.assign(g, loc);
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
