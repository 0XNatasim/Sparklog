import React, { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/language-provider";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { PAY_RULE_DOCS, PAY_RULE_STATUSES, payRulesReference } from "@/lib/pay-rules-reference";

const STATUS_VARIANT = { source: "success", messier: "info", review: "warning", missing: "destructive" };

// Gestion › Avancé › Règles de paie: every pay rule in force, its value (read from the code),
// the per-employee option that changes it, its status and its source document.
export default function PayRulesReference() {
  const t = useT();
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const groups = useMemo(() => payRulesReference(language), [language]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => (status === "all" || row.status === status)
          && (!q || [row.label, row.value, row.detail, row.optionText, ...row.sources.map(([doc, ref]) => `${PAY_RULE_DOCS[doc]?.label} ${ref}`)]
            .filter(Boolean).join(" ").toLocaleLowerCase().includes(q))),
      }))
      .filter((group) => group.rows.length > 0);
  }, [groups, query, status]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("payRules.intro")}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("payRules.search")} aria-label={t("payRules.search")} className="h-11 pl-8 sm:h-10" />
        </div>
        <div role="radiogroup" aria-label={t("payRules.statusFilter")} className="flex flex-wrap gap-1">
          {["all", ...PAY_RULE_STATUSES].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={status === value}
              onClick={() => setStatus(value)}
              className={cn(
                "min-h-11 rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9",
                status === value ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`payRules.status.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && <p className="text-sm text-muted-foreground">{t("payRules.empty")}</p>}

      {visible.map((group) => (
        <Card key={group.id}>
          <CardContent className="p-0">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">{group.title}</h2>
            <ul className="divide-y">
              {group.rows.map((row) => (
                <li key={row.id} className="space-y-1.5 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-medium">{row.label}</div>
                    <Badge variant={STATUS_VARIANT[row.status]} className="shrink-0">{t(`payRules.status.${row.status}`)}</Badge>
                  </div>
                  <div className="font-semibold text-foreground">{row.value}</div>
                  {row.detail && <p className="text-muted-foreground">{row.detail}</p>}
                  {row.optionText && (
                    <p className="text-xs">
                      <span className="font-semibold">{t("payRules.option")} </span>
                      {row.optionText}
                    </p>
                  )}
                  {row.sources.length > 0 && (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold">{t("payRules.source")}</span>
                      {row.sources.map(([doc, ref]) => (
                        <a
                          key={`${doc}-${ref}`}
                          href={PAY_RULE_DOCS[doc].url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-info underline-offset-2 hover:underline"
                        >
                          {PAY_RULE_DOCS[doc].label}{ref ? ` — ${ref}` : ""}
                          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
