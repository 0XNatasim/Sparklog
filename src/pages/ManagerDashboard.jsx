import React, { useEffect, useMemo, useState } from "react";
import { Image, ImageOff, Radio, TriangleAlert } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { formatHM } from "../lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { statusBadgeVariant } from "@/lib/status";
import { useT } from "@/lib/use-t";
import { cn, withRetry } from "@/lib/utils";
import { jobCodeTintClass } from "@/lib/job-code";
import { dateBandMap, lastOvertimeJobIds } from "@/lib/timesheet-layout";
import { anomaliesForJobs, anomalyLimitsFromSettings, detectJobAnomalies } from "@/lib/job-anomalies";
import { monthlyReportPeriod } from "@/lib/monthly-report-period";
import LiveCrew from "@/components/LiveCrew";
import WeekSnapshot from "@/components/WeekSnapshot";
import { dayFirstTripUnpaidMinutes, getKilometreBreakdown, minutesBetween } from "@/lib/payroll-calculations";
import JobCaptureIcons from "@/components/JobCaptureIcons";
import { useConfirmDialog } from "@/components/ConfirmDialog";
import { addCalendarDays, companyDate } from "@/lib/company-time";
import { QUERY_BUDGETS, shouldLoadAllMatchingManagerJobs } from "@/lib/query-budgets";

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

// CCQ week: Sunday → Saturday, keyed by the Saturday that ends it (matches the CCQ
// calendar and the payroll engine's Saturday week-ending). `start` is the Sunday,
// `end` the Saturday, `key` the Saturday as YYYY-MM-DD.
function ccqWeek(dateStr) {
  const d = dayjs(dateStr);
  const end = d.add((6 - d.day() + 7) % 7, "day"); // advance to this week's Saturday
  const start = end.subtract(6, "day");            // Sunday
  return { key: end.format("YYYY-MM-DD"), start, end };
}
function weekKeyFromDate(dateStr) {
  return ccqWeek(dateStr).key;
}

const ANOMALY_COLUMNS = "id, user_id, job_date, status, ot, depart, arrivee, fin, started_at, ended_at, km_total, km_aller, km_retour, overtime_evidence_captured";

const NOTIFICATION_FILTERS = ["overtime", "meals", "parking"];

