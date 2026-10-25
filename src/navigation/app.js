import { NavArrowSettings } from "../lib/nav-arrow-settings.js";
import {
  BuildingsStore,
  createCampusBuildingId,
  defaultFloorImageForBuilding,
  normalizeBuildingDef
} from "../lib/buildings-store.js";
import {
  buildCampusBuildingsRegistry,
  getExistingCampusBuildingIds,
  isValidCampusBuildingId,
  resolveCampusBuildingHotspotFromStore
} from "../lib/campus-buildings.js";
import { GoogleMapsNav } from "../lib/google-maps-nav.js";
import { latLngToCampusMapPercent, resolveSatelliteImageConfig } from "../lib/campus-gps.js";
import { CampusSatelliteMap } from "../lib/campus-satellite-map.js";
import { PanoramaViewer } from "../lib/panorama.js";
import { consumeVisitorPrefetchUrls } from "../lib/visitor-prefetch-session.js";
import {
  clampWaypointStaySeconds,
  decodeWaypointStayList,
  encodeWaypointStayList,
  DEFAULT_WAYPOINT_STAY_SECONDS
} from "../lib/navigation-graph.js";
import {
  encodeNavQueryForUrl,
  encodeNavQueryListForUrl,
  encodeVisitorStartForUrl,
  decodeNavQueryFromUrl,
  decodeNavQueryListFromUrl,
  getDefaultCampusBuildingHotspot,
  normalizeVisitorStarts,
  stripCampusBuildingHotspots
} from "../lib/visitor-starts.js";
import {
  confirmAlsoDeleteNodeFiles,
  deleteNodeScopeFiles,
  listBuildingFloorScopes
} from "../lib/node-scope-api.js";
import { adminFetch } from "../lib/admin-fetch.js";
import { createMapPinchZoom } from "../lib/map-pinch-zoom.js";
import {
  injectElevatorDestinationEdges,
  linkEdgeKind,
  normalizeElevatorDestName,
  normalizeFloorTravelMode,
  weightedEdgeDistance
} from "../lib/elevator-routes.js";
import {
  buildPathShareUrl,
  buildPanoSpotUrl,
  copyTextToClipboard as copyShareText
} from "../lib/share-links.js";
import { renderQrToCanvas } from "../lib/qr-code.js";
import {
  CAMPUS_MAP,
  STORAGE_PREFIX,
  NODES_DATA_BASE,
  nodeScopeCache,
  pendingFileSaves,
  mapContainer,
  mapStage,
  mapImage,
  buildingHotspots,
  mapPortals,
  mapDistanceScaleBar,
  mapDistanceScaleInput,
  mapDistanceScaleStatus,
  backBtn,
  viewTitle,
  floorSwitcher,
  nodeList,
  nodeListSection,
  sidePanel,
  panelToggle,
  panelHint,
  buildingModal,
  buildingNameInput,
  buildingCodeInput,
  buildingLabelInput,
  buildingFloorLabelInput,
  buildingFloorImageInput,
  buildingModalError,
  buildingModalConfirm,
  buildingModalCancel,
  linkModal,
  linkModalTitle,
  linkTargetSearch,
  linkTargetResults,
  linkModalError,
  linkModalConfirm,
  linkModalCancel,
  panoramaHint,
  panoramaAddLink,
  panoramaAddDestination,
  panoramaSetStartBtn,
  panoramaSaveSpotBtn,
  panoramaCaptureView,
  nodeModal,
  nodeNameInput,
  nodeUrlInput,
  nodeUrlHint,
  nodeImagePicker,
  nodePreview,
  nodePreviewImage,
  nodePreviewStatus,
  nodeModalError,
  nodeModalConfirm,
  nodeModalCancel,
  destinationModal,
  destinationModalTitle,
  destinationModalDesc,
  destinationNameInput,
  destinationBindField,
  destinationBindSelect,
  destinationModalConfirm,
  destinationModalCancel,
  addDestinationMapBtn,
  toggleMapDestinationsBtn,
  destinationWizardBar,
  destinationWizardStepText,
  destWizardCaptureBtn,
  destWizardConfirmBtn,
  destWizardCancelBtn,
  destSearchInput,
  destSearchResults,
  panoramaNavButtons,
  linkWizardBar,
  linkWizardStepText,
  linkWizardDistanceRow,
  linkDistanceInput,
  wizardCaptureBtn,
  wizardConfirmBtn,
  wizardCancelBtn,
  editModeBtn,
  panoramaEditModeBtn,
  pathFrom,
  pathTo,
  pathSuggestions,
  pathCalcBtn,
  pathGoBtn,
  pathCancelBtn,
  pathStopBtn,
  pathAutoControls,
  pathAutoDelay,
  pathAutoDelayValue,
  pathResult,
  outdoorPathResult,
  pathUseLocationBtn,
  outdoorNavPanel,
  outdoorNavStatus,
  outdoorTravelMode,
  outdoorRefreshBtn,
  outdoorOpenMapsBtn,
  outdoorArrivedBtn,
  googleMap,
  nodeSaveStatus,
  CURRENT_LOCATION_LABEL,
  CAMPUS_ARRIVED_KEY
} from "./state.js";

let nodesFileWriteEnabled = false;

let viewState = { mode: "campus", buildingId: null, floorId: null };
let panoramaPoints = [];
let loadedScopeKey = null;
let currentPanoramaPointId = null;
let linkEditFromId = null;
let linkEditFromScopeKey = null;
let linkEditTargetRef = null;
let linkWizard = null;
let destinationWizard = null;
let destinationEditPointId = null;
let destinationModalMode = "pano";
let pendingDestMapPlacement = null;
let pendingDestPlaceMode = false;
let pendingNodePlacement = null;
let nodeNameAutoFilled = false;
let nodePreviewToken = 0;
let nodePreviewReadyUrl = null;
let nodeImagePickerToken = 0;
let computedPath = null;
let mapPinchZoom = null;
let pathAutoPlayTimer = null;
let pathAutoPlayTurnTimer = null;
/** 終點面向專用，避免 stopAutoPathPlayback 清掉轉彎 timer 導致不轉向 */
let pathDestinationFaceTimer = null;
/** 進電梯 overlay 顯示後再切景 */
let elevatorRideTimer = null;
let pathAutoPlayActive = false;
let pathAutoPlayPaused = false;
let pathAutoPlayStep = 0;
let pathAutoPlayDueAt = 0;
let pathAutoPlayScheduledDelayMs = 0;
let pathWaypointHoldActive = false;
let pathWaypointCountdownTimer = null;
let stopAutoPathPlaybackHandler = null;
let startAutoPathPlaybackHandler = null;
/** 首次公告關閉（或未顯示）後 resolve；自動播放需等此 Promise */
let welcomeNoticeClosedPromise = Promise.resolve();
let calculatePathHandler = null;
let pathGuidanceActive = false;
let mapLayoutRaf = null;
let minimapLayoutRaf = null;
let editMode = false;
/** 平面圖標記顯示：all | no-dest | none（預設都顯示，不持久化） */
let mapMarkersDisplayMode = "all";
const MAP_MARKERS_DISPLAY_MODES = ["all", "no-dest", "none"];
const MAP_MARKERS_DISPLAY_LABELS = {
  all: "標記：都顯示",
  "no-dest": "標記：不顯示目的地",
  none: "標記：都不顯示"
};
let pendingBuildingDraft = null;
let buildingHotspotDidDrag = false;
let mapPortalDidDrag = false;
let adminSessionOk = false;
/** @type {"admin"|"qr"|"qr_notice"|null} */
let adminRole = null;

function isFullAdminSession() {
  return adminRole === "admin";
}

function canSavePanoSpots() {
  return adminRole === "admin" || adminRole === "qr";
}

function canEditUrlNoticesSession() {
  return adminRole === "admin" || adminRole === "qr_notice";
}

function isSecondaryStaffSession() {
  return adminRole === "qr" || adminRole === "qr_notice";
}
let markerDragState = null;
let markerDidDrag = false;
let outdoorNavigationActive = false;
let mapsApiReady = false;
let locateStartMode = false;
let pendingLocatePoint = null;
let locateStartOptions = { to: "", autoStart: false };
/** @type {'custom'|'satellite'} */
let campusMapStyle = "custom";
const CAMPUS_MAP_STYLE_KEY = "mcu_campus_map_style";

export function bootstrapApp() {
  // 等節點資料前先鎖住平面圖尺寸，避免訪客進入時先閃縮放
  setupMapLayoutSync();
  setupMapPinchZoom();

  const mapsInit =
    typeof GoogleMapsNav !== "undefined"
      ? GoogleMapsNav.init().then((ready) => {
          mapsApiReady = ready;
          return ready;
        })
      : Promise.resolve(false);

  return bootstrapNodeData()
    .then(() => mapsInit)
    .then(() => init())
    .catch((error) => {
      console.error("節點資料載入失敗，改用瀏覽器快取:", error);
      if (typeof GoogleMapsNav !== "undefined") {
        return GoogleMapsNav.init()
          .then((ready) => {
            mapsApiReady = ready;
          })
          .catch(() => {})
          .then(() => init());
      }
      init();
    });
}

function init() {
  const visitorPrefetchUrls = consumeVisitorPrefetchUrls();
  if (visitorPrefetchUrls.length) {
    PanoramaViewer.preloadPanoramaSrcs(visitorPrefetchUrls);
  }

  if (typeof NavArrowSettings !== "undefined") {
    NavArrowSettings.applyToViewer();
    if (typeof NavArrowSettings.applyOverlayStyle === "function") {
      NavArrowSettings.applyOverlayStyle();
    }
    const playSpeedHud = document.getElementById("playSpeedHud");
    const panoramaViewerWrap = document.querySelector(".panorama-viewer-wrap");
    if (
      playSpeedHud &&
      panoramaViewerWrap &&
      typeof NavArrowSettings.enableVisitorHudLayout === "function"
    ) {
      NavArrowSettings.enableVisitorHudLayout(playSpeedHud, panoramaViewerWrap);
    }
    window.addEventListener("storage", (event) => {
      if (event.key === NavArrowSettings.STORAGE_KEY) {
        NavArrowSettings.applyToViewer();
        if (typeof NavArrowSettings.applyOverlayStyle === "function") {
          NavArrowSettings.applyOverlayStyle();
        }
        applyPlayDelaySliderBounds();
        syncMapDistanceScaleBar();
        renderBuildingHotspots();
      }
      if (event.key === NavArrowSettings.HUD_LAYOUT_LOCAL_KEY) {
        if (typeof NavArrowSettings.applyOverlayStyle === "function") {
          NavArrowSettings.applyOverlayStyle();
        }
      }
      if (event.key === BuildingsStore?.STORAGE_KEY) {
        renderBuildingHotspots();
      }
    });
  }
  if (typeof PanoramaViewer !== "undefined" && typeof PanoramaViewer.setOnViewChange === "function") {
    let lastPreloadYaw = null;
    PanoramaViewer.setOnViewChange(({ yaw }) => {
      if (typeof yaw !== "number" || !Number.isFinite(yaw)) {
        return;
      }
      if (lastPreloadYaw !== null && yawDeltaAbs(yaw, lastPreloadYaw) < 12) {
        return;
      }
      lastPreloadYaw = yaw;
      const point = getPointById(currentPanoramaPointId);
      if (point) {
        preloadRelatedPanoramas(point, yaw);
      }
    });
  }
  sidePanel.classList.add("hidden");
  mapImage.addEventListener("error", onMapImageError);
  // map layout 已在 bootstrapApp 開頭安裝
  setupPanelToggle();
  setupBackButton();
  setupPanoramaOverlay();
  setupMinimapLayoutSync();
  setupLinkModal();
  setupDestinationModal();
  setupNodeModal();
  setupBuildingModal();
  setupMapDistanceScaleBar();
  setupLinkWizardBar();
  setupDestinationWizardBar();
  setupDestinationSearch();
  setupPathfinding();
  setupOutdoorNavigation();
  setupLocateStartUi();
  setupCampusMapStyleUi();
  setupCampusBuildingEditUi();
  setupAddDestinationMapBtn();
  setupMapDestinationsToggle();
  setupWelcomeNotice();
  setupSavePanoSpotUi();
  setupPendingSaveFlush();
  setupEditMode();
  setupAdminUi();
  applyVisitorModeUi();
  applyAdminUi();
  showCampusMap();
  maybeAutoStartOutdoorNavigation();
  applyIncomingNavQuery();
}

function setupMapPinchZoom() {
  if (mapPinchZoom || !mapContainer || !mapStage) {
    return;
  }
  mapPinchZoom = createMapPinchZoom({
    container: mapContainer,
    stage: mapStage
  });
}

function resetMapPinchZoom() {
  mapPinchZoom?.reset();
}

function scheduleMapLayoutSync() {
  if (mapLayoutRaf) {
    cancelAnimationFrame(mapLayoutRaf);
  }
  mapLayoutRaf = requestAnimationFrame(() => {
    mapLayoutRaf = null;
    syncMapLayout();
  });
}

function syncMapLayout() {
  if (!mapContainer || !mapStage || !mapImage) {
    return;
  }

  const { width: cw, height: ch } = mapContainer.getBoundingClientRect();
  const nw = mapImage.naturalWidth;
  const nh = mapImage.naturalHeight;

  if (!cw || !ch) {
    return;
  }

  if (!nw || !nh) {
    // 換樓圖載入中先保留上一張的 stage 尺寸，避免清空後整圖突然放大再縮小
    return;
  }

  const scale = Math.min(cw / nw, ch / nh);
  const displayW = Math.max(1, Math.round(nw * scale));
  const displayH = Math.max(1, Math.round(nh * scale));

  mapStage.style.width = `${displayW}px`;
  mapStage.style.height = `${displayH}px`;
  mapStage.classList.add("is-sized");
}

let mapLayoutSyncInstalled = false;

function setupMapLayoutSync() {
  if (mapLayoutSyncInstalled) {
    scheduleMapLayoutSync();
    return;
  }
  mapLayoutSyncInstalled = true;

  mapImage?.addEventListener("load", scheduleMapLayoutSync);
  window.addEventListener("resize", scheduleMapLayoutSync);

  if (typeof ResizeObserver !== "undefined" && mapContainer) {
    const observer = new ResizeObserver(scheduleMapLayoutSync);
    observer.observe(mapContainer);
  }

  syncMapLayout();
  scheduleMapLayoutSync();
}

function afterMapImageChange() {
  // 僅在圖已有 natural 尺寸時同步；否則等 load 事件，避免用舊圖／空尺寸重算造成縮放閃爍
  if (mapImage.complete && mapImage.naturalWidth > 0) {
    scheduleMapLayoutSync();
  }
}

function syncSidePanelOpenClass() {
  document.body.classList.toggle(
    "is-side-panel-open",
    Boolean(sidePanel && !sidePanel.classList.contains("hidden"))
  );
}

function setSidePanelOpen(open) {
  if (!sidePanel) {
    return;
  }
  sidePanel.classList.toggle("hidden", !open);
  panelToggle?.classList.toggle("panel-open", open);
  document.body.classList.toggle("is-side-panel-open", open);
  document
    .getElementById("panoramaPanelToggle")
    ?.setAttribute("aria-pressed", open ? "true" : "false");
}

function toggleSidePanel() {
  setSidePanelOpen(sidePanel?.classList.contains("hidden"));
}

function setupPanelToggle() {
  panelToggle?.addEventListener("click", toggleSidePanel);
  document.getElementById("panoramaPanelToggle")?.addEventListener("click", toggleSidePanel);
  syncSidePanelOpenClass();
}

function isVisitorMode() {
  return new URLSearchParams(location.search).get("mode") === "visitor";
}

/** 訪客結束自動導覽後，側欄恢復自由瀏覽（搜尋／設起點等） */
function setVisitorFreeBrowse(enabled) {
  if (!isVisitorMode()) {
    document.body.classList.remove("is-visitor-free");
    return;
  }
  document.body.classList.toggle("is-visitor-free", Boolean(enabled));
}

function enterVisitorFreeBrowse(message) {
  if (!isVisitorMode()) {
    return;
  }
  setVisitorFreeBrowse(true);
  setVisitorPathGuide(
    message ||
      "已結束自動導覽，可自由瀏覽。右側選單可搜尋目的地、計算路徑，或「設目前環景為起點」。"
  );
  setSidePanelOpen(true);
  pathAutoControls?.classList.remove("hidden");
  updatePanoramaEditUI();
  preloadNeighborsForCurrentPoint();
}

function visitorNextStepHint() {
  return isVisitorMode() ? " 可按上方「返回訪客頁」重選起點或目的地。" : "";
}

function formatAssetPath(src) {
  const cleaned = String(src || "")
    .trim()
    .replace(/^\.\//, "");
  return cleaned || "(未指定路徑)";
}

function showMapAssetBanner(message) {
  const banner = document.getElementById("mapAssetBanner");
  if (!banner) {
    return;
  }
  banner.textContent = message || "";
  banner.classList.toggle("hidden", !message);
}

function hideMapAssetBanner() {
  showMapAssetBanner("");
}

function setVisitorPathGuide(message) {
  const guide = document.getElementById("visitorPathGuide");
  if (!guide) {
    return;
  }
  guide.textContent = message || "";
  guide.classList.toggle("hidden", !message);
  guide.classList.toggle("is-ready", Boolean(message) && message.includes("自動播放"));
  guide.classList.toggle("is-error", Boolean(message) && (message.includes("找不到") || message.includes("無法")));
}

function setPathErrorMessage(message) {
  if (!pathResult) {
    return;
  }
  pathResult.replaceChildren();
  pathResult.textContent = `${message}${visitorNextStepHint()}`;
  pathResult.classList.add("is-error");
  pathGoBtn?.classList.add("hidden");
  pathGoBtn?.classList.remove("path-go-ready");
  pathCancelBtn?.classList.add("hidden");
  pathAutoControls?.classList.add("hidden");
  document.getElementById("pathShareBtn")?.classList.add("hidden");
  if (isVisitorMode()) {
    setVisitorPathGuide(message);
  }
}

function clearPathErrorState() {
  pathResult?.classList.remove("is-error");
}

function markPathReadyForPlayback() {
  clearPathErrorState();
  pathGuidanceActive = true;
  const keepVisitorFree =
    isVisitorMode() && document.body.classList.contains("is-visitor-free");
  if (!keepVisitorFree) {
    setVisitorFreeBrowse(false);
  }
  pathGoBtn?.classList.remove("hidden");
  pathGoBtn?.classList.add("path-go-ready");
  pathCancelBtn?.classList.remove("hidden");
  document.getElementById("pathShareBtn")?.classList.remove("hidden");
  if (isVisitorMode()) {
    if (keepVisitorFree) {
      pathAutoControls?.classList.remove("hidden");
      setVisitorPathGuide("路徑已更新 → 可按「自動播放路徑」，或「取消播放」結束就緒狀態。");
    } else {
      pathAutoControls?.classList.add("hidden");
      setVisitorPathGuide("路徑已就緒 → 請按下方「自動播放路徑」開始，或「取消播放」。");
    }
    setSidePanelOpen(true);
  } else {
    pathAutoControls?.classList.remove("hidden");
    setVisitorPathGuide("");
  }
}

function applyVisitorModeUi() {
  const visitor = isVisitorMode();
  document.body.classList.toggle("is-visitor", visitor);
  document.querySelector(".visitor-help-section")?.classList.toggle("hidden", !visitor);
  document.querySelector(".visitor-full-help")?.classList.toggle("hidden", visitor);
  // 導航介面一律可回訪客頁（含自由瀏覽、樓層平面圖、環景）
  document.getElementById("visitorBackLink")?.classList.remove("hidden");
  document.getElementById("visitorBackPanelLink")?.classList.remove("hidden");
  document.getElementById("panoramaVisitorBackLink")?.classList.remove("hidden");
  document.querySelector(".visitor-return-section")?.classList.remove("hidden");
  if (visitor) {
    document.getElementById("nodeListSection")?.classList.add("hidden");
  }
}

function applyAdminUi() {
  const visitor = isVisitorMode();
  const staff = canSavePanoSpots() || canEditUrlNoticesSession();
  const fullAdmin = isFullAdminSession();
  document.body.classList.toggle("is-admin", fullAdmin && !visitor);
  document.body.classList.toggle("is-qr-admin", isSecondaryStaffSession() && !visitor);
  editModeBtn?.classList.toggle("hidden", !fullAdmin || visitor);
  document.getElementById("adminPanelSection")?.classList.toggle("hidden", visitor || !staff);
  document.getElementById("adminLoginSection")?.classList.toggle("hidden", visitor || staff);
  document.querySelectorAll(".admin-help").forEach((el) => {
    el.classList.toggle("hidden", !fullAdmin || visitor);
  });
  const panelDesc = document.getElementById("adminPanelDesc");
  const homeLink = document.getElementById("adminHomeLink");
  const settingsLink = document.getElementById("adminSettingsLink");
  const linksLink = document.getElementById("adminLinksLink");
  if (panelDesc) {
    panelDesc.textContent = fullAdmin
      ? "已登入完整管理員。可編輯地圖，或開啟設定頁調整箭頭與播放外觀。"
      : adminRole === "qr_notice"
        ? "已登入二級管理員（連結／公告）。可開啟連結／QR 與公告頁。"
        : "已登入二級管理員。可開啟連結／QR 管理頁，並在環景儲存據點面向。";
  }
  homeLink?.classList.toggle("hidden", !fullAdmin);
  settingsLink?.classList.toggle("hidden", !fullAdmin);
  linksLink?.classList.toggle("hidden", !staff);
  if (linksLink) {
    linksLink.textContent = isSecondaryStaffSession() ? "管理頁面（連結／QR）" : "連結／QR";
    if (adminRole === "qr_notice") {
      linksLink.href = "/admin/notices.html";
      linksLink.textContent = "管理頁面（公告）";
    } else if (adminRole === "qr") {
      linksLink.href = "/admin/links.html";
    }
  }
  if (panelHint) {
    if (visitor) {
      panelHint.textContent =
        "路徑就緒後請按「自動播放路徑」。若找不到路、定位失敗或圖檔缺失，請返回訪客頁重選，或確認已放置 images／maps 設定。";
    } else if (fullAdmin) {
      panelHint.textContent =
        "開啟「編輯模式」可新增／移動節點、修改名稱與距離；一般模式點擊節點開啟環景導航。";
    } else if (adminRole === "qr") {
      panelHint.textContent = "點擊節點開啟環景；可在環景按「儲存據點面向」產生 QR。";
    } else if (adminRole === "qr_notice") {
      panelHint.textContent = "可至「公告」設定依連結顯示的首次／結束訊息。";
    } else {
      panelHint.textContent = "點擊節點開啟環景導航。編輯地圖請由選單「管理人員登入」。";
    }
  }
  if ((!fullAdmin || visitor) && editMode) {
    setEditMode(false);
  }
  syncMapDistanceScaleBar();
  syncAddDestinationMapBtn();
}

function setupAdminUi() {
  document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
    try {
      await adminFetch("/api/admin/logout", { method: "POST" });
    } catch {
      /* 仍重新整理以清掉本機狀態 */
    }
    window.location.reload();
  });
}

function setupEditMode() {
  editModeBtn?.addEventListener("click", () => setEditMode(!editMode));
  panoramaEditModeBtn?.addEventListener("click", () => setEditMode(!editMode));
  setEditMode(false);
}

function updatePanoramaEditUI() {
  const overlay = document.getElementById("panoramaOverlay");
  const overlayOpen = overlay && !overlay.classList.contains("hidden");
  const inWizard = Boolean(linkWizard || destinationWizard);
  const editLabel = editMode ? "結束編輯" : "編輯模式";

  if (panoramaEditModeBtn) {
    panoramaEditModeBtn.classList.toggle("hidden", !isFullAdminSession() || !overlayOpen || inWizard);
    panoramaEditModeBtn.setAttribute("aria-pressed", editMode ? "true" : "false");
    panoramaEditModeBtn.textContent = editLabel;
  }

  const showEditActions = overlayOpen && currentPanoramaPointId && !inWizard && editMode;
  const point = showEditActions ? getPointById(currentPanoramaPointId) : null;

  if (panoramaAddLink) {
    panoramaAddLink.classList.toggle("hidden", !showEditActions);
    panoramaAddLink.onclick = point ? () => openLinkModal(point.id) : null;
  }
  if (panoramaAddDestination) {
    panoramaAddDestination.classList.toggle("hidden", !showEditActions);
    panoramaAddDestination.onclick = point ? () => openDestinationModal(point.id) : null;
  }
  if (panoramaSetStartBtn) {
    const showSetStart = Boolean(overlayOpen && currentPanoramaPointId && !inWizard);
    panoramaSetStartBtn.classList.toggle("hidden", !showSetStart);
  }
  if (panoramaSaveSpotBtn) {
    const showSaveSpot = Boolean(
      canSavePanoSpots() && overlayOpen && currentPanoramaPointId && !inWizard && !isVisitorMode()
    );
    panoramaSaveSpotBtn.classList.toggle("hidden", !showSaveSpot);
  }
}

function updateNodeListSectionVisibility() {
  nodeListSection?.classList.toggle("hidden", !editMode);
}

function updateLinkArrowPosition(fromId, linkId, yaw, arrowPitch) {
  const from = getPointById(fromId);
  const link = (from?.links || []).find((item) => item.id === linkId);
  if (!link) {
    return;
  }

  let normalizedYaw = yaw;
  if (typeof normalizedYaw === "number") {
    normalizedYaw = ((normalizedYaw + 180) % 360) - 180;
  }
  const nextPitch = Math.max(-85, Math.min(-5, Number(arrowPitch) || -32));
  const yawChanged = Math.abs((link.yaw ?? 0) - normalizedYaw) > 0.05;
  const pitchChanged = link.arrowPitch !== nextPitch;
  if (!yawChanged && !pitchChanged) {
    return;
  }

  link.yaw = normalizedYaw;
  link.arrowPitch = nextPitch;
  savePanoramaPoints(getStorageKey());

  const spot = PanoramaViewer.options?.hotspots?.find((item) => item.id === linkId);
  if (spot) {
    spot.yaw = normalizedYaw;
    spot.arrowPitch = nextPitch;
  }
}

function refreshPanoramaArrowEditMode() {
  if (typeof PanoramaViewer === "undefined" || !PanoramaViewer.viewerInstance) {
    return;
  }
  const overlayOpen = !document.getElementById("panoramaOverlay")?.classList.contains("hidden");
  if (!overlayOpen || !currentPanoramaPointId || linkWizard || destinationWizard) {
    PanoramaViewer.setArrowEditMode(false);
    return;
  }

  const point = getPointById(currentPanoramaPointId);
  if (!point) {
    PanoramaViewer.setArrowEditMode(false);
    return;
  }

  const hotspots = buildHotspotsForPoint(point);
  if (PanoramaViewer.options) {
    PanoramaViewer.options.hotspots = hotspots;
  }
  PanoramaViewer.setArrowEditMode(editMode, (linkId, nextYaw, nextPitch) => {
    updateLinkArrowPosition(currentPanoramaPointId, linkId, nextYaw, nextPitch);
  });
}

function setEditMode(enabled) {
  if (enabled && !adminSessionOk) {
    return;
  }
  if (enabled && campusMapStyle === "satellite") {
    setCampusMapStyle("custom");
  }
  const wasEnabled = editMode;
  editMode = enabled;
  const editLabel = enabled ? "結束編輯" : "編輯模式";
  editModeBtn?.setAttribute("aria-pressed", enabled ? "true" : "false");
  mapContainer?.classList.toggle("edit-mode", enabled);
  if (editModeBtn) {
    editModeBtn.textContent = editLabel;
  }
  updatePanoramaEditUI();
  refreshPanoramaArrowEditMode();
  const overlayOpen = !document.getElementById("panoramaOverlay")?.classList.contains("hidden");
  if (overlayOpen && currentPanoramaPointId && !linkWizard && !destinationWizard && enabled !== wasEnabled) {
    if (enabled) {
      setPanoramaHint(
        "編輯模式：可拖動地面箭頭調整位置；也可按「＋ 新增連線」或「＋ 新增目的地」。",
        true
      );
    } else {
      setPanoramaHint(
        "地面箭頭：前往下一節點；綠色方框：轉向標記的目的地（方框會跟著環景移動）。"
      );
    }
  }
  if (!enabled) {
    clearPendingBuildingDraft();
    clearPendingDestPlaceMode();
    commitUnsavedMarkerDrag();
    flushPendingScopeSaves();
  }
  updateNodeListSectionVisibility();
  syncMapDistanceScaleBar();
  syncAddDestinationMapBtn();
  renderAll();
  if (viewState.mode === "campus") {
    renderBuildingHotspots();
  }
  syncCampusBuildingEditUi();
}

function syncMapDistanceScaleBar() {
  const show = Boolean(editMode && adminSessionOk);
  mapDistanceScaleBar?.classList.toggle("hidden", !show);
  if (!show || !mapDistanceScaleInput) {
    return;
  }
  const value = getMapMetersPerPercent();
  if (document.activeElement !== mapDistanceScaleInput) {
    mapDistanceScaleInput.value = String(value);
  }
}

function setMapDistanceScaleStatus(message, kind = "") {
  if (!mapDistanceScaleStatus) {
    return;
  }
  mapDistanceScaleStatus.textContent = message || "";
  mapDistanceScaleStatus.classList.remove("is-ok", "is-error");
  if (kind) {
    mapDistanceScaleStatus.classList.add(kind);
  }
}

async function persistMapMetersPerPercent(rawValue) {
  if (typeof NavArrowSettings === "undefined") {
    return;
  }
  const nextValue = Number(rawValue);
  if (!Number.isFinite(nextValue)) {
    setMapDistanceScaleStatus("請輸入有效數字", "is-error");
    syncMapDistanceScaleBar();
    return;
  }
  try {
    const current = NavArrowSettings.load();
    const saved = await NavArrowSettings.saveAndPersist({
      ...current,
      mapMetersPerPercent: nextValue
    });
    if (mapDistanceScaleInput) {
      mapDistanceScaleInput.value = String(saved.mapMetersPerPercent);
    }
    setMapDistanceScaleStatus(
      `已套用：1% ≈ ${Number(saved.mapMetersPerPercent).toFixed(2)} 公尺`,
      "is-ok"
    );
  } catch {
    setMapDistanceScaleStatus("儲存失敗，僅暫存於目前瀏覽器", "is-error");
  }
}

function setupMapDistanceScaleBar() {
  if (!mapDistanceScaleBar) {
    return;
  }

  const stopMapClick = (event) => {
    event.stopPropagation();
  };
  mapDistanceScaleBar.addEventListener("click", stopMapClick);
  mapDistanceScaleBar.addEventListener("pointerdown", stopMapClick);

  const commit = () => {
    void persistMapMetersPerPercent(mapDistanceScaleInput?.value);
  };

  mapDistanceScaleInput?.addEventListener("change", commit);
  mapDistanceScaleInput?.addEventListener("blur", commit);
  mapDistanceScaleInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      mapDistanceScaleInput.blur();
    }
  });

  syncMapDistanceScaleBar();
}

function setupBackButton() {
  backBtn.addEventListener("click", showCampusMap);
}

function setupLinkModal() {
  if (!linkModal) {
    return;
  }

  linkModalConfirm?.addEventListener("click", () => {
    const fromId = linkEditFromId;
    const fromScopeKey = linkEditFromScopeKey || getStorageKey();
    const selected = linkEditTargetRef;
    if (!fromId || !selected) {
      setLinkModalError("請從清單選擇目標節點。");
      return;
    }
    const [targetScopeKey, targetId] = selected.split("::");
    if (!targetScopeKey || !targetId) {
      setLinkModalError("目標節點格式錯誤，請重新選擇。");
      return;
    }
    closeLinkModal();
    beginLinkPlacement(fromId, targetId, fromScopeKey, targetScopeKey);
  });

  linkModalCancel?.addEventListener("click", closeLinkModal);
  linkModal.addEventListener("click", (event) => {
    if (event.target === linkModal) {
      closeLinkModal();
    }
  });
  linkTargetSearch?.addEventListener("input", () => {
    setLinkModalError("");
    renderLinkTargetResults();
  });
  linkTargetSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      linkModalConfirm?.click();
    }
  });
}

function setLinkModalError(message) {
  if (!linkModalError) {
    return;
  }
  if (!message) {
    linkModalError.textContent = "";
    linkModalError.classList.add("hidden");
    return;
  }
  linkModalError.textContent = message;
  linkModalError.classList.remove("hidden");
}

function pointHasLinkTo(fromPoint, toId, toScopeKey, fromScopeKey) {
  if (!fromPoint) {
    return false;
  }
  return (fromPoint.links || []).some(
    (link) =>
      link.targetId === toId && (link.targetScopeKey || fromScopeKey) === toScopeKey
  );
}

function getLinkStatus(fromScopeKey, fromId, targetScopeKey, targetId) {
  const from = getPointByRef(fromId, fromScopeKey);
  const target = getPointByRef(targetId, targetScopeKey);
  const hasForward = pointHasLinkTo(from, targetId, targetScopeKey, fromScopeKey);
  const hasReverse = pointHasLinkTo(target, fromId, fromScopeKey, targetScopeKey);
  if (hasForward) {
    return "linked";
  }
  if (hasReverse) {
    return "missing_reverse";
  }
  return "none";
}

function getMapMetersPerPercent() {
  if (
    typeof NavArrowSettings !== "undefined" &&
    typeof NavArrowSettings.getMapMetersPerPercent === "function"
  ) {
    return NavArrowSettings.getMapMetersPerPercent();
  }
  return 1;
}

function estimateMapDistanceMeters(fromPoint, toPoint) {
  if (
    !fromPoint ||
    !toPoint ||
    typeof fromPoint.xPercent !== "number" ||
    typeof fromPoint.yPercent !== "number" ||
    typeof toPoint.xPercent !== "number" ||
    typeof toPoint.yPercent !== "number"
  ) {
    return 10;
  }
  const dx = toPoint.xPercent - fromPoint.xPercent;
  const dy = toPoint.yPercent - fromPoint.yPercent;
  const mapUnits = Math.hypot(dx, dy);
  return Math.max(1, Math.round(mapUnits * getMapMetersPerPercent()));
}

function suggestLinkDistance(fromScopeKey, fromId, targetScopeKey, targetId) {
  if (fromScopeKey !== targetScopeKey) {
    return 10;
  }
  const from = getPointByRef(fromId, fromScopeKey);
  const to = getPointByRef(targetId, targetScopeKey);
  return estimateMapDistanceMeters(from, to);
}

function buildLinkTargetCandidates(fromId, fromScopeKey, query) {
  const from = getPointByRef(fromId, fromScopeKey);
  const q = query.trim().toLowerCase();
  const candidates = [];

  readPointsByScope().forEach((points, scopeKey) => {
    points.forEach((point) => {
      if (scopeKey === fromScopeKey && point.id === fromId) {
        return;
      }
      const scopeName = getScopeDisplayName(scopeKey);
      if (
        q &&
        !point.name.toLowerCase().includes(q) &&
        !scopeName.toLowerCase().includes(q)
      ) {
        return;
      }
      const sameScope = scopeKey === fromScopeKey;
      const distance = sameScope && from ? estimateMapDistanceMeters(from, point) : null;
      candidates.push({
        point,
        scopeKey,
        scopeName,
        label: `${point.name}（${scopeName}）`,
        sameScope,
        distance,
        status: getLinkStatus(fromScopeKey, fromId, scopeKey, point.id),
        ref: `${scopeKey}::${point.id}`
      });
    });
  });

  candidates.sort((a, b) => {
    if (a.sameScope !== b.sameScope) {
      return a.sameScope ? -1 : 1;
    }
    if (a.sameScope && b.sameScope) {
      return (a.distance ?? 999) - (b.distance ?? 999);
    }
    const scopeCmp = a.scopeName.localeCompare(b.scopeName, "zh-Hant");
    if (scopeCmp !== 0) {
      return scopeCmp;
    }
    return a.point.name.localeCompare(b.point.name, "zh-Hant", { numeric: true });
  });

  return candidates;
}

