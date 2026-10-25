/** 管理 API fetch：自動帶 cookie 與 CSRF header */

const CSRF_COOKIE = "mcu_csrf";
const CSRF_HEADER = "X-CSRF-Token";

export function safeNextPath(raw) {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes(":")) {
    return "/admin/";
  }
  return value;
}

export function readCsrfToken() {
  const raw = document.cookie || "";
  const parts = raw.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${CSRF_COOKIE}=`)) {
      continue;
    }
    try {
      return decodeURIComponent(trimmed.slice(CSRF_COOKIE.length + 1));
    } catch {
      return trimmed.slice(CSRF_COOKIE.length + 1);
    }
  }
  return "";
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 */
export function adminFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCsrfToken();
    if (csrf) {
      headers.set(CSRF_HEADER, csrf);
    }
  }
  if (options.body != null && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, {
    ...options,
    credentials: "same-origin",
    headers
  });
}
