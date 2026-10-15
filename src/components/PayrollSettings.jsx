import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, FileText } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Fold from "@/components/ui/fold";
import { useT } from "@/lib/use-t";
import { useLanguage } from "@/components/language-provider";
import { isSubcontractorRole } from "@/lib/roles";
import { WORKFORCE_FUND, FSS } from "@/payroll/rules/2026.js";
import { fssRate } from "@/payroll/employer/fss.js";

// Paramètres › Paie: employer parameters (payroll_employer_settings) and each employee's
// TD1 / TP-1015.3 amounts (employee_tax_profiles). Manager tier only (RLS, migration 0083).
const parseAmount = (value) => {
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const asText = (value) => (value == null ? "" : String(value));

export default function PayrollSettings() {
  const t = useT();
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <EmployerSection t={t} />
        <TaxFormsSection t={t} />
      </CardContent>
    </Card>
  );
}

function EmployerSection({ t }) {
  const { language } = useLanguage();
  const [form, setForm] = useState({ payroll: "", fss: "general", cnesst: "", cnesstYear: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("payroll_employer_settings").select("*").maybeSingle();
      if (error) { setMessage(error.message); return; }
      if (data) {
        setForm({
          payroll: asText(data.annual_payroll_estimate),
          fss: data.fss_category || "general",
          cnesst: asText(data.cnesst_rate_per_100),
          cnesstYear: asText(data.cnesst_year),
        });
      }
    })();
  }, []);

  const payroll = parseAmount(form.payroll);
  const fssPreview = useMemo(
    () => fssRate({ fss: FSS }, { annualPayrollEstimate: Number.isFinite(payroll) ? payroll || 0 : 0, fssCategory: form.fss }),
    [payroll, form.fss]
  );

  async function save() {
    const cnesst = parseAmount(form.cnesst);
    const year = form.cnesstYear.trim() === "" ? null : Number(form.cnesstYear);
    if (Number.isNaN(payroll) || Number.isNaN(cnesst) || (cnesst != null && cnesst >= 100)
      || (year != null && (!Number.isInteger(year) || year < 2020 || year > 2100))) {
      setMessage(t("payrollSettings.invalid"));
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("payroll_employer_settings").update({
      annual_payroll_estimate: payroll,
      fss_category: form.fss,
      cnesst_rate_per_100: cnesst,
      cnesst_year: year,
      updated_at: new Date().toISOString(),
      updated_by: auth?.user?.id || null,
    }).eq("id", true);
    setMessage(error?.message || t("payrollSettings.saved"));
    setSaving(false);
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Fold icon={Building2} title={t("payrollSettings.employer.title")}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{t("payrollSettings.employer.help")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("payrollSettings.payroll")}</span>
            <Input inputMode="decimal" value={form.payroll} onChange={set("payroll")} placeholder="0" className="h-11 font-mono sm:h-10" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("payrollSettings.fssCategory")}</span>
            <select value={form.fss} onChange={set("fss")} className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm sm:h-10">
              <option value="general">{t("payrollSettings.fss.general")}</option>
              <option value="primary_manufacturing">{t("payrollSettings.fss.primary")}</option>
              <option value="public">{t("payrollSettings.fss.public")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("payrollSettings.cnesst")}</span>
            <Input inputMode="decimal" value={form.cnesst} onChange={set("cnesst")} placeholder={t("payrollSettings.cnesstPlaceholder")} className="h-11 font-mono sm:h-10" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("payrollSettings.cnesstYear")}</span>
            <Input inputMode="numeric" value={form.cnesstYear} onChange={set("cnesstYear")} placeholder="2026" className="h-11 font-mono sm:h-10" />
          </label>
        </div>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>{t("payrollSettings.fssPreview", { rate: (fssPreview * 100).toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</li>
          <li>{Number.isFinite(payroll) && payroll > WORKFORCE_FUND.payrollThreshold ? t("payrollSettings.fdrcmoYes") : t("payrollSettings.fdrcmoNo")}</li>
          {form.cnesst.trim() === "" && <li className="text-warning">{t("payrollSettings.cnesstMissing")}</li>}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="h-11 sm:h-10" disabled={saving} onClick={save}>{saving ? t("common.working") : t("common.save")}</Button>
          {message && <span className="text-xs text-muted-foreground" role="status">{message}</span>}
        </div>
      </div>
    </Fold>
  );
}

const TAX_FIELDS = [
  { key: "td1_claim_amount", labelKey: "payrollSettings.td1" },
  { key: "federal_additional_tax", labelKey: "payrollSettings.td1Extra" },
  { key: "tp1015_3_credits", labelKey: "payrollSettings.tp1015" },
  { key: "quebec_additional_tax", labelKey: "payrollSettings.tp1015Extra" },
];

function TaxFormsSection({ t }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    const [{ data: people, error: pErr }, { data: forms, error: fErr }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, is_paused, hourly_rate").order("full_name", { ascending: true }),
      supabase.from("employee_tax_profiles").select("*"),
    ]);
    if (pErr || fErr) { setMessage((pErr || fErr).message); return; }
    const byUser = new Map((forms || []).map((row) => [row.user_id, row]));
    setRows((people || [])
      .filter((p) => !isSubcontractorRole(p.role))
      .map((p) => {
        const f = byUser.get(p.id) || {};
        return {
          id: p.id,
          name: p.full_name || p.email || p.id,
          paused: p.is_paused,
          td1_claim_amount: asText(f.td1_claim_amount),
          federal_additional_tax: asText(f.federal_additional_tax && Number(f.federal_additional_tax) ? f.federal_additional_tax : ""),
          tp1015_3_credits: asText(f.tp1015_3_credits),
          quebec_additional_tax: asText(f.quebec_additional_tax && Number(f.quebec_additional_tax) ? f.quebec_additional_tax : ""),
          forms_received_on: f.forms_received_on || "",
          hourly_rate: Number(p.hourly_rate) || 0,
          fixed_weekly_hours: asText(f.fixed_weekly_hours),
          fixed_pay_start: f.fixed_pay_start || "",
          ei_exempt: Boolean(f.ei_exempt),
        };
      }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setField = (id, key, value) => setRows((list) => list.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  async function saveRow(row) {
    const values = Object.fromEntries(TAX_FIELDS.map(({ key }) => [key, parseAmount(row[key])]));
    const fixedHours = parseAmount(row.fixed_weekly_hours);
    if (Object.values(values).some((v) => Number.isNaN(v)) || Number.isNaN(fixedHours) || (fixedHours != null && (fixedHours <= 0 || fixedHours > 80))) {
      setMessage(t("payrollSettings.invalid"));
      return;
    }
    if (fixedHours && !row.fixed_pay_start) { setMessage(t("payrollSettings.fixedStartRequired")); return; }
    setSavingId(row.id);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("employee_tax_profiles").upsert({
      user_id: row.id,
      td1_claim_amount: values.td1_claim_amount,
      federal_additional_tax: values.federal_additional_tax ?? 0,
      tp1015_3_credits: values.tp1015_3_credits,
      quebec_additional_tax: values.quebec_additional_tax ?? 0,
      forms_received_on: row.forms_received_on || null,
      fixed_weekly_hours: fixedHours,
      fixed_pay_start: fixedHours ? row.fixed_pay_start : null,
      ei_exempt: row.ei_exempt,
      updated_at: new Date().toISOString(),
      updated_by: auth?.user?.id || null,
    }, { onConflict: "user_id" });
    setMessage(error?.message || t("payrollSettings.taxSaved", { name: row.name }));
    setSavingId(null);
  }

  return (
    <Fold icon={FileText} title={t("payrollSettings.tax.title")}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">{t("payrollSettings.tax.help")}</p>
        {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.id} className="space-y-2 rounded border bg-muted/30 p-3">
              <div className="text-sm font-semibold">{row.name}{row.paused ? <span className="ml-2 text-xs font-normal text-muted-foreground">{t("payrollSettings.paused")}</span> : null}</div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                {TAX_FIELDS.map(({ key, labelKey }) => (
                  <label key={key} className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t(labelKey)}</span>
                    <Input inputMode="decimal" value={row[key]} onChange={(e) => setField(row.id, key, e.target.value)} placeholder={key.includes("additional") ? "0" : t("payrollSettings.basicAmount")} className="h-11 font-mono sm:h-10" />
                  </label>
                ))}
                <label className="col-span-2 space-y-1 lg:col-span-1">
                  <span className="text-xs text-muted-foreground">{t("payrollSettings.receivedOn")}</span>
                  <Input type="date" value={row.forms_received_on} onChange={(e) => setField(row.id, "forms_received_on", e.target.value)} className="h-11 sm:h-10" />
                </label>
              </div>
              <FixedPayFields t={t} row={row} setField={setField} />
              <Button type="button" size="sm" className="h-11 sm:h-9" disabled={savingId === row.id} onClick={() => saveRow(row)}>
                {savingId === row.id ? t("common.working") : t("common.save")}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Fold>
  );
}

// Fixed weekly pay (hours × hourly rate every week, whatever the jobs) and the EI exemption
// (migration 0091). Read by computeEmployeeWeekTalon through the tax profile.
function FixedPayFields({ t, row, setField }) {
  const hours = parseAmount(row.fixed_weekly_hours);
  const fmt = (v) => Number(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="space-y-2 rounded border bg-background p-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("payrollSettings.fixedHours")}</span>
          <Input inputMode="decimal" value={row.fixed_weekly_hours} onChange={(e) => setField(row.id, "fixed_weekly_hours", e.target.value)} placeholder="—" className="h-11 font-mono sm:h-10" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">{t("payrollSettings.fixedStart")}</span>
          <Input type="date" value={row.fixed_pay_start} disabled={!hours} onChange={(e) => setField(row.id, "fixed_pay_start", e.target.value)} className="h-11 sm:h-10" />
        </label>
        <label title={t("payrollSettings.eiExemptHelp")} className="col-span-2 flex cursor-pointer items-center gap-2 self-end rounded border px-2 py-2 text-xs">
          <input type="checkbox" checked={row.ei_exempt} onChange={(e) => setField(row.id, "ei_exempt", e.target.checked)} className="h-5 w-5 shrink-0 rounded border-input accent-primary" />
          <span>{t("payrollSettings.eiExempt")}</span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {hours > 0
          ? (row.hourly_rate > 0
            ? t("payrollSettings.fixedPreview", { hours: fmt(hours), rate: fmt(row.hourly_rate), amount: fmt(hours * row.hourly_rate) })
            : <span className="text-warning">{t("payrollSettings.fixedNoRate")}</span>)
          : t("payrollSettings.fixedHoursHelp")}
        {row.ei_exempt ? <> · {t("payrollSettings.eiExemptHelp")}</> : null}
      </p>
    </div>
  );
}
