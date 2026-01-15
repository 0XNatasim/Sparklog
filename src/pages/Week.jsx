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

  // Common formats we may encounter
  const formats = [
    "YYYY-MM-DD",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "DD MMM YYYY",
  ];

  // Try strict parse first
  for (const f of formats) {
    const d = dayjs(job_date, f, true);
    if (d.isValid()) return d;
  }

  // Fallback to dayjs native parse
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
   * Build daily totals first (so we can compute OT per day),
   * then aggregate into weeks.
   */
  const weekly = useMemo(() => {
    // dailyMap: key=YYYY-MM-DD -> { date, hours, km }
    const dailyMap = new Map();

    for (const j of jobs) {
      // Only count jobs that have depart/fin + valid date
      const d = parseJobDate(j.job_date);
      if (!d) continue;

      const d1 = makeDayTime(j.job_date, j.depart);
      const d2 = makeDayTime(j.job_date, j.fin);
      if (!d1 || !d2) continue;

      const hours = hoursBetween(d1, d2) || 0;

      // km: include aller + retour when present
      const kmAller = Number(j.km_aller ?? 0) || 0;
      const kmRetour = Number(j.km_retour ?? 0) || 0;
      const km = kmAller + kmRetour;

      const dayKey = d.format("YYYY-MM-DD");

      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, { date: d, hours: 0, km: 0 });
      }
      const day = dailyMap.get(dayKey);
      day.hours += hours;
      day.km += km;
    }

    // weeklyMap: key=weekStart YYYY-MM-DD -> buckets
    const weeklyMap = new Map();

    for (const day of dailyMap.values()) {
      const weekStart = day.date.startOf("isoWeek");
      const weekKey = weekStart.format("YYYY-MM-DD"); // robust, unique

      const regular = clamp(day.hours, 0, 8);
      const overtime = Math.max(day.hours - 8, 0);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          start: weekStart,
          end: weekStart.endOf("isoWeek"),
          regularHours: 0,
          overtimeHours: 0,
          totalKm: 0,
        });
      }

      const w = weeklyMap.get(weekKey);
      w.regularHours += regular;
      w.overtimeHours += overtime;
      w.totalKm += day.km;
    }

    // Convert to array, compute OT split
    const arr = Array.from(weeklyMap.values()).map((w) => {
      const ot15 = Math.min(w.overtimeHours, 1); // first hour at 1.5x
      const ot20 = Math.max(w.overtimeHours - 1, 0);

      return {
        ...w,
        ot15,
        ot20,
        totalHours: w.regularHours + w.overtimeHours,
      };
    });

    // Sort newest week first
    arr.sort((a, b) => (a.start.isAfter(b.start) ? -1 : 1));
    return arr;
  }, [jobs]);

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
          weekly.map((w) => (
            <div key={w.start.format("YYYY-MM-DD")} style={styles.card}>
              <div style={styles.cardGrid}>
                {/* LEFT */}
                <div style={styles.leftBlock}>
                  <div style={styles.weekHeader}>Week {w.start.isoWeek()}</div>
                  <div style={styles.weekLine}>
                    {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")}
                  </div>

                  <div style={styles.totalLine}>
                    Total: <b>{formatHoursHM(w.totalHours)}</b> <span style={styles.dot}>•</span>{" "}
                    <b>{Math.round(w.totalKm)}</b> km
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
          ))}
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
    marginBottom: 12,
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

  weekHeader: { fontSize: 22, fontWeight: 900 },
  weekLine: { fontSize: 16, color: "rgba(0,0,0,0.6)" },

  totalLine: { fontSize: 16, color: "rgba(0,0,0,0.85)" },
  dot: { margin: "0 8px", color: "rgba(0,0,0,0.35)" },

  bucketRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  bucketLabel: { fontWeight: 900, color: "rgba(0,0,0,0.6)" },
  bucketValue: { fontWeight: 900, fontSize: 18 },

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
