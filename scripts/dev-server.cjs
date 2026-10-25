/**
 * 本機開發伺服器：提供靜態檔案，並將節點寫入 data/nodes/*.json
 * 用法：
 *   node scripts/dev-server.cjs
 *   node scripts/dev-server.cjs --host   # 監聽 0.0.0.0，方便區網測試
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { attachAccessLog, clientIp, resolveLogFilePath, isAccessLogEnabled, recordPresenceEvent } = require("./access-log.cjs");
const { recordAudit, readAuditTail, DEFAULT_LIMIT: AUDIT_DEFAULT_LIMIT } = require("./audit-log.cjs");
const {
  applyPresenceEvent,
  getPresenceSnapshot,
  getVisitorDailySeries,
  setPresenceProjectRoot
} = require("./visitor-presence-store.cjs");

const ROOT = path.join(__dirname, "..");
setPresenceProjectRoot(ROOT);
const NODES_DIR = path.join(ROOT, "data", "nodes");
const NAV_SETTINGS_FILE = path.join(ROOT, "data", "nav-settings.json");
const BUILDINGS_FILE = path.join(ROOT, "data", "buildings.json");
const MAPS_LOCAL_CONFIG = path.join(ROOT, "config", "maps.local.json");
const MAPS_EXAMPLE_CONFIG = path.join(ROOT, "config", "maps.example.json");
const ADMIN_LOCAL_CONFIG = path.join(ROOT, "config", "admin.local.json");

function loadValidationCollectors() {
  const buildingsPath = require.resolve("./validate-buildings.cjs");
  const nodesPath = require.resolve("./validate-nodes.cjs");
  delete require.cache[buildingsPath];
  delete require.cache[nodesPath];
  return {
    collectBuildingsValidation: require("./validate-buildings.cjs").collectBuildingsValidation,
    collectNodesValidation: require("./validate-nodes.cjs").collectNodesValidation
  };
}
const PORT = Number(process.env.PORT || 8080);
const WANT_HOST =
  process.argv.includes("--host") ||
  process.env.MCU_DEV_HOST === "0.0.0.0" ||
  process.env.MCU_DEV_HOST === "1" ||
  process.env.MCU_DEV_HOST === "true";
const LISTEN_HOST = WANT_HOST ? "0.0.0.0" : "127.0.0.1";
const SCOPE_PATTERN = /^[a-z0-9_]+$/i;
const SESSION_COOKIE = "mcu_admin";
const CSRF_COOKIE = "mcu_csrf";
const CSRF_HEADER = "x-csrf-token";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 60 * 60 * 1000;
const LOGIN_MAX_BYTES = 2048;
const NODE_POST_MAX_BYTES = 8 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const DIST_DIR = path.join(ROOT, "dist");
const SERVE_DIST =
  process.env.MCU_SERVE_DIST === "1" ||
  process.env.MCU_SERVE_DIST === "true" ||
  process.env.NODE_ENV === "production" ||
  (fs.existsSync(DIST_DIR) && process.env.MCU_SERVE_DIST !== "0");
const ADMIN_COOKIE_SECURE =
  process.env.ADMIN_COOKIE_SECURE === "1" || process.env.ADMIN_COOKIE_SECURE === "true";
/** 維護模式：非 health 請求回維護頁／503（部署時設 MCU_MAINTENANCE=1） */
const MAINTENANCE_MODE =
  process.env.MCU_MAINTENANCE === "1" || process.env.MCU_MAINTENANCE === "true";
const MAINTENANCE_ETA = String(
  process.env.MCU_MAINTENANCE_ETA || "2026年10月12日 20:00（台灣時間）"
).trim();

const sessions = new Map();
const loginAttempts = new Map();
const presenceAttempts = new Map();
const PRESENCE_WINDOW_MS = 60 * 1000;
const PRESENCE_MAX_PER_WINDOW = 40;

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  };
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (String(key).toLowerCase() === "set-cookie") {
      continue;
    }
    headers[key] = value;
  }
  const cookies = extraHeaders["Set-Cookie"] || extraHeaders["set-cookie"];
  if (Array.isArray(cookies)) {
    res.setHeader("Set-Cookie", cookies);
  } else if (typeof cookies === "string") {
    res.setHeader("Set-Cookie", cookies);
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function resolveMaintenanceHtmlPath() {
  const distFile = path.join(DIST_DIR, "maintenance.html");
  if (fs.existsSync(distFile)) {
    return distFile;
  }
  const rootFile = path.join(ROOT, "maintenance.html");
  if (fs.existsSync(rootFile)) {
    return rootFile;
  }
  return null;
}

function serveMaintenancePage(res) {
  const filePath = resolveMaintenanceHtmlPath();
  let html =
    "<!doctype html><html lang=\"zh-Hant\"><head><meta charset=\"UTF-8\" /><title>網站維護中</title></head>" +
    `<body><h1>網站維護中</h1><p>預計 ${MAINTENANCE_ETA} 完成</p></body></html>`;
  if (filePath) {
    try {
      html = fs.readFileSync(filePath, "utf8");
    } catch {
      /* use fallback */
    }
  }
  html = html.replace(/\{\{ETA\}\}/g, MAINTENANCE_ETA);
  const body = Buffer.from(html, "utf8");
  res.writeHead(503, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Retry-After": "1800"
  });
  res.end(body);
}

function ensureNodesDir() {
  fs.mkdirSync(NODES_DIR, { recursive: true });
}

function scopeToFile(scope) {
  if (!SCOPE_PATTERN.test(scope)) {
    return null;
  }
  return path.join(NODES_DIR, `${scope}.json`);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };
  return map[ext] || "application/octet-stream";
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function loadNavSettings() {
  return readJsonFile(NAV_SETTINGS_FILE) || null;
}

