import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { isNonCcqRole, isManagerRole, isPrivileged } from "@/lib/roles";
import { TIME_OFF_COLUMNS } from "@/lib/timeoff";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CcqCardCapture from "@/components/CcqCardCapture";
import AddEmployeeCard from "@/components/employees/AddEmployeeCard";
import EmployeeCardHeader from "@/components/employees/EmployeeCardHeader";
import EmployeeDetails from "@/components/employees/EmployeeDetails";
import { useT } from "@/lib/use-t";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { withTimeout } from "@/lib/utils";
import { getMissingEmployeeFields } from "@/lib/employee-fields";
import { companyDate } from "@/lib/company-time";
import { mfaBadge } from "@/lib/mfa";
import { ccqRateFor, defaultAnnex, employeeCounts, filterEmployees, lacksPush, rateSuggestionsFor, ratesFromSnapshots, sortEmployees } from "@/lib/employees-panel";
import { DEPARTURE_STATUSES, NEW_HIRE, SIGNUPS_EVENT, employeeStatus, employmentChoice, employmentDatesError, employmentUpdate, fetchPendingSignups, isNewHire } from "@/lib/signups";

// Gestion › Employés: loads the roster and owns every write; the card pieces live in
// src/components/employees/ and the pure rules (order, CCQ rates, counters) in src/lib/employees-panel.js.

const PROFILE_COLUMNS = "id, role, type_confirmed, admin_sections, full_name, phone, email, is_paused, departure_status, departure_note, start_date, last_work_date, employee_number, ccq_number, ccq_expiration_date, birth_date, apprentice_level, work_region, union_association, wage_schedule, hourly_rate, hourly_rate_double, km_rate, team_leader_premium, phone_data_reimbursement, storage_compensation, parking_receipts_enabled, inventory_screenshots_enabled, overtime_first_hour_double, return_with_benefits_to_8h, ccq_card_capture_enabled, birth_date_capture_enabled, union_association_capture_enabled, ccq_card_path";

// Everything the panel shows: profiles (in list order), current CCQ rates, sign-ups waiting for
// activation, two-factor / notification / NAS presence (ids only) and the dry-run rate suggestions.
async function fetchEmployeesData({ privileged, today }) {
  const [{ data, error }, { data: snapshotRows, error: ratesError }] = await withTimeout(
    Promise.all([
      supabase.from("profiles").select(PROFILE_COLUMNS).order("full_name", { ascending: true }),
      supabase.from("ccq_rate_snapshots").select("sector_id, skill_id, raw_json, fetched_at").eq("occupation_id", "220").order("fetched_at", { ascending: false }),
    ]),
    12000
  );
  if (error) throw error;
  if (ratesError) throw ratesError;
  const { rates, annexes } = ratesFromSnapshots(snapshotRows);
  const pending = await fetchPendingMap();
  const profiles = sortEmployees(data, pending, today);
  // Who turned on two-factor authentication (ids only): shield icon next to the name.
  const { data: mfaRows } = await supabase.rpc("mfa_enrolled_users");
  // Who has phone notifications on (at least one device): bell icon, « Sans notifications » filter.
  const { data: pushRows, error: pushError } = await supabase.rpc("push_enabled_users");
  // NAS lives in the restricted vault; only privileged users can see who has one.
  // Fetch presence only (not the value) — the value is revealed on demand + audited.
  const nasRows = privileged ? (await supabase.rpc("nas_presence")).data : null;
  return {
    rates,
    annexes,
    pending,
    profiles,
    mfaSet: new Set((mfaRows || []).map((r) => r.user_id)),
    pushSet: pushError ? null : new Set((pushRows || []).map((r) => r.user_id)),
    nasSet: privileged ? new Set((nasRows || []).map((r) => r.user_id)) : null,
    // P-6: a dry-run comparison only; the manager applies it explicitly (applyRateSuggestions).
    rateSuggestions: rateSuggestionsFor(profiles, rates, annexes),
  };
}

// Sign-ups waiting for activation (manager level): id → { email_confirmed }. A failure only hides
// the « new sign-up » labels.
async function fetchPendingMap() {
  try {
    const rows = await fetchPendingSignups();
    return new Map(rows.map((row) => [row.user_id, row]));
  } catch (pendingError) {
    console.warn("[employees] pending sign-ups unavailable", pendingError);
    return new Map();
  }
}

