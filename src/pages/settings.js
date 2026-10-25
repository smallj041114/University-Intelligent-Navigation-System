import pannellumReady from "../lib/pannellum-loader.js";
import { NavArrowSettings } from "../lib/nav-arrow-settings.js";
import { BuildingsStore, defaultFloorImageForBuilding, isValidFloorId, migrateLegacyCampusBuildingData, nextFloorId } from "../lib/buildings-store.js";
import { PanoramaViewer } from "../lib/panorama.js";
import {
  confirmAlsoDeleteNodeFiles,
  deleteNodeScopeFile,
  deleteNodeScopeFiles,
  listBuildingFloorScopes
} from "../lib/node-scope-api.js";
import {
  createVisitorStart,
  findNodeOption,
  getDefaultCampusBuildingHotspot,
  loadNodeOptions,
  MAP_LOCATE_START,
  normalizeIndoorEntry,
  normalizeStartAlias,
  normalizeVisitorDefaultStartId,
  normalizeVisitorStarts,
  stripCampusBuildingHotspots
} from "../lib/visitor-starts.js";
import { adminFetch } from "../lib/admin-fetch.js";

const PREVIEW_PANORAMA = "./images/S/1F/s1001.jpg";
const PREVIEW_HOTSPOT_YAW = 12;

async function ensureAdmin() {
  const res = await adminFetch("/api/admin/session", { cache: "no-store" });
  if (!res.ok) {
    location.replace("/admin/login.html?next=" + encodeURIComponent("/settings.html"));
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

function readFormSettings() {
  const current = NavArrowSettings.load();
  return {
    ...current,
    size: Number(document.getElementById("arrowSize").value),
    opacity: Number(document.getElementById("arrowOpacity").value),
    pitch: Number(document.getElementById("arrowPitch").value),
    turnDurationSec: Number(document.getElementById("turnDuration").value),
    floorChangeDurationSec: Number(document.getElementById("floorChangeDuration").value),
    centerPathNextArrow: document.getElementById("centerPathNextArrow").checked,
    playDelayMinSec: Number(document.getElementById("playDelayMin").value),
    playDelayMaxSec: Number(document.getElementById("playDelayMax").value),
    playDelayDefaultSec: Number(document.getElementById("playDelayDefault").value),
    mapMetersPerPercent: Number(document.getElementById("mapMetersPerPercent").value),
    hudOpacity: Number(document.getElementById("hudOpacity").value),
    hudScale: Number(document.getElementById("hudScale").value),
    hudCorner: document.getElementById("hudCorner").value,
    minimapScale: Number(document.getElementById("minimapScale").value),
    minimapCorner: document.getElementById("minimapCorner").value,
    visitorSearchHidePathNodes: document.getElementById("visitorSearchHidePathNodes")?.checked !== false,
    visitorDefaultStartId: document.getElementById("visitorDefaultStartId")?.value || "map_locate"
  };
}

function updateOutputLabels(settings) {
  document.getElementById("arrowSizeValue").textContent = `${settings.size} px`;
  document.getElementById("arrowOpacityValue").textContent = settings.opacity.toFixed(2);
  document.getElementById("arrowPitchValue").textContent = `${settings.pitch}°`;
  document.getElementById("turnDurationValue").textContent = `${Number(settings.turnDurationSec).toFixed(1)} 秒`;
  document.getElementById("floorChangeDurationValue").textContent = `${Number(settings.floorChangeDurationSec).toFixed(1)} 秒`;
  document.getElementById("playDelayMinValue").textContent = `${Number(settings.playDelayMinSec).toFixed(1)} 秒`;
  document.getElementById("playDelayMaxValue").textContent = `${Number(settings.playDelayMaxSec).toFixed(1)} 秒`;
  document.getElementById("playDelayDefaultValue").textContent = `${Number(settings.playDelayDefaultSec).toFixed(1)} 秒`;
  document.getElementById("mapMetersPerPercentValue").textContent = `${Number(settings.mapMetersPerPercent).toFixed(2)} 公尺`;
  document.getElementById("hudOpacityValue").textContent = Number(settings.hudOpacity).toFixed(2);
  document.getElementById("hudScaleValue").textContent = `${Math.round(Number(settings.hudScale) * 100)}%`;
  document.getElementById("minimapScaleValue").textContent = `${Math.round(Number(settings.minimapScale) * 100)}%`;
}

function fillForm(settings) {
  document.getElementById("arrowSize").value = String(settings.size);
  document.getElementById("arrowOpacity").value = String(settings.opacity);
  document.getElementById("arrowPitch").value = String(settings.pitch);
  document.getElementById("turnDuration").value = String(settings.turnDurationSec);
  document.getElementById("floorChangeDuration").value = String(settings.floorChangeDurationSec);
  document.getElementById("centerPathNextArrow").checked = Boolean(settings.centerPathNextArrow);
  document.getElementById("playDelayMin").value = String(settings.playDelayMinSec);
  document.getElementById("playDelayMax").value = String(settings.playDelayMaxSec);
  document.getElementById("playDelayDefault").value = String(settings.playDelayDefaultSec);
  document.getElementById("mapMetersPerPercent").value = String(settings.mapMetersPerPercent);
  document.getElementById("hudOpacity").value = String(settings.hudOpacity);
  document.getElementById("hudScale").value = String(settings.hudScale);
  document.getElementById("hudCorner").value = settings.hudCorner;
  document.getElementById("minimapScale").value = String(settings.minimapScale);
  document.getElementById("minimapCorner").value = settings.minimapCorner;
  const hidePathNodes = document.getElementById("visitorSearchHidePathNodes");
  if (hidePathNodes) {
    hidePathNodes.checked = settings.visitorSearchHidePathNodes !== false;
  }
  updateOutputLabels(settings);
  NavArrowSettings.applyOverlayStyle(settings);
  renderCampusBuildingsEditor();
  renderIndoorEntryEditor(settings.indoorEntry);
  renderVisitorStartsEditor(settings.visitorStarts);
  fillVisitorDefaultStartSelect(settings.visitorDefaultStartId, settings.visitorStarts);
}

function setStatus(message) {
  const status = document.getElementById("arrowSettingsStatus");
  if (status) {
    status.textContent = message;
  }
}

const SETTINGS_TAB_KEY = "mcu_settings_tab";
const SETTINGS_TABS = ["look", "play", "buildings", "visitor", "check"];
const SETTINGS_TABS_WITH_PREVIEW = new Set(["look"]);

function refreshSettingsPreviewLayout() {
  const run = () => {
    const viewer = PanoramaViewer.viewerInstance;
    if (viewer && typeof viewer.resize === "function") {
      viewer.resize();
    }
    syncPreviewOverlayPlane();
    syncPreviewMinimapLayout();
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function applySettingsTab(tabId, { persist = true } = {}) {
  const next = SETTINGS_TABS.includes(tabId) ? tabId : "look";
  document.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    const selected = btn.dataset.settingsTab === next;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    btn.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== next;
  });
  document.getElementById("arrowSettingsLayout")?.classList.toggle(
    "is-wide-panel",
    !SETTINGS_TABS_WITH_PREVIEW.has(next)
  );
  if (persist) {
    try {
      localStorage.setItem(SETTINGS_TAB_KEY, next);
    } catch {
      /* ignore quota / private mode */
    }
  }
  if (SETTINGS_TABS_WITH_PREVIEW.has(next)) {
    refreshSettingsPreviewLayout();
  }
}

function bindSettingsTabs() {
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => applySettingsTab(btn.dataset.settingsTab));
    btn.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      event.preventDefault();
      const index = tabs.indexOf(btn);
      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + dir + tabs.length) % tabs.length];
      next.focus();
      applySettingsTab(next.dataset.settingsTab);
    });
  });
}

