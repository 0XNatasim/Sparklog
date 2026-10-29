import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchGroups } from "@/lib/employee-groups";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  RATIOS_EVENT, deleteRatio, fetchAlertFlags, fetchKnownEquipment, fetchStockLevels, parseRatio, saveRatio, setGroupAlert, validateRatio,
} from "@/lib/inventory-ratios";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";

const qty = (value) => Number(value).toLocaleString("fr-CA", { maximumFractionDigits: 2 });

// Oui / Non, like the private / shared choice of Notes.
function YesNo({ value, onChange, disabled, label }) {
  const t = useT();
  const options = [
    { value: true, label: t("common.yes"), on: "border-success bg-success/15 text-success" },
    { value: false, label: t("common.no"), on: "border-foreground/40 bg-muted text-foreground" },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border bg-background p-0.5">
      {options.map((option) => (
        <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} disabled={disabled}
          onClick={() => value !== option.value && onChange(option.value)}
          className={cn("inline-flex min-h-9 items-center rounded border border-transparent px-4 text-sm font-semibold",
            value === option.value ? option.on : "text-muted-foreground hover:text-foreground")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// One warehouse (employee group): « Compter cet entrepôt ? ». Only a counted warehouse shows its devices:
// the minimum of each (ratio per employee x employees) next to the total of its employees' inventories.
function Warehouse({ group, counted, levels, equipment, busy, run }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [ratio, setRatio] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const headcount = levels[0]?.headcount ?? group.memberIds.length;
  const lists = levels[0]?.lists_counted ?? 0;
  const lowCount = levels.filter((row) => row.is_low).length;
  const picked = equipment.find((item) => item.code === code) || null;
  const errors = validateRatio({ groupId: group.id, code, name: picked?.name, ratio });

  async function add(event) {
    event.preventDefault();
    if (errors.length) { setShowErrors(true); return; }
    await run(() => saveRatio({ groupId: group.id, code, name: picked.name, ratio }));
    setCode("");
    setRatio("");
    setShowErrors(false);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              {group.name}
              {counted && lowCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />{t("mgr.inventory.ratios.lowBadge", { count: lowCount })}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{t("mgr.inventory.ratios.employees", { count: headcount })}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">{t("mgr.inventory.ratios.countIt")}</span>
            <YesNo value={counted} disabled={busy} label={`${group.name} — ${t("mgr.inventory.ratios.countIt")}`} onChange={(enabled) => run(() => setGroupAlert({ groupId: group.id, enabled }))} />
          </div>
        </div>

        {counted && (
          <div className="space-y-3 border-t pt-3">
            {levels.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">{t("mgr.inventory.ratios.listsNote", { lists, count: headcount })}</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t("mgr.inventory.colItem")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.ratios.minimum")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.ratios.total")}</th>
                        <th className="px-1 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {levels.map((row) => (
                        <tr key={row.code} className={cn(row.is_low && "bg-destructive/5")}>
                          <td className="px-3 py-2"><div className="font-medium">{row.item_name}</div><div className="text-xs text-muted-foreground">{row.code}</div></td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {qty(row.minimum)}
                            <div className="text-xs text-muted-foreground">{qty(row.per_employee)} × {row.headcount}</div>
                          </td>
                          <td className={cn("px-3 py-2 text-right tabular-nums", row.is_low && "font-semibold text-destructive")}>{row.lists_counted ? qty(row.on_hand) : "—"}</td>
                          <td className="px-1 py-1 text-right">
                            <Button type="button" variant="ghost" size="icon" aria-label={t("mgr.inventory.ratios.remove")} disabled={busy}
                              onClick={() => run(() => deleteRatio({ groupId: row.group_id, code: row.code }))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("mgr.inventory.ratios.none")}</p>
            )}
            <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]" noValidate>
              <Select aria-label={t("mgr.inventory.colItem")} value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}
                className={showErrors && errors.includes("code") ? "border-destructive" : ""}>
                <option value="">{t("mgr.inventory.ratios.pickItem")}</option>
                {equipment.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
              </Select>
              <Input aria-label={t("mgr.inventory.ratios.perEmployee")} placeholder={t("mgr.inventory.ratios.perEmployee")} inputMode="decimal"
                value={ratio} onChange={(e) => setRatio(e.target.value)} disabled={busy}
                className={showErrors && errors.includes("ratio") ? "border-destructive" : ""} />
              <Button type="submit" disabled={busy}>{t("mgr.inventory.ratios.add")}</Button>
            </form>
            {showErrors && errors.length > 0 && <p className="text-sm text-destructive">{t("mgr.inventory.ratios.invalid")}</p>}
            {ratio && parseRatio(ratio) !== null && (
              <p className="text-xs text-muted-foreground">{t("mgr.inventory.ratios.preview", { count: headcount, minimum: qty(parseRatio(ratio) * headcount) })}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Gestion › Inventaire › Minimums par entrepôt: the list of warehouses (employee groups), a yes / no for each.
export default function InventoryMinimums() {
  const t = useT();
  const [levels, setLevels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [flags, setFlags] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStockLevels(), fetchGroups(), fetchKnownEquipment(), fetchAlertFlags()])
      .then(([rows, groupRows, items, alertFlags]) => {
        if (cancelled) return;
        setLevels(rows); setGroups(groupRows); setEquipment(items); setFlags(alertFlags); setError("");
      })
      .catch((loadError) => { if (!cancelled) setError(friendlyErrorMessage(loadError, t, "mgr.inventory.ratios.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload, t]);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setReload((n) => n + 1);
      window.dispatchEvent(new Event(RATIOS_EVENT));
    } catch (actionError) {
      setError(friendlyErrorMessage(actionError, t, "mgr.inventory.ratios.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Link to="/manager/inventory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{t("mgr.inventory.ratios.back")}
      </Link>
      <Card>
        <CardContent className="space-y-1 p-4">
          <h2 className="text-lg font-bold">{t("mgr.inventory.ratios.pageTitle")}</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">{t("mgr.inventory.ratios.help")}</p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>
      {loading && <p className="text-sm text-muted-foreground">{t("common.working")}</p>}
      {!loading && groups.length === 0 && <p className="text-sm text-muted-foreground">{t("mgr.inventory.ratios.noGroup")}</p>}
      {groups.map((group) => (
        <Warehouse key={group.id} group={group} counted={Boolean(flags.get(group.id))} equipment={equipment} busy={busy} run={run}
          levels={levels.filter((row) => row.group_id === group.id)} />
      ))}
    </div>
  );
}
