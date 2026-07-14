import React, { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Phone, Mail, Download, CreditCard, Upload, AlertTriangle } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";

const LEVELS = [
  { value: "compagnon",  label: "Compagnon" },
  { value: "apprenti_4", label: "Apprenti 4" },
  { value: "apprenti_3", label: "Apprenti 3" },
  { value: "apprenti_2", label: "Apprenti 2" },
  { value: "apprenti_1", label: "Apprenti 1" },
];

const SECTORS = [
  { value: "C", label: "Commercial (ICI)" },
  { value: "R", label: "Résidentiel" },
];

const CCQ_CARD_BUCKET = "ccq-cards";
const CCQ_EXPIRY_WARN_DAYS = 60;

// "missing" (no expiry recorded) | "expired" | "expiring" (within warn window) | "ok"
function ccqCardStatus(p) {
  if (!p.ccq_card_expiry) return { level: "missing" };
  const days = dayjs(p.ccq_card_expiry).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days < 0) return { level: "expired", days };
  if (days <= CCQ_EXPIRY_WARN_DAYS) return { level: "expiring", days };
  return { level: "ok", days };
}

export default function EmployeesPanel() {
  const t = useT();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [cardView, setCardView] = useState(null); // { name, url }
  const cardFileRef = useRef(null);
  const cardUploadTarget = useRef(null);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select("id, role, full_name, phone, email, ccq_number, apprentice_level, sector, km_rate, ccq_card_path, ccq_card_expiry")
          .order("full_name", { ascending: true }),
        12000
      );
      if (error) throw error;
      setProfiles(data ?? []);
    } catch (e) {
      setErr(e?.message ?? "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setLocal(id, field, value) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  async function saveField(id, field, rawValue) {
    let value = rawValue;
    if (field === "km_rate") {
      value = rawValue === "" || rawValue == null ? null : Number(rawValue);
      if (value != null && Number.isNaN(value)) return;
    } else if (typeof value === "string") {
      value = value.trim() || null;
    }
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", id);
    if (error) setErr(error.message);
    else { setInfo(`${field} ✓`); setTimeout(() => setInfo(""), 1500); }
  }

  // Per-employee payroll CSV: fetch that employee's approved jobs on demand.
  async function downloadCsv(p) {
    try {
      const { data: rows, error } = await withTimeout(
        supabase
          .from("jobs")
          .select("job_date, ot, depart, arrivee, fin, km_aller, km_retour, status")
          .eq("user_id", p.id)
          .eq("status", "approved")
          .order("job_date", { ascending: true }),
        12000
      );
      if (error) throw error;

      const header = [
        "employee_name", "employee_email", "employee_phone", "ccq_number",
        "apprentice_level", "sector", "km_rate",
        "week_iso", "job_date", "weekday", "ot", "depart", "arrivee", "fin",
        "hours_decimal", "hours_hhmm", "km",
      ];

      const decimalHours = (depart, fin) => {
        if (!depart || !fin) return 0;
        const [dh, dm] = String(depart).slice(0, 5).split(":").map(Number);
        const [fh, fm] = String(fin).slice(0, 5).split(":").map(Number);
        if ([dh, dm, fh, fm].some((n) => Number.isNaN(n))) return 0;
        let mins = fh * 60 + fm - (dh * 60 + dm);
        if (mins < 0) mins += 24 * 60;
        return Math.round((mins / 60) * 100) / 100;
      };
      const fmtHHmm = (dec) => {
        if (!Number.isFinite(dec) || dec <= 0) return "0h00";
        const total = Math.round(dec * 60);
        return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
      };

      const csvRows = (rows ?? []).map((j) => {
        const dec = decimalHours(j.depart, j.fin);
        const km = (Number(j.km_aller ?? 0) || 0) + (Number(j.km_retour ?? 0) || 0);
        return [
          p.full_name || "", p.email || "", p.phone || "", p.ccq_number || "",
          p.apprentice_level || "", p.sector || "", p.km_rate ?? "",
          dayjs(j.job_date).format("YYYY-[W]WW"), j.job_date,
          dayjs(j.job_date).format("dddd"), j.ot || "",
          j.depart ? String(j.depart).slice(0, 5) : "",
          j.arrivee ? String(j.arrivee).slice(0, 5) : "",
          j.fin ? String(j.fin).slice(0, 5) : "",
          dec.toFixed(2), fmtHHmm(dec), km,
        ];
      });

      const esc = (v) => {
        const s = String(v ?? "");
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = "﻿" + [header.join(";"), ...csvRows.map((r) => r.map(esc).join(";"))].join("\r\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (p.full_name || "employee").replace(/[^\w-]+/g, "_");
      a.href = url;
      a.download = `sparklog_payroll_${safeName}_all.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e?.message ?? "CSV export failed.");
    }
  }

  async function openCcqCard(p) {
    try {
      const { data, error } = await withTimeout(
        supabase.storage.from(CCQ_CARD_BUCKET).createSignedUrl(p.ccq_card_path, 3600),
        12000
      );
      if (error) throw error;
      setCardView({ name: p.full_name || p.email || "", url: data.signedUrl });
    } catch (e) {
      setErr(e?.message ?? "Failed to open CCQ card.");
    }
  }

  function pickCcqCardFile(p) {
    cardUploadTarget.current = p;
    cardFileRef.current?.click();
  }

  async function handleCcqCardFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const p = cardUploadTarget.current;
    cardUploadTarget.current = null;
    if (!file || !p) return;
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${p.id}/ccq-card.${ext}`;
      const { error: upErr } = await withTimeout(
        supabase.storage.from(CCQ_CARD_BUCKET).upload(path, file, {
          upsert: true,
          contentType: file.type || undefined,
        }),
        30000
      );
      if (upErr) throw upErr;
      if (p.ccq_card_path && p.ccq_card_path !== path) {
        await supabase.storage.from(CCQ_CARD_BUCKET).remove([p.ccq_card_path]);
      }
      const { error } = await supabase.from("profiles").update({ ccq_card_path: path }).eq("id", p.id);
      if (error) throw error;
      setLocal(p.id, "ccq_card_path", path);
      setInfo("ccq_card ✓");
      setTimeout(() => setInfo(""), 1500);
    } catch (e2) {
      setErr(e2?.message ?? "CCQ card upload failed.");
    }
  }

  const ccqRenewals = profiles
    .map((p) => ({ p, s: ccqCardStatus(p) }))
    .filter(({ s }) => s.level === "expired" || s.level === "expiring");

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
          <span>{err}</span>
          <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={load}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      {info && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary">{info}</div>
      )}

      {ccqRenewals.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("employees.ccqAlertTitle")}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {ccqRenewals.map(({ p, s }) => (
              <li key={p.id}>
                {p.full_name || p.email || p.id} —{" "}
                {s.level === "expired"
                  ? t("employees.ccqExpiredOn", { date: dayjs(p.ccq_card_expiry).format("YYYY-MM-DD") })
                  : t("employees.ccqExpiresOn", { date: dayjs(p.ccq_card_expiry).format("YYYY-MM-DD") })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</CardContent></Card>
      )}

      {!loading && profiles.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">—</CardContent></Card>
      )}

      {!loading && profiles.map((p) => {
        const cardStatus = ccqCardStatus(p);
        return (
        <Card key={p.id}>
          <CardContent className="p-4 space-y-3">
            {/* Header: name + CSV */}
            <div className="flex items-center gap-3">
              <Input
                value={p.full_name || ""}
                onChange={(e) => setLocal(p.id, "full_name", e.target.value)}
                onBlur={(e) => saveField(p.id, "full_name", e.target.value)}
                placeholder={t("manager.tbl.name")}
                className="h-9 flex-1 font-semibold"
              />
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" onClick={() => downloadCsv(p)}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("manager.tbl.phone")}>
                <div className="flex items-center gap-1">
                  <Input
                    value={p.phone || ""}
                    onChange={(e) => setLocal(p.id, "phone", e.target.value)}
                    onBlur={(e) => saveField(p.id, "phone", e.target.value)}
                    className="h-9"
                  />
                  {p.phone && (
                    <a href={`tel:${String(p.phone).replace(/[^+\d]/g, "")}`} className="shrink-0 rounded p-2 text-primary hover:bg-accent" aria-label="call">
                      <Phone className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Field>
              <Field label={t("manager.tbl.email")}>
                <div className="flex h-9 items-center text-sm">
                  {p.email ? (
                    <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 truncate text-primary hover:underline">
                      <Mail className="h-4 w-4 shrink-0" /><span className="truncate">{p.email}</span>
                    </a>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
              </Field>
            </div>

            {/* Classification */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="CCQ#">
                <Input
                  value={p.ccq_number || ""}
                  onChange={(e) => setLocal(p.id, "ccq_number", e.target.value)}
                  onBlur={(e) => saveField(p.id, "ccq_number", e.target.value)}
                  className="h-9"
                />
              </Field>
              <Field label={t("employees.level")}>
                <Select
                  value={p.apprentice_level || ""}
                  onChange={(e) => { setLocal(p.id, "apprentice_level", e.target.value); saveField(p.id, "apprentice_level", e.target.value); }}
                  className="h-9"
                >
                  <option value="">—</option>
                  {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </Field>
              <Field label={t("employees.sector")}>
                <Select
                  value={p.sector || ""}
                  onChange={(e) => { setLocal(p.id, "sector", e.target.value); saveField(p.id, "sector", e.target.value); }}
                  className="h-9"
                >
                  <option value="">—</option>
                  {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </Field>
              <Field label={t("employees.kmRate")}>
                <div className="flex h-9 items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="9.99"
                    inputMode="decimal"
                    value={p.km_rate ?? ""}
                    onChange={(e) => setLocal(p.id, "km_rate", e.target.value)}
                    onBlur={(e) => saveField(p.id, "km_rate", e.target.value)}
                    placeholder="0.65"
                    className="h-9"
                  />
                  <span className="text-xs text-muted-foreground">/km</span>
                </div>
              </Field>
            </div>

            {/* CCQ card document */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("employees.ccqCard")}>
                <div className="flex h-9 items-center gap-1.5">
                  {p.ccq_card_path ? (
                    <button
                      type="button"
                      onClick={() => openCcqCard(p)}
                      className="inline-flex items-center gap-1.5 rounded p-1.5 text-sm text-primary hover:bg-accent"
                      aria-label={t("employees.ccqCardView")}
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span className="underline underline-offset-2">{t("employees.ccqCardView")}</span>
                    </button>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t("employees.ccqCardMissing")}</span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 gap-1.5 text-xs"
                    onClick={() => pickCcqCardFile(p)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {p.ccq_card_path ? t("employees.ccqCardReplace") : t("employees.ccqCardUpload")}
                  </Button>
                </div>
              </Field>
              <Field label={t("employees.ccqCardExpiry")}>
                <div className="flex h-9 items-center gap-2">
                  <Input
                    type="date"
                    value={p.ccq_card_expiry || ""}
                    onChange={(e) => {
                      setLocal(p.id, "ccq_card_expiry", e.target.value);
                      saveField(p.id, "ccq_card_expiry", e.target.value);
                    }}
                    className="h-9"
                  />
                  {cardStatus.level === "expired" && (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                      {t("employees.ccqCardExpired")}
                    </span>
                  )}
                  {cardStatus.level === "expiring" && (
                    <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      {t("employees.ccqCardExpiring", { days: cardStatus.days })}
                    </span>
                  )}
                </div>
              </Field>
            </div>
          </CardContent>
        </Card>
        );
      })}

      <input
        ref={cardFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCcqCardFile}
      />

      <Dialog open={!!cardView} onOpenChange={(open) => !open && setCardView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("employees.ccqCard")}
              {cardView?.name ? ` — ${cardView.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {cardView && (
            <img
              src={cardView.url}
              alt="CCQ card"
              className="max-h-[70vh] w-full rounded-md border object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