// Two Gestion pages share this component's state (jobs, claims, evidence):
//   view="timesheet" → Feuilles  (#/manager/timesheets)
//   view="receipts"  → Justificatifs (#/manager/receipts)
// Employee, status and day live in the URL so a timesheet view can be bookmarked or shared.
export default function ManagerDashboard({ view = "timesheet" }) {
  const PAGE_SIZE = QUERY_BUDGETS.managerJobsPage;
  const t = useT();
  const [confirm, confirmDialog] = useConfirmDialog();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const activeSection = view === "receipts" ? "notifications" : "timesheet";
  const requestedFilter = searchParams.get("filter");
  const [notificationFilter, setNotificationFilter] = useState(NOTIFICATION_FILTERS.includes(requestedFilter) ? requestedFilter : "all");
  const [focusedEvidence, setFocusedEvidence] = useState(null);
  const [overtimeJobs, setOvertimeJobs] = useState([]);
  const [overtimeEvidence, setOvertimeEvidence] = useState(new Map());
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [visibleProof, setVisibleProof] = useState(new Set());
  const [evidenceImageLoading, setEvidenceImageLoading] = useState("");
  const [parkingJobs, setParkingJobs] = useState([]);
  const [parkingReceipts, setParkingReceipts] = useState(new Map());
  const [parkingLoading, setParkingLoading] = useState(false);
  const [visibleParkingReceipts, setVisibleParkingReceipts] = useState(new Set());
  const [parkingImageLoading, setParkingImageLoading] = useState("");
  const [notificationMealJobs, setNotificationMealJobs] = useState([]);
  const [notificationMealsLoading, setNotificationMealsLoading] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [mealJobIds, setMealJobIds] = useState(new Set());
  const [profiles, setProfiles] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState({ all: 0, saved: 0, submitted: 0, approved: 0 });
  const [anomalies, setAnomalies] = useState([]);
  const [anomaliesFailed, setAnomaliesFailed] = useState(false);
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [employeeId, setEmployeeId] = useState(searchParams.get("emp") || "all");
  const [statusFilter, setStatusFilter] = useState(["saved", "submitted", "approved"].includes(searchParams.get("status")) ? searchParams.get("status") : "all");
  const [dayFilter, setDayFilter] = useState(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") || "") ? searchParams.get("date") : "");
  // Phone only: which of the three status piles is shown when one employee is selected.
  const [mobileStatus, setMobileStatus] = useState("submitted");
  const [searchLive, setSearchLive] = useState("");
  const [search, setSearch] = useState("");
  const [yesterdaySnapshotOpen, setYesterdaySnapshotOpen] = useState(false);
  const [weekSnapshotOpen, setWeekSnapshotOpen] = useState(false);
  const [lastWeekSnapshotOpen, setLastWeekSnapshotOpen] = useState(false);

  const [selectedWeekKey, setSelectedWeekKey] = useState("latest");

  const setSearchDebounced = useMemo(
    () => debounce((v) => setSearch(v), 250),
    []
  );

  useEffect(() => {
    setSearchDebounced(searchLive);
  }, [searchLive, setSearchDebounced]);

  // Mirror the filters into the URL (replace, so Back does not step through every keystroke).
  useEffect(() => {
    if (view !== "timesheet") return;
    const next = new URLSearchParams(searchParams);
    const put = (key, value, empty) => (value && value !== empty ? next.set(key, value) : next.delete(key));
    put("emp", employeeId, "all");
    put("status", statusFilter, "all");
    put("date", dayFilter, "");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, employeeId, statusFilter, dayFilter]);

  useEffect(() => {
    if (view !== "receipts") return;
    const next = new URLSearchParams(searchParams);
    if (notificationFilter === "all") next.delete("filter"); else next.set("filter", notificationFilter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, notificationFilter]);

  function buildJobsQuery() {
    let q = supabase
      .from("jobs")
      .select("*")
      .order("job_date", { ascending: false })
      .order("id", { ascending: false });
    if (employeeId !== "all") q = q.eq("user_id", employeeId);
    // When an employee is selected the UI splits into Saved / Submitted /
    // Approved columns, so ignore the status dropdown there — otherwise
    // the other two columns are always empty.
    if (employeeId === "all" && statusFilter !== "all") q = q.eq("status", statusFilter);
    if (dayFilter) q = q.eq("job_date", dayFilter);
    return q;
  }

  async function loadCounts() {
    const { data } = await withRetry(() => supabase.rpc("manager_job_counts", {
      p_employee_id: employeeId === "all" ? null : employeeId,
      p_job_date: dayFilter || null,
    }).single(), 12000);
    setCounts({
      all: Number(data?.all_count) || 0,
      saved: Number(data?.saved_count) || 0,
      submitted: Number(data?.submitted_count) || 0,
      approved: Number(data?.approved_count) || 0,
    });
  }

  // Anomalies across every submitted job (not just the loaded page), compared with the
  // approved jobs of the same employees and dates.
  async function loadAnomalies() {
    try {
      const { data: submitted } = await withRetry(() => supabase
        .from("jobs")
        .select(ANOMALY_COLUMNS)
        .eq("status", "submitted")
        .order("job_date", { ascending: false })
        .limit(QUERY_BUDGETS.anomalySubmittedJobs), 12000);
      const rows = submitted || [];
      const userIds = [...new Set(rows.map((row) => row.user_id))];
      const dates = [...new Set(rows.map((row) => row.job_date))];
      const { data: approved } = rows.length
        ? await withRetry(() => supabase
          .from("jobs")
          .select(ANOMALY_COLUMNS)
          .eq("status", "approved")
          .in("user_id", userIds)
          .in("job_date", dates)
          .limit(QUERY_BUDGETS.anomalyApprovedPeers), 12000)
        : { data: [] };
      // select("*") so the scan keeps working with default limits if the threshold
      // columns are not deployed yet.
      const { data: settings } = await supabase.from("company_time_settings").select("*").eq("id", true).maybeSingle();
      // Employees with "first trip unpaid" reach the 8 h overtime-proof threshold on paid time.
      const { data: tripUnpaid } = userIds.length
        ? await supabase.from("profiles").select("id").eq("first_trip_unpaid", true).in("id", userIds)
        : { data: [] };
      setAnomalies(detectJobAnomalies(
        [...rows, ...(approved || [])],
        anomalyLimitsFromSettings(settings),
        { firstTripUnpaidUsers: new Set((tripUnpaid || []).map((row) => row.id)) },
      ));
      setAnomaliesFailed(false);
    } catch {
      setAnomaliesFailed(true);
    }
  }

  async function load() {
    setErr(""); setInfo("");
    setLoading(true);
    loadAnomalies();
    try {
      const loadEveryMatch = shouldLoadAllMatchingManagerJobs(employeeId, dayFilter);
      const jobRows = [];
      let pageStart = 0;
      let page = [];
      do {
        const result = await withRetry(
          () => buildJobsQuery().range(pageStart, pageStart + PAGE_SIZE - 1),
          12000
        );
        page = result.data || [];
        jobRows.push(...page);
        pageStart += PAGE_SIZE;
      } while (loadEveryMatch && page.length === PAGE_SIZE);

      // Only the meal indicators for the jobs actually on screen — no full-table scan.
      const jobIds = jobRows.map((j) => j.id);
      const { data: mealRows } = jobIds.length
        ? await withRetry(() => supabase.from("meal_claims").select("job_id").in("job_id", jobIds), 12000)
        : { data: [] };

      setJobs(jobRows);
      setMealJobIds(new Set((mealRows || []).map((claim) => claim.job_id)));
      setHasMore(!loadEveryMatch && page.length === PAGE_SIZE);
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
      const cursor = jobs[jobs.length - 1];
      if (!cursor) return;
      const { data, error } = await buildJobsQuery()
        .or(`job_date.lt.${cursor.job_date},and(job_date.eq.${cursor.job_date},id.lt.${cursor.id})`)
        .limit(PAGE_SIZE);
      if (error) throw error;
      const pageIds = (data || []).map((row) => row.id);
      const { data: mealRows } = pageIds.length
        ? await withRetry(() => supabase.from("meal_claims").select("job_id").in("job_id", pageIds), 12000)
        : { data: [] };
      setJobs((prev) => [...prev, ...(data || [])]);
      setMealJobIds((current) => new Set([...current, ...(mealRows || []).map((claim) => claim.job_id)]));
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
  }, [employeeId, statusFilter, dayFilter]);

  // The roster changes rarely, so load it once rather than on every filter change
  // (that kept re-pulling the whole profiles table into the per-selection burst).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await withRetry(
          () => supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number, is_paused, show_on_boards, first_trip_unpaid"),
          12000
        );
        if (!cancelled) setProfiles((current) => {
          const next = new Map(current);
          (data || []).forEach((p) => next.set(p.id, p));
          return next;
        });
      } catch {
        // Names fall back to the id fragment; non-fatal, and load() surfaces real errors.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!focusedJobId) return;
    supabase.from("jobs").select("user_id").eq("id", focusedJobId).single().then(({ data }) => {
      if (data?.user_id) setEmployeeId(data.user_id);
    });
    supabase.from("overtime_evidence").select("storage_path, daily_minutes, created_at").eq("job_id", focusedJobId).maybeSingle().then(async ({ data }) => {
      if (!data) return;
      const { data: signed } = await supabase.storage.from("overtime-evidence").createSignedUrl(data.storage_path, 600);
      setFocusedEvidence({ ...data, imageUrl: signed?.signedUrl || "" });
    });
  }, [focusedJobId]);

  useEffect(() => {
    if (activeSection !== "notifications") return;
    let cancelled = false;
    async function loadOvertime() {
      setOvertimeLoading(true);
      setErr("");
      try {
        const { data: evidenceRows, error: evidenceError } = await withRetry(
          () => supabase.from("overtime_evidence").select("job_id, storage_path, daily_minutes, created_at").order("created_at", { ascending: false }).limit(QUERY_BUDGETS.reviewQueue),
          12000
        );
        if (evidenceError) throw evidenceError;
        const jobIds = (evidenceRows || []).map((row) => row.job_id);
        const { data: jobRows, error: jobError } = jobIds.length
          ? await withRetry(() => supabase.from("jobs").select("*").in("id", jobIds), 12000)
          : { data: [], error: null };
        if (jobError) throw jobError;
        const order = new Map(jobIds.map((id, index) => [id, index]));
        const orderedJobs = (jobRows || []).sort((a, b) => order.get(a.id) - order.get(b.id));
        const missingProfileIds = [...new Set(orderedJobs.map((job) => job.user_id).filter((id) => !profiles.has(id)))];
        if (missingProfileIds.length) {
          const { data: profileRows, error: profileError } = await withRetry(
            () => supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number, first_trip_unpaid").in("id", missingProfileIds),
            12000
          );
          if (profileError) throw profileError;
          if (!cancelled) setProfiles((current) => {
            const next = new Map(current);
            (profileRows || []).forEach((profile) => next.set(profile.id, profile));
            return next;
          });
        }
        if (!cancelled) {
          setOvertimeJobs(orderedJobs);
          const evidenceMap = new Map((evidenceRows || []).map((row) => [row.job_id, row]));
          setOvertimeEvidence(evidenceMap);
          // Coming from a manager notification (?job=…): auto-open that job's
          // proof and load its screenshot so the panel is not empty.
          const focused = focusedJobId ? evidenceMap.get(focusedJobId) : null;
          if (focused) {
            setVisibleProof(new Set([focusedJobId]));
            if (focused.storage_path) {
              const { data: signed } = await supabase.storage.from("overtime-evidence").createSignedUrl(focused.storage_path, 600);
              if (!cancelled && signed?.signedUrl) {
                setOvertimeEvidence((current) => {
                  const next = new Map(current);
                  next.set(focusedJobId, { ...focused, imageUrl: signed.signedUrl });
                  return next;
                });
              }
            }
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || t("manager.overtime.failedLoad"));
      } finally {
        if (!cancelled) setOvertimeLoading(false);
      }
    }
    loadOvertime();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, focusedJobId]);

  useEffect(() => {
    if (activeSection !== "notifications") return;
    let cancelled = false;
    async function loadParking() {
      setParkingLoading(true);
      setErr("");
      try {
        const { data: receiptRows, error: receiptError } = await withRetry(
          () => supabase.from("parking_receipts").select("job_id, user_id, job_date, storage_path, amount, status, created_at").order("created_at", { ascending: false }).limit(QUERY_BUDGETS.reviewQueue),
          12000
        );
        if (receiptError) throw receiptError;
        const jobIds = (receiptRows || []).map((row) => row.job_id);
        const { data: jobRows, error: jobError } = jobIds.length
          ? await withRetry(() => supabase.from("jobs").select("*").in("id", jobIds), 12000)
          : { data: [], error: null };
        if (jobError) throw jobError;
        const order = new Map(jobIds.map((id, index) => [id, index]));
        const orderedJobs = (jobRows || []).sort((a, b) => order.get(a.id) - order.get(b.id));
        const missingProfileIds = [...new Set(orderedJobs.map((job) => job.user_id).filter((id) => !profiles.has(id)))];
        if (missingProfileIds.length) {
          const { data: profileRows, error: profileError } = await withRetry(
            () => supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number, first_trip_unpaid").in("id", missingProfileIds),
            12000
          );
          if (profileError) throw profileError;
          if (!cancelled) setProfiles((current) => {
            const next = new Map(current);
            (profileRows || []).forEach((profile) => next.set(profile.id, profile));
            return next;
          });
        }
        if (!cancelled) {
          setParkingJobs(orderedJobs);
          setParkingReceipts(new Map((receiptRows || []).map((row) => [row.job_id, row])));
        }
      } catch (error) {
        if (!cancelled) setErr(error?.message || t("manager.parking.failedLoad"));
      } finally {
        if (!cancelled) setParkingLoading(false);
      }
    }
    loadParking();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "notifications") return;
    let cancelled = false;
    async function loadNotificationMeals() {
      setNotificationMealsLoading(true);
      try {
        const { data: claims } = await withRetry(
          () => supabase.from("meal_claims").select("job_id, created_at").order("created_at", { ascending: false }).limit(QUERY_BUDGETS.reviewQueue), 12000
        );
        const ids = [...new Set((claims || []).map((claim) => claim.job_id))];
        const { data: rows } = ids.length
          ? await withRetry(() => supabase.from("jobs").select("*").in("id", ids), 12000)
          : { data: [] };
        const order = new Map(ids.map((id, index) => [id, index]));
        const orderedRows = (rows || []).sort((a, b) => order.get(a.id) - order.get(b.id));
        const missingProfileIds = [...new Set(orderedRows.map((job) => job.user_id).filter((id) => !profiles.has(id)))];
        const { data: people } = missingProfileIds.length
          ? await withRetry(() => supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number, first_trip_unpaid").in("id", missingProfileIds), 12000)
          : { data: [] };
        if (!cancelled) {
          setNotificationMealJobs(orderedRows);
          setProfiles((current) => new Map([...current, ...(people || []).map((person) => [person.id, person])]));
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || t("manager.errors.failedLoad"));
      } finally {
        if (!cancelled) setNotificationMealsLoading(false);
      }
    }
    loadNotificationMeals();
    return () => { cancelled = true; };
  }, [activeSection]);

  async function ensureEvidenceImage(jobId) {
    const evidence = overtimeEvidence.get(jobId);
    if (evidence?.storage_path && !evidence.imageUrl) {
      setEvidenceImageLoading(jobId);
      try {
        const { data, error } = await supabase.storage.from("overtime-evidence").createSignedUrl(evidence.storage_path, 600);
        if (error) throw error;
        setOvertimeEvidence((current) => {
          const next = new Map(current);
          next.set(jobId, { ...evidence, imageUrl: data?.signedUrl || "" });
          return next;
        });
      } catch (error) {
        setErr(error?.message || t("manager.overtime.imageUnavailable"));
      } finally {
        setEvidenceImageLoading("");
      }
    }
  }

  async function reviewParking(jobId, status) {
    setActionLoadingId(`parking:${jobId}`);
    setErr("");
    try {
      const { error } = await withRetry(
        () => supabase.rpc("review_parking_claim", { p_job_id: jobId, p_decision: status }),
        12000
      );
      if (error) throw error;
      setParkingReceipts((current) => {
        const next = new Map(current);
        next.set(jobId, { ...next.get(jobId), status });
        return next;
      });
    } catch (error) {
      setErr(error?.message || t("manager.errors.failedLoad"));
      await load();
    } finally {
      setActionLoadingId(null);
    }
  }

  // Opening the SMS proof counts as seeing the overtime notification: mark this job's
  // notifications read so they drop off the header bell.
  async function markJobNotificationsRead(jobId) {
    if (!jobId || !user?.id) return;
    const { data: notifs } = await supabase.from("manager_notifications").select("id").eq("job_id", jobId);
    const rows = (notifs || []).map((n) => ({ notification_id: n.id, manager_id: user.id }));
    if (rows.length === 0) return;
    await supabase.from("manager_notification_reads").upsert(rows);
    window.dispatchEvent(new CustomEvent("sparklog:notifications-refresh"));
  }

  async function toggleProof(jobId) {
    const opening = !visibleProof.has(jobId);
    if (opening) { await ensureEvidenceImage(jobId); markJobNotificationsRead(jobId); }
    setVisibleProof((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  async function toggleParkingReceipt(jobId) {
    if (visibleParkingReceipts.has(jobId)) {
      setVisibleParkingReceipts((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
      return;
    }
    const receipt = parkingReceipts.get(jobId);
    if (receipt?.storage_path && !receipt.imageUrl) {
      setParkingImageLoading(jobId);
      const { data } = await supabase.storage.from("parking-receipts").createSignedUrl(receipt.storage_path, 600);
      setParkingReceipts((current) => {
        const next = new Map(current);
        next.set(jobId, { ...receipt, imageUrl: data?.signedUrl || "" });
        return next;
      });
      setParkingImageLoading("");
    }
    setVisibleParkingReceipts((current) => new Set(current).add(jobId));
  }

  useEffect(() => {
    if (!focusedJobId || ![...jobs, ...overtimeJobs].some((job) => job.id === focusedJobId)) return;
    requestAnimationFrame(() => document.getElementById(`job-${focusedJobId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focusedJobId, jobs, overtimeJobs]);

  const employeeOptions = useMemo(() => {
    const arr = [];
    profiles.forEach((p, id) => {
      // Hide inactive employees and anyone opted out of the boards (e.g. the boss).
      if (p?.is_paused || p?.show_on_boards === false) return;
      const label = p?.full_name?.trim() || p?.email?.trim() || `User ${String(id).slice(0, 8)}…`;
      arr.push({ id, label });
    });
    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    // Text search is OT (work-order number) only — employee, status and date each have
    // their own dedicated filter above.
    return jobs.filter((j) => String(j.ot || "").toLowerCase().includes(q));
  }, [jobs, search]);

  // "All employees" timesheet ordering. Approved jobs sink to the bottom as a
  // whole block; within each block the list reads by day (newest first), then
  // by employee, and finally from the earliest to the latest job of the day
  // (by departure time) — so a given employee's same-day jobs always read
  // top-to-bottom in chronological order.
  const sortedAll = useMemo(() => {
    const nameFor = (id) => {
      const p = profiles.get(id);
      return (p?.full_name?.trim() || p?.email?.trim() || String(id)).toLowerCase();
    };
    const approvedRank = (status) => (status === "approved" ? 1 : 0);
    return [...filtered].sort((a, b) => {
      const ra = approvedRank(a.status);
      const rb = approvedRank(b.status);
      if (ra !== rb) return ra - rb;
      if (a.job_date !== b.job_date) return (a.job_date || "") < (b.job_date || "") ? 1 : -1;
      const na = nameFor(a.user_id);
      const nb = nameFor(b.user_id);
      if (na !== nb) return na < nb ? -1 : 1;
      return String(a.depart || "").localeCompare(String(b.depart || ""));
    });
  }, [filtered, profiles]);

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
    // Order each column by day (oldest day first) and, within a day, from the
    // earliest to the latest job (by departure time). This keeps the same-day
    // jobs reading top-to-bottom in chronological order.
    const byDayThenDepart = (a, b) => {
      if (a.job_date !== b.job_date) return (a.job_date || "") < (b.job_date || "") ? -1 : 1;
      return String(a.depart || "").localeCompare(String(b.depart || ""));
    };
    saved.sort(byDayThenDepart);
    submitted.sort(byDayThenDepart);
    approved.sort(byDayThenDepart);
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
      const wk = ccqWeek(j.job_date);
      if (!m.has(wk.key)) m.set(wk.key, { ...wk, count: 0 });
      m.get(wk.key).count += 1;
    }
    return Array.from(m.values()).sort((a, b) => (b.end.isAfter(a.end) ? 1 : -1));
  }, [split]);

  // Group the CCQ weeks under their monthly report period (each ends on the last
  // Saturday of a month), newest period first — laid out like the CCQ calendar.
  const weekGroups = useMemo(() => {
    const groups = new Map();
    for (const w of weekOptions) {
      const rp = monthlyReportPeriod(w.key);
      const pk = rp ? rp.end : w.key;
      if (!groups.has(pk)) groups.set(pk, { periodEnd: pk, weeks: [] });
      groups.get(pk).weeks.push(w);
    }
    return Array.from(groups.values()).sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
  }, [weekOptions]);

  useEffect(() => {
    if (!selectedEmployee || weekOptions.length === 0) {
      setSelectedWeekKey("latest");
      return;
    }
    setSelectedWeekKey(weekOptions[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee?.id]);

  // The stored key can go stale (employee switched while jobs were still loading, or
  // the week was fully approved). A <select> then *displays* the first option while the
  // state points elsewhere, so the button read "(0)". Fall back to the newest week.
  const effectiveWeekKey = useMemo(() => {
    if (weekOptions.length === 0) return "latest";
    return weekOptions.some((w) => w.key === selectedWeekKey) ? selectedWeekKey : weekOptions[0].key;
  }, [weekOptions, selectedWeekKey]);

  const submittedForSelectedWeek = useMemo(() => {
    if (!split || !selectedEmployee) return [];
    if (weekOptions.length === 0) return [];
    return split.submitted.filter((j) => weekKeyFromDate(j.job_date) === effectiveWeekKey);
  }, [split, selectedEmployee, effectiveWeekKey, weekOptions.length]);

  function employeeLabel(userId) {
    const employee = profiles.get(userId);
    return employee?.full_name || employee?.email || `User ${String(userId).slice(0, 8)}…`;
  }

  function describeAnomaly(anomaly) {
    const duration = formatHM((anomaly.minutes || 0) / 60);
    return t(`manager.anomalies.${anomaly.type}`, {
      duration,
      km: anomaly.km,
      ot: anomaly.ot,
      depart: String(anomaly.depart || "").slice(0, 5),
      fin: String(anomaly.fin || "").slice(0, 5),
    });
  }

  // Non-blocking warning: returns "" when the batch is clean, otherwise the text to confirm.
  function anomalyWarning(jobIds) {
    const hits = anomaliesForJobs(anomalies, jobIds);
    if (hits.length === 0) return "";
    const lines = hits.slice(0, 5).map((anomaly) => `• ${employeeLabel(anomaly.userId)} · ${dayjs(anomaly.jobDate).format("DD MMM")} · ${describeAnomaly(anomaly)}`);
    if (hits.length > 5) lines.push("…");
    return t("manager.confirm.anomalies", { count: hits.length, list: lines.join("\n") });
  }

  function openAnomaly(anomaly) {
    const next = new URLSearchParams(searchParams);
    next.set("job", anomaly.jobIds[0]);
    setSearchParams(next);
    setEmployeeId(anomaly.userId);
  }

  function openEmployeeTimesheet(userId, date = companyDate()) {
    setEmployeeId(userId);
    setDayFilter(date);
    setStatusFilter("all");
    setSearchLive("");
    setSearch("");
    setSelectedWeekKey("latest");
    if (searchParams.has("job")) {
      const next = new URLSearchParams(searchParams);
      next.delete("job");
      setSearchParams(next, { replace: true });
    }
  }

  async function approve(jobId) {
    const warning = anomalyWarning([jobId]);
    if (warning && !(await confirm(warning))) return;
    setActionLoadingId(jobId);
    setErr(""); setInfo("");
    try {
      const job = [...jobs, ...overtimeJobs, ...parkingJobs, ...notificationMealJobs].find((x) => x.id === jobId);
      if (!job) throw new Error(t("manager.errors.jobNotFound"));

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error(t("manager.errors.noSession"));

      // Use the same maintained endpoint as weekly approvals. The legacy
      // single-job function can be absent from older deployments, which makes
      // the Functions client return only a generic non-2xx error.
      const { data, error: fnErr } = await invokeWithTimeout("push_approved_batch", {
        body: { job_ids: [jobId] },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (fnErr) throw new Error(await getFunctionErrorMessage(fnErr));
      if (data?.ok !== true) {
        throw new Error(data?.error || t("manager.errors.exportFailed"));
      }

      // Trust the edge fn's ATOMIC per-job result — never force-approve locally (C-2).
      // The fn already sets approved+locked+exported for jobs it exports. A job it could
      // not export because its STATE CHANGED (e.g. the employee edited it → 'updated')
      // must be reloaded and re-reviewed, NOT silently approved+locked.
      //   exported | already_exported → genuinely approved
      //   state_changed | already_claimed | not_found → stale, re-review
      const outcome = Array.isArray(data.results)
        ? data.results.find((r) => r.job_id === jobId)?.outcome
        : (Number(data.exported || 0) >= 1 ? "exported" : "state_changed"); // safe fallback for old fn
      const isApproved = outcome === "exported" || outcome === "already_exported";

      if (isApproved) {
        setInfo(outcome === "already_exported" ? t("manager.toasts.approvedSkipped") : t("manager.toasts.approvedAndExported"));
        const markApproved = (rows) => rows.map((row) => row.id === jobId ? { ...row, status: "approved", locked: true } : row);
        setOvertimeJobs(markApproved);
        setParkingJobs(markApproved);
        setNotificationMealJobs(markApproved);
      } else {
        setErr(t("manager.errors.jobChangedReReview"));
      }
      await load();
    } catch (e) {
      setErr(e?.message || t("manager.errors.approveFailed"));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function unlock(jobId) {
    const ok = await confirm(t("manager.confirm.unlock"));
    if (!ok) return;
    setActionLoadingId(jobId);
    setErr(""); setInfo("");
    try {
      const job = [...jobs, ...overtimeJobs, ...parkingJobs, ...notificationMealJobs]
        .find((row) => row.id === jobId);
      if (!job) throw new Error(t("manager.errors.jobNotFound"));
      const { error } = await withRetry(
        () => supabase.rpc("return_job_for_correction", {
          p_job_id: jobId,
          p_expected_updated_at: job.updated_at || null,
        }),
        12000
      );
      if (error) throw error;
      setInfo(t("manager.toasts.unlocked"));
      await load();
    } catch (e) {
      setErr(e?.message || t("manager.errors.unlockFailed"));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function invokeWithTimeout(name, options, ms = 30000) {
    return await Promise.race([
      supabase.functions.invoke(name, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  }

  async function getFunctionErrorMessage(error) {
    try {
      const payload = await error?.context?.json();
      return payload?.error || payload?.message || error?.message || t("manager.errors.exportFailed");
    } catch {
      return error?.message || t("manager.errors.exportFailed");
    }
  }

  async function approveWeekAll() {
    if (!selectedEmployee) return;
    const list = submittedForSelectedWeek;
    if (!list || list.length === 0) return;

    const wk = ccqWeek(list[0].job_date);
    const label =
      effectiveWeekKey === "latest"
        ? t("manager.confirm.selectedPeriod")
        : `${t("manager.weekShort")} ${wk.start.format("DD MMM")} → ${wk.end.format("DD MMM YYYY")}`;

    const warning = anomalyWarning(list.map((j) => j.id));
    const question = t("manager.confirm.approveWeek", { name: selectedEmployee.name, label, count: list.length });
    const ok = await confirm(warning ? `${question}\n\n${warning}` : question);
    if (!ok) return;

    const actionKey = `week:${effectiveWeekKey}`;
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
      if (fnErr) throw new Error(await getFunctionErrorMessage(fnErr));
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

  // Days (per employee) that total more than 8h of worked time but have NO overtime
  // authorization screenshot on any of that day's jobs. Backstop for jobs entered out
  // of order, where the employee-side prompt can miss the crossing. Return time is not
  // counted (it never creates overtime), matching the payroll engine. For an employee
  // with "first trip unpaid" the day's first Départ→Arrivée trip is not counted either.
  const overtimeDaysMissingEvidence = useMemo(() => {
    const totals = new Map(); // `${user_id}|${job_date}` -> { minutes, hasEvidence, dayJobs }
    for (const j of jobs) {
      const key = `${j.user_id}|${j.job_date}`;
      const acc = totals.get(key) || { minutes: 0, hasEvidence: false, dayJobs: [] };
      acc.minutes += minutesBetween(j.depart, j.fin);
      acc.dayJobs.push(j);
      if (j.overtime_evidence_captured) acc.hasEvidence = true;
      totals.set(key, acc);
    }
    const flagged = new Set();
    for (const [key, v] of totals) {
      const userId = key.slice(0, key.indexOf("|"));
      const unpaidTrip = profiles.get(userId)?.first_trip_unpaid ? dayFirstTripUnpaidMinutes(v.dayJobs) : 0;
      if (v.minutes - unpaidTrip > 480 && !v.hasEvidence) flagged.add(key);
    }
    return flagged;
  }, [jobs, profiles]);

  const overtimeMarkerIds = useMemo(() => lastOvertimeJobIds(jobs), [jobs]);
  const dateBands = useMemo(() => dateBandMap(filtered.map((j) => j.job_date)), [filtered]);

  function renderJobCard(j) {
    const employee = profiles.get(j.user_id);
    const employeeName = employee?.full_name || employee?.email || `User ${String(j.user_id).slice(0, 8)}…`;
    const dayOvertimeNoEvidence = overtimeDaysMissingEvidence.has(`${j.user_id}|${j.job_date}`);

    // Worked hours from the authoritative interval calc, which wraps past
    // midnight (overnight jobs) exactly as the payroll classification does.
    const totalHours = minutesBetween(j.depart, j.fin) / 60;
    const totalLabel = formatHM(totalHours);

    const { totalKm: kmLabel } = getKilometreBreakdown(j);

    const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";
    const canApprove = j.status === "submitted";

    return (
      <Card key={j.id} id={`job-${j.id}`} className={cn(dateBands.get(j.job_date) === 1 && "bg-slate-100 dark:bg-slate-800/70", jobCodeTintClass(j.ot), focusedJobId === j.id && "ring-2 ring-red-500")}>
        <CardContent className="p-3">
          {/* Mobile: stacked. Desktop: single-row inline list. */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
            {/* OT + date */}
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold md:w-44 md:shrink-0">
              <span><span className="text-emerald-700 dark:text-emerald-400">{j.ot}</span> • {dayjs(j.job_date).format("DD MMM")}</span>
              <JobCaptureIcons job={{ ...j, overtime_evidence_captured: overtimeMarkerIds.has(j.id), meal_claim_captured: j.meal_claim_captured || mealJobIds.has(j.id) }} />
              {dayOvertimeNoEvidence && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                  title={t("manager.overtimeNoEvidenceHint")}
                >
                  <TriangleAlert className="h-3 w-3" />{t("manager.overtimeNoEvidence")}
                </span>
              )}
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
          {focusedJobId === j.id && focusedEvidence && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="mb-2 text-sm font-semibold">{t("notifications.evidence")}</div>
              {focusedEvidence.imageUrl && <img src={focusedEvidence.imageUrl} alt={t("notifications.evidenceAlt")} className="max-h-80 w-full rounded-md border object-contain" />}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderNotificationCard(job) {
    const evidence = overtimeEvidence.get(job.id);
    const receipt = parkingReceipts.get(job.id);
    const hasMeal = mealJobIds.has(job.id) || notificationMealJobs.some((mealJob) => mealJob.id === job.id);
    const employee = profiles.get(job.user_id);
    const employeeName = employee?.full_name || employee?.email || `User ${String(job.user_id).slice(0, 8)}…`;
    const totalHours = minutesBetween(job.depart, job.fin) / 60;
    const { totalKm: km } = getKilometreBreakdown(job);
    const isProofVisible = visibleProof.has(job.id);
    const isParkingVisible = visibleParkingReceipts.has(job.id);

    return <Card key={job.id} id={`job-${job.id}`} className={focusedJobId === job.id ? "ring-2 ring-primary" : ""}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-bold"><span>{job.ot} · {dayjs(job.job_date).format("DD MMM YYYY")}</span><JobCaptureIcons job={{ ...job, overtime_evidence_captured: Boolean(evidence), parking_receipt_captured: Boolean(receipt), meal_claim_captured: hasMeal }} /></div>
            <div className="mt-1 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{employeeName}</span>{employee?.phone ? <> · <a className="text-primary hover:underline" href={`tel:${String(employee.phone).replace(/[^+\d]/g, "")}`}>{employee.phone}</a></> : null}{employee?.email ? <> · <a className="text-primary hover:underline" href={`mailto:${employee.email}`}>{employee.email}</a></> : null}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(job.status)} className="uppercase tracking-wide">{t(`status.${job.status}`)}</Badge>
            <div className="flex flex-col gap-2">
              {evidence && <Button type="button" size="sm" variant="outline" onClick={() => toggleProof(job.id)}>{isProofVisible ? t("manager.notifications.hideOvertimeProof") : t("manager.notifications.showOvertimeProof")}</Button>}
              {receipt && <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={parkingImageLoading === job.id} onClick={() => toggleParkingReceipt(job.id)}>{isParkingVisible ? <ImageOff className="mr-1.5 h-4 w-4" /> : <Image className="mr-1.5 h-4 w-4" />}{parkingImageLoading === job.id ? t("common.loading") : isParkingVisible ? t("manager.notifications.hideParkingProof") : t("manager.notifications.showParkingProof")}</Button>
                {receipt.status === "pending" && <><Button type="button" size="sm" variant="secondary" disabled={actionLoadingId === `parking:${job.id}`} onClick={() => reviewParking(job.id, "approved")}>{t("manager.notifications.approveParking")}</Button><Button type="button" size="sm" variant="destructive" disabled={actionLoadingId === `parking:${job.id}`} onClick={() => reviewParking(job.id, "rejected")}>{t("manager.notifications.rejectParking")}</Button></>}
              </div>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.totalLabel")}: <b>{formatHM(totalHours)}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.km")}: <b>{km}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.depart")}: <b>{fmtTimeHHmm(job.depart)}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.arrival")}: <b>{fmtTimeHHmm(job.arrivee)}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.end")}: <b>{fmtTimeHHmm(job.fin)}</b></span>
          {evidence?.daily_minutes ? <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1">{t("manager.overtime.dailyTotal")}: <b>{formatHM(evidence.daily_minutes / 60)}</b></span> : null}
          {receipt ? <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1">{t("manager.parking.amount")}: <b>${Number(receipt.amount || 0).toFixed(2)}</b></span> : null}
          {hasMeal ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">{t("manager.notifications.supper")}: <b>$30.00</b></span> : null}
          {job.status === "submitted" && <Button type="button" size="sm" className="ml-auto" disabled={actionLoadingId === job.id} onClick={() => approve(job.id)}>{actionLoadingId === job.id ? t("common.working") : t("manager.notifications.approveJob")}</Button>}
        </div>
        {isParkingVisible && <div className="rounded-lg border p-3">{receipt?.imageUrl ? <img src={receipt.imageUrl} alt={t("manager.parking.receiptAlt")} className="max-h-[32rem] w-full rounded-md object-contain" /> : <p className="text-sm text-muted-foreground">{t("manager.parking.imageUnavailable")}</p>}</div>}
        {isProofVisible && <div className="rounded-xl border bg-muted/30 p-2"><div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("manager.overtime.originalScreenshot")}</div>{evidence?.imageUrl ? <img src={evidence.imageUrl} alt={t("notifications.evidenceAlt")} className="max-h-[32rem] w-full rounded-lg object-contain" /> : <p className="py-4 text-center text-xs text-muted-foreground">{evidenceImageLoading === job.id ? t("common.loading") : t("manager.overtime.imageUnavailable")}</p>}</div>}
      </CardContent>
    </Card>;
  }

  const notificationJobs = useMemo(() => {
    const merged = new Map();
    if (notificationFilter === "all" || notificationFilter === "overtime") overtimeJobs.forEach((job) => merged.set(job.id, job));
    if (notificationFilter === "all" || notificationFilter === "meals") notificationMealJobs.forEach((job) => merged.set(job.id, job));
    if (notificationFilter === "all" || notificationFilter === "parking") parkingJobs.forEach((job) => merged.set(job.id, job));
    return [...merged.values()].sort((a, b) => dayjs(b.job_date).valueOf() - dayjs(a.job_date).valueOf());
  }, [notificationFilter, notificationMealJobs, overtimeJobs, parkingJobs]);

  const bulkBusy = typeof actionLoadingId === "string" && actionLoadingId.startsWith("week:");

  return (
    <>
      <div className="space-y-3">
        {activeSection === "notifications" && (
          <div className="space-y-3">
            <Card><CardContent className="space-y-3 p-4"><div><h2 className="font-semibold">{t("manager.notifications.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("manager.notifications.description")}</p></div><Select value={notificationFilter} onChange={(event) => setNotificationFilter(event.target.value)} aria-label={t("manager.notifications.filterLabel")}><option value="all">{t("manager.notifications.all")}</option><option value="overtime">{t("manager.sections.overtime")}</option><option value="meals">{t("manager.sections.meals")}</option><option value="parking">{t("manager.sections.parking")}</option></Select></CardContent></Card>
            {(overtimeLoading || parkingLoading || notificationMealsLoading) && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
            {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{err}</div>}
            {!overtimeLoading && !parkingLoading && !notificationMealsLoading && notificationJobs.map(renderNotificationCard)}
            {!overtimeLoading && !parkingLoading && !notificationMealsLoading && notificationJobs.length === 0 && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("manager.notifications.empty")}</CardContent></Card>}
          </div>
        )}

        {activeSection === "timesheet" && <>
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
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setWeekSnapshotOpen(true)}>
                  <Radio className="mr-1.5 h-4 w-4" />{t("live.week.open")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setLastWeekSnapshotOpen(true)}>
                  <Radio className="mr-1.5 h-4 w-4" />{t("live.week.openLast")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setYesterdaySnapshotOpen(true)}>
                  <Radio className="mr-1.5 h-4 w-4" />{t("live.snapshot.open")}
                </Button>
              </div>
            </div>

            {/* One line: employee · status · date · OT search. */}
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

              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value)}
                  className="h-9 min-w-0 flex-1"
                  aria-label={t("manager.filters.day")}
                  title={t("manager.filters.day")}
                />
                <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setDayFilter(companyDate())}>
                  {t("manager.filters.today")}
                </Button>
                {dayFilter && (
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setDayFilter("")} aria-label={t("manager.filters.clearDay")} title={t("manager.filters.clearDay")}>
                    ×
                  </Button>
                )}
              </div>

              <Input
                value={searchLive}
                onChange={(e) => setSearchLive(e.target.value)}
                placeholder={t("manager.filters.searchPlaceholder")}
              />
            </div>

            {selectedEmployee && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <div className="text-xs text-muted-foreground">
                  {t("manager.selectedEmployee")}: <b className="text-foreground">{selectedEmployee.name}</b>
                  {selectedEmployee.phone ? <> • {t("manager.phone")}: <b className="text-foreground">{selectedEmployee.phone}</b></> : null}
                  {selectedEmployee.email ? <> • {t("manager.email")}: <b className="text-foreground">{selectedEmployee.email}</b></> : null}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button asChild size="sm">
                    <Link to={`/week?employee=${selectedEmployee.id}`}>{t("nav.week")}</Link>
                  </Button>

                  <Select
                    value={effectiveWeekKey}
                    onChange={(e) => setSelectedWeekKey(e.target.value)}
                    disabled={weekOptions.length === 0}
                    className="max-w-xs"
                  >
                    {weekOptions.length === 0 ? (
                      <option value="latest">{t("manager.noSubmittedWeeks")}</option>
                    ) : (
                      // Weeks (Sun → Sat) grouped under their monthly CCQ report period,
                      // like the CCQ calendar.
                      weekGroups.map((g) => (
                        <optgroup key={g.periodEnd} label={`${t("manager.reportPeriodShort")} ${dayjs(g.periodEnd).format("DD MMM YYYY")}`}>
                          {g.weeks.map((w) => (
                            <option key={w.key} value={w.key}>
                              {t("manager.weekShort")} {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")} ({w.count})
                            </option>
                          ))}
                        </optgroup>
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
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={weekSnapshotOpen} onOpenChange={setWeekSnapshotOpen}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("live.week.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <WeekSnapshot
              onSelectEmployee={(userId, date) => {
                setWeekSnapshotOpen(false);
                openEmployeeTimesheet(userId, date);
              }}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={lastWeekSnapshotOpen} onOpenChange={setLastWeekSnapshotOpen}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("live.week.dialogTitleLast")}</DialogTitle>
            </DialogHeader>
            <WeekSnapshot
              weekOffset={-1}
              onSelectEmployee={(userId, date) => {
                setLastWeekSnapshotOpen(false);
                openEmployeeTimesheet(userId, date);
              }}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={yesterdaySnapshotOpen} onOpenChange={setYesterdaySnapshotOpen}>
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("live.snapshot.dialogTitle")}</DialogTitle>
            </DialogHeader>
            <LiveCrew
              targetDate={addCalendarDays(companyDate(), -1)}
              snapshot
              onSelectEmployee={(userId, date) => {
                setYesterdaySnapshotOpen(false);
                openEmployeeTimesheet(userId, date);
              }}
            />
          </DialogContent>
        </Dialog>

        {(() => {
          const visible = anomalies.filter((anomaly) => employeeId === "all" || anomaly.userId === employeeId);
          if (anomaliesFailed) {
            return (
              <div className="rounded-md border-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
                {t("manager.anomalies.loadFailed")}
              </div>
            );
          }
          if (visible.length === 0) return null;
          const shown = showAllAnomalies ? visible : visible.slice(0, 8);
          return (
            <section className="rounded-lg border-2 border-red-500 bg-red-50 p-3 text-red-900 dark:bg-red-950/40 dark:text-red-200" aria-live="polite">
              <div className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="h-5 w-5 shrink-0" />
                {t("manager.anomalies.title", { count: visible.length })}
              </div>
              <p className="mt-1 text-xs opacity-80">{t("manager.anomalies.hint")}</p>
              <ul className="mt-2 divide-y divide-red-200 dark:divide-red-900">
                {shown.map((anomaly) => (
                  <li key={anomaly.key}>
                    <button
                      type="button"
                      onClick={() => openAnomaly(anomaly)}
                      className="flex w-full flex-wrap items-baseline gap-x-2 py-1.5 text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    >
                      <b>{employeeLabel(anomaly.userId)}</b>
                      <span className="tabular-nums">{dayjs(anomaly.jobDate).format("DD MMM YYYY")}</span>
                      <span>{describeAnomaly(anomaly)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {visible.length > 8 && (
                <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs text-red-900 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40" onClick={() => setShowAllAnomalies((value) => !value)}>
                  {showAllAnomalies ? t("manager.anomalies.showLess") : t("manager.anomalies.showAll", { count: visible.length })}
                </Button>
              )}
            </section>
          );
        })()}

        {loading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300 flex items-center justify-between gap-3">
            <span>{err}</span>
            <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={load}>
              {t("common.retry")}
            </Button>
          </div>
        )}
        {info && (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {info}
          </div>
        )}

        {!loading && employeeId !== "all" && split && (
          <>
            {/* Phone: one status selector above a single list. Desktop keeps the three piles. */}
            <Select
              value={mobileStatus}
              onChange={(e) => setMobileStatus(e.target.value)}
              className="lg:hidden"
              aria-label={t("manager.filters.allStatuses")}
            >
              <option value="saved">{t("manager.savedSection")} ({split.saved.length})</option>
              <option value="submitted">{t("manager.submittedSection")} ({split.submitted.length})</option>
              <option value="approved">{t("status.approved")} ({split.approved.length})</option>
            </Select>

            <div className="hidden grid-cols-3 gap-3 lg:grid">
              {[
                ["saved", t("manager.savedSection")],
                ["submitted", t("manager.submittedSection")],
                ["approved", t("status.approved")],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm font-bold">
                  {label}
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">{split[key].length}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
              {["saved", "submitted", "approved"].map((key) => (
                <div key={key} className={cn("flex-col gap-2 self-start", mobileStatus === key ? "flex" : "hidden", "lg:flex")}>
                  {split[key].map(renderJobCard)}
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && employeeId === "all" && (
          <div className="flex flex-col gap-2 self-start">
            {sortedAll.map((j, index) => {
              const previous = sortedAll[index - 1];
              const newGroup = previous && (previous.user_id !== j.user_id || previous.job_date !== j.job_date);
              return (
                <React.Fragment key={j.id}>
                  {newGroup && <div role="separator" className="my-1 border-t-2 border-slate-300 dark:border-slate-600" />}
                  {renderJobCard(j)}
                </React.Fragment>
              );
            })}
            {sortedAll.length === 0 && (
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
        </>}
      </div>
      {confirmDialog}
    </>
  );
}
