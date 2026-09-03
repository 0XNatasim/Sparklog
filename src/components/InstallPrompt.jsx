import React, { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";

const DISMISS_KEY = "sparklog:install-dismissed";

function isStandalone() {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

// Prompts the viewer to install the app. Browsers never install silently — this
// captures the install event and offers a one-tap button as soon as the browser
// deems the app installable. iOS has no install API, so it shows the manual
// "Add to Home Screen" hint instead.
export default function InstallPrompt() {
  const t = useT();
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    const onBeforeInstall = (event) => {
      event.preventDefault();
      setDeferred(event);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS (Safari) never fires beforeinstallprompt — show the manual hint.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      setIosHint(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-xl border bg-card p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <img src="/pwa-192.png?v=2" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("install.title")}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {iosHint ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                {t("install.iosBefore")} <Share className="inline h-3.5 w-3.5" /> {t("install.iosAfter")}
              </span>
            ) : (
              t("install.subtitle")
            )}
          </div>
        </div>
        {!iosHint && (
          <Button type="button" size="sm" onClick={install} className="shrink-0">
            <Download className="mr-1.5 h-4 w-4" />{t("install.button")}
          </Button>
        )}
        <button type="button" onClick={dismiss} aria-label={t("common.cancel")} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
