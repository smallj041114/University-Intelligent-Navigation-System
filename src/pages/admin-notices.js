import { adminFetch } from "../lib/admin-fetch.js";
import { NavArrowSettings } from "../lib/nav-arrow-settings.js";

const noticeStatus = document.getElementById("noticeStatus");
const noticePreviewModal = document.getElementById("noticePreviewModal");
const noticePreviewTitle = document.getElementById("noticePreviewTitle");
const noticePreviewBody = document.getElementById("noticePreviewBody");
const noticePreviewCountdown = document.getElementById("noticePreviewCountdown");
const noticePreviewCloseBtn = document.getElementById("noticePreviewCloseBtn");
const noticePreviewFormWrap = document.getElementById("noticePreviewFormWrap");
const noticePreviewFormLabel = document.getElementById("noticePreviewFormLabel");

/** @type {ReturnType<typeof NavArrowSettings.normalizeWelcomeNotice>} */
let welcome = NavArrowSettings.normalizeWelcomeNotice({});
/** @type {ReturnType<typeof NavArrowSettings.normalizeEndFeedback>} */
let endFeedback = NavArrowSettings.normalizeEndFeedback({});
/** @type {"admin"|"qr_notice"|""} */
let sessionRole = "";
let previewTimer = null;

function setStatus(text) {
  if (noticeStatus) {
    noticeStatus.textContent = text || "";
  }
}

function isFullAdmin() {
  return sessionRole === "admin";
}

