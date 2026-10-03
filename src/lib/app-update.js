// True when `remote` (e.g. "2.4.36") is a newer dotted version than `current`.
export function isNewerVersion(remote, current) {
  const a = String(remote || "").split(".").map((n) => parseInt(n, 10));
  const b = String(current || "").split(".").map((n) => parseInt(n, 10));
  if (a.some(Number.isNaN) || b.some(Number.isNaN) || a.length < 3) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Latest deployed version from /version.json, or "" when unreachable (offline, dev server).
export async function fetchDeployedVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return "";
    const data = await response.json();
    return typeof data?.version === "string" ? data.version : "";
  } catch {
    return "";
  }
}
