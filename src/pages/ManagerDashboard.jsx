// src/pages/ManagerDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";

dayjs.locale("en");

function badgeStyle(status) {
  if (status === "saved") return { background: "#1565c0", color: "#fff" };
  if (status === "submitted") return { background: "#4caf50", color: "#fff" };
  if (status === "approved") return { background: "#111", color: "#fff" };
  return { background: "#eee", color: "#111" };
}

function fmtTimeHHmm(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${String(timeStr).slice(0, 5)}`);
  return d.isValid() ? d : null;
}

function toHHmmLabelFromFormatHours(formatHoursResult) {
  const num = Number(String(formatHoursResult).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "0h00";
  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function ManagerDashboard() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [profiles, setProfiles] = useState(new Map());

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // per-job busy for approve
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // bulk busy for approve-all
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const [employeeId, setEmployeeId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  async function load() {
    setErr("");
    setInfo("");
    setLoading(true);

    try {
      const { data: jobsData, error: jobsErr } = await supabase
        .from("jobs")
        .select("*")
        .order("job_date", { ascending: false })
        .order("updated_at", { ascending: false });

      if (jobsErr) throw jobsErr;

      const { data: profData, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email, role");

      if (profErr) throw profErr;

      const map = new Map();
      for (const p of profData || []) map.set(p.id, p);

      setProfiles(map);
      setJobs(jobsData || []);
    } catch (e) {
      setErr(e?.message || "Failed to load manager dashboard.");
      setJobs([]);
      setProfiles(new Map());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "manager") {
      navigate("/form");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const employees = useMemo(() => {
    const arr = Array.from(profiles.values()).filter((p) => p.role !== "manager");
    arr.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
    return arr;
  }, [profiles]);

  const filteredJobs = useMemo(() => {
    let list = jobs;

    if (employeeId !== "all") {
      list = list.filter((j) => j.user_id === employeeId);
    }

    if (statusFilter !== "all") {
      list = list.filter((j) => j.status === statusFilter);
    }

    return list;
  }, [jobs, employeeId, statusFilter]);

  // Only for bulk approve: submitted jobs for selected employee
  const bulkCandidates = useMemo(() => {
    if (employeeId === "all") return [];
    return jobs.filter((j) => j.user_id === employeeId && j.status === "submitted");
  }, [jobs, employeeId]);

  async function approve(jobId) {
    if (actionLoadingId || bulkLoading) return;

    setActionLoadingId(jobId);
    setErr("");
    setInfo("");

    try {
      // get session token
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No session token (manager). Please re-login.");

      // invoke edge function (it exports + marks approved/locked/exported)
      const { data, error: fnErr } = await supabase.functions.invoke("push_approved_to_sheet", {
        body: { job_id: jobId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (fnErr) throw fnErr;
      if (data?.ok !== true && !data?.skipped) {
        throw new Error(data?.error || "Export to Google Sheet failed.");
      }

      setInfo(data?.skipped ? "Approved. Export skipped (already exported)." : "Approved and exported.");
      await load();
    } catch (e) {
      setErr(e?.message || "Approve failed.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function approveAllForEmployee() {
    if (employeeId === "all") return;
    if (bulkCandidates.length === 0) return;

    const ok = window.confirm(
      `Approve ALL submitted jobs for this employee?\n\nJobs: ${bulkCandidates.length}\n\nThis will export them to Google Sheet.`
    );
    if (!ok) return;

    if (bulkLoading || actionLoadingId) return;

    setBulkLoading(true);
    setBulkProgress({ done: 0, total: bulkCandidates.length });
    setErr("");
    setInfo("");

    try {
      // Get token once
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No session token (manager). Please re-login.");

      // Approve sequentially (more reliable than blasting 50 requests at once)
      let done = 0;

      for (const j of bulkCandidates) {
        const { data, error: fnErr } = await supabase.functions.invoke("push_approved_to_sheet", {
          body: { job_id: j.id },
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (fnErr) throw fnErr;
        if (data?.ok !== true && !data?.skipped) {
          throw new Error(data?.error || `Export failed for job ${j.id}`);
        }

        done += 1;
        setBulkProgress({ done, total: bulkCandidates.length });
      }

      setInfo(`Approved and exported ${done} job(s) for the selected employee.`);
      await load();
    } catch (e) {
      setErr(e?.message || "Bulk approve failed.");
    } finally {
      setBulkLoading(false);
      setBulkProgress({ done: 0, total: 0 });
    }
  }

  function renderJobCard(j) {
    const employee = profiles.get(j.user_id);
    const employeeName = employee?.full_name || "—";
    const employeeEmail = employee?.email || "—";
    const employeePhone = employee?.phone || "—";

    const d1 = makeDayjsFromJob(j.job_date, j.depart);
    const d2 = makeDayjsFromJob(j.job_date, j.fin);
    const totalHours = hoursBetween(d1, d2) || 0;
    const totalHHmm = toHHmmLabelFromFormatHours(formatHours(totalHours));

    const kmLabel = Math.round(Number(j.km_aller ?? 0) || 0);

    const canApprove = j.status === "submitted";
    const busy = actionLoadingId === j.id;

    return (
      <div key={j.id} style={styles.jobCard}>
        <div style={styles.headerRow}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>OT: {j.ot}</div>

          <div style={styles.metrics}>
            <span style={styles.metricPill}>
              Total: <b>{totalHHmm}</b>
            </span>
            <span style={styles.metricPill}>
              KM: <b>{kmLabel}</b>
            </span>
          </div>
        </div>

        <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
          <div>
            <b>{employeeName}</b> • {employeeEmail} • {employeePhone}
          </div>
          <div style={{ marginTop: 4 }}>
            Date: {dayjs(j.job_date).format("DD MMM YYYY")} • Depart: {fmtTimeHHmm(j.depart)} • Arrival:{" "}
            {fmtTimeHHmm(j.arrivee)} • End: {fmtTimeHHmm(j.fin)}
          </div>
        </div>

        <div style={styles.footerRow}>
          <span style={{ ...styles.badge, ...badgeStyle(j.status) }}>{j.status}</span>

          {canApprove && (
            <button disabled={busy || bulkLoading} onClick={() => approve(j.id)} style={styles.primaryBtn}>
              {busy ? "Approving…" : "Approve"}
            </button>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          Locked: <b>{j.locked ? "true" : "false"}</b>
        </div>
      </div>
    );
  }

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div style={styles.page}>
      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div style={styles.leftTop}>
          <div style={styles.title}>Manager</div>
          <div style={styles.subRow}>
            <div style={styles.email}>{user?.email}</div>
            <div style={styles.roleLine}>
              Role: <b>manager</b>
            </div>
          </div>
        </div>

        {/* Menu order: Form History Week Manager Logout */}
        <div style={styles.nav}>
          <Link to="/form" style={styles.link}>
            Form
          </Link>

          <Link to="/history" style={styles.link}>
            History
          </Link>

          <Link to="/week" style={styles.link}>
            Week
          </Link>

          <span style={styles.activeLink}>Manager</span>

          <button onClick={handleLogout} style={styles.secondaryBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        <div style={styles.card}>
          <div style={styles.filters}>
            <div style={styles.field}>
              <div style={styles.label}>Employee</div>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={styles.input} disabled={loading || bulkLoading}>
                <option value="all">All employees</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name || e.email || e.id}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Status</div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.input} disabled={loading || bulkLoading}>
                <option value="all">All</option>
                <option value="saved">saved</option>
                <option value="submitted">submitted</option>
                <option value="approved">approved</option>
              </select>
            </div>

            {/* Bulk approve only when employee selected */}
            {employeeId !== "all" && (
              <div style={styles.field}>
                <div style={styles.label}>Bulk</div>
                <button
                  type="button"
                  onClick={approveAllForEmployee}
                  disabled={bulkLoading || bulkCandidates.length === 0}
                  style={{
                    ...styles.primaryBtn,
                    width: "100%",
                    opacity: bulkLoading || bulkCandidates.length === 0 ? 0.5 : 1,
                  }}
                  title="Approve all submitted jobs for selected employee"
                >
                  {bulkLoading
                    ? `Approving ${bulkProgress.done}/${bulkProgress.total}…`
                    : `Approve all submitted (${bulkCandidates.length})`}
                </button>
              </div>
            )}
          </div>
        </div>

        {!loading && filteredJobs.length === 0 && <div style={styles.card}>No jobs match the filters.</div>}

        <div style={{ display: "grid", gap: 10 }}>
          {filteredJobs.map((j) => renderJobCard(j))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f5f5f5", padding: 16 },
  container: { maxWidth: 980, margin: "0 auto" },

  topbar: {
    maxWidth: 980,
    margin: "0 auto 12px auto",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },

  leftTop: { display: "grid", gap: 6 },
  title: { fontSize: 34, fontWeight: 900, lineHeight: 1.05 },

  subRow: { display: "grid", gap: 2 },
  email: { fontSize: 14, color: "rgba(0,0,0,0.55)" },
  roleLine: { fontSize: 14, color: "rgba(0,0,0,0.55)" },

  nav: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  link: { color: "#1565c0", fontWeight: 900, textDecoration: "none" },
  activeLink: { fontWeight: 900, color: "#111", fontSize: 14 },

  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  filters: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    alignItems: "end",
  },

  field: { display: "grid", gap: 6 },
  label: { fontSize: 12, color: "#666", fontWeight: 800 },

  input: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    background: "#fff",
  },

  jobCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  footerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 },

  metrics: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  metricPill: {
    border: "1px solid #eee",
    background: "#fafafa",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
  },

  badge: { borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 900 },

  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "1px solid #1565c0",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  secondaryBtn: {
    background: "#f5f5f5",
    color: "#111",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },

  error: {
    marginBottom: 10,
    background: "rgba(220,20,60,0.08)",
    border: "1px solid rgba(220,20,60,0.2)",
    color: "crimson",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
  },
  info: {
    marginBottom: 10,
    background: "rgba(21,101,192,0.08)",
    border: "1px solid rgba(21,101,192,0.2)",
    color: "#0d47a1",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
  },
};
