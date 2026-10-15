import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { calculatePayrollEntries, calculateCongesIndemnity, congesRatesFromRow, overtimeOptionsFromProfile } from "@/lib/payroll-calculations";
import { jobCodeKind } from "@/lib/job-code";
import { monthlyReportPeriod } from "@/lib/monthly-report-period";
import { formatHM } from "@/lib/time";
import { useT } from "@/lib/use-t";
import { isNonCcqRole, isSubcontractorRole } from "@/lib/roles";
import { companyDate } from "@/lib/company-time";
import { weeklyPhoneAmount, weeklyStorageAmount } from "@/lib/weekly-allowances";
import { loadHolidayDates } from "@/lib/company-holidays";
import { employerFromSettings, loadEmployerSettings, loadTaxProfiles } from "@/lib/payroll-settings";
import { fixedPayWeekCost, fixedPayWeekEnds } from "@/lib/fixed-pay-cost";
import { loadDayRounding, roundingFor } from "@/lib/day-rounding";

dayjs.extend(isoWeek);

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// CCQ level → the per-hour rate column on employer_contributions.
const LEVEL_RATE_KEY = {
  compagnon: "rate_compagnon",
  apprenti_4: "rate_apprenti_4",
  apprenti_3: "rate_apprenti_3",
  apprenti_2: "rate_apprenti_2",
  apprenti_1: "rate_apprenti_1",
};

// CCQ week: Sunday → Saturday, keyed by the ending Saturday.
function ccqWeek(dateStr) {
  const d = dayjs(dateStr);
  const end = d.add((6 - d.day() + 7) % 7, "day");
  return { key: end.format("YYYY-MM-DD"), end, start: end.subtract(6, "day") };
}

// The period a job date belongs to: a CCQ week, or a monthly report period
// (ends the last Saturday of the month). Returns dayjs start/end + a string key.
function periodFor(mode, dateStr) {
  if (mode === "month") {
    const p = monthlyReportPeriod(dateStr);
    return { key: p.key, start: dayjs(p.start), end: dayjs(p.end) };
  }
  return ccqWeek(dateStr);
}

const montrealToday = companyDate;

