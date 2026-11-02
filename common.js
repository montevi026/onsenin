// リスト画面・マップ画面の共通処理

// 公開用（GitHub Pages）の閲覧専用サイトでは、publish.py が window.SITE を埋め込む
const SITE = window.SITE || { static: false };
const LIST_URL = SITE.static ? "index.html" : "/";
const MAP_URL = SITE.static ? "map.html" : "/map";
const GALLERY_URL = SITE.static ? "gallery.html" : "/gallery";
document.documentElement.classList.toggle("static", SITE.static);

const PREFECTURES = [
  "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島",
  "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜",
  "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫",
  "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口",
  "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎",
  "熊本", "大分", "宮崎", "鹿児島", "沖縄",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 表示用の発売状況。日付から判定するので、日付が過ぎると自動で切り替わる。
//   発売開始日が今日より後 → 発売前 / 発売終了日が今日より前 → 終了 / それ以外 → 登録された発売状況
function effectiveStatus(it) {
  const today = todayStr();
  if (it.start_date && it.start_date > today) return "発売前";
  if (it.end_date && it.end_date < today) return "終了";
  return it.status;
}

function statusBadge(status) {
  const cls = { "発売中": "on", "終了": "off", "発売前": "pre" }[status] || "off";
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// 県（北→南）→ 温泉むすめ → 事業者 → 発売開始日（古い順）の順に並べる。
// 発売開始日が空欄（不明）のものは、その事業者の最初に置き、登録順で並べる。
function sortItems(items) {
  const prefIndex = (p) => {
    const i = PREFECTURES.indexOf(p);
    return i < 0 ? 999 : i;
  };
  const byStartDate = (a, b) => {
    if (!a.start_date || !b.start_date) return !b.start_date - !a.start_date;
    return a.start_date.localeCompare(b.start_date);
  };
  return [...items].sort((a, b) =>
    prefIndex(a.prefecture) - prefIndex(b.prefecture) ||
    a.musume_name.localeCompare(b.musume_name, "ja") ||
    a.operator.localeCompare(b.operator, "ja") ||
    byStartDate(a, b) ||
    a.id - b.id);
}

async function fetchConfig() {
  const res = await fetch("/api/config");
  return res.json();
}

async function fetchItems() {
  const url = SITE.static ? `data/items.json?v=${encodeURIComponent(SITE.updated)}` : "/api/items";
  const res = await fetch(url);
  if (!res.ok) throw new Error("データを取得できませんでした");
  return res.json();
}

// 書き込み系 API。管理者パスワードが必要な場合は入力を求めて再送する
async function apiWrite(url, options = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = { ...(options.headers || {}) };
    const pw = sessionStorage.getItem("adminPassword");
    if (pw) headers["X-Admin-Password"] = pw;
    const res = await fetch(url, { ...options, headers });
    if (res.status !== 401) {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `エラーが発生しました (${res.status})`);
      }
      return res.status === 204 ? null : res.json();
    }
    const input = prompt("管理者パスワードを入力してください");
    if (input === null) throw new Error("キャンセルしました");
    sessionStorage.setItem("adminPassword", input);
  }
  throw new Error("管理者パスワードが違います");
}

// ---------------------------------------------------------------- ヘッダー右上の「注意事項」
// 文言はここだけで管理し、リスト・マップ・書影一覧の3ページで共通に使う
const NOTICE_HTML = `
  <ul>
    <li class="notice-important">このサイトは<strong>非公式</strong>サイトです。個人で集めた情報を掲載しています。事業者の営業時間や、現在の販売状況などは正しくない可能性がありますので、最新情報は必ずXなどを検索してください。（販売中表記でも販売終了になっているものや、販売終了のものもいつのまにか再販されていたりします！営業時間も異なる可能性があるので要注意。）</li>
    <li><a href="https://w.atwiki.jp/onsen-in/pages/1.html" target="_blank" rel="noopener">御泉印Wiki</a>には出典情報なども載っていますので、こちらも是非ご参照ください。</li>
    <li>販売開始情報や、売り切れ情報、再販情報はX上を定期クロールして情報を吸い上げて反映させていますが、もしおかしなところがありましたら、X:<a href="https://x.com/momontevi" target="_blank" rel="noopener">@momontevi</a>までご連絡ください。</li>
    <li>御泉印バージョン名は、Xで公式に言及されている名前があればそれを採用していますが、わからない場合かつ同一事業者で複数種類ある場合は、個人の感覚で名付けしていますのでご了承ください。</li>
    <li>取得状況はブラウザごとに記憶されます。また、ブラウザの閲覧データを消去した場合消えますので、定期的に取得状況をローカルに出力保存してください</li>
  </ul>`;

// ---------------------------------------------------------------- ヘッダー右上の「最終更新」の更新履歴
// マウスを乗せる（スマホはタップ）と表示する。新しいものを上に追記していく
const UPDATE_HISTORY = [
  { date: "2026/11/2", items: [
    "個人の取得状況を保存できるようにしました",
    "平湯みつばの平湯温泉案内所御泉印を追加しました",
    "阿蘇ほむらの大観荘御泉印2種を追加しました",
  ] },
];