function saveNavSettings(settings) {
  fs.writeFileSync(NAV_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function loadBuildings() {
  return readJsonFile(BUILDINGS_FILE) || null;
}

function saveBuildings(store) {
  fs.writeFileSync(BUILDINGS_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function loadMapsConfig() {
  const defaults = {
    apiKey: null,
    campus: {
      name: "銘傳大學桃園校區",
      gate: { name: "校門口", lat: 24.986297, lng: 121.343604 },
      arrivalRadiusMeters: 450,
      indoorEntryScopeKey: "mcu_nav_nodes_s_1",
      indoorEntryNodeName: "1020",
      gateMapXPercent: 87.57,
      gateMapYPercent: 14.2,
      gpsMaxAccuracyMeters: 80,
      satelliteCenter: { lat: 24.9848, lng: 121.3426 },
      satelliteBounds: {
        north: 24.9866,
        south: 24.9831,
        west: 121.3405,
        east: 121.3447
      },
      mapGpsAnchors: [
        {
          label: "校門口（自製圖右上／衛星東北入口）",
          lat: 24.986297,
          lng: 121.343604,
          xPercent: 87.57,
          yPercent: 14.2
        },
        {
          label: "S棟熱點（自製圖上方／資訊・金融一帶）",
          lat: 24.98515,
          lng: 121.34205,
          xPercent: 45,
          yPercent: 9
        },
        {
          label: "AA棟熱點（自製圖上方偏右／科技大樓一帶）",
          lat: 24.98525,
          lng: 121.34245,
          xPercent: 55,
          yPercent: 9
        },
        {
          label: "EE棟熱點（自製圖左側／綜合教學一帶）",
          lat: 24.98455,
          lng: 121.34095,
          xPercent: 13,
          yPercent: 55
        },
        {
          label: "P棟熱點（自製圖左下／觀光語文一帶）",
          lat: 24.98435,
          lng: 121.34135,
          xPercent: 21,
          yPercent: 55
        },
        {
          label: "應兆紀念圖書館 Q（環道內偏中）",
          lat: 24.98475,
          lng: 121.34255,
          xPercent: 58,
          yPercent: 38
        },
        {
          label: "體育館 R（田徑場西側）",
          lat: 24.98495,
          lng: 121.34325,
          xPercent: 72,
          yPercent: 40
        },
        {
          label: "田徑場中心",
          lat: 24.9854,
          lng: 121.3439,
          xPercent: 92,
          yPercent: 38
        },
        {
          label: "設計大樓 M／籃排球場西側",
          lat: 24.98354,
          lng: 121.34208,
          xPercent: 48,
          yPercent: 64
        },
        {
          label: "環道南側節點0061（近球場）",
          lat: 24.9839,
          lng: 121.34285,
          xPercent: 52.2,
          yPercent: 63.4
        },
        {
          label: "環道東南節點0081（近宿舍／田徑場南）",
          lat: 24.98415,
          lng: 121.34375,
          xPercent: 88.3,
          yPercent: 61.8
        },
        {
          label: "資訊網路大樓 CC",
          lat: 24.98435,
          lng: 121.3417,
          xPercent: 35,
          yPercent: 55
        }
      ]
    }
  };

  const fromLocal = readJsonFile(MAPS_LOCAL_CONFIG);
  const fromExample = readJsonFile(MAPS_EXAMPLE_CONFIG);
  const source = fromLocal || fromExample || {};
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || source.apiKey || null;
  const placeholderKeys = new Set([
    null,
    "",
    "YOUR_GOOGLE_MAPS_API_KEY",
    "在此貼上你的 Google Maps API 金鑰"
  ]);

  return {
    apiKey: placeholderKeys.has(apiKey) ? null : apiKey,
    campus: {
      ...defaults.campus,
      ...(source.campus || {})
    }
  };
}

const ALLOWED_ADMIN_ROLES = new Set(["admin", "qr", "qr_notice"]);

function normalizeAdminUsername(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function normalizeAdminRole(raw) {
  const role = String(raw || "")
    .trim()
    .toLowerCase();
  return ALLOWED_ADMIN_ROLES.has(role) ? role : null;
}

function pushAdminUser(list, entry) {
  if (!entry || typeof entry !== "object") {
    return;
  }
  const username = normalizeAdminUsername(entry.username);
  const role =
    normalizeAdminRole(entry.role) ||
    (username === "admin" ? "admin" : username === "qr" ? "qr" : null);
  if (!username || !role) {
    return;
  }
  let kind = null;
  let value = null;
  let source = entry.source || "local";
  if (entry.passwordHash) {
    kind = "hash";
    value = String(entry.passwordHash);
    source = entry.source || "local-hash";
  } else if (entry.password != null && entry.password !== "") {
    kind = "plaintext";
    value = String(entry.password);
    source = entry.source || "local-plaintext";
  } else if (entry.kind && entry.value != null) {
    kind = entry.kind;
    value = String(entry.value);
  }
  if (!kind || value == null || value === "") {
    return;
  }
  const existingIndex = list.findIndex((item) => item.username === username);
  const next = { username, role, kind, value, source };
  if (existingIndex >= 0) {
    list[existingIndex] = next;
  } else {
    list.push(next);
  }
}

/** @returns {Array<{ username: string, role: "admin"|"qr"|"qr_notice", kind: string, value: string, source: string }>} */
function loadAdminUsers() {
  const users = [];
  const local = readJsonFile(ADMIN_LOCAL_CONFIG);
  if (local && typeof local === "object") {
    if (Array.isArray(local.users)) {
      local.users.forEach((entry) => pushAdminUser(users, entry));
    }
    // 舊格式：頂層 passwordHash／password → 帳號 admin
    if (local.passwordHash || local.password) {
      pushAdminUser(users, {
        username: "admin",
        role: "admin",
        passwordHash: local.passwordHash,
        password: local.password,
        source: local.passwordHash ? "local-hash-legacy" : "local-plaintext-legacy"
      });
    }
  }
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) {
    pushAdminUser(users, {
      username: "admin",
      role: "admin",
      kind: "plaintext",
      value: String(fromEnv),
      source: "env"
    });
  }
  return users;
}

function hasAdminCredentials() {
  return loadAdminUsers().length > 0;
}

function timingSafeStringEqual(input, expected) {
  const a = Buffer.from(String(input ?? ""), "utf8");
  const b = Buffer.from(String(expected ?? ""), "utf8");
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a.length ? a : Buffer.from("x"), a.length ? a : Buffer.from("x"));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function verifyScryptPassword(plain, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt.length || !expected.length) {
    return false;
  }
  let derived;
  try {
    derived = crypto.scryptSync(String(plain ?? ""), salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

function verifyUserPassword(user, input) {
  if (!user) {
    return false;
  }
  if (user.kind === "hash") {
    return verifyScryptPassword(input, user.value);
  }
  return timingSafeStringEqual(input, user.value);
}

/**
 * @returns {{ ok: boolean, missing?: boolean, role?: "admin"|"qr"|"qr_notice", username?: string }}
 */
function verifyAdminLogin(username, password) {
  const users = loadAdminUsers();
  if (!users.length) {
    return { ok: false, missing: true };
  }
  const name = normalizeAdminUsername(username);
  if (!name || name.length > 64 || String(password ?? "").length > 256) {
    return { ok: false, missing: false };
  }
  const user = users.find((item) => item.username === name);
  if (!user || !verifyUserPassword(user, password)) {
    return { ok: false, missing: false };
  }
  return { ok: true, missing: false, role: user.role, username: user.username };
}

function adminRoleLabel(role) {
  if (role === "admin") {
    return "管理員";
  }
  if (role === "qr") {
    return "二級管理員（QR／據點）";
  }
  if (role === "qr_notice") {
    return "二級管理員（QR／公告）";
  }
  return "訪客";
}

function isSecondaryAdminRole(role) {
  return role === "qr" || role === "qr_notice";
}

function roleCanSaveSpots(role) {
  return role === "admin" || role === "qr";
}

function roleCanEditUrlNotices(role) {
  return role === "admin" || role === "qr_notice";
}

function secondaryDefaultPath(role) {
  if (role === "qr_notice") {
    return "/admin/notices.html";
  }
  if (role === "qr") {
    return "/admin/links.html";
  }
  return "/admin/";
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const trimmed = part.trim();
    const index = trimmed.indexOf("=");
    if (index === -1) {
      return;
    }
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });
  return out;
}

function pruneSessions() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now || now - (session.lastActiveAt || 0) > SESSION_IDLE_MS) {
      sessions.delete(token);
    }
  }
}

function getAdminSession(req) {
  pruneSessions();
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = sessions.get(token);
  const now = Date.now();
  if (!session || session.expiresAt <= now || now - (session.lastActiveAt || 0) > SESSION_IDLE_MS) {
    sessions.delete(token);
    return null;
  }
  // 部署升級後舊 session 可能沒有 role：一律視為無效，避免權限落差
  if (session.role !== "admin" && !isSecondaryAdminRole(session.role)) {
    sessions.delete(token);
    return null;
  }
  session.lastActiveAt = now;
  return session;
}

function isAdmin(req) {
  return Boolean(getAdminRole(req));
}

function getAdminRole(req) {
  const session = getAdminSession(req);
  if (!session) {
    return null;
  }
  return session.role === "admin" || isSecondaryAdminRole(session.role) ? session.role : null;
}

function isFullAdmin(req) {
  return getAdminRole(req) === "admin";
}

function canSaveSpots(req) {
  return roleCanSaveSpots(getAdminRole(req));
}

function canEditUrlNotices(req) {
  return roleCanEditUrlNotices(getAdminRole(req));
}

function resolveAccessRoleLabel(req) {
  return adminRoleLabel(getAdminRole(req));
}

/** 寫入伺服器修改稽核（logs/audit.jsonl） */
function auditMutation(req, { action, detail = "", status, username, role } = {}) {
  if (!action) {
    return;
  }
  const session = getAdminSession(req);
  recordAudit(ROOT, {
    ip: clientIp(req),
    username: username != null ? username : session?.username || "",
    role: role != null ? role : session?.role || "",
    action,
    detail,
    status: status == null ? 0 : status
  });
}

function wantSecureCookie(req) {
  if (ADMIN_COOKIE_SECURE) {
    return true;
  }
  const proto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return proto === "https";
}

function cookieHeader(name, value, maxAgeSec, { httpOnly = true, secure = false } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "SameSite=Lax", "Path=/"];
  if (httpOnly) {
    parts.push("HttpOnly");
  }
  if (secure) {
    parts.push("Secure");
  }
  if (maxAgeSec === 0) {
    parts.push("Max-Age=0");
  } else {
    parts.push(`Max-Age=${maxAgeSec}`);
  }
  return parts.join("; ");
}

