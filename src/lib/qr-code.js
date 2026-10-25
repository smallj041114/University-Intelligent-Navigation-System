/** QR 圖產生（依賴 qrcode npm 套件） */

/**
 * @param {string} text
 * @param {HTMLCanvasElement} canvas
 * @param {{ width?: number }} [options]
 */
export async function renderQrToCanvas(text, canvas, options = {}) {
  if (!text || !canvas) {
    throw new Error("缺少文字或 canvas");
  }
  const QRCode = (await import("qrcode")).default;
  const width = Math.max(128, Number(options.width) || 240);
  await QRCode.toCanvas(canvas, text, {
    width,
    margin: 2,
    errorCorrectionLevel: "M"
  });
}

/**
 * @param {string} text
 * @param {{ width?: number }} [options]
 * @returns {Promise<string>} data URL
 */
export async function qrDataUrl(text, options = {}) {
  const QRCode = (await import("qrcode")).default;
  const width = Math.max(128, Number(options.width) || 240);
  return QRCode.toDataURL(text, {
    width,
    margin: 2,
    errorCorrectionLevel: "M"
  });
}
