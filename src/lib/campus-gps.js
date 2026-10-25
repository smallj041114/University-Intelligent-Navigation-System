/**
 * 校園平面圖 GPS 粗定位：用校準錨點把 lat/lng 轉成地圖 x%/y%。
 * 僅適用校園總圖，不用於各樓層平面圖。
 */

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeMapGpsAnchors(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      const lat = asNumber(item?.lat);
      const lng = asNumber(item?.lng);
      const xPercent = asNumber(item?.xPercent);
      const yPercent = asNumber(item?.yPercent);
      if (lat == null || lng == null || xPercent == null || yPercent == null) {
        return null;
      }
      return {
        label: String(item?.label || "").trim(),
        lat,
        lng,
        xPercent,
        yPercent
      };
    })
    .filter(Boolean);
}

/** 以高斯消去解 3x3 線性方程組；失敗回傳 null */
function solveLinear3(matrix, vector) {
  const m = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(m[pivot][col]) < 1e-12) {
      return null;
    }
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }
    const div = m[col][col];
    for (let j = col; j < 4; j += 1) {
      m[col][j] /= div;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === col) {
        continue;
      }
      const factor = m[row][col];
      for (let j = col; j < 4; j += 1) {
        m[row][j] -= factor * m[col][j];
      }
    }
  }
  return [m[0][3], m[1][3], m[2][3]];
}

/**
 * 仿射：x = a*lat + b*lng + c；y = d*lat + e*lng + f
 * 錨點 ≥ 3。超過 3 點時用常態方程式做最小平方，較貼合整片校園。
 */
export function buildAffineFromAnchors(anchors) {
  const list = normalizeMapGpsAnchors(anchors);
  if (list.length < 3) {
    return null;
  }

  if (list.length === 3) {
    const a0 = list[0];
    const a1 = list[1];
    const a2 = list[2];
    const A = [
      [a0.lat, a0.lng, 1],
      [a1.lat, a1.lng, 1],
      [a2.lat, a2.lng, 1]
    ];
    const xCoef = solveLinear3(A, [a0.xPercent, a1.xPercent, a2.xPercent]);
    const yCoef = solveLinear3(A, [a0.yPercent, a1.yPercent, a2.yPercent]);
    if (!xCoef || !yCoef) {
      return null;
    }
    return { xCoef, yCoef, anchors: list };
  }

  // ATA * coef = ATb
  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const atbx = [0, 0, 0];
  const atby = [0, 0, 0];
  list.forEach((p) => {
    const row = [p.lat, p.lng, 1];
    for (let i = 0; i < 3; i += 1) {
      atbx[i] += row[i] * p.xPercent;
      atby[i] += row[i] * p.yPercent;
      for (let j = 0; j < 3; j += 1) {
        ata[i][j] += row[i] * row[j];
      }
    }
  });
  const xCoef = solveLinear3(ata, atbx);
  const yCoef = solveLinear3(ata, atby);
  if (!xCoef || !yCoef) {
    return null;
  }
  return { xCoef, yCoef, anchors: list };
}

export function applyAffine(affine, lat, lng) {
  if (!affine?.xCoef || !affine?.yCoef) {
    return null;
  }
  const [a, b, c] = affine.xCoef;
  const [d, e, f] = affine.yCoef;
  return {
    xPercent: a * lat + b * lng + c,
    yPercent: d * lat + e * lng + f
  };
}

/** 反解仿射：由平面圖 % 還原 lat/lng（供衛星圖投影） */
export function mapPercentToLatLng(xPercent, yPercent, campusConfig) {
  const resolved = resolveCampusMapGpsConfig(campusConfig);
  if (!resolved.affine?.xCoef || !resolved.affine?.yCoef) {
    return { ok: false, reason: "missing_anchors" };
  }
  const [a, b, c] = resolved.affine.xCoef;
  const [d, e, f] = resolved.affine.yCoef;
  // a*lat + b*lng = x - c
  // d*lat + e*lng = y - f
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-16) {
    return { ok: false, reason: "singular" };
  }
  const rx = xPercent - c;
  const ry = yPercent - f;
  const lat = (rx * e - b * ry) / det;
  const lng = (a * ry - rx * d) / det;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "transform_failed" };
  }
  return { ok: true, lat, lng };
}