function sessionCookieHeaders(req, token, csrf, maxAgeSec) {
  const secure = wantSecureCookie(req);
  return {
    "Set-Cookie": [
      cookieHeader(SESSION_COOKIE, token, maxAgeSec, { httpOnly: true, secure }),
      cookieHeader(CSRF_COOKIE, csrf, maxAgeSec, { httpOnly: false, secure })
    ]
  };
}

function clearSessionCookieHeaders(req) {
  const secure = wantSecureCookie(req);
  return {
    "Set-Cookie": [
      cookieHeader(SESSION_COOKIE, "", 0, { httpOnly: true, secure }),
      cookieHeader(CSRF_COOKIE, "", 0, { httpOnly: false, secure })
    ]
  };
}

function readCsrfHeader(req) {
  return String(req.headers[CSRF_HEADER] || "").trim();
}

function requireCsrf(req, res) {
  const session = getAdminSession(req);
  if (!session) {
    sendJson(res, 401, { message: "需要管理登入。" });
    return false;
  }
  const headerToken = readCsrfHeader(req);
  const cookieToken = parseCookies(req)[CSRF_COOKIE] || "";
  if (
    !headerToken ||
    !session.csrf ||
    !timingSafeStringEqual(headerToken, session.csrf) ||
    !timingSafeStringEqual(cookieToken, session.csrf)
  ) {
    sendJson(res, 403, { message: "CSRF 驗證失敗，請重新整理後再試。" });
    return false;
  }
  return true;
}

