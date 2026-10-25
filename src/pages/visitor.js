import { NavArrowSettings } from "../lib/nav-arrow-settings.js";
import {
  collectVisitorPathPanoramaUrls,
  clampWaypointStaySeconds,
  encodeWaypointStayList,
  DEFAULT_WAYPOINT_STAY_SECONDS
} from "../lib/navigation-graph.js";
import { panoramaPrefetchQueue } from "../lib/panorama-prefetch-queue.js";
import { saveVisitorPrefetchUrls } from "../lib/visitor-prefetch-session.js";
import { reportVisitorPresence } from "../lib/visitor-presence.js";
import { formatAppVersionLabel } from "../lib/app-version.js";
import {
  MAP_LOCATE_START,
  loadNodeOptions,
  loadVisitorSearchEntries,
  normalizeVisitorStarts,
  resolveVisitorDefaultStart,
  encodeNavQueryForUrl,
  encodeNavQueryListForUrl,
  encodeVisitorStartForUrl
} from "../lib/visitor-starts.js";

reportVisitorPresence("visitor");

const visitorAppVersionEl = document.getElementById("visitorAppVersion");
if (visitorAppVersionEl) {
  visitorAppVersionEl.textContent = formatAppVersionLabel();
}
const OTHER_START = {
  id: "other_search",
  label: "其他",
  query: "",
  image: ""
};

const destInput = document.getElementById("visitorDestInput");
const destResults = document.getElementById("visitorDestResults");
const startBtn = document.getElementById("visitorStartBtn");
const shareBtn = document.getElementById("visitorShareBtn");
const statusEl = document.getElementById("visitorStatus");
const routeSummaryEl = document.getElementById("visitorRouteSummary");
const presetsEl = document.getElementById("visitorStartPresets");
const startOtherWrap = document.getElementById("visitorStartOtherWrap");
const startInput = document.getElementById("visitorStartInput");
const startResults = document.getElementById("visitorStartResults");

let startPresets = [];
let selectedStart = null;
/** @type {{ name: string, locations: string[] } | null} */
let selectedDestination = null;
/** @type {{ name: string, locations: string[] }[]} */
let destinationGroups = [];
/** @type {{ id: string, label: string, query: string, location: string }[]} */
let startSearchOptions = [];

const VISITOR_PREFETCH_MAX_STATIONS = 8;
const VISITOR_PREFETCH_DEBOUNCE_MS = 300;
const VISITOR_WAYPOINT_SOFT_MAX = 20;
let visitorPrefetchTimer = null;
let visitorPrefetchGeneration = 0;
let lastVisitorPrefetchUrls = [];
let visitorWaypointIdSeq = 0;

function hideWaypointResults(exceptRow = null) {
  document.querySelectorAll("#visitorWaypointsList .visitor-waypoint-results").forEach((list) => {
    if (exceptRow && exceptRow.contains(list)) {
      return;
    }
    list.hidden = true;
    list.innerHTML = "";
  });
}

function matchWaypointGroups(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return destinationGroups.slice(0, 12);
  }
  return matchDestinationGroups(query);
}

function resolveWaypointQuery(typed) {
  const exactDest = findExactDestination(typed);
  if (exactDest?.name) {
    return exactDest.name;
  }
  const exactStart = findExactStart(typed);
  return exactStart?.query || "";
}

function getVisitorWaypointStops() {
  return Array.from(document.querySelectorAll("#visitorWaypointsList .visitor-waypoint-row"))
    .map((row) => {
      const typed = row.querySelector(".visitor-waypoint-input")?.value.trim() || "";
      const query = row.dataset.selectedQuery || resolveWaypointQuery(typed);
      const waitMode = row.querySelector(".visitor-waypoint-wait-mode")?.value || "seconds";
      const seconds = clampWaypointStaySeconds(row.querySelector(".visitor-waypoint-seconds")?.value);
      return {
        query,
        waitMode: waitMode === "button" ? "button" : "seconds",
        seconds,
        typed
      };
    })
    .filter((stop) => stop.query || stop.typed);
}

function getVisitorWaypointQueries() {
  return getVisitorWaypointStops()
    .map((stop) => stop.query)
    .filter(Boolean);
}

function syncVisitorWaypointStayUi(row) {
  const mode = row.querySelector(".visitor-waypoint-wait-mode")?.value;
  row.querySelector(".visitor-waypoint-seconds-wrap")?.classList.toggle("hidden", mode === "button");
}

