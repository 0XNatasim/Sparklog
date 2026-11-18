// The « Confirmation de temps supp. » form opened from the overtime proof step. Its address is NOT in the code: it is the
// form already listed in Profil › Formulaires (table employee_forms, edited in Gestion), so changing it there changes it here.
import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { QUERY_BUDGETS } from "@/lib/query-budgets";

// Internal id of that form's row, then its name as a fallback if the row is ever recreated.
export const OVERTIME_CONFIRMATION_FORM_ID = "3786f813-675c-4f6a-87ad-ebf8f7654e7c";
const NAME_PATTERN = /confirmation de temps supp|real-time overtime/i;

// The enabled form with an address that is the overtime confirmation form, or null. Pure.
export function pickOvertimeConfirmationForm(forms) {
  const usable = (forms || []).filter((form) => form?.enabled !== false && String(form?.url || "").startsWith("https://"));
  return usable.find((form) => form.form_id === OVERTIME_CONFIRMATION_FORM_ID)
    || usable.find((form) => NAME_PATTERN.test(`${form.name_fr || ""} ${form.name_en || ""}`))
    || null;
}

let cached = null;

// { url, nameFr, nameEn } or null (not loaded yet, not found, or unreadable: the step then shows the name without a link).
export function useOvertimeConfirmationForm() {
  const [form, setForm] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    Promise.resolve()
      .then(() => supabase.from("employee_forms").select("form_id, name_fr, name_en, url, enabled").eq("enabled", true).limit(QUERY_BUDGETS.managedForms))
      .then(({ data }) => {
        const found = pickOvertimeConfirmationForm(data);
        if (found && alive) {
          cached = { url: found.url, nameFr: found.name_fr, nameEn: found.name_en };
          setForm(cached);
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return form;
}
