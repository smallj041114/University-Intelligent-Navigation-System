/** 舊書籤／網址辨識用；產品已不再提供「目前位置」起點 */
export const CURRENT_LOCATION_START = {
  id: "current_location",
  label: "📍 目前位置",
  query: "📍 目前位置",
  image: ""
};

/** 永遠關閉：訪客／設定／側欄皆不提供校外「目前位置」 */
export const CURRENT_LOCATION_ENABLED = false;

export const MAP_LOCATE_START = {
  id: "map_locate",
  label: "地圖上定位",
  query: "__map_locate__",
  image: ""
};

/** 校外 Google 導航抵達校園後，室內最短路徑的起點節點（預設校門口） */
export const DEFAULT_INDOOR_ENTRY = {
  query: "校門口",
  image: "./images/campus/0001.jpg"
};

export function normalizeIndoorEntry(input = {}) {
  const query = String(input?.query || "").trim() || DEFAULT_INDOOR_ENTRY.query;
  const image = String(input?.image || "").trim();
  return {
    query,
    image: image || DEFAULT_INDOOR_ENTRY.image
  };
}

/** 校園地圖棟別熱點開關（false = 顯示但變灰、不可進入） */
/** s/aa/ee/p 的 legacy 預設座標（nav-settings 尚未存在時 fallback） */
export const LEGACY_CAMPUS_BUILDING_DEFAULTS = {
  s: {
    enabled: true,
    xPercent: 45,
    yPercent: 9,
    defaultXPercent: 45,
    defaultYPercent: 9,
    label: ""
  },
  aa: {
    enabled: false,
    xPercent: 55,
    yPercent: 9,
    defaultXPercent: 55,
    defaultYPercent: 9,
    label: ""
  },
  ee: {
    enabled: false,
    xPercent: 13,
    yPercent: 55,
    defaultXPercent: 13,
    defaultYPercent: 55,
    label: ""
  },
  p: {
    enabled: true,
    xPercent: 21,
    yPercent: 55,
    defaultXPercent: 21,
    defaultYPercent: 55,
    label: ""
  }
};

/** @deprecated 請改用 LEGACY_CAMPUS_BUILDING_DEFAULTS；保留供 nav-arrow-settings 預設值 */
export const DEFAULT_CAMPUS_BUILDINGS = LEGACY_CAMPUS_BUILDING_DEFAULTS;

