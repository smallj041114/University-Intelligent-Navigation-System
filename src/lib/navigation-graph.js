import { resolveNodeFileScopes, scopeLabel } from "./visitor-starts.js";
import { NODES_DATA_BASE, STORAGE_PREFIX } from "../navigation/state.js";
import {
  injectElevatorDestinationEdges,
  linkEdgeKind,
  normalizeFloorTravelMode,
  weightedEdgeDistance
} from "./elevator-routes.js";

function scopeFileToStorageKey(scopeFile) {
  return `${STORAGE_PREFIX}${scopeFile}`;
}

export function encodeNodeRef(scopeKey, pointId) {
  return `${scopeKey}::${pointId}`;
}

function getScopeDisplayName(scopeKey) {
  if (!scopeKey?.startsWith(STORAGE_PREFIX)) {
    return "未知區域";
  }
  return scopeLabel(scopeKey.slice(STORAGE_PREFIX.length));
}

function parseScopedQuery(query) {
  const trimmed = String(query || "").trim();
  const match = trimmed.match(/^(.+?)（(.+)）$/);
  if (!match) {
    return { nameQuery: trimmed.toLowerCase(), scopeFilter: null };
  }
  return {
    nameQuery: match[1].trim().toLowerCase(),
    scopeFilter: match[2].trim().toLowerCase()
  };
}

function matchesScopeFilter(scopeKey, scopeFilter) {
  if (!scopeFilter) {
    return true;
  }
  return getScopeDisplayName(scopeKey).toLowerCase().includes(scopeFilter);
}

function normalizeGraphPoint(raw, scopeKey) {
  return {
    id: raw.id,
    name: String(raw.name || "").trim(),
    url: String(raw.url || "").trim(),
    scopeKey,
    links: (raw.links || []).map((link) => {
      const targetScopeKey = link.targetScopeKey || scopeKey;
      let distance =
        typeof link.distance === "number" ? link.distance : Number(link.distance);
      if (!Number.isFinite(distance) || distance <= 0) {
        distance = 10;
      }
      return {
        targetId: link.targetId,
        targetScopeKey,
        distance,
        floorChange:
          link.floorChange === "up" || link.floorChange === "down" ? link.floorChange : null
      };
    }),
    destinations: (raw.destinations || []).map((dest) => ({
      id: dest.id,
      name: String(dest.name || "").trim(),
      isElevator: Boolean(dest.isElevator),
      yaw: typeof dest.yaw === "number" ? dest.yaw : Number(dest.yaw),
      pitch: typeof dest.pitch === "number" ? dest.pitch : Number(dest.pitch)
    }))
  };
}

let graphLoadPromise = null;
/** @type {{ pointsByRef: Map<string, object>, points: object[] } | null} */
let graphData = null;

export function clearNavigationGraphCache() {
  graphLoadPromise = null;
  graphData = null;
}

export async function loadNavigationGraph() {
  if (graphData) {
    return graphData;
  }
  if (!graphLoadPromise) {
    graphLoadPromise = (async () => {
      const pointsByRef = new Map();
      const points = [];
      const scopeFiles = await resolveNodeFileScopes();
      await Promise.all(
        scopeFiles.map(async (scopeFile) => {
          const scopeKey = scopeFileToStorageKey(scopeFile);
          try {
            const res = await fetch(`${NODES_DATA_BASE}${scopeFile}.json`, { cache: "no-store" });
            if (!res.ok) {
              return;
            }
            const parsed = await res.json();
            (Array.isArray(parsed) ? parsed : []).forEach((raw) => {
              if (!raw?.id) {
                return;
              }
              const point = normalizeGraphPoint(raw, scopeKey);
              const ref = encodeNodeRef(scopeKey, point.id);
              pointsByRef.set(ref, point);
              points.push(point);
            });
          } catch {
            /* 單一 scope 失敗不阻斷 */
          }
        })
      );
      graphData = { pointsByRef, points };
      return graphData;
    })();
  }
  return graphLoadPromise;
}

