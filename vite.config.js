import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "0.0.0")
  },
  plugins: [
    {
      name: "html-app-version",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          // 勿用 %…%，Vite 會當 URI 解碼而失敗
          return html.replaceAll("__APP_VERSION__", String(pkg.version || "0.0.0"));
        }
      }
    }
  ],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        home: resolve(process.cwd(), "index.html"),
        visitor: resolve(process.cwd(), "visitor.html"),
        navigation: resolve(process.cwd(), "navigation.html"),
        settings: resolve(process.cwd(), "settings.html"),
        adminLogin: resolve(process.cwd(), "admin/login.html"),
        adminHome: resolve(process.cwd(), "admin/index.html"),
        adminLinks: resolve(process.cwd(), "admin/links.html"),
        adminNotices: resolve(process.cwd(), "admin/notices.html"),
        adminAudit: resolve(process.cwd(), "admin/audit.html"),
        maintenance: resolve(process.cwd(), "maintenance.html")
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        // 區網其他裝置經 Vite 轉 API 時，把真實 IP 傳給後端 access log
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const raw =
              (typeof req.socket?.remoteAddress === "string" && req.socket.remoteAddress) ||
              "";
            let ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw || "unknown";
            if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") {
              ip = "127.0.0.1";
            }
            const existing = req.headers["x-forwarded-for"];
            const chain =
              typeof existing === "string" && existing.trim()
                ? `${existing}, ${ip}`
                : ip;
            proxyReq.setHeader("X-Forwarded-For", chain);
            proxyReq.setHeader("X-Real-IP", ip);
          });
        }
      }
    }
  }
});
