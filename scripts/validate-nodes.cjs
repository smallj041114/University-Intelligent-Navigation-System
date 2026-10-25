/**
 * 節點 JSON 資料驗證
 * 用法：
 *   node scripts/validate-nodes.cjs
 *   node scripts/validate-nodes.cjs --reverse
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NODES_DIR = path.join(ROOT, "data", "nodes");
const IMAGES_DIR = path.join(ROOT, "images");
const STORAGE_PREFIX = "mcu_nav_nodes_";

function pushIssue(list, message) {
  list.push({ message });
}

function resolvePublicFile(relPath) {
  const cleaned = String(relPath || "")
    .trim()
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
  if (!cleaned || /^https?:/i.test(cleaned) || cleaned.startsWith("data:")) {
    return null;
  }
  return path.join(ROOT, cleaned.split("/").join(path.sep));
}

function scopeKeyFromFile(filename) {
  const scope = filename.replace(/\.json$/i, "");
  return `${STORAGE_PREFIX}${scope}`;
}

function loadNodeFiles(errors) {
  if (!fs.existsSync(NODES_DIR)) {
    pushIssue(errors, "找不到 data/nodes 目錄。");
    return { byScope: new Map(), nodeIndex: new Map() };
  }
  const files = fs
    .readdirSync(NODES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const byScope = new Map();
  const nodeIndex = new Map();

  files.forEach((filename) => {
    const filePath = path.join(NODES_DIR, filename);
    const scopeKey = scopeKeyFromFile(filename);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      pushIssue(errors, `${filename}：無法解析 JSON（${error.message}）`);
      return;
    }
    if (!Array.isArray(parsed)) {
      pushIssue(errors, `${filename}：根元素必須是陣列`);
      return;
    }
    byScope.set(scopeKey, { filename, points: parsed });
    parsed.forEach((point) => {
      if (!point?.id) {
        return;
      }
      nodeIndex.set(`${scopeKey}::${point.id}`, {
        scopeKey,
        filename,
        name: point.name || "(無名稱)",
        point
      });
    });
  });

  return { byScope, nodeIndex };
}

function linkKey(scopeKey, pointId, targetScopeKey, targetId) {
  return `${scopeKey}::${pointId} -> ${targetScopeKey}::${targetId}`;
}

function collectNodesValidation(options = {}) {
  const checkReverse = Boolean(options.reverse);
  const checkImages = options.checkImages !== false;
  const errors = [];
  const warnings = [];
  const { byScope, nodeIndex } = loadNodeFiles(errors);
  const imagesDirExists = fs.existsSync(IMAGES_DIR);
  const missingImageSeen = new Set();

  byScope.forEach(({ filename, points }, scopeKey) => {
    points.forEach((point) => {
      if (!point?.id) {
        pushIssue(errors, `${filename}：有節點缺少 id（name=${point?.name || "?"}）`);
      }
      (point.links || []).forEach((link) => {
        const targetScopeKey = link.targetScopeKey || scopeKey;
        const targetId = link.targetId;
        if (!targetId) {
          pushIssue(errors, `${filename} / ${point.name || point.id}：連線缺少 targetId`);
          return;
        }
        if (!nodeIndex.has(`${targetScopeKey}::${targetId}`)) {
          pushIssue(
            errors,
            `${filename} / ${point.name || point.id}：連線指向不存在的節點 ${targetScopeKey}::${targetId}`
          );
        }
      });
      (point.destinations || []).forEach((dest, index) => {
        const destName = String(dest?.name || "").trim();
        if (!destName) {
          pushIssue(
            warnings,
            `${filename} / ${point.name || point.id}：第 ${index + 1} 個目的地缺少名稱`
          );
        }
        const xPercent = Number(dest?.xPercent);
        const yPercent = Number(dest?.yPercent);
        if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
          const label = destName || `第 ${index + 1} 個目的地`;
          pushIssue(
            warnings,
            `${filename} / ${point.name || point.id}：目的地「${label}」缺少平面圖座標（xPercent／yPercent）；載入時會暫放在紅點旁，請用編輯模式拖到正確位置後存檔`
          );
        }
      });
      if (checkImages && imagesDirExists) {
        const imageRel = String(point.url || point.image || "").trim();
        const abs = resolvePublicFile(imageRel);
        if (abs && !fs.existsSync(abs) && !missingImageSeen.has(imageRel)) {
          missingImageSeen.add(imageRel);
          pushIssue(
            warnings,
            `缺少環景圖 ${imageRel.replace(/^\.\//, "")}（${filename} / ${point.name || point.id}）`
          );
        }
      }
    });
  });

  if (checkReverse) {
    const forwardLinks = new Set();
    byScope.forEach(({ points }, scopeKey) => {
      points.forEach((point) => {
        (point.links || []).forEach((link) => {
          const targetScopeKey = link.targetScopeKey || scopeKey;
          forwardLinks.add(linkKey(scopeKey, point.id, targetScopeKey, link.targetId));
        });
      });
    });

    forwardLinks.forEach((forward) => {
      const match = forward.match(/^(.+)::(.+) -> (.+)::(.+)$/);
      if (!match) {
        return;
      }
      const [, fromScope, fromId, toScope, toId] = match;
      const reverse = linkKey(toScope, toId, fromScope, fromId);
      if (!forwardLinks.has(reverse) && fromScope === toScope) {
        const fromNode = nodeIndex.get(`${fromScope}::${fromId}`);
        const toNode = nodeIndex.get(`${toScope}::${toId}`);
        pushIssue(
          warnings,
          `同 scope 缺回頭路：${fromNode?.name || fromId} -> ${toNode?.name || toId}（${fromNode?.filename || fromScope}）`
        );
      }
    });
  }

  return {
    ok: errors.length === 0,
    scanned: { nodeFiles: byScope.size, points: [...nodeIndex.values()].length },
    errors,
    warnings
  };
}

function main() {
  const checkReverse = process.argv.includes("--reverse");
  const result = collectNodesValidation({ reverse: checkReverse, checkImages: true });
  const { scanned, errors, warnings } = result;
  console.log(`掃描 ${scanned.nodeFiles} 個節點檔…\n`);
  errors.forEach((item) => console.error(`[ERROR] ${item.message}`));
  warnings.forEach((item) => console.warn(`[WARN] ${item.message}`));
  console.log(`\n完成：${scanned.points} 個節點，錯誤 ${errors.length}，警告 ${warnings.length}`);
  if (errors.length > 0) {
    process.exit(1);
  }
}

module.exports = { collectNodesValidation };

if (require.main === module) {
  main();
}
