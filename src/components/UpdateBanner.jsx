import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";
import { APP_VERSION } from "@/lib/version";
import { fetchDeployedVersion, isNewerVersion } from "@/lib/app-update";

const CHECK_MS = 5 * 60 * 1000;

// Tells the user when a newer deploy exists than the one running on this device, even if a
// stale service worker/cache keeps serving the old build. It never reloads by itself, so
// nobody loses a form in progress.
export default function UpdateBanner() {
  const t = useT();
  const [latest, setLatest] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const version = await fetchDeployedVersion();
      if (!cancelled && isNewerVersion(version, APP_VERSION)) setLatest(version);
    };
    check();
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const id = setInterval(check, CHECK_MS);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      clearInterval(id);
    };
  }, []);

  async function refresh() {
    setBusy(true);
    try {
      // Drop the stale service worker + caches so the reload really fetches the new build.
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations || []).map((registration) => registration.unregister()));
      if (window.caches) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    } catch {
      /* reload anyway */
    }
    window.location.reload();
  }

  if (!latest) return null;

  return (
    <div className="sticky top-0 z-50 border-b-2 border-sky-500 bg-sky-100 px-4 py-3 text-sky-950 dark:bg-sky-900/60 dark:text-sky-100" role="status">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 text-sm font-semibold sm:text-base">
        <span>{t("update.banner", { version: latest, current: APP_VERSION })}</span>
        <Button type="button" size="sm" disabled={busy} onClick={refresh}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${busy ? "animate-spin" : ""}`} />{t("update.refresh")}
        </Button>
      </div>
    </div>
  );
}