function renderLinkTargetResults() {
  if (!linkTargetResults || !linkEditFromId) {
    return;
  }
  const fromScopeKey = linkEditFromScopeKey || getStorageKey();
  const candidates = buildLinkTargetCandidates(
    linkEditFromId,
    fromScopeKey,
    linkTargetSearch?.value || ""
  );

  linkTargetResults.innerHTML = "";
  if (!candidates.length) {
    const empty = document.createElement("li");
    empty.className = "link-target-empty";
    empty.textContent = "找不到符合的節點。";
    linkTargetResults.appendChild(empty);
    return;
  }

  candidates.forEach((candidate) => {
    const item = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "link-target-item";
    if (candidate.ref === linkEditTargetRef) {
      btn.classList.add("is-selected");
    }
    btn.setAttribute("aria-pressed", candidate.ref === linkEditTargetRef ? "true" : "false");

    const main = document.createElement("span");
    main.className = "link-target-main";
    const label = document.createElement("span");
    label.className = "link-target-label";
    label.textContent = candidate.label;
    main.appendChild(label);

    const metaParts = [];
    if (candidate.sameScope && candidate.distance != null) {
      metaParts.push(`約 ${candidate.distance} 公尺`);
    }
    if (metaParts.length) {
      const meta = document.createElement("span");
      meta.className = "link-target-meta";
      meta.textContent = metaParts.join(" · ");
      main.appendChild(meta);
    }

    const badges = document.createElement("span");
    badges.className = "link-target-badges";
    if (candidate.status === "linked") {
      const badge = document.createElement("span");
      badge.className = "link-target-badge link-target-badge-linked";
      badge.textContent = "已連";
      badges.appendChild(badge);
    } else if (candidate.status === "missing_reverse") {
      const badge = document.createElement("span");
      badge.className = "link-target-badge link-target-badge-reverse";
      badge.textContent = "缺反向";
      badges.appendChild(badge);
    } else {
      const badge = document.createElement("span");
      badge.className = "link-target-badge link-target-badge-none";
      badge.textContent = "未連";
      badges.appendChild(badge);
    }

    btn.appendChild(main);
    btn.appendChild(badges);
    btn.addEventListener("click", () => {
      linkEditTargetRef = candidate.ref;
      setLinkModalError("");
      renderLinkTargetResults();
    });

    item.appendChild(btn);
    linkTargetResults.appendChild(item);
  });
}

function openLinkModal(fromId) {
  const fromScopeKey = getStorageKey();
  const from = getPointById(fromId);
  if (!from) {
    return;
  }

  const candidates = buildLinkTargetCandidates(fromId, fromScopeKey, "");
  if (candidates.length === 0) {
    alert("請先建立至少兩個節點，才能設定連線。");
    return;
  }

  linkEditFromId = fromId;
  linkEditFromScopeKey = fromScopeKey;
  linkEditTargetRef = null;
  if (linkModalTitle) {
    linkModalTitle.textContent = `從「${from.name}」連接到…`;
  }
  if (linkTargetSearch) {
    linkTargetSearch.value = "";
  }
  setLinkModalError("");
  renderLinkTargetResults();
  linkModal?.classList.remove("hidden");
  linkTargetSearch?.focus();
}

function closeLinkModal() {
  linkEditFromId = null;
  linkEditFromScopeKey = null;
  linkEditTargetRef = null;
  setLinkModalError("");
  if (linkTargetSearch) {
    linkTargetSearch.value = "";
  }
  if (linkTargetResults) {
    linkTargetResults.innerHTML = "";
  }
  linkModal?.classList.add("hidden");
}

function onMapImageError() {
  const failedSrc = mapImage.getAttribute("src") || "";
  const intendedSrc = mapImage.dataset.intendedSrc || failedSrc;
  const intended = formatAssetPath(intendedSrc);
  if (mapImage.dataset.fallbackApplied === "true") {
    const extra =
      formatAssetPath(failedSrc) !== intended ? `；備用圖也失敗：${formatAssetPath(failedSrc)}` : "";
    showMapAssetBanner(
      isVisitorMode()
        ? `平面圖載入失敗。缺少檔案：${intended}。請向維護者索取 images/ 後重試，或返回訪客頁改選。`
        : `平面圖載入失敗。請把圖放到：${intended}（見 images/README.md）${extra}`
    );
    return;
  }
  mapImage.dataset.fallbackApplied = "true";
  showMapAssetBanner(
    isVisitorMode()
      ? `找不到平面圖 ${intended}，已改顯示備用圖。`
      : `找不到平面圖：${intended}。已改顯示備用圖 ${formatAssetPath(CAMPUS_MAP.fallbackImage)}。請補上該檔後重新整理。`
  );
  if (failedSrc !== CAMPUS_MAP.fallbackImage) {
    mapImage.src = CAMPUS_MAP.fallbackImage;
  }
}

function showCampusMap() {
  viewState = { mode: "campus", buildingId: null, floorId: null };
  viewTitle.textContent = CAMPUS_MAP.title;
  mapImage.alt = CAMPUS_MAP.title;
  mapImage.dataset.fallbackApplied = "false";
  mapImage.dataset.intendedSrc = CAMPUS_MAP.image;
  hideMapAssetBanner();
  if (mapImage.getAttribute("src") !== CAMPUS_MAP.image) {
    mapImage.src = CAMPUS_MAP.image;
  }
  backBtn.classList.add("hidden");
  floorSwitcher.classList.add("hidden");
  floorSwitcher.innerHTML = "";
  const shortcutsHost = document.getElementById("buildingShortcuts");
  if (shortcutsHost) {
    shortcutsHost.classList.add("hidden");
    shortcutsHost.replaceChildren();
  }
  resetMapPinchZoom();
  buildingHotspots.classList.remove("hidden");
  clearMapPortals();
  renderBuildingHotspots();
  loadNodesForCurrentView();
  bindMapClick();
  afterMapImageChange();
  applyCampusMapStyleView();
}

function enterBuilding(buildingId) {
  const building = getBuildingsRegistry()[buildingId];
  if (!building) {
    return;
  }
  if (campusMapStyle === "satellite") {
    setCampusMapStyle("custom", { persist: false, refresh: false });
  }
  const firstFloor = building.floors[0];
  viewState = { mode: "building", buildingId, floorId: firstFloor.id };
  buildingHotspots.classList.add("hidden");
  backBtn.classList.remove("hidden");
  floorSwitcher.classList.remove("hidden");
  document.getElementById("campusMapStyleSwitch")?.classList.add("hidden");
  hideCampusSatelliteView();
  renderFloorSwitcher(building);
  showCurrentFloor();
}

function showCurrentFloor() {
  const building = getBuildingsRegistry()[viewState.buildingId];
  const floor = building.floors.find((f) => f.id === viewState.floorId) || building.floors[0];
  viewState.floorId = floor.id;
  viewTitle.textContent = `${building.name} · ${floor.label}`;
  mapImage.alt = `${building.name} ${floor.label} 平面圖`;
  mapImage.dataset.fallbackApplied = "false";
  mapImage.dataset.intendedSrc = floor.image || "";
  hideMapAssetBanner();
  if (mapImage.getAttribute("src") !== floor.image) {
    mapImage.src = floor.image;
  }
  updateFloorButtons();
  loadNodesForCurrentView();
  renderBuildingShortcuts();
  resetMapPinchZoom();
  bindMapClick();
  afterMapImageChange();
  applyCampusMapStyleView();
}

function getCampusHotspotsStore() {
  if (typeof NavArrowSettings === "undefined") {
    return {};
  }
  return stripCampusBuildingHotspots(NavArrowSettings.load()?.campusBuildings || {});
}

function getBuildingsRegistry() {
  const buildingsStore =
    typeof BuildingsStore !== "undefined" ? BuildingsStore.load() : {};
  return buildCampusBuildingsRegistry(buildingsStore, getCampusHotspotsStore());
}

async function persistCampusHotspots(nextHotspots, statusMessage) {
  if (typeof NavArrowSettings === "undefined") {
    return;
  }
  const current = NavArrowSettings.load();
  const campusBuildings = stripCampusBuildingHotspots(nextHotspots);
  try {
    await NavArrowSettings.saveAndPersist({ ...current, campusBuildings });
    if (statusMessage) {
      updateNodeSaveStatus(statusMessage);
    }
  } catch {
    updateNodeSaveStatus("大樓熱點設定儲存失敗");
  }
  renderBuildingHotspots();
  syncCampusBuildingEditUi();
  if (isCampusSatelliteView()) {
    void refreshCampusSatelliteMap();
  }
}

async function persistBuildingsStore(nextStore, statusMessage) {
  if (typeof BuildingsStore === "undefined") {
    return;
  }
  try {
    await BuildingsStore.saveAndPersist(nextStore);
    if (statusMessage) {
      updateNodeSaveStatus(statusMessage);
    }
  } catch {
    updateNodeSaveStatus("大樓定義儲存失敗");
  }
  renderBuildingHotspots();
  syncCampusBuildingEditUi();
  if (isCampusSatelliteView()) {
    void refreshCampusSatelliteMap();
  }
}

function getCampusBuildingEnabled(buildingId) {
  const building = getBuildingsRegistry()[buildingId];
  const hotspot = resolveCampusBuildingHotspotFromStore(
    buildingId,
    building,
    getCampusHotspotsStore()
  );
  return hotspot.enabled !== false;
}

function resolveBuildingHotspotPosition(buildingId, building) {
  return resolveCampusBuildingHotspotFromStore(buildingId, building, getCampusHotspotsStore());
}

async function persistCampusBuildingHotspot(buildingId, patch) {
  const hotspots = { ...getCampusHotspotsStore(), [buildingId]: { ...getCampusHotspotsStore()[buildingId], ...patch } };
  const building = getBuildingsRegistry()[buildingId];
  const name = resolveBuildingHotspotPosition(buildingId, building).label;
  await persistCampusHotspots(hotspots, `已儲存「${name}」熱點設定`);
}

async function persistCampusBuildingHotspotPosition(buildingId, xPercent, yPercent) {
  await persistCampusBuildingHotspot(buildingId, { xPercent, yPercent });
}

async function resetCampusBuildingHotspotPosition(buildingId) {
  const building = getBuildingsRegistry()[buildingId];
  const entry = getCampusHotspotsStore()[buildingId];
  const defaults = getDefaultCampusBuildingHotspot(buildingId, building, entry);
  await persistCampusBuildingHotspot(buildingId, {
    xPercent: defaults.xPercent,
    yPercent: defaults.yPercent
  });
}

async function createCampusBuildingAt(draft, xPercent, yPercent) {
  const name = String(draft?.name || "").trim();
  if (!name) {
    return;
  }
  const label = String(draft?.label || name).trim() || name;
  const buildingId = String(draft?.buildingId || "").trim().toLowerCase();
  const floorLabel = String(draft?.floorLabel || "1F").trim() || "1F";
  const floorImage =
    String(draft?.floorImage || "").trim() ||
    defaultFloorImageForBuilding(buildingId, floorLabel);
  const buildings = { ...BuildingsStore.load() };
  buildings[buildingId] = {
    name,
    floors: [{ id: "1", label: floorLabel, image: floorImage }]
  };
  const hotspots = {
    ...getCampusHotspotsStore(),
    [buildingId]: {
      enabled: true,
      xPercent,
      yPercent,
      defaultXPercent: xPercent,
      defaultYPercent: yPercent,
      label
    }
  };
  await BuildingsStore.saveAndPersist(buildings);
  await persistCampusHotspots(hotspots, `已新增大樓「${label}」`);
}

async function deleteCampusBuilding(buildingId) {
  const building = getBuildingsRegistry()[buildingId];
  if (!building) {
    return;
  }
  const label = resolveBuildingHotspotPosition(buildingId, building).label;
  const scopes = listBuildingFloorScopes(buildingId, building.floors);
  const ok = window.confirm(
    `確定要刪除「${label}」這個大樓嗎？\n\n校園地圖熱點會移除。接下來可選擇是否一併刪除節點檔。`
  );
  if (!ok) {
    return;
  }
  const alsoDeleteNodes =
    scopes.length > 0 &&
    confirmAlsoDeleteNodeFiles(scopes.map((scope) => `data/nodes/${scope}.json`));
  const buildings = { ...BuildingsStore.load() };
  delete buildings[buildingId];
  const hotspots = { ...getCampusHotspotsStore() };
  delete hotspots[buildingId];
  await BuildingsStore.saveAndPersist(buildings);
  await persistCampusHotspots(hotspots, `已刪除大樓「${label}」`);
  if (alsoDeleteNodes) {
    const results = await deleteNodeScopeFiles(scopes);
    results.forEach(({ scope }) => {
      const key = `${STORAGE_PREFIX}${scope}`;
      nodeScopeCache.delete(key);
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });
    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      updateNodeSaveStatus(
        `大樓已刪，但部分節點檔刪除失敗：${failed.map((item) => item.scope).join(", ")}`
      );
    } else {
      updateNodeSaveStatus(`已刪除大樓「${label}」與相關節點檔`);
    }
  }
}

function clearPendingBuildingDraft() {
  pendingBuildingDraft = null;
  syncCampusBuildingEditUi();
}

function syncBuildingModalFloorImage() {
  if (!buildingFloorImageInput || !buildingCodeInput || !buildingFloorLabelInput) {
    return;
  }
  const code =
    buildingCodeInput.value.trim().toLowerCase() ||
    createCampusBuildingId(buildingNameInput?.value || "", getExistingCampusBuildingIds(BuildingsStore.load()));
  const floorLabel = buildingFloorLabelInput.value.trim() || "1F";
  buildingFloorImageInput.value = defaultFloorImageForBuilding(code, floorLabel);
}

function setBuildingModalError(message) {
  if (!buildingModalError) {
    return;
  }
  if (!message) {
    buildingModalError.textContent = "";
    buildingModalError.classList.add("hidden");
    return;
  }
  buildingModalError.textContent = message;
  buildingModalError.classList.remove("hidden");
}

function openBuildingModal() {
  if (!buildingModal) {
    return;
  }
  if (buildingNameInput) {
    buildingNameInput.value = "";
  }
  if (buildingCodeInput) {
    buildingCodeInput.value = "";
  }
  if (buildingLabelInput) {
    buildingLabelInput.value = "";
  }
  if (buildingFloorLabelInput) {
    buildingFloorLabelInput.value = "1F";
  }
  if (buildingFloorImageInput) {
    buildingFloorImageInput.value = defaultFloorImageForBuilding("b", "1F");
  }
  setBuildingModalError("");
  buildingModal.classList.remove("hidden");
  buildingNameInput?.focus();
}

function closeBuildingModal() {
  buildingModal?.classList.add("hidden");
  setBuildingModalError("");
}

function confirmBuildingModal() {
  const name = buildingNameInput?.value?.trim() || "";
  const label = buildingLabelInput?.value?.trim() || name;
  const floorLabel = buildingFloorLabelInput?.value?.trim() || "1F";
  const existingIds = getExistingCampusBuildingIds(BuildingsStore.load());
  const codeInput = buildingCodeInput?.value?.trim().toLowerCase() || "";
  const buildingId = codeInput || createCampusBuildingId(name, existingIds);
  const floorImage =
    buildingFloorImageInput?.value?.trim() ||
    defaultFloorImageForBuilding(buildingId, floorLabel);
  if (!name) {
    setBuildingModalError("請輸入大樓名稱。");
    buildingNameInput?.focus();
    return;
  }
  if (!isValidCampusBuildingId(buildingId)) {
    setBuildingModalError("大樓代碼須為英文開頭，僅含字母、數字、底線（例如 lib）。");
    buildingCodeInput?.focus();
    return;
  }
  if (getBuildingsRegistry()[buildingId]) {
    setBuildingModalError("此大樓代碼已被使用，請換一個。");
    buildingCodeInput?.focus();
    return;
  }
  if (!floorImage) {
    setBuildingModalError("請輸入 1F 平面圖路徑。");
    buildingFloorImageInput?.focus();
    return;
  }
  pendingBuildingDraft = { buildingId, name, label, floorLabel, floorImage };
  closeBuildingModal();
  syncCampusBuildingEditUi();
  updateNodeSaveStatus(`請在校園平面圖點選「${label}」的位置（Esc 取消）`);
}

function setupBuildingModal() {
  buildingModalConfirm?.addEventListener("click", confirmBuildingModal);
  buildingModalCancel?.addEventListener("click", closeBuildingModal);
  buildingModal?.addEventListener("click", (event) => {
    if (event.target === buildingModal) {
      closeBuildingModal();
    }
  });
  buildingCodeInput?.addEventListener("input", syncBuildingModalFloorImage);
  buildingFloorLabelInput?.addEventListener("input", syncBuildingModalFloorImage);
  buildingNameInput?.addEventListener("input", () => {
    if (!buildingCodeInput?.value.trim()) {
      syncBuildingModalFloorImage();
    }
  });
}

function syncCampusBuildingEditUi() {
  const section = document.getElementById("campusBuildingEditSection");
  const addBtn = document.getElementById("campusBuildingAddBtn");
  const hint = document.getElementById("campusBuildingPlaceHint");
  const show =
    editMode &&
    adminSessionOk &&
    viewState.mode === "campus" &&
    campusMapStyle === "custom" &&
    !isVisitorMode();
  section?.classList.toggle("hidden", !show);
  if (addBtn) {
    addBtn.textContent = pendingBuildingDraft ? "取消新增" : "＋ 新增大樓";
    addBtn.setAttribute("aria-pressed", pendingBuildingDraft ? "true" : "false");
  }
  if (hint) {
    if (pendingBuildingDraft) {
      const label = pendingBuildingDraft.label || pendingBuildingDraft.name;
      hint.textContent = `正在新增「${label}」：請在校園平面圖上點選位置。`;
      hint.classList.remove("hidden");
    } else {
      hint.textContent = "新增大樓後可進入編輯節點。移動熱點：編輯模式下拖曳藍色按鈕；刪除大樓：右鍵按鈕，或至設定頁。";
      hint.classList.toggle("hidden", !show);
    }
  }
  mapContainer?.classList.toggle("is-placing-building-hotspot", Boolean(pendingBuildingDraft && show));
}

function bindBuildingHotspotDrag(btn, buildingId) {
  let drag = null;
  btn.addEventListener("pointerdown", (event) => {
    if (!editMode || viewState.mode !== "campus" || campusMapStyle !== "custom" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    btn.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, moved: false };
    btn.classList.add("building-btn-dragging");
  });
  const finishDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    btn.classList.remove("building-btn-dragging");
    if (btn.hasPointerCapture?.(event.pointerId)) {
      btn.releasePointerCapture(event.pointerId);
    }
    const moved = drag.moved;
    drag = null;
    if (!moved) {
      return;
    }
    buildingHotspotDidDrag = true;
    const xPercent = Number.parseFloat(btn.style.left);
    const yPercent = Number.parseFloat(btn.style.top);
    if (Number.isFinite(xPercent) && Number.isFinite(yPercent)) {
      void persistCampusBuildingHotspotPosition(buildingId, xPercent, yPercent);
    }
  };
  btn.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const rect = getMapStageRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    drag.moved = true;
    btn.style.left = `${Math.min(98, Math.max(2, xPercent))}%`;
    btn.style.top = `${Math.min(98, Math.max(2, yPercent))}%`;
  });
  btn.addEventListener("pointerup", finishDrag);
  btn.addEventListener("pointercancel", finishDrag);
  btn.addEventListener("lostpointercapture", finishDrag);
}

function appendBuildingHotspotButton(host, buildingId, building, positionOverride = null) {
  const resolved = resolveBuildingHotspotPosition(buildingId, building);
  const hotspot = positionOverride
    ? { ...resolved, xPercent: positionOverride.xPercent, yPercent: positionOverride.yPercent }
    : resolved;
  const enabled = hotspot.enabled;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "building-btn";
  btn.dataset.buildingId = buildingId;
  btn.textContent = hotspot.label;
  btn.style.left = `${hotspot.xPercent}%`;
  btn.style.top = `${hotspot.yPercent}%`;
  const canManageHotspot =
    editMode && adminSessionOk && viewState.mode === "campus" && campusMapStyle === "custom";
  if (!enabled) {
    if (canManageHotspot) {
      btn.setAttribute("aria-disabled", "true");
      btn.classList.add("is-disabled");
    } else {
      btn.disabled = true;
      btn.classList.add("is-disabled");
    }
    btn.title = `${hotspot.label}（尚未開放）`;
  } else if (canManageHotspot) {
    btn.title = `${hotspot.label}（拖曳調整位置；右鍵刪除大樓；${locateStartMode ? "" : "點擊進入"}）`;
  } else {
    btn.title = `進入${hotspot.label}`;
  }
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (buildingHotspotDidDrag) {
      buildingHotspotDidDrag = false;
      return;
    }
    if (!enabled || locateStartMode || btn.getAttribute("aria-disabled") === "true") {
      return;
    }
    if (editMode && viewState.mode === "campus") {
      return;
    }
    enterBuilding(buildingId);
  });
  if (canManageHotspot) {
    bindBuildingHotspotDrag(btn, buildingId);
    btn.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteCampusBuilding(buildingId);
    });
  }
  host.appendChild(btn);
}

function renderBuildingHotspots() {
  buildingHotspots.innerHTML = "";
  Object.entries(getBuildingsRegistry()).forEach(([id, building]) => {
    appendBuildingHotspotButton(buildingHotspots, id, building);
  });
  syncCampusBuildingEditUi();
}

function renderFloorSwitcher(building) {
  floorSwitcher.innerHTML = "";
  building.floors.forEach((floor) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "floor-btn";
    btn.textContent = floor.label;
    btn.dataset.floorId = floor.id;
    btn.addEventListener("click", () => {
      viewState.floorId = floor.id;
      showCurrentFloor();
    });
    floorSwitcher.appendChild(btn);
  });
}

function updateFloorButtons() {
  floorSwitcher.querySelectorAll(".floor-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.floorId === viewState.floorId);
  });
}

function renderBuildingShortcuts() {
  const host = document.getElementById("buildingShortcuts");
  if (!host) {
    return;
  }
  host.replaceChildren();
  if (viewState.mode !== "building") {
    host.classList.add("hidden");
    return;
  }
  host.classList.remove("hidden");

  const campusBtn = document.createElement("button");
  campusBtn.type = "button";
  campusBtn.className = "building-shortcut-btn building-shortcut-campus";
  campusBtn.textContent = "回校園";
  campusBtn.title = "返回校園總圖";
  campusBtn.addEventListener("click", showCampusMap);
  host.appendChild(campusBtn);
  // 跨棟改由平面圖出口按鈕（map-portal-btn）提供，頂欄不再重複「前往 XX 棟」
}

function formatFloorPlanPortalLabel(scopeKey) {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed || parsed.mode === "campus") {
    return "往校園";
  }
  const building = getBuildingsRegistry()[parsed.buildingId];
  const code = String(building?.code || parsed.buildingId || "")
    .trim()
    .toUpperCase();
  const floor = building?.floors?.find((f) => f.id === parsed.floorId);
  let floorPart = floor?.label || `${parsed.floorId}F`;
  if (/^\d+F$/i.test(floorPart)) {
    floorPart = `${floorPart.replace(/F$/i, "")}樓`;
  }
  return `往${code}棟${floorPart}`;
}

function floorPlanPortalOverrideKey(targetKey, sourcePointId) {
  return `${targetKey}::${sourcePointId}`;
}

function getFloorPlanPortalOverrides(floorScopeKey = getStorageKey()) {
  if (typeof NavArrowSettings === "undefined") {
    return {};
  }
  const store = NavArrowSettings.load()?.floorPlanPortals || {};
  const entries = store[floorScopeKey];
  return entries && typeof entries === "object" ? entries : {};
}

/** 目前樓層通往校園或其他棟的出口（略過同棟上下樓） */
function collectFloorPlanPortals() {
  if (viewState.mode !== "building" || !viewState.buildingId) {
    return [];
  }
  const currentKey = getStorageKey();
  const currentBuilding = viewState.buildingId;
  const overrides = getFloorPlanPortalOverrides(currentKey);
  const portals = [];
  const seen = new Set();

  panoramaPoints.forEach((point) => {
    (point.links || []).forEach((link) => {
      const targetKey = link.targetScopeKey || currentKey;
      const parsed = parseScopeKey(targetKey);
      if (!parsed) {
        return;
      }
      let kind = null;
      let storageTarget = targetKey;
      if (parsed.mode === "campus") {
        kind = "campus";
        storageTarget = "campus";
      } else if (parsed.mode === "building" && parsed.buildingId !== currentBuilding) {
        kind = "cross";
      } else {
        return;
      }
      const portalId = floorPlanPortalOverrideKey(storageTarget, point.id);
      if (seen.has(portalId)) {
        return;
      }
      seen.add(portalId);
      const override = overrides[portalId];
      const xPercent = Number.isFinite(Number(override?.xPercent))
        ? Number(override.xPercent)
        : Number(point.xPercent);
      const yPercent = Number.isFinite(Number(override?.yPercent))
        ? Number(override.yPercent)
        : Number(point.yPercent);
      if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
        return;
      }
      portals.push({
        portalId,
        kind,
        sourcePointId: point.id,
        targetScopeKey: targetKey,
        storageTarget,
        label: kind === "campus" ? "往校園" : formatFloorPlanPortalLabel(targetKey),
        xPercent,
        yPercent
      });
    });
  });

  return portals.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
}

function clearMapPortals() {
  if (!mapPortals) {
    return;
  }
  mapPortals.replaceChildren();
  mapPortals.classList.add("hidden");
}

async function persistFloorPlanPortalPosition(portalId, xPercent, yPercent) {
  if (typeof NavArrowSettings === "undefined" || !portalId) {
    return;
  }
  const floorKey = getStorageKey();
  const current = NavArrowSettings.load() || {};
  const all = { ...(current.floorPlanPortals || {}) };
  const floorEntries = { ...(all[floorKey] || {}) };
  floorEntries[portalId] = {
    xPercent: Math.min(98, Math.max(2, Number(xPercent))),
    yPercent: Math.min(98, Math.max(2, Number(yPercent)))
  };
  all[floorKey] = floorEntries;
  await NavArrowSettings.saveAndPersist({ ...current, floorPlanPortals: all });
}

function bindMapPortalDrag(btn, portalId) {
  let drag = null;
  btn.addEventListener("pointerdown", (event) => {
    if (!editMode || !adminSessionOk || viewState.mode !== "building" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    btn.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, moved: false };
    btn.classList.add("map-portal-btn-dragging");
  });
  const finishDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    btn.classList.remove("map-portal-btn-dragging");
    if (btn.hasPointerCapture?.(event.pointerId)) {
      btn.releasePointerCapture(event.pointerId);
    }
    const moved = drag.moved;
    drag = null;
    if (!moved) {
      return;
    }
    mapPortalDidDrag = true;
    const xPercent = Number.parseFloat(btn.style.left);
    const yPercent = Number.parseFloat(btn.style.top);
    if (Number.isFinite(xPercent) && Number.isFinite(yPercent)) {
      void persistFloorPlanPortalPosition(portalId, xPercent, yPercent);
    }
  };
  btn.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const rect = getMapStageRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    drag.moved = true;
    btn.style.left = `${Math.min(98, Math.max(2, xPercent))}%`;
    btn.style.top = `${Math.min(98, Math.max(2, yPercent))}%`;
  });
  btn.addEventListener("pointerup", finishDrag);
  btn.addEventListener("pointercancel", finishDrag);
  btn.addEventListener("lostpointercapture", finishDrag);
}

function renderMapPortals() {
  if (!mapPortals) {
    return;
  }
  mapPortals.replaceChildren();
  if (viewState.mode !== "building" || isCampusSatelliteView()) {
    mapPortals.classList.add("hidden");
    return;
  }
  const portals = collectFloorPlanPortals();
  if (!portals.length) {
    mapPortals.classList.add("hidden");
    return;
  }
  mapPortals.classList.remove("hidden");
  const canDrag = editMode && adminSessionOk && !isVisitorMode();
  portals.forEach((portal) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `map-portal-btn ${
      portal.kind === "campus" ? "map-portal-btn-campus" : "map-portal-btn-cross"
    }`;
    btn.dataset.portalId = portal.portalId;
    btn.textContent = portal.label;
    btn.style.left = `${portal.xPercent}%`;
    btn.style.top = `${portal.yPercent}%`;
    btn.title = canDrag
      ? `${portal.label}（拖曳調整位置；點擊前往）`
      : portal.label;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (mapPortalDidDrag) {
        mapPortalDidDrag = false;
        return;
      }
      if (locateStartMode) {
        return;
      }
      // 編輯模式僅拖曳調位；未拖動的點擊仍可前往（方便試按）
      if (portal.kind === "campus") {
        showCampusMap();
        return;
      }
      switchToScope(portal.targetScopeKey);
    });
    if (canDrag) {
      bindMapPortalDrag(btn, portal.portalId);
    }
    mapPortals.appendChild(btn);
  });
}

function getStorageKey() {
  if (viewState.mode === "campus") {
    return `${STORAGE_PREFIX}campus`;
  }
  return `${STORAGE_PREFIX}${viewState.buildingId}_${viewState.floorId}`;
}

function getStorageKeyForView(mode, buildingId, floorId) {
  if (mode === "campus") {
    return `${STORAGE_PREFIX}campus`;
  }
  if (!buildingId || !floorId) {
    return `${STORAGE_PREFIX}campus`;
  }
  return `${STORAGE_PREFIX}${buildingId}_${floorId}`;
}

function parseScopeKey(scopeKey) {
  if (!scopeKey || !scopeKey.startsWith(STORAGE_PREFIX)) {
    return null;
  }
  const value = scopeKey.slice(STORAGE_PREFIX.length);
  if (value === "campus") {
    return { mode: "campus", buildingId: null, floorId: null };
  }
  const splitAt = value.lastIndexOf("_");
  if (splitAt <= 0 || splitAt >= value.length - 1) {
    return null;
  }
  const buildingId = value.slice(0, splitAt);
  const floorId = value.slice(splitAt + 1);
  if (!buildingId || !floorId) {
    return null;
  }
  return { mode: "building", buildingId, floorId };
}

function getAllScopeKeys() {
  const scopeKeys = [getStorageKeyForView("campus")];
  Object.entries(getBuildingsRegistry()).forEach(([buildingId, building]) => {
    (building.floors || []).forEach((floor) => {
      scopeKeys.push(getStorageKeyForView("building", buildingId, floor.id));
    });
  });
  return scopeKeys;
}

function clonePointsData(points) {
  return JSON.parse(JSON.stringify(points || []));
}

function getScopePointsSource(scopeKey) {
  if (loadedScopeKey && scopeKey === loadedScopeKey) {
    return panoramaPoints;
  }
  return readPanoramaPoints(scopeKey);
}

function readPointsByScope() {
  const map = new Map();
  getAllScopeKeys().forEach((scopeKey) => {
    // 先複製再 normalize，避免搜尋／路徑把正在編輯的 dest 物件換成新的，
    // 否則平面圖拖曳只改到舊物件，結束編輯重畫就會跳回原位。
    const points = normalizePoints(clonePointsData(getScopePointsSource(scopeKey)), scopeKey).map(
      (point) => ({
        ...point,
        scopeKey
      })
    );
    map.set(scopeKey, points);
  });
  return map;
}

function getScopeFloorLabel(scopeKey) {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed || parsed.mode !== "building") {
    return "";
  }
  const building = getBuildingsRegistry()[parsed.buildingId];
  const floor = building?.floors?.find((f) => f.id === parsed.floorId);
  return floor?.label || `${parsed.floorId}F`;
}

function getScopeDisplayName(scopeKey) {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    return "未知區域";
  }
  if (parsed.mode === "campus") {
    return "校園地圖";
  }
  const building = getBuildingsRegistry()[parsed.buildingId];
  const floor = building?.floors?.find((f) => f.id === parsed.floorId);
  const buildingName = building?.name || parsed.buildingId.toUpperCase();
  const floorName = floor?.label || `${parsed.floorId}F`;
  return `${buildingName} ${floorName}`;
}

/** @returns {'up'|'down'|null} */
function getFloorChangeDirection(fromScopeKey, toScopeKey) {
  const from = parseScopeKey(fromScopeKey);
  const to = parseScopeKey(toScopeKey);
  if (!from || !to || from.mode !== "building" || to.mode !== "building") {
    return null;
  }
  if (from.buildingId !== to.buildingId) {
    return null;
  }
  const fromFloor = Number(from.floorId);
  const toFloor = Number(to.floorId);
  if (!Number.isFinite(fromFloor) || !Number.isFinite(toFloor) || fromFloor === toFloor) {
    return null;
  }
  return toFloor > fromFloor ? "up" : "down";
}

function getPointByRef(id, scopeKey = getStorageKey()) {
  const liveKey = loadedScopeKey || getStorageKey();
  const scopePoints =
    scopeKey === liveKey
      ? panoramaPoints
      : normalizePoints(clonePointsData(readPanoramaPoints(scopeKey)), scopeKey);
  return scopePoints.find((p) => p.id === id) || null;
}

function encodeTargetRef(targetId, targetScopeKey = getStorageKey()) {
  return `${targetScopeKey}::${targetId}`;
}

function decodeTargetRef(value) {
  if (!value || !value.includes("::")) {
    return { targetScopeKey: getStorageKey(), targetId: value };
  }
  const [targetScopeKey, targetId] = value.split("::");
  return { targetScopeKey, targetId };
}

function encodeNodeRef(scopeKey, pointId) {
  return encodeTargetRef(pointId, scopeKey);
}

function decodeNodeRef(value) {
  const { targetScopeKey, targetId } = decodeTargetRef(value);
  return { scopeKey: targetScopeKey, pointId: targetId };
}