function getAllDestinations(points) {
  return points.flatMap((point) =>
    (point.destinations || []).map((dest) => ({
      ...dest,
      pointId: point.id,
      pointName: point.name,
      scopeKey: point.scopeKey
    }))
  );
}

function collectNodesFromDestinations(graph, destinations, predicate) {
  const refs = new Map();
  destinations.forEach((dest) => {
    if (!predicate(dest)) {
      return;
    }
    const ref = encodeNodeRef(dest.scopeKey, dest.pointId);
    if (!refs.has(ref)) {
      const point = graph.pointsByRef.get(ref);
      if (point) {
        refs.set(ref, point);
      }
    }
  });
  return [...refs.values()];
}

function getNodesForNavigationQuery(graph, query) {
  const { nameQuery, scopeFilter } = parseScopedQuery(query);
  if (!nameQuery) {
    return { nodes: [], matchedBy: null };
  }

  const allPoints = graph.points;
  const exactNodes = allPoints.filter(
    (point) =>
      point.name.toLowerCase() === nameQuery && matchesScopeFilter(point.scopeKey, scopeFilter)
  );
  if (exactNodes.length > 0) {
    return { nodes: exactNodes, matchedBy: "node" };
  }

  const allDestinations = getAllDestinations(allPoints);
  const exactDestNodes = collectNodesFromDestinations(
    graph,
    allDestinations,
    (dest) => dest.name.toLowerCase() === nameQuery && matchesScopeFilter(dest.scopeKey, scopeFilter)
  );
  if (exactDestNodes.length > 0) {
    return { nodes: exactDestNodes, matchedBy: "destination" };
  }

  const partialNodes = allPoints.filter(
    (point) =>
      point.name.toLowerCase().includes(nameQuery) && matchesScopeFilter(point.scopeKey, scopeFilter)
  );
  const partialDestNodes = collectNodesFromDestinations(
    graph,
    allDestinations,
    (dest) =>
      (dest.name.toLowerCase().includes(nameQuery) ||
        dest.pointName.toLowerCase().includes(nameQuery)) &&
      matchesScopeFilter(dest.scopeKey, scopeFilter)
  );

  const combined = new Map();
  [...partialNodes, ...partialDestNodes].forEach((point) => {
    combined.set(encodeNodeRef(point.scopeKey, point.id), point);
  });

  return {
    nodes: [...combined.values()],
    matchedBy: combined.size > 0 ? "partial" : null
  };
}

function resolveDestinationAtPoint(point, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!point || !q) {
    return null;
  }
  const destinations = point.destinations || [];
  const exact = destinations.find((dest) => dest.name.trim().toLowerCase() === q);
  if (exact) {
    return exact;
  }
  const partial = destinations.filter((dest) => dest.name.trim().toLowerCase().includes(q));
  return partial.length === 1 ? partial[0] : null;
}

function buildGlobalNavigationGraph(graph) {
  const nodes = new Map();
  const edges = new Map();

  graph.points.forEach((point) => {
    const ref = encodeNodeRef(point.scopeKey, point.id);
    nodes.set(ref, { scopeKey: point.scopeKey, pointId: point.id, point });
    edges.set(ref, []);
  });

  nodes.forEach((node, ref) => {
    (node.point.links || []).forEach((link) => {
      const targetScopeKey = link.targetScopeKey || node.scopeKey;
      const toRef = encodeNodeRef(targetScopeKey, link.targetId);
      if (!nodes.has(toRef)) {
        return;
      }
      edges.get(ref).push({
        toRef,
        distance: typeof link.distance === "number" ? link.distance : Number(link.distance) || 10,
        kind: linkEdgeKind(link, node.scopeKey)
      });
    });
  });

  injectElevatorDestinationEdges(nodes, edges, { storagePrefix: STORAGE_PREFIX });
  return { nodes, edges };
}