function readPercent(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCampusBuildingEntry(raw, defaultEnabled, buildingId) {
  const codeDefault = LEGACY_CAMPUS_BUILDING_DEFAULTS[buildingId] || {};
  if (typeof raw === "boolean") {
    return {
      enabled: raw,
      xPercent: codeDefault.xPercent ?? null,
      yPercent: codeDefault.yPercent ?? null,
      defaultXPercent: codeDefault.defaultXPercent ?? codeDefault.xPercent ?? null,
      defaultYPercent: codeDefault.defaultYPercent ?? codeDefault.yPercent ?? null,
      label: ""
    };
  }
  if (!raw || typeof raw !== "object") {
    return {
      enabled: defaultEnabled,
      xPercent: codeDefault.xPercent ?? null,
      yPercent: codeDefault.yPercent ?? null,
      defaultXPercent: codeDefault.defaultXPercent ?? codeDefault.xPercent ?? null,
      defaultYPercent: codeDefault.defaultYPercent ?? codeDefault.yPercent ?? null,
      label: ""
    };
  }
  const xPercent = readPercent(raw.xPercent);
  const yPercent = readPercent(raw.yPercent);
  const defaultXPercent = readPercent(raw.defaultXPercent);
  const defaultYPercent = readPercent(raw.defaultYPercent);
  return {
    enabled: raw.enabled !== false,
    xPercent: xPercent ?? codeDefault.xPercent ?? null,
    yPercent: yPercent ?? codeDefault.yPercent ?? null,
    defaultXPercent:
      defaultXPercent ?? codeDefault.defaultXPercent ?? xPercent ?? codeDefault.xPercent ?? null,
    defaultYPercent:
      defaultYPercent ?? codeDefault.defaultYPercent ?? yPercent ?? codeDefault.yPercent ?? null,
    label: String(raw.label ?? "").trim()
  };
}

function serializeCampusBuildingHotspot(entry) {
  const out = {
    enabled: entry.enabled !== false,
    xPercent: entry.xPercent,
    yPercent: entry.yPercent,
    label: entry.label || ""
  };
  if (Number.isFinite(entry.defaultXPercent)) {
    out.defaultXPercent = entry.defaultXPercent;
  }
  if (Number.isFinite(entry.defaultYPercent)) {
    out.defaultYPercent = entry.defaultYPercent;
  }
  return out;
}

export function backfillHotspotDefaultCoords(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const out = {};
  Object.keys(source).forEach((id) => {
    const entry = normalizeCampusBuildingEntry(
      source[id],
      LEGACY_CAMPUS_BUILDING_DEFAULTS[id]?.enabled !== false,
      id
    );
    const legacy = LEGACY_CAMPUS_BUILDING_DEFAULTS[id] || {};
    const xPercent = entry.xPercent ?? legacy.xPercent ?? 50;
    const yPercent = entry.yPercent ?? legacy.yPercent ?? 50;
    const defaultXPercent = entry.defaultXPercent ?? xPercent;
    const defaultYPercent = entry.defaultYPercent ?? yPercent;
    out[id] = serializeCampusBuildingHotspot({
      ...entry,
      xPercent,
      yPercent,
      defaultXPercent,
      defaultYPercent
    });
  });
  return out;
}

export function normalizeCampusBuildings(input = {}, buildingIds = []) {
  const source = input && typeof input === "object" ? input : {};
  const ids = new Set([
    ...Object.keys(LEGACY_CAMPUS_BUILDING_DEFAULTS),
    ...buildingIds,
    ...Object.keys(source)
  ]);
  const out = {};
  ids.forEach((id) => {
    const defaultEnabled = LEGACY_CAMPUS_BUILDING_DEFAULTS[id]?.enabled !== false;
    const entry = normalizeCampusBuildingEntry(source[id], defaultEnabled, id);
    out[id] = serializeCampusBuildingHotspot(entry);
  });
  return backfillHotspotDefaultCoords(out);
}

export function stripCampusBuildingHotspots(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const out = {};
  Object.keys(source).forEach((id) => {
    const defaultEnabled = LEGACY_CAMPUS_BUILDING_DEFAULTS[id]?.enabled !== false;
    const entry = normalizeCampusBuildingEntry(source[id], defaultEnabled, id);
    out[id] = serializeCampusBuildingHotspot(entry);
  });
  return backfillHotspotDefaultCoords(out);
}

export function isCampusBuildingEnabled(buildingId, campusBuildings = null) {
  const store = campusBuildings && typeof campusBuildings === "object" ? campusBuildings : {};
  if (!(buildingId in store)) {
    const defaults = LEGACY_CAMPUS_BUILDING_DEFAULTS[buildingId];
    return defaults ? defaults.enabled !== false : true;
  }
  return normalizeCampusBuildingEntry(store[buildingId], true, buildingId).enabled !== false;
}

export function getDefaultCampusBuildingHotspot(buildingId, buildingDef = null, hotspotEntry = null) {
  const legacy = LEGACY_CAMPUS_BUILDING_DEFAULTS[buildingId] || {};
  const buildingName = buildingDef?.name || buildingId;
  const entry =
    hotspotEntry && typeof hotspotEntry === "object"
      ? normalizeCampusBuildingEntry(hotspotEntry, true, buildingId)
      : null;
  const defaultX = entry?.defaultXPercent;
  const defaultY = entry?.defaultYPercent;
  if (Number.isFinite(defaultX) && Number.isFinite(defaultY)) {
    return {
      xPercent: defaultX,
      yPercent: defaultY,
      enabled: entry.enabled !== false,
      label: buildingName
    };
  }
  return {
    xPercent: legacy.defaultXPercent ?? legacy.xPercent ?? 50,
    yPercent: legacy.defaultYPercent ?? legacy.yPercent ?? 50,
    enabled: legacy.enabled !== false,
    label: buildingName
  };
}

export function resolveCampusBuildingHotspot(buildingId, buildingDef, campusBuildings = null) {
  const store = campusBuildings && typeof campusBuildings === "object" ? campusBuildings : {};
  const entry = normalizeCampusBuildingEntry(
    store[buildingId],
    LEGACY_CAMPUS_BUILDING_DEFAULTS[buildingId]?.enabled !== false,
    buildingId
  );
  const legacy = LEGACY_CAMPUS_BUILDING_DEFAULTS[buildingId] || {};
  const buildingName = buildingDef?.name || buildingId;
  const customLabel = String(entry.label || "").trim();
  return {
    xPercent: entry.xPercent ?? legacy.xPercent ?? 50,
    yPercent: entry.yPercent ?? legacy.yPercent ?? 50,
    enabled: entry.enabled !== false,
    label: customLabel || buildingName
  };
}

export const DEFAULT_VISITOR_STARTS = [
  {
    id: "gate",
    alias: "gate",
    label: "校門口",
    query: "校門口",
    image: "./images/campus/0001.jpg"
  },
  {
    id: "s",
    alias: "s",
    label: "S棟",
    query: "s1001",
    image: "./images/S/1F/s1001.jpg"
  },
  {
    id: "p",
    alias: "p",
    label: "P棟",
    query: "p1001",
    image: "./images/P/1F/p1001.jpg"
  }
];

/** 內建備援（設定尚未填 alias 時仍可用） */
const NAV_QUERY_ALIASES = {
  gate: "校門口",
  campus_gate: "校門口",
  s: "s1001",
  s_building: "s1001",
  p: "p1001",
  p_building: "p1001"
};

function isAsciiQuery(value) {
  return /^[\x21-\x7E]+$/.test(String(value || "").trim());
}

/** 網址代碼：僅英數、底線、連字號 */
export function normalizeStartAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function findStartByAliasOrId(value, starts) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) {
    return null;
  }
  const list = Array.isArray(starts) ? starts : DEFAULT_VISITOR_STARTS;
  return (
    list.find((item) => normalizeStartAlias(item.alias) === key) ||
    list.find((item) => String(item.id || "").toLowerCase() === key) ||
    null
  );
}

