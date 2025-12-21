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
  return String(t).slice(0, 5); // HH:mm
}

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

export default function History() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [actionId, setActionId] = useState(null);

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

  function openJob(jobId) {
    navigate(`/?edit=${jobId}`);
  }

  async function deleteJob(jobId, otLabel) {
    const ok = window.confirm(
      `Delete this SAVED job?\n\nOT: ${otLabel}\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setActionId(jobId);
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
      setActionId(null);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>History</div>
          <div style={{ fontSize: 12, color: "#666" }}>{user?.email}</div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* Form */}
          <button
            onClick={() => navigate(formPath)}
            style={styles.linkBtn}
            type="button"
          >
            Form
          </button>

          {/* Week */}
          <Link to="/week" style={styles.link}>
            Week
          </Link>

          {/* Manager */}
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

      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {!loading && !err && grouped.length === 0 && (
          <div style={styles.card}>No jobs yet.</div>
        )}

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
                  const totalLabel = formatHours(totalHours);
                  const kmLabel = j.km_aller ?? 0;

                  const updatedLabel = j.updated_at
                    ? dayjs(j.updated_at).format("DD MMM HH:mm")
                    : "—";

                  const isSaved = j.status === "saved" && j.locked === false;

                  return (
                    <div key={j.id} style={styles.card}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ display: "grid", gap: 6, width: "100%" }}>
                          <div style={styles.headerRow}>
                            <div style={{ fontWeight: 900, fontSize: 15 }}>OT: {j.ot}</div>

                            <div style={styles.metrics}>
                              <span style={styles.metricPill}>
                                Total: <b>{totalLabel}</b> h
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

                          {/* Actions for SAVED only */}
                          {isSaved && (
                            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                              <button
                                onClick={() => openJob(j.id)}
                                style={styles.primaryBtn}
                                disabled={actionId === j.id}
                                title="Open this job in the form to edit"
                              >
                                OPEN
                              </button>

                              <button
                                onClick={() => deleteJob(j.id, j.ot)}
                                style={styles.dangerBtn}
                                disabled={actionId === j.id}
                                title="Delete this saved job"
                              >
                                {actionId === j.id ? "Deleting…" : "DELETE"}
                              </button>
                            </div>
                          )}
                        </div>

                        <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                          <span style={{ ...styles.badge, ...badgeStyle(j.status) }}>{j.status}</span>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            Locked: <b>{j.locked ? "true" : "false"}</b>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                        Updated: {updatedLabel}
                      </div>
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

  topbar: {
    maxWidth: 980,
    margin: "0 auto 12px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

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

  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },

  dangerBtn: {
    background: "crimson",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "8px 12px",
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
    background: "rgba(76,175,80,0.10)",
    border: "1px solid rgba(76,175,80,0.25)",
    color: "#2e7d32",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
  },
};
