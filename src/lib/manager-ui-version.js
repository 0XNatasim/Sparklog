import { useCallback, useEffect, useState } from "react";

// Gestion V2 (current menus and pages) or V3 (new menus: « À traiter », « Paie de la semaine »).
// A per-device preference, switched from the Gestion header.
export const MANAGER_UI_KEY = "sparklog.managerUi";
const LEGACY_LIVE_KEY = "sparklog.liveVersion"; // V2.4.115 tab on Équipe en direct
const EVENT = "sparklog:manager-ui";

export function readManagerUiVersion() {
  try {
    const stored = window.localStorage.getItem(MANAGER_UI_KEY);
    if (stored === "v2" || stored === "v3") return stored;
    return window.localStorage.getItem(LEGACY_LIVE_KEY) === "3" ? "v3" : "v2";
  } catch {
    return "v2";
  }
}

export function useManagerUiVersion() {
  const [version, setVersionState] = useState(readManagerUiVersion);
  useEffect(() => {
    const sync = () => setVersionState(readManagerUiVersion());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setVersion = useCallback((value) => {
    const next = value === "v3" ? "v3" : "v2";
    try { window.localStorage.setItem(MANAGER_UI_KEY, next); } catch { /* private mode: this tab only */ }
    setVersionState(next);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);
  return [version, setVersion];
}
