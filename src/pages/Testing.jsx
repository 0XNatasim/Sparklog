import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExternalLink, Eye } from "lucide-react";
import { useT } from "@/lib/use-t";
import { withTimeout } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useViewMode } from "@/contexts/ViewModeContext";

// ─── CCQ configuration ───────────────────────────────────────────────────────
const OCCUPATION = { id: "220", name: "Électricien" };

const COMMERCIAL_SECTOR = { id: "C", name: "Institutionnel et commercial (ICI)" };

const SKILLS = [
  { id: "6", label: "Compagnon",  pct: "100%" },
  { id: "4", label: "Apprenti 4", pct: "65%"  },
  { id: "3", label: "Apprenti 3", pct: "60%"  },
  { id: "2", label: "Apprenti 2", pct: "50%"  },
  { id: "1", label: "Apprenti 1", pct: "40%"  },
];

const EMPLOYER_COST_ROWS = [
  { number: 1, label: "Taux de salaire", description: "Salaire horaire prévu à la convention collective.", values: ["50,79", "25,40", "30,47", "35,55", "43,17"] },
  { number: 2, label: "Vacances", description: "Indemnité de vacances et de jours fériés ajoutée au salaire.", values: ["6,60", "3,30", "3,96", "4,62", "5,61"] },
  { number: 3, label: "Salaire brut", description: "Taux de salaire plus l’indemnité de vacances.", values: ["57,39", "28,70", "34,43", "40,17", "48,78"], total: true },
  { number: 4, label: "Assurance emploi", description: "Part employeur de la cotisation à l’assurance-emploi.", values: ["1,04", "0,52", "0,63", "0,73", "0,89"] },
  { number: 5, label: "RQAP", description: "Part employeur du Régime québécois d’assurance parentale.", values: ["0,35", "0,17", "0,21", "0,24", "0,29"] },
  { number: 6, label: "RRQ", description: "Part employeur du Régime de rentes du Québec.", values: ["3,71", "1,91", "2,27", "2,63", "3,17"] },
  { number: 7, label: "F.S.S.", description: "Cotisation de l’employeur au Fonds des services de santé.", values: ["2,59", "1,37", "1,61", "1,86", "2,22"] },
  { number: 8, label: "Avantages sociaux", description: "Contributions de l’employeur aux régimes d’avantages sociaux de l’industrie.", values: ["8,875", "7,955", "7,955", "7,955", "7,955"] },
  { number: 9, label: "Taxe assurances", description: "Taxe applicable aux protections d’assurance.", values: ["0,330", "0,330", "0,330", "0,330", "0,330"] },
  { number: 10, label: "Cotisation CCQ", description: "Prélèvement servant au financement des activités de la CCQ.", values: ["0,43", "0,22", "0,26", "0,30", "0,37"] },
  { number: 11, label: "Cotisation AECQ + ACQ", description: "Cotisations aux associations patronales AECQ et ACQ.", values: ["0,06", "0,06", "0,06", "0,06", "0,06"] },
  { number: 12, label: "Fonds divers", description: "Contributions aux différents fonds prévus dans l’industrie.", values: ["0,22", "0,22", "0,22", "0,22", "0,22"] },
  { number: 13, label: "Équipement de sécurité", description: "Allocation estimée pour les équipements de protection et de sécurité.", values: ["0,80", "0,80", "0,80", "0,80", "0,80"] },
  { number: 14, label: "Autres contributions", description: "Autres charges et contributions applicables à l’employeur.", values: ["1,52", "0,80", "0,95", "1,09", "1,30"] },
  { number: 15, label: "Clauses monétaires normatives", description: "Coût des autres clauses monétaires prévues à la convention collective.", values: ["6,77", "3,39", "4,06", "4,74", "5,76"] },
  { number: 16, label: "CNESST", description: "Cotisation estimée liée à la santé et à la sécurité du travail.", values: ["1,93", "1,02", "1,20", "1,38", "1,65"] },
  { number: 17, label: "Total – Coût horaire de la main-d’œuvre", description: "Coût horaire total du salaire et des charges de main-d’œuvre.", values: ["86,02", "47,46", "54,98", "62,50", "73,79"], total: true },
  { number: 18, label: "Camions", description: "Coût horaire estimé des véhicules affectés aux travaux.", values: ["14,55", "14,55", "14,55", "14,55", "14,55"] },
  { number: 19, label: "Outils", description: "Coût horaire estimé des outils et de l’équipement courant.", values: ["1,68", "1,68", "1,68", "1,68", "1,68"] },
  { number: 20, label: "Total avant frais d’administration et profit", description: "Main-d’œuvre, camion et outils, avant administration et marge bénéficiaire.", values: ["102,25", "63,69", "71,21", "78,73", "90,02"], total: true },
];

