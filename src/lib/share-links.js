/**
 * 可印製／分享連結（一律用呼叫當下的 origin，不做 Base URL 設定）
 */

/**
 * @param {string} [href]
 * @returns {string}
 */
export function pageOrigin(href = typeof location !== "undefined" ? location.href : "") {
  try {
    return new URL(href || "http://127.0.0.1/").origin;
  } catch {
    return "http://127.0.0.1";
  }
}

/**
 * @param {string} relativePath 如 visitor.html、navigation.html
 * @param {string} [origin]
 */
export function absoluteAppUrl(relativePath, origin = pageOrigin()) {
  const base = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(String(relativePath || "").replace(/^\.\//, ""), base).toString();
}

export function buildVisitorEntryUrl(origin = pageOrigin()) {
  return absoluteAppUrl("visitor.html", origin);
}

/**
 * 據點環景深連結（項目 14）
 * @param {{ scope: string, nodeId: string, mode?: string, yaw?: number, pitch?: number, origin?: string }} args
 *   scope：樓層檔名如 s_1，或完整 mcu_nav_nodes_s_1
 */
export function buildPanoSpotUrl({
  scope,
  nodeId,
  mode = "visitor",
  yaw,
  pitch,
  origin = pageOrigin()
} = {}) {
  const url = new URL(absoluteAppUrl("navigation.html", origin));
  const scopeFile = String(scope || "")
    .trim()
    .replace(/^mcu_nav_nodes_/, "");
  const id = String(nodeId || "").trim();
  if (mode) {
    url.searchParams.set("mode", mode);
  }
  url.searchParams.set("pano", "1");
  if (scopeFile) {
    url.searchParams.set("scope", scopeFile);
  }
  if (id) {
    url.searchParams.set("node", id);
  }
  if (typeof yaw === "number" && Number.isFinite(yaw)) {
    url.searchParams.set("yaw", String(Math.round(yaw * 100) / 100));
  }
  if (typeof pitch === "number" && Number.isFinite(pitch)) {
    url.searchParams.set("pitch", String(Math.round(pitch * 100) / 100));
  }
  return url.toString();
}

/**
 * 整條路徑分享（既有參數）
 */
export function buildPathShareUrl({
  from = "",
  to = "",
  via = "",
  viaStay = "",
  mode = "visitor",
  go = false,
  origin = pageOrigin()
} = {}) {
  const url = new URL(absoluteAppUrl("navigation.html", origin));
  if (from) {
    url.searchParams.set("from", from);
  }
  if (to) {
    url.searchParams.set("to", to);
  }
  if (via) {
    url.searchParams.set("via", via);
  }
  if (viaStay) {
    url.searchParams.set("viaStay", viaStay);
  }
  if (mode) {
    url.searchParams.set("mode", mode);
  }
  if (go) {
    url.searchParams.set("go", "1");
  }
  return url.toString();
}

export async function copyTextToClipboard(text) {
  if (!text) {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
