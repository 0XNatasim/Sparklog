import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  PAYROLL_RATES_EVENT, deleteStatutorySet, loadPayrollRates, saveStatutorySet, useMissingScaleAlert,
} from "@/lib/payroll-rates";
import { isOwnerRole } from "@/lib/roles";
import {
  STATUTORY_FIELDS, STATUTORY_GROUPS, dataToTexts, diffRuleData, recomputeBracketConstants, textsToData, valueToText,
} from "@/lib/statutory-fields";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import { useAuth } from "../contexts/AuthContext";
import { availableRuleYears, getRules, serializeRules, validateRuleData } from "@/payroll";
import { getRuleSetOverride } from "@/payroll/rules/rule-overrides";

const fmt = (value, kind) => (value == null ? "∞" : kind === "pct" ? `${valueToText(value, "pct")} %` : kind === "money" ? `${Number(value).toLocaleString("fr-CA")} $` : valueToText(value, kind));

// The scale a year starts from: the one in force for it, or (a year not entered yet) the latest earlier one.
function baseFor(year) {
  const years = availableRuleYears();
  const source = years.includes(year) ? year : years.filter((y) => y <= year).pop() ?? years[0];
  return serializeRules(getRules(source, "QC").rules);
}

function YearEditor({ year, isOwner, entered, started, onSaved }) {
  const t = useT();
  const base = useMemo(() => baseFor(year), [year]);
  const [texts, setTexts] = useState(() => dataToTexts(base));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirmDialog();

  const data = useMemo(() => textsToData(texts, base), [texts, base]);
  const problems = useMemo(() => validateRuleData(data), [data]);
  const changes = useMemo(() => diffRuleData(base, data), [base, data]);
  const label = (path) => path.split(".").slice(1).map((p) => t(`statutory.part.${p}`)).join(" · ");
  const setText = (key, value) => setTexts((all) => ({ ...all, [key]: value }));

  async function run(action) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await action();
      await loadPayrollRates();
      window.dispatchEvent(new Event(PAYROLL_RATES_EVENT));
      onSaved();
    } catch (e) {
      setError(friendlyErrorMessage(e, t, "statutory.errors.save"));
    } finally {
      setBusy(false);
    }
  }

  const save = async () => {
    if (problems.length) return;
    if (!(await confirm(t("statutory.confirm", { year, count: changes.length })))) return;
    await run(() => saveStatutorySet({ taxYear: year, data, note }));
  };
  const remove = async () => {
    if (!(await confirm(t("statutory.removeConfirm", { year })))) return;
    await run(() => deleteStatutorySet(year));
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {STATUTORY_GROUPS.map((group) => (
        <fieldset key={group.id} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-semibold">{t(`statutory.part.${group.id}`)}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.fields.map((f) => (
              <label key={f.path} className="text-xs">
                {label(f.path)}{f.kind === "pct" ? " (%)" : f.kind === "money" ? " ($)" : ""}
                <Input inputMode="decimal" value={texts[f.path] ?? ""} disabled={!isOwner || busy} onChange={(e) => setText(f.path, e.target.value)} />
              </label>
            ))}
          </div>
          {group.brackets && (
            <div className="space-y-1">
              <p className="text-xs font-medium">{t("statutory.brackets")}</p>
              {base[group.id].brackets.map((b, i, list) => (
                <div key={i} className="grid grid-cols-3 items-end gap-2">
                  <label className="text-xs">{t("statutory.upTo")}
                    {i === list.length - 1
                      ? <Input value={t("statutory.noLimit")} disabled />
                      : <Input inputMode="decimal" value={texts[`${group.brackets}.${i}.upTo`] ?? ""} disabled={!isOwner || busy} onChange={(e) => setText(`${group.brackets}.${i}.upTo`, e.target.value)} />}
                  </label>
                  <label className="text-xs">{t("statutory.rate")} (%)
                    <Input inputMode="decimal" value={texts[`${group.brackets}.${i}.rate`] ?? ""} disabled={!isOwner || busy} onChange={(e) => setText(`${group.brackets}.${i}.rate`, e.target.value)} />
                  </label>
                  <label className="text-xs">K ($)
                    <Input inputMode="decimal" value={texts[`${group.brackets}.${i}.K`] ?? ""} disabled={!isOwner || busy} onChange={(e) => setText(`${group.brackets}.${i}.K`, e.target.value)} />
                  </label>
                </div>
              ))}
              {isOwner && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setTexts((all) => recomputeBracketConstants(all, base, group.brackets))}>{t("statutory.recomputeK")}</Button>
              )}
            </div>
          )}
        </fieldset>
      ))}

      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 pl-6 text-sm text-destructive" role="alert">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {changes.length > 0 && (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">{t("statutory.changes", { count: changes.length })}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {changes.map((c) => {
              const kind = STATUTORY_FIELDS.find((f) => f.path === c.path)?.kind ?? c.kind;
              const name = c.path.includes(".brackets.")
                ? `${t(`statutory.part.${c.path.split(".")[0]}`)} · ${t("statutory.bracket", { n: Number(c.path.split(".")[2]) + 1 })} · ${c.path.endsWith("K") ? "K" : t(c.path.endsWith("rate") ? "statutory.rate" : "statutory.upTo")}`
                : label(c.path);
              return <li key={c.path}>{name} : {fmt(c.from, kind)} → <strong>{fmt(c.to, kind)}</strong></li>;
            })}
          </ul>
        </div>
      )}
      {isOwner && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 text-xs">{t("statutory.note")}
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </label>
          <Button type="button" disabled={busy || problems.length > 0 || (entered && changes.length === 0)} onClick={save}>{t("statutory.save", { year })}</Button>
          {entered && !started && <Button type="button" variant="outline" disabled={busy} onClick={remove}>{t("statutory.remove")}</Button>}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

// Gestion › Configuration › Barèmes annuels (0131): RRQ, assurance-emploi, RQAP, income-tax brackets, FSS,
// Normes du travail and FDRCMO, one complete set per tax year. Everyone with the menu reads; only the owner saves.
export default function StatutoryRatesManager() {
  const t = useT();
  const { role } = useAuth();
  const isOwner = isOwnerRole(role);
  const thisYear = Number(companyDate().slice(0, 4));
  const [version, setVersion] = useState(0);
  const years = useMemo(() => {
    const known = availableRuleYears();
    return [...new Set([...known, thisYear, thisYear + 1])].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, thisYear]);
  const [year, setYear] = useState(thisYear);
  const missing = useMissingScaleAlert();
  const entered = getRuleSetOverride(year) != null;
  const coded = year === 2026;
  const status = entered ? t("statutory.statusEntered") : coded ? t("statutory.statusCoded") : t("statutory.statusMissing");

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-lg font-bold">{t("statutory.title")}</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("statutory.help")}</p>
          {!isOwner && <p className="mt-1 text-xs font-medium text-muted-foreground">{t("payrollRates.readOnly")}</p>}
        </div>
        {missing && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning" role="status">
            {t("statutory.missing", { year: missing.year })} — {t(`payrollRates.alertStage${missing.stage}`, { days: missing.daysLeft })}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">{t("statutory.year")}
            <select className="block h-10 rounded-md border bg-background px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <p className="pb-2 text-xs text-muted-foreground">{status}</p>
        </div>
        <YearEditor key={`${year}-${version}`} year={year} isOwner={isOwner} entered={entered} started={year <= thisYear} onSaved={() => setVersion((n) => n + 1)} />
      </CardContent>
    </Card>
  );
}
