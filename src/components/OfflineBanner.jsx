import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "@/lib/use-t";

// SparkLog caches the application shell, not unsent form data, so this banner
// must not promise durable local storage.
export default function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="sticky top-0 z-50 border-b border-amber-500 bg-amber-100 px-3 py-1.5 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 text-xs font-semibold">
        <WifiOff className="h-3.5 w-3.5" />
        {t("offline.banner")}
      </div>
    </div>
  );
}
