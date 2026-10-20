// リスト画面：一覧表示・検索・追加/編集/削除

let items = [];
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const tbody = $("#list tbody");
const dlg = $("#dlg");
const form = $("#item-form");

// ---------------------------------------------------------------- 項目ごとの絞り込み
// select : 登録済みの値から選択（他の絞り込み条件に合わせて選択肢も絞られる）
// text   : 部分一致
// choice : 固定の選択肢
// range  : 日付の期間（〜から〜まで）
const yesNo = (label) => ({
  type: "choice",
  options: [["yes", label], ["no", "空欄"]],
});
const COLUMN_FILTERS = [
  { key: "prefecture", type: "select" },
  { key: "musume_name", type: "select" },
  { key: "operator", type: "text" },
  { key: "operator_hours", type: "text" },
  { key: "operator_address", type: "text" },
  { key: "version", type: "text" },
  { key: "image_url", type: "choice", options: [["yes", "あり"], ["no", "なし"]] },
  { key: "status", type: "choice", value: effectiveStatus,
    options: [["発売中", "発売中"], ["発売前", "発売前"], ["終了", "終了"]] },
  { key: "start_date", type: "range" },
  { key: "end_date", type: "range" },
  { key: "picnic", ...yesNo("◯") },
  { key: "sangaku", ...yesNo("◯") },
  { key: "note", type: "text" },
];
const filters = {};  // key → 値（range は {from, to}）

function matchFilter(f, it) {
  const v = filters[f.key];
  const val = f.value ? f.value(it) : it[f.key];
  switch (f.type) {
    case "select":
      return !v || val === v;
    case "text":
      return !v || (val || "").toLowerCase().includes(v.toLowerCase());
    case "choice":
      if (!v) return true;
      if (v === "yes") return !!val;
      if (v === "no") return !val;
      return val === v;
    case "range":
      if (!v || (!v.from && !v.to)) return true;
      if (!val) return false;
      return (!v.from || val >= v.from) && (!v.to || val <= v.to);
  }
  return true;
}

function isActive(f) {
  const v = filters[f.key];
  return f.type === "range" ? !!(v && (v.from || v.to)) : !!v;
}

function matchKeyword(it) {
  const q = $("#q").value.trim().toLowerCase();
  return !q || [it.prefecture, it.musume_name, it.operator, it.operator_hours,
    it.operator_address, it.version, it.note].join(" ").toLowerCase().includes(q);
}

// exceptKey を指定すると、その項目の条件だけ無視する（選択肢の絞り込み用）
function filteredItems(exceptKey = null) {
  return sortItems(items).filter((it) => matchKeyword(it) &&
    COLUMN_FILTERS.every((f) => f.key === exceptKey || matchFilter(f, it)));
}

function buildFilterRow() {
  const cells = COLUMN_FILTERS.map((f) => {
    let ctrl;
    if (f.type === "select") {
      ctrl = `<select data-filter="${f.key}"></select>`;
    } else if (f.type === "text") {
      ctrl = `<input type="search" data-filter="${f.key}" placeholder="含む文字">`;
    } else if (f.type === "choice") {
      ctrl = `<select data-filter="${f.key}"><option value="">すべて</option>${
        f.options.map(([v, label]) => `<option value="${v}">${label}</option>`).join("")}</select>`;
    } else {
      ctrl = `<input type="date" data-filter="${f.key}" data-bound="from" title="この日から">
              <input type="date" data-filter="${f.key}" data-bound="to" title="この日まで">`;
    }
    return `<th>${ctrl}</th>`;
  });
  $("#filter-row").innerHTML = cells.join("") + '<th class="admin-only"></th>';
}

