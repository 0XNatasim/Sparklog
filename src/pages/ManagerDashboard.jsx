import React, { useEffect, useMemo, useState } from "react";
import { Car, ClipboardList, Clock3, Download, Image, ImageOff, TimerReset, Users, Utensils } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
import { withTimeout } from "@/lib/utils";
import FormsManager from "@/components/FormsManager";
import ManagerDownloads from "@/components/ManagerDownloads";
import EmployeesPanel from "@/components/EmployeesPanel";
import TimeRulesManager from "@/components/TimeRulesManager";
import MealClaimsManager from "@/components/MealClaimsManager";
import { getKilometreBreakdown } from "@/lib/payroll-calculations";

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

function parseOcrConversation(rawText) {
  const lines = String(rawText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { dateTime: "", approval: "", response: "" };

  const dateIndex = lines.findIndex((line) =>
    /(?:\b(?:mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim)[a-zéû\.]*\b|\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janv|févr|avr|mai|juin|juil|août|sept|oct|nov|déc)[a-z\.]*\b)/i.test(line)
  );
  let durationIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\d+(?:[.,]\d+)?\s*(?:h(?:eures?)?|hrs?|min(?:utes?)?)(?:\s*\d+\s*min(?:utes?)?)?$/i.test(lines[index])) {
      durationIndex = index;
      break;
    }
  }
  const dateTime = dateIndex >= 0 ? lines[dateIndex] : "";
  const content = lines.filter((_, index) => index !== dateIndex);
  const adjustedDurationIndex = durationIndex < 0 ? -1 : durationIndex - (dateIndex >= 0 && dateIndex < durationIndex ? 1 : 0);

  if (adjustedDurationIndex < 0) {
    return { dateTime, approval: content.join("\n"), response: "" };
  }
  return {
    dateTime,
    approval: content.slice(0, adjustedDurationIndex).join("\n"),
    response: content.slice(adjustedDurationIndex).join("\n"),
  };
}

function OcrConversation({ evidence, t, id }) {
  if (!evidence?.ocr_text) {
    return <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t("notifications.ocrUnavailable")}</div>;
  }
  const conversation = parseOcrConversation(evidence.ocr_text);
  const fallbackDate = evidence.created_at ? dayjs(evidence.created_at).format("DD MMM YYYY · HH:mm") : "";
  return (
    <div id={id} className="max-h-72 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="text-left text-[11px] font-medium text-muted-foreground">{conversation.dateTime || fallbackDate}</div>
      {conversation.approval && (
        <div className="mr-auto max-w-[82%] rounded-2xl rounded-tl-sm border bg-background px-3 py-2 shadow-sm">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("manager.overtime.approvalMessage")}</div>
          <div className="whitespace-pre-wrap text-xs leading-relaxed">{conversation.approval}</div>
        </div>
      )}
      {conversation.response && (
        <div className="ml-auto max-w-[70%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground shadow-sm">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-75">{t("manager.overtime.employeeResponse")}</div>
          <div className="whitespace-pre-wrap text-right text-xs font-medium leading-relaxed">{conversation.response}</div>
        </div>
      )}
    </div>
  );
}