function restoreSettingsTab() {
  let stored = "look";
  try {
    stored = localStorage.getItem(SETTINGS_TAB_KEY) || "look";
  } catch {
    stored = "look";
  }
  applySettingsTab(stored, { persist: false });
}

let nodeOptionGroups = [];

function nodeSelectValue(start) {
  if (start.image) {
    return `image:${start.image}`;
  }
  if (start.query) {
    return `query:${start.query}`;
  }
  return "";
}

function optionValueForNode(node) {
  return node.image ? `image:${node.image}` : `query:${node.name}`;
}

function applyNodeToStart(start, value) {
  if (!value) {
    return { ...start, query: "", image: "" };
  }
  for (const group of nodeOptionGroups) {
    for (const node of group.nodes) {
      if (optionValueForNode(node) === value) {
        return {
          ...start,
          query: node.name,
          image: node.image
        };
      }
    }
  }
  return start;
}

function buildNodeSelect(options = {}) {
  const {
    selectedValue = "",
    fallbackLabel = "",
    onChange
  } = options;
  const select = document.createElement("select");
  select.className = "arrow-settings-select";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "請選擇節點／圖片";
  select.appendChild(empty);
  nodeOptionGroups.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.nodes.forEach((node) => {
      const option = document.createElement("option");
      option.value = optionValueForNode(node);
      const destHint = node.destinations[0] ? ` · ${node.destinations[0]}` : "";
      option.textContent = `${node.name}${destHint}`;
      optgroup.appendChild(option);
    });
    select.appendChild(optgroup);
  });
  if (selectedValue && ![...select.options].some((opt) => opt.value === selectedValue)) {
    const extra = document.createElement("option");
    extra.value = selectedValue;
    extra.textContent = fallbackLabel || selectedValue;
    select.appendChild(extra);
  }
  select.value = selectedValue;
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  return select;
}

function currentCampusHotspots() {
  return stripCampusBuildingHotspots(NavArrowSettings.load().campusBuildings);
}

async function persistCampusHotspots(nextHotspots) {
  await saveSettings(
    () => ({
      ...readFormSettings(),
      campusBuildings: stripCampusBuildingHotspots(nextHotspots)
    }),
    { fill: true, successMessage: "已自動儲存校園大樓熱點" }
  );
}

