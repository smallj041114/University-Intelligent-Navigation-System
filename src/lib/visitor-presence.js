/**
 * 訪客進出通報（後端 access log／線上人數用）
 * 訪客無帳號；以本機 sessionId 辨識裝置，不綁 Wi‑Fi／IP。
 */

const ENDPOINT = "/api/access-event";
const HEARTBEAT_MS = 30 * 1000;
const SID_KEY = "mcu_visitor_sid";

function getVisitorSessionId() {
  try {
    let id = localStorage.getItem(SID_KEY);
    if (!id || String(id).trim().length < 8) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem(SID_KEY, id);
    }
    return String(id).trim().slice(0, 64);
  } catch {
    return `tmp_${Date.now().toString(36)}`;
  }
}

function postPresence(payload, useBeacon) {
  const body = JSON.stringify(payload);
  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * @param {"visitor"|"navigation"} page
 */
export function reportVisitorPresence(page) {
  const pageKey = page === "navigation" ? "navigation" : "visitor";
  const sessionId = getVisitorSessionId();

  const send = (event, useBeacon = false) => {
    postPresence({ event, page: pageKey, sessionId }, useBeacon);
  };

  send("enter", false);

  let left = false;
  let timer = null;

  const stopHeartbeat = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const sendHeartbeat = () => {
    if (left) {
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    send("heartbeat", false);
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    timer = setInterval(sendHeartbeat, HEARTBEAT_MS);
  };

  const onLeave = () => {
    if (left) {
      return;
    }
    left = true;
    stopHeartbeat();
    send("leave", true);
  };

  const resumeAfterBfcache = () => {
    left = false;
    send("enter", false);
    startHeartbeat();
  };

  // 只用 pagehide，避免與 beforeunload 各送一次「離開」
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted || left) {
      resumeAfterBfcache();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (left) {
        resumeAfterBfcache();
      } else {
        sendHeartbeat();
        startHeartbeat();
      }
    } else {
      stopHeartbeat();
    }
  });
  startHeartbeat();
}