function selectVisitorWaypoint(row, name) {
  const input = row.querySelector(".visitor-waypoint-input");
  row.dataset.selectedQuery = name;
  if (input) {
    input.value = name;
  }
  hideWaypointResults();
  setStatus(`已選擇停靠點：${name}`);
  syncStartButton();
}

function renderWaypointResults(row, query) {
  const results = row.querySelector(".visitor-waypoint-results");
  if (!results) {
    return;
  }
  hideWaypointResults(row);
  const matches = matchWaypointGroups(query);
  results.innerHTML = "";
  if (!matches.length) {
    if (!query.trim()) {
      hideWaypointResults();
      return;
    }
    const empty = document.createElement("li");
    empty.className = "visitor-dest-empty";
    empty.textContent = "找不到符合的停靠點，請改關鍵字或從建議中點選";
    results.appendChild(empty);
    results.hidden = false;
    return;
  }
  matches.forEach((group) => {
    const item = document.createElement("li");
    item.className = "visitor-dest-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "visitor-dest-option";
    const title = document.createElement("span");
    title.className = "visitor-dest-name";
    title.textContent = group.name;
    const meta = document.createElement("span");
    meta.className = "visitor-dest-meta";
    meta.textContent =
      group.locations.length > 1
        ? `${group.locations.length} 處：${group.locations.slice(0, 2).join("、")}${
            group.locations.length > 2 ? "…" : ""
          }`
        : group.locations[0] || "";
    btn.append(title, meta);
    btn.addEventListener("click", () => selectVisitorWaypoint(row, group.name));
    item.appendChild(btn);
    results.appendChild(item);
  });
  results.hidden = false;
}

function createVisitorWaypointRow(value = "", stay = {}) {
  const list = document.getElementById("visitorWaypointsList");
  if (!list) {
    return null;
  }
  const count = list.querySelectorAll(".visitor-waypoint-row").length;
  if (count >= VISITOR_WAYPOINT_SOFT_MAX) {
    setStatus(`最多 ${VISITOR_WAYPOINT_SOFT_MAX} 個中途停靠。`, "error");
    return null;
  }

  const waitMode = stay.waitMode === "button" ? "button" : "seconds";
  const seconds = clampWaypointStaySeconds(stay.seconds ?? DEFAULT_WAYPOINT_STAY_SECONDS);
  const row = document.createElement("div");
  row.className = "visitor-waypoint-row";
  const inputId = `visitorWaypoint_${++visitorWaypointIdSeq}`;
  if (value) {
    row.dataset.selectedQuery = value;
  }
  row.innerHTML = `
    <div class="visitor-dest-wrap visitor-waypoint-search-wrap">
      <input
        id="${inputId}"
        class="visitor-dest-input visitor-waypoint-input"
        type="search"
        placeholder="搜尋停靠點，例如：圖書館、s1001"
        autocomplete="off"
        value="${String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"
      />
      <ul class="visitor-dest-results visitor-waypoint-results" hidden></ul>
    </div>
    <div class="visitor-waypoint-stay">
      <label class="visitor-waypoint-stay-label">
        抵達後
        <select class="visitor-waypoint-wait-mode">
          <option value="seconds"${waitMode === "seconds" ? " selected" : ""}>停留秒數</option>
          <option value="button"${waitMode === "button" ? " selected" : ""}>按按鈕繼續</option>
        </select>
      </label>
      <label class="visitor-waypoint-seconds-wrap">
        <input class="visitor-waypoint-seconds" type="number" min="1" max="300" step="1" value="${seconds}" />
        秒
      </label>
    </div>
    <button type="button" class="visitor-waypoint-remove-btn" aria-label="移除此停靠">移除</button>
  `;

  const input = row.querySelector(".visitor-waypoint-input");
  input?.addEventListener("input", () => {
    delete row.dataset.selectedQuery;
    setStatus("");
    const exact = resolveWaypointQuery(input.value);
    if (exact) {
      row.dataset.selectedQuery = exact;
    }
    renderWaypointResults(row, input.value);
    syncStartButton();
  });
  input?.addEventListener("focus", () => {
    renderWaypointResults(row, input.value || "");
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const matches = matchWaypointGroups(input.value);
    if (!row.dataset.selectedQuery && matches.length === 1) {
      selectVisitorWaypoint(row, matches[0].name);
    }
  });
  row.querySelector(".visitor-waypoint-wait-mode")?.addEventListener("change", () => {
    syncVisitorWaypointStayUi(row);
    syncStartButton();
  });
  row.querySelector(".visitor-waypoint-seconds")?.addEventListener("input", syncStartButton);
  row.querySelector(".visitor-waypoint-remove-btn")?.addEventListener("click", () => {
    row.remove();
    setStatus("");
    syncStartButton();
  });
  syncVisitorWaypointStayUi(row);
  list.appendChild(row);
  input?.focus();
  return row;
}

