import "./styles.css";
import { icon } from "./icons.js";
import { importExcel, importZip, fileToDataUrl } from "./importers.js";
import { loadState, saveState } from "./storage.js";

const tierTemplates = {
  chinese: [
    { name: "夯", color: "#ef4444" },
    { name: "顶级", color: "#f59e0b" },
    { name: "人上人", color: "#eab308" },
    { name: "NPC", color: "#d6c7a1" },
    { name: "拉完了", color: "#cbd5e1" },
  ],
  classic: [
    { name: "S", color: "#ef4444" },
    { name: "A", color: "#f97316" },
    { name: "B", color: "#eab308" },
    { name: "C", color: "#22c55e" },
    { name: "D", color: "#60a5fa" },
  ],
};

function makeId(prefix = "item") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function tiersFromTemplate(template) {
  return template.map((tier) => ({ ...tier, id: makeId("tier") }));
}

const defaultCandidates = ["冰红茶", "辣椒炒肉", "蜜雪冰城"].map((name) => ({
  id: makeId(),
  name,
  kind: "text",
  text: name,
  image: null,
}));

function createDefaultState() {
  const tiers = tiersFromTemplate(tierTemplates.chinese);
  return {
    tiers,
    candidates: defaultCandidates,
    pool: defaultCandidates.map((item) => item.id),
    tierItems: Object.fromEntries(tiers.map((tier) => [tier.id, []])),
    preferences: { poolLayout: "scroll" },
  };
}

let state = createDefaultState();
let draftTiers = [];
let activeSettingsTab = "tiers";
let draggedItemId = null;
let persistTimer = null;
let candidateEditorKind = "text";
let pendingCandidateImages = [];
let commaSessionDecision = null;
let editingCandidateId = null;
let editingCandidateImage = null;

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="app-shell">
    <header class="toolbar">
      <div class="brand">
        <span class="brand-mark">${icon("layers", 22)}</span>
        <div><strong>直播分档榜</strong><small>LIVE TIER BOARD</small></div>
      </div>
      <div class="toolbar-actions" aria-label="主要操作">
        <button class="icon-button" id="settings-button" type="button" title="设置">${icon("settings")}<span>设置</span></button>
        <button class="icon-button" id="reset-button" type="button" title="重置排名">${icon("reset")}<span>重置</span></button>
        <button class="icon-button primary" id="save-button" type="button" title="保存榜单图片">${icon("save")}<span>保存</span></button>
      </div>
    </header>

    <section class="board-wrap" id="export-area" aria-label="分档榜单">
      <div class="tier-board" id="tier-board"></div>
    </section>

    <section class="candidate-shelf" id="pool-dropzone" aria-label="候选列表">
      <div class="shelf-heading">
        <div><span class="shelf-icon">${icon("layers", 18)}</span><strong>候选列表</strong><span class="count-pill" id="pool-count">0</span></div>
        <span>拖动候选项到上方分档</span>
      </div>
      <div class="candidate-list" id="candidate-pool"></div>
    </section>
  </main>

  <dialog class="settings-dialog" id="settings-dialog">
    <div class="dialog-shell">
      <aside class="settings-sidebar">
        <div class="settings-title"><span>${icon("settings", 19)}</span><strong>设置</strong></div>
        <nav>
          <button class="settings-tab active" data-tab="tiers" type="button">${icon("table", 18)}<span>分档/列管理</span></button>
          <button class="settings-tab" data-tab="candidates" type="button">${icon("candidates", 18)}<span>候选项管理</span></button>
        </nav>
        <p>所有内容自动保存在本机</p>
      </aside>
      <section class="settings-content">
        <header class="dialog-header">
          <div><h2 id="settings-heading">分档/列管理</h2><p id="settings-subheading">自定义等级名称、颜色和顺序</p></div>
          <button class="plain-icon-button" id="close-settings" type="button" aria-label="关闭设置">${icon("close")}</button>
        </header>
        <div class="settings-body" id="settings-body"></div>
        <footer class="dialog-footer" id="dialog-footer">
          <button class="button ghost" id="cancel-settings" type="button">取消</button>
          <button class="button primary" id="apply-settings" type="button">应用更改</button>
        </footer>
      </section>
    </div>
  </dialog>

  <dialog class="confirm-dialog" id="multi-text-dialog">
    <div class="confirm-dialog-shell">
      <h3>检测到可能输入多个标签</h3>
      <p>是否导入为多个候选项？</p>
      <div class="detected-tags" id="detected-tags"></div>
      <label class="remember-choice"><input id="remember-comma-choice" type="checkbox">本次编辑都按此方式处理</label>
      <footer><button class="button ghost" data-comma-decision="single" type="button">作为一个候选项</button><button class="button primary" data-comma-decision="split" type="button">导入为多个候选项</button></footer>
    </div>
  </dialog>

  <dialog class="confirm-dialog" id="dedupe-dialog">
    <div class="confirm-dialog-shell">
      <h3>一键去重</h3>
      <p>是否根据标签文本内容去重？将保留每个名称首次出现的候选项；纯图片会按文件名判断。</p>
      <footer><button class="button ghost" id="cancel-dedupe" type="button">取消</button><button class="button primary" id="confirm-dedupe" type="button">确认去重</button></footer>
    </div>
  </dialog>

  <dialog class="confirm-dialog edit-candidate-dialog" id="edit-candidate-dialog">
    <div class="confirm-dialog-shell">
      <h3>编辑候选项</h3>
      <label class="field-label" for="edit-candidate-label">标签内容</label>
      <input class="text-field" id="edit-candidate-label" type="text" placeholder="输入标签内容">
      <label class="field-label">候选图片</label>
      <div class="edit-image-area" id="edit-image-area"></div>
      <div class="edit-image-actions"><button class="button secondary" id="replace-candidate-image" type="button">${icon("image", 17)}选择或替换图片</button><button class="button ghost" id="remove-candidate-image" type="button">移除图片</button></div>
      <footer><button class="button ghost" id="cancel-candidate-edit" type="button">取消</button><button class="button primary" id="save-candidate-edit" type="button">保存更改</button></footer>
    </div>
  </dialog>

  <div class="toast" id="toast" role="status" popover="manual"></div>
  <input id="candidate-image-input" type="file" accept="image/*" multiple hidden>
  <input id="edit-image-input" type="file" accept="image/*" hidden>
  <input id="batch-import-input" type="file" accept=".xlsx,.zip" hidden>
