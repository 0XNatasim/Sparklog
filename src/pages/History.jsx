// src/pages/History.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";

dayjs.locale("en");

function badgeStyle(status) {
  if (status === "saved") return { background: "#1565c0", color: "#fff" }; // blue
  if (status === "submitted") return { background: "#4caf50", color: "#fff" }; // green
  if (status === "approved") return { background: "#111", color: "#fff" }; // black
  return { background: "#eee", color: "#111" };
}

function fmtRoleLabel(role) {
  if (role === "manager") return "manager";
  return "employee";
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

export default function History() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // per-job action busy (delete)
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // per-day action busy (submit day)
  const [daySubmitting, setDaySubmitting] = useState(null); // dateKey "YYYY-MM-DD"

  async function load() {
    setErr("");
    setInfo("");
    setLoading(true);

    try {
      if (!user?.id) {
        setJobs([]);
        setLoading(false);
        return;
      }

      // history is mainly for your own jobs
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("job_date", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load history.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const j of jobs) {
      const key = dayjs(j.job_date).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    }
    return Array.from(map.entries());
  }, [jobs]);

  function isOwner(job) {
    return Boolean(user?.id) && job.user_id === user.id;
  }

  function canOpen(job) {
    return isOwner(job) && job.status === "saved" && job.locked === false;
  }

  function canDelete(job) {
    return isOwner(job) && job.status === "saved" && job.locked === false;
  }

  // OPEN = go to form edit mode
  function openJob(job) {
    navigate(`/form?edit=${job.id}`);
  }

  // DELETE (only saved & unlocked & owner)
  async function deleteJob(jobId) {
    const ok = window.confirm("Delete this job? This cannot be undone.");
    if (!ok) return;

    if (actionLoadingId) return; // prevent double-taps
    setActionLoadingId(jobId);
    setErr("");
    setInfo("");

    try {
      const { error } = await supabase.from("jobs").delete().eq("id", jobId);
      if (error) throw error;

      setInfo("Job deleted.");
      await load();
    } catch (e) {
      setErr(e?.message || "Delete failed.");
    } finally {
      setActionLoadingId(null);
    }
  }

  // SUBMIT DAY (all saved + unlocked jobs for that day)
  async function submitDay(dateKey, dayJobs) {
    const candidates = (dayJobs || []).filter(
      (j) => isOwner(j) && j.status === "saved" && j.locked === false
    );

    if (candidates.length === 0) return;

    const ok = window.confirm(
      `Submit all jobs for ${dayjs(dateKey).format("DD MMM YYYY")}?\nThis will lock them.`
    );
    if (!ok) return;

    if (daySubmitting) return;
    setDaySubmitting(dateKey);
    setErr("");
    setInfo("");

    try {
      const ids = candidates.map((j) => j.id);

      const { error } = await supabase
        .from("jobs")
        .update({ status: "submitted", locked: true })
        .in("id", ids);

      if (error) throw error;

      setInfo(`Submitted ${ids.length} job(s) for ${dayjs(dateKey).format("DD MMM YYYY")}.`);
      await load();
    } catch (e) {
      setErr(e?.message || "Submit day failed.");
    } finally {
      setDaySubmitting(null);
    }
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
          <div style={styles.title}>History</div>

          {/* email + role below */}
          <div style={styles.subRow}>
            <div style={styles.email}>{user?.email}</div>
            <div style={styles.roleLine}>
              Role: <b>{fmtRoleLabel(role)}</b>
            </div>
          </div>
        </div>

        {/* Menu order: Form History Week Manager Logout */}
        <div style={styles.nav}>
          <Link to="/form" style={styles.link}>
            Form
          </Link>

          <span style={styles.activeLink}>History</span>

          <Link to="/week" style={styles.link}>
            Week
          </Link>

          {role === "manager" && (
            <Link to="/manager" style={styles.link}>
              Manager
            </Link>
          )}

          <button onClick={handleLogout} style={styles.secondaryBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {!loading && !err && grouped.length === 0 && <div style={styles.card}>No jobs yet.</div>}

        {!loading &&
          !err &&
          grouped.map(([date, list]) => {
            const canSubmitThisDay =
              daySubmitting === null &&
              list.some((j) => isOwner(j) && j.status === "saved" && j.locked === false);

            const isBusyDay = daySubmitting === date;

            // Day totals (for header pill)
            let dayHours = 0;
            let dayKm = 0;

            for (const j of list) {
              const d1 = makeDayjsFromJob(j.job_date, j.depart);
              const d2 = makeDayjsFromJob(j.job_date, j.fin);
              dayHours += hoursBetween(d1, d2) || 0;

              const kmAller = Number(j.km_aller ?? 0) || 0;
              dayKm += kmAller;
            }

            const dayHHmm = toHHmmLabelFromFormatHours(formatHours(dayHours));

            return (
              <div key={date} style={{ marginBottom: 14 }}>
                {/* Day Header */}
                <div style={styles.dayHeaderRow}>
                  <div>
                    <div style={styles.dateHeader}>{dayjs(date).format("DD MMM YYYY")}</div>
                    <div style={styles.dayMeta}>
                      {dayHHmm} <span style={styles.dot}>•</span> {Math.round(dayKm)} km
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canSubmitThisDay || isBusyDay}
                    onClick={() => submitDay(date, list)}
                    style={{
                      ...styles.primaryBtn,
                      opacity: canSubmitThisDay && !isBusyDay ? 1 : 0.5,
                    }}
                    title="Submit all saved jobs for the day"
                  >
                    {isBusyDay ? "Submitting…" : "Submit day"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {list.map((j) => {
                    const d1 = makeDayjsFromJob(j.job_date, j.depart);
                    const d2 = makeDayjsFromJob(j.job_date, j.fin);

                    const totalHours = hoursBetween(d1, d2) || 0;
                    const totalHHmm = toHHmmLabelFromFormatHours(formatHours(totalHours));

                    const kmLabel = Math.round(Number(j.km_aller ?? 0) || 0);

                    const showOpen = canOpen(j);
                    const showDelete = canDelete(j);

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

                        <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
                          Depart: {fmtTimeHHmm(j.depart)} • Arrival: {fmtTimeHHmm(j.arrivee)} • End:{" "}
                          {fmtTimeHHmm(j.fin)}
                        </div>

                        <div style={styles.footerRow}>
                          <span style={{ ...styles.badge, ...badgeStyle(j.status) }}>{j.status}</span>

                          {(showOpen || showDelete) && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              {showOpen && (
                                <button
                                  disabled={busy}
                                  onClick={() => openJob(j)}
                                  style={styles.openBtn}
                                  title="Open this saved job to edit"
                                  type="button"
                                >
                                  {busy ? "…" : "OPEN"}
                                </button>
                              )}

                              {showDelete && (
                                <button
                                  disabled={busy}
                                  onClick={() => deleteJob(j.id)}
                                  style={styles.deleteBtn}
                                  title="Delete this saved job"
                                  type="button"
                                >
                                  {busy ? "…" : "DELETE"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                          Locked: <b>{j.locked ? "true" : "false"}</b>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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

  dayHeaderRow: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },

  dateHeader: { fontSize: 16, fontWeight: 900 },
  dayMeta: { fontSize: 12, color: "#666", marginTop: 2 },
  dot: { margin: "0 8px", color: "rgba(0,0,0,0.35)" },

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
  openBtn: {
    background: "#f5f5f5",
    color: "#111",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  deleteBtn: {
    background: "rgba(220,20,60,0.08)",
    color: "crimson",
    border: "1px solid rgba(220,20,60,0.2)",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
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