function setupVisitorWaypointsUi() {
  document.getElementById("visitorAddWaypointBtn")?.addEventListener("click", () => {
    createVisitorWaypointRow();
  });
}

function buildVisitorPathQueries(startQuery, destinationName) {
  const waypointQueries = getVisitorWaypointQueries();
  return [startQuery, ...waypointQueries, destinationName].filter(Boolean);
}

function setStatus(message, tone = "info") {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message || "";
  statusEl.classList.toggle("is-error", Boolean(message) && tone === "error");
}

function usableStarts() {
  return [
    MAP_LOCATE_START,
    ...startPresets.filter((preset) => preset.query && preset.enabled !== false),
    OTHER_START
  ];
}

function displayStartPresets() {
  return [
    MAP_LOCATE_START,
    ...startPresets.filter((preset) => preset.query),
    OTHER_START
  ];
}

function isPresetDisabled(preset) {
  return startPresets.some((item) => item.id === preset.id && item.enabled === false);
}

function isOtherStartSelected() {
  return selectedStart?.id === OTHER_START.id || selectedStart?.kind === "search";
}

function formatVisitorStayLabel(stop) {
  if (stop?.waitMode === "button") {
    return "按按鈕繼續";
  }
  return `停 ${clampWaypointStaySeconds(stop?.seconds)} 秒`;
}

function buildVisitorRouteSummaryParts() {
  const start = resolveStartForNavigation();
  const destination = resolveDestinationForStart();
  if (!start || (start.id !== MAP_LOCATE_START.id && !start.query) || !destination?.name) {
    return null;
  }
  const waypointStops = getVisitorWaypointStops().filter((stop) => stop.query);
  const startLabel =
    start.id === MAP_LOCATE_START.id ? "地圖定位" : start.label || start.query;
  const parts = [startLabel];
  waypointStops.forEach((stop) => {
    parts.push(`${stop.query}（${formatVisitorStayLabel(stop)}）`);
  });
  parts.push(destination.name);
  return { parts, start, destination, waypointStops };
}

function updateVisitorRouteSummary() {
  if (!routeSummaryEl) {
    return;
  }
  const summary = buildVisitorRouteSummaryParts();
  if (!summary) {
    routeSummaryEl.textContent = "";
    routeSummaryEl.classList.add("hidden");
    return;
  }
  routeSummaryEl.textContent = `行程：${summary.parts.join(" → ")}`;
  routeSummaryEl.classList.remove("hidden");
}

function buildVisitorShareUrl({ go = false } = {}) {
  const summary = buildVisitorRouteSummaryParts();
  if (!summary) {
    return "";
  }
  const url = new URL("./navigation.html", location.href);
  url.searchParams.set("to", encodeNavQueryForUrl(summary.destination.name));
  url.searchParams.set("mode", "visitor");
  if (go) {
    url.searchParams.set("go", "1");
  }
  if (summary.start.id === MAP_LOCATE_START.id) {
    url.searchParams.set("locate", "1");
  } else {
    url.searchParams.set(
      "from",
      encodeVisitorStartForUrl(summary.start, startPresets)
    );
  }
  if (summary.waypointStops.length) {
    url.searchParams.set(
      "via",
      encodeNavQueryListForUrl(summary.waypointStops.map((stop) => stop.query))
    );
    url.searchParams.set("viaStay", encodeWaypointStayList(summary.waypointStops));
  }
  const floorMode = document.getElementById("visitorFloorMode")?.value;
  if (floorMode === "both" || floorMode === "stairs") {
    url.searchParams.set("floor", floorMode);
  }
  return url.toString();
}

