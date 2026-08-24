import React, { useState } from "react";
import { Banknote, Building2, Calculator, FileJson } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import CcqJsonExport from "@/components/CcqJsonExport";
import { useT } from "@/lib/use-t";

export default function ManagerDownloads() {
  const t = useT();
  const [section, setSection] = useState("ccq");
  const cards = [
    { id: "bank", icon: Banknote, title: t("downloads.bank"), description: t("downloads.bankDescription") },
    { id: "das", icon: Building2, title: t("downloads.das"), description: t("downloads.dasDescription") },
    { id: "ccq", icon: FileJson, title: t("downloads.ccq"), description: t("downloads.ccqDescription") },
    { id: "costing", icon: Calculator, title: t("downloads.costing"), description: t("downloads.costingDescription") },
  ];
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ id, icon: Icon, title, description }) => (
          <button key={id} type="button" onClick={() => setSection(id)} className={`rounded-lg border p-4 text-left transition-colors ${section === id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:border-primary/50"}`}>
            <div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </button>
        ))}
      </div>
      {section === "ccq" ? <CcqJsonExport /> : (
        <Card><CardContent className="p-6"><h2 className="font-semibold">{cards.find((card) => card.id === section)?.title}</h2><p className="mt-2 text-sm text-muted-foreground">{section === "costing" ? t("downloads.costingPrivate") : t("downloads.comingSoon")}</p></CardContent></Card>
      )}
    </div>
  );
}
