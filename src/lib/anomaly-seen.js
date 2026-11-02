import { useCallback, useState } from "react";

// « J'ai vu » on a « À vérifier avant d'approuver » alert (V2.4.231): the manager has looked at it
// (typically two employees on the same OT during a training) and does not want it back.
// Kept in this browser only (a per-viewer convenience, like a collapsed section): it never touches the
// job, the approval or the database. An alert comes back by itself when what it describes changes
// (a new job on the same OT), and entries older than 90 days are dropped.

const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export const seenStorageKey = (userId) => `sparklog.seenAnomalies.${userId || "anon"}`;
export const FOLDED_STORAGE_KEY = "sparklog.anomaliesFolded";

function getStorage() {
  try { return window.localStorage || null; } catch { return null; }
}

// What identifies the alert for « seen »: the anomaly key, plus the other jobs for « OT déjà utilisé »,
// so a third job on the same OT is a new alert.
export function seenId(anomaly) {
  if (anomaly?.type !== "ot_reused") return String(anomaly?.key || "");
  const others = (anomaly.others || []).map((o) => o.jobId).filter(Boolean).sort().join(",");
  return `${anomaly.key}|${others}`;
}

export function readSeen(storage, userId, now = Date.now()) {
  try {
    const raw = JSON.parse(storage?.getItem(seenStorageKey(userId)) || "{}");
    const out = {};
    for (const [id, at] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
      if (typeof at === "number" && now - at < KEEP_MS) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSeen(storage, userId, seen) {
  try { storage?.setItem(seenStorageKey(userId), JSON.stringify(seen)); } catch { /* storage unavailable: not remembered */ }
}

export function unseenAnomalies(anomalies, seen) {
  return (anomalies || []).filter((anomaly) => !Object.prototype.hasOwnProperty.call(seen || {}, seenId(anomaly)));
}

export function seenCount(anomalies, seen) {
  return (anomalies || []).length - unseenAnomalies(anomalies, seen).length;
}

export function useSeenAnomalies(userId) {
  const [seen, setSeen] = useState(() => readSeen(getStorage(), userId));
  const mark = useCallback((anomaly) => {
    setSeen((previous) => {
      const next = { ...previous, [seenId(anomaly)]: Date.now() };
      writeSeen(getStorage(), userId, next);
      return next;
    });
  }, [userId]);
  const clear = useCallback(() => {
    setSeen({});
    writeSeen(getStorage(), userId, {});
  }, [userId]);
  return { seen, mark, clear };
}

// Collapsed / expanded state of the box, remembered in this browser.
export function useAnomaliesFolded() {
  const [folded, setFolded] = useState(() => {
    try { return getStorage()?.getItem(FOLDED_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setFolded((value) => {
      try { getStorage()?.setItem(FOLDED_STORAGE_KEY, value ? "0" : "1"); } catch { /* not remembered */ }
      return !value;
    });
  }, []);
  return [folded, toggle];
}
