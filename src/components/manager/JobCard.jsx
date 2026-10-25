import React, { memo } from "react";
import { TriangleAlert } from "lucide-react";
import dayjs from "dayjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import JobCaptureIcons from "@/components/JobCaptureIcons";
import ManualEntryStar from "@/components/ManualEntryStar";
import { clockOrDash as fmtTimeHHmm, formatHM } from "@/lib/time";
import { statusBadgeVariant } from "@/lib/status";
import { useT } from "@/lib/use-t";
import { cn } from "@/lib/utils";
import { jobCodeTintClass } from "@/lib/job-code";
import { getKilometreBreakdown, minutesBetween } from "@/lib/payroll-calculations";

// One timesheet row of the manager dashboard. Memoized: it receives only primitives,
// the row's own objects and stable callbacks, so approving, filtering or loading one
// job no longer re-renders every card on the page (P-10).
// nameFirst (Gestion V3): the employee's full name heads the card with the OT number and the
// date under it, in a fixed-width column the pills and buttons cannot squeeze. Without it, the
// V2 card, unchanged.
function JobCard({ job: j, employee, shaded, dayOvertimeNoEvidence, overtimeCaptured, mealCaptured, manualEntry, focused, focusedEvidence, busy, onApprove, onUnlock, nameFirst = false }) {
  const t = useT();
    const employeeName = employee?.full_name || employee?.email || `User ${String(j.user_id).slice(0, 8)}…`;

    // Worked hours from the authoritative interval calc, which wraps past
    // midnight (overnight jobs) exactly as the payroll classification does.
    const totalHours = minutesBetween(j.depart, j.fin) / 60;
    const totalLabel = formatHM(totalHours);

    const { totalKm: kmLabel } = getKilometreBreakdown(j);

    const updatedLabel = j.updated_at ? dayjs(j.updated_at).format("DD MMM HH:mm") : "—";
    const canApprove = j.status === "submitted";

    // OT number, date, capture icons and the overtime-proof warning (both layouts).
    const otAndDate = (
      <>
        <span>{manualEntry && <ManualEntryStar className="mr-0.5" />}<span className="text-success">{j.ot}</span> • {dayjs(j.job_date).format("DD MMM")}</span>
        <JobCaptureIcons job={{ ...j, overtime_evidence_captured: overtimeCaptured, meal_claim_captured: j.meal_claim_captured || mealCaptured }} />
        {dayOvertimeNoEvidence && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning"
            title={t("manager.overtimeNoEvidenceHint")}
          >
            <TriangleAlert className="h-3 w-3" />{t("manager.overtimeNoEvidence")}
          </span>
        )}
      </>
    );

    return (
      <Card id={`job-${j.id}`} className={cn(shaded && "bg-slate-100 dark:bg-slate-800/70", jobCodeTintClass(j.ot), focused && "ring-2 ring-destructive")}>
        <CardContent className="p-3">
          {/* Mobile: stacked. Desktop: single-row inline list. */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
            {nameFirst ? (
              <div className="min-w-0 space-y-0.5 md:w-72 md:shrink-0">
                <div className="truncate text-sm font-semibold" title={employeeName}>{employeeName}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold">{otAndDate}</div>
                {(employee?.phone || employee?.email) && (
                  <div className="truncate text-xs text-muted-foreground">
                    {employee?.phone && (
                      <a href={`tel:${String(employee.phone).replace(/[^+\d]/g, "")}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {employee.phone}
                      </a>
                    )}
                    {employee?.phone && employee?.email && " • "}
                    {employee?.email && (
                      <a href={`mailto:${employee.email}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {employee.email}
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* OT + date */}
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold md:w-44 md:shrink-0">
                  {otAndDate}
                </div>

                {/* Employee · phone · email — one line, no labels.
                    Phone is a tel: link, email is a mailto: link. */}
                <div
                  className="text-xs text-muted-foreground md:min-w-0 md:flex-1 md:truncate"
                  title={[employee?.phone, employee?.email].filter(Boolean).join(" • ")}
                >
                  <span className="font-semibold text-foreground">{employeeName}</span>
                  {employee?.phone ? (
                    <>
                      {" • "}
                      <a
                        href={`tel:${String(employee.phone).replace(/[^+\d]/g, "")}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {employee.phone}
                      </a>
                    </>
                  ) : null}
                  {employee?.email ? (
                    <>
                      {" • "}
                      <a
                        href={`mailto:${employee.email}`}
                        className="text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {employee.email}
                      </a>
                    </>
                  ) : null}
                </div>
              </>
            )}

            {/* Metric pills */}
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                {t("history.totalLabel")}: <b>{totalLabel}</b>
              </span>
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">
                {t("history.km")}: <b>{kmLabel}</b>
              </span>
            </div>

            {/* Status badge */}
            <Badge variant={statusBadgeVariant(j.status)} className="uppercase tracking-wide">
              {t(`status.${j.status}`)}
            </Badge>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-1.5">
              {canApprove && (
                <Button size="sm" disabled={busy} onClick={() => onApprove(j.id)}>
                  {busy ? t("common.working") : t("manager.approve")}
                </Button>
              )}
              {j.locked === true && j.status !== "approved" && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => onUnlock(j.id)}>
                  {busy ? t("common.working") : t("manager.unlock")}
                </Button>
              )}
            </div>

            {/* Updated — pushed to the right on desktop */}
            <div className="text-xs text-muted-foreground md:ml-auto">
              {updatedLabel}
            </div>
          </div>

          {/* Times — always visible as a subtle second line */}
          <div className="mt-1.5 text-xs text-muted-foreground">
            {t("history.depart")}: {fmtTimeHHmm(j.depart)} • {t("history.arrival")}: {fmtTimeHHmm(j.arrivee)} • {t("history.end")}: {fmtTimeHHmm(j.fin)}
          </div>
          {focused && focusedEvidence && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div className="mb-2 text-sm font-semibold">{t("notifications.evidence")}</div>
              {focusedEvidence.imageUrl && <img src={focusedEvidence.imageUrl} alt={t("notifications.evidenceAlt")} className="max-h-80 w-full rounded-md border object-contain" />}
            </div>
          )}
        </CardContent>
      </Card>
    );
}

export default memo(JobCard);