export function clampMapPercent(point) {
  if (!point) {
    return null;
  }
  return {
    xPercent: Math.min(100, Math.max(0, point.xPercent)),
    yPercent: Math.min(100, Math.max(0, point.yPercent))
  };
}

export function resolveCampusMapGpsConfig(campus = {}) {
  const anchors = normalizeMapGpsAnchors(campus.mapGpsAnchors);
  const gate = campus.gate;
  const gateLat = asNumber(gate?.lat);
  const gateLng = asNumber(gate?.lng);
  const gateX = asNumber(campus.gateMapXPercent);
  const gateY = asNumber(campus.gateMapYPercent);
  if (
    gateLat != null &&
    gateLng != null &&
    gateX != null &&
    gateY != null &&
    !anchors.some((item) => Math.abs(item.lat - gateLat) < 1e-6 && Math.abs(item.lng - gateLng) < 1e-6)
  ) {
    anchors.unshift({
      label: gate?.name || "校門口",
      lat: gateLat,
      lng: gateLng,
      xPercent: gateX,
      yPercent: gateY
    });
  }
  const maxAccuracyMeters = asNumber(campus.gpsMaxAccuracyMeters) ?? 80;
  return {
    anchors,
    affine: buildAffineFromAnchors(anchors),
    maxAccuracyMeters
  };
}

export function latLngToCampusMapPercent(lat, lng, campusConfig) {
  const resolved = resolveCampusMapGpsConfig(campusConfig);
  if (!resolved.affine) {
    return { ok: false, reason: "missing_anchors" };
  }
  const raw = applyAffine(resolved.affine, lat, lng);
  const clamped = clampMapPercent(raw);
  if (!clamped) {
    return { ok: false, reason: "transform_failed" };
  }
  const outside =
    raw.xPercent < -5 || raw.xPercent > 105 || raw.yPercent < -5 || raw.yPercent > 105;
  return {
    ok: true,
    ...clamped,
    raw,
    outsideMap: outside,
    maxAccuracyMeters: resolved.maxAccuracyMeters
  };
}

/** 使用者提供的衛星參考圖：以圖上 % 對 lat/lng（旋轉／裁切已含在圖內） */
export function resolveSatelliteImageConfig(campus = {}) {
  const image = campus.satelliteImage || {};
  const anchors = normalizeMapGpsAnchors(image.anchors);
  return {
    url: String(image.url || "./images/campus/campus-satellite-ref.png").trim() ||
      "./images/campus/campus-satellite-ref.png",
    anchors,
    affine: buildAffineFromAnchors(anchors)
  };
}

export function latLngToSatelliteImagePercent(lat, lng, campusConfig) {
  const resolved = resolveSatelliteImageConfig(campusConfig);
  if (!resolved.affine) {
    return { ok: false, reason: "missing_anchors" };
  }
  const raw = applyAffine(resolved.affine, lat, lng);
  const clamped = clampMapPercent(raw);
  if (!clamped) {
    return { ok: false, reason: "transform_failed" };
  }
  return {
    ok: true,
    ...clamped,
    raw,
    outsideMap: raw.xPercent < -5 || raw.xPercent > 105 || raw.yPercent < -5 || raw.yPercent > 105
  };
}

export function satelliteImagePercentToLatLng(xPercent, yPercent, campusConfig) {
  const resolved = resolveSatelliteImageConfig(campusConfig);
  if (!resolved.affine?.xCoef || !resolved.affine?.yCoef) {
    return { ok: false, reason: "missing_anchors" };
  }
  const [a, b, c] = resolved.affine.xCoef;
  const [d, e, f] = resolved.affine.yCoef;
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-16) {
    return { ok: false, reason: "singular" };
  }
  const rx = xPercent - c;
  const ry = yPercent - f;
  const lat = (rx * e - b * ry) / det;
  const lng = (a * ry - rx * d) / det;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "transform_failed" };
  }
  return { ok: true, lat, lng };
}
