import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Table2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { companyDate } from "@/lib/company-time";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  PAY_CONDITION_COLUMNS, PAY_CONDITION_GROUPS, PAY_CONDITION_PROFILE_COLUMNS, bulkTargets, cellState, parseConditionAmount, payConditionRows,
} from "@/lib/pay-conditions";
import { currentTravelRules, weekStartOf } from "@/lib/travel-rules";
import { useT } from "@/lib/use-t";

const CELL = "border-b border-r px-2 py-1.5 align-middle text-center text-xs";
const HEAD = "border-b border-r bg-muted px-2 py-1 text-center align-bottom text-[11px] font-semibold";

// Gestion › Configuration › Conditions de paie: one table that gathers the « Paie et options » of every employee card and
// Admin › « Trajets et frais ». Each change is saved as the card / that page saves it (same columns, same RPC), so the
// other screens show it at once. « Chargé à Britton » and the km threshold of a travel line stay in « Trajets et frais ».
export default function PayConditionsManager() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [profiles, setProfiles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [travel, setTravel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", error: false });
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("");
  const [showPaused, setShowPaused] = useState(false);
  const [hidden, setHidden] = useState(() => new Set());
  const [drafts, setDrafts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const today = companyDate();

  const say = (text, error = false) => setMessage({ text, error });
  const reload = useCallback(() => { setLoading(true); setReloadKey((k) => k + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pRes, gRes, tRes] = await Promise.all([
        fetchAllRows(() => supabase.from("profiles").select(PAY_CONDITION_PROFILE_COLUMNS.join(", ")).order("full_name").order("id")),
        supabase.from("employee_groups").select("id, name, employee_group_members(user_id)").order("name"),
        fetchAllRows(() => supabase.from("travel_pay_rules").select("user_id, rule_key, effective_from, choice, billed_to_britton, threshold_km")
          .order("user_id").order("rule_key").order("effective_from")),
      ]);
      if (cancelled) return;
      const failure = pRes.error || gRes.error || tRes.error;
      if (failure) say(failure.message, true);
      setProfiles(pRes.data || []);
      setGroups(gRes.data || []);
      setTravel(tRes.data || []);
      setDrafts({});
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const memberIds = useMemo(() => {
    const group = groups.find((g) => g.id === groupId);
    return group ? new Set((group.employee_group_members || []).map((m) => m.user_id)) : null;
  }, [groups, groupId]);
  const rows = useMemo(() => payConditionRows(profiles, { search, groupId, memberIds, showPaused }), [profiles, search, groupId, memberIds, showPaused]);
  const current = useMemo(() => currentTravelRules(travel, today), [travel, today]);
  const visibleGroups = PAY_CONDITION_GROUPS.filter((g) => !hidden.has(g.id));
  const label = (column) => t(column.labelKey);
  const choiceLabel = (choice) => t(`travel.choice.${choice}`);

  const patchProfiles = (ids, patch) => setProfiles((list) => list.map((p) => (ids.includes(p.id) ? { ...p, ...patch } : p)));

  async function writeProfiles(ids, patch, previous) {
    patchProfiles(ids, patch);
    const { error } = await supabase.from("profiles").update(patch).in("id", ids);
    if (error) {
      setProfiles((list) => list.map((p) => (ids.includes(p.id) ? { ...p, ...previous[p.id] } : p)));
      say(error.message, true);
      return false;
    }
    say(t("payConditions.saved", { count: ids.length }));
    return true;
  }

  const before = (people, field) => Object.fromEntries(people.map((p) => [p.id, { [field]: p[field] }]));

  async function saveToggle(column, person, checked) {
    await writeProfiles([person.id], { [column.field]: checked }, before([person], column.field));
  }

  async function saveAmount(column, person, raw) {
    const key = `${person.id}|${column.field}`;
    setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
    const value = parseConditionAmount(column.field, raw);
    if (typeof value === "number" && Number.isNaN(value)) { say(t("timeRules.payRules.invalidAmount"), true); return; }
    if ((person[column.field] ?? null) === value) return;
    await writeProfiles([person.id], { [column.field]: value }, before([person], column.field));
  }

  async function bulkToggle(column, checked) {
    const targets = bulkTargets(column, rows).filter((p) => Boolean(p[column.field]) !== checked);
    if (!targets.length) { say(t("payConditions.nothingToChange")); return; }
    const ok = await confirm(t("payConditions.bulkConfirm", { label: label(column), value: checked ? t("payConditions.on") : t("payConditions.off"), count: targets.length }));
    if (!ok) return;
    await writeProfiles(targets.map((p) => p.id), { [column.field]: checked }, before(targets, column.field));
  }

  async function writeTravel(rule, person, choice) {
    const existing = current.get(`${person.id}|${rule.key}`);
    const threshold = rule.thresholdKm != null && choice !== "unpaid" ? Number(existing?.threshold_km ?? rule.thresholdKm) : null;
    const effectiveFrom = weekStartOf(today);
    const { error } = await supabase.rpc("set_travel_pay_rule", {
      p_rule_key: rule.key, p_user_ids: [person.id], p_choice: choice, p_billed_to_britton: existing?.billed_to_britton ?? null,
      p_threshold_km: threshold, p_effective_from: effectiveFrom,
    });
    if (error) {
      say(/travel_rule_not_allowed/.test(error.message || "") ? t("travel.notAllowed") : error.message, true);
      return false;
    }
    const row = { user_id: person.id, rule_key: rule.key, effective_from: effectiveFrom, choice, billed_to_britton: existing?.billed_to_britton ?? null, threshold_km: threshold };
    setTravel((list) => [...list.filter((r) => !(r.user_id === person.id && r.rule_key === rule.key && String(r.effective_from) === effectiveFrom)), row]);
    return true;
  }

  async function saveTravel(column, person, choice) {
    if (!choice) return;
    if (await writeTravel(column.rule, person, choice)) say(t("payConditions.saved", { count: 1 }));
  }

  async function bulkTravel(column, choice) {
    if (!choice) return;
    const targets = bulkTargets(column, rows);
    if (!targets.length) { say(t("payConditions.nothingToChange")); return; }
    const ok = await confirm(t("payConditions.bulkConfirm", { label: label(column), value: choiceLabel(choice), count: targets.length }));
    if (!ok) return;
    let done = 0;
    for (const person of targets) {
      if (await writeTravel(column.rule, person, choice)) done += 1; else break;
    }
    if (done === targets.length) say(t("payConditions.saved", { count: done }));
  }

  const toggleGroup = (id) => setHidden((set) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  function renderCell(column, person) {
    const state = cellState(column, person);
    if (!state.applies) return <span className="text-muted-foreground" aria-label={t("payConditions.notApplicable")}>—</span>;
    const name = `${person.full_name || person.email} · ${label(column)}`;
    if (column.kind === "toggle") {
      return (
        <input
          type="checkbox"
          aria-label={name}
          checked={state.value}
          disabled={state.locked}
          onChange={(e) => saveToggle(column, person, e.target.checked)}
          className="h-5 w-5 rounded border-input accent-primary disabled:opacity-60"
        />
      );
    }
    if (column.kind === "amount") {
      const key = `${person.id}|${column.field}`;
      const shown = key in drafts ? drafts[key] : (state.value ?? "");
      return (
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          aria-label={name}
          disabled={state.locked}
          value={shown}
          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
          onBlur={(e) => saveAmount(column, person, e.target.value)}
          className="h-8 w-[4.5rem] px-1 text-right font-mono text-xs"
        />
      );
    }
    const chosen = current.get(`${person.id}|${column.key}`)?.choice || "";
    return (
      <select
        aria-label={name}
        value={chosen}
        onChange={(e) => saveTravel(column, person, e.target.value)}
        className={`h-8 w-[5.5rem] rounded border bg-background px-0.5 text-[11px] ${chosen ? "" : "text-muted-foreground"}`}
      >
        <option value="" disabled>{t("payConditions.defaultChoice", { choice: choiceLabel(column.rule.defaultChoice) })}</option>
        {column.rule.choices.map((choice) => <option key={choice} value={choice}>{choiceLabel(choice)}</option>)}
      </select>
    );
  }

  function renderBulk(column) {
    if (column.kind === "toggle") {
      return (
        <span className="mt-1 flex flex-col items-center gap-0.5">
          <button type="button" className="rounded border bg-background px-1 text-[10px] font-medium hover:bg-accent" aria-label={`${label(column)} · ${t("payConditions.allOn")}`} onClick={() => bulkToggle(column, true)}>{t("payConditions.allOn")}</button>
          <button type="button" className="rounded border bg-background px-1 text-[10px] font-medium hover:bg-accent" aria-label={`${label(column)} · ${t("payConditions.allOff")}`} onClick={() => bulkToggle(column, false)}>{t("payConditions.allOff")}</button>
        </span>
      );
    }
    if (column.kind === "travel") {
      return (
        <select aria-label={`${label(column)} · ${t("payConditions.forAll")}`} value="" onChange={(e) => bulkTravel(column, e.target.value)} className="mt-1 h-6 w-[5.5rem] rounded border bg-background px-0.5 text-[10px] font-normal">
          <option value="">{t("payConditions.forAll")}</option>
          {column.rule.choices.map((choice) => <option key={choice} value={choice}>{choiceLabel(choice)}</option>)}
        </select>
      );
    }
    return null;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold"><Table2 className="h-5 w-5 text-primary" />{t("payConditions.title")}</div>
            <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("payConditions.reload")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("payConditions.help")}</p>
          <p className="rounded-md bg-warning/15 p-2 text-xs text-warning">{t("payConditions.travelNotUsed")}</p>
          {message.text && <p className={`text-sm font-medium ${message.error ? "text-destructive" : ""}`} role="status">{message.text}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("payConditions.search")} aria-label={t("payConditions.search")} className="h-9 w-56" />
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={t("payConditions.group")} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="">{t("payConditions.allGroups")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={showPaused} onChange={(e) => setShowPaused(e.target.checked)} className="h-4 w-4 accent-primary" />
              {t("payConditions.showPaused")}
            </label>
            <span className="text-xs text-muted-foreground">{t("payConditions.count", { count: rows.length })}</span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("payConditions.columns")}>
            {PAY_CONDITION_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={!hidden.has(group.id)}
                onClick={() => toggleGroup(group.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${hidden.has(group.id) ? "text-muted-foreground" : "border-primary bg-primary/10 text-primary"}`}
              >
                {t(group.labelKey)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th rowSpan={2} className={`${HEAD} sticky left-0 z-30 min-w-[11rem] text-left`}>{t("payConditions.employee")}</th>
                  {visibleGroups.map((group) => <th key={group.id} colSpan={group.columns.length} className={`${HEAD} bg-primary/10 text-primary`}>{t(group.labelKey)}</th>)}
                </tr>
                <tr>
                  {visibleGroups.flatMap((group) => group.columns).map((column) => (
                    <th key={column.key} title={[label(column), column.hintKey && t(column.hintKey)].filter(Boolean).join(" — ")} className={`${HEAD} w-12 min-w-[3rem] px-1 font-medium`}>
                      {/* Short title written upwards: a narrow column. The full name and the hint are in the tooltip. */}
                      <span className="mx-auto block h-32 whitespace-nowrap text-[11px] leading-tight [writing-mode:vertical-rl] rotate-180">{t(column.shortKey)}</span>
                      {renderBulk(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((person) => (
                  <tr key={person.id} className={person.is_paused ? "opacity-60" : undefined}>
                    <th scope="row" className={`${CELL} sticky left-0 z-10 bg-card text-left font-medium`}>
                      <span className="block">{person.full_name || person.email}</span>
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {person.employee_number ? `#${person.employee_number}` : t("payConditions.noNumber")}{person.is_paused ? ` · ${t("payConditions.paused")}` : ""}
                      </span>
                    </th>
                    {visibleGroups.flatMap((group) => group.columns).map((column) => <td key={column.key} className={CELL}>{renderCell(column, person)}</td>)}
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={1 + PAY_CONDITION_COLUMNS.length} className="p-6 text-center text-sm text-muted-foreground">{t("payConditions.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {confirmDialog}
    </div>
  );
}