function safeNextPath(raw) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes(":")) {
    return "/admin/";
  }
  return value;
}

function allowLoginAttempt(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  rec.count += 1;
  return rec.count <= LOGIN_MAX_ATTEMPTS;
}

function prunePresenceAttempts(now = Date.now()) {
  for (const [ip, rec] of presenceAttempts.entries()) {
    if (!rec || rec.resetAt <= now) {
      presenceAttempts.delete(ip);
    }
  }
}

function allowPresenceEvent(ip) {
  const now = Date.now();
  if (presenceAttempts.size > 2000) {
    prunePresenceAttempts(now);
  }
  const rec = presenceAttempts.get(ip);
  if (!rec || rec.resetAt <= now) {
    presenceAttempts.set(ip, { count: 1, resetAt: now + PRESENCE_WINDOW_MS });
    return true;
  }
  rec.count += 1;
  return rec.count <= PRESENCE_MAX_PER_WINDOW;
}

async function handleAccessEvent(req, res) {
  const ip = clientIp(req);
  if (!allowPresenceEvent(ip)) {
    sendJson(res, 429, { ok: false, message: "too many events" });
    return;
  }
  try {
    const raw = await readBody(req, 2048);
    let parsed = {};
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      parsed = {};
    }
    const event =
      parsed.event === "leave"
        ? "leave"
        : parsed.event === "enter"
          ? "enter"
          : parsed.event === "heartbeat"
            ? "heartbeat"
            : null;
    const page = parsed.page === "navigation" ? "navigation" : parsed.page === "visitor" ? "visitor" : null;
    if (!event || !page) {
      sendJson(res, 400, { ok: false, message: "invalid event" });
      return;
    }
    const sessionId = String(parsed.sessionId || "").trim().slice(0, 64);
    applyPresenceEvent({ ip, page, event, sessionId });
    // heartbeat 不寫 access.log，避免洗版
    if (event === "enter" || event === "leave") {
      recordPresenceEvent(ROOT, {
        ip,
        role: resolveAccessRoleLabel(req),
        event,
        page
      });
    }
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (error.message === "Payload too large") {
      sendJson(res, 413, { ok: false });
      return;
    }
    sendJson(res, 400, { ok: false });
  }
}

function isPublicAdminPath(pathname) {
  return pathname === "/admin/login.html" || pathname === "/admin/login";
}

function isQrAllowedAdminPath(pathname) {
  // 相容舊呼叫：等同「僅 qr 角色」
  return isSecondaryAllowedAdminPath(pathname, "qr");
}

function isSecondaryAllowedAdminPath(pathname, role) {
  if (pathname === "/admin/links.html") {
    return isSecondaryAdminRole(role) || role === "admin";
  }
  // 舊網址公告頁改導向 notices；二級公告仍可開
  if (pathname === "/admin/notices.html" || pathname === "/admin/url-notices.html") {
    return roleCanEditUrlNotices(role);
  }
  return false;
}

function isProtectedAdminPath(pathname) {
  if (pathname === "/settings.html") {
    return true;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return !isPublicAdminPath(pathname);
  }
  return false;
}

function isBlockedStaticPath(urlPath) {
  const normalized = String(urlPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const lower = normalized.toLowerCase();
  const blockedPrefixes = [
    ".git/",
    "node_modules/",
    "config/maps.local.json",
    "config/admin.local.json",
    "backend/.env",
    ".env",
    "logs/"
  ];
  if (lower === "logs" || lower.startsWith("logs/")) {
    return true;
  }
  if (lower === ".git" || lower.startsWith(".git/")) {
    return true;
  }
  if (lower === ".env" || lower.startsWith(".env/")) {
    return true;
  }
  if (blockedPrefixes.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))) {
    return true;
  }
  if (/^專案檢查報告.*\.txt$/i.test(normalized)) {
    return true;
  }
  return false;
}

function serveStatic(req, res, urlPath) {
  if (isBlockedStaticPath(urlPath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const relative = safePath === "/" || safePath === "\\" ? "index.html" : safePath;
  const roots = SERVE_DIST && fs.existsSync(DIST_DIR) ? [DIST_DIR, ROOT] : [ROOT];

  const tryRead = (index) => {
    if (index >= roots.length) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const base = roots[index];
    const filePath = path.join(base, relative);
    if (!filePath.startsWith(base)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        // dist 沒有的資源（如 images/）改從專案根目錄找
        if (index + 1 < roots.length) {
          tryRead(index + 1);
          return;
        }
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(data);
    });
  };

  tryRead(0);
}

async function handlePostScope(req, res, scope) {
  const filePath = scopeToFile(scope);
  if (!filePath) {
    sendJson(res, 400, { message: "Invalid scope name." });
    auditMutation(req, { action: "儲存節點", detail: String(scope || ""), status: 400 });
    return;
  }

  try {
    const body = await readBody(req, NODE_POST_MAX_BYTES);
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      sendJson(res, 400, { message: "Body must be a JSON array." });
      auditMutation(req, { action: "儲存節點", detail: scope, status: 400 });
      return;
    }
    ensureNodesDir();
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    sendJson(res, 200, { ok: true, scope, file: `data/nodes/${scope}.json` });
    auditMutation(req, {
      action: "儲存節點",
      detail: `${scope}（${parsed.length} 點）`,
      status: 200
    });
  } catch (error) {
    if (error.message === "Payload too large") {
      sendJson(res, 413, { message: "JSON 過大。" });
      auditMutation(req, { action: "儲存節點", detail: scope, status: 413 });
      return;
    }
    sendJson(res, 400, { message: "Invalid JSON.", error: error.message });
    auditMutation(req, { action: "儲存節點", detail: scope, status: 400 });
  }
}

