import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { lowStockByWarehouse } from "@/lib/inventory-ratios";
import { useT } from "@/lib/use-t";

const qty = (value) => Number(value).toLocaleString("fr-CA", { maximumFractionDigits: 2 });

// What the number on « Inventaire » means: ONE notification per warehouse that has a device below its minimum, with
// those devices in red. A link leads to the minimums page (hidden on that page, `detailed`).
export default function InventoryLowStock({ rows, detailed = false }) {
  const t = useT();
  if (!rows?.length) return null;
  const warehouses = lowStockByWarehouse(rows);
  return (
    <Card className="border-destructive/40">
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("mgr.inventory.ratios.lowTitle", { count: warehouses.length })}
          </div>
          {!detailed && (
            <Button asChild size="sm" variant="outline"><Link to="/manager/inventory/minimums">{t("mgr.inventory.ratios.seeDetail")}</Link></Button>
          )}
        </div>
        <ul className="space-y-2 text-sm">
          {warehouses.map((warehouse) => (
            <li key={warehouse.name} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="font-semibold">{warehouse.name}</div>
              <ul className="mt-1 space-y-0.5">
                {warehouse.rows.map((row) => (
                  <li key={`${row.group_id}|${row.code}`} className="flex flex-wrap items-baseline justify-between gap-x-3 font-medium text-destructive">
                    <span>{row.item_name} <span className="text-xs font-normal text-muted-foreground">{row.code}</span></span>
                    <span className="tabular-nums">{t("mgr.inventory.ratios.lowLine", { onHand: qty(row.on_hand), minimum: qty(row.minimum) })}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
