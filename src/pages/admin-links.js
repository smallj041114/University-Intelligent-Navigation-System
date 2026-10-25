import { adminFetch } from "../lib/admin-fetch.js";
import {
  buildVisitorEntryUrl,
  buildPathShareUrl,
  buildPanoSpotUrl,
  copyTextToClipboard
} from "../lib/share-links.js";
import { renderQrToCanvas } from "../lib/qr-code.js";
import {
  buildNodeFileScopes,
  loadBuildingsRegistry
} from "../lib/visitor-starts.js";
import { NavArrowSettings } from "../lib/nav-arrow-settings.js";

const visitorUrlEl = document.getElementById("visitorUrl");
const pathShareUrlEl = document.getElementById("pathShareUrl");
const spotUrlEl = document.getElementById("spotUrl");
const spotPresetSelect = document.getElementById("spotPresetSelect");
const spotEmptyHint = document.getElementById("spotEmptyHint");
const pathShareSuggestions = document.getElementById("pathShareSuggestions");
const qrCanvas = document.getElementById("qrCanvas");
const qrStatus = document.getElementById("qrStatus");
const qrDownloadLink = document.getElementById("qrDownloadLink");
const linksStatus = document.getElementById("linksStatus");

/** @type {Array<{ id: string, label: string, scope: string, nodeId: string, nodeName: string, yaw: number, pitch: number, createdAt: number }>} */
let spotPresets = [];

/** admin 頁在 /admin/，必須用站台根路徑，不能用 ./data/ */
function dataUrl(path) {
  const clean = String(path || "").replace(/^\.\//, "").replace(/^\//, "");
  return `/${clean}`;
}

async function requireAdmin() {
  const res = await adminFetch("/api/admin/session", { cache: "no-store" });
  if (!res.ok) {
    location.replace("/admin/login.html?next=" + encodeURIComponent("/admin/links.html"));
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (data.role !== "admin" && data.role !== "qr" && data.role !== "qr_notice") {
    location.replace("/admin/login.html?next=" + encodeURIComponent("/admin/links.html"));
    throw new Error("unauthorized");
  }
  return data.role === "admin" || data.role === "qr" || data.role === "qr_notice" ? data.role : null;
}

function applyRoleChrome(role) {
  const homeBack = document.getElementById("adminHomeBackLink");
  // 二級沒有後台首頁權限
  homeBack?.classList.toggle("hidden", role !== "admin");
  const noticesLink = document.getElementById("adminFooterNoticesLink");
  noticesLink?.classList.toggle("hidden", role !== "admin" && role !== "qr_notice");
}

function setupLogout() {
  document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } catch {
      /* 仍導向登入頁 */
    }
    location.replace("/admin/login.html");
  });
}

function setStatus(text) {
  if (linksStatus) {
    linksStatus.textContent = text || "";
  }
}

async function copyUrl(inputEl, label) {
  const url = inputEl?.value?.trim() || "";
  if (!url) {
    setStatus(`沒有可複製的${label}`);
    return;
  }
  const ok = await copyTextToClipboard(url);
  setStatus(ok ? `已複製${label}` : `複製失敗，請手動選取欄位內容`);
}

async function showQr(url, label) {
  if (!url || !qrCanvas) {
    return;
  }
  try {
    await renderQrToCanvas(url, qrCanvas, { width: 240 });
    if (qrStatus) {
      qrStatus.textContent = `${label} QR 已產生（可右鍵另存或下載）`;
    }
    if (qrDownloadLink) {
      qrDownloadLink.href = qrCanvas.toDataURL("image/png");
      qrDownloadLink.download = `${label.replace(/\s+/g, "-")}-qr.png`;
      qrDownloadLink.classList.remove("hidden");
    }
    setStatus(`已產生 ${label} QR`);
  } catch (error) {
    console.warn(error);
    setStatus("QR 產生失敗");
  }
}

function refreshVisitorUrl() {
  if (visitorUrlEl) {
    visitorUrlEl.value = buildVisitorEntryUrl();
  }
}

function refreshPathShareUrl() {
  if (!pathShareUrlEl) {
    return;
  }
  pathShareUrlEl.value = buildPathShareUrl({
    from: document.getElementById("pathFromInput")?.value?.trim() || "",
    to: document.getElementById("pathToInput")?.value?.trim() || "",
    via: document.getElementById("pathViaInput")?.value?.trim() || "",
    mode: "visitor",
    go: Boolean(document.getElementById("pathGoCheck")?.checked)
  });
}

function selectedSpotPreset() {
  const id = spotPresetSelect?.value || "";
  return spotPresets.find((s) => s.id === id) || null;
}

function refreshSpotUrl() {
  if (!spotUrlEl) {
    return;
  }
  const spot = selectedSpotPreset();
  spotUrlEl.value = spot
    ? buildPanoSpotUrl({
        scope: spot.scope,
        nodeId: spot.nodeId,
        yaw: spot.yaw,
        pitch: spot.pitch,
        mode: "visitor"
      })
    : "";
}

