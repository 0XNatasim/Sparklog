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

function fmtTimeHHmm(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function toHHmmLabelFromFormatHours(formatHoursResult) {
  // formatHoursResult is a string like "2.75" (per your current lib)
  // Convert "2.75" => 2h45
  const num = Number(String(formatHoursResult).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "0h00";
  const totalMinutes = Math.round(num * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

function fmtRoleLabel(role) {
  if (!role) return "—";
  return String(role);
}

export default function History() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  async function load() {
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("user_id", user?.id)
        .order("job_date", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.id) return;
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

  const formPath = role === "manager" ? "/manager" : "/";

  // ✅ Electrician OPEN = navigate to form edit mode (only for saved & unlocked)
  function openJob(job) {
    navigate(`/?edit=${job.id}`);
  }

  // ✅ Electrician DELETE (only for saved & unlocked)
  async function deleteJob(jobId) {
    const ok = window.confirm("Delete this job? This cannot be undone.");
    if (!ok) return;

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

  function canOpen(job) {
    return role !== "manager" && job.status === "saved" && job.locked === false;
  }

  function canDelete(job) {
    return role !== "manager" && job.status === "saved" && job.locked === false;
  }

  return (
    <div style={styles.page}>
      {/* ✅ TOPBAR: Title and menu on SAME ROW; email+role BELOW */}
      <div style={styles.topbar}>
        <div style={styles.topRow}>
          <div style={styles.title}>History</div>

          <div style={styles.menu}>
            <button onClick={() => navigate(formPath)} style={styles.linkBtn} type="button">
              Form
            </button>

            <Link to="/week" style={styles.link}>
              Week
            </Link>

            {role === "manager" && (
              <Link to="/manager" style={styles.link}>
                Manager
              </Link>
            )}

            <button onClick={signOut} style={styles.secondaryBtn}>
              Logout
            </button>
          </div>
        </div>

        {/* ✅ email + role BELOW menu (prevents overlap on mobile) */}
        <div style={styles.subRow}>
          <div style={styles.email}>{user?.email}</div>
          <div style={styles.roleLine}>
            Role: <b>{fmtRoleLabel(role)}</b>
          </div>
        </div>
      </div>

      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {!loading && !err && grouped.length === 0 && <div style={styles.card}>No jobs yet.</div>}

        {!loading &&
          !err &&
          grouped.map(([date, list]) => (
            <div key={date} style={{ marginBottom: 14 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={styles.dateHeader}>{dayjs(date).format("DD MMM YYYY")}</div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {list.map((j) => {
                  const d1 = makeDayjsFromJob(j.job_date, j.depart);
                  const d2 = makeDayjsFromJob(j.job_date, j.fin);
                  const totalHours = hoursBetween(d1, d2);

                  const totalLabelRaw = formatHours(totalHours);
                  const totalHHmm = toHHmmLabelFromFormatHours(totalLabelRaw);

                  const kmLabel = j.km_aller ?? 0;

                  const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";

                  const showOpen = canOpen(j);
                  const showDelete = canDelete(j);
                  const busy = actionLoadingId === j.id;

                  return (
                    <div key={j.id} style={styles.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "grid", gap: 6, width: "100%" }}>
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

                          <div style={{ color: "#555", fontSize: 13 }}>
                            Depart: {fmtTimeHHmm(j.depart)} • Arrival: {fmtTimeHHmm(j.arrivee)} • End:{" "}
                            {fmtTimeHHmm(j.fin)}
                          </div>
                        </div>

                        <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                          <span style={{ ...styles.badge, ...badgeStyle(j.status) }}>{j.status}</span>

                          {(showOpen || showDelete) && (
                            <div style={{ display: "flex", gap: 8 }}>
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

                          <div style={{ fontSize: 12, color: "#666" }}>
                            Locked: <b>{j.locked ? "true" : "false"}</b>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>Updated: {updatedLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f5f5f5", padding: 16 },
  container: { maxWidth: 980, margin: "0 auto" },

  // ✅ changed topbar structure
  topbar: {
    maxWidth: 980,
    margin: "0 auto 12px auto",
    display: "grid",
    gap: 6,
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: 900 },

  menu: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  subRow: {
    display: "grid",
    gap: 2,
    fontSize: 12,
    color: "#666",
  },
  email: { wordBreak: "break-word" },
  roleLine: {},

  link: { color: "#1565c0", fontWeight: 900, textDecoration: "none" },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#1565c0",
    fontWeight: 900,
    cursor: "pointer",
    padding: 0,
    fontSize: 14,
  },

  dateHeader: {
    display: "inline-block",
    fontWeight: 800,
    fontSize: 13,
    color: "#444",
    padding: "6px 12px",
    background: "#f1f1f1",
    border: "1px solid #e0e0e0",
    borderRadius: 999,
  },

  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
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

  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
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
    background: "rgba(220,20,60,0.10)",
    color: "crimson",
    border: "1px solid rgba(220,20,60,0.25)",
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
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
