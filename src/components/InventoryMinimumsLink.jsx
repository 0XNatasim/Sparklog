import React from "react";
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";

// Button of the Inventaire page to the minimums by warehouse; `count` = the warehouses with a device below its minimum
// (among the warehouses that are counted), shown on it.
export default function InventoryMinimumsLink({ count = 0 }) {
  const t = useT();
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/manager/inventory/minimums">
        <Gauge className="mr-1 h-4 w-4" />{t("mgr.inventory.ratios.open")}
        {count > 0 && <Badge variant="destructive" className="ms-2">{count}</Badge>}
      </Link>
    </Button>
  );
}
