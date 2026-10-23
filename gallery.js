// 書影一覧：県・温泉むすめごとに区切り、書影だけを横に並べる。
// 書影をクリックすると、御泉印リストの該当行へ移動する。

// 並び順：県と温泉むすめは登録順（＝取り込んだ CSV の順。リストの温泉むすめの絞り込みと同じ）、
// 同じ温泉むすめの中は事業者に関係なく 発売開始日（不明なものが先）→ 登録順
function groupForGallery(items) {
  const byId = [...items].sort((a, b) => a.id - b.id);
  const first = (key) => {
    const m = new Map();
    for (const it of byId) if (!m.has(key(it))) m.set(key(it), it.id);
    return m;
  };
  const prefFirst = first((it) => it.prefecture);
  const musumeFirst = first((it) => `${it.prefecture}|${it.musume_name}`);
  const sorted = byId.sort((a, b) =>
    prefFirst.get(a.prefecture) - prefFirst.get(b.prefecture) ||
    musumeFirst.get(`${a.prefecture}|${a.musume_name}`) - musumeFirst.get(`${b.prefecture}|${b.musume_name}`) ||
    (!b.start_date - !a.start_date) ||
    (a.start_date || "").localeCompare(b.start_date || "") ||
    a.id - b.id);

  const prefs = [];
  for (const it of sorted) {
    let pref = prefs[prefs.length - 1];
    if (!pref || pref.name !== it.prefecture) prefs.push(pref = { name: it.prefecture, musumes: [] });
    let musume = pref.musumes[pref.musumes.length - 1];
    if (!musume || musume.name !== it.musume_name) pref.musumes.push(musume = { name: it.musume_name, items: [] });
    musume.items.push(it);
  }
  return prefs;
}

// 書影がない場合に表示する「NO IMAGE」の画像に入れる名前（バージョン名が「-」なら事業者名）
function labelOf(it) {
  const version = (it.version || "").trim();
  return version && version !== "-" ? version : it.operator;
}

function cardHtml(it) {
  const inner = it.image_url
    ? `<img src="${it.image_url}" alt="${escapeHtml(`${it.musume_name} ${labelOf(it)}`)}" loading="lazy">`
    : `<span class="noimage"><span class="noimage-text">NO IMAGE</span><span class="noimage-label">${escapeHtml(labelOf(it))}</span></span>`;
  // マウスを乗せると、書影の上部に取扱事業者名を重ねて表示する
  const operator = `<span class="gallery-operator">${escapeHtml(it.operator)}</span>`;
  // 発売状況（「発売状況を表示」にチェックが入っているときだけ見える）
  const status = `<span class="gallery-status">${statusBadge(effectiveStatus(it))}</span>`;
  return `<a class="gallery-card" href="${LIST_URL}#item-${it.id}" aria-label="${escapeHtml(`${it.musume_name} ${labelOf(it)}（${it.operator}）`)}">` +
    `<span class="gallery-thumb">${inner}${operator}</span>${status}</a>`;
}

// 上部の県名ボタンを並べる地方の区分（一般的な8地方区分。三重は近畿）
const REGIONS = [
  ["北海道・東北", ["北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島"]],
  ["関東", ["茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川"]],
  ["中部", ["新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知"]],
  ["近畿", ["三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山"]],
  ["中国", ["鳥取", "島根", "岡山", "広島", "山口"]],
  ["四国", ["徳島", "香川", "愛媛", "高知"]],
  ["九州・沖縄", ["福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"]],
];

// 登録されている県だけを地方ごとに並べる（地方の中の県の並びは、下の書影の並びと同じ）
function prefIndexHtml(prefs) {
  const rows = REGIONS.map(([region, names]) => {
    const links = prefs.map((p, i) => ({ p, i })).filter(({ p }) => names.includes(p.name));
    return links.length ? `
      <div class="pref-region">
        <span class="pref-region-name">${region}</span>
        <span class="pref-region-links">${links.map(({ p, i }) => `<a href="#pref-${i}">${escapeHtml(p.name)}</a>`).join("")}</span>
      </div>` : "";
  });
  // どの地方にも当てはまらない県名（入力ミスなど）があれば最後にまとめる
  const known = REGIONS.flatMap(([, names]) => names);
  const others = prefs.map((p, i) => ({ p, i })).filter(({ p }) => !known.includes(p.name));
  if (others.length) {
    rows.push(`<div class="pref-region"><span class="pref-region-name">その他</span><span class="pref-region-links">${
      others.map(({ p, i }) => `<a href="#pref-${i}">${escapeHtml(p.name)}</a>`).join("")}</span></div>`);
  }
  return rows.join("");
}

function render(prefs, total) {
  document.getElementById("pref-index").innerHTML = prefIndexHtml(prefs);
  document.getElementById("gallery-count").textContent = `（${total} 件）`;
  document.getElementById("gallery-sections").innerHTML = prefs.map((p, i) => `
    <section class="gallery-pref" id="pref-${i}">
      <h2>${escapeHtml(p.name)}</h2>
      ${p.musumes.map((m) => `
        <div class="gallery-musume">
          <h3>${escapeHtml(m.name)}<span class="count">${m.items.length} 件</span></h3>
          <div class="gallery-cards">${m.items.map(cardHtml).join("")}</div>
        </div>`).join("")}
    </section>`).join("");
}

// 表示オプションのチェックボックス。初期状態はどちらもオン。
// 切り替えた状態はブラウザに記憶し、次に書影一覧を開いたときも引き継ぐ
//   発売状況を表示            → 各書影の下に発売状況のバッジ
//   マウスオーバーで事業者表示 → マウスを乗せたときに書影の上部へ事業者名
function setupOption(checkboxId, storageKey, className) {
  const checkbox = document.getElementById(checkboxId);
  const apply = () => document.getElementById("gallery-sections").classList.toggle(className, checkbox.checked);
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) checkbox.checked = saved === "1";
  } catch { /* 記憶できない環境（プライベートブラウズなど）では初期状態のまま */ }
  apply();
  checkbox.addEventListener("change", () => {
    apply();
    try { localStorage.setItem(storageKey, checkbox.checked ? "1" : "0"); } catch { /* 記憶できなくても表示は切り替える */ }
  });
}
setupOption("show-status", "onsenin.gallery.showStatus", "show-status");
setupOption("show-operator", "onsenin.gallery.showOperator", "show-operator");

(async () => {
  try {
    const items = await fetchItems();
    render(groupForGallery(items), items.length);
  } catch (err) {
    document.getElementById("gallery-sections").textContent = err.message;
  }
})();
