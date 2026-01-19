// src/pages/Week.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween } from "../lib/time";

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);
dayjs.locale("en");

/**
 * job_date can be:
 * - "YYYY-MM-DD" (date)
 * - ISO string timestamp
 * - sometimes other date-ish formats
 */
function parseJobDate(job_date) {
  if (!job_date) return null;

  const formats = [
    "YYYY-MM-DD",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "DD MMM YYYY",
  ];

  for (const f of formats) {
    const d = dayjs(job_date, f, true);
    if (d.isValid()) return d;
  }

  const d = dayjs(job_date);
  return d.isValid() ? d : null;
}

function makeDayTime(job_date, timeStr) {
  const d = parseJobDate(job_date);
  if (!d || !timeStr) return null;

  const t = String(timeStr).slice(0, 5);
  const dt = dayjs(`${d.format("YYYY-MM-DD")}T${t}`);
  return dt.isValid() ? dt : null;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatHoursHM(hoursFloat) {
  const totalMinutes = Math.round((hoursFloat || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function isNonEmptyOT(ot) {
  return String(ot || "").trim().length > 0;
}

export default function Week() {
  const navigate = useNavigate();
  const { user, role, signOut } = useAuth();
  const [searchParams] = useSearchParams();

  // Manager can view an employee week via: /week?employee=<uuid>
  const employeeIdParam = searchParams.get("employee");
  const isManagerViewingEmployee = role === "manager" && Boolean(employeeIdParam);
  const effectiveUserId = isManagerViewingEmployee ? employeeIdParam : user?.id;

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Which week is expanded (weekKey = weekStart YYYY-MM-DD)
  const [openWeekKey, setOpenWeekKey] = useState(null);

  async function load() {
    setErr("");
    setLoading(true);

    try {
      if (!effectiveUserId) {
        setJobs([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("user_id", effectiveUserId)
        .order("job_date", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load weekly data.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  /**
   * Build daily totals (for recap panel), then aggregate into weeks.
   * Day totals include:
   * - hours: sum of depart->fin durations
   * - km: sum of km_aller only
   * - otCount: count of jobs with non-empty OT for that day
   */
  const { weekly, dailyByKey } = useMemo(() => {
    // dayKey = YYYY-MM-DD
    const dailyMap = new Map();

    for (const j of jobs) {
      const d = parseJobDate(j.job_date);
      if (!d) continue;

      const dayKey = d.format("YYYY-MM-DD");

      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, {
          date: d,
          hours: 0,
          km: 0,
          otCount: 0,
          jobCount: 0,
        });
      }

      const day = dailyMap.get(dayKey);
      day.jobCount += 1;

      // Hours (only if we have valid times)
      const d1 = makeDayTime(j.job_date, j.depart);
      const d2 = makeDayTime(j.job_date, j.fin);
      if (d1 && d2) {
        day.hours += hoursBetween(d1, d2) || 0;
      }

      // KM: km_aller only
      const kmAller = Number(j.km_aller ?? 0) || 0;
      day.km += kmAller;

      // OT count: job has a non-empty ot value
      if (isNonEmptyOT(j.ot)) {
        day.otCount += 1;
      }
    }

    // weeklyMap: key=weekStart YYYY-MM-DD -> week totals + day keys
    const weeklyMap = new Map();

    for (const day of dailyMap.values()) {
      const weekStart = day.date.startOf("isoWeek");
      const weekKey = weekStart.format("YYYY-MM-DD");

      const regular = clamp(day.hours, 0, 8);
      const overtime = Math.max(day.hours - 8, 0);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          start: weekStart,
          end: weekStart.endOf("isoWeek"),
          regularHours: 0,
          overtimeHours: 0,
          totalKm: 0,
          dayKeys: [],
        });
      }

      const w = weeklyMap.get(weekKey);
      w.regularHours += regular;
      w.overtimeHours += overtime;
      w.totalKm += day.km;
      w.dayKeys.push(day.date.format("YYYY-MM-DD"));
    }

    const weeklyArr = Array.from(weeklyMap.values()).map((w) => {
      const ot15 = Math.min(w.overtimeHours, 1); // first hour at 1.5x
      const ot20 = Math.max(w.overtimeHours - 1, 0);

      // Unique + sort day keys (desc, newest day first)
      const uniqueDayKeys = Array.from(new Set(w.dayKeys)).sort((a, b) =>
        dayjs(a).isAfter(dayjs(b)) ? -1 : 1
      );

      return {
        ...w,
        ot15,
        ot20,
        totalHours: w.regularHours + w.overtimeHours,
        dayKeys: uniqueDayKeys,
      };
    });

    // Sort weeks newest first
    weeklyArr.sort((a, b) => (a.start.isAfter(b.start) ? -1 : 1));

    return { weekly: weeklyArr, dailyByKey: dailyMap };
  }, [jobs]);

  function toggleWeek(weekKey) {
    setOpenWeekKey((prev) => (prev === weekKey ? null : weekKey));
  }

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div style={styles.page}>
      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div style={styles.brandBlock}>
          <div style={styles.title}>Week</div>
          <div style={styles.subTitle}>{user?.email}</div>
          <div style={styles.subTitle}>role: {role}</div>
        </div>

        <div style={styles.nav}>
          <Link to="/form" style={styles.link}>
            Form
          </Link>
          <Link to="/history" style={styles.link}>
            History
          </Link>

          <span style={styles.activeLink}>Week</span>

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

      {/* CONTENT */}
      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}

        {!loading && !err && weekly.length === 0 && <div style={styles.card}>No data yet.</div>}

        {!loading &&
          !err &&
          weekly.map((w) => {
            const weekKey = w.start.format("YYYY-MM-DD");
            const isOpen = openWeekKey === weekKey;

            return (
              <div key={weekKey} style={{ marginBottom: 12 }}>
                {/* WEEK CARD (clickable) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleWeek(weekKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleWeek(weekKey);
                  }}
                  style={{
                    ...styles.card,
                    cursor: "pointer",
                    borderColor: isOpen ? "rgba(21,101,192,0.35)" : "#eee",
                  }}
                  title="Click to open weekly recap"
                >
                  <div style={styles.cardGrid}>
                    {/* LEFT */}
                    <div style={styles.leftBlock}>
                      <div style={styles.weekHeader}>
                        Week {w.start.isoWeek()}{" "}
                        <span style={styles.chev}>{isOpen ? "▾" : "▸"}</span>
                      </div>

                      <div style={styles.weekLine}>
                        {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")}
                      </div>

                      <div style={styles.totalLine}>
                        Total: <b>{formatHoursHM(w.totalHours)}</b>{" "}
                        <span style={styles.dot}>•</span> <b>{Math.round(w.totalKm)}</b> km
                      </div>
                    </div>

                    {/* RIGHT */}
                    <div style={styles.rightBlock}>
                      <div style={styles.bucketRow}>
                        <span style={styles.bucketLabel}>1x:</span>
                        <span style={styles.bucketValue}>{formatHoursHM(w.regularHours)}</span>
                      </div>

                      <div style={styles.bucketRow}>
                        <span style={styles.bucketLabel}>1.5x:</span>
                        <span style={styles.bucketValue}>{formatHoursHM(w.ot15)}</span>
                      </div>

                      <div style={styles.bucketRow}>
                        <span style={styles.bucketLabel}>2.0x:</span>
                        <span style={styles.bucketValue}>{formatHoursHM(w.ot20)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* WEEKLY RECAP PANEL */}
                {isOpen && (
                  <div style={styles.recapPanel}>
                    {w.dayKeys.length === 0 && (
                      <div style={styles.recapEmpty}>No days found for this week.</div>
                    )}

                    {w.dayKeys.map((dayKey) => {
                      const day = dailyByKey.get(dayKey);
                      if (!day) return null;

                      return (
                        <div key={dayKey} style={styles.dayLine}>
                          <div style={styles.dayLeft}>
                            <div style={styles.dayDate}>
                              {day.date.format("DD MMM YYYY")}
                            </div>
                          </div>

                          <div style={styles.dayRight}>
                            <span style={styles.dayPill}>
                              <b>{formatHoursHM(day.hours)}</b>
                            </span>

                            <span style={styles.dayPill}>
                              <b>{Math.round(day.km)}</b> km
                            </span>

                            <span style={styles.dayPill}>
                              OT x<b>{day.otCount}</b>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f5f5f5", padding: 16 },
  container: { maxWidth: 900, margin: "0 auto" },

  topbar: {
    maxWidth: 900,
    margin: "0 auto 12px auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  brandBlock: { display: "grid", gap: 2 },
  title: { fontSize: 34, fontWeight: 900, lineHeight: 1.05 },
  subTitle: { fontSize: 14, color: "rgba(0,0,0,0.55)" },

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
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },

  // 2-column layout that stays 2 columns on mobile
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 16,
    alignItems: "center",
  },

  leftBlock: { display: "grid", gap: 6 },
  rightBlock: { display: "grid", gap: 6, minWidth: 140 },

  weekHeader: { fontSize: 22, fontWeight: 900, display: "flex", alignItems: "center", gap: 8 },
  chev: { fontSize: 18, color: "rgba(0,0,0,0.45)", fontWeight: 900 },

  weekLine: { fontSize: 16, color: "rgba(0,0,0,0.6)" },

  totalLine: { fontSize: 16, color: "rgba(0,0,0,0.85)" },
  dot: { margin: "0 8px", color: "rgba(0,0,0,0.35)" },

  bucketRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  bucketLabel: { fontWeight: 900, color: "rgba(0,0,0,0.6)" },
  bucketValue: { fontWeight: 900, fontSize: 18 },

  recapPanel: {
    marginTop: 10,
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 16,
    padding: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 10,
  },

  recapEmpty: { color: "#666", fontSize: 13, padding: 6 },

  // Day lines (like History day separators, but compact)
  dayLine: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  dayLeft: { display: "grid", gap: 2 },
  dayDate: { fontSize: 15, fontWeight: 900 },

  dayRight: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
  },

  dayPill: {
    border: "1px solid #eee",
    background: "#fafafa",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
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
};
