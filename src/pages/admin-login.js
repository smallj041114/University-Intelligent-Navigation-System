import { adminFetch, safeNextPath } from "../lib/admin-fetch.js";

const nextPath = safeNextPath(new URLSearchParams(location.search).get("next") || "/admin/");

function resolvePostLoginPath(role, requestedNext) {
  if (role === "qr") {
    return "/admin/links.html";
  }
  if (role === "qr_notice") {
    const next = String(requestedNext || "");
    if (
      next === "/admin/notices.html" ||
      next.startsWith("/admin/notices") ||
      next === "/admin/url-notices.html" ||
      next.startsWith("/admin/url-notices") ||
      next === "/admin/links.html" ||
      next.startsWith("/admin/links")
    ) {
      if (next.startsWith("/admin/links")) {
        return "/admin/links.html";
      }
      return "/admin/notices.html";
    }
    return "/admin/notices.html";
  }
  return requestedNext || "/admin/";
}

async function checkSession() {
  try {
    const res = await adminFetch("/api/admin/session", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      location.replace(resolvePostLoginPath(data.role, nextPath));
    }
  } catch {
    // 未登入則留在此頁
  }
}

document.getElementById("adminLoginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("adminLoginError");
  const username = document.getElementById("adminUsername")?.value || "";
  const password = document.getElementById("adminPassword")?.value || "";
  if (errorEl) {
    errorEl.textContent = "";
  }
  try {
    const res = await adminFetch("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = data.message || "登入失敗";
      }
      return;
    }
    location.replace(resolvePostLoginPath(data.role, nextPath));
  } catch {
    if (errorEl) {
      errorEl.textContent = "無法連線伺服器。請用 start-server.bat（Node）啟動。";
    }
  }
});

checkSession();
