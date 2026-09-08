// Authoritative payroll classification engine.
//
// This module is intentionally DEPENDENCY-FREE (no dayjs) so the exact same code runs
// in the browser (as a preview) and in the Supabase Edge Function (as the authority) —
// one implementation, no client/server drift. Bump ENGINE_VERSION on any change that can
// alter a classified value; approval snapshots record the version they were computed with.
export const ENGINE_VERSION = "1.1.0";

export function minutesBetween(depart, fin) {
  if (!depart || !fin) return 0;
  const [startHour, startMinute] = String(depart).slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = String(fin).slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return 0;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes);
}

export function getKilometreBreakdown(job) {
  const legacyClient = Math.max(0, Number(job.km_aller) || 0);
  const returnKm = Math.max(0, Number(job.km_retour) || 0);
  const totalKm = Math.max(0, Number(job.km_total) || legacyClient + returnKm);
  return {
    totalKm,
    returnKm: Math.min(returnKm, totalKm),
    clientKm: Math.max(0, totalKm - returnKm),
  };
}

// Parse a YYYY-MM-DD work date at UTC midnight. Using UTC keeps the day-of-week stable
// regardless of the runtime's timezone (browser vs Deno).
function parseWorkDate(jobDate) {
  if (!jobDate) return null;
  const d = new Date(`${String(jobDate).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Day of week for a work date: 0 = Sunday … 6 = Saturday.
function dayOfWeek(jobDate) {
  const d = parseWorkDate(jobDate);
  return d ? d.getUTCDay() : null;
}

// Payroll week runs to the Saturday that ends it (matches the CCQ weekly grouping in
// ccq-export). Used to scope the 1.5x overtime allowance to the week, not the day.
export function payrollWeekKey(jobDate) {
  const d = parseWorkDate(jobDate);
  if (!d) return String(jobDate || "");
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export function calculatePayrollEntries(jobs) {
  const sorted = [...jobs].sort((a, b) => `${a.job_date}${a.depart || ""}${a.id || ""}`.localeCompare(`${b.job_date}${b.depart || ""}${b.id || ""}`));
  // Regular hours are capped per DAY (8h); the first hour of overtime is allowed once
  // per WEEK at 1.5x, everything beyond that is 2x. Jobs are processed chronologically
  // so the earliest overtime of the week consumes the 1.5x allowance first.
  const dayWorkMinutes = new Map();      // job_date -> minutes worked so far that day
  const weekOvertimeMinutes = new Map(); // week key -> overtime minutes so far that week
  const entries = new Map();

  for (const job of sorted) {
    const wk = payrollWeekKey(job.job_date);
    const priorDayWork = dayWorkMinutes.get(job.job_date) || 0;
    const priorWeekOvertime = weekOvertimeMinutes.get(wk) || 0;

    const workMinutes = minutesBetween(job.depart, job.fin);
    const regularRoom = Math.max(0, 480 - priorDayWork);
    const regularWorkMinutes = Math.min(workMinutes, regularRoom);
    const overtimeWorkMinutes = workMinutes - regularWorkMinutes;
    const overtime50Room = Math.max(0, 60 - priorWeekOvertime);
    const overtime50Minutes = Math.min(overtimeWorkMinutes, overtime50Room);
    const overtime100Minutes = overtimeWorkMinutes - overtime50Minutes;
    // Return travel time is NOT paid separately: the crew already logs the drive back
    // inside the job's Départ→Fin span (the work order covers it), so Départ→Fin is the
    // single source of paid time. Adding return_time_minutes on top would double-count.
    // The return_time_minutes / km_retour columns are kept on the row for mileage and
    // reference, but only km_retour feeds pay (as kilometres), never the minutes.
    const returnRegularMinutes = 0;
    const kilometres = getKilometreBreakdown(job);

    entries.set(job.id, {
      job,
      regularWorkMinutes,
      overtime50Minutes,
      overtime100Minutes,
      overtimeWorkMinutes,
      returnRegularMinutes,
      regularPaidMinutes: regularWorkMinutes + returnRegularMinutes,
      totalPaidMinutes: workMinutes + returnRegularMinutes,
      ...kilometres,
    });
    dayWorkMinutes.set(job.job_date, priorDayWork + workMinutes);
    weekOvertimeMinutes.set(wk, priorWeekOvertime + overtimeWorkMinutes);
  }
  return entries;
}

export function calculateDailyTotals(jobs) {
  const entries = calculatePayrollEntries(jobs);
  const days = new Map();
  for (const entry of entries.values()) {
    const date = entry.job.job_date;
    const day = days.get(date) || {
      jobDate: date,
      regularWorkMinutes: 0,
      overtime50Minutes: 0,
      overtime100Minutes: 0,
      overtimeWorkMinutes: 0,
      returnRegularMinutes: 0,
      totalPaidMinutes: 0,
      clientKm: 0,
      returnKm: 0,
      totalKm: 0,
      jobCount: 0,
    };
    for (const key of ["regularWorkMinutes", "overtime50Minutes", "overtime100Minutes", "overtimeWorkMinutes", "returnRegularMinutes", "totalPaidMinutes", "clientKm", "returnKm", "totalKm"]) {
      day[key] += entry[key];
    }
    day.jobCount += 1;
    days.set(date, day);
  }
  return days;
}

export function isMealEligible({ jobDate, dailyWorkMinutes }) {
  const weekday = dayOfWeek(jobDate);
  return weekday !== null && weekday !== 0 && weekday !== 6 && Math.max(0, dailyWorkMinutes - 480) >= 135;
}

export function roundHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

// Indemnité de congés (CCQ): 13% of weekly wages earned — 6% annual vacation,
// 5.5% paid statutory holidays, 1.5% sick leave. The rate is the same for every level;
// the dollar amount differs only because wages differ. Base is the gross salary earned
// in the week. Source: CCQ chèque-vacances page; see docs/rules/compensation-rules.md.
export const CONGES_INDEMNITY_RATES = { vacation: 0.06, statutoryHolidays: 0.055, sick: 0.015 };

export function calculateCongesIndemnity(weeklyWageDollars) {
  const wages = Math.max(0, Number(weeklyWageDollars) || 0);
  const vacation = wages * CONGES_INDEMNITY_RATES.vacation;
  const statutoryHolidays = wages * CONGES_INDEMNITY_RATES.statutoryHolidays;
  const sick = wages * CONGES_INDEMNITY_RATES.sick;
  return { vacation, statutoryHolidays, sick, total: vacation + statutoryHolidays + sick };
}

// Authoritative entry point. Given a set of jobs (normally one employee), returns a
// versioned, self-describing classification: a per-job trace, per-week totals, and
// warnings for inputs that need review. Every worked minute is accounted for exactly
// once (regular + ot50 + ot100). This is the contract the Edge Function returns and the
// approval snapshot records.
export function computeWeek(jobs) {
  const list = Array.isArray(jobs) ? jobs.filter(Boolean) : [];
  const entriesMap = calculatePayrollEntries(list);
  const perJob = [];
  const warnings = [];
  const weeks = new Map();

  for (const job of list) {
    const e = entriesMap.get(job.id);
    if (!e) continue;
    if (!job.depart || !job.fin) {
      warnings.push({ code: "missing_time", jobId: job.id, jobDate: job.job_date });
    } else if (minutesBetween(job.depart, job.fin) === 0) {
      warnings.push({ code: "zero_duration", jobId: job.id, jobDate: job.job_date });
    }
    const weekEnding = payrollWeekKey(job.job_date);
    perJob.push({
      jobId: job.id,
      jobDate: job.job_date,
      weekEnding,
      workMinutes: e.regularWorkMinutes + e.overtimeWorkMinutes,
      regularWorkMinutes: e.regularWorkMinutes,
      overtime50Minutes: e.overtime50Minutes,
      overtime100Minutes: e.overtime100Minutes,
      returnRegularMinutes: e.returnRegularMinutes,
    });
    const w = weeks.get(weekEnding) || {
      weekEnding, regularMinutes: 0, overtime50Minutes: 0, overtime100Minutes: 0,
      returnRegularMinutes: 0, workedMinutes: 0,
    };
    w.regularMinutes += e.regularWorkMinutes;
    w.overtime50Minutes += e.overtime50Minutes;
    w.overtime100Minutes += e.overtime100Minutes;
    w.returnRegularMinutes += e.returnRegularMinutes;
    w.workedMinutes += e.regularWorkMinutes + e.overtimeWorkMinutes;
    weeks.set(weekEnding, w);
  }

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    jobCount: perJob.length,
    perJob,
    weeks: [...weeks.values()].sort((a, b) => a.weekEnding.localeCompare(b.weekEnding)),
    warnings,
  };
}