function parseScopedQuery(query) {
  const trimmed = query.trim();
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

function getAllPointsGlobal() {
  const all = [];
  readPointsByScope().forEach((points, scopeKey) => {
    points.forEach((point) => {
      all.push({ ...point, scopeKey });
    });
  });
  return all;
}

function isSameNodeRef(aScopeKey, aId, bScopeKey, bId) {
  return aScopeKey === bScopeKey && aId === bId;
}

function findPathStepIndex(steps, scopeKey, pointId, options = {}) {
  if (!steps?.length) {
    return -1;
  }
  const preferAfter = Number.isFinite(options.preferAfter) ? options.preferAfter : -1;
  const prevScopeKey = options.prevScopeKey;
  const prevPointId = options.prevPointId;

  if (prevPointId != null && prevScopeKey != null) {
    for (let i = Math.max(1, preferAfter); i < steps.length; i += 1) {
      if (
        isSameNodeRef(steps[i].scopeKey, steps[i].pointId, scopeKey, pointId) &&
        isSameNodeRef(steps[i - 1].scopeKey, steps[i - 1].pointId, prevScopeKey, prevPointId)
      ) {
        return i;
      }
    }
    for (let i = 1; i < steps.length; i += 1) {
      if (
        isSameNodeRef(steps[i].scopeKey, steps[i].pointId, scopeKey, pointId) &&
        isSameNodeRef(steps[i - 1].scopeKey, steps[i - 1].pointId, prevScopeKey, prevPointId)
      ) {
        return i;
      }
    }
  }

  const searchFrom = Math.max(0, preferAfter);
  for (let i = searchFrom; i < steps.length; i += 1) {
    if (isSameNodeRef(steps[i].scopeKey, steps[i].pointId, scopeKey, pointId)) {
      return i;
    }
  }
  if (searchFrom > 0) {
    return steps.findIndex((step) => isSameNodeRef(step.scopeKey, step.pointId, scopeKey, pointId));
  }
  return -1;
}

function hasDestinationYaw(dest) {
  if (dest == null) {
    return false;
  }
  const yaw = typeof dest.yaw === "number" ? dest.yaw : Number(dest.yaw);
  return Number.isFinite(yaw);
}

function getDestinationYawPitch(dest) {
  if (!hasDestinationYaw(dest)) {
    return null;
  }
  const yaw = typeof dest.yaw === "number" ? dest.yaw : Number(dest.yaw);
  const pitchRaw = typeof dest.pitch === "number" ? dest.pitch : Number(dest.pitch);
  const pitch = Number.isFinite(pitchRaw) ? pitchRaw : 0;
  return { yaw, pitch };
}

function clampMapPercent(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(98, Math.max(2, n));
}

function offsetDestinationAroundPoint(point, destIndex) {
  const angle = destIndex * 0.95;
  const radius = 1.6 + Math.floor(destIndex / 8) * 1.2;
  return {
    xPercent: clampMapPercent((Number(point?.xPercent) || 50) + Math.cos(angle) * radius),
    yPercent: clampMapPercent((Number(point?.yPercent) || 50) + Math.sin(angle) * radius)
  };
}

function normalizeDestination(dest, point = null, destIndex = 0) {
  const next = dest && typeof dest === "object" ? dest : {};
  // 穩定 id：避免每次 clone+normalize 用 Date.now() 產生新 id，導致路徑 endDestinationId 對不到
  const pointKey = point?.id != null ? String(point.id) : "pt";
  next.id =
    next.id ||
    (next.name ? `dest_${pointKey}_${String(next.name).trim()}` : null) ||
    `dest_${pointKey}_${destIndex}`;
  next.name = (next.name || "目的地").trim();
  let xPercent = Number(next.xPercent);
  let yPercent = Number(next.yPercent);
  if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
    const offset = offsetDestinationAroundPoint(point, destIndex);
    xPercent = offset.xPercent;
    yPercent = offset.yPercent;
  } else {
    xPercent = clampMapPercent(xPercent);
    yPercent = clampMapPercent(yPercent);
  }
  next.xPercent = xPercent;
  next.yPercent = yPercent;
  next.isElevator = Boolean(next.isElevator);
  const yawPitch = getDestinationYawPitch(next);
  if (yawPitch) {
    const oriented =
      typeof PanoramaViewer !== "undefined"
        ? PanoramaViewer.normalizeWalkOrientation(yawPitch.yaw, yawPitch.pitch)
        : yawPitch;
    next.yaw = oriented.yaw;
    next.pitch = oriented.pitch;
  }
  return next;
}

function normalizePoint(point, scopeKey = getStorageKey()) {
  if (!point.links) {
    point.links = [];
  }
  if (!point.destinations) {
    point.destinations = [];
  }
  const hadNodeFloorFlags = "floorIconUp" in point || "floorIconDown" in point;
  const nodeFloorMigrate = hadNodeFloorFlags
    ? {
        migrateFromNodeFlags: true,
        floorIconUp: Boolean(point.floorIconUp),
        floorIconDown: Boolean(point.floorIconDown)
      }
    : null;
  point.links = point.links.map((link) => normalizeLink(link, scopeKey, nodeFloorMigrate));
  point.destinations = point.destinations.map((dest, index) =>
    normalizeDestination(dest, point, index)
  );
  point.autoFaceNext = Boolean(point.autoFaceNext);
  // 舊版節點級上下樓勾選已改為連線級，載入時清掉避免殘留
  delete point.floorIconUp;
  delete point.floorIconDown;
  return point;
}

const AUTO_FACE_YAW_THRESHOLD_DEG = 15;

function yawAbsDeltaDegrees(fromYaw, toYaw) {
  return Math.abs((((toYaw - fromYaw + 540) % 360) - 180));
}

function getTurnAssistDurationMs() {
  if (typeof NavArrowSettings !== "undefined" && typeof NavArrowSettings.getTurnDurationMs === "function") {
    return Math.max(300, NavArrowSettings.getTurnDurationMs());
  }
  return 2000;
}

function getFloorChangeDurationMs() {
  if (
    typeof NavArrowSettings !== "undefined" &&
    typeof NavArrowSettings.getFloorChangeDurationMs === "function"
  ) {
    return Math.max(300, NavArrowSettings.getFloorChangeDurationMs());
  }
  return 800;
}

function shouldCenterPathNextArrow() {
  if (
    typeof NavArrowSettings !== "undefined" &&
    typeof NavArrowSettings.shouldCenterPathNextArrow === "function"
  ) {
    return NavArrowSettings.shouldCenterPathNextArrow();
  }
  return true;
}

function getPlayDelayBounds() {
  if (
    typeof NavArrowSettings !== "undefined" &&
    typeof NavArrowSettings.getPlayDelayBounds === "function"
  ) {
    return NavArrowSettings.getPlayDelayBounds();
  }
  return { min: 0.2, max: 20 };
}

function getDefaultPlayDelaySec() {
  if (
    typeof NavArrowSettings !== "undefined" &&
    typeof NavArrowSettings.getPlayDelayDefaultSec === "function"
  ) {
    return NavArrowSettings.getPlayDelayDefaultSec();
  }
  return 1;
}

function updateAutoDelayLabel() {
  if (!pathAutoDelayValue || !pathAutoDelay) {
    return;
  }
  const seconds = Number(pathAutoDelay.value || getDefaultPlayDelaySec());
  pathAutoDelayValue.textContent = `${seconds.toFixed(1)} 秒`;
}

function applyPlayDelaySliderBounds({ useDefault = false } = {}) {
  if (!pathAutoDelay) {
    return;
  }
  const bounds = getPlayDelayBounds();
  pathAutoDelay.min = String(bounds.min);
  pathAutoDelay.max = String(bounds.max);
  const fallback = getDefaultPlayDelaySec();
  const current = useDefault ? fallback : Number(pathAutoDelay.value || fallback);
  const next = Math.min(bounds.max, Math.max(bounds.min, current));
  pathAutoDelay.value = String(next);
  updateAutoDelayLabel();
  updatePlaySpeedHud();
}

function updatePlaySpeedHud() {
  const hud = document.getElementById("playSpeedHud");
  const valueEl = document.getElementById("playSpeedValue");
  const downBtn = document.getElementById("playSpeedDownBtn");
  const upBtn = document.getElementById("playSpeedUpBtn");
  if (!hud) {
    return;
  }
  hud.classList.toggle("hidden", !pathAutoPlayActive);
  if (typeof NavArrowSettings !== "undefined" && typeof NavArrowSettings.applyOverlayStyle === "function") {
    NavArrowSettings.applyOverlayStyle();
  }
  const bounds = getPlayDelayBounds();
  const seconds = Number(pathAutoDelay?.value || getDefaultPlayDelaySec());
  if (valueEl) {
    valueEl.textContent = `停留 ${seconds.toFixed(1)} 秒`;
  }
  if (downBtn) {
    downBtn.disabled = seconds >= bounds.max - 0.001;
  }
  if (upBtn) {
    upBtn.disabled = seconds <= bounds.min + 0.001;
  }
}

function isPathGuidanceActive(options = {}) {
  return Boolean(pathGuidanceActive || options.followComputedPath);
}

function shouldApplyPathNextCentering(options = {}) {
  if (!isPathGuidanceActive(options)) {
    return false;
  }
  // 自動導覽進行中一律可對準下一站；暫停或手動查看時才讀設定開關。
  if (pathAutoPlayActive && !pathAutoPlayPaused) {
    return true;
  }
  return shouldCenterPathNextArrow();
}

function setPointAutoFaceNext(pointId, enabled) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  const next = Boolean(enabled);
  if (point.autoFaceNext === next) {
    return;
  }
  point.autoFaceNext = next;
  savePanoramaPoints(getStorageKey());
  renderList();
  renderMarkers();
}

/**
 * 指定連線箭頭為上樓／下樓類型（互斥；皆不勾選則為一般箭頭）。
 * @param {'up'|'down'} direction
 */
function setLinkFloorChange(pointId, linkId, direction, enabled) {
  const point = getPointById(pointId);
  if (!point || (direction !== "up" && direction !== "down")) {
    return;
  }
  const link = (point.links || []).find((item) => item.id === linkId);
  if (!link) {
    return;
  }
  const next = enabled ? direction : link.floorChange === direction ? null : link.floorChange;
  if (link.floorChange === next) {
    return;
  }
  link.floorChange = next;
  savePanoramaPoints(getStorageKey());
  renderList();
  if (currentPanoramaPointId === pointId) {
    openPanoramaViewer(point, { skipAutoFace: true, skipCenterPathNext: true });
  }
}

/**
 * @returns {'up'|'down'|null}
 */
function resolveLinkFloorChange(link) {
  if (link?.floorChange === "up" || link?.floorChange === "down") {
    return link.floorChange;
  }
  return null;
}

function getFloorChangePitchDeg(floorChange) {
  const deg =
    typeof PanoramaViewer !== "undefined" && typeof PanoramaViewer.FLOOR_CHANGE_PITCH_DEG === "number"
      ? PanoramaViewer.FLOOR_CHANGE_PITCH_DEG
      : 20;
  if (floorChange === "up") {
    return deg;
  }
  if (floorChange === "down") {
    return -deg;
  }
  return 0;
}

/** 離開樓梯連線前：略抬頭／低頭再進下一站 */
function runFloorChangeDepartureGesture(link, onDone) {
  const finish = () => {
    if (typeof onDone === "function") {
      onDone();
    }
  };
  const floorChange = resolveLinkFloorChange(link);
  if (!floorChange || typeof PanoramaViewer === "undefined" || typeof link?.yaw !== "number") {
    finish();
    return;
  }
  const pitch = getFloorChangePitchDeg(floorChange);
  // 面向該樓梯箭頭再抬頭／低頭（勿只用當前 yaw：已對準時 yaw callback 會瞬間結束）
  const yaw = link.yaw;
  const turnMs = getFloorChangeDurationMs();
  setPanoramaHint(floorChange === "up" ? "上樓中…" : "下樓中…");
  PanoramaViewer.lookAt(yaw, pitch, turnMs, finish, { allowPitch: true });
}

function runAutoFaceNextIfNeeded(point, focusLink, onDone, fromYawHint, options = {}) {
  const finish = () => {
    if (typeof onDone === "function") {
      onDone();
    }
  };
  const force = Boolean(options.force);
  if ((!force && !point?.autoFaceNext) || !focusLink || typeof focusLink.yaw !== "number") {
    finish();
    return;
  }
  if (typeof PanoramaViewer === "undefined") {
    finish();
    return;
  }

  const target = applyWalkOrientation(focusLink.yaw, focusLink.pitch);
  const currentYaw =
    typeof fromYawHint === "number"
      ? fromYawHint
      : typeof PanoramaViewer.getYaw === "function"
        ? PanoramaViewer.getYaw()
        : null;
  const fromYaw = typeof currentYaw === "number" ? currentYaw : null;
  if (fromYaw == null) {
    finish();
    return;
  }
  const delta = yawAbsDeltaDegrees(fromYaw, target.yaw);
  if (delta <= AUTO_FACE_YAW_THRESHOLD_DEG) {
    finish();
    return;
  }

  const turnMs = getTurnAssistDurationMs();
  const holdMs = typeof options.holdMs === "number" ? options.holdMs : 350;
  setPanoramaHint(
    options.hint ||
      `轉彎輔助：下一箭頭相差 ${Math.round(delta)}°，以 ${(turnMs / 1000).toFixed(1)} 秒轉向。`
  );
  // 先停一下讓使用者看到進場面向，再開始旋轉
  pathAutoPlayTurnTimer = setTimeout(() => {
    pathAutoPlayTurnTimer = null;
    PanoramaViewer.lookAt(target.yaw, target.pitch, turnMs, finish);
  }, holdMs);
}

/** 抵達終點目的地：先進場面向，再慢慢轉過去（不要瞬切） */
function clearDestinationFaceTimer() {
  if (pathDestinationFaceTimer) {
    clearTimeout(pathDestinationFaceTimer);
    pathDestinationFaceTimer = null;
  }
  if (typeof PanoramaViewer !== "undefined" && typeof PanoramaViewer.unlockOrientation === "function") {
    PanoramaViewer.unlockOrientation();
  }
}

function runAutoFaceDestinationIfNeeded(destination, onDone, fromYawHint) {
  const finish = () => {
    if (typeof PanoramaViewer !== "undefined" && typeof PanoramaViewer.unlockOrientation === "function") {
      PanoramaViewer.unlockOrientation();
    }
    if (typeof onDone === "function") {
      onDone();
    }
  };
  const yawPitch = getDestinationYawPitch(destination);
  if (!yawPitch || typeof PanoramaViewer === "undefined") {
    finish();
    return;
  }

  const target = applyWalkOrientation(yawPitch.yaw, yawPitch.pitch);
  // 優先用實際視角；進場 hint 僅在尚讀不到 yaw 時使用
  const liveYaw = typeof PanoramaViewer.getYaw === "function" ? PanoramaViewer.getYaw() : null;
  const fromYaw =
    typeof liveYaw === "number"
      ? liveYaw
      : typeof fromYawHint === "number"
        ? fromYawHint
        : null;
  const name = destination.name || "目的地";

  const startTurn = () => {
    if (typeof PanoramaViewer.lockOrientation === "function") {
      PanoramaViewer.lockOrientation();
    }
    const turnMs = getTurnAssistDurationMs();
    const nowYaw = typeof PanoramaViewer.getYaw === "function" ? PanoramaViewer.getYaw() : fromYaw;
    const delta =
      typeof nowYaw === "number" ? yawAbsDeltaDegrees(nowYaw, target.yaw) : 180;
    if (delta <= 3) {
      PanoramaViewer.lookAt(target.yaw, target.pitch, 0, () => {
        setPanoramaHint(`已面向「${name}」。`);
        finish();
      });
      return;
    }
    setPanoramaHint(`抵達「${name}」：相差 ${Math.round(delta)}°，以 ${(turnMs / 1000).toFixed(1)} 秒轉向。`);
    PanoramaViewer.lookAt(target.yaw, target.pitch, turnMs, () => {
      setPanoramaHint(`已面向「${name}」。`);
      finish();
    });
  };

  clearDestinationFaceTimer();
  // 等切景淡入結束（SCENE_FADE_MS≈350）再讀 yaw，避免進場面向蓋掉轉向
  const settleMs =
    typeof PanoramaViewer !== "undefined" && typeof PanoramaViewer.SCENE_FADE_MS === "number"
      ? PanoramaViewer.SCENE_FADE_MS + 120
      : 470;
  pathDestinationFaceTimer = setTimeout(() => {
    pathDestinationFaceTimer = null;
    startTurn();
  }, settleMs);
}

function normalizeLink(link, fromScopeKey = getStorageKey(), nodeFloorMigrate = null) {
  const yaw = link.yaw ?? 0;
  const entryYaw = typeof link.entryYaw === "number" ? link.entryYaw : yaw;
  const oriented =
    typeof PanoramaViewer !== "undefined"
      ? PanoramaViewer.normalizeWalkOrientation(yaw, 0)
      : { yaw, pitch: 0 };
  const entryOriented =
    typeof PanoramaViewer !== "undefined"
      ? PanoramaViewer.normalizeWalkOrientation(entryYaw, 0)
      : { yaw: entryYaw, pitch: 0 };

  let floorChange = null;
  if (link.floorChange === "up" || link.floorChange === "down") {
    floorChange = link.floorChange;
  } else if (!("floorChange" in link)) {
    const auto = getFloorChangeDirection(fromScopeKey, link.targetScopeKey || fromScopeKey);
    if (nodeFloorMigrate?.migrateFromNodeFlags) {
      if (auto === "up" && nodeFloorMigrate.floorIconUp) {
        floorChange = "up";
      } else if (auto === "down" && nodeFloorMigrate.floorIconDown) {
        floorChange = "down";
      }
    } else {
      floorChange = auto;
    }
  }

  const targetScopeKey = link.targetScopeKey || fromScopeKey;
  let distance =
    typeof link.distance === "number" ? link.distance : Number(link.distance);
  if (!Number.isFinite(distance) || distance <= 0) {
    distance = 10;
  }

  return {
    id: link.id || `${Date.now()}_link`,
    targetId: link.targetId,
    targetScopeKey,
    yaw: oriented.yaw,
    pitch: oriented.pitch,
    distance,
    entryYaw: entryOriented.yaw,
    entryPitch: entryOriented.pitch,
    arrowPitch: typeof link.arrowPitch === "number" ? link.arrowPitch : undefined,
    arrowOpacity: typeof link.arrowOpacity === "number" ? link.arrowOpacity : undefined,
    floorChange
  };
}

function normalizePoints(points, scopeKey = getStorageKey()) {
  return points.map((point) => normalizePoint(point, scopeKey));
}

function getPointById(id) {
  return panoramaPoints.find((p) => p.id === id);
}

function loadNodesForCurrentView() {
  const nextKey = getStorageKey();
  // 必須先存回「目前 panoramaPoints 所屬樓層」，不能用已經改掉的 viewState。
  if (loadedScopeKey) {
    commitUnsavedMarkerDrag();
    flushPendingScopeSaves();
  }
  loadedScopeKey = nextKey;
  panoramaPoints = normalizePoints(readPanoramaPoints(nextKey), nextKey);
  renderAll();
}

function parseMarkerPercent(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function getLiveDestination(pointId, destId) {
  const point = getPointById(pointId);
  if (!point || destId == null || destId === "") {
    return { point, dest: null };
  }
  const dest = (point.destinations || []).find((item) => String(item.id) === String(destId)) || null;
  return { point, dest };
}

// 結束編輯會清掉標記再依資料重畫。拖曳時若改到已失效的 dest 物件，
// 畫面上的 left/top 才是使用者看到的位置，這裡以 DOM 為準寫回資料。
function syncMapMarkerPositionsFromDom() {
  const host = mapStage || mapContainer;
  if (!host) {
    return false;
  }
  let changed = false;
  host.querySelectorAll(".marker[data-point-id]").forEach((marker) => {
    const xPercent = parseMarkerPercent(marker.style.left);
    const yPercent = parseMarkerPercent(marker.style.top);
    if (xPercent == null || yPercent == null) {
      return;
    }
    const point = getPointById(marker.dataset.pointId);
    if (!point) {
      return;
    }
    if (marker.classList.contains("marker-destination")) {
      const dest = (point.destinations || []).find(
        (item) => String(item.id) === String(marker.dataset.destId)
      );
      if (!dest) {
        return;
      }
      if (dest.xPercent !== xPercent || dest.yPercent !== yPercent) {
        dest.xPercent = xPercent;
        dest.yPercent = yPercent;
        changed = true;
      }
      return;
    }
    if (point.xPercent !== xPercent || point.yPercent !== yPercent) {
      point.xPercent = xPercent;
      point.yPercent = yPercent;
      changed = true;
    }
  });
  return changed;
}

function commitUnsavedMarkerDrag() {
  const scopeKey = loadedScopeKey;
  const dragged = Boolean(markerDragState?.moved);
  markerDragState = null;
  const fromDom = editMode ? syncMapMarkerPositionsFromDom() : false;
  if ((dragged || fromDom) && scopeKey) {
    savePanoramaPoints(scopeKey);
  }
}

function bindMapClick() {
  mapContainer.onclick = onMapClick;
}

function getMapStageRect() {
  if (mapImage?.naturalWidth) {
    return mapImage.getBoundingClientRect();
  }
  return (mapStage || mapContainer).getBoundingClientRect();
}

function onMapClick(event) {
  if (mapPinchZoom?.wasRecentGesture()) {
    return;
  }
  if (locateStartMode) {
    handleLocateMapClick(event);
    return;
  }
  if (!editMode) {
    return;
  }
  if (
    event.target.closest(
      ".marker, .building-btn, .map-portal-btn, .floor-btn, .toolbar-btn, .toggle-btn, .locate-start-banner"
    )
  ) {
    return;
  }

  const rect = getMapStageRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return;
  }

  const xPercent = Math.min(98, Math.max(2, ((event.clientX - rect.left) / rect.width) * 100));
  const yPercent = Math.min(98, Math.max(2, ((event.clientY - rect.top) / rect.height) * 100));

  if (pendingBuildingDraft && viewState.mode === "campus" && campusMapStyle === "custom") {
    const draft = pendingBuildingDraft;
    clearPendingBuildingDraft();
    void createCampusBuildingAt(draft, xPercent, yPercent);
    return;
  }

  if (pendingDestPlaceMode) {
    openMapDestinationModal(xPercent, yPercent);
    return;
  }

  openNodeModal(xPercent, yPercent);
}

function suggestNodeNameFromUrl(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }
  const withoutQuery = value.split(/[?#]/)[0];
  const segments = withoutQuery.replace(/\\/g, "/").split("/");
  const fileName = segments[segments.length - 1] || "";
  return fileName.replace(/\.[^.]+$/, "").trim();
}

function getPanoramaImageFolder() {
  return getPanoramaImageBaseDir().replace(/^\.\/images\//, "");
}

function normalizeComparableUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

function collectUsedPanoramaUrls() {
  const used = new Set();
  panoramaPoints.forEach((point) => {
    const key = normalizeComparableUrl(point?.url);
    if (key) {
      used.add(key);
    }
  });
  return used;
}

function setNodeModalError(message) {
  if (!nodeModalError) {
    return;
  }
  if (!message) {
    nodeModalError.textContent = "";
    nodeModalError.classList.add("hidden");
    return;
  }
  nodeModalError.textContent = message;
  nodeModalError.classList.remove("hidden");
}

function resetNodePreview() {
  nodePreviewToken += 1;
  nodePreviewReadyUrl = null;
  nodePreview?.classList.remove("node-preview-ok", "node-preview-bad");
  nodePreview?.classList.add("node-preview-empty");
  nodePreviewImage?.classList.add("hidden");
  if (nodePreviewImage) {
    nodePreviewImage.removeAttribute("src");
  }
  if (nodePreviewStatus) {
    nodePreviewStatus.textContent = "輸入檔名或點選縮圖後顯示預覽";
  }
}

function updateNodeUrlHint() {
  if (!nodeUrlHint) {
    return;
  }
  const raw = nodeUrlInput?.value?.trim() || "";
  if (!raw) {
    const baseDir = getPanoramaImageBaseDir();
    nodeUrlHint.textContent = `目前樓層路徑：${baseDir}/（檔名會自動接上）`;
    return;
  }
  nodeUrlHint.textContent = `將儲存為：${normalizePanoramaSrc(raw)}`;
}

function updateNodePreview() {
  const raw = nodeUrlInput?.value?.trim() || "";
  updateNodeUrlHint();
  syncNodeImagePickerSelection();

  if (!raw) {
    resetNodePreview();
    return;
  }

  const url = normalizePanoramaSrc(raw);
  const token = ++nodePreviewToken;
  nodePreviewReadyUrl = null;
  nodePreview?.classList.remove("node-preview-ok", "node-preview-bad", "node-preview-empty");
  if (nodePreviewStatus) {
    nodePreviewStatus.textContent = "檢查圖片中…";
  }

  const probe = new Image();
  probe.onload = () => {
    if (token !== nodePreviewToken) {
      return;
    }
    nodePreviewReadyUrl = url;
    if (nodePreviewImage) {
      nodePreviewImage.src = url;
      nodePreviewImage.classList.remove("hidden");
    }
    nodePreview?.classList.add("node-preview-ok");
    if (nodePreviewStatus) {
      nodePreviewStatus.textContent = "圖片可用";
    }
  };
  probe.onerror = () => {
    if (token !== nodePreviewToken) {
      return;
    }
    nodePreviewReadyUrl = null;
    nodePreviewImage?.classList.add("hidden");
    nodePreview?.classList.add("node-preview-bad");
    if (nodePreviewStatus) {
      nodePreviewStatus.textContent = "找不到圖片，請確認檔名與路徑";
    }
  };
  probe.src = url;
}

function applySelectedPanoramaImage(image, { autoName = true } = {}) {
  if (!image?.name && !image?.url) {
    return;
  }
  const nextValue = image.name || image.url;
  if (nodeUrlInput) {
    nodeUrlInput.value = nextValue;
  }
  if (autoName) {
    const suggested = suggestNodeNameFromUrl(nextValue);
    if (suggested && (!nodeNameInput?.value?.trim() || nodeNameAutoFilled)) {
      if (nodeNameInput) {
        nodeNameInput.value = suggested;
      }
      nodeNameAutoFilled = true;
    }
  }
  setNodeModalError("");
  updateNodePreview();
}

function syncNodeImagePickerSelection() {
  if (!nodeImagePicker) {
    return;
  }
  const currentUrl = normalizeComparableUrl(
    normalizePanoramaSrc(nodeUrlInput?.value?.trim() || "")
  );
  nodeImagePicker.querySelectorAll(".node-image-pick").forEach((btn) => {
    const btnUrl = normalizeComparableUrl(btn.dataset.url || "");
    btn.classList.toggle("is-selected", Boolean(currentUrl) && btnUrl === currentUrl);
    btn.setAttribute("aria-pressed", btn.classList.contains("is-selected") ? "true" : "false");
  });
}

function renderNodeImagePicker(images, { folder, errorMessage } = {}) {
  if (!nodeImagePicker) {
    return;
  }
  nodeImagePicker.innerHTML = "";

  if (errorMessage) {
    const empty = document.createElement("p");
    empty.className = "modal-hint node-image-picker-empty";
    empty.textContent = errorMessage;
    nodeImagePicker.appendChild(empty);
    return;
  }

  if (!images?.length) {
    const empty = document.createElement("p");
    empty.className = "modal-hint node-image-picker-empty";
    empty.textContent = folder
      ? `資料夾「${folder}」目前沒有圖片`
      : "目前樓層沒有可選圖片";
    nodeImagePicker.appendChild(empty);
    return;
  }

  const usedUrls = collectUsedPanoramaUrls();
  const grid = document.createElement("div");
  grid.className = "node-image-picker-grid";

  images.forEach((image) => {
    const used = usedUrls.has(normalizeComparableUrl(image.url));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `node-image-pick${used ? " is-used" : ""}`;
    btn.dataset.url = image.url;
    btn.dataset.name = image.name;
    btn.title = used ? `${image.name}（已有節點使用）` : image.name;
    btn.setAttribute("aria-pressed", "false");

    const thumb = document.createElement("img");
    thumb.className = "node-image-pick-thumb";
    thumb.src = image.url;
    thumb.alt = "";
    thumb.width = 160;
    thumb.height = 90;
    thumb.loading = "lazy";
    thumb.decoding = "async";

    const meta = document.createElement("span");
    meta.className = "node-image-pick-meta";

    const label = document.createElement("span");
    label.className = "node-image-pick-name";
    label.textContent = image.name;

    meta.appendChild(label);
    if (used) {
      const badge = document.createElement("span");
      badge.className = "node-image-pick-badge";
      badge.textContent = "已用";
      meta.appendChild(badge);
    }

    btn.appendChild(thumb);
    btn.appendChild(meta);
    btn.addEventListener("click", () => {
      applySelectedPanoramaImage(image);
    });
    grid.appendChild(btn);
  });

  nodeImagePicker.appendChild(grid);
  syncNodeImagePickerSelection();
}

async function loadNodeImagePicker() {
  if (!nodeImagePicker) {
    return;
  }
  const token = ++nodeImagePickerToken;
  const folder = getPanoramaImageFolder();
  nodeImagePicker.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "modal-hint node-image-picker-empty";
  loading.textContent = `載入「${folder}」縮圖中…`;
  nodeImagePicker.appendChild(loading);

  try {
    const res = await fetch(`/api/panorama-images?folder=${encodeURIComponent(folder)}`, {
      credentials: "same-origin"
    });
    if (token !== nodeImagePickerToken) {
      return;
    }
    if (!res.ok) {
      let message = "無法載入圖片清單";
      try {
        const payload = await res.json();
        if (payload?.message) {
          message = payload.message;
        }
      } catch {
        // ignore parse errors
      }
      renderNodeImagePicker([], { folder, errorMessage: message });
      return;
    }
    const payload = await res.json();
    if (token !== nodeImagePickerToken) {
      return;
    }
    renderNodeImagePicker(payload.images || [], { folder: payload.folder || folder });
  } catch (error) {
    if (token !== nodeImagePickerToken) {
      return;
    }
    console.error("載入全景圖清單失敗:", error);
    renderNodeImagePicker([], {
      folder,
      errorMessage: "無法載入圖片清單，請確認已啟動本機 API（start-server.bat）"
    });
  }
}

function openNodeModal(xPercent, yPercent) {
  if (!nodeModal) {
    return;
  }
  pendingNodePlacement = { xPercent, yPercent };
  nodeNameAutoFilled = false;
  if (nodeNameInput) {
    nodeNameInput.value = "";
  }
  if (nodeUrlInput) {
    nodeUrlInput.value = "";
  }
  setNodeModalError("");
  resetNodePreview();
  updateNodeUrlHint();
  if (nodeModalConfirm) {
    nodeModalConfirm.disabled = false;
    nodeModalConfirm.textContent = "確認新增";
  }
  nodeModal.classList.remove("hidden");
  void loadNodeImagePicker();
  nodeNameInput?.focus();
}

function closeNodeModal() {
  pendingNodePlacement = null;
  nodeNameAutoFilled = false;
  nodePreviewToken += 1;
  nodeImagePickerToken += 1;
  nodePreviewReadyUrl = null;
  nodeModal?.classList.add("hidden");
  setNodeModalError("");
  if (nodeImagePicker) {
    nodeImagePicker.innerHTML = "";
  }
}

async function confirmNodeModal() {
  if (!pendingNodePlacement) {
    return;
  }

  const name = nodeNameInput?.value?.trim() || "";
  const urlInput = nodeUrlInput?.value?.trim() || "";
  if (!name) {
    setNodeModalError("請輸入節點名稱。");
    nodeNameInput?.focus();
    return;
  }
  if (!urlInput) {
    setNodeModalError("請選擇或輸入全景圖。");
    nodeUrlInput?.focus();
    return;
  }

  const url = normalizePanoramaSrc(urlInput);
  if (nodeModalConfirm) {
    nodeModalConfirm.disabled = true;
    nodeModalConfirm.textContent = "檢查圖片…";
  }
  setNodeModalError("");

  const imageOk =
    nodePreviewReadyUrl === url ||
    (await new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = url;
    }));

  if (!imageOk) {
    nodePreviewReadyUrl = null;
    nodePreview?.classList.remove("node-preview-ok", "node-preview-empty");
    nodePreview?.classList.add("node-preview-bad");
    nodePreviewImage?.classList.add("hidden");
    if (nodePreviewStatus) {
      nodePreviewStatus.textContent = "找不到圖片，請確認檔名與路徑";
    }
    setNodeModalError("找不到全景圖，請確認檔名後再試。");
    if (nodeModalConfirm) {
      nodeModalConfirm.disabled = false;
      nodeModalConfirm.textContent = "確認新增";
    }
    return;
  }

  const { xPercent, yPercent } = pendingNodePlacement;
  panoramaPoints.push({
    id: Date.now().toString(),
    name,
    url,
    xPercent,
    yPercent,
    links: []
  });

  closeNodeModal();
  savePanoramaPoints(getStorageKey());
  renderAll();
}

function setupNodeModal() {
  if (!nodeModal) {
    return;
  }

  nodeModalConfirm?.addEventListener("click", () => {
    void confirmNodeModal();
  });
  nodeModalCancel?.addEventListener("click", closeNodeModal);
  nodeModal.addEventListener("click", (event) => {
    if (event.target === nodeModal) {
      closeNodeModal();
    }
  });

  nodeNameInput?.addEventListener("input", () => {
    nodeNameAutoFilled = false;
    setNodeModalError("");
  });
  nodeNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      nodeUrlInput?.focus();
    }
  });

  nodeUrlInput?.addEventListener("input", () => {
    setNodeModalError("");
    const suggested = suggestNodeNameFromUrl(nodeUrlInput.value);
    if (suggested && (!nodeNameInput?.value?.trim() || nodeNameAutoFilled)) {
      if (nodeNameInput) {
        nodeNameInput.value = suggested;
      }
      nodeNameAutoFilled = true;
    }
    updateNodePreview();
  });
  nodeUrlInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmNodeModal();
    }
  });
}

function storageKeyToScopeFile(key) {
  if (!key || !key.startsWith(STORAGE_PREFIX)) {
    return null;
  }
  return `${key.slice(STORAGE_PREFIX.length)}.json`;
}

function readLocalStoragePoints(key) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("節點讀取失敗:", error);
    return [];
  }
}

function readPanoramaPoints(key) {
  if (nodeScopeCache.has(key)) {
    return nodeScopeCache.get(key);
  }
  const fromLocal = readLocalStoragePoints(key);
  if (fromLocal !== null) {
    return fromLocal;
  }
  return migrateLegacyPoints(key);
}

function migrateLegacyPoints(key) {
  if (key !== `${STORAGE_PREFIX}campus`) {
    const legacyBuilding = localStorage.getItem("s_building_panorama_points");
    if (legacyBuilding && key === `${STORAGE_PREFIX}s_1`) {
      try {
        const parsed = JSON.parse(legacyBuilding);
        const points = Array.isArray(parsed) ? parsed : [];
        cacheScopePoints(key, points);
        return points;
      } catch (error) {
        console.error("舊版節點讀取失敗:", error);
      }
    }
    return [];
  }
  return [];
}

function cacheScopePoints(key, points) {
  const snapshot = JSON.parse(JSON.stringify(points));
  nodeScopeCache.set(key, snapshot);
  localStorage.setItem(key, JSON.stringify(snapshot));
}

async function fetchScopeFromFile(key) {
  const filename = storageKeyToScopeFile(key);
  if (!filename) {
    return null;
  }
  try {
    const res = await fetch(`${NODES_DATA_BASE}${filename}`, { cache: "no-store" });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const parsed = await res.json();
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`無法讀取 ${filename}:`, error);
    return null;
  }
}

