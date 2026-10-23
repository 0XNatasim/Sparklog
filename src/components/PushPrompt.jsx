import React, { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { enablePush, getPushStatus, pushPromptMode, PUSH_EVENT, snoozePushPrompt, syncPushSubscription } from "@/lib/push";
import { useT } from "@/lib/use-t";

// Phone notifications are on by default (V2.4.173). At start the device is (re)subscribed silently when the
// browser already allows it; otherwise this card asks for the one tap the browser requires (« Autoriser »).
// iPhone in a Safari tab: how to install first. Phones and tablets only (a computer uses Profile). Hidden for
// 3 days by « Plus tard », for good once the person turns notifications off in Profile, and never when they
// are blocked in the settings.
export default function PushPrompt() {
  const t = useT();
  const { user } = useAuth();
  const userId = user?.id;
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    syncPushSubscription(userId).then((status) => {
      if (!cancelled) setMode(pushPromptMode(status, { userId }));
    });
    const refresh = () => getPushStatus()
      .then((status) => { if (!cancelled) setMode(pushPromptMode(status, { userId })); })
      .catch(() => {});
    window.addEventListener(PUSH_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_EVENT, refresh);
    };
  }, [userId]);

  if (!mode) return null;

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const status = await enablePush(userId);
      if (status === "denied") setError(t("push.prompt.denied"));
      if (status === "dismissed") setError(t("push.prompt.dismissed"));
      setMode(pushPromptMode(await getPushStatus(), { userId }));
    } catch (e) {
      setError(e?.message || t("push.error"));
    } finally {
      setBusy(false);
    }
  }

  function later() {
    snoozePushPrompt();
    setMode(null);
  }

  return (
    <div className="border-b-2 border-info bg-info/10 px-3 py-3 text-info" role="region" aria-label={t("push.label")}>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-semibold">{t("push.prompt.title")}</div>
            <div className="text-foreground">{mode === "install" ? t("push.needsInstall") : t("push.prompt.body")}</div>
            {error && <div className="mt-1 text-destructive">{error}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {mode === "ask" && (
            <Button type="button" className="h-11 px-4 sm:h-10" disabled={busy} onClick={enable}>
              {busy ? t("common.working") : t("push.prompt.enable")}
            </Button>
          )}
          <Button type="button" variant="ghost" className="h-11 px-3 text-foreground sm:h-10" onClick={later}>
            <X className="mr-1 h-4 w-4" aria-hidden="true" />{t("push.prompt.later")}
          </Button>
        </div>
      </div>
    </div>
  );
}
