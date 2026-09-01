import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { RefreshCw } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { hoursBetween } from "@/lib/time";
import { useT } from "@/lib/use-t";

const REFRESH_MS = 30000;

function montrealDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function fmtHM(decimalHours) {
  const minutes = Math.max(0, Math.round((decimalHours || 0) * 60));
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

export default function LiveCrew() {
  const t = useT();
  const [employees, setEmployees] = useState([]);
  const [jobsByUser, setJobsByUser] = useState(new Map());
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const today = montrealDate();
    const [{ data: people }, { data: jobs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, is_paused, role").order("full_name"),
      supabase.from("jobs").select("id, user_id, ot, depart, fin, job_date, updated_at").eq("job_date", today),
    ]);
    // Managers (e.g. the boss) don't run job cards, so keep them off the crew board.
    const activePeople = (people || []).filter((person) => !person.is_paused && person.role !== "manager");
    const map = new Map();
    (jobs || []).forEach((job) => {
      if (!map.has(job.user_id)) map.set(job.user_id, []);
      map.get(job.user_id).push(job);
    });
    // Chronological order within the day (1st job, 2nd, …).
    map.forEach((list) => list.sort((a, b) =>
      String(a.depart || "99").localeCompare(String(b.depart || "99")) || String(a.updated_at).localeCompare(String(b.updated_at))
    ));
    setEmployees(activePeople);
    setJobsByUser(map);
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              {t("live.title")} · {dayjs(montrealDate()).format("DD MMM YYYY")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("live.description")}</p>
          </div>
          <div className="flex items-center gap-3">
            {updatedAt && <span className="text-xs text-muted-foreground">{t("live.updated", { time: dayjs(updatedAt).format("HH:mm:ss") })}</span>}
            <Button type="button" size="sm" variant="outline" disabled={loading} onClick={load}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />{t("live.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {employees
          .map((employee) => {
            const jobs = jobsByUser.get(employee.id) || [];
            const dayTotal = jobs.reduce((sum, job) => sum + (hoursBetween(
              job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
              job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
            ) || 0), 0);
            return { employee, jobs, dayTotal };
          })
          .sort((a, b) => b.dayTotal - a.dayTotal)
          .map(({ employee, jobs, dayTotal }) => (
            <Card key={employee.id}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{employee.full_name || employee.email}</span>
                  <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("live.jobsCount", { count: jobs.length })}</span>
                </div>
                {jobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("live.noJobs")}</p>
                ) : (
                  <div className="space-y-1">
                    {jobs.map((job, index) => (
                      <div key={job.id} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
                        <span className="flex items-center gap-2 truncate">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span>
                          <span className="truncate">OT {job.ot || "—"}</span>
                        </span>
                        <span className="shrink-0 font-mono font-semibold">{fmtHM(hoursBetween(
                          job.depart ? dayjs(`${job.job_date}T${job.depart}`) : null,
                          job.fin ? dayjs(`${job.job_date}T${job.fin}`) : null,
                        ))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-1 pt-0.5 text-xs">
                      <span className="text-muted-foreground">{t("live.dayTotal")}</span>
                      <span className="font-mono font-bold">{fmtHM(dayTotal)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