async function persistBuildingsStore(nextBuildings, successMessage = "已自動儲存大樓定義") {
  try {
    await BuildingsStore.saveAndPersist(nextBuildings);
    setStatus(successMessage);
    renderCampusBuildingsEditor();
  } catch {
    setStatus("大樓定義儲存失敗");
  }
}

async function createEmptyNodeScope(buildingId, floorId) {
  const scope = `${buildingId}_${floorId}`;
  try {
    const res = await adminFetch(`/api/node-scopes/${scope}`, {
      method: "POST",
      body: JSON.stringify([])
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return true;
  } catch {
    setStatus(`樓層已儲存，但無法建立空節點檔 data/nodes/${scope}.json（請確認已登入管理員）`);
    return false;
  }
}

function renderCampusBuildingsEditor() {
  const list = document.getElementById("campusBuildingsList");
  if (!list) {
    return;
  }
  const buildings = BuildingsStore.load();
  const hotspots = currentCampusHotspots();
  list.replaceChildren();

  Object.entries(buildings).forEach(([id, def]) => {
    const entry = hotspots[id] || {};
    const fallbackLabel = def.name || id;
    const card = document.createElement("article");
    card.className = "campus-building-card";

    const enabledRow = document.createElement("label");
    enabledRow.className = "campus-building-toggle";
    enabledRow.classList.toggle("is-disabled", entry?.enabled === false);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = entry?.enabled !== false;
    const enabledHint = document.createElement("span");
    enabledHint.className = "campus-building-toggle-hint";
    enabledHint.textContent = input.checked ? "訪客可進入" : "關閉：地圖上顯示灰色、不可點";
    input.addEventListener("change", () => {
      const next = { ...currentCampusHotspots(), [id]: { ...entry, enabled: input.checked } };
      persistCampusHotspots(next);
      enabledRow.classList.toggle("is-disabled", !input.checked);
      enabledHint.textContent = input.checked ? "訪客可進入" : "關閉：地圖上顯示灰色、不可點";
    });
    const enabledText = document.createElement("span");
    enabledText.textContent = `${def.name}（校園地圖熱點）`;
    enabledRow.append(input, enabledText, enabledHint);

    const nameField = document.createElement("label");
    nameField.className = "campus-building-label-field";
    const nameTitle = document.createElement("span");
    nameTitle.className = "modal-label";
    nameTitle.textContent = "大樓名稱";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "modal-input";
    nameInput.value = def.name || "";
    nameInput.placeholder = id;
    const nameHint = document.createElement("span");
    nameHint.className = "campus-building-field-hint";
    nameHint.textContent = "用於樓層標題、側欄等顯示";
    nameInput.addEventListener("change", () => {
      const nextName = nameInput.value.trim() || id;
      const nextBuildings = { ...BuildingsStore.load() };
      nextBuildings[id] = { ...nextBuildings[id], name: nextName };
      void persistBuildingsStore(nextBuildings);
    });
    nameField.append(nameTitle, nameInput, nameHint);

    const labelField = document.createElement("label");
    labelField.className = "campus-building-label-field";
    const labelTitle = document.createElement("span");
    labelTitle.className = "modal-label";
    labelTitle.textContent = "按鈕顯示名稱";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "modal-input";
    labelInput.value = entry?.label || "";
    labelInput.placeholder = fallbackLabel;
    const labelHint = document.createElement("span");
    labelHint.className = "campus-building-field-hint";
    labelHint.textContent = "校園地圖藍色按鈕文字；留空則沿用大樓名稱";
    labelInput.addEventListener("change", () => {
      const next = {
        ...currentCampusHotspots(),
        [id]: { ...entry, label: labelInput.value.trim() }
      };
      persistCampusHotspots(next);
    });
    labelField.append(labelTitle, labelInput, labelHint);

    const floorsSection = document.createElement("div");
    floorsSection.className = "campus-building-floors";
    const floorsTitle = document.createElement("h3");
    floorsTitle.className = "campus-building-floors-title";
    floorsTitle.textContent = "樓層";
    floorsSection.appendChild(floorsTitle);

    const floorsList = document.createElement("div");
    floorsList.className = "campus-building-floors-list";

    const saveBuildingFloors = (floors, message = "已自動儲存樓層設定") => {
      const nextBuildings = { ...BuildingsStore.load() };
      nextBuildings[id] = { ...nextBuildings[id], floors };
      return persistBuildingsStore(nextBuildings, message);
    };

    (def.floors || []).forEach((floor, floorIndex) => {
      const floorRow = document.createElement("article");
      floorRow.className = "campus-building-floor-row";

      const floorLabelField = document.createElement("label");
      floorLabelField.className = "campus-building-label-field";
      const floorLabelTitle = document.createElement("span");
      floorLabelTitle.className = "modal-label";
      floorLabelTitle.textContent = `樓層 ${floor.id}`;
      const floorLabelInput = document.createElement("input");
      floorLabelInput.type = "text";
      floorLabelInput.className = "modal-input";
      floorLabelInput.value = floor.label || `${floor.id}F`;
      floorLabelInput.addEventListener("change", () => {
        const nextFloors = [...(def.floors || [])];
        nextFloors[floorIndex] = {
          ...nextFloors[floorIndex],
          label: floorLabelInput.value.trim() || `${floor.id}F`
        };
        void saveBuildingFloors(nextFloors);
      });
      floorLabelField.append(floorLabelTitle, floorLabelInput);

      const floorImageField = document.createElement("label");
      floorImageField.className = "campus-building-label-field";
      const floorImageTitle = document.createElement("span");
      floorImageTitle.className = "modal-label";
      floorImageTitle.textContent = "平面圖路徑";
      const floorImageInput = document.createElement("input");
      floorImageInput.type = "text";
      floorImageInput.className = "modal-input";
      floorImageInput.value = floor.image || "";
      floorImageInput.placeholder = defaultFloorImageForBuilding(id, floor.label || `${floor.id}F`);
      floorImageInput.addEventListener("change", () => {
        const nextFloors = [...(def.floors || [])];
        const label = floorLabelInput.value.trim() || `${floor.id}F`;
        nextFloors[floorIndex] = {
          ...nextFloors[floorIndex],
          image:
            floorImageInput.value.trim() ||
            defaultFloorImageForBuilding(id, label)
        };
        void saveBuildingFloors(nextFloors);
      });
      floorImageField.append(floorImageTitle, floorImageInput);

      const deleteFloorBtn = document.createElement("button");
      deleteFloorBtn.type = "button";
      deleteFloorBtn.className = "secondary-btn campus-building-reset-btn";
      deleteFloorBtn.textContent = "刪除此樓層";
      deleteFloorBtn.addEventListener("click", async () => {
        if ((def.floors || []).length <= 1) {
          setStatus("每棟大樓至少需保留一個樓層。");
          return;
        }
        const floorLabel = floor.label || `${floor.id}F`;
        const scope = `${id}_${floor.id}`;
        if (
          !window.confirm(
            `確定要刪除「${def.name} · ${floorLabel}」嗎？\n\n接下來可選擇是否一併刪除節點檔。`
          )
        ) {
          return;
        }
        const alsoDeleteNodes = confirmAlsoDeleteNodeFiles([`data/nodes/${scope}.json`]);
        const nextFloors = (def.floors || []).filter((_, index) => index !== floorIndex);
        await saveBuildingFloors(nextFloors, `已刪除樓層「${floorLabel}」`);
        if (alsoDeleteNodes) {
          const result = await deleteNodeScopeFile(scope);
          if (!result.ok) {
            setStatus(
              result.status === 401
                ? "樓層已刪，但需管理員登入才能刪除節點檔。"
                : `樓層已刪，但無法刪除 data/nodes/${scope}.json`
            );
          } else {
            setStatus(`已刪除樓層「${floorLabel}」與節點檔`);
          }
        }
      });

      floorRow.append(floorLabelField, floorImageField, deleteFloorBtn);
      floorsList.appendChild(floorRow);
    });

    const addFloorBtn = document.createElement("button");
    addFloorBtn.type = "button";
    addFloorBtn.className = "secondary-btn campus-building-reset-btn";
    addFloorBtn.textContent = "＋ 新增樓層";
    addFloorBtn.addEventListener("click", async () => {
      const floors = [...(def.floors || [])];
      const floorId = nextFloorId(floors);
      if (!isValidFloorId(floorId)) {
        setStatus("無法產生有效的樓層代碼。");
        return;
      }
      const floorLabel = `${floorId}F`;
      const floorImage = defaultFloorImageForBuilding(id, floorLabel);
      floors.push({ id: floorId, label: floorLabel, image: floorImage });
      await saveBuildingFloors(floors, `已新增樓層「${floorLabel}」`);
      await createEmptyNodeScope(id, floorId);
    });

    floorsSection.append(floorsList, addFloorBtn);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "secondary-btn campus-building-reset-btn";
    resetBtn.textContent = "重設為預設位置";
    resetBtn.addEventListener("click", () => {
      const latestEntry = currentCampusHotspots()[id] || entry;
      const defaults = getDefaultCampusBuildingHotspot(id, def, latestEntry);
      const next = {
        ...currentCampusHotspots(),
        [id]: { ...latestEntry, xPercent: defaults.xPercent, yPercent: defaults.yPercent }
      };
      persistCampusHotspots(next);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "secondary-btn campus-building-reset-btn";
    deleteBtn.textContent = "刪除此大樓";
    deleteBtn.addEventListener("click", async () => {
      const label = entry?.label || def.name || id;
      const scopes = listBuildingFloorScopes(id, def.floors);
      if (
        !window.confirm(
          `確定要刪除「${label}」這個大樓嗎？\n\n校園地圖熱點會移除。接下來可選擇是否一併刪除節點檔。`
        )
      ) {
        return;
      }
      const alsoDeleteNodes =
        scopes.length > 0 &&
        confirmAlsoDeleteNodeFiles(scopes.map((scope) => `data/nodes/${scope}.json`));
      const nextBuildings = { ...BuildingsStore.load() };
      delete nextBuildings[id];
      const nextHotspots = { ...currentCampusHotspots() };
      delete nextHotspots[id];
      await BuildingsStore.saveAndPersist(nextBuildings);
      await persistCampusHotspots(nextHotspots);
      if (alsoDeleteNodes) {
        const results = await deleteNodeScopeFiles(scopes);
        const failed = results.filter((item) => !item.ok);
        if (failed.length) {
          setStatus(`大樓已刪，但部分節點檔刪除失敗：${failed.map((item) => item.scope).join(", ")}`);
        } else {
          setStatus(`已刪除大樓「${label}」與相關節點檔`);
        }
      }
      renderCampusBuildingsEditor();
    });

    card.append(enabledRow, nameField, labelField, floorsSection, resetBtn, deleteBtn);
    list.appendChild(card);
  });
}

function currentIndoorEntry() {
  return normalizeIndoorEntry(NavArrowSettings.load().indoorEntry);
}

async function persistIndoorEntry(nextEntry) {
  await saveSettings(
    () => ({
      ...readFormSettings(),
      indoorEntry: normalizeIndoorEntry(nextEntry)
    }),
    { fill: true, successMessage: "已自動儲存進入校內起點" }
  );
}

function renderIndoorEntryEditor(entry = currentIndoorEntry()) {
  const card = document.getElementById("indoorEntryCard");
  if (!card) {
    return;
  }
  const indoorEntry = normalizeIndoorEntry(entry);
  const matched = findNodeOption(nodeOptionGroups, indoorEntry.query);
  card.replaceChildren();

  const preview = document.createElement("div");
  preview.className = "visitor-start-card-preview";
  if (indoorEntry.image) {
    const img = document.createElement("img");
    img.src = indoorEntry.image;
    img.alt = indoorEntry.query || "進入校內起點";
    preview.appendChild(img);
  } else {
    preview.textContent = "尚未選圖";
  }

  const body = document.createElement("div");
  body.className = "visitor-start-card-body";

  const title = document.createElement("h3");
  title.className = "indoor-entry-card-title";
  title.textContent = "校外導航進入校內的起點";

  const desc = document.createElement("p");
  desc.className = "arrow-settings-hint";
  desc.textContent =
    "訪客從校外進校後，室內最短路徑會從此節點開始計算（預設校門口）。";

  const nodeField = document.createElement("label");
  nodeField.className = "visitor-start-field";
  const nodeLabel = document.createElement("span");
  nodeLabel.textContent = "對應環景節點";
  nodeField.appendChild(nodeLabel);
  const selectedValue = matched ? optionValueForNode(matched) : nodeSelectValue(indoorEntry);
  nodeField.appendChild(
    buildNodeSelect({
      selectedValue,
      fallbackLabel: indoorEntry.query || indoorEntry.image || "目前設定",
      onChange: (value) => {
        persistIndoorEntry(applyNodeToStart(indoorEntry, value));
      }
    })
  );

  const meta = document.createElement("p");
  meta.className = "arrow-settings-hint";
  meta.textContent = indoorEntry.query
    ? `室內路徑起點：${indoorEntry.query}${matched ? `（${matched.scopeLabel}）` : ""}`
    : "尚未指定節點。";

  body.append(title, desc, nodeField, meta);
  card.append(preview, body);
}

function currentVisitorStarts() {
  return normalizeVisitorStarts(NavArrowSettings.load().visitorStarts);
}

function fillVisitorDefaultStartSelect(selectedId, starts = currentVisitorStarts()) {
  const select = document.getElementById("visitorDefaultStartId");
  if (!select) {
    return;
  }
  const items = normalizeVisitorStarts(starts);
  const preferred = normalizeVisitorDefaultStartId(selectedId, items);
  select.innerHTML = "";
  const options = [
    { id: MAP_LOCATE_START.id, label: MAP_LOCATE_START.label },
    ...items.map((item) => ({
      id: item.id,
      label: item.enabled === false ? `${item.label}（已關閉顯示）` : item.label
    }))
  ];
  options.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.id;
    el.textContent = opt.label;
    select.appendChild(el);
  });
  select.value = preferred;
}

async function persistVisitorStarts(nextStarts, { defaultStartId } = {}) {
  const starts = normalizeVisitorStarts(nextStarts);
  const currentDefault =
    defaultStartId ??
    document.getElementById("visitorDefaultStartId")?.value ??
    NavArrowSettings.load().visitorDefaultStartId;
  const nextDefault = normalizeVisitorDefaultStartId(currentDefault, starts);
  await saveSettings(
    () => ({
      ...readFormSettings(),
      visitorStarts: starts,
      visitorDefaultStartId: nextDefault
    }),
    { fill: true, successMessage: "已自動儲存起點" }
  );
}

function moveVisitorStart(index, delta) {
  const next = currentVisitorStarts();
  const target = index + delta;
  if (target < 0 || target >= next.length) {
    return;
  }
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  persistVisitorStarts(next);
}

function renderVisitorStartsEditor(starts = currentVisitorStarts()) {
  const list = document.getElementById("visitorStartsList");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  const items = normalizeVisitorStarts(starts);
  fillVisitorDefaultStartSelect(
    document.getElementById("visitorDefaultStartId")?.value ||
      NavArrowSettings.load().visitorDefaultStartId,
    items
  );
  items.forEach((start, index) => {
    const matched = findNodeOption(nodeOptionGroups, start.query);
    const card = document.createElement("article");
    card.className = "visitor-start-card";
    card.classList.toggle("is-disabled", start.enabled === false);

    const preview = document.createElement("div");
    preview.className = "visitor-start-card-preview";
    if (start.image) {
      const img = document.createElement("img");
      img.src = start.image;
      img.alt = start.label;
      preview.appendChild(img);
    } else {
      preview.textContent = "尚未選圖";
    }

    const body = document.createElement("div");
    body.className = "visitor-start-card-body";

    const orderRow = document.createElement("div");
    orderRow.className = "visitor-start-order-row";
    const orderLabel = document.createElement("span");
    orderLabel.className = "visitor-start-order-label";
    orderLabel.textContent = `順序 ${index + 1}`;
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "secondary-btn visitor-start-order-btn";
    upBtn.textContent = "上移";
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => moveVisitorStart(index, -1));
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "secondary-btn visitor-start-order-btn";
    downBtn.textContent = "下移";
    downBtn.disabled = index === items.length - 1;
    downBtn.addEventListener("click", () => moveVisitorStart(index, 1));
    orderRow.append(orderLabel, upBtn, downBtn);

    const enabledField = document.createElement("label");
    enabledField.className = "visitor-start-field visitor-start-enabled-field";
    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.checked = start.enabled !== false;
    enabledInput.addEventListener("change", () => {
      const next = currentVisitorStarts();
      next[index] = { ...next[index], enabled: enabledInput.checked };
      persistVisitorStarts(next);
    });
    const enabledText = document.createElement("span");
    enabledText.textContent = "顯示於訪客頁（關閉後按鈕變灰且無法選取）";
    enabledField.append(enabledInput, enabledText);

    const labelField = document.createElement("label");
    labelField.className = "visitor-start-field";
    labelField.innerHTML = `<span>按鈕名稱</span>`;
    const labelInput = document.createElement("input");
    labelInput.className = "modal-input";
    labelInput.type = "text";
    labelInput.value = start.label;
    labelInput.addEventListener("change", () => {
      const next = currentVisitorStarts();
      next[index] = { ...next[index], label: labelInput.value.trim() || `起點 ${index + 1}` };
      persistVisitorStarts(next);
    });
    labelField.appendChild(labelInput);

    const aliasField = document.createElement("label");
    aliasField.className = "visitor-start-field";
    aliasField.innerHTML = `<span>網址代碼（英文）</span>`;
    const aliasInput = document.createElement("input");
    aliasInput.className = "modal-input";
    aliasInput.type = "text";
    aliasInput.placeholder = "例如：gate、library";
    aliasInput.autocomplete = "off";
    aliasInput.spellcheck = false;
    aliasInput.value = start.alias || "";
    aliasInput.addEventListener("change", () => {
      const next = currentVisitorStarts();
      let alias = normalizeStartAlias(aliasInput.value);
      if (alias) {
        const duplicated = next.some(
          (item, itemIndex) => itemIndex !== index && normalizeStartAlias(item.alias) === alias
        );
        if (duplicated) {
          setStatus(`網址代碼「${alias}」已被其他起點使用，請換一個`);
          aliasInput.value = next[index].alias || "";
          return;
        }
      }
      next[index] = { ...next[index], alias };
      aliasInput.value = alias;
      persistVisitorStarts(next);
    });
    aliasField.appendChild(aliasInput);
    const aliasHint = document.createElement("p");
    aliasHint.className = "arrow-settings-hint";
    aliasHint.textContent = start.alias
      ? `分享連結會用 from=${start.alias}`
      : start.query
        ? `不填則用節點名稱 from=${start.query}`
        : "選填。不填則用環景節點實際名稱；填了可用英文如 from=gate";
    aliasField.appendChild(aliasHint);

    const nodeField = document.createElement("label");
    nodeField.className = "visitor-start-field";
    nodeField.innerHTML = `<span>對應環景圖</span>`;
    const selectedValue = matched ? optionValueForNode(matched) : nodeSelectValue(start);
    nodeField.appendChild(
      buildNodeSelect({
        selectedValue,
        fallbackLabel: start.query || start.image || "目前設定",
        onChange: (value) => {
          const next = currentVisitorStarts();
          next[index] = applyNodeToStart(next[index], value);
          persistVisitorStarts(next);
        }
      })
    );

    const meta = document.createElement("p");
    meta.className = "arrow-settings-hint";
    meta.textContent = start.query
      ? `路徑起點：${start.query}${matched ? `（${matched.scopeLabel}）` : ""}`
      : "尚未指定節點，訪客頁不會顯示此按鈕。";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "secondary-btn visitor-start-remove-btn";
    removeBtn.textContent = "刪除";
    removeBtn.addEventListener("click", () => {
      const next = currentVisitorStarts().filter((_, itemIndex) => itemIndex !== index);
      persistVisitorStarts(next);
    });

    body.append(orderRow, enabledField, labelField, aliasField, nodeField, meta, removeBtn);
    card.append(preview, body);
    list.appendChild(card);
  });
}

function renderIssueList(title, items, kind) {
  const wrap = document.createElement("section");
  wrap.className = `data-validate-block data-validate-${kind}`;
  const heading = document.createElement("h3");
  heading.textContent = `${title}（${items.length}）`;
  wrap.appendChild(heading);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "data-validate-empty";
    empty.textContent = "無";
    wrap.appendChild(empty);
    return wrap;
  }
  const list = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.message || String(item);
    list.appendChild(li);
  });
  wrap.appendChild(list);
  return wrap;
}