// Summary cards for the Testing "Week" and "Month" tabs. `mode` = "week" | "month".
export default function PeriodSummary({ mode = "week" }) {
  const t = useT();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const end = montrealToday();
    const start = mode === "month"
      ? dayjs(end).subtract(6, "month").startOf("month").format("YYYY-MM-DD")
      : dayjs(end).subtract(8, "week").startOf("isoWeek").format("YYYY-MM-DD");
    return { start, end };
  }, [mode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start, end } = range;
      const holidayDates = await loadHolidayDates();
      // Fixed weekly pay (Paramètres › Paie) is costed from its settings; a failed load keeps the job-based estimate.
      const [taxProfiles, employerRow] = await Promise.all([
        loadTaxProfiles().catch(() => new Map()),
        loadEmployerSettings().catch(() => null),
      ]);
      const employer = employerFromSettings(employerRow);
      const [{ data: people }, { data: jobs }, { data: meals }, { data: parking }, { data: contribRows }, { data: congesRow }, rounding] = await Promise.all([
        supabase.from("profiles").select("id, role, hourly_rate, hourly_rate_double, km_rate, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, apprentice_level, phone_data_reimbursement, storage_compensation, storage_compensation_amount, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid"),
        fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, ot, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes, hourly_rate_snapshot, team_leader_premium_snapshot, km_rate_snapshot").gte("job_date", start).lte("job_date", end).order("id")),
        fetchAllRows(() => supabase.from("meal_claims").select("id, user_id, job_date, amount").gte("job_date", start).lte("job_date", end).order("id")),
        fetchAllRows(() => supabase.from("parking_receipts").select("id, user_id, job_date, amount").gte("job_date", start).lte("job_date", end).order("id")),
        supabase.from("employer_contributions").select("*").eq("active", true),
        supabase.from("conges_indemnity_rate").select("*").eq("id", true).maybeSingle(),
        loadDayRounding({ untilDate: end }),
      ]);
      if (cancelled) return;

      const contributions = contribRows || [];
      const congesRates = congesRatesFromRow(congesRow);
      const profileById = new Map((people || []).map((p) => [p.id, p]));

      const buckets = new Map();
      const bucket = (dateStr) => {
        const p = periodFor(mode, dateStr);
        if (!buckets.has(p.key)) buckets.set(p.key, { ...p, jobs: [], meals: 0, parking: 0, fixedWeeks: new Map() });
        return buckets.get(p.key);
      };
      (jobs || []).forEach((j) => bucket(j.job_date).jobs.push(j));
      (meals || []).forEach((m) => {
        const prof = profileById.get(m.user_id);
        if (!isNonCcqRole(prof?.role)) bucket(m.job_date).meals += Number(m.amount) || 0; // CCQ supper only
      });
      (parking || []).forEach((p) => { bucket(p.job_date).parking += Number(p.amount) || 0; });
      // Fixed weekly pay: each paid week (keyed by its Saturday) lands in its period, whatever the jobs.
      for (const [uid, taxProfile] of taxProfiles) {
        if (!profileById.has(uid)) continue;
        for (const weekEnd of fixedPayWeekEnds(taxProfile, start, end)) {
          const b = bucket(weekEnd);
          b.fixedWeeks.set(uid, (b.fixedWeeks.get(uid) || 0) + 1);
        }
      }
      const fixedCostByUser = new Map();
      const fixedCost = (uid) => {
        if (!fixedCostByUser.has(uid)) fixedCostByUser.set(uid, fixedPayWeekCost({ profile: profileById.get(uid), taxProfile: taxProfiles.get(uid), employer }));
        return fixedCostByUser.get(uid);
      };

      const result = [];
      for (const b of buckets.values()) {
        if (b.jobs.length === 0 && b.fixedWeeks.size === 0) continue;
        const byUser = new Map();
        b.jobs.forEach((j) => {
          if (!byUser.has(j.user_id)) byUser.set(j.user_id, []);
          byUser.get(j.user_id).push(j);
        });

        let labor = 0, conges = 0, contribTotal = 0, kmCost = 0, workedMin = 0, otJobs = 0, phoneData = 0, storage = 0;
        // Fixed weekly pay: gross + employer contributions of the talon calculation × the weeks of this
        // period; the employee's jobs (below) only add their km.
        for (const [uid, weeks] of b.fixedWeeks) {
          const cost = fixedCost(uid);
          const profile = profileById.get(uid);
          labor += cost.labor * weeks;
          contribTotal += cost.contribTotal * weeks;
          workedMin += cost.hours * 60 * weeks;
          phoneData += weeks * weeklyPhoneAmount(profile);
          storage += weeks * weeklyStorageAmount(profile);
        }
        for (const [uid, ujobs] of byUser) {
          const profile = profileById.get(uid);
          if (b.fixedWeeks.has(uid)) {
            calculatePayrollEntries(ujobs, { ...overtimeOptionsFromProfile(profile), holidayDates }).forEach((e) => {
              kmCost += e.totalKm * (Number(e.job?.km_rate_snapshot ?? profile?.km_rate) || 0);
            });
            continue;
          }
          const isNonCcq = isNonCcqRole(profile?.role);
          const isSub = isSubcontractorRole(profile?.role);
          const subDoubleRate = Number(profile?.hourly_rate_double) || 0;
          // Weekly phone/data and storage allowances × distinct CCQ weeks worked in this bucket.
          const weeksWorked = new Set(ujobs.map((j) => ccqWeek(j.job_date).key)).size;
          phoneData += weeksWorked * weeklyPhoneAmount(profile);
          storage += weeksWorked * weeklyStorageAmount(profile);
          const level = profile?.apprentice_level || null;
          const rateKey = level && !isNonCcq ? LEVEL_RATE_KEY[level] : null;

          let empLabor = 0, empLaborNoBenefit = 0, empPaidMin = 0;
          calculatePayrollEntries(ujobs, { ...overtimeOptionsFromProfile(profile), holidayDates, rounding: roundingFor(rounding, uid) }).forEach((e) => {
            workedMin += e.regularWorkMinutes + e.overtimeWorkMinutes;
            empPaidMin += e.regularWorkMinutes + e.returnRegularMinutes + e.returnNoBenefitMinutes + e.overtime50Minutes + e.overtime100Minutes;
            if (e.overtimeWorkMinutes > 0) otJobs += 1;
            const jobBase = Number(e.job?.hourly_rate_snapshot ?? profile?.hourly_rate) || 0;
            const jobPremium = Number(e.job?.team_leader_premium_snapshot ?? profile?.team_leader_premium) || 0;
            const jobKmRate = Number(e.job?.km_rate_snapshot ?? profile?.km_rate) || 0;
            if (isSub) {
              // Subcontractor: simple rate ≤8h + return, negotiated double rate beyond 8h.
              empLabor += jobBase * ((e.regularWorkMinutes + e.returnRegularMinutes) / 60) + subDoubleRate * (e.overtime100Minutes / 60);
            } else {
              // Non-CCQ premium (snapshot) + CCQ team-leader premium (profile) on regular hours;
              // on overtime only with the « prime majorée en temps sup. » option.
              const premiums = jobPremium + (Number(profile?.team_leader_premium_ccq) || 0);
              const otPremium = profile?.team_leader_premium_overtime ? premiums : 0;
              empLabor += (jobBase + premiums) * ((e.regularWorkMinutes + e.returnRegularMinutes) / 60)
                + (jobBase + otPremium) * ((e.overtime50Minutes / 60) * 1.5 + (e.overtime100Minutes / 60) * 2);
            }
            // Return time without benefits: base rate, no premium, no social benefits.
            empLaborNoBenefit += jobBase * (e.returnNoBenefitMinutes / 60);
            kmCost += e.totalKm * jobKmRate;
          });
          labor += empLabor + empLaborNoBenefit;
          conges += isNonCcq ? 0 : calculateCongesIndemnity(empLabor, congesRates).total;
          if (rateKey) {
            const perHour = contributions.reduce((s, c) => s + (Number(c[rateKey]) || 0), 0);
            contribTotal += perHour * (empPaidMin / 60);
          }
        }

        const expenses = kmCost + b.meals + b.parking + phoneData + storage;
        const title = mode === "month" ? b.end.format("MMMM YYYY") : `${t("manager.weekShort")} ${b.end.isoWeek()}`;
        result.push({
          key: b.key,
          title,
          start: b.start,
          end: b.end,
          activeEmployees: new Set([...byUser.keys(), ...b.fixedWeeks.keys()]).size,
          totalHours: workedMin / 60,
          otJobs,
          jobJobs: b.jobs.filter((j) => jobCodeKind(j.ot) === "project").length,
          adJobs: b.jobs.filter((j) => jobCodeKind(j.ot) === "admin").length,
          labor,
          conges,
          contribTotal,
          km: kmCost,
          supper: b.meals,
          parking: b.parking,
          phone: phoneData,
          storage,
          expenses,
          total: labor + conges + contribTotal + expenses,
        });
      }
      result.sort((a, b) => (a.key < b.key ? 1 : -1));
      setPeriods(result);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [range, mode, t]);

  if (!loading && periods.length === 0) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t(mode === "month" ? "testing.month.empty" : "testing.week.empty")}</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-warning">{t("costing.reviewNotice")}</p>
      {periods.map((w) => (
        <Card key={w.key}>
          <CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">{w.title}</div>
              <div className="text-sm text-muted-foreground">{w.start.format("DD MMM")} → {w.end.format("DD MMM YYYY")}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("testing.week.activeEmployees")} value={w.activeEmployees} />
              <Stat label={t("testing.week.totalHours")} value={formatHM(w.totalHours)} />
              <Stat label={t("testing.week.otJobs")} value={w.otJobs} />
              <Stat label={t("testing.week.jobJobs")} value={w.jobJobs} accent="emerald" />
              <Stat label={t("testing.week.adJobs")} value={w.adJobs} accent="sky" />
              <Stat label={t("testing.week.labor")} value={money(w.labor)} />
              <Stat label={t("testing.week.contributions")} value={money(w.contribTotal)} />
              <Stat label={t("testing.week.km")} value={money(w.km)} />
              <Stat label={t("testing.week.supper")} value={money(w.supper)} />
              <Stat label={t("testing.week.parking")} value={money(w.parking)} />
              <Stat label={t("testing.week.phoneData")} value={money(w.phone)} />
              <Stat label={t("employees.storage")} value={money(w.storage)} />
            </div>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
              <span className="text-muted-foreground">{t("testing.week.indemnity")}: <span className="font-mono">{money(w.conges)}</span></span>
              <span className="font-semibold">{t("testing.week.total")}: <span className="font-mono">{money(w.total)}</span></span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value, accent }) {
  const tone = accent === "emerald"
    ? "border-success/30 bg-success/10"
    : accent === "sky"
      ? "border-info/30 bg-info/10"
      : "bg-muted/30";
  return (
    <div className={`rounded-lg border p-2.5 ${tone}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold">{value}</div>
    </div>
  );
}
