import React from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/use-t";

// Shown while a route's code downloads (first visit only; the PWA caches it afterwards).
export function PageLoading() {
  const t = useT();
  return (
    <div role="status" className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="text-lg font-bold">{t("common.loading")}</div>
    </div>
  );
}

// Inline variant: keeps the surrounding layout (sidebar, tabs) on screen.
export function PanelLoading() {
  const t = useT();
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {t("common.loading")}
    </div>
  );
}
