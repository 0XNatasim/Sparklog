import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween } from "../lib/time";

dayjs.extend(isoWeek);
dayjs.locale("en");

function makeDayjsFromJob(job_date, timeStr) {
  if (!job_date || !timeStr) return null;
  const d = dayjs(`${job_date}T${timeStr}`);
  return d.isValid() ? d : null;
}

function formatHoursHM(hours) {
  if (!hours || hours <= 0) return "0h00";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function Week() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("user_id", user?.id)
        .order("job_date", { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (e) {
      setErr(e?.message || "Failed to load weekly summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const weekly = useMemo(() => {
    const map = new Map();

    for (const j of jobs) {
      const d1 = makeDayjsFromJob(j.job_date, j.depart);
      const d2 = makeDayjsFromJob(j.job_date, j.fin);
      const hours = hoursBetween(d1, d2) || 0;
      const km = j.km_aller ?? 0;

      const weekStart = dayjs(j.job_date).startOf("isoWeek");
      const key = weekStart.format("YYYY-[W]WW");

      if (!map.has(key)) {
        map.set(key, {
          start: weekStart,
          end: weekStart.endOf("isoWeek"),
          totalHours: 0,
          totalKm: 0,
          otCount: 0,
        });
      }

      const w = map.get(key);
      w.totalHours += hours;
      w.totalKm += km;
      w.otCount += 1;
    }

    return Array.from(map.values()).sort((a, b) =>
      b.start.isAfter(a.start) ? 1 : -1
    );
  }, [jobs]);

  const formPath = role === "manager" ? "/manager" : "/";

  return (
    <div style={styles.page}>
      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Week Summary</div>
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
          <span style={styles.activeLink}>Week</span>

          {/* Manager */}
          {role === "manager" && (
            <Link to="/manager" style={styles.link}>
              Manager
            </Link>
          )}

          {/* Logout */}
          <button onClick={signOut} style={styles.secondaryBtn}>
            Logout
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={styles.container}>
        {loading && <div style={styles.card}>Loading…</div>}
        {err && <div style={styles.error}>{err}</div>}

        {!loading && !err && weekly.length === 0 && (
          <div style={styles.card}>No data yet.</div>
        )}

        {!loading &&
          !err &&
          weekly.map((w, idx) => (
            <div key={idx} style={styles.card}>
              <div style={styles.weekHeader}>
                Week {w.start.isoWeek()}
              </div>

              <div style={styles.weekLine}>
                {w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")}
              </div>

              <div style={styles.stats}>
                <span>
                  ⏱ <b>{formatHoursHM(w.totalHours)}</b>
                </span>
                <span>
                  🚗 <b>{w.totalKm}</b> km
                </span>
                <span>
                  📄 <b>{w.otCount}</b> OT
                </span>
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
    justifyContent: "space-between",
    alignItems: "center",
  },

  link: {
    color: "#1565c0",
    fontWeight: 900,
    textDecoration: "none",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#1565c0",
    fontWeight: 900,
    cursor: "pointer",
    padding: 0,
    fontSize: 14,
  },
  activeLink: {
    fontWeight: 900,
    color: "#111",
    fontSize: 14,
  },

  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  weekHeader: {
    fontWeight: 900,
    fontSize: 15,
    marginBottom: 4,
  },
  weekLine: {
    fontSize: 13,
    color: "#555",
    marginBottom: 10,
  },

  stats: {
    display: "flex",
    gap: 16,
    fontSize: 14,
    flexWrap: "wrap",
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
