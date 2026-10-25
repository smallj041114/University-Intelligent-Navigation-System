import { adminFetch } from "../lib/admin-fetch.js";

const auditTableBody = document.getElementById("auditTableBody");
const auditStatus = document.getElementById("auditStatus");
const auditRefreshBtn = document.getElementById("auditRefreshBtn");
const auditUsername = document.getElementById("auditUsername");
const auditRole = document.getElementById("auditRole");
const auditQuery = document.getElementById("auditQuery");
const auditStatusFilter = document.getElementById("auditStatusFilter");
const auditLimit = document.getElementById("auditLimit");
const auditAutoRefresh = document.getElementById("auditAutoRefresh");

const presenceOnline = document.getElementById("presenceOnline");
const presenceVisitor = document.getElementById("presenceVisitor");
const presenceNavigation = document.getElementById("presenceNavigation");
const presenceToday = document.getElementById("presenceToday");
const presenceStatus = document.getElementById("presenceStatus");
const presenceTableBody = document.getElementById("presenceTableBody");
const visitorDailyTableBody = document.getElementById("visitorDailyTableBody");
const visitorDailyStatus = document.getElementById("visitorDailyStatus");
const visitorDailyPager = document.getElementById("visitorDailyPager");
const visitorDailyPrevBtn = document.getElementById("visitorDailyPrevBtn");
const visitorDailyNextBtn = document.getElementById("visitorDailyNextBtn");
const visitorDailyPageLabel = document.getElementById("visitorDailyPageLabel");

const VISITOR_DAILY_PAGE_SIZE = 5;

let auditTimer = null;
let presenceTimer = null;
/** @type {{ date: string, count: number }[]} */
let visitorDailyRows = [];
let visitorDailyPage = 0;
let visitorDailyMeta = { todayKey: "", total: 0, dayCount: 0 };

function roleLabel(role) {
  if (role === "admin") {
    return "管理員";
  }
  if (role === "qr") {
    return "二級（QR／據點）";
  }
  if (role === "qr_notice") {
    return "二級（QR／公告）";
  }
  return role || "—";
}

function pageLabel(page) {
  return page === "navigation" ? "導覽頁" : "訪客頁";
}

function statusLabel(status) {
  const code = Number(status) || 0;
  if (code >= 200 && code < 300) {
    return `成功（${code}）`;
  }
  if (code === 0) {
    return "—";
  }
  return `失敗（${code}）`;
}

function setStatus(text) {
  if (auditStatus) {
    auditStatus.textContent = text || "";
  }
}

function setPresenceStatus(text) {
  if (presenceStatus) {
    presenceStatus.textContent = text || "";
  }
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSeen(ts) {
  const n = Number(ts) || 0;
  if (!n) {
    return "—";
  }
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date(n));
  } catch {
    return new Date(n).toLocaleTimeString();
  }
}

function renderAuditRows(entries) {
  if (!auditTableBody) {
    return;
  }
  if (!entries.length) {
    auditTableBody.innerHTML = `<tr><td colspan="7">尚無紀錄</td></tr>`;
    return;
  }
  auditTableBody.innerHTML = entries
    .map((row) => {
      const ok = Number(row.status) >= 200 && Number(row.status) < 300;
      return `<tr class="${ok ? "" : "admin-audit-row-fail"}">
        <td>${escapeCell(row.time)}</td>
        <td>${escapeCell(row.username || "—")}</td>
        <td>${escapeCell(roleLabel(row.role))}</td>
        <td>${escapeCell(row.action)}</td>
        <td>${escapeCell(row.detail || "—")}</td>
        <td>${escapeCell(row.ip)}</td>
        <td>${escapeCell(statusLabel(row.status))}</td>
      </tr>`;
    })
    .join("");
}