// 温泉むすめの並び順：県ごとにまとめ、県は最初に登録された順（＝取り込んだ CSV の順）、
// 県の中は登録順。後から追加した温泉むすめは、同じ県のグループの最後に入る。
function musumeOrder() {
  const prefFirst = new Map();    // 県名 → その県で最初に登録された id
  const musumeFirst = new Map();  // 温泉むすめ → 最初に登録された id
  const musumePref = new Map();   // 温泉むすめ → 県名
  for (const it of items) {
    if (!prefFirst.has(it.prefecture) || it.id < prefFirst.get(it.prefecture)) {
      prefFirst.set(it.prefecture, it.id);
    }
    if (!musumeFirst.has(it.musume_name) || it.id < musumeFirst.get(it.musume_name)) {
      musumeFirst.set(it.musume_name, it.id);
      musumePref.set(it.musume_name, it.prefecture);
    }
  }
  const prefRank = (m) => prefFirst.get(musumePref.get(m)) ?? Infinity;
  return (a, b) => prefRank(a) - prefRank(b) ||
    (musumeFirst.get(a) ?? Infinity) - (musumeFirst.get(b) ?? Infinity);
}

// select 型の選択肢を、他の条件で絞り込んだ結果に含まれる値に更新する
function updateFilterOptions() {
  for (const f of COLUMN_FILTERS.filter((x) => x.type === "select")) {
    const sel = document.querySelector(`[data-filter="${f.key}"]`);
    const current = filters[f.key] || "";
    const values = new Set(filteredItems(f.key).map((it) => it[f.key]).filter(Boolean));
    if (current) values.add(current);
    const sorted = f.key === "prefecture"
      ? [...values].sort((a, b) => PREFECTURES.indexOf(a) - PREFECTURES.indexOf(b))
      : [...values].sort(musumeOrder());
    sel.innerHTML = `<option value="">すべて</option>` +
      sorted.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    sel.value = current;
  }
}

function updateFilterHighlight() {
  for (const f of COLUMN_FILTERS) {
    document.querySelectorAll(`[data-filter="${f.key}"]`)
      .forEach((el) => el.classList.toggle("active", isActive(f)));
  }
  $("#btn-clear").hidden = !COLUMN_FILTERS.some(isActive) && !$("#q").value;
}

$("#filter-row").addEventListener("input", (e) => {
  const key = e.target.dataset.filter;
  if (!key) return;
  const bound = e.target.dataset.bound;
  if (bound) {
    filters[key] = { ...(filters[key] || {}), [bound]: e.target.value };
  } else {
    filters[key] = e.target.value;
  }
  render();
});

$("#btn-clear").addEventListener("click", () => {
  for (const k of Object.keys(filters)) delete filters[k];
  $("#q").value = "";
  document.querySelectorAll("#filter-row input").forEach((el) => { el.value = ""; });
  render();
});

function initSelects() {
  const opts = PREFECTURES.map((p) => `<option value="${p}">${p}</option>`).join("");
  form.prefecture.innerHTML = `<option value="">選択してください</option>${opts}`;
  buildFilterRow();
}

function render() {
  const list = filteredItems();
  tbody.innerHTML = list.map((it) => `
    <tr id="item-${it.id}" data-address="${escapeHtml(it.operator_address)}"
        class="${effectiveStatus(it) === "終了" ? "ended" : ""}">
      <td class="c">${escapeHtml(it.prefecture)}</td>
      <td>${escapeHtml(it.musume_name)}</td>
      <td>${escapeHtml(it.operator)}</td>
      <td>${escapeHtml(it.operator_hours)}</td>
      <td>${escapeHtml(it.operator_address)}</td>
      <td>${escapeHtml(it.version)}</td>
      <td class="c img">${it.image_url
        ? `<img src="${it.image_url}" width="150" alt="${escapeHtml(it.musume_name)} ${escapeHtml(it.version)}" loading="lazy">`
        : `<span class="noimg">画像なし</span>`}</td>
      <td class="c">${statusBadge(effectiveStatus(it))}</td>
      <td class="c">${escapeHtml(it.start_date || "")}</td>
      <td class="c">${escapeHtml(it.end_date || "")}</td>
      <td class="c">${it.picnic ? "◯" : ""}</td>
      <td class="c">${it.sangaku ? "◯" : ""}</td>
      <td class="note">${escapeHtml(it.note || "")}</td>
      <td class="c actions admin-only">
        <button class="btn small" data-edit="${it.id}">編集</button>
        <button class="btn small danger" data-delete="${it.id}">削除</button>
      </td>
    </tr>`).join("");
  $("#count").textContent = `${list.length} / ${items.length} 件`;
  $("#empty").hidden = items.length > 0;
  updateDatalists();
  updateFilterOptions();
  updateFilterHighlight();
}