function bindDataValidateControls() {
  const btn = document.getElementById("dataValidateBtn");
  const out = document.getElementById("dataValidateResult");
  const reverseBox = document.getElementById("dataValidateReverse");
  if (!btn || !out) {
    return;
  }
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    out.classList.remove("hidden");
    out.replaceChildren();
    const loading = document.createElement("p");
    loading.textContent = "檢查中…";
    out.appendChild(loading);
    try {
      const reverse = reverseBox?.checked ? "1" : "0";
      const res = await adminFetch(`/api/validate?reverse=${reverse}`, {
        cache: "no-store"
      });
      if (res.status === 401) {
        throw new Error("請重新從管理頁登入。");
      }
      if (!res.ok) {
        throw new Error(`檢查失敗（HTTP ${res.status}）`);
      }
      const data = await res.json();
      const buildings = data.buildings || { errors: [], warnings: [], scanned: {} };
      const nodes = data.nodes || { errors: [], warnings: [], scanned: {} };
      out.replaceChildren();
      const summary = document.createElement("p");
      summary.className = data.ok ? "data-validate-ok" : "data-validate-fail";
      const bScan = buildings.scanned || {};
      const nScan = nodes.scanned || {};
      const buildingWarn = (buildings.warnings || []).length;
      const nodeWarn = (nodes.warnings || []).length;
      summary.textContent = data.ok
        ? `通過：${bScan.buildings || 0} 棟大樓、${nScan.points || 0} 個節點（大樓警告 ${buildingWarn}、節點警告 ${nodeWarn}）`
        : `未通過：請先處理錯誤。大樓 ${bScan.buildings || 0} 棟、節點 ${nScan.points || 0}。`;
      out.append(
        summary,
        renderIssueList("大樓／熱點錯誤", buildings.errors || [], "error"),
        renderIssueList("大樓／熱點警告", buildings.warnings || [], "warn"),
        renderIssueList("節點連線錯誤", nodes.errors || [], "error"),
        renderIssueList("節點／圖檔／目的地警告", nodes.warnings || [], "warn")
      );
    } catch (error) {
      out.replaceChildren();
      const fail = document.createElement("p");
      fail.className = "data-validate-fail";
      fail.textContent = error.message || "檢查失敗";
      out.appendChild(fail);
    } finally {
      btn.disabled = false;
    }
  });
}

