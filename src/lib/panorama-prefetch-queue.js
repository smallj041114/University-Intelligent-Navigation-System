/** 訪客頁背景預載：限速並行，暖 HTTP 快取 */
const DEFAULT_INTERVAL_MS = 250;
const DEFAULT_CONCURRENCY = 2;

function prefetchOne(url) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    try {
      img.src = new URL(url, window.location.href).href;
    } catch {
      resolve();
    }
  });
}

export const panoramaPrefetchQueue = {
  pending: [],
  seen: new Set(),
  inFlight: 0,
  intervalMs: DEFAULT_INTERVAL_MS,
  concurrency: DEFAULT_CONCURRENCY,

  reset() {
    this.pending = [];
    this.inFlight = 0;
  },

  enqueue(urls) {
    (urls || []).forEach((url) => {
      if (!url || this.seen.has(url)) {
        return;
      }
      this.seen.add(url);
      this.pending.push(url);
    });
    this.pump();
  },

  pump() {
    while (this.inFlight < this.concurrency && this.pending.length) {
      const url = this.pending.shift();
      this.inFlight += 1;
      prefetchOne(url).finally(() => {
        this.inFlight -= 1;
        if (this.pending.length) {
          setTimeout(() => this.pump(), this.intervalMs);
        }
      });
    }
  }
};
