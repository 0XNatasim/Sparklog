import React from "react";
import { useT } from "@/lib/use-t";

// Red star on a timesheet entry typed by hand instead of read from the Field Service screenshot
// (job_entry_sources, migration 0090).
export default function ManualEntryStar({ className = "" }) {
  const t = useT();
  const label = t("manager.manualEntry");
  return (
    <span className={`font-bold leading-none text-destructive ${className}`} title={label} aria-label={label} role="img">★</span>
  );
}
