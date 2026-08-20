import React, { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { COMPANY_FORMS } from "@/lib/forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/use-t";

export default function FormsManager() {
  const t = useT();
  const [availability, setAvailability] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("employee_forms").select("form_id, enabled").then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message);
      else setAvailability(Object.fromEntries((data || []).map((row) => [row.form_id, row.enabled])));
    });
  }, []);

  async function toggle(formId) {
    const enabled = !Boolean(availability[formId]);
    setBusyId(formId);
    setError("");
    const { error: updateError } = await supabase
      .from("employee_forms")
      .update({ enabled })
      .eq("form_id", formId);
    if (updateError) setError(updateError.message);
    else setAvailability((current) => ({ ...current, [formId]: enabled }));
    setBusyId("");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <CardTitle>{t("manager.forms.title")}</CardTitle>
        </div>
        <CardDescription>{t("manager.forms.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {error && <div className="col-span-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {COMPANY_FORMS.map((form) => {
          const enabled = Boolean(availability[form.id]);
          return (
            <div key={form.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <span className="text-sm font-medium">{form.name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`${form.name}: ${enabled ? t("common.on") : t("common.off")}`}
                disabled={busyId === form.id}
                onClick={() => toggle(form.id)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
