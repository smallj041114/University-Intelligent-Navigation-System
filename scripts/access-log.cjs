/**
 * 存取／管理操作日誌（繁中可讀）
 * 供 scripts/dev-server.cjs 使用；之後加 API 主要改 describeAction。
 *
 * 環境變數：
 *   MCU_ACCESS_LOG=0              關閉
 *   MCU_ACCESS_LOG_VERBOSE=1      多記公開讀取 API
 *   MCU_ACCESS_LOG_FILE=路徑      同時 append 到檔案（預設 logs/access.log）
 */

const fs = require("fs");
const path = require("path");

function envFlag(name, defaultOn) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return defaultOn;
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") {
    return false;
  }
  if (v === "1" || v === "true" || v === "on" || v === "yes") {
    return true;
  }
  return defaultOn;
}

function isAccessLogEnabled() {
  return envFlag("MCU_ACCESS_LOG", true);
}

function isAccessLogVerbose() {
  return envFlag("MCU_ACCESS_LOG_VERBOSE", false);
}

function resolveLogFilePath(projectRoot) {
  const raw = process.env.MCU_ACCESS_LOG_FILE;
  if (raw === "0" || raw === "false" || raw === "off") {
    return null;
  }
  if (raw != null && String(raw).trim() !== "") {
    const p = String(raw).trim();
    return path.isAbsolute(p) ? p : path.join(projectRoot, p);
  }
  // 預設寫入檔案，方便不在場時事後查「誰改了什麼」
  return path.join(projectRoot, "logs", "access.log");
}

function stripIpv6Mapped(ip) {
  if (!ip || typeof ip !== "string") {
    return "unknown";
  }
  let out = ip.trim();
  if (out.startsWith("::ffff:")) {
    out = out.slice(7);
  }
  // 本機 IPv6 loopback 與 IPv4 對齊，避免 log 出現 ::1
  if (out === "::1" || out === "0:0:0:0:0:0:0:1") {
    return "127.0.0.1";
  }
  return out || "unknown";
}

function clientIp(req) {
  const xff = req.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return stripIpv6Mapped(xff.split(",")[0].trim());
  }
  if (Array.isArray(xff) && xff[0]) {
    return stripIpv6Mapped(String(xff[0]).split(",")[0].trim());
  }
  const realIp = req.headers?.["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return stripIpv6Mapped(realIp.trim());
  }
  return stripIpv6Mapped(req.socket?.remoteAddress || "unknown");
}

function formatTaiwanTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * @returns {string|null} 繁中操作說明；null = 略過不記
 */
function describeAction(method, pathname, options = {}) {
  const verbose = Boolean(options.verbose);
  const m = String(method || "GET").toUpperCase();
  let p = String(pathname || "");
  if (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }

  // 靜態雜訊
  if (/\.(png|jpe?g|webp|gif|svg|ico|css|js|map|woff2?|ttf|mp4|webm)$/i.test(p)) {
    return null;
  }
  if (p.startsWith("/images/") || p.startsWith("/vendor/") || p.startsWith("/assets/")) {
    return null;
  }
  if (p.startsWith("/data/nodes/") && m === "GET") {
    return null;
  }

  if (m === "POST" && p === "/api/admin/login") {
    return "管理員登入";
  }
  if (m === "POST" && p === "/api/admin/logout") {
    return "管理員登出";
  }
  if (m === "GET" && p === "/api/admin/session") {
    return "檢查登入狀態";
  }

  const nodeSave = p.match(/^\/api\/node-scopes\/([a-z0-9_]+)$/i);
  if (nodeSave && m === "POST") {
    return `儲存節點（${nodeSave[1]}）`;
  }
  if (nodeSave && m === "DELETE") {
    return `刪除節點檔（${nodeSave[1]}）`;
  }

  if (m === "POST" && p === "/api/buildings") {
    return "儲存大樓設定";
  }
  if (m === "POST" && p === "/api/nav-settings") {
    return "儲存導航設定";
  }

  if (m === "GET" && p === "/api/validate") {
    return "檢查資料完整性";
  }
  if (m === "GET" && p === "/api/panorama-images") {
    return "瀏覽全景圖資料夾";
  }

  if (m === "GET" && (p === "/visitor.html" || p === "/visitor")) {
    return "開啟訪客頁";
  }
  if (m === "GET" && (p === "/navigation.html" || p === "/navigation")) {
    return "開啟導覽頁";
  }
  if (m === "GET" && (p === "/admin/login.html" || p === "/admin/login")) {
    return "開啟管理登入頁";
  }
  if (m === "GET" && (p === "/admin" || p === "/admin/index.html" || p === "/admin/")) {
    return "開啟管理後台";
  }
  if (m === "GET" && p === "/settings.html") {
    return "開啟設定頁";
  }
  if (m === "GET" && (p === "/" || p === "/index.html")) {
    return "開啟首頁";
  }

  // 訪客進出由 handler 專寫，避免重複成「其他請求」
  if (p === "/api/access-event") {
    return null;
  }

  // 公開讀取 API：預設略過（訪客開頁／算路會狂打）；VERBOSE=1 才記
  if (m === "GET" && p.startsWith("/api/")) {
    if (!verbose) {
      return null;
    }
    if (p === "/api/node-scopes/_health") {
      return "讀取健康檢查";
    }
    if (p === "/api/buildings") {
      return "讀取大樓設定";
    }
    if (p === "/api/nav-settings") {
      return "讀取導航設定";
    }
    if (p === "/api/maps-config") {
      return "讀取地圖設定";
    }
    return `讀取資料（${p.replace(/^\/api\//, "")}）`;
  }

  // 寫入／未列到的 mutating API 才用「其他請求」，避免漏記
  if (p.startsWith("/api/") && m !== "GET" && m !== "HEAD" && m !== "OPTIONS") {
    return `其他請求 ${m} ${p}`;
  }
  return null;
}