/** 寫入 URL 參數：優先起點 alias，已是英文節點名則原樣 */
export function encodeNavQueryForUrl(query, starts = DEFAULT_VISITOR_STARTS) {
  const q = String(query || "").trim();
  if (!q) {
    return "";
  }
  if (isAsciiQuery(q)) {
    return q;
  }
  const list = Array.isArray(starts) ? starts : DEFAULT_VISITOR_STARTS;
  const preset = list.find(
    (item) =>
      item.query === q ||
      item.label === q ||
      String(item.label || "").replace(/^📍\s*/, "") === q
  );
  const alias = normalizeStartAlias(preset?.alias);
  if (alias) {
    return alias;
  }
  const fromAlias = Object.entries(NAV_QUERY_ALIASES).find(
    ([, name]) => name === q || name.toLowerCase() === q.toLowerCase()
  );
  if (fromAlias) {
    return fromAlias[0];
  }
  return q;
}

/** 訪客起點寫入 from：有 alias 用英文代碼，否則直接用節點實際名稱 */
export function encodeVisitorStartForUrl(start, starts = DEFAULT_VISITOR_STARTS) {
  if (!start) {
    return "";
  }
  const alias = normalizeStartAlias(start.alias);
  if (alias) {
    return alias;
  }
  const query = String(start.query || "").trim();
  if (!query) {
    return "";
  }
  // 不填 alias：一律傳節點實際名稱（如 s1001、S202-1），與設定頁選的環景一致
  if (isAsciiQuery(query)) {
    return query;
  }
  // 中文節點名仍嘗試對到其他起點已設的 alias／內建備援
  return encodeNavQueryForUrl(query, starts);
}

