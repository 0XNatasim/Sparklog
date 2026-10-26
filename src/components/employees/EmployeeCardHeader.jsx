import React from "react";
import dayjs from "dayjs";
import { BellOff, BellRing, Briefcase, ChevronDown, Crown, ShieldAlert, ShieldCheck, Star, TriangleAlert, Trophy } from "lucide-react";
import { QUEBEC_REGIONS } from "@/lib/ccq-regions";
import { NEW_HIRE } from "@/lib/signups";

// Region code → administrative region name, for the label shown next to each employee.
const REGION_NAME = new Map(QUEBEC_REGIONS.map((r) => [r.code, r.name]));

const STATUS_TONE = {
  active: "bg-success/15 text-success",
  [NEW_HIRE]: "bg-info/15 text-info",
  pending: "bg-destructive/15 text-destructive",
  unconfirmed: "bg-warning/15 text-warning",
};

// The always-visible top of an employee card: number, role icon, name, two-factor and notification
// icons; the e-mail; then the state badge, missing CCQ fields and region. Clicking it opens or closes the card.
export default function EmployeeCardHeader({ profile: p, status, expanded, onToggle, missingCount, mfa, pushOn, pushOff, t }) {
  const label = status === NEW_HIRE
    ? t("employees.newHire.tag", { date: dayjs(p.start_date).format("D MMM") })
    : t(`employees.status.${status}`);
  const region = REGION_NAME.get(p.work_region);
  // Name first and never squeezed: on a phone the badges (region, state, missing fields) used to share
  // the name's line and left it as « J… ». They now sit on their own line, which wraps.
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 font-semibold">
          {p.employee_number && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">#{p.employee_number}</span>}
          {p.role === "owner"
            ? <Crown className="h-4 w-4 shrink-0 text-warning" aria-label={t("manager.bossLabel")} />
            : p.role === "admin"
              ? <Briefcase className="h-4 w-4 shrink-0 text-violet-500" aria-label={t("manager.adminLabel")} />
              : p.role === "manager" && <Trophy className="h-4 w-4 shrink-0 text-warning" aria-label={t("manager.roleLabel")} />}
          {Number(p.team_leader_premium) > 0 && <Star className="h-4 w-4 shrink-0 fill-warning text-warning" aria-label={t("employees.teamLeader")} />}
          <span className="min-w-0 break-words">{p.full_name || p.email || t("manager.employee")}</span>
          {mfa === "on" && (
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-label={t("employees.mfaOn")}><title>{t("employees.mfaOn")}</title></ShieldCheck>
          )}
          {mfa === "missing" && (
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-label={t("employees.mfaMissing")}><title>{t("employees.mfaMissing")}</title></ShieldAlert>
          )}
          {pushOn && (
            <BellRing className="h-4 w-4 shrink-0 text-success" aria-label={t("employees.pushOn")}><title>{t("employees.pushOn")}</title></BellRing>
          )}
          {pushOff && (
            <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={t("employees.pushOff")}><title>{t("employees.pushOff")}</title></BellOff>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{p.email || "—"}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status] || "bg-muted-foreground/15 text-muted-foreground"}`}>{label}</span>
          {missingCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
              <TriangleAlert className="h-3.5 w-3.5" />{t("employees.missingCount", { count: missingCount })}
            </span>
          )}
          {region && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground" title={t("employees.workRegion")}>
              {p.work_region} — {region}
            </span>
          )}
        </div>
      </div>
      <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  );
}