async function copyTextToClipboard(text) {
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

function syncStartButton() {
  if (!startBtn) {
    return;
  }
  const startOk =
    selectedStart &&
    (selectedStart.id === MAP_LOCATE_START.id ||
      (selectedStart.id !== OTHER_START.id && selectedStart.query) ||
      (selectedStart.kind === "search" && selectedStart.query));
  const ready = Boolean(startOk && selectedDestination?.name);
  startBtn.disabled = !ready;
  startBtn.classList.toggle("is-disabled", !ready);
  if (shareBtn) {
    const canShare = ready && selectedStart.id !== MAP_LOCATE_START.id;
    shareBtn.disabled = !canShare;
    shareBtn.classList.toggle("is-disabled", !canShare);
  }
  updateVisitorRouteSummary();
  scheduleVisitorPathPrefetch();
}

function canPrefetchVisitorRoute() {
  const start = resolveStartForNavigation();
  const destination = resolveDestinationForStart();
  if (!start?.query || !destination?.name) {
    return false;
  }
  if (start.id === MAP_LOCATE_START.id) {
    return false;
  }
  return true;
}

function scheduleVisitorPathPrefetch() {
  if (visitorPrefetchTimer) {
    clearTimeout(visitorPrefetchTimer);
  }
  if (!canPrefetchVisitorRoute()) {
    visitorPrefetchGeneration += 1;
    panoramaPrefetchQueue.reset();
    return;
  }
  visitorPrefetchTimer = setTimeout(() => {
    visitorPrefetchTimer = null;
    void runVisitorPathPrefetch();
  }, VISITOR_PREFETCH_DEBOUNCE_MS);
}

async function runVisitorPathPrefetch() {
  const generation = ++visitorPrefetchGeneration;
  if (!canPrefetchVisitorRoute()) {
    panoramaPrefetchQueue.reset();
    return;
  }
  const start = resolveStartForNavigation();
  const destination = resolveDestinationForStart();
  if (!start?.query || !destination?.name) {
    return;
  }
  try {
    const queries = buildVisitorPathQueries(start.query, destination.name);
    const urls = await collectVisitorPathPanoramaUrls(
      queries,
      undefined,
      VISITOR_PREFETCH_MAX_STATIONS
    );
    if (generation !== visitorPrefetchGeneration) {
      return;
    }
    if (urls.length) {
      lastVisitorPrefetchUrls = urls;
      saveVisitorPrefetchUrls(urls);
      panoramaPrefetchQueue.enqueue(urls);
    }
  } catch {
    /* 背景預載失敗不影響訪客流程 */
  }
}

function syncOtherSearchVisibility() {
  const show = isOtherStartSelected();
  startOtherWrap?.classList.toggle("hidden", !show);
  if (!show) {
    hideStartResults();
    if (startInput && selectedStart?.kind !== "search") {
      startInput.value = "";
    }
  }
}

function renderStartPresets() {
  if (!presetsEl) {
    return;
  }
  presetsEl.innerHTML = "";
  const starts = displayStartPresets();
  const enabledStarts = usableStarts();
  if (!starts.length) {
    const empty = document.createElement("p");
    empty.className = "visitor-start-empty";
    empty.textContent = "尚未設定起點，請由管理設定頁新增。";
    presetsEl.appendChild(empty);
    syncStartButton();
    return;
  }
  if (
    !selectedStart ||
    selectedStart.enabled === false ||
    (selectedStart.kind !== "search" &&
      !enabledStarts.some((item) => item.id === selectedStart.id))
  ) {
    selectedStart = enabledStarts[0] || null;
  }
  starts.forEach((preset) => {
    const disabled = isPresetDisabled(preset);
    const selected =
      !disabled &&
      (selectedStart?.id === preset.id ||
        (preset.id === OTHER_START.id && selectedStart?.kind === "search"));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "visitor-preset-btn";
    if (disabled) {
      btn.disabled = true;
      btn.classList.add("is-disabled");
    }
    if (preset.id === MAP_LOCATE_START.id || preset.id === OTHER_START.id) {
      btn.classList.add("visitor-preset-btn-location");
    }
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    btn.textContent = preset.label;
    if (selected) {
      btn.classList.add("is-selected");
    }

    btn.addEventListener("click", () => {
      if (preset.id === OTHER_START.id) {
        selectedStart = { ...OTHER_START };
        if (startInput) {
          startInput.value = "";
        }
        hideStartResults();
        renderStartPresets();
        syncOtherSearchVisibility();
        setStatus("請搜尋並點選其他起點。");
        startInput?.focus();
        renderStartResults("");
        syncStartButton();
        return;
      }
      selectedStart = preset;
      if (startInput) {
        startInput.value = "";
      }
      hideStartResults();
      renderStartPresets();
      syncOtherSearchVisibility();
      setStatus("");
      syncStartButton();
    });
    presetsEl.appendChild(btn);
  });
  syncOtherSearchVisibility();
  syncStartButton();
}

function buildStartSearchOptions(nodeGroups, { hidePathNodes = false } = {}) {
  const seen = new Set();
  const options = [];

  startPresets
    .filter((preset) => preset.query)
    .forEach((preset) => {
      const key = preset.query.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      options.push({
        id: preset.id,
        label: preset.label,
        query: preset.query,
        location: "常用起點"
      });
    });

  nodeGroups.forEach((group) => {
    group.nodes.forEach((node) => {
      const nodeKey = node.name.toLowerCase();
      if (!hidePathNodes && !seen.has(nodeKey)) {
        seen.add(nodeKey);
        options.push({
          id: `node:${group.scope}:${node.name}`,
          label: node.name,
          query: node.name,
          location: group.label
        });
      }
      (node.destinations || []).forEach((destName) => {
        const name = String(destName || "").trim();
        if (!name) {
          return;
        }
        const destKey = name.toLowerCase();
        if (seen.has(destKey)) {
          return;
        }
        seen.add(destKey);
        options.push({
          id: `dest:${group.scope}:${node.name}:${name}`,
          label: name,
          query: name,
          location: `${node.name}（${group.label}）`
        });
      });
    });
  });

  return options.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
}

function matchStartOptions(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return startSearchOptions.slice(0, 12);
  }
  return startSearchOptions
    .filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.query.toLowerCase().includes(q) ||
        String(item.location || "")
          .toLowerCase()
          .includes(q)
    )
    .slice(0, 12);
}

