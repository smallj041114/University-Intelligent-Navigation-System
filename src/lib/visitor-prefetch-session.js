const SESSION_KEY = "mcu_visitor_path_prefetch";

export function saveVisitorPrefetchUrls(urls) {
  if (!Array.isArray(urls) || !urls.length) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(urls));
  } catch {
    /* quota */
  }
}

/** 讀取後即清除，供導航頁接手 PanoramaViewer 預載 */
export function consumeVisitorPrefetchUrls() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return [];
  }
}