export function findShortestPath(
  graph,
  startScopeKey,
  startId,
  endScopeKey,
  endId,
  floorMode = "stairs"
) {
  const mode = normalizeFloorTravelMode(floorMode);
  const startRef = encodeNodeRef(startScopeKey, startId);
  const endRef = encodeNodeRef(endScopeKey, endId);
  if (startRef === endRef) {
    const point = graph.pointsByRef.get(startRef);
    return {
      steps: [{ scopeKey: startScopeKey, pointId: startId, name: point?.name, arriveVia: null }],
      totalDistance: 0,
      floorMode: mode
    };
  }

  const { nodes, edges } = buildGlobalNavigationGraph(graph);
  if (!nodes.has(startRef) || !nodes.has(endRef)) {
    return null;
  }

  const dist = new Map();
  const prev = new Map();
  const prevKind = new Map();
  const unvisited = new Set(nodes.keys());
  nodes.forEach((_, ref) => dist.set(ref, Infinity));
  dist.set(startRef, 0);

  while (unvisited.size > 0) {
    let current = null;
    let min = Infinity;
    unvisited.forEach((ref) => {
      if (dist.get(ref) < min) {
        min = dist.get(ref);
        current = ref;
      }
    });

    if (current === null || min === Infinity) {
      break;
    }
    if (current === endRef) {
      break;
    }

    unvisited.delete(current);
    (edges.get(current) || []).forEach((edge) => {
      const { toRef } = edge;
      if (!unvisited.has(toRef)) {
        return;
      }
      const alt = dist.get(current) + weightedEdgeDistance(edge, mode);
      if (alt < dist.get(toRef)) {
        dist.set(toRef, alt);
        prev.set(toRef, current);
        prevKind.set(toRef, edge.kind || "walk");
      }
    });
  }

  if (!Number.isFinite(dist.get(endRef))) {
    return null;
  }

  const stepRefs = [];
  let currentRef = endRef;
  while (currentRef) {
    stepRefs.unshift(currentRef);
    currentRef = prev.get(currentRef);
  }

  const steps = stepRefs.map((ref, index) => {
    const node = nodes.get(ref);
    return {
      scopeKey: node.scopeKey,
      pointId: node.pointId,
      name: node.point?.name,
      arriveVia: index === 0 ? null : prevKind.get(ref) || "walk"
    };
  });

  let displayDistance = 0;
  for (let i = 1; i < stepRefs.length; i += 1) {
    const fromRef = stepRefs[i - 1];
    const toRef = stepRefs[i];
    const edge = (edges.get(fromRef) || []).find((item) => item.toRef === toRef);
    displayDistance += edge?.distance || 10;
  }

  return {
    steps,
    totalDistance: Math.round(displayDistance),
    floorMode: mode
  };
}

function resolveBestPathDetail(graph, startQuery, endQuery) {
  const startCandidates = getNodesForNavigationQuery(graph, startQuery);
  const endCandidates = getNodesForNavigationQuery(graph, endQuery);

  if (startCandidates.nodes.length === 0 || endCandidates.nodes.length === 0) {
    return null;
  }

  let best = null;
  startCandidates.nodes.forEach((start) => {
    endCandidates.nodes.forEach((end) => {
      const result = findShortestPath(graph, start.scopeKey, start.id, end.scopeKey, end.id);
      if (!result) {
        return;
      }
      if (!best || result.totalDistance < best.result.totalDistance) {
        best = {
          start,
          end,
          result,
          endDestination: resolveDestinationAtPoint(end, endQuery)
        };
      }
    });
  });

  return best;
}

/** 起點鎖死為指定節點，只對終點查詢做候選比對（多段路徑串接用） */
function resolveBestPathFromNode(graph, startNode, endQuery) {
  if (!startNode?.id || !startNode?.scopeKey) {
    return null;
  }
  const endCandidates = getNodesForNavigationQuery(graph, endQuery);
  if (endCandidates.nodes.length === 0) {
    return null;
  }

  let best = null;
  endCandidates.nodes.forEach((end) => {
    const result = findShortestPath(
      graph,
      startNode.scopeKey,
      startNode.id,
      end.scopeKey,
      end.id
    );
    if (!result) {
      return;
    }
    if (!best || result.totalDistance < best.result.totalDistance) {
      best = {
        start: startNode,
        end,
        result,
        endDestination: resolveDestinationAtPoint(end, endQuery)
      };
    }
  });

  return best;
}

