import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Car, Info, RefreshCw, Users } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { useT } from "@/lib/use-t";
import { companyDate } from "@/lib/company-time";
import {
  TRAVEL_RULE_SECTIONS, currentTravelRules, summarizeTravelRule, travelRule, travelRuleEmployees,
  travelRuleValue, weekStartOf,
} from "@/lib/travel-rules";

// Gestion › Admin › Trajets et frais (NOOB.md étape 6): every travel / km / expense line in one place,
// one setting per employee. « Pour tous » applies a line to every employee; « Choisir » asks which ones.
// Recorded only: the payroll engine keeps paying each line's default until it reads these settings.
export default function TravelRulesManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [people, setPeople] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = companyDate();

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => { setLoading(true); setReloadKey((k) => k + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [peopleRes, rulesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, is_paused").order("full_name"),
        supabase.from("travel_pay_rules").select("user_id, rule_key, effective_from, choice, billed_to_britton, threshold_km"),
      ]);
      if (cancelled) return;
      if (peopleRes.error || rulesRes.error) setMessage((peopleRes.error || rulesRes.error).message);
      setPeople(peopleRes.data || []);
      setRows(rulesRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const employees = useMemo(() => travelRuleEmployees(people), [people]);
  const current = useMemo(() => currentTravelRules(rows, today), [rows, today]);
  const choiceLabel = (choice) => t(`travel.choice.${choice}`);
  const brittonLabel = (value) => t(value === true ? "travel.britton.yes" : value === false ? "travel.britton.no" : "travel.britton.unset");

  function openEditor(key, mode) {
    const rule = travelRule(key);
    const s = summarizeTravelRule(current, key, employees);
    setMessage("");
    setEditor({
      key, mode,
      choice: s.uniform || rule.defaultChoice,
      britton: "unset",
      thresholdKm: rule.thresholdKm != null ? String(rule.thresholdKm) : "",
      effectiveFrom: weekStartOf(today),
      selected: new Set(),
    });
  }

  async function save() {
    if (!editor) return;
    const rule = travelRule(editor.key);
    const ids = editor.mode === "all" ? employees.map((e) => e.id) : [...editor.selected];
    if (!ids.length) { setMessage(t("travel.pickSomeone")); return; }
    if (!editor.effectiveFrom) { setMessage(t("travel.dateRequired")); return; }
    const britton = editor.britton === "yes" ? true : editor.britton === "no" ? false : null;
    const usesThreshold = rule.thresholdKm != null && editor.choice !== "unpaid";
    const threshold = usesThreshold ? Number(String(editor.thresholdKm).replace(",", ".")) : null;
    if (usesThreshold && (!Number.isFinite(threshold) || threshold < 0)) { setMessage(t("travel.badThreshold")); return; }
    const ok = await confirm(t("travel.confirm", {
      rule: t(`travel.rule.${editor.key}`), choice: choiceLabel(editor.choice), britton: brittonLabel(britton),
      count: ids.length, date: editor.effectiveFrom,
    }));
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_travel_pay_rule", {
      p_rule_key: editor.key, p_user_ids: ids, p_choice: editor.choice, p_billed_to_britton: britton,
      p_threshold_km: threshold, p_effective_from: editor.effectiveFrom,
    });
    setBusy(false);
    if (error) {
      setMessage(/travel_rule_not_allowed/.test(error.message || "") ? t("travel.notAllowed") : error.message);
      return;
    }
    setEditor(null);
    setMessage(t("travel.saved", { count: ids.length }));
    reload();
  }

  function summaryText(key) {
    const rule = travelRule(key);
    const s = summarizeTravelRule(current, key, employees);
    if (!s.total) return "—";
    if (s.unset === s.total) return t("travel.summary.default", { choice: choiceLabel(rule.defaultChoice) });
    if (s.uniform && s.unset === 0) return t("travel.summary.all", { choice: choiceLabel(s.uniform) });
    return rule.choices.filter((c) => s.counts[c]).map((c) => `${s.counts[c]} ${choiceLabel(c)}`).join(" · ")
      + (s.unset ? ` · ${t("travel.summary.unsetCount", { count: s.unset })}` : "");
  }

  function brittonText(key) {
    const s = summarizeTravelRule(current, key, employees);
    if (s.britton.unknown === s.total) return t("travel.britton.unset");
    return [s.britton.yes && `${t("travel.britton.yes")} ${s.britton.yes}`, s.britton.no && `${t("travel.britton.no")} ${s.britton.no}`,
      s.britton.unknown && `? ${s.britton.unknown}`].filter(Boolean).join(" · ");
  }

  const editorRule = editor ? travelRule(editor.key) : null;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold"><Car className="h-5 w-5 text-primary" />{t("travel.title")}</div>
            <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("travel.reload")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("travel.description", { count: employees.length })}</p>
          <p className="flex items-start gap-1.5 rounded-md bg-warning/15 p-2 text-xs text-warning">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("travel.notUsedYet")}
          </p>
          {message && <p className="text-sm font-medium" role="status">{message}</p>}
        </CardContent>
      </Card>

      {TRAVEL_RULE_SECTIONS.map((section) => (
        <Card key={section.id}>
          <CardContent className="p-0">
            <h3 className="border-b px-4 py-2 text-sm font-semibold">{t(`travel.section.${section.id}`)}</h3>
            <ul className="divide-y">
              {section.rows.map((rule) => (
                <li key={rule.key} className="px-4 py-3">
                  {rule.fixed ? (
                    <div>
                      <div className="text-sm font-medium">{t(`travel.rule.${rule.key}`)}</div>
                      <div className="text-xs text-muted-foreground">{t("travel.fixedNote")} · {t("travel.convention", { ref: rule.convention })}</div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-medium">{t(`travel.rule.${rule.key}`)}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("travel.defaultIs", { choice: choiceLabel(rule.defaultChoice) })} · {t("travel.convention", { ref: rule.convention })}
                        </div>
                        <div className="text-xs"><span className="font-medium">{summaryText(rule.key)}</span> · Britton : {brittonText(rule.key)}</div>
                        {rule.conventionRequired && <div className="text-xs text-warning">{t("travel.conventionRequired")}</div>}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">{t("travel.byEmployee")}</summary>
                          <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
                            {employees.map((e) => {
                              const v = travelRuleValue(current, e.id, rule.key);
                              return (
                                <li key={e.id} className="flex justify-between gap-2">
                                  <span className="truncate">{e.full_name || e.email}</span>
                                  <span className={v.isSet ? "" : "text-muted-foreground"}>
                                    {choiceLabel(v.choice)}{v.isSet ? "" : ` (${t("travel.defaultShort")})`}
                                    {rule.thresholdKm != null && v.choice !== "unpaid" ? ` · ${v.thresholdKm} km` : ""}
                                    {v.britton != null ? ` · Britton ${brittonLabel(v.britton)}` : ""}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" size="sm" onClick={() => openEditor(rule.key, "all")} disabled={!employees.length}>
                          {t("travel.forAll")}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => openEditor(rule.key, "pick")} disabled={!employees.length}>
                          <Users className="mr-1 h-4 w-4" />{t("travel.pick")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open && !busy) setEditor(null); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {editor && editorRule && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base leading-snug">
                  {t(`travel.rule.${editor.key}`)} — {editor.mode === "all" ? t("travel.forAllTitle", { count: employees.length }) : t("travel.pickTitle")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <fieldset className="space-y-1">
                  <legend className="text-xs font-medium text-muted-foreground">{t("travel.howPaid")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {editorRule.choices.map((c) => (
                      <Button key={c} type="button" size="sm" variant={editor.choice === c ? "default" : "outline"} aria-pressed={editor.choice === c}
                        onClick={() => setEditor((ed) => ({ ...ed, choice: c }))}>
                        {choiceLabel(c)}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                {editorRule.thresholdKm != null && editor.choice !== "unpaid" && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">{t("travel.threshold")}</span>
                    <Input type="number" inputMode="decimal" min="0" step="1" value={editor.thresholdKm} className="w-32"
                      onChange={(ev) => setEditor((ed) => ({ ...ed, thresholdKm: ev.target.value }))} />
                  </label>
                )}
                <fieldset className="space-y-1">
                  <legend className="text-xs font-medium text-muted-foreground">{t("travel.brittonQuestion")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {["yes", "no", "unset"].map((b) => (
                      <Button key={b} type="button" size="sm" variant={editor.britton === b ? "default" : "outline"} aria-pressed={editor.britton === b}
                        onClick={() => setEditor((ed) => ({ ...ed, britton: b }))}>
                        {t(`travel.britton.${b}`)}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("travel.effectiveFrom")}</span>
                  <Input type="date" value={editor.effectiveFrom} className="w-44"
                    onChange={(ev) => setEditor((ed) => ({ ...ed, effectiveFrom: ev.target.value }))} />
                </label>
                {editor.mode === "pick" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{t("travel.whichEmployees", { count: editor.selected.size })}</span>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditor((ed) => ({ ...ed, selected: new Set(employees.map((e) => e.id)) }))}>{t("travel.checkAll")}</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditor((ed) => ({ ...ed, selected: new Set() }))}>{t("travel.checkNone")}</Button>
                      </div>
                    </div>
                    <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-2">
                      {employees.map((e) => {
                        const v = travelRuleValue(current, e.id, editor.key);
                        const checked = editor.selected.has(e.id);
                        return (
                          <li key={e.id}>
                            <label className="flex min-h-[36px] cursor-pointer items-center gap-2">
                              <input type="checkbox" className="h-4 w-4" checked={checked}
                                onChange={() => setEditor((ed) => {
                                  const next = new Set(ed.selected);
                                  if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                                  return { ...ed, selected: next };
                                })} />
                              <span className="flex-1 truncate">{e.full_name || e.email}</span>
                              <span className="text-xs text-muted-foreground">{choiceLabel(v.choice)}{v.isSet ? "" : ` (${t("travel.defaultShort")})`}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {message && <p className="text-sm font-medium text-destructive" role="alert">{message}</p>}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={busy}>{t("travel.cancel")}</Button>
                <Button type="button" onClick={save} disabled={busy}>{busy ? t("travel.saving") : t("travel.apply")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
