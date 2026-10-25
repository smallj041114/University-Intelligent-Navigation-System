import { APP_VERSION } from "../lib/app-version.js";

/** 校園圖 URL；`?v=` 跟 package／APP_VERSION，換圖時升版即可破 CF 快取 */
const CAMPUS_MAP_IMAGE = `./images/campus/campus-map.jpg?v=${encodeURIComponent(APP_VERSION)}`;

export const CAMPUS_MAP = {
  title: "校園地圖",
  image: CAMPUS_MAP_IMAGE,
  fallbackImage: "./images/floorplan-s.jpg"
};

export const BUILDINGS = {};

/** 自製校園圖 ↔ 衛星圖對齊說明（錨點詳見 maps 設定 mapGpsAnchors）
 * 自製圖右上≈校門口／東北入口；上方≈S/AA；左側≈EE/P/綜合教學；
 * 環道右側≈田徑場西側道路；環道下方≈球場／設計／宿舍南側。
 */

export const STORAGE_PREFIX = "mcu_nav_nodes_";
export const NODES_DATA_BASE = "./data/nodes/";
export const nodeScopeCache = new Map();
export const pendingFileSaves = new Map();

export const mapContainer = document.getElementById("mapContainer");
export const mapStage = document.getElementById("mapStage");
export const mapImage = document.getElementById("mapImage");
export const buildingHotspots = document.getElementById("buildingHotspots");
export const mapPortals = document.getElementById("mapPortals");
export const mapDistanceScaleBar = document.getElementById("mapDistanceScaleBar");
export const mapDistanceScaleInput = document.getElementById("mapDistanceScaleInput");
export const mapDistanceScaleStatus = document.getElementById("mapDistanceScaleStatus");
export const backBtn = document.getElementById("backBtn");
export const viewTitle = document.getElementById("viewTitle");
export const floorSwitcher = document.getElementById("floorSwitcher");
export const nodeList = document.getElementById("nodeList");
export const nodeListSection = document.getElementById("nodeListSection");
export const sidePanel = document.getElementById("sidePanel");
export const panelToggle = document.getElementById("panelToggle");
export const panelHint = document.getElementById("panelHint");

export const buildingModal = document.getElementById("buildingModal");
export const buildingNameInput = document.getElementById("buildingNameInput");
export const buildingCodeInput = document.getElementById("buildingCodeInput");
export const buildingLabelInput = document.getElementById("buildingLabelInput");
export const buildingFloorLabelInput = document.getElementById("buildingFloorLabelInput");
export const buildingFloorImageInput = document.getElementById("buildingFloorImageInput");
export const buildingModalError = document.getElementById("buildingModalError");
export const buildingModalConfirm = document.getElementById("buildingModalConfirm");
export const buildingModalCancel = document.getElementById("buildingModalCancel");

