/**
 * 伺服器修改稽核（JSONL）
 * 只記會影響伺服器狀態的操作；供後台「修改紀錄」頁讀取。
 */
const fs = require("fs");
const path = require("path");
const { formatTaiwanTime } = require("./access-log.cjs");

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const TAIL_READ_BYTES = 512 * 1024;
const DETAIL_MAX = 400;

function resolveAuditFilePath(projectRoot) {
  return path.join(projectRoot, "logs", "audit.jsonl");
}

function sanitizeField(value, maxLen) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * @param {string} projectRoot
 * @param {{ username?: string, role?: string, ip?: string, action: string, detail?: string, status?: number }} entry
 */
function recordAudit(projectRoot, entry) {
  if (!projectRoot || !entry?.action) {
    return;
  }
  const row = {
    time: formatTaiwanTime(),
    username: sanitizeField(entry.username, 64),
    role: sanitizeField(entry.role, 32),
    ip: sanitizeField(entry.ip || "unknown", 80),
    action: sanitizeField(entry.action, 80),
    detail: sanitizeField(entry.detail, DETAIL_MAX),
    status: Math.max(0, Math.round(Number(entry.status) || 0))
  };
  const filePath = resolveAuditFilePath(projectRoot);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, "utf8");
  } catch (err) {
    console.error(`[audit-log] 無法寫入 ${filePath}:`, err.message || err);
  }
}

/**
 * 讀取檔案尾端字串（大檔不整份載入）
 * @param {string} filePath
 * @param {number} maxBytes
 */
function readFileTail(filePath, maxBytes) {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    const size = stat.size;
    if (size <= 0) {
      return "";
    }
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const firstNl = text.indexOf("\n");
      if (firstNl >= 0) {
        text = text.slice(firstNl + 1);
      }
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeAuditFilters(options = {}) {
  if (typeof options === "number" || options == null) {
    return {
      limit: options,
      username: "",
      role: "",
      q: "",
      status: ""
    };
  }
  return {
    limit: options.limit,
    username: String(options.username || "")
      .trim()
      .toLowerCase(),
    role: String(options.role || "")
      .trim()
      .toLowerCase(),
    q: String(options.q || "")
      .trim()
      .toLowerCase(),
    status: String(options.status || "")
      .trim()
      .toLowerCase()
  };
}

function rowMatchesFilters(row, filters) {
  if (filters.username && !String(row.username || "").toLowerCase().includes(filters.username)) {
    return false;
  }
  if (filters.role && String(row.role || "").toLowerCase() !== filters.role) {
    return false;
  }
  if (filters.q) {
    const hay = `${row.action || ""} ${row.detail || ""}`.toLowerCase();
    if (!hay.includes(filters.q)) {
      return false;
    }
  }
  if (filters.status === "ok") {
    const code = Number(row.status) || 0;
    if (!(code >= 200 && code < 300)) {
      return false;
    }
  } else if (filters.status === "fail") {
    const code = Number(row.status) || 0;
    if (code >= 200 && code < 300) {
      return false;
    }
  }
  return true;
}

/**
 * @param {string} projectRoot
 * @param {number|{ limit?: number, username?: string, role?: string, q?: string, status?: string }} [options]
 * @returns {{ entries: object[], totalReturned: number, totalMatched: number }}
 */
function readAuditTail(projectRoot, options = DEFAULT_LIMIT) {
  const filters = normalizeAuditFilters(options);
  const capped = Math.min(MAX_LIMIT, Math.max(1, Math.round(Number(filters.limit) || DEFAULT_LIMIT)));
  const filePath = resolveAuditFilePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { entries: [], totalReturned: 0, totalMatched: 0 };
  }
  let text = "";
  try {
    text = readFileTail(filePath, TAIL_READ_BYTES);
  } catch (err) {
    console.error(`[audit-log] 無法讀取 ${filePath}:`, err.message || err);
    return { entries: [], totalReturned: 0, totalMatched: 0 };
  }
  const lines = text.split("\n").filter((line) => line.trim());
  const parsed = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const normalized = {
        time: sanitizeField(row.time, 32),
        username: sanitizeField(row.username, 64),
        role: sanitizeField(row.role, 32),
        ip: sanitizeField(row.ip, 80),
        action: sanitizeField(row.action, 80),
        detail: sanitizeField(row.detail, DETAIL_MAX),
        status: Math.max(0, Math.round(Number(row.status) || 0))
      };
      if (!rowMatchesFilters(normalized, filters)) {
        continue;
      }
      parsed.push(normalized);
    } catch {
      /* skip bad line */
    }
  }
  const totalMatched = parsed.length;
  const entries = parsed.slice(-capped).reverse();
  return { entries, totalReturned: entries.length, totalMatched };
}

module.exports = {
  recordAudit,
  readAuditTail,
  resolveAuditFilePath,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DETAIL_MAX
};
