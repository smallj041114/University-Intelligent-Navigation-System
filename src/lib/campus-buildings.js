import { resolveCampusBuildingHotspot } from "./visitor-starts.js";
import { normalizeBuildingDef } from "./buildings-store.js";

export {
  createCampusBuildingId,
  defaultFloorImageForBuilding,
  isValidCampusBuildingId,
  normalizeBuildingDef
} from "./buildings-store.js";

export function buildCampusBuildingsRegistry(buildingsStore = {}, hotspotsStore = {}) {
  const registry = {};
  Object.entries(buildingsStore).forEach(([buildingId, def]) => {
    const normalized = normalizeBuildingDef(buildingId, def);
    const hotspot = resolveCampusBuildingHotspot(buildingId, normalized, hotspotsStore);
    registry[buildingId] = {
      name: normalized.name,
      floors: normalized.floors,
      hotspot: {
        x: hotspot.xPercent,
        y: hotspot.yPercent,
        label: hotspot.label || normalized.name
      }
    };
  });
  return registry;
}

export function resolveCampusBuildingHotspotFromStore(buildingId, buildingDef, hotspotsStore = {}) {
  return resolveCampusBuildingHotspot(buildingId, buildingDef, hotspotsStore);
}

export function getCampusBuildingEnabledFromStore(buildingId, hotspotsStore = {}) {
  const hotspot = resolveCampusBuildingHotspot(buildingId, null, hotspotsStore);
  return hotspot.enabled !== false;
}

export function getExistingCampusBuildingIds(buildingsStore = {}) {
  return Object.keys(buildingsStore);
}
