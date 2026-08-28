import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

// Électricien · Compagnon reference values from the ACQ employer-cost grid
// ($/h). "edit" rows are salary-driven and shown as input boxes the manager
// fills in; "fixed" rows are flat contributions shown locked; "calc" rows are
// computed sub-totals.
const ROWS = [
  { n: 1,  label: "Taux de salaire",                              kind: "edit",  def: "50.79" },
  { n: 2,  label: "Vacances",                                     kind: "edit",  def: "6.60" },
  { n: 3,  label: "Salaire brut",                                 kind: "calc" },
  { n: 4,  label: "Assurance emploi",                             kind: "edit",  def: "1.04" },
  { n: 5,  label: "RQAP",                                         kind: "edit",  def: "0.35" },
  { n: 6,  label: "RRQ",                                          kind: "edit",  def: "3.71" },
  { n: 7,  label: "F.S.S.",                                       kind: "edit",  def: "2.59" },
  { n: 8,  label: "Avantages sociaux",                            kind: "fixed", def: "8.875" },
  { n: 9,  label: "Taxe assurance",                               kind: "fixed", def: "0.330" },
  { n: 10, label: "Cotisation CCQ",                               kind: "edit",  def: "0.43" },
  { n: 11, label: "Cotisation AECQ + ACQ",                        kind: "fixed", def: "0.06" },
  { n: 12, label: "Fonds divers",                                 kind: "fixed", def: "0.22" },
  { n: 13, label: "Équipement de sécurité",                       kind: "fixed", def: "0.80" },
  { n: 14, label: "Autres contributions",                         kind: "edit",  def: "1.52" },
  { n: 15, label: "Clauses monétaires normatives",                kind: "edit",  def: "6.77" },
  { n: 16, label: "CNESST",                                       kind: "edit",  def: "1.93" },
  { n: 17, label: "Total – Coût horaire de la main-d’œuvre",       kind: "calc" },
  { n: 18, label: "Camions",                                      kind: "fixed", def: "14.55" },
  { n: 19, label: "Outils",                                       kind: "fixed", def: "1.68" },
  { n: 20, label: "Total avant frais d’administration et profit", kind: "calc" },
];

const num = (x) => {
  const f = parseFloat(String(x).replace(",", "."));
  return Number.isFinite(f) ? f : 0;
};
const money = (n) => `${(Number(n) || 0).toFixed(2).replace(".", ",")} $`;

const DEFAULTS = Object.fromEntries(
  ROWS.filter((r) => r.kind === "edit").map((r) => [r.n, r.def]),
);

export default function ElectricianCostSheet() {
  const [edit, setEdit] = useState(DEFAULTS);

  const v = useMemo(() => {
    const out = {};
    ROWS.forEach((r) => {
      if (r.kind === "edit") out[r.n] = num(edit[r.n]);
      else if (r.kind === "fixed") out[r.n] = num(r.def);
    });
    out[3] = out[1] + out[2]; // Salaire brut = Taux + Vacances
    let main = out[3];
    for (let n = 4; n <= 16; n += 1) main += out[n] || 0;
    out[17] = main; // Coût horaire de la main-d’œuvre
    out[20] = out[17] + out[18] + out[19]; // + Camions + Outils
    return out;
  }, [edit]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
          <div>
            <div className="text-sm font-bold">Électricien · Compagnon</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Coût horaire employeur — remplissez les cases modifiables ($/h). Les montants fixes sont verrouillés.
            </div>
          </div>
          <Button size="sm" variant="ghost" className="shrink-0 text-xs" onClick={() => setEdit(DEFAULTS)}>
            Réinitialiser
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="w-10 px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Élément</th>
                <th className="px-3 py-2 text-right font-medium">$/h</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const isTotal = r.kind === "calc";
                return (
                  <tr
                    key={r.n}
                    className={`border-b last:border-0 ${isTotal ? "bg-primary/5 font-semibold" : "hover:bg-muted/20"}`}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">({r.n})</td>
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-right">
                      {r.kind === "edit" ? (
                        <Input
                          inputMode="decimal"
                          value={edit[r.n] ?? ""}
                          onChange={(e) => setEdit((s) => ({ ...s, [r.n]: e.target.value }))}
                          className="ml-auto h-8 w-24 text-right font-mono"
                          aria-label={r.label}
                        />
                      ) : r.kind === "fixed" ? (
                        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground" title="Montant fixe">
                          <Lock className="h-3 w-3" />
                          {money(v[r.n])}
                        </span>
                      ) : (
                        <span className="font-mono">{money(v[r.n])}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
