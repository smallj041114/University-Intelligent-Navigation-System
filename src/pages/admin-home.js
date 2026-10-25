import { adminFetch } from "../lib/admin-fetch.js";

async function requireFullAdmin() {
  try {
    const res = await adminFetch("/api/admin/session", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.role === "admin") {
        return;
      }
      location.replace("/admin/links.html");
      return;
    }
  } catch {
    // 沒有 API 也視為未登入
  }
  location.replace("/admin/login.html?next=" + encodeURIComponent("/admin/"));
}

document.getElementById("adminLogoutBtn")?.addEventListener("click", async () => {
  await adminFetch("/api/admin/logout", { method: "POST" });
  location.replace("/admin/login.html");
});

requireFullAdmin();
