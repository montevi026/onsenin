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
  { key: "operator", type: "select" },
  { key: "operator_hours", type: "text" },
  { key: "operator_address", type: "text" },
  { key: "version", type: "text" },
  { key: "image_url", type: "choice", options: [["yes", "あり"], ["no", "なし"]] },
  { key: "status", type: "choice", options: [["発売中", "発売中"], ["終了", "終了"]] },
  { key: "start_date", type: "range" },
  { key: "end_date", type: "range" },
  { key: "picnic", ...yesNo("◯") },
  { key: "sangaku", ...yesNo("◯") },
];
const filters = {};  // key → 値（range は {from, to}）

function matchFilter(f, it) {
  const v = filters[f.key];
  const val = it[f.key];
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
    it.operator_address, it.version].join(" ").toLowerCase().includes(q);
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

// select 型の選択肢を、他の条件で絞り込んだ結果に含まれる値に更新する
function updateFilterOptions() {
  for (const f of COLUMN_FILTERS.filter((x) => x.type === "select")) {
    const sel = document.querySelector(`[data-filter="${f.key}"]`);
    const current = filters[f.key] || "";
    const values = new Set(filteredItems(f.key).map((it) => it[f.key]).filter(Boolean));
    if (current) values.add(current);
    const sorted = [...values].sort((a, b) => f.key === "prefecture"
      ? PREFECTURES.indexOf(a) - PREFECTURES.indexOf(b)
      : a.localeCompare(b, "ja"));
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
        class="${it.status === "終了" ? "ended" : ""}">
      <td class="c">${escapeHtml(it.prefecture)}</td>
      <td>${escapeHtml(it.musume_name)}</td>
      <td>${escapeHtml(it.operator)}</td>
      <td>${escapeHtml(it.operator_hours)}</td>
      <td>${escapeHtml(it.operator_address)}</td>
      <td>${escapeHtml(it.version)}</td>
      <td class="c img">${it.image_url
        ? `<img src="${it.image_url}" width="150" alt="${escapeHtml(it.musume_name)} ${escapeHtml(it.version)}" loading="lazy">`
        : `<span class="noimg">画像なし</span>`}</td>
      <td class="c"><span class="badge ${it.status === "発売中" ? "on" : "off"}">${escapeHtml(it.status)}</span></td>
      <td class="c">${escapeHtml(it.start_date || "")}</td>
      <td class="c">${escapeHtml(it.end_date || "")}</td>
      <td class="c">${it.picnic ? "◯" : ""}</td>
      <td class="c">${it.sangaku ? "◯" : ""}</td>
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
}

// ---------------------------------------------------------------- ダイアログ

function openDialog(item = null) {
  editingId = item ? item.id : null;
  form.reset();
  $("#form-error").hidden = true;
  $("#dlg-title").textContent = item ? "御泉印を編集" : "御泉印を追加";
  const preview = $("#preview");
  preview.hidden = true;
  $("#remove-image-wrap").hidden = true;
  if (item) {
    for (const key of ["prefecture", "musume_name", "operator", "operator_hours",
      "operator_address", "version", "status", "start_date", "end_date"]) {
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
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  }
});

// 終了日が入っていて過去日なら、発売状況を「終了」に寄せる
form.end_date.addEventListener("change", () => {
  const today = new Date().toISOString().slice(0, 10);
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
  const btn = $("#btn-save");
  btn.disabled = true;
  try {
    const saved = editingId
      ? await apiWrite(`/api/items/${editingId}`, { method: "PUT", body: fd })
      : await apiWrite("/api/items", { method: "POST", body: fd });
    const idx = items.findIndex((it) => it.id === saved.id);
    if (idx >= 0) items[idx] = saved; else items.push(saved);
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

$("#btn-publish").addEventListener("click", async () => {
  if (!confirm("現在のリストを公開サイト（GitHub Pages）に反映しますか？")) return;
  const btn = $("#btn-publish");
  btn.disabled = true;
  btn.textContent = "公開中…";
  try {
    const { message } = await apiWrite("/api/publish", { method: "POST" });
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
  if (SITE.static) $("#updated").textContent = `最終更新 ${SITE.updated}`;
  try {
    items = await fetchItems();
  } catch (err) {
    alert(err.message);
  }
  render();
  highlightFromHash();
})();