async function detectNodeFileApi() {
  try {
    const res = await fetch("/api/node-scopes/_health", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    adminRole =
      data.role === "admin" || data.role === "qr" || data.role === "qr_notice" ? data.role : null;
    adminSessionOk = data.admin === true || adminRole === "admin";
    return data.write === true;
  } catch {
    adminRole = null;
    adminSessionOk = false;
    return false;
  }
}

async function persistScopeToFile(key, points, { keepalive = false } = {}) {
  const filename = storageKeyToScopeFile(key);
  if (!filename || !nodesFileWriteEnabled) {
    return false;
  }
  const scope = filename.replace(/\.json$/, "");
  try {
    const res = await adminFetch(`/api/node-scopes/${scope}`, {
      method: "POST",
      body: JSON.stringify(points),
      keepalive
    });
    if (res.status === 401) {
      adminRole = null;
      adminSessionOk = false;
      nodesFileWriteEnabled = false;
      applyAdminUi();
      updateNodeSaveStatus("登入已過期，請重新從管理頁登入。");
      return false;
    }
    if (res.status === 403) {
      updateNodeSaveStatus("寫入被拒絕（CSRF），請重新整理頁面後再試。");
      return false;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    updateNodeSaveStatus();
    return true;
  } catch (error) {
    console.warn(`無法寫入 ${filename}:`, error);
    updateNodeSaveStatus("節點僅存於瀏覽器（請用 start-server.bat 啟動以寫入 data/nodes）");
    return false;
  }
}

function queuePersistScopeToFile(key) {
  if (!nodesFileWriteEnabled) {
    updateNodeSaveStatus();
    return;
  }
  const points = nodeScopeCache.get(key);
  if (!points) {
    return;
  }
  clearTimeout(pendingFileSaves.get(key));
  pendingFileSaves.set(
    key,
    setTimeout(() => {
      persistScopeToFile(key, points);
      pendingFileSaves.delete(key);
    }, 400)
  );
}

// 離開編輯、換樓層或關頁面時，把還在等 debounce 的寫檔立刻送出，
// 否則只留在瀏覽器快取，重新整理後會被 data/nodes 的舊檔蓋回去。
function flushPendingScopeSaves({ keepalive = false } = {}) {
  if (!pendingFileSaves.size) {
    return;
  }
  Array.from(pendingFileSaves.keys()).forEach((key) => {
    clearTimeout(pendingFileSaves.get(key));
    pendingFileSaves.delete(key);
    const points = nodeScopeCache.get(key);
    if (points) {
      void persistScopeToFile(key, points, { keepalive });
    }
  });
}

function setupPendingSaveFlush() {
  window.addEventListener("pagehide", () => {
    flushPendingScopeSaves({ keepalive: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingScopeSaves({ keepalive: true });
    }
  });
}

function updateNodeSaveStatus(message) {
  if (!nodeSaveStatus) {
    return;
  }
  if (!adminSessionOk) {
    nodeSaveStatus.textContent = "";
    nodeSaveStatus.classList.remove("is-warning");
    return;
  }
  if (message) {
    nodeSaveStatus.textContent = message;
    nodeSaveStatus.classList.toggle("is-warning", !nodesFileWriteEnabled);
    return;
  }
  nodeSaveStatus.textContent = nodesFileWriteEnabled
    ? "節點已同步至 data/nodes/（壓縮專案即可分享）"
    : "⚠ 節點只存在這台瀏覽器，重新整理會被 data/nodes 的舊檔蓋回去；請用 start-server.bat 啟動並重新登入管理頁。";
  nodeSaveStatus.classList.toggle("is-warning", !nodesFileWriteEnabled);
}

async function bootstrapNodeData() {
  nodesFileWriteEnabled = await detectNodeFileApi();
  const scopeKeys = getAllScopeKeys();

  await Promise.all(
    scopeKeys.map(async (scopeKey) => {
      const fromFile = await fetchScopeFromFile(scopeKey);
      const fromLocal = readLocalStoragePoints(scopeKey);

      if (fromFile !== null) {
        cacheScopePoints(scopeKey, fromFile);
        return;
      }

      if (fromLocal !== null && fromLocal.length > 0) {
        cacheScopePoints(scopeKey, fromLocal);
        if (nodesFileWriteEnabled) {
          await persistScopeToFile(scopeKey, fromLocal);
        }
        return;
      }

      const legacy = migrateLegacyPoints(scopeKey);
      cacheScopePoints(scopeKey, legacy);
      if (legacy.length > 0 && nodesFileWriteEnabled) {
        await persistScopeToFile(scopeKey, legacy);
      }
    })
  );

  updateNodeSaveStatus();
}

function savePanoramaPoints(key) {
  const scopeKey = loadedScopeKey || key || getStorageKey();
  cacheScopePoints(scopeKey, panoramaPoints);
  queuePersistScopeToFile(scopeKey);
}

function removeLinksToNode(deletedId, deletedScopeKey = getStorageKey()) {
  readPointsByScope().forEach((points, scopeKey) => {
    let dirty = false;
    points.forEach((point) => {
      const nextLinks = (point.links || []).filter(
        (link) =>
          !(
            link.targetId === deletedId &&
            (link.targetScopeKey || scopeKey) === deletedScopeKey
          )
      );
      if (nextLinks.length !== (point.links || []).length) {
        point.links = nextLinks;
        dirty = true;
      }
    });
    if (!dirty) {
      return;
    }
    cacheScopePoints(scopeKey, points);
    queuePersistScopeToFile(scopeKey);
    if (scopeKey === (loadedScopeKey || getStorageKey())) {
      panoramaPoints = points;
    }
  });
}

function addLink(fromId, linkData) {
  const from = getPointById(fromId);
  if (!from) {
    return;
  }

  from.links = (from.links || []).filter(
    (link) =>
      !(link.targetId === linkData.targetId && (link.targetScopeKey || getStorageKey()) === linkData.targetScopeKey)
  );
  from.links.push(
    normalizeLink({
      id: `${Date.now()}_${linkData.targetId}`,
      ...linkData
    })
  );

  savePanoramaPoints(getStorageKey());
  renderAll();
}

function removeLink(fromId, linkId) {
  const from = getPointById(fromId);
  if (!from) {
    return;
  }
  from.links = (from.links || []).filter((link) => link.id !== linkId);
  savePanoramaPoints(getStorageKey());
  renderAll();
}

function addDestination(pointId, destData) {
  const point = getPointById(pointId);
  if (!point) {
    return null;
  }
  point.destinations = point.destinations || [];
  const dest = normalizeDestination(destData, point, point.destinations.length);
  point.destinations.push(dest);
  savePanoramaPoints(getStorageKey());
  renderAll();
  return dest;
}

function removeDestination(pointId, destId) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  point.destinations = (point.destinations || []).filter((dest) => dest.id !== destId);
  savePanoramaPoints(getStorageKey());
  renderAll();
}

function updateDestinationOrientation(pointId, destId, yaw, pitch) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  const dest = (point.destinations || []).find((item) => item.id === destId);
  if (!dest) {
    return;
  }
  const oriented =
    typeof PanoramaViewer !== "undefined"
      ? PanoramaViewer.normalizeWalkOrientation(yaw, pitch ?? 0)
      : { yaw, pitch: pitch ?? 0 };
  dest.yaw = oriented.yaw;
  dest.pitch = oriented.pitch;
  savePanoramaPoints(getStorageKey());
  renderAll();
}

function buildDestinationsForPoint(point) {
  return (point.destinations || [])
    .filter((dest) => hasDestinationYaw(dest))
    .map((dest) => ({
      id: dest.id,
      destId: dest.id,
      yaw: dest.yaw,
      pitch: dest.pitch,
      text: dest.isElevator ? `電梯 · ${dest.name}` : dest.name,
      isElevator: Boolean(dest.isElevator)
    }));
}

function getAllDestinationsGlobal() {
  return getAllPointsGlobal().flatMap((point) =>
    (point.destinations || []).map((dest) => ({
      ...dest,
      pointId: point.id,
      pointName: point.name,
      scopeKey: point.scopeKey,
      scopeName: getScopeDisplayName(point.scopeKey),
      kind: "destination"
    }))
  );
}

function getAllSearchableLocationItems() {
  const nodeItems = getAllPointsGlobal()
    .filter((point) => String(point.name || "").trim())
    .map((point) => ({
      id: `node:${point.scopeKey}::${point.id}`,
      name: String(point.name).trim(),
      pointId: point.id,
      pointName: point.name,
      scopeKey: point.scopeKey,
      scopeName: getScopeDisplayName(point.scopeKey),
      kind: "node"
    }));
  const destinationItems = getAllDestinationsGlobal().map((dest) => ({
    ...dest,
    id: dest.id || `dest:${dest.scopeKey}::${dest.pointId}::${dest.name}`
  }));
  return [...nodeItems, ...destinationItems];
}

function groupDestinationsByName(destinations) {
  const groups = new Map();
  destinations.forEach((item) => {
    const key = item.name.trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { name: item.name.trim(), items: [] });
    }
    groups.get(key).items.push(item);
  });
  return Array.from(groups.values());
}