function bindVisitorStartControls() {
  document.getElementById("visitorStartAddBtn")?.addEventListener("click", () => {
    const next = currentVisitorStarts();
    next.push(createVisitorStart(next.length));
    persistVisitorStarts(next);
  });
}

async function saveSettings(getSettings, options = {}) {
  const fill = options.fill === true;
  const successMessage = options.successMessage || "已自動儲存";
  try {
    const saved = await NavArrowSettings.saveAndPersist(getSettings());
    if (fill) {
      fillForm(saved);
    } else {
      updateOutputLabels(saved);
    }
    setStatus(successMessage);
  } catch {
    const localOnly = NavArrowSettings.load();
    if (fill) {
      fillForm(localOnly);
    } else {
      updateOutputLabels(localOnly);
    }
    setStatus("儲存失敗，僅暫存於目前瀏覽器");
  }
}

function bindControls() {
  ["arrowSize", "arrowOpacity", "arrowPitch", "turnDuration", "floorChangeDuration", "hudOpacity", "hudScale", "minimapScale"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      saveSettings(readFormSettings);
    });
  });

  document.getElementById("centerPathNextArrow").addEventListener("change", () => {
    saveSettings(readFormSettings);
  });

  document.getElementById("visitorSearchHidePathNodes")?.addEventListener("change", () => {
    saveSettings(readFormSettings);
  });

  document.getElementById("visitorDefaultStartId")?.addEventListener("change", () => {
    saveSettings(readFormSettings, { fill: true, successMessage: "已更新預設起點" });
  });

  document.getElementById("hudCorner").addEventListener("change", () => {
    saveSettings(readFormSettings, { fill: true });
  });

  document.getElementById("minimapCorner").addEventListener("change", () => {
    saveSettings(readFormSettings, { fill: true });
  });

  ["playDelayMin", "playDelayMax", "playDelayDefault", "mapMetersPerPercent"].forEach((id) => {
    const input = document.getElementById(id);
    const saveBounds = () => {
      saveSettings(readFormSettings, { fill: true });
    };
    input.addEventListener("change", saveBounds);
    input.addEventListener("blur", saveBounds);
  });

  document.getElementById("arrowSettingsReset").addEventListener("click", async () => {
    const ok = window.confirm(
      "確定要重設為預設值？\n\n會還原環景外觀、播放、訪客起點與大樓熱點等設定，且寫回伺服器。\n不會刪除節點檔。\n\n按「取消」可中止。"
    );
    if (!ok) {
      return;
    }
    try {
      const defaults = await NavArrowSettings.resetAndPersist();
      fillForm(defaults);
      setStatus("已重設為預設值");
    } catch {
      fillForm(NavArrowSettings.load());
      setStatus("重設失敗，僅暫存於目前瀏覽器");
    }
  });
  bindVisitorStartControls();
  bindDataValidateControls();
  bindSettingsTabs();
}

