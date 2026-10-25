import { GoogleMapsNav } from "./google-maps-nav.js";
import { mapPercentToLatLng, resolveCampusMapGpsConfig } from "./campus-gps.js";

/**
 * 校園總圖用的獨立 Google「衛星俯視」（與校外導航 roadmap／路線圖完全分開）。
 */
export const CampusSatelliteMap = {
  map: null,
  host: null,
  nodeMarkers: new Map(),
  buildingMarkers: [],
  selectedMarker: null,
  clickListener: null,
  onNodeClick: null,
  onMapClick: null,
  onBuildingClick: null,
  _guessMarker: null,

  isReady() {
    return Boolean(GoogleMapsNav.isReady() && window.google?.maps);
  },

  getCampusBounds() {
    const campus = GoogleMapsNav.config?.campus || {};
    const bounds = new google.maps.LatLngBounds();
    const box = campus.satelliteBounds;
    if (
      box &&
      typeof box.north === "number" &&
      typeof box.south === "number" &&
      typeof box.west === "number" &&
      typeof box.east === "number"
    ) {
      bounds.extend({ lat: box.north, lng: box.west });
      bounds.extend({ lat: box.south, lng: box.east });
      return bounds;
    }

    const anchors = resolveCampusMapGpsConfig(campus).anchors;
    let hasPoint = false;
    anchors.forEach((anchor) => {
      bounds.extend({ lat: anchor.lat, lng: anchor.lng });
      hasPoint = true;
    });

    const gate = GoogleMapsNav.getCampusGate();
    if (gate && typeof gate.lat === "number" && typeof gate.lng === "number") {
      const pad = 0.0018;
      bounds.extend({ lat: gate.lat - pad, lng: gate.lng - pad });
      bounds.extend({ lat: gate.lat + pad, lng: gate.lng + pad });
      hasPoint = true;
    }

    return hasPoint ? bounds : null;
  },

  getSatelliteView() {
    const campus = GoogleMapsNav.config?.campus || {};
    const view = campus.satelliteView || {};
    const center = campus.satelliteCenter || {};
    const lat =
      typeof view.lat === "number"
        ? view.lat
        : typeof center.lat === "number"
          ? center.lat
          : 24.98472;
    const lng =
      typeof view.lng === "number"
        ? view.lng
        : typeof center.lng === "number"
          ? center.lng
          : 121.34285;
    return {
      lat,
      lng,
      zoom: typeof view.zoom === "number" ? view.zoom : 17.2,
      heading: typeof view.heading === "number" ? view.heading : 0,
      tilt: typeof view.tilt === "number" ? view.tilt : 0
    };
  },

  getCampusCenter() {
    const view = this.getSatelliteView();
    return { lat: view.lat, lng: view.lng };
  },

  applyAerialView() {
    if (!this.map || !window.google?.maps) {
      return;
    }
    const view = this.getSatelliteView();
    const bounds = this.getCampusBounds();

    this.map.setOptions({
      mapTypeId: google.maps.MapTypeId.SATELLITE,
      center: { lat: view.lat, lng: view.lng },
      zoom: view.zoom,
      heading: view.heading,
      tilt: view.tilt,
      restriction: bounds
        ? {
            latLngBounds: bounds,
            strictBounds: true
          }
        : null
    });

    // 再套一次，避免 resize / 重建後偏離參考圖裁切
    google.maps.event.addListenerOnce(this.map, "idle", () => {
      this.map.setCenter({ lat: view.lat, lng: view.lng });
      this.map.setZoom(view.zoom);
      this.map.setHeading(view.heading);
      this.map.setTilt(view.tilt);
      this.map.setMapTypeId(google.maps.MapTypeId.SATELLITE);
    });
  },

  ensureMap(hostEl) {
    if (!hostEl || !this.isReady()) {
      return null;
    }
    this.host = hostEl;
    const view = this.getSatelliteView();
    const bounds = this.getCampusBounds();

    if (!this.map) {
      this.map = new google.maps.Map(hostEl, {
        center: { lat: view.lat, lng: view.lng },
        zoom: view.zoom,
        mapTypeId: google.maps.MapTypeId.SATELLITE,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        rotateControl: true,
        scaleControl: false,
        clickableIcons: false,
        gestureHandling: "greedy",
        tilt: view.tilt,
        heading: view.heading,
        minZoom: 16,
        maxZoom: 20,
        restriction: bounds
          ? {
              latLngBounds: bounds,
              strictBounds: true
            }
          : undefined
      });
      this.clickListener = this.map.addListener("click", (event) => {
        if (!event?.latLng) {
          return;
        }
        this.onMapClick?.({
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        });
      });
    } else if (this.map.getDiv() !== hostEl) {
      this.destroy();
      return this.ensureMap(hostEl);
    }

    this.applyAerialView();
    google.maps.event.trigger(this.map, "resize");
    return this.map;
  },

  destroy() {
    this.clearMarkers();
    this.clearUserGuess();
    if (this.clickListener) {
      google.maps.event.removeListener(this.clickListener);
      this.clickListener = null;
    }
    this.map = null;
    this.host = null;
  },

  clearMarkers() {
    this.nodeMarkers.forEach((marker) => marker.setMap(null));
    this.nodeMarkers.clear();
    this.buildingMarkers.forEach((marker) => marker.setMap(null));
    this.buildingMarkers = [];
    this.selectedMarker = null;
  },

  pointToLatLng(point, campusConfig) {
    if (typeof point?.lat === "number" && typeof point?.lng === "number") {
      return { lat: point.lat, lng: point.lng };
    }
    if (typeof point?.xPercent !== "number" || typeof point?.yPercent !== "number") {
      return null;
    }
    const mapped = mapPercentToLatLng(point.xPercent, point.yPercent, campusConfig);
    return mapped.ok ? { lat: mapped.lat, lng: mapped.lng } : null;
  },

  syncMarkers({ points = [], buildings = [], selectedPointId = null, campusConfig }) {
    if (!this.map) {
      return;
    }
    this.clearMarkers();
    this.applyAerialView();

    points.forEach((point) => {
      const position = this.pointToLatLng(point, campusConfig);
      if (!position) {
        return;
      }
      const selected = selectedPointId && point.id === selectedPointId;
      const marker = new google.maps.Marker({
        map: this.map,
        position,
        title: point.name,
        zIndex: selected ? 300 : 100,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: selected ? 10 : 7,
          fillColor: selected ? "#2563eb" : "#dc2626",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2
        }
      });
      marker.addListener("click", (event) => {
        event?.domEvent?.stopPropagation?.();
        this.onNodeClick?.(point, position);
      });
      this.nodeMarkers.set(point.id, marker);
      if (selected) {
        this.selectedMarker = marker;
      }
    });

    buildings.forEach((item) => {
      const position = this.pointToLatLng(
        { xPercent: item.hotspot.x, yPercent: item.hotspot.y },
        campusConfig
      );
      if (!position) {
        return;
      }
      const marker = new google.maps.Marker({
        map: this.map,
        position,
        label: {
          text: item.hotspot.label || item.name,
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700"
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#f59e0b",
          fillOpacity: 0.95,
          strokeColor: "#ffffff",
          strokeWeight: 2
        },
        zIndex: 80,
        title: `進入${item.name}`
      });
      marker.addListener("click", (event) => {
        event?.domEvent?.stopPropagation?.();
        this.onBuildingClick?.(item.id);
      });
      this.buildingMarkers.push(marker);
    });
  },

  setSelectedPoint(pointId) {
    this.nodeMarkers.forEach((marker, id) => {
      const selected = id === pointId;
      marker.setIcon({
        path: google.maps.SymbolPath.CIRCLE,
        scale: selected ? 10 : 7,
        fillColor: selected ? "#2563eb" : "#dc2626",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      });
      marker.setZIndex(selected ? 300 : 100);
    });
  },

  showUserGuess(lat, lng) {
    if (!this.map || typeof lat !== "number" || typeof lng !== "number") {
      return;
    }
    if (this._guessMarker) {
      this._guessMarker.setMap(null);
    }
    this._guessMarker = new google.maps.Marker({
      map: this.map,
      position: { lat, lng },
      title: "點選／模擬位置",
      zIndex: 400,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#38bdf8",
        fillOpacity: 0.95,
        strokeColor: "#0ea5e9",
        strokeWeight: 2
      }
    });
  },

  clearUserGuess() {
    if (this._guessMarker) {
      this._guessMarker.setMap(null);
      this._guessMarker = null;
    }
  }
};
