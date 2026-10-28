import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fetchGroups } from "@/lib/employee-groups";
import { friendlyErrorMessage } from "@/lib/error-messages";
import {
  RATIOS_EVENT, deleteRatio, fetchKnownEquipment, fetchStockLevels, lowStockRows, parseRatio, saveRatio, validateRatio,
} from "@/lib/inventory-ratios";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";

const qty = (value) => Number(value).toLocaleString("fr-CA", { maximumFractionDigits: 2 });

// Minimum stock per warehouse (employee group): a ratio per employee and device. Shows the warehouses that
// are below their minimum, and lets the managers set the ratios.
export default function InventoryRatios() {
  const t = useT();
  const [levels, setLevels] = useState([]);
  const [groups, setGroups] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [code, setCode] = useState("");
  const [ratio, setRatio] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStockLevels(), fetchGroups(), fetchKnownEquipment()])
      .then(([rows, groupRows, items]) => { if (!cancelled) { setLevels(rows); setGroups(groupRows); setEquipment(items); setError(""); } })
      .catch((loadError) => { if (!cancelled) setError(friendlyErrorMessage(loadError, t, "mgr.inventory.ratios.loadFailed")); });
    return () => { cancelled = true; };
  }, [reload, t]);

  const low = useMemo(() => lowStockRows(levels), [levels]);
  const activeGroup = groups.find((group) => group.id === groupId) || groups[0] || null;
  const groupLevels = levels.filter((row) => row.group_id === activeGroup?.id);
  const picked = equipment.find((item) => item.code === code) || null;
  const errors = validateRatio({ groupId: activeGroup?.id, code, name: picked?.name, ratio });

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

  async function add(event) {
    event.preventDefault();
    if (errors.length) { setShowErrors(true); return; }
    await run(() => saveRatio({ groupId: activeGroup.id, code, name: picked.name, ratio }));
    setCode("");
    setRatio("");
    setShowErrors(false);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn("flex items-center gap-2 text-sm font-semibold", low.length ? "text-destructive" : "text-muted-foreground")}>
            {low.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
            {low.length > 0 ? t("mgr.inventory.ratios.lowTitle", { count: low.length }) : t("mgr.inventory.ratios.title")}
          </div>
          <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <Gauge className="mr-1 h-4 w-4" />{open ? t("mgr.inventory.ratios.hide") : t("mgr.inventory.ratios.manage")}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {low.length > 0 && (
          <ul className="space-y-1 text-sm">
            {low.map((row) => (
              <li key={`${row.group_id}|${row.code}`} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <span><b>{row.group_name}</b> — {row.item_name} <span className="text-xs text-muted-foreground">{row.code}</span></span>
                <span className="tabular-nums text-destructive">
                  {t("mgr.inventory.ratios.lowLine", { onHand: qty(row.on_hand), minimum: qty(row.minimum), ratio: qty(row.per_employee), count: row.headcount })}
                </span>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">{t("mgr.inventory.ratios.help")}</p>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("mgr.inventory.ratios.noGroup")}</p>
            ) : (
              <>
                <Select aria-label={t("mgr.inventory.ratios.warehouse")} value={activeGroup?.id || ""} onChange={(e) => setGroupId(e.target.value)}>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </Select>
                {groupLevels.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">{t("mgr.inventory.colItem")}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.ratios.perEmployee")}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.ratios.minimum")}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("mgr.inventory.ratios.onHand")}</th>
                          <th className="px-1 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {groupLevels.map((row) => (
                          <tr key={row.code} className={cn(row.is_low && "bg-destructive/5")}>
                            <td className="px-3 py-2"><div className="font-medium">{row.item_name}</div><div className="text-xs text-muted-foreground">{row.code}</div></td>
                            <td className="px-3 py-2 text-right tabular-nums">{qty(row.per_employee)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{qty(row.minimum)} <span className="text-xs text-muted-foreground">({row.headcount})</span></td>
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
                {ratio && parseRatio(ratio) !== null && activeGroup && (
                  <p className="text-xs text-muted-foreground">
                    {t("mgr.inventory.ratios.preview", { count: activeGroup.memberIds.length, minimum: qty(parseRatio(ratio) * activeGroup.memberIds.length) })}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