function handleDeleteScope(req, res, scope) {
  if (String(scope).toLowerCase() === "campus") {
    sendJson(res, 400, { message: "不可刪除校園總圖節點檔。" });
    auditMutation(req, { action: "刪除節點檔", detail: scope, status: 400 });
    return;
  }
  const filePath = scopeToFile(scope);
  if (!filePath) {
    sendJson(res, 400, { message: "Invalid scope name." });
    auditMutation(req, { action: "刪除節點檔", detail: String(scope || ""), status: 400 });
    return;
  }
  try {
    if (!fs.existsSync(filePath)) {
      sendJson(res, 200, { ok: true, deleted: false, missing: true, scope });
      auditMutation(req, { action: "刪除節點檔", detail: `${scope}（檔案不存在）`, status: 200 });
      return;
    }
    fs.unlinkSync(filePath);
    sendJson(res, 200, { ok: true, deleted: true, file: `data/nodes/${scope}.json` });
    auditMutation(req, { action: "刪除節點檔", detail: scope, status: 200 });
  } catch (error) {
    sendJson(res, 500, { message: "刪除節點檔失敗。", error: error.message });
    auditMutation(req, { action: "刪除節點檔", detail: scope, status: 500 });
  }
}

async function handleBuildingsWrite(req, res) {
  try {
    const body = await readBody(req, LOGIN_MAX_BYTES * 8);
    const parsed = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendJson(res, 400, { message: "Body must be a JSON object." });
      auditMutation(req, { action: "儲存大樓設定", status: 400 });
      return;
    }
    saveBuildings(parsed);
    sendJson(res, 200, { ok: true, file: "data/buildings.json" });
    auditMutation(req, { action: "儲存大樓設定", detail: "data/buildings.json", status: 200 });
  } catch (error) {
    if (error.message === "Payload too large") {
      sendJson(res, 413, { message: "設定檔過大。" });
      auditMutation(req, { action: "儲存大樓設定", status: 413 });
      return;
    }
    sendJson(res, 400, { message: "Invalid JSON.", error: error.message });
    auditMutation(req, { action: "儲存大樓設定", status: 400 });
  }
}

const PANO_SPOT_PRESETS_MAX = 200;
const PANO_SPOT_ID_MAX = 120;
const PANO_SPOT_SCOPE_MAX = 80;
const PANO_SPOT_NODE_MAX = 80;

/** 伺服器端正規化據點清單（二級寫入只允許此欄，必須消毒） */
function normalizePanoSpotPresets(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set();
  const list = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const scope = String(raw.scope || "")
      .trim()
      .replace(/^mcu_nav_nodes_/, "")
      .slice(0, PANO_SPOT_SCOPE_MAX);
    const nodeId = String(raw.nodeId || "")
      .trim()
      .slice(0, PANO_SPOT_NODE_MAX);
    if (!scope || !nodeId || !/^[a-z0-9_-]+$/i.test(scope) || /[\\/]/.test(nodeId)) {
      continue;
    }
    const id = String(raw.id || "")
      .trim()
      .slice(0, PANO_SPOT_ID_MAX) ||
      `spot_${scope}_${nodeId}_${Math.round(Number(raw.yaw) || 0)}_${raw.createdAt || Date.now()}`;
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const yaw = Number(raw.yaw);
    const pitch = Number(raw.pitch);
    list.push({
      id,
      label:
        String(raw.label || raw.nodeName || nodeId)
          .trim()
          .slice(0, 80) || nodeId,
      scope,
      nodeId,
      nodeName: String(raw.nodeName || "")
        .trim()
        .slice(0, 80),
      yaw: Number.isFinite(yaw) ? Math.round(yaw * 100) / 100 : 0,
      pitch: Number.isFinite(pitch) ? Math.round(pitch * 100) / 100 : 0,
      createdAt: Math.max(0, Math.round(Number(raw.createdAt) || Date.now()))
    });
    if (list.length >= PANO_SPOT_PRESETS_MAX) {
      break;
    }
  }
  return list;
}

const URL_NOTICE_RULES_MAX = 50;

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function normalizeNoticeFieldsServer(input = {}, defaults = {}, { withForm = false } = {}) {
  const title =
    String(input.title ?? defaults.title ?? "")
      .trim()
      .slice(0, 80) || String(defaults.title || "公告");
  const body =
    String(input.body ?? defaults.body ?? "")
      .trim()
      .slice(0, 2000) || String(defaults.body || "");
  const countdownSec = Math.round(
    clampNum(input.countdownSec ?? defaults.countdownSec, 1, 60, 8)
  );
  const version = Math.max(1, Math.round(Number(input.version) || defaults.version || 1));
  const out = {
    enabled: Boolean(input.enabled),
    title,
    body,
    countdownSec,
    version,
    showEveryVisit: Boolean(input.showEveryVisit)
  };
  if (withForm) {
    const formUrl = String(input.formUrl ?? defaults.formUrl ?? "")
      .trim()
      .slice(0, 500);
    out.formUrl = !formUrl || /^https?:\/\//i.test(formUrl) ? formUrl : "";
    out.formButtonLabel =
      String(input.formButtonLabel ?? defaults.formButtonLabel ?? "填寫回饋")
        .trim()
        .slice(0, 40) || "填寫回饋";
  }
  return out;
}

