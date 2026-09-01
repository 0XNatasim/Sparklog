import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/lib/use-t";
import { statusBadgeVariant } from "@/lib/status";
import { formatHours, hoursBetween } from "@/lib/time";
import { getKilometreBreakdown } from "@/lib/payroll-calculations";
import { useSearchParams } from "react-router-dom";
import JobCaptureIcons from "@/components/JobCaptureIcons";

export default function MealClaimsManager() {
  const t = useT();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const [claims, setClaims] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [jobs, setJobs] = useState(new Map());
  const [treatments, setTreatments] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

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

  async function review(claim, status) {
    setError("");
    setBusyId(claim.id);
    const patch = {
      status,
      payroll_treatment: status === "approved" ? (treatments[claim.id] || "expense_reimbursement") : null,
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase.from("meal_claims").update(patch).eq("id", claim.id);
    if (updateError) setError(updateError.message);
    else await load();
    setBusyId("");
  }

  return <div className="space-y-3">
    <Card><CardContent className="p-4"><h2 className="font-semibold">{t("meals.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("meals.description")}</p></CardContent></Card>
    {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive dark:text-red-300">{error}</div>}
    {claims.map((claim) => {
      const person = profiles.get(claim.user_id);
      const job = jobs.get(claim.job_id);
      const total = job ? hoursBetween(dayjs(`${job.job_date}T${job.depart}`), dayjs(`${job.job_date}T${job.fin}`)) : 0;
      const kilometres = job ? getKilometreBreakdown(job).totalKm : 0;
      const pending = claim.status === "pending";
      return <Card key={claim.id} id={`meal-job-${claim.job_id}`} className={focusedJobId === claim.job_id ? "ring-2 ring-emerald-500" : ""}><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span>{t("common.otLabel")}: {job?.ot || "—"} · {dayjs(claim.job_date).format("DD MMM YYYY")}</span>
              <JobCaptureIcons job={{ ...job, meal_claim_captured: true }} />
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{person?.full_name || person?.email}</div>
          </div>
          <Badge variant={statusBadgeVariant(claim.status)} className="uppercase tracking-wide">{t(`meals.status.${claim.status}`)}</Badge>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.totalLabel")}: <b>{formatHours(total)}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">{t("history.km")}: <b>{kilometres}</b></span>
          <span className="rounded-full border bg-muted px-2 py-1">$<b>{Number(claim.amount).toFixed(0)}</b></span>
        </div>
        {job && <div className="text-xs text-muted-foreground">{t("history.depart")}: {String(job.depart || "—").slice(0, 5)} · {t("history.arrival")}: {String(job.arrivee || "—").slice(0, 5)} · {t("history.end")}: {String(job.fin || "—").slice(0, 5)}</div>}
        {pending ? (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Select value={treatments[claim.id] || "expense_reimbursement"} onChange={(e) => setTreatments((current) => ({ ...current, [claim.id]: e.target.value }))} className="h-9 w-56">
              <option value="expense_reimbursement">{t("meals.reimbursement")}</option>
              <option value="taxable_benefit">{t("meals.taxable")}</option>
            </Select>
            <Button type="button" size="sm" disabled={busyId === claim.id} onClick={() => review(claim, "approved")}>{t("meals.approve")}</Button>
            <Button type="button" size="sm" variant="outline" disabled={busyId === claim.id} onClick={() => review(claim, "rejected")}>{t("meals.reject")}</Button>
          </div>
        ) : (
          <div className="border-t pt-2 text-xs text-muted-foreground">
            {claim.payroll_treatment && <span>{t(claim.payroll_treatment === "taxable_benefit" ? "meals.taxable" : "meals.reimbursement")} · </span>}
            {claim.reviewed_at ? t("meals.reviewedAt", { date: dayjs(claim.reviewed_at).format("DD MMM YYYY HH:mm") }) : ""}
          </div>
        )}
      </CardContent></Card>;
    })}
    {!claims.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t("meals.empty")}</CardContent></Card>}
  </div>;
}