function getUniqueDestinationNames() {
  const names = new Set();
  getAllDestinationsGlobal().forEach((dest) => {
    if (dest.name.trim()) {
      names.add(dest.name.trim());
    }
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function collectNodesFromDestinations(destinations, predicate) {
  const refs = new Map();
  destinations.forEach((dest) => {
    if (!predicate(dest)) {
      return;
    }
    const ref = encodeNodeRef(dest.scopeKey, dest.pointId);
    if (!refs.has(ref)) {
      const point = getPointByRef(dest.pointId, dest.scopeKey);
      if (point) {
        refs.set(ref, { ...point, scopeKey: dest.scopeKey });
      }
    }
  });
  return [...refs.values()];
}

function getNodesForNavigationQuery(query) {
  const { nameQuery, scopeFilter } = parseScopedQuery(query);
  if (!nameQuery) {
    return { nodes: [], matchedBy: null };
  }

  const allPoints = getAllPointsGlobal();
  const exactNodes = allPoints.filter(
    (point) =>
      point.name.toLowerCase() === nameQuery && matchesScopeFilter(point.scopeKey, scopeFilter)
  );
  if (exactNodes.length > 0) {
    return { nodes: exactNodes, matchedBy: "node" };
  }

  const allDestinations = getAllDestinationsGlobal();
  const exactDestNodes = collectNodesFromDestinations(
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

function resolveReferenceNodeRef(query) {
  const resolved = getNodesForNavigationQuery(query);
  if (resolved.nodes.length === 0) {
    return null;
  }
  const node = resolved.nodes[0];
  return { scopeKey: node.scopeKey || getStorageKey(), pointId: node.id };
}

function resolveDestinationAtPoint(point, query) {
  const q = query.trim().toLowerCase();
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

/** 算路終點目的地：名稱對到，或終點節點僅一個有朝向的目的地 */
function resolveEndDestinationForPath(point, endQuery) {
  const byQuery = resolveDestinationAtPoint(point, endQuery);
  if (byQuery && hasDestinationYaw(byQuery)) {
    return byQuery;
  }
  if (byQuery) {
    return byQuery;
  }
  const withYaw = (point?.destinations || []).filter((d) => hasDestinationYaw(d));
  if (withYaw.length === 1) {
    return withYaw[0];
  }
  return null;
}

/** 路徑終點要面向的目的地：先 id，再名稱，再「終點節點僅一個有朝向的目的地」 */
function resolvePathEndDestinationToFace(point, options = {}) {
  if (!point) {
    return null;
  }
  const destinations = point.destinations || [];
  const byId = options.focusDestinationId
    ? destinations.find((d) => d.id === options.focusDestinationId)
    : null;
  if (byId && hasDestinationYaw(byId)) {
    return byId;
  }

  const pathEndStep = computedPath?.steps?.[computedPath.steps.length - 1];
  const isPathEnd =
    pathEndStep &&
    isSameNodeRef(
      pathEndStep.scopeKey,
      pathEndStep.pointId,
      options.scopeKey || getStorageKey(),
      point.id
    );
  if (!isPathEnd) {
    return null;
  }

  if (computedPath?.endDestinationId) {
    const byPathId = destinations.find((d) => d.id === computedPath.endDestinationId);
    if (byPathId && hasDestinationYaw(byPathId)) {
      return byPathId;
    }
  }

  const endName = String(computedPath?.endDestinationName || "").trim().toLowerCase();
  if (endName) {
    const byName = destinations.find((d) => d.name.trim().toLowerCase() === endName);
    if (byName && hasDestinationYaw(byName)) {
      return byName;
    }
  }

  const withYaw = destinations.filter((d) => hasDestinationYaw(d));
  if (withYaw.length === 1) {
    return withYaw[0];
  }
  return null;
}

function pickNearestDestinationItem(items, referenceNodeRef) {
  if (!items.length) {
    return null;
  }
  if (!referenceNodeRef || items.length === 1) {
    return items[0];
  }

  let best = null;
  items.forEach((item) => {
    const path = findShortestPath(
      referenceNodeRef.scopeKey,
      referenceNodeRef.pointId,
      item.scopeKey,
      item.pointId
    );
    if (!path) {
      return;
    }
    if (!best || path.totalDistance < best.distance) {
      best = { item, distance: path.totalDistance };
    }
  });
  return best?.item || items[0];
}

function resolveBestPathEndpoints(startQuery, endQuery) {
  const startCandidates = getNodesForNavigationQuery(startQuery);
  const endCandidates = getNodesForNavigationQuery(endQuery);

  if (startCandidates.nodes.length === 0 || endCandidates.nodes.length === 0) {
    return null;
  }

  let best = null;
  startCandidates.nodes.forEach((start) => {
    endCandidates.nodes.forEach((end) => {
      const result = findShortestPath(start.scopeKey, start.id, end.scopeKey, end.id);
      if (!result) {
        return;
      }
      if (!best || result.totalDistance < best.result.totalDistance) {
        const endDestination = resolveEndDestinationForPath(end, endQuery);
        best = {
          start,
          end,
          result,
          startMatchedBy: startCandidates.matchedBy,
          endMatchedBy: endCandidates.matchedBy,
          endDestination
        };
      }
    });
  });

  return best;
}

/** 起點鎖死為指定節點，只對終點查詢做候選比對（多段停靠串接用） */
function resolveBestPathFromNode(startNode, endQuery) {
  if (!startNode?.id) {
    return null;
  }
  const startScopeKey = startNode.scopeKey || getStorageKey();
  const endCandidates = getNodesForNavigationQuery(endQuery);
  if (endCandidates.nodes.length === 0) {
    return null;
  }

  let best = null;
  endCandidates.nodes.forEach((end) => {
    const result = findShortestPath(startScopeKey, startNode.id, end.scopeKey, end.id);
    if (!result) {
      return;
    }
    if (!best || result.totalDistance < best.result.totalDistance) {
      best = {
        start: startNode,
        end,
        result,
        startMatchedBy: "fixed",
        endMatchedBy: endCandidates.matchedBy,
        endDestination: resolveEndDestinationForPath(end, endQuery)
      };
    }
  });

  return best;
}

const PATH_WAYPOINT_SOFT_MAX = 20;
let pathWaypointIdSeq = 0;

function appendPathSteps(existing, next) {
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

function resolveOrderedPathEndpoints(queries, waypointStayConfigs = []) {
  const cleaned = (queries || []).map((q) => String(q || "").trim()).filter(Boolean);
  if (cleaned.length < 2) {
    return null;
  }

  let combinedSteps = [];
  let totalDistance = 0;
  let firstSegment = null;
  let lastSegment = null;
  let fixedStart = null;
  const waypointStops = [];

  for (let i = 0; i < cleaned.length - 1; i += 1) {
    // 下一段必須從上一段實際抵達的節點出發，避免同名停靠被重解析成另一點而倒退
    const segment = fixedStart
      ? resolveBestPathFromNode(fixedStart, cleaned[i + 1])
      : resolveBestPathEndpoints(cleaned[i], cleaned[i + 1]);
    if (!segment) {
      return {
        error: true,
        fromQuery: cleaned[i],
        toQuery: cleaned[i + 1]
      };
    }
    if (!firstSegment) {
      firstSegment = segment;
    }
    lastSegment = segment;
    combinedSteps = appendPathSteps(combinedSteps, segment.result.steps);
    totalDistance += segment.result.totalDistance;
    fixedStart = segment.end;
    if (i < cleaned.length - 2 && combinedSteps.length) {
      const stay = waypointStayConfigs[i] || {};
      waypointStops.push({
        query: cleaned[i + 1],
        stepIndex: combinedSteps.length - 1,
        waitMode: stay.waitMode === "button" ? "button" : "seconds",
        seconds: clampWaypointStaySeconds(stay.seconds)
      });
    }
  }

  return {
    start: firstSegment.start,
    end: lastSegment.end,
    result: {
      steps: combinedSteps,
      totalDistance
    },
    endDestination: lastSegment.endDestination,
    waypointQueries: cleaned.slice(1, -1),
    waypointStops
  };
}

function getPathWaypointStops() {
  return Array.from(document.querySelectorAll("#pathWaypointsList .path-waypoint-row"))
    .map((row) => {
      const query = row.querySelector(".path-waypoint-input")?.value.trim() || "";
      const waitMode = row.querySelector(".path-waypoint-wait-mode")?.value || "seconds";
      const seconds = clampWaypointStaySeconds(row.querySelector(".path-waypoint-seconds")?.value);
      return { query, waitMode: waitMode === "button" ? "button" : "seconds", seconds };
    })
    .filter((stop) => stop.query);
}

function getPathWaypointQueries() {
  return getPathWaypointStops().map((stop) => stop.query);
}

function syncPathWaypointStayUi(row) {
  const mode = row.querySelector(".path-waypoint-wait-mode")?.value;
  const secondsWrap = row.querySelector(".path-waypoint-seconds-wrap");
  secondsWrap?.classList.toggle("hidden", mode === "button");
}

function clearPathWaypoints() {
  const list = document.getElementById("pathWaypointsList");
  if (list) {
    list.innerHTML = "";
  }
}

function resetComputedPathState() {
  if (pathResult?.textContent) {
    pathResult.textContent = "";
  }
  clearPathErrorState();
  clearOutdoorPathResult();
  computedPath = null;
  pathGuidanceActive = false;
  pathGoBtn?.classList.add("hidden");
  pathGoBtn?.classList.remove("path-go-ready");
  pathCancelBtn?.classList.add("hidden");
  pathAutoControls?.classList.add("hidden");
  document.getElementById("pathShareBtn")?.classList.add("hidden");
  setVisitorPathGuide("");
  refreshPanoramaMinimapIfOpen();
}

function createPathWaypointRow(value = "", stay = {}) {
  const list = document.getElementById("pathWaypointsList");
  if (!list) {
    return null;
  }
  const count = list.querySelectorAll(".path-waypoint-row").length;
  if (count >= PATH_WAYPOINT_SOFT_MAX) {
    alert(`最多 ${PATH_WAYPOINT_SOFT_MAX} 個中途停靠。`);
    return null;
  }

  const waitMode = stay.waitMode === "button" ? "button" : "seconds";
  const seconds = clampWaypointStaySeconds(stay.seconds ?? DEFAULT_WAYPOINT_STAY_SECONDS);
  const row = document.createElement("div");
  row.className = "path-waypoint-row";
  const inputId = `pathWaypoint_${++pathWaypointIdSeq}`;
  row.innerHTML = `
    <div class="path-waypoint-main">
      <input
        id="${inputId}"
        class="modal-input path-waypoint-input"
        type="search"
        list="pathSuggestions"
        placeholder="輸入停靠點名稱"
        autocomplete="off"
        value="${escapeHtmlAttr(value)}"
      />
      <button type="button" class="secondary-btn path-waypoint-remove-btn" aria-label="移除此停靠">移除</button>
    </div>
    <div class="path-waypoint-stay">
      <label class="path-waypoint-stay-label">
        抵達後
        <select class="modal-input path-waypoint-wait-mode">
          <option value="seconds"${waitMode === "seconds" ? " selected" : ""}>停留秒數</option>
          <option value="button"${waitMode === "button" ? " selected" : ""}>按按鈕繼續</option>
        </select>
      </label>
      <label class="path-waypoint-seconds-wrap">
        <input
          class="modal-input path-waypoint-seconds"
          type="number"
          min="1"
          max="300"
          step="1"
          value="${seconds}"
        />
        <span>秒</span>
      </label>
    </div>
  `;

  const input = row.querySelector(".path-waypoint-input");
  input?.addEventListener("input", resetComputedPathState);
  row.querySelector(".path-waypoint-wait-mode")?.addEventListener("change", () => {
    syncPathWaypointStayUi(row);
    resetComputedPathState();
  });
  row.querySelector(".path-waypoint-seconds")?.addEventListener("input", resetComputedPathState);
  row.querySelector(".path-waypoint-remove-btn")?.addEventListener("click", () => {
    row.remove();
    resetComputedPathState();
  });
  syncPathWaypointStayUi(row);
  list.appendChild(row);
  input?.focus();
  return row;
}

function setupPathWaypointsUi() {
  const addBtn = document.getElementById("pathAddWaypointBtn");
  addBtn?.addEventListener("click", () => {
    createPathWaypointRow();
  });
}

function getPathProgressHint() {
  if (pathAutoPlayActive && pathAutoPlayStep > 0) {
    return Math.max(0, pathAutoPlayStep - 1);
  }
  return -1;
}

function getNextPathFocusLink(point, scopeKey = getStorageKey(), options = {}) {
  if (!point || !computedPath?.steps?.length) {
    return null;
  }
  const pathStepIndex = findPathStepIndex(computedPath.steps, scopeKey, point.id, {
    preferAfter: getPathProgressHint(),
    prevScopeKey: options.prevScopeKey,
    prevPointId: options.prevPointId
  });
  if (pathStepIndex < 0) {
    return null;
  }
  const nextStep = computedPath.steps[pathStepIndex + 1];
  if (!nextStep) {
    return null;
  }
  return (
    (point.links || []).find(
      (l) =>
        l.targetId === nextStep.pointId &&
        (l.targetScopeKey || scopeKey) === nextStep.scopeKey
    ) || null
  );
}

function getNextPathElevatorStep(point, scopeKey = getStorageKey(), options = {}) {
  if (!point || !computedPath?.steps?.length) {
    return null;
  }
  const pathStepIndex = findPathStepIndex(computedPath.steps, scopeKey, point.id, {
    preferAfter: getPathProgressHint(),
    prevScopeKey: options.prevScopeKey,
    prevPointId: options.prevPointId
  });
  if (pathStepIndex < 0) {
    return null;
  }
  const nextStep = computedPath.steps[pathStepIndex + 1];
  if (!nextStep || nextStep.arriveVia !== "elevator") {
    return null;
  }
  return nextStep;
}

function isPathElevatorHopTo(fromScopeKey, fromPointId, toScopeKey, toPointId) {
  if (!computedPath?.steps?.length || !fromPointId || !toPointId) {
    return false;
  }
  const fromPoint = getPointByRef(fromPointId, fromScopeKey);
  const next = getNextPathElevatorStep(fromPoint, fromScopeKey);
  return Boolean(
    next &&
      next.pointId === toPointId &&
      next.scopeKey === (toScopeKey || fromScopeKey)
  );
}

/**
 * 節點上的電梯目的地（有 yaw）；可與對端節點同名配對
 */
function resolveElevatorDestinationOnPoint(point, peerPoint = null) {
  const elevDests = (point?.destinations || []).filter(
    (d) => d.isElevator && hasDestinationYaw(d)
  );
  if (!elevDests.length) {
    return null;
  }
  if (peerPoint) {
    const peerNames = new Set(
      (peerPoint.destinations || [])
        .filter((d) => d.isElevator)
        .map((d) => normalizeElevatorDestName(d.name))
        .filter(Boolean)
    );
    const matched = elevDests.find((d) =>
      peerNames.has(normalizeElevatorDestName(d.name))
    );
    if (matched) {
      return matched;
    }
  }
  return elevDests[0];
}

/**
 * 電梯進站：優先面向與上一站同名的電梯目的地（有 yaw）
 */
function resolveElevatorArrivalDestination(point, options = {}) {
  if (!point || !computedPath?.steps?.length) {
    return null;
  }
  const scopeKey = options.scopeKey || getStorageKey();
  const pathStepIndex = findPathStepIndex(computedPath.steps, scopeKey, point.id, {
    preferAfter: getPathProgressHint(),
    prevScopeKey: options.prevScopeKey || options.viaLinkFromScopeKey,
    prevPointId: options.prevPointId || options.viaLinkFromId
  });
  if (pathStepIndex < 0 || computedPath.steps[pathStepIndex]?.arriveVia !== "elevator") {
    return null;
  }
  const prevStep = pathStepIndex > 0 ? computedPath.steps[pathStepIndex - 1] : null;
  const prevPoint = prevStep ? getPointByRef(prevStep.pointId, prevStep.scopeKey) : null;
  return resolveElevatorDestinationOnPoint(point, prevPoint);
}

/** 進電梯前：先轉向本站電梯目的地，再執行 proceed（overlay／切景） */
function runElevatorDepartureFaceThen(fromPoint, toPoint, proceed) {
  const finish = () => {
    if (typeof proceed === "function") {
      proceed();
    }
  };
  const elev = resolveElevatorDestinationOnPoint(fromPoint, toPoint);
  if (!elev || typeof PanoramaViewer === "undefined") {
    finish();
    return;
  }
  const target = applyWalkOrientation(elev.yaw, elev.pitch);
  const fromYaw =
    typeof PanoramaViewer.getYaw === "function" ? PanoramaViewer.getYaw() : null;
  if (typeof fromYaw === "number" && yawAbsDeltaDegrees(fromYaw, target.yaw) <= AUTO_FACE_YAW_THRESHOLD_DEG) {
    finish();
    return;
  }
  const turnMs = getTurnAssistDurationMs();
  setPanoramaHint(`進電梯前：轉向「${elev.name}」…`);
  pathAutoPlayTurnTimer = setTimeout(() => {
    pathAutoPlayTurnTimer = null;
    PanoramaViewer.lookAt(target.yaw, target.pitch, turnMs, finish);
  }, 200);
}

function formatWaypointStayLabel(stop) {
  if (!stop) {
    return "";
  }
  if (stop.waitMode === "button") {
    return "按按鈕繼續";
  }
  return `停 ${clampWaypointStaySeconds(stop.seconds)} 秒`;
}

function getWaypointProgressLabel(stop) {
  const stops = computedPath?.waypointStops || [];
  if (!stop || !stops.length) {
    return stop?.query ? `停靠：「${stop.query}」` : "停靠";
  }
  const index = stops.findIndex(
    (item) => item.stepIndex === stop.stepIndex && item.query === stop.query
  );
  const ordinal = index >= 0 ? index + 1 : 1;
  return `停靠 ${ordinal}／${stops.length}：${stop.query}`;
}

function getWaypointStopIndexMap(stops = computedPath?.waypointStops) {
  const map = new Map();
  (stops || []).forEach((stop, index) => {
    if (typeof stop?.stepIndex === "number") {
      map.set(stop.stepIndex, { ...stop, ordinal: index + 1, total: stops.length });
    }
  });
  return map;
}

function buildNavigationShareUrl(options = {}) {
  return buildPathShareUrl(options);
}

async function copyTextToClipboard(text) {
  return copyShareText(text);
}

function buildCurrentPanoSpotUrl(point = null, scopeKey = getStorageKey(), view = null) {
  const target = point || getPointById(currentPanoramaPointId);
  if (!target?.id) {
    return "";
  }
  const parsed = parseScopeKey(scopeKey);
  const scopeFile =
    parsed?.mode === "building" ? `${parsed.buildingId}_${parsed.floorId}` : "campus";
  const yaw =
    typeof view?.yaw === "number" && Number.isFinite(view.yaw)
      ? view.yaw
      : typeof PanoramaViewer?.getYaw === "function"
        ? PanoramaViewer.getYaw()
        : undefined;
  const pitch =
    typeof view?.pitch === "number" && Number.isFinite(view.pitch)
      ? view.pitch
      : typeof PanoramaViewer?.getPitch === "function"
        ? PanoramaViewer.getPitch()
        : undefined;
  return buildPanoSpotUrl({
    scope: scopeFile,
    nodeId: target.id,
    mode: "visitor",
    yaw,
    pitch
  });
}

function stripPanoParamsFromUrl() {
  const params = new URLSearchParams(location.search);
  if (
    params.get("pano") !== "1" &&
    !params.get("scope") &&
    !params.get("node") &&
    !params.get("yaw") &&
    !params.get("pitch")
  ) {
    return;
  }
  params.delete("pano");
  params.delete("scope");
  params.delete("node");
  params.delete("yaw");
  params.delete("pitch");
  const qs = params.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash || ""}`;
  history.replaceState(null, "", next);
}

async function applyIncomingPanoSpotQuery(params) {
  const scopeRaw = params.get("scope")?.trim() || "";
  const nodeId = params.get("node")?.trim() || "";
  if (!scopeRaw || !nodeId) {
    alert("據點連結不完整（需要 scope 與 node）。");
    stripPanoParamsFromUrl();
    return;
  }
  const scopeKey = scopeRaw.startsWith(STORAGE_PREFIX)
    ? scopeRaw
    : `${STORAGE_PREFIX}${scopeRaw}`;
  if (!switchToScope(scopeKey)) {
    alert("找不到據點樓層，請確認連結是否正確。");
    stripPanoParamsFromUrl();
    return;
  }
  const point = getPointById(nodeId);
  if (!point) {
    alert("找不到據點節點，請確認連結是否正確。");
    stripPanoParamsFromUrl();
    return;
  }
  if (pathFrom) {
    pathFrom.value = String(point.name || "").trim();
  }
  const yawRaw = Number(params.get("yaw"));
  const pitchRaw = Number(params.get("pitch"));
  const openOpts = {};
  if (Number.isFinite(yawRaw)) {
    openOpts.initialYaw = yawRaw;
  }
  if (Number.isFinite(pitchRaw)) {
    openOpts.initialPitch = pitchRaw;
  }
  setSidePanelOpen(true);
  setPanoramaHint(
    Number.isFinite(yawRaw)
      ? `已從據點連結開啟「${point.name}」（面向 ${Math.round(yawRaw)}°），並設為路徑起點。`
      : `已從據點連結開啟「${point.name}」，並設為路徑起點。`
  );
  openPanoramaViewer(point, {
    ...openOpts,
    forceInitialView: Number.isFinite(yawRaw),
    skipCenterPathNext: true,
    skipAutoFace: true
  });
  stripPanoParamsFromUrl();
}

function setPathStartFromCurrentPanorama() {
  const point = getPointById(currentPanoramaPointId);
  if (!point) {
    setPanoramaHint("目前沒有開啟的環景節點，無法設為起點。");
    return;
  }
  const name = String(point.name || "").trim();
  if (!name) {
    setPanoramaHint("此節點沒有名稱，無法設為起點。");
    return;
  }
  if (pathFrom) {
    pathFrom.value = name;
  }
  setSidePanelOpen(true);
  setPanoramaHint(`已將「${name}」設為路徑起點。`);
}

async function copyPanoSpotLinkForPoint(point, scopeKey = getStorageKey()) {
  const url = buildCurrentPanoSpotUrl(point, scopeKey);
  if (!url) {
    updateNodeSaveStatus("無法產生據點連結。");
    return;
  }
  const ok = await copyTextToClipboard(url);
  updateNodeSaveStatus(ok ? `已複製據點連結：${point.name}` : `複製失敗，請手動複製：${url}`);
}

function formatPathStepLabel(step, previousStep) {
  const point = getPointByRef(step.pointId, step.scopeKey);
  const label = point?.name || step.pointId;
  let text =
    !previousStep || step.scopeKey !== previousStep.scopeKey
      ? `${label}（${getScopeDisplayName(step.scopeKey)}）`
      : label;
  if (step.arriveVia === "elevator") {
    text = `${text}·電梯`;
  } else if (step.arriveVia === "stairs") {
    text = `${text}·樓梯`;
  }
  return text;
}

function formatPathSteps(steps) {
  return steps
    .map((step, index) => formatPathStepLabel(step, index > 0 ? steps[index - 1] : null))
    .join(" → ");
}

function jumpToPathStep(stepIndex) {
  if (!computedPath?.steps?.[stepIndex]) {
    return;
  }
  if (typeof stopAutoPathPlaybackHandler === "function") {
    stopAutoPathPlaybackHandler();
  }
  pathGuidanceActive = true;

  const step = computedPath.steps[stepIndex];
  const point = getPointByRef(step.pointId, step.scopeKey);
  if (!point) {
    alert("找不到該節點資料。");
    return;
  }

  const prevStep = stepIndex > 0 ? computedPath.steps[stepIndex - 1] : null;
  const nextStep =
    stepIndex < computedPath.steps.length - 1 ? computedPath.steps[stepIndex + 1] : null;
  const focusLink = nextStep
    ? (point.links || []).find(
        (l) =>
          l.targetId === nextStep.pointId &&
          (l.targetScopeKey || step.scopeKey) === nextStep.scopeKey
      )
    : null;
  const isLastStep = stepIndex === computedPath.steps.length - 1;
  const openOptions = {
    viaLinkFromId: prevStep?.pointId,
    viaLinkFromScopeKey: prevStep?.scopeKey,
    followComputedPath: true
  };
  if (shouldCenterPathNextArrow()) {
    openOptions.focusLinkId = focusLink?.id;
  }
  if (isLastStep && computedPath.endDestinationId) {
    openOptions.focusDestinationId = computedPath.endDestinationId;
  }

  navigateToPoint(step.pointId, step.scopeKey, openOptions);
  setPanoramaHint(`已跳至路徑節點「${point.name}」。`);
}

function renderComputedPathResult({
  prefix = "路徑：",
  steps,
  totalDistance,
  extraText = "",
  waypointStops = computedPath?.waypointStops
} = {}) {
  if (!pathResult) {
    return;
  }
  pathResult.replaceChildren();

  const line = document.createElement("span");
  line.className = "path-result-line";
  if (prefix) {
    line.appendChild(document.createTextNode(prefix));
  }

  const waypointByStep = getWaypointStopIndexMap(waypointStops);

  (steps || []).forEach((step, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "path-step-sep";
      sep.textContent = " → ";
      line.appendChild(sep);
    }
    const label = formatPathStepLabel(step, index > 0 ? steps[index - 1] : null);
    const waypoint = waypointByStep.get(index);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "path-step-link";
    if (waypoint) {
      btn.classList.add("path-step-link-waypoint");
      const stay = formatWaypointStayLabel(waypoint);
      btn.textContent = `${label}（停 · ${stay}）`;
      btn.title = `停靠 ${waypoint.ordinal}／${waypoint.total}：${label}（${stay}）`;
    } else {
      btn.textContent = label;
      btn.title = `前往「${label}」`;
    }
    btn.addEventListener("click", () => jumpToPathStep(index));
    line.appendChild(btn);
  });

  if (typeof totalDistance === "number") {
    line.appendChild(document.createTextNode(`（總距離約 ${totalDistance} 公尺）`));
  }
  if (extraText) {
    line.appendChild(document.createTextNode(extraText));
  }

  pathResult.appendChild(line);
}

function collectPanoramaUrlsForPoints(points) {
  const urls = [];
  points.forEach((point) => {
    if (point?.url) {
      urls.push(point.url);
    }
  });
  return urls;
}

/** 視野前方優先：目前 yaw ± 此角度內的連線先預載，其餘周圍連線接著預載 */
const FRONT_PRELOAD_HALF_ANGLE = 90;

function yawDeltaAbs(a, b) {
  let delta = Math.abs(Number(a) - Number(b)) % 360;
  if (delta > 180) {
    delta = 360 - delta;
  }
  return delta;
}

/** 回傳相鄰節點：前方熱點在前，其餘周圍連線在後（全部都會預載） */
function getNeighborPanoramaPointsOrdered(point, viewYaw, halfAngle = FRONT_PRELOAD_HALF_ANGLE) {
  if (!point) {
    return [];
  }
  const front = [];
  const rest = [];
  const seen = new Set();
  const hasYaw = typeof viewYaw === "number" && Number.isFinite(viewYaw);

  (point.links || []).forEach((link) => {
    const target = getPointByRef(link.targetId, link.targetScopeKey || getStorageKey());
    if (!target?.url) {
      return;
    }
    const key = `${target.scopeKey || getStorageKey()}::${target.id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const linkHasYaw = typeof link.yaw === "number" && Number.isFinite(link.yaw);
    const isFront =
      hasYaw && linkHasYaw && yawDeltaAbs(link.yaw, viewYaw) <= halfAngle;
    // 無目前 yaw、或連線無 yaw：放入優先佇列，避免漏載或過晚才載
    if (isFront || !hasYaw || !linkHasYaw) {
      front.push(target);
    } else {
      rest.push(target);
    }
  });

  return front.concat(rest);
}

function preloadRelatedPanoramas(point, viewYaw) {
  if (typeof PanoramaViewer === "undefined" || !point) {
    return;
  }
  // 自動播放進行中略過周圍連線，避免與路徑前方預載搶頻寬
  if (pathAutoPlayActive && !pathAutoPlayPaused) {
    return;
  }
  const yaw =
    typeof viewYaw === "number" && Number.isFinite(viewYaw)
      ? viewYaw
      : typeof PanoramaViewer.getYaw === "function"
        ? PanoramaViewer.getYaw()
        : null;
  PanoramaViewer.preloadPanoramaSrcs(
    collectPanoramaUrlsForPoints(getNeighborPanoramaPointsOrdered(point, yaw))
  );
}

/** 暫停／結束自動播放後，對目前站補周圍預載 */
function preloadNeighborsForCurrentPoint() {
  const point = getPointById(currentPanoramaPointId);
  if (!point) {
    return;
  }
  preloadRelatedPanoramas(point);
}

/** 路徑環景預載：只載入從 fromStepIndex 起算 aheadCount 站（預設 3），避免一次抓整條路徑 */
const PATH_PANORAMA_PRELOAD_AHEAD = 3;

function preloadPathPanoramas(path, fromStepIndex = 0, aheadCount = PATH_PANORAMA_PRELOAD_AHEAD) {
  if (typeof PanoramaViewer === "undefined" || !path?.steps?.length) {
    return;
  }
  const start = Math.max(0, fromStepIndex);
  const end = Math.min(path.steps.length, start + Math.max(1, aheadCount));
  const points = path.steps
    .slice(start, end)
    .map((step) => getPointByRef(step.pointId, step.scopeKey))
    .filter(Boolean);
  PanoramaViewer.preloadPanoramaSrcs(collectPanoramaUrlsForPoints(points));
}

function isCurrentLocationQuery(query) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return false;
  }
  return (
    trimmed === CURRENT_LOCATION_LABEL ||
    trimmed === "目前位置" ||
    trimmed === "📍 目前位置" ||
    trimmed.replace(/^📍\s*/, "") === "目前位置"
  );
}

function hasArrivedAtCampus() {
  return sessionStorage.getItem(CAMPUS_ARRIVED_KEY) === "true";
}

function markArrivedAtCampus() {
  sessionStorage.setItem(CAMPUS_ARRIVED_KEY, "true");
  outdoorNavigationActive = false;
  setOutdoorNavigationVisible(false);
  if (typeof GoogleMapsNav !== "undefined") {
    GoogleMapsNav.stopArrivalWatch();
  }
  showCampusMap();
}

function setOutdoorNavigationVisible(visible) {
  outdoorNavigationActive = visible;
  outdoorNavPanel?.classList.toggle("hidden", !visible);
  mapContainer?.classList.toggle("hidden", visible);
  document.getElementById("campusMapStyleSwitch")?.classList.toggle("hidden", visible || viewState.mode !== "campus");
  if (visible) {
    hideCampusSatelliteView();
  } else if (viewState.mode === "campus") {
    applyCampusMapStyleView();
  }
  if (visible && typeof GoogleMapsNav !== "undefined" && GoogleMapsNav.isReady() && googleMap) {
    GoogleMapsNav.ensureMap(googleMap);
    if (window.google?.maps && GoogleMapsNav.map) {
      google.maps.event.trigger(GoogleMapsNav.map, "resize");
    }
  }
}

function updateOutdoorNavStatus(message) {
  if (outdoorNavStatus) {
    outdoorNavStatus.textContent = message;
  }
}

function resolveIndoorEntryNode() {
  const settingsEntry = NavArrowSettings.load()?.indoorEntry;
  const settingsQuery = String(settingsEntry?.query || "").trim();
  if (settingsQuery) {
    const resolved = getNodesForNavigationQuery(settingsQuery);
    if (resolved.nodes.length > 0) {
      const node = resolved.nodes[0];
      return { ...node, scopeKey: node.scopeKey || getStorageKey() };
    }
  }

  const campusConfig = GoogleMapsNav?.config?.campus;
  const scopeKey = campusConfig?.indoorEntryScopeKey || `${STORAGE_PREFIX}campus`;
  const entryName = campusConfig?.indoorEntryNodeName || "0001";
  const points = readPointsByScope().get(scopeKey) || [];
  const named = points.find((point) => point.name === entryName);
  const point = named || points[0];
  if (!point) {
    return null;
  }
  return { ...point, scopeKey };
}

function resolveBestIndoorPathFromEntry(endQuery) {
  const entryNode = resolveIndoorEntryNode();
  if (!entryNode) {
    return null;
  }

  const endCandidates = getNodesForNavigationQuery(endQuery);
  if (endCandidates.nodes.length === 0) {
    return null;
  }

  let best = null;
  endCandidates.nodes.forEach((end) => {
    const result = findShortestPath(entryNode.scopeKey, entryNode.id, end.scopeKey, end.id);
    if (!result) {
      return;
    }
    if (!best || result.totalDistance < best.result.totalDistance) {
      const endDestination = resolveEndDestinationForPath(end, endQuery);
      best = {
        start: entryNode,
        end,
        result,
        endMatchedBy: endCandidates.matchedBy,
        endDestination
      };
    }
  });

  return best;
}

function updateOutdoorOpenMapsLink(origin) {
  if (!outdoorOpenMapsBtn || typeof GoogleMapsNav === "undefined") {
    return;
  }
  const url = GoogleMapsNav.buildExternalMapsUrl(origin);
  if (!url) {
    outdoorOpenMapsBtn.classList.add("hidden");
    outdoorOpenMapsBtn.removeAttribute("href");
    return;
  }
  outdoorOpenMapsBtn.href = url;
  outdoorOpenMapsBtn.classList.remove("hidden");
}

async function startOutdoorNavigationToCampus(origin) {
  if (typeof GoogleMapsNav === "undefined" || !GoogleMapsNav.isReady()) {
    updateOutdoorNavStatus("請在 config/maps.local.json 設定 Google Maps API 金鑰。");
    return null;
  }

  const location = origin || (await GoogleMapsNav.getUserLocation());
  if (GoogleMapsNav.isWithinCampus(location.lat, location.lng)) {
    markArrivedAtCampus();
    return null;
  }

  setOutdoorNavigationVisible(true);
  setSidePanelOpen(true);
  updateOutdoorNavStatus("正在規劃前往校園的路線…");

  try {
    const summary = await GoogleMapsNav.routeToCampus(location, googleMap);
    updateOutdoorOpenMapsLink(location);
    const gateName = GoogleMapsNav.getCampusGate()?.name || "校門口";
    const detail = summary
      ? `${summary.startAddress} → ${gateName}：約 ${summary.distanceText}，${summary.durationText}`
      : `正在導航至${gateName}`;
    updateOutdoorNavStatus(detail);
    GoogleMapsNav.startArrivalWatch(() => {
      markArrivedAtCampus();
      updateOutdoorNavStatus("已偵測抵達校園，已切換至校內導航。");
    });
    return summary;
  } catch (error) {
    updateOutdoorNavStatus(error.message || "無法規劃校外路線。");
    return null;
  }
}

function readStoredCampusMapStyle() {
  try {
    const value = localStorage.getItem(CAMPUS_MAP_STYLE_KEY);
    return value === "satellite" ? "satellite" : "custom";
  } catch {
    return "custom";
  }
}

function persistCampusMapStyle(style) {
  try {
    localStorage.setItem(CAMPUS_MAP_STYLE_KEY, style);
  } catch {
    /* ignore */
  }
}

function isCampusSatelliteView() {
  return viewState.mode === "campus" && campusMapStyle === "satellite" && !outdoorNavigationActive;
}

function updateCampusMapStyleButtons() {
  document.querySelectorAll("[data-campus-map-style]").forEach((btn) => {
    const active = btn.getAttribute("data-campus-map-style") === campusMapStyle;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const satBtn = document.getElementById("campusMapStyleSatelliteBtn");
  if (satBtn) {
    satBtn.disabled = false;
    satBtn.removeAttribute("title");
  }
}

function hideCampusSatelliteView() {
  document.getElementById("campusSatelliteWrap")?.classList.add("hidden");
  mapStage?.classList.remove("hidden");
  const guess = document.getElementById("campusSatelliteGuess");
  guess?.remove();
}

function getSatelliteStageRect() {
  const image = document.getElementById("campusSatelliteImage");
  if (image?.naturalWidth) {
    return image.getBoundingClientRect();
  }
  return document.getElementById("campusSatelliteStage")?.getBoundingClientRect() || null;
}

function pointToSatelliteImagePercent(point, _campus) {
  // 與自製平面圖使用同一套節點百分比，相對位置完全一致
  if (typeof point?.xPercent !== "number" || typeof point?.yPercent !== "number") {
    return null;
  }
  return {
    ok: true,
    xPercent: point.xPercent,
    yPercent: point.yPercent
  };
}

function showSatelliteGuessMarker(xPercent, yPercent) {
  const host = document.getElementById("campusSatelliteMarkers");
  if (!host) {
    return;
  }
  let guess = document.getElementById("campusSatelliteGuess");
  if (!guess) {
    guess = document.createElement("span");
    guess.id = "campusSatelliteGuess";
    guess.className = "campus-satellite-guess";
    host.appendChild(guess);
  }
  guess.style.left = `${xPercent}%`;
  guess.style.top = `${yPercent}%`;
}

function clearSatelliteGuessMarker() {
  document.getElementById("campusSatelliteGuess")?.remove();
}

function syncSatelliteStageLayout() {
  const stage = document.getElementById("campusSatelliteStage");
  const image = document.getElementById("campusSatelliteImage");
  const container = document.getElementById("campusSatelliteWrap");
  if (!stage || !image || !container) {
    return;
  }
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const nw = image.naturalWidth;
  const nh = image.naturalHeight;
  if (!cw || !ch || !nw || !nh) {
    return;
  }
  const scale = Math.min(cw / nw, ch / nh);
  stage.style.width = `${Math.max(1, Math.round(nw * scale))}px`;
  stage.style.height = `${Math.max(1, Math.round(nh * scale))}px`;
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.maxWidth = "none";
  image.style.maxHeight = "none";
}

async function refreshCampusSatelliteMap() {
  if (!isCampusSatelliteView()) {
    return;
  }
  await ensureMapsConfigLoaded();
  const campus = GoogleMapsNav.config?.campus || {};
  const satConfig = resolveSatelliteImageConfig(campus);
  const image = document.getElementById("campusSatelliteImage");
  const markersHost = document.getElementById("campusSatelliteMarkers");
  const stage = document.getElementById("campusSatelliteStage");
  if (!image || !markersHost || !stage) {
    return;
  }

  if (image.getAttribute("src") !== satConfig.url) {
    image.src = satConfig.url;
  }
  image.onerror = () => {
    showMapAssetBanner(
      isVisitorMode()
        ? "缺少衛星圖。請向維護者索取 images/campus/campus-satellite-ref.png，或改用自製平面圖。"
        : "缺少衛星圖 images/campus/campus-satellite-ref.png（見 images/README.md）。已建議改回自製平面圖。"
    );
    setCampusMapStyle("custom");
  };

  const draw = () => {
    hideMapAssetBanner();
    syncSatelliteStageLayout();
    markersHost.innerHTML = "";

    panoramaPoints.forEach((point) => {
      const pos = pointToSatelliteImagePercent(point, campus);
      if (!pos) {
        return;
      }
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "marker";
      if ((point.links || []).length > 0) {
        marker.classList.add("marker-linked");
      }
      if (point.autoFaceNext) {
        marker.classList.add("marker-auto-face");
      }
      if (pendingLocatePoint?.id === point.id) {
        marker.classList.add("marker-locate-selected");
      }
      marker.title = point.name;
      marker.style.left = `${pos.xPercent}%`;
      marker.style.top = `${pos.yPercent}%`;
      marker.addEventListener("click", (event) => {
        event.stopPropagation();
        if (locateStartMode) {
          selectLocatePoint(point);
          return;
        }
        if (!editMode) {
          openPanoramaViewer(point);
        }
      });
      markersHost.appendChild(marker);
      (point.destinations || []).forEach((dest) => {
        const destPos = pointToSatelliteImagePercent(
          { xPercent: dest.xPercent, yPercent: dest.yPercent },
          campus
        );
        if (!destPos) {
          return;
        }
        appendDestinationMarker(markersHost, point, dest, {
          xPercent: destPos.xPercent,
          yPercent: destPos.yPercent,
          interactive: false
        });
      });
    });

    Object.entries(getBuildingsRegistry()).forEach(([id, building]) => {
      const hotspot = resolveBuildingHotspotPosition(id, building);
      const pos = pointToSatelliteImagePercent(
        { xPercent: hotspot.xPercent, yPercent: hotspot.yPercent },
        campus
      );
      if (!pos) {
        return;
      }
      appendBuildingHotspotButton(markersHost, id, building, pos);
    });
  };

  if (image.complete && image.naturalWidth) {
    draw();
  } else {
    image.onload = () => draw();
  }

  if (!stage.dataset.clickBound) {
    stage.dataset.clickBound = "1";
    stage.addEventListener("click", (event) => {
      if (!isCampusSatelliteView()) {
        return;
      }
      if (event.target.closest(".marker, .building-btn, .map-portal-btn")) {
        return;
      }
      const rect = getSatelliteStageRect();
      if (!rect?.width || !rect?.height) {
        return;
      }
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        return;
      }
      const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
      handleCampusSatelliteImageClick(xPercent, yPercent);
    });
    window.addEventListener("resize", () => {
      if (isCampusSatelliteView()) {
        syncSatelliteStageLayout();
      }
    });
  }
}

function handleCampusSatelliteImageClick(xPercent, yPercent) {
  showSatelliteGuessMarker(xPercent, yPercent);
  if (!locateStartMode) {
    return;
  }
  // 與自製圖相同座標系：直接用點擊百分比找最近節點
  if (viewState.mode !== "campus") {
    showCampusMap();
  }
  const nearest = findNearestCampusPoint(xPercent, yPercent);
  if (!nearest) {
    setLocateBannerMessage("找不到附近節點", "請點靠近紅點的位置，或切回自製平面圖。");
    return;
  }
  selectLocatePoint(nearest);
  setLocateBannerMessage(
    `衛星圖已對到「${nearest.name}」`,
    "節點位置與自製平面圖相同。確認後會當起點；不對可重選。"
  );
}

function applyCampusMapStyleView() {
  const switcher = document.getElementById("campusMapStyleSwitch");
  // 衛星圖僅校園總圖；樓層平面圖一律隱藏切換
  const onCampus = viewState.mode === "campus" && !outdoorNavigationActive;
  switcher?.classList.toggle("hidden", !onCampus);
  updateCampusMapStyleButtons();

  if (!onCampus || campusMapStyle !== "satellite") {
    hideCampusSatelliteView();
    mapStage?.classList.remove("hidden");
    syncCampusBuildingEditUi();
    return;
  }

  clearPendingBuildingDraft();
  mapStage?.classList.add("hidden");
  document.getElementById("campusSatelliteWrap")?.classList.remove("hidden");
  void refreshCampusSatelliteMap();
}

function setCampusMapStyle(style, options = {}) {
  const next = style === "satellite" ? "satellite" : "custom";
  campusMapStyle = next;
  if (options.persist !== false) {
    persistCampusMapStyle(next);
  }
  updateCampusMapStyleButtons();
  if (options.refresh === false) {
    return;
  }
  if (next === "satellite" && outdoorNavigationActive) {
    markArrivedAtCampus();
    if (typeof GoogleMapsNav !== "undefined") {
      GoogleMapsNav.clearRoute?.();
    }
  }
  if (viewState.mode === "campus") {
    applyCampusMapStyleView();
    renderAll();
    if (campusMapStyle === "custom") {
      renderBuildingHotspots();
    }
  } else {
    hideCampusSatelliteView();
  }
}

function setupCampusBuildingEditUi() {
  const addBtn = document.getElementById("campusBuildingAddBtn");
  addBtn?.addEventListener("click", () => {
    if (pendingBuildingDraft) {
      clearPendingBuildingDraft();
      updateNodeSaveStatus();
      return;
    }
    openBuildingModal();
  });
}

function setupCampusMapStyleUi() {
  campusMapStyle = readStoredCampusMapStyle();
  updateCampusMapStyleButtons();
  document.querySelectorAll("[data-campus-map-style]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const style = btn.getAttribute("data-campus-map-style");
      if (style === "satellite" && editMode) {
        setEditMode(false);
      }
      setCampusMapStyle(style);
    });
  });
}

function findNearestCampusPointByLatLng(lat, lng) {
  const campus = GoogleMapsNav.config?.campus;
  if (!campus || viewState.mode !== "campus") {
    return null;
  }
  let best = null;
  let bestDist = Infinity;
  panoramaPoints.forEach((point) => {
    const position = CampusSatelliteMap.pointToLatLng(point, campus);
    if (!position) {
      return;
    }
    const dist = GoogleMapsNav.distanceMeters(lat, lng, position.lat, position.lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  });
  return best;
}

function handleCampusSatelliteMapClick(_location) {
  /* 已改為參考圖點選 handleCampusSatelliteImageClick */
}

function hasIncomingNavQuery() {
  const params = new URLSearchParams(location.search);
  const locate = params.get("locate");
  return Boolean(
    (params.get("from")?.trim() && params.get("to")?.trim()) ||
      locate === "1" ||
      locate === "gps" ||
      params.get("pano") === "1"
  );
}

/** 自動播放真正開始後才從網址拿掉 go=1，避免就緒未播就 F5 失效 */
function stripAutoStartFromUrl() {
  const params = new URLSearchParams(location.search);
  if (params.get("go") !== "1") {
    return;
  }
  params.delete("go");
  const qs = params.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash || ""}`;
  history.replaceState(null, "", next);
}

function updateLocateStartBanner() {
  const banner = document.getElementById("locateStartBanner");
  const title = document.getElementById("locateStartTitle");
  const hint = document.getElementById("locateStartHint");
  const confirmBtn = document.getElementById("locateStartConfirmBtn");
  const retryBtn = document.getElementById("locateStartRetryBtn");
  const gpsBtn = document.getElementById("locateStartGpsBtn");
  const satPickBtn = document.getElementById("locateUseSatelliteBtn");
  if (!banner) {
    return;
  }
  banner.classList.toggle("hidden", !locateStartMode);
  if (!locateStartMode) {
    return;
  }
  const picking = !pendingLocatePoint;
  gpsBtn?.classList.toggle("hidden", !picking);
  satPickBtn?.classList.toggle("hidden", !picking || campusMapStyle === "satellite");
  if (pendingLocatePoint) {
    if (title) {
      title.textContent = `已定位到「${pendingLocatePoint.name}」`;
    }
    if (hint) {
      hint.textContent = "確認後會以此節點當起點；不對的話可重選、再點地圖，或改用 GPS／衛星圖。";
    }
    confirmBtn?.classList.remove("hidden");
    retryBtn?.classList.remove("hidden");
  } else {
    if (title) {
      title.textContent = "校園地圖定位起點";
    }
    if (hint) {
      hint.textContent =
        campusMapStyle === "satellite"
          ? "請在衛星圖上點你附近的位置，系統會對到最近節點。"
          : "請在自製平面圖點一下，或按「改用衛星圖點選」／「用 GPS 大致定位」。";
    }
    confirmBtn?.classList.add("hidden");
    retryBtn?.classList.add("hidden");
  }
}

function findNearestCampusPoint(xPercent, yPercent) {
  if (viewState.mode !== "campus") {
    return null;
  }
  const points = panoramaPoints.filter(
    (point) => typeof point.xPercent === "number" && typeof point.yPercent === "number"
  );
  if (!points.length) {
    return null;
  }
  let best = null;
  let bestDist = Infinity;
  points.forEach((point) => {
    const dx = point.xPercent - xPercent;
    const dy = point.yPercent - yPercent;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  });
  return best;
}

function selectLocatePoint(point) {
  if (!locateStartMode || !point) {
    return;
  }
  pendingLocatePoint = point;
  updateLocateStartBanner();
  renderAll();
}

function handleLocateMapClick(event) {
  if (
    event.target.closest(
      ".marker, .building-btn, .map-portal-btn, .floor-btn, .toolbar-btn, .toggle-btn, .locate-start-banner"
    )
  ) {
    return;
  }
  if (viewState.mode !== "campus") {
    showCampusMap();
    updateLocateStartBanner();
    return;
  }
  const rect = getMapStageRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return;
  }
  const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
  const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
  const nearest = findNearestCampusPoint(xPercent, yPercent);
  if (!nearest) {
    const hint = document.getElementById("locateStartHint");
    if (hint) {
      hint.textContent = "這張地圖還沒有可用節點，請先用其他起點或稍後再試。";
    }
    return;
  }
  selectLocatePoint(nearest);
}

function startLocateStartMode(options = {}) {
  locateStartMode = true;
  pendingLocatePoint = null;
  locateStartOptions = {
    to: options.to || "",
    autoStart: Boolean(options.autoStart)
  };
  document.body.classList.add("is-locate-start");
  if (editMode) {
    setEditMode(false);
  }
  setSidePanelOpen(false);
  showCampusMap();
  updateLocateStartBanner();
  renderAll();
}

function exitLocateStartMode() {
  locateStartMode = false;
  pendingLocatePoint = null;
  locateStartOptions = { to: "", autoStart: false };
  document.body.classList.remove("is-locate-start");
  clearSatelliteGuessMarker();
  updateLocateStartBanner();
  renderAll();
}

function setLocateBannerMessage(titleText, hintText) {
  const title = document.getElementById("locateStartTitle");
  const hint = document.getElementById("locateStartHint");
  if (title && titleText) {
    title.textContent = titleText;
  }
  if (hint && hintText) {
    hint.textContent = hintText;
  }
}

async function ensureMapsConfigLoaded() {
  if (GoogleMapsNav?.config?.campus) {
    return GoogleMapsNav.config;
  }
  try {
    await GoogleMapsNav.init();
  } catch {
    /* config may still be filled before key check */
  }
  return GoogleMapsNav?.config || null;
}

async function locateStartByGps() {
  if (!locateStartMode) {
    startLocateStartMode({
      to: pathTo?.value?.trim() || "",
      autoStart: false
    });
  } else {
    showCampusMap();
  }

  setLocateBannerMessage("GPS 大致定位中…", "正在取得目前位置，請稍候。");
  const gpsBtn = document.getElementById("locateStartGpsBtn");
  gpsBtn?.setAttribute("disabled", "true");

  try {
    const config = await ensureMapsConfigLoaded();
    const campus = config?.campus;
    if (!campus?.gate) {
      setLocateBannerMessage(
        "無法使用 GPS 定位",
        isVisitorMode()
          ? "缺少校園座標設定。請改用手點地圖，或返回訪客頁改選校門口等起點。"
          : "缺少校園座標設定。請確認 config/maps.local.json，或改用手點地圖。"
      );
      return;
    }

    let location;
    try {
      location = await GoogleMapsNav.getUserLocation();
    } catch {
      setLocateBannerMessage(
        "無法取得 GPS",
        isVisitorMode()
          ? "請允許瀏覽器定位後再試，或改在平面圖上手點位置；也可返回訪客頁改選起點。"
          : "請允許瀏覽器定位權限後再試，或改在校園平面圖上點選位置。"
      );
      return;
    }

    if (!GoogleMapsNav.isWithinCampus(location.lat, location.lng)) {
      setLocateBannerMessage(
        "無法查詢",
        "目前位置偏離校園太遠，無法定位到校內節點。請改用手點地圖，或返回訪客頁改選校門口等起點。"
      );
      return;
    }

    markArrivedAtCampus();

    const mapped = latLngToCampusMapPercent(location.lat, location.lng, campus);
    if (!mapped.ok) {
      setLocateBannerMessage(
        "GPS 校準尚未設定",
        isVisitorMode()
          ? "請改用手點地圖定位，或返回訪客頁改選校門口等起點。"
          : "請在 maps 設定加入至少 3 個 mapGpsAnchors，或改用手點地圖定位。"
      );
      return;
    }

    if (mapped.outsideMap) {
      setLocateBannerMessage(
        "無法查詢",
        "定位結果偏離校園平面圖範圍，無法對到校內節點。請改用手點地圖，或返回訪客頁改選其他起點。"
      );
      return;
    }

    const accuracy = Number(location.accuracy) || 0;
    const maxAccuracy = mapped.maxAccuracyMeters || 80;
    const nearest = findNearestCampusPoint(mapped.xPercent, mapped.yPercent);
    if (!nearest) {
      setLocateBannerMessage(
        "無法查詢",
        isVisitorMode()
          ? "校園平面圖尚無可用節點。請返回訪客頁改選其他起點，或稍後再試。"
          : "校園平面圖尚無節點，請稍後再試或改選其他起點。"
      );
      return;
    }

    selectLocatePoint(nearest);
    if (isCampusSatelliteView()) {
      // GPS 對到的節點在自製圖座標系；衛星圖共用同一套百分比
      const customPos = latLngToCampusMapPercent(location.lat, location.lng, campus);
      if (customPos.ok) {
        showSatelliteGuessMarker(customPos.xPercent, customPos.yPercent);
      } else if (nearest) {
        showSatelliteGuessMarker(nearest.xPercent, nearest.yPercent);
      }
    }
    const accuracyNote =
      accuracy > 0 ? `（GPS 精度約 ${Math.round(accuracy)} 公尺）` : "";
    const warn =
      accuracy > maxAccuracy
        ? "定位較粗，請確認藍點是否接近你；不對可重選或手點地圖／衛星圖。"
        : "請確認藍點是否接近你目前位置，再按確認。";
    setLocateBannerMessage(`GPS 已對到「${nearest.name}」${accuracyNote}`, warn);
  } finally {
    gpsBtn?.removeAttribute("disabled");
  }
}

async function confirmLocateStartPoint() {
  if (!pendingLocatePoint) {
    return;
  }
  const pointName = pendingLocatePoint.name;
  const to = locateStartOptions.to;
  const autoStart = locateStartOptions.autoStart;
  if (pathFrom) {
    pathFrom.value = pointName;
  }
  exitLocateStartMode();
  setSidePanelOpen(true);
  if (to && pathTo) {
    pathTo.value = to;
  }
  if (to && typeof calculatePathHandler === "function") {
    await calculatePathHandler();
    const hasIndoorPath = Boolean(computedPath?.steps?.length);
    const waitingOutdoor = outdoorNavigationActive && !hasArrivedAtCampus();
    if (autoStart && hasIndoorPath && !waitingOutdoor && typeof startAutoPathPlaybackHandler === "function") {
      requestAutoPathPlaybackAfterWelcome();
    }
  } else if (pathResult) {
    pathResult.textContent = `已將起點設為「${pointName}」。請再輸入終點並按「計算路徑」。`;
  }
}

function setupLocateStartUi() {
  document.getElementById("locateStartConfirmBtn")?.addEventListener("click", () => {
    void confirmLocateStartPoint();
  });
  document.getElementById("locateStartRetryBtn")?.addEventListener("click", () => {
    pendingLocatePoint = null;
    clearSatelliteGuessMarker();
    updateLocateStartBanner();
    renderAll();
  });
  document.getElementById("locateStartCancelBtn")?.addEventListener("click", () => {
    const visitor = isVisitorMode();
    exitLocateStartMode();
    if (visitor) {
      location.href = "./visitor.html";
      return;
    }
    setSidePanelOpen(true);
  });
  document.getElementById("locateStartGpsBtn")?.addEventListener("click", () => {
    void locateStartByGps();
  });
  document.getElementById("locateUseSatelliteBtn")?.addEventListener("click", () => {
    if (editMode) {
      setEditMode(false);
    }
    setCampusMapStyle("satellite");
    updateLocateStartBanner();
  });
  document.getElementById("pathLocateMapBtn")?.addEventListener("click", () => {
    startLocateStartMode({
      to: pathTo?.value?.trim() || "",
      autoStart: false
    });
  });
  document.getElementById("pathLocateGpsBtn")?.addEventListener("click", () => {
    startLocateStartMode({
      to: pathTo?.value?.trim() || "",
      autoStart: false
    });
    void locateStartByGps();
  });
  document.getElementById("pathSetPanoStartBtn")?.addEventListener("click", () => {
    setPathStartFromCurrentPanorama();
  });
}

async function applyIncomingNavQuery() {
  const params = new URLSearchParams(location.search);
  const visitorStarts = normalizeVisitorStarts(
    typeof NavArrowSettings !== "undefined" ? NavArrowSettings.load()?.visitorStarts : null
  );
  const from = decodeNavQueryFromUrl(params.get("from")?.trim() || "", visitorStarts);
  const to = decodeNavQueryFromUrl(params.get("to")?.trim() || "", visitorStarts);
  const autoStart = params.get("go") === "1";
  const locateParam = params.get("locate")?.trim() || "";
  const visitor = isVisitorMode();
  const floorParam = String(params.get("floor") || "").trim().toLowerCase();
  if (floorParam === "stairs" || floorParam === "both") {
    const floorEl = document.getElementById("pathFloorMode");
    if (floorEl) {
      floorEl.value = floorParam;
    }
  }

  if (params.get("pano") === "1") {
    await applyIncomingPanoSpotQuery(params);
    return;
  }

  if (locateParam === "1" || locateParam === "map") {
    startLocateStartMode({ to, autoStart });
    return;
  }
  if (locateParam === "gps") {
    startLocateStartMode({ to, autoStart });
    void locateStartByGps();
    return;
  }

  if (!from && !to) {
    return;
  }
  if (pathFrom && from) {
    pathFrom.value = from;
  }
  if (pathTo && to) {
    pathTo.value = to;
  }
  const viaRaw = params.get("via")?.trim() || "";
  if (viaRaw) {
    clearPathWaypoints();
    const queries = decodeNavQueryListFromUrl(viaRaw, visitorStarts);
    const stays = decodeWaypointStayList(params.get("viaStay") || "", queries.length);
    queries.forEach((query, index) => createPathWaypointRow(query, stays[index]));
  }
  if (!from || !to || typeof calculatePathHandler !== "function") {
    return;
  }
  setSidePanelOpen(true);

  await calculatePathHandler();

  const hasIndoorPath = Boolean(computedPath?.steps?.length);
  const waitingOutdoor = outdoorNavigationActive && !hasArrivedAtCampus();

  if (autoStart && hasIndoorPath && !waitingOutdoor && typeof startAutoPathPlaybackHandler === "function") {
    requestAutoPathPlaybackAfterWelcome();
    return;
  }

  if (visitor && waitingOutdoor) {
    if (pathResult && !String(pathResult.textContent || "").includes("抵達校園")) {
      pathResult.textContent =
        `${pathResult.textContent || "校內路徑已預先規劃。"} 請先依 Google 地圖前往校園；抵達後再按「自動播放路徑」。`.trim();
    }
    setVisitorPathGuide("請先依 Google 地圖前往校園；抵達後再按「自動播放路徑」。");
    return;
  }

  if (visitor && hasIndoorPath && !waitingOutdoor) {
    markPathReadyForPlayback();
    return;
  }

  if (visitor && !hasIndoorPath && !pathResult?.classList.contains("is-error")) {
    const fallback = "找不到可用路徑。請返回訪客頁改選起點或目的地，或確認該區域節點已連線。";
    setPathErrorMessage(fallback);
  }
}

async function maybeAutoStartOutdoorNavigation() {
  if (hasIncomingNavQuery() || hasArrivedAtCampus() || !mapsApiReady) {
    return;
  }

  try {
    await startOutdoorNavigationToCampus();
  } catch (error) {
    console.info("尚未啟用校外導航：", error.message || error);
  }
}

function setupOutdoorNavigation() {
  pathUseLocationBtn?.classList.add("hidden");

  outdoorTravelMode?.addEventListener("change", async () => {
    if (typeof GoogleMapsNav === "undefined") {
      return;
    }
    GoogleMapsNav.setTravelMode(outdoorTravelMode.value);
    if (!outdoorNavigationActive || !GoogleMapsNav.userLocation) {
      return;
    }
    updateOutdoorNavStatus("正在依新的交通方式重新規劃路線…");
    await startOutdoorNavigationToCampus(GoogleMapsNav.userLocation);
  });

  outdoorRefreshBtn?.addEventListener("click", async () => {
    if (typeof GoogleMapsNav === "undefined" || !GoogleMapsNav.isReady()) {
      updateOutdoorNavStatus("Google Maps 尚未設定完成。");
      return;
    }
    try {
      const location = await GoogleMapsNav.getUserLocation();
      if (GoogleMapsNav.isWithinCampus(location.lat, location.lng)) {
        markArrivedAtCampus();
        return;
      }
      sessionStorage.removeItem(CAMPUS_ARRIVED_KEY);
      await startOutdoorNavigationToCampus(location);
    } catch (error) {
      updateOutdoorNavStatus("無法取得定位，請確認瀏覽器已允許位置存取。");
    }
  });

  outdoorArrivedBtn?.addEventListener("click", () => {
    markArrivedAtCampus();
    if (pathResult?.textContent) {
      pathResult.textContent += " 已切換至校內導航，可按「自動播放路徑」開始。";
      markPathReadyForPlayback();
    }
  });
}

function clearOutdoorPathResult() {
  outdoorPathResult?.classList.add("hidden");
  if (outdoorPathResult) {
    outdoorPathResult.textContent = "";
  }
}

function buildHotspotsForPoint(point) {
  const currentScope = getStorageKey();
  const pathNextLink = pathGuidanceActive ? getNextPathFocusLink(point, currentScope) : null;
  const pathElevatorStep = pathGuidanceActive
    ? getNextPathElevatorStep(point, currentScope)
    : null;

  const fromLinks = (point.links || [])
    .map((link) => {
      const targetScopeKey = link.targetScopeKey || currentScope;
      const target = getPointByRef(link.targetId, targetScopeKey);
      if (!target) {
        return null;
      }
      const dist =
        typeof link.distance === "number" && link.distance > 0 ? ` · ${link.distance}m` : "";
      const floorChange = resolveLinkFloorChange(link);
      const crossScope =
        targetScopeKey !== currentScope ? `（${getScopeDisplayName(targetScopeKey)}）` : "";
      const isPathNext = Boolean(pathNextLink && link.id === pathNextLink.id);

      let directionPrefix = "";
      if (floorChange === "up") {
        directionPrefix = "▲ 上樓 ";
      } else if (floorChange === "down") {
        directionPrefix = "▼ 下樓 ";
      }

      const namePart = `${directionPrefix}${target.name}${crossScope}${dist}`;
      return {
        id: link.id,
        targetId: encodeTargetRef(link.targetId, link.targetScopeKey),
        yaw: link.yaw,
        pitch: link.pitch,
        arrowPitch: link.arrowPitch,
        arrowOpacity: link.arrowOpacity,
        text: `→ ${namePart}`,
        shortLabel: namePart,
        isPathNext,
        floorChange
      };
    })
    .filter(Boolean);

  // 路徑下一步為虛擬電梯邊（無實體連線）：在電梯目的地方位放可點箭頭
  if (
    pathElevatorStep &&
    !fromLinks.some(
      (h) =>
        decodeTargetRef(h.targetId).targetId === pathElevatorStep.pointId &&
        (decodeTargetRef(h.targetId).targetScopeKey || currentScope) === pathElevatorStep.scopeKey
    )
  ) {
    const target = getPointByRef(pathElevatorStep.pointId, pathElevatorStep.scopeKey);
    const elevDest =
      (point.destinations || []).find((d) => d.isElevator && hasDestinationYaw(d)) ||
      (point.destinations || []).find((d) => d.isElevator);
    const yaw = typeof elevDest?.yaw === "number" ? elevDest.yaw : 0;
    const pitch = typeof elevDest?.pitch === "number" ? elevDest.pitch : undefined;
    const crossScope =
      pathElevatorStep.scopeKey !== currentScope
        ? `（${getScopeDisplayName(pathElevatorStep.scopeKey)}）`
        : "";
    const namePart = `電梯 ${target?.name || pathElevatorStep.pointId}${crossScope}`;
    fromLinks.push({
      id: `path_elevator_${pathElevatorStep.scopeKey}_${pathElevatorStep.pointId}`,
      targetId: encodeTargetRef(pathElevatorStep.pointId, pathElevatorStep.scopeKey),
      yaw,
      pitch,
      text: `→ ${namePart}`,
      shortLabel: namePart,
      isPathNext: true,
      transport: "elevator"
    });
  }

  return fromLinks;
}

function renderAll() {
  clearMarkers();
  renderMarkers();
  renderMapPortals();
  renderConnectionLines();
  renderList();
  updatePathSuggestions();
  renderDestinationSearch();
  if (isCampusSatelliteView()) {
    void refreshCampusSatelliteMap();
  }
}

function clearMarkers() {
  (mapStage || mapContainer).querySelectorAll(".marker").forEach((node) => node.remove());
}

function renderMarkers() {
  if (isCampusSatelliteView()) {
    return;
  }
  panoramaPoints.forEach((point) => {
    const marker = document.createElement("button");
    marker.className = "marker";
    if ((point.links || []).length > 0) {
      marker.classList.add("marker-linked");
    }
    if (point.autoFaceNext) {
      marker.classList.add("marker-auto-face");
    }
    marker.type = "button";
    marker.dataset.pointId = point.id;
    marker.title = editMode
      ? `${point.name}${point.autoFaceNext ? "（轉彎輔助）" : ""}（拖曳移動；右鍵刪除）`
      : `${point.name}${point.autoFaceNext ? "（轉彎輔助）" : ""}（點擊開啟 360° 環景）`;
    marker.style.left = `${point.xPercent}%`;
    marker.style.top = `${point.yPercent}%`;
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      if (markerDidDrag) {
        markerDidDrag = false;
        return;
      }
      if (locateStartMode) {
        selectLocatePoint(point);
        return;
      }
      if (editMode) {
        return;
      }
      openPanoramaViewer(point);
    });
    if (pendingLocatePoint?.id === point.id) {
      marker.classList.add("marker-locate-selected");
    }
    marker.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (editMode) {
        confirmAndDeletePoint(point.id);
        return;
      }
      updateNodeSaveStatus("請先開啟「編輯模式」才能刪除節點。");
    });
    if (editMode) {
      bindMarkerDrag(marker, point);
    }
    (mapStage || mapContainer).appendChild(marker);
    (point.destinations || []).forEach((dest) => {
      appendDestinationMarker(mapStage || mapContainer, point, dest, {
        xPercent: dest.xPercent,
        yPercent: dest.yPercent,
        interactive: true
      });
    });
  });
}

function appendDestinationMarker(host, point, dest, options = {}) {
  const xPercent = options.xPercent;
  const yPercent = options.yPercent;
  if (!Number.isFinite(Number(xPercent)) || !Number.isFinite(Number(yPercent))) {
    return;
  }
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = dest.isElevator
    ? "marker marker-destination marker-destination-elevator"
    : "marker marker-destination";
  marker.dataset.pointId = point.id;
  marker.dataset.destId = dest.id || "";
  marker.textContent = dest.isElevator
    ? `電梯 · ${dest.name || "未命名"}`
    : dest.name || "未命名";
  marker.title = editMode
    ? `${dest.name}${dest.isElevator ? "（電梯）" : ""}（綁定「${point.name}」；拖曳移動；右鍵刪除）`
    : `${dest.name}${dest.isElevator ? "（電梯）" : ""}（點擊開啟「${point.name}」環景）`;
  marker.style.left = `${xPercent}%`;
  marker.style.top = `${yPercent}%`;
  marker.addEventListener("click", (event) => {
    event.stopPropagation();
    if (markerDidDrag) {
      markerDidDrag = false;
      return;
    }
    if (locateStartMode) {
      selectLocatePoint(point);
      return;
    }
    if (editMode) {
      return;
    }
    openPanoramaViewer(point, hasDestinationYaw(dest) ? { focusDestinationId: dest.id } : {});
  });
  marker.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (editMode) {
      confirmAndDeleteDestination(point.id, dest.id, dest.name);
      return;
    }
    updateNodeSaveStatus("請先開啟「編輯模式」才能刪除目的地。");
  });
  if (editMode && options.interactive !== false) {
    bindDestinationDrag(marker, point, dest);
  }
  host.appendChild(marker);
}

function bindDestinationDrag(marker, point, dest) {
  const pointId = point.id;
  const destId = dest.id;
  marker.addEventListener("pointerdown", (event) => {
    if (!editMode || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    marker.setPointerCapture(event.pointerId);
    markerDragState = {
      pointId,
      destId,
      pointerId: event.pointerId,
      moved: false
    };
    marker.classList.add("marker-dragging");
  });

  marker.addEventListener("pointermove", (event) => {
    if (
      !markerDragState ||
      markerDragState.pointId !== pointId ||
      markerDragState.destId !== destId ||
      markerDragState.pointerId !== event.pointerId
    ) {
      return;
    }
    const rect = getMapStageRect();
    if (!rect?.width || !rect?.height) {
      return;
    }
    const xPercent = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    markerDragState.moved = true;
    markerDidDrag = true;
    const live = getLiveDestination(pointId, destId);
    const liveDest = live.dest || dest;
    liveDest.xPercent = xPercent;
    liveDest.yPercent = yPercent;
    marker.style.left = `${xPercent}%`;
    marker.style.top = `${yPercent}%`;
  });

  const finishDrag = (event) => {
    if (
      !markerDragState ||
      markerDragState.pointId !== pointId ||
      markerDragState.destId !== destId
    ) {
      return;
    }
    marker.classList.remove("marker-dragging");
    if (markerDragState.moved) {
      savePanoramaPoints(getStorageKey());
    }
    markerDragState = null;
    if (marker.hasPointerCapture?.(event.pointerId)) {
      marker.releasePointerCapture(event.pointerId);
    }
  };

  marker.addEventListener("pointerup", finishDrag);
  marker.addEventListener("pointercancel", finishDrag);
  marker.addEventListener("lostpointercapture", finishDrag);
}

function bindMarkerDrag(marker, point) {
  marker.addEventListener("pointerdown", (event) => {
    if (!editMode || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    marker.setPointerCapture(event.pointerId);
    markerDragState = {
      pointId: point.id,
      pointerId: event.pointerId,
      moved: false
    };
    marker.classList.add("marker-dragging");
  });

  marker.addEventListener("pointermove", (event) => {
    if (!markerDragState || markerDragState.pointId !== point.id) {
      return;
    }
    const rect = getMapStageRect();
    const xPercent = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const yPercent = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    markerDragState.moved = true;
    markerDidDrag = true;
    point.xPercent = xPercent;
    point.yPercent = yPercent;
    marker.style.left = `${xPercent}%`;
    marker.style.top = `${yPercent}%`;
    renderConnectionLines();
  });

  const finishDrag = (event) => {
    if (!markerDragState || markerDragState.pointId !== point.id) {
      return;
    }
    marker.classList.remove("marker-dragging");
    if (markerDragState.moved) {
      savePanoramaPoints(getStorageKey());
    }
    markerDragState = null;
    if (marker.hasPointerCapture?.(event.pointerId)) {
      marker.releasePointerCapture(event.pointerId);
    }
  };

  marker.addEventListener("pointerup", finishDrag);
  marker.addEventListener("pointercancel", finishDrag);
  marker.addEventListener("lostpointercapture", finishDrag);
}

function updatePointName(pointId, name) {
  const point = getPointById(pointId);
  const trimmed = name.trim();
  if (!point || !trimmed || point.name === trimmed) {
    return;
  }
  point.name = trimmed;
  savePanoramaPoints(getStorageKey());
  renderMarkers();
  renderConnectionLines();
  updatePathSuggestions();
  renderDestinationSearch();
}

function updateDestinationName(pointId, destId, name) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  const dest = (point.destinations || []).find((d) => d.id === destId);
  const trimmed = name.trim();
  if (!dest || !trimmed || dest.name === trimmed) {
    return;
  }
  dest.name = trimmed;
  savePanoramaPoints(getStorageKey());
  renderMarkers();
  renderDestinationSearch();
  if (computedPath?.endDestinationId === destId) {
    computedPath.endDestinationName = trimmed;
  }
}

function setDestinationIsElevator(pointId, destId, enabled) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  const dest = (point.destinations || []).find((d) => d.id === destId);
  if (!dest) {
    return;
  }
  const next = Boolean(enabled);
  if (Boolean(dest.isElevator) === next) {
    return;
  }
  dest.isElevator = next;
  savePanoramaPoints(getStorageKey());
  renderList();
  renderMarkers();
  if (currentPanoramaPointId === pointId) {
    openPanoramaViewer(point, { skipAutoFace: true, skipCenterPathNext: true });
  }
}

function updateLinkDistance(fromId, linkId, distance) {
  const from = getPointById(fromId);
  if (!from) {
    return;
  }
  const link = (from.links || []).find((item) => item.id === linkId);
  if (!link) {
    return;
  }
  const nextDistance = Math.max(1, Number(distance) || 1);
  if (link.distance === nextDistance) {
    return;
  }
  link.distance = nextDistance;
  savePanoramaPoints(getStorageKey());
  renderMarkers();
  renderConnectionLines();
  renderList();
}

function linkPairKey(fromId, toId) {
  return fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
}

function ensureConnectionLineDefs(svg) {
  if (svg.querySelector("#connection-line-defs")) {
    return;
  }

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.setAttribute("id", "connection-line-defs");

  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", "connection-arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "2");
  marker.setAttribute("markerHeight", "2");
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "userSpaceOnUse");

  const head = document.createElementNS("http://www.w3.org/2000/svg", "path");
  head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  head.setAttribute("fill", "#ea580c");
  marker.appendChild(head);
  defs.appendChild(marker);
  svg.appendChild(defs);
}

function renderConnectionLines() {
  const overlayHost = mapStage || mapContainer;
  let svg = overlayHost.querySelector(".connection-lines");
  if (isCampusSatelliteView()) {
    svg?.remove();
    return;
  }
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "connection-lines");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    overlayHost.appendChild(svg);
  }
  svg.innerHTML = "";
  ensureConnectionLineDefs(svg);

  const scopeKey = getStorageKey();
  const pairs = new Map();

  panoramaPoints.forEach((point) => {
    (point.links || []).forEach((link) => {
      if (link.targetScopeKey && link.targetScopeKey !== scopeKey) {
        return;
      }
      const target = getPointByRef(link.targetId, scopeKey);
      if (!target || target.id === point.id) {
        return;
      }

      const key = linkPairKey(point.id, target.id);
      if (!pairs.has(key)) {
        const [a, b] = point.id < target.id ? [point, target] : [target, point];
        pairs.set(key, { a, b, aToB: false, bToA: false });
      }

      const pair = pairs.get(key);
      if (point.id === pair.a.id && target.id === pair.b.id) {
        pair.aToB = true;
      } else if (point.id === pair.b.id && target.id === pair.a.id) {
        pair.bToA = true;
      }
    });
  });

  pairs.forEach(({ a, b, aToB, bToA }) => {
    const bidirectional = aToB && bToA;
    let from = a;
    let to = b;

    if (!bidirectional) {
      if (aToB) {
        from = a;
        to = b;
      } else if (bToA) {
        from = b;
        to = a;
      }
    }

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from.xPercent);
    line.setAttribute("y1", from.yPercent);
    line.setAttribute("x2", to.xPercent);
    line.setAttribute("y2", to.yPercent);
    line.setAttribute(
      "class",
      bidirectional ? "connection-line-bidir" : "connection-line-oneway"
    );

    if (bidirectional) {
      line.setAttribute("title", `${a.name} ↔ ${b.name}（雙向）`);
    } else {
      line.setAttribute("marker-end", "url(#connection-arrow)");
      line.setAttribute("title", `${from.name} → ${to.name}（僅單向）`);
    }

    svg.appendChild(line);
  });
}

function renderList() {
  nodeList.innerHTML = "";

  if (!editMode) {
    return;
  }

  if (panoramaPoints.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "node-empty";
    emptyItem.textContent = "目前尚未新增節點。";
    nodeList.appendChild(emptyItem);
    return;
  }

  panoramaPoints.forEach((point) => {
    const card = document.createElement("li");
    card.className = "node-card";

    const head = document.createElement("div");
    head.className = "node-card-head";

    if (editMode) {
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "node-name-input";
      nameInput.value = point.name;
      nameInput.title = "編輯節點名稱";
      nameInput.addEventListener("change", () => updatePointName(point.id, nameInput.value));
      nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          nameInput.blur();
        }
      });
      head.appendChild(nameInput);
    } else {
      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "node-link";
      nameBtn.textContent = point.name;
      nameBtn.addEventListener("click", () => openPanoramaViewer(point));
      head.appendChild(nameBtn);
    }

    const actions = document.createElement("div");
    actions.className = "node-card-actions";

    if (editMode) {
      const linkBtn = document.createElement("button");
      linkBtn.type = "button";
      linkBtn.className = "link-btn";
      linkBtn.textContent = "連線";
      linkBtn.addEventListener("click", () => openLinkModal(point.id));

      const spotLinkBtn = document.createElement("button");
      spotLinkBtn.type = "button";
      spotLinkBtn.className = "secondary-btn small";
      spotLinkBtn.textContent = "據點連結";
      spotLinkBtn.title = "複製據點環景 QR 用網址（開環景並設起點）";
      spotLinkBtn.addEventListener("click", () =>
        void copyPanoSpotLinkForPoint(point, getStorageKey())
      );

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "danger-btn";
      deleteBtn.textContent = "刪除";
      deleteBtn.addEventListener("click", () => confirmAndDeletePoint(point.id));

      actions.appendChild(linkBtn);
      actions.appendChild(spotLinkBtn);
      actions.appendChild(deleteBtn);
    }
    head.appendChild(actions);
    card.appendChild(head);

    if (editMode) {
      const meta = document.createElement("label");
      meta.className = "node-auto-face-toggle";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(point.autoFaceNext);
      checkbox.addEventListener("change", () => setPointAutoFaceNext(point.id, checkbox.checked));
      const text = document.createElement("span");
      text.textContent = "轉彎輔助（下一箭頭＞15° 自動轉向）";
      meta.appendChild(checkbox);
      meta.appendChild(text);
      card.appendChild(meta);
    }

    const links = point.links || [];
    if (links.length > 0) {
      const linkList = document.createElement("ul");
      linkList.className = "node-links";
      links.forEach((link) => {
        const target = getPointByRef(link.targetId, link.targetScopeKey);
        if (!target) {
          return;
        }
        const linkItem = document.createElement("li");
        linkItem.className = editMode ? "node-link-item-edit" : "node-link-item";

        if (editMode) {
          const targetLabel = document.createElement("span");
          targetLabel.className = "node-link-target";
          const crossScope =
            link.targetScopeKey && link.targetScopeKey !== getStorageKey()
              ? `（${getScopeDisplayName(link.targetScopeKey)}）`
              : "";
          targetLabel.textContent = `→ ${target.name}${crossScope}`;

          const floorToggles = document.createElement("div");
          floorToggles.className = "link-floor-toggles";

          const upLabel = document.createElement("label");
          upLabel.className = "link-floor-toggle link-floor-up";
          upLabel.title = "此箭頭顯示為上樓類型";
          const upCheckbox = document.createElement("input");
          upCheckbox.type = "checkbox";
          upCheckbox.checked = link.floorChange === "up";
          upCheckbox.addEventListener("change", () =>
            setLinkFloorChange(point.id, link.id, "up", upCheckbox.checked)
          );
          const upText = document.createElement("span");
          upText.textContent = "上樓";
          upLabel.appendChild(upCheckbox);
          upLabel.appendChild(upText);

          const downLabel = document.createElement("label");
          downLabel.className = "link-floor-toggle link-floor-down";
          downLabel.title = "此箭頭顯示為下樓類型";
          const downCheckbox = document.createElement("input");
          downCheckbox.type = "checkbox";
          downCheckbox.checked = link.floorChange === "down";
          downCheckbox.addEventListener("change", () =>
            setLinkFloorChange(point.id, link.id, "down", downCheckbox.checked)
          );
          const downText = document.createElement("span");
          downText.textContent = "下樓";
          downLabel.appendChild(downCheckbox);
          downLabel.appendChild(downText);

          floorToggles.appendChild(upLabel);
          floorToggles.appendChild(downLabel);

          const distanceInput = document.createElement("input");
          distanceInput.type = "number";
          distanceInput.className = "link-distance-input";
          distanceInput.min = "1";
          distanceInput.step = "1";
          distanceInput.value = String(link.distance || 10);
          distanceInput.title = "連線距離（公尺）";
          distanceInput.addEventListener("change", () =>
            updateLinkDistance(point.id, link.id, distanceInput.value)
          );

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "danger-btn small";
          removeBtn.textContent = "移除";
          removeBtn.addEventListener("click", () => removeLink(point.id, link.id));

          linkItem.appendChild(targetLabel);
          linkItem.appendChild(floorToggles);
          linkItem.appendChild(distanceInput);
          linkItem.appendChild(removeBtn);
        } else {
          const gotoBtn = document.createElement("button");
          gotoBtn.type = "button";
          gotoBtn.className = "node-link-small";
          const dist = link.distance ? ` · ${link.distance}m` : "";
          const crossScope =
            link.targetScopeKey && link.targetScopeKey !== getStorageKey()
              ? `（${getScopeDisplayName(link.targetScopeKey)}）`
              : "";
          const floorPrefix =
            link.floorChange === "up" ? "▲ " : link.floorChange === "down" ? "▼ " : "";
          gotoBtn.textContent = `→ ${floorPrefix}${target.name}${crossScope}${dist}`;
          gotoBtn.addEventListener("click", () =>
            openPanoramaViewer(point, { focusLinkId: link.id, targetScopeKey: link.targetScopeKey })
          );
          linkItem.appendChild(gotoBtn);
        }
        linkList.appendChild(linkItem);
      });
      card.appendChild(linkList);
    }

    const destinations = point.destinations || [];
    if (destinations.length > 0) {
      const destList = document.createElement("ul");
      destList.className = "node-destinations";
      destinations.forEach((dest) => {
        const destItem = document.createElement("li");
        destItem.className = editMode ? "node-dest-item node-dest-item-edit" : "node-dest-item";

        if (editMode) {
          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.className = "node-dest-name-input";
          nameInput.value = dest.name;
          nameInput.title = "編輯目的地名稱";
          nameInput.addEventListener("change", () =>
            updateDestinationName(point.id, dest.id, nameInput.value)
          );
          nameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              nameInput.blur();
            }
          });

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "danger-btn small";
          removeBtn.textContent = "移除";
          removeBtn.addEventListener("click", () => removeDestination(point.id, dest.id));

          destItem.appendChild(nameInput);

          const elevLabel = document.createElement("label");
          elevLabel.className = "link-floor-toggle link-floor-elevator";
          elevLabel.title = "同棟同名電梯目的地會自動跨樓連通";
          const elevCheckbox = document.createElement("input");
          elevCheckbox.type = "checkbox";
          elevCheckbox.checked = Boolean(dest.isElevator);
          elevCheckbox.addEventListener("change", () =>
            setDestinationIsElevator(point.id, dest.id, elevCheckbox.checked)
          );
          const elevText = document.createElement("span");
          elevText.textContent = "電梯";
          elevLabel.appendChild(elevCheckbox);
          elevLabel.appendChild(elevText);
          destItem.appendChild(elevLabel);

          const yawBtn = document.createElement("button");
          yawBtn.type = "button";
          yawBtn.className = "secondary-btn small";
          yawBtn.textContent = hasDestinationYaw(dest) ? "重設方向" : "標記方向";
          yawBtn.addEventListener("click", () => beginDestinationPlacement(point.id, dest.name, dest.id));
          destItem.appendChild(yawBtn);
          destItem.appendChild(removeBtn);
        } else {
          const gotoBtn = document.createElement("button");
          gotoBtn.type = "button";
          gotoBtn.className = "node-dest-goto";
          gotoBtn.textContent = dest.isElevator ? `電梯 · ${dest.name}` : dest.name;
          gotoBtn.addEventListener("click", () =>
            openPanoramaViewer(point, hasDestinationYaw(dest) ? { focusDestinationId: dest.id } : {})
          );
          destItem.appendChild(gotoBtn);
        }
        destList.appendChild(destItem);
      });
      card.appendChild(destList);
    }

    nodeList.appendChild(card);
  });
}

function setPanoramaHint(text, isEdit = false) {
  if (!panoramaHint) {
    return;
  }
  if (!text) {
    panoramaHint.textContent = "";
    panoramaHint.classList.add("hidden");
    panoramaHint.classList.remove("panorama-hint-edit");
    return;
  }
  panoramaHint.textContent = text;
  panoramaHint.classList.remove("hidden");
  panoramaHint.classList.toggle("panorama-hint-edit", isEdit);
}

function hideElevatorRideOverlay() {
  if (elevatorRideTimer) {
    clearTimeout(elevatorRideTimer);
    elevatorRideTimer = null;
  }
  const overlay = document.getElementById("elevatorRideOverlay");
  overlay?.classList.add("hidden");
}

/**
 * 顯示電梯樓層轉換畫面，約 1 秒後執行 onDone（切景）
 */
function showElevatorRideOverlay(fromScopeKey, toScopeKey, onDone) {
  hideElevatorRideOverlay();
  const overlay = document.getElementById("elevatorRideOverlay");
  const floorsEl = document.getElementById("elevatorRideFloors");
  const destEl = document.getElementById("elevatorRideDest");
  const fromLabel = getScopeFloorLabel(fromScopeKey) || getScopeDisplayName(fromScopeKey);
  const toLabel = getScopeFloorLabel(toScopeKey) || getScopeDisplayName(toScopeKey);
  if (floorsEl) {
    floorsEl.textContent = fromLabel && toLabel ? `${fromLabel} → ${toLabel}` : toLabel || "";
  }
  if (destEl) {
    destEl.textContent = toLabel ? `前往 ${toLabel}` : "搭乘電梯中…";
  }
  overlay?.classList.remove("hidden");
  setPanoramaHint(`電梯 ${fromLabel} → ${toLabel}`);
  elevatorRideTimer = setTimeout(() => {
    elevatorRideTimer = null;
    hideElevatorRideOverlay();
    if (typeof onDone === "function") {
      onDone();
    }
  }, 1000);
}

function cancelLinkWizard() {
  linkWizard = null;
  linkWizardBar?.classList.add("hidden");
  linkWizardDistanceRow?.classList.add("hidden");
  panoramaCaptureView?.classList.add("hidden");
  updatePanoramaEditUI();
}

function cancelDestinationWizard() {
  destinationWizard = null;
  destinationWizardBar?.classList.add("hidden");
  updatePanoramaEditUI();
}

function fillDestinationBindSelect(preferredPointId) {
  if (!destinationBindSelect) {
    return;
  }
  destinationBindSelect.innerHTML = "";
  const sorted = [...panoramaPoints].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant", { numeric: true })
  );
  sorted.forEach((point) => {
    const option = document.createElement("option");
    option.value = point.id;
    option.textContent = point.name || point.id;
    destinationBindSelect.appendChild(option);
  });
  if (preferredPointId && sorted.some((point) => point.id === preferredPointId)) {
    destinationBindSelect.value = preferredPointId;
  }
}

function findNearestPathNode(xPercent, yPercent) {
  let best = null;
  let bestDist = Infinity;
  panoramaPoints.forEach((point) => {
    if (typeof point.xPercent !== "number" || typeof point.yPercent !== "number") {
      return;
    }
    const dx = point.xPercent - xPercent;
    const dy = point.yPercent - yPercent;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  });
  return best;
}

function syncAddDestinationMapBtn() {
  const show = Boolean(editMode && adminSessionOk && !isVisitorMode());
  addDestinationMapBtn?.classList.toggle("hidden", !show);
  if (!addDestinationMapBtn) {
    return;
  }
  addDestinationMapBtn.textContent = pendingDestPlaceMode ? "取消新增目的地" : "＋ 目的地";
  addDestinationMapBtn.setAttribute("aria-pressed", pendingDestPlaceMode ? "true" : "false");
  mapContainer?.classList.toggle("is-placing-destination", Boolean(pendingDestPlaceMode && show));
}

function clearPendingDestPlaceMode() {
  pendingDestPlaceMode = false;
  pendingDestMapPlacement = null;
  syncAddDestinationMapBtn();
}

function toggleDestPlaceMode() {
  if (!editMode || !adminSessionOk) {
    return;
  }
  if (pendingDestPlaceMode) {
    clearPendingDestPlaceMode();
    updateNodeSaveStatus();
    return;
  }
  if (panoramaPoints.length === 0) {
    updateNodeSaveStatus("請先在平面圖新增路徑節點（紅點），再放置目的地。");
    return;
  }
  if (pendingBuildingDraft) {
    clearPendingBuildingDraft();
  }
  pendingDestPlaceMode = true;
  setMapMarkersDisplayMode("all");
  syncAddDestinationMapBtn();
  updateNodeSaveStatus("請在平面圖點選目的地位置（Esc 取消）");
}

function syncMapMarkersDisplayMode() {
  mapContainer?.classList.remove("hide-map-destinations", "hide-map-markers");
  if (mapMarkersDisplayMode === "no-dest") {
    mapContainer?.classList.add("hide-map-destinations");
  } else if (mapMarkersDisplayMode === "none") {
    mapContainer?.classList.add("hide-map-markers");
  }
  if (!toggleMapDestinationsBtn) {
    return;
  }
  const label = MAP_MARKERS_DISPLAY_LABELS[mapMarkersDisplayMode] || MAP_MARKERS_DISPLAY_LABELS.all;
  toggleMapDestinationsBtn.textContent = label;
  toggleMapDestinationsBtn.dataset.mode = mapMarkersDisplayMode;
  toggleMapDestinationsBtn.setAttribute("aria-label", label);
  toggleMapDestinationsBtn.title =
    "點擊切換：都顯示（紅點＋綠標）→ 不顯示目的地（只藏綠標）→ 都不顯示（紅點與綠標都藏）";
}

function setMapMarkersDisplayMode(mode) {
  mapMarkersDisplayMode = MAP_MARKERS_DISPLAY_MODES.includes(mode) ? mode : "all";
  syncMapMarkersDisplayMode();
}

function cycleMapMarkersDisplayMode() {
  const index = MAP_MARKERS_DISPLAY_MODES.indexOf(mapMarkersDisplayMode);
  const next = MAP_MARKERS_DISPLAY_MODES[(index + 1) % MAP_MARKERS_DISPLAY_MODES.length];
  setMapMarkersDisplayMode(next);
}

function whenWelcomeNoticeClosed() {
  return welcomeNoticeClosedPromise || Promise.resolve();
}

/** 網址／定位自動開播：等首次公告播完或手動關閉後才開始 */
function requestAutoPathPlaybackAfterWelcome() {
  whenWelcomeNoticeClosed().then(() => {
    if (typeof startAutoPathPlaybackHandler !== "function") {
      return;
    }
    if (!computedPath?.steps?.length) {
      return;
    }
    if (outdoorNavigationActive && !hasArrivedAtCampus()) {
      return;
    }
    startAutoPathPlaybackHandler();
  });
}

function setupWelcomeNotice() {
  const modal = document.getElementById("welcomeNoticeModal");
  const titleEl = document.getElementById("welcomeNoticeTitle");
  const bodyEl = document.getElementById("welcomeNoticeBody");
  const countdownEl = document.getElementById("welcomeNoticeCountdown");
  const closeBtn = document.getElementById("welcomeNoticeCloseBtn");
  welcomeNoticeClosedPromise = Promise.resolve();
  if (!modal || typeof NavArrowSettings === "undefined") {
    return;
  }

  const notice = NavArrowSettings.pickWelcomeNotice(location);
  if (!notice.enabled) {
    return;
  }
  if (!notice.showEveryVisit && NavArrowSettings.hasSeenWelcomeNotice(notice)) {
    return;
  }

  let left = notice.countdownSec;
  let timer = null;
  let closed = false;

  welcomeNoticeClosedPromise = new Promise((resolve) => {
    const dismiss = () => {
      if (closed) {
        return;
      }
      closed = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      modal.classList.add("hidden");
      if (!notice.showEveryVisit) {
        NavArrowSettings.markWelcomeNoticeSeen(notice);
      }
      resolve();
    };

    if (titleEl) {
      titleEl.textContent = notice.title;
    }
    if (bodyEl) {
      bodyEl.textContent = notice.body;
    }
    if (countdownEl) {
      countdownEl.textContent = String(left);
    }

    modal.classList.remove("hidden");
    closeBtn?.addEventListener("click", dismiss, { once: true });
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        dismiss();
      }
    });

    timer = setInterval(() => {
      left -= 1;
      if (countdownEl) {
        countdownEl.textContent = String(Math.max(0, left));
      }
      if (left <= 0) {
        dismiss();
      }
    }, 1000);
  });
}

function maybeShowEndFeedbackNotice() {
  const modal = document.getElementById("endFeedbackNoticeModal");
  const titleEl = document.getElementById("endFeedbackNoticeTitle");
  const bodyEl = document.getElementById("endFeedbackNoticeBody");
  const countdownEl = document.getElementById("endFeedbackNoticeCountdown");
  const closeBtn = document.getElementById("endFeedbackNoticeCloseBtn");
  const formLink = document.getElementById("endFeedbackFormLink");
  if (!modal || typeof NavArrowSettings === "undefined") {
    return;
  }
  if (!modal.classList.contains("hidden")) {
    return;
  }

  const notice = NavArrowSettings.pickEndFeedbackNotice(location);
  if (!notice.enabled) {
    return;
  }
  if (!notice.showEveryVisit && NavArrowSettings.hasSeenUrlNotice(notice)) {
    return;
  }

  if (typeof modal._endFeedbackCleanup === "function") {
    modal._endFeedbackCleanup();
  }

  let left = notice.countdownSec;
  let timer = null;
  let closed = false;

  const dismiss = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (typeof modal._endFeedbackCleanup === "function") {
      modal._endFeedbackCleanup();
    }
    modal.classList.add("hidden");
    if (!notice.showEveryVisit) {
      NavArrowSettings.markUrlNoticeSeen(notice);
    }
  };

  const onCloseClick = () => dismiss();
  const onBackdropClick = (event) => {
    if (event.target === modal) {
      dismiss();
    }
  };

  modal._endFeedbackCleanup = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    closeBtn?.removeEventListener("click", onCloseClick);
    modal.removeEventListener("click", onBackdropClick);
    modal._endFeedbackCleanup = null;
  };

  if (titleEl) {
    titleEl.textContent = notice.title;
  }
  if (bodyEl) {
    bodyEl.textContent = notice.body;
  }
  if (countdownEl) {
    countdownEl.textContent = String(left);
  }
  if (formLink) {
    const url = String(notice.formUrl || "").trim();
    if (url) {
      formLink.href = url;
      formLink.textContent = notice.formButtonLabel || "填寫回饋";
      formLink.classList.remove("hidden");
    } else {
      formLink.removeAttribute("href");
      formLink.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
  closeBtn?.addEventListener("click", onCloseClick);
  modal.addEventListener("click", onBackdropClick);

  timer = setInterval(() => {
    left -= 1;
    if (countdownEl) {
      countdownEl.textContent = String(Math.max(0, left));
    }
    if (left <= 0) {
      dismiss();
    }
  }, 1000);
}

/** @type {{ scope: string, nodeId: string, nodeName: string, yaw: number, pitch: number, url: string } | null} */
let pendingSavePanoSpot = null;

function closeSavePanoSpotModal() {
  document.getElementById("savePanoSpotModal")?.classList.add("hidden");
  pendingSavePanoSpot = null;
}

async function openSavePanoSpotModal() {
  const point = getPointById(currentPanoramaPointId);
  if (!point?.id) {
    setPanoramaHint("目前沒有開啟的環景節點，無法儲存據點。");
    return;
  }
  const yaw =
    typeof PanoramaViewer?.getYaw === "function" ? PanoramaViewer.getYaw() : 0;
  const pitch =
    typeof PanoramaViewer?.getPitch === "function" ? PanoramaViewer.getPitch() : 0;
  const scopeKey = getStorageKey();
  const parsed = parseScopeKey(scopeKey);
  const scopeFile =
    parsed?.mode === "building" ? `${parsed.buildingId}_${parsed.floorId}` : "campus";
  const url = buildCurrentPanoSpotUrl(point, scopeKey, { yaw, pitch });
  const defaultLabel = `${point.name || point.id}（面向 ${Math.round(yaw)}°）`;

  pendingSavePanoSpot = {
    scope: scopeFile,
    nodeId: String(point.id),
    nodeName: String(point.name || "").trim(),
    yaw: Number.isFinite(yaw) ? yaw : 0,
    pitch: Number.isFinite(pitch) ? pitch : 0,
    url
  };

  const modal = document.getElementById("savePanoSpotModal");
  const labelInput = document.getElementById("savePanoSpotLabel");
  const metaEl = document.getElementById("savePanoSpotMeta");
  const statusEl = document.getElementById("savePanoSpotStatus");
  const qrCanvas = document.getElementById("savePanoSpotQr");
  if (labelInput) {
    labelInput.value = defaultLabel;
  }
  if (metaEl) {
    metaEl.textContent = `樓層 ${scopeFile} · 節點 ${point.name || point.id} · yaw ${Math.round(yaw)}°`;
  }
  if (statusEl) {
    statusEl.textContent = "";
  }
  modal?.classList.remove("hidden");
  labelInput?.focus();
  labelInput?.select();

  if (qrCanvas && url) {
    try {
      await renderQrToCanvas(url, qrCanvas, { width: 200 });
    } catch (error) {
      console.warn(error);
      if (statusEl) {
        statusEl.textContent = "QR 預覽失敗，仍可儲存連結。";
      }
    }
  }
}

async function confirmSavePanoSpot() {
  if (!pendingSavePanoSpot || typeof NavArrowSettings === "undefined") {
    return;
  }
  const labelInput = document.getElementById("savePanoSpotLabel");
  const statusEl = document.getElementById("savePanoSpotStatus");
  const label =
    String(labelInput?.value || "").trim().slice(0, 80) ||
    pendingSavePanoSpot.nodeName ||
    pendingSavePanoSpot.nodeId;
  const spot = {
    id: `spot_${Date.now()}_${Math.round(pendingSavePanoSpot.yaw * 100)}`,
    label,
    scope: pendingSavePanoSpot.scope,
    nodeId: pendingSavePanoSpot.nodeId,
    nodeName: pendingSavePanoSpot.nodeName,
    yaw: pendingSavePanoSpot.yaw,
    pitch: pendingSavePanoSpot.pitch,
    createdAt: Date.now()
  };
  try {
    if (statusEl) {
      statusEl.textContent = "儲存中…";
    }
    const current = NavArrowSettings.load();
    const nextPresets = NavArrowSettings.normalizePanoSpotPresets([
      ...(current.panoSpotPresets || []),
      spot
    ]);
    await NavArrowSettings.saveAndPersist({
      ...current,
      panoSpotPresets: nextPresets
    });
    if (statusEl) {
      statusEl.textContent = `已儲存「${label}」。可至管理後台 → 連結／QR → 各據點環景 管理。`;
    }
    setPanoramaHint(`已儲存據點面向「${label}」。`);
    const copied = await copyShareText(pendingSavePanoSpot.url);
    if (copied && statusEl) {
      statusEl.textContent += " 連結已複製。";
    }
  } catch (error) {
    console.warn(error);
    if (statusEl) {
      statusEl.textContent = "儲存失敗，請確認已登入且伺服器可用。";
    }
  }
}

function setupSavePanoSpotUi() {
  panoramaSaveSpotBtn?.addEventListener("click", () => {
    void openSavePanoSpotModal();
  });
  document.getElementById("savePanoSpotConfirm")?.addEventListener("click", () => {
    void confirmSavePanoSpot();
  });
  document.getElementById("savePanoSpotCancel")?.addEventListener("click", closeSavePanoSpotModal);
  document.getElementById("savePanoSpotModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      closeSavePanoSpotModal();
    }
  });
}

function setupMapDestinationsToggle() {
  syncMapMarkersDisplayMode();
  toggleMapDestinationsBtn?.addEventListener("click", () => {
    cycleMapMarkersDisplayMode();
  });
}

function setupAddDestinationMapBtn() {
  addDestinationMapBtn?.addEventListener("click", toggleDestPlaceMode);
}

function openDestinationModal(pointId) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  destinationModalMode = "pano";
  destinationEditPointId = pointId;
  pendingDestMapPlacement = null;
  if (destinationModalTitle) {
    destinationModalTitle.textContent = `在「${point.name}」新增目的地`;
  }
  if (destinationModalDesc) {
    destinationModalDesc.textContent =
      "輸入名稱後會先出現在平面圖上，接著可在環景標記方向（可取消，稍後再補）。";
  }
  if (destinationModalConfirm) {
    destinationModalConfirm.textContent = "新增並標記方向";
  }
  destinationBindField?.classList.add("hidden");
  if (destinationNameInput) {
    destinationNameInput.value = "";
  }
  destinationModal?.classList.remove("hidden");
  destinationNameInput?.focus();
}

function openMapDestinationModal(xPercent, yPercent) {
  if (panoramaPoints.length === 0) {
    updateNodeSaveStatus("請先新增路徑節點（紅點）再放置目的地。");
    clearPendingDestPlaceMode();
    return;
  }
  const nearest = findNearestPathNode(xPercent, yPercent);
  destinationModalMode = "map";
  destinationEditPointId = nearest?.id || panoramaPoints[0].id;
  pendingDestMapPlacement = { xPercent, yPercent };
  pendingDestPlaceMode = false;
  syncAddDestinationMapBtn();
  if (destinationModalTitle) {
    destinationModalTitle.textContent = "在平面圖新增目的地";
  }
  if (destinationModalDesc) {
    destinationModalDesc.textContent =
      "名稱會顯示為綠色標記。訪客搜尋會走到綁定的路徑節點；朝向可之後在環景補上。";
  }
  if (destinationModalConfirm) {
    destinationModalConfirm.textContent = "確認新增";
  }
  destinationBindField?.classList.remove("hidden");
  fillDestinationBindSelect(destinationEditPointId);
  if (destinationNameInput) {
    destinationNameInput.value = "";
  }
  destinationModal?.classList.remove("hidden");
  destinationNameInput?.focus();
}

function closeDestinationModal() {
  destinationEditPointId = null;
  pendingDestMapPlacement = null;
  destinationModalMode = "pano";
  destinationBindField?.classList.add("hidden");
  destinationModal?.classList.add("hidden");
}

function confirmDestinationModal() {
  const name = destinationNameInput?.value?.trim();
  if (!name) {
    alert("請輸入目的地名稱。");
    return;
  }
  if (destinationModalMode === "map") {
    const pointId = destinationBindSelect?.value || destinationEditPointId;
    const coords = pendingDestMapPlacement;
    if (!pointId || !coords) {
      alert("找不到要綁定的路徑節點。");
      return;
    }
    closeDestinationModal();
    const dest = addDestination(pointId, {
      name,
      xPercent: coords.xPercent,
      yPercent: coords.yPercent
    });
    if (dest) {
      updateNodeSaveStatus(`已新增目的地「${name}」。可拖到教室位置；進環景可補朝向。`);
    }
    return;
  }

  const pointId = destinationEditPointId;
  const point = getPointById(pointId);
  if (!pointId || !point) {
    alert("找不到節點資料，請關閉選單後再試一次。");
    return;
  }
  const offset = offsetDestinationAroundPoint(point, (point.destinations || []).length);
  closeDestinationModal();
  const dest = addDestination(pointId, {
    name,
    xPercent: offset.xPercent,
    yPercent: offset.yPercent
  });
  if (!dest) {
    return;
  }
  beginDestinationPlacement(pointId, name, dest.id);
}

function setupDestinationModal() {
  if (!destinationModal) {
    return;
  }

  destinationModalConfirm?.addEventListener("click", confirmDestinationModal);
  destinationModalCancel?.addEventListener("click", closeDestinationModal);
  destinationModal.addEventListener("click", (event) => {
    if (event.target === destinationModal) {
      closeDestinationModal();
    }
  });
  destinationNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      destinationModalConfirm?.click();
    }
  });
}

function showDestinationWizardBar() {
  destinationWizardBar?.classList.remove("hidden");
  linkWizardBar?.classList.add("hidden");
  updatePanoramaEditUI();
}

function updateDestinationWizardBarUI() {
  if (!destinationWizard || !destinationWizardStepText) {
    return;
  }
  destinationWizardStepText.textContent = `在「${destinationWizard.pointName}」左右轉向「${destinationWizard.name}」，按「使用目前面向」後按「確認完成」。不想標記可按取消，平面圖標記仍會保留。`;
}

function destWizardCaptureView() {
  const view = PanoramaViewer.captureCurrentView();
  if (!view || !destinationWizard) {
    return;
  }
  destinationWizard.pendingYaw = view.yaw;
  PanoramaViewer.setPreviewDestinationHotspot(view.yaw, destinationWizard.name);
  setPanoramaHint(
    `已記錄面向 ${Math.round(view.yaw)}°，綠色方框會固定在該方向。按「確認完成」儲存朝向。`,
    true
  );
}

function destWizardConfirmStep() {
  if (!destinationWizard) {
    return;
  }
  const view =
    destinationWizard.pendingYaw != null
      ? applyWalkOrientation(destinationWizard.pendingYaw, 0)
      : PanoramaViewer.captureCurrentView();
  if (!view) {
    alert("請先左右轉向目的地，再按「使用目前面向」或「確認完成」。");
    return;
  }

  const { pointId, name, destId } = destinationWizard;
  if (destId) {
    updateDestinationOrientation(pointId, destId, view.yaw, view.pitch);
  } else {
    addDestination(pointId, {
      id: `${Date.now()}_dest`,
      name,
      yaw: view.yaw,
      pitch: view.pitch
    });
  }

  const point = getPointById(pointId);
  const focusId = destId || (point?.destinations || []).at(-1)?.id;
  cancelDestinationWizard();
  alert(`目的地「${name}」已標記方向。轉動環景可看到綠色方框。`);
  if (point) {
    openPanoramaViewer(point, focusId ? { focusDestinationId: focusId } : {});
  }
}

function beginDestinationPlacement(pointId, name, destId = null) {
  const point = getPointById(pointId);
  if (!point) {
    alert("找不到節點資料，請關閉選單後再試一次。");
    return;
  }
  if (typeof PanoramaViewer === "undefined") {
    alert("環景元件尚未載入，請重新整理頁面（Ctrl+F5）。");
    return;
  }

  cancelLinkWizard();
  destinationWizard = {
    pointId,
    destId,
    pointName: point.name,
    name,
    pendingYaw: null
  };
  currentPanoramaPointId = pointId;

  const overlay = document.getElementById("panoramaOverlay");
  const title = document.getElementById("panoramaTitle");
  overlay.classList.remove("hidden");
  document.body.classList.add("panorama-open");
  syncSidePanelOpenClass();
  title.textContent = `目的地：${point.name} · ${name}`;

  showDestinationWizardBar();
  updateDestinationWizardBarUI();
  setPanoramaHint("左右轉動環景面向目的地，再按下方按鈕操作。取消則只保留平面圖標記。", true);

  PanoramaViewer.mount("panoramaViewer", point.url, { levelView: true });
}

function setupDestinationWizardBar() {
  destWizardCaptureBtn?.addEventListener("click", destWizardCaptureView);
  destWizardConfirmBtn?.addEventListener("click", destWizardConfirmStep);
  destWizardCancelBtn?.addEventListener("click", () => {
    const pointId = destinationWizard?.pointId || currentPanoramaPointId;
    cancelDestinationWizard();
    PanoramaViewer.destroy();
    document.getElementById("panoramaViewer").innerHTML = "";
    document.getElementById("panoramaOverlay")?.classList.add("hidden");
    document.body.classList.remove("panorama-open");
    setPanoramaHint("");
    updateNodeSaveStatus("已保留平面圖目的地標記，朝向尚未設定。");
    if (pointId) {
      const point = getPointById(pointId);
      if (point) {
        openPanoramaViewer(point);
      }
    }
  });
}

function renderDestinationSearch() {
  if (!destSearchResults) {
    return;
  }
  const rawQuery = destSearchInput?.value?.trim() || "";
  const { nameQuery, scopeFilter } = parseScopedQuery(rawQuery);
  const all = getAllSearchableLocationItems();
  const matches = nameQuery
    ? all.filter(
        (item) =>
          (item.name.toLowerCase().includes(nameQuery) ||
            item.pointName.toLowerCase().includes(nameQuery) ||
            item.scopeName.toLowerCase().includes(nameQuery)) &&
          matchesScopeFilter(item.scopeKey, scopeFilter)
      )
    : [];

  destSearchResults.innerHTML = "";
  if (!nameQuery) {
    return;
  }
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "dest-empty";
    empty.textContent = "找不到符合的目的地或節點。";
    destSearchResults.appendChild(empty);
    return;
  }

  const referenceNodeRef = pathFrom?.value ? resolveReferenceNodeRef(pathFrom.value) : null;
  const groups = groupDestinationsByName(matches);

  groups.forEach((group) => {
    const row = document.createElement("li");
    row.className = "dest-search-item";

    const gotoBtn = document.createElement("button");
    gotoBtn.type = "button";
    gotoBtn.className = "dest-search-goto";
    gotoBtn.textContent = group.name;
    if (group.items.length > 1) {
      const count = document.createElement("span");
      count.className = "dest-search-count";
      count.textContent = `${group.items.length} 處`;
      gotoBtn.appendChild(count);
    }
    gotoBtn.addEventListener("click", () => {
      const picked = pickNearestDestinationItem(group.items, referenceNodeRef);
      if (!picked) {
        return;
      }
      if (picked.kind === "destination" && picked.id && !String(picked.id).startsWith("node:")) {
        navigateToPoint(picked.pointId, picked.scopeKey, { focusDestinationId: picked.id });
        return;
      }
      navigateToPoint(picked.pointId, picked.scopeKey);
    });

    const meta = document.createElement("span");
    meta.className = "dest-search-meta";
    const locationLabels = [
      ...new Set(
        group.items.map((item) =>
          item.kind === "node"
            ? item.scopeName
            : `${item.pointName}（${item.scopeName}）`
        )
      )
    ];
    meta.textContent = locationLabels.join("、");
    if (referenceNodeRef && group.items.length > 1) {
      const nearest = pickNearestDestinationItem(group.items, referenceNodeRef);
      if (nearest) {
        const nearestLabel =
          nearest.kind === "node"
            ? nearest.scopeName
            : `${nearest.pointName}（${nearest.scopeName}）`;
        meta.textContent += ` · 最近：${nearestLabel}`;
      }
    }

    row.appendChild(gotoBtn);
    row.appendChild(meta);
    destSearchResults.appendChild(row);
  });
}

function setupDestinationSearch() {
  destSearchInput?.addEventListener("input", renderDestinationSearch);
}

function showLinkWizardBar() {
  linkWizardBar?.classList.remove("hidden");
  destinationWizardBar?.classList.add("hidden");
  hidePanoramaNavButtons();
  panoramaCaptureView?.classList.add("hidden");
  updatePanoramaEditUI();
}

function updateLinkWizardBarUI() {
  if (!linkWizard || !linkWizardStepText) {
    return;
  }
  const target = getPointByRef(linkWizard.targetId, linkWizard.targetScopeKey);
  const from = getPointByRef(linkWizard.fromId, linkWizard.fromScopeKey);
  if (linkWizard.step === "exit") {
    linkWizardStepText.textContent = `步驟 1/3：在「${from?.name}」左右轉向「${target?.name}」，按「使用目前面向」後按「確認此步驟」。`;
    linkWizardDistanceRow?.classList.add("hidden");
    wizardConfirmBtn.textContent = "確認此步驟";
  } else if (linkWizard.step === "distance") {
    if (linkDistanceInput) {
      linkDistanceInput.value = String(linkWizard.suggestedDistance ?? 10);
    }
    const sameScope = linkWizard.fromScopeKey === linkWizard.targetScopeKey;
    linkWizardStepText.textContent = sameScope
      ? `步驟 2/3：輸入到「${target?.name}」的大致距離（公尺）（已依平面圖估算，可修改）。`
      : `步驟 2/3：輸入到「${target?.name}」的大致距離（公尺）。`;
    linkWizardDistanceRow?.classList.remove("hidden");
    wizardConfirmBtn.textContent = "確認距離，下一步";
  } else if (linkWizard.step === "entry") {
    linkWizardStepText.textContent = `步驟 3/3：在「${target?.name}」設定進入後的面向，按「使用目前面向」後按「確認完成」。`;
    linkWizardDistanceRow?.classList.add("hidden");
    wizardConfirmBtn.textContent = "確認完成連線";
  }
}

function hidePanoramaNavButtons() {
  if (panoramaNavButtons) {
    panoramaNavButtons.classList.add("hidden");
    panoramaNavButtons.innerHTML = "";
  }
}

function wizardCaptureView() {
  const view = PanoramaViewer.captureCurrentView();
  if (!view || !linkWizard) {
    return;
  }
  if (linkWizard.step === "exit") {
    linkWizard.pendingYaw = view.yaw;
    const target = getPointByRef(linkWizard.targetId, linkWizard.targetScopeKey);
    PanoramaViewer.setPreviewHotspot(view.yaw, `→ ${target?.name || "目標"}（預覽）`);
    setPanoramaHint(
      `已記錄面向 ${Math.round(view.yaw)}°，地面箭頭會固定在該方向（轉動環景可找到）。按「確認此步驟」繼續。`,
      true
    );
  } else if (linkWizard.step === "entry") {
    linkWizard.pendingEntryYaw = view.yaw;
    setPanoramaHint(`已記錄到達面向 ${Math.round(view.yaw)}°，請按「確認完成連線」。`, true);
  }
}

function wizardConfirmStep() {
  if (!linkWizard) {
    return;
  }

  if (linkWizard.step === "exit") {
    const view =
      linkWizard.pendingYaw != null
        ? applyWalkOrientation(linkWizard.pendingYaw, 0)
        : PanoramaViewer.captureCurrentView();
    if (!view) {
      alert("請先左右轉向目標，再按「使用目前面向」或「確認此步驟」。");
      return;
    }
    linkWizard.exitYaw = view.yaw;
    linkWizard.exitPitch = view.pitch;
    linkWizard.step = "distance";
    linkWizard.pendingYaw = null;
    PanoramaViewer.clearNavHotspots();
    updateLinkWizardBarUI();
    return;
  }

  if (linkWizard.step === "distance") {
    linkWizard.distance = Math.max(1, Number(linkDistanceInput?.value) || 10);
    linkWizard.step = "entry";
    linkWizard.pendingEntryYaw = null;
    startLinkEntryStep();
    return;
  }

  if (linkWizard.step === "entry") {
    const view =
      linkWizard.pendingEntryYaw != null
        ? applyWalkOrientation(linkWizard.pendingEntryYaw, 0)
        : PanoramaViewer.captureCurrentView();
    if (!view) {
      alert("請設定到達後的面向，再按「確認完成連線」。");
      return;
    }
    finishLinkWizard(view.yaw, view.pitch);
  }
}

function applyWalkOrientation(yaw, pitch) {
  if (typeof PanoramaViewer !== "undefined") {
    return PanoramaViewer.normalizeWalkOrientation(yaw, pitch);
  }
  return { yaw, pitch: 0 };
}

function scheduleMinimapLayoutSync() {
  if (minimapLayoutRaf) {
    cancelAnimationFrame(minimapLayoutRaf);
  }
  minimapLayoutRaf = requestAnimationFrame(() => {
    minimapLayoutRaf = null;
    syncMinimapLayout();
  });
}

function syncMinimapLayout() {
  const minimap = document.getElementById("panoramaMinimap");
  const stage = minimap?.querySelector(".panorama-minimap-stage");
  const mapStage = minimap?.querySelector(".panorama-minimap-map-stage");
  const img = document.getElementById("panoramaMinimapImage");
  if (!stage || !mapStage || !img) {
    return;
  }

  const containerW = stage.clientWidth - 8;
  const maxHeight = 156;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;

  if (!containerW || !nw || !nh) {
    mapStage.style.width = "";
    mapStage.style.height = "";
    return;
  }

  const scale = Math.min(containerW / nw, maxHeight / nh);
  const displayW = Math.max(1, Math.round(nw * scale));
  const displayH = Math.max(1, Math.round(nh * scale));

  mapStage.style.width = `${displayW}px`;
  mapStage.style.height = `${displayH}px`;
}

function setupMinimapLayoutSync() {
  const img = document.getElementById("panoramaMinimapImage");
  img?.addEventListener("load", scheduleMinimapLayoutSync);
  window.addEventListener("resize", () => {
    if (!document.getElementById("panoramaMinimap")?.classList.contains("hidden")) {
      scheduleMinimapLayoutSync();
    }
  });
}

function getMapImageForScope(scopeKey) {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed || parsed.mode === "campus") {
    return CAMPUS_MAP.image;
  }
  const building = getBuildingsRegistry()[parsed.buildingId];
  const floor = building?.floors?.find((f) => f.id === parsed.floorId);
  return floor?.image || CAMPUS_MAP.fallbackImage;
}

function getMinimapPointsForScope(scopeKey) {
  const allPoints = normalizePoints(clonePointsData(getScopePointsSource(scopeKey)), scopeKey);
  if (allPoints.length <= 35) {
    return allPoints;
  }

  const visibleIds = new Set();
  const current = allPoints.find((p) => p.id === currentPanoramaPointId);
  if (current) {
    visibleIds.add(current.id);
    (current.links || []).forEach((link) => {
      const targetScope = link.targetScopeKey || scopeKey;
      if (targetScope === scopeKey) {
        visibleIds.add(link.targetId);
      }
    });
  }

  if (computedPath?.steps?.length) {
    computedPath.steps.forEach((step) => {
      if (step.scopeKey === scopeKey) {
        visibleIds.add(step.pointId);
      }
    });
  }

  return allPoints.filter((p) => visibleIds.has(p.id));
}

function appendMinimapLine(svg, x1, y1, x2, y2, className) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", className);
  svg.appendChild(line);
}

function hidePanoramaMinimap() {
  document.getElementById("panoramaMinimap")?.classList.add("hidden");
}

function renderPanoramaMinimap() {
  const minimap = document.getElementById("panoramaMinimap");
  const overlay = document.getElementById("panoramaOverlay");
  if (!minimap || !overlay || overlay.classList.contains("hidden") || !currentPanoramaPointId) {
    hidePanoramaMinimap();
    return;
  }

  const scopeKey = getStorageKey();
  const scopePoints = normalizePoints(clonePointsData(getScopePointsSource(scopeKey)), scopeKey);
  const currentPoint = scopePoints.find((p) => p.id === currentPanoramaPointId);
  if (!currentPoint) {
    hidePanoramaMinimap();
    return;
  }

  minimap.classList.remove("hidden");

  const label = document.getElementById("panoramaMinimapLabel");
  const img = document.getElementById("panoramaMinimapImage");
  const mapStage = minimap.querySelector(".panorama-minimap-map-stage");
  if (!mapStage) {
    return;
  }

  if (label) {
    label.textContent = getScopeDisplayName(scopeKey);
  }
  if (img) {
    img.src = getMapImageForScope(scopeKey);
    img.alt = `${getScopeDisplayName(scopeKey)} 小地圖`;
  }

  const visiblePoints = getMinimapPointsForScope(scopeKey);
  const visibleIds = new Set(visiblePoints.map((p) => p.id));
  const currentPathStepIndex = findPathStepIndex(
    computedPath?.steps,
    scopeKey,
    currentPanoramaPointId,
    { preferAfter: getPathProgressHint() }
  );

  const svg = mapStage.querySelector(".panorama-minimap-lines");
  if (svg) {
    svg.innerHTML = "";

    visiblePoints.forEach((point) => {
      (point.links || []).forEach((link) => {
        const targetScope = link.targetScopeKey || scopeKey;
        if (targetScope !== scopeKey || !visibleIds.has(link.targetId)) {
          return;
        }
        const target = scopePoints.find((p) => p.id === link.targetId);
        if (!target) {
          return;
        }
        appendMinimapLine(
          svg,
          point.xPercent,
          point.yPercent,
          target.xPercent,
          target.yPercent,
          "minimap-line-link"
        );
      });
    });

    if (computedPath?.steps?.length) {
      for (let i = 0; i < computedPath.steps.length - 1; i += 1) {
        const stepA = computedPath.steps[i];
        const stepB = computedPath.steps[i + 1];
        if (stepA.scopeKey !== scopeKey || stepB.scopeKey !== scopeKey) {
          continue;
        }
        const pointA = scopePoints.find((p) => p.id === stepA.pointId);
        const pointB = scopePoints.find((p) => p.id === stepB.pointId);
        if (!pointA || !pointB) {
          continue;
        }
        const className = i < currentPathStepIndex ? "minimap-line-path-done" : "minimap-line-path";
        appendMinimapLine(
          svg,
          pointA.xPercent,
          pointA.yPercent,
          pointB.xPercent,
          pointB.yPercent,
          `minimap-line ${className}`
        );
      }
    }
  }

  const markersHost = mapStage.querySelector(".panorama-minimap-markers");
  if (markersHost) {
    markersHost.innerHTML = "";
    const waypointStepIndexes = new Set(
      (computedPath?.waypointStops || []).map((stop) => stop.stepIndex)
    );
    visiblePoints.forEach((point) => {
      const dot = document.createElement("div");
      dot.className = "minimap-marker";
      const isCurrent = point.id === currentPanoramaPointId;
      const pathIdx = findPathStepIndex(computedPath?.steps, scopeKey, point.id, {
        preferAfter: getPathProgressHint()
      });
      const isWaypoint =
        pathIdx >= 0 &&
        waypointStepIndexes.has(pathIdx) &&
        computedPath?.steps?.[pathIdx] &&
        isSameNodeRef(
          computedPath.steps[pathIdx].scopeKey,
          computedPath.steps[pathIdx].pointId,
          scopeKey,
          point.id
        );
      if (isCurrent) {
        dot.classList.add("minimap-marker-current");
      } else if (isWaypoint) {
        dot.classList.add("minimap-marker-waypoint");
        if (pathIdx <= currentPathStepIndex) {
          dot.classList.add("minimap-marker-path-done");
        }
      } else if (pathIdx >= 0) {
        dot.classList.add(
          pathIdx <= currentPathStepIndex ? "minimap-marker-path-done" : "minimap-marker-path"
        );
      }
      dot.style.left = `${point.xPercent}%`;
      dot.style.top = `${point.yPercent}%`;
      const waypointMeta = isWaypoint
        ? (computedPath.waypointStops || []).find((stop) => stop.stepIndex === pathIdx)
        : null;
      dot.title = waypointMeta
        ? `${point.name}（停靠 · ${formatWaypointStayLabel(waypointMeta)}）`
        : point.name;
      markersHost.appendChild(dot);
    });
  }

  if (img?.complete && img.naturalWidth) {
    scheduleMinimapLayoutSync();
  }
  if (typeof NavArrowSettings !== "undefined" && typeof NavArrowSettings.applyOverlayStyle === "function") {
    NavArrowSettings.applyOverlayStyle();
  }
}

function refreshPanoramaMinimapIfOpen() {
  const overlay = document.getElementById("panoramaOverlay");
  if (!overlay?.classList.contains("hidden") && currentPanoramaPointId) {
    renderPanoramaMinimap();
  } else {
    hidePanoramaMinimap();
  }
}

function openPanoramaViewer(point, options = {}) {
  const overlay = document.getElementById("panoramaOverlay");
  const title = document.getElementById("panoramaTitle");
  if (!overlay || typeof PanoramaViewer === "undefined") {
    return;
  }

  linkWizard = null;
  cancelLinkWizard();
  cancelDestinationWizard();

  currentPanoramaPointId = point.id;
  title.textContent = point.name;
  overlay.classList.remove("hidden");
  document.body.classList.add("panorama-open");
  syncSidePanelOpenClass();

  destinationWizardBar?.classList.add("hidden");
  updatePanoramaEditUI();

  const fromPoint = options.viaLinkFromId
    ? getPointByRef(options.viaLinkFromId, options.viaLinkFromScopeKey || getStorageKey())
    : null;
  const currentScopeKey = getStorageKey();
  const viaLink = fromPoint?.links?.find(
    (l) =>
      l.targetId === point.id &&
      (l.targetScopeKey || options.viaLinkFromScopeKey || currentScopeKey) === currentScopeKey
  );
  const guidanceActive = isPathGuidanceActive(options);
  const pathNextCenteringActive = shouldApplyPathNextCentering(options);
  let focusLink = options.focusLinkId
    ? (point.links || []).find((l) => l.id === options.focusLinkId)
    : null;
  const pathNextLink = guidanceActive
    ? getNextPathFocusLink(point, currentScopeKey, {
        prevScopeKey: options.viaLinkFromScopeKey,
        prevPointId: options.viaLinkFromId
      })
    : null;
  if (!focusLink && pathNextCenteringActive) {
    focusLink = pathNextLink;
  }

  hidePanoramaNavButtons();
  let hint =
    "地面箭頭：前往下一節點；綠色方框：轉向標記的目的地（方框會跟著環景移動）。";
  const pathStepIndex = findPathStepIndex(computedPath?.steps, currentScopeKey, point.id, {
    preferAfter: getPathProgressHint(),
    prevScopeKey: options.viaLinkFromScopeKey,
    prevPointId: options.viaLinkFromId
  });
  if (guidanceActive && pathStepIndex >= 0) {
    const nextStep = computedPath.steps[pathStepIndex + 1];
    if (nextStep) {
      const next = getPointByRef(nextStep.pointId, nextStep.scopeKey);
      if (next) {
        const nextLabel =
          nextStep.scopeKey !== currentScopeKey
            ? `${next.name}（${getScopeDisplayName(nextStep.scopeKey)}）`
            : next.name;
        hint += ` 路徑導航：請點擊地面箭頭前往「${nextLabel}」。`;
      }
    } else if (computedPath?.endDestinationName) {
      hint += ` 已抵達「${computedPath.endDestinationName}」。`;
    } else {
      hint += " 已抵達路徑終點。";
    }
  }

  const hotspots = buildHotspotsForPoint(point);
  const destinations = buildDestinationsForPoint(point);
  const focusDestination = resolvePathEndDestinationToFace(point, {
    focusDestinationId: options.focusDestinationId,
    scopeKey: currentScopeKey
  });
  const elevatorArrivalDest = options.followComputedPath
    ? resolveElevatorArrivalDestination(point, {
        scopeKey: currentScopeKey,
        viaLinkFromId: options.viaLinkFromId,
        viaLinkFromScopeKey: options.viaLinkFromScopeKey
      })
    : null;

  let initialYaw = options.initialYaw;
  let initialPitch = 0;
  const elevatorExitTurnLink =
    !editMode &&
    guidanceActive &&
    elevatorArrivalDest &&
    !focusDestination &&
    pathNextLink &&
    typeof pathNextLink.yaw === "number" &&
    !options.skipAutoFace
      ? pathNextLink
      : null;
  const deferAutoFaceLink =
    !editMode &&
    guidanceActive &&
    point.autoFaceNext &&
    pathNextLink &&
    typeof pathNextLink.yaw === "number" &&
    !options.skipAutoFace &&
    !focusDestination &&
    !elevatorArrivalDest
      ? pathNextLink
      : null;

  if (options.forceInitialView && typeof options.initialYaw === "number") {
    const entry = applyWalkOrientation(options.initialYaw, options.initialPitch);
    initialYaw = entry.yaw;
    initialPitch = entry.pitch;
  } else if (focusDestination) {
    // 終點目的地：先進場面向（與轉彎輔助相同），掛載後再慢慢轉過去
    if (viaLink && typeof viaLink.entryYaw === "number") {
      const entry = applyWalkOrientation(viaLink.entryYaw, viaLink.entryPitch);
      initialYaw = entry.yaw;
      initialPitch = entry.pitch;
    } else if (typeof options.initialYaw === "number") {
      const entry = applyWalkOrientation(options.initialYaw, options.initialPitch);
      initialYaw = entry.yaw;
      initialPitch = entry.pitch;
    } else if (elevatorArrivalDest) {
      // 電梯直達終點：先進場面向電梯，再轉向終點目的地
      const elev = applyWalkOrientation(elevatorArrivalDest.yaw, elevatorArrivalDest.pitch);
      initialYaw = elev.yaw;
      initialPitch = elev.pitch;
    }
    hint += ` 抵達「${focusDestination.name}」，即將轉向面向。`;
  } else if (elevatorArrivalDest) {
    // 出電梯：先進場面向電梯口，掛載後再轉向路徑／道路方向
    const elev = applyWalkOrientation(elevatorArrivalDest.yaw, elevatorArrivalDest.pitch);
    initialYaw = elev.yaw;
    initialPitch = elev.pitch;
    hint += elevatorExitTurnLink
      ? " 已出電梯，即將轉向路徑方向。"
      : " 已抵達電梯出口，請依地面箭頭繼續前往目的地。";
  } else if (deferAutoFaceLink) {
    // 轉彎輔助：先維持進場面向，掛載後再旋轉對準路徑下一箭頭
    if (viaLink && typeof viaLink.entryYaw === "number") {
      const entry = applyWalkOrientation(viaLink.entryYaw, viaLink.entryPitch);
      initialYaw = entry.yaw;
      initialPitch = entry.pitch;
    } else if (typeof options.initialYaw === "number") {
      const entry = applyWalkOrientation(options.initialYaw, options.initialPitch);
      initialYaw = entry.yaw;
      initialPitch = entry.pitch;
    }
  } else if (
    pathNextCenteringActive &&
    pathNextLink &&
    typeof pathNextLink.yaw === "number" &&
    !options.skipCenterPathNext
  ) {
    // 路徑導航：進站後直接對準下一箭頭（畫面中央），方便滑鼠接著點
    const focus = applyWalkOrientation(pathNextLink.yaw, pathNextLink.pitch);
    initialYaw = focus.yaw;
    initialPitch = focus.pitch;
  } else if (focusLink && typeof focusLink.yaw === "number") {
    const focus = applyWalkOrientation(focusLink.yaw, focusLink.pitch);
    initialYaw = focus.yaw;
    initialPitch = focus.pitch;
  } else if (viaLink && typeof viaLink.entryYaw === "number") {
    const entry = applyWalkOrientation(viaLink.entryYaw, viaLink.entryPitch);
    initialYaw = entry.yaw;
    initialPitch = entry.pitch;
  } else if (typeof options.initialYaw === "number") {
    const entry = applyWalkOrientation(options.initialYaw, options.initialPitch);
    initialYaw = entry.yaw;
    initialPitch = entry.pitch;
  }

  // 樓梯姿態只在「離開前一站」做抬頭／低頭；進站保持水平，
  // 避免進站先帶仰角再回 0°，看起來像莫名往下頓（例如 1004→2035）

  if (editMode && !linkWizard && !destinationWizard) {
    hint =
      "編輯模式：可拖動地面箭頭調整位置；也可按「＋ 新增連線」或「＋ 新增目的地」。";
  }
  setPanoramaHint(hint);

  preloadRelatedPanoramas(point, initialYaw);
  if (computedPath?.steps?.length) {
    const stepIndex = findPathStepIndex(computedPath.steps, currentScopeKey, point.id, {
      preferAfter: getPathProgressHint(),
      prevScopeKey: options.viaLinkFromScopeKey,
      prevPointId: options.viaLinkFromId
    });
    preloadPathPanoramas(
      computedPath,
      stepIndex >= 0 ? stepIndex : pathAutoPlayStep,
      PATH_PANORAMA_PRELOAD_AHEAD
    );
  }

  PanoramaViewer.mount("panoramaViewer", point.url, {
    hotspots,
    destinations,
    arrowEditMode: editMode,
    onArrowDragEnd: (linkId, nextYaw, nextPitch) => {
      updateLinkArrowPosition(point.id, linkId, nextYaw, nextPitch);
    },
    onDestination: (destId) => {
      const dest = (point.destinations || []).find((d) => d.id === destId);
      if (!dest) {
        return;
      }
      runAutoFaceDestinationIfNeeded(dest, null, PanoramaViewer.getYaw?.() ?? null);
    },
    onNavigate: (targetRef) => {
      const { targetScopeKey, targetId } = decodeTargetRef(targetRef);
      const from = getPointById(currentPanoramaPointId);
      const link = from?.links?.find(
        (l) => l.targetId === targetId && (l.targetScopeKey || getStorageKey()) === targetScopeKey
      );
      const resolvedScopeKey = link?.targetScopeKey || targetScopeKey || getStorageKey();
      const target = getPointByRef(targetId, resolvedScopeKey);
      if (target) {
        const entry = link
          ? applyWalkOrientation(link.entryYaw, link.entryPitch)
          : { yaw: undefined, pitch: 0 };
        const go = () => {
          const openOpts = {
            viaLinkFromId: from?.id,
            viaLinkFromScopeKey: getStorageKey(),
            initialYaw: entry.yaw,
            initialPitch: entry.pitch,
            followComputedPath: Boolean(computedPath?.steps?.length)
          };
          const endStep = computedPath?.steps?.[computedPath.steps.length - 1];
          const goingToPathEnd =
            endStep &&
            isSameNodeRef(endStep.scopeKey, endStep.pointId, resolvedScopeKey, target.id);
          if (goingToPathEnd) {
            if (computedPath.endDestinationId) {
              openOpts.focusDestinationId = computedPath.endDestinationId;
            } else {
              const only = (target.destinations || []).filter((d) => hasDestinationYaw(d));
              if (only.length === 1) {
                openOpts.focusDestinationId = only[0].id;
              }
            }
          }
          navigateToPoint(target.id, resolvedScopeKey, openOpts);
        };
        if (
          isPathElevatorHopTo(getStorageKey(), from?.id, resolvedScopeKey, target.id)
        ) {
          runElevatorDepartureFaceThen(from, target, () =>
            showElevatorRideOverlay(getStorageKey(), resolvedScopeKey, go)
          );
          return;
        }
        runFloorChangeDepartureGesture(link, go);
      }
    },
    initialYaw,
    initialPitch
  }).then(() => {
    refreshPanoramaArrowEditMode();
    renderPanoramaMinimap();
    const afterAutoFace = () => {
      if (typeof options.afterMount === "function") {
        options.afterMount();
      }
    };
    if (focusDestination) {
      const fromYawHint = typeof initialYaw === "number" ? initialYaw : null;
      runAutoFaceDestinationIfNeeded(focusDestination, afterAutoFace, fromYawHint);
      return;
    }
    if (elevatorExitTurnLink) {
      const fromYawHint = typeof initialYaw === "number" ? initialYaw : null;
      runAutoFaceNextIfNeeded(point, elevatorExitTurnLink, afterAutoFace, fromYawHint, {
        force: true,
        holdMs: 650,
        hint: "出電梯：轉向路徑方向…"
      });
      return;
    }
    if (deferAutoFaceLink) {
      const fromYawHint = typeof initialYaw === "number" ? initialYaw : null;
      runAutoFaceNextIfNeeded(point, deferAutoFaceLink, afterAutoFace, fromYawHint);
    } else {
      // 若進站時已對準路徑下一箭頭，但實際 yaw 仍偏離（例如切景插值），再瞬移對準一次
      const shouldRecenter =
        !editMode &&
        pathNextCenteringActive &&
        !options.skipCenterPathNext &&
        pathNextLink &&
        typeof pathNextLink.yaw === "number" &&
        !focusDestination &&
        !elevatorArrivalDest;
      if (shouldRecenter) {
        const target = applyWalkOrientation(pathNextLink.yaw, pathNextLink.pitch);
        const currentYaw =
          typeof PanoramaViewer.getYaw === "function" ? PanoramaViewer.getYaw() : null;
        const delta =
          typeof currentYaw === "number" ? yawAbsDeltaDegrees(currentYaw, target.yaw) : 999;
        if (delta > 6) {
          PanoramaViewer.lookAt(target.yaw, target.pitch, 0, afterAutoFace);
          return;
        }
      }
      afterAutoFace();
    }
  }).catch(() => {
    if (typeof options.afterMount === "function") {
      options.afterMount();
    }
  });
}

function switchToScope(scopeKey) {
  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    return false;
  }

  if (parsed.mode === "campus") {
    showCampusMap();
    return true;
  }

  const building = getBuildingsRegistry()[parsed.buildingId];
  if (!building) {
    return false;
  }

  const floorExists = building.floors.some((f) => f.id === parsed.floorId);
  if (!floorExists) {
    return false;
  }

  viewState = { mode: "building", buildingId: parsed.buildingId, floorId: parsed.floorId };
  buildingHotspots.classList.add("hidden");
  backBtn.classList.remove("hidden");
  floorSwitcher.classList.remove("hidden");
  if (campusMapStyle === "satellite") {
    setCampusMapStyle("custom", { persist: false, refresh: false });
  }
  renderFloorSwitcher(building);
  showCurrentFloor();
  return true;
}

function navigateToPoint(pointId, scopeKey, options = {}) {
  const changed = switchToScope(scopeKey);
  if (!changed) {
    alert("找不到目標樓層資料，無法切換。");
    return;
  }
  const targetPoint = getPointById(pointId);
  if (!targetPoint) {
    alert("找不到目標節點，請確認資料是否存在。");
    return;
  }
  openPanoramaViewer(targetPoint, options);
}

function beginLinkPlacement(
  fromId,
  targetId,
  fromScopeKey = getStorageKey(),
  targetScopeKey = getStorageKey(),
  options = {}
) {
  if (!switchToScope(fromScopeKey)) {
    alert("找不到起點樓層，請重新操作。");
    return;
  }

  const from = getPointById(fromId);
  const target = getPointByRef(targetId, targetScopeKey);
  if (!from || !target) {
    alert("找不到節點資料，請關閉選單後再試一次。");
    return;
  }
  if (typeof PanoramaViewer === "undefined") {
    alert("環景元件尚未載入，請重新整理頁面（Ctrl+F5）。");
    return;
  }

  linkWizard = {
    fromId,
    targetId,
    fromScopeKey,
    targetScopeKey,
    step: "exit",
    pendingYaw: null,
    pendingEntryYaw: null,
    suggestedDistance:
      options.suggestedDistance ??
      suggestLinkDistance(fromScopeKey, fromId, targetScopeKey, targetId)
  };
  currentPanoramaPointId = fromId;

  const overlay = document.getElementById("panoramaOverlay");
  const title = document.getElementById("panoramaTitle");
  overlay.classList.remove("hidden");
  document.body.classList.add("panorama-open");
  syncSidePanelOpenClass();
  title.textContent = `連線：${from.name} → ${target.name}`;

  destinationWizardBar?.classList.add("hidden");
  showLinkWizardBar();
  updateLinkWizardBarUI();
  setPanoramaHint("左右轉動環景後，按下方按鈕操作。", true);

  PanoramaViewer.mount("panoramaViewer", from.url, { levelView: true }).then(() => {
    renderPanoramaMinimap();
  });
}

function startLinkEntryStep() {
  if (!switchToScope(linkWizard.targetScopeKey)) {
    cancelLinkWizard();
    alert("無法切換到目標樓層，連線已取消。");
    return;
  }

  const target = getPointById(linkWizard.targetId);
  if (!target) {
    cancelLinkWizard();
    return;
  }
  currentPanoramaPointId = target.id;
  document.getElementById("panoramaTitle").textContent = `連線：設定到達「${target.name}」的面向`;
  updateLinkWizardBarUI();
  setPanoramaHint("左右轉動環景，設定進入後要面向的方向。", true);
  PanoramaViewer.mount("panoramaViewer", target.url, { levelView: true }).then(() => {
    renderPanoramaMinimap();
  });
}

function finishLinkWizard(entryYaw, entryPitch) {
  const entry = applyWalkOrientation(entryYaw, entryPitch);
  const { fromId, targetId, fromScopeKey, targetScopeKey, exitYaw, exitPitch, distance } =
    linkWizard;
  if (!switchToScope(fromScopeKey)) {
    cancelLinkWizard();
    alert("無法切回起點樓層，連線儲存失敗。");
    return;
  }
  const from = getPointById(fromId);
  const target = getPointByRef(targetId, targetScopeKey);
  const savedDistance = distance;
  const targetPoint = getPointByRef(targetId, targetScopeKey);
  const hasReverse = pointHasLinkTo(targetPoint, fromId, fromScopeKey, targetScopeKey);

  addLink(fromId, {
    targetId,
    targetScopeKey,
    yaw: exitYaw,
    pitch: exitPitch,
    distance,
    entryYaw: entry.yaw,
    entryPitch: entry.pitch
  });

  cancelLinkWizard();

  if (!hasReverse && target && from) {
    const proceed = confirm(
      `「${from.name} → ${target.name}」已連線完成。\n是否接著設定「${target.name} → ${from.name}」的反向連線？`
    );
    if (proceed) {
      beginLinkPlacement(targetId, fromId, targetScopeKey, fromScopeKey, {
        suggestedDistance: savedDistance
      });
      return;
    }
  }

  alert(`連線完成！距離 ${savedDistance} 公尺。`);
  if (from) {
    openPanoramaViewer(from);
  }
}

function setupLinkWizardBar() {
  wizardCaptureBtn?.addEventListener("click", wizardCaptureView);
  wizardConfirmBtn?.addEventListener("click", wizardConfirmStep);
  wizardCancelBtn?.addEventListener("click", () => {
    cancelLinkWizard();
    PanoramaViewer.destroy();
    document.getElementById("panoramaViewer").innerHTML = "";
    document.getElementById("panoramaOverlay")?.classList.add("hidden");
    document.body.classList.remove("panorama-open");
    setPanoramaHint("");
  });
}

function buildPathSuggestionLabels() {
  const entries = [];
  getAllPointsGlobal().forEach((point) => {
    if (point.name.trim()) {
      entries.push({ label: point.name.trim(), scopeKey: point.scopeKey });
    }
  });
  getAllDestinationsGlobal().forEach((dest) => {
    if (dest.name.trim()) {
      entries.push({ label: dest.name.trim(), scopeKey: dest.scopeKey });
    }
  });

  const labelCounts = new Map();
  entries.forEach((entry) => {
    const key = entry.label.toLowerCase();
    labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
  });

  const labels = new Set();
  entries.forEach((entry) => {
    const duplicated = (labelCounts.get(entry.label.toLowerCase()) || 0) > 1;
    labels.add(
      duplicated ? `${entry.label}（${getScopeDisplayName(entry.scopeKey)}）` : entry.label
    );
  });
  return [...labels].sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

function updatePathSuggestions() {
  if (!pathSuggestions) {
    return;
  }
  pathSuggestions.innerHTML = buildPathSuggestionLabels()
    .map((name) => `<option value="${escapeHtmlAttr(name)}"></option>`)
    .join("");
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildGlobalNavigationGraph() {
  const nodes = new Map();
  const edges = new Map();

  readPointsByScope().forEach((points, scopeKey) => {
    points.forEach((point) => {
      const ref = encodeNodeRef(scopeKey, point.id);
      nodes.set(ref, { scopeKey, pointId: point.id, point });
      edges.set(ref, []);
    });
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

function getPathFloorTravelMode() {
  const el = document.getElementById("pathFloorMode");
  return normalizeFloorTravelMode(el?.value || "stairs");
}

function findShortestPath(startScopeKey, startId, endScopeKey, endId, floorMode = getPathFloorTravelMode()) {
  const mode = normalizeFloorTravelMode(floorMode);
  const startRef = encodeNodeRef(startScopeKey, startId);
  const endRef = encodeNodeRef(endScopeKey, endId);
  if (startRef === endRef) {
    const point = getPointByRef(startId, startScopeKey);
    return {
      steps: [{ scopeKey: startScopeKey, pointId: startId, name: point?.name, arriveVia: null }],
      totalDistance: 0,
      floorMode: mode
    };
  }

  const { nodes, edges } = buildGlobalNavigationGraph();
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
      arriveVia: index === 0 ? null : prevKind.get(ref) || "walk",
      isElevatorStop: index > 0 && prevKind.get(ref) === "elevator"
    };
  });

  // 顯示距離仍用未放大的估計：沿實際邊長加總（電梯用虛擬公尺）
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

function setupPathfinding() {
  setupPathWaypointsUi();
  const panoramaPauseAutoBtn = document.getElementById("panoramaPauseAutoBtn");
  const panoramaWaypointHold = document.getElementById("panoramaWaypointHold");
  const panoramaWaypointProgress = document.getElementById("panoramaWaypointProgress");
  const panoramaWaypointHoldText = document.getElementById("panoramaWaypointHoldText");
  const panoramaWaypointCountdown = document.getElementById("panoramaWaypointCountdown");
  const panoramaWaypointContinueBtn = document.getElementById("panoramaWaypointContinueBtn");
  const pathShareBtn = document.getElementById("pathShareBtn");
  const playSpeedUpBtn = document.getElementById("playSpeedUpBtn");
  const playSpeedDownBtn = document.getElementById("playSpeedDownBtn");
  const PLAY_DELAY_STEP = 0.2;

  const getAutoDelayMs = () => {
    const bounds = getPlayDelayBounds();
    const seconds = Math.min(
      bounds.max,
      Math.max(bounds.min, Number(pathAutoDelay?.value || getDefaultPlayDelaySec()) || bounds.min)
    );
    return Math.round(seconds * 1000);
  };

  const clearWaypointCountdown = () => {
    if (pathWaypointCountdownTimer) {
      clearInterval(pathWaypointCountdownTimer);
      pathWaypointCountdownTimer = null;
    }
  };

  const hideWaypointHold = () => {
    pathWaypointHoldActive = false;
    clearWaypointCountdown();
    panoramaWaypointHold?.classList.add("hidden");
    panoramaWaypointProgress?.classList.add("hidden");
    panoramaWaypointCountdown?.classList.add("hidden");
    if (panoramaWaypointProgress) {
      panoramaWaypointProgress.textContent = "";
    }
    if (panoramaWaypointCountdown) {
      panoramaWaypointCountdown.textContent = "";
    }
    if (panoramaWaypointContinueBtn) {
      panoramaWaypointContinueBtn.textContent = "繼續前往下一站";
    }
  };

  const showWaypointProgress = (stop) => {
    if (!panoramaWaypointProgress) {
      return;
    }
    panoramaWaypointProgress.textContent = getWaypointProgressLabel(stop);
    panoramaWaypointProgress.classList.remove("hidden");
  };

  const renderWaypointCountdown = (stop) => {
    const remainingMs = Math.max(0, pathAutoPlayDueAt - Date.now());
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const progress = getWaypointProgressLabel(stop);
    showWaypointProgress(stop);
    if (panoramaWaypointHoldText) {
      panoramaWaypointHoldText.textContent = `已抵達「${stop.query}」`;
    }
    if (panoramaWaypointCountdown) {
      panoramaWaypointCountdown.textContent = `還剩 ${remainingSec} 秒`;
      panoramaWaypointCountdown.classList.remove("hidden");
    }
    setPanoramaHint(
      `${progress} · 還剩 ${remainingSec} 秒（可按「立即繼續」或空白鍵提前前往）。`
    );
    return remainingMs;
  };

  const beginWaypointHold = (stop) => {
    pathWaypointHoldActive = true;
    clearStayTimer();
    clearWaypointCountdown();
    showWaypointProgress(stop);
    if (panoramaWaypointHoldText) {
      panoramaWaypointHoldText.textContent = `已抵達「${stop.query}」，請按下方按鈕再繼續。`;
    }
    panoramaWaypointCountdown?.classList.add("hidden");
    if (panoramaWaypointContinueBtn) {
      panoramaWaypointContinueBtn.textContent = "繼續前往下一站";
    }
    panoramaWaypointHold?.classList.remove("hidden");
    setPanoramaHint(`${getWaypointProgressLabel(stop)}。看完後請按「繼續前往下一站」。`);
  };

  const beginWaypointCountdown = (stop) => {
    pathWaypointHoldActive = true;
    clearWaypointCountdown();
    const waitMs = Math.round(clampWaypointStaySeconds(stop.seconds) * 1000);
    if (panoramaWaypointContinueBtn) {
      panoramaWaypointContinueBtn.textContent = "立即繼續";
    }
    panoramaWaypointHold?.classList.remove("hidden");
    scheduleNextAutoStep(waitMs);
    renderWaypointCountdown(stop);
    pathWaypointCountdownTimer = setInterval(() => {
      if (!pathAutoPlayActive || !pathWaypointHoldActive) {
        clearWaypointCountdown();
        return;
      }
      const remainingMs = renderWaypointCountdown(stop);
      if (remainingMs <= 0) {
        clearWaypointCountdown();
      }
    }, 200);
  };

  const continueFromWaypointHold = () => {
    if (!pathAutoPlayActive || !pathWaypointHoldActive) {
      return;
    }
    hideWaypointHold();
    setPanoramaHint("路徑自動播放中，可按空白鍵或「暫停導覽」隨時暫停。");
    scheduleNextAutoStep(0);
  };

  const clearStayTimer = () => {
    if (pathAutoPlayTimer) {
      clearTimeout(pathAutoPlayTimer);
      pathAutoPlayTimer = null;
    }
    pathAutoPlayDueAt = 0;
    pathAutoPlayScheduledDelayMs = 0;
  };

  const clearAutoPathTimers = () => {
    clearStayTimer();
    if (pathAutoPlayTurnTimer) {
      clearTimeout(pathAutoPlayTurnTimer);
      pathAutoPlayTurnTimer = null;
    }
    hideElevatorRideOverlay();
    // 注意：不清除 pathDestinationFaceTimer，避免播完最後一站時打斷「面向目的地」
  };

  const scheduleNextAutoStep = (delayMs) => {
    if (pathAutoPlayTimer) {
      clearTimeout(pathAutoPlayTimer);
      pathAutoPlayTimer = null;
    }
    const waitMs = Math.max(0, delayMs);
    pathAutoPlayScheduledDelayMs = waitMs;
    pathAutoPlayDueAt = Date.now() + waitMs;
    pathAutoPlayTimer = setTimeout(playAutoPathStep, waitMs);
  };

  const rescheduleAutoPlayStay = () => {
    if (!pathAutoPlayActive || pathAutoPlayPaused || !pathAutoPlayTimer) {
      return;
    }
    const oldDelay = pathAutoPlayScheduledDelayMs || getAutoDelayMs();
    const remaining = Math.max(0, pathAutoPlayDueAt - Date.now());
    const newDelay = getAutoDelayMs();
    const newRemaining =
      oldDelay > 0 ? Math.round(remaining * (newDelay / oldDelay)) : newDelay;
    scheduleNextAutoStep(newRemaining);
  };

  const setPlayDelaySeconds = (nextSeconds) => {
    if (!pathAutoDelay) {
      return false;
    }
    const bounds = getPlayDelayBounds();
    const next =
      Math.round(Math.min(bounds.max, Math.max(bounds.min, nextSeconds)) * 10) / 10;
    const current = Number(pathAutoDelay.value || getDefaultPlayDelaySec());
    if (Math.abs(next - current) < 0.001) {
      updatePlaySpeedHud();
      return false;
    }
    pathAutoDelay.value = String(next);
    updateAutoDelayLabel();
    updatePlaySpeedHud();
    rescheduleAutoPlayStay();
    return true;
  };

  const adjustPlayDelayBy = (deltaSec) =>
    setPlayDelaySeconds(Number(pathAutoDelay?.value || getDefaultPlayDelaySec()) + deltaSec);

  const isTypingTarget = (target) => {
    const tag = target?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
  };

  const updateAutoPlayUI = () => {
    if (!pathGoBtn) {
      return;
    }
    if (!pathAutoPlayActive) {
      pathGoBtn.textContent = "自動播放路徑";
      pathStopBtn?.classList.add("hidden");
      panoramaPauseAutoBtn?.classList.add("hidden");
      // 路徑仍就緒、尚未播放時顯示「取消播放」
      pathCancelBtn?.classList.toggle("hidden", !computedPath?.steps?.length);
      return;
    }
    pathCancelBtn?.classList.add("hidden");
    pathStopBtn?.classList.remove("hidden");
    panoramaPauseAutoBtn?.classList.remove("hidden");
    if (pathAutoPlayPaused) {
      pathGoBtn.textContent = "繼續播放";
      if (panoramaPauseAutoBtn) {
        panoramaPauseAutoBtn.textContent = "▶ 繼續導覽";
        panoramaPauseAutoBtn.setAttribute("aria-pressed", "true");
      }
    } else {
      pathGoBtn.textContent = "暫停";
      if (panoramaPauseAutoBtn) {
        panoramaPauseAutoBtn.textContent = "⏸ 暫停導覽";
        panoramaPauseAutoBtn.setAttribute("aria-pressed", "false");
      }
    }
  };

  const stopAutoPathPlayback = (keepButtonText = false) => {
    hideWaypointHold();
    clearAutoPathTimers();
    // 不清除 pathDestinationFaceTimer：播完最後一站時可能仍在等待／執行動畫轉向
    pathAutoPlayActive = false;
    pathAutoPlayPaused = false;
    pathAutoPlayStep = 0;
    pathGuidanceActive = false;
    if (!keepButtonText) {
      updateAutoPlayUI();
      // 結束自動播放（非開播前清場）→ 補周圍預載供自由導覽
      preloadNeighborsForCurrentPoint();
    }
    updatePlaySpeedHud();
  };

  const pauseAutoPathPlayback = () => {
    if (!pathAutoPlayActive || pathAutoPlayPaused || pathWaypointHoldActive) {
      return;
    }
    clearAutoPathTimers();
    pathAutoPlayPaused = true;
    updateAutoPlayUI();
    updatePlaySpeedHud();
    setPanoramaHint("路徑自動播放已暫停，可按空白鍵、「繼續導覽」或側邊選單的「繼續播放」。");
    setVisitorPathGuide("已暫停…可按「繼續播放」或空白鍵繼續。");
    preloadNeighborsForCurrentPoint();
  };

  const resumeAutoPathPlayback = () => {
    if (!pathAutoPlayActive || !pathAutoPlayPaused) {
      return;
    }
    pathAutoPlayPaused = false;
    updateAutoPlayUI();
    updatePlaySpeedHud();
    setPanoramaHint("路徑自動播放中，可按空白鍵或「暫停導覽」隨時暫停。");
    setVisitorPathGuide("導覽中…可暫停或調整速度。");
    scheduleNextAutoStep(getAutoDelayMs());
  };

  const toggleAutoPathPlayback = () => {
    if (!pathAutoPlayActive) {
      return;
    }
    if (pathAutoPlayPaused) {
      resumeAutoPathPlayback();
    } else {
      pauseAutoPathPlayback();
    }
  };

  const playAutoPathStep = () => {
    hideWaypointHold();
    if (!pathAutoPlayActive || pathAutoPlayPaused) {
      return;
    }
    if (!computedPath?.steps?.length) {
      stopAutoPathPlayback();
      return;
    }
    if (pathAutoPlayStep >= computedPath.steps.length) {
      stopAutoPathPlayback();
      setPanoramaHint(
        computedPath.endDestinationName
          ? `路徑自動播放完成（終點「${computedPath.endDestinationName}」）。`
          : "路徑自動播放完成。"
      );
      enterVisitorFreeBrowse(
        computedPath.endDestinationName
          ? `已抵達「${computedPath.endDestinationName}」。可自由瀏覽，或在右側選單搜尋／重設起點。`
          : "路徑播放完成。可自由瀏覽，或在右側選單搜尋／重設起點。"
      );
      maybeShowEndFeedbackNotice();
      return;
    }

    const step = computedPath.steps[pathAutoPlayStep];
    const point = getPointByRef(step.pointId, step.scopeKey);
    if (!point) {
      pathAutoPlayStep += 1;
      playAutoPathStep();
      return;
    }

    preloadPathPanoramas(computedPath, pathAutoPlayStep, PATH_PANORAMA_PRELOAD_AHEAD);

    const prevStep = pathAutoPlayStep > 0 ? computedPath.steps[pathAutoPlayStep - 1] : null;
    const nextStep =
      pathAutoPlayStep < computedPath.steps.length - 1
        ? computedPath.steps[pathAutoPlayStep + 1]
        : null;
    const focusLink = nextStep
      ? (point.links || []).find(
          (l) =>
            l.targetId === nextStep.pointId &&
            (l.targetScopeKey || step.scopeKey) === nextStep.scopeKey
        )
      : null;
    const isLastStep = pathAutoPlayStep === computedPath.steps.length - 1;

    const openOptions = {
      viaLinkFromId: prevStep?.pointId,
      viaLinkFromScopeKey: prevStep?.scopeKey,
      followComputedPath: true,
      afterMount: () => {
        if (!pathAutoPlayActive || pathAutoPlayPaused) {
          return;
        }
        const arrivedIndex = pathAutoPlayStep - 1;
        const isLastArrived = arrivedIndex >= computedPath.steps.length - 1;
        // 最後一站：面向目的地完成後結束播放，並顯示結束回饋（勿再 schedule 下一步）
        if (isLastArrived) {
          pathAutoPlayActive = false;
          pathAutoPlayPaused = false;
          pathGuidanceActive = true;
          updateAutoPlayUI();
          updatePlaySpeedHud();
          // 面向提示由 runAutoFaceDestinationIfNeeded 設定；此處只在無終點面向時收尾
          if (!computedPath.endDestinationId) {
            setPanoramaHint("路徑自動播放完成。");
          }
          enterVisitorFreeBrowse(
            computedPath.endDestinationName
              ? `已抵達「${computedPath.endDestinationName}」。可自由瀏覽，或在右側選單搜尋／重設起點。`
              : "路徑播放完成。可自由瀏覽，或在右側選單搜尋／重設起點。"
          );
          maybeShowEndFeedbackNotice();
          return;
        }
        const stop = (computedPath.waypointStops || []).find((item) => item.stepIndex === arrivedIndex);
        if (stop?.waitMode === "button") {
          beginWaypointHold(stop);
          return;
        }
        if (stop?.waitMode === "seconds") {
          beginWaypointCountdown(stop);
          return;
        }
        scheduleNextAutoStep(getAutoDelayMs());
      }
    };
    if (shouldCenterPathNextArrow()) {
      openOptions.focusLinkId = focusLink?.id;
    }
    if (isLastStep && computedPath.endDestinationId) {
      openOptions.focusDestinationId = computedPath.endDestinationId;
    }

    const leaveLink =
      prevStep &&
      getPointByRef(prevStep.pointId, prevStep.scopeKey)?.links?.find(
        (l) =>
          l.targetId === step.pointId &&
          (l.targetScopeKey || prevStep.scopeKey) === step.scopeKey
      );

    const goNext = () => {
      navigateToPoint(step.pointId, step.scopeKey, openOptions);
      pathAutoPlayStep += 1;
    };

    // 搭電梯：先轉向本站電梯 → overlay → 進對樓環景
    if (step.arriveVia === "elevator") {
      const fromScope = prevStep?.scopeKey || getStorageKey();
      const fromPoint = prevStep
        ? getPointByRef(prevStep.pointId, prevStep.scopeKey)
        : getPointById(currentPanoramaPointId);
      runElevatorDepartureFaceThen(fromPoint, point, () =>
        showElevatorRideOverlay(fromScope, step.scopeKey, goNext)
      );
      return;
    }

    runFloorChangeDepartureGesture(leaveLink, goNext);
  };

  const startAutoPathPlayback = () => {
    if (!computedPath?.steps?.length) {
      return;
    }
    stopAutoPathPlayback(true);
    setVisitorFreeBrowse(false);
    pathAutoPlayActive = true;
    pathAutoPlayPaused = false;
    pathAutoPlayStep = 0;
    pathGuidanceActive = true;
    stripAutoStartFromUrl();
    setSidePanelOpen(false);
    updateAutoPlayUI();
    updatePlaySpeedHud();
    setPanoramaHint("路徑自動播放中，可按空白鍵或「暫停導覽」隨時暫停。");
    setVisitorPathGuide("導覽中…可暫停或調整速度。");
    preloadPathPanoramas(computedPath, 0, PATH_PANORAMA_PRELOAD_AHEAD);
    playAutoPathStep();
  };

  applyPlayDelaySliderBounds({ useDefault: true });
  pathAutoDelay?.addEventListener("input", () => {
    updateAutoDelayLabel();
    updatePlaySpeedHud();
    rescheduleAutoPlayStay();
  });

  playSpeedUpBtn?.addEventListener("click", () => adjustPlayDelayBy(-PLAY_DELAY_STEP));
  playSpeedDownBtn?.addEventListener("click", () => adjustPlayDelayBy(PLAY_DELAY_STEP));

  document.addEventListener("keydown", (event) => {
    if (!pathAutoPlayActive || event.repeat || isTypingTarget(event.target)) {
      return;
    }
    const overlay = document.getElementById("panoramaOverlay");
    if (overlay?.classList.contains("hidden")) {
      return;
    }
    const isSpace = event.key === " " || event.code === "Space";
    if (isSpace) {
      if (event.target?.closest("button, a")) {
        return;
      }
      event.preventDefault();
      if (pathWaypointHoldActive) {
        continueFromWaypointHold();
        return;
      }
      toggleAutoPathPlayback();
      return;
    }
    const faster = event.key === "+" || event.key === "=" || event.key === "ArrowUp";
    const slower = event.key === "-" || event.key === "_" || event.key === "ArrowDown";
    if (!faster && !slower) {
      return;
    }
    event.preventDefault();
    adjustPlayDelayBy(faster ? -PLAY_DELAY_STEP : PLAY_DELAY_STEP);
  });

  const calculatePath = async () => {
    stopAutoPathPlayback();
    clearOutdoorPathResult();
    const startQuery = pathFrom?.value?.trim();
    const endQuery = pathTo?.value?.trim();
    const waypointStops = getPathWaypointStops();
    const waypointQueries = waypointStops.map((stop) => stop.query);
    if (!startQuery || !endQuery) {
      setPathErrorMessage(
        isVisitorMode()
          ? "缺少起點或終點。請返回訪客頁重新選擇後再開始導航。"
          : "請輸入起點與終點（節點或目的地名稱）。"
      );
      return;
    }

    if (isCurrentLocationQuery(startQuery)) {
      setPathErrorMessage(
        isVisitorMode()
          ? "「目前位置」已移除。請改選校門口等校內起點，或用地圖／GPS 大致定位。"
          : "「目前位置」已移除。請改輸入校內節點名稱，或用地圖／GPS 定位。"
      );
      return;
    }

    const orderedQueries = [startQuery, ...waypointQueries, endQuery];
    const resolved = resolveOrderedPathEndpoints(orderedQueries, waypointStops);
    if (!resolved || resolved.error) {
      computedPath = null;
      if (resolved?.error) {
        setPathErrorMessage(
          isVisitorMode()
            ? `找不到「${resolved.fromQuery}」到「${resolved.toQuery}」的路徑。請檢查中途停靠順序與名稱。`
            : `找不到「${resolved.fromQuery}」到「${resolved.toQuery}」的路徑，請確認停靠點順序、名稱與節點連線。`
        );
      } else {
        setPathErrorMessage(
          isVisitorMode()
            ? `找不到「${startQuery}」到「${endQuery}」的路徑。請返回訪客頁改選起點／目的地。`
            : "找不到路徑，請確認名稱正確且節點之間已建立連線與距離。"
        );
      }
      refreshPanoramaMinimapIfOpen();
      return;
    }

    computedPath = {
      ...resolved.result,
      waypointQueries: resolved.waypointQueries,
      waypointStops: resolved.waypointStops,
      endDestinationId: resolved.endDestination?.id || null,
      endDestinationName: resolved.endDestination?.name || null
    };
    preloadPathPanoramas(computedPath, 0, PATH_PANORAMA_PRELOAD_AHEAD);
    const startScopeName = getScopeDisplayName(resolved.start.scopeKey);
    const endScopeName = getScopeDisplayName(resolved.end.scopeKey);
    let extraText = "";
    if (resolved.start.name !== startQuery || resolved.start.scopeKey !== getStorageKey()) {
      extraText += `；起點選「${resolved.start.name}」（${startScopeName}）`;
    }
    if (resolved.endDestination) {
      extraText += `；終點面向「${resolved.endDestination.name}」（${resolved.end.name} · ${endScopeName}）`;
    } else if (resolved.end.name !== endQuery || resolved.end.scopeKey !== getStorageKey()) {
      extraText += `；終點選「${resolved.end.name}」（${endScopeName}）`;
    }
    renderComputedPathResult({
      prefix: "路徑：",
      steps: resolved.result.steps,
      totalDistance: resolved.result.totalDistance,
      extraText,
      waypointStops: resolved.waypointStops
    });
    markPathReadyForPlayback();
    refreshPanoramaMinimapIfOpen();
  };

  pathCalcBtn?.addEventListener("click", () => {
    calculatePath();
  });

  pathFrom?.addEventListener("input", () => {
    renderDestinationSearch();
    resetComputedPathState();
  });
  pathTo?.addEventListener("input", resetComputedPathState);

  pathShareBtn?.addEventListener("click", async () => {
    const from = pathFrom?.value?.trim() || "";
    const to = pathTo?.value?.trim() || "";
    if (!from || !to) {
      alert("請先設定起點與終點。");
      return;
    }
    const stops = getPathWaypointStops();
    const url = buildNavigationShareUrl({
      from: encodeNavQueryForUrl(from),
      to: encodeNavQueryForUrl(to),
      via: encodeNavQueryListForUrl(stops.map((stop) => stop.query)),
      viaStay: stops.length ? encodeWaypointStayList(stops) : "",
      mode: "visitor",
      go: true
    });
    const ok = await copyTextToClipboard(url);
    if (ok) {
      pathShareBtn.textContent = "已複製（會自動開始）";
      setTimeout(() => {
        pathShareBtn.textContent = "複製分享連結";
      }, 1600);
    } else {
      prompt("請手動複製以下連結：", url);
    }
  });

  pathGoBtn?.addEventListener("click", () => {
    if (!computedPath?.steps?.length) {
      return;
    }
    pathGoBtn.classList.remove("path-go-ready");
    if (outdoorNavigationActive && !hasArrivedAtCampus()) {
      alert("請先依 Google 地圖抵達校園，或按「我已抵達校園」後再開始校內自動播放。");
      return;
    }
    if (pathAutoPlayActive) {
      toggleAutoPathPlayback();
      return;
    }
    startAutoPathPlayback();
  });

  pathStopBtn?.addEventListener("click", () => {
    if (!pathAutoPlayActive) {
      return;
    }
    stopAutoPathPlayback();
    setPanoramaHint("已停止路徑自動播放。");
    enterVisitorFreeBrowse();
  });

  pathCancelBtn?.addEventListener("click", () => {
    if (pathAutoPlayActive) {
      stopAutoPathPlayback();
    }
    resetComputedPathState();
    pathStopBtn?.classList.add("hidden");
    panoramaPauseAutoBtn?.classList.add("hidden");
    setPanoramaHint("已取消路徑播放。");
    enterVisitorFreeBrowse("已取消自動播放。可自由瀏覽，或在右側選單重新搜尋／計算路徑。");
    renderMarkers();
  });

  panoramaPauseAutoBtn?.addEventListener("click", () => {
    toggleAutoPathPlayback();
  });

  panoramaWaypointContinueBtn?.addEventListener("click", () => {
    continueFromWaypointHold();
  });

  stopAutoPathPlaybackHandler = stopAutoPathPlayback;
  startAutoPathPlaybackHandler = startAutoPathPlayback;
  calculatePathHandler = calculatePath;
}

function setupPanoramaOverlay() {
  const overlay = document.getElementById("panoramaOverlay");
  const closeBtn = document.getElementById("panoramaClose");
  if (!overlay || !closeBtn) {
    return;
  }

  const closePanorama = () => {
    if (typeof stopAutoPathPlaybackHandler === "function") {
      stopAutoPathPlaybackHandler();
    }
    overlay.classList.add("hidden");
    document.body.classList.remove("panorama-open");
    PanoramaViewer.destroy();
    document.getElementById("panoramaViewer").innerHTML = "";
    currentPanoramaPointId = null;
    linkEditFromId = null;
    cancelLinkWizard();
    cancelDestinationWizard();
    closeDestinationModal();
    setPanoramaHint("");
    hideElevatorRideOverlay();
    clearDestinationFaceTimer();
    hidePanoramaNavButtons();
    updatePanoramaEditUI();
    hidePanoramaMinimap();
  };

  closeBtn.addEventListener("click", closePanorama);
  panoramaSetStartBtn?.addEventListener("click", () => {
    setPathStartFromCurrentPanorama();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!linkModal?.classList.contains("hidden")) {
      closeLinkModal();
      return;
    }
    if (!nodeModal?.classList.contains("hidden")) {
      closeNodeModal();
      return;
    }
    if (!buildingModal?.classList.contains("hidden")) {
      closeBuildingModal();
      return;
    }
    if (!destinationModal?.classList.contains("hidden")) {
      closeDestinationModal();
      return;
    }
    if (destinationWizard && !destinationWizardBar?.classList.contains("hidden")) {
      destWizardCancelBtn?.click();
      return;
    }
    if (linkWizard && !linkWizardBar?.classList.contains("hidden")) {
      wizardCancelBtn?.click();
      return;
    }
    if (pendingBuildingDraft) {
      clearPendingBuildingDraft();
      updateNodeSaveStatus();
      return;
    }
    if (pendingDestPlaceMode) {
      clearPendingDestPlaceMode();
      updateNodeSaveStatus();
      return;
    }
    if (!overlay.classList.contains("hidden")) {
      closePanorama();
    }
  });
}

function normalizePanoramaSrc(input) {
  const value = input.trim();
  if (!value) {
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith("./") || value.startsWith("/") || value.startsWith("../")) {
    return value;
  }
  const baseDir = getPanoramaImageBaseDir();
  return `${baseDir}/${value}`;
}

function getPanoramaImageBaseDir() {
  if (viewState.mode !== "building") {
    return "./images/campus";
  }

  const buildingId = (viewState.buildingId || "").toUpperCase();
  const building = getBuildingsRegistry()[viewState.buildingId];
  const floor = building?.floors?.find((f) => f.id === viewState.floorId);
  const floorLabel = floor?.label || `${viewState.floorId || ""}F`;
  if (!buildingId || !floorLabel) {
    return "./images/campus";
  }
  return `./images/${buildingId}/${floorLabel}`;
}

function confirmAndDeleteDestination(pointId, destId, destName) {
  const label = destName || "這個目的地";
  if (!window.confirm(`確定要刪除目的地「${label}」嗎？不會刪除路徑節點。`)) {
    return;
  }
  removeDestination(pointId, destId);
}

function confirmAndDeletePoint(pointId) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  const ok = window.confirm(`確定要刪除「${point.name}」這個節點嗎？`);
  if (!ok) {
    return;
  }
  // 先清掉指向此節點的連線，再從目前樓層移除節點。
  // 若順序相反，removeLinksToNode 會用尚未更新的 cache 覆寫 panoramaPoints，導致節點「刪不掉」。
  removeLinksToNode(pointId);
  panoramaPoints = panoramaPoints.filter((p) => p.id !== pointId);
  savePanoramaPoints(getStorageKey());
  renderAll();
}
