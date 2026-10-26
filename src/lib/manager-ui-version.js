import { useCallback, useEffect, useState } from "react";

// Gestion V3 (new menus: « À traiter », « Paie de la semaine »…) or V2 (the former menus and pages).
// V3 is the default since V2.4.183, for everyone who opens Gestion; the V2 | V3 switch of the header
// stays until V2 is removed, as a per-device choice. The choices stored before V3 became the default
// (MANAGER_UI_KEY_BEFORE_V3) are ignored, so every device opens V3 once.
export const MANAGER_UI_KEY = "sparklog.managerUiChoice";
export const MANAGER_UI_KEY_BEFORE_V3 = "sparklog.managerUi";
export const DEFAULT_MANAGER_UI_VERSION = "v3";
const EVENT = "sparklog:manager-ui";

export function readManagerUiVersion() {
  try {
    const stored = window.localStorage.getItem(MANAGER_UI_KEY);
    return stored === "v2" || stored === "v3" ? stored : DEFAULT_MANAGER_UI_VERSION;
  } catch {
    return DEFAULT_MANAGER_UI_VERSION;
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
    const next = value === "v2" ? "v2" : "v3";
    try { window.localStorage.setItem(MANAGER_UI_KEY, next); } catch { /* private mode: this tab only */ }
    setVersionState(next);
    window.dispatchEvent(new CustomEvent(EVENT));
  }, []);
  return [version, setVersion];
}