function updateDatalists() {
  const uniq = (key) => [...new Set(items.map((it) => it[key]).filter(Boolean))]
    .map((v) => `<option value="${escapeHtml(v)}">`).join("");
  $("#musume-list").innerHTML = uniq("musume_name");
  $("#operator-list").innerHTML = uniq("operator");
}

// マップからの遷移（/#addr=住所 または /#item-ID）で該当行を強調してスクロール
function highlightFromHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (!hash) return;
  let rows = [];
  if (hash.startsWith("addr=")) {
    const addr = hash.slice(5);
    rows = [...tbody.querySelectorAll("tr")].filter((tr) => tr.dataset.address === addr);
  } else {
    const tr = document.getElementById(hash);
    if (tr) rows = [tr];
  }
  document.querySelectorAll("tr.highlight").forEach((tr) => tr.classList.remove("highlight"));
  if (!rows.length) return;
  rows.forEach((tr) => tr.classList.add("highlight"));
  rows[0].scrollIntoView({ behavior: "smooth", block: "center" });
  // 念のため、スクロール後に該当行が表の表示範囲に入っていなければ位置を合わせ直す
  setTimeout(() => {
    const wrap = $(".table-wrap").getBoundingClientRect();
    const r = rows[0].getBoundingClientRect();
    if (r.top < wrap.top || r.bottom > wrap.bottom) rows[0].scrollIntoView({ block: "center" });
  }, 1500);
}

// ---------------------------------------------------------------- ダイアログ

function openDialog(item = null) {
  editingId = item ? item.id : null;
  form.reset();
  $("#form-error").hidden = true;
  $("#operator-hint").hidden = true;
  $("#master-hint").hidden = true;
  $("#drop-status").hidden = true;
  autoFilled = null;
  $("#dlg-title").textContent = item ? "御泉印を編集" : "御泉印を追加";
  const preview = $("#preview");
  preview.hidden = true;
  $("#remove-image-wrap").hidden = true;
  if (item) {
    for (const key of ["prefecture", "musume_name", "operator", "operator_hours",
      "operator_address", "version", "status", "start_date", "end_date", "note"]) {
      form[key].value = item[key] || "";
    }
    form.picnic.checked = item.picnic;
    form.sangaku.checked = item.sangaku;
    if (item.image_url) {
      preview.src = item.image_url;
      preview.hidden = false;
      $("#remove-image-wrap").hidden = false;
    }
  }
  dlg.showModal();
}

form.image.addEventListener("change", () => {
  const file = form.image.files[0];
  const preview = $("#preview");
  if (file) {
    form.image_url.value = "";  // ファイルを選び直したら、ドロップされた URL は使わない
    $("#drop-status").hidden = true;
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  }
});

// ---------------------------------------------------------------- 書影のドラッグ＆ドロップ
// Chrome などから画像をドロップすると、画像ファイルそのものか画像の URL が渡される。
// ファイルならファイル選択欄に入れ、URL ならサーバーがダウンロードして登録する。
function setImageFile(file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  form.image.files = dt.files;
  form.image.dispatchEvent(new Event("change"));
}

