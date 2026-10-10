import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ClipboardList, ExternalLink, Pencil, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { friendlyErrorMessage } from "@/lib/error-messages";
import { buildFormRow, validateManagedForm } from "@/lib/managed-forms";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { moveItem, nextSortOrder } from "@/lib/sort-order";
import { useLanguage } from "@/components/language-provider";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";

const EMPTY_DRAFT = { name_fr: "", name_en: "", url: "", employee_specific: false };

// Configuration › Formulaires: owners/managers create, edit, reorder, delete and switch on
// the links shown in each employee's Profile — no code change or deployment needed.
export default function FormsManager({ collapsible = true }) {
  const t = useT();
  const { language } = useLanguage();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [forms, setForms] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [access, setAccess] = useState({});
  const [editingId, setEditingId] = useState(""); // "" = closed, "new" = creating, else form_id
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [showErrors, setShowErrors] = useState(false);
  const [selectingFormId, setSelectingFormId] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState(new Set());
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(!collapsible);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [formsResult, employeesResult, accessResult] = await withTimeout(Promise.all([
        supabase.from("employee_forms").select("form_id, enabled, name_fr, name_en, url, employee_specific, sort_order, created_at")
          .order("sort_order").order("created_at").limit(QUERY_BUDGETS.managedForms),
        supabase.from("profiles").select("id, full_name, email, is_paused").order("full_name").limit(QUERY_BUDGETS.inventoryPeople),
        supabase.from("employee_form_access").select("form_id, employee_id").limit(5000),
      ]), 15000);
      const loadError = formsResult.error || employeesResult.error || accessResult.error;
      if (loadError) throw loadError;
      setForms(formsResult.data || []);
      setEmployees((employeesResult.data || []).filter((employee) => !employee.is_paused));
      const nextAccess = {};
      (accessResult.data || []).forEach((row) => {
        if (!nextAccess[row.form_id]) nextAccess[row.form_id] = [];
        nextAccess[row.form_id].push(row.employee_id);
      });
      setAccess(nextAccess);
    } catch (loadError) {
      setError(friendlyErrorMessage(loadError, t, "manager.forms.errors.load"));
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const displayName = (form) => (language === "en" ? form.name_en || form.name_fr : form.name_fr || form.name_en) || "—";
  const nameOf = (employeeId) => {
    const employee = employees.find((item) => item.id === employeeId);
    return employee?.full_name || employee?.email;
  };

  // Every write goes through here: one at a time, bounded, always releases the button.
  async function run(id, action, fallbackKey) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusyId(id);
    setError("");
    try {
      await action();
      return true;
    } catch (actionError) {
      setError(friendlyErrorMessage(actionError, t, fallbackKey));
      return false;
    } finally {
      busyRef.current = false;
      setBusyId("");
    }
  }

  const check = ({ error: writeError }) => { if (writeError) throw writeError; };

  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setShowErrors(false);
    setEditingId("new");
  }

  function startEdit(form) {
    setDraft({ name_fr: form.name_fr || "", name_en: form.name_en || "", url: form.url || "", employee_specific: Boolean(form.employee_specific) });
    setShowErrors(false);
    setEditingId(form.form_id);
  }

  async function saveDraft() {
    if (validateManagedForm(draft).length) {
      setShowErrors(true);
      return;
    }
    const row = buildFormRow(draft);
    const creating = editingId === "new";
    const ok = await run(editingId, async () => {
      if (creating) {
        check(await withTimeout(supabase.from("employee_forms").insert({ ...row, form_id: crypto.randomUUID(), enabled: false, sort_order: nextSortOrder(forms) }), 12000));
      } else {
        check(await withTimeout(supabase.from("employee_forms").update(row).eq("form_id", editingId), 12000));
      }
    }, "manager.forms.errors.save");
    if (ok) {
      setEditingId("");
      await load();
    }
  }

  async function remove(form) {
    if (!(await confirm(t("manager.forms.deleteConfirm", { name: displayName(form) })))) return;
    const ok = await run(form.form_id, async () => {
      check(await withTimeout(supabase.from("employee_forms").delete().eq("form_id", form.form_id), 12000));
    }, "manager.forms.errors.delete");
    if (ok) await load();
  }

  async function move(index, delta) {
    const changes = moveItem(forms, index, delta, "form_id");
    if (!changes.length) return;
    const ok = await run("order", async () => {
      const results = await withTimeout(Promise.all(changes.map((change) => supabase.from("employee_forms").update({ sort_order: change.sort_order }).eq("form_id", change.id))), 12000);
      results.forEach(check);
    }, "manager.forms.errors.save");
    if (ok) await load();
  }

  async function toggle(form) {
    const enabled = !form.enabled;
    if (form.employee_specific && enabled) {
      setSelectedEmployees(new Set(access[form.form_id] || []));
      setSelectingFormId(form.form_id);
      return;
    }
    const ok = await run(form.form_id, async () => {
      check(await withTimeout(supabase.from("employee_forms").update({ enabled }).eq("form_id", form.form_id), 12000));
    }, "manager.forms.errors.save");
    if (ok) setForms((current) => current.map((item) => (item.form_id === form.form_id ? { ...item, enabled } : item)));
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
    const ok = await run(formId, async () => {
      check(await withTimeout(supabase.from("employee_form_access").delete().eq("form_id", formId), 12000));
      const rows = [...selectedEmployees].map((employeeId) => ({ form_id: formId, employee_id: employeeId }));
      check(await withTimeout(supabase.from("employee_form_access").insert(rows), 12000));
      check(await withTimeout(supabase.from("employee_forms").update({ enabled: true }).eq("form_id", formId), 12000));
    }, "manager.forms.errors.save");
    if (ok) {
      setSelectingFormId("");
      await load();
    }
  }

  const draftErrors = showErrors ? validateManagedForm(draft) : [];
  const setField = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const anyBusy = Boolean(busyId);

  const editor = (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">{editingId === "new" ? t("manager.forms.new") : t("manager.forms.edit")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="form-name-fr">{t("manager.forms.nameFr")}</Label>
          <Input id="form-name-fr" value={draft.name_fr} maxLength={200} onChange={setField("name_fr")} className={draftErrors.includes("name") ? "border-destructive" : ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="form-name-en">{t("manager.forms.nameEn")}</Label>
          <Input id="form-name-en" value={draft.name_en} maxLength={200} onChange={setField("name_en")} className={draftErrors.includes("name") ? "border-destructive" : ""} />
        </div>
        {draftErrors.includes("name") && <p className="text-xs text-destructive sm:col-span-2">{t("manager.forms.errors.name")}</p>}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="form-url">{t("manager.forms.url")}</Label>
          <Input id="form-url" type="url" inputMode="url" placeholder="https://…" value={draft.url} maxLength={2000} onChange={setField("url")} className={draftErrors.includes("url") ? "border-destructive" : ""} />
          {draftErrors.includes("url") && <p className="text-xs text-destructive">{t("manager.forms.errors.url")}</p>}
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={draft.employee_specific}
            onChange={(event) => setDraft((current) => ({ ...current, employee_specific: event.target.checked }))} />
          <span>
            <span className="font-medium">{t("manager.forms.employeeSpecific")}</span>
            <span className="block text-xs text-muted-foreground">{t("manager.forms.employeeSpecificHint")}</span>
          </span>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditingId("")} disabled={anyBusy}>{t("common.cancel")}</Button>
        <Button type="button" size="sm" onClick={saveDraft} disabled={anyBusy}>{anyBusy ? t("common.working") : t("common.save")}</Button>
      </div>
    </div>
  );

  return (
    <Card>
      {confirmDialog}
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
        <CardContent id="manager-forms-list" className="space-y-3">
          {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300" role="alert">{error}</div>}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={startCreate} disabled={anyBusy || editingId === "new"}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />{t("manager.forms.add")}
            </Button>
          </div>
          {editingId === "new" && editor}
          {forms.length === 0 && editingId !== "new" && <p className="text-sm text-muted-foreground">{t("manager.forms.empty")}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {forms.map((form, index) => {
              const enabled = Boolean(form.enabled);
              const name = displayName(form);
              return (
                <div key={form.form_id} className={`rounded-lg border px-4 py-3 ${editingId === form.form_id ? "sm:col-span-2" : ""}`}>
                  {editingId === form.form_id ? editor : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 break-words text-sm font-medium">{name}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${name}: ${enabled ? t("common.on") : t("common.off")}`}
                          disabled={anyBusy || !form.url}
                          onClick={() => toggle(form)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                        >
                          <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                      {!form.url && <p className="mt-1 text-xs text-destructive">{t("manager.forms.noUrl")}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {form.url && (
                          <a href={form.url} target="_blank" rel="noopener noreferrer"
                            className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                            {t("forms.open")}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={anyBusy || index === 0} aria-label={t("common.moveUp")} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={anyBusy || index === forms.length - 1} aria-label={t("common.moveDown")} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" disabled={anyBusy} aria-label={t("common.edit")} onClick={() => startEdit(form)}><Pencil className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive" disabled={anyBusy} aria-label={t("common.delete")} onClick={() => remove(form)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                      {form.employee_specific && enabled && (
                        <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-medium text-foreground"><Users className="h-3.5 w-3.5" />{t("manager.forms.hasAccess")}</span>
                            <button type="button" className="font-medium text-primary hover:underline" onClick={() => {
                              setSelectedEmployees(new Set(access[form.form_id] || []));
                              setSelectingFormId(form.form_id);
                            }}>{t("manager.forms.editEmployees")}</button>
                          </div>
                          <p className="mt-1">{(access[form.form_id] || []).map(nameOf).filter(Boolean).join(", ") || t("manager.forms.noEmployees")}</p>
                        </div>
                      )}
                      {form.employee_specific && selectingFormId === form.form_id && (
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
                            <Button type="button" variant="outline" size="sm" onClick={() => setSelectingFormId("")}>{t("common.cancel")}</Button>
                            <Button type="button" size="sm" disabled={anyBusy} onClick={() => saveEmployeeAccess(form.form_id)}>{busyId === form.form_id ? t("common.working") : t("common.save")}</Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