// Upcoming / current dated time off (not fully past) plus live weekly recurrences
// (open-ended, i.e. end_date is null, or an "until" still in the future), by employee.
async function fetchTimeOff(today) {
  const { data } = await supabase
    .from("employee_time_off")
    .select(TIME_OFF_COLUMNS)
    .or(`end_date.gte.${today},end_date.is.null`)
    .order("start_date", { ascending: true });
  const map = new Map();
  (data || []).forEach((row) => {
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id).push(row);
  });
  return map;
}

export default function EmployeesPanel() {
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const privileged = isPrivileged(role);
  const [nasSet, setNasSet] = useState(new Set());
  const [mfaSet, setMfaSet] = useState(() => new Set()); // users with a verified second factor (0103)
  const [pushSet, setPushSet] = useState(null); // users with phone notifications on (0113); null = unknown
  // Inactive accounts waiting for activation (0109): id → { email_confirmed }.
  const [pendingById, setPendingById] = useState(() => new Map());
  const [statusFilter, setStatusFilter] = useState("all"); // all · pending · new_hire · former · noPush
  // « Nouvel(le) employé(e) » picked, first day of work not entered yet (nothing saved until then).
  const [newHireDraft, setNewHireDraft] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [ccqEdit, setCcqEdit] = useState(null); // employee profile whose CCQ card the manager is capturing
  const [timeOff, setTimeOff] = useState(new Map());
  const today = companyDate();
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [rates, setRates] = useState(new Map());
  const [annexes, setAnnexes] = useState(new Map());
  const [rateSuggestions, setRateSuggestions] = useState(new Map()); // id → { rate, annex, current } (dry-run, P-6)
  const [applyingRates, setApplyingRates] = useState(false);
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

  async function loadPending() {
    const next = await fetchPendingMap();
    setPendingById(next);
    return next;
  }

  // After an activation or a former-employee mark: refresh the labels here and the side-menu badge.
  async function signupsChanged() {
    await loadPending();
    window.dispatchEvent(new Event(SIGNUPS_EVENT));
  }

  const applyLoaded = useCallback((next) => {
    setRates(next.rates);
    setAnnexes(next.annexes);
    setPendingById(next.pending);
    setProfiles(next.profiles);
    setMfaSet(next.mfaSet);
    setPushSet(next.pushSet);
    if (next.nasSet) setNasSet(next.nasSet);
    setRateSuggestions(next.rateSuggestions);
  }, []);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      applyLoaded(await fetchEmployeesData({ privileged, today }));
    } catch (e) {
      setErr(e?.message ?? "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeOff() {
    setTimeOff(await fetchTimeOff(today));
  }

  useEffect(() => {
    let alive = true;
    fetchEmployeesData({ privileged, today }).then(
      (next) => { if (alive) applyLoaded(next); },
      (e) => { if (alive) setErr(e?.message ?? "Failed to load employees."); },
    ).finally(() => { if (alive) setLoading(false); });
    fetchTimeOff(today).then((map) => { if (alive) setTimeOff(map); });
    return () => { alive = false; };
  }, [applyLoaded, privileged, today]);

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

  // Date d'embauche (start_date) / dernier jour travaillé (last_work_date, 0115): checked together first.
  // A hiring date still to come makes the person « En attente » (0110), hence the badge refresh.
  async function saveEmploymentDate(p, field, rawValue) {
    const value = rawValue || null;
    const start = field === "start_date" ? value : p.start_date;
    const last = field === "last_work_date" ? value : p.last_work_date;
    const problem = employmentDatesError(start, last);
    if (problem) { setErr(t(problem)); return; }
    setErr("");
    setLocal(p.id, field, value);
    await saveField(p.id, field, value);
    if (field === "start_date") signupsChanged();
  }

  // « Embauche / départ » picker: new hire (with the first day of work, 0110) or former employee (0109).
  function setDraft(id, on) {
    setNewHireDraft((current) => {
      const next = new Set(current);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function saveEmployment(p, choice, startDate) {
    const previous = newHireDraft.has(p.id) ? NEW_HIRE : employmentChoice(p, today);
    if (choice === NEW_HIRE && !startDate) { setDraft(p.id, true); return; }
    if (DEPARTURE_STATUSES.includes(choice) && !p.is_paused
      && !(await confirm(t("employees.departure.confirm", { name: p.full_name || p.email, status: t(`employees.status.${choice}`) })))) return;
    const update = employmentUpdate(choice, startDate, previous);
    if (!update) return;
    setDraft(p.id, false);
    // A former employee is inactive (the database does the same, 0109).
    setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...update, ...(update.departure_status ? { is_paused: true } : {}) } : x)));
    const { error } = await supabase.from("profiles").update(update).eq("id", p.id);
    if (error) { setErr(error.message); load(); return; }
    setInfo(`${Object.keys(update).join(", ")} ✓`);
    setTimeout(() => setInfo(""), 1500);
    signupsChanged();
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
      // A privileged delete needs a live login token. If the session has lapsed, invoke()
      // would send the anon key and the function replies "Invalid session token" — check
      // first and surface a clear re-auth message. getSession() refreshes an expired access
      // token when a valid refresh token is still available.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setErr(t("employees.sessionExpired"));
        setConfirmDelete(null);
        return;
      }
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
      const raw = e?.message || "Delete failed";
      setErr(/invalid session token|missing bearer token/i.test(raw) ? t("employees.sessionExpired") : raw);
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function saveClassification(profile, field, value) {
    setLocal(profile.id, field, value);
    await saveField(profile.id, field, value);
    const next = { ...profile, [field]: value };
    const annex = defaultAnnex(next, annexes);
    const rate = ccqRateFor(next.apprentice_level, annex, rates);
    if (rate != null) {
      setLocal(profile.id, "hourly_rate", rate);
      setLocal(profile.id, "wage_schedule", annex);
      await Promise.all([saveField(profile.id, "hourly_rate", rate), saveField(profile.id, "wage_schedule", annex)]);
    }
  }

  async function saveAnnex(profile, annex) {
    setLocal(profile.id, "wage_schedule", annex);
    await saveField(profile.id, "wage_schedule", annex);
    const rate = ccqRateFor(profile.apprentice_level, annex, rates);
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
    if (!(await confirm(t("employees.rates.applyConfirm", { count: rateSuggestions.size })))) return;
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

  const counts = employeeCounts(profiles, { pending: pendingById, pushSet, today, t });
  const visibleProfiles = filterEmployees(profiles, statusFilter, { pending: pendingById, pushSet, today });
  // State and actions the card pieces read (EmployeeDetails and its sections).
  const panel = {
    t, user, role, privileged, today, nasSet, timeOff, loadTimeOff, annexes, newHireDraft, mgmtOpen, cardViews,
    confirmDelete, deleting, navigate, setLocal, saveField, saveEmploymentDate, saveEmployment, chooseType,
    toggleManagement, toggleAdminSection, saveClassification, saveAnnex, toggleCard, setCcqEdit, setConfirmDelete,
    handleDelete, signupsChanged,
  };

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <span>{t("employees.rates.pending", { count: rateSuggestions.size })}</span>
          <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={applyRateSuggestions} disabled={applyingRates}>
            {applyingRates ? t("common.working") : t("employees.rates.applyBtn")}
          </Button>
        </div>
      )}

      {isManagerRole(role) && (
        <AddEmployeeCard counts={counts} statusFilter={statusFilter} onFilter={setStatusFilter} onCreated={load} onError={setErr} onInfo={setInfo} />
      )}

      {loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</CardContent></Card>
      )}

      {!loading && profiles.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">—</CardContent></Card>
      )}

      {!loading && visibleProfiles.map((p) => {
        // Non-CCQ roles (administration + owner) skip the CCQ "missing fields" check.
        const missingFields = isNonCcqRole(p.role) ? [] : getMissingEmployeeFields(p, t);
        const expanded = expandedIds.has(p.id);
        return (
          <Card key={p.id} className={p.is_paused && !isNewHire(p, today) ? "border-muted-foreground/30 bg-muted/70 text-muted-foreground shadow-none" : missingFields.length ? "border-warning/40" : ""}>
            <EmployeeCardHeader
              profile={p}
              status={employeeStatus(p, pendingById, today)}
              expanded={expanded}
              onToggle={() => toggleExpanded(p.id)}
              missingCount={missingFields.length}
              mfa={mfaBadge(p.role, mfaSet.has(p.id))}
              pushOn={Boolean(pushSet?.has(p.id))}
              pushOff={lacksPush(p, pushSet, pendingById, today)}
              t={t}
            />
            {expanded && <EmployeeDetails profile={p} missingFields={missingFields} panel={panel} />}
          </Card>
        );
      })}

      {/* Manager captures/edits an employee's CCQ card (photo + fields) — replaces the old
          employee-facing prompt. */}
      <Dialog open={!!ccqEdit} onOpenChange={(o) => { if (!o) setCcqEdit(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("ccqCard.title")} — {ccqEdit?.full_name || ccqEdit?.email || ""}</DialogTitle>
          </DialogHeader>
          {ccqEdit && (
            <CcqCardCapture
              userId={ccqEdit.id}
              profile={ccqEdit}
              onSaved={() => { load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
