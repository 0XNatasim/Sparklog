import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Phone, Mail, Download } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

export default function EmployeesPanel() {
  const t = useT();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select("id, role, full_name, phone, email, ccq_number, apprentice_level, sector, km_rate")
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

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">{t("manager.tbl.name")}</th>
                  <th className="px-3 py-2">{t("manager.tbl.phone")}</th>
                  <th className="px-3 py-2">{t("manager.tbl.email")}</th>
                  <th className="px-3 py-2">CCQ#</th>
                  <th className="px-3 py-2">{t("employees.level")}</th>
                  <th className="px-3 py-2">{t("employees.sector")}</th>
                  <th className="px-3 py-2">{t("employees.kmRate")}</th>
                  <th className="px-3 py-2 text-right">CSV</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-sm text-muted-foreground">{t("common.loading")}</td></tr>
                )}
                {!loading && profiles.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">
                      <Input
                        value={p.full_name || ""}
                        onChange={(e) => setLocal(p.id, "full_name", e.target.value)}
                        onBlur={(e) => saveField(p.id, "full_name", e.target.value)}
                        className="h-8 min-w-[9rem]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          value={p.phone || ""}
                          onChange={(e) => setLocal(p.id, "phone", e.target.value)}
                          onBlur={(e) => saveField(p.id, "phone", e.target.value)}
                          className="h-8 min-w-[7rem]"
                        />
                        {p.phone && (
                          <a href={`tel:${String(p.phone).replace(/[^+\d]/g, "")}`} className="shrink-0 rounded p-1 text-primary hover:bg-accent" aria-label="call">
                            <Phone className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.email ? (
                        <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Mail className="h-3 w-3" />{p.email}
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={p.ccq_number || ""}
                        onChange={(e) => setLocal(p.id, "ccq_number", e.target.value)}
                        onBlur={(e) => saveField(p.id, "ccq_number", e.target.value)}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.apprentice_level || ""}
                        onChange={(e) => { setLocal(p.id, "apprentice_level", e.target.value); saveField(p.id, "apprentice_level", e.target.value); }}
                        className="h-8 w-32"
                      >
                        <option value="">—</option>
                        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={p.sector || ""}
                        onChange={(e) => { setLocal(p.id, "sector", e.target.value); saveField(p.id, "sector", e.target.value); }}
                        className="h-8 w-36"
                      >
                        <option value="">—</option>
                        {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">$</span>
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
                          className="h-8 w-20"
                        />
                        <span className="text-xs text-muted-foreground">/km</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadCsv(p)} aria-label="CSV">
                        <Download className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!loading && profiles.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-sm text-muted-foreground">—</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