function normalizeUrlNoticeRulesServer(input, { withForm = false } = {}) {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set();
  const list = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const urlMatch = String(raw.urlMatch || "")
      .trim()
      .slice(0, 300);
    if (!urlMatch) {
      continue;
    }
    const id =
      String(raw.id || "")
        .trim()
        .slice(0, 80) ||
      `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const fields = normalizeNoticeFieldsServer(
      raw,
      {
        enabled: false,
        title: "公告",
        body: "",
        countdownSec: 8,
        version: 1,
        showEveryVisit: false,
        formUrl: "",
        formButtonLabel: "填寫回饋"
      },
      { withForm }
    );
    list.push({
      id,
      label:
        String(raw.label || "")
          .trim()
          .slice(0, 80) || urlMatch.slice(0, 40),
      urlMatch,
      ...fields
    });
    if (list.length >= URL_NOTICE_RULES_MAX) {
      break;
    }
  }
  return list;
}

function normalizeWelcomeNoticeServer(input = {}) {
  const base = normalizeNoticeFieldsServer(
    input,
    {
      enabled: false,
      title: "歡迎使用校園導航",
      body: "可搜尋教室或據點名稱開始導航。左右拖曳可環視，點箭頭可前進。",
      countdownSec: 8,
      version: 1,
      showEveryVisit: false
    },
    { withForm: false }
  );
  return {
    ...base,
    rules: normalizeUrlNoticeRulesServer(input.rules, { withForm: false })
  };
}

function normalizeEndFeedbackServer(input = {}) {
  const defaults = {
    enabled: false,
    title: "已抵達目的地",
    body: "若方便，歡迎填寫回饋表單協助我們改善導覽。",
    formUrl: "",
    formButtonLabel: "填寫回饋",
    countdownSec: 12,
    version: 1,
    showEveryVisit: false
  };
  return {
    defaultNotice: normalizeNoticeFieldsServer(
      input.defaultNotice ?? defaults,
      defaults,
      { withForm: true }
    ),
    rules: normalizeUrlNoticeRulesServer(input.rules, { withForm: true })
  };
}

async function handleNavSettingsWrite(req, res, { limitedMerge = false } = {}) {
  const action = limitedMerge ? "儲存導航設定（二級合併）" : "儲存導航設定";
  try {
    const body = await readBody(req, LOGIN_MAX_BYTES * 8);
    const parsed = JSON.parse(body || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendJson(res, 400, { message: "Body must be a JSON object." });
      auditMutation(req, { action, status: 400 });
      return;
    }
    if (limitedMerge) {
      const role = getAdminRole(req);
      const hasSpots = Object.prototype.hasOwnProperty.call(parsed, "panoSpotPresets");
      const hasWelcome = Object.prototype.hasOwnProperty.call(parsed, "welcomeNotice");
      const hasEnd = Object.prototype.hasOwnProperty.call(parsed, "endFeedback");
      const allowSpots = roleCanSaveSpots(role);
      const allowNotices = roleCanEditUrlNotices(role);
      const current = loadNavSettings() || {};
      const next = { ...current };
      const details = [];
      if (allowSpots && hasSpots) {
        next.panoSpotPresets = normalizePanoSpotPresets(parsed.panoSpotPresets);
        details.push(`panoSpotPresets ${next.panoSpotPresets.length} 筆`);
      }
      if (allowNotices && hasWelcome) {
        const currentWelcome = normalizeWelcomeNoticeServer(current.welcomeNotice || {});
        const incoming = normalizeWelcomeNoticeServer(parsed.welcomeNotice || {});
        // 二級公告帳號只能改 rules，預設文案沿用伺服器現況
        next.welcomeNotice =
          role === "qr_notice"
            ? { ...currentWelcome, rules: incoming.rules }
            : incoming;
        details.push(`welcomeNotice rules ${(next.welcomeNotice.rules || []).length}`);
      }
      if (allowNotices && hasEnd) {
        const currentEnd = normalizeEndFeedbackServer(current.endFeedback || {});
        const incoming = normalizeEndFeedbackServer(parsed.endFeedback || {});
        next.endFeedback =
          role === "qr_notice"
            ? { defaultNotice: currentEnd.defaultNotice, rules: incoming.rules }
            : incoming;
        details.push(`endFeedback rules ${(next.endFeedback.rules || []).length}`);
      }
      if (!details.length) {
        sendJson(res, 400, {
          message: allowSpots
            ? "二級（QR／據點）僅能更新 panoSpotPresets。"
            : allowNotices
              ? "二級（QR／公告）僅能更新依網址規則（welcomeNotice.rules／endFeedback.rules）。"
              : "無權限更新導航設定。"
        });
        auditMutation(req, { action, detail: "缺少允許欄位或無權限", status: 400 });
        return;
      }
      saveNavSettings(next);
      sendJson(res, 200, { ok: true, file: "data/nav-settings.json" });
      auditMutation(req, {
        action,
        detail: details.join("；"),
        status: 200
      });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "panoSpotPresets")) {
      parsed.panoSpotPresets = normalizePanoSpotPresets(parsed.panoSpotPresets);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "welcomeNotice")) {
      parsed.welcomeNotice = normalizeWelcomeNoticeServer(parsed.welcomeNotice);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "endFeedback")) {
      parsed.endFeedback = normalizeEndFeedbackServer(parsed.endFeedback);
    }
    saveNavSettings(parsed);
    sendJson(res, 200, { ok: true, file: "data/nav-settings.json" });
    const spotCount = Array.isArray(parsed.panoSpotPresets) ? parsed.panoSpotPresets.length : 0;
    auditMutation(req, {
      action,
      detail: `完整寫入（據點 ${spotCount} 筆）`,
      status: 200
    });
  } catch (error) {
    if (error.message === "Payload too large") {
      sendJson(res, 413, { message: "設定檔過大。" });
      auditMutation(req, { action, status: 413 });
      return;
    }
    sendJson(res, 400, { message: "Invalid JSON.", error: error.message });
    auditMutation(req, { action, status: 400 });
  }
}

async function handleAdminLogin(req, res) {
  const ip = clientIp(req);
  if (!hasAdminCredentials()) {
    sendJson(res, 503, {
      message:
        "尚未設定管理密碼。請複製 config/admin.example.json 為 config/admin.local.json，或設定環境變數 ADMIN_PASSWORD。"
    });
    auditMutation(req, { action: "登入失敗", detail: "尚未設定密碼", status: 503, username: "", role: "" });
    return;
  }
  if (!allowLoginAttempt(ip)) {
    sendJson(res, 429, { message: "嘗試次數過多，請稍後再試。" });
    auditMutation(req, { action: "登入失敗", detail: "嘗試過多", status: 429, username: "", role: "" });
    return;
  }
  try {
    const body = await readBody(req, LOGIN_MAX_BYTES);
    const parsed = JSON.parse(body || "{}");
    const tryUser = normalizeAdminUsername(parsed.username);
    const verified = verifyAdminLogin(parsed.username, parsed.password);
    if (!verified.ok) {
      sendJson(res, 401, { message: "帳號或密碼不正確。" });
      auditMutation(req, {
        action: "登入失敗",
        detail: tryUser ? `帳號 ${tryUser}` : "未填帳號",
        status: 401,
        username: tryUser,
        role: ""
      });
      return;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const csrf = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const role = verified.role;
    sessions.set(token, {
      expiresAt: now + SESSION_TTL_MS,
      lastActiveAt: now,
      csrf,
      role,
      username: verified.username
    });
    const defaultNext = secondaryDefaultPath(role);
    sendJson(
      res,
      200,
      { ok: true, role, defaultNext },
      sessionCookieHeaders(req, token, csrf, Math.floor(SESSION_TTL_MS / 1000))
    );
    auditMutation(req, {
      action: "登入成功",
      detail: `角色 ${role}`,
      status: 200,
      username: verified.username,
      role
    });
  } catch (error) {
    if (error.message === "Payload too large") {
      sendJson(res, 413, { message: "請求過大。" });
      auditMutation(req, { action: "登入失敗", detail: "請求過大", status: 413, username: "", role: "" });
      return;
    }
    sendJson(res, 400, { message: "Invalid JSON." });
    auditMutation(req, { action: "登入失敗", detail: "Invalid JSON", status: 400, username: "", role: "" });
  }
}

function handleAdminLogout(req, res) {
  const session = getAdminSession(req);
  const username = session?.username || "";
  const role = session?.role || "";
  if (!requireCsrf(req, res)) {
    return;
  }
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }
  sendJson(res, 200, { ok: true }, clearSessionCookieHeaders(req));
  recordAudit(ROOT, {
    ip: clientIp(req),
    username,
    role,
    action: "登出",
    detail: role ? `角色 ${role}` : "",
    status: 200
  });
}

const IMAGES_ROOT = path.join(ROOT, "images");
const IMAGE_FOLDER_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const IMAGE_EXT_PATTERN = /\.(jpe?g|png|webp)$/i;

function listPanoramaImages(folder) {
  if (!folder || !IMAGE_FOLDER_PATTERN.test(folder)) {
    return { error: "Invalid folder.", status: 400 };
  }
  const dirPath = path.resolve(IMAGES_ROOT, ...folder.split("/"));
  const imagesRoot = path.resolve(IMAGES_ROOT);
  const relativeToRoot = path.relative(imagesRoot, dirPath);
  if (
    !relativeToRoot ||
    relativeToRoot.startsWith("..") ||
    path.isAbsolute(relativeToRoot)
  ) {
    return { error: "Invalid folder.", status: 400 };
  }
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return { error: "資料夾不存在。", status: 404 };
  }

  const names = fs
    .readdirSync(dirPath)
    .filter((name) => {
      if (!IMAGE_EXT_PATTERN.test(name)) {
        return false;
      }
      try {
        return fs.statSync(path.join(dirPath, name)).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const baseUrl = `./images/${folder}`;
  return {
    status: 200,
    body: {
      folder,
      baseUrl,
      images: names.map((name) => ({
        name,
        url: `${baseUrl}/${name}`
      }))
    }
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  attachAccessLog(req, res, { isAdmin, roleLabel: resolveAccessRoleLabel, projectRoot: ROOT });

  if (req.method === "GET" && pathname === "/api/node-scopes/_health") {
    const role = getAdminRole(req);
    const full = role === "admin";
    sendJson(res, 200, {
      write: full,
      admin: full,
      role: role || null,
      canSaveSpots: roleCanSaveSpots(role),
      canEditUrlNotices: roleCanEditUrlNotices(role),
      maintenance: MAINTENANCE_MODE
    });
    return;
  }

  if (MAINTENANCE_MODE) {
    if (pathname.startsWith("/api/")) {
      sendJson(res, 503, {
        message: "網站維護中",
        eta: MAINTENANCE_ETA
      });
      return;
    }
    serveMaintenancePage(res);
    return;
  }

  if (req.method === "GET" && pathname === "/api/validate") {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要管理登入才能檢查資料。" });
      return;
    }
    const reverse = url.searchParams.get("reverse") === "1";
    const { collectBuildingsValidation, collectNodesValidation } = loadValidationCollectors();
    const buildings = collectBuildingsValidation();
    const nodes = collectNodesValidation({ reverse, checkImages: true });
    sendJson(res, 200, {
      ok: buildings.ok && nodes.ok,
      buildings,
      nodes
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/panorama-images") {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要管理登入才能瀏覽全景圖資料夾。" });
      return;
    }
    const folder = String(url.searchParams.get("folder") || "").trim();
    const result = listPanoramaImages(folder);
    if (result.error) {
      sendJson(res, result.status, { message: result.error });
      return;
    }
    sendJson(res, 200, result.body);
    return;
  }

  if (req.method === "GET" && pathname === "/api/maps-config") {
    sendJson(res, 200, loadMapsConfig());
    return;
  }

  if (req.method === "GET" && pathname === "/api/nav-settings") {
    sendJson(res, 200, loadNavSettings() || {});
    return;
  }

  if (req.method === "GET" && pathname === "/api/buildings") {
    sendJson(res, 200, loadBuildings() || {});
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    const role = getAdminRole(req);
    if (!role) {
      sendJson(res, 401, { ok: false });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      role,
      canSaveSpots: roleCanSaveSpots(role),
      canEditUrlNotices: roleCanEditUrlNotices(role),
      defaultNext: secondaryDefaultPath(role)
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/audit") {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要完整管理員才能查看修改紀錄。" });
      return;
    }
    const limitRaw = Number(url.searchParams.get("limit"));
    const { entries, totalReturned } = readAuditTail(ROOT, {
      limit: Number.isFinite(limitRaw) ? limitRaw : AUDIT_DEFAULT_LIMIT,
      username: url.searchParams.get("username") || "",
      role: url.searchParams.get("role") || "",
      q: url.searchParams.get("q") || "",
      status: url.searchParams.get("status") || ""
    });
    sendJson(res, 200, { ok: true, entries, totalReturned });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/presence") {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要完整管理員才能查看訪客監控。" });
      return;
    }
    prunePresenceAttempts();
    sendJson(res, 200, { ok: true, ...getPresenceSnapshot() });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/visitor-daily") {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要完整管理員才能查看每日訪客。" });
      return;
    }
    const days = Number(url.searchParams.get("days") || 30);
    sendJson(res, 200, { ok: true, ...getVisitorDailySeries(days) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    await handleAdminLogin(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    handleAdminLogout(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/access-event") {
    await handleAccessEvent(req, res);
    return;
  }

  if (req.method === "POST" && pathname === "/api/nav-settings") {
    if (!canSaveSpots(req)) {
      sendJson(res, 401, { message: "需要管理登入才能寫入導航設定。" });
      return;
    }
    if (!requireCsrf(req, res)) {
      return;
    }
    await handleNavSettingsWrite(req, res, { limitedMerge: !isFullAdmin(req) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/buildings") {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要管理登入才能寫入大樓定義。" });
      return;
    }
    if (!requireCsrf(req, res)) {
      return;
    }
    await handleBuildingsWrite(req, res);
    return;
  }

  const postMatch = pathname.match(/^\/api\/node-scopes\/([^/]+)$/);
  if (req.method === "POST" && postMatch) {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要管理登入才能寫入節點。" });
      return;
    }
    if (!requireCsrf(req, res)) {
      return;
    }
    await handlePostScope(req, res, postMatch[1]);
    return;
  }

  if (req.method === "DELETE" && postMatch) {
    if (!isFullAdmin(req)) {
      sendJson(res, 401, { message: "需要管理登入才能刪除節點檔。" });
      return;
    }
    if (!requireCsrf(req, res)) {
      return;
    }
    handleDeleteScope(req, res, postMatch[1]);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  if (pathname === "/admin") {
    const role = getAdminRole(req);
    if (!role) {
      redirect(res, `/admin/login.html?next=${encodeURIComponent("/admin/")}`);
      return;
    }
    redirect(res, isSecondaryAdminRole(role) ? secondaryDefaultPath(role) : "/admin/");
    return;
  }

  if (isProtectedAdminPath(pathname)) {
    const role = getAdminRole(req);
    if (!role) {
      const next = safeNextPath(pathname === "/admin" ? "/admin/" : pathname);
      redirect(res, `/admin/login.html?next=${encodeURIComponent(next)}`);
      return;
    }
    if (isSecondaryAdminRole(role) && !isSecondaryAllowedAdminPath(pathname, role)) {
      redirect(res, secondaryDefaultPath(role));
      return;
    }
  }

  let staticPath = pathname;
  if (staticPath.endsWith("/")) {
    staticPath += "index.html";
  }
  serveStatic(req, res, staticPath.replace(/^\//, ""));
});

ensureNodesDir();
server.listen(PORT, LISTEN_HOST, () => {
  const nodesRel = path.relative(ROOT, NODES_DIR);
  const users = loadAdminUsers();
  console.log(`MCU server: http://localhost:${PORT}/`);
  if (WANT_HOST) {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const net of list || []) {
        const family = net.family === "IPv4" || net.family === 4;
        if (family && !net.internal) {
          console.log(`MCU server (LAN): http://${net.address}:${PORT}/`);
        }
      }
    }
  }
  console.log(`Admin login:    http://localhost:${PORT}/admin/login.html`);
  console.log(`Nodes auto-save: ${nodesRel}\\*.json（需管理登入）`);
  if (SERVE_DIST && fs.existsSync(DIST_DIR)) {
    console.log(`Static:         dist/（生產打包）+ 專案根目錄後援（images/ 等）`);
  } else {
    console.log("Static:         專案根目錄（開發模式；VPS 請 npm run build 並設 MCU_SERVE_DIST=1）");
  }
  if (!users.length) {
    console.log("管理密碼尚未設定：請複製 config/admin.example.json 為 config/admin.local.json，");
    console.log("  或以 node scripts/hash-admin-password.cjs <密碼> 產生 passwordHash；也可設 ADMIN_PASSWORD。");
  } else {
    const roles = users.map((u) => `${u.username}:${u.role}`).join(", ");
    console.log(`Admin users:    ${roles}`);
    if (users.some((u) => u.source.includes("plaintext"))) {
      console.warn("警告：admin.local.json 仍使用明文 password，建議改為 passwordHash（見 hash-admin-password.cjs）。");
    }
    if (!users.some((u) => u.role === "qr")) {
      console.log("提示：尚未設定二級帳號（role=qr，連結／QR＋據點），可於 admin.local.json 的 users 新增。");
    }
    if (!users.some((u) => u.role === "qr_notice")) {
      console.log("提示：尚未設定公告二級帳號（role=qr_notice，連結／QR＋網址公告），可於 admin.local.json 的 users 新增。");
    }
  }
  if (ADMIN_COOKIE_SECURE) {
    console.log("Cookie Secure:  已強制開啟（ADMIN_COOKIE_SECURE=1）");
  }
  if (MAINTENANCE_MODE) {
    console.log(`Maintenance:    開啟（預計 ${MAINTENANCE_ETA} 完成；關：拿掉 MCU_MAINTENANCE）`);
  }
  if (isAccessLogEnabled()) {
    const logFile = resolveLogFilePath(ROOT);
    console.log(
      logFile
        ? `Access log:     stdout + ${path.relative(ROOT, logFile)}（管理員寫入／登入會留下紀錄）`
        : "Access log:     stdout（MCU_ACCESS_LOG_FILE=0 已關閉寫檔）"
    );
    console.log("  關閉 log：MCU_ACCESS_LOG=0；較吵：MCU_ACCESS_LOG_VERBOSE=1");
  } else {
    console.log("Access log:     已關閉（MCU_ACCESS_LOG=0）");
  }
  console.log(`PID: ${process.pid}  (工作管理員 > 詳細資料 > 找此數字)`);
});
