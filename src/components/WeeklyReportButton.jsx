import React, { useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "../supabaseClient";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { snapshotFromRow } from "@/payroll";
import { buildWeeklyReport, printWeeklyReport, REPORT_JOB_STATUSES } from "@/lib/weekly-report";
import { employerFromSettings, loadEmployerSettings, loadTaxProfiles } from "@/lib/payroll-settings";
import { loadHolidayDates } from "@/lib/company-holidays";
import { loadDayRounding, roundingFor } from "@/lib/day-rounding";
import { useT } from "@/lib/use-t";

const PROFILE_COLUMNS = "id, full_name, role, hourly_rate, km_rate, team_leader_premium, team_leader_premium_ccq, team_leader_premium_overtime, apprentice_level, union_association, employee_number, phone_data_reimbursement, storage_compensation, storage_compensation_amount, overtime_first_hour_double, return_with_benefits_to_8h, first_trip_unpaid";

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data || [];
};

// Loads everything one CCQ week needs (jobs, supper/parking claims, CCQ rates, payroll settings,
// opening YTD) and prints the weekly summary. `week` = { start, end } dayjs + weekNo.
async function loadReport(week) {
  const start = week.start.format("YYYY-MM-DD");
  const end = week.end.format("YYYY-MM-DD");
  // DAS follow the pay date (the Thursday after the week), like the DAS screen.
  const taxYear = week.end.add(5, "day").year();
  const [profiles, jobs, meals, parking, contributions, seeds, ledger, settingsRow, taxProfiles, holidayDates, rounding] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).then(unwrap),
    fetchAllRows(() => supabase.from("jobs").select("id, user_id, job_date, ot, depart, arrivee, fin, km_total, km_aller, km_retour, return_time_minutes, status").in("status", REPORT_JOB_STATUSES).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    fetchAllRows(() => supabase.from("meal_claims").select("id, user_id, job_date, amount").in("status", ["pending", "approved"]).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    fetchAllRows(() => supabase.from("parking_receipts").select("id, user_id, job_date, amount").in("status", ["pending", "approved"]).gte("job_date", start).lte("job_date", end).order("id")).then(unwrap),
    supabase.from("employer_contributions").select("*").eq("active", true).order("sort_order", { ascending: true }).then(unwrap),
    supabase.from("payroll_ytd").select("*").eq("tax_year", taxYear).then(unwrap),
    fetchAllRows(() => supabase.from("payroll_period_ledger").select("*").eq("tax_year", taxYear).lt("period_end", start).order("period_end", { ascending: true }).order("user_id")).then(unwrap),
    loadEmployerSettings(),
    loadTaxProfiles(),
    loadHolidayDates(),
    loadDayRounding({ untilDate: end }),
  ]);

  // Opening balance = the last comptabilisé week before this one, else the year's seed.
  const lastLedger = new Map();
  for (const row of ledger) lastLedger.set(row.user_id, row); // ascending → the last one wins
  const seedByUser = new Map(seeds.map((row) => [row.user_id, row]));

  return buildWeeklyReport({
    week: { start, end, weekNo: week.weekNo },
    profiles, jobs, meals, parking, contributions, holidayDates,
    employer: employerFromSettings(settingsRow),
    taxProfiles,
    openingFor: (userId) => snapshotFromRow(lastLedger.get(userId) || seedByUser.get(userId) || null),
    roundingFor: (userId) => roundingFor(rounding, userId),
  });
}

export default function WeeklyReportButton({ week }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPrint() {
    if (!week || busy) return;
    setError("");
    // Open the window inside the click so the browser does not block it while data loads.
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) { setError(t("weeklyReport.popupBlocked")); return; }
    win.document.write(`<p style="font-family:sans-serif;padding:16px">${t("common.working")}</p>`);
    setBusy(true);
    try {
      const report = await loadReport(week);
      if (!report.employees.length) {
        win.close();
        setError(t("weeklyReport.empty"));
        return;
      }
      printWeeklyReport(win, report);
    } catch (e) {
      try { win.close(); } catch { /* already closed */ }
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" onClick={onPrint} disabled={!week || busy}>
        <Printer className="mr-1.5 h-4 w-4" /> {busy ? t("common.working") : t("weeklyReport.print")}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
      <span className="text-xs text-muted-foreground">{t("weeklyReport.hint")}</span>
    </div>
  );
}