/** 讀取 URL 參數：英文代碼還原成實際搜尋名稱 */
export function decodeNavQueryFromUrl(value, starts = DEFAULT_VISITOR_STARTS) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const key = raw.toLowerCase();
  const preset = findStartByAliasOrId(key, starts);
  if (preset?.query) {
    return preset.query;
  }
  if (NAV_QUERY_ALIASES[key]) {
    return NAV_QUERY_ALIASES[key];
  }
  return raw;
}

/** 逗號分隔的 via 清單編解碼 */
export function encodeNavQueryListForUrl(queries, starts) {
  return (queries || [])
    .map((q) => encodeNavQueryForUrl(q, starts))
    .filter(Boolean)
    .join(",");
}

export function decodeNavQueryListFromUrl(value, starts) {
  return String(value || "")
    .split(",")
    .map((item) => decodeNavQueryFromUrl(item.trim(), starts))
    .filter(Boolean);
}

import seedBuildings from "../../data/buildings.json";

export function buildNodeFileScopes(buildings = seedBuildings) {
  const scopes = ["campus"];
  Object.entries(buildings || {}).forEach(([buildingId, def]) => {
    (def?.floors || []).forEach((floor) => {
      const floorId = String(floor?.id || "").trim();
      if (floorId) {
        scopes.push(`${buildingId}_${floorId}`);
      }
    });
  });
  return scopes;
}

/** 與 buildings.json 同步的節點檔清單（離線／打包 fallback） */
export const NODE_FILES = buildNodeFileScopes(seedBuildings);

let cachedBuildings = null;

export async function loadBuildingsRegistry() {
  if (cachedBuildings) {
    return cachedBuildings;
  }
  try {
    const res = await fetch("./data/buildings.json", { cache: "no-store" });
    if (res.ok) {
      cachedBuildings = await res.json();
      return cachedBuildings;
    }
  } catch {
    /* 使用打包種子 */
  }
  cachedBuildings = seedBuildings;
  return cachedBuildings;
}

export async function resolveNodeFileScopes() {
  const buildings = await loadBuildingsRegistry();
  return buildNodeFileScopes(buildings);
}

export function parseScopeFileId(scope, buildingIds = []) {
  if (scope === "campus") {
    return null;
  }
  const base = String(scope);
  const sortedIds = [...buildingIds].sort((a, b) => b.length - a.length);
  for (const buildingId of sortedIds) {
    const prefix = `${buildingId}_`;
    if (base.startsWith(prefix)) {
      const floorId = base.slice(prefix.length);
      if (floorId) {
        return { buildingId, floorId };
      }
    }
  }
  return null;
}

export function scopeLabel(scope, buildings = cachedBuildings || seedBuildings) {
  if (scope === "campus") {
    return "校園地圖";
  }
  const buildingIds = Object.keys(buildings || {});
  const parsed = parseScopeFileId(scope, buildingIds);
  if (!parsed) {
    return scope;
  }
  const def = buildings[parsed.buildingId] || {};
  const buildingName = def.name || String(parsed.buildingId || "").toUpperCase();
  const floor = (def.floors || []).find((item) => String(item.id) === parsed.floorId);
  const floorLabel = floor?.label || `${parsed.floorId}F`;
  return `${buildingName} ${floorLabel}`;
}

export function normalizeVisitorStart(input = {}, index = 0) {
  const label = String(input.label || "").trim() || `起點 ${index + 1}`;
  const query = String(input.query || "").trim();
  const image = String(input.image || "").trim();
  const id = String(input.id || "").trim() || `start_${index + 1}`;
  let alias = normalizeStartAlias(input.alias);
  // 舊預設起點若尚未存 alias，沿用穩定 id
  if (!alias && (id === "gate" || id === "s" || id === "p")) {
    alias = id;
  }
  return { id, alias, label, query, image, enabled: input.enabled !== false };
}

export function normalizeVisitorStarts(list) {
  const source = Array.isArray(list) && list.length ? list : DEFAULT_VISITOR_STARTS;
  return source.slice(0, 16).map((item, index) => normalizeVisitorStart(item, index));
}

/**
 * 訪客頁預設起點 id：map_locate / 自訂起點 id（舊 current_location 改落到 map_locate）
 */
