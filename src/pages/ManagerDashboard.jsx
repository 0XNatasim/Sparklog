import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/status";
import { useT } from "@/lib/use-t";

dayjs.extend(isoWeek);

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function fmtTimeHHmm(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function weekKeyFromDate(dateStr) {
  const ws = dayjs(dateStr).startOf("isoWeek");
  return ws.format("YYYY-[W]WW");
}

export default function ManagerDashboard() {
  const PAGE_SIZE = 200;
  const t = useT();

  const [jobs, setJobs] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ all: 0, saved: 0, submitted: 0, approved: 0 });
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [employeeId, setEmployeeId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("");
  const [searchLive, setSearchLive] = useState("");
  const [search, setSearch] = useState("");

  function weekFilterRange(w) {
    if (!w) return null;
    const m = /^(\d{4})-W(\d{2})$/.exec(w);
    if (!m) return null;
    const d = dayjs().year(Number(m[1])).isoWeek(Number(m[2]));
    return {
      start: d.startOf("isoWeek").format("YYYY-MM-DD"),
      end: d.endOf("isoWeek").format("YYYY-MM-DD"),
    };
  }

  const [selectedWeekKey, setSelectedWeekKey] = useState("latest");

  const setSearchDebounced = useMemo(
    () => debounce((v) => setSearch(v), 250),
    []
  );

  useEffect(() => {
    setSearchDebounced(searchLive);
  }, [searchLive, setSearchDebounced]);

  function buildJobsQuery() {
    let q = supabase
      .from("jobs")
      .select("*")
      .order("job_date", { ascending: false })
      .order("updated_at", { ascending: false });
    if (employeeId !== "all") q = q.eq("user_id", employeeId);
    // When an employee is selected the UI splits into Saved / Submitted /
    // Approved columns, so ignore the status dropdown there — otherwise
    // the other two columns are always empty.
    if (employeeId === "all" && statusFilter !== "all") q = q.eq("status", statusFilter);
    const range = weekFilterRange(weekFilter);
    if (range) q = q.gte("job_date", range.start).lte("job_date", range.end);
    return q;
  }

  async function loadCounts() {
    const range = weekFilterRange(weekFilter);
    const base = (() => {
      let q = supabase.from("jobs").select("id", { head: true, count: "exact" });
      if (range) q = q.gte("job_date", range.start).lte("job_date", range.end);
      return q;
    })();
    const scoped = (status) => {
      let q = supabase.from("jobs").select("id", { head: true, count: "exact" });
      if (employeeId !== "all") q = q.eq("user_id", employeeId);
      if (status) q = q.eq("status", status);
      if (range) q = q.gte("job_date", range.start).lte("job_date", range.end);
      return q;
    };
    const [all, saved, submitted, approved] = await Promise.all([
      employeeId === "all" ? base : scoped(null),
      scoped("saved"),
      scoped("submitted"),
      scoped("approved"),
    ]);
    setCounts({
      all: all.count || 0,
      saved: saved.count || 0,
      submitted: submitted.count || 0,
      approved: approved.count || 0,
    });
  }

  async function load() {
    setErr(""); setInfo("");
    setLoading(true);
    try {
      const { data: jobRows, error: jobErr } = await buildJobsQuery().range(0, PAGE_SIZE - 1);
      if (jobErr) throw jobErr;

      const { data: profileRows, error: profErr } = await supabase
        .from("profiles")
        .select("id, role, full_name, phone, email, ccq_number");
      if (profErr) throw profErr;

      const m = new Map();
      (profileRows || []).forEach((p) => m.set(p.id, p));

      setProfiles(m);
      setJobs(jobRows || []);
      setHasMore((jobRows || []).length === PAGE_SIZE);
      await loadCounts();
    } catch (e) {
      setErr(e?.message || t("manager.errors.failedLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    setErr("");
    try {
      const from = jobs.length;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await buildJobsQuery().range(from, to);
      if (error) throw error;
      setJobs((prev) => [...prev, ...(data || [])]);
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (e) {
      setErr(e?.message || t("manager.errors.failedMore"));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, statusFilter, weekFilter]);

  const employeeOptions = useMemo(() => {
    const arr = [];
    profiles.forEach((p, id) => {
      const label = p?.full_name?.trim() || p?.email?.trim() || `User ${String(id).slice(0, 8)}…`;
      arr.push({ id, label });
    });
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => {
      const employee = profiles.get(j.user_id);
      const haystack = [
        j.ot || "", j.job_date || "", j.status || "",
        employee?.full_name || "", employee?.phone || "", employee?.email || "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [jobs, profiles, search]);

  const split = useMemo(() => {
    if (employeeId === "all") return null;
    const saved = [];
    const submitted = [];
    const approved = [];
    for (const j of filtered) {
      if (j.status === "saved") saved.push(j);
      else if (j.status === "submitted") submitted.push(j);
      else if (j.status === "approved") approved.push(j);
    }
    // Submitted is ordered ascending by date so the oldest job (next to
    // approve) sits at the top of the column. Saved/approved keep the
    // default descending order from the query.
    submitted.reverse();
    return { saved, submitted, approved };
  }, [filtered, employeeId]);

  const selectedEmployee = useMemo(() => {
    if (employeeId === "all") return null;
    const p = profiles.get(employeeId);
    const name = p?.full_name || p?.email || `User ${String(employeeId).slice(0, 8)}…`;
    const phone = p?.phone || "";
    const email = p?.email || "";
    return { id: employeeId, name, phone, email };
  }, [employeeId, profiles]);

  const weekOptions = useMemo(() => {
    if (!split) return [];
    const m = new Map();
    for (const j of split.submitted) {
      const ws = dayjs(j.job_date).startOf("isoWeek");
      const key = ws.format("YYYY-[W]WW");
      if (!m.has(key)) {
        m.set(key, { key, start: ws, end: ws.endOf("isoWeek"), count: 0 });
      }
      m.get(key).count += 1;
    }
    return Array.from(m.values()).sort((a, b) => (b.start.isAfter(a.start) ? 1 : -1));
  }, [split]);

  useEffect(() => {
    if (!selectedEmployee || weekOptions.length === 0) {
      setSelectedWeekKey("latest");
      return;
    }
    setSelectedWeekKey(weekOptions[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee?.id]);

  const submittedForSelectedWeek = useMemo(() => {
    if (!split || !selectedEmployee) return [];
    if (weekOptions.length === 0) return [];
    if (!selectedWeekKey || selectedWeekKey === "latest") return split.submitted;
    return split.submitted.filter((j) => weekKeyFromDate(j.job_date) === selectedWeekKey);
  }, [split, selectedEmployee, selectedWeekKey, weekOptions.length]);

  function getEmployeeIdentity(userId) {
    const p = profiles.get(userId);
    return {
      employee_full_name: p?.full_name || "",
      employee_email: p?.email || "",
      employee_phone: p?.phone || "",
    };
  }

  async function approve(jobId) {
    setActionLoadingId(jobId);
    setErr(""); setInfo("");
    try {
      const job = jobs.find((x) => x.id === jobId);
      if (!job) throw new Error(t("manager.errors.jobNotFound"));

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("manager.errors.noSession"));

      const identity = getEmployeeIdentity(job.user_id);

      const { data, error: fnErr } = await invokeWithTimeout("push_approved_to_sheet", {
        body: { job_id: jobId, ...identity },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (fnErr) throw fnErr;
      if (data?.ok !== true && !data?.skipped) {
        throw new Error(data?.error || t("manager.errors.exportFailed"));
      }

      const { error } = await supabase.from("jobs").update({ status: "approved", locked: true }).eq("id", jobId);
      if (error) throw error;

      setInfo(data?.skipped ? t("manager.toasts.approvedSkipped") : t("manager.toasts.approvedAndExported"));
      await load();
    } catch (e) {
      setErr(e?.message || t("manager.errors.approveFailed"));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function unlock(jobId) {
    const ok = window.confirm(t("manager.confirm.unlock"));
    if (!ok) return;
    setActionLoadingId(jobId);
    setErr(""); setInfo("");
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "updated", locked: false })
        .eq("id", jobId);
      if (error) throw error;
      setInfo(t("manager.toasts.unlocked"));
      await load();
    } catch (e) {
      setErr(e?.message || t("manager.errors.unlockFailed"));
    } finally {
      setActionLoadingId(null);
    }
  }

  // Payroll CSV: one row per approved job for the selected employee, scoped
  // to the picked week if any. Hours in decimal so the payroll software can
  // sum directly. Detailed format — easy to re-pivot or trim columns later
  // once we know the exact Desjardins import template.
  function downloadPayrollCsv() {
    if (!selectedEmployee) return;
    const range = weekFilterRange(weekFilter);
    const rows = jobs.filter((j) => {
      if (j.user_id !== selectedEmployee.id) return false;
      if (j.status !== "approved") return false;
      if (range && (j.job_date < range.start || j.job_date > range.end)) return false;
      return true;
    });

    const employee = profiles.get(selectedEmployee.id);
    const header = [
      "employee_name",
      "employee_email",
      "employee_phone",
      "ccq_number",
      "week_iso",
      "job_date",
      "weekday",
      "ot",
      "depart",
      "arrivee",
      "fin",
      "hours_decimal",
      "hours_hhmm",
      "km",
    ];

    function decimalHours(depart, fin) {
      if (!depart || !fin) return 0;
      const [dh, dm] = String(depart).slice(0, 5).split(":").map(Number);
      const [fh, fm] = String(fin).slice(0, 5).split(":").map(Number);
      if ([dh, dm, fh, fm].some((n) => Number.isNaN(n))) return 0;
      let mins = fh * 60 + fm - (dh * 60 + dm);
      if (mins < 0) mins += 24 * 60;
      return Math.round((mins / 60) * 100) / 100;
    }

    function fmtHHmm(decimal) {
      if (!Number.isFinite(decimal) || decimal <= 0) return "0h00";
      const total = Math.round(decimal * 60);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${h}h${String(m).padStart(2, "0")}`;
    }

    const csvRows = rows
      .slice()
      .sort((a, b) => (a.job_date < b.job_date ? -1 : a.job_date > b.job_date ? 1 : 0))
      .map((j) => {
        const dec = decimalHours(j.depart, j.fin);
        const km = (Number(j.km_aller ?? 0) || 0) + (Number(j.km_retour ?? 0) || 0);
        return [
          employee?.full_name || "",
          employee?.email || "",
          employee?.phone || "",
          employee?.ccq_number || "",
          dayjs(j.job_date).format("YYYY-[W]WW"),
          j.job_date,
          dayjs(j.job_date).format("dddd"),
          j.ot || "",
          j.depart ? String(j.depart).slice(0, 5) : "",
          j.arrivee ? String(j.arrivee).slice(0, 5) : "",
          j.fin ? String(j.fin).slice(0, 5) : "",
          dec.toFixed(2),
          fmtHHmm(dec),
          km,
        ];
      });

    function esc(v) {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    // BOM so Excel / Desjardins opens UTF-8 with accents correctly; ;-separated
    // because that's what fr-CA spreadsheets default to.
    const csv =
      "﻿" +
      [header.join(";"), ...csvRows.map((r) => r.map(esc).join(";"))].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const weekTag = range ? weekFilter : "all";
    const safeName = (employee?.full_name || "employee").replace(/[^\w-]+/g, "_");
    a.href = url;
    a.download = `sparklog_payroll_${safeName}_${weekTag}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function invokeWithTimeout(name, options, ms = 30000) {
    return await Promise.race([
      supabase.functions.invoke(name, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  }

  async function approveWeekAll() {
    if (!selectedEmployee) return;
    const list = submittedForSelectedWeek;
    if (!list || list.length === 0) return;

    const label =
      selectedWeekKey === "latest"
        ? t("manager.confirm.selectedPeriod")
        : `${t("manager.weekShort")} ${dayjs(list[0].job_date).isoWeek()} (${dayjs(list[0].job_date).startOf("isoWeek").format("DD MMM")} → ${dayjs(list[0].job_date).startOf("isoWeek").endOf("isoWeek").format("DD MMM YYYY")})`;

    const ok = window.confirm(t("manager.confirm.approveWeek", { name: selectedEmployee.name, label, count: list.length }));
    if (!ok) return;

    const actionKey = `week:${selectedWeekKey === "latest" ? "latest" : selectedWeekKey}`;
    setActionLoadingId(actionKey);
    setErr(""); setInfo("");

    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("manager.errors.noSession"));

      // One invoke for the whole batch — the Edge Function fans out to
      // Apps Script in a single POST and updates all DB rows at once.
      const { data, error: fnErr } = await invokeWithTimeout(
        "push_approved_batch",
        {
          body: { job_ids: list.map((j) => j.id) },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        60000
      );
      if (fnErr) throw fnErr;
      if (data?.ok !== true) {
        throw new Error(data?.error || t("manager.errors.approveWeekFailed"));
      }

      const approvedCount = Number(data?.exported || 0);
      const skippedCount = Number(data?.skipped || 0);

      setInfo(
        skippedCount > 0
          ? t("manager.toasts.approvedManySkipped", { count: approvedCount, skipped: skippedCount })
          : t("manager.toasts.approvedManyExported", { count: approvedCount })
      );
      await load();
    } catch (e) {
      setErr(e?.message || t("manager.errors.approveWeekFailed"));
    } finally {
      setActionLoadingId(null);
    }
  }

  function renderJobCard(j) {
    const employee = profiles.get(j.user_id);
    const employeeName = employee?.full_name || employee?.email || `User ${String(j.user_id).slice(0, 8)}…`;

    const d1 = makeDayjsFromJob(j.job_date, j.depart);
    const d2 = makeDayjsFromJob(j.job_date, j.fin);
    const totalHours = hoursBetween(d1, d2);
    const totalLabel = formatHours(totalHours);

    const kmA = Number(j.km_aller ?? 0) || 0;
    const kmR = Number(j.km_retour ?? 0) || 0;
    const kmLabel = kmA + kmR;

    const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";
    const canApprove = j.status === "submitted";

    return (
      <Card key={j.id}>
        <CardContent className="p-3">
          {/* Mobile: stacked. Desktop: single-row inline list. */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
            {/* OT + date */}
            <div className="text-sm font-bold md:w-36 md:shrink-0">
              {t("common.otLabel")}: {j.ot} • {dayjs(j.job_date).format("DD MMM")}
            </div>

            {/* Employee · phone · email — one line, no labels.
                Phone is a tel: link, email is a mailto: link. */}
            <div
              className="text-xs text-muted-foreground md:min-w-0 md:flex-1 md:truncate"
              title={[employee?.phone, employee?.email].filter(Boolean).join(" • ")}
            >
              <span className="font-semibold text-foreground">{employeeName}</span>
              {employee?.phone ? (
                <>
                  {" • "}
                  <a
                    href={`tel:${String(employee.phone).replace(/[^+\d]/g, "")}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {employee.phone}
                  </a>
                </>
              ) : null}
              {employee?.email ? (
                <>
                  {" • "}
                  <a
                    href={`mailto:${employee.email}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {employee.email}
                  </a>
                </>
              ) : null}
            </div>

            {/* Metric pills */}
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                {t("history.totalLabel")}: <b>{totalLabel}</b>
              </span>
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                {t("history.km")}: <b>{kmLabel}</b>
              </span>
            </div>

            {/* Status badge */}
            <Badge variant={statusBadgeVariant(j.status)} className="uppercase tracking-wide">
              {t(`status.${j.status}`)}
            </Badge>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-1.5">
              {canApprove && (
                <Button size="sm" disabled={actionLoadingId === j.id} onClick={() => approve(j.id)}>
                  {actionLoadingId === j.id ? t("common.working") : t("manager.approve")}
                </Button>
              )}
              {j.locked === true && j.status !== "approved" && (
                <Button size="sm" variant="secondary" disabled={actionLoadingId === j.id} onClick={() => unlock(j.id)}>
                  {actionLoadingId === j.id ? t("common.working") : t("manager.unlock")}
                </Button>
              )}
            </div>

            {/* Updated — pushed to the right on desktop */}
            <div className="text-xs text-muted-foreground md:ml-auto">
              {updatedLabel}
            </div>
          </div>

          {/* Times — always visible as a subtle second line */}
          <div className="mt-1.5 text-xs text-muted-foreground">
            {t("history.depart")}: {fmtTimeHHmm(j.depart)} • {t("history.arrival")}: {fmtTimeHHmm(j.arrivee)} • {t("history.end")}: {fmtTimeHHmm(j.fin)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const bulkBusy = typeof actionLoadingId === "string" && actionLoadingId.startsWith("week:");

  return (
    <AppShell>
      <div className="space-y-3">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                {t("manager.counts.all")}: <b>{counts.all}</b>
              </span>
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                {t("manager.counts.saved")}: <b>{counts.saved}</b>
              </span>
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                {t("manager.counts.submitted")}: <b>{counts.submitted}</b>
              </span>
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                {t("manager.counts.approved")}: <b>{counts.approved}</b>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="all">{t("manager.filters.allEmployees")}</option>
                {employeeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </Select>

              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">{t("manager.filters.allStatuses")}</option>
                <option value="saved">{t("status.saved")}</option>
                <option value="submitted">{t("status.submitted")}</option>
                <option value="approved">{t("status.approved")}</option>
              </Select>

              <Input
                type="week"
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                title={t("manager.filters.weekTitle")}
              />

              <Input
                value={searchLive}
                onChange={(e) => setSearchLive(e.target.value)}
                placeholder={t("manager.filters.searchPlaceholder")}
              />

              {weekFilter && (
                <Button type="button" variant="secondary" onClick={() => setWeekFilter("")}>
                  {t("manager.filters.clearWeek")}
                </Button>
              )}
            </div>

            {selectedEmployee && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {t("manager.selectedEmployee")}: <b className="text-foreground">{selectedEmployee.name}</b>
                    {selectedEmployee.phone ? <> • {t("manager.phone")}: <b className="text-foreground">{selectedEmployee.phone}</b></> : null}
                    {selectedEmployee.email ? <> • {t("manager.email")}: <b className="text-foreground">{selectedEmployee.email}</b></> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <span>CCQ#:</span>
                    <Input
                      value={profiles.get(selectedEmployee.id)?.ccq_number || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setProfiles((prev) => {
                          const next = new Map(prev);
                          const p = next.get(selectedEmployee.id) || { id: selectedEmployee.id };
                          next.set(selectedEmployee.id, { ...p, ccq_number: v });
                          return next;
                        });
                      }}
                      onBlur={async (e) => {
                        const v = e.target.value.trim() || null;
                        const { error } = await supabase
                          .from("profiles")
                          .update({ ccq_number: v })
                          .eq("id", selectedEmployee.id);
                        if (error) setErr(error.message);
                        else setInfo("CCQ# saved.");
                      }}
                      placeholder="—"
                      className="h-7 w-28 text-xs"
                    />
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button asChild size="sm">
                    <Link to={`/week?employee=${selectedEmployee.id}`}>{t("nav.week")}</Link>
                  </Button>

                  <Select
                    value={weekOptions.length === 0 ? "latest" : selectedWeekKey}
                    onChange={(e) => setSelectedWeekKey(e.target.value)}
                    disabled={weekOptions.length === 0}
                    className="max-w-xs"
                  >
                    {weekOptions.length === 0 ? (
                      <option value="latest">{t("manager.noSubmittedWeeks")}</option>
                    ) : (
                      weekOptions.map((w) => (
                        <option key={w.key} value={w.key}>
                          {t("manager.weekShort")} {w.start.isoWeek()} • {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")} ({w.count})
                        </option>
                      ))
                    )}
                  </Select>

                  <Button
                    type="button"
                    variant="success"
                    onClick={approveWeekAll}
                    disabled={bulkBusy || submittedForSelectedWeek.length === 0 || weekOptions.length === 0}
                  >
                    {bulkBusy ? t("common.working") : t("manager.approveWeek", { count: submittedForSelectedWeek.length })}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadPayrollCsv}
                    disabled={!selectedEmployee}
                    title={t("manager.downloadCsvTitle")}
                  >
                    {t("manager.downloadCsv")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {loading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {info}
          </div>
        )}

        {!loading && employeeId !== "all" && split && (
          <>
            {/* Three small standalone header cards, above the columns */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-bold">
                {t("manager.savedSection")}
                <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{split.saved.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-bold">
                {t("manager.submittedSection")}
                <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{split.submitted.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-bold">
                {t("status.approved")}
                <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{split.approved.length}</span>
              </div>
            </div>

            {/* Three columns of job cards (no inner headers) */}
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
              <div className="flex flex-col gap-2 self-start">
                {split.saved.map(renderJobCard)}
              </div>
              <div className="flex flex-col gap-2 self-start">
                {split.submitted.map(renderJobCard)}
              </div>
              <div className="flex flex-col gap-2 self-start">
                {split.approved.map(renderJobCard)}
              </div>
            </div>
          </>
        )}

        {!loading && employeeId === "all" && (
          <div className="flex flex-col gap-2 self-start">
            {filtered.map(renderJobCard)}
            {filtered.length === 0 && (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("manager.noResults")}</CardContent></Card>
            )}
          </div>
        )}

        {!loading && hasMore && (
          <div className="flex justify-center pt-2">
            <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? t("common.loading") : t("manager.loadMore", { loaded: jobs.length })}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
