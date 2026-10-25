export const GoogleMapsNav = {
  config: null,
  apiKey: null,
  scriptLoaded: false,
  scriptLoading: null,
  map: null,
  directionsService: null,
  directionsRenderer: null,
  userLocation: null,
  watchId: null,
  travelMode: "WALKING",
  lastRouteSummary: null,
  onArrival: null,
  onStatusChange: null,

  isReady() {
    return Boolean(this.apiKey && this.scriptLoaded && window.google?.maps);
  },

  getCampusGate() {
    return this.config?.campus?.gate || null;
  },

  getArrivalRadiusMeters() {
    return this.config?.campus?.arrivalRadiusMeters || 450;
  },

  distanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  isWithinCampus(lat, lng) {
    const gate = this.getCampusGate();
    if (!gate || typeof lat !== "number" || typeof lng !== "number") {
      return false;
    }
    return this.distanceMeters(lat, lng, gate.lat, gate.lng) <= this.getArrivalRadiusMeters();
  },

  async init() {
    try {
      const res = await fetch("/api/maps-config", { cache: "no-store" });
      if (!res.ok) {
        return false;
      }
      this.config = await res.json();
      this.apiKey = this.config?.apiKey || null;
      if (!this.apiKey) {
        return false;
      }
      await this.loadScript();
      return true;
    } catch (error) {
      console.warn("Google Maps 設定載入失敗:", error);
      return false;
    }
  },

  loadScript() {
    if (this.scriptLoaded) {
      return Promise.resolve();
    }
    if (this.scriptLoading) {
      return this.scriptLoading;
    }

    this.scriptLoading = new Promise((resolve, reject) => {
      const callbackName = `__googleMapsInit_${Date.now()}`;
      window[callbackName] = () => {
        delete window[callbackName];
        this.scriptLoaded = true;
        resolve();
      };

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.apiKey)}&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        delete window[callbackName];
        reject(new Error("無法載入 Google Maps API"));
      };
      document.head.appendChild(script);
    });

    return this.scriptLoading;
  },

  setTravelMode(mode) {
    this.travelMode = mode === "DRIVING" ? "DRIVING" : "WALKING";
  },

  getUserLocation(options = {}) {
    const { enableHighAccuracy = true, timeout = 12000, maximumAge = 15000 } = options;
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("此裝置不支援定位"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          this.userLocation = location;
          resolve(location);
        },
        (error) => reject(error),
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  },

  startArrivalWatch(onArrival) {
    this.stopArrivalWatch();
    if (!navigator.geolocation) {
      return;
    }
    this.onArrival = onArrival;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        this.userLocation = location;
        if (this.isWithinCampus(location.lat, location.lng)) {
          this.stopArrivalWatch();
          onArrival?.(location);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  },

  stopArrivalWatch() {
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.onArrival = null;
  },

  ensureMap(mapElement) {
    if (!mapElement || !this.isReady()) {
      return null;
    }

    const gate = this.getCampusGate();
    if (!this.map) {
      this.map = new google.maps.Map(mapElement, {
        center: { lat: gate.lat, lng: gate.lng },
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });
      this.directionsService = new google.maps.DirectionsService();
      this.directionsRenderer = new google.maps.DirectionsRenderer({
        map: this.map,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: "#0f62fe",
          strokeWeight: 5
        }
      });
    } else if (this.map.getDiv() !== mapElement) {
      this.directionsRenderer.setMap(this.map);
    }

    google.maps.event.trigger(this.map, "resize");
    return this.map;
  },

  formatRouteSummary(result) {
    const leg = result?.routes?.[0]?.legs?.[0];
    if (!leg) {
      return null;
    }
    return {
      distanceText: leg.distance?.text || "",
      durationText: leg.duration?.text || "",
      startAddress: leg.start_address || "起點",
      endAddress: leg.end_address || this.getCampusGate()?.name || "校門口"
    };
  },

  async routeToCampus(origin, mapElement) {
    if (!this.isReady()) {
      throw new Error("Google Maps 尚未設定 API 金鑰");
    }

    const gate = this.getCampusGate();
    if (!gate) {
      throw new Error("缺少校園入口座標");
    }

    const originLatLng =
      typeof origin?.lat === "number" && typeof origin?.lng === "number"
        ? { lat: origin.lat, lng: origin.lng }
        : origin;

    this.ensureMap(mapElement);

    const result = await new Promise((resolve, reject) => {
      this.directionsService.route(
        {
          origin: originLatLng,
          destination: { lat: gate.lat, lng: gate.lng },
          travelMode: google.maps.TravelMode[this.travelMode]
        },
        (response, status) => {
          if (status === "OK") {
            resolve(response);
            return;
          }
          reject(new Error(`Google 路線規劃失敗：${status}`));
        }
      );
    });

    this.directionsRenderer.setDirections(result);
    this.lastRouteSummary = this.formatRouteSummary(result);
    const bounds = result.routes?.[0]?.bounds;
    if (bounds) {
      this.map.fitBounds(bounds, 48);
    }
    return this.lastRouteSummary;
  },

  buildExternalMapsUrl(origin, destination) {
    const dest = destination || this.getCampusGate();
    if (!dest) {
      return null;
    }
    const params = new URLSearchParams({
      api: "1",
      destination: `${dest.lat},${dest.lng}`,
      travelmode: this.travelMode === "DRIVING" ? "driving" : "walking"
    });
    if (origin?.lat != null && origin?.lng != null) {
      params.set("origin", `${origin.lat},${origin.lng}`);
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  },

  clearRoute() {
    this.directionsRenderer?.setDirections({ routes: [] });
    this.lastRouteSummary = null;
  },

  destroy() {
    this.stopArrivalWatch();
    this.clearRoute();
    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(null);
      this.directionsRenderer = null;
    }
    this.directionsService = null;
    this.map = null;
  }
};

window.GoogleMapsNav = GoogleMapsNav;
export default GoogleMapsNav;
