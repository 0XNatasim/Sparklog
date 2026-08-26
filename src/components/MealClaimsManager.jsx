import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Utensils } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/use-t";
import { statusBadgeVariant } from "@/lib/status";
import { formatHours, hoursBetween } from "@/lib/time";
import { getKilometreBreakdown } from "@/lib/payroll-calculations";
import { useSearchParams } from "react-router-dom";

export default function MealClaimsManager() {
  const t = useT();
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const [claims, setClaims] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [jobs, setJobs] = useState(new Map());

  async function load() {
    const { data } = await supabase.from("meal_claims").select("*").order("created_at", { ascending: false });
    const rows = data || [];
    const ids = [...new Set(rows.map((claim) => claim.user_id))];
    const jobIds = [...new Set(rows.map((claim) => claim.job_id))];
    const [{ data: people }, { data: jobRows }] = await Promise.all([
      ids.length ? supabase.from("profiles").select("id,full_name,email").in("id", ids) : Promise.resolve({ data: [] }),
      jobIds.length ? supabase.from("jobs").select("id,job_date,ot,depart,arrivee,fin,km_total,km_aller,km_retour,status").in("id", jobIds) : Promise.resolve({ data: [] }),
    ]);
    setProfiles(new Map((people || []).map((person) => [person.id, person])));
    setJobs(new Map((jobRows || []).map((job) => [job.id, job])));
    setClaims(rows);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!focusedJobId || !jobs.has(focusedJobId)) return;
    requestAnimationFrame(() => document.getElementById(`meal-job-${focusedJobId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focusedJobId, jobs]);

  return <div className="space-y-3">
    <Card><CardContent className="p-4"><h2 className="font-semibold">{t("meals.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("meals.description")}</p></CardContent></Card>
    {claims.map((claim) => {
      const person = profiles.get(claim.user_id);
      const job = jobs.get(claim.job_id);
      const total = job ? hoursBetween(dayjs(`${job.job_date}T${job.depart}`), dayjs(`${job.job_date}T${job.fin}`)) : 0;
      const kilometres = job ? getKilometreBreakdown(job).totalKm : 0;
      return <Card key={claim.id} id={`meal-job-${claim.job_id}`} className={focusedJobId === claim.job_id ? "ring-2 ring-emerald-500" : ""}><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span>{t("common.otLabel")}: {job?.ot || "—"} · {dayjs(claim.job_date).format("DD MMM YYYY")}</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" title={t("manager.timesheet.mealIndicator")} aria-label={t("manager.timesheet.mealIndicator")}><Utensils className="h-3.5 w-3.5" aria-hidden="true" /></span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{person?.full_name || person?.email}</div>
          </div>
          {job?.status && <Badge variant={statusBadgeVariant(job.status)} className="uppercase tracking-wide">{t(`status.${job.status}`)}</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.totalLabel")}: <b>{formatHours(total)}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.km")}: <b>{kilometres}</b></span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1"><b>{t("meals.automaticPayroll")}</b></span>
        </div>
        {job && <div className="text-xs text-muted-foreground">{t("history.depart")}: {String(job.depart || "—").slice(0, 5)} · {t("history.arrival")}: {String(job.arrivee || "—").slice(0, 5)} · {t("history.end")}: {String(job.fin || "—").slice(0, 5)}</div>}
      </CardContent></Card>;
    })}
    {!claims.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("meals.empty")}</CardContent></Card>}
  </div>;
}