const UPDATE_HISTORY_HTML = `
  <dl class="history">${UPDATE_HISTORY.map((h) => `
    <dt>${escapeHtml(h.date)}</dt>
    ${h.items.map((t) => `<dd>${escapeHtml(t)}</dd>`).join("")}`).join("")}
  </dl>`;

// ヘッダーに、ボタンと吹き出し（PC：マウスを乗せると開く／スマホ：タップで画面中央に開く）を置く
function addHeaderPopover(header, { className, buttonHtml, panelHtml, label }) {
  const box = document.createElement("div");
  box.className = `notice ${className}`;
  box.innerHTML = `
    <button type="button" class="notice-button" aria-haspopup="dialog" aria-expanded="false">${buttonHtml}</button>
    <div class="notice-backdrop"></div>
    <div class="notice-panel" role="dialog" aria-label="${label}">
      <button type="button" class="notice-close" aria-label="閉じる">×</button>
      ${panelHtml}
    </div>`;
  header.appendChild(box);
  const button = box.querySelector(".notice-button");
  const setOpen = (open) => {
    box.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  // タップ（クリック）で開閉。PC ではマウスを乗せるだけでも開く（CSS の :hover）
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!box.classList.contains("open"));
  });
  box.querySelector(".notice-close").addEventListener("click", () => setOpen(false));
  box.querySelector(".notice-backdrop").addEventListener("click", () => setOpen(false));
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  return box;
}

// 最終更新日（＝最後に「公開」を押した日）を表示する。記録は日時だが、表示は日付まで
function showUpdated(updated) {
  const el = document.getElementById("updated-text");
  if (el) el.textContent = updated ? updated.slice(0, 10) : "—";
}

(function setupHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  addHeaderPopover(header, {
    className: "updated-info", label: "更新履歴",
    buttonHtml: `最終更新 <span id="updated-text"></span>`, panelHtml: UPDATE_HISTORY_HTML,
  });
  addHeaderPopover(header, {
    className: "notice-main", label: "注意事項", buttonHtml: "注意事項", panelHtml: NOTICE_HTML,
  });
  if (SITE.static) showUpdated(SITE.updated);
  else fetchConfig().then((c) => showUpdated(c.lastPublished)).catch(() => showUpdated(""));
})();

// ---------------------------------------------------------------- 入手状況（各ユーザーのブラウザに保存）
// 入手済みの御泉印の ID を、このブラウザの localStorage に保存する。サーバーには送らない。
// 閲覧データを消すと消えるので、出力・取り込み（JSON ファイル）でバックアップ・復元できるようにする。
const collection = (() => {
  const KEY = "onsenin.collected";
  let ids = new Set();
  try {
    ids = new Set((JSON.parse(localStorage.getItem(KEY) || "[]")).map(Number));
  } catch { /* 読めない場合は空から始める */ }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify([...ids].sort((a, b) => a - b))); }
    catch { alert("入手状況を保存できませんでした（ブラウザの設定で保存が許可されていない可能性があります）"); }
  };
  const nameKey = (it) => `${it.musume_name}\t${it.version}\t${it.operator}`;
  return {
    has: (id) => ids.has(Number(id)),
    set(id, on) {
      if (on) ids.add(Number(id)); else ids.delete(Number(id));
      save();
    },
    count: (items) => items.filter((it) => ids.has(it.id)).length,

    // 出力：ID と、中身がわかるよう温泉むすめ・バージョン・事業者の名前を入れる
    exportFile(items) {
      const byId = new Map(items.map((it) => [it.id, it]));
      const data = {
        format: "onsenin-collection", version: 1, exported_at: new Date().toISOString(),
        collected: [...ids].sort((a, b) => a - b).map((id) => {
          const it = byId.get(id);
          return it ? { id, musume_name: it.musume_name, version: it.version, operator: it.operator } : { id };
        }),
      };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
      a.download = `御泉印_取得状況_${todayStr().replace(/-/g, "")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return data.collected.length;
    },

    // 取り込み：ファイルの内容で今の記録を置き換える。
    // ID が見つからない場合（登録し直されて ID が変わったなど）は、名前が一致する御泉印を探して復元する
    parseFile(text, items) {
      const data = JSON.parse(text);
      if (data.format !== "onsenin-collection" || !Array.isArray(data.collected)) {
        throw new Error("御泉印WEBの取得状況ファイルではありません");
      }
      const known = new Set(items.map((it) => it.id));
      const byName = new Map(items.map((it) => [nameKey(it), it.id]));
      const result = new Set();
      let unmatched = 0;
      for (const c of data.collected) {
        const byNameId = c.musume_name !== undefined ? byName.get(nameKey(c)) : undefined;
        if (known.has(Number(c.id)) && (byNameId === undefined || byNameId === Number(c.id))) result.add(Number(c.id));
        else if (byNameId !== undefined) result.add(byNameId);
        else { result.add(Number(c.id)); unmatched++; }  // 今は見当たらないが、記録としては残す
      }
      return { ids: result, unmatched };
    },
    replace(newIds) {
      ids = new Set(newIds);
      save();
    },
  };
})();
