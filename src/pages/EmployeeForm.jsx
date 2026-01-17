import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/en";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { hoursBetween, formatHours } from "../lib/time";

dayjs.locale("en");

function fmtTimeHHmm(t) {
  if (!t) return "";
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

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default function EmployeeForm() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const editId = searchParams.get("edit");

  // Split loading states (prevents weird UX / “nothing happens”)
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // Form fields
  const [job_date, setJobDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [ot, setOt] = useState("");
  const [depart, setDepart] = useState("07:00");
  const [arrivee, setArrivee] = useState("08:00");
  const [fin, setFin] = useState("16:00");

  const [km_aller, setKmAller] = useState(""); // string for input UX

  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState("saved");

  const departDj = useMemo(() => makeDayjsFromJob(job_date, depart), [job_date, depart]);
  const finDj = useMemo(() => makeDayjsFromJob(job_date, fin), [job_date, fin]);

  const hoursDecimal = useMemo(() => hoursBetween(departDj, finDj) || 0, [departDj, finDj]);
  const hoursLabel = useMemo(() => toHHmmLabelFromFormatHours(formatHours(hoursDecimal)), [hoursDecimal]);

  async function loadEdit() {
    if (!editId || !user?.id) return;

    setErr("");
    setInfo("");
    setLoadingEdit(true);

    try {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", editId).single();
      if (error) throw error;
      if (!data) throw new Error("Job not found.");
      if (data.user_id !== user.id) throw new Error("Not authorized.");

      setJobDate(data.job_date || dayjs().format("YYYY-MM-DD"));
      setOt(data.ot || "");
      setDepart(fmtTimeHHmm(data.depart) || "07:00");
      setArrivee(fmtTimeHHmm(data.arrivee) || "08:00");
      setFin(fmtTimeHHmm(data.fin) || "16:00");

      const aller = data.km_aller ?? "";
      setKmAller(aller === null || aller === undefined ? "" : String(aller));

      setLocked(Boolean(data.locked));
      setStatus(data.status || "saved");
    } catch (e) {
      setErr(e?.message || "Failed to load job.");
    } finally {
      setLoadingEdit(false);
    }
  }

  useEffect(() => {
    loadEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, user?.id]);

  async function saveJob(nextStatus = "saved") {
    if (!user?.id) {
      setErr("Not signed in.");
      return;
    }

    // Prevent double-taps on mobile
    if (saving) return;

    setErr("");
    setInfo("");
    setSaving(true);

    try {
      const kmAllerNum = normalizeNumber(km_aller) ?? 0;

      const payload = {
        user_id: user.id,
        job_date,
        ot,
        depart,
        arrivee,
        fin,
        km_aller: kmAllerNum,
        // KM retour removed
        status: nextStatus,
        locked: nextStatus !== "saved",
      };

      if (editId) {
        // Update existing
        const { error } = await supabase.from("jobs").update(payload).eq("id", editId);
        if (error) throw error;

        setInfo(nextStatus === "submitted" ? "Job submitted." : "Job updated.");
        setStatus(nextStatus);
        setLocked(nextStatus !== "saved");
      } else {
        // Insert new + return id, then go to edit mode so future saves are updates
        const { data, error } = await supabase.from("jobs").insert(payload).select("id").single();
        if (error) throw error;
        if (!data?.id) throw new Error("Insert succeeded but no id returned.");

        setInfo(nextStatus === "submitted" ? "Job saved and submitted." : "Job saved.");
        setStatus(nextStatus);
        setLocked(nextStatus !== "saved");

        // IMPORTANT: navigate to edit view to avoid “saved but feels like nothing happened”
        navigate(`/form?edit=${data.id}`, { replace: true });
      }
    } catch (e) {
      setErr(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const disableInputs = locked || loadingEdit || saving;

  return (
    <div style={styles.page}>
      {/* TOPBAR */}
      <div style={styles.topbar}>
        <div style={styles.brandBlock}>
          <div style={styles.pageTitle}>Form</div>
          <div style={styles.subText}>
            {user?.email}
            <br />
            role: {role}
          </div>
        </div>

        {/* Menu order: Form History Week Manager Logout */}
        <div style={styles.nav}>
          <span style={styles.activeLink}>Form</span>

          <Link to="/history" style={styles.link}>
            History
          </Link>

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
        {err && <div style={styles.error}>{err}</div>}
        {info && <div style={styles.info}>{info}</div>}

        <div style={styles.card}>
          <div style={styles.grid}>
            <div style={styles.field}>
              <div style={styles.label}>Date</div>
              <input
                type="date"
                value={job_date}
                onChange={(e) => setJobDate(e.target.value)}
                style={styles.input}
                disabled={disableInputs}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Work order (OT)</div>
              <input
                value={ot}
                onChange={(e) => setOt(e.target.value)}
                placeholder="ex: 12345"
                style={styles.input}
                disabled={disableInputs}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Depart</div>
              <input
                type="time"
                value={depart}
                onChange={(e) => setDepart(e.target.value)}
                style={styles.input}
                disabled={disableInputs}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Arrival</div>
              <input
                type="time"
                value={arrivee}
                onChange={(e) => setArrivee(e.target.value)}
                style={styles.input}
                disabled={disableInputs}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>End</div>
              <input
                type="time"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                style={styles.input}
                disabled={disableInputs}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>KM (aller)</div>
              <input
                type="number"
                value={km_aller}
                onChange={(e) => setKmAller(e.target.value)}
                style={styles.input}
                disabled={disableInputs}
                placeholder="0"
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Total hours</div>
              <div style={styles.readonlyBox}>{hoursLabel}</div>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Status</div>
              <div style={styles.readonlyBox}>{status}</div>
            </div>
          </div>

          <div style={styles.actions}>
            <button type="button" style={styles.primaryBtn} disabled={disableInputs} onClick={() => saveJob("saved")}>
              {saving ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              style={styles.secondaryBtn}
              disabled={disableInputs}
              onClick={() => saveJob("submitted")}
            >
              {saving ? "Submitting..." : "Submit"}
            </button>

            {editId && (
              <button type="button" style={styles.ghostBtn} onClick={() => navigate("/form")} disabled={loadingEdit || saving}>
                New job
              </button>
            )}
          </div>

          {locked && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
              This job is locked ({status}). You can only edit when it is <b>saved</b> and unlocked.
            </div>
          )}
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
  activeLink: { fontWeight: 900, color: "#111", fontSize: 14 },

  card: {
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
  },

  grid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  },

  readonlyBox: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    background: "#f8f8f8",
    fontWeight: 900,
    color: "#111",
  },

  actions: { display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" },

  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "1px solid #1565c0",
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
  ghostBtn: {
    background: "transparent",
    color: "#1565c0",
    border: "1px solid #e0e0e0",
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