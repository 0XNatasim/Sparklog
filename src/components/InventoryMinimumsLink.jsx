import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RATIOS_EVENT, fetchStockLevels, lowStockCount } from "@/lib/inventory-ratios";
import { useT } from "@/lib/use-t";

// Button of the Inventaire page to the minimums by warehouse; the number of devices below their minimum
// (in the warehouses that are counted) shows on it.
export default function InventoryMinimumsLink() {
  const t = useT();
  const [low, setLow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchStockLevels().then((rows) => { if (!cancelled) setLow(lowStockCount(rows)); }, () => undefined);
    load();
    window.addEventListener(RATIOS_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(RATIOS_EVENT, load); };
  }, []);

  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/manager/inventory/minimums">
        <Gauge className="mr-1 h-4 w-4" />{t("mgr.inventory.ratios.open")}
        {low > 0 && <Badge variant="destructive" className="ms-2">{low}</Badge>}
      </Link>
    </Button>
  );
}