export function normalizeVisitorDefaultStartId(value, starts) {
  const id = String(value || "").trim();
  if (id === CURRENT_LOCATION_START.id) {
    return MAP_LOCATE_START.id;
  }
  if (id === MAP_LOCATE_START.id) {
    return id;
  }
  const list = normalizeVisitorStarts(starts);
  if (id && list.some((item) => item.id === id)) {
    return id;
  }
  return MAP_LOCATE_START.id;
}

/** 依設定解析訪客頁初始選取的起點（略過已關閉的自訂起點） */
export function resolveVisitorDefaultStart(starts, defaultStartId) {
  const presets = normalizeVisitorStarts(starts);
  const id = normalizeVisitorDefaultStartId(defaultStartId, presets);
  if (id === MAP_LOCATE_START.id) {
    return { ...MAP_LOCATE_START };
  }
  const preset = presets.find((item) => item.id === id && item.query && item.enabled !== false);
  if (preset) {
    return preset;
  }
  const firstEnabled = presets.find((item) => item.query && item.enabled !== false);
  return firstEnabled ? { ...firstEnabled } : { ...MAP_LOCATE_START };
}

export function createVisitorStart(index = 0) {
  return {
    id: `start_${Date.now()}_${index}`,
    alias: "",
    label: "新起點",
    query: "",
    image: "",
    enabled: true
  };
}

export function buildVisitorSearchEntries(
  parsed,
  scope,
  buildings = cachedBuildings || seedBuildings,
  options = {}
) {
  const hidePathNodes = Boolean(options.hidePathNodes);
  const location = scopeLabel(scope, buildings);
  const entries = [];
  (Array.isArray(parsed) ? parsed : []).forEach((point) => {
    const pointName = String(point.name || "").trim();
    if (pointName && !hidePathNodes) {
      entries.push({
        name: pointName,
        location
      });
    }
    (point.destinations || []).forEach((dest) => {
      const destName = String(dest.name || "").trim();
      if (!destName) {
        return;
      }
      entries.push({
        name: destName,
        location: `${pointName || "節點"}（${location}）`
      });
    });
  });
  return entries;
}

export async function loadVisitorSearchEntries(options = {}) {
  const buildings = await loadBuildingsRegistry();
  const scopes = buildNodeFileScopes(buildings);
  const lists = await Promise.all(
    scopes.map(async (scope) => {
      try {
        const res = await fetch(`./data/nodes/${scope}.json`, { cache: "no-store" });
        if (!res.ok) {
          return [];
        }
        const parsed = await res.json();
        return buildVisitorSearchEntries(parsed, scope, buildings, options);
      } catch {
        return [];
      }
    })
  );
  return lists.flat();
}

export async function loadNodeOptions() {
  const buildings = await loadBuildingsRegistry();
  const scopes = buildNodeFileScopes(buildings);
  const groups = await Promise.all(
    scopes.map(async (scope) => {
      try {
        const res = await fetch(`./data/nodes/${scope}.json`, { cache: "no-store" });
        if (!res.ok) {
          return { scope, label: scopeLabel(scope, buildings), nodes: [] };
        }
        const parsed = await res.json();
        const nodes = (Array.isArray(parsed) ? parsed : [])
          .filter((point) => point?.name)
          .map((point) => ({
            name: String(point.name).trim(),
            image: String(point.url || "").trim(),
            destinations: (point.destinations || [])
              .map((dest) => String(dest.name || "").trim())
              .filter(Boolean)
          }))
          .filter((node) => node.name);
        return { scope, label: scopeLabel(scope, buildings), nodes };
      } catch {
        return { scope, label: scopeLabel(scope, buildings), nodes: [] };
      }
    })
  );
  return groups.filter((group) => group.nodes.length > 0);
}

export function findNodeOption(groups, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    return null;
  }
  for (const group of groups) {
    for (const node of group.nodes) {
      if (node.name.toLowerCase() === q) {
        return { ...node, scope: group.scope, scopeLabel: group.label };
      }
      if (node.destinations.some((name) => name.toLowerCase() === q)) {
        return { ...node, scope: group.scope, scopeLabel: group.label };
      }
    }
  }
  return null;
}
