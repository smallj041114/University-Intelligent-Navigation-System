import { adminFetch } from "./admin-fetch.js";

/** 節點 scope 檔案 API（data/nodes/{scope}.json） */

export function buildingFloorScope(buildingId, floorId) {
  return `${String(buildingId || "").trim()}_${String(floorId || "").trim()}`;
}

export function listBuildingFloorScopes(buildingId, floors = []) {
  const id = String(buildingId || "").trim();
  if (!id) {
    return [];
  }
  return (floors || [])
    .map((floor) => buildingFloorScope(id, floor?.id))
    .filter((scope) => /^[a-z0-9]+_.+$/i.test(scope));
}

/**
 * @returns {Promise<{ ok: boolean, deleted?: boolean, missing?: boolean, status?: number }>}
 */
export async function deleteNodeScopeFile(scope) {
  const name = String(scope || "").trim();
  if (!name || name === "campus") {
    return { ok: false, status: 400 };
  }
  try {
    const res = await adminFetch(`/api/node-scopes/${encodeURIComponent(name)}`, {
      method: "DELETE"
    });
    if (res.status === 401) {
      return { ok: false, status: 401 };
    }
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      deleted: data.deleted !== false,
      missing: Boolean(data.missing)
    };
  } catch {
    return { ok: false };
  }
}

export async function deleteNodeScopeFiles(scopes = []) {
  const results = [];
  for (const scope of scopes) {
    results.push({ scope, ...(await deleteNodeScopeFile(scope)) });
  }
  return results;
}

/** 刪除確認後再問是否清節點；取消 = 保留節點檔（安全預設） */
export function confirmAlsoDeleteNodeFiles(summaryLines = []) {
  const detail = summaryLines.filter(Boolean).join("\n");
  return window.confirm(
    `是否一併刪除相關節點檔？\n\n${detail}\n\n按「確定」刪除節點檔；按「取消」僅移除定義（節點檔保留）。`
  );
}
