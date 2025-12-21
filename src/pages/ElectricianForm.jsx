import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { TextField } from "@mui/material";

import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";

// ✅ minutes between two dayjs times
function minutesBetween(start, end) {
  if (!start || !end) return null;
  const s = dayjs(start);
  const e = dayjs(end);
  if (!s.isValid() || !e.isValid()) return null;

  // If end < start (rare), treat as invalid
  const diff = e.diff(s, "minute");
  if (diff < 0) return null;
  return diff;
}

function disableMinutesNotQuarter(value, view) {
  if (view === "minutes") {
    return value % 15 !== 0;
  }
  return false;
}

// ✅ format minutes as H.MM (minutes base-60)
function formatHoursMinutesDecimal(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return "—";
  if (!Number.isFinite(totalMinutes)) return "—";

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  // always 2 digits for minutes
  const mm = String(mins).padStart(2, "0");
  return `${hours}.${mm}`;
}

export default function ElectricianForm() {
  const { user, role, fullName, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit"); // job UUID

  const [jobDate, setJobDate] = useState(dayjs());
  const [ot, setOt] = useState("");
  const [depart, setDepart] = useState(null);
  const [arrivee, setArrivee] = useState(null);
  const [fin, setFin] = useState(null);

  // ✅ KM empty by default
  const [km, setKm] = useState(""); // string, so it can be ""

  const [loadedJob, setLoadedJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // ✅ duration in minutes
  const totalMinutes = useMemo(() => minutesBetween(depart, fin), [depart, fin]);

  const isEditing = Boolean(editId);
  const isDraftEditable = loadedJob
    ? loadedJob.status === "saved" && loadedJob.locked === false
    : true;

  const canSubmit = useMemo(() => {
    if (!jobDate || !dayjs(jobDate).isValid()) return false;
    if (!ot.trim()) return false;
    return true;
  }, [jobDate, ot]);

  useEffect(() => {
    let cancelled = false;

    async function loadJob() {
      if (!editId) {
        setLoadedJob(null);
        setMsg("");
        setErr("");
        return;
      }

      setLoading(true);
      setErr("");
      setMsg("");
      try {
        const { data, error } = await supabase
          .from("jobs")
          .select("*")
          .eq("id", editId)
          .single();
        if (error) throw error;

        if (cancelled) return;

        setLoadedJob(data);

        setJobDate(dayjs(data.job_date));
        setOt(data.ot || "");
        setDepart(data.depart ? dayjs(`${data.job_date}T${data.depart}`) : null);
        setArrivee(data.arrivee ? dayjs(`${data.job_date}T${data.arrivee}`) : null);
        setFin(data.fin ? dayjs(`${data.job_date}T${data.fin}`) : null);

        // ✅ keep KM empty if null/undefined/0? (here we keep exact value if present)
        setKm(
          data.km_aller === null || data.km_aller === undefined
            ? ""
            : String(data.km_aller)
        );
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Failed to load draft.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadJob();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  function buildPayload(nextStatus) {
    // ✅ convert km string -> int (or null)
    const kmNum =
      km === "" || km === null || km === undefined
        ? null
        : Number.isFinite(Number(km))
        ? parseInt(km, 10)
        : null;

    return {
      user_id: user.id,
      job_date: dayjs(jobDate).format("YYYY-MM-DD"),
      ot: ot.trim(),
      depart: depart ? dayjs(depart).format("HH:mm:ss") : null,
      arrivee: arrivee ? dayjs(arrivee).format("HH:mm:ss") : null,
      fin: fin ? dayjs(fin).format("HH:mm:ss") : null,
      km_aller: kmNum,
      status: nextStatus,
      locked: nextStatus === "submitted",
    };
  }

  async function saveDraft() {
    setErr("");
    setMsg("");
    if (!canSubmit) return setErr("Please provide Work Date and OT number.");
    if (isEditing && !isDraftEditable) return setErr("This entry is not editable.");

    setLoading(true);
    try {
      const payload = buildPayload("saved");

      if (isEditing) {
        const { error } = await supabase.from("jobs").update(payload).eq("id", editId);
        if (error) throw error;
        setMsg("Draft updated.");
      } else {
        const { error } = await supabase
          .from("jobs")
          .upsert(payload, { onConflict: "user_id,job_date,ot" });
        if (error) throw error;
        setMsg("Draft saved.");
      }

      navigate("/history");
    } catch (e) {
      setErr(e?.message || "Failed to save draft.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setErr("");
    setMsg("");
    if (!canSubmit) return setErr("Please provide Work Date and OT number.");
    if (isEditing && !isDraftEditable) return setErr("This entry is not editable.");

    setLoading(true);
    try {
      const payload = buildPayload("submitted");

      if (isEditing) {
        const { error } = await supabase.from("jobs").update(payload).eq("id", editId);
        if (error) throw error;
        setMsg("Submitted for approval.");
      } else {
        const { error } = await supabase
          .from("jobs")
          .upsert(payload, { onConflict: "user_id,job_date,ot" });
        if (error) throw error;
        setMsg("Submitted for approval.");
      }

      navigate("/history");
    } catch (e) {
      setErr(e?.message || "Failed to submit.");
    } finally {
      setLoading(false);
    }
  }

  const inputsDisabled = loading || (isEditing && !isDraftEditable);

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>SparkLog</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {fullName ? fullName : user?.email} • role: {role || "—"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link to="/history" style={styles.link}>History</Link>
          {role === "manager" && (
            <Link to="/manager" style={styles.link}>Manager</Link>
          )}
          <button onClick={signOut} style={styles.secondaryBtn}>Logout</button>
        </div>
      </div>

      {isEditing && loadedJob && !isDraftEditable && (
        <div style={styles.notice}>
          This entry is <b>{loadedJob.status}</b> and cannot be edited.
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.h1}>{isEditing ? "Edit Draft" : "New Work Log"}</div>

        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <div style={styles.label}>Work date *</div>
              <DatePicker
                value={jobDate}
                onChange={(v) => setJobDate(v)}
                disabled={inputsDisabled}
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Work order (OT) *</div>
              <input
                style={styles.input}
                value={ot}
                onChange={(e) => setOt(e.target.value)}
                placeholder="e.g., #12345"
                disabled={inputsDisabled}
              />
            </div>

            <div style={styles.row3}>
              <div style={styles.field}>
                <div style={styles.label}>Departure</div>
                <TimePicker
                 value={depart}
                 onChange={(v) => setDepart(v)}
                 minutesStep={15}
                 shouldDisableTime={disableMinutesNotQuarter}
                 slotProps={{ textField: { size: "small", fullWidth: true } }}
                />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>Arrival</div>
                <TimePicker
                  value={arrivee}
                  onChange={(v) => setArrivee(v)}
                  disabled={inputsDisabled}
                  minutesStep={15}   // ✅ 15-min increments
                  slotProps={{ textField: { size: "small", fullWidth: true } }}
                />
              </div>

              <div style={styles.field}>
                <div style={styles.label}>End</div>
                <TimePicker
                  value={fin}
                  onChange={(v) => setFin(v)}
                  disabled={inputsDisabled}
                  minutesStep={15}   // ✅ 15-min increments
                  slotProps={{ textField: { size: "small", fullWidth: true } }}
                />
              </div>
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Kilometers (one-way)</div>
              <TextField
                size="small"
                fullWidth
                type="number"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                disabled={inputsDisabled}
                inputProps={{ min: 0 }}
                placeholder="" // ✅ empty look
              />
            </div>

            <div style={styles.field}>
              <div style={styles.label}>Calculated hours</div>
              <div style={styles.hoursBox}>
                {formatHoursMinutesDecimal(totalMinutes)} h
              </div>
            </div>
          </div>
        </LocalizationProvider>

        {err && <div style={styles.error}>{err}</div>}
        {msg && <div style={styles.success}>{msg}</div>}

        <div style={styles.actions}>
          <button disabled={inputsDisabled} onClick={saveDraft} style={styles.secondaryBtn}>
            {loading ? "Saving…" : "Save Draft"}
          </button>
          <button disabled={inputsDisabled} onClick={submit} style={styles.primaryBtn}>
            {loading ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f5f5f5", padding: 16 },
  topbar: {
    maxWidth: 980,
    margin: "0 auto 12px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  link: { color: "#1565c0", fontWeight: 800, textDecoration: "none" },
  notice: {
    maxWidth: 980,
    margin: "0 auto 12px auto",
    background: "rgba(21,101,192,0.08)",
    border: "1px solid rgba(21,101,192,0.2)",
    borderRadius: 12,
    padding: 12,
    color: "#0d47a1",
    fontSize: 13
  },
  card: {
    maxWidth: 980,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 2px 10px rgba(0,0,0,0.04)"
  },
  h1: { fontSize: 18, fontWeight: 800, marginBottom: 12 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  row3: {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12
  },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 12, color: "#555", fontWeight: 700 },
  input: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none"
  },
  hoursBox: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 800,
    color: "#111"
  },
  actions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 },
  primaryBtn: {
    background: "#1565c0",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  },
  secondaryBtn: {
    background: "#f5f5f5",
    color: "#111",
    border: "1px solid #eee",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer"
  },
  error: {
    marginTop: 12,
    background: "rgba(220,20,60,0.08)",
    border: "1px solid rgba(220,20,60,0.2)",
    color: "crimson",
    padding: 10,
    borderRadius: 10,
    fontSize: 13
  },
  success: {
    marginTop: 12,
    background: "rgba(76,175,80,0.10)",
    border: "1px solid rgba(76,175,80,0.25)",
    color: "#2e7d32",
    padding: 10,
    borderRadius: 10,
    fontSize: 13
  }
};