async function mountPreview() {
  const settings = NavArrowSettings.load();
  NavArrowSettings.applyToViewer(settings);
  await PanoramaViewer.mount("arrowPreviewViewer", PREVIEW_PANORAMA, {
    hotspots: [
      {
        yaw: PREVIEW_HOTSPOT_YAW,
        text: "→ 預覽節點",
        shortLabel: "預覽節點",
        targetId: "__preview__"
      }
    ],
    onNavigate: () => {}
  });
  const wrap = document.getElementById("previewOverlayPlane");
  syncPreviewOverlayPlane();
  NavArrowSettings.applyOverlayStyle(settings);
  syncPreviewMinimapLayout();
  window.addEventListener("resize", () => {
    syncPreviewOverlayPlane();
    syncPreviewMinimapLayout();
  });
  NavArrowSettings.bindOverlayDrag(document.getElementById("hudSettingsPreview"), {
    wrap,
    kind: "hud",
    onAfterSave: (saved) => {
      document.getElementById("hudCorner").value = saved.hudCorner;
      setStatus("已自動儲存位置");
    },
    onSaveError: () => {
      document.getElementById("hudCorner").value = NavArrowSettings.load().hudCorner;
      setStatus("位置儲存失敗，僅暫存於目前瀏覽器");
    }
  });
  NavArrowSettings.bindOverlayDrag(document.getElementById("minimapSettingsPreview"), {
    wrap,
    kind: "minimap",
    onAfterSave: (saved) => {
      document.getElementById("minimapCorner").value = saved.minimapCorner;
      setStatus("已自動儲存位置");
    },
    onSaveError: () => {
      document.getElementById("minimapCorner").value = NavArrowSettings.load().minimapCorner;
      setStatus("位置儲存失敗，僅暫存於目前瀏覽器");
    }
  });
}