function fillSpotPresetSelect(preferredId = "") {
  if (!spotPresetSelect) {
    return;
  }
  const keepId = preferredId || spotPresetSelect.value;
  spotPresetSelect.innerHTML = "";
  if (!spotPresets.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（尚無已存據點）";
    spotPresetSelect.appendChild(opt);
    spotEmptyHint?.classList.remove("hidden");
  } else {
    spotEmptyHint?.classList.add("hidden");
    spotPresets.forEach((spot) => {
      const opt = document.createElement("option");
      opt.value = spot.id;
      const yawText = Number.isFinite(spot.yaw) ? ` · 面向 ${Math.round(spot.yaw)}°` : "";
      opt.textContent = `${spot.label}${yawText}`;
      spotPresetSelect.appendChild(opt);
    });
    if (keepId && spotPresets.some((s) => s.id === keepId)) {
      spotPresetSelect.value = keepId;
    }
  }
  refreshSpotUrl();
}

async function loadBuildingsForAdmin() {
  try {
    const res = await fetch(dataUrl("data/buildings.json"), { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    /* fallback */
  }
  return loadBuildingsRegistry();
}

async function loadPathShareSuggestions() {
  if (!pathShareSuggestions) {
    return;
  }
  try {
    const buildings = await loadBuildingsForAdmin();
    const scopes = buildNodeFileScopes(buildings).filter((scope) => scope && scope !== "campus");
    const names = new Set();
    await Promise.all(
      scopes.map(async (scope) => {
        try {
          const res = await fetch(dataUrl(`data/nodes/${scope}.json`), { cache: "no-store" });
          if (!res.ok) {
            return;
          }
          const parsed = await res.json();
          (Array.isArray(parsed) ? parsed : []).forEach((p) => {
            const name = String(p?.name || "").trim();
            if (name) {
              names.add(name);
            }
          });
        } catch {
          /* ignore */
        }
      })
    );
    pathShareSuggestions.innerHTML = [...names]
      .sort((a, b) => a.localeCompare(b, "zh-Hant"))
      .map((name) => `<option value="${name.replace(/"/g, "&quot;")}"></option>`)
      .join("");
  } catch (error) {
    console.warn(error);
  }
}

function loadSpotPresetsFromSettings() {
  spotPresets = NavArrowSettings.normalizePanoSpotPresets(
    NavArrowSettings.load()?.panoSpotPresets
  );
  fillSpotPresetSelect();
  setStatus(
    spotPresets.length
      ? `已載入 ${spotPresets.length} 個已存據點`
      : "尚無已存據點；請到導覽環景按「儲存據點面向」"
  );
}

async function deleteSelectedSpot() {
  const spot = selectedSpotPreset();
  if (!spot) {
    setStatus("請先選擇要刪除的據點");
    return;
  }
  if (!confirm(`確定刪除「${spot.label}」？`)) {
    return;
  }
  try {
    setStatus("刪除中…");
    const next = spotPresets.filter((s) => s.id !== spot.id);
    const saved = await NavArrowSettings.saveAndPersist({
      ...NavArrowSettings.load(),
      panoSpotPresets: next
    });
    spotPresets = NavArrowSettings.normalizePanoSpotPresets(saved.panoSpotPresets);
    fillSpotPresetSelect();
    setStatus(`已刪除「${spot.label}」`);
  } catch (error) {
    console.warn(error);
    setStatus("刪除失敗，請確認已登入且伺服器可用");
  }
}

function bindUi() {
  refreshVisitorUrl();
  refreshPathShareUrl();

  document.getElementById("visitorCopyBtn")?.addEventListener("click", () =>
    void copyUrl(visitorUrlEl, "訪客入口連結")
  );
  document.getElementById("visitorQrBtn")?.addEventListener("click", () =>
    void showQr(visitorUrlEl?.value || "", "訪客入口")
  );

  ["pathFromInput", "pathToInput", "pathViaInput", "pathGoCheck"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", refreshPathShareUrl);
    document.getElementById(id)?.addEventListener("change", refreshPathShareUrl);
  });
  document.getElementById("pathShareCopyBtn")?.addEventListener("click", () =>
    void copyUrl(pathShareUrlEl, "路徑分享連結")
  );
  document.getElementById("pathShareQrBtn")?.addEventListener("click", () =>
    void showQr(pathShareUrlEl?.value || "", "路徑分享")
  );

  spotPresetSelect?.addEventListener("change", refreshSpotUrl);
  document.getElementById("spotCopyBtn")?.addEventListener("click", () =>
    void copyUrl(spotUrlEl, "據點環景連結")
  );
  document.getElementById("spotQrBtn")?.addEventListener("click", () => {
    const spot = selectedSpotPreset();
    void showQr(spotUrlEl?.value || "", spot?.label || "據點環景");
  });
  document.getElementById("spotDeleteBtn")?.addEventListener("click", () => {
    void deleteSelectedSpot();
  });
}

async function main() {
  const role = await requireAdmin();
  applyRoleChrome(role);
  setupLogout();
  await NavArrowSettings.init();
  bindUi();
  loadSpotPresetsFromSettings();
  void loadPathShareSuggestions();
  refreshVisitorUrl();
  refreshPathShareUrl();
}

main().catch((error) => {
  console.error(error);
  setStatus("載入失敗，請重新整理或重新登入");
});
