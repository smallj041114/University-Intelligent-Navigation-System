/**
 * 大樓／熱點／節點檔一致性驗證
 * 用法：
 *   node scripts/validate-buildings.cjs
 *   node scripts/validate-buildings.cjs --strict
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUILDINGS_FILE = path.join(ROOT, "data", "buildings.json");
const NAV_SETTINGS_FILE = path.join(ROOT, "data", "nav-settings.json");
const NODES_DIR = path.join(ROOT, "data", "nodes");
const IMAGES_DIR = path.join(ROOT, "images");

function pushIssue(list, message) {
  list.push({ message });
}

function readJson(filePath, label, errors) {
  if (!fs.existsSync(filePath)) {
    pushIssue(errors, `找不到 ${label}：${path.relative(ROOT, filePath)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    pushIssue(errors, `${label} 無法解析 JSON（${error.message}）`);
    return null;
  }
}

function resolvePublicFile(relPath) {
  const cleaned = String(relPath || "")
    .trim()
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
  if (!cleaned || /^https?:/i.test(cleaned)) {
    return null;
  }
  return path.join(ROOT, cleaned.split("/").join(path.sep));
}

function loadBuildings(errors) {
  const raw = readJson(BUILDINGS_FILE, "buildings.json", errors);
  if (!raw) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    pushIssue(errors, "buildings.json 根元素必須是物件");
    return {};
  }
  const buildings = {};
  Object.entries(raw).forEach(([buildingId, def]) => {
    const id = String(buildingId || "").trim();
    if (!id) {
      return;
    }
    const name = String(def?.name || "").trim();
    const floors = Array.isArray(def?.floors) ? def.floors : [];
    buildings[id] = { name, floors };
  });
  return buildings;
}

function loadHotspots(errors) {
  const nav = readJson(NAV_SETTINGS_FILE, "nav-settings.json", errors);
  if (!nav) {
    return {};
  }
  const campusBuildings = nav?.campusBuildings;
  if (!campusBuildings || typeof campusBuildings !== "object" || Array.isArray(campusBuildings)) {
    return {};
  }
  return campusBuildings;
}

function loadNodeFiles() {
  if (!fs.existsSync(NODES_DIR)) {
    return [];
  }
  return fs
    .readdirSync(NODES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function parseNodeScopeFilename(filename, buildingIds) {
  if (filename === "campus.json") {
    return null;
  }
  const base = filename.replace(/\.json$/i, "");
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
  return { buildingId: null, floorId: null, orphan: base };
}

function collectBuildingsValidation() {
  const errors = [];
  const warnings = [];
  const buildings = loadBuildings(errors);
  const hotspots = loadHotspots(errors);
  const nodeFiles = loadNodeFiles();
  const buildingIds = Object.keys(buildings);
  const imagesDirExists = fs.existsSync(IMAGES_DIR);

  if (!imagesDirExists) {
    pushIssue(warnings, "找不到 images/ 目錄（圖檔不進 Git，請向維護者索取後放到專案根目錄）");
  }

  buildingIds.forEach((buildingId) => {
    const def = buildings[buildingId];
    if (!def.name) {
      pushIssue(errors, `buildings.json：「${buildingId}」缺少 name`);
    }
    if (!def.floors.length) {
      pushIssue(errors, `buildings.json：「${buildingId}」floors 不可為空`);
    }
    const floorIds = new Set();
    def.floors.forEach((floor, index) => {
      const floorId = String(floor?.id || "").trim();
      if (!floorId) {
        pushIssue(errors, `buildings.json：「${buildingId}」第 ${index + 1} 層缺少 id`);
        return;
      }
      if (floorIds.has(floorId)) {
        pushIssue(errors, `buildings.json：「${buildingId}」樓層 id「${floorId}」重複`);
      }
      floorIds.add(floorId);
      const imageRel = String(floor?.image || "").trim();
      if (imagesDirExists && imageRel) {
        const abs = resolvePublicFile(imageRel);
        if (abs && !fs.existsSync(abs)) {
          pushIssue(
            warnings,
            `缺少平面圖 ${imageRel.replace(/^\.\//, "")}（${def.name || buildingId} ${floor.label || floorId}）`
          );
        }
      }
    });
  });

  Object.keys(hotspots).forEach((buildingId) => {
    if (!buildings[buildingId]) {
      pushIssue(errors, `nav-settings.campusBuildings：「${buildingId}」在 buildings.json 中不存在`);
    }
  });

  buildingIds.forEach((buildingId) => {
    if (!(buildingId in hotspots)) {
      pushIssue(warnings, `buildings.json 的「${buildingId}」在 campusBuildings 無熱點`);
    }
    const def = buildings[buildingId];
    def.floors.forEach((floor) => {
      const floorId = String(floor?.id || "").trim();
      if (!floorId) {
        return;
      }
      const expected = `${buildingId}_${floorId}.json`;
      if (!nodeFiles.includes(expected)) {
        pushIssue(
          warnings,
          `缺少節點檔 data/nodes/${expected}（${buildingId} ${floor.label || floorId}）`
        );
      }
    });
  });

  nodeFiles.forEach((filename) => {
    const parsed = parseNodeScopeFilename(filename, buildingIds);
    if (!parsed) {
      return;
    }
    if (!parsed.buildingId) {
      pushIssue(warnings, `孤兒節點檔 data/nodes/${filename}（無對應大樓定義）`);
      return;
    }
    const def = buildings[parsed.buildingId];
    const floorExists = def.floors.some((floor) => String(floor.id) === parsed.floorId);
    if (!floorExists) {
      pushIssue(
        warnings,
        `節點檔 data/nodes/${filename} 的樓層「${parsed.floorId}」不在 buildings.json`
      );
    }
  });

  return {
    ok: errors.length === 0,
    scanned: { buildings: buildingIds.length, nodeFiles: nodeFiles.length },
    errors,
    warnings
  };
}

function main() {
  const strict = process.argv.includes("--strict");
  const result = collectBuildingsValidation();
  const { scanned, errors, warnings } = result;
  console.log(`掃描 ${scanned.buildings} 棟大樓、${scanned.nodeFiles} 個節點檔…\n`);
  errors.forEach((item) => console.error(`[ERROR] ${item.message}`));
  warnings.forEach((item) => console.warn(`[WARN] ${item.message}`));
  console.log(`\n完成：錯誤 ${errors.length}，警告 ${warnings.length}`);
  if (errors.length > 0 || (strict && warnings.length > 0)) {
    process.exit(1);
  }
}

module.exports = { collectBuildingsValidation };

if (require.main === module) {
  main();
}
