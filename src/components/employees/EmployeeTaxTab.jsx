import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { taxFormRow, taxProfileUpsert } from "@/lib/tax-profile";
import { FixedPayFields, TaxAmountFields } from "./TaxProfileFields";

// « Impôts » tab of the V3 employee card: the same row and the same save as Paramètres › Paie › TD1
// (employee_tax_profiles, manager tier). Loaded when the tab opens; empty fields = basic amount.
export default function EmployeeTaxTab({ profile: p, t }) {
  const [row, setRow] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.from("employee_tax_profiles").select("*").eq("user_id", p.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) setMessage(error.message);
      else setRow(taxFormRow(p, data));
    });
    return () => { alive = false; };
    // The row is read once per card; the profile's other fields do not change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  const setField = (_id, key, value) => setRow((current) => ({ ...current, [key]: value }));

  async function save() {
    const { data: auth } = await supabase.auth.getUser();
    const { payload, error: problem } = taxProfileUpsert({ ...row, hourly_rate: Number(p.hourly_rate) || 0 }, auth?.user?.id || null);
    if (problem) { setMessage(t(problem)); return; }
    setSaving(true);
    const { error } = await supabase.from("employee_tax_profiles").upsert(payload, { onConflict: "user_id" });
    setMessage(error?.message || t("payrollSettings.taxSaved", { name: row.name }));
    setSaving(false);
  }

  if (!row) return <p className="text-sm text-muted-foreground">{message || t("common.loading")}</p>;
  const shown = { ...row, hourly_rate: Number(p.hourly_rate) || 0 };
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">{t("payrollSettings.tax.help")}</p>
      <TaxAmountFields t={t} row={shown} setField={setField} />
      <FixedPayFields t={t} row={shown} setField={setField} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" className="h-11 sm:h-9" disabled={saving} onClick={save}>
          {saving ? t("common.working") : t("common.save")}
        </Button>
        {message && <span className="text-xs text-muted-foreground" role="status">{message}</span>}
      </div>
    </div>
  );
}
