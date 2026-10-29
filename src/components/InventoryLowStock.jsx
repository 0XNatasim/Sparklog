import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { lowStockByWarehouse } from "@/lib/inventory-ratios";
import { useT } from "@/lib/use-t";

const qty = (value) => Number(value).toLocaleString("fr-CA", { maximumFractionDigits: 2 });

// What the number on « Inventaire » means: the devices below their minimum stock, by warehouse. On the Inventaire
// page it is a short line with a link; on the Minimums page (`detailed`) every device is listed with its stock.
export default function InventoryLowStock({ rows, detailed = false }) {
  const t = useT();
  if (!rows?.length) return null;
  const warehouses = lowStockByWarehouse(rows);
  return (
    <Card className="border-destructive/40">
      <CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <div className="font-semibold text-destructive">{t("mgr.inventory.ratios.lowTitle", { count: rows.length })}</div>
              <div className="text-muted-foreground">{warehouses.map((w) => `${w.name} (${w.count})`).join(" · ")}</div>
            </div>
          </div>
          {!detailed && (
            <Button asChild size="sm" variant="outline"><Link to="/manager/inventory/minimums">{t("mgr.inventory.ratios.seeDetail")}</Link></Button>
          )}
        </div>
        {detailed && (
          <ul className="space-y-1 text-sm">
            {rows.map((row) => (
              <li key={`${row.group_id}|${row.code}`} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <span><b>{row.group_name}</b> — {row.item_name} <span className="text-xs text-muted-foreground">{row.code}</span></span>
                <span className="tabular-nums text-destructive">{t("mgr.inventory.ratios.lowLine", { onHand: qty(row.on_hand), minimum: qty(row.minimum) })}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
