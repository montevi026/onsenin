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
  </ul>`;

(function setupNotice() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const box = document.createElement("div");
  box.className = "notice";
  box.innerHTML = `
    <button type="button" class="notice-button" aria-haspopup="dialog" aria-expanded="false">注意事項</button>
    <div class="notice-backdrop"></div>
    <div class="notice-panel" role="dialog" aria-label="注意事項">
      <button type="button" class="notice-close" aria-label="閉じる">×</button>
      ${NOTICE_HTML}
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
})();
