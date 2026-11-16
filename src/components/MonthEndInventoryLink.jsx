import React from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/use-t";

// Button of the Inventaire page to the month-end inventory (schedule, proof of the form, download).
export default function MonthEndInventoryLink() {
  const t = useT();
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/manager/inventory/month-end"><ClipboardCheck className="mr-1 h-4 w-4" />{t("monthEnd.manager.open")}</Link>
    </Button>
  );
}