function findExactStart(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return null;
  }
  return (
    startSearchOptions.find((item) => item.label.toLowerCase() === q) ||
    startSearchOptions.find((item) => item.query.toLowerCase() === q) ||
    null
  );
}

function hideStartResults() {
  if (!startResults) {
    return;
  }
  startResults.hidden = true;
  startResults.innerHTML = "";
}

function selectSearchedStart(option) {
  selectedStart = {
    id: OTHER_START.id,
    label: option.label,
    query: option.query,
    kind: "search"
  };
  if (startInput) {
    startInput.value = option.label;
  }
  hideStartResults();
  renderStartPresets();
  syncOtherSearchVisibility();
  setStatus(`已選擇起點：${option.label}`);
  syncStartButton();
}

function renderStartResults(query) {
  if (!startResults || !isOtherStartSelected()) {
    return;
  }
  const matches = matchStartOptions(query);
  startResults.innerHTML = "";
  if (!matches.length) {
    if (!query.trim()) {
      hideStartResults();
      return;
    }
    const empty = document.createElement("li");
    empty.className = "visitor-dest-empty";
    empty.textContent = "找不到符合的起點，請改關鍵字";
    startResults.appendChild(empty);
    startResults.hidden = false;
    return;
  }
  matches.forEach((option) => {
    const item = document.createElement("li");
    item.className = "visitor-dest-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "visitor-dest-option";
    const title = document.createElement("span");
    title.className = "visitor-dest-name";
    title.textContent = option.label;
    const meta = document.createElement("span");
    meta.className = "visitor-dest-meta";
    meta.textContent = option.location || "";
    btn.append(title, meta);
    btn.addEventListener("click", () => selectSearchedStart(option));
    item.appendChild(btn);
    startResults.appendChild(item);
  });
  startResults.hidden = false;
}

function groupDestinations(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const key = entry.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { name: entry.name, locations: [] });
    }
    const group = map.get(key);
    if (!group.locations.includes(entry.location)) {
      group.locations.push(entry.location);
    }
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

async function loadDestinations() {
  const hidePathNodes = NavArrowSettings.load()?.visitorSearchHidePathNodes !== false;
  const entries = await loadVisitorSearchEntries({ hidePathNodes });
  destinationGroups = groupDestinations(entries);
  if (!destinationGroups.length) {
    setStatus("目前沒有可用目的地。請確認 data/nodes 已載入，或稍後再試。", "error");
  }
}

