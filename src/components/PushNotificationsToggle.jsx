import React, { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { disablePush, enablePush, getPushStatus, PUSH_EVENT } from "@/lib/push";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/use-t";

// Switch for phone notifications (Android, and iPhone once installed on the home screen). On by default
// since V2.4.173 (PushPrompt + syncPushSubscription); turning it off here is remembered on this device.
export default function PushNotificationsToggle() {
  const t = useT();
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const read = () => getPushStatus().then((s) => { if (!cancelled) setStatus(s); }).catch(() => { if (!cancelled) setStatus("unsupported"); });
    read();
    window.addEventListener(PUSH_EVENT, read);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_EVENT, read);
    };
  }, []);

  if (!status || status === "unsupported" || status === "unconfigured") return null;

  async function toggle(next) {
    setBusy(true);
    setError("");
    try {
      const result = next ? await enablePush(user?.id) : await disablePush(user?.id);
      if (result === "dismissed") {
        setError(t("push.prompt.dismissed"));
        setStatus(await getPushStatus().catch(() => "off"));
      } else {
        setStatus(result);
      }
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
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
