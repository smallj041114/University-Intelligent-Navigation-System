const { spawn } = require("child_process");
const os = require("os");

const isWindows = process.platform === "win32";
const root = process.cwd();
const children = [];
let shuttingDown = false;

// 預設開區網；start-server.bat --localhost 則僅本機
const wantHost = !process.argv.includes("--localhost");

function lanAddresses() {
  const addrs = [];
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      const family = net.family === "IPv4" || net.family === 4;
      if (family && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  return [...new Set(addrs)];
}

function spawnService(name, command) {
  const child = spawn(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...(wantHost ? { MCU_DEV_HOST: "0.0.0.0" } : {})
    }
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log(`[${name}] 已結束，code=${code ?? "null"} signal=${signal ?? "null"}`);
      shutdown(code ?? 0);
    }
  });

  child.on("error", (error) => {
    console.error(`[${name}] 啟動失敗：${error.message}`);
    shutdown(1);
  });

  children.push(child);
  return child;
}

function killTree(pid) {
  if (!pid) {
    return;
  }
  if (isWindows) {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      detached: false
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Ignore if the process is already gone.
  }
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    killTree(child.pid);
  }
  setTimeout(() => process.exit(exitCode), 300);
}

console.log("將啟動：");
console.log("  1. API / 管理登入 / 節點寫入：http://localhost:8080");
console.log("  2. 前端首頁（Vite）：http://localhost:5173");
if (wantHost) {
  const lans = lanAddresses();
  console.log("");
  console.log("已啟用 --host（區網可連）：");
  if (lans.length) {
    for (const ip of lans) {
      console.log(`  手機／其他裝置請開：http://${ip}:5173/`);
    }
  } else {
    console.log("  （找不到區網 IP，請在本機 ipconfig 查看 IPv4 後用 http://<IP>:5173/）");
  }
  console.log("  請與開發電腦同一 Wi‑Fi；防火牆若擋連線請允許 Node／Vite。");
  console.log("  [安全] 區網內其他裝置可讀 /api/maps-config；展場請改用 --localhost。");
} else {
  console.log("");
  console.log("目前為本機模式（--localhost）。區網請直接雙擊 start-server.bat。");
  console.log("  [安全] 僅本機可連，較適合展場或公開展示。");
}
console.log("");
console.log("按 Ctrl+C 或直接關閉此視窗，即可停止全部服務。");
console.log("");

const apiCmd = wantHost
  ? "node scripts\\dev-server.cjs --host"
  : "node scripts\\dev-server.cjs";
const viteCmd = wantHost ? "npm run dev -- --host" : "npm run dev";

spawnService("api", apiCmd);
spawnService("vite", viteCmd);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  if (!shuttingDown) {
    shutdown(0);
  }
});
