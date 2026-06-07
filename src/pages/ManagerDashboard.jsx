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
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
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
        .select("id, role, full_name, phone, email");
      if (profErr) throw profErr;

      const m = new Map();
      (profileRows || []).forEach((p) => m.set(p.id, p));

      setProfiles(m);
      setJobs(jobRows || []);
      setHasMore((jobRows || []).length === PAGE_SIZE);
      await loadCounts();
    } catch (e) {
      setErr(e?.message || "Failed to load manager.");
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
      setErr(e?.message || "Failed to load more.");
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
    for (const j of filtered) {
      if (j.status === "saved") saved.push(j);
      if (j.status === "submitted") submitted.push(j);
    }
    return { saved, submitted };
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
      if (!job) throw new Error("Job not found in list.");

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No session token (manager). Please re-login.");

      const identity = getEmployeeIdentity(job.user_id);

      const { data, error: fnErr } = await supabase.functions.invoke("push_approved_to_sheet", {
        body: { job_id: jobId, ...identity },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (fnErr) throw fnErr;
      if (data?.ok !== true && !data?.skipped) {
        throw new Error(data?.error || "Export to Google Sheet failed.");
      }

      const { error } = await supabase.from("jobs").update({ status: "approved", locked: true }).eq("id", jobId);
      if (error) throw error;

      setInfo(data?.skipped ? "Approved. Export skipped (already exported)." : "Approved and exported.");
      await load();
    } catch (e) {
      setErr(e?.message || "Approve failed.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function unlock(jobId) {
    const ok = window.confirm("Unlock this job so the employee can edit it?");
    if (!ok) return;
    setActionLoadingId(jobId);
    setErr(""); setInfo("");
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "updated", locked: false })
        .eq("id", jobId);
      if (error) throw error;
      setInfo("Job unlocked. Employee can now edit it.");
      await load();
    } catch (e) {
      setErr(e?.message || "Unlock failed.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function approveWeekAll() {
    if (!selectedEmployee) return;
    const list = submittedForSelectedWeek;
    if (!list || list.length === 0) return;

    const label =
      selectedWeekKey === "latest"
        ? "the selected period"
        : `Week ${dayjs(list[0].job_date).isoWeek()} (${dayjs(list[0].job_date).startOf("isoWeek").format("DD MMM")} → ${dayjs(list[0].job_date).startOf("isoWeek").endOf("isoWeek").format("DD MMM YYYY")})`;

    const ok = window.confirm(`Approve ALL submitted jobs for ${selectedEmployee.name} in ${label}?\n\nCount: ${list.length}`);
    if (!ok) return;

    const actionKey = `week:${selectedWeekKey === "latest" ? "latest" : selectedWeekKey}`;
    setActionLoadingId(actionKey);
    setErr(""); setInfo("");

    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No session token (manager). Please re-login.");

      let approvedCount = 0;
      let skippedCount = 0;

      const identity = getEmployeeIdentity(selectedEmployee.id);

      for (const j of list) {
        const { data, error: fnErr } = await supabase.functions.invoke("push_approved_to_sheet", {
          body: { job_id: j.id, ...identity },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (fnErr) throw fnErr;
        if (data?.ok !== true && !data?.skipped) {
          throw new Error(data?.error || `Export failed for OT ${j.ot} (${j.job_date}).`);
        }

        const { error } = await supabase.from("jobs").update({ status: "approved", locked: true }).eq("id", j.id);
        if (error) throw error;

        approvedCount += 1;
        if (data?.skipped) skippedCount += 1;
      }

      setInfo(
        skippedCount > 0
          ? `Approved ${approvedCount} job(s). Export skipped for ${skippedCount} (already exported).`
          : `Approved ${approvedCount} job(s) and exported.`
      );
      await load();
    } catch (e) {
      setErr(e?.message || "Approve week failed.");
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
        <CardContent className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold">
                  OT: {j.ot} • {dayjs(j.job_date).format("DD MMM")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                    Total: <b>{totalLabel}</b>
                  </span>
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                    KM: <b>{kmLabel}</b>
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Employee: <b className="text-foreground">{employeeName}</b>
                {employee?.phone ? <> • Phone: <b className="text-foreground">{employee.phone}</b></> : null}
                {employee?.email ? <> • Email: <b className="text-foreground">{employee.email}</b></> : null}
              </div>

              <div className="text-xs text-muted-foreground">
                Depart: {fmtTimeHHmm(j.depart)} • Arrival: {fmtTimeHHmm(j.arrivee)} • End: {fmtTimeHHmm(j.fin)}
              </div>
            </div>

            <div className="ml-auto grid justify-items-end gap-2">
              <Badge variant={statusBadgeVariant(j.status)} className="uppercase tracking-wide">
                {j.status}
              </Badge>

              {canApprove && (
                <Button size="sm" disabled={actionLoadingId === j.id} onClick={() => approve(j.id)}>
                  {actionLoadingId === j.id ? "Working…" : "Approve"}
                </Button>
              )}

              {j.locked === true && j.status !== "approved" && (
                <Button size="sm" variant="secondary" disabled={actionLoadingId === j.id} onClick={() => unlock(j.id)}>
                  {actionLoadingId === j.id ? "Working…" : "Unlock"}
                </Button>
              )}

              <div className="text-xs text-muted-foreground">
                Locked: <b className="text-foreground">{j.locked ? "true" : "false"}</b>
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Updated: {updatedLabel}</div>
        </CardContent>
      </Card>
    );
  }

  const bulkBusy = typeof actionLoadingId === "string" && actionLoadingId.startsWith("week:");

  return (
    <AppShell title="Manager">
      <div className="space-y-3">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                All: <b>{counts.all}</b>
              </span>
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                Saved: <b>{counts.saved}</b>
              </span>
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                Submitted: <b>{counts.submitted}</b>
              </span>
              <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                Approved: <b>{counts.approved}</b>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="all">All employees</option>
                {employeeOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </Select>

              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="saved">saved</option>
                <option value="submitted">submitted</option>
                <option value="approved">approved</option>
              </Select>

              <Input
                type="week"
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                title="Filter by ISO week"
              />

              <Input
                value={searchLive}
                onChange={(e) => setSearchLive(e.target.value)}
                placeholder="Search OT / date / employee…"
              />

              {weekFilter && (
                <Button type="button" variant="secondary" onClick={() => setWeekFilter("")}>
                  Clear week
                </Button>
              )}
            </div>

            {selectedEmployee && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="text-xs text-muted-foreground">
                  Selected employee: <b className="text-foreground">{selectedEmployee.name}</b>
                  {selectedEmployee.phone ? <> • Phone: <b className="text-foreground">{selectedEmployee.phone}</b></> : null}
                  {selectedEmployee.email ? <> • Email: <b className="text-foreground">{selectedEmployee.email}</b></> : null}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button asChild size="sm">
                    <Link to={`/week?employee=${selectedEmployee.id}`}>Week</Link>
                  </Button>

                  <Select
                    value={weekOptions.length === 0 ? "latest" : selectedWeekKey}
                    onChange={(e) => setSelectedWeekKey(e.target.value)}
                    disabled={weekOptions.length === 0}
                    className="max-w-xs"
                  >
                    {weekOptions.length === 0 ? (
                      <option value="latest">No submitted weeks</option>
                    ) : (
                      weekOptions.map((w) => (
                        <option key={w.key} value={w.key}>
                          Week {w.start.isoWeek()} • {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")} ({w.count})
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
                    {bulkBusy ? "Working…" : `Approve week (${submittedForSelectedWeek.length})`}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {loading && <Card><CardContent className="p-4 text-sm">Loading…</CardContent></Card>}
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
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-bold">
                Saved
                <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{split.saved.length}</span>
              </div>
              {split.saved.map(renderJobCard)}
              {split.saved.length === 0 && (
                <Card className="border-dashed"><CardContent className="p-4 text-sm text-muted-foreground">No saved jobs.</CardContent></Card>
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-bold">
                Submitted
                <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{split.submitted.length}</span>
              </div>
              {split.submitted.map(renderJobCard)}
              {split.submitted.length === 0 && (
                <Card className="border-dashed"><CardContent className="p-4 text-sm text-muted-foreground">No submitted jobs.</CardContent></Card>
              )}
            </div>
          </div>
        )}

        {!loading && employeeId === "all" && (
          <div className="grid gap-2">
            {filtered.map(renderJobCard)}
            {filtered.length === 0 && (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">No results.</CardContent></Card>
            )}
          </div>
        )}

        {!loading && hasMore && (
          <div className="flex justify-center pt-2">
            <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : `Load more (${jobs.length} loaded)`}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
