import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { disablePush, enablePush, getPushStatus } from "@/lib/push";
import { useT } from "@/lib/use-t";

// Opt-in switch for phone notifications (Android, and iPhone once installed on the home screen).
export default function PushNotificationsToggle() {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPushStatus().then((s) => { if (!cancelled) setStatus(s); }).catch(() => { if (!cancelled) setStatus("unsupported"); });
    return () => { cancelled = true; };
  }, []);

  if (!status || status === "unsupported" || status === "unconfigured") return null;

  async function toggle(next) {
    setBusy(true);
    setError("");
    try {
      setStatus(next ? await enablePush() : await disablePush());
    } catch (e) {
      setError(e?.message || t("push.error"));
      setStatus(await getPushStatus().catch(() => "off"));
    } finally {
      setBusy(false);
    }
  }

  const hint = status === "needs-install" ? t("push.needsInstall") : status === "denied" ? t("push.denied") : t("push.hint");
  const disabled = busy || status === "needs-install" || status === "denied";

  return (
    <div className="mt-4 border-t pt-4">
      <label className={`flex items-center justify-between gap-3 rounded-md border p-3 ${disabled ? "opacity-70" : "cursor-pointer"}`}>
        <span className="flex items-center gap-2 text-sm font-medium"><BellRing className="h-4 w-4 text-primary" />{t("push.label")}</span>
        <input type="checkbox" className="h-4 w-4" checked={status === "on"} disabled={disabled} onChange={(event) => toggle(event.target.checked)} />
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      {error && <p className="mt-1 text-xs text-destructive dark:text-red-300">{error}</p>}
    </div>
  );
}