export function resolveBestPath(graph, startQuery, endQuery) {
  return resolveBestPathDetail(graph, startQuery, endQuery)?.result || null;
}

export function appendPathSteps(existing, next) {
  if (!next?.length) {
    return existing || [];
  }
  if (!existing?.length) {
    return [...next];
  }
  const last = existing[existing.length - 1];
  const first = next[0];
  if (last.scopeKey === first.scopeKey && last.pointId === first.pointId) {
    return existing.concat(next.slice(1));
  }
  return existing.concat(next);
}

/** 依序串接多段最短路徑：queries = [起點, ...停靠, 終點]
 * 下一段起點必須是上一段實際抵達的節點，避免同名停靠被重解析成另一點而倒退。
 */
export function resolveOrderedPath(graph, queries) {
  const cleaned = (queries || []).map((q) => String(q || "").trim()).filter(Boolean);
  if (cleaned.length < 2) {
    return null;
  }

  let combinedSteps = [];
  let totalDistance = 0;
  let fixedStart = null;

  for (let i = 0; i < cleaned.length - 1; i += 1) {
    const detail = fixedStart
      ? resolveBestPathFromNode(graph, fixedStart, cleaned[i + 1])
      : resolveBestPathDetail(graph, cleaned[i], cleaned[i + 1]);
    if (!detail?.result?.steps?.length) {
      return {
        error: true,
        fromQuery: cleaned[i],
        toQuery: cleaned[i + 1]
      };
    }
    combinedSteps = appendPathSteps(combinedSteps, detail.result.steps);
    totalDistance += detail.result.totalDistance;
    fixedStart = detail.end;
  }

  return {
    steps: combinedSteps,
    totalDistance,
    waypointQueries: cleaned.slice(1, -1)
  };
}

export async function resolveVisitorPath(startQuery, endQuery) {
  const graph = await loadNavigationGraph();
  return resolveBestPath(graph, startQuery, endQuery);
}

export function collectPathPanoramaUrls(graph, path, maxStations = 5) {
  if (!graph || !path?.steps?.length) {
    return [];
  }
  const urls = [];
  const seen = new Set();
  const limit = Math.min(path.steps.length, Math.max(1, maxStations));
  for (let i = 0; i < limit; i += 1) {
    const step = path.steps[i];
    const point = graph.pointsByRef.get(encodeNodeRef(step.scopeKey, step.pointId));
    const url = point?.url;
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export const DEFAULT_WAYPOINT_STAY_SECONDS = 10;
export const WAYPOINT_STAY_BUTTON = "btn";

export function clampWaypointStaySeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_WAYPOINT_STAY_SECONDS;
  }
  return Math.min(300, Math.max(1, Math.round(n * 10) / 10));
}

export function encodeWaypointStayList(stops) {
  return (stops || [])
    .map((stop) => {
      if (stop?.waitMode === "button") {
        return WAYPOINT_STAY_BUTTON;
      }
      return String(clampWaypointStaySeconds(stop?.seconds));
    })
    .join(",");
}

export function decodeWaypointStayList(param, count) {
  const parts = String(param || "").split(",");
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const raw = String(parts[i] || "").trim().toLowerCase();
    if (raw === WAYPOINT_STAY_BUTTON || raw === "button" || raw === "tap") {
      result.push({ waitMode: "button", seconds: DEFAULT_WAYPOINT_STAY_SECONDS });
    } else {
      result.push({
        waitMode: "seconds",
        seconds: clampWaypointStaySeconds(raw)
      });
    }
  }
  return result;
}

export async function collectVisitorPathPanoramaUrls(startQuery, endQuery, maxStations = 8) {
  const graph = await loadNavigationGraph();
  const queries = Array.isArray(startQuery)
    ? startQuery
    : [startQuery, endQuery].map((q) => String(q || "").trim()).filter(Boolean);
  const path = resolveOrderedPath(graph, queries);
  if (!path || path.error || !path.steps?.length) {
    return [];
  }
  return collectPathPanoramaUrls(graph, path, maxStations);
}
