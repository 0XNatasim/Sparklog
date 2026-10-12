import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "@/lib/use-t";

// The application shell and employee form draft are available locally. Final
// submission still requires the server, so the banner remains explicit about that.
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
    <div className="sticky top-0 z-50 border-b-2 border-warning bg-warning/10 px-4 py-3 text-warning" role="status">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 text-sm font-semibold sm:text-base">
        <WifiOff className="h-5 w-5 shrink-0" />
        {t("offline.banner")}
      </div>
    </div>
  );
}