function droppedImageUrl(dt) {
  const uriList = (dt.getData("text/uri-list") || "").split(/\r?\n/)
    .map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  const html = dt.getData("text/html");
  // ページ内の画像をドラッグした場合は、HTML の <img src> が画像本体の URL
  const imgSrc = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img")?.src : "";
  const plain = (dt.getData("text/plain") || "").trim();
  return [imgSrc, ...uriList, plain].find((u) => /^(https?:|data:image\/)/i.test(u || "")) || "";
}

async function handleImageDrop(dt) {
  const status = $("#drop-status");
  const file = [...dt.files].find((f) => f.type.startsWith("image/"));
  if (file) {
    setImageFile(file);
    status.textContent = "ドロップした画像を設定しました";
    status.hidden = false;
    return;
  }
  const url = droppedImageUrl(dt);
  // 画像データが URL に埋め込まれている場合や、このサイト内の画像はブラウザで直接読み込む
  if (url.startsWith("data:") || (url && new URL(url).origin === location.origin)) {
    const blob = await (await fetch(url)).blob();
    setImageFile(new File([blob], "dropped", { type: blob.type }));
    status.textContent = "ドロップした画像を設定しました";
    status.hidden = false;
    return;
  }
  if (url) {
    form.image.value = "";
    form.image_url.value = url;
    const preview = $("#preview");
    preview.src = url;
    preview.hidden = false;
    status.textContent = "ドロップした画像を設定しました（保存時にダウンロードします）";
    status.hidden = false;
    return;
  }
  $("#form-error").textContent = "ドロップされたものを画像として読み込めませんでした";
  $("#form-error").hidden = false;
}

// 追加・編集画面のどこに落としても受け付ける（画面外に落としてもページが移動しないようにする）
const imageField = $(".image-field");
for (const type of ["dragenter", "dragover"]) {
  document.addEventListener(type, (e) => {
    e.preventDefault();
    if (dlg.open) imageField.classList.add("dragover");
  });
}
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) imageField.classList.remove("dragover");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  imageField.classList.remove("dragover");
  if (dlg.open) handleImageDrop(e.dataTransfer);
});

// 終了日が入っていて過去日なら、発売状況を「終了」に寄せる
// 登録済みの事業者名が入力されたら、その事業者の対応時間・住所を反映する。
// 同じ名前が複数の県にある場合は、選択中の県のものを優先し、新しく登録されたものから値を採る。
let autoFilled = null;  // 自動で反映した値（手で直されていなければ、名前の変更時に取り消す）

function fillOperatorInfo() {
  const name = form.operator.value.trim();
  const hint = $("#operator-hint");
  const matches = items.filter((it) => it.operator === name && it.id !== editingId);
  if (!name || !matches.length) {
    if (autoFilled &&
        form.operator_hours.value === autoFilled.hours &&
        form.operator_address.value === autoFilled.address) {
      form.operator_hours.value = autoFilled.prevHours;
      form.operator_address.value = autoFilled.prevAddress;
    }
    autoFilled = null;
    hint.hidden = true;
    return;
  }
  const prev = autoFilled || {
    prevHours: form.operator_hours.value, prevAddress: form.operator_address.value,
  };
  const samePref = matches.filter((it) => it.prefecture === form.prefecture.value);
  const source = (samePref.length ? samePref : matches).sort((a, b) => b.id - a.id);
  const pick = (key) => (source.find((it) => it[key]) || {})[key] || "";
  form.operator_hours.value = pick("operator_hours");
  form.operator_address.value = pick("operator_address");
  autoFilled = {
    hours: form.operator_hours.value, address: form.operator_address.value,
    prevHours: prev.prevHours, prevAddress: prev.prevAddress,
  };
  hint.textContent = "登録済みの事業者のため、対応時間と住所を反映しました";
  hint.hidden = false;
}
form.operator.addEventListener("input", fillOperatorInfo);
form.operator.addEventListener("change", fillOperatorInfo);

