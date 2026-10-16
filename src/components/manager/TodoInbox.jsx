import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { AlertTriangle, CheckCheck, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { useT } from "@/lib/use-t";
import { withRetry } from "@/lib/utils";
import { formatHM } from "@/lib/time";
import { companyDate } from "@/lib/company-time";
import { isOffOn } from "@/lib/timeoff";
import { notSubmittedYesterday } from "@/lib/live-crew";
import { QUERY_BUDGETS } from "@/lib/query-budgets";
import { anomaliesForJobs, anomalyLimitsFromSettings, detectJobAnomalies } from "@/lib/job-anomalies";
import { approvalOutcome, buildInbox, previousWorkday } from "@/lib/todo-inbox";
import { notifyBroadcastPush } from "@/lib/push";
import { getKilometreBreakdown } from "@/lib/payroll-calculations";
import { mealBreakdownText, mealDayBreakdown } from "@/lib/meal-eligibility";
import { loadManualEntryJobIds } from "@/lib/entry-source";
import { PARKING_BUCKET, parkingReceiptPaths } from "@/lib/parking-receipts";
import ManualEntryStar from "@/components/ManualEntryStar";

const JOB_COLUMNS = "id, user_id, job_date, status, ot, depart, arrivee, fin, started_at, ended_at, km_total, km_aller, km_retour, return_time_minutes, overtime_evidence_captured, updated_at";

// `.in(...)` over hundreds of job ids, split so each request URL stays short.
async function selectInChunks(ids, query) {
  const data = [];
  for (let i = 0; i < ids.length; i += QUERY_BUDGETS.inListChunk) {
    const res = await withRetry(() => query(ids.slice(i, i + QUERY_BUDGETS.inListChunk)), 12000);
    if (res.error) return { data, error: res.error };
    data.push(...(res.data || []));
  }
  return { data };
}
const money = (value) => `${(Number(value) || 0).toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} $`;
const hm = (minutes) => formatHM((Number(minutes) || 0) / 60);

// Équipe en direct › V3 « À traiter »: one page for the daily decisions — approve days,
// review the proof / supper / parking attached to them, return a day, remind or unlock the
// people who did not submit. Uses the same server calls as Feuilles de temps and Reçus.
export default function TodoInbox() {
  const t = useT();
  const { user } = useAuth();
  const [confirm, confirmDialog] = useConfirmDialog();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [image, setImage] = useState(null); // { title, urls }

  // No state is set before the first await, so the effect below never renders twice in a row.
  const load = useCallback(async () => {
    try {
      const today = companyDate();
      const prevDay = previousWorkday(today);
      const [submittedRes, peopleRes, mealsRes, parkingRes, settingsRes, timeOffRes, prevJobsRes] = await Promise.all([
        withRetry(() => supabase.from("jobs").select(JOB_COLUMNS).eq("status", "submitted").order("job_date", { ascending: true }).order("id").limit(QUERY_BUDGETS.todoSubmittedJobs), 12000),
        withRetry(() => supabase.from("profiles").select("id, full_name, email, role, is_paused, show_on_boards, apprentice_level, first_trip_unpaid"), 12000),
        withRetry(() => supabase.from("meal_claims").select("id, job_id, user_id, job_date, amount, status").eq("status", "pending").order("job_date").limit(QUERY_BUDGETS.reviewQueue), 12000),
        withRetry(() => supabase.from("parking_receipts").select("job_id, user_id, job_date, amount, status, storage_path, extra_storage_paths").eq("status", "pending").order("job_date").limit(QUERY_BUDGETS.reviewQueue), 12000),
        supabase.from("company_time_settings").select("*").eq("id", true).maybeSingle(),
        supabase.from("employee_time_off").select("user_id, kind, start_date, end_date, start_time, weekdays, exception_dates").lte("start_date", prevDay).or(`end_date.gte.${prevDay},end_date.is.null`),
        supabase.from("jobs").select("user_id, status").eq("job_date", prevDay),
      ]);
      for (const res of [submittedRes, peopleRes, mealsRes, parkingRes]) if (res.error) throw res.error;
      const submitted = submittedRes.data || [];
      const people = peopleRes.data || [];
      const ids = submitted.map((job) => job.id);
      const userIds = [...new Set(submitted.map((job) => job.user_id))];
      const dates = [...new Set(submitted.map((job) => job.job_date))];
      const [peersRes, evidenceRes, manualIds] = await Promise.all([
        ids.length
          ? withRetry(() => supabase.from("jobs").select(JOB_COLUMNS).eq("status", "approved").in("user_id", userIds).in("job_date", dates).limit(QUERY_BUDGETS.todoApprovedPeers), 12000)
          : { data: [] },
        ids.length
          ? selectInChunks(ids, (part) => supabase.from("overtime_evidence").select("job_id, storage_path, daily_minutes").in("job_id", part))
          : { data: [] },
        loadManualEntryJobIds(supabase, ids),
      ]);
      const anomalies = detectJobAnomalies(
        [...submitted, ...(peersRes.data || [])],
        anomalyLimitsFromSettings(settingsRes.data),
        { firstTripUnpaidUsers: new Set(people.filter((p) => p.first_trip_unpaid).map((p) => p.id)) },
      );
      const offPrev = new Set((timeOffRes.data || []).filter((row) => isOffOn(row, prevDay) && !row.start_time).map((row) => row.user_id));
      const missing = notSubmittedYesterday(people, { yesterdayJobs: prevJobsRes.data || [], offUserIds: offPrev })
        .map((p) => ({ id: p.id, name: p.full_name || p.email || p.id, hasJobs: (prevJobsRes.data || []).some((job) => job.user_id === p.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      setErr("");
      setState({
        today, prevDay, anomalies, missing,
        truncated: submitted.length >= QUERY_BUDGETS.todoSubmittedJobs,
        manualIds,
        profiles: new Map(people.map((p) => [p.id, p])),
        raw: { submitted, peers: peersRes.data || [], evidence: evidenceRes.data || [], meals: mealsRes.data || [], parking: parkingRes.data || [] },
      });
    } catch (e) {
      setErr(e?.message || t("todo.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // load() only sets state after its first await; scheduling it as a microtask states that.
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  function refresh() {
    setLoading(true);
    setErr("");
    return load();
  }

  const inbox = useMemo(() => {
    if (!state) return null;
    return buildInbox({
      submittedJobs: state.raw.submitted,
      profiles: state.profiles,
      anomalies: state.anomalies,
      evidenceRows: state.raw.evidence,
      meals: state.raw.meals,
      parking: state.raw.parking,
    });
  }, [state]);

  const nameOf = (userId) => {
    const p = state?.profiles.get(userId);
    return p?.full_name || p?.email || String(userId).slice(0, 8);
  };

  function describeAnomaly(anomaly) {
    return t(`manager.anomalies.${anomaly.type}`, {
      duration: hm(anomaly.minutes),
      km: anomaly.km,
      ot: anomaly.ot,
      depart: String(anomaly.depart || "").slice(0, 5),
      fin: String(anomaly.fin || "").slice(0, 5),
    });
  }

  async function run(key, action) {
    setBusy(key);
    setErr("");
    setInfo("");
    try {
      await action();
    } catch (e) {
      setErr(e?.message || t("manager.errors.approveFailed"));
    } finally {
      setBusy("");
      await load();
    }
  }

  async function functionError(error) {
    try {
      const payload = await error?.context?.json();
      return payload?.error || payload?.message || error?.message;
    } catch {
      return error?.message;
    }
  }

  // Approval notifications are settled once the job is approved: drop them off the bell.
  async function markNotificationsRead(jobIds) {
    if (!jobIds.length || !user?.id) return;
    const { data: notifs } = await supabase.from("manager_notifications").select("id").in("job_id", jobIds);
    const rows = (notifs || []).map((n) => ({ notification_id: n.id, manager_id: user.id }));
    if (rows.length) await supabase.from("manager_notification_reads").upsert(rows);
    window.dispatchEvent(new CustomEvent("sparklog:notifications-refresh"));
  }

  async function approve(key, jobIds, question) {
    if (!jobIds.length) return;
    if (question && !(await confirm(question))) return;
    await run(key, async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error(t("manager.errors.noSession"));
      const timeoutMs = jobIds.length > 1 ? 60000 : 30000;
      const { data, error } = await Promise.race([
        supabase.functions.invoke("push_approved_batch", { body: { job_ids: jobIds }, headers: { Authorization: `Bearer ${token}` } }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(t("todo.timeout"))), timeoutMs)),
      ]);
      if (error) throw new Error(await functionError(error) || t("manager.errors.approveFailed"));
      if (data?.ok !== true) throw new Error(data?.error || t("manager.errors.approveFailed"));
      const { approved, stale } = approvalOutcome(data, jobIds);
      await markNotificationsRead(approved);
      setInfo(stale.length
        ? t("todo.toast.stale", { count: approved.length, stale: stale.length })
        : t("todo.toast.approved", { count: approved.length }));
    });
  }

  // Every approval asks first (V2.4.147); a day with an anomaly lists it in the question.
  function approveDay(day) {
    const hits = anomaliesForJobs(state.anomalies, day.jobs.map((job) => job.id));
    const question = hits.length
      ? t("todo.confirm.approveAnomaly", { list: hits.map((a) => `• ${describeAnomaly(a)}`).join("\n") })
      : t("todo.confirm.approveDay", { name: nameOf(day.userId), date: dayjs(day.date).format("ddd D MMM"), count: day.jobs.length });
    return approve(`day:${day.key}`, day.jobs.map((job) => job.id), question);
  }

  function approveEmployee(emp) {
    const jobIds = emp.days.flatMap((day) => day.jobs.map((job) => job.id));
    return approve(`emp:${emp.id}`, jobIds, t("todo.confirm.approveEmployee", { count: emp.days.length, name: emp.name }));
  }

  function approveAllClean() {
    return approve("all", inbox.cleanJobIds, t("todo.confirm.approveAll", { count: inbox.stats.cleanDays, jobs: inbox.cleanJobIds.length }));
  }

  async function returnDay(day) {
    const ok = await confirm(t("todo.confirm.returnDay", { name: nameOf(day.userId), date: dayjs(day.date).format("ddd D MMM"), count: day.jobs.length }));
    if (!ok) return;
    await run(`return:${day.key}`, async () => {
      let done = 0;
      for (const job of day.jobs) {
        const { error } = await withRetry(() => supabase.rpc("return_job_for_correction", { p_job_id: job.id, p_expected_updated_at: job.updated_at || null }), 12000);
        if (error) throw error;
        done += 1;
      }
      setInfo(t("todo.toast.returned", { count: done }));
    });
  }

  // Accepting or refusing a claim asks first: a refusal cannot be undone from the app.
  async function confirmClaim(kind, claim, decision) {
    return confirm(t(`confirm.${decision === "approved" ? "accept" : "reject"}${kind}`, {
      name: nameOf(claim.user_id),
      date: dayjs(claim.job_date).format("ddd D MMM"),
      amount: money(claim.amount),
    }));
  }

  async function reviewMeal(claim, decision) {
    if (!(await confirmClaim("Meal", claim, decision))) return;
    return run(`meal:${claim.id}`, async () => {
      const { error } = await withRetry(() => supabase.rpc("review_meal_claim", {
        p_claim_id: claim.id,
        p_decision: decision,
        p_payroll_treatment: decision === "approved" ? "expense_reimbursement" : null,
      }), 12000);
      if (error) throw error;
      setInfo(t("todo.toast.reviewed"));
    });
  }

  async function reviewParking(receipt, decision) {
    if (!(await confirmClaim("Parking", receipt, decision))) return;
    return run(`parking:${receipt.job_id}`, async () => {
      const { error } = await withRetry(() => supabase.rpc("review_parking_claim", { p_job_id: receipt.job_id, p_decision: decision }), 12000);
      if (error) throw error;
      setInfo(t("todo.toast.reviewed"));
    });
  }

  const parkingLabel = (receipt) => {
    const count = parkingReceiptPaths(receipt).length;
    return count > 1
      ? t("todo.parkingMany", { amount: money(receipt.amount), count })
      : t("todo.parking", { amount: money(receipt.amount) });
  };

  // One picture or several (the parcomètre receipts of one parking claim).
  async function showImage(bucket, pathOrPaths, title) {
    const paths = (Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]).filter(Boolean);
    if (!paths.length) return;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 600);
    const urls = (data || []).map((row) => row?.signedUrl).filter(Boolean);
    if (error || !urls.length) { setErr(error?.message || t("manager.overtime.imageUnavailable")); return; }
    setImage({ title, urls });
  }

  async function remind(people) {
    if (!people.length) return;
    const ok = await confirm(t("todo.confirm.remind", { names: people.map((p) => p.name).join(", ") }));
    if (!ok) return;
    await run(`remind:${people.map((p) => p.id).join(",")}`, async () => {
      const { data: created, error } = await supabase
        .from("manager_broadcasts")
        .insert({ sender_id: user?.id, body: t("todo.reminderBody", { date: dayjs(state.prevDay).format("dddd D MMMM") }), audience: "selected", image_path: null })
        .select("id")
        .single();
      if (error) throw error;
      const { error: recipError } = await supabase.from("broadcast_recipients").insert(people.map((p) => ({ broadcast_id: created.id, employee_id: p.id })));
      if (recipError) throw recipError;
      notifyBroadcastPush(created.id); // phone push, best-effort
      setInfo(t("todo.toast.reminded", { count: people.length }));
    });
  }

  function unlockDay(person) {
    return run(`unlock:${person.id}`, async () => {
      const { error } = await supabase
        .from("job_entry_unlocks")
        .upsert({ user_id: person.id, job_date: state.prevDay, unlocked_until: null }, { onConflict: "user_id,job_date" });
      if (error) throw error;
      setInfo(t("todo.toast.unlocked", { name: person.name, date: dayjs(state.prevDay).format("ddd D MMM") }));
    });
  }

  const claimChip = ({ key, label, onAccept, onReject, onView }) => (
    <span key={key} className="inline-flex items-center gap-1 rounded-md border border-input bg-background py-0.5 pl-2.5 pr-1 text-xs font-semibold">
      {label}
      {onView && <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={onView}>{t("todo.view")}</Button>}
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-success" disabled={Boolean(busy)} onClick={onAccept}>{t("todo.accept")}</Button>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-destructive" disabled={Boolean(busy)} onClick={onReject}>{t("todo.reject")}</Button>
    </span>
  );

  // The supper check uses every job of that day (approved ones too), like the database does.
  function mealCheck(day) {
    const sameDay = (job) => job.user_id === day.userId && job.job_date === day.date;
    const jobs = [...state.raw.submitted.filter(sameDay), ...state.raw.peers.filter(sameDay)];
    return mealDayBreakdown(jobs, day.date, state.profiles.get(day.userId));
  }

  // A plain render function (not a component) so rows are not remounted on every render.
  function renderDay(day, anomaly = false) {
    const proof = day.evidence.find((row) => row.storage_path);
    return (
      <div key={day.key} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 first:border-t-0">
        <div className="min-w-0 flex-1 space-y-1.5" style={{ flexBasis: 300 }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {anomaly && <span className="font-semibold">{nameOf(day.userId)}</span>}
            <span className="font-semibold">{dayjs(day.date).format("ddd D MMM")}</span>
            <span className="font-mono text-sm">{hm(day.minutes)}</span>
            <span className="text-xs text-muted-foreground">{Math.round(day.km)} km</span>
          </div>
          {day.jobs.map((job) => (
            <div key={job.id} className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{state.manualIds?.has(job.id) && <ManualEntryStar className="mr-1" />}OT {job.ot || "—"}</span>
              <span className="font-mono">{String(job.depart || "").slice(0, 5)} – {String(job.fin || "").slice(0, 5)}</span>
              {Number(job.return_time_minutes) > 0 && <span>{t("todo.returnTime", { time: hm(job.return_time_minutes), km: Math.round(getKilometreBreakdown(job).returnKm) })}</span>}
            </div>
          ))}
          {anomaly && day.anomalies.map((a) => (
            <div key={a.key} className="flex items-start gap-1.5 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{describeAnomaly(a)}</div>
          ))}
          {day.meals.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{t("meal.check.title")} : </span>
              {mealBreakdownText(t, mealCheck(day), formatHM)} · {t("meal.check.threshold")}
            </div>
          )}
          {(proof || day.meals.length > 0 || day.parking.length > 0) && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {proof && (
                <span className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-success/10 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-success">
                  {t("todo.proof")}
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => showImage("overtime-evidence", proof.storage_path, `${t("todo.proof")} · ${nameOf(day.userId)}`)}>{t("todo.view")}</Button>
                </span>
              )}
              {day.meals.map((claim) => claimChip({
                key: claim.id,
                label: t("todo.meal", { amount: money(claim.amount) }),
                onAccept: () => reviewMeal(claim, "approved"),
                onReject: () => reviewMeal(claim, "rejected"),
              }))}
              {day.parking.map((receipt) => claimChip({
                key: `p:${receipt.job_id}`,
                label: parkingLabel(receipt),
                onView: receipt.storage_path ? () => showImage(PARKING_BUCKET, parkingReceiptPaths(receipt), parkingLabel(receipt)) : null,
                onAccept: () => reviewParking(receipt, "approved"),
                onReject: () => reviewParking(receipt, "rejected"),
              }))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {anomaly && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/manager/v3/time?tab=timesheets&emp=${day.userId}&date=${day.date}`}>{t("todo.openDay")}</Link>
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => returnDay(day)}>{t("todo.returnDay")}</Button>
          <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => approveDay(day)}>
            {busy === `day:${day.key}` ? t("common.working") : t(anomaly ? "todo.approveAnyway" : "todo.approveDay")}
          </Button>
        </div>
      </div>
    );
  }

  const stats = inbox?.stats;
  const missing = state?.missing || [];

  return (
    <div className="space-y-4">
      {confirmDialog}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{state ? dayjs(state.today).format("dddd D MMMM") : ""}</div>
          <h2 className="text-2xl font-bold tracking-tight">{t("todo.title")}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={refresh} disabled={loading || Boolean(busy)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> {t("todo.refresh")}
          </Button>
          {missing.length > 0 && (
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => remind(missing)}>{t("todo.remindAll", { count: missing.length })}</Button>
          )}
          <Button type="button" disabled={!stats?.cleanDays || Boolean(busy)} onClick={approveAllClean}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            {busy === "all" ? t("common.working") : t("todo.approveAllClean", { count: stats?.cleanDays || 0 })}
          </Button>
        </div>
      </div>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{err}</div>}
      {info && <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{info}</div>}
      {state?.manualIds?.size > 0 && <div className="text-xs text-muted-foreground"><ManualEntryStar className="mr-1" />{t("manager.manualEntryLegend")}</div>}
      {state?.truncated && <div className="text-xs text-muted-foreground">{t("todo.truncated", { count: QUERY_BUDGETS.todoSubmittedJobs })}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: t("todo.stats.days"), value: stats?.days ?? "—", cls: "" },
          { label: t("todo.stats.claims"), value: stats?.pendingClaims ?? "—", cls: "" },
          { label: t("todo.stats.anomalies"), value: stats?.anomalyDays ?? "—", cls: stats?.anomalyDays ? "text-warning" : "" },
          { label: t("todo.stats.missing", { date: state ? dayjs(state.prevDay).format("ddd D") : "" }), value: state ? missing.length : "—", cls: missing.length ? "text-destructive" : "" },
        ].map((tile) => (
          <Card key={tile.label}><CardContent className="p-4">
            <div className="text-xs font-semibold text-muted-foreground">{tile.label}</div>
            <div className={`mt-1 font-mono text-2xl ${tile.cls}`}>{tile.value}</div>
          </CardContent></Card>
        ))}
      </div>

      {loading && !state && <div className="text-sm text-muted-foreground">{t("common.working")}</div>}

      {inbox && inbox.anomalyDays.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-warning/40 bg-warning/10">
          <h3 className="px-4 pb-1 pt-3 text-sm font-semibold text-warning">{t("todo.anomaliesTitle")}</h3>
          <div className="m-3 mt-2 overflow-hidden rounded-lg border bg-card">
            {inbox.anomalyDays.map((day) => renderDay(day, true))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <section className="min-w-0 space-y-3" style={{ flex: "999 1 520px" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">{t("todo.daysTitle")}</h3>
            <span className="text-xs text-muted-foreground">{t("todo.daysHint")}</span>
          </div>
          {inbox && inbox.employees.length === 0 && inbox.anomalyDays.length === 0 && (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("todo.empty")}</CardContent></Card>
          )}
          {inbox?.employees.map((emp) => (
            <Card key={emp.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                <div className="font-semibold">{emp.name}</div>
                {emp.days.length > 1 && (
                  <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => approveEmployee(emp)}>
                    {busy === `emp:${emp.id}` ? t("common.working") : t("todo.approveEmployee", { count: emp.days.length })}
                  </Button>
                )}
              </div>
              {emp.days.map((day) => renderDay(day))}
            </Card>
          ))}

          {inbox && inbox.orphanClaims.length > 0 && (
            <Card><CardContent className="space-y-2 p-4">
              <h3 className="text-sm font-semibold">{t("todo.orphanTitle")}</h3>
              {inbox.orphanClaims.map((claim) => (
                <div key={`${claim.kind}:${claim.id || claim.job_id}`} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm first:border-t-0 first:pt-0">
                  <span><b>{nameOf(claim.user_id)}</b> · {dayjs(claim.job_date).format("ddd D MMM")}</span>
                  {claim.kind === "meal"
                    ? claimChip({ key: claim.id, label: t("todo.meal", { amount: money(claim.amount) }), onAccept: () => reviewMeal(claim, "approved"), onReject: () => reviewMeal(claim, "rejected") })
                    : claimChip({
                      key: claim.job_id,
                      label: parkingLabel(claim),
                      onView: claim.storage_path ? () => showImage(PARKING_BUCKET, parkingReceiptPaths(claim), parkingLabel(claim)) : null,
                      onAccept: () => reviewParking(claim, "approved"),
                      onReject: () => reviewParking(claim, "rejected"),
                    })}
                </div>
              ))}
            </CardContent></Card>
          )}
        </section>

        <aside className="space-y-3" style={{ flex: "1 1 260px" }}>
          <Card><CardContent className="space-y-2 p-4">
            <h3 className="text-sm font-semibold">{t("todo.missingTitle", { date: state ? dayjs(state.prevDay).format("dddd D MMM") : "" })}</h3>
            {state && missing.length === 0 && <div className="text-sm text-muted-foreground">{t("todo.missingNone")}</div>}
            {missing.map((person) => (
              <div key={person.id} className="space-y-1.5 border-t pt-2">
                <Link to={`/manager/v3/time?tab=timesheets&emp=${person.id}&date=${state.prevDay}`} className="font-semibold text-primary hover:underline">{person.name}</Link>
                <div className="text-xs text-muted-foreground">{t(person.hasJobs ? "todo.missingSaved" : "todo.missingNoJob")}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => remind([person])}>{t("todo.remind")}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => unlockDay(person)}>{t("todo.unlock")}</Button>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </aside>
      </div>

      <Dialog open={Boolean(image)} onOpenChange={(open) => { if (!open) setImage(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{image?.title}</DialogTitle></DialogHeader>
          {image?.urls?.map((url) => <img key={url} src={url} alt={image.title} className="w-full rounded-md border" />)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
