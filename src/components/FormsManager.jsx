import React, { useEffect, useState } from "react";
import { ChevronDown, ClipboardList, ExternalLink, Users } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { COMPANY_FORMS } from "@/lib/forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/use-t";

export default function FormsManager({ collapsible = true }) {
  const t = useT();
  const [availability, setAvailability] = useState({});
  const [employees, setEmployees] = useState([]);
  const [access, setAccess] = useState({});
  const [selectingFormId, setSelectingFormId] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState(new Set());
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(!collapsible);

  useEffect(() => {
    Promise.all([
      supabase.from("employee_forms").select("form_id, enabled"),
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("employee_form_access").select("form_id, employee_id"),
    ]).then(([formsResult, employeesResult, accessResult]) => {
      const loadError = formsResult.error || employeesResult.error || accessResult.error;
      if (loadError) return setError(loadError.message);
      setAvailability(Object.fromEntries((formsResult.data || []).map((row) => [row.form_id, row.enabled])));
      setEmployees(employeesResult.data || []);
      const nextAccess = {};
      (accessResult.data || []).forEach((row) => {
        if (!nextAccess[row.form_id]) nextAccess[row.form_id] = [];
        nextAccess[row.form_id].push(row.employee_id);
      });
      setAccess(nextAccess);
    });
  }, []);

  async function toggle(formId) {
    const form = COMPANY_FORMS.find((item) => item.id === formId);
    const enabled = !Boolean(availability[formId]);
    if (form?.employeeSpecific && enabled) {
      setSelectedEmployees(new Set(access[formId] || []));
      setSelectingFormId(formId);
      return;
    }
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

  function toggleEmployee(employeeId) {
    setSelectedEmployees((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  async function saveEmployeeAccess(formId) {
    if (selectedEmployees.size === 0) {
      setError(t("manager.forms.selectAtLeastOne"));
      return;
    }
    setBusyId(formId);
    setError("");
    const { error: deleteError } = await supabase.from("employee_form_access").delete().eq("form_id", formId);
    if (deleteError) {
      setError(deleteError.message);
      setBusyId("");
      return;
    }
    const rows = [...selectedEmployees].map((employeeId) => ({ form_id: formId, employee_id: employeeId }));
    const { error: insertError } = await supabase.from("employee_form_access").insert(rows);
    if (insertError) {
      setError(insertError.message);
      setBusyId("");
      return;
    }
    const { error: enableError } = await supabase.from("employee_forms").update({ enabled: true }).eq("form_id", formId);
    if (enableError) setError(enableError.message);
    else {
      setAccess((current) => ({ ...current, [formId]: [...selectedEmployees] }));
      setAvailability((current) => ({ ...current, [formId]: true }));
      setSelectingFormId("");
    }
    setBusyId("");
  }

  return (
    <Card>
      <CardHeader className={isOpen ? "pb-3" : "pb-6"}>
        {collapsible ? (
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="manager-forms-list"
          className="flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <CardTitle>{t("manager.forms.title")}</CardTitle>
            <CardDescription className="mt-1">{t("manager.forms.description")}</CardDescription>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            {isOpen ? t("common.hide") : t("common.show")}
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </button>
        ) : (
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <CardTitle>{t("manager.forms.title")}</CardTitle>
              <CardDescription className="mt-1">{t("manager.forms.description")}</CardDescription>
            </div>
          </div>
        )}
      </CardHeader>
      {isOpen && (
        <CardContent id="manager-forms-list" className="grid gap-2 sm:grid-cols-2">
          {error && <div className="col-span-full rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
          {COMPANY_FORMS.map((form) => {
            const enabled = Boolean(availability[form.id]);
            return (
              <div key={form.id} className="rounded-lg border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{t(form.nameKey)}</span>
                  <div className="flex shrink-0 items-center gap-3">
                  <a
                    href={form.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("forms.open")}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${t(form.nameKey)}: ${enabled ? t("common.on") : t("common.off")}`}
                    disabled={busyId === form.id}
                    onClick={() => toggle(form.id)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  </div>
                </div>
                {form.employeeSpecific && enabled && (
                  <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-foreground"><Users className="h-3.5 w-3.5" />{t("manager.forms.hasAccess")}</span>
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => {
                        setSelectedEmployees(new Set(access[form.id] || []));
                        setSelectingFormId(form.id);
                      }}>{t("manager.forms.editEmployees")}</button>
                    </div>
                    <p className="mt-1">{(access[form.id] || []).map((id) => employees.find((employee) => employee.id === id)?.full_name || employees.find((employee) => employee.id === id)?.email).filter(Boolean).join(", ") || t("manager.forms.noEmployees")}</p>
                  </div>
                )}
                {form.employeeSpecific && selectingFormId === form.id && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <p className="text-sm font-semibold">{t("manager.forms.chooseEmployees")}</p>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                      {employees.map((employee) => (
                        <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted">
                          <input type="checkbox" checked={selectedEmployees.has(employee.id)} onChange={() => toggleEmployee(employee.id)} className="h-4 w-4 accent-primary" />
                          <span>{employee.full_name || employee.email}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="rounded-md border px-3 py-1.5 text-sm font-medium" onClick={() => setSelectingFormId("")}>{t("common.cancel")}</button>
                      <button type="button" disabled={busyId === form.id} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => saveEmployeeAccess(form.id)}>{busyId === form.id ? t("common.working") : t("common.save")}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