function matchDestinationGroups(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  return destinationGroups
    .filter(
      (group) =>
        group.name.toLowerCase().includes(q) ||
        group.locations.some((loc) => loc.toLowerCase().includes(q))
    )
    .slice(0, 12);
}

function findExactDestination(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return null;
  }
  return destinationGroups.find((group) => group.name.toLowerCase() === q) || null;
}

function hideDestResults() {
  if (!destResults) {
    return;
  }
  destResults.hidden = true;
  destResults.innerHTML = "";
}

function selectDestination(group) {
  selectedDestination = group;
  if (destInput) {
    destInput.value = group.name;
  }
  hideDestResults();
  setStatus(`已選擇目的地：${group.name}`);
  syncStartButton();
}

function clearDestinationSelection() {
  selectedDestination = null;
  syncStartButton();
}

function renderDestResults(query) {
  if (!destResults) {
    return;
  }
  const matches = matchDestinationGroups(query);
  destResults.innerHTML = "";
  if (!query.trim()) {
    hideDestResults();
    return;
  }
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "visitor-dest-empty";
    empty.textContent = "找不到符合的目的地，請改關鍵字或從建議中點選";
    destResults.appendChild(empty);
    destResults.hidden = false;
    return;
  }
  matches.forEach((group) => {
    const item = document.createElement("li");
    item.className = "visitor-dest-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "visitor-dest-option";
    const title = document.createElement("span");
    title.className = "visitor-dest-name";
    title.textContent = group.name;
    const meta = document.createElement("span");
    meta.className = "visitor-dest-meta";
    meta.textContent =
      group.locations.length > 1
        ? `${group.locations.length} 處：${group.locations.slice(0, 2).join("、")}${
            group.locations.length > 2 ? "…" : ""
          }`
        : group.locations[0] || "";
    btn.append(title, meta);
    btn.addEventListener("click", () => selectDestination(group));
    item.appendChild(btn);
    destResults.appendChild(item);
  });
  destResults.hidden = false;
}

function resolveDestinationForStart() {
  if (selectedDestination?.name) {
    return selectedDestination;
  }
  const typed = destInput?.value?.trim() || "";
  return findExactDestination(typed);
}

function resolveStartForNavigation() {
  if (!selectedStart) {
    return null;
  }
  if (selectedStart.id === MAP_LOCATE_START.id) {
    return selectedStart;
  }
  if (selectedStart.kind === "search" && selectedStart.query) {
    return selectedStart;
  }
  if (selectedStart.id === OTHER_START.id) {
    const typed = startInput?.value?.trim() || "";
    const exact = findExactStart(typed);
    return exact
      ? { id: OTHER_START.id, label: exact.label, query: exact.query, kind: "search" }
      : null;
  }
  if (selectedStart.query) {
    return selectedStart;
  }
  return null;
}

function startNavigation() {
  const start = resolveStartForNavigation();
  if (!start || (start.id !== MAP_LOCATE_START.id && !start.query)) {
    if (isOtherStartSelected()) {
      setStatus("請從建議清單點選其他起點。", "error");
      startInput?.focus();
      renderStartResults(startInput?.value || "");
    } else {
      setStatus("請先選擇起點。", "error");
    }
    return;
  }
  selectedStart = start;
  const destination = resolveDestinationForStart();
  if (!destination) {
    setStatus("請從建議清單點選目的地，或輸入完整且正確的名稱。", "error");
    destInput?.focus();
    renderDestResults(destInput?.value || "");
    return;
  }
  selectedDestination = destination;
  syncStartButton();

  const waypointStops = getVisitorWaypointStops();
  const incomplete = waypointStops.find((stop) => stop.typed && !stop.query);
  if (incomplete) {
    setStatus("請從建議清單點選中途停靠點，或輸入完整且正確的名稱。", "error");
    return;
  }
  if (waypointStops.length && selectedStart.id === MAP_LOCATE_START.id) {
    setStatus("使用中途停靠時，起點請改選校內節點（地圖定位僅支援單段路徑）。", "error");
    return;
  }

  const params = new URLSearchParams({
    to: encodeNavQueryForUrl(destination.name),
    mode: "visitor",
    go: "1"
  });
  if (selectedStart.id === MAP_LOCATE_START.id) {
    params.set("locate", "1");
  } else {
    params.set("from", encodeVisitorStartForUrl(selectedStart, startPresets));
  }
  if (waypointStops.length) {
    params.set("via", encodeNavQueryListForUrl(waypointStops.map((stop) => stop.query)));
    params.set("viaStay", encodeWaypointStayList(waypointStops));
  }
  const floorMode = document.getElementById("visitorFloorMode")?.value;
  if (floorMode === "both" || floorMode === "stairs") {
    params.set("floor", floorMode);
  }
  if (lastVisitorPrefetchUrls.length) {
    saveVisitorPrefetchUrls(lastVisitorPrefetchUrls);
  }
  location.href = `./navigation.html?${params.toString()}`;
}

