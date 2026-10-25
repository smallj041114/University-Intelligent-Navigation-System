/**
 * 訪客線上狀態（記憶體）＋近月每日進站彙總（檔案）
 * 供後台 GET /api/admin/presence、/api/admin/visitor-daily；不寫入 audit。
 */

const fs = require("fs");
const path = require("path");

const ONLINE_TTL_MS = 90 * 1000;
const ENTER_DEDUP_MS = 60 * 1000;
const DAILY_KEEP_DAYS = 40;
const DAILY_FILENAME = "visitor-daily.json";

/** @type {Map<string, { ip: string, sessionId: string, page: "visitor"|"navigation", lastSeenAt: number, enteredAt: number }>} */
const online = new Map();

/** @type {Map<string, number>} dedupeKey -> last counted enter timestamp */
const enterDedup = new Map();

let todayKey = "";
let todayEnters = 0;
let projectRootForDaily = "";

function setPresenceProjectRoot(root) {
  projectRootForDaily = String(root || "").trim();
}

function taiwanDayKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch {
    const d = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }
}

function ensureToday() {
  const key = taiwanDayKey();
  if (key !== todayKey) {
    todayKey = key;
    todayEnters = 0;
    enterDedup.clear();
  }
}

function normalizeSessionId(raw) {
  const s = String(raw || "")
    .trim()
    .slice(0, 64);
  if (!s || s.length < 8) {
    return "";
  }
  if (!/^[A-Za-z0-9_-]+$/.test(s)) {
    return "";
  }
  return s;
}

function presenceKey(sessionId, ip, page) {
  const pageKey = page === "navigation" ? "navigation" : "visitor";
  if (sessionId) {
    return `sid:${sessionId}|${pageKey}`;
  }
  return `ip:${String(ip || "unknown")}|${pageKey}`;
}

function enterDedupeKey(sessionId, ip) {
  return sessionId ? `sid:${sessionId}` : `ip:${String(ip || "unknown")}`;
}

function pruneExpired(now = Date.now()) {
  for (const [key, row] of online.entries()) {
    if (!row || now - row.lastSeenAt > ONLINE_TTL_MS) {
      online.delete(key);
    }
  }
  for (const [key, ts] of enterDedup.entries()) {
    if (now - ts > ENTER_DEDUP_MS * 2) {
      enterDedup.delete(key);
    }
  }
}

function dailyFilePath() {
  if (!projectRootForDaily) {
    return "";
  }
  return path.join(projectRootForDaily, "logs", DAILY_FILENAME);
}

function readDailyMap() {
  const file = dailyFilePath();
  if (!file) {
    return {};
  }
  try {
    if (!fs.existsSync(file)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pruneDailyMap(map) {
  const keys = Object.keys(map || {})
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  while (keys.length > DAILY_KEEP_DAYS) {
    const old = keys.shift();
    delete map[old];
  }
  return map;
}

function writeDailyMap(map) {
  const file = dailyFilePath();
  if (!file) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(pruneDailyMap(map), null, 2)}\n`, "utf8");
  } catch {
    /* ignore disk errors */
  }
}

function bumpDailyEnter(dayKey) {
  const map = readDailyMap();
  const prev = Number(map[dayKey]) || 0;
  map[dayKey] = prev + 1;
  writeDailyMap(map);
}

/**
 * @param {{ ip: string, page: "visitor"|"navigation", event: "enter"|"leave"|"heartbeat", sessionId?: string }} input
 */
function applyPresenceEvent(input) {
  const ip = String(input.ip || "unknown").trim() || "unknown";
  const page = input.page === "navigation" ? "navigation" : "visitor";
  const event = input.event;
  const sessionId = normalizeSessionId(input.sessionId);
  const now = Date.now();
  ensureToday();
  pruneExpired(now);

  const key = presenceKey(sessionId, ip, page);

  if (event === "leave") {
    online.delete(key);
    return;
  }

  if (event === "enter" || event === "heartbeat") {
    const existing = online.get(key);
    if (existing) {
      existing.lastSeenAt = now;
      existing.ip = ip;
      if (sessionId) {
        existing.sessionId = sessionId;
      }
      online.set(key, existing);
    } else {
      online.set(key, {
        ip,
        sessionId: sessionId || "",
        page,
        lastSeenAt: now,
        enteredAt: now
      });
    }
    if (event === "enter") {
      const dedupe = enterDedupeKey(sessionId, ip);
      const last = enterDedup.get(dedupe) || 0;
      if (now - last >= ENTER_DEDUP_MS) {
        enterDedup.set(dedupe, now);
        todayEnters += 1;
        bumpDailyEnter(todayKey);
      }
    }
  }
}

function maskIp(ip) {
  const s = String(ip || "");
  if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`;
    }
  }
  if (s.length > 8) {
    return `${s.slice(0, 4)}…${s.slice(-2)}`;
  }
  return s || "—";
}

function getPresenceSnapshot() {
  const now = Date.now();
  ensureToday();
  pruneExpired(now);
  const list = [];
  let visitor = 0;
  let navigation = 0;
  for (const row of online.values()) {
    if (row.page === "navigation") {
      navigation += 1;
    } else {
      visitor += 1;
    }
    list.push({
      ip: maskIp(row.ip),
      page: row.page,
      lastSeenAt: row.lastSeenAt,
      enteredAt: row.enteredAt,
      hasSession: Boolean(row.sessionId)
    });
  }
  list.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return {
    onlineCount: list.length,
    byPage: { visitor, navigation },
    todayEnters,
    todayKey,
    online: list.slice(0, 100),
    ttlMs: ONLINE_TTL_MS
  };
}

/** 近 days 日（含今日）台灣日每日進站數 */
function getVisitorDailySeries(days = 30) {
  ensureToday();
  const n = Math.min(40, Math.max(1, Math.round(Number(days) || 30)));
  const map = readDailyMap();
  if (todayKey && todayEnters > 0) {
    const fileCount = Number(map[todayKey]) || 0;
    if (todayEnters > fileCount) {
      map[todayKey] = todayEnters;
    }
  }
  const out = [];
  const parts = String(todayKey || taiwanDayKey())
    .split("-")
    .map((x) => Number(x));
  const y0 = parts[0] || 1970;
  const m0 = parts[1] || 1;
  const d0 = parts[2] || 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    const dt = new Date(Date.UTC(y0, m0 - 1, d0 - i));
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    out.push({
      date: key,
      count: Math.max(0, Math.round(Number(map[key]) || 0))
    });
  }
  return { days: out, todayKey };
}

module.exports = {
  applyPresenceEvent,
  getPresenceSnapshot,
  getVisitorDailySeries,
  setPresenceProjectRoot,
  ONLINE_TTL_MS,
  ENTER_DEDUP_MS
};
