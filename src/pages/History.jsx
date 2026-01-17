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
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function toHHmmLabelFromFormatHours(formatHoursResult) {
  const num = Number(String(formatHoursResult).replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return "0h00";
  const totalMinutes = Math.round(num * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}h${String(mm).padStart(2, "0")}`;
}

function kmTotal(job) {
  const a = Number(job?.km_aller ?? 0) || 0;
  const r = Number(job?.km_retour ?? 0) || 0;
  return a + r;
}

export default function History() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [actionLoadingKey, setActionLoadingKey] = useState(null); // can be jobId or "day:YYYY-MM-DD"

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

  function sumHoursForJobs(list) {
    let total = 0;
    for (const j of list) {
      const d1 = makeDayjsFromJob(j.job_date, j.depart);
      const d2 = makeDayjsFromJob(j.job_date, j.fin);
      total += hoursBetween(d1, d2) || 0;
    }
    return total;
  }

  function sumKmForJobs(list) {
    let total = 0;
    for (const j of list) total += kmTotal(j);
    return Math.round(total * 100) / 100;
  }

  const grouped = useMemo(() => {
    const map = new Map();

    for (const j of jobs) {
      const key = dayjs(j.job_date).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(j);
    }

    return Array.from(map.entries()).map(([date, list]) => {
      const totalHours = sumHoursForJobs(list);
      const totalHHmm = toHHmmLabelFromFormatHours(formatHours(totalHours));
      const totalKm = sumKmForJobs(list);

      // day-submittable ids: saved + unlocked
      const submittableIds = list
        .filter((x) => x.status === "saved" && x.locked === false)
        .map((x) => x.id);

      return { date, list, totalHHmm, totalKm, submittableIds };
    });
  }, [jobs]);

  function openJob(job) {
    navigate(`/?edit=${job.id}`);
  }

  function isOwner(job) {
    return Boolean(user?.id) && job.user_id === user.id;
  }

  function canOpen(job) {
    return isOwner(job) && job.status === "saved" && job.locked === false;
  }

  function canDelete(job) {
    return isOwner(job) && job.status === "saved" && job.locked === false;
  }

  function canSubmit(job) {
    return isOwner(job) && job.status === "saved" && job.locked === false;
  }

  async function deleteJob(jobId) {
    const ok = window.confirm("Delete this job? This cannot be undone.");
    if (!ok) return;

    setActionLoadingKey(jobId);
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
      setActionLoadingKey(null);
    }
  }

  async function submitJob(jobId) {
    const ok = window.confirm("Submit this job? After submit it will be locked.");
    if (!ok) return;

    setActionLoadingKey(jobId);
    setErr("");
    setInfo("");

    try {
      const { error } = await supabase.from("jobs").update({ status: "submitted", locked: true }).eq("id", jobId);
      if (error) throw error;

      setInfo("Job submitted.");
      await load();
    } catch (e) {
      setErr(e?.message || "Submit failed.");
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function submitDay(dateKey, ids) {
    if (!ids || ids.length === 0) return;

    const ok = window.confirm(`Submit all saved jobs for ${dayjs(dateKey).format("DD MMM YYYY")}?`);
    if (!ok) return;

    const actionKey = `day:${dateKey}`;
    setActionLoadingKey(actionKey);
    setErr("");
    setInfo("");

    try {
      const { error } = await supabase.from("jobs").update({ status: "submitted", locked: true }).in("id", ids);
      if (error) throw error;

      setInfo(`Day submitted (${ids.length} job(s)).`);
      await load();
    } catch (e) {
      setErr(e?.message || "Submit day failed.");
    } finally {
      setActionLoadingKey(null);
    }
  }

  return (
    <div style={styles.page}>
      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div style={styles.brandBlock}>
          <div style={styles.pageTitle}>History</div>
          <div style={styles.subText}>
            {user?.email}
            <br />
            role: {role}
          </div>
        </div>

        {/* unified order: Form History Week Manager Logout */}
        <div style={styles.nav}>
          <button onClick={() => navigate("/")} style={styles.linkBtn} type="button">
            Form
          </button>

          <span style={styles.activeLink}>History</span>

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

      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        {!loading && !err && grouped.length === 0 && <div style={styles.card}>No jobs yet.</div>}

        {!loading &&
          !err &&
          grouped.map((g) => {
            const dayActionKey = `day:${g.date}`;
            const dayBusy = actionLoadingKey === dayActionKey;
            const dayCanSubmit = g.submittableIds.length > 0;

            return (
              <div key={g.date} style={{ marginBottom: 14 }}>
                {/* ✅ Day header row with SUBMIT DAY button */}
                <div style={styles.dayHeaderRow}>
                  <div style={styles.dateHeader}>
                    {dayjs(g.date).format("DD MMM YYYY")} • <b>{g.totalHHmm}</b> • <b>{g.totalKm}</b> km
                  </div>

                  {dayCanSubmit && (
                    <button
                      type="button"
                      disabled={dayBusy}
                      onClick={() => submitDay(g.date, g.submittableIds)}
                      style={styles.submitDayBtn}
                      title="Submit all saved jobs for this day"
                    >
                      {dayBusy ? "…" : "SUBMIT DAY"}
                    </button>
                  )}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {g.list.map((j) => {
                    const d1 = makeDayjsFromJob(j.job_date, j.depart);
                    const d2 = makeDayjsFromJob(j.job_date, j.fin);
                    const totalHours = hoursBetween(d1, d2);

                    const totalLabelRaw = formatHours(totalHours);
                    const totalHHmm = toHHmmLabelFromFormatHours(totalLabelRaw);

                    const a = Number(j.km_aller ?? 0) || 0;
                    const r = Number(j.km_retour ?? 0) || 0;
                    const km = a + r;

                    const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";

                    const showOpen = canOpen(j);
                    const showDelete = canDelete(j);
                    const showSubmit = canSubmit(j);

                    const busy = actionLoadingKey === j.id;

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
                                  KM: <b>{km}</b>
                                  {r > 0 ? (
                                    <span style={{ fontWeight: 700, color: "#555" }}> (A: {a} / R: {r})</span>
                                  ) : null}
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

                            {(showOpen || showDelete || showSubmit) && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {showOpen && (
                                  <button
                                    disabled={busy}
                                    onClick={() => openJob(j)}
                                    style={styles.openBtn}
                                    type="button"
                                  >
                                    {busy ? "…" : "OPEN"}
                                  </button>
                                )}

                                {showSubmit && (
                                  <button
                                    disabled={busy}
                                    onClick={() => submitJob(j.id)}
                                    style={styles.submitBtn}
                                    type="button"
                                  >
                                    {busy ? "…" : "SUBMIT"}
                                  </button>
                                )}

                                {showDelete && (
                                  <button
                                    disabled={busy}
                                    onClick={() => deleteJob(j.id)}
                                    style={styles.deleteBtn}
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brandBlock: { display: "grid", gap: 2 },
  pageTitle: { fontSize: 18, fontWeight: 900 },
  subText: { fontSize: 12, color: "#666" },

  nav: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
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
  activeLink: { fontWeight: 900, color: "#111", fontSize: 14 },

  dayHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 10,
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

  submitDayBtn: {
    background: "rgba(76, 175, 80, 0.12)",
    color: "#1b5e20",
    border: "1px solid rgba(76, 175, 80, 0.28)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
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
  submitBtn: {
    background: "rgba(76, 175, 80, 0.12)",
    color: "#1b5e20",
    border: "1px solid rgba(76, 175, 80, 0.28)",
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