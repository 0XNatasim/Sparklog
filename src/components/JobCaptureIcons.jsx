import React from "react";
import { Car, TimerReset, Utensils } from "lucide-react";
import { useT } from "@/lib/use-t";

const CAPTURES = [
  { field: "parking_receipt_captured", icon: Car, label: "manager.timesheet.parkingIndicator", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { field: "overtime_evidence_captured", icon: TimerReset, label: "manager.timesheet.overtimeIndicator", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { field: "meal_claim_captured", icon: Utensils, label: "manager.timesheet.mealIndicator", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
];

export default function JobCaptureIcons({ job, className = "" }) {
  const t = useT();
  if (!job) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {CAPTURES.map(({ field, icon: Icon, label, className: color }) => job[field] ? (
        <span key={field} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${color}`} title={t(label)} aria-label={t(label)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null)}
    </span>
  );
}
