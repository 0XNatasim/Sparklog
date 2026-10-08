export function urlBase64ToUint8Array(base64) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function isIos(nav = globalThis.navigator) {
  return /iphone|ipad|ipod/i.test(nav?.userAgent || "") || (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1);
}

export function isStandalone(win = globalThis.window) {
  try {
    return win.matchMedia("(display-mode: standalone)").matches || win.navigator.standalone === true;
  } catch {
    return false;
  }
}

// Number on the installed app's icon. No-op where the Badging API is missing.
export function setAppBadgeCount(count, nav = globalThis.navigator) {
  try {
    if (count > 0 && nav?.setAppBadge) return Promise.resolve(nav.setAppBadge(Math.min(count, 999))).catch(() => {});
    if (nav?.clearAppBadge) return Promise.resolve(nav.clearAppBadge()).catch(() => {});
  } catch { /* unsupported */ }
  return Promise.resolve();
}