async function initVisitorPage() {
  await NavArrowSettings.init();
  setupVisitorWaypointsUi();
  const settings = NavArrowSettings.load();
  startPresets = normalizeVisitorStarts(settings.visitorStarts);
  const hidePathNodes = settings?.visitorSearchHidePathNodes !== false;
  const nodeGroups = await loadNodeOptions().catch(() => []);
  startSearchOptions = buildStartSearchOptions(nodeGroups, { hidePathNodes });
  selectedStart = resolveVisitorDefaultStart(startPresets, settings.visitorDefaultStartId);
  renderStartPresets();
  syncStartButton();
}

initVisitorPage().catch(() => {
  setupVisitorWaypointsUi();
  startPresets = normalizeVisitorStarts();
  startSearchOptions = buildStartSearchOptions([]);
  selectedStart = resolveVisitorDefaultStart(startPresets, "map_locate");
  renderStartPresets();
  syncStartButton();
});

loadDestinations().catch(() => {
  setStatus("目的地清單載入失敗，仍可手動輸入完整名稱。", "error");
});

startInput?.addEventListener("input", () => {
  setStatus("");
  selectedStart = { ...OTHER_START };
  const exact = findExactStart(startInput.value);
  if (exact) {
    selectedStart = {
      id: OTHER_START.id,
      label: exact.label,
      query: exact.query,
      kind: "search"
    };
  }
  renderStartPresets();
  renderStartResults(startInput.value);
  syncStartButton();
});

startInput?.addEventListener("focus", () => {
  if (isOtherStartSelected()) {
    renderStartResults(startInput.value);
  }
});

destInput?.addEventListener("input", () => {
  setStatus("");
  clearDestinationSelection();
  const exact = findExactDestination(destInput.value);
  if (exact) {
    selectedDestination = exact;
    syncStartButton();
  }
  renderDestResults(destInput.value);
});

destInput?.addEventListener("focus", () => {
  if (destInput.value.trim()) {
    renderDestResults(destInput.value);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".visitor-start-wrap")) {
    hideStartResults();
  }
  if (!event.target.closest(".visitor-dest-wrap:not(.visitor-start-wrap):not(.visitor-waypoint-search-wrap)")) {
    hideDestResults();
  }
  if (!event.target.closest(".visitor-waypoint-search-wrap")) {
    hideWaypointResults();
  }
});

startBtn?.addEventListener("click", startNavigation);

shareBtn?.addEventListener("click", async () => {
  const url = buildVisitorShareUrl({ go: true });
  if (!url) {
    setStatus("請先選好起點與目的地後再分享。", "error");
    return;
  }
  if (selectedStart?.id === MAP_LOCATE_START.id) {
    setStatus("地圖定位無法產生固定分享連結，請改選校內起點。", "error");
    return;
  }
  const ok = await copyTextToClipboard(url);
  if (ok) {
    setStatus("已複製分享連結（開啟後會自動開始導航）。");
    shareBtn.textContent = "已複製";
    setTimeout(() => {
      shareBtn.textContent = "複製分享連結";
    }, 1600);
  } else {
    prompt("請手動複製以下連結：", url);
  }
});

startInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const matches = matchStartOptions(startInput.value);
    if (selectedStart?.kind !== "search" && matches.length === 1) {
      selectSearchedStart(matches[0]);
    }
    destInput?.focus();
  }
});

destInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const matches = matchDestinationGroups(destInput.value);
    if (!selectedDestination && matches.length === 1) {
      selectDestination(matches[0]);
    }
    startNavigation();
  }
});
