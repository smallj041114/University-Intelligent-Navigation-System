export const PanoramaViewer = {
  MAX_TEXTURE_WIDTH: 4096,
  LEVEL_PITCH: 0,
  /** 地面導航箭頭預設俯仰角（負值＝貼近地面） */
  NAV_ARROW_DEFAULT_PITCH: -32,
  /** 地面導航箭頭預設透明度 0–1 */
  NAV_ARROW_DEFAULT_OPACITY: 0.82,
  /** 箭頭平面傾斜角（越大越貼地） */
  NAV_ARROW_TILT_DEG: 68,
  EDIT_PITCH_MIN: -18,
  EDIT_PITCH_MAX: 18,
  viewerInstance: null,
  hostElement: null,
  options: null,
  editPointerDown: null,
  editPointerUpHandler: null,
  editPointerDownHandler: null,
  navHotspotIds: [],
  destHotspotIds: [],
  navHotspotConfigs: new Map(),
  arrowEditMode: false,
  arrowDragState: null,
  onArrowDragEnd: null,
  arrowDragMoveHandler: null,
  arrowDragUpHandler: null,
  arrowDragRaf: null,
  arrowDragPendingEvent: null,
  onNavigateHandler: null,
  onDestinationHandler: null,
  onViewChangeHandler: null,
  viewChangeBound: false,
  /** 終點轉向中：禁止 applyMountedOptions 把 yaw 重設回進場角 */
  orientationLock: false,
  transitionClassName: "is-switching",
  SCENE_FADE_MS: 350,
  SCENE_IDS: ["pnlm_scene_a", "pnlm_scene_b"],
  currentSceneId: null,
  sceneSlotIndex: 0,
  mountToken: 0,
  /** 載入遮罩世代：並行 mount 時只讓最新一次決定 is-panorama-loading */
  loadingGeneration: 0,
  loadingHost: null,
  loadingStartedAt: 0,
  loadingStatusTimer: null,
  panoramaSrcCache: new Map(),
  panoramaSrcPending: new Map(),
  navArrowSettings: null,

  getNavArrowSettings() {
    if (this.navArrowSettings) {
      return this.navArrowSettings;
    }
    if (typeof NavArrowSettings !== "undefined") {
      this.navArrowSettings = NavArrowSettings.load();
    } else {
      this.navArrowSettings = {
        size: 56,
        opacity: this.NAV_ARROW_DEFAULT_OPACITY,
        pitch: this.NAV_ARROW_DEFAULT_PITCH,
        tilt: this.NAV_ARROW_TILT_DEG
      };
    }
    return this.navArrowSettings;
  },

  normalizeWalkOrientation(yaw, pitch) {
    let normalizedYaw = yaw;
    if (typeof normalizedYaw === "number") {
      normalizedYaw = ((normalizedYaw + 180) % 360) - 180;
    }
    return { yaw: normalizedYaw, pitch: this.LEVEL_PITCH };
  },

  applyWalkEditConstraints(viewer) {
    if (!viewer) return;
    try {
      viewer.setPitchBounds([this.EDIT_PITCH_MIN, this.EDIT_PITCH_MAX]);
      viewer.setPitch(this.LEVEL_PITCH, false);
    } catch {
      /* ignore */
    }
  },

  resolveSrc(src) {
    if (!src) return src;
    try {
      return new URL(src, window.location.href).href;
    } catch {
      return src;
    }
  },

  formatPanoramaPath(src) {
    const raw = String(src || "").trim();
    if (!raw || raw.startsWith("data:")) {
      return "";
    }
    return raw.replace(/^\.\//, "").replace(/^https?:\/\/[^/]+\//, "");
  },

  loadAndPreparePanoramaSrc(resolved, displaySrc, onProgress) {
    return this.fetchPanoramaBlob(resolved, onProgress)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        return new Promise((resolve, reject) => {
          const img = new Image();
          if (/^https?:/i.test(resolved)) {
            img.crossOrigin = "anonymous";
          }
          img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            if (img.width <= this.MAX_TEXTURE_WIDTH) {
              resolve(resolved);
              return;
            }
            const scale = this.MAX_TEXTURE_WIDTH / img.width;
            const canvas = document.createElement("canvas");
            canvas.width = this.MAX_TEXTURE_WIDTH;
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
              resolve(canvas.toDataURL("image/jpeg", 0.9));
            } catch {
              reject(new Error("圖片解析度過高，請用 start-server.bat 開啟網站。"));
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(
              new Error(
                `找不到環景圖：${String(displaySrc || "").replace(/^\.\//, "") || "(未指定路徑)"}。請把檔案放到專案 images/ 對應路徑。`
              )
            );
          };
          img.src = objectUrl;
        });
      })
      .catch((error) => {
        // XHR 失敗時退回 Image（無進度）
        if (error?.code === "xhr-failed") {
          return this.loadPanoramaViaImage(resolved, displaySrc);
        }
        throw error;
      });
  },

  fetchPanoramaBlob(resolved, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", resolved);
      xhr.responseType = "blob";
      const started = performance.now();
      xhr.onprogress = (event) => {
        const elapsedSec = Math.max(0.05, (performance.now() - started) / 1000);
        const loaded = event.loaded || 0;
        const total = event.lengthComputable ? event.total || 0 : 0;
        const speedKBs = loaded / 1024 / elapsedSec;
        const percent =
          total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : null;
        onProgress?.({ loaded, total, speedKBs, percent, elapsedSec });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          const elapsedSec = Math.max(0.05, (performance.now() - started) / 1000);
          const loaded = xhr.response.size || 0;
          onProgress?.({
            loaded,
            total: loaded,
            speedKBs: loaded / 1024 / elapsedSec,
            percent: 100,
            elapsedSec
          });
          resolve(xhr.response);
          return;
        }
        const err = new Error(`HTTP ${xhr.status}`);
        err.code = "xhr-failed";
        reject(err);
      };
      xhr.onerror = () => {
        const err = new Error("network error");
        err.code = "xhr-failed";
        reject(err);
      };
      xhr.send();
    });
  },

  loadPanoramaViaImage(resolved, displaySrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (/^https?:/i.test(resolved)) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        if (img.width <= this.MAX_TEXTURE_WIDTH) {
          resolve(resolved);
          return;
        }
        const scale = this.MAX_TEXTURE_WIDTH / img.width;
        const canvas = document.createElement("canvas");
        canvas.width = this.MAX_TEXTURE_WIDTH;
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        } catch {
          reject(new Error("圖片解析度過高，請用 start-server.bat 開啟網站。"));
        }
      };
      img.onerror = () =>
        reject(
          new Error(
            `找不到環景圖：${String(displaySrc || "").replace(/^\.\//, "") || "(未指定路徑)"}。請把檔案放到專案 images/ 對應路徑。`
          )
        );
      img.src = resolved;
    });
  },

  async preparePanoramaSrc(src, onProgress) {
    const resolved = this.resolveSrc(src);
    if (this.panoramaSrcCache.has(resolved)) {
      return this.panoramaSrcCache.get(resolved);
    }
    if (this.panoramaSrcPending.has(resolved)) {
      return this.panoramaSrcPending.get(resolved);
    }
    const pending = this.loadAndPreparePanoramaSrc(resolved, src, onProgress)
      .then((prepared) => {
        this.panoramaSrcCache.set(resolved, prepared);
        return prepared;
      })
      .finally(() => {
        this.panoramaSrcPending.delete(resolved);
      });
    this.panoramaSrcPending.set(resolved, pending);
    return pending;
  },

  preloadPanoramaSrc(src) {
    if (!src) return Promise.resolve();
    return this.preparePanoramaSrc(src).catch(() => {});
  },

  isPanoramaSrcCached(src) {
    if (!src) {
      return false;
    }
    return this.panoramaSrcCache.has(this.resolveSrc(src));
  },

  formatLoadingStatus({ percent, speedKBs, elapsedSec } = {}) {
    const parts = ["環景載入中"];
    if (typeof percent === "number" && Number.isFinite(percent)) {
      parts.push(`${percent}%`);
    }
    if (typeof speedKBs === "number" && Number.isFinite(speedKBs) && speedKBs > 0) {
      const speedText =
        speedKBs >= 1024
          ? `${(speedKBs / 1024).toFixed(1)} MB/s`
          : `${Math.max(1, Math.round(speedKBs))} KB/s`;
      parts.push(speedText);
    } else if (typeof elapsedSec === "number" && elapsedSec >= 0.5) {
      parts.push(`已 ${elapsedSec.toFixed(1)}s`);
    }
    return `${parts.join(" · ")}…`;
  },

  setPanoramaLoading(host, loading, detail = "") {
    if (!host) {
      return;
    }
    host.classList.toggle("is-panorama-loading", Boolean(loading));
    host.setAttribute("aria-busy", loading ? "true" : "false");
    let status = host.querySelector(".panorama-loading-status");
    if (loading) {
      this.loadingHost = host;
      if (!this.loadingStartedAt) {
        this.loadingStartedAt = performance.now();
      }
      if (!status) {
        status = document.createElement("div");
        status.className = "panorama-loading-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        host.appendChild(status);
      }
      status.textContent = detail || this.formatLoadingStatus({
        elapsedSec: (performance.now() - this.loadingStartedAt) / 1000
      });
      if (!this.loadingStatusTimer) {
        this.loadingStatusTimer = setInterval(() => {
          if (!this.loadingHost?.classList.contains("is-panorama-loading")) {
            return;
          }
          const el = this.loadingHost.querySelector(".panorama-loading-status");
          if (!el || el.dataset.hasProgress === "1") {
            return;
          }
          const elapsedSec = (performance.now() - this.loadingStartedAt) / 1000;
          el.textContent = this.formatLoadingStatus({ elapsedSec });
        }, 400);
      }
    } else {
      if (status) {
        status.remove();
      }
      if (this.loadingHost === host) {
        this.loadingHost = null;
        this.loadingStartedAt = 0;
        if (this.loadingStatusTimer) {
          clearInterval(this.loadingStatusTimer);
          this.loadingStatusTimer = null;
        }
      }
    }
  },

  updatePanoramaLoadingProgress(info) {
    const host = this.loadingHost;
    if (!host?.classList.contains("is-panorama-loading")) {
      return;
    }
    const status = host.querySelector(".panorama-loading-status");
    if (!status) {
      return;
    }
    status.dataset.hasProgress = "1";
    status.textContent = this.formatLoadingStatus(info);
  },

  preloadPanoramaSrcs(srcs) {
    const seen = new Set();
    (srcs || []).forEach((src) => {
      const resolved = this.resolveSrc(src);
      if (!resolved || seen.has(resolved)) return;
      seen.add(resolved);
      this.preloadPanoramaSrc(src);
    });
  },

  setOnViewChange(handler) {
    this.onViewChangeHandler = typeof handler === "function" ? handler : null;
  },

  notifyViewChange() {
    if (typeof this.onViewChangeHandler !== "function") {
      return;
    }
    this.onViewChangeHandler({
      yaw: this.getYaw(),
      pitch: typeof this.getPitch === "function" ? this.getPitch() : null
    });
  },

  bindViewChangeEvents() {
    if (!this.viewerInstance || this.viewChangeBound) {
      return;
    }
    this.viewChangeBound = true;
    const emit = () => {
      this.notifyViewChange();
    };
    this.viewerInstance.on("animatefinished", emit);
    const container = this.viewerInstance.getContainer?.();
    if (container) {
      container.addEventListener("mouseup", emit);
      container.addEventListener("touchend", emit, { passive: true });
    }
  },

  handleNavigate(targetId) {
    if (!targetId || targetId === "__preview__") {
      return;
    }
    if (this.onNavigateHandler) {
      this.onNavigateHandler(targetId);
    }
  },

  handleDestinationSelect(destId) {
    if (!destId || destId === "__preview__") {
      return;
    }
    if (this.onDestinationHandler) {
      this.onDestinationHandler(destId);
    }
  },

  resolveNavArrowPitch(spot) {
    if (typeof spot?.arrowPitch === "number") {
      return spot.arrowPitch;
    }
    if (typeof spot?.pitch === "number" && Math.abs(spot.pitch - this.LEVEL_PITCH) > 0.01) {
      return spot.pitch;
    }
    return this.getNavArrowSettings().pitch;
  },

  resolveNavArrowOpacity(spot) {
    const fallback = this.getNavArrowSettings().opacity;
    const value = typeof spot?.arrowOpacity === "number" ? spot.arrowOpacity : fallback;
    return Math.min(1, Math.max(0.1, value));
  },

  createNavGroundArrowElement(args) {
    const settings = this.getNavArrowSettings();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-ground-arrow";
    if (args.isPathNext) {
      btn.classList.add("nav-ground-arrow-path-next");
    }
    const isElevator = args.transport === "elevator";
    if (isElevator) {
      btn.classList.add("nav-ground-arrow-elevator");
    } else if (args.floorChange === "up") {
      btn.classList.add("nav-ground-arrow-floor-up");
    } else if (args.floorChange === "down") {
      btn.classList.add("nav-ground-arrow-floor-down");
    }
    btn.title = args.label;
    btn.style.setProperty("--nav-arrow-opacity", String(args.opacity));
    const baseSize = typeof args.size === "number" ? args.size : settings.size;
    const size = isElevator || args.floorChange ? Math.round(baseSize * 1.28) : baseSize;
    btn.style.setProperty("--nav-arrow-size", `${size}px`);
    btn.style.setProperty(
      "--nav-arrow-tilt",
      `${typeof args.tilt === "number" ? args.tilt : settings.tilt}deg`
    );

    const iconWrap = document.createElement("span");
    iconWrap.className = "nav-ground-arrow-icon-wrap";
    iconWrap.setAttribute("aria-hidden", "true");
    if (isElevator) {
      iconWrap.innerHTML =
        '<svg class="nav-ground-arrow-icon" viewBox="0 0 64 64" focusable="false">' +
        '<rect class="nav-ground-arrow-fill" x="14" y="8" width="36" height="48" rx="4"/>' +
        '<path class="nav-ground-arrow-stroke" d="M14 8 H50 V56 H14 Z M32 8 V56" fill="none" stroke-width="4" stroke-linejoin="round"/>' +
        '<path class="nav-ground-arrow-stroke" d="M24 28 L32 18 L40 28 M24 36 L32 46 L40 36" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>";
    } else if (args.floorChange === "up") {
      iconWrap.innerHTML =
        '<svg class="nav-ground-arrow-icon" viewBox="0 0 64 64" focusable="false">' +
        '<path class="nav-ground-arrow-fill" d="M32 4 L52 28 L40 28 L40 58 L24 58 L24 28 L12 28 Z"/>' +
        '<path class="nav-ground-arrow-stroke" d="M32 4 L52 28 L40 28 L40 58 L24 58 L24 28 L12 28 Z" fill="none" stroke-width="4" stroke-linejoin="round"/>' +
        "</svg>";
    } else if (args.floorChange === "down") {
      iconWrap.innerHTML =
        '<svg class="nav-ground-arrow-icon" viewBox="0 0 64 64" focusable="false">' +
        '<path class="nav-ground-arrow-fill" d="M24 6 L40 6 L40 36 L52 36 L32 60 L12 36 L24 36 Z"/>' +
        '<path class="nav-ground-arrow-stroke" d="M24 6 L40 6 L40 36 L52 36 L32 60 L12 36 L24 36 Z" fill="none" stroke-width="4" stroke-linejoin="round"/>' +
        "</svg>";
    } else {
      iconWrap.innerHTML =
        '<svg class="nav-ground-arrow-icon" viewBox="0 0 64 64" focusable="false">' +
        '<path class="nav-ground-arrow-fill" d="M32 6 L54 50 L40 50 L32 30 L24 50 L10 50 Z"/>' +
        '<path class="nav-ground-arrow-stroke" d="M32 6 L54 50 L40 50 L32 30 L24 50 L10 50 Z" fill="none" stroke-width="4" stroke-linejoin="round"/>' +
        "</svg>";
    }

    if (isElevator || args.floorChange === "up" || args.floorChange === "down") {
      const badge = document.createElement("span");
      badge.className = "nav-ground-arrow-floor-badge";
      badge.textContent = isElevator ? "電梯" : args.floorChange === "up" ? "上樓" : "下樓";
      btn.appendChild(badge);
    }

    const labelEl = document.createElement("span");
    labelEl.className = "nav-ground-arrow-label";
    labelEl.textContent = args.shortLabel || args.label;

    btn.appendChild(iconWrap);
    btn.appendChild(labelEl);
    return btn;
  },

  createHotspotConfig(spot) {
    const label = spot.text || "前往";
    const shortLabel = spot.shortLabel || label;
    const targetId = spot.targetId;
    const pitch = this.resolveNavArrowPitch(spot);
    const opacity = this.resolveNavArrowOpacity(spot);
    const settings = this.getNavArrowSettings();
    const yaw = spot.yaw;
    const editable = Boolean(spot.editable);
    const linkId = spot.id;
    const isPathNext = Boolean(spot.isPathNext);
    const isElevator = spot.transport === "elevator";
    const floorChange =
      !isElevator && (spot.floorChange === "up" || spot.floorChange === "down")
        ? spot.floorChange
        : null;

    const cssParts = [editable ? "nav-hotspot-wrap nav-hotspot-editable-wrap" : "nav-hotspot-wrap"];
    if (isPathNext) {
      cssParts.push("nav-hotspot-path-next");
    }
    if (isElevator) {
      cssParts.push("nav-hotspot-elevator");
    } else if (floorChange === "up") {
      cssParts.push("nav-hotspot-floor-up");
    } else if (floorChange === "down") {
      cssParts.push("nav-hotspot-floor-down");
    }

    return {
      pitch,
      yaw,
      type: "custom",
      cssClass: cssParts.join(" "),
      createTooltipArgs: {
        label,
        shortLabel,
        targetId,
        opacity,
        size: settings.size,
        tilt: settings.tilt,
        editable,
        linkId,
        isPathNext,
        floorChange,
        transport: isElevator ? "elevator" : null
      },
      createTooltipFunc(hotSpotDiv, args) {
        hotSpotDiv.classList.add("pnlm-pointer");
        hotSpotDiv.setAttribute("role", "button");
        hotSpotDiv.setAttribute("aria-label", args.label);

        const btn = PanoramaViewer.createNavGroundArrowElement(args);
        if (args.editable) {
          btn.classList.add("nav-ground-arrow-editable");
          btn.setAttribute("aria-grabbed", "false");
          PanoramaViewer.bindArrowDrag(btn, args.linkId);
        } else {
          const go = (event) => {
            event.preventDefault();
            event.stopPropagation();
            PanoramaViewer.handleNavigate(args.targetId);
          };

          btn.addEventListener("click", go);
          btn.addEventListener("touchend", go);
          hotSpotDiv.addEventListener("click", go);
        }
        hotSpotDiv.appendChild(btn);
      }
    };
  },

  bindArrowDrag(btn, linkId) {
    if (!linkId || !btn) {
      return;
    }

    const onPointerDown = (event) => {
      if (!this.arrowEditMode || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const config = this.viewerInstance?.getConfig?.();
      const hotspot = config?.hotSpots?.find((item) => item.id === linkId);
      hotspot?.div?.classList.add("is-arrow-dragging");

      this.arrowDragState = {
        linkId,
        pointerId: event.pointerId,
        moved: false,
        lastYaw: null,
        lastPitch: null
      };
      btn.setAttribute("aria-grabbed", "true");
      document.body.classList.add("nav-arrow-dragging");
      this.viewerInstance?.getContainer()?.classList.add("pnlm-drag-suspended");

      this.arrowDragMoveHandler = (moveEvent) => this.queueArrowDragMove(moveEvent, linkId);
      this.arrowDragUpHandler = (upEvent) => this.finishArrowDrag(upEvent, btn, linkId);

      document.addEventListener("pointermove", this.arrowDragMoveHandler, { passive: false });
      document.addEventListener("pointerup", this.arrowDragUpHandler);
      document.addEventListener("pointercancel", this.arrowDragUpHandler);

      try {
        btn.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    btn.addEventListener("pointerdown", onPointerDown);
  },

  queueArrowDragMove(event, linkId) {
    if (
      !this.arrowDragState ||
      this.arrowDragState.linkId !== linkId ||
      event.pointerId !== this.arrowDragState.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.arrowDragPendingEvent = event;
    if (this.arrowDragRaf) {
      return;
    }
    this.arrowDragRaf = requestAnimationFrame(() => {
      this.arrowDragRaf = null;
      const pending = this.arrowDragPendingEvent;
      this.arrowDragPendingEvent = null;
      if (!pending || !this.arrowDragState || this.arrowDragState.linkId !== linkId) {
        return;
      }
      const coords = this.eventToPanoramaCoords(pending);
      if (!coords) {
        return;
      }
      this.arrowDragState.moved = true;
      this.arrowDragState.lastPitch = coords[0];
      this.arrowDragState.lastYaw = coords[1];
      this.updateNavHotspotPosition(linkId, coords[1], coords[0], true);
    });
  },

  eventToPanoramaCoords(event) {
    try {
      const coords = this.viewerInstance?.mouseEventToCoords(event);
      if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
        return null;
      }
      return coords;
    } catch {
      return null;
    }
  },

  finishArrowDrag(event, btn, linkId) {
    if (
      !this.arrowDragState ||
      this.arrowDragState.linkId !== linkId ||
      event.pointerId !== this.arrowDragState.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (this.arrowDragMoveHandler) {
      document.removeEventListener("pointermove", this.arrowDragMoveHandler);
      this.arrowDragMoveHandler = null;
    }
    if (this.arrowDragUpHandler) {
      document.removeEventListener("pointerup", this.arrowDragUpHandler);
      document.removeEventListener("pointercancel", this.arrowDragUpHandler);
      this.arrowDragUpHandler = null;
    }
    if (this.arrowDragRaf) {
      cancelAnimationFrame(this.arrowDragRaf);
      this.arrowDragRaf = null;
    }
    this.arrowDragPendingEvent = null;

    // 放手位置若換算不到環景座標（滑出畫布、手勢被取消），改用拖曳途中最後一次有效座標，
    // 否則箭頭只有畫面移動、資料沒存，離開編輯模式重畫時就會跳回原位。
    const state = this.arrowDragState;
    const coords =
      this.eventToPanoramaCoords(event) ||
      (state?.moved ? [state.lastPitch, state.lastYaw] : null);
    if (coords) {
      this.updateNavHotspotPosition(linkId, coords[1], coords[0], true);
      if (this.onArrowDragEnd) {
        this.onArrowDragEnd(linkId, coords[1], coords[0]);
      }
    }

    const config = this.viewerInstance?.getConfig?.();
    const hotspot = config?.hotSpots?.find((item) => item.id === linkId);
    hotspot?.div?.classList.remove("is-arrow-dragging");

    this.arrowDragState = null;
    btn.setAttribute("aria-grabbed", "false");
    document.body.classList.remove("nav-arrow-dragging");
    this.viewerInstance?.getContainer()?.classList.remove("pnlm-drag-suspended");

    try {
      btn.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  },

  layoutNavHotspot(hotspot, forceVisible = false) {
    const viewer = this.viewerInstance;
    if (!viewer || !hotspot?.div) {
      return;
    }

    const viewPitch = viewer.getPitch();
    const viewYaw = viewer.getYaw();
    const hfov = viewer.getHfov();
    const roll = viewer.getConfig?.()?.roll || 0;
    const hsPitch = hotspot.pitch;
    const hsYaw = hotspot.yaw;

    const sinPitch = Math.sin((hsPitch * Math.PI) / 180);
    const cosPitch = Math.cos((hsPitch * Math.PI) / 180);
    const sinViewPitch = Math.sin((viewPitch * Math.PI) / 180);
    const cosViewPitch = Math.cos((viewPitch * Math.PI) / 180);
    const cosYawDelta = Math.cos(((-hsYaw + viewYaw) * Math.PI) / 180);
    let depth = sinPitch * sinViewPitch + cosPitch * cosYawDelta * cosViewPitch;

    const behindViewer =
      (hsYaw <= 90 && hsYaw > -90 && depth <= 0) || ((hsYaw > 90 || hsYaw <= -90) && depth <= 0);
    if (behindViewer && !forceVisible) {
      hotspot.div.style.visibility = "hidden";
      return;
    }

    if (forceVisible) {
      depth = Math.max(depth, 0.08);
    }

    const sinYawDelta = Math.sin(((-hsYaw + viewYaw) * Math.PI) / 180);
    const tanHalfHfov = Math.tan((hfov * Math.PI) / 360);
    const canvas = viewer.getContainer()?.querySelector("canvas");
    if (!canvas) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    let x = (-width / tanHalfHfov) * ((sinYawDelta * cosPitch) / depth / 2);
    let y = (-width / tanHalfHfov) * ((sinPitch * cosViewPitch - cosPitch * cosYawDelta * sinViewPitch) / depth / 2);

    const rollSin = Math.sin((roll * Math.PI) / 180);
    const rollCos = Math.cos((roll * Math.PI) / 180);
    const rotatedX = x * rollCos - y * rollSin;
    const rotatedY = x * rollSin + y * rollCos;

    x = rotatedX + (width - hotspot.div.offsetWidth) / 2;
    y = rotatedY + (height - hotspot.div.offsetHeight) / 2;

    const transform = `translate(${x}px, ${y}px) translateZ(9999px) rotate(${roll}deg)`;
    hotspot.div.style.visibility = "visible";
    hotspot.div.style.zIndex = forceVisible ? "99999" : "20";
    hotspot.div.style.transform = transform;
    hotspot.div.style.webkitTransform = transform;
    hotspot.div.style.MozTransform = transform;
  },

  updateNavHotspotPosition(linkId, yaw, pitch, forceVisible = false) {
    const viewer = this.viewerInstance;
    if (!viewer) {
      return;
    }
    const config = viewer.getConfig?.();
    const hotspot = config?.hotSpots?.find((item) => item.id === linkId);
    if (!hotspot) {
      return;
    }
    hotspot.yaw = yaw;
    hotspot.pitch = pitch;

    const meta = this.navHotspotConfigs.get(linkId);
    if (meta) {
      meta.spot.yaw = yaw;
      meta.spot.arrowPitch = pitch;
    }

    this.layoutNavHotspot(hotspot, forceVisible);
  },

  setArrowEditMode(enabled, onArrowDragEnd) {
    this.arrowEditMode = Boolean(enabled);
    this.onArrowDragEnd = typeof onArrowDragEnd === "function" ? onArrowDragEnd : null;
    if (this.options) {
      this.options.arrowEditMode = this.arrowEditMode;
      this.options.onArrowDragEnd = this.onArrowDragEnd;
    }
    if (this.viewerInstance && this.options?.hotspots?.length) {
      this.applyNavHotspots(this.options.hotspots);
    }
  },

  clearNavHotspots() {
    if (!this.viewerInstance) return;
    this.navHotspotIds.forEach((id) => {
      try {
        this.viewerInstance.removeHotSpot(id);
      } catch {
        /* ignore */
      }
    });
    this.navHotspotIds = [];
    this.navHotspotConfigs.clear();
    this.cleanupArrowDrag();
  },

  cleanupArrowDrag() {
    if (this.arrowDragMoveHandler) {
      document.removeEventListener("pointermove", this.arrowDragMoveHandler);
      this.arrowDragMoveHandler = null;
    }
    if (this.arrowDragUpHandler) {
      document.removeEventListener("pointerup", this.arrowDragUpHandler);
      document.removeEventListener("pointercancel", this.arrowDragUpHandler);
      this.arrowDragUpHandler = null;
    }
    if (this.arrowDragRaf) {
      cancelAnimationFrame(this.arrowDragRaf);
      this.arrowDragRaf = null;
    }
    this.arrowDragPendingEvent = null;
    const state = this.arrowDragState;
    this.arrowDragState = null;
    // 拖曳中途被重畫（例如按下「結束編輯」）時，先把已移動的箭頭位置存下來再收工
    if (state?.moved && this.onArrowDragEnd) {
      this.onArrowDragEnd(state.linkId, state.lastYaw, state.lastPitch);
    }
    document.body.classList.remove("nav-arrow-dragging");
    this.viewerInstance?.getContainer()?.classList.remove("pnlm-drag-suspended");
  },

  createDestinationHotspotConfig(spot) {
    const label = spot.text || "目的地";
    const destId = spot.destId;
    const pitch = typeof spot.pitch === "number" ? spot.pitch : this.LEVEL_PITCH;
    const yaw = spot.yaw;
    const isElevator = Boolean(spot.isElevator);

    return {
      pitch,
      yaw,
      type: "custom",
      cssClass: isElevator ? "dest-hotspot-wrap dest-hotspot-elevator" : "dest-hotspot-wrap",
      createTooltipArgs: { label, destId, isElevator },
      createTooltipFunc(hotSpotDiv, args) {
        hotSpotDiv.classList.add("pnlm-pointer");
        hotSpotDiv.setAttribute("role", "button");
        hotSpotDiv.setAttribute("aria-label", args.label);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = args.isElevator
          ? "dest-hotspot-btn dest-hotspot-btn-elevator"
          : "dest-hotspot-btn";

        if (args.isElevator) {
          const badge = document.createElement("span");
          badge.className = "dest-hotspot-elevator-badge";
          badge.textContent = "電梯";
          btn.appendChild(badge);
          const text = document.createElement("span");
          text.className = "dest-hotspot-label";
          text.textContent = args.label.replace(/^電梯\s*[·•]\s*/, "");
          btn.appendChild(text);
        } else {
          btn.textContent = args.label;
        }

        const go = (event) => {
          event.preventDefault();
          event.stopPropagation();
          PanoramaViewer.handleDestinationSelect(args.destId);
        };

        btn.addEventListener("click", go);
        btn.addEventListener("touchend", go);
        hotSpotDiv.addEventListener("click", go);
        hotSpotDiv.appendChild(btn);
      }
    };
  },

  clearDestHotspots() {
    if (!this.viewerInstance) return;
    this.destHotspotIds.forEach((id) => {
      try {
        this.viewerInstance.removeHotSpot(id);
      } catch {
        /* ignore */
      }
    });
    this.destHotspotIds = [];
  },

  applyDestHotspots(destinations) {
    if (!this.viewerInstance || !destinations?.length) {
      return;
    }

    this.clearDestHotspots();

    destinations.forEach((spot, index) => {
      if (typeof spot.yaw !== "number" || !Number.isFinite(spot.yaw)) {
        return;
      }
      const hotSpotId = spot.id || `dest_${index}`;
      const config = this.createDestinationHotspotConfig(spot);
      config.id = hotSpotId;
      try {
        this.viewerInstance.addHotSpot(config);
        this.destHotspotIds.push(hotSpotId);
      } catch (error) {
        console.warn("無法新增目的地熱點:", error);
      }
    });
  },

  setPreviewDestinationHotspot(yaw, label) {
    if (!this.viewerInstance) return;
    const previewId = "preview_dest_hotspot";
    this.clearDestHotspots();
    const config = this.createDestinationHotspotConfig({
      yaw,
      pitch: this.LEVEL_PITCH,
      text: label || "目的地（預覽）",
      destId: "__preview__"
    });
    config.id = previewId;
    try {
      this.viewerInstance.addHotSpot(config);
      this.destHotspotIds.push(previewId);
    } catch {
      /* ignore */
    }
  },

  /** 樓梯樓層變化時抬頭／低頭角度（度） */
  FLOOR_CHANGE_PITCH_DEG: 20,

  normalizeYawDegrees(yaw) {
    if (typeof yaw !== "number" || !Number.isFinite(yaw)) {
      return 0;
    }
    return ((yaw + 180) % 360) - 180;
  },

  /**
   * @param {number} yaw
   * @param {number} pitch
   * @param {number} durationMs
   * @param {() => void} [onDone]
   * @param {{ allowPitch?: boolean }} [options] allowPitch 時保留 pitch（樓梯姿態）；預設仍鎖水平
   */
  lookAt(yaw, pitch, durationMs, onDone, options = {}) {
    if (!this.viewerInstance) {
      if (typeof onDone === "function") {
        onDone();
      }
      return;
    }
    const oriented =
      options.allowPitch === true
        ? {
            yaw: this.normalizeYawDegrees(yaw),
            pitch: typeof pitch === "number" && Number.isFinite(pitch) ? pitch : this.LEVEL_PITCH
          }
        : this.normalizeWalkOrientation(yaw, pitch ?? this.LEVEL_PITCH);
    const duration = Number(durationMs);
    const animateMs = Number.isFinite(duration) && duration > 0 ? duration : null;
    const finishOnce = (() => {
      let done = false;
      return () => {
        if (done) {
          return;
        }
        done = true;
        if (typeof onDone === "function") {
          onDone();
        }
      };
    })();
    try {
      if (animateMs == null) {
        this.viewerInstance.setPitch(oriented.pitch, false);
        this.viewerInstance.setYaw(oriented.yaw, false);
        finishOnce();
        return;
      }
      // yaw／pitch 都要等完；並加 failsafe，避免單一 callback 沒觸發導致導航結束後不轉向
      let pending = 2;
      const failsafe = setTimeout(finishOnce, animateMs + 80);
      const finishOne = () => {
        pending -= 1;
        if (pending <= 0) {
          clearTimeout(failsafe);
          finishOnce();
        }
      };
      this.viewerInstance.setPitch(oriented.pitch, animateMs, finishOne);
      this.viewerInstance.setYaw(oriented.yaw, animateMs, finishOne);
    } catch {
      finishOnce();
    }
  },

  getYaw() {
    if (!this.viewerInstance || typeof this.viewerInstance.getYaw !== "function") {
      return null;
    }
    try {
      return this.viewerInstance.getYaw();
    } catch {
      return null;
    }
  },

  getPitch() {
    if (!this.viewerInstance || typeof this.viewerInstance.getPitch !== "function") {
      return null;
    }
    try {
      return this.viewerInstance.getPitch();
    } catch {
      return null;
    }
  },

  applyNavHotspots(hotspots) {
    if (!this.viewerInstance || !hotspots?.length) {
      return;
    }

    this.clearNavHotspots();

    hotspots.forEach((spot, index) => {
      const hotSpotId = spot.id || `nav_${index}_${spot.targetId}`;
      const config = this.createHotspotConfig({
        ...spot,
        editable: this.arrowEditMode,
        id: hotSpotId
      });
      config.id = hotSpotId;
      try {
        this.viewerInstance.addHotSpot(config);
        this.navHotspotIds.push(hotSpotId);
        this.navHotspotConfigs.set(hotSpotId, { spot: { ...spot, id: hotSpotId }, config });
      } catch (error) {
        console.warn("無法新增環景熱點:", error);
      }
    });
  },

  refreshNavHotspots() {
    if (!this.viewerInstance || !this.options?.hotspots?.length) {
      return;
    }
    this.applyNavHotspots(this.options.hotspots);
  },

  setPreviewHotspot(yaw, label, options = {}) {
    if (!this.viewerInstance) return;
    this.clearNavHotspots();
    const previewId = "preview_hotspot";
    const config = this.createHotspotConfig({
      yaw,
      arrowPitch: options.arrowPitch,
      arrowOpacity: options.arrowOpacity,
      text: label || "出口方向（預覽）",
      shortLabel: options.shortLabel || label || "預覽",
      targetId: "__preview__"
    });
    config.id = previewId;
    try {
      this.viewerInstance.addHotSpot(config);
      this.navHotspotIds.push(previewId);
    } catch {
      /* ignore */
    }
  },

  bindEditMode(viewer, onPlace) {
    this.unbindEditMode();
    const container = viewer.getContainer();

    this.editPointerDownHandler = (event) => {
      if (event.button !== 0) return;
      this.editPointerDown = { x: event.clientX, y: event.clientY };
    };

    this.editPointerUpHandler = (event) => {
      if (!this.options?.editMode || !onPlace || !this.editPointerDown) return;
      const dx = event.clientX - this.editPointerDown.x;
      const dy = event.clientY - this.editPointerDown.y;
      this.editPointerDown = null;
      if (dx * dx + dy * dy > 64) return;

      let yaw;
      const coords = viewer.mouseEventToCoords(event);
      yaw = coords ? coords[1] : viewer.getYaw();

      this.unbindEditMode();
      const oriented = this.normalizeWalkOrientation(yaw, this.LEVEL_PITCH);
      onPlace(oriented.yaw, oriented.pitch);
    };

    container.addEventListener("mousedown", this.editPointerDownHandler);
    container.addEventListener("mouseup", this.editPointerUpHandler);
  },

  unbindEditMode() {
    if (this.viewerInstance) {
      const container = this.viewerInstance.getContainer();
      if (this.editPointerDownHandler) {
        container.removeEventListener("mousedown", this.editPointerDownHandler);
      }
      if (this.editPointerUpHandler) {
        container.removeEventListener("mouseup", this.editPointerUpHandler);
      }
    }
    this.editPointerDownHandler = null;
    this.editPointerUpHandler = null;
    this.editPointerDown = null;
  },

  captureCurrentView() {
    if (!this.viewerInstance) return null;
    const yaw = this.viewerInstance.getYaw();
    this.applyWalkEditConstraints(this.viewerInstance);
    return this.normalizeWalkOrientation(yaw, this.LEVEL_PITCH);
  },

  destroy() {
    this.mountToken += 1;
    this.orientationLock = false;
    this.viewChangeBound = false;
    this.unbindEditMode();
    this.clearNavHotspots();
    this.clearDestHotspots();
    this.cleanupArrowDrag();
    if (this.viewerInstance) {
      try {
        this.viewerInstance.destroy();
      } catch {
        /* ignore */
      }
      this.viewerInstance = null;
    }
    this.currentSceneId = null;
    this.options = null;
    this.hostElement = null;
    this.onNavigateHandler = null;
    this.onDestinationHandler = null;
    this.onArrowDragEnd = null;
    this.arrowEditMode = false;
    this.navHotspotConfigs.clear();
    this.cleanupArrowDrag();
  },

  setPanoramaError(host, message) {
    if (!host) {
      return;
    }
    this.setPanoramaLoading(host, false);
    host.replaceChildren();
    const paragraph = document.createElement("p");
    paragraph.className = "panorama-status panorama-error";
    paragraph.textContent = String(message || "環景載入失敗");
    host.appendChild(paragraph);
  },

  createMountElement(host, viewerId) {
    // 保留載入狀態文字，避免 rebuild viewer 時進度／速度消失
    const status = host.querySelector(".panorama-loading-status");
    host.replaceChildren();
    const mountEl = document.createElement("div");
    mountEl.id = viewerId;
    mountEl.className = "pnlm-mount";
    host.appendChild(mountEl);
    if (status) {
      host.appendChild(status);
    }
    return mountEl;
  },

  getNextSceneId() {
    this.sceneSlotIndex = 1 - this.sceneSlotIndex;
    return this.SCENE_IDS[this.sceneSlotIndex];
  },

  getViewerConfig(panoramaUrl, sceneId) {
    return {
      sceneFadeDuration: this.SCENE_FADE_MS,
      autoLoad: true,
      showFullscreenCtrl: true,
      showZoomCtrl: true,
      compass: false,
      hfov: 100,
      firstScene: sceneId,
      scenes: {
        [sceneId]: {
          type: "equirectangular",
          panorama: panoramaUrl
        }
      }
    };
  },

  lockOrientation() {
    this.orientationLock = true;
  },

  unlockOrientation() {
    this.orientationLock = false;
  },

  applyMountedOptions(host, options) {
    if (!this.viewerInstance) {
      return;
    }
    if (!this.orientationLock) {
      if (typeof options.initialYaw === "number") {
        this.viewerInstance.setYaw(options.initialYaw, false);
      }
      if (options.editMode) {
        this.applyWalkEditConstraints(this.viewerInstance);
        if (options.onPlaceHotspot) {
          this.bindEditMode(this.viewerInstance, options.onPlaceHotspot);
        }
      } else if (typeof options.initialPitch === "number") {
        this.viewerInstance.setPitch(options.initialPitch, false);
      } else if (options.levelView !== false) {
        this.viewerInstance.setPitch(this.LEVEL_PITCH, false);
      }
    } else if (options.editMode) {
      this.applyWalkEditConstraints(this.viewerInstance);
      if (options.onPlaceHotspot) {
        this.bindEditMode(this.viewerInstance, options.onPlaceHotspot);
      }
    }
    if (!options.editMode) {
      if (options.hotspots?.length) {
        this.arrowEditMode = Boolean(options.arrowEditMode);
        this.onArrowDragEnd = options.onArrowDragEnd || null;
        this.applyNavHotspots(options.hotspots);
      }
      if (options.destinations?.length) {
        this.applyDestHotspots(options.destinations);
      }
    }
    requestAnimationFrame(() => {
      host.classList.remove(this.transitionClassName);
    });
  },

  bindViewerEvents(host, options, token) {
    const onReady = () => {
      if (token !== this.mountToken) {
        return;
      }
      this.applyMountedOptions(host, options);
    };

    this.viewerInstance.on("load", onReady);
    this.viewerInstance.on("animatefinished", () => {
      if (token !== this.mountToken || options.editMode) {
        return;
      }
      if (options.hotspots?.length && this.navHotspotIds.length === 0) {
        this.applyNavHotspots(options.hotspots);
      }
      if (options.destinations?.length && this.destHotspotIds.length === 0) {
        this.applyDestHotspots(options.destinations);
      }
    });

    this.viewerInstance.on("error", (message) => {
      if (token !== this.mountToken) {
        return;
      }
      const fileHint = this.formatPanoramaPath(this.options?.sourceSrc);
      this.setPanoramaError(
        host,
        fileHint ? `環景載入失敗（${fileHint}）：${message}` : `環景載入失敗：${message}`
      );
      host.classList.remove(this.transitionClassName);
    });
  },

  createViewer(host, panoramaUrl, options) {
    this.destroy();
    this.mountToken += 1;
    const token = this.mountToken;

    this.hostElement = host;
    this.options = options;
    this.onNavigateHandler = options.onNavigate || null;
    this.onDestinationHandler = options.onDestination || null;
    this.onArrowDragEnd = options.onArrowDragEnd || null;
    this.arrowEditMode = Boolean(options.arrowEditMode);

    const viewerId = `pnlm_${Date.now()}`;
    const mountEl = this.createMountElement(host, viewerId);
    const sceneId = this.getNextSceneId();
    this.currentSceneId = sceneId;

    this.viewerInstance = pannellum.viewer(viewerId, this.getViewerConfig(panoramaUrl, sceneId));

    return new Promise((resolve, reject) => {
      let settled = false;
      const settleOk = () => {
        if (settled || token !== this.mountToken) {
          return;
        }
        settled = true;
        this.viewerInstance.off("load", onReady);
        this.viewerInstance.off("error", onError);
        this.applyMountedOptions(host, options);
        this.bindViewChangeEvents();
        resolve(mountEl);
      };
      const onReady = () => settleOk();
      const onError = (message) => {
        if (settled || token !== this.mountToken) {
          return;
        }
        settled = true;
        this.viewerInstance.off("load", onReady);
        this.viewerInstance.off("error", onError);
        this.setPanoramaError(host, `環景載入失敗：${message}`);
        host.classList.remove(this.transitionClassName);
        reject(new Error(String(message || "環景載入失敗")));
      };

      this.viewerInstance.on("load", onReady);
      this.viewerInstance.on("error", onError);
      this.bindViewerEvents(host, options, token);
      if (typeof this.viewerInstance.isLoaded === "function" && this.viewerInstance.isLoaded()) {
        settleOk();
      }
    });
  },

  switchPanorama(host, panoramaUrl, options) {
    this.mountToken += 1;
    const token = this.mountToken;
    const prevSceneId = this.currentSceneId;
    const nextSceneId = this.getNextSceneId();

    this.clearNavHotspots();
    this.clearDestHotspots();
    this.unbindEditMode();

    this.options = options;
    this.onNavigateHandler = options.onNavigate || null;
    this.onDestinationHandler = options.onDestination || null;
    this.onArrowDragEnd = options.onArrowDragEnd || null;
    this.arrowEditMode = Boolean(options.arrowEditMode);

    try {
      this.viewerInstance.addScene(nextSceneId, {
        type: "equirectangular",
        panorama: panoramaUrl
      });
    } catch (error) {
      console.warn("環景無法原地切換，改為重建 viewer。", error);
      host.classList.remove(this.transitionClassName);
      return this.createViewer(host, panoramaUrl, options);
    }

    const pitch =
      typeof options.initialPitch === "number" ? options.initialPitch : this.LEVEL_PITCH;
    const yaw =
      typeof options.initialYaw === "number" ? options.initialYaw : this.viewerInstance.getYaw();

    return new Promise((resolve, reject) => {
      const onLoad = () => {
        if (token !== this.mountToken) {
          return;
        }
        this.viewerInstance.off("load", onLoad);
        this.viewerInstance.off("error", onError);
        if (prevSceneId && prevSceneId !== nextSceneId) {
          try {
            this.viewerInstance.removeScene(prevSceneId);
          } catch {
            /* ignore */
          }
        }
        this.currentSceneId = nextSceneId;
        this.applyMountedOptions(host, options);
        resolve(this.viewerInstance.getContainer()?.parentElement || host);
      };

      const onError = (message) => {
        if (token !== this.mountToken) {
          return;
        }
        this.viewerInstance.off("load", onLoad);
        this.viewerInstance.off("error", onError);
        console.warn("環景切換失敗：", message);
        host.classList.remove(this.transitionClassName);
        try {
          this.viewerInstance.removeScene(nextSceneId);
        } catch {
          /* ignore */
        }
        reject(new Error(String(message || "環景切換失敗")));
      };

      this.viewerInstance.on("load", onLoad);
      this.viewerInstance.on("error", onError);
      this.viewerInstance.loadScene(nextSceneId, pitch, yaw, "same");
    });
  },

  canSwitchInPlace(host) {
    return (
      this.viewerInstance &&
      this.hostElement === host &&
      typeof this.viewerInstance.isLoaded === "function" &&
      this.viewerInstance.isLoaded()
    );
  },

  async mount(container, src, options = {}) {
    const host = typeof container === "string" ? document.getElementById(container) : container;
    if (!host) throw new Error("找不到環景容器");
    host.classList.add(this.transitionClassName);

    if (typeof pannellum === "undefined") {
      this.setPanoramaError(host, "無法載入 Pannellum。請確認 vendor/pannellum 存在。");
      host.classList.remove(this.transitionClassName);
      return null;
    }

    const loadingGen = ++this.loadingGeneration;
    // 未快取要下載；重建 viewer 時也會先露出 Pannellum 白菱格 → 都蓋遮罩
    const showLoading = !this.isPanoramaSrcCached(src) || !this.canSwitchInPlace(host);
    this.setPanoramaLoading(host, showLoading);

    try {
      const panoramaUrl = await this.preparePanoramaSrc(src, (info) => {
        if (loadingGen !== this.loadingGeneration) {
          return;
        }
        this.updatePanoramaLoadingProgress(info);
      });
      // 自動播放快速切點時，舊的 mount 可能還在等圖：直接放棄，避免蓋掉新畫面或卡住遮罩
      if (loadingGen !== this.loadingGeneration) {
        return null;
      }
      const nextOptions = { ...options, sourceSrc: src };

      if (this.canSwitchInPlace(host)) {
        return await this.switchPanorama(host, panoramaUrl, nextOptions);
      }

      return await this.createViewer(host, panoramaUrl, nextOptions);
    } catch (error) {
      if (loadingGen !== this.loadingGeneration) {
        return null;
      }
      if (this.canSwitchInPlace(host)) {
        host.classList.remove(this.transitionClassName);
        return null;
      }
      this.setPanoramaError(host, error.message);
      host.classList.remove(this.transitionClassName);
      return null;
    } finally {
      // 等兩幀再關，避免 load 事件後 WebGL 尚未畫出仍閃白菱格
      if (loadingGen === this.loadingGeneration) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (loadingGen === this.loadingGeneration) {
              this.setPanoramaLoading(host, false);
            }
          });
        });
      }
    }
  }
};

window.PanoramaViewer = PanoramaViewer;
export default PanoramaViewer;