export default function ManagerDashboard() {
  const PAGE_SIZE = 200;
  const t = useT();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const activeSection = ["employees", "forms", "timesheet", "overtime", "meals", "parking", "download"].includes(searchParams.get("section"))
    ? searchParams.get("section")
    : "timesheet";
  const [focusedEvidence, setFocusedEvidence] = useState(null);
  const [overtimeJobs, setOvertimeJobs] = useState([]);
  const [overtimeEvidence, setOvertimeEvidence] = useState(new Map());
  const [overtimeLoading, setOvertimeLoading] = useState(false);
  const [visibleEvidence, setVisibleEvidence] = useState(new Set());
  const [visibleOcr, setVisibleOcr] = useState(new Set());
  const [evidenceImageLoading, setEvidenceImageLoading] = useState("");
  const [parkingJobs, setParkingJobs] = useState([]);
  const [parkingReceipts, setParkingReceipts] = useState(new Map());
  const [parkingLoading, setParkingLoading] = useState(false);
  const [visibleParkingReceipts, setVisibleParkingReceipts] = useState(new Set());
  const [parkingImageLoading, setParkingImageLoading] = useState("");

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
  const [searchLive, setSearchLive] = useState("");
  const [search, setSearch] = useState("");

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
    return q;
  }

  async function loadCounts() {
    const base = supabase.from("jobs").select("id", { head: true, count: "exact" });
    const scoped = (status) => {
      let q = supabase.from("jobs").select("id", { head: true, count: "exact" });
      if (employeeId !== "all") q = q.eq("user_id", employeeId);
      if (status) q = q.eq("status", status);
      return q;
    };
    const [all, saved, submitted, approved] = await withTimeout(
      Promise.all([
        employeeId === "all" ? base : scoped(null),
        scoped("saved"),
        scoped("submitted"),
        scoped("approved"),
      ]),
      12000
    );
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
      const { data: jobRows, error: jobErr } = await withTimeout(
        buildJobsQuery().range(0, PAGE_SIZE - 1),
        12000
      );
      if (jobErr) throw jobErr;

      const { data: profileRows, error: profErr } = await withTimeout(
        supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number"),
        12000
      );
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
  }, [employeeId, statusFilter]);

  useEffect(() => {
    if (!focusedJobId) return;
    supabase.from("jobs").select("user_id").eq("id", focusedJobId).single().then(({ data }) => {
      if (data?.user_id) setEmployeeId(data.user_id);
    });
    supabase.from("overtime_evidence").select("ocr_text, ocr_status, storage_path, daily_minutes, created_at").eq("job_id", focusedJobId).maybeSingle().then(async ({ data }) => {
      if (!data) return;
      const { data: signed } = await supabase.storage.from("overtime-evidence").createSignedUrl(data.storage_path, 600);
      setFocusedEvidence({ ...data, imageUrl: signed?.signedUrl || "" });
    });
  }, [focusedJobId]);

  useEffect(() => {
    if (activeSection !== "overtime") return;
    let cancelled = false;
    async function loadOvertime() {
      setOvertimeLoading(true);
      setErr("");
      try {
        const { data: evidenceRows, error: evidenceError } = await withTimeout(
          supabase.from("overtime_evidence").select("job_id, ocr_text, ocr_status, storage_path, daily_minutes, created_at").order("created_at", { ascending: false }),
          12000
        );
        if (evidenceError) throw evidenceError;
        const jobIds = (evidenceRows || []).map((row) => row.job_id);
        const { data: jobRows, error: jobError } = jobIds.length
          ? await withTimeout(supabase.from("jobs").select("*").in("id", jobIds), 12000)
          : { data: [], error: null };
        if (jobError) throw jobError;
        const order = new Map(jobIds.map((id, index) => [id, index]));
        const orderedJobs = (jobRows || []).sort((a, b) => order.get(a.id) - order.get(b.id));
        const missingProfileIds = [...new Set(orderedJobs.map((job) => job.user_id).filter((id) => !profiles.has(id)))];
        if (missingProfileIds.length) {
          const { data: profileRows, error: profileError } = await withTimeout(
            supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number").in("id", missingProfileIds),
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
          setOvertimeEvidence(new Map((evidenceRows || []).map((row) => [row.job_id, row])));
          if (focusedJobId) setVisibleEvidence(new Set([focusedJobId]));
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
    if (activeSection !== "parking") return;
    let cancelled = false;
    async function loadParking() {
      setParkingLoading(true);
      setErr("");
      try {
        const { data: receiptRows, error: receiptError } = await withTimeout(
          supabase.from("parking_receipts").select("job_id, user_id, job_date, storage_path, amount, status, created_at").order("created_at", { ascending: false }),
          12000
        );
        if (receiptError) throw receiptError;
        const jobIds = (receiptRows || []).map((row) => row.job_id);
        const { data: jobRows, error: jobError } = jobIds.length
          ? await withTimeout(supabase.from("jobs").select("*").in("id", jobIds), 12000)
          : { data: [], error: null };
        if (jobError) throw jobError;
        const order = new Map(jobIds.map((id, index) => [id, index]));
        const orderedJobs = (jobRows || []).sort((a, b) => order.get(a.id) - order.get(b.id));
        const missingProfileIds = [...new Set(orderedJobs.map((job) => job.user_id).filter((id) => !profiles.has(id)))];
        if (missingProfileIds.length) {
          const { data: profileRows, error: profileError } = await withTimeout(
            supabase.from("profiles").select("id, role, full_name, phone, email, ccq_number").in("id", missingProfileIds),
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

  async function toggleEvidence(jobId) {
    if (visibleEvidence.has(jobId)) {
      setVisibleEvidence((current) => {
        const next = new Set(current);
        next.delete(jobId);
        return next;
      });
      return;
    }
    await ensureEvidenceImage(jobId);
    setVisibleEvidence((current) => new Set(current).add(jobId));
  }

  async function reviewParking(jobId, status) {
    const { error } = await supabase.from("parking_receipts").update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("job_id", jobId);
    if (error) return setErr(error.message);
    setParkingReceipts((current) => {
      const next = new Map(current);
      next.set(jobId, { ...next.get(jobId), status });
      return next;
    });
  }

  async function toggleOcr(jobId) {
    const opening = !visibleOcr.has(jobId);
    if (opening) await ensureEvidenceImage(jobId);
    setVisibleOcr((current) => {
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

      // The batch function normally updates the job atomically. A previously
      // exported job is skipped, so finish its approval without exporting it a
      // second time (the same idempotent behaviour as the former endpoint).
      if (Number(data.skipped || 0) > 0) {
        const { error } = await supabase.from("jobs").update({ status: "approved", locked: true }).eq("id", jobId);
        if (error) throw error;
      }

      setInfo(Number(data.skipped || 0) > 0 ? t("manager.toasts.approvedSkipped") : t("manager.toasts.approvedAndExported"));
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

  function renderJobCard(j) {
    const employee = profiles.get(j.user_id);
    const employeeName = employee?.full_name || employee?.email || `User ${String(j.user_id).slice(0, 8)}…`;

    const d1 = makeDayjsFromJob(j.job_date, j.depart);
    const d2 = makeDayjsFromJob(j.job_date, j.fin);
    const totalHours = hoursBetween(d1, d2);
    const totalLabel = formatHours(totalHours);

    const { totalKm: kmLabel } = getKilometreBreakdown(j);

    const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";
    const canApprove = j.status === "submitted";

    return (
      <Card key={j.id} id={`job-${j.id}`} className={focusedJobId === j.id ? "ring-2 ring-red-500" : ""}>
        <CardContent className="p-3">
          {/* Mobile: stacked. Desktop: single-row inline list. */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
            {/* OT + date */}
            <div className="flex items-center gap-1.5 text-sm font-bold md:w-44 md:shrink-0">
              <span>{t("common.otLabel")}: {j.ot} • {dayjs(j.job_date).format("DD MMM")}</span>
              {j.parking_receipt_captured && (
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  title={t("manager.timesheet.parkingIndicator")}
                  aria-label={t("manager.timesheet.parkingIndicator")}
                >
                  <Car className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              {j.overtime_evidence_captured && (
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  title={t("manager.timesheet.overtimeIndicator")}
                  aria-label={t("manager.timesheet.overtimeIndicator")}
                >
                  <TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
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
            <div className="mt-3 grid gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 md:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold">{t("notifications.evidence")}</div>
                {focusedEvidence.imageUrl && <img src={focusedEvidence.imageUrl} alt={t("notifications.evidenceAlt")} className="max-h-80 w-full rounded-md border object-contain" />}
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">OCR · {focusedEvidence.ocr_status}</div>
                <OcrConversation evidence={focusedEvidence} t={t} id="focused-overtime-ocr" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderOvertimeCard(job) {
    const evidence = overtimeEvidence.get(job.id);
    const employee = profiles.get(job.user_id);
    const employeeName = employee?.full_name || employee?.email || `User ${String(job.user_id).slice(0, 8)}…`;
    const totalHours = hoursBetween(makeDayjsFromJob(job.job_date, job.depart), makeDayjsFromJob(job.job_date, job.fin));
    const { totalKm: km } = getKilometreBreakdown(job);
    const isVisible = visibleEvidence.has(job.id);
    const isOcrVisible = visibleOcr.has(job.id);

    return (
      <Card key={job.id} id={`job-${job.id}`} className={focusedJobId === job.id ? "ring-2 ring-red-500" : ""}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-bold">{t("common.otLabel")}: {job.ot} · {dayjs(job.job_date).format("DD MMM YYYY")}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{employeeName}</span>
                {employee?.phone ? <> · <a className="text-primary hover:underline" href={`tel:${String(employee.phone).replace(/[^+\d]/g, "")}`}>{employee.phone}</a></> : null}
                {employee?.email ? <> · <a className="text-primary hover:underline" href={`mailto:${employee.email}`}>{employee.email}</a></> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(job.status)} className="uppercase tracking-wide">{t(`status.${job.status}`)}</Badge>
              <Button type="button" size="sm" variant="outline" aria-expanded={isOcrVisible} aria-controls={`overtime-ocr-${job.id}`} onClick={() => toggleOcr(job.id)}>
                {isOcrVisible ? t("manager.overtime.hideOcr") : t("manager.overtime.showOcr")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={evidenceImageLoading === job.id} onClick={() => toggleEvidence(job.id)}>
                {isVisible ? <ImageOff className="mr-1.5 h-4 w-4" /> : <Image className="mr-1.5 h-4 w-4" />}
                {evidenceImageLoading === job.id ? t("common.loading") : isVisible ? t("manager.overtime.hideEvidence") : t("manager.overtime.showEvidence")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.totalLabel")}: <b>{formatHours(totalHours)}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.km")}: <b>{km}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.depart")}: <b>{fmtTimeHHmm(job.depart)}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.arrival")}: <b>{fmtTimeHHmm(job.arrivee)}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.end")}: <b>{fmtTimeHHmm(job.fin)}</b></span>
            {job.return_time_minutes ? <span className="rounded-full border bg-muted px-2 py-1">{t("form.return.timeTitle")}: <b>{job.return_time_minutes} min</b></span> : null}
            {evidence?.daily_minutes ? <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1">{t("manager.overtime.dailyTotal")}: <b>{formatHours(evidence.daily_minutes / 60)}</b></span> : null}
          </div>

          {isOcrVisible && <div id={`overtime-ocr-${job.id}`}>
            <div className="mb-1 text-sm font-semibold">OCR · {evidence?.ocr_status || "—"}</div>
            <div className="grid items-start gap-3 md:grid-cols-[minmax(180px,280px)_minmax(0,1fr)]">
              <div className="rounded-xl border bg-muted/30 p-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("manager.overtime.originalScreenshot")}</div>
                {evidence?.imageUrl
                  ? <button type="button" className="block w-full" onClick={() => toggleEvidence(job.id)} aria-label={t("manager.overtime.showEvidence")}><img src={evidence.imageUrl} alt={t("notifications.evidenceAlt")} className="max-h-56 w-full rounded-lg object-contain" /></button>
                  : <p className="py-4 text-center text-xs text-muted-foreground">{evidenceImageLoading === job.id ? t("common.loading") : t("manager.overtime.imageUnavailable")}</p>}
              </div>
              <OcrConversation evidence={evidence} t={t} />
            </div>
          </div>}

          {isVisible && (
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-semibold">{t("notifications.evidence")}</div>
              {evidence?.imageUrl
                ? <img src={evidence.imageUrl} alt={t("notifications.evidenceAlt")} className="max-h-[32rem] w-full rounded-md object-contain" />
                : <p className="text-sm text-muted-foreground">{t("manager.overtime.imageUnavailable")}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderParkingCard(job) {
    const receipt = parkingReceipts.get(job.id);
    const employee = profiles.get(job.user_id);
    const employeeName = employee?.full_name || employee?.email || `User ${String(job.user_id).slice(0, 8)}…`;
    const isVisible = visibleParkingReceipts.has(job.id);

    return (
      <Card key={job.id} id={`parking-job-${job.id}`}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-bold">{t("common.otLabel")}: {job.ot} · {dayjs(job.job_date).format("DD MMM YYYY")}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{employeeName}</span>
                {employee?.phone ? <> · <a className="text-primary hover:underline" href={`tel:${String(employee.phone).replace(/[^+\d]/g, "")}`}>{employee.phone}</a></> : null}
                {employee?.email ? <> · <a className="text-primary hover:underline" href={`mailto:${employee.email}`}>{employee.email}</a></> : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariant(job.status)} className="uppercase tracking-wide">{t(`status.${job.status}`)}</Badge>
              <Button type="button" size="sm" variant="outline" disabled={parkingImageLoading === job.id} onClick={() => toggleParkingReceipt(job.id)}>
                {isVisible ? <ImageOff className="mr-1.5 h-4 w-4" /> : <Image className="mr-1.5 h-4 w-4" />}
                {parkingImageLoading === job.id ? t("common.loading") : isVisible ? t("manager.parking.hideReceipt") : t("manager.parking.showReceipt")}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.depart")}: <b>{fmtTimeHHmm(job.depart)}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.arrival")}: <b>{fmtTimeHHmm(job.arrivee)}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("history.end")}: <b>{fmtTimeHHmm(job.fin)}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("manager.parking.received")}: <b>{dayjs(receipt?.created_at).format("DD MMM HH:mm")}</b></span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("manager.parking.amount")}: <b>${Number(receipt?.amount || 0).toFixed(2)}</b> / $20</span>
            <span className="rounded-full border bg-muted px-2 py-1">{t("manager.parking.reviewStatus")}: <b>{receipt?.status || "pending"}</b></span>
          </div>
          {isVisible && (
            <div className="rounded-lg border p-3">
              {receipt?.imageUrl
                ? <img src={receipt.imageUrl} alt={t("manager.parking.receiptAlt")} className="max-h-[32rem] w-full rounded-md object-contain" />
                : <p className="text-sm text-muted-foreground">{t("manager.parking.imageUnavailable")}</p>}
            </div>
          )}
          {receipt?.status === "pending" && <div className="flex gap-2"><Button type="button" size="sm" onClick={() => reviewParking(job.id, "approved")}>{t("manager.approve")}</Button><Button type="button" size="sm" variant="destructive" onClick={() => reviewParking(job.id, "rejected")}>{t("meals.reject")}</Button></div>}
        </CardContent>
      </Card>
    );
  }

  const bulkBusy = typeof actionLoadingId === "string" && actionLoadingId.startsWith("week:");

  return (
    <AppShell>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-7" aria-label={t("manager.sections.label")}>
          {[
            { id: "employees", icon: Users, label: t("manager.sections.employees"), description: t("manager.sections.employeesDescription") },
            { id: "forms", icon: ClipboardList, label: t("manager.sections.forms"), description: t("manager.sections.formsDescription") },
            { id: "timesheet", icon: Clock3, label: t("manager.sections.timesheet"), description: t("manager.sections.timesheetDescription") },
            { id: "overtime", icon: TimerReset, label: t("manager.sections.overtime"), description: t("manager.sections.overtimeDescription") },
            { id: "meals", icon: Utensils, label: t("manager.sections.meals"), description: t("manager.sections.mealsDescription") },
            { id: "parking", icon: Car, label: t("manager.sections.parking"), description: t("manager.sections.parkingDescription") },
            { id: "download", icon: Download, label: t("manager.sections.download"), description: t("manager.sections.downloadDescription") },
          ].map(({ id, icon: Icon, label, description }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSearchParams({ section: id })}
              aria-current={activeSection === id ? "page" : undefined}
              className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeSection === id ? "border-primary bg-primary/10 text-primary" : "bg-card hover:border-primary/50 hover:bg-accent"}`}
            >
              <div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{label}</div>
              <div className={`mt-1 text-xs ${activeSection === id ? "text-primary/80" : "text-muted-foreground"}`}>{description}</div>
            </button>
          ))}
        </div>

        {activeSection === "employees" && <div className="space-y-3"><TimeRulesManager /><EmployeesPanel /></div>}

        {activeSection === "forms" && <FormsManager collapsible={false} />}

        {activeSection === "meals" && <MealClaimsManager />}

        {activeSection === "overtime" && (
          <div className="space-y-3">
            <Card><CardContent className="p-4"><h2 className="font-semibold">{t("manager.overtime.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("manager.overtime.description")}</p></CardContent></Card>
            {overtimeLoading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
            {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{err}</div>}
            {!overtimeLoading && overtimeJobs.map(renderOvertimeCard)}
            {!overtimeLoading && overtimeJobs.length === 0 && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("manager.overtime.empty")}</CardContent></Card>}
          </div>
        )}

        {activeSection === "parking" && (
          <div className="space-y-3">
            <Card><CardContent className="p-4"><h2 className="font-semibold">{t("manager.parking.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("manager.parking.description")}</p></CardContent></Card>
            {parkingLoading && <Card><CardContent className="p-4 text-sm">{t("common.loading")}</CardContent></Card>}
            {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{err}</div>}
            {!parkingLoading && parkingJobs.map(renderParkingCard)}
            {!parkingLoading && parkingJobs.length === 0 && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("manager.parking.empty")}</CardContent></Card>}
          </div>
        )}

        {activeSection === "download" && (
          <ManagerDownloads />
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
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
        </>}
      </div>
    </AppShell>
  );
}
