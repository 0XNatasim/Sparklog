import React from "react";
import { IdCard, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSubcontractorRole } from "@/lib/roles";
import NasField from "@/components/NasField";
import Field from "./EmployeeField";

// Phone · e-mail · CCQ card (with the picture on demand), then birth date · NAS · hiring date · last
// day worked (0115). Personal data and employment dates live here, not in « Données CCQ ».
export default function EmployeeContactSection({ profile: p, panel }) {
  const { t, privileged, nasSet, cardViews, setLocal, saveField, saveEmploymentDate, toggleCard, setCcqEdit } = panel;
  const card = cardViews[p.id];
  return (
    <>
      {/* Ligne : téléphone · courriel · carte CCQ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label={t("manager.tbl.phone")}>
          <div className="flex items-center gap-1">
            <Input
              value={p.phone || ""}
              onChange={(e) => setLocal(p.id, "phone", e.target.value)}
              onBlur={(e) => saveField(p.id, "phone", e.target.value)}
              className="h-9"
            />
            {p.phone && (
              <a href={`tel:${String(p.phone).replace(/[^+\d]/g, "")}`} className="shrink-0 rounded p-2 text-primary hover:bg-accent" aria-label="call">
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        </Field>
        <Field label={t("manager.tbl.email")}>
          <div className="flex h-9 items-center text-sm">
            {p.email ? (
              <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 truncate text-primary hover:underline">
                <Mail className="h-4 w-4 shrink-0" /><span className="truncate">{p.email}</span>
              </a>
            ) : <span className="text-muted-foreground">—</span>}
          </div>
        </Field>
        <Field label={t("ccqCard.title")}>
          <div className="flex items-center gap-1.5">
            {p.ccq_card_path && (
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => toggleCard(p)}>
                {card?.open ? t("ccqCard.hideCard") : t("ccqCard.viewCard")}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setCcqEdit(p)}>
              <IdCard className="mr-1.5 h-4 w-4" />{p.ccq_card_path ? t("ccqCard.managerEdit") : t("ccqCard.managerAdd")}
            </Button>
          </div>
        </Field>
      </div>
      {p.ccq_card_path && card?.open && (
        <div className="rounded-lg border bg-muted/20 p-3">
          {card.loading && <div className="text-xs text-muted-foreground">{t("common.loading")}</div>}
          {card.url && <img src={card.url} alt={t("ccqCard.title")} className="max-h-80 w-full rounded-md border object-contain" />}
          {card.error && <div className="text-xs text-destructive">{card.error}</div>}
        </div>
      )}

      {/* Ligne : date de naissance · NAS · date d'embauche · dernier jour travaillé (0115). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("employees.birthDate")}>
          <Input type="date" value={p.birth_date || ""} onChange={(e) => setLocal(p.id, "birth_date", e.target.value)} onBlur={(e) => saveField(p.id, "birth_date", e.target.value)} className="h-9" />
        </Field>
        {!isSubcontractorRole(p.role) && (
          <Field label={t("employees.nasEmployee")}>
            <NasField employeeId={p.id} initialHasNas={nasSet.has(p.id)} privileged={privileged} />
          </Field>
        )}
        <Field label={t("employees.dates.hire")}>
          <Input
            type="date"
            value={p.start_date || ""}
            max={p.last_work_date || undefined}
            onChange={(e) => setLocal(p.id, "start_date", e.target.value)}
            onBlur={(e) => saveEmploymentDate(p, "start_date", e.target.value)}
            className="h-9"
          />
          <span className="text-xs text-muted-foreground">{t("employees.dates.hireHint")}</span>
        </Field>
        <Field label={t("employees.dates.lastWorked")}>
          <Input
            type="date"
            value={p.last_work_date || ""}
            min={p.start_date || undefined}
            onChange={(e) => setLocal(p.id, "last_work_date", e.target.value)}
            onBlur={(e) => saveEmploymentDate(p, "last_work_date", e.target.value)}
            className="h-9"
          />
          <span className="text-xs text-muted-foreground">{t("employees.dates.lastWorkedHint")}</span>
        </Field>
      </div>
    </>
  );
}
