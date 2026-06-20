import React, { useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import AppShell from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";

// ─── CCQ configuration ───────────────────────────────────────────────────────
const OCCUPATION = { id: "220", name: "Électricien" };

const SECTORS = [
  { id: "C", name: "Institutionnel et commercial (ICI)" },
  { id: "R", name: "Résidentiel" },
];

const SKILLS = [
  { id: "6", label: "Compagnon",  pct: "100%" },
  { id: "4", label: "Apprenti 4", pct: "65%"  },
  { id: "3", label: "Apprenti 3", pct: "60%"  },
  { id: "2", label: "Apprenti 2", pct: "50%"  },
  { id: "1", label: "Apprenti 1", pct: "40%"  },
];

// ─── CCQ JSON parsing ─────────────────────────────────────────────────────────
// Actual CCQ API shape:
//   AnnexesRates: { "Taux horaire": [{Name, Rates:{C3,C6}, Period},...], "Avantages sociaux": [...] }
//   Rates use French decimal comma: "50,79" → 50.79
//   Annexes: [{ cd_annexe: "C3", desc_annexe: "..." }]

function parseRates(rawJson) {
  if (!rawJson) return null;

  const annexesRates = rawJson.AnnexesRates;
  if (!annexesRates || typeof annexesRates !== "object") return null;

  // French decimal comma → JS float
  const parseFr = (str) => {
    if (str == null) return null;
    const f = parseFloat(String(str).replace(",", "."));
    return isNaN(f) ? null : f;
  };

  // Prefer C3; fall back to first available annex code
  const annexes = Array.isArray(rawJson.Annexes) ? rawJson.Annexes : [];
  const c3Meta  = annexes.find((a) => a.cd_annexe === "C3") ?? annexes[0] ?? null;
  const annexCode = c3Meta?.cd_annexe ?? "C3";
  const annexDesc = c3Meta?.desc_annexe ?? null;

  // Look up a rate from a named group + named row for annexCode
  const get = (groupName, rowName) => {
    const group = annexesRates[groupName];
    if (!Array.isArray(group)) return null;
    const row = group.find((r) => r.Name === rowName);
    return row?.Rates ? parseFr(row.Rates[annexCode]) : null;
  };

  const regular  = get("Taux horaire", "Régulier");
  const halfTime = get("Taux horaire", "Demi");
  const double_  = get("Taux horaire", "Double");
  const benefits = get("Avantages sociaux", "Total part du sal. et de l'empl.");

  return {
    annexCode,
    annexDesc,
    regular,
    halfTime,
    double:   double_,
    benefits,
    regularWithBenefits: regular != null && benefits != null ? regular + benefits : null,
  };
}

function fmt(value) {
  if (value == null) return "—";
  return `$${Number(value).toFixed(2)}/h`;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Testing() {
  const t = useT();
  const [sectorId, setSectorId]     = useState("C");
  const [ratesToDate, setRatesToDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");
  const [results, setResults]       = useState(null);
  // results: { sector, date, fetchedAt, source, rows: [{ skill, rates }] }

  async function handleSync() {
    setErr("");
    setResults(null);
    setLoading(true);

    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No session — please log in again.");

      // Fetch all skill levels in parallel
      const responses = await Promise.all(
        SKILLS.map(async (skill) => {
          const { data, error } = await withTimeout(
            supabase.functions.invoke("ccq_rates", {
              body: {
                occupationId: OCCUPATION.id,
                sectorId,
                skillId:    skill.id,
                ratesToDate,
                annexId:    "ALL",
              },
              headers: { Authorization: `Bearer ${token}` },
            }),
            15000
          );
          if (error) throw new Error(`${skill.label}: ${error.message}`);
          if (!data?.ok) throw new Error(`${skill.label}: ${data?.error ?? "Unknown error"}`);
          return { skill, snapshot: data.snapshot };
        })
      );

      const rows = responses.map(({ skill, snapshot }) => ({
        skill,
        raw:    snapshot?.raw_json ?? null,
        rates:  parseRates(snapshot?.raw_json),
        source: snapshot?.occupation_name ?? OCCUPATION.name,
      }));

      const sectorObj = SECTORS.find((s) => s.id === sectorId);
      setResults({
        sector:    sectorObj?.name ?? sectorId,
        date:      ratesToDate,
        fetchedAt: new Date().toLocaleTimeString(),
        rows,
      });
    } catch (e) {
      setErr(e?.message ?? "Sync failed.");
    } finally {
      setLoading(false);
    }
  }

  const sector = SECTORS.find((s) => s.id === sectorId);

  return (
    <AppShell>
      <div className="space-y-4">

        {/* ── Controls ── */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              CCQ – Taux de salaire · {OCCUPATION.name}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              {/* Sector tabs */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Secteur</div>
                <div className="flex gap-1">
                  {SECTORS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSectorId(s.id)}
                      className={[
                        "rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors",
                        sectorId === s.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-accent",
                      ].join(" ")}
                    >
                      {s.id === "C" ? "Commercial (ICI)" : "Résidentiel"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Date effective</div>
                <Input
                  type="date"
                  value={ratesToDate}
                  onChange={(e) => setRatesToDate(e.target.value)}
                  className="w-44"
                />
              </div>

              <Button onClick={handleSync} disabled={loading} className="self-end">
                {loading ? "Syncing…" : "Sync taux CCQ"}
              </Button>
            </div>

            {err && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between gap-3">
                <span>{err}</span>
                <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={handleSync}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Rate table ── */}
        {results && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div>
                  <div className="text-sm font-bold">{OCCUPATION.name}</div>
                  <div className="text-xs text-muted-foreground">{results.sector} · {results.date}</div>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  Synced {results.fetchedAt}
                  {results.rows[0]?.rates?.annexCode && (
                    <><br />Annexe {results.rows[0].rates.annexCode}
                    {results.rows[0].rates.annexDesc ? ` — ${results.rows[0].rates.annexDesc}` : ""}</>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Niveau</th>
                      <th className="px-4 py-2.5 font-medium text-right">Salaire (1×)</th>
                      <th className="px-4 py-2.5 font-medium text-right">Avantages /h</th>
                      <th className="px-4 py-2.5 font-medium text-right bg-primary/5">Avec avantages (1×)</th>
                      <th className="px-4 py-2.5 font-medium text-right">T. et demi (1.5×)</th>
                      <th className="px-4 py-2.5 font-medium text-right">T. double (2×)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map(({ skill, rates }) => (
                      <tr key={skill.id} className="border-b last:border-b-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-semibold">
                          {skill.label}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {skill.pct}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmt(rates?.regular)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {fmt(rates?.benefits)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold bg-primary/5">
                          {fmt(rates?.regularWithBenefits)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmt(rates?.halfTime)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmt(rates?.double)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Raw JSON inspector (collapsed) */}
              <details className="border-t">
                <summary className="cursor-pointer px-5 py-2 text-xs text-muted-foreground select-none hover:text-foreground">
                  Réponse brute CCQ (débogage)
                </summary>
                <div className="px-5 pb-4 space-y-3">
                  {results.rows.map(({ skill, raw }) => (
                    <div key={skill.id}>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        {skill.label}
                      </div>
                      <pre className="rounded bg-muted p-3 text-xs overflow-x-auto max-h-48 overflow-y-auto">
                        {raw ? JSON.stringify(raw, null, 2) : "—"}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            </CardContent>
          </Card>
        )}

        {!results && !loading && !err && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              Sélectionnez un secteur et une date, puis cliquez sur <b>Sync taux CCQ</b>.
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