function EmployerCostTable() {
  const t = useT();
  return (
    <div>
      <div className="border-b bg-muted/20 px-5 py-4 text-sm">
        <p className="font-semibold">{t("ccq.cost.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Montants en dollars par heure selon la grille ACQ fournie. Les frais d’administration et le profit ne sont pas inclus.
          {" "}<a href="https://www.acq.org/documentation/grilles-taux-horaires-et-paie/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Source ACQ <ExternalLink className="inline h-3 w-3" /></a>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Élément</th>
              <th className="min-w-64 px-4 py-2.5 font-medium">Description</th>
              {['Compagnon', 'Apprenti P1', 'Apprenti P2', 'Apprenti P3', 'Apprenti P4'].map((label) => <th key={label} className="px-3 py-2.5 text-right font-medium">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {EMPLOYER_COST_ROWS.map((row) => (
              <tr key={row.number} className={`border-b last:border-0 ${row.total ? "bg-primary/5 font-semibold" : "hover:bg-muted/20"}`}>
                <td className="px-4 py-2.5"><span className="mr-2 text-xs text-muted-foreground">({row.number})</span>{row.label}</td>
                <td className="px-4 py-2.5 text-xs font-normal text-muted-foreground">{row.description}</td>
                {row.values.map((value, index) => <td key={index} className="px-3 py-2.5 text-right font-mono">{value} $</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

// ─── CCQ rates panel ──────────────────────────────────────────────────────────
function CcqRatesPanel() {
  const t = useT();
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const [results, setResults]   = useState(null);

  const today = dayjs().format("YYYY-MM-DD");

  async function handleSync() {
    setErr("");
    setLoading(true);

    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("No session — please log in again.");

      // Fetch levels sequentially. Sending five simultaneous Edge Function
      // requests also sends five simultaneous requests to CCQ, which can make
      // an otherwise valid level fail intermittently (commonly Apprenti 4).
      const responses = [];
      for (const skill of SKILLS) {
          const { data, error } = await withTimeout(
            supabase.functions.invoke("ccq_rates", {
              body: {
                occupationId: OCCUPATION.id,
                sectorId: COMMERCIAL_SECTOR.id,
                skillId:  skill.id,
                ratesToDate: today,
                annexId:  "ALL",
              },
              headers: { Authorization: `Bearer ${token}` },
            }),
            25000
          );
          if (error) throw new Error(`${skill.label}: ${await getFunctionErrorMessage(error)}`);
          if (!data?.ok) throw new Error(`${skill.label}: ${data?.error ?? "Unknown error"}`);
          responses.push({ skill, snapshot: data.snapshot });
      }

      const rows = responses.map(({ skill, snapshot }) => ({
        skill,
        raw:   snapshot?.raw_json ?? null,
        rates: parseRates(snapshot?.raw_json),
      }));

      setResults({
        sector:    COMMERCIAL_SECTOR.name,
        date:      today,
        fetchedAt: new Date().toLocaleTimeString(),
        rows,
      });
    } catch (e) {
      setErr(e?.message ?? "Sync failed.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-load the only supported sector on mount.
  useEffect(() => { handleSync(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                CCQ · {OCCUPATION.name} ·
              </span>
              <span className="rounded-md border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                Commercial (ICI)
              </span>
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleSync}
              disabled={loading}
              className="text-xs text-muted-foreground"
            >
              {loading ? "…" : "↻"} {loading ? "Chargement" : "Rafraîchir"}
            </Button>
          </div>

          {err && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-red-300 flex items-center justify-between gap-3">
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

            <Tabs defaultValue="salary" className="w-full">
              <div className="border-b px-5 py-3">
                <TabsList>
                  <TabsTrigger value="salary">{t("ccq.tabs.salary")}</TabsTrigger>
                  <TabsTrigger value="employer-cost">{t("ccq.tabs.employerCost")}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="salary" className="mt-0">
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
                      <td className="px-4 py-3 text-right font-mono">{fmt(rates?.regular)}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmt(rates?.benefits)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold bg-primary/5">{fmt(rates?.regularWithBenefits)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(rates?.halfTime)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(rates?.double)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>

                {/* Overtime rule note */}
                <div className="border-t px-5 py-3 text-xs text-muted-foreground">
              <b className="text-foreground">Note temps supplémentaire :</b> la 1<sup>re</sup> heure
              supplémentaire est payée à <b className="text-foreground">+50 % (temps et demi, 1.5×)</b>,
              les heures suivantes à <b className="text-foreground">+100 % (temps double, 2×)</b>.
                </div>

                {/* Raw JSON inspector (collapsed) */}
                <details className="border-t">
              <summary className="cursor-pointer px-5 py-2 text-xs text-muted-foreground select-none hover:text-foreground">
                Réponse brute CCQ (débogage)
              </summary>
              <div className="px-5 pb-4 space-y-3">
                {results.rows.map(({ skill, raw }) => (
                  <div key={skill.id}>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">{skill.label}</div>
                    <pre className="rounded bg-muted p-3 text-xs overflow-x-auto max-h-48 overflow-y-auto">
                      {raw ? JSON.stringify(raw, null, 2) : "—"}
                    </pre>
                  </div>
                ))}
              </div>
                </details>
              </TabsContent>

              <TabsContent value="employer-cost" className="mt-0">
                <EmployerCostTable />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {loading && !results && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Chargement des taux CCQ…
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Placeholder panel for upcoming views ─────────────────────────────────────
function ComingSoon({ label }) {
  return (
    <Card>
      <CardContent className="p-8 text-sm text-muted-foreground text-center">
        {label} — bientôt disponible.
      </CardContent>
    </Card>
  );
}

// ─── Page with sub-tabs ───────────────────────────────────────────────────────
export default function Testing() {
  const t = useT();
  const navigate = useNavigate();
  const { startViewMode } = useViewMode();
  const [employees, setEmployees] = useState([]);
  const [employeeError, setEmployeeError] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email, role").order("full_name").then(({ data, error }) => {
      if (error) setEmployeeError(error.message);
      else setEmployees((data || []).filter((profile) => String(profile.role).toLowerCase() !== "manager"));
    });
  }, []);

  function viewAs(employeeId) {
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) return;
    startViewMode(employee);
    navigate("/history");
  }

  return (
    <Tabs defaultValue="ccq" className="space-y-4">
      <TabsList className="h-auto max-w-full flex-wrap justify-start">
        <TabsTrigger value="ccq">{t("testing.tabs.ccq")}</TabsTrigger>
        <TabsTrigger value="week">{t("testing.tabs.week")}</TabsTrigger>
        <TabsTrigger value="month">{t("testing.tabs.month")}</TabsTrigger>
      </TabsList>

      <TabsContent value="ccq"><CcqRatesPanel /></TabsContent>
      <TabsContent value="week"><ComingSoon label={t("testing.tabs.week")} /></TabsContent>
      <TabsContent value="month"><ComingSoon label={t("testing.tabs.month")} /></TabsContent>
    </Tabs>
  );
}

async function getFunctionErrorMessage(error) {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      return body?.error || body?.detail || error.message;
    } catch {
      try {
        const body = await response.clone().text();
        if (body) return body;
      } catch {
        // Fall through to the Functions client message.
      }
    }
  }
  return error?.message || "Edge Function request failed";
}
