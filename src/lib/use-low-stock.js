import { useEffect, useState } from "react";
import { RATIOS_EVENT, fetchStockLevels, lowStockRows } from "@/lib/inventory-ratios";

// Devices below their minimum in the warehouses that are counted (0121-0122), refreshed after a change on the
// Minimums page. A failed read shows nothing rather than a wrong number.
export function useLowStock() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetchStockLevels().then((levels) => { if (!cancelled) setRows(lowStockRows(levels)); }, () => undefined);
    load();
    window.addEventListener(RATIOS_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(RATIOS_EVENT, load); };
  }, []);
  return rows;
}
