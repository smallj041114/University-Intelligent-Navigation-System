/** 電梯目的地自動連通與樓層移動偏好（樓梯／電梯） */

/** stairs＝只走樓梯；both＝樓梯+電梯（依距離） */
export const FLOOR_TRAVEL_MODES = ["stairs", "both"];
export const ELEVATOR_METERS_PER_FLOOR = 14;

export function normalizeFloorTravelMode(value) {
  if (value === "stairs") {
    return "stairs";
  }
  if (value === "both" || value === "auto" || value === "elevator") {
    return "both";
  }
  return "stairs";
}

/**
 * 從 scopeKey 解析大樓與樓層（storagePrefix 預設 mcu_nav_nodes_）
 */
export function parseBuildingFloorFromScope(scopeKey, storagePrefix = "mcu_nav_nodes_") {
  if (!scopeKey || !scopeKey.startsWith(storagePrefix)) {
    return null;
  }
  const value = scopeKey.slice(storagePrefix.length);
  if (!value || value === "campus") {
    return null;
  }
  const splitAt = value.lastIndexOf("_");
  if (splitAt <= 0 || splitAt >= value.length - 1) {
    return null;
  }
  return {
    buildingId: value.slice(0, splitAt),
    floorId: value.slice(splitAt + 1)
  };
}

/**
 * 電梯邊距離：依樓層差估算
 */
export function defaultElevatorDistance(fromScopeKey, toScopeKey, storagePrefix = "mcu_nav_nodes_") {
  const from = parseBuildingFloorFromScope(fromScopeKey, storagePrefix);
  const to = parseBuildingFloorFromScope(toScopeKey, storagePrefix);
  if (!from || !to) {
    return ELEVATOR_METERS_PER_FLOOR;
  }
  const fromFloor = Number(from.floorId);
  const toFloor = Number(to.floorId);
  if (!Number.isFinite(fromFloor) || !Number.isFinite(toFloor) || fromFloor === toFloor) {
    return ELEVATOR_METERS_PER_FLOOR;
  }
  return Math.max(1, Math.abs(toFloor - fromFloor)) * ELEVATOR_METERS_PER_FLOOR;
}

/**
 * 依「走樓梯／樓梯+電梯」調整邊權重
 * - stairs：大幅拉高電梯邊，幾乎只走樓梯
 * - both：有電梯就優先電梯（拉高樓梯邊），仍允許必要時走樓梯
 */
export function weightedEdgeDistance(edge, floorMode) {
  const base =
    typeof edge?.distance === "number" && Number.isFinite(edge.distance) ? edge.distance : 10;
  const kind = edge?.kind || "walk";
  const mode = normalizeFloorTravelMode(floorMode);
  if (mode === "stairs" && kind === "elevator") {
    return base * 100;
  }
  if (mode === "both" && kind === "stairs") {
    return base * 100;
  }
  return base;
}

/**
 * 路徑邊類型（實體連線）：上樓／下樓或同棟跨樓視為樓梯；電梯靠目的地注入虛擬邊
 */
export function linkEdgeKind(link, fromScopeKey) {
  if (link?.floorChange === "up" || link?.floorChange === "down") {
    return "stairs";
  }
  const from = parseBuildingFloorFromScope(fromScopeKey);
  const to = parseBuildingFloorFromScope(link?.targetScopeKey || fromScopeKey);
  if (
    from &&
    to &&
    from.buildingId === to.buildingId &&
    from.floorId !== to.floorId
  ) {
    return "stairs";
  }
  return "walk";
}

/**
 * 電梯井名稱鍵：忽略大小寫／空白，並去掉樓層字樣（1F、2樓、B1…）
 * 例：「S棟1F電梯」「S棟2F電梯」→ 同鍵「s棟電梯」
 */
export function normalizeElevatorDestName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[bｂ]?[\d０-９]+\s*[fｆ樓層]/gi, "")
    .replace(/第\s*[\d０-９]+\s*[樓層]/g, "")
    .replace(/[\s_\-－—]+/g, "")
    .trim();
}

/**
 * 同棟、同名且 isElevator 的目的地 → 所屬節點跨樓雙向虛擬邊
 * @param {Map<string, { scopeKey: string, pointId: string, point: object }>} nodes
 * @param {Map<string, Array<{ toRef: string, distance: number, kind: string }>>} edges
 */
export function injectElevatorDestinationEdges(nodes, edges, { storagePrefix = "mcu_nav_nodes_" } = {}) {
  if (!nodes?.size || !edges) {
    return;
  }

  /** @type {Map<string, Array<{ ref: string, scopeKey: string, floorId: string }>>} */
  const banks = new Map();

  nodes.forEach((node, ref) => {
    const parsed = parseBuildingFloorFromScope(node.scopeKey, storagePrefix);
    if (!parsed) {
      return;
    }
    const seenNames = new Set();
    (node.point?.destinations || []).forEach((dest) => {
      if (!dest?.isElevator) {
        return;
      }
      const nameKey = normalizeElevatorDestName(dest.name);
      if (!nameKey || seenNames.has(nameKey)) {
        return;
      }
      seenNames.add(nameKey);
      const bankKey = `${parsed.buildingId}\0${nameKey}`;
      if (!banks.has(bankKey)) {
        banks.set(bankKey, []);
      }
      const list = banks.get(bankKey);
      if (!list.some((item) => item.ref === ref)) {
        list.push({
          ref,
          scopeKey: node.scopeKey,
          floorId: parsed.floorId
        });
      }
    });
  });

  banks.forEach((stops) => {
    for (let i = 0; i < stops.length; i += 1) {
      for (let j = i + 1; j < stops.length; j += 1) {
        const a = stops[i];
        const b = stops[j];
        if (a.floorId === b.floorId || a.ref === b.ref) {
          continue;
        }
        const distance = defaultElevatorDistance(a.scopeKey, b.scopeKey, storagePrefix);
        const pushIfMissing = (fromRef, toRef) => {
          const list = edges.get(fromRef);
          if (!list) {
            return;
          }
          if (list.some((edge) => edge.toRef === toRef && edge.kind === "elevator")) {
            return;
          }
          list.push({ toRef, distance, kind: "elevator" });
        };
        pushIfMissing(a.ref, b.ref);
        pushIfMissing(b.ref, a.ref);
      }
    }
  });
}
