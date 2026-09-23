import React, { useEffect, useState } from "react";
import { Briefcase, CalendarDays, ChevronDown, Copy, Crown, Eye, KeyRound, Mail, PauseCircle, Phone, TriangleAlert, Trophy, X } from "lucide-react";
import dayjs from "dayjs";
import { GRANTABLE_ADMIN_SECTIONS, isManagerRole, isNonCcqRole, isPrivileged } from "@/lib/roles";
import NasField from "./NasField";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
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

// Ordering of the employees list: owner first, then administration, then managers,
// then employees. Within each group the list stays alphabetical (paused sink last).
const ROLE_ORDER = { owner: 0, admin: 1, manager: 2, employee: 3, subcontractor_1: 4 };
const roleRank = (role) => (role in ROLE_ORDER ? ROLE_ORDER[role] : 4);

export default function EmployeesPanel() {
  const t = useT();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const privileged = isPrivileged(role);
  const [nasSet, setNasSet] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [passwordResetId, setPasswordResetId] = useState(null);
  const [temporaryCredentials, setTemporaryCredentials] = useState(null);
  const [timeOff, setTimeOff] = useState(new Map());
  const [timeOffDraft, setTimeOffDraft] = useState({});
  const today = dayjs().format("YYYY-MM-DD");
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [rates, setRates] = useState(new Map());
  const [annexes, setAnnexes] = useState(new Map());
  const [rateSuggestions, setRateSuggestions] = useState(new Map()); // id → { rate, annex, current } (dry-run, P-6)
  const [applyingRates, setApplyingRates] = useState(false);
  // Owner/manager account creation (bypasses the signup email rate limit).
  const [addForm, setAddForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addResult, setAddResult] = useState(null); // { email, password } after a successful create
  const [cardViews, setCardViews] = useState({});
  // Ids of admin cards whose "Gestion" checklist is expanded (also implicitly open
  // whenever the admin already has at least one granted section).
  const [mgmtOpen, setMgmtOpen] = useState(new Set());

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
          .select("id, role, type_confirmed, admin_sections, full_name, phone, email, is_paused, employee_number, ccq_number, ccq_expiration_date, birth_date, apprentice_level, work_region, union_association, wage_schedule, hourly_rate, km_rate, phone_data_reimbursement, storage_compensation, parking_receipts_enabled, overtime_first_hour_double, return_overtime_no_benefits, ccq_card_capture_enabled, birth_date_capture_enabled, union_association_capture_enabled, ccq_card_path")
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
      // Group by role (owner → admin → manager → employee), keep alphabetical order
      // within each group, and push inactive (paused) accounts to the bottom of their group.
      const nextProfiles = [...(data ?? [])].sort((a, b) => {
        const byRole = roleRank(a.role) - roleRank(b.role);
        if (byRole !== 0) return byRole;
        const byPaused = (a.is_paused ? 1 : 0) - (b.is_paused ? 1 : 0);
        if (byPaused !== 0) return byPaused;
        return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", undefined, { sensitivity: "base" });
      });
      setProfiles(nextProfiles);
      // NAS lives in the restricted vault; only privileged users can see who has one.
      // Fetch presence only (not the value) — the value is revealed on demand + audited.
      if (privileged) {
        const { data: nasRows } = await supabase.from("employee_sensitive").select("user_id").not("nas", "is", null);
        setNasSet(new Set((nasRows || []).map((r) => r.user_id)));
      }
      // P-6: loading is READ-ONLY. Never write compensation as a side effect of a render.
      // Instead compute a dry-run comparison of each profile's stored rate vs the current
      // CCQ rate for its level/annex; the manager applies them explicitly (applyRateSuggestions).
      const suggestions = new Map();
      nextProfiles.forEach((profile) => {
        const availableAnnexes = nextAnnexes.get(COMMERCIAL_RATE_SECTOR) || [];
        const annex = profile.wage_schedule || availableAnnexes.find((item) => item.code === "C3")?.code || availableAnnexes[0]?.code;
        const rate = nextRates.get(`${COMMERCIAL_RATE_SECTOR}:${LEVEL_TO_SKILL[profile.apprentice_level]}:${annex}`);
        if (rate == null || (Number(profile.hourly_rate) === rate && profile.wage_schedule === annex)) return;
        suggestions.set(profile.id, { rate, annex, current: profile.hourly_rate });
      });
      setRateSuggestions(suggestions);
    } catch (e) {
      setErr(e?.message ?? "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeOff() {
    // Upcoming / current time off (anything not fully in the past).
    const { data } = await supabase
      .from("employee_time_off")
      .select("id, user_id, start_date, end_date")
      .gte("end_date", today)
      .order("start_date", { ascending: true });
    const map = new Map();
    (data || []).forEach((row) => {
      if (!map.has(row.user_id)) map.set(row.user_id, []);
      map.get(row.user_id).push(row);
    });
    setTimeOff(map);
  }

  useEffect(() => { load(); loadTimeOff(); }, []);

  async function addTimeOff(employeeId) {
    const draft = timeOffDraft[employeeId] || {};
    const from = draft.from;
    const to = draft.to || draft.from;
    if (!from) return;
    if (to < from) { setErr(t("timeOff.rangeError")); return; }
    setErr("");
    const { error } = await supabase.from("employee_time_off").insert({ user_id: employeeId, start_date: from, end_date: to });
    if (error) { setErr(error.message); return; }
    setTimeOffDraft((current) => ({ ...current, [employeeId]: { from: "", to: "" } }));
    await loadTimeOff();
  }

  async function removeTimeOff(id) {
    const { error } = await supabase.from("employee_time_off").delete().eq("id", id);
    if (error) { setErr(error.message); return; }
    await loadTimeOff();
  }

  function fmtRange(row) {
    return row.start_date === row.end_date
      ? dayjs(row.start_date).format("DD MMM YYYY")
      : `${dayjs(row.start_date).format("DD MMM")} – ${dayjs(row.end_date).format("DD MMM YYYY")}`;
  }

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
    } else if (field === "phone_data_reimbursement") {
      value = rawValue === "" || rawValue == null ? 0 : Number(rawValue);
      if (Number.isNaN(value)) return;
    } else if (typeof value === "string") {
      value = value.trim() || null;
    }
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", id);
    if (error) setErr(error.message);
    else { setInfo(`${field} ✓`); setTimeout(() => setInfo(""), 1500); }
  }

  // Choosing the employee type (Administration vs Employé CCQ) is the prerequisite for
  // activating a new account. It sets the role (owner-only, enforced in the DB by
  // enforce_role_change_privileged) and flags the type as confirmed so the activation
  // toggle unlocks. Roles are stored lowercase: 'admin' = office, 'employee' = CCQ.
  async function chooseType(id, roleValue) {
    setLocal(id, "role", roleValue);
    setLocal(id, "type_confirmed", true);
    await saveField(id, "role", roleValue);
    await saveField(id, "type_confirmed", true);
  }

  // Management (Gestion) access for an admin (office) employee. Persisted as the
  // profiles.admin_sections array; writes are owner-only (enforced in the DB by
  // enforce_admin_sections_privileged, migration 0045).
  async function toggleManagement(profile, checked) {
    setMgmtOpen((current) => {
      const next = new Set(current);
      if (checked) next.add(profile.id); else next.delete(profile.id);
      return next;
    });
    if (!checked) {
      // Turning Gestion off revokes every section.
      setLocal(profile.id, "admin_sections", []);
      await saveField(profile.id, "admin_sections", []);
    }
  }

  async function toggleAdminSection(profile, sectionId, checked) {
    const current = Array.isArray(profile.admin_sections) ? profile.admin_sections : [];
    const next = checked
      ? [...new Set([...current, sectionId])]
      : current.filter((section) => section !== sectionId);
    setLocal(profile.id, "admin_sections", next);
    await saveField(profile.id, "admin_sections", next);
  }

  async function handleDelete(profile) {
    setDeleting(true);
    setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("delete_user", { body: { userId: profile.id } });
      if (error) {
        let message = error.message;
        try { const ctx = await error.context?.json?.(); if (ctx?.error) message = ctx.error; } catch (_) { /* keep default */ }
        throw new Error(message);
      }
      if (data && data.ok === false) throw new Error(data.error || "Delete failed");
      setProfiles((prev) => prev.filter((x) => x.id !== profile.id));
      setConfirmDelete(null);
      setInfo(t("employees.deleted"));
      setTimeout(() => setInfo(""), 2500);
    } catch (e) {
      setErr(e?.message || "Delete failed");
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function resetTemporaryPassword(profile) {
    if (passwordResetId) return;
    if (!window.confirm(t("employees.passwordResetConfirm", { name: profile.full_name || profile.email }))) return;
    setPasswordResetId(profile.id);
    setTemporaryCredentials(null);
    setErr("");
    try {
      const { data, error } = await supabase.functions.invoke("reset_employee_password", {
        body: { userId: profile.id },
      });
      if (error) {
        let message = error.message;
        try { const context = await error.context?.json?.(); if (context?.error) message = context.error; } catch { /* keep default */ }
        throw new Error(message);
      }
      if (!data?.ok) throw new Error(data?.error || t("employees.passwordResetFailed"));
      setTemporaryCredentials({ userId: profile.id, email: data.email, password: data.password });
    } catch (error) {
      setErr(error?.message || t("employees.passwordResetFailed"));
    } finally {
      setPasswordResetId(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryCredentials?.password) return;
    try {
      await navigator.clipboard.writeText(temporaryCredentials.password);
      setInfo(t("employees.passwordCopied"));
      setTimeout(() => setInfo(""), 2500);
    } catch {
      setErr(t("employees.passwordCopyFailed"));
    }
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

  // P-6: explicit, manager-triggered batch that writes the dry-run rate suggestions to the
  // matching profiles. This is the ONLY path that mutates compensation on load-derived data,
  // and it never runs as a side effect of rendering.
  async function applyRateSuggestions() {
    if (rateSuggestions.size === 0 || applyingRates) return;
    if (!window.confirm(t("employees.rates.applyConfirm", { count: rateSuggestions.size }))) return;
    setApplyingRates(true);
    setErr("");
    try {
      const entries = [...rateSuggestions.entries()];
      for (const [id, { rate, annex }] of entries) {
        const { error } = await supabase.from("profiles").update({ hourly_rate: rate, wage_schedule: annex }).eq("id", id);
        if (error) throw error;
        setLocal(id, "hourly_rate", rate);
        setLocal(id, "wage_schedule", annex);
      }
      setRateSuggestions(new Map());
      setInfo(t("employees.rates.applied", { count: entries.length }));
      setTimeout(() => setInfo(""), 2500);
    } catch (e) {
      setErr(e?.message || "Failed to apply rates.");
    } finally {
      setApplyingRates(false);
    }
  }

  // Create an employee account server-side (no confirmation email → no rate limit).
  async function createEmployee(e) {
    e?.preventDefault?.();
    if (addBusy) return;
    setErr(""); setInfo(""); setAddResult(null);
    setAddBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("auth.failed"));
      const { data, error } = await supabase.functions.invoke("create_employee", {
        body: { full_name: addForm.full_name, email: addForm.email, phone: addForm.phone, password: addForm.password || undefined },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) {
        let message = error.message;
        try { const ctx = await error.context?.json?.(); if (ctx?.error) message = ctx.error; } catch { /* keep default */ }
        throw new Error(message);
      }
      if (data && data.ok === false) throw new Error(data.error || "Create failed");
      setAddResult({ email: data.email, password: data.password });
      setAddForm({ full_name: "", email: "", phone: "", password: "" });
      setInfo(t("employees.add.created"));
      await load();
    } catch (e2) {
      setErr(e2?.message || "Create failed");
    } finally {
      setAddBusy(false);
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
      {!loading && rateSuggestions.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{t("employees.rates.pending", { count: rateSuggestions.size })}</span>
          <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={applyRateSuggestions} disabled={applyingRates}>
            {applyingRates ? t("common.working") : t("employees.rates.applyBtn")}
          </Button>
        </div>
      )}

      {isManagerRole(role) && (
        <Card>
          <CardContent className="p-4">
            {!addOpen ? (
              <Button size="sm" onClick={() => { setAddOpen(true); setAddResult(null); }}>{t("employees.add.button")}</Button>
            ) : (
              <form onSubmit={createEmployee} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{t("employees.add.title")}</div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("employees.add.hint")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs"><span className="text-muted-foreground">{t("auth.fullName")}</span>
                    <Input value={addForm.full_name} onChange={(e) => setAddForm((s) => ({ ...s, full_name: e.target.value }))} className="mt-1" required /></label>
                  <label className="block text-xs"><span className="text-muted-foreground">{t("auth.email")}</span>
                    <Input type="email" value={addForm.email} onChange={(e) => setAddForm((s) => ({ ...s, email: e.target.value }))} className="mt-1" required /></label>
                  <label className="block text-xs"><span className="text-muted-foreground">{t("auth.phone")}</span>
                    <Input value={addForm.phone} onChange={(e) => setAddForm((s) => ({ ...s, phone: e.target.value }))} className="mt-1" /></label>
                  <label className="block text-xs"><span className="text-muted-foreground">{t("employees.add.passwordOptional")}</span>
                    <Input value={addForm.password} onChange={(e) => setAddForm((s) => ({ ...s, password: e.target.value }))} className="mt-1" placeholder={t("employees.add.passwordPlaceholder")} /></label>
                </div>
                <Button type="submit" size="sm" disabled={addBusy}>{addBusy ? t("common.working") : t("employees.add.submit")}</Button>
              </form>
            )}
            {addResult && (
              <div className="mt-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200">
                <div className="font-semibold">{t("employees.add.credentials")}</div>
                <div className="mt-1 font-mono text-xs">{addResult.email}</div>
                <div className="font-mono text-xs">{t("employees.add.tempPassword")}: <b>{addResult.password}</b></div>
                <p className="mt-1 text-[11px]">{t("employees.add.share")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</CardContent></Card>
      )}

      {!loading && profiles.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">—</CardContent></Card>
      )}

      {!loading && profiles.map((p) => {
        // Non-CCQ roles (administration + owner) skip the CCQ "missing fields" check.
        const missingFields = isNonCcqRole(p.role) ? [] : getMissingEmployeeFields(p, t);
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
                {p.employee_number && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">#{p.employee_number}</span>}
                {p.role === "owner"
                  ? <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label={t("manager.bossLabel")} />
                  : p.role === "admin"
                    ? <Briefcase className="h-4 w-4 shrink-0 text-violet-500" aria-label={t("manager.adminLabel")} />
                    : p.role === "manager" && <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-label={t("manager.roleLabel")} />}
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
            {/* Type gate: a new account must be typed (Administration vs Employé CCQ)
                before it can be activated. Until then the activation toggle stays locked. */}
            {!p.type_confirmed && (
              <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Briefcase className="h-4 w-4" />{t("employees.chooseTypeTitle")}
                </div>
                <p className="text-xs text-muted-foreground">{t("employees.chooseTypeHint")}</p>
                {privileged ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => chooseType(p.id, "employee")}>
                      {t("employees.typeCcq")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => chooseType(p.id, "admin")}>
                      {t("employees.typeAdmin")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => chooseType(p.id, "subcontractor_1")}>
                      {t("employees.typeSubcontractor1")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{t("employees.chooseTypeOwnerOnly")}</p>
                )}
              </div>
            )}
            {/* "View as" enters view mode, which is manager-tier only. A granted admin
                (office employee) manages here but cannot impersonate, so hide it for them. */}
            {p.id !== user?.id && isManagerRole(role) && (
              <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => navigate(`/form?employee=${p.id}&employeeName=${encodeURIComponent(p.full_name || p.email || "")}`)}>
                <Eye className="mr-1.5 h-4 w-4" />{t("employees.viewAs")}
              </Button>
            )}
            {missingFields.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200" role="alert">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div><b>{t("employees.missingTitle")}</b><div className="mt-1 text-xs">{missingFields.join(" · ")}</div></div>
              </div>
            )}
            {/* Role — only the owner may assign roles (see is_privileged / 0031, 0032).
                The owner's own row is locked to avoid demoting the last owner by accident.
                Hidden until the type is confirmed — the type gate above owns that first choice. */}
            {privileged && p.type_confirmed && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={t("employees.roleLabel")}>
                  <Select
                    value={p.role || "employee"}
                    disabled={p.id === user?.id}
                    onChange={(e) => { const v = e.target.value; setLocal(p.id, "role", v); saveField(p.id, "role", v); }}
                    className="h-9"
                  >
                    <option value="employee">{t("manager.employee")}</option>
                    <option value="subcontractor_1">{t("manager.subcontractor1Label")}</option>
                    {/* `manager` is hidden from the picker (owner + admin + employee cover this
                        deployment); still shown if a profile already has it, so it isn't lost. */}
                    {p.role === "manager" && <option value="manager">{t("manager.roleLabel")}</option>}
                    <option value="admin">{t("manager.adminLabel")}</option>
                    <option value="owner">{t("manager.bossLabel")}</option>
                  </Select>
                </Field>
              </div>
            )}

            {/* Identity */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t("employees.employeeNumber")}>
                <Input
                  value={p.employee_number || ""}
                  onChange={(e) => setLocal(p.id, "employee_number", e.target.value)}
                  onBlur={(e) => saveField(p.id, "employee_number", e.target.value)}
                  placeholder="09"
                  className="h-9"
                />
              </Field>
            </div>

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
                <label className={`flex h-9 items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 ${p.type_confirmed ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                  <span className="flex items-center gap-2 text-sm font-medium"><PauseCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />{p.is_paused ? t("employees.paused") : t("employees.active")}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(p.is_paused)}
                    disabled={!p.type_confirmed}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setLocal(p.id, "is_paused", checked);
                      saveField(p.id, "is_paused", checked);
                    }}
                    className="h-5 w-5 rounded border-input accent-amber-600 disabled:cursor-not-allowed"
                  />
                </label>
                {!p.type_confirmed && <span className="text-[11px] text-amber-700 dark:text-amber-300">{t("employees.activateNeedsType")}</span>}
              </Field>
            </div>

            {/* Time off (day off / week off) */}
            <details className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />{t("timeOff.title")}
                  {(timeOff.get(p.id) || []).length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{(timeOff.get(p.id) || []).length}</span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t p-3">
              <p className="mb-2 text-xs text-muted-foreground">{t("timeOff.description")}</p>
              {(timeOff.get(p.id) || []).length > 0 && (
                <div className="mb-2 space-y-1">
                  {(timeOff.get(p.id) || []).map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
                      <span>{fmtRange(row)}</span>
                      <button type="button" onClick={() => removeTimeOff(row.id)} aria-label={t("common.cancel")} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">{t("timeOff.from")}</span>
                  <Input type="date" value={timeOffDraft[p.id]?.from || ""} onChange={(e) => setTimeOffDraft((c) => ({ ...c, [p.id]: { ...(c[p.id] || {}), from: e.target.value } }))} className="h-9" />
                </label>
                <label className="text-xs">
                  <span className="mb-1 block text-muted-foreground">{t("timeOff.to")}</span>
                  <Input type="date" value={timeOffDraft[p.id]?.to || ""} onChange={(e) => setTimeOffDraft((c) => ({ ...c, [p.id]: { ...(c[p.id] || {}), to: e.target.value } }))} className="h-9" />
                </label>
                <Button type="button" size="sm" onClick={() => addTimeOff(p.id)}>{t("timeOff.add")}</Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("timeOff.hint")}</p>
              </div>
            </details>

            {/* Non-CCQ roles (administration + owner): show a simple flat hourly pay
                field instead of the CCQ classification / metadata. */}
            {isNonCcqRole(p.role) && (
              <details className="group rounded-lg border" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                  <span className="truncate">{p.role === "subcontractor_1" ? t("employees.subcontractorTerms") : t("employees.adminPayroll")}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t p-3">
                  <Field label={t("employees.flatHourlyRate")}>
                    <div className="flex h-9 items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={p.hourly_rate ?? ""}
                        onChange={(e) => setLocal(p.id, "hourly_rate", e.target.value)}
                        onBlur={(e) => saveField(p.id, "hourly_rate", e.target.value)}
                        placeholder="0.00"
                        className="h-9"
                      />
                      <span className="text-xs text-muted-foreground">/h</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{t("employees.flatHourlyRateHint")}</span>
                  </Field>
                </div>
              </details>
            )}

            {/* Management (Gestion) access for an office employee — owner only. Tick
                "Gestion" to reveal the section checklist; each ticked section becomes a
                tab the admin can open in the manager dashboard. */}
            {p.role === "admin" && privileged && (
              <details className="group rounded-lg border" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                  <span className="truncate">{t("employees.managementAccess")}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 border-t p-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2">
                    <span className="text-sm font-medium">{t("employees.managementEnable")}</span>
                    <input
                      type="checkbox"
                      checked={mgmtOpen.has(p.id) || (p.admin_sections?.length > 0)}
                      onChange={(e) => toggleManagement(p, e.target.checked)}
                      className="h-5 w-5 rounded border-input accent-primary"
                    />
                  </label>
                  {(mgmtOpen.has(p.id) || (p.admin_sections?.length > 0)) && (
                    <div className="space-y-1 rounded-md border p-3">
                      <p className="mb-1 text-xs text-muted-foreground">{t("employees.managementHint")}</p>
                      {GRANTABLE_ADMIN_SECTIONS.map((sectionId) => (
                        <label key={sectionId} className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
                          <span>{t(`manager.sections.${sectionId}`)}</span>
                          <input
                            type="checkbox"
                            checked={(p.admin_sections || []).includes(sectionId)}
                            onChange={(e) => toggleAdminSection(p, sectionId, e.target.checked)}
                            className="h-5 w-5 rounded border-input accent-primary"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* CCQ payroll/export metadata — only for CCQ tradespeople (not admin/owner). */}
            {!isNonCcqRole(p.role) && (
            <details className="group rounded-lg border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{t("employees.ccqExport")}</span>
                  <span className="hidden text-xs font-normal text-muted-foreground sm:inline">CCQ# {p.ccq_number || "—"}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-4 border-t p-3">
                {/* Classification */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <Field label={t("employees.phoneData")}>
                <div className="flex h-9 items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={p.phone_data_reimbursement ?? ""}
                    onChange={(e) => setLocal(p.id, "phone_data_reimbursement", e.target.value)}
                    onBlur={(e) => saveField(p.id, "phone_data_reimbursement", e.target.value)}
                    placeholder="7.00"
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">/{t("employees.perWeek")}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{t("employees.phoneDataHint")}</span>
              </Field>
                </div>

                <div className="rounded-lg bg-muted/20 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("employees.nasEmployee")}>
                  <NasField employeeId={p.id} initialHasNas={nasSet.has(p.id)} privileged={privileged} />
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
                  checked={Boolean(p.storage_compensation)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "storage_compensation", checked);
                    saveField(p.id, "storage_compensation", checked);
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
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3 md:col-span-2">
                <span className="text-sm font-medium">
                  {t("employees.otFirstHourDouble")}
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{t("employees.otFirstHourDoubleHint")}</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(p.overtime_first_hour_double)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "overtime_first_hour_double", checked);
                    saveField(p.id, "overtime_first_hour_double", checked);
                  }}
                  className="h-5 w-5 rounded border-input accent-primary"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-3 md:col-span-2">
                <span className="text-sm font-medium">
                  {t("employees.returnNoBenefits")}
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{t("employees.returnNoBenefitsHint")}</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(p.return_overtime_no_benefits)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setLocal(p.id, "return_overtime_no_benefits", checked);
                    saveField(p.id, "return_overtime_no_benefits", checked);
                  }}
                  className="h-5 w-5 rounded border-input accent-primary"
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
              </div>
            </details>
            )}

            {!isManagerRole(p.role) && p.id !== user?.id && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{t("employees.passwordResetTitle")}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{t("employees.passwordResetHint")}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={passwordResetId === p.id} onClick={() => resetTemporaryPassword(p)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    {passwordResetId === p.id ? t("common.working") : t("employees.passwordResetButton")}
                  </Button>
                </div>
                {temporaryCredentials?.userId === p.id && (
                  <div className="mt-3 rounded-md border border-green-300 bg-green-50 p-3 text-green-950 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100" role="status">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{t("employees.passwordResetDone")}</div>
                        <div className="mt-1 break-all text-xs">{temporaryCredentials.email}</div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            type="text"
                            readOnly
                            value={temporaryCredentials.password}
                            aria-label={t("employees.add.tempPassword")}
                            className="h-10 bg-white font-mono text-base font-bold tracking-wider text-slate-950 dark:bg-slate-950 dark:text-white sm:max-w-xs"
                            onFocus={(event) => event.currentTarget.select()}
                          />
                          <Button type="button" size="sm" variant="outline" onClick={copyTemporaryPassword}>
                            <Copy className="mr-2 h-4 w-4" />
                            {t("employees.copyPassword")}
                          </Button>
                        </div>
                        <p className="mt-2 text-xs">{t("employees.add.share")}</p>
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setTemporaryCredentials(null)} aria-label={t("common.cancel")}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {p.is_paused && !isManagerRole(p.role) && p.id !== user?.id && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-destructive dark:text-red-300">{t("employees.deleteUser")}</span>
                  {confirmDelete === p.id ? (
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</Button>
                      <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={() => handleDelete(p)}>{deleting ? t("common.saving") : t("employees.deleteConfirm")}</Button>
                    </div>
                  ) : (
                    <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmDelete(p.id)}>{t("employees.deleteUser")}</Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("employees.deleteHint")}</p>
              </div>
            )}
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