export const linkModal = document.getElementById("linkModal");
export const linkModalTitle = document.getElementById("linkModalTitle");
export const linkTargetSearch = document.getElementById("linkTargetSearch");
export const linkTargetResults = document.getElementById("linkTargetResults");
export const linkModalError = document.getElementById("linkModalError");
export const linkModalConfirm = document.getElementById("linkModalConfirm");
export const linkModalCancel = document.getElementById("linkModalCancel");
export const panoramaHint = document.getElementById("panoramaHint");
export const panoramaAddLink = document.getElementById("panoramaAddLink");
export const panoramaAddDestination = document.getElementById("panoramaAddDestination");
export const panoramaSetStartBtn = document.getElementById("panoramaSetStartBtn");
export const panoramaSaveSpotBtn = document.getElementById("panoramaSaveSpotBtn");
export const panoramaCaptureView = document.getElementById("panoramaCaptureView");
export const nodeModal = document.getElementById("nodeModal");
export const nodeNameInput = document.getElementById("nodeNameInput");
export const nodeUrlInput = document.getElementById("nodeUrlInput");
export const nodeUrlHint = document.getElementById("nodeUrlHint");
export const nodeImagePicker = document.getElementById("nodeImagePicker");
export const nodePreview = document.getElementById("nodePreview");
export const nodePreviewImage = document.getElementById("nodePreviewImage");
export const nodePreviewStatus = document.getElementById("nodePreviewStatus");
export const nodeModalError = document.getElementById("nodeModalError");
export const nodeModalConfirm = document.getElementById("nodeModalConfirm");
export const nodeModalCancel = document.getElementById("nodeModalCancel");
export const destinationModal = document.getElementById("destinationModal");
export const destinationModalTitle = document.getElementById("destinationModalTitle");
export const destinationModalDesc = document.getElementById("destinationModalDesc");
export const destinationNameInput = document.getElementById("destinationNameInput");
export const destinationBindField = document.getElementById("destinationBindField");
export const destinationBindSelect = document.getElementById("destinationBindSelect");
export const destinationModalConfirm = document.getElementById("destinationModalConfirm");
export const destinationModalCancel = document.getElementById("destinationModalCancel");
export const addDestinationMapBtn = document.getElementById("addDestinationMapBtn");
export const toggleMapDestinationsBtn = document.getElementById("toggleMapDestinationsBtn");
export const destinationWizardBar = document.getElementById("destinationWizardBar");
export const destinationWizardStepText = document.getElementById("destinationWizardStepText");
export const destWizardCaptureBtn = document.getElementById("destWizardCaptureBtn");
export const destWizardConfirmBtn = document.getElementById("destWizardConfirmBtn");
export const destWizardCancelBtn = document.getElementById("destWizardCancelBtn");
export const destSearchInput = document.getElementById("destSearchInput");
export const destSearchResults = document.getElementById("destSearchResults");
export const panoramaNavButtons = document.getElementById("panoramaNavButtons");
export const linkWizardBar = document.getElementById("linkWizardBar");
export const linkWizardStepText = document.getElementById("linkWizardStepText");
export const linkWizardDistanceRow = document.getElementById("linkWizardDistanceRow");
export const linkDistanceInput = document.getElementById("linkDistanceInput");
export const wizardCaptureBtn = document.getElementById("wizardCaptureBtn");
export const wizardConfirmBtn = document.getElementById("wizardConfirmBtn");
export const wizardCancelBtn = document.getElementById("wizardCancelBtn");
export const editModeBtn = document.getElementById("editModeBtn");
export const panoramaEditModeBtn = document.getElementById("panoramaEditModeBtn");
export const pathFrom = document.getElementById("pathFrom");
export const pathTo = document.getElementById("pathTo");
export const pathSuggestions = document.getElementById("pathSuggestions");
export const pathCalcBtn = document.getElementById("pathCalcBtn");
export const pathGoBtn = document.getElementById("pathGoBtn");
export const pathCancelBtn = document.getElementById("pathCancelBtn");
export const pathStopBtn = document.getElementById("pathStopBtn");
export const pathAutoControls = document.getElementById("pathAutoControls");
export const pathAutoDelay = document.getElementById("pathAutoDelay");
export const pathAutoDelayValue = document.getElementById("pathAutoDelayValue");
export const pathResult = document.getElementById("pathResult");
export const outdoorPathResult = document.getElementById("outdoorPathResult");
export const pathUseLocationBtn = document.getElementById("pathUseLocationBtn");
export const outdoorNavPanel = document.getElementById("outdoorNavPanel");
export const outdoorNavStatus = document.getElementById("outdoorNavStatus");
export const outdoorTravelMode = document.getElementById("outdoorTravelMode");
export const outdoorRefreshBtn = document.getElementById("outdoorRefreshBtn");
export const outdoorOpenMapsBtn = document.getElementById("outdoorOpenMapsBtn");
export const outdoorArrivedBtn = document.getElementById("outdoorArrivedBtn");
export const googleMap = document.getElementById("googleMap");
export const nodeSaveStatus = document.getElementById("nodeSaveStatus");

export const CURRENT_LOCATION_LABEL = "📍 目前位置";
export const CAMPUS_ARRIVED_KEY = "mcu_campus_arrived";