// 登録済みの事業者の対応時間・住所を書き換えるときは、ほかの御泉印にも反映されることを知らせる
function updateMasterHint() {
  const hint = $("#master-hint");
  const pref = form.prefecture.value;
  const name = form.operator.value.trim();
  const others = items.filter((it) => it.prefecture === pref && it.operator === name && it.id !== editingId);
  const master = others[0];
  const changed = master && (form.operator_hours.value.trim() !== (master.operator_hours || "") ||
                             form.operator_address.value.trim() !== (master.operator_address || ""));
  hint.textContent = changed
    ? `対応時間・住所の変更は、同じ事業者の御泉印 ${others.length} 件にも反映されます`
    : "";
  hint.hidden = !changed;
}
for (const el of [form.prefecture, form.operator, form.operator_hours, form.operator_address]) {
  el.addEventListener("input", updateMasterHint);
  el.addEventListener("change", updateMasterHint);
}

form.end_date.addEventListener("change", () => {
  const today = todayStr();
  if (form.end_date.value && form.end_date.value < today) form.status.value = "終了";
});

$("#btn-cancel").addEventListener("click", () => dlg.close());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  fd.set("picnic", form.picnic.checked ? "1" : "0");
  fd.set("sangaku", form.sangaku.checked ? "1" : "0");
  fd.set("remove_image", form.remove_image.checked ? "1" : "0");
  if (!form.image.files.length) fd.delete("image");
  if (!form.image_url.value) fd.delete("image_url");
  const btn = $("#btn-save");
  btn.disabled = true;
  try {
    const saved = editingId
      ? await apiWrite(`/api/items/${editingId}`, { method: "PUT", body: fd })
      : await apiWrite("/api/items", { method: "POST", body: fd });
    const idx = items.findIndex((it) => it.id === saved.id);
    if (idx >= 0) items[idx] = saved; else items.push(saved);
    // 事業者マスタの対応時間・住所・位置は、同じ事業者のほかの御泉印にも反映されている
    for (const it of items) {
      if (it.operator_id === saved.operator_id) {
        for (const k of ["operator_hours", "operator_address", "lat", "lng", "geo_source"]) it[k] = saved[k];
      }
    }
    dlg.close();
    render();
    location.hash = `item-${saved.id}`;
    highlightFromHash();
  } catch (err) {
    $("#form-error").textContent = err.message;
    $("#form-error").hidden = false;
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------- 一覧の操作

tbody.addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;
  if (editId) {
    openDialog(items.find((it) => it.id === Number(editId)));
  } else if (deleteId) {
    const it = items.find((x) => x.id === Number(deleteId));
    if (!confirm(`「${it.musume_name} ${it.version}」（${it.operator}）を削除しますか？`)) return;
    try {
      await apiWrite(`/api/items/${it.id}`, { method: "DELETE" });
      items = items.filter((x) => x.id !== it.id);
      render();
    } catch (err) {
      alert(err.message);
    }
  }
});

$("#btn-add").addEventListener("click", () => openDialog());

// 最終更新日（＝最後に「公開」を押した日）を件数の上に表示する。記録は日時だが、表示は日付まで
function showUpdated(updated) {
  $("#updated").textContent = updated ? `最終更新 ${updated.slice(0, 10)}` : "";
}

$("#btn-publish").addEventListener("click", async () => {
  if (!confirm("現在のリストを公開サイト（GitHub Pages）に反映しますか？")) return;
  const btn = $("#btn-publish");
  btn.disabled = true;
  btn.textContent = "公開中…";
  try {
    const { message, updated } = await apiWrite("/api/publish", { method: "POST" });
    showUpdated(updated);
    alert(message);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "公開";
  }
});
$("#q").addEventListener("input", render);
window.addEventListener("hashchange", highlightFromHash);

(async () => {
  initSelects();
  showUpdated(SITE.static ? SITE.updated : (await fetchConfig()).lastPublished);
  try {
    items = await fetchItems();
  } catch (err) {
    alert(err.message);
  }
  render();
  highlightFromHash();
})();
