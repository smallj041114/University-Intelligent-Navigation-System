/**
 * 平面圖捏合／滾輪縮放＋拖曳平移；標記以 --map-zoom 反縮放維持螢幕大小。
 */
export function createMapPinchZoom({ container, stage, onGesture }) {
  if (!container || !stage) {
    return {
      reset() {},
      getScale: () => 1,
      wasRecentGesture: () => false,
      destroy() {}
    };
  }

  const MIN_SCALE = 1;
  const MAX_SCALE = 4;
  const CLICK_MOVE_PX = 8;

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let gestureConsumed = false;
  let gestureClearTimer = null;

  let pointers = new Map();
  let pinchStart = null;
  let panStart = null;

  function markGesture() {
    gestureConsumed = true;
    if (gestureClearTimer) {
      clearTimeout(gestureClearTimer);
    }
    gestureClearTimer = setTimeout(() => {
      gestureConsumed = false;
      gestureClearTimer = null;
    }, 280);
    if (typeof onGesture === "function") {
      onGesture();
    }
  }

  function clampPan() {
    if (scale <= 1.001) {
      tx = 0;
      ty = 0;
      return;
    }
    const cr = container.getBoundingClientRect();
    const sw = stage.offsetWidth * scale;
    const sh = stage.offsetHeight * scale;
    const maxX = Math.max(0, (sw - cr.width) / 2 + 24);
    const maxY = Math.max(0, (sh - cr.height) / 2 + 24);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  }

  function apply() {
    if (scale <= 1.001) {
      scale = 1;
      tx = 0;
      ty = 0;
      stage.style.transform = "";
      stage.style.removeProperty("--map-zoom");
      container.classList.remove("is-map-zoomed");
      return;
    }
    clampPan();
    stage.style.transformOrigin = "center center";
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    stage.style.setProperty("--map-zoom", String(scale));
    container.classList.add("is-map-zoomed");
  }

  function zoomAtClientPoint(clientX, clientY, nextScale) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    if (clamped === scale) {
      return;
    }
    const cr = container.getBoundingClientRect();
    const cx = clientX - (cr.left + cr.width / 2);
    const cy = clientY - (cr.top + cr.height / 2);
    const ratio = clamped / scale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = clamped;
    apply();
    markGesture();
  }

  function onWheel(event) {
    if (event.target.closest(".panel, .toolbar, .toggle-btn, .outdoor-nav-panel, .panorama-overlay")) {
      return;
    }
    if (!container.contains(event.target) && event.target !== container) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY;
    const factor = delta > 0 ? 0.9 : 1.1;
    zoomAtClientPoint(event.clientX, event.clientY, scale * factor);
  }

  function pointerDist(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  function pointerMid(a, b) {
    return {
      clientX: (a.clientX + b.clientX) / 2,
      clientY: (a.clientY + b.clientY) / 2
    };
  }

  function onPointerDown(event) {
    if (
      event.target.closest(
        ".marker, .building-btn, .map-portal-btn, .map-distance-scale-bar, .map-asset-banner"
      )
    ) {
      return;
    }
    if (!container.contains(event.target) && event.target !== container) {
      return;
    }
    pointers.set(event.pointerId, event);
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchStart = {
        dist: pointerDist(a, b),
        scale,
        mid: pointerMid(a, b),
        tx,
        ty
      };
      panStart = null;
    } else if (pointers.size === 1 && scale > 1.001) {
      panStart = {
        x: event.clientX,
        y: event.clientY,
        tx,
        ty,
        moved: 0
      };
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.set(event.pointerId, event);

    if (pointers.size >= 2 && pinchStart) {
      event.preventDefault();
      const [a, b] = Array.from(pointers.values());
      const dist = pointerDist(a, b);
      if (pinchStart.dist < 1) {
        return;
      }
      const next = pinchStart.scale * (dist / pinchStart.dist);
      const mid = pointerMid(a, b);
      zoomAtClientPoint(mid.clientX, mid.clientY, next);
      return;
    }

    if (panStart && pointers.size === 1) {
      event.preventDefault();
      const dx = event.clientX - panStart.x;
      const dy = event.clientY - panStart.y;
      panStart.moved = Math.max(panStart.moved, Math.hypot(dx, dy));
      tx = panStart.tx + dx;
      ty = panStart.ty + dy;
      apply();
      if (panStart.moved > CLICK_MOVE_PX) {
        markGesture();
      }
    }
  }

  function onPointerUp(event) {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.delete(event.pointerId);
    try {
      container.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.size < 2) {
      pinchStart = null;
    }
    if (pointers.size === 0) {
      panStart = null;
    } else if (pointers.size === 1 && scale > 1.001) {
      const only = Array.from(pointers.values())[0];
      panStart = {
        x: only.clientX,
        y: only.clientY,
        tx,
        ty,
        moved: 0
      };
    }
  }

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
    pointers.clear();
    pinchStart = null;
    panStart = null;
    apply();
  }

  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove, { passive: false });
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  container.classList.add("map-pinch-enabled");

  apply();

  return {
    reset,
    getScale: () => scale,
    wasRecentGesture: () => gestureConsumed,
    destroy() {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.classList.remove("map-pinch-enabled", "is-map-zoomed");
      reset();
      if (gestureClearTimer) {
        clearTimeout(gestureClearTimer);
      }
    }
  };
}
