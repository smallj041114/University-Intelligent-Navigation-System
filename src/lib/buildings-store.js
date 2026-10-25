import seedBuildings from "../../data/buildings.json";
import { backfillHotspotDefaultCoords, stripCampusBuildingHotspots } from "./visitor-starts.js";
import { adminFetch } from "./admin-fetch.js";

const DEFAULT_FLOOR_IMAGE = "./images/floorplan-s.jpg";

export function defaultFloorImageForBuilding(buildingId, floorLabel = "1F") {
  const lower = String(buildingId || "").trim().toLowerCase();
  const upper = String(buildingId || "").trim().toUpperCase();
  if (!lower) {
    return DEFAULT_FLOOR_IMAGE;
  }
  return `./images/${upper}/floorplan-${lower}-${floorLabel}.jpg`;
}

function normalizeFloor(raw, buildingId, index = 0) {
  const id = String(raw?.id || `${index + 1}`).trim() || `${index + 1}`;
  const label = String(raw?.label || `${id}F`).trim() || `${id}F`;
  const image =
    String(raw?.image || "").trim() || defaultFloorImageForBuilding(buildingId, label);
  return { id, label, image };
}

export function normalizeBuildingDef(buildingId, raw = {}) {
  const id = String(buildingId || raw?.id || "").trim();
  const name = String(raw?.name || id).trim() || id;
  const floorsRaw = Array.isArray(raw?.floors) ? raw.floors : [];
  const floors = floorsRaw.length
    ? floorsRaw.map((floor, index) => normalizeFloor(floor, id, index))
    : [normalizeFloor({ id: "1", label: "1F" }, id, 0)];
  return { id, name, floors };
}

export function normalizeBuildingsStore(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};
  Object.keys(source).forEach((buildingId) => {
    const normalized = normalizeBuildingDef(buildingId, source[buildingId]);
    if (normalized.id) {
      out[normalized.id] = { name: normalized.name, floors: normalized.floors };
    }
  });
  return out;
}

export function createCampusBuildingId(name = "building", existingIds = []) {
  const reserved = new Set(existingIds.map((id) => String(id).toLowerCase()));
  let slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  if (slug && !reserved.has(slug)) {
    return slug;
  }
  const base = slug || "b";
  let candidate = base;
  let i = 2;
  while (reserved.has(candidate)) {
    candidate = `${base}${i}`;
    i += 1;
  }
  return candidate;
}

export function isValidCampusBuildingId(buildingId) {
  return /^[a-z][a-z0-9_]{0,15}$/i.test(String(buildingId || "").trim());
}

export function isValidFloorId(floorId) {
  return /^[a-z0-9][a-z0-9_-]{0,15}$/i.test(String(floorId || "").trim());
}

export function nextFloorId(floors = []) {
  const used = new Set(floors.map((floor) => String(floor.id)));
  let candidate = floors.length + 1;
  while (used.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

/** 從 nav-settings 舊格式（含 floors）抽出大樓定義，供遷移用 */
export function extractBuildingDefsFromLegacyHotspots(campusBuildings = {}) {
  const defs = {};
  Object.entries(campusBuildings || {}).forEach(([id, raw]) => {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.floors)) {
      return;
    }
    defs[id] = normalizeBuildingDef(id, raw);
  });
  return defs;
}

export async function migrateLegacyCampusBuildingData(NavArrowSettings) {
  if (!NavArrowSettings) {
    return;
  }
  const nav = NavArrowSettings.load();
  const legacyDefs = extractBuildingDefsFromLegacyHotspots(nav.campusBuildings);
  const buildings = { ...BuildingsStore.load() };
  let buildingsChanged = false;
  Object.entries(legacyDefs).forEach(([id, def]) => {
    if (!buildings[id]) {
      buildings[id] = { name: def.name, floors: def.floors };
      buildingsChanged = true;
    }
  });
  const stripped = backfillHotspotDefaultCoords(stripCampusBuildingHotspots(nav.campusBuildings));
  const navChanged = JSON.stringify(stripped) !== JSON.stringify(nav.campusBuildings);
  if (buildingsChanged) {
    await BuildingsStore.saveAndPersist(buildings);
  }
  if (navChanged) {
    await NavArrowSettings.saveAndPersist({ ...nav, campusBuildings: stripped });
  }
}

export const BuildingsStore = {
  STORAGE_KEY: "mcu_buildings",
  API_PATH: "/api/buildings",
  cache: null,
  readyPromise: null,
  DEFAULTS: normalizeBuildingsStore(seedBuildings),

  normalize(input = {}) {
    return normalizeBuildingsStore(input);
  },

  readLocal() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? this.normalize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },

  writeLocal(store) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(store));
  },

  async init(force = false) {
    if (!force && this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = fetch(this.API_PATH, {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const normalized = this.normalize(data || {});
        this.cache = normalized;
        this.writeLocal(normalized);
        return normalized;
      })
      .catch(() => {
        const fallback = this.readLocal() || { ...this.DEFAULTS };
        const normalized = this.normalize(fallback);
        this.cache = normalized;
        return normalized;
      });
    return this.readyPromise;
  },

  load() {
    if (this.cache) {
      return this.cache;
    }
    const local = this.readLocal();
    this.cache = this.normalize(local || this.DEFAULTS);
    return this.cache;
  },

  persistRemote(store) {
    return adminFetch(this.API_PATH, {
      method: "POST",
      body: JSON.stringify(store)
    }).then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    });
  },

  save(input) {
    const normalized = this.normalize(input);
    this.cache = normalized;
    this.writeLocal(normalized);
    this.persistRemote(normalized);
    return normalized;
  },

  async saveAndPersist(input) {
    const normalized = this.save(input);
    await this.persistRemote(normalized);
    return normalized;
  }
};
