import React, { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "../contexts/AuthContext";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { companyDate } from "@/lib/company-time";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  PAYROLL_RATES_EVENT, PAYROLL_RATE_DEFS, deletePayrollRate, loadPayrollRates, parseRateInput, rateInputText, savePayrollRate, usePayrollRateAlerts,
} from "@/lib/payroll-rates";
import { isOwnerRole } from "@/lib/roles";
import { useT } from "@/lib/use-t";
import { payrollRateOn } from "@/payroll/ccq-benefits";

const fmt = (value, def) => (def.kind === "percent"
  ? `${(Math.round(value * 1e6) / 1e4).toLocaleString("fr-CA", { maximumFractionDigits: 4 })} %`
  : `${value.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} $`);

// Gestion › Configuration › Taux et barèmes (0130): the simple payroll rates that change from year to year.
// Everyone with the manager menu reads; only the owner adds or removes a dated change.
export default function PayrollRatesManager() {
  const t = useT();
  const { role } = useAuth();
  const isOwner = isOwnerRole(role);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({}); // per key: { date, value, note }
  const [confirm, confirmDialog] = useConfirmDialog();
  const today = companyDate();
  const alerts = usePayrollRateAlerts();

  useEffect(() => {
    let cancelled = false;
    loadPayrollRates()
      .then((list) => { if (!cancelled) { setRows(list); setError(""); } })
      .catch((e) => { if (!cancelled) setError(friendlyErrorMessage(e, t, "payrollRates.errors.load")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload, t]);

  const byKey = useMemo(() => {
    const map = new Map();
    for (const row of rows) map.set(row.key, [...(map.get(row.key) || []), row]);
    return map;
  }, [rows]);

  const setField = (key, patch) => setForm((f) => ({ ...f, [key]: { date: "", value: "", note: "", ...f[key], ...patch } }));

  async function run(action) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await action();
      setReload((n) => n + 1);
      window.dispatchEvent(new Event(PAYROLL_RATES_EVENT));
      return true;
    } catch (e) {
      setError(friendlyErrorMessage(e, t, "payrollRates.errors.save"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event, def) {
    event.preventDefault();
    const f = form[def.key] || {};
    const value = parseRateInput(f.value, def);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || "")) { setError(t("payrollRates.errors.date")); return; }
    if (value == null) { setError(t("payrollRates.errors.value")); return; }
    const label = t(`payrollRates.rate.${def.key}`);
    if (!(await confirm(t("payrollRates.confirm", { label, value: fmt(value, def), date: f.date })))) return;
    if (await run(() => savePayrollRate({ key: def.key, effectiveFrom: f.date, value, note: f.note }))) {
      setForm((all) => ({ ...all, [def.key]: { date: "", value: "", note: "" } }));
    }
  }

  async function remove(def, row) {
    if (!(await confirm(t("payrollRates.removeConfirm", { label: t(`payrollRates.rate.${def.key}`), date: row.effective_from })))) return;
    await run(() => deletePayrollRate({ key: def.key, effectiveFrom: row.effective_from }));
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="text-lg font-bold">{t("payrollRates.title")}</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">{t("payrollRates.help")}</p>
          {!isOwner && <p className="mt-1 text-xs font-medium text-muted-foreground">{t("payrollRates.readOnly")}</p>}
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {alerts.length > 0 && (
          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning" role="status">
            <p className="font-medium">{t("payrollRates.alertTitle")}</p>
            <ul className="ml-4 list-disc">
              {alerts.map((a) => {
                const def = PAYROLL_RATE_DEFS.find((d) => d.key === a.key);
                return (
                  <li key={`${a.key}|${a.date}`}>
                    {t(`payrollRates.rate.${a.key}`)} : {fmt(payrollRateOn(a.key, a.date, def.coded(a.date)), def)} {t("payrollRates.alertFrom", { date: a.date })}
                    {" "}— {t(`payrollRates.alertStage${a.stage}`, { days: a.daysLeft })}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {loading && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}

        <ul className="space-y-3">
          {PAYROLL_RATE_DEFS.map((def) => {
            const list = byKey.get(def.key) || [];
            const current = payrollRateOn(def.key, today, def.coded(today));
            const f = form[def.key] || { date: "", value: "", note: "" };
            return (
              <li key={def.key} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{t(`payrollRates.rate.${def.key}`)}</span>
                  <span className="text-sm">{t("payrollRates.today")} <strong>{fmt(current, def)}</strong></span>
                </div>
                {list.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {list.map((row) => (
                      <li key={row.effective_from} className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">{row.effective_from}</span>
                        <span className="font-medium">{fmt(row.value, def)}</span>
                        {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
                        {row.effective_from > today && <span className="text-xs text-muted-foreground">{t("payrollRates.upcoming")}</span>}
                        {isOwner && row.effective_from > today && (
                          <Button type="button" size="icon" variant="ghost" aria-label={t("payrollRates.remove")} disabled={busy} onClick={() => remove(def, row)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {list.length === 0 && <p className="text-xs text-muted-foreground">{t("payrollRates.codedOnly")}</p>}
                {isOwner && (
                  <form onSubmit={(e) => add(e, def)} className="flex flex-wrap items-end gap-2" noValidate>
                    <label className="text-xs">{t("payrollRates.from")}
                      <Input type="date" value={f.date} onChange={(e) => setField(def.key, { date: e.target.value })} disabled={busy} className="w-40" />
                    </label>
                    <label className="text-xs">{t(def.kind === "percent" ? "payrollRates.newPercent" : "payrollRates.newMoney")}
                      <Input inputMode="decimal" value={f.value} placeholder={rateInputText(current, def)} onChange={(e) => setField(def.key, { value: e.target.value })} disabled={busy} className="w-32" />
                    </label>
                    <label className="min-w-[10rem] flex-1 text-xs">{t("payrollRates.note")}
                      <Input value={f.note} maxLength={200} onChange={(e) => setField(def.key, { note: e.target.value })} disabled={busy} />
                    </label>
                    <Button type="submit" disabled={busy}>{t("payrollRates.add")}</Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t("payrollRates.wagesNote")}</p>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
