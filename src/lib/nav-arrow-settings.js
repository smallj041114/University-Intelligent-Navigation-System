import {
  DEFAULT_INDOOR_ENTRY,
  DEFAULT_VISITOR_STARTS,
  DEFAULT_CAMPUS_BUILDINGS,
  normalizeCampusBuildings,
  normalizeIndoorEntry,
  normalizeVisitorStarts,
  normalizeVisitorDefaultStartId,
  stripCampusBuildingHotspots
} from "./visitor-starts.js";
import { adminFetch } from "./admin-fetch.js";

export const NavArrowSettings = {
  STORAGE_KEY: "mcu_nav_arrow_settings",
  HUD_LAYOUT_LOCAL_KEY: "mcu_play_speed_hud_layout",
  API_PATH: "/api/nav-settings",
  cache: null,
  readyPromise: null,
  DEFAULTS: {
    size: 56,
    opacity: 0.82,
    pitch: -32,
    tilt: 68,
    turnDurationSec: 2,
    /** 上下樓離開前抬頭／低頭動畫秒數 */
    floorChangeDurationSec: 0.8,
    centerPathNextArrow: true,
    playDelayMinSec: 0.2,
    playDelayMaxSec: 20,
    playDelayDefaultSec: 1,
    hudOpacity: 0.86,
    hudScale: 1,
    hudCorner: "top-left",
    hudLeftPercent: 2,
    hudTopPercent: 2,
    minimapScale: 1,
    minimapCorner: "top-right",
    minimapLeftPercent: 70,
    minimapTopPercent: 2,
    mapMetersPerPercent: 1,
    visitorSearchHidePathNodes: true,
    visitorDefaultStartId: "map_locate",
    visitorStarts: DEFAULT_VISITOR_STARTS,
    indoorEntry: DEFAULT_INDOOR_ENTRY,
    campusBuildings: DEFAULT_CAMPUS_BUILDINGS,
    /** 大樓平面圖出口快捷覆寫座標：{ [floorScopeKey]: { [targetKey::sourcePointId]: { xPercent, yPercent } } } */
    floorPlanPortals: {},
    welcomeNotice: {
      enabled: false,
      title: "歡迎使用校園導航",
      body: "可搜尋教室或據點名稱開始導航。左右拖曳可環視，點箭頭可前進。",
      countdownSec: 8,
      version: 1,
      showEveryVisit: false,
      rules: []
    },
    endFeedback: {
      defaultNotice: {
        enabled: false,
        title: "已抵達目的地",
        body: "若方便，歡迎填寫回饋表單協助我們改善導覽。",
        formUrl: "",
        formButtonLabel: "填寫回饋",
        countdownSec: 12,
        version: 1,
        showEveryVisit: false
      },
      rules: []
    },
    panoSpotPresets: []
  },
  WELCOME_NOTICE_SEEN_KEY: "mcu_nav_welcome_notice_seen",
  /** 依網址規則／結束回饋的已看紀錄（JSON：{ "welcome:ruleId": version, "end:default": version, ... }） */
  URL_NOTICE_SEEN_KEY: "mcu_nav_url_notice_seen",
  URL_NOTICE_RULES_MAX: 50,
  PANO_SPOT_PRESETS_MAX: 200,
  PLAY_DELAY_ABS_MIN: 0.1,
  PLAY_DELAY_ABS_MAX: 60,
  MAP_METERS_PER_PERCENT_MIN: 0.1,
  MAP_METERS_PER_PERCENT_MAX: 10,
  HUD_CORNERS: ["top-left", "top-right", "bottom-left", "bottom-right", "custom"],

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  },

  roundTenths(value) {
    return Math.round(Number(value) * 10) / 10;
  },

  roundHundredths(value) {
    return Math.round(Number(value) * 100) / 100;
  },

  normalize(input = {}) {
    const defaults = this.DEFAULTS;
    let playDelayMinSec = this.clamp(
      this.roundTenths(input.playDelayMinSec ?? defaults.playDelayMinSec),
      this.PLAY_DELAY_ABS_MIN,
      30
    );
    let playDelayMaxSec = this.clamp(
      this.roundTenths(input.playDelayMaxSec ?? defaults.playDelayMaxSec),
      0.2,
      this.PLAY_DELAY_ABS_MAX
    );
    if (playDelayMinSec >= playDelayMaxSec) {
      playDelayMaxSec = this.clamp(
        this.roundTenths(playDelayMinSec + 0.1),
        0.2,
        this.PLAY_DELAY_ABS_MAX
      );
      if (playDelayMinSec >= playDelayMaxSec) {
        playDelayMinSec = this.clamp(
          this.roundTenths(playDelayMaxSec - 0.1),
          this.PLAY_DELAY_ABS_MIN,
          30
        );
      }
    }

    const playDelayDefaultSec = this.clamp(
      this.roundTenths(input.playDelayDefaultSec ?? defaults.playDelayDefaultSec),
      playDelayMinSec,
      playDelayMaxSec
    );

    return {
      size: this.clamp(Math.round(Number(input.size) || defaults.size), 24, 120),
      opacity: this.clamp(Number(input.opacity ?? defaults.opacity), 0.1, 1),
      pitch: this.clamp(Number(input.pitch ?? defaults.pitch), -85, -5),
      tilt: this.clamp(Number(input.tilt ?? defaults.tilt), 40, 88),
      turnDurationSec: this.clamp(
        Number(input.turnDurationSec ?? defaults.turnDurationSec),
        0.5,
        10
      ),
      floorChangeDurationSec: this.clamp(
        this.roundTenths(input.floorChangeDurationSec ?? defaults.floorChangeDurationSec),
        0.3,
        5
      ),
      centerPathNextArrow: input.centerPathNextArrow ?? defaults.centerPathNextArrow ? true : false,
      playDelayMinSec,
      playDelayMaxSec,
      playDelayDefaultSec,
      hudOpacity: this.clamp(Number(input.hudOpacity ?? defaults.hudOpacity), 0.3, 1),
      hudScale: this.clamp(this.roundTenths(input.hudScale ?? defaults.hudScale), 0.5, 3),
      hudCorner: this.HUD_CORNERS.includes(input.hudCorner) ? input.hudCorner : defaults.hudCorner,
      hudLeftPercent: this.clamp(Number(input.hudLeftPercent ?? defaults.hudLeftPercent), 0, 92),
      hudTopPercent: this.clamp(Number(input.hudTopPercent ?? defaults.hudTopPercent), 0, 92),
      minimapScale: this.clamp(this.roundTenths(input.minimapScale ?? defaults.minimapScale), 0.5, 3),
      minimapCorner: this.HUD_CORNERS.includes(input.minimapCorner)
        ? input.minimapCorner
        : defaults.minimapCorner,
      minimapLeftPercent: this.clamp(
        Number(input.minimapLeftPercent ?? defaults.minimapLeftPercent),
        0,
        92
      ),
      minimapTopPercent: this.clamp(
        Number(input.minimapTopPercent ?? defaults.minimapTopPercent),
        0,
        92
      ),
      mapMetersPerPercent: this.clamp(
        this.roundHundredths(input.mapMetersPerPercent ?? defaults.mapMetersPerPercent),
        this.MAP_METERS_PER_PERCENT_MIN,
        this.MAP_METERS_PER_PERCENT_MAX
      ),
      visitorSearchHidePathNodes:
        input.visitorSearchHidePathNodes === undefined
          ? Boolean(defaults.visitorSearchHidePathNodes)
          : Boolean(input.visitorSearchHidePathNodes),
      visitorStarts: normalizeVisitorStarts(input.visitorStarts ?? defaults.visitorStarts),
      visitorDefaultStartId: normalizeVisitorDefaultStartId(
        input.visitorDefaultStartId ?? defaults.visitorDefaultStartId,
        input.visitorStarts ?? defaults.visitorStarts
      ),
      indoorEntry: normalizeIndoorEntry(input.indoorEntry ?? defaults.indoorEntry),
      campusBuildings: stripCampusBuildingHotspots(
        input.campusBuildings ?? defaults.campusBuildings
      ),
      floorPlanPortals: this.normalizeFloorPlanPortals(
        input.floorPlanPortals ?? defaults.floorPlanPortals
      ),
      welcomeNotice: this.normalizeWelcomeNotice(input.welcomeNotice ?? defaults.welcomeNotice),
      endFeedback: this.normalizeEndFeedback(input.endFeedback ?? defaults.endFeedback),
      panoSpotPresets: this.normalizePanoSpotPresets(
        input.panoSpotPresets ?? defaults.panoSpotPresets
      )
    };
  },

  normalizeFloorPlanPortals(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {};
    }
    const out = {};
    Object.entries(input).forEach(([scopeKey, entries]) => {
      const floorKey = String(scopeKey || "").trim();
      if (!floorKey || !entries || typeof entries !== "object" || Array.isArray(entries)) {
        return;
      }
      const scopeOut = {};
      Object.entries(entries).forEach(([portalKey, pos]) => {
        const key = String(portalKey || "").trim();
        if (!key || !pos || typeof pos !== "object") {
          return;
        }
        const xPercent = Number(pos.xPercent);
        const yPercent = Number(pos.yPercent);
        if (!Number.isFinite(xPercent) || !Number.isFinite(yPercent)) {
          return;
        }
        scopeOut[key] = {
          xPercent: this.clamp(this.roundHundredths(xPercent), 0, 100),
          yPercent: this.clamp(this.roundHundredths(yPercent), 0, 100)
        };
      });
      if (Object.keys(scopeOut).length) {
        out[floorKey] = scopeOut;
      }
    });
    return out;
  },

  normalizeNoticeFields(input = {}, defaults = {}, { withForm = false } = {}) {
    const title =
      String(input.title ?? defaults.title)
        .trim()
        .slice(0, 80) || defaults.title;
    const body =
      String(input.body ?? defaults.body)
        .trim()
        .slice(0, 2000) || defaults.body;
    const countdownSec = this.clamp(
      Math.round(Number(input.countdownSec ?? defaults.countdownSec) || defaults.countdownSec),
      1,
      60
    );
    const version = Math.max(1, Math.round(Number(input.version) || defaults.version || 1));
    const out = {
      enabled: Boolean(input.enabled),
      title,
      body,
      countdownSec,
      version,
      showEveryVisit: Boolean(input.showEveryVisit)
    };
    if (withForm) {
      const formUrl = String(input.formUrl ?? defaults.formUrl ?? "")
        .trim()
        .slice(0, 500);
      const safeFormUrl =
        !formUrl || /^https?:\/\//i.test(formUrl) ? formUrl : "";
      out.formUrl = safeFormUrl;
      out.formButtonLabel =
        String(input.formButtonLabel ?? defaults.formButtonLabel ?? "填寫回饋")
          .trim()
          .slice(0, 40) || "填寫回饋";
    }
    return out;
  },

  normalizeUrlNoticeRule(input = {}, { withForm = false } = {}) {
    if (!input || typeof input !== "object") {
      return null;
    }
    const urlMatch = String(input.urlMatch || "")
      .trim()
      .slice(0, 300);
    if (!urlMatch) {
      return null;
    }
    const id =
      String(input.id || "")
        .trim()
        .slice(0, 80) || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fields = this.normalizeNoticeFields(input, {
      enabled: false,
      title: "公告",
      body: "",
      countdownSec: 8,
      version: 1,
      showEveryVisit: false,
      formUrl: "",
      formButtonLabel: "填寫回饋"
    }, { withForm });
    return {
      id,
      label:
        String(input.label || "")
          .trim()
          .slice(0, 80) || urlMatch.slice(0, 40),
      urlMatch,
      ...fields
    };
  },

  normalizeUrlNoticeRules(input, { withForm = false } = {}) {
    if (!Array.isArray(input)) {
      return [];
    }
    const seen = new Set();
    const list = [];
    for (const raw of input) {
      const rule = this.normalizeUrlNoticeRule(raw, { withForm });
      if (!rule || seen.has(rule.id)) {
        continue;
      }
      seen.add(rule.id);
      list.push(rule);
      if (list.length >= this.URL_NOTICE_RULES_MAX) {
        break;
      }
    }
    return list;
  },

  normalizeWelcomeNotice(input = {}) {
    const defaults = this.DEFAULTS.welcomeNotice;
    const base = this.normalizeNoticeFields(input, defaults, { withForm: false });
    return {
      ...base,
      rules: this.normalizeUrlNoticeRules(input.rules ?? defaults.rules, { withForm: false })
    };
  },

  normalizeEndFeedback(input = {}) {
    const defaults = this.DEFAULTS.endFeedback;
    return {
      defaultNotice: this.normalizeNoticeFields(
        input.defaultNotice ?? defaults.defaultNotice,
        defaults.defaultNotice,
        { withForm: true }
      ),
      rules: this.normalizeUrlNoticeRules(input.rules ?? defaults.rules, { withForm: true })
    };
  },

  /** 目前頁 path+search（忽略 origin），供規則比對 */
  currentUrlKey(loc = typeof location !== "undefined" ? location : null) {
    if (!loc) {
      return "";
    }
    return `${String(loc.pathname || "")}${String(loc.search || "")}`;
  },

  matchUrlRules(rules, urlKey) {
    const key = String(urlKey || "");
    if (!key || !Array.isArray(rules)) {
      return null;
    }
    for (const rule of rules) {
      if (!rule || !rule.enabled) {
        continue;
      }
      const needle = String(rule.urlMatch || "").trim();
      if (needle && key.includes(needle)) {
        return rule;
      }
    }
    return null;
  },

  /**
   * @returns {{ enabled: boolean, title: string, body: string, countdownSec: number, version: number, showEveryVisit: boolean, formUrl?: string, formButtonLabel?: string, _seenKind: string, _ruleId: string|null }}
   */
  pickWelcomeNotice(loc) {
    const wn = this.normalizeWelcomeNotice(this.load()?.welcomeNotice);
    const matched = this.matchUrlRules(wn.rules, this.currentUrlKey(loc));
    if (matched) {
      return {
        enabled: matched.enabled,
        title: matched.title,
        body: matched.body,
        countdownSec: matched.countdownSec,
        version: matched.version,
        showEveryVisit: matched.showEveryVisit,
        _seenKind: "welcome",
        _ruleId: matched.id
      };
    }
    return {
      enabled: wn.enabled,
      title: wn.title,
      body: wn.body,
      countdownSec: wn.countdownSec,
      version: wn.version,
      showEveryVisit: wn.showEveryVisit,
      _seenKind: "welcome",
      _ruleId: null
    };
  },

  pickEndFeedbackNotice(loc) {
    const ef = this.normalizeEndFeedback(this.load()?.endFeedback);
    const matched = this.matchUrlRules(ef.rules, this.currentUrlKey(loc));
    if (matched) {
      return {
        enabled: matched.enabled,
        title: matched.title,
        body: matched.body,
        formUrl: matched.formUrl,
        formButtonLabel: matched.formButtonLabel,
        countdownSec: matched.countdownSec,
        version: matched.version,
        showEveryVisit: matched.showEveryVisit,
        _seenKind: "end",
        _ruleId: matched.id
      };
    }
    const d = ef.defaultNotice;
    return {
      enabled: d.enabled,
      title: d.title,
      body: d.body,
      formUrl: d.formUrl,
      formButtonLabel: d.formButtonLabel,
      countdownSec: d.countdownSec,
      version: d.version,
      showEveryVisit: d.showEveryVisit,
      _seenKind: "end",
      _ruleId: null
    };
  },

  normalizePanoSpotPresets(input) {
    if (!Array.isArray(input)) {
      return [];
    }
    const seen = new Set();
    const list = [];
    for (const raw of input) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const scope = String(raw.scope || "")
        .trim()
        .replace(/^mcu_nav_nodes_/, "");
      const nodeId = String(raw.nodeId || "").trim();
      if (!scope || !nodeId) {
        continue;
      }
      const id =
        String(raw.id || "").trim() ||
        `spot_${scope}_${nodeId}_${Math.round(Number(raw.yaw) || 0)}_${raw.createdAt || Date.now()}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      const yaw = Number(raw.yaw);
      const pitch = Number(raw.pitch);
      list.push({
        id,
        label: String(raw.label || raw.nodeName || nodeId)
          .trim()
          .slice(0, 80) || nodeId,
        scope,
        nodeId,
        nodeName: String(raw.nodeName || "").trim().slice(0, 80),
        yaw: Number.isFinite(yaw) ? Math.round(yaw * 100) / 100 : 0,
        pitch: Number.isFinite(pitch) ? Math.round(pitch * 100) / 100 : 0,
        createdAt: Math.max(0, Math.round(Number(raw.createdAt) || Date.now()))
      });
      if (list.length >= this.PANO_SPOT_PRESETS_MAX) {
        break;
      }
    }
    return list;
  },

  readUrlNoticeSeenMap() {
    try {
      const raw = localStorage.getItem(this.URL_NOTICE_SEEN_KEY);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  },

  writeUrlNoticeSeenMap(map) {
    try {
      localStorage.setItem(this.URL_NOTICE_SEEN_KEY, JSON.stringify(map || {}));
    } catch {
      /* ignore */
    }
  },

  urlNoticeSeenStorageKey(notice) {
    const kind = notice?._seenKind === "end" ? "end" : "welcome";
    const ruleId = notice?._ruleId ? String(notice._ruleId) : "default";
    return `${kind}:${ruleId}`;
  },

  hasSeenUrlNotice(notice) {
    const version = Math.max(1, Math.round(Number(notice?.version) || 1));
    const key = this.urlNoticeSeenStorageKey(notice);
    // 預設首次公告：沿用舊 key，避免既有訪客被再跳一次
    if (notice?._seenKind === "welcome" && !notice?._ruleId) {
      try {
        return localStorage.getItem(this.WELCOME_NOTICE_SEEN_KEY) === String(version);
      } catch {
        return false;
      }
    }
    const map = this.readUrlNoticeSeenMap();
    return String(map[key] || "") === String(version);
  },

  markUrlNoticeSeen(notice) {
    const version = Math.max(1, Math.round(Number(notice?.version) || 1));
    if (notice?._seenKind === "welcome" && !notice?._ruleId) {
      try {
        localStorage.setItem(this.WELCOME_NOTICE_SEEN_KEY, String(version));
      } catch {
        /* ignore */
      }
      return;
    }
    const map = this.readUrlNoticeSeenMap();
    map[this.urlNoticeSeenStorageKey(notice)] = version;
    this.writeUrlNoticeSeenMap(map);
  },

  hasSeenWelcomeNotice(notice) {
    // 相容舊呼叫：無 _seenKind 時視為預設首次公告
    if (notice && notice._seenKind == null && notice._ruleId == null) {
      return this.hasSeenUrlNotice({ ...notice, _seenKind: "welcome", _ruleId: null });
    }
    return this.hasSeenUrlNotice(notice);
  },

  markWelcomeNoticeSeen(notice) {
    if (notice && notice._seenKind == null && notice._ruleId == null) {
      this.markUrlNoticeSeen({ ...notice, _seenKind: "welcome", _ruleId: null });
      return;
    }
    this.markUrlNoticeSeen(notice);
  },

  readLocal() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? this.normalize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },

  writeLocal(settings) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
  },

  async init(force = false) {
    if (!force && this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = fetch(this.API_PATH, {
      cache: "no-store",
      credentials: "same-origin"
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const normalized = this.normalize(data || {});
        this.cache = normalized;
        this.writeLocal(normalized);
        this.applyToViewer(normalized);
        this.applyOverlayStyle(normalized);
        return normalized;
      })
      .catch(() => {
        const fallback = this.readLocal() || { ...this.DEFAULTS };
        const normalized = this.normalize(fallback);
        this.cache = normalized;
        this.applyToViewer(normalized);
        this.applyOverlayStyle(normalized);
        return normalized;
      });
    return this.readyPromise;
  },

  load() {
    if (this.cache) {
      return this.cache;
    }
    const local = this.readLocal();
    this.cache = this.normalize(local || this.DEFAULTS);
    return this.cache;
  },

  persistRemote(settings) {
    return adminFetch(this.API_PATH, {
      method: "POST",
      body: JSON.stringify(settings)
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res;
      });
  },

  save(input) {
    const normalized = this.normalize(input);
    this.cache = normalized;
    this.writeLocal(normalized);
    this.applyToViewer(normalized);
    this.applyOverlayStyle(normalized);
    this.persistRemote(normalized);
    return normalized;
  },

  async saveAndPersist(input) {
    const normalized = this.save(input);
    await this.persistRemote(normalized);
    return normalized;
  },

  reset() {
    const defaults = this.normalize({ ...this.DEFAULTS });
    this.cache = defaults;
    this.writeLocal(defaults);
    this.applyToViewer(defaults);
    this.applyOverlayStyle(defaults);
    this.persistRemote(defaults);
    return defaults;
  },

  async resetAndPersist() {
    const defaults = this.reset();
    await this.persistRemote(defaults);
    return defaults;
  },

  getTurnDurationMs() {
    return Math.round(this.load().turnDurationSec * 1000);
  },

  getFloorChangeDurationMs() {
    return Math.round(this.load().floorChangeDurationSec * 1000);
  },

  shouldCenterPathNextArrow() {
    return Boolean(this.load().centerPathNextArrow);
  },

  getPlayDelayBounds() {
    const settings = this.load();
    return {
      min: settings.playDelayMinSec,
      max: settings.playDelayMaxSec
    };
  },

  getPlayDelayDefaultSec() {
    const settings = this.load();
    const { min, max } = this.getPlayDelayBounds();
    return this.clamp(Number(settings.playDelayDefaultSec ?? this.DEFAULTS.playDelayDefaultSec), min, max);
  },

  getMapMetersPerPercent() {
    return this.load().mapMetersPerPercent;
  },

  applyHudStyle(settings) {
    return this.applyOverlayStyle(settings);
  },

  applyOverlayStyle(settings) {
    const normalized = this.normalize(settings || this.load());
    [
      document.getElementById("playSpeedHud"),
      document.getElementById("hudSettingsPreview")
    ]
      .filter(Boolean)
      .forEach((el) => this.styleOverlayElement(el, normalized, "hud"));
    [
      document.getElementById("panoramaMinimap"),
      document.getElementById("minimapSettingsPreview")
    ]
      .filter(Boolean)
      .forEach((el) => this.styleOverlayElement(el, normalized, "minimap"));
    const playSpeedHud = document.getElementById("playSpeedHud");
    if (playSpeedHud) {
      this.applyHudLayoutLocal(playSpeedHud);
    }
    return normalized;
  },

  styleOverlayElement(el, settings, kind) {
    const classPrefix = kind === "hud" ? "play-speed-hud" : "panorama-minimap";
    const corner = settings[`${kind}Corner`];
    this.HUD_CORNERS.forEach((name) => {
      el.classList.toggle(`${classPrefix}-${name}`, name === corner);
    });
    if (kind === "hud") {
      el.style.setProperty("--hud-opacity", String(settings.hudOpacity));
      el.style.setProperty("--hud-scale", String(settings.hudScale));
    }
    if (kind === "minimap") {
      el.style.setProperty("--minimap-scale", String(settings.minimapScale));
    }
    if (corner === "custom") {
      el.style.left = `${settings[`${kind}LeftPercent`]}%`;
      el.style.top = `${settings[`${kind}TopPercent`]}%`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    } else {
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
    }
  },

  readHudLayoutLocal() {
    try {
      const raw = localStorage.getItem(this.HUD_LAYOUT_LOCAL_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      const leftPercent = Number(parsed.leftPercent);
      const topPercent = Number(parsed.topPercent);
      const scale = Number(parsed.scale);
      if (![leftPercent, topPercent, scale].every(Number.isFinite)) {
        return null;
      }
      return {
        leftPercent: this.clamp(leftPercent, 0, 100),
        topPercent: this.clamp(topPercent, 0, 100),
        scale: this.clamp(this.roundTenths(scale), 0.5, 2)
      };
    } catch {
      return null;
    }
  },

  writeHudLayoutLocal(layout) {
    const next = {
      leftPercent: this.clamp(Number(layout.leftPercent), 0, 100),
      topPercent: this.clamp(Number(layout.topPercent), 0, 100),
      scale: this.clamp(this.roundTenths(Number(layout.scale) || 1), 0.5, 2)
    };
    try {
      localStorage.setItem(this.HUD_LAYOUT_LOCAL_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private mode */
    }
    return next;
  },

  clearHudLayoutLocal() {
    try {
      localStorage.removeItem(this.HUD_LAYOUT_LOCAL_KEY);
    } catch {
      /* ignore */
    }
  },

  syncHudResetButton(el) {
    if (!el) {
      return;
    }
    const resetBtn =
      el.querySelector(".play-speed-hud-reset") || document.getElementById("playSpeedHudReset");
    if (!resetBtn) {
      return;
    }
    resetBtn.classList.toggle("hidden", !this.readHudLayoutLocal());
  },

  applyHudLayoutLocal(el) {
    if (!el) {
      return false;
    }
    const local = this.readHudLayoutLocal();
    this.syncHudResetButton(el);
    if (!local) {
      return false;
    }
    this.HUD_CORNERS.forEach((name) => {
      el.classList.toggle(`play-speed-hud-${name}`, name === "custom");
    });
    el.style.left = `${local.leftPercent}%`;
    el.style.top = `${local.topPercent}%`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.setProperty("--hud-scale", String(local.scale));
    return true;
  },

  captureHudPositionPercent(el, wrap) {
    const settings = this.load();
    const local = this.readHudLayoutLocal();
    if (local) {
      return { leftPercent: local.leftPercent, topPercent: local.topPercent };
    }
    if (!wrap || !el) {
      return {
        leftPercent: settings.hudLeftPercent,
        topPercent: settings.hudTopPercent
      };
    }
    const wrapRect = wrap.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const scale = wrap.offsetWidth ? wrapRect.width / wrap.offsetWidth : 1;
    const leftPx = (rect.left - wrapRect.left) / (scale || 1);
    const topPx = (rect.top - wrapRect.top) / (scale || 1);
    return {
      leftPercent: wrap.offsetWidth ? (leftPx / wrap.offsetWidth) * 100 : settings.hudLeftPercent,
      topPercent: wrap.offsetHeight ? (topPx / wrap.offsetHeight) * 100 : settings.hudTopPercent
    };
  },

  resetHudLayoutLocal(el) {
    this.clearHudLayoutLocal();
    if (el) {
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
    }
    this.applyOverlayStyle();
  },

  enableVisitorHudLayout(el, wrap) {
    if (!el || !wrap || el.dataset.hudLayoutBound === "1") {
      return;
    }
    el.dataset.hudLayoutBound = "1";
    el.classList.add("play-speed-hud-interactive");
    this.bindOverlayDrag(el, { wrap, kind: "hud", persist: "local" });
    this.bindHudResize(el, { wrap });
    const resetBtn =
      el.querySelector(".play-speed-hud-reset") || document.getElementById("playSpeedHudReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.resetHudLayoutLocal(el);
      });
    }
    this.applyHudLayoutLocal(el);
  },

  bindHudResize(el, options = {}) {
    const handle = el?.querySelector(".overlay-resize-handle");
    const wrap = options.wrap;
    if (!handle || !wrap) {
      return;
    }
    let resize = null;

    const endResize = (event) => {
      if (!resize || resize.pointerId !== event.pointerId) {
        return;
      }
      el.classList.remove("overlay-resizing");
      const scale = this.clamp(
        this.roundTenths(Number.parseFloat(el.style.getPropertyValue("--hud-scale")) || 1),
        0.5,
        2
      );
      const pos = this.captureHudPositionPercent(el, wrap);
      this.writeHudLayoutLocal({ ...pos, scale });
      this.applyHudLayoutLocal(el);
      resize = null;
    };

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      const startScale = this.clamp(
        this.roundTenths(
          Number.parseFloat(getComputedStyle(el).getPropertyValue("--hud-scale")) || 1
        ),
        0.5,
        2
      );
      resize = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScale
      };
      handle.setPointerCapture(event.pointerId);
      el.classList.add("overlay-resizing");
      event.preventDefault();
      event.stopPropagation();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resize || resize.pointerId !== event.pointerId) {
        return;
      }
      const delta = (event.clientX - resize.startX + (event.clientY - resize.startY)) / 2;
      const next = this.clamp(this.roundTenths(resize.startScale + delta / 120), 0.5, 2);
      el.style.setProperty("--hud-scale", String(next));
    });

    handle.addEventListener("pointerup", endResize);
    handle.addEventListener("pointercancel", endResize);
  },

  bindOverlayDrag(el, options = {}) {
    if (!el) {
      return;
    }
    const wrap = options.wrap;
    const kind = options.kind === "minimap" ? "minimap" : "hud";
    const classPrefix = kind === "hud" ? "play-speed-hud" : "panorama-minimap";
    const persistLocal = options.persist === "local";
    let drag = null;

    const getWrapScale = () => {
      const rect = wrap.getBoundingClientRect();
      return wrap.offsetWidth ? rect.width / wrap.offsetWidth : 1;
    };

    const endDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      el.classList.remove("overlay-dragging");
      if (drag.moved) {
        const leftPx = Number.parseFloat(el.style.left) || 0;
        const topPx = Number.parseFloat(el.style.top) || 0;
        const leftPercent = wrap.offsetWidth ? (leftPx / wrap.offsetWidth) * 100 : 2;
        const topPercent = wrap.offsetHeight ? (topPx / wrap.offsetHeight) * 100 : 2;
        if (persistLocal) {
          const scale = this.clamp(
            this.roundTenths(
              Number.parseFloat(el.style.getPropertyValue("--hud-scale")) ||
                Number.parseFloat(getComputedStyle(el).getPropertyValue("--hud-scale")) ||
                this.load().hudScale ||
                1
            ),
            0.5,
            2
          );
          this.writeHudLayoutLocal({ leftPercent, topPercent, scale });
          this.applyHudLayoutLocal(el);
          if (typeof options.onAfterSave === "function") {
            options.onAfterSave({ leftPercent, topPercent, scale });
          }
        } else {
          this.saveAndPersist({
            ...this.load(),
            [`${kind}Corner`]: "custom",
            [`${kind}LeftPercent`]: leftPercent,
            [`${kind}TopPercent`]: topPercent
          })
            .then((saved) => {
              if (typeof options.onAfterSave === "function") {
                options.onAfterSave(saved);
              }
            })
            .catch((error) => {
              if (typeof options.onSaveError === "function") {
                options.onSaveError(error);
              }
            });
        }
      }
      drag = null;
    };

    el.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        event.target.closest("button, .overlay-resize-handle, .play-speed-hud-reset")
      ) {
        return;
      }
      if (!wrap) {
        return;
      }
      const rect = el.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false
      };
      el.setPointerCapture(event.pointerId);
      el.classList.add("overlay-dragging");
      event.preventDefault();
      event.stopPropagation();
    });

    el.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId || !wrap) {
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      const scale = getWrapScale();
      const visualW = el.getBoundingClientRect().width;
      const visualH = el.getBoundingClientRect().height;
      const layoutW = scale ? visualW / scale : el.offsetWidth;
      const layoutH = scale ? visualH / scale : el.offsetHeight;
      const maxLeft = Math.max(8, wrap.offsetWidth - layoutW - 8);
      const maxTop = Math.max(8, wrap.offsetHeight - layoutH - 8);
      const left = Math.min(
        maxLeft,
        Math.max(8, (event.clientX - wrapRect.left - drag.offsetX) / scale)
      );
      const top = Math.min(
        maxTop,
        Math.max(8, (event.clientY - wrapRect.top - drag.offsetY) / scale)
      );
      drag.moved = true;
      this.HUD_CORNERS.forEach((name) => {
        el.classList.toggle(`${classPrefix}-${name}`, name === "custom");
      });
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
  },

  applyToViewer(settings) {
    if (typeof PanoramaViewer === "undefined") {
      return null;
    }
    const normalized = this.normalize(settings || this.load());
    PanoramaViewer.navArrowSettings = normalized;
    if (typeof PanoramaViewer.refreshNavHotspots === "function") {
      PanoramaViewer.refreshNavHotspots();
    }
    return normalized;
  }
};

window.NavArrowSettings = NavArrowSettings;
export default NavArrowSettings;
