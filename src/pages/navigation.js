import pannellumReady from "../lib/pannellum-loader.js";
import { NavArrowSettings } from "../lib/nav-arrow-settings.js";
import { BuildingsStore, migrateLegacyCampusBuildingData } from "../lib/buildings-store.js";
import { bootstrapApp } from "../navigation/app.js";
import { reportVisitorPresence } from "../lib/visitor-presence.js";

reportVisitorPresence("navigation");

pannellumReady
  .then(() => NavArrowSettings.init())
  .then(() => BuildingsStore.init())
  .then(() => migrateLegacyCampusBuildingData(NavArrowSettings))
  .then(() => bootstrapApp())
  .catch(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<p style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#111827;color:#fca5a5;padding:24px;text-align:center;z-index:9999;">無法載入 Pannellum。請確認 vendor/pannellum 存在，或連上網路後重新整理。</p>'
    );
  });
