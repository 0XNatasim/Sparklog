import React from "react";
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useMinuteEditEnabled } from "@/lib/minute-edit";
import { useT } from "@/lib/use-t";

// Red reminder on every management page while « Modifier les minutes » is on (migration 0152): the owner can change the
// hours of a work sheet. It goes away when the switch is turned off in Avancé › Feuille de temps d'urgence.
export default function MinuteEditBanner() {
  const t = useT();
  const enabled = useMinuteEditEnabled();
  if (!enabled) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 flex flex-wrap items-center gap-2 bg-red-700 px-4 py-2 text-sm font-semibold text-white">
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t("minuteEdit.banner")}</span>
      <Link to="/manager/advanced/emergency" className="ml-auto underline">{t("minuteEdit.bannerLink")}</Link>
    </div>
  );
}
