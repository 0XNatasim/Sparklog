import React, { useEffect, useState } from "react";
import { ChevronDown, Mail, PauseCircle, Phone } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { extractRegularHourlyRate, LEVEL_TO_SKILL, rateSectorForProfile } from "@/lib/ccq-rates";
import { UNION_ASSOCIATIONS } from "@/lib/union-associations";

const LEVELS = [
  { value: "compagnon",  label: "Compagnon" },
  { value: "apprenti_4", label: "Apprenti 4" },
  { value: "apprenti_3", label: "Apprenti 3" },
  { value: "apprenti_2", label: "Apprenti 2" },
  { value: "apprenti_1", label: "Apprenti 1" },
];

const SECTORS = [
  { value: "I", label: "Commercial (ICI)" },
  { value: "N", label: "Industriel" },
  { value: "H", label: "Résidentiel lourd" },
  { value: "R", label: "Résidentiel léger" },
];

export default function EmployeesPanel() {
  const t = useT();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [rates, setRates] = useState(new Map());

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const [{ data, error }, { data: snapshotRows, error: ratesError }] = await withTimeout(
        Promise.all([supabase
          .from("profiles")
          .select("id, role, full_name, phone, email, is_paused, ccq_number, nas_employee, trade_code, apprentice_level, sector, work_region, union_association, wage_schedule, hourly_rate, km_rate, storage_compensation, overtime_evidence_required, include_return_time_in_overtime, evidence_retention_days")
          .order("full_name", { ascending: true }),
        supabase.from("ccq_rate_snapshots").select("sector_id, skill_id, raw_json, fetched_at").eq("occupation_id", "220").order("fetched_at", { ascending: false })]),
        12000
      );
      if (error) throw error;
      if (ratesError) throw ratesError;
      const nextRates = new Map();
      (snapshotRows || []).forEach((snapshot) => {
        const key = `${snapshot.sector_id}:${snapshot.skill_id}`;
        if (!nextRates.has(key)) nextRates.set(key, extractRegularHourlyRate(snapshot.raw_json));
      });
      setRates(nextRates);
      const nextProfiles = data ?? [];
      setProfiles(nextProfiles);
      await Promise.all(nextProfiles.map(async (profile) => {
        const rate = nextRates.get(`${rateSectorForProfile(profile.sector)}:${LEVEL_TO_SKILL[profile.apprentice_level]}`);
        if (rate == null || Number(profile.hourly_rate) === rate) return;
        await supabase.from("profiles").update({ hourly_rate: rate }).eq("id", profile.id);
        setLocal(profile.id, "hourly_rate", rate);
      }));
    } catch (e) {
      setErr(e?.message ?? "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setLocal(id, field, value) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  function toggleExpanded(id) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveField(id, field, rawValue) {
    let value = rawValue;
    if (field === "km_rate" || field === "hourly_rate") {
      value = rawValue === "" || rawValue == null ? null : Number(rawValue);
      if (value != null && Number.isNaN(value)) return;
    } else if (typeof value === "string") {
      value = value.trim() || null;
    }
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", id);
    if (error) setErr(error.message);
    else { setInfo(`${field} ✓`); setTimeout(() => setInfo(""), 1500); }
  }

  async function saveClassification(profile, field, value) {
    setLocal(profile.id, field, value);
    await saveField(profile.id, field, value);
    const next = { ...profile, [field]: value };
    const rate = rates.get(`${rateSectorForProfile(next.sector)}:${LEVEL_TO_SKILL[next.apprentice_level]}`);
    if (rate != null) {
      setLocal(profile.id, "hourly_rate", rate);
      await saveField(profile.id, "hourly_rate", rate);
    }
  }


  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300 flex items-center justify-between gap-3">
          <span>{err}</span>
          <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={load}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {info && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">{info}</div>
      )}

      {loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</CardContent></Card>
      )}

      {!loading && profiles.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">—</CardContent></Card>
      )}

      {!loading && profiles.map((p) => (
        <Card key={p.id}>
          <button
            type="button"
            onClick={() => toggleExpanded(p.id)}
            aria-expanded={expandedIds.has(p.id)}
            className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.full_name || p.email || t("manager.employee")}</div>
              <div className="truncate text-xs text-muted-foreground">{p.email || "—"}</div>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${p.is_paused ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>
              {p.is_paused ? t("employees.paused") : t("employees.active")}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIds.has(p.id) ? "rotate-180" : ""}`} />
          </button>
          {expandedIds.has(p.id) && <CardContent className="space-y-3 border-t p-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Input
                value={p.full_name || ""}
                onChange={(e) => setLocal(p.id, "full_name", e.target.value)}
                onBlur={(e) => saveField(p.id, "full_name", e.target.value)}
                placeholder={t("manager.tbl.name")}
                className="h-9 flex-1 font-semibold"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <span className="flex items-start gap-3">
                <PauseCircle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-300" />
                <span>
                  <span className="block text-sm font-semibold">{t("employees.pauseAccount")}</span>
                  <span className="block text-xs text-muted-foreground">{t("employees.pauseDescription")}</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(p.is_paused)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setLocal(p.id, "is_paused", checked);
                  saveField(p.id, "is_paused", checked);
                }}
                className="h-5 w-5 rounded border-input accent-amber-600"
              />
            </label>

            {/* Contact */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("manager.tbl.phone")}>
                <div className="flex items-center gap-1">
                  <Input
                    value={p.phone || ""}
                    onChange={(e) => setLocal(p.id, "phone", e.target.value)}
                    onBlur={(e) => saveField(p.id, "phone", e.target.value)}
                    className="h-9"
                  />
                  {p.phone && (
                    <a href={`tel:${String(p.phone).replace(/[^+\d]/g, "")}`} className="shrink-0 rounded p-2 text-primary hover:bg-accent" aria-label="call">
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Field>
              <Field label={t("manager.tbl.email")}>
                <div className="flex h-9 items-center text-sm">
                  {p.email ? (
                    <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 truncate text-primary hover:underline">
                      <Mail className="h-4 w-4 shrink-0" /><span className="truncate">{p.email}</span>
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
              </Field>
            </div>

            {/* Classification */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="CCQ#">
                <Input
                  value={p.ccq_number || ""}
                  onChange={(e) => setLocal(p.id, "ccq_number", e.target.value)}
                  onBlur={(e) => saveField(p.id, "ccq_number", e.target.value)}
                  className="h-9"
                />
              </Field>
              <Field label={t("employees.level")}>
                <Select
                  value={p.apprentice_level || ""}
                  onChange={(e) => saveClassification(p, "apprentice_level", e.target.value)}
                  className="h-9"
                >
                  <option value="">—</option>
                  {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </Field>
              <Field label={t("employees.sector")}>
                <Select
                  value={p.sector || ""}
                  onChange={(e) => saveClassification(p, "sector", e.target.value)}
                  className="h-9"
                >
                  <option value="">—</option>
                  {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </Field>
              <Field label={t("employees.kmRate")}>
                <div className="flex h-9 items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="9.99"
                    inputMode="decimal"
                    value={p.km_rate ?? ""}
                    onChange={(e) => setLocal(p.id, "km_rate", e.target.value)}
                    onBlur={(e) => saveField(p.id, "km_rate", e.target.value)}
                    placeholder="0.65"
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">/km</span>
                </div>
              </Field>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-3 text-sm font-semibold">{t("employees.ccqExport")}</div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Field label={t("employees.nasEmployee")}>
                  <Input value={p.nas_employee || ""} maxLength={9} inputMode="numeric" onChange={(e) => setLocal(p.id, "nas_employee", e.target.value.replace(/\D/g, ""))} onBlur={(e) => saveField(p.id, "nas_employee", e.target.value)} className="h-9" />
                </Field>
                <Field label={t("employees.tradeCode")}>
                  <Input value={p.trade_code || "160"} maxLength={3} inputMode="numeric" onChange={(e) => setLocal(p.id, "trade_code", e.target.value.replace(/\D/g, ""))} onBlur={(e) => saveField(p.id, "trade_code", e.target.value || "160")} className="h-9" />
                </Field>
                <Field label={t("employees.workRegion")}>
                  <Select value={p.work_region || ""} onChange={(e) => { setLocal(p.id, "work_region", e.target.value); saveField(p.id, "work_region", e.target.value); }} className="h-9">
                    <option value="">—</option>
                    {QUEBEC_REGIONS.map((region) => <option key={region.code} value={region.code}>{region.code} — {region.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("employees.unionAssociation")}>
                  <Select value={p.union_association || ""} onChange={(e) => { setLocal(p.id, "union_association", e.target.value); saveField(p.id, "union_association", e.target.value); }} className="h-9">
                    <option value="">—</option>
                    {UNION_ASSOCIATIONS.map((association) => <option key={association.code} value={association.code}>{association.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("employees.wageSchedule")}>
                  <Input value={p.wage_schedule || ""} onChange={(e) => setLocal(p.id, "wage_schedule", e.target.value)} onBlur={(e) => saveField(p.id, "wage_schedule", e.target.value)} className="h-9" />
                  <span className="text-[11px] text-muted-foreground">{t("employees.wageScheduleDescription")}</span>
                </Field>
                <Field label={t("employees.hourlyRate")}>
                  <Input type="number" value={p.hourly_rate ?? ""} readOnly className="h-9 bg-muted" />
                  <span className="text-[11px] text-muted-foreground">{rateSectorForProfile(p.sector) ? t("employees.hourlyRateAutomatic") : t("employees.hourlyRateUnavailable")}</span>
                </Field>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">{t("employees.storage")}</span>
                <span className="block text-xs text-muted-foreground">{t("employees.storageDescription")}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-bold text-primary">$50</span>
                <input
                  type="checkbox"
                  checked={Boolean(p.storage_compensation)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "storage_compensation", checked);
                    saveField(p.id, "storage_compensation", checked);
                  }}
                  className="h-5 w-5 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </span>
            </label>

            <div className="grid gap-3 rounded-lg border bg-muted/20 px-4 py-3 sm:grid-cols-2 sm:items-center">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={p.overtime_evidence_required !== false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "overtime_evidence_required", checked);
                    saveField(p.id, "overtime_evidence_required", checked);
                  }}
                  className="h-5 w-5 rounded border-input accent-primary"
                />
                <span>
                  <span className="block text-sm font-semibold">{t("employees.overtimeEvidence")}</span>
                  <span className="block text-xs text-muted-foreground">{t("employees.overtimeEvidenceDescription")}</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={p.include_return_time_in_overtime !== false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "include_return_time_in_overtime", checked);
                    saveField(p.id, "include_return_time_in_overtime", checked);
                  }}
                  className="h-5 w-5 rounded border-input accent-primary"
                />
                <span className="text-sm font-medium">{t("employees.includeReturnTime")}</span>
              </label>
              <Field label={t("employees.retentionDays")}>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  inputMode="numeric"
                  value={p.evidence_retention_days ?? 30}
                  onChange={(e) => setLocal(p.id, "evidence_retention_days", e.target.value)}
                  onBlur={(e) => saveField(p.id, "evidence_retention_days", Math.min(365, Math.max(1, Number(e.target.value) || 30)))}
                  className="h-9"
                />
              </Field>
            </div>
          </CardContent>}
        </Card>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