`;

const tierBoard = document.querySelector("#tier-board");
const candidatePool = document.querySelector("#candidate-pool");
const poolDropzone = document.querySelector("#pool-dropzone");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsBody = document.querySelector("#settings-body");
const dialogFooter = document.querySelector("#dialog-footer");
const multiTextDialog = document.querySelector("#multi-text-dialog");
const dedupeDialog = document.querySelector("#dedupe-dialog");
const editCandidateDialog = document.querySelector("#edit-candidate-dialog");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeState(input) {
  if (!input?.tiers?.length || !Array.isArray(input.candidates)) return createDefaultState();
  const candidateIds = new Set(input.candidates.map((item) => item.id));
  const tierIds = new Set(input.tiers.map((tier) => tier.id));
  const used = new Set();
  const tierItems = {};
  for (const tier of input.tiers) {
    tierItems[tier.id] = (input.tierItems?.[tier.id] || []).filter((id) => {
      if (!candidateIds.has(id) || used.has(id)) return false;
      used.add(id);
      return true;
    });
  }
  const pool = (input.pool || []).filter((id) => {
    if (!candidateIds.has(id) || used.has(id)) return false;
    used.add(id);
    return true;
  });
  for (const id of candidateIds) if (!used.has(id)) pool.push(id);
  const poolLayout = input.preferences?.poolLayout === "wrap" ? "wrap" : "scroll";
  return { tiers: input.tiers, candidates: input.candidates, pool, tierItems, preferences: { poolLayout } };
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => saveState(state).catch(() => showToast("本地保存失败", true)), 180);
}

function commit({ renderBoard = true, renderSettings = false } = {}) {
  if (renderBoard) render();
  if (renderSettings) renderSettingsPanel();
  schedulePersist();
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  if (typeof toast.showPopover === "function" && !toast.matches(":popover-open")) toast.showPopover();
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("visible");
    if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) toast.hidePopover();
  }, 2600);
}

function candidateById(id) {
  return state.candidates.find((item) => item.id === id);
}

function candidateCard(item, location) {
  const card = document.createElement("article");
  card.className = `candidate-card kind-${item.kind}`;
  card.draggable = true;
  card.dataset.itemId = item.id;
  card.title = item.name;
  card.setAttribute("aria-label", `${item.name}，可拖动`);

  if (item.image) {
    const image = document.createElement("img");
    image.src = item.image;
    image.alt = item.name;
    image.draggable = false;
    card.appendChild(image);
  }
  if (item.kind !== "image") {
    const label = document.createElement("span");
    label.textContent = item.text || item.name;
    card.appendChild(label);
  }

  card.addEventListener("dragstart", (event) => {
    draggedItemId = item.id;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
  });
  card.addEventListener("dragend", () => {
    draggedItemId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".drop-active").forEach((node) => node.classList.remove("drop-active"));
  });
  card.dataset.location = location;
  return card;
}

function render() {
  const poolLayout = state.preferences?.poolLayout === "wrap" ? "wrap" : "scroll";
  const appShell = document.querySelector(".app-shell");
  appShell.classList.toggle("pool-wrap", poolLayout === "wrap");
  appShell.style.setProperty("--tier-count", state.tiers.length);
  poolDropzone.classList.toggle("layout-wrap", poolLayout === "wrap");
  tierBoard.replaceChildren();
  tierBoard.style.setProperty("--tier-count", state.tiers.length);
  document.querySelector("#pool-count").textContent = state.pool.length;

  for (const tier of state.tiers) {
    const row = document.createElement("div");
    row.className = "tier-row";
    row.dataset.tierId = tier.id;
    row.innerHTML = `<div class="tier-label" style="--tier-color:${escapeHtml(tier.color)}"><strong>${escapeHtml(tier.name)}</strong></div><div class="tier-dropzone" data-zone="${tier.id}"></div>`;
    const zone = row.querySelector(".tier-dropzone");
    for (const id of state.tierItems[tier.id] || []) {
      const item = candidateById(id);
      if (item) zone.appendChild(candidateCard(item, tier.id));
    }
    bindDropzone(zone, tier.id);
    tierBoard.appendChild(row);
  }

  candidatePool.replaceChildren();
  for (const id of state.pool) {
    const item = candidateById(id);
    if (item) candidatePool.appendChild(candidateCard(item, "pool"));
  }
  if (!state.pool.length) {
    const empty = document.createElement("div");
    empty.className = "empty-pool";
    empty.textContent = "候选项已全部放入榜单，可拖回此处";
    candidatePool.appendChild(empty);
  }
}

function bindDropzone(element, target) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    element.classList.add("drop-active");
  });
  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("drop-active");
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("drop-active");
    const itemId = event.dataTransfer.getData("text/plain") || draggedItemId;
    if (itemId) moveCandidate(itemId, target);
  });
}

bindDropzone(poolDropzone, "pool");

function moveCandidate(itemId, target) {
  state.pool = state.pool.filter((id) => id !== itemId);
  for (const tierId of Object.keys(state.tierItems)) {
    state.tierItems[tierId] = state.tierItems[tierId].filter((id) => id !== itemId);
  }
  if (target === "pool") state.pool.push(itemId);
  else if (state.tierItems[target]) state.tierItems[target].push(itemId);
  commit();
}

function openSettings(tab = "tiers") {
  activeSettingsTab = tab;
  draftTiers = state.tiers.map((tier) => ({ ...tier }));
  candidateEditorKind = "text";
  pendingCandidateImages = [];
  commaSessionDecision = null;
  document.querySelector("#candidate-image-input").value = "";
  settingsDialog.showModal();
  switchSettingsTab(tab);
}

function switchSettingsTab(tab) {
  activeSettingsTab = tab;
  document.querySelectorAll(".settings-tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  const isTiers = tab === "tiers";
  document.querySelector("#settings-heading").textContent = isTiers ? "分档/列管理" : "候选项管理";
  document.querySelector("#settings-subheading").textContent = isTiers
    ? "自定义等级名称、颜色和顺序"
    : "添加文字、图片或图文候选项，也可批量导入";
  dialogFooter.hidden = !isTiers;
  renderSettingsPanel();
}

function renderSettingsPanel() {
  if (activeSettingsTab === "tiers") renderTierSettings();
  else renderCandidateSettings();
}

function renderTierSettings() {
  settingsBody.innerHTML = `
    <div class="template-bar"><span>默认模板</span><div><button class="chip" data-template="chinese" type="button">从夯到拉</button><button class="chip" data-template="classic" type="button">从 S 到 D</button></div></div>
    <div class="tier-editor" id="tier-editor"></div>
    <button class="button add-row" id="add-tier" type="button">${icon("plus", 18)}新增分级行</button>
  `;
  const editor = settingsBody.querySelector("#tier-editor");
  draftTiers.forEach((tier, index) => {
    const row = document.createElement("div");
    row.className = "tier-editor-row";
    row.innerHTML = `
      <input class="color-input" type="color" value="${escapeHtml(tier.color)}" aria-label="${escapeHtml(tier.name)}的颜色">
      <input class="tier-name-input" type="text" value="${escapeHtml(tier.name)}" maxlength="16" aria-label="分档名称">
      <button class="mini-icon" data-action="up" type="button" title="上移" ${index === 0 ? "disabled" : ""}>${icon("up", 17)}</button>
      <button class="mini-icon" data-action="down" type="button" title="下移" ${index === draftTiers.length - 1 ? "disabled" : ""}>${icon("down", 17)}</button>
      <button class="mini-icon danger" data-action="delete" type="button" title="删除分档" ${draftTiers.length === 1 ? "disabled" : ""}>${icon("trash", 17)}</button>
    `;
    row.querySelector(".color-input").addEventListener("input", (event) => { draftTiers[index].color = event.target.value; });
    row.querySelector(".tier-name-input").addEventListener("input", (event) => { draftTiers[index].name = event.target.value; });
    row.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => editTier(index, button.dataset.action)));
    editor.appendChild(row);
  });
  settingsBody.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => {
    draftTiers = tiersFromTemplate(tierTemplates[button.dataset.template]);
    renderTierSettings();
  }));
  settingsBody.querySelector("#add-tier").addEventListener("click", () => {
    draftTiers.push({ id: makeId("tier"), name: `新分档 ${draftTiers.length + 1}`, color: "#94a3b8" });
    renderTierSettings();
  });
}

function editTier(index, action) {
  if (action === "delete" && draftTiers.length > 1) draftTiers.splice(index, 1);
  if (action === "up" && index > 0) [draftTiers[index - 1], draftTiers[index]] = [draftTiers[index], draftTiers[index - 1]];
  if (action === "down" && index < draftTiers.length - 1) [draftTiers[index + 1], draftTiers[index]] = [draftTiers[index], draftTiers[index + 1]];
  renderTierSettings();
}

function renderCandidateSettings() {
  settingsBody.innerHTML = `
    <section class="candidate-create-card">
      <h3>添加候选项</h3>
      <div class="type-selector" role="group" aria-label="候选项类型">
        <button class="type-button ${candidateEditorKind === "text" ? "active" : ""}" data-kind="text" type="button">${icon("text", 18)}纯文本</button>
        <button class="type-button ${candidateEditorKind === "image" ? "active" : ""}" data-kind="image" type="button">${icon("image", 18)}纯图片</button>
        <button class="type-button ${candidateEditorKind === "composite" ? "active" : ""}" data-kind="composite" type="button">${icon("layers", 18)}图片 + 文本</button>
      </div>
      <div class="candidate-form" id="candidate-form"></div>
    </section>
    <section class="pool-layout-card">
      <div><h3>候选列表布局</h3><p>候选项较多时，选择保持单行滚动，或自动换行并增高候选列表。</p></div>
      <div class="layout-selector" role="group" aria-label="候选列表布局">
        <button class="layout-option ${state.preferences?.poolLayout !== "wrap" ? "active" : ""}" data-pool-layout="scroll" type="button">横向滚动</button>
        <button class="layout-option ${state.preferences?.poolLayout === "wrap" ? "active" : ""}" data-pool-layout="wrap" type="button">自动换行</button>
      </div>
    </section>
    <section class="candidate-manager">
      <div class="manager-heading"><h3>全部候选项</h3><div class="manager-heading-actions"><span id="candidate-total">${state.candidates.length} 项</span><button class="button dedupe-button" id="dedupe-button" type="button">一键去重</button></div></div>
      <div class="manager-grid" id="manager-grid"></div>
    </section>
  `;
  settingsBody.querySelectorAll(".type-button").forEach((button) => button.addEventListener("click", () => {
    candidateEditorKind = button.dataset.kind;
    pendingCandidateImages = [];
    document.querySelector("#candidate-image-input").value = "";
    settingsBody.querySelectorAll(".type-button").forEach((item) => item.classList.toggle("active", item === button));
    renderCandidateForm();
  }));
  renderCandidateForm();
  settingsBody.querySelectorAll("[data-pool-layout]").forEach((button) => button.addEventListener("click", () => {
    state.preferences = { ...state.preferences, poolLayout: button.dataset.poolLayout };
    commit();
    renderCandidateSettings();
    showToast(button.dataset.poolLayout === "wrap" ? "候选列表将自动换行" : "候选列表将保持单行滚动");
  }));
  settingsBody.querySelector("#dedupe-button").addEventListener("click", () => dedupeDialog.showModal());
  renderManagerGrid();
}

function renderCandidateForm() {
  const form = settingsBody.querySelector("#candidate-form");
  if (!form) return;
  if (candidateEditorKind === "text") {
    form.innerHTML = `
      <div class="candidate-entry-row">
        <input class="text-field" id="new-item-name" type="text" placeholder="输入候选项名称；多个项目可用英文逗号分隔" autocomplete="off">
        <button class="button primary" id="add-item" type="button">${icon("plus", 17)}添加</button>
        <button class="button secondary" id="batch-import-button" type="button">${icon("upload", 17)}批量导入</button>
      </div>`;
    const nameInput = form.querySelector("#new-item-name");
    form.querySelector("#add-item").addEventListener("click", () => addTextCandidates(nameInput));
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTextCandidates(nameInput);
      }
    });
  } else {
    form.innerHTML = `
      <button class="image-picker multi" id="pick-candidate-images" type="button">${icon("image", 22)}<span>选择一张或多张图片</span><small>${candidateEditorKind === "composite" ? "文件名将作为标签内容" : "图片将居中裁切为正方形"}</small></button>
      <div class="selected-image-grid" id="selected-image-grid"></div>
      <div class="candidate-form-actions"><button class="button primary" id="add-item" type="button">${icon("plus", 17)}添加${pendingCandidateImages.length ? ` ${pendingCandidateImages.length} 项` : ""}</button><button class="button secondary" id="batch-import-button" type="button">${icon("upload", 17)}批量导入</button></div>`;
    form.querySelector("#pick-candidate-images").addEventListener("click", () => document.querySelector("#candidate-image-input").click());
    form.querySelector("#add-item").addEventListener("click", addImageCandidates);
    const previewGrid = form.querySelector("#selected-image-grid");
    for (const entry of pendingCandidateImages) {
      const preview = document.createElement("figure");
      preview.className = "selected-image-preview";
      preview.innerHTML = `<img src="${entry.dataUrl}" alt="${escapeHtml(entry.name)}">${candidateEditorKind === "composite" ? `<figcaption>${escapeHtml(entry.name)}</figcaption>` : ""}`;
      previewGrid.appendChild(preview);
    }
  }
  form.querySelector("#batch-import-button").addEventListener("click", () => document.querySelector("#batch-import-input").click());
}

function fileStem(fileName) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

async function askCommaImportDecision(parts) {
  document.querySelector("#detected-tags").innerHTML = parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("");
  const remember = document.querySelector("#remember-comma-choice");
  remember.checked = false;
  multiTextDialog.showModal();
  return new Promise((resolve) => {
    const finish = (decision) => {
      if (decision && remember.checked) commaSessionDecision = decision;
      multiTextDialog.close();
      resolve(decision);
    };
    multiTextDialog.querySelectorAll("[data-comma-decision]").forEach((button) => {
      button.onclick = () => finish(button.dataset.commaDecision);
    });
    multiTextDialog.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
  });
}

async function addTextCandidates(input) {
  const rawName = input.value.trim();
  if (!rawName) {
    showToast("请输入候选项名称", true);
    input.focus();
    return;
  }
  const commaParts = rawName.split(",").map((part) => part.trim()).filter(Boolean);
  let names = [rawName];
  if (commaParts.length > 1) {
    const decision = commaSessionDecision || await askCommaImportDecision(commaParts);
    if (!decision) {
      input.focus();
      return;
    }
    if (decision === "split") names = commaParts;
  }
  const items = names.map((name) => ({ id: makeId(), name, kind: "text", text: name, image: null }));
  addCandidateItems(items);
  input.value = "";
  input.focus();
  showToast(items.length === 1 ? `已添加“${items[0].name}”` : `已添加 ${items.length} 个候选项`);
}

async function addImageCandidates() {
  if (!pendingCandidateImages.length) return showToast("请先选择图片", true);
  const items = pendingCandidateImages.map((entry) => ({
    id: makeId(),
    name: entry.name,
    kind: candidateEditorKind,
    text: candidateEditorKind === "composite" ? entry.name : null,
    image: entry.dataUrl,
  }));
  addCandidateItems(items);
  pendingCandidateImages = [];
  document.querySelector("#candidate-image-input").value = "";
  renderCandidateForm();
  showToast(`已添加 ${items.length} 个候选项`);
}

function addCandidateItems(items) {
  state.candidates.push(...items);
  state.pool.push(...items.map((item) => item.id));
  commit();
  refreshCandidateManager();
}

function refreshCandidateManager() {
  const total = settingsBody.querySelector("#candidate-total");
  if (total) total.textContent = `${state.candidates.length} 项`;
  renderManagerGrid();
}

function renderManagerGrid() {
  const grid = settingsBody.querySelector("#manager-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!state.candidates.length) {
    grid.innerHTML = '<div class="manager-empty">还没有候选项</div>';
    return;
  }
  for (const item of state.candidates) {
    const row = document.createElement("div");
    row.className = "manager-item";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `编辑${item.name}`);
    row.innerHTML = `${item.image ? `<img src="${item.image}" alt="">` : `<span class="manager-text-icon">${icon("text", 20)}</span>`}<div><strong>${escapeHtml(item.name)}</strong><small>${item.kind === "text" ? "纯文本" : item.kind === "image" ? "纯图片" : "图片 + 文本"}</small></div><button class="mini-icon danger" type="button" title="删除候选项">${icon("trash", 17)}</button>`;
    row.addEventListener("click", () => openCandidateEditor(item.id));
    row.addEventListener("keydown", (event) => {
      if (event.target === row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openCandidateEditor(item.id);
      }
    });
    row.querySelector("button").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCandidate(item.id);
    });
    grid.appendChild(row);
  }
}

function deleteCandidate(id) {
  removeCandidateIds(new Set([id]));
  refreshCandidateManager();
}

function removeCandidateIds(ids) {
  state.candidates = state.candidates.filter((item) => !ids.has(item.id));
  state.pool = state.pool.filter((id) => !ids.has(id));
  for (const tierId of Object.keys(state.tierItems)) state.tierItems[tierId] = state.tierItems[tierId].filter((id) => !ids.has(id));
  commit();
}

function performDedupe() {
  const seen = new Set();
  const duplicateIds = new Set();
  for (const item of state.candidates) {
    const key = String(item.text || item.name || "").trim().toLocaleLowerCase();
    if (!key) continue;
    if (seen.has(key)) duplicateIds.add(item.id);
    else seen.add(key);
  }
  if (duplicateIds.size) removeCandidateIds(duplicateIds);
  refreshCandidateManager();
  showToast(duplicateIds.size ? `已移除 ${duplicateIds.size} 个重复候选项` : "没有发现重复候选项");
}

function openCandidateEditor(id) {
  const item = candidateById(id);
  if (!item) return;
  editingCandidateId = id;
  editingCandidateImage = item.image || null;
  document.querySelector("#edit-candidate-label").value = item.text || "";
  renderEditImage();
  editCandidateDialog.showModal();
}

function renderEditImage() {
  const area = document.querySelector("#edit-image-area");
  area.innerHTML = editingCandidateImage
    ? `<img src="${editingCandidateImage}" alt="候选项图片">`
    : `<div class="no-edit-image">${icon("image", 26)}<span>暂无图片</span></div>`;
  document.querySelector("#remove-candidate-image").disabled = !editingCandidateImage;
}

function saveCandidateEdit() {
  const item = candidateById(editingCandidateId);
  if (!item) return editCandidateDialog.close();
  const label = document.querySelector("#edit-candidate-label").value.trim();
  if (!label && !editingCandidateImage) return showToast("候选项至少需要文字或图片", true);
  if (label) item.name = label;
  item.text = label || null;
  item.image = editingCandidateImage;
  item.kind = editingCandidateImage ? (label ? "composite" : "image") : "text";
  commit();
  refreshCandidateManager();
  editCandidateDialog.close();
  showToast("候选项已更新");
}

function applyTierSettings() {
  const cleanTiers = draftTiers.map((tier, index) => ({ ...tier, name: tier.name.trim() || `分档 ${index + 1}` }));
  const nextIds = new Set(cleanTiers.map((tier) => tier.id));
  const removedItems = [];
  for (const [tierId, items] of Object.entries(state.tierItems)) {
    if (!nextIds.has(tierId)) removedItems.push(...items);
  }
  state.tiers = cleanTiers;
  state.tierItems = Object.fromEntries(cleanTiers.map((tier) => [tier.id, state.tierItems[tier.id] || []]));
  state.pool.push(...removedItems.filter((id) => !state.pool.includes(id)));
  commit();
  settingsDialog.close();
  showToast("分档设置已应用");
}

document.querySelector("#settings-button").addEventListener("click", () => openSettings());
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#cancel-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#apply-settings").addEventListener("click", applyTierSettings);
document.querySelectorAll(".settings-tab").forEach((button) => button.addEventListener("click", () => switchSettingsTab(button.dataset.tab)));

document.querySelector("#reset-button").addEventListener("click", () => {
  const ranked = state.tiers.flatMap((tier) => state.tierItems[tier.id] || []);
  state.pool = [...state.pool, ...ranked.filter((id) => !state.pool.includes(id))];
  state.tierItems = Object.fromEntries(state.tiers.map((tier) => [tier.id, []]));
  commit();
  showToast("榜单已重置，候选项已移回下方");
});

document.querySelector("#save-button").addEventListener("click", async () => {
  const board = document.querySelector("#export-area");
  const rect = board.getBoundingClientRect();
  if (!window.desktop?.saveBoardImage) return showToast("请在桌面应用中使用保存功能", true);
  try {
    const result = await window.desktop.saveBoardImage({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    if (result.ok) showToast("榜单图片已保存");
  } catch {
    showToast("保存图片失败", true);
  }
});

document.querySelector("#candidate-image-input").addEventListener("change", async (event) => {
  const files = [...(event.target.files || [])];
  pendingCandidateImages = await Promise.all(files.map(async (file) => ({
    name: fileStem(file.name),
    dataUrl: await fileToDataUrl(file),
  })));
  renderCandidateForm();
});

document.querySelector("#edit-image-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  editingCandidateImage = await fileToDataUrl(file);
  renderEditImage();
});

document.querySelector("#batch-import-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const imported = file.name.toLowerCase().endsWith(".zip") ? await importZip(file) : await importExcel(file);
    const items = imported.map((item) => ({ ...item, id: makeId() }));
    addCandidateItems(items);
    showToast(`成功导入 ${items.length} 个候选项`);
  } catch (error) {
    showToast(error.message || "导入失败", true);
  }
});

document.querySelector("#cancel-dedupe").addEventListener("click", () => dedupeDialog.close());
document.querySelector("#confirm-dedupe").addEventListener("click", () => {
  dedupeDialog.close();
  performDedupe();
});
document.querySelector("#replace-candidate-image").addEventListener("click", () => document.querySelector("#edit-image-input").click());
document.querySelector("#remove-candidate-image").addEventListener("click", () => {
  editingCandidateImage = null;
  renderEditImage();
});
document.querySelector("#cancel-candidate-edit").addEventListener("click", () => editCandidateDialog.close());
document.querySelector("#save-candidate-edit").addEventListener("click", saveCandidateEdit);

settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
settingsDialog.addEventListener("close", () => {
  commaSessionDecision = null;
  pendingCandidateImages = [];
});

async function initialize() {
  try {
    const saved = await loadState();
    if (saved) state = normalizeState(saved);
  } catch {
    showToast("未能读取本地数据，将使用默认榜单", true);
  }
  render();
}

initialize();
