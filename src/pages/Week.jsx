import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween } from "../lib/time";

dayjs.extend(isoWeek);
dayjs.locale("en");

// ===== Overtime rules =====
// Daily: first 8h at 1.0x, remainder is overtime.
// Weekly overtime tiering (across accumulated daily overtime):
// - first 1 overtime hour in the week => 1.5x
// - remaining overtime hours in that week => 2.0x
const DAILY_REGULAR_HOURS = 8;
const WEEKLY_OT_FIRST_TIER_HOURS = 1;

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function roundToQuarterHour(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.round(h * 4) / 4; // 0.25h increments
}

function formatHoursHM(hours) {
  if (!hours || hours <= 0) return "0h00";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function splitWeekBucketsFromDailyTotals(dayHoursMap) {
  let hours_1x = 0;
  let overtime_total = 0;

  for (const raw of dayHoursMap.values()) {
    const dayHours = roundToQuarterHour(raw);
    hours_1x += Math.min(DAILY_REGULAR_HOURS, dayHours);
    overtime_total += Math.max(0, dayHours - DAILY_REGULAR_HOURS);
  }

  const hours_15x = Math.min(WEEKLY_OT_FIRST_TIER_HOURS, overtime_total);
  const hours_2x = Math.max(0, overtime_total - WEEKLY_OT_FIRST_TIER_HOURS);

  return { hours_1x, hours_15x, hours_2x };
}

export default function Week() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
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
      setErr(e?.message || "Failed to load weekly summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  const weekly = useMemo(() => {
    const map = new Map();

    for (const j of jobs) {
      // If you want payroll-only week stats, uncomment:
      // if (j.status !== "approved") continue;

      const d1 = makeDayjsFromJob(j.job_date, j.depart);
      const d2 = makeDayjsFromJob(j.job_date, j.fin);
      const hours = roundToQuarterHour(hoursBetween(d1, d2) || 0);
      const km = j.km_aller ?? 0;

      const weekStart = dayjs(j.job_date).startOf("isoWeek");
      const key = weekStart.format("YYYY-[W]WW");

      if (!map.has(key)) {
        map.set(key, {
          start: weekStart,
          end: weekStart.endOf("isoWeek"),
          totalKm: 0,
          dayHours: new Map(), // "YYYY-MM-DD" -> hours
        });
      }

      const w = map.get(key);
      w.totalKm += km;

      const dayKey = dayjs(j.job_date).format("YYYY-MM-DD");
      const prev = w.dayHours.get(dayKey) || 0;
      w.dayHours.set(dayKey, prev + hours);
    }

    const out = [];
    for (const w of map.values()) {
      let totalHours = 0;
      for (const h of w.dayHours.values()) totalHours += roundToQuarterHour(h);

      const { hours_1x, hours_15x, hours_2x } = splitWeekBucketsFromDailyTotals(w.dayHours);

      out.push({
        start: w.start,
        end: w.end,
        totalKm: w.totalKm,
        totalHours,
        hours1x: hours_1x,
        hours15x: hours_15x,
        hours2x: hours_2x,
      });
    }

    return out.sort((a, b) => (b.start.isAfter(a.start) ? 1 : -1));
  }, [jobs]);

  return (
    <div style={styles.page}>
      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div style={styles.brandBlock}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Week</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {user?.email}
            {role ? (
              <>
                <br />
                role: {role}
              </>
            ) : null}
          </div>
        </div>

        <div style={styles.nav}>
          <button onClick={() => navigate("/")} style={styles.linkBtn} type="button">
            Form
          </button>

          <Link to="/history" style={styles.link}>
            History
          </Link>

          <span style={styles.activeLink}>Week</span>

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

      {/* CONTENT */}
      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}

        {!loading && !err && weekly.length === 0 && <div style={styles.card}>No data yet.</div>}

        {!loading &&
          !err &&
          weekly.map((w, idx) => {
            const weekNum = w.start.isoWeek();
            const rangeLeft = `${w.start.format("DD MMM")} → ${w.end.format("DD MMM YYYY")}`;

            return (
              <div key={idx} style={styles.weekCard}>
                {/* Row 1 */}
                <div style={styles.r1l}>Week {weekNum}</div>
                <div style={styles.r1r}>
                  <span style={styles.bucketLabel}>1x:</span>
                  <span style={styles.bucketValue}>{formatHoursHM(w.hours1x)}</span>
                </div>

                {/* Row 2 */}
                <div style={styles.r2l}>{rangeLeft}</div>
                <div style={styles.r2r}>
                  <span style={styles.bucketLabel}>1.5x:</span>
                  <span style={styles.bucketValue}>{formatHoursHM(w.hours15x)}</span>
                </div>

                {/* Row 3 */}
                <div style={styles.r3l}>
                  <span>
                    Total: <b>{formatHoursHM(w.totalHours)}</b>
                  </span>
                  <span style={{ opacity: 0.4 }}> </span>
                  <span>
                    <b>{w.totalKm}</b> km
                  </span>
                </div>
                <div style={styles.r3r}>
                  <span style={styles.bucketLabel}>2.0x:</span>
                  <span style={styles.bucketValue}>{formatHoursHM(w.hours2x)}</span>
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

  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  // === Card layout matching your reference ===
  weekCard: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",

    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gridTemplateRows: "auto auto auto",
    columnGap: 24,
    rowGap: 8,
    alignItems: "start",
  },

  // Left column rows
  r1l: { gridColumn: "1", gridRow: "1", fontWeight: 900, fontSize: 16, color: "#111" },
  r2l: { gridColumn: "1", gridRow: "2", fontSize: 13, color: "#555" },
  r3l: {
    gridColumn: "1",
    gridRow: "3",
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#111",
  },

  // Right column rows (label/value aligned)
  r1r: { gridColumn: "2", gridRow: "1", ...bucketRow },
  r2r: { gridColumn: "2", gridRow: "2", ...bucketRow },
  r3r: { gridColumn: "2", gridRow: "3", ...bucketRow },

  bucketLabel: { color: "#555", fontWeight: 800 },
  bucketValue: { fontWeight: 900, color: "#111", whiteSpace: "nowrap" },

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

const bucketRow = {
  width: "100%",
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 13,
};