function renderPresence(data) {
  if (presenceOnline) {
    presenceOnline.textContent = String(data.onlineCount ?? 0);
  }
  if (presenceVisitor) {
    presenceVisitor.textContent = String(data.byPage?.visitor ?? 0);
  }
  if (presenceNavigation) {
    presenceNavigation.textContent = String(data.byPage?.navigation ?? 0);
  }
  if (presenceToday) {
    presenceToday.textContent = String(data.todayEnters ?? 0);
  }
  const list = Array.isArray(data.online) ? data.online : [];
  if (!presenceTableBody) {
    return;
  }
  if (!list.length) {
    presenceTableBody.innerHTML = `<tr><td colspan="3">目前沒有線上訪客</td></tr>`;
    return;
  }
  presenceTableBody.innerHTML = list
    .map(
      (row) => `<tr>
        <td>${escapeCell(pageLabel(row.page))}</td>
        <td>${escapeCell(row.ip)}</td>
        <td>${escapeCell(formatSeen(row.lastSeenAt))}</td>
      </tr>`
    )
    .join("");
}

async function requireFullAdmin() {
  const res = await adminFetch("/api/admin/session", { cache: "no-store" });
  if (!res.ok) {
    location.replace("/admin/login.html?next=" + encodeURIComponent("/admin/audit.html"));
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (data.role !== "admin") {
    location.replace(
      data.role === "qr_notice"
        ? "/admin/notices.html"
        : data.role === "qr"
          ? "/admin/links.html"
          : "/admin/login.html"
    );
    throw new Error("unauthorized");
  }
}

function buildAuditQuery() {
  const params = new URLSearchParams();
  params.set("limit", auditLimit?.value || "200");
  const username = auditUsername?.value?.trim() || "";
  const role = auditRole?.value || "";
  const q = auditQuery?.value?.trim() || "";
  const status = auditStatusFilter?.value || "";
  if (username) {
    params.set("username", username);
  }
  if (role) {
    params.set("role", role);
  }
  if (q) {
    params.set("q", q);
  }
  if (status) {
    params.set("status", status);
  }
  return params.toString();
}

async function loadAudit() {
  setStatus("載入中…");
  try {
    const res = await adminFetch(`/api/admin/audit?${buildAuditQuery()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.message || "無法載入修改紀錄");
      if (auditTableBody) {
        auditTableBody.innerHTML = `<tr><td colspan="7">載入失敗</td></tr>`;
      }
      return;
    }
    const entries = Array.isArray(data.entries) ? data.entries : [];
    renderAuditRows(entries);
    const matched = Number(data.totalMatched);
    setStatus(
      Number.isFinite(matched) && matched !== entries.length
        ? `顯示 ${entries.length}／符合 ${matched} 筆`
        : `顯示 ${entries.length} 筆`
    );
  } catch {
    setStatus("無法連線伺服器");
    if (auditTableBody) {
      auditTableBody.innerHTML = `<tr><td colspan="7">載入失敗</td></tr>`;
    }
  }
}

function setVisitorDailyStatus(text) {
  if (visitorDailyStatus) {
    visitorDailyStatus.textContent = text || "";
  }
}

function visitorDailyPageCount() {
  return Math.max(1, Math.ceil(visitorDailyRows.length / VISITOR_DAILY_PAGE_SIZE));
}

function paintVisitorDailyPage() {
  if (!visitorDailyTableBody) {
    return;
  }
  if (!visitorDailyRows.length) {
    visitorDailyTableBody.innerHTML = `<tr><td colspan="2">尚無資料</td></tr>`;
    if (visitorDailyPager) {
      visitorDailyPager.hidden = true;
    }
    return;
  }
  const pageCount = visitorDailyPageCount();
  visitorDailyPage = Math.min(Math.max(0, visitorDailyPage), pageCount - 1);
  const start = visitorDailyPage * VISITOR_DAILY_PAGE_SIZE;
  const pageRows = visitorDailyRows.slice(start, start + VISITOR_DAILY_PAGE_SIZE);
  visitorDailyTableBody.innerHTML = pageRows
    .map(
      (row) => `<tr>
        <td>${escapeCell(row.date)}</td>
        <td>${escapeCell(row.count)}</td>
      </tr>`
    )
    .join("");
  if (visitorDailyPager) {
    visitorDailyPager.hidden = visitorDailyRows.length <= VISITOR_DAILY_PAGE_SIZE;
  }
  if (visitorDailyPageLabel) {
    visitorDailyPageLabel.textContent = `第 ${visitorDailyPage + 1}／${pageCount} 頁`;
  }
  if (visitorDailyPrevBtn) {
    visitorDailyPrevBtn.disabled = visitorDailyPage <= 0;
  }
  if (visitorDailyNextBtn) {
    visitorDailyNextBtn.disabled = visitorDailyPage >= pageCount - 1;
  }
  setVisitorDailyStatus(
    visitorDailyMeta.todayKey
      ? `台灣日 ${visitorDailyMeta.todayKey}；近 ${visitorDailyMeta.dayCount} 日合計 ${visitorDailyMeta.total}`
      : `近 ${visitorDailyMeta.dayCount} 日合計 ${visitorDailyMeta.total}`
  );
}

function renderVisitorDaily(data) {
  const days = Array.isArray(data.days) ? data.days : [];
  visitorDailyRows = [...days].reverse();
  visitorDailyMeta = {
    todayKey: data.todayKey || "",
    dayCount: days.length,
    total: days.reduce((sum, row) => sum + (Number(row.count) || 0), 0)
  };
  visitorDailyPage = 0;
  paintVisitorDailyPage();
}

async function loadPresence() {
  try {
    const res = await adminFetch("/api/admin/presence", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPresenceStatus(data.message || "無法載入訪客監控");
      return;
    }
    renderPresence(data);
    setPresenceStatus(
      data.todayKey ? `今日（台灣 ${data.todayKey}）；約 ${Math.round((data.ttlMs || 90000) / 1000)} 秒無心跳視為離線` : ""
    );
  } catch {
    setPresenceStatus("無法連線伺服器");
  }
}

async function loadVisitorDaily() {
  try {
    const res = await adminFetch("/api/admin/visitor-daily?days=30", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setVisitorDailyStatus(data.message || "無法載入每日訪客");
      if (visitorDailyTableBody) {
        visitorDailyTableBody.innerHTML = `<tr><td colspan="2">載入失敗</td></tr>`;
      }
      return;
    }
    renderVisitorDaily(data);
  } catch {
    setVisitorDailyStatus("無法連線伺服器");
    if (visitorDailyTableBody) {
      visitorDailyTableBody.innerHTML = `<tr><td colspan="2">載入失敗</td></tr>`;
    }
  }
}

function syncAuditAutoRefresh() {
  if (auditTimer) {
    clearInterval(auditTimer);
    auditTimer = null;
  }
  if (auditAutoRefresh?.checked) {
    auditTimer = setInterval(() => {
      void loadAudit();
      void loadPresence();
      void loadVisitorDaily();
    }, 30000);
  }
}

async function main() {
  await requireFullAdmin();
  visitorDailyPrevBtn?.addEventListener("click", () => {
    if (visitorDailyPage <= 0) {
      return;
    }
    visitorDailyPage -= 1;
    paintVisitorDailyPage();
  });
  visitorDailyNextBtn?.addEventListener("click", () => {
    if (visitorDailyPage >= visitorDailyPageCount() - 1) {
      return;
    }
    visitorDailyPage += 1;
    paintVisitorDailyPage();
  });
  auditRefreshBtn?.addEventListener("click", () => {
    void loadAudit();
    void loadPresence();
    void loadVisitorDaily();
  });
  ["change", "keydown"].forEach((evt) => {
    auditUsername?.addEventListener(evt, (e) => {
      if (evt === "keydown" && e.key !== "Enter") {
        return;
      }
      void loadAudit();
    });
    auditQuery?.addEventListener(evt, (e) => {
      if (evt === "keydown" && e.key !== "Enter") {
        return;
      }
      void loadAudit();
    });
  });
  auditRole?.addEventListener("change", () => void loadAudit());
  auditStatusFilter?.addEventListener("change", () => void loadAudit());
  auditLimit?.addEventListener("change", () => void loadAudit());
  auditAutoRefresh?.addEventListener("change", syncAuditAutoRefresh);

  await Promise.all([loadAudit(), loadPresence(), loadVisitorDaily()]);
  presenceTimer = setInterval(() => {
    void loadPresence();
    void loadVisitorDaily();
  }, 20000);
  syncAuditAutoRefresh();
}

main().catch((error) => {
  console.error(error);
  setStatus("載入失敗，請重新整理或重新登入");
});
