const LOCAL_JS = "/vendor/pannellum/pannellum.js";
const CDN_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof window.pannellum !== "undefined") {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Script failed: ${src}`));
    document.head.appendChild(script);
  });
}

export const pannellumReady = loadScript(LOCAL_JS).catch(() => loadScript(CDN_JS));
export default pannellumReady;
