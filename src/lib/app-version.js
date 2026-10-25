/**
 * 系統版號（與 package.json 的 version 同步；Vite 會注入 __APP_VERSION__）
 */
export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__
    ? String(__APP_VERSION__)
    : "0.2.0";

export function formatAppVersionLabel(version = APP_VERSION) {
  const v = String(version || "").trim() || "0.0.0";
  return v.startsWith("v") || v.startsWith("V") ? v : `v${v}`;
}