function syncPreviewOverlayPlane() {
  const wrap = document.querySelector(".arrow-preview-viewer-wrap");
  const plane = document.getElementById("previewOverlayPlane");
  if (!wrap || !plane) {
    return;
  }
  const playW = Math.max(320, window.innerWidth);
  const fit = wrap.clientWidth / playW;
  plane.style.width = "";
  plane.style.height = "";
  plane.style.transform = "";
  plane.style.setProperty("--preview-fit-scale", String(fit));
}

function syncPreviewMinimapLayout() {
  const minimap = document.getElementById("minimapSettingsPreview");
  const stage = minimap?.querySelector(".panorama-minimap-stage");
  const mapStage = minimap?.querySelector(".panorama-minimap-map-stage");
  const img = mapStage?.querySelector(".panorama-minimap-image");
  if (!stage || !mapStage || !img) {
    return;
  }
  const applySize = () => {
    const containerW = stage.clientWidth - 8;
    const maxHeight = 156;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!containerW || !nw || !nh) {
      return;
    }
    const scale = Math.min(containerW / nw, maxHeight / nh);
    mapStage.style.width = `${Math.max(1, Math.round(nw * scale))}px`;
    mapStage.style.height = `${Math.max(1, Math.round(nh * scale))}px`;
  };
  if (img.complete && img.naturalWidth) {
    applySize();
  } else {
    img.addEventListener("load", applySize, { once: true });
  }
}

ensureAdmin()
  .then(() => NavArrowSettings.init())
  .then(() => BuildingsStore.init())
  .then(() => migrateLegacyCampusBuildingData(NavArrowSettings))
  .then(() => loadNodeOptions())
  .then((groups) => {
    nodeOptionGroups = groups;
  })
  .then(() => pannellumReady)
  .then(() => {
    const settings = NavArrowSettings.load();
    fillForm(settings);
    bindControls();
    return mountPreview();
  })
  .then(() => {
    restoreSettingsTab();
  })
  .catch((error) => {
    if (error.message === "unauthorized") {
      return;
    }
    document.body.insertAdjacentHTML(
      "beforeend",
      '<p class="arrow-settings-error">無法載入環景預覽。請確認 vendor/pannellum 存在，或連上網路後重新整理。</p>'
    );
  });