function formatAccessLine({ time, ip, role, action, status }) {
  const t = time || formatTaiwanTime();
  const st = status == null || status === "" ? "-" : String(status);
  return `[${t}] ${ip}  ${role}  ${action}  → ${st}`;
}

const ACCESS_LOG_ROTATE_BYTES = Math.max(
  1 * 1024 * 1024,
  Number(process.env.MCU_ACCESS_LOG_MAX_BYTES) || 8 * 1024 * 1024
);

function maybeRotateLogFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return;
    }
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size < ACCESS_LOG_ROTATE_BYTES) {
      return;
    }
    const stamp = formatTaiwanTime().replace(/[:\s]/g, "-");
    const rotated = `${filePath}.${stamp}.old`;
    fs.renameSync(filePath, rotated);
  } catch (err) {
    console.error(`[access-log] 輪替失敗:`, err.message || err);
  }
}

function appendLogFile(filePath, line) {
  if (!filePath) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    maybeRotateLogFile(filePath);
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  } catch (err) {
    console.error(`[access-log] 無法寫入 ${filePath}:`, err.message || err);
  }
}

/** 立刻寫一行（訪客進出、登入細項等） */
function writeAccessLine(projectRoot, { ip, role, action, status = 200 }) {
  if (!isAccessLogEnabled()) {
    return;
  }
  const line = formatAccessLine({
    time: formatTaiwanTime(),
    ip: ip || "unknown",
    role: role || "訪客",
    action,
    status
  });
  console.log(line);
  appendLogFile(resolveLogFilePath(projectRoot), line);
}

/** 離開事件短暫延遲：同頁重整會先 leave 再 enter，用來取消誤報的離開 */
const PRESENCE_LEAVE_DEBOUNCE_MS = 1200;
/** @type {Map<string, { timer: ReturnType<typeof setTimeout>, role: string, projectRoot: string }>} */
const pendingPresenceLeaves = new Map();

function presenceKey(ip, page) {
  return `${ip}|${page}`;
}

function pageLabelOf(page) {
  return page === "navigation" ? "導覽頁" : "訪客頁";
}

/**
 * 寫入訪客進出。
 * - 同頁重整：leave→enter 互相抵銷，不寫 log
 * - 站內換頁（導覽→訪客）：進入新頁時取消「上一頁離開」，只記進入，避免剛進站就像登出
 * - 真的關分頁：約 1.2 秒後才寫離開
 */
function recordPresenceEvent(projectRoot, { ip, role, event, page }) {
  if (!isAccessLogEnabled()) {
    return;
  }
  const normalizedIp = stripIpv6Mapped(ip);
  const key = presenceKey(normalizedIp, page);
  const pageLabel = pageLabelOf(page);

  if (event === "leave") {
    const existing = pendingPresenceLeaves.get(key);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }
    const timer = setTimeout(() => {
      pendingPresenceLeaves.delete(key);
      writeAccessLine(projectRoot, {
        ip: normalizedIp,
        role,
        action: `訪客離開（${pageLabel}）`,
        status: 200
      });
    }, PRESENCE_LEAVE_DEBOUNCE_MS);
    pendingPresenceLeaves.set(key, { timer, role, projectRoot });
    return;
  }

  if (event === "enter") {
    let cancelledSamePageLeave = false;
    const prefix = `${normalizedIp}|`;
    for (const [pendingKey, pending] of [...pendingPresenceLeaves.entries()]) {
      if (!pendingKey.startsWith(prefix)) {
        continue;
      }
      if (pending?.timer) {
        clearTimeout(pending.timer);
      }
      pendingPresenceLeaves.delete(pendingKey);
      if (pendingKey === key) {
        cancelledSamePageLeave = true;
      }
    }
    // 同頁重整：略過再次進入
    if (cancelledSamePageLeave) {
      return;
    }
    writeAccessLine(projectRoot, {
      ip: normalizedIp,
      role,
      action: `訪客進入（${pageLabel}）`,
      status: 200
    });
  }
}

/**
 * 在 createServer 回呼開頭呼叫；回應結束時自動印一行。
 * @param {{ isAdmin: (req) => boolean, projectRoot: string }} deps
 */
function attachAccessLog(req, res, deps) {
  if (!isAccessLogEnabled()) {
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
  } catch {
    pathname = String(req.url || "/").split("?")[0] || "/";
  }

  const action = describeAction(req.method, pathname, { verbose: isAccessLogVerbose() });
  if (!action) {
    return;
  }

  const ip = clientIp(req);
  const role =
    typeof deps.roleLabel === "function"
      ? deps.roleLabel(req)
      : deps.isAdmin(req)
        ? "管理員"
        : "訪客";
  const logFile = resolveLogFilePath(deps.projectRoot);
  let written = false;

  const finish = () => {
    if (written) {
      return;
    }
    written = true;
    const status = res.statusCode || 0;
    let actionLabel = action;
    if (
      String(req.method || "").toUpperCase() === "POST" &&
      pathname === "/api/admin/login" &&
      status !== 200
    ) {
      actionLabel = "管理員登入失敗";
    }
    const line = formatAccessLine({
      time: formatTaiwanTime(),
      ip,
      role,
      action: actionLabel,
      status
    });
    console.log(line);
    appendLogFile(logFile, line);
  };

  res.on("finish", finish);
  res.on("close", finish);
}

module.exports = {
  clientIp,
  describeAction,
  formatAccessLine,
  formatTaiwanTime,
  attachAccessLog,
  writeAccessLine,
  recordPresenceEvent,
  isAccessLogEnabled,
  resolveLogFilePath
};