async function requireSession() {
  const res = await adminFetch("/api/admin/session", { cache: "no-store" });
  if (!res.ok) {
    location.replace("/admin/login.html?next=" + encodeURIComponent("/admin/notices.html"));
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (data.role !== "admin" && data.role !== "qr_notice") {
    location.replace(data.role === "qr" ? "/admin/links.html" : "/admin/login.html");
    throw new Error("unauthorized");
  }
  sessionRole = data.role;
  if (data.role === "qr_notice") {
    document.querySelectorAll(".admin-only-defaults").forEach((el) => el.classList.add("hidden"));
    const desc = document.getElementById("noticesPageDesc");
    if (desc) {
      desc.textContent =
        "二級管理員只能設定依網址規則。預設訊息由完整管理員維護；規則由上而下第一筆命中。";
    }
    document.getElementById("adminHomeBackLink")?.classList.add("hidden");
  }
}

function fillWelcomeDefault() {
  if (!isFullAdmin()) {
    return;
  }
  document.getElementById("noticeEnabled").checked = welcome.enabled;
  document.getElementById("noticeShowEveryVisit").checked = welcome.showEveryVisit;
  document.getElementById("noticeTitle").value = welcome.title;
  document.getElementById("noticeBody").value = welcome.body;
  document.getElementById("noticeCountdown").value = String(welcome.countdownSec);
  document.getElementById("noticeVersion").textContent = String(welcome.version);
}

function readWelcomeDefaultFromForm() {
  if (!isFullAdmin()) {
    return welcome;
  }
  return NavArrowSettings.normalizeWelcomeNotice({
    enabled: Boolean(document.getElementById("noticeEnabled")?.checked),
    showEveryVisit: Boolean(document.getElementById("noticeShowEveryVisit")?.checked),
    title: document.getElementById("noticeTitle")?.value || "",
    body: document.getElementById("noticeBody")?.value || "",
    countdownSec: Number(document.getElementById("noticeCountdown")?.value) || welcome.countdownSec,
    version: welcome.version,
    rules: welcome.rules
  });
}

function welcomeDefaultChanged(next) {
  return (
    next.title !== welcome.title ||
    next.body !== welcome.body ||
    next.countdownSec !== welcome.countdownSec ||
    next.enabled !== welcome.enabled ||
    next.showEveryVisit !== welcome.showEveryVisit
  );
}

function fillEndDefault() {
  if (!isFullAdmin()) {
    return;
  }
  const d = endFeedback.defaultNotice;
  document.getElementById("endEnabled").checked = d.enabled;
  document.getElementById("endEvery").checked = d.showEveryVisit;
  document.getElementById("endTitle").value = d.title;
  document.getElementById("endBody").value = d.body;
  document.getElementById("endFormUrl").value = d.formUrl || "";
  document.getElementById("endFormLabel").value = d.formButtonLabel || "填寫回饋";
  document.getElementById("endCountdown").value = String(d.countdownSec);
  document.getElementById("endVersion").textContent = String(d.version);
}

function readEndDefaultFromForm() {
  const d = endFeedback.defaultNotice;
  if (!isFullAdmin()) {
    return endFeedback;
  }
  return NavArrowSettings.normalizeEndFeedback({
    defaultNotice: {
      enabled: Boolean(document.getElementById("endEnabled")?.checked),
      showEveryVisit: Boolean(document.getElementById("endEvery")?.checked),
      title: document.getElementById("endTitle")?.value || "",
      body: document.getElementById("endBody")?.value || "",
      formUrl: document.getElementById("endFormUrl")?.value || "",
      formButtonLabel: document.getElementById("endFormLabel")?.value || "填寫回饋",
      countdownSec: Number(document.getElementById("endCountdown")?.value) || d.countdownSec,
      version: d.version
    },
    rules: endFeedback.rules
  });
}

function endDefaultChanged(nextEf) {
  const a = endFeedback.defaultNotice;
  const b = nextEf.defaultNotice;
  return (
    a.title !== b.title ||
    a.body !== b.body ||
    a.formUrl !== b.formUrl ||
    a.formButtonLabel !== b.formButtonLabel ||
    a.countdownSec !== b.countdownSec ||
    a.enabled !== b.enabled ||
    a.showEveryVisit !== b.showEveryVisit
  );
}

function stopPreviewTimer() {
  if (previewTimer) {
    clearInterval(previewTimer);
    previewTimer = null;
  }
}

function closePreview() {
  stopPreviewTimer();
  noticePreviewModal?.classList.add("hidden");
}

function openPreview(notice, { showForm = false } = {}) {
  if (noticePreviewTitle) {
    noticePreviewTitle.textContent = notice.title;
  }
  if (noticePreviewBody) {
    noticePreviewBody.textContent = notice.body;
  }
  if (noticePreviewFormWrap) {
    const url = String(notice.formUrl || "").trim();
    if (showForm && url) {
      noticePreviewFormWrap.classList.remove("hidden");
      if (noticePreviewFormLabel) {
        noticePreviewFormLabel.textContent = notice.formButtonLabel || "填寫回饋";
      }
    } else {
      noticePreviewFormWrap.classList.add("hidden");
    }
  }
  let left = notice.countdownSec;
  if (noticePreviewCountdown) {
    noticePreviewCountdown.textContent = String(left);
  }
  noticePreviewModal?.classList.remove("hidden");
  stopPreviewTimer();
  previewTimer = setInterval(() => {
    left -= 1;
    if (noticePreviewCountdown) {
      noticePreviewCountdown.textContent = String(Math.max(0, left));
    }
    if (left <= 0) {
      closePreview();
    }
  }, 1000);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRulesList(containerId, rules, kind) {
  const box = document.getElementById(containerId);
  if (!box) {
    return;
  }
  if (!rules.length) {
    box.innerHTML = `<p class="admin-links-hint">尚無規則</p>`;
    return;
  }
  box.innerHTML = rules
    .map((r, index) => {
      const on = r.enabled ? "啟用" : "關閉";
      return `<div class="admin-url-rule-row" data-kind="${kind}" data-id="${r.id}">
        <div>
          <strong>${escapeHtml(r.label || r.urlMatch)}</strong>
          <span class="admin-links-hint"> · ${on} · 關鍵字「${escapeHtml(r.urlMatch)}」 · v${r.version}</span>
        </div>
        <div class="admin-links-row">
          <button type="button" class="secondary-btn" data-act="edit" data-kind="${kind}" data-id="${r.id}">編輯</button>
          <button type="button" class="secondary-btn" data-act="up" data-kind="${kind}" data-index="${index}" ${index === 0 ? "disabled" : ""}>上移</button>
          <button type="button" class="secondary-btn" data-act="down" data-kind="${kind}" data-index="${index}" ${index >= rules.length - 1 ? "disabled" : ""}>下移</button>
          <button type="button" class="secondary-btn" data-act="del" data-kind="${kind}" data-id="${r.id}">刪除</button>
        </div>
      </div>`;
    })
    .join("");
}

function clearWelcomeRuleForm() {
  document.getElementById("welcomeRuleId").value = "";
  document.getElementById("welcomeRuleEnabled").checked = true;
  document.getElementById("welcomeRuleLabel").value = "";
  document.getElementById("welcomeRuleMatch").value = "";
  document.getElementById("welcomeRuleTitle").value = "";
  document.getElementById("welcomeRuleBody").value = "";
  document.getElementById("welcomeRuleCountdown").value = "8";
  document.getElementById("welcomeRuleEvery").checked = false;
}

function clearEndRuleForm() {
  document.getElementById("endRuleId").value = "";
  document.getElementById("endRuleEnabled").checked = true;
  document.getElementById("endRuleLabel").value = "";
  document.getElementById("endRuleMatch").value = "";
  document.getElementById("endRuleTitle").value = "";
  document.getElementById("endRuleBody").value = "";
  document.getElementById("endRuleFormUrl").value = "";
  document.getElementById("endRuleFormLabel").value = "填寫回饋";
  document.getElementById("endRuleCountdown").value = "12";
  document.getElementById("endRuleEvery").checked = false;
}

function loadWelcomeRuleToForm(rule) {
  document.getElementById("welcomeRuleId").value = rule.id;
  document.getElementById("welcomeRuleEnabled").checked = rule.enabled;
  document.getElementById("welcomeRuleLabel").value = rule.label || "";
  document.getElementById("welcomeRuleMatch").value = rule.urlMatch || "";
  document.getElementById("welcomeRuleTitle").value = rule.title || "";
  document.getElementById("welcomeRuleBody").value = rule.body || "";
  document.getElementById("welcomeRuleCountdown").value = String(rule.countdownSec || 8);
  document.getElementById("welcomeRuleEvery").checked = Boolean(rule.showEveryVisit);
}

function loadEndRuleToForm(rule) {
  document.getElementById("endRuleId").value = rule.id;
  document.getElementById("endRuleEnabled").checked = rule.enabled;
  document.getElementById("endRuleLabel").value = rule.label || "";
  document.getElementById("endRuleMatch").value = rule.urlMatch || "";
  document.getElementById("endRuleTitle").value = rule.title || "";
  document.getElementById("endRuleBody").value = rule.body || "";
  document.getElementById("endRuleFormUrl").value = rule.formUrl || "";
  document.getElementById("endRuleFormLabel").value = rule.formButtonLabel || "填寫回饋";
  document.getElementById("endRuleCountdown").value = String(rule.countdownSec || 12);
  document.getElementById("endRuleEvery").checked = Boolean(rule.showEveryVisit);
}

function upsertWelcomeRuleFromForm() {
  const id = document.getElementById("welcomeRuleId")?.value || "";
  const existing = welcome.rules.find((r) => r.id === id);
  const draft = {
    id: id || undefined,
    enabled: Boolean(document.getElementById("welcomeRuleEnabled")?.checked),
    label: document.getElementById("welcomeRuleLabel")?.value || "",
    urlMatch: document.getElementById("welcomeRuleMatch")?.value || "",
    title: document.getElementById("welcomeRuleTitle")?.value || "",
    body: document.getElementById("welcomeRuleBody")?.value || "",
    countdownSec: Number(document.getElementById("welcomeRuleCountdown")?.value) || 8,
    showEveryVisit: Boolean(document.getElementById("welcomeRuleEvery")?.checked),
    version: existing?.version || 1
  };
  const normalized = NavArrowSettings.normalizeUrlNoticeRule(draft, { withForm: false });
  if (!normalized) {
    setStatus("請填寫網址關鍵字");
    return;
  }
  const contentChanged =
    !existing ||
    existing.title !== normalized.title ||
    existing.body !== normalized.body ||
    existing.urlMatch !== normalized.urlMatch ||
    existing.countdownSec !== normalized.countdownSec ||
    existing.enabled !== normalized.enabled ||
    existing.showEveryVisit !== normalized.showEveryVisit ||
    existing.label !== normalized.label;
  if (existing && contentChanged) {
    normalized.version = existing.version + 1;
  }
  const nextRules = existing
    ? welcome.rules.map((r) => (r.id === existing.id ? normalized : r))
    : [...welcome.rules, normalized];
  welcome = NavArrowSettings.normalizeWelcomeNotice({ ...welcome, rules: nextRules });
  renderRulesList("welcomeRulesList", welcome.rules, "welcome");
  clearWelcomeRuleForm();
  setStatus(`已更新首次規則「${normalized.label}」（尚未寫入伺服器）`);
}

function upsertEndRuleFromForm() {
  const id = document.getElementById("endRuleId")?.value || "";
  const existing = endFeedback.rules.find((r) => r.id === id);
  const draft = {
    id: id || undefined,
    enabled: Boolean(document.getElementById("endRuleEnabled")?.checked),
    label: document.getElementById("endRuleLabel")?.value || "",
    urlMatch: document.getElementById("endRuleMatch")?.value || "",
    title: document.getElementById("endRuleTitle")?.value || "",
    body: document.getElementById("endRuleBody")?.value || "",
    formUrl: document.getElementById("endRuleFormUrl")?.value || "",
    formButtonLabel: document.getElementById("endRuleFormLabel")?.value || "填寫回饋",
    countdownSec: Number(document.getElementById("endRuleCountdown")?.value) || 12,
    showEveryVisit: Boolean(document.getElementById("endRuleEvery")?.checked),
    version: existing?.version || 1
  };
  const normalized = NavArrowSettings.normalizeUrlNoticeRule(draft, { withForm: true });
  if (!normalized) {
    setStatus("請填寫網址關鍵字");
    return;
  }
  const contentChanged =
    !existing ||
    existing.title !== normalized.title ||
    existing.body !== normalized.body ||
    existing.urlMatch !== normalized.urlMatch ||
    existing.formUrl !== normalized.formUrl ||
    existing.formButtonLabel !== normalized.formButtonLabel ||
    existing.countdownSec !== normalized.countdownSec ||
    existing.enabled !== normalized.enabled ||
    existing.showEveryVisit !== normalized.showEveryVisit ||
    existing.label !== normalized.label;
  if (existing && contentChanged) {
    normalized.version = existing.version + 1;
  }
  const nextRules = existing
    ? endFeedback.rules.map((r) => (r.id === existing.id ? normalized : r))
    : [...endFeedback.rules, normalized];
  endFeedback = NavArrowSettings.normalizeEndFeedback({
    defaultNotice: endFeedback.defaultNotice,
    rules: nextRules
  });
  renderRulesList("endRulesList", endFeedback.rules, "end");
  clearEndRuleForm();
  setStatus(`已更新結束規則「${normalized.label}」（尚未寫入伺服器）`);
}

function moveRule(kind, index, delta) {
  const list = kind === "welcome" ? [...welcome.rules] : [...endFeedback.rules];
  const next = index + delta;
  if (next < 0 || next >= list.length) {
    return;
  }
  const tmp = list[index];
  list[index] = list[next];
  list[next] = tmp;
  if (kind === "welcome") {
    welcome = NavArrowSettings.normalizeWelcomeNotice({ ...welcome, rules: list });
    renderRulesList("welcomeRulesList", welcome.rules, "welcome");
  } else {
    endFeedback = NavArrowSettings.normalizeEndFeedback({
      defaultNotice: endFeedback.defaultNotice,
      rules: list
    });
    renderRulesList("endRulesList", endFeedback.rules, "end");
  }
  setStatus("已調整規則順序（尚未寫入伺服器）");
}

function deleteRule(kind, id) {
  if (!confirm("確定刪除此規則？")) {
    return;
  }
  if (kind === "welcome") {
    welcome = NavArrowSettings.normalizeWelcomeNotice({
      ...welcome,
      rules: welcome.rules.filter((r) => r.id !== id)
    });
    renderRulesList("welcomeRulesList", welcome.rules, "welcome");
  } else {
    endFeedback = NavArrowSettings.normalizeEndFeedback({
      defaultNotice: endFeedback.defaultNotice,
      rules: endFeedback.rules.filter((r) => r.id !== id)
    });
    renderRulesList("endRulesList", endFeedback.rules, "end");
  }
  setStatus("已刪除規則（尚未寫入伺服器）");
}

async function saveWelcomeDefault() {
  if (!isFullAdmin()) {
    return;
  }
  const draft = readWelcomeDefaultFromForm();
  const next = {
    ...draft,
    version: welcomeDefaultChanged(draft) ? welcome.version + 1 : welcome.version,
    rules: welcome.rules
  };
  try {
    setStatus("儲存首次預設中…");
    const saved = await NavArrowSettings.saveAndPersist({
      ...NavArrowSettings.load(),
      welcomeNotice: next
    });
    welcome = NavArrowSettings.normalizeWelcomeNotice(saved.welcomeNotice);
    fillWelcomeDefault();
    renderRulesList("welcomeRulesList", welcome.rules, "welcome");
    setStatus(`已儲存首次預設（版本 ${welcome.version}）`);
  } catch (error) {
    console.warn(error);
    setStatus("儲存失敗，請確認已登入且伺服器可用");
  }
}

async function saveEndDefault() {
  if (!isFullAdmin()) {
    return;
  }
  const draft = readEndDefaultFromForm();
  const next = NavArrowSettings.normalizeEndFeedback({
    defaultNotice: {
      ...draft.defaultNotice,
      version: endDefaultChanged(draft)
        ? endFeedback.defaultNotice.version + 1
        : draft.defaultNotice.version
    },
    rules: endFeedback.rules
  });
  try {
    setStatus("儲存結束預設中…");
    const saved = await NavArrowSettings.saveAndPersist({
      ...NavArrowSettings.load(),
      endFeedback: next
    });
    endFeedback = NavArrowSettings.normalizeEndFeedback(saved.endFeedback);
    fillEndDefault();
    renderRulesList("endRulesList", endFeedback.rules, "end");
    setStatus(`已儲存結束預設（版本 ${endFeedback.defaultNotice.version}）`);
  } catch (error) {
    console.warn(error);
    setStatus("儲存失敗，請確認已登入且伺服器可用");
  }
}

async function saveAllRules() {
  try {
    setStatus("儲存規則中…");
    if (sessionRole === "qr_notice") {
      const res = await adminFetch(NavArrowSettings.API_PATH, {
        method: "POST",
        body: JSON.stringify({
          welcomeNotice: { rules: welcome.rules },
          endFeedback: { rules: endFeedback.rules }
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      await NavArrowSettings.init(true);
    } else {
      await NavArrowSettings.saveAndPersist({
        ...NavArrowSettings.load(),
        welcomeNotice: { ...welcome, rules: welcome.rules },
        endFeedback: {
          defaultNotice: endFeedback.defaultNotice,
          rules: endFeedback.rules
        }
      });
    }
    const settings = NavArrowSettings.load();
    welcome = NavArrowSettings.normalizeWelcomeNotice(settings.welcomeNotice);
    endFeedback = NavArrowSettings.normalizeEndFeedback(settings.endFeedback);
    fillWelcomeDefault();
    fillEndDefault();
    renderRulesList("welcomeRulesList", welcome.rules, "welcome");
    renderRulesList("endRulesList", endFeedback.rules, "end");
    setStatus(`已儲存規則（首次 ${welcome.rules.length} 筆；結束 ${endFeedback.rules.length} 筆）`);
  } catch (error) {
    console.warn(error);
    setStatus("儲存失敗，請確認已登入且伺服器可用");
  }
}

function bindUi() {
  document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } catch {
      /* 仍導向登入頁 */
    }
    location.replace("/admin/login.html");
  });

  document.getElementById("noticeSaveBtn")?.addEventListener("click", () => {
    saveWelcomeDefault().catch(() => {});
  });
  document.getElementById("noticePreviewBtn")?.addEventListener("click", () => {
    openPreview(readWelcomeDefaultFromForm(), { showForm: false });
  });
  document.getElementById("endSaveBtn")?.addEventListener("click", () => {
    saveEndDefault().catch(() => {});
  });
  document.getElementById("endPreviewBtn")?.addEventListener("click", () => {
    openPreview(readEndDefaultFromForm().defaultNotice, { showForm: true });
  });
  noticePreviewCloseBtn?.addEventListener("click", closePreview);
  noticePreviewModal?.addEventListener("click", (event) => {
    if (event.target === noticePreviewModal) {
      closePreview();
    }
  });

  document.getElementById("welcomeRuleSaveBtn")?.addEventListener("click", upsertWelcomeRuleFromForm);
  document.getElementById("welcomeRuleClearBtn")?.addEventListener("click", clearWelcomeRuleForm);
  document.getElementById("endRuleSaveBtn")?.addEventListener("click", upsertEndRuleFromForm);
  document.getElementById("endRuleClearBtn")?.addEventListener("click", clearEndRuleForm);
  document.getElementById("rulesSaveAllBtn")?.addEventListener("click", () => {
    saveAllRules().catch(() => {});
  });

  document.getElementById("welcomeRulesList")?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-act]");
    if (!btn) {
      return;
    }
    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    const index = Number(btn.getAttribute("data-index"));
    if (act === "edit") {
      const rule = welcome.rules.find((r) => r.id === id);
      if (rule) {
        loadWelcomeRuleToForm(rule);
      }
    } else if (act === "del") {
      deleteRule("welcome", id);
    } else if (act === "up") {
      moveRule("welcome", index, -1);
    } else if (act === "down") {
      moveRule("welcome", index, 1);
    }
  });

  document.getElementById("endRulesList")?.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-act]");
    if (!btn) {
      return;
    }
    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    const index = Number(btn.getAttribute("data-index"));
    if (act === "edit") {
      const rule = endFeedback.rules.find((r) => r.id === id);
      if (rule) {
        loadEndRuleToForm(rule);
      }
    } else if (act === "del") {
      deleteRule("end", id);
    } else if (act === "up") {
      moveRule("end", index, -1);
    } else if (act === "down") {
      moveRule("end", index, 1);
    }
  });
}

async function init() {
  await requireSession();
  await NavArrowSettings.init();
  const settings = NavArrowSettings.load();
  welcome = NavArrowSettings.normalizeWelcomeNotice(settings.welcomeNotice);
  endFeedback = NavArrowSettings.normalizeEndFeedback(settings.endFeedback);
  fillWelcomeDefault();
  fillEndDefault();
  renderRulesList("welcomeRulesList", welcome.rules, "welcome");
  renderRulesList("endRulesList", endFeedback.rules, "end");
  clearWelcomeRuleForm();
  clearEndRuleForm();
  bindUi();
  setStatus("已載入");
}

init().catch((error) => {
  if (error?.message !== "unauthorized") {
    console.warn(error);
    setStatus("載入失敗");
  }
});
