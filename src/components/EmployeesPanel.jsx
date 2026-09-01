import React, { useEffect, useState } from "react";
import { ChevronDown, Mail, PauseCircle, Phone, TriangleAlert, Trophy } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { COMMERCIAL_RATE_SECTOR, extractRateAnnexes, extractRegularHourlyRate, LEVEL_TO_SKILL } from "@/lib/ccq-rates";
import { getMissingEmployeeFields } from "@/lib/employee-fields";
import { UNION_ASSOCIATIONS } from "@/lib/union-associations";

const LEVELS = [
  { value: "compagnon",  label: "Compagnon" },
  { value: "apprenti_4", label: "Apprenti 4" },
  { value: "apprenti_3", label: "Apprenti 3" },
  { value: "apprenti_2", label: "Apprenti 2" },
  { value: "apprenti_1", label: "Apprenti 1" },
];

export default function EmployeesPanel() {
  const t = useT();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [rates, setRates] = useState(new Map());
  const [annexes, setAnnexes] = useState(new Map());
  const [cardViews, setCardViews] = useState({});

  async function toggleCard(profile) {
    if (cardViews[profile.id]?.open) {
      setCardViews((current) => ({ ...current, [profile.id]: { open: false } }));
      return;
    }
    setCardViews((current) => ({ ...current, [profile.id]: { open: true, loading: true } }));
    const { data, error } = await supabase.storage.from("ccq-cards").createSignedUrl(profile.ccq_card_path, 300);
    setCardViews((current) => ({ ...current, [profile.id]: { open: true, loading: false, url: data?.signedUrl || null, error: error?.message || (!data ? "not found" : "") } }));
  }

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const [{ data, error }, { data: snapshotRows, error: ratesError }] = await withTimeout(
        Promise.all([supabase
          .from("profiles")
          .select("id, role, full_name, phone, email, is_paused, ccq_number, ccq_expiration_date, birth_date, nas_employee, apprentice_level, work_region, union_association, wage_schedule, hourly_rate, km_rate, storage_compensation, parking_receipts_enabled, ccq_card_capture_enabled, birth_date_capture_enabled, union_association_capture_enabled, ccq_card_path")
          .order("full_name", { ascending: true }),
        supabase.from("ccq_rate_snapshots").select("sector_id, skill_id, raw_json, fetched_at").eq("occupation_id", "220").order("fetched_at", { ascending: false })]),
        12000
      );
      if (error) throw error;
      if (ratesError) throw ratesError;
      const nextRates = new Map();
      const nextAnnexes = new Map();
      (snapshotRows || []).forEach((snapshot) => {
        const availableAnnexes = extractRateAnnexes(snapshot.raw_json);
        if (!nextAnnexes.has(snapshot.sector_id)) nextAnnexes.set(snapshot.sector_id, availableAnnexes);
        availableAnnexes.forEach((annex) => {
          const key = `${snapshot.sector_id}:${snapshot.skill_id}:${annex.code}`;
          if (!nextRates.has(key)) nextRates.set(key, extractRegularHourlyRate(snapshot.raw_json, annex.code));
        });
      });
      setRates(nextRates);
      setAnnexes(nextAnnexes);
      const nextProfiles = data ?? [];
      setProfiles(nextProfiles);
      await Promise.all(nextProfiles.map(async (profile) => {
        const availableAnnexes = nextAnnexes.get(COMMERCIAL_RATE_SECTOR) || [];
        const annex = profile.wage_schedule || availableAnnexes.find((item) => item.code === "C3")?.code || availableAnnexes[0]?.code;
        const rate = nextRates.get(`${COMMERCIAL_RATE_SECTOR}:${LEVEL_TO_SKILL[profile.apprentice_level]}:${annex}`);
        if (rate == null || (Number(profile.hourly_rate) === rate && profile.wage_schedule === annex)) return;
        await supabase.from("profiles").update({ hourly_rate: rate, wage_schedule: annex }).eq("id", profile.id);
        setLocal(profile.id, "hourly_rate", rate);
        setLocal(profile.id, "wage_schedule", annex);
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
    const availableAnnexes = annexes.get(COMMERCIAL_RATE_SECTOR) || [];
    const annex = next.wage_schedule || availableAnnexes.find((item) => item.code === "C3")?.code || availableAnnexes[0]?.code;
    const rate = rates.get(`${COMMERCIAL_RATE_SECTOR}:${LEVEL_TO_SKILL[next.apprentice_level]}:${annex}`);
    if (rate != null) {
      setLocal(profile.id, "hourly_rate", rate);
      setLocal(profile.id, "wage_schedule", annex);
      await Promise.all([saveField(profile.id, "hourly_rate", rate), saveField(profile.id, "wage_schedule", annex)]);
    }
  }

  async function saveAnnex(profile, annex) {
    setLocal(profile.id, "wage_schedule", annex);
    await saveField(profile.id, "wage_schedule", annex);
    const rate = rates.get(`${COMMERCIAL_RATE_SECTOR}:${LEVEL_TO_SKILL[profile.apprentice_level]}:${annex}`);
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

      {!loading && profiles.map((p) => {
        const missingFields = getMissingEmployeeFields(p, t);
        return (
        <Card key={p.id} className={p.is_paused ? "border-muted-foreground/30 bg-muted/70 text-muted-foreground shadow-none" : missingFields.length ? "border-amber-500/40" : ""}>
          <button
            type="button"
            onClick={() => toggleExpanded(p.id)}
            aria-expanded={expandedIds.has(p.id)}
            className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate font-semibold">
                {p.role === "manager" && <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-label={t("manager.roleLabel")} />}
                <span className="truncate">{p.full_name || p.email || t("manager.employee")}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{p.email || "—"}</div>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${p.is_paused ? "bg-muted-foreground/15 text-muted-foreground" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>
              {p.is_paused ? t("employees.paused") : t("employees.active")}
            </span>
            {missingFields.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-3.5 w-3.5" />{t("employees.missingCount", { count: missingFields.length })}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedIds.has(p.id) ? "rotate-180" : ""}`} />
          </button>
          {expandedIds.has(p.id) && <CardContent className="space-y-3 border-t p-4">
            {missingFields.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200" role="alert">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div><b>{t("employees.missingTitle")}</b><div className="mt-1 text-xs">{missingFields.join(" · ")}</div></div>
              </div>
            )}
            {/* Contact */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              <Field label={t("employees.pauseAccount")}>
                <label className="flex h-9 cursor-pointer items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3">
                  <span className="flex items-center gap-2 text-sm font-medium"><PauseCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />{p.is_paused ? t("employees.paused") : t("employees.active")}</span>
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
                <Input value={t("employees.commercialSector")} readOnly className="h-9 bg-muted" />
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Field label={t("employees.nasEmployee")}>
                  <Input value={p.nas_employee || ""} maxLength={9} inputMode="numeric" onChange={(e) => setLocal(p.id, "nas_employee", e.target.value.replace(/\D/g, ""))} onBlur={(e) => saveField(p.id, "nas_employee", e.target.value)} className="h-9" />
                </Field>
                <Field label={t("employees.tradeCode")}>
                  <Input value="220" readOnly className="h-9 bg-muted" />
                </Field>
                <Field label={t("employees.birthDate")}>
                  <Input type="date" value={p.birth_date || ""} onChange={(e) => setLocal(p.id, "birth_date", e.target.value)} onBlur={(e) => saveField(p.id, "birth_date", e.target.value)} className="h-9" />
                </Field>
                <Field label={t("employees.ccqExpirationDate")}>
                  <Input type="date" value={p.ccq_expiration_date || ""} onChange={(e) => setLocal(p.id, "ccq_expiration_date", e.target.value)} onBlur={(e) => saveField(p.id, "ccq_expiration_date", e.target.value)} className="h-9" />
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
                  {(annexes.get(COMMERCIAL_RATE_SECTOR) || []).length > 0 ? (
                    <Select value={p.wage_schedule || ""} onChange={(e) => saveAnnex(p, e.target.value)} className="h-9">
                      <option value="">—</option>
                      {(annexes.get(COMMERCIAL_RATE_SECTOR) || []).map((annex) => <option key={annex.code} value={annex.code}>{annex.code}{annex.description ? ` — ${annex.description}` : ""}</option>)}
                      {p.wage_schedule && !(annexes.get(COMMERCIAL_RATE_SECTOR) || []).some((annex) => annex.code === p.wage_schedule) && <option value={p.wage_schedule}>{p.wage_schedule}</option>}
                    </Select>
                  ) : (
                    <>
                      <Input value={p.wage_schedule || ""} placeholder="C3" onChange={(e) => setLocal(p.id, "wage_schedule", e.target.value.toUpperCase())} onBlur={(e) => saveField(p.id, "wage_schedule", e.target.value.toUpperCase())} className="h-9" />
                      <span className="text-[11px] text-amber-700 dark:text-amber-300">{t("employees.wageScheduleManual")}</span>
                    </>
                  )}
                  <span className="text-[11px] text-muted-foreground">{t("employees.wageScheduleDescription")}</span>
                </Field>
                <Field label={t("employees.hourlyRate")}>
                  <Input type="number" value={p.hourly_rate ?? ""} readOnly className="h-9 bg-muted" />
                  <span className="text-[11px] text-muted-foreground">{t("employees.hourlyRateAutomatic")}</span>
                </Field>
              </div>
            </div>

            <div className="grid gap-2 border-t pt-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
                <span className="text-sm font-medium">{t("employees.storage")} <b className="text-primary">$50</b></span>
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
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3">
                <span className="text-sm font-medium">{t("employees.parkingReceipts")}</span>
                <input
                  type="checkbox"
                  checked={Boolean(p.parking_receipts_enabled)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "parking_receipts_enabled", checked);
                    saveField(p.id, "parking_receipts_enabled", checked);
                  }}
                  className="h-5 w-5 rounded border-input accent-amber-600"
                />
              </label>
              {p.ccq_card_path && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <Button type="button" size="sm" variant="outline" onClick={() => toggleCard(p)}>
                    {cardViews[p.id]?.open ? t("ccqCard.hideCard") : t("ccqCard.viewCard")}
                  </Button>
                  {cardViews[p.id]?.open && (
                    <div className="mt-2">
                      {cardViews[p.id]?.loading && <div className="text-xs text-muted-foreground">{t("common.loading")}</div>}
                      {cardViews[p.id]?.url && <img src={cardViews[p.id].url} alt={t("ccqCard.title")} className="max-h-80 w-full rounded-md border object-contain" />}
                      {cardViews[p.id]?.error && <div className="text-xs text-destructive dark:text-red-300">{cardViews[p.id].error}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>}
        </Card>
      );})}
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
