// src/pages/ManagerDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";

function badgeStyle(status) {
  if (status === "saved") return { background: "#1565c0", color: "#fff" };
  if (status === "submitted") return { background: "#4caf50", color: "#fff" };
  if (status === "approved") return { background: "#111", color: "#fff" };
  return { background: "#eee", color: "#111" };
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function fmtTimeHHmm(t) {
  if (!t) return "—";
  return String(t).slice(0, 5); // HH:mm
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

export default function ManagerDashboard() {
  const { user, signOut } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Filters
  const [employeeId, setEmployeeId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchLive, setSearchLive] = useState("");
  const [search, setSearch] = useState("");

  const setSearchDebounced = useMemo(
    () =>
      debounce((v) => {
        setSearch(v);
      }, 250),
    []
  );

  useEffect(() => {
    setSearchDebounced(searchLive);
  }, [searchLive, setSearchDebounced]);

  async function load() {
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const { data: jobRows, error: jobErr } = await supabase
        .from("jobs")
        .select("*")
        .order("job_date", { ascending: false })
        .order("updated_at", { ascending: false });

      if (jobErr) throw jobErr;

      // ✅ include phone + email if you store it in profiles (recommended)
      const { data: profileRows, error: profErr } = await supabase
        .from("profiles")
        .select("id, role, full_name, phone, email");

      if (profErr) throw profErr;

      const m = new Map();
      (profileRows || []).forEach((p) => m.set(p.id, p));

      setProfiles(m);
      setJobs(jobRows || []);
    } catch (e) {
      setErr(e?.message || "Failed to load manager.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const employeeOptions = useMemo(() => {
    const ids = new Set();
    for (const j of jobs) ids.add(j.user_id);

    const arr = Array.from(ids).map((id) => {
      const p = profiles.get(id);
      const label = p?.full_name?.trim() || `User ${String(id).slice(0, 8)}…`;
      return { id, label };
    });

    arr.sort((a, b) => a.label.localeCompare(b.label));
    return arr;
  }, [jobs, profiles]);

  const counts = useMemo(() => {
    const c = { all: jobs.length, saved: 0, submitted: 0, approved: 0 };
    for (const j of jobs) c[j.status] = (c[j.status] || 0) + 1;
    return c;
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return jobs.filter((j) => {
      if (employeeId !== "all" && j.user_id !== employeeId) return false;
      if (statusFilter !== "all" && j.status !== statusFilter) return false;

      if (!q) return true;

      const employee = profiles.get(j.user_id);
      const employeeName = employee?.full_name || "";
      const employeePhone = employee?.phone || "";
      const employeeEmail = employee?.email || "";

      const haystack = [
        j.ot || "",
        j.job_date || "",
        j.status || "",
        employeeName,
        employeePhone,
        employeeEmail,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [jobs, profiles, employeeId, statusFilter, search]);

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
    const name = p?.full_name || `User ${String(employeeId).slice(0, 8)}…`;
    const phone = p?.phone || "";
    const email = p?.email || "";
    return { id: employeeId, name, phone, email };
  }, [employeeId, profiles]);

  async function approve(jobId) {
    setActionLoadingId(jobId);
    setErr("");
    setInfo("");

    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("No session token (manager). Please re-login.");

      const { data, error: fnErr } = await supabase.functions.invoke("push_approved_to_sheet", {
        body: { job_id: jobId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (fnErr) throw fnErr;
      if (data?.ok !== true && !data?.skipped) {
        throw new Error(data?.error || "Export to Google Sheet failed.");
      }

      const { error } = await supabase
        .from("jobs")
        .update({ status: "approved", locked: true })
        .eq("id", jobId);

      if (error) throw error;

      setInfo(data?.skipped ? "Approved. Export skipped (already exported)." : "Approved and exported.");
      await load();
    } catch (e) {
      setErr(e?.message || "Approve failed.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function renderJobCard(j) {
    const employee = profiles.get(j.user_id);
    const employeeName = employee?.full_name || `User ${String(j.user_id).slice(0, 8)}…`;

    // total depart->fin
    const d1 = makeDayjsFromJob(j.job_date, j.depart);
    const d2 = makeDayjsFromJob(j.job_date, j.fin);
    const totalHours = hoursBetween(d1, d2);
    const totalLabel = formatHours(totalHours);
    const kmLabel = j.km_aller ?? 0;

    const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";

    const canApprove = j.status === "submitted";

    return (
      <div key={j.id} style={styles.card}>
        {/* Header row (responsive) */}
        <div style={styles.cardTop}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.otLine}>
              <div style={styles.otTitle}>
                OT: {j.ot} • {dayjs(j.job_date).format("DD MMM")}
              </div>

              <div style={styles.metrics}>
                <span style={styles.metricPill}>
                  Total: <b>{totalLabel}</b> h
                </span>
                <span style={styles.metricPill}>
                  KM: <b>{kmLabel}</b>
                </span>
              </div>
            </div>

            <div style={styles.subLine}>
              Employee: <b>{employeeName}</b>
            </div>

            <div style={styles.subLine}>
              Depart: {fmtTimeHHmm(j.depart)} • Arrival: {fmtTimeHHmm(j.arrivee)} • End: {fmtTimeHHmm(j.fin)}
            </div>
          </div>

          <div style={styles.cardRight}>
            <span style={{ ...styles.badge, ...badgeStyle(j.status) }}>{j.status}</span>

            {canApprove && (
              <button
                disabled={actionLoadingId === j.id}
                onClick={() => approve(j.id)}
                style={styles.primaryBtn}
              >
                {actionLoadingId === j.id ? "Working…" : "Approve"}
              </button>
            )}

            <div style={styles.lockLine}>
              Locked: <b>{j.locked ? "true" : "false"}</b>
            </div>
          </div>
        </div>

        <div style={styles.updatedLine}>Updated: {updatedLabel}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brandBlock}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Manager</div>
          <div style={{ fontSize: 12, color: "#666" }}>{user?.email}</div>
        </div>

        <div style={styles.nav}>
          <Link to="/" style={styles.link}>
            Form
          </Link>
          <Link to="/history" style={styles.link}>
            History
          </Link>
          <Link to="/manager" style={styles.link}>
            Manager
          </Link>
          <button onClick={signOut} style={styles.secondaryBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.container}>
        <div style={styles.filtersCard}>
          <div style={styles.pillsRow}>
            <div style={styles.pill}>
              All: <b>{counts.all}</b>
            </div>
            <div style={styles.pill}>
              Saved: <b>{counts.saved}</b>
            </div>
            <div style={styles.pill}>
              Submitted: <b>{counts.submitted}</b>
            </div>
            <div style={styles.pill}>
              Approved: <b>{counts.approved}</b>
            </div>
          </div>

          {/* Responsive filters grid */}
          <div style={styles.filtersGrid}>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              style={styles.select}
              title="Choose employee"
            >
              <option value="all">All employees</option>
              {employeeOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
              title="Status filter"
            >
              <option value="all">All statuses</option>
              <option value="saved">saved</option>
              <option value="submitted">submitted</option>
              <option value="approved">approved</option>
            </select>

            <input
              value={searchLive}
              onChange={(e) => setSearchLive(e.target.value)}
              style={styles.input}
              placeholder="Search OT number (fast)…"
            />
          </div>

          {selectedEmployee && (
            <div style={styles.selectedRow}>
              <div style={{ fontSize: 13, color: "#555" }}>
                Selected employee: <b>{selectedEmployee.name}</b>
                {selectedEmployee.phone ? (
                  <>
                    {" "}
                    • Phone: <b>{selectedEmployee.phone}</b>
                  </>
                ) : null}
              </div>

              <Link to={`/week?employee=${selectedEmployee.id}`} style={styles.weekBtn}>
                Week
              </Link>
            </div>
          )}
        </div>

        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {!loading && employeeId !== "all" && split && (
          <div style={styles.twoCol}>
            <div style={styles.col}>
              <div style={styles.colHeader}>
                Saved <span style={styles.colCount}>{split.saved.length}</span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {split.saved.map(renderJobCard)}
                {split.saved.length === 0 && <div style={styles.emptyCard}>No saved jobs.</div>}
              </div>
            </div>

            <div style={styles.col}>
              <div style={styles.colHeader}>
                Submitted <span style={styles.colCount}>{split.submitted.length}</span>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {split.submitted.map(renderJobCard)}
                {split.submitted.length === 0 && <div style={styles.emptyCard}>No submitted jobs.</div>}
              </div>
            </div>
          </div>
        )}

        {!loading && employeeId === "all" && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map(renderJobCard)}
            {filtered.length === 0 && <div style={styles.card}>No results.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f5f5f5", padding: 16 },
  container: { maxWidth: 1100, margin: "0 auto" },

  // ✅ Topbar responsive
  topbar: {
    maxWidth: 1100,
    margin: "0 auto 12px auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap", // key for mobile
  },
  brandBlock: { display: "grid", gap: 2 },

  nav: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap", // key
    justifyContent: "flex-end",
  },

  link: { color: "#1565c0", fontWeight: 900, textDecoration: "none" },

  filtersCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    marginBottom: 10,
  },

  pillsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  pill: {
    background: "#f5f5f5",
    border: "1px solid #eee",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    color: "#111",
  },

  // ✅ Filters responsive: 1 column on mobile automatically
  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginTop: 12,
  },

  select: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
    width: "100%",
  },
  input: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    width: "100%",
  },

  selectedRow: {
    marginTop: 10,
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  weekBtn: {
    background: "#1565c0",
    color: "#fff",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 900,
    textDecoration: "none",
    display: "inline-block",
  },

  // ✅ Cards responsive layout
  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap", // key
    alignItems: "flex-start",
  },

  otLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  otTitle: { fontWeight: 900, fontSize: 15 },

  metrics: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  metricPill: {
    fontSize: 12,
    color: "#111",
    background: "#f5f5f5",
    border: "1px solid #eee",
    borderRadius: 999,
    padding: "4px 8px",
    whiteSpace: "nowrap",
  },

  subLine: { color: "#555", fontSize: 13 },

  cardRight: {
    display: "grid",
    justifyItems: "end",
    gap: 8,
    marginLeft: "auto",
  },

  lockLine: { fontSize: 12, color: "#666" },

  updatedLine: { marginTop: 10, fontSize: 12, color: "#666" },

  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
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

  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 12,
    alignItems: "start",
  },
  col: { display: "grid", gap: 10 },
  colHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: 900,
    fontSize: 13,
    color: "#111",
    padding: "8px 10px",
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 12,
  },
  colCount: {
    background: "#f5f5f5",
    border: "1px solid #eee",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 900,
  },
  emptyCard: {
    background: "#fff",
    border: "1px dashed #ddd",
    borderRadius: 14,
    padding: 14,
    color: "#666",
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
